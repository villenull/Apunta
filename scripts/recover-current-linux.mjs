#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = join(repoRoot, 'config', 'recovery', 'current-linux.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const behaviorKeys = Object.keys(manifest.app.behaviorSettings);

function usage(message) {
  if (message) process.stderr.write(`${message}\n`);
  process.stderr.write(
    'usage: node scripts/recover-current-linux.mjs <verify|apply-config> [--data-dir PATH]\n',
  );
  process.exit(2);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (command !== 'verify' && command !== 'apply-config') usage();
  let dataDir = join(homedir(), '.local', 'share', 'apunta');
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] !== '--data-dir' || rest[index + 1] === undefined) {
      usage(`unknown or incomplete option: ${String(rest[index])}`);
    }
    dataDir = resolve(rest[index + 1]);
    index += 1;
  }
  return { command, dataDir };
}

function sha256(path) {
  const hash = createHash('sha256');
  hash.update(readFileSync(path));
  return hash.digest('hex');
}

function command(name, args = []) {
  return execFileSync(name, args, { encoding: 'utf8', timeout: 30_000 }).trim();
}

function resolveCommand(name) {
  return command('which', [name]);
}

function checkEqual(errors, label, actual, expected) {
  if (actual !== expected) errors.push(`${label}: expected ${String(expected)}, got ${String(actual)}`);
}

function readSafeConfiguration(dbPath) {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const settings = Object.fromEntries(
      db
        .prepare(`SELECT key, value FROM settings WHERE key IN (${behaviorKeys.map(() => '?').join(', ')})`)
        .all(...behaviorKeys)
        .map((row) => [row.key, JSON.parse(row.value)]),
    );
    const formats = db
      .prepare('SELECT name, sections, instructions, source FROM note_formats ORDER BY created_at, id')
      .all()
      .map((row) => ({
        name: row.name,
        sections: JSON.parse(row.sections),
        instructionsSha256: createHash('sha256').update(row.instructions).digest('hex'),
        source: row.source,
      }));
    return { settings, formats };
  } finally {
    db.close();
  }
}

function verify(dataDir) {
  const errors = [];
  const warnings = [];

  checkEqual(
    errors,
    'package-lock.json sha256',
    sha256(join(repoRoot, 'package-lock.json')),
    manifest.repository.packageLockSha256,
  );
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  if (nodeMajor < manifest.repository.nodeMinimumMajor) {
    errors.push(`Node ${process.versions.node} is below ${manifest.repository.nodeMinimumMajor}`);
  }

  for (const format of manifest.noteFormats) {
    if (format.instructionsFile === null) continue;
    const path = join(repoRoot, format.instructionsFile);
    checkEqual(errors, `${format.name} instructions sha256`, sha256(path), format.instructionsSha256);
  }

  try {
    const ollamaVersion = command('ollama', ['--version']);
    if (!ollamaVersion.includes(manifest.writingModel.ollamaVersion)) {
      errors.push(`Ollama version: expected ${manifest.writingModel.ollamaVersion}, got ${ollamaVersion}`);
    }
    checkEqual(
      errors,
      'Ollama binary sha256',
      sha256(resolveCommand('ollama')),
      manifest.writingModel.ollamaBinarySha256,
    );
    const listed = command('ollama', ['list']);
    const row = listed
      .split('\n')
      .slice(1)
      .find((line) => line.trim().startsWith(`${manifest.writingModel.effectiveTag} `));
    if (!row) {
      errors.push(`Ollama model missing: ${manifest.writingModel.effectiveTag}`);
    } else if (!row.includes(manifest.writingModel.ollamaListId)) {
      errors.push(`Ollama model ID differs from ${manifest.writingModel.ollamaListId}`);
    }
    const modelfile = command('ollama', ['show', manifest.writingModel.effectiveTag, '--modelfile']);
    if (!modelfile.includes(`sha256-${manifest.writingModel.weightsBlobSha256}`)) {
      errors.push('Ollama model weights blob digest differs from the manifest');
    }
  } catch (error) {
    errors.push(`Ollama check failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const whisperBinary = resolveCommand('whisper-cli');
    const version = command('whisper-cli', ['--version']);
    if (!version.includes(manifest.speech.whisperCppVersion)) {
      errors.push(`whisper.cpp version: expected ${manifest.speech.whisperCppVersion}, got ${version}`);
    }
    checkEqual(errors, 'whisper-cli sha256', sha256(whisperBinary), manifest.speech.binarySha256);
  } catch (error) {
    errors.push(`whisper-cli check failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const speechPath = join(dataDir, manifest.app.effectiveDefaults.whisperModelRelativeToDataDir);
  if (!existsSync(speechPath)) {
    errors.push(`speech weights missing: ${speechPath}`);
  } else {
    checkEqual(errors, 'speech weights bytes', statSync(speechPath).size, manifest.speech.modelBytes);
    checkEqual(errors, 'speech weights sha256', sha256(speechPath), manifest.speech.modelSha256);
  }

  const dbPath = join(dataDir, 'apunta.db');
  if (!existsSync(dbPath)) {
    warnings.push(`configuration database not present: ${dbPath}`);
  } else {
    const current = readSafeConfiguration(dbPath);
    const selected = current.settings.llm_model;
    if (selected !== undefined && selected !== manifest.writingModel.effectiveTag) {
      errors.push(
        `llm_model: expected absent or ${manifest.writingModel.effectiveTag}, got ${String(selected)}`,
      );
    }
    for (const expected of manifest.noteFormats) {
      const actual = current.formats.find((format) => format.name === expected.name);
      if (!actual) {
        errors.push(`note format missing: ${expected.name}`);
        continue;
      }
      checkEqual(errors, `${expected.name} source`, actual.source, expected.source);
      checkEqual(
        errors,
        `${expected.name} sections`,
        JSON.stringify(actual.sections),
        JSON.stringify(expected.sections),
      );
      checkEqual(
        errors,
        `${expected.name} instructions sha256`,
        actual.instructionsSha256,
        expected.instructionsSha256,
      );
    }
  }

  for (const warning of warnings) process.stderr.write(`warning: ${warning}\n`);
  for (const error of errors) process.stderr.write(`error: ${error}\n`);
  if (errors.length > 0) process.exit(1);
  process.stdout.write(`Recovery manifest verified for ${dataDir}\n`);
}

async function applyConfig(dataDir) {
  const { openDatabase } = await import('../server/dist/db/index.js');
  const { uuidv7 } = await import('../server/dist/db/uuid.js');
  const dbPath = join(dataDir, 'apunta.db');
  const { db } = openDatabase({ file: dbPath, migrationsDir: join(repoRoot, 'server', 'migrations') });
  try {
    const patients = db.prepare('SELECT COUNT(*) AS count FROM patients').get().count;
    const notes = db.prepare('SELECT COUNT(*) AS count FROM notes').get().count;
    if (patients !== 0 || notes !== 0) {
      throw new Error('refusing to apply recovery configuration to a database containing patients or notes');
    }

    const apply = db.transaction(() => {
      db.prepare('DELETE FROM note_formats').run();
      const insert = db.prepare(
        `INSERT INTO note_formats (id, name, sections, instructions, source, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      for (const format of manifest.noteFormats) {
        const instructions =
          format.instructionsFile === null
            ? ''
            : readFileSync(join(repoRoot, format.instructionsFile), 'utf8');
        insert.run(
          uuidv7(),
          format.name,
          JSON.stringify(format.sections),
          instructions,
          format.source,
          new Date().toISOString(),
        );
      }
      db.prepare(
        `INSERT INTO settings (key, value) VALUES ('llm_model', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ).run(JSON.stringify(manifest.writingModel.effectiveTag));
    });
    apply();
  } finally {
    db.close();
  }
  process.stdout.write(`Applied sanitized current configuration to ${dataDir}\n`);
}

const options = parseArgs(process.argv.slice(2));
if (options.command === 'verify') {
  verify(options.dataDir);
} else {
  try {
    await applyConfig(options.dataDir);
  } catch (error) {
    process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

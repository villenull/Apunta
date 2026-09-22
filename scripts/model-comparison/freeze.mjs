#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '../..');
const fixtureDir = resolve(root, 'e2e/fixtures/eval');
const files = readdirSync(fixtureDir)
  .filter((name) => /^\d{2}-[a-z0-9-]+\.txt$/u.test(name))
  .sort();
const digest = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const revision = (() => {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return 'unavailable';
  }
})();
const runtime = (() => {
  try {
    return execFileSync('ollama', ['--version'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unavailable';
  }
})();
const result = {
  schemaVersion: '1.1.0',
  frozenAt: new Date().toISOString(),
  revision,
  runtime,
  node: process.version,
  schemaSha256: digest(resolve(root, 'scripts/model-comparison/schema.mjs')),
  runnerSha256: digest(resolve(root, 'scripts/model-comparison/runner.ts')),
  rescoreDiscussionSha256: digest(resolve(root, 'scripts/model-comparison/rescore-discussion.mjs')),
  artifactsSha256: digest(resolve(root, 'scripts/model-comparison/artifacts.json')),
  instructions: {
    progressFactoryConstant: digest(resolve(root, 'server/src/ai/default-instructions.ts')),
    progressRecoveryStored: digest(
      resolve(root, 'docs/note-instructions/current-linux-progress-instructions.md'),
    ),
    progressOwnerLatest: digest(resolve(root, 'docs/note-instructions/owner-progress-instructions.md')),
    intakeFactoryConstant: digest(resolve(root, 'server/src/ai/default-instructions.ts')),
  },
  fixtures: Object.fromEntries(
    files.map((name) => [
      name,
      {
        sha256: digest(resolve(fixtureDir, name)),
        bytes: readFileSync(resolve(fixtureDir, name)).byteLength,
      },
    ]),
  ),
};
const output = resolve(root, process.argv[2] ?? 'scripts/model-comparison/freeze.json');
writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ output, fixtureCount: files.length, revision, runtime }, null, 2));

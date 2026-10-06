import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DB_ENTRY_NAME } from '@apunta/shared';
import BetterSqlite3 from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from './config.js';
import { openDatabase } from './db/index.js';
import { readJournal, writeJournal, type UpdateJournal } from './update-journal.js';

/**
 * The real `index.ts`, started as a child the way the shell starts it
 * (`APUNTA_SHELL=1`, a nonce, a pipe on stdin), against throwaway data folders.
 * What it proves is the ordering the unit tests cannot: that the journal picks
 * the start before the database is touched, that `startup_context` is the line
 * before `ready`, and that health confirmation completes the journal.
 */

const serverDir = fileURLToPath(new URL('..', import.meta.url));
const VERSION = loadConfig({}).version;
const SNAPSHOT_NAME = 'pre-update-1.0.0-1.1.0-20261006T120000Z.db';

interface Child {
  readonly process: ChildProcessWithoutNullStreams;
  readonly port: number;
  lines: Record<string, unknown>[];
  line(type: string, id?: string): Promise<Record<string, unknown>>;
  exited: Promise<number | null>;
  send(message: Record<string, unknown>): void;
}

let root: string;
let dataDir: string;
const children: Child[] = [];

async function freePort(): Promise<number> {
  return await new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      probe.close(() => {
        resolvePort(port);
      });
    });
  });
}

async function start(env: Record<string, string> = {}): Promise<Child> {
  const port = await freePort();
  const process_ = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: serverDir,
    env: {
      PATH: process.env['PATH'] ?? '',
      HOME: root,
      APUNTA_SHELL: '1',
      APUNTA_SHELL_NONCE: 'test-nonce',
      APUNTA_DATA_DIR: dataDir,
      APUNTA_INSTALL_DIR: join(root, 'install'),
      APUNTA_PORT: String(port),
      APUNTA_NO_OPEN: '1',
      APUNTA_FAKE_AI: '1',
      APUNTA_WEB_DIST: join(root, 'no-web-build'),
      ...env,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const lines: Record<string, unknown>[] = [];
  const waiting: { type: string; id?: string; resolve: (line: Record<string, unknown>) => void }[] = [];
  const matches = (line: Record<string, unknown>, type: string, id?: string): boolean =>
    line['type'] === type && (id === undefined || line['id'] === id);
  let buffer = '';
  process_.stdout.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8');
    for (let newline = buffer.indexOf('\n'); newline >= 0; newline = buffer.indexOf('\n')) {
      const text = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (!text.startsWith('{')) continue;
      const parsed = JSON.parse(text) as Record<string, unknown>;
      lines.push(parsed);
      for (const waiter of waiting.filter((entry) => matches(parsed, entry.type, entry.id)))
        waiter.resolve(parsed);
    }
  });
  let stderr = '';
  process_.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf8');
  });
  const exited = new Promise<number | null>((resolveExit) => {
    process_.on('close', (code) => {
      resolveExit(code);
    });
  });
  const child: Child = {
    process: process_,
    port,
    lines,
    exited,
    line: (type, id) =>
      new Promise((resolveLine, reject) => {
        const seen = lines.find((line) => matches(line, type, id));
        if (seen !== undefined) return resolveLine(seen);
        const timer = setTimeout(() => {
          reject(new Error(`no ${type} line; stderr: ${stderr.slice(-800)}`));
        }, 20_000);
        waiting.push({
          type,
          ...(id === undefined ? {} : { id }),
          resolve: (line) => {
            clearTimeout(timer);
            resolveLine(line);
          },
        });
      }),
    send: (message) => {
      process_.stdin.write(`${JSON.stringify(message)}\n`);
    },
  };
  children.push(child);
  return child;
}

async function stop(child: Child): Promise<number | null> {
  child.send({ type: 'shutdown' });
  return await child.exited;
}

async function http(
  child: Child,
  method: 'GET' | 'POST',
  path: string,
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`http://127.0.0.1:${String(child.port)}${path}`, { method });
  const text = await response.text();
  return { status: response.status, body: text.startsWith('{') ? JSON.parse(text) : text };
}

/** A fully migrated database (a normal start must be able to open it) with one marker row. */
function makeDatabase(file: string, title: string): void {
  const { migrationsDir } = loadConfig({});
  const { db } = openDatabase({ file, migrationsDir });
  try {
    db.exec('CREATE TABLE marker (title TEXT NOT NULL)');
    db.prepare('INSERT INTO marker (title) VALUES (?)').run(title);
  } finally {
    db.close();
  }
}

function titles(file: string): string[] {
  const handle = new BetterSqlite3(file, { readonly: true });
  try {
    return (handle.prepare('SELECT title FROM marker').all() as { title: string }[]).map((row) => row.title);
  } finally {
    handle.close();
  }
}

function journal(overrides: Partial<UpdateJournal> = {}): UpdateJournal {
  return {
    phase: 'pending',
    updateId: '7',
    fromVersion: '0.0.1',
    toVersion: VERSION,
    snapshotPath: join(dataDir, 'safety', SNAPSHOT_NAME),
    createdAt: '2026-10-06T12:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'apunta-boot-e2e-'));
  dataDir = join(root, 'data');
  mkdirSync(join(dataDir, 'safety'), { recursive: true });
});

afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.process.exitCode === null) {
      child.process.kill('SIGKILL');
      await child.exited;
    }
  }
  rmSync(root, { recursive: true, force: true });
});

describe('the real server start, selected by the journal', () => {
  it('a failed health attempt boots recovery before the database is touched: startup_context precedes ready, and a database that would fail to open is left byte for byte as it was', async () => {
    // A file a normal start would refuse (boot-error page, exit 0) or migrate.
    const live = join(dataDir, DB_ENTRY_NAME);
    writeFileSync(live, 'this is not a database, and nothing may open it');
    const before = createHash('sha256').update(readFileSync(live)).digest('hex');
    writeJournal(dataDir, journal({ phase: 'health_attempted' }));

    const child = await start({ APUNTA_UPDATE_HANDOFF: '7' });
    const ready = await child.line('ready');
    const context = await child.line('startup_context');

    expect(child.lines.indexOf(context)).toBeLessThan(child.lines.indexOf(ready));
    expect(context).toMatchObject({
      mode: 'recovery',
      updateId: '7',
      targetVersion: VERSION,
      previousVersion: '0.0.1',
    });
    expect(await http(child, 'GET', '/api/app/recovery')).toMatchObject({
      status: 200,
      body: { phase: 'recovery', fromVersion: '0.0.1', toVersion: VERSION, previousAvailable: false },
    });
    expect((await http(child, 'GET', '/api/patients')).status).toBe(503);
    expect(createHash('sha256').update(readFileSync(live)).digest('hex')).toBe(before);
    expect(existsSync(`${live}-wal`)).toBe(false);
    expect(readJournal(dataDir)).toMatchObject({ phase: 'recovery' });
    // A late health confirmation cannot turn a recovery start into a healthy one.
    child.send({ type: 'health_confirm', id: '7' });
    expect(await child.line('health_result')).toEqual({
      type: 'health_result',
      id: '7',
      ok: false,
      code: 'unknown_update',
    });
    expect(readJournal(dataDir)).toMatchObject({ phase: 'recovery' });
    expect(await stop(child)).toBe(0);
  }, 60_000);

  it('restoring from recovery keeps the journal fenced until the authorised replacement confirms health', async () => {
    makeDatabase(join(dataDir, 'safety', SNAPSHOT_NAME), 'BEFORE-UPDATE');
    makeDatabase(join(dataDir, DB_ENTRY_NAME), 'AFTER-UPDATE');
    writeJournal(dataDir, journal({ phase: 'recovery' }));

    const first = await start();
    await first.line('ready');
    expect((await first.line('startup_context'))['mode']).toBe('recovery');
    expect(await http(first, 'POST', '/api/app/recovery/restore')).toEqual({
      status: 200,
      body: { restored: true, restarting: true },
    });
    expect(await first.line('recovery_request')).toEqual({
      type: 'recovery_request',
      id: '7',
      action: 'restart',
    });
    expect(titles(join(dataDir, DB_ENTRY_NAME))).toEqual(['BEFORE-UPDATE']);
    expect(readJournal(dataDir)).toEqual(journal({ phase: 'recovery', recoveryTarget: VERSION }));
    expect(await stop(first)).toBe(0);

    const second = await start({ APUNTA_UPDATE_HANDOFF: '7' });
    await second.line('ready');
    expect((await second.line('startup_context'))['mode']).toBe('normal');
    expect(((await http(second, 'GET', '/api/health')).body as { ok?: boolean }).ok).toBe(true);
    expect(readJournal(dataDir)).toEqual(journal({ phase: 'health_attempted' }));
    second.send({ type: 'health_confirm', id: '7' });
    expect(await second.line('health_result', '7')).toEqual({ type: 'health_result', id: '7', ok: true });
    expect(readJournal(dataDir)).toBeNull();
    expect(await stop(second)).toBe(0);
  }, 60_000);

  it('the first updated boot claims its attempt, starts normally, and health confirmation completes the journal', async () => {
    writeJournal(dataDir, journal());

    const child = await start({ APUNTA_UPDATE_HANDOFF: '7' });
    const ready = await child.line('ready');
    const context = await child.line('startup_context');

    expect(child.lines.indexOf(context)).toBeLessThan(child.lines.indexOf(ready));
    expect(context).toMatchObject({ mode: 'normal', updateId: '7', targetVersion: VERSION });
    expect(readJournal(dataDir)).toMatchObject({ phase: 'health_attempted' });
    expect((await http(child, 'GET', '/api/health')).status).toBe(200);

    child.send({ type: 'health_confirm', id: 'someone-else' });
    expect(await child.line('health_result')).toEqual({
      type: 'health_result',
      id: 'someone-else',
      ok: false,
      code: 'unknown_update',
    });
    expect(readJournal(dataDir)).toMatchObject({ phase: 'health_attempted' });

    child.send({ type: 'health_confirm', id: '7' });
    expect(await child.line('health_result', '7')).toEqual({ type: 'health_result', id: '7', ok: true });
    expect(readJournal(dataDir)).toBeNull();
    expect(await stop(child)).toBe(0);
  }, 60_000);

  it('a pending journal without the handoff id is recovery, not a normal start', async () => {
    writeJournal(dataDir, journal());

    const child = await start();
    await child.line('ready');

    expect(await child.line('startup_context')).toMatchObject({ mode: 'recovery', updateId: '7' });
    expect(readJournal(dataDir)).toMatchObject({ phase: 'recovery' });
    expect(existsSync(join(dataDir, DB_ENTRY_NAME))).toBe(false);
    expect(await stop(child)).toBe(0);
  }, 60_000);

  it('with no journal, and with no shell, the start is the ordinary one', async () => {
    const child = await start();
    await child.line('ready');
    expect(await child.line('startup_context')).toEqual({ type: 'startup_context', mode: 'normal' });
    expect(await stop(child)).toBe(0);
  }, 60_000);
});

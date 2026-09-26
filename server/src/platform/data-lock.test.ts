import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../config.js';
import { openDatabase } from '../db/index.js';

import { DATA_FOLDER_IN_USE, DataFolderInUseError, acquireDataFolderLock } from './data-lock.js';

/**
 * C-OWN@1's data-folder ownership, from the outside.
 *
 * The five cases are the card's, and between them they are the whole rule
 * set: one owner at a time, a dead pid's lock taken over, a live pid whose
 * start time has moved on taken over, two racers leaving exactly one owner,
 * and a process that ignores the lock file blocked by SQLite itself.
 *
 * Case 3 is the one that is easy to get wrong. `processStart` is a raw kernel
 * number, not a timestamp: if the lock file carries an ISO-8601 string while
 * the comparison reads the kernel's number back, the two can never be equal,
 * so a **live** owner's lock is declared stale and two processes end up on
 * one folder. Writing the value as read is the only thing that makes rule 3's
 * equality hold, and case 1 (two in-process acquisitions, same pid, same
 * start, refuse) is what would catch the mistake — case 3 alone would still
 * pass, because a wrong unit makes every lock look stale.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const migrationsDir = loadConfig({}).migrationsDir;

// C-OWN@1 rule 2's name, written out rather than imported: the test pins the
// contract's literal file name instead of trusting a constant that moved with
// it.
const LOCK_PATH = (dir: string): string => join(dir, 'apunta.lock');

interface LockContents {
  readonly pid: number;
  readonly processStart: string;
  readonly appVersion: string;
  readonly protocol: number;
  readonly nonce: string;
}

/**
 * Where each case's own folder goes.
 *
 * Under `scripts/v2/sandbox.mjs env` this is the run folder's `data/`, mode
 * 700 and inside `/tmp/apunta-v2/<runId>/`, so a case whose child is killed by
 * a timeout leaves a database and a lock tied to a run instead of littering
 * `/tmp/apunta-lock-…`, where nothing would ever clean them up.
 *
 * Bare `npm test` has no wrapper around it, and a test that refused to run
 * without one could not be run by `npm test` at all, so the fallback is the
 * system temp folder. Either way every case makes its own subfolder inside it.
 */
function parentFolder(): string {
  const sandbox = process.env['APUNTA_DATA_DIR'];
  return sandbox === undefined || sandbox === '' ? tmpdir() : sandbox;
}

const folders: string[] = [];

function freshFolder(label: string): string {
  const dir = mkdtempSync(join(parentFolder(), `apunta-data-lock-${label}-`));
  folders.push(dir);
  return dir;
}

afterEach(() => {
  // A racer left holding a lock in a folder that is about to be deleted would
  // otherwise outlive the case. `stdin` is already closed on the happy path.
  for (const child of racers.splice(0)) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    child.kill('SIGKILL');
  }
  for (const dir of folders.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function readLock(dir: string): LockContents {
  return JSON.parse(readFileSync(LOCK_PATH(dir), 'utf8')) as LockContents;
}

function writeFixtureLock(dir: string, contents: LockContents): void {
  writeFileSync(LOCK_PATH(dir), `${JSON.stringify(contents, null, 2)}\n`);
}

/**
 * A child that reports its own start time in the unit the lock records, then
 * exits.
 *
 * It is the test's own reading of `/proc/<pid>/stat` field 22 (Linux) or of
 * `ps -o lstart=` (macOS), computed here rather than imported, so case 2's
 * fixture is not "whatever the implementation happens to write".
 */
const PRINT_OWN_START = `
  const { readFileSync } = await import('node:fs');
  const { execFileSync } = await import('node:child_process');
  const start =
    process.platform === 'linux'
      ? (() => {
          const raw = readFileSync('/proc/self/stat', 'utf8');
          return raw.slice(raw.lastIndexOf(')') + 1).trim().split(/\\s+/)[19] ?? '';
        })()
      : execFileSync('ps', ['-o', 'lstart=', '-p', String(process.pid)], { encoding: 'utf8' }).trim();
  process.stdout.write(start);
`;

const LOCK_MODULE = join(repoRoot, 'server', 'src', 'platform', 'data-lock.ts');

/**
 * One racer: the real module, in a real process, on the folder it is given.
 *
 * The child imports the TypeScript source because Node 24 strips the
 * annotations — the same trick `scripts/v2/sandbox.mjs` uses for
 * `shared/src/platform-paths.ts`. `server/dist/` is not an option here: V1
 * builds `shared` only, so a dist-based racer would be exercising whatever
 * the checkout last left behind.
 *
 * Having acquired — or refused — it reports and then **waits for stdin to
 * close**, still holding the lock. A racer that exited straight away would
 * leave a stale lock, and a stale lock is *supposed* to be taken over, so both
 * processes would report success and the case would be measuring the wrong
 * thing: "exactly one owner" is a claim about a folder that is still in use.
 */
const RACER = `
  const { pathToFileURL } = await import('node:url');
  const lock = await import(pathToFileURL(process.env['APUNTA_LOCK_MODULE']).href);
  const out = { pid: process.pid };
  try {
    out.outcome = 'acquired';
    out.nonce = lock.acquireDataFolderLock(process.env['APUNTA_LOCK_DIR']).nonce;
  } catch (error) {
    out.outcome = error instanceof lock.DataFolderInUseError ? 'refused' : 'error';
    out.code = error instanceof lock.DataFolderInUseError ? error.code : undefined;
    out.ownerPid = error instanceof lock.DataFolderInUseError ? error.pid : undefined;
    out.message = error instanceof Error ? error.message : String(error);
  }
  process.stdout.write(JSON.stringify(out) + '\\n');
  await new Promise((done) => { process.stdin.once('end', done); process.stdin.resume(); });
`;

interface RacerResult {
  readonly outcome: string;
  readonly pid: number;
  readonly nonce?: string;
  readonly code?: string;
  readonly ownerPid?: number;
  readonly message?: string;
}

const racers: ChildProcess[] = [];

/** Two processes started back to back, each reported as one JSON line. */
async function race(dir: string): Promise<RacerResult[]> {
  const children = [0, 1].map(() =>
    spawn(process.execPath, ['--input-type=module', '-e', RACER], {
      cwd: repoRoot,
      env: { ...process.env, APUNTA_LOCK_MODULE: LOCK_MODULE, APUNTA_LOCK_DIR: dir },
      stdio: ['pipe', 'pipe', 'pipe'],
    }),
  );
  racers.push(...children);

  const reported: (RacerResult | undefined)[] = [undefined, undefined];
  const stderr: string[] = [];
  const exited = children.map(
    (child) =>
      new Promise<void>((done) => {
        child.once('close', done);
        child.stderr?.on('data', (chunk: Buffer) => stderr.push(chunk.toString('utf8')));
      }),
  );
  let bothReported: () => void = () => undefined;
  const reportedTwice = new Promise<void>((resolvePromise, rejectPromise) => {
    let outstanding = children.length;
    bothReported = () => {
      outstanding -= 1;
      if (outstanding === 0) resolvePromise();
    };
    for (const child of children) child.once('error', rejectPromise);
    setTimeout(() => {
      rejectPromise(new Error(`the racers did not both report: ${stderr.join('').trim()}`));
    }, 30_000).unref();
  });
  children.forEach((child, index) => {
    let buffered = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      buffered += chunk.toString('utf8');
      const lines = buffered.split('\n');
      buffered = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim() === '' || reported[index] !== undefined) continue;
        reported[index] = JSON.parse(line) as RacerResult;
        bothReported();
      }
    });
  });

  // Nobody is let go until both have decided: the winner has to still be
  // running when the loser looks, or the loser's takeover would be correct.
  await reportedTwice;
  for (const child of children) child.stdin?.end();
  await Promise.all(exited);

  const results = reported.filter((result): result is RacerResult => result !== undefined);
  if (results.length !== children.length) {
    throw new Error(`expected 2 racers to report, got ${String(results.length)}`);
  }
  return results;
}

describe('one owner of one data folder (C-OWN@1)', () => {
  it('refuses a second in-process acquisition and rewrites nothing', () => {
    const dir = freshFolder('two-in-process');
    const first = acquireDataFolderLock(dir);
    const before = readLock(dir);

    let refusal: unknown;
    try {
      acquireDataFolderLock(dir);
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toBeInstanceOf(DataFolderInUseError);
    expect((refusal as DataFolderInUseError).code).toBe(DATA_FOLDER_IN_USE);
    expect((refusal as DataFolderInUseError).code).toBe('data_folder_in_use');
    expect((refusal as DataFolderInUseError).pid).toBe(process.pid);

    // Nothing was rewritten: the first acquirer's pid, nonce, start time and
    // version are still on disk.
    const after = readLock(dir);
    expect(after).toEqual(before);
    expect(after.pid).toBe(process.pid);
    expect(after.nonce).toBe(first.nonce);
    expect(after.processStart).toBe(before.processStart);
    expect(after.protocol).toBe(1);

    first.release();
    expect(existsSync(LOCK_PATH(dir))).toBe(false);
  });

  it('takes over a stale lock whose pid is dead, and takes it with a new nonce', () => {
    const dir = freshFolder('dead-pid');
    const reaped = spawnSync(process.execPath, ['--input-type=module', '-e', PRINT_OWN_START], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    expect(reaped.status).toBe(0);
    expect(reaped.pid).toBeTypeOf('number');
    // Never a hard-coded pid: on a busy container a fixed number can be live,
    // and a "stale" lock that is not stale would fail this case for the wrong
    // reason. The fixture is a pid this test has just watched die.
    let probe: string | undefined;
    try {
      process.kill(reaped.pid as number, 0);
    } catch (error) {
      probe = (error as NodeJS.ErrnoException).code;
    }
    expect(probe).toBe('ESRCH');
    const deadStart = reaped.stdout.trim();
    expect(deadStart).not.toBe('');

    writeFixtureLock(dir, {
      pid: reaped.pid as number,
      processStart: deadStart,
      appVersion: '0.0.0-fixture',
      protocol: 1,
      nonce: 'fixture-nonce-of-a-dead-pid',
    });

    const taken = acquireDataFolderLock(dir);
    const onDisk = readLock(dir);
    expect(onDisk.pid).toBe(process.pid);
    expect(onDisk.nonce).toBe(taken.nonce);
    expect(onDisk.nonce).not.toBe('fixture-nonce-of-a-dead-pid');
    expect(onDisk.processStart).not.toBe(deadStart);

    taken.release();
    expect(existsSync(LOCK_PATH(dir))).toBe(false);
  });

  it('takes over a lock whose pid is alive but whose start time has moved on', () => {
    const dir = freshFolder('live-pid-other-start');
    // A real lock of our own, so the start time below is one that differs
    // from ours by construction rather than by a guess about the platform.
    const real = acquireDataFolderLock(dir);
    const realStart = readLock(dir).processStart;
    real.release();

    // This process is alive, so the only thing that can make its lock stale
    // is the equality in rule 3, and a value no kernel would print is the
    // clearest way to say "same pid, different process".
    const movedOn = `${realStart}0000`;
    expect(movedOn).not.toBe(realStart);
    writeFixtureLock(dir, {
      pid: process.pid,
      processStart: movedOn,
      appVersion: '0.0.0-fixture',
      protocol: 1,
      nonce: 'fixture-nonce-of-a-moved-on-pid',
    });

    const taken = acquireDataFolderLock(dir);
    const onDisk = readLock(dir);
    expect(onDisk.pid).toBe(process.pid);
    expect(onDisk.nonce).toBe(taken.nonce);
    expect(onDisk.nonce).not.toBe('fixture-nonce-of-a-moved-on-pid');
    expect(onDisk.processStart).not.toBe(movedOn);

    taken.release();
    expect(existsSync(LOCK_PATH(dir))).toBe(false);
  });

  it('leaves exactly one owner when two processes race for the same folder', async () => {
    const dir = freshFolder('race');
    const results = await race(dir);
    expect(results).toHaveLength(2);

    const acquired = results.filter((result) => result.outcome === 'acquired');
    const refused = results.filter((result) => result.outcome === 'refused');
    expect(acquired).toHaveLength(1);
    expect(refused).toHaveLength(1);
    const winner = acquired[0] as RacerResult;
    const loser = refused[0] as RacerResult;
    expect(loser.code).toBe(DATA_FOLDER_IN_USE);
    expect(loser.ownerPid).toBe(winner.pid);

    // The file carries the winner's nonce, so the winner is the process the
    // next acquirer will find and refuse.
    const onDisk = readLock(dir);
    expect(onDisk.nonce).toBe(winner.nonce);
    expect(onDisk.pid).toBe(winner.pid);
  });

  it('refuses a second process that ignores the lock file (SQLITE_BUSY on write)', () => {
    const dir = freshFolder('sqlite-backstop');
    const { db } = openDatabase({ file: join(dir, 'apunta.db'), migrationsDir });
    // SQLite takes the exclusive lock at the first read or write after the
    // pragma, and this row is that write.
    const put = db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    );
    put.run('data_lock_backstop_probe', JSON.stringify('synthetic'));

    // A process that took no lock at all — a v1 server, or an older copy of
    // this one — against a database that is already migrated.
    const probe = `
      const { default: BetterSqlite3 } = await import('better-sqlite3');
      const out = {};
      let child;
      try {
        child = new BetterSqlite3(process.env['APUNTA_LOCK_DIR'] + '/apunta.db');
        child.pragma('busy_timeout = 250');
        out.open = 'ok';
      } catch (error) { out.open = error.code; }
      try {
        child.exec("INSERT INTO settings (key, value) VALUES ('data_lock_backstop_child', '\\"synthetic\\"')");
        out.write = 'ok';
      } catch (error) { out.write = error.code; }
      process.stdout.write(JSON.stringify(out));
    `;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', probe], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, APUNTA_LOCK_DIR: dir },
    });
    expect(child.status).toBe(0);
    const result = JSON.parse(child.stdout) as { open: string; write: string };
    expect(result.open).toBe('ok');
    expect(result.write).toBe('SQLITE_BUSY');

    // The owner is untouched: the row the second process tried to write is
    // absent, and the owner can still write.
    expect(
      db.prepare('SELECT value FROM settings WHERE key = ?').get('data_lock_backstop_child'),
    ).toBeUndefined();
    put.run('data_lock_backstop_probe', JSON.stringify('synthetic-again'));
    db.close();
  });
});

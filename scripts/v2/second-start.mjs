#!/usr/bin/env node
/**
 * The second launch, on purpose (card P3.2, C-OWN@1's rejection example).
 *
 * Run **through the wrapper**, which owns the first server:
 *
 * ```sh
 * npm run build
 * node scripts/v2/sandbox.mjs run --port 7829 -- node scripts/v2/second-start.mjs
 * ```
 *
 * It starts a second Apunta on the *same data folder* and asserts what
 * C-OWN@1 promises when it refuses:
 *
 *  1. the second process exits **75** — not 1, and not the 0 that today's
 *     boot-error `return` would give;
 *  2. it never bound its port, so nothing is answering on 7830 afterwards;
 *  3. it created nothing in the run folder and touched nothing that was
 *     there, so the lock really was taken before the restore and the open;
 *  4. the lock on disk still names the *first* server, and that server still
 *     answers `/api/health` with this run's `testRunId` — the first keeps
 *     running untouched;
 *  5. the refusal is observable: the message code is in the second server's
 *     log.
 *
 * The second process is the **built** `server/dist/index.js`, never
 * `tsx server/src/index.ts`: the artefact under test is the one the wrapper
 * runs, and a stale `dist/` would exercise a server that has no lock in it.
 * Its port is 7830; the wrapper's is whatever `--port` said (7829 for this
 * card). The two never share one, and if 7830 is busy the helper refuses
 * rather than falling back to anything.
 *
 * Exit codes: **0** every assertion held, **1** an assertion failed,
 * **2** refused before anything was started.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SandboxRefusal, assertPortFree, validatePort } from './sandbox.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const serverEntry = join(repoRoot, 'server', 'dist', 'index.js');

/** This card's second-server port. 7810 is the owner's preview; 7717 is live. */
export const SECOND_PORT = 7830;

/** The files a refusal must not have created. */
const DATABASE_FILES = ['apunta.db', 'apunta.db-wal', 'apunta.db-shm'];

const EXIT_TIMEOUT_MS = 30_000;
const SETTLE_ATTEMPTS = 20;
const SETTLE_INTERVAL_MS = 150;

let failures = 0;

function check(name, held, detail) {
  if (held) {
    process.stdout.write(`ok       ${name}\n`);
    return;
  }
  failures += 1;
  process.stdout.write(`NOT OK   ${name}${detail === undefined ? '' : ` — ${detail}`}\n`);
}

function refuse(message) {
  process.stderr.write(`refusing: ${message}\n`);
  process.exit(2);
}

/**
 * Every file in the folder, with the numbers that change when one is created
 * or written to. Compared "before" with "after", which is how "created or
 * touched" is checked — the first server's own database is already there, so
 * "is absent" would be the wrong question.
 */
function snapshotFolder(dir) {
  const found = new Map();
  const walk = (current, prefix) => {
    const entries = readdirSync(current, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const entry of entries) {
      const name = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(path, name);
        continue;
      }
      const stat = statSync(path);
      found.set(name, `${String(stat.size)}:${String(stat.mtimeMs)}:${String(stat.ino)}`);
    }
  };
  walk(dir, '');
  return found;
}

function differences(before, after) {
  const created = [...after.keys()].filter((name) => !before.has(name));
  const changed = [...after.keys()].filter(
    (name) => before.has(name) && before.get(name) !== after.get(name),
  );
  return { created, changed };
}

/**
 * Waits until the folder stops changing, so the comparison is about the
 * second process and not about the first server's own background work (its
 * daily backup writes once, at boot).
 */
async function settledSnapshot(dir) {
  let previous = snapshotFolder(dir);
  for (let attempt = 0; attempt < SETTLE_ATTEMPTS; attempt += 1) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, SETTLE_INTERVAL_MS));
    const current = snapshotFolder(dir);
    const { created, changed } = differences(previous, current);
    if (created.length === 0 && changed.length === 0) return current;
    previous = current;
  }
  return previous;
}

function waitForExit(child, timeoutMs) {
  return new Promise((resolvePromise) => {
    const timer = setTimeout(() => resolvePromise(null), timeoutMs);
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      resolvePromise({ code, signal });
    });
  });
}

/** C-ISO@1 rule 7: only the process this script started, and its own group. */
async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    return;
  }
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    // Already gone.
  }
}

async function nothingIsListening(port) {
  const probe = createServer();
  return new Promise((resolvePromise) => {
    probe.once('error', () => resolvePromise(false));
    probe.listen(port, '127.0.0.1', () => {
      probe.close(() => resolvePromise(true));
    });
  });
}

async function readHealth(port) {
  const response = await fetch(`http://127.0.0.1:${String(port)}/api/health`);
  if (!response.ok) return { error: `answered ${String(response.status)}` };
  return await response.json();
}

async function main() {
  const dataDir = process.env['APUNTA_DATA_DIR'];
  const runId = process.env['APUNTA_TEST_RUN_ID'];
  const wrapperPort = process.env['APUNTA_PORT'];

  if (dataDir === undefined || dataDir === '') {
    refuse('APUNTA_DATA_DIR is not set. Run this through `sandbox.mjs run`, never directly.');
  }
  if (runId === undefined || runId === '') {
    refuse('APUNTA_TEST_RUN_ID is not set, so the first server could not be identified.');
  }
  if (wrapperPort === undefined || wrapperPort === '') {
    refuse('APUNTA_PORT is not set, so the first server could not be found.');
  }

  let port;
  try {
    // The wrapper's own rule rather than a second copy of it: an integer in
    // 7800-7889, never 7717, never an updater port.
    port = validatePort(SECOND_PORT);
    await assertPortFree(port);
  } catch (error) {
    refuse(error instanceof SandboxRefusal ? error.message : String(error));
  }
  if (String(port) === wrapperPort) {
    refuse(`the wrapper's own server already holds ${String(port)}; the second server must not share it.`);
  }
  if (!existsSync(serverEntry)) {
    refuse(`the server is not built (${serverEntry} is missing). Run npm run build first.`);
  }

  const logPath = join(dirname(dataDir), 'logs', 'second-server.log');
  mkdirSync(dirname(logPath), { recursive: true });

  const before = await settledSnapshot(dataDir);
  const lockPath = join(dataDir, 'apunta.lock');
  const lockBefore = before.has('apunta.lock') ? readFileSync(lockPath, 'utf8') : undefined;
  check(
    'the first server holds a lock before the second launch',
    lockBefore !== undefined,
    'no apunta.lock in the run folder to compare against',
  );

  const logFd = openSync(logPath, 'a');
  const child = spawn(process.execPath, [serverEntry], {
    cwd: repoRoot,
    // The wrapper's sandbox environment, with one change: our own port.
    env: { ...process.env, APUNTA_PORT: String(port) },
    detached: true,
    stdio: ['ignore', logFd, logFd],
  });
  const exited = await waitForExit(child, EXIT_TIMEOUT_MS);
  if (exited === null) {
    await stopChild(child);
    check('the second server exits at all', false, `still running after ${String(EXIT_TIMEOUT_MS)} ms`);
  }
  process.stdout.write(
    `second server: pid ${String(child.pid)}, port ${String(port)}, exit ${String(exited?.code)}, signal ${String(exited?.signal)}\n`,
  );

  // 1. The contract's own number.
  check('the second server exits 75', exited?.code === 75, `exited ${String(exited?.code)}`);

  // 2. Nothing left listening: the refusal happens before app.listen.
  check('nothing is listening on the second port afterwards', await nothingIsListening(port));

  // 3. Rule 1's ordering: the refusal came before the restore and the open.
  const after = await settledSnapshot(dataDir);
  const { created, changed } = differences(before, after);
  check('the second server created nothing in the run folder', created.length === 0, created.join(', '));
  check('the second server touched nothing in the run folder', changed.length === 0, changed.join(', '));
  check(
    `the second server created no ${DATABASE_FILES.join(', ')}`,
    created.every((name) => !DATABASE_FILES.includes(name)),
    created.join(', '),
  );

  // 4. The first owner is untouched.
  const lockAfter = after.has('apunta.lock') ? readFileSync(lockPath, 'utf8') : undefined;
  check('the lock still carries the first server, byte for byte', lockAfter === lockBefore);
  const lockPid = lockAfter === undefined ? undefined : JSON.parse(lockAfter).pid;
  check('the lock does not name the second server', lockPid !== child.pid, `pid ${String(lockPid)}`);

  const health = await readHealth(Number(wrapperPort));
  check(
    'the first server still answers /api/health with this run id',
    health?.testRunId === runId,
    `got ${JSON.stringify(health?.testRunId ?? health?.error ?? null)}`,
  );

  // 5. The code the shell will read (C-BRIDGE@1 rule 2, built by P3.3).
  const log = readFileSync(logPath, 'utf8');
  check('the refusal is logged with the message code', log.includes('data_folder_in_use'));
  for (const line of log.split('\n').filter((each) => each.includes('data_folder_in_use'))) {
    process.stdout.write(`log:     ${line}\n`);
  }

  await stopChild(child);
  process.stdout.write(
    failures === 0
      ? 'second-start: every assertion held\n'
      : `second-start: ${String(failures)} assertion(s) failed\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

try {
  await main();
} catch (error) {
  process.stderr.write(`second-start failed: ${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
}

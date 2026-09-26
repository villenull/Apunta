#!/usr/bin/env node
/**
 * Sandbox wrapper (P0.3, contract C-ISO@1).
 *
 * Every command that starts an Apunta server, opens a real database, runs
 * e2e, runs check:format/check:refine, runs a real-model eval or launches
 * the app goes through this wrapper. It isolates the run from the live
 * instance (port 7717) and from the platform default data folder:
 *
 *   node scripts/v2/sandbox.mjs run --port <p> -- <cmd...>
 *   node scripts/v2/sandbox.mjs env --port <p>
 *   node scripts/v2/sandbox.mjs selftest
 *
 * `run` creates a run folder, starts the server, verifies ownership via
 * `/api/health`'s `testRunId`, runs `<cmd>` with the sandbox environment,
 * stops only what it started, and exits with `<cmd>`'s code. `env` creates
 * the run folder only and prints `export` lines for tools that start their
 * own server (Playwright). `selftest` runs the six rejection cases; exit 0
 * only if all refuse before any database is opened.
 *
 * No dependencies. Loopback only; port 7717 is never contacted.
 */

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  realpathSync,
  readdirSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { homedir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

// C-PATH@1's one function, imported from the TypeScript source so this wrapper
// keeps its "no dependencies" promise: no build step, no `shared/dist`, and no
// second copy of the table to drift. Node 24 strips the annotations. Re-exported
// because `sandbox.test.mjs` reads `platformDataDir` from here.
import { platformDataDir } from '../../shared/src/platform-paths.ts';
export { platformDataDir };

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const serverEntry = join(repoRoot, 'server', 'dist', 'index.js');

export const SANDBOX_ROOT = '/tmp/apunta-v2';
export const LIVE_PORT = 7717;
export const PORT_MIN = 7800;
export const PORT_MAX = 7889;
export const UPDATER_MIN = 7890;
export const UPDATER_MAX = 7899;

export class SandboxRefusal extends Error {}

export function validatePort(raw) {
  const port = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isInteger(port)) {
    throw new SandboxRefusal(`refusing port ${String(raw)}: not an integer`);
  }
  if (port === LIVE_PORT) {
    throw new SandboxRefusal(
      `refusing port ${String(LIVE_PORT)}: the live instance. Start a sandbox server instead.`,
    );
  }
  if (port >= UPDATER_MIN && port <= UPDATER_MAX) {
    throw new SandboxRefusal(
      `refusing port ${String(port)}: ${String(UPDATER_MIN)}-${String(UPDATER_MAX)} are reserved for the updater test server (C-UPD).`,
    );
  }
  if (port < PORT_MIN || port > PORT_MAX) {
    throw new SandboxRefusal(
      `refusing port ${String(port)}: sandbox servers use ${String(PORT_MIN)}-${String(PORT_MAX)}.`,
    );
  }
  return port;
}

/** The port must be free, checked by binding, then released immediately. */
export async function assertPortFree(port) {
  await new Promise((resolvePromise, rejectPromise) => {
    const probe = createServer();
    probe.once('error', (error) => {
      if (error?.code === 'EADDRINUSE') {
        rejectPromise(
          new SandboxRefusal(`refusing port ${String(port)}: already in use. Pick a free sandbox port.`),
        );
      } else {
        rejectPromise(error);
      }
    });
    probe.listen(port, '127.0.0.1', () => {
      probe.close((closeError) => {
        if (closeError) rejectPromise(closeError);
        else resolvePromise();
      });
    });
  });
}

export function newRunId() {
  const stamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
  return `${stamp}-${randomBytes(4).toString('hex')}`;
}

function contained(path, rootReal) {
  return path === rootReal || path.startsWith(rootReal + sep);
}

/**
 * Creates `/tmp/apunta-v2/<runId>/` with `data/`, `logs/`, `tmp/`, mode
 * 700. A run folder symlinked outside the root is refused, as is a root
 * that is itself a symlink escaping it.
 */
export function ensureRunDir(runId) {
  if (runId === '' || runId.includes('/') || runId.includes('\\') || runId.includes('..')) {
    throw new SandboxRefusal(`refusing run id ${JSON.stringify(runId)}: not a plain folder name`);
  }
  mkdirSync(SANDBOX_ROOT, { recursive: true, mode: 0o700 });
  if (lstatSync(SANDBOX_ROOT).isSymbolicLink()) {
    throw new SandboxRefusal(
      `refusing run folder: ${SANDBOX_ROOT} is a symlink escaping to ${realpathSync(SANDBOX_ROOT)}`,
    );
  }
  const rootReal = realpathSync(SANDBOX_ROOT);
  const candidate = join(rootReal, runId);
  if (existsSync(candidate) && lstatSync(candidate).isSymbolicLink()) {
    const target = realpathSync(candidate);
    if (!contained(target, rootReal)) {
      throw new SandboxRefusal(
        `refusing run folder ${candidate}: symlink escapes ${SANDBOX_ROOT} to outside ${SANDBOX_ROOT}`,
      );
    }
  }
  const runDir = candidate;
  const dataDir = join(runDir, 'data');
  const logsDir = join(runDir, 'logs');
  const tmpDir = join(runDir, 'tmp');
  for (const dir of [dataDir, logsDir, tmpDir]) mkdirSync(dir, { recursive: true, mode: 0o700 });
  const runReal = realpathSync(runDir);
  if (!contained(runReal, rootReal)) {
    throw new SandboxRefusal(`refusing run folder ${runDir}: escapes outside ${SANDBOX_ROOT}`);
  }
  return {
    runDir: runReal,
    dataDir: join(runReal, 'data'),
    logsDir: join(runReal, 'logs'),
    tmpDir: join(runReal, 'tmp'),
  };
}

/**
 * C-ISO@1's guard is a comparison of two strings, and the two arrive in
 * different shapes: the shared function returns `/`-separated paths, while
 * `resolve()` above returns whatever the host separates with. Both sides are
 * therefore put in the same shape first, or a native-separator `dataDir` would
 * stop matching a `/`-separated default on Windows and the guard would quietly
 * stop refusing.
 */
function comparablePath(value) {
  return value
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/\/+$/, '');
}

/**
 * The data folder is never the platform default: the wrapper computes the
 * default as a string and refuses when the sandbox path equals it or sits
 * inside it. It also refuses anything outside `/tmp/apunta-v2/`.
 */
export function resolveSandboxDataDir(env, runDataDir) {
  const raw = env['APUNTA_DATA_DIR'];
  const dataDir = raw === undefined || raw === '' ? runDataDir : resolve(raw);
  const rootReal = existsSync(SANDBOX_ROOT) ? realpathSync(SANDBOX_ROOT) : SANDBOX_ROOT;
  let dataReal = dataDir;
  try {
    dataReal = realpathSync(dataDir);
  } catch {
    // Not created yet: fall back to the resolved (not yet canonical) path.
  }
  const def = platformDataDir(process.platform, process.env, homedir());
  const defKey = comparablePath(def);
  const dataKey = comparablePath(dataDir);
  if (dataKey === defKey || dataKey.startsWith(defKey + '/')) {
    throw new SandboxRefusal(
      `refusing data folder ${dataDir}: it equals (or sits inside) the platform default ${def}. Sandbox runs never touch the live data folder.`,
    );
  }
  if (!contained(dataReal, rootReal) && !contained(dataDir, SANDBOX_ROOT)) {
    throw new SandboxRefusal(
      `refusing data folder ${dataDir}: outside ${SANDBOX_ROOT}. The sandbox keeps every path under ${SANDBOX_ROOT}.`,
    );
  }
  return dataDir;
}

function healthUrl(port) {
  return `http://127.0.0.1:${String(port)}/api/health`;
}

/**
 * Polls `/api/health` until it answers with our `testRunId`, or refuses.
 * Anything else — silence, a missing id, a different id — stops the run.
 * Opens no database itself; it only reads the health endpoint.
 */
export async function waitForOwnership(port, runId, options = {}) {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const intervalMs = options.intervalMs ?? 250;
  const deadline = Date.now() + timeoutMs;
  let lastProblem;
  for (;;) {
    try {
      const response = await fetch(healthUrl(port));
      if (response.ok) {
        const body = await response.json();
        if (body !== null && typeof body === 'object' && body.testRunId === runId) return;
        lastProblem =
          body !== null && typeof body === 'object' && 'testRunId' in body
            ? `wrong testRunId (expected ours, got ${JSON.stringify(body.testRunId)})`
            : 'answered 200 with no testRunId: a foreign server';
      } else {
        lastProblem = `answered ${String(response.status)}`;
      }
    } catch (error) {
      lastProblem = error instanceof Error ? error.message : String(error);
    }
    if (Date.now() >= deadline) {
      throw new SandboxRefusal(
        `refusing port ${String(port)}: ownership check failed (testRunId never matched ours): ${lastProblem ?? 'no answer'}`,
      );
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, intervalMs));
  }
}

function serverEnv(port, runId, dataDir) {
  return {
    ...process.env,
    APUNTA_DATA_DIR: dataDir,
    APUNTA_PORT: String(port),
    APUNTA_NO_OPEN: '1',
    APUNTA_TEST_RUN_ID: runId,
    APUNTA_V2: '1',
  };
}

function childEnv(port, runId, dataDir) {
  return {
    ...serverEnv(port, runId, dataDir),
    APUNTA_CHECK_URL: `http://127.0.0.1:${String(port)}`,
    APUNTA_E2E_PORT: String(port),
  };
}

function startServer(port, runId, dataDir, logsDir) {
  if (!existsSync(serverEntry)) {
    throw new SandboxRefusal(`the server is not built (${serverEntry} is missing). Run npm run build first.`);
  }
  const logFd = openSync(join(logsDir, 'server.log'), 'a');
  const child = spawn(process.execPath, [serverEntry], {
    cwd: repoRoot,
    env: serverEnv(port, runId, dataDir),
    detached: true,
    stdio: ['ignore', logFd, logFd],
  });
  return child;
}

/** Kills only the process group the wrapper created. Never pkill, never Ollama. */
async function stopServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    return;
  }
  const deadline = Date.now() + 5000;
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

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function printEnv(port, runId, dataDir) {
  const lines = [
    `export APUNTA_DATA_DIR=${shellQuote(dataDir)}`,
    `export APUNTA_PORT=${shellQuote(String(port))}`,
    `export APUNTA_NO_OPEN='1'`,
    `export APUNTA_TEST_RUN_ID=${shellQuote(runId)}`,
    `export APUNTA_V2='1'`,
    `export APUNTA_CHECK_URL=${shellQuote(`http://127.0.0.1:${String(port)}`)}`,
    `export APUNTA_E2E_PORT=${shellQuote(String(port))}`,
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}

async function cmdRun(portRaw, childArgs) {
  const port = validatePort(portRaw);
  const sepIndex = childArgs.indexOf('--');
  const command = sepIndex === -1 ? childArgs : childArgs.slice(sepIndex + 1);
  // `run --port <p> -- <cmd...>`; a bare `run --port <p> <cmd...>` is also
  // accepted so a forgotten `--` still runs the intended command.
  const argv = sepIndex === -1 ? childArgs : command;
  if (argv.length === 0) {
    throw new SandboxRefusal('nothing to run: `run --port <p> -- <cmd...>` needs a command');
  }
  // Validate everything before creating anything: a refusal must leave no
  // run folder behind, let alone an opened database.
  const runId = newRunId();
  const proposedDataDir = join(SANDBOX_ROOT, runId, 'data');
  const validatedDataDir = resolveSandboxDataDir(process.env, proposedDataDir);
  await assertPortFree(port);
  const run = ensureRunDir(runId);
  const override = process.env['APUNTA_DATA_DIR'];
  const dataDir = override === undefined || override === '' ? run.dataDir : validatedDataDir;
  const server = startServer(port, runId, dataDir, run.logsDir);
  try {
    process.stderr.write(`sandbox ${runId} on 127.0.0.1:${String(port)} data ${dataDir}\n`);
    await waitForOwnership(port, runId);
    const code = await new Promise((resolvePromise) => {
      const child = spawn(argv[0], argv.slice(1), {
        cwd: process.cwd(),
        env: childEnv(port, runId, dataDir),
        stdio: 'inherit',
      });
      child.on('error', () => resolvePromise(1));
      child.on('exit', (childCode, signal) => resolvePromise(childCode ?? (signal === null ? 0 : 1)));
    });
    // Stop before exiting: process.exit() never runs finally blocks, so the
    // server would be orphaned if cleanup stayed only in the finally below.
    await stopServer(server);
    process.exit(code);
  } finally {
    await stopServer(server);
  }
}

async function cmdEnv(portRaw) {
  const port = validatePort(portRaw);
  const runId = newRunId();
  const validatedDataDir = resolveSandboxDataDir(process.env, join(SANDBOX_ROOT, runId, 'data'));
  await assertPortFree(port);
  const run = ensureRunDir(runId);
  const override = process.env['APUNTA_DATA_DIR'];
  const dataDir = override === undefined || override === '' ? run.dataDir : validatedDataDir;
  printEnv(port, runId, dataDir);
}

function usage() {
  return [
    'usage:',
    '  node scripts/v2/sandbox.mjs run --port <p> -- <cmd...>',
    '  node scripts/v2/sandbox.mjs env --port <p>',
    '  node scripts/v2/sandbox.mjs selftest',
  ].join('\n');
}

/** The six C-ISO@1 rejection cases. Each must refuse before any database is opened. */
async function cmdSelftest() {
  const cases = [];
  async function refusal(name, fn, pattern) {
    try {
      await fn();
    } catch (error) {
      if (error instanceof SandboxRefusal && pattern.test(error.message)) {
        cases.push({ name, ok: true, detail: error.message });
        process.stdout.write(`refused: ${name} — ${error.message}\n`);
        return;
      }
      cases.push({ name, ok: false, detail: error instanceof Error ? error.message : String(error) });
      process.stdout.write(`NOT REFUSED: ${name} — ${cases[cases.length - 1].detail}\n`);
      return;
    }
    cases.push({ name, ok: false, detail: 'proceeded instead of refusing' });
    process.stdout.write(`NOT REFUSED: ${name} — proceeded instead of refusing\n`);
  }

  const before = existsSync(SANDBOX_ROOT) ? readdirSync(SANDBOX_ROOT).sort() : [];

  await refusal('port 7717', () => Promise.resolve(validatePort(7717)), /live instance/);
  await refusal('port 7890', () => Promise.resolve(validatePort(7890)), /reserved/);

  // Occupied port: a dummy listener the selftest starts itself.
  const held = createServer();
  await new Promise((resolvePromise) => held.listen(7880, '127.0.0.1', resolvePromise));
  try {
    await refusal('occupied port', () => assertPortFree(7880), /in use/);
  } finally {
    held.close();
  }

  // Foreign server: dummy health endpoints the selftest starts itself. One
  // case, both variants (no id, wrong id): either one proceeding fails it.
  async function dummyHealth(port, body) {
    const server = createHttpServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    });
    await new Promise((resolvePromise) => server.listen(port, '127.0.0.1', resolvePromise));
    return server;
  }
  async function expectOwnershipRefused(port, variant) {
    try {
      await waitForOwnership(port, 'selftest-run-id', { timeoutMs: 2000, intervalMs: 100 });
    } catch (error) {
      if (error instanceof SandboxRefusal) {
        process.stdout.write(`  variant refused: ${variant} — ${error.message}\n`);
        return;
      }
      throw error;
    }
    throw new Error(`foreign server variant proceeded instead of refusing: ${variant}`);
  }
  const noId = await dummyHealth(7881, { ok: true });
  const wrongId = await dummyHealth(7882, { ok: true, testRunId: 'somebody-elses-run' });
  try {
    await refusal(
      'foreign server answering /api/health',
      async () => {
        await expectOwnershipRefused(7881, 'no testRunId');
        await expectOwnershipRefused(7882, 'wrong testRunId');
        throw new SandboxRefusal('both foreign-server variants refused on testRunId');
      },
      /testRunId/,
    );
  } finally {
    noId.close();
    wrongId.close();
  }

  // Run folder symlinked outside /tmp/apunta-v2/.
  mkdirSync(SANDBOX_ROOT, { recursive: true, mode: 0o700 });
  const outside = join('/tmp', 'apunta-v2-selftest-escape');
  mkdirSync(outside, { recursive: true });
  const linkName = 'selftest-escape-link';
  const linkPath = join(SANDBOX_ROOT, linkName);
  try {
    if (!existsSync(linkPath)) {
      symlinkSync(outside, linkPath);
      try {
        await refusal(
          'run folder symlinked outside',
          () => Promise.resolve(ensureRunDir(linkName)),
          /outside/,
        );
      } finally {
        rmSync(linkPath, { force: true });
      }
    }
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }

  // APUNTA_DATA_DIR equal to the platform default string.
  await refusal(
    'data folder equal to the platform default',
    () =>
      Promise.resolve(
        resolveSandboxDataDir(
          { ...process.env, APUNTA_DATA_DIR: platformDataDir(process.platform, process.env, homedir()) },
          join(SANDBOX_ROOT, 'selftest-run', 'data'),
        ),
      ),
    /platform default/,
  );

  const after = existsSync(SANDBOX_ROOT) ? readdirSync(SANDBOX_ROOT).sort() : [];
  const leaked = after.filter((name) => !before.includes(name));
  const passed = cases.filter((c) => c.ok).length;
  process.stdout.write(
    `selftest: ${String(passed)}/${String(cases.length)} rejection cases refused before any database was opened\n`,
  );
  if (leaked.length > 0) {
    process.stdout.write(`selftest left run folders behind: ${leaked.join(', ')}\n`);
  }
  if (passed !== cases.length || leaked.length > 0) process.exit(1);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  try {
    if (command === 'run') {
      const portIndex = rest.indexOf('--port');
      if (portIndex === -1 || rest[portIndex + 1] === undefined) {
        throw new SandboxRefusal('`run` needs `--port <p>`');
      }
      const portRaw = rest[portIndex + 1];
      const childArgs = [...rest.slice(0, portIndex), ...rest.slice(portIndex + 2)];
      await cmdRun(portRaw, childArgs);
    } else if (command === 'env') {
      const portIndex = rest.indexOf('--port');
      if (portIndex === -1 || rest[portIndex + 1] === undefined) {
        throw new SandboxRefusal('`env` needs `--port <p>`');
      }
      await cmdEnv(rest[portIndex + 1]);
    } else if (command === 'selftest') {
      await cmdSelftest();
    } else {
      process.stderr.write(`${usage()}\n`);
      process.exit(2);
    }
  } catch (error) {
    if (error instanceof SandboxRefusal) {
      process.stderr.write(`${error.message}\n`);
      process.exit(2);
    }
    throw error;
  }
}

const invokedPath = process.argv[1] === undefined ? '' : resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}

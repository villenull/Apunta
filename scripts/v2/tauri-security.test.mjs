#!/usr/bin/env node
/**
 * P3.4's bridge-security harness (C-BRIDGE@1 rules 4, 5, 6 and 7, run in `env`
 * mode).
 *
 *   node scripts/v2/tauri-security.test.mjs security
 *
 * One mode. Any other argument exits 2.
 *
 * It launches the **real** AppImage V0 produced and the **real** bundled server,
 * and asserts C-BRIDGE@1 in the shipped binary rather than in a config file:
 *
 * - **(a)** `window.__TAURI__` and `window.__TAURI_INTERNALS__` are undefined in
 *   the rendered app page. One assertion with one pass condition — "absent or
 *   unusable" is not a pass.
 * - **(b)** a navigation to a reserved `.invalid` origin is **refused**. The row
 *   asserts a refusal and never a successful external load: `.invalid` is
 *   reserved and cannot resolve (HS-6), so a load that succeeded would be a
 *   failure rather than a result.
 * - **(c)** `window.open` to a loopback URL and to the same `.invalid` origin are
 *   both cancelled, and no second window appears.
 * - **(d), header half:** `GET http://127.0.0.1:<port>/patients` — the SPA-fallback
 *   HTML the webview actually renders the note in — carries a
 *   `content-security-policy` with all six of rule 6's directives. **This half
 *   fails on an unmodified tree**, which is what keeps (d) from passing
 *   vacuously.
 * - **(d), handler half:** the fixture note is created over HTTP in the order
 *   `POST /api/formats` → `POST /api/patients` → `POST /api/notes`, then opened
 *   in the workspace by clicking the patient row and the note row **located by
 *   their visible text**, and the page is required to show the payload's
 *   characters without the payload having run. Both halves are asserted because
 *   either alone is decidable-but-weak, and neither may stand for the other.
 * - **(e), the runtime half of V1(vi):** an element carrying a `style` attribute
 *   has that style **applied**, read back as a computed value. This is what
 *   proves `style-src-attr 'unsafe-inline'` is a deliberate relaxation rather
 *   than a header string nobody checked.
 * - **Containment, all five:** nothing from the run remains; no second
 *   `apunta.lock`, `apunta.db`, `-wal` or `-shm`; the sandbox port is free
 *   afterwards; the observation channel is gone when the row ends **and** cannot
 *   exist in a shipped bundle; and `ollama` still running, read from outside the
 *   run.
 *
 * **The in-page channel** — the only way to make the page do (a), (b), (c), (d)
 * and (e) — is **the observation hook** the card defines once, in `Fixed
 * decisions`: one block in `web/src/main.tsx` gated on
 * `import.meta.env.VITE_APUNTA_TEST_IDENTITY === '1'`, which publishes its facts
 * as same-origin `fetch` requests to `/api/p3.4-observe`. The bundled server's
 * request logger writes each of those URLs to its **private stdout pipe**
 * (`app.ts:70`), the shell's reader thread re-emits every unrecognised line to
 * **stderr** (`main.rs:321-325`), and this harness reads the AppImage child's
 * captured stderr for the life of the child. The accumulated buffer — not any
 * tail printed at the end — is the assertion's source.
 *
 * **No port, no listener, no variable.** This file binds no socket of any kind
 * and sets no variable in the child's environment beyond the sandbox
 * environment V2's command already exports, so there is nothing to be free of
 * afterwards. Port freedom is *read* out of `/proc/net/tcp{,6}` rather than
 * proved by binding.
 *
 * If the channel cannot be read, **(a), (b), (c) and (d)'s handler half and (e)
 * are recorded `NOT RUN` together, with that cause, and none of them is ever
 * `PASS`.** (a) is the card's central rule-4 claim, so a `NOT RUN` there is a
 * report to the coordinator and never a substitute: a config-level grep of the
 * bundle is weaker and is recorded as such. A `NOT RUN` also sets the exit code,
 * so a row that could not prove the contract can never come back green.
 *
 * No `pkill`, ever (C-ISO@1 rule 7): every process this file stops is one it
 * started, by pid.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** P3.4's pinned sandbox port. Never substituted. */
const port = Number(process.env['APUNTA_PORT']);
const dataDir = process.env['APUNTA_DATA_DIR'];
const runId = process.env['APUNTA_TEST_RUN_ID'];

/**
 * The observation hook's marker path and gate, named once so the containment
 * assertions, the freshness check and the parser cannot drift apart.
 *
 * Neither string may appear in `web/dist/assets/*.js` (V0's release invariant,
 * restated by containment below) nor anywhere under `src-tauri/` (V3).
 */
const MARKER_PATH = '/api/p3.4-observe';
const GATE_STRING = 'VITE_APUNTA_TEST_IDENTITY';

/**
 * The commit the freshness walk diffs from: the base this attempt was
 * dispatched at, and the commit before the coordinator commits the work in
 * flight. A Rule B path that is uncommitted is caught by the `git status`
 * predicate instead, so between the two nothing can hide.
 */
const RULE_B_BASE_COMMIT = 'd56af1d';

/**
 * Rule B's set, verbatim: every input that reaches `bundle.resources`, so
 * `npm run tauri:build:test` alone can never be stale. `tauri.conf.json`
 * declares no `beforeBuildCommand`, so `tauri build` copies whatever
 * `build/linux-resources/` already holds — which is why attempt 1 launched a
 * binary whose bundled server predated the card's own source.
 *
 * **Never inputs, only outputs**, and therefore excluded from every walk here:
 * `build/linux-resources/**`, `server/dist/**` and `web/dist/**`. A stale one of
 * those is the symptom Rule B detects, never a trigger.
 */
const RULE_B_PATHS = [
  'server/src',
  'shared/src',
  'server/package.json',
  'server/migrations',
  'src-tauri',
  'web/src',
  'web/public',
  'web/index.html',
  'web/vite.config.ts',
  'web/package.json',
  'package.json',
  'package-lock.json',
];

/**
 * Under `src-tauri/`, the two directories that are rewritten by a build and so
 * can never be inputs: `target/` by every build, `gen/schemas` by `tauri-build`
 * on every build-script run — which is exactly what V4's `cargo clippy` and
 * `cargo test` do. `gen/` is gitignored and untracked, so no `git diff`
 * predicate can ever name it (AM-118).
 */
const RULE_B_SKIPPED_DIRS = ['target', 'gen'];

/** C-BRIDGE@1 rule 6's six directives, which (d)'s header half must find. */
const RULE_6_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
];

// ------------------------------------------------------- AM-188 constants --
//
// The owner-approved assertion and measurement package (AM-188), ported from
// the reviewed pure model `build/p3.4-spec-v5-repair2/model.mjs` (IR7 CLEAR,
// 73/73). Every constant and every pure function below is the model's, so the
// synthetic port-fidelity tests in `docs/v2/evidence/P3.4/attempt-5/
// implementation/` can prove the shipped harness behaves identically.
const BATCH_SIZE = 40;
const RECT_FIELDS = ['x', 'y', 'w', 'h', 'l', 't', 'd'];
const RECT_KEY = /^i(\d+)_(x|y|w|h|l|t|d)$/;
const MAX_K = 4;
const TARGET_BUDGET_MS = 30_000;
const READBACK_TOLERANCE_PX = 1;
const WITNESS_TOLERANCE_PX = 2;
const CLICK_N_TOLERANCE_PX = 2;
const IPC_PROBE_COMMAND = 'plugin:event|listen';
const ACL_DENIAL = `Command ${IPC_PROBE_COMMAND} not allowed by ACL`;
const MIN_VIEWPORT_W = 400;
const MIN_VIEWPORT_H = 300;
/** The hook's own change-only poll cadence: the gap between observation reads. */
const OBSERVATION_POLL_MS = 250;
const DEADLINE_EXPIRED = 'the target deadline expired';

/** Every pointer field the hook must publish (delta on the nine existing facts). */
const POINTER = { counter: 'ptrN', clientX: 'ptrCX', clientY: 'ptrCY' };
/** The click fields the hook must publish; the descriptor is three of them. */
const CLICK = {
  counter: 'clickN',
  clientX: 'clickCX',
  clientY: 'clickCY',
  tag: 'clickTag',
  testId: 'clickTestId',
  text: 'clickText',
};
/** The viewport fields the hook must publish. */
const VIEWPORT = { w: 'vpW', h: 'vpH' };

/** The five-row NOT RUN cascade, with the (a) title AM-188 gives it. */
const CASCADE_ROWS = [
  '(a) __TAURI__ is absent and the built-in IPC command is ACL-denied',
  '(b) navigation to the reserved .invalid origin is refused',
  '(c) window.open is cancelled',
  '(d) handler: the injected note renders inert, and __APUNTA_CSP_PROBE__ is undefined',
  '(e) an inline style attribute is applied in the shipped binary',
];

/** The global both payloads in the fixture try to write. */
const PROBE_SENTINEL = '__APUNTA_CSP_PROBE__';

/** The literal characters that must be visible in the rendered note. */
const PROBE_LITERAL = '<script>';

/** The two labels V2(d)'s handler half clicks, located by visible text. */
const PATIENT_LABEL = 'John Smith';
const NOTE_LABEL = 'Progress note';

/** V3–V5 style reporting: one line per assertion, and a non-zero exit on failure. */
const results = [];

function pass(name, detail = '') {
  results.push({ name, ok: true });
  process.stdout.write(`PASS ${name}${detail === '' ? '' : `: ${detail}`}\n`);
}

function fail(name, detail) {
  results.push({ name, ok: false });
  process.stdout.write(`FAIL ${name}: ${detail}\n`);
  process.exitCode = 1;
}

function check(name, condition, detail) {
  if (condition) {
    pass(name);
    return true;
  }
  fail(name, detail);
  return false;
}

/** Records a criterion that could not run, with its cause. Never a `PASS`. */
function notRun(name, reason) {
  results.push({ name, ok: true, notRun: true });
  process.stdout.write(`NOT RUN ${name}: ${reason}\n`);
}

/** `<sandbox>` for every run-folder path, so committed evidence carries no host
 * paths (RUN-CONFIG §4). */
function sanitise(value) {
  return String(value).replace(/\/tmp\/apunta-v2\/[^/\s'"]+/g, '<sandbox>');
}

function sleep(ms) {
  return new Promise((done) => setTimeout(done, ms));
}

/**
 * Whether a TCP port has a LISTEN socket, **read** out of `/proc/net/tcp` and
 * `/proc/net/tcp6` rather than proved by binding one.
 *
 * This harness binds no socket of any kind: the observation channel is a
 * same-origin `fetch` over the app's own origin, so there is nothing to be free
 * of afterwards, and a port check that had to bind to answer the question would
 * itself be a listener.
 */
function isPortFree(portNumber) {
  for (const file of ['/proc/net/tcp', '/proc/net/tcp6']) {
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const line of text.split('\n').slice(1)) {
      const fields = line.trim().split(/\s+/);
      if (fields.length < 4) continue;
      const local = fields[1] ?? '';
      const state = fields[3] ?? '';
      if (state !== '0A') continue; // 0A is TCP_LISTEN
      const localPort = Number.parseInt(local.split(':')[1] ?? '', 16);
      if (localPort === portNumber) return false;
    }
  }
  return true;
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

/**
 * Stops one pid this harness started, by pid — never `pkill` (C-ISO@1 rule 7).
 *
 * Returns whether SIGKILL was needed, so an assertion can tell "the app went away
 * on its own" from "the harness cleaned up after a failure".
 */
async function stopPid(pid, label) {
  if (pid === undefined || pid === null) return { stopped: true, escalated: false };
  for (const signal of ['SIGTERM', 'SIGKILL']) {
    if (!pidAlive(pid)) return { stopped: true, escalated: signal === 'SIGKILL' };
    try {
      process.kill(pid, signal);
    } catch {
      return { stopped: true, escalated: signal === 'SIGKILL' };
    }
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && pidAlive(pid)) await sleep(100);
    if (!pidAlive(pid)) {
      process.stdout.write(`  stopped ${label} (pid ${String(pid)}) with ${signal}\n`);
      return { stopped: true, escalated: signal === 'SIGKILL' };
    }
  }
  process.stderr.write(`  ${label} (pid ${String(pid)}) did not stop\n`);
  return { stopped: false, escalated: true };
}

/** The AppImage, resolved once. Zero or more than one match fails the row, so a
 * stale AppImage from an earlier attempt cannot be launched silently. */
function resolveAppImage() {
  const dir = join(repoRoot, 'src-tauri', 'target', 'release', 'bundle', 'appimage');
  if (!existsSync(dir)) return { error: `no bundle directory at ${sanitise(dir)}` };
  const found = readdirSync(dir).filter((name) => name.endsWith('.AppImage'));
  if (found.length === 0) return { error: `no .AppImage in ${sanitise(dir)}` };
  if (found.length > 1) {
    return { error: `${String(found.length)} .AppImage files in ${sanitise(dir)}: ${found.join(', ')}` };
  }
  return { path: join(dir, found[0]), mtimeMs: statSync(join(dir, found[0])).mtimeMs };
}

/**
 * The newest mtime under **Rule B's set**, and which path carries it.
 *
 * This walk is the single normative statement in code of the card's Rule B: it
 * names no path of its own, and it skips `src-tauri/target/` and
 * `src-tauri/gen/` for AM-118's reason.
 */
function newestBundleInputMtime() {
  let newest = { mtimeMs: 0, path: null };
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (dir === join(repoRoot, 'src-tauri') && RULE_B_SKIPPED_DIRS.includes(entry.name)) continue;
        walk(full);
        continue;
      }
      const { mtimeMs } = statSync(full);
      if (mtimeMs > newest.mtimeMs) newest = { mtimeMs, path: full };
    }
  };
  for (const relative of RULE_B_PATHS) {
    const full = join(repoRoot, relative);
    let stats;
    try {
      stats = statSync(full);
    } catch {
      continue;
    }
    if (stats.isDirectory()) walk(full);
    else if (stats.mtimeMs > newest.mtimeMs) newest = { mtimeMs: stats.mtimeMs, path: full };
  }
  return newest;
}

/**
 * The **primary** freshness predicates, which between them catch a committed
 * Rule B path and an uncommitted one: `git diff --name-only <base>…HEAD` sees
 * the former and `git status --porcelain` the latter. The mtime walk above is
 * the fallback for a path that is neither — an ignored file under a Rule B
 * directory, for instance.
 *
 * A path either names is a `FAIL` when it is newer than the AppImage, because
 * that is precisely the case attempt 1 walked past.
 */
function gitNamedRuleBPaths() {
  const named = [];
  const run = (args) => {
    const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
    if (result.status !== 0) return [];
    // `git diff --name-only` prints a bare path per line; `git status
    // --porcelain` prefixes each with a two-character status and a space. The
    // prefix is stripped by pattern rather than by index, because trimming the
    // line first would eat the very space that marks the boundary.
    return result.stdout
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => (/^[ MADRCU?!]{2} /.test(line) ? line.slice(3) : line))
      .filter((path) => path !== '');
  };
  const diffed = run(['diff', '--name-only', `${RULE_B_BASE_COMMIT}...HEAD`, '--', ...RULE_B_PATHS]);
  const statused = run(['status', '--porcelain', '--', ...RULE_B_PATHS]);
  for (const path of new Set([...diffed, ...statused])) {
    const full = join(repoRoot, path);
    let mtimeMs;
    try {
      mtimeMs = statSync(full).mtimeMs;
    } catch {
      mtimeMs = undefined;
    }
    named.push({ path, mtimeMs });
  }
  return named;
}

/**
 * The display, chosen at run time and printed rather than left to the reader.
 *
 * `xvfb-run -a` when it is installed, the desktop session otherwise. The app and
 * the window reader must share one display, so the **harness** re-executes under
 * `xvfb-run -a` and the app is then launched directly: prefixing only the app
 * would leave `xdotool` reading a different display's window list, which reports
 * nothing rather than failing.
 */
function ensureDisplay() {
  if (process.env['APUNTA_V2_SECURITY_XVFB'] === '1') {
    process.stdout.write(`  display: the inherited X display ${String(process.env['DISPLAY'])}\n`);
    return null;
  }
  const xvfbRun = firstOnPath(['xvfb-run']);
  if (xvfbRun === undefined) {
    process.stdout.write('  display: the desktop session (no xvfb-run)\n');
    return null;
  }
  const reexec = spawn(
    xvfbRun,
    [
      '-a',
      '-s',
      '-screen 0 1400x1000x24',
      process.execPath,
      fileURLToPath(import.meta.url),
      ...process.argv.slice(2),
    ],
    { cwd: process.cwd(), env: { ...process.env, APUNTA_V2_SECURITY_XVFB: '1' }, stdio: 'inherit' },
  );
  return reexec;
}

/**
 * The AppImage, under the display prefix.
 *
 * `APUNTA_DATA_DIR`, `APUNTA_PORT`, `APUNTA_NO_OPEN` and `APUNTA_TEST_RUN_ID` are
 * inherited from the harness, which inherited them from `sandbox.mjs env`: the
 * test-identity build refuses to start without the first two, which is what makes
 * this the only way the app can be launched here (HS-1, HS-2).
 *
 * **Nothing else is set in the child's environment.** The observation channel
 * needs no variable and no port: it is the hook's build-time gate that puts it in
 * the bundle at all, and V0's release invariant is what proves a bundle without
 * that gate cannot carry it.
 */
function launchApp(appImage) {
  const child = spawn(appImage, [], {
    cwd: '/',
    env: {
      ...process.env,
      // The desktop's Wayland session must not leak into a headless run: unset
      // rather than overridden, so no child can find a compositor socket.
      WAYLAND_DISPLAY: '',
      XDG_CACHE_HOME: join(dataDir, '..', 'cache'),
      XDG_CONFIG_HOME: join(dataDir, '..', 'config'),
      XDG_DATA_HOME: join(dataDir, '..', 'xdg'),
      HOME: join(dataDir, '..', 'home'),
      XDG_BACKEND: 'x11',
      GDK_BACKEND: 'x11',
      // GDK_SCALE=1 in the private headless shell environment: the P3.5
      // exposure measured a GDK_SCALE=2 leak on this desktop, and this is the
      // one place the harness may normalise it. It never masks a measurement or
      // an assertion — the AM-188 calibration still solves the real per-axis
      // scale from two measured points (k may be 1, 1.5 or 2), and a point that
      // fails to land still fails. Reported explicitly below.
      GDK_SCALE: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  process.stdout.write(
    '  display: GDK_SCALE forced to 1 in the private headless shell environment; the two-point calibration still measures the real scale\n',
  );
  const output = { stdout: '', stderr: '' };
  child.stdout.on('data', (chunk) => {
    output.stdout += chunk.toString('utf8');
  });
  child.stderr.on('data', (chunk) => {
    output.stderr += chunk.toString('utf8');
  });
  return { child, output };
}

/** The App's own visible window whose title is exactly `Apunta`.
 *
 * Three conditions together, so nothing that merely resembles the app window can
 * satisfy it: an exact name (the shell has a hidden 20×20 GTK helper window whose
 * name differs only by case), this run's shell as the owning pid, and a
 * non-trivial size. */
async function findAppWindow(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let seen;
  for (;;) {
    const windows = (await windowListDetailed()) ?? [];
    seen = windows.map((w) => `${w.name} ${String(w.width)}x${String(w.height)} pid=${String(w.pid)}`);
    const hit = windows.find(
      (w) => w.name === 'Apunta' && w.pid === pid && w.width >= 400 && w.height >= 300,
    );
    if (hit !== undefined) return { found: hit, windows, seen };
    if (Date.now() >= deadline) return { found: null, windows, seen };
    await sleep(250);
  }
}

function windowList() {
  return new Promise((done) => {
    const probe = spawn('xdotool', ['search', '--name', '.*'], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    probe.stdout.on('data', (chunk) => {
      out += chunk.toString('utf8');
    });
    probe.on('error', () => done(null));
    probe.on('close', () =>
      done(
        out
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => /^[0-9]+$/.test(line)),
      ),
    );
  });
}

async function windowInfo(id) {
  const [name, geometry, owner] = await Promise.all([
    spawnAsync('xdotool', ['getwindowname', id]),
    spawnAsync('xdotool', ['getwindowgeometry', '--shell', id]),
    spawnAsync('xdotool', ['getwindowpid', id]),
  ]);
  const fields = {};
  for (const line of geometry.stdout.split('\n')) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (match !== null) fields[match[1]] = match[2].trim();
  }
  const width = Number(fields['WIDTH']);
  const height = Number(fields['HEIGHT']);
  if (!Number.isInteger(width) || !Number.isInteger(height)) return null;
  const pid = Number(owner.stdout.trim());
  return { id, name: name.stdout.trim(), width, height, pid: Number.isInteger(pid) ? pid : 0 };
}

async function windowListDetailed() {
  const ids = await windowList();
  if (ids === null) return null;
  const detailed = [];
  for (const id of ids) {
    const info = await windowInfo(id);
    if (info !== null) detailed.push(info);
  }
  return detailed;
}

/** The app window in a list, or `null`. One shape for every window comparison. */
function appWindowOf(windows) {
  return (windows ?? []).find((w) => w.name === 'Apunta' && w.width >= 400 && w.height >= 300) ?? null;
}

/** The two window facts (b) and (c) must leave alone, in one comparable string. */
function windowSignature(windows) {
  const app = appWindowOf(windows);
  return JSON.stringify({
    count: (windows ?? []).length,
    app:
      app === null ? null : `${app.name} ${String(app.width)}x${String(app.height)} pid=${String(app.pid)}`,
  });
}

/** Is Ollama still answering? C-ISO@1 rule 7, read from outside the run. */
async function ollamaAlive() {
  try {
    const response = await fetch('http://127.0.0.1:11434/api/tags', {
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** The `testRunId` this run's server reports, or `null`. */
async function healthRunId() {
  try {
    const response = await fetch(`http://127.0.0.1:${String(port)}/api/health`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const body = await response.json();
    return typeof body.testRunId === 'string' ? body.testRunId : null;
  } catch {
    return null;
  }
}

/** Waits for ownership the way C-ISO@1 rule 5 requires: this run's id, or fail. */
async function waitForOwnership(timeoutMs, what) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if ((await healthRunId()) === runId) return true;
    if (Date.now() >= deadline) {
      fail(`${what}: ownership`, 'testRunId never matched on the sandbox port');
      return false;
    }
    await sleep(250);
  }
}

// ------------------------------------------------------------- the fixture --

/**
 * The note content, read out of `e2e/fixtures/csp/injection-probe.md`.
 *
 * The `md` fence holds exactly what the harness posts as the note's `content`,
 * and the harness locates it by its fence rather than by line numbers, so the
 * fixture's own prose — which explains the payloads — can never end up in a note.
 */
function fixtureNoteContent() {
  const source = readFileSync(join(repoRoot, 'e2e', 'fixtures', 'csp', 'injection-probe.md'), 'utf8');
  const match = /```md\n([\s\S]*?)\n```/.exec(source);
  if (match === null) throw new Error('the fixture has no ```md fence');
  return match[1];
}

// -------------------------------------------------------- (d) over HTTP -----

/**
 * (d)'s handler half, up to the point where the page has to be read.
 *
 * The order is not optional. A sandbox data dir has **no** `note_formats` row —
 * `server/src/seed.ts` is dev-only and is the only other thing that inserts one —
 * and `POST /api/notes` 404s with `errors.not_found.note_format` on an unknown
 * `format_id`, so the format must exist first. The format is named `Progress note`
 * rather than the note being given a title, because a note's title defaults to
 * `format.name` and that literal is what the row to click reads.
 */
async function createFixtureNote() {
  const base = `http://127.0.0.1:${String(port)}`;
  const call = async (path, body) => {
    const response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: base, 'sec-fetch-site': 'same-origin' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    return { status: response.status, body: await response.json() };
  };

  const format = await call('/api/formats', { name: NOTE_LABEL, sections: ['Subjective', 'Plan'] });
  if (format.status !== 201)
    return { ok: false, detail: `POST /api/formats answered ${String(format.status)}` };

  const patient = await call('/api/patients', { name: PATIENT_LABEL });
  if (patient.status !== 201)
    return { ok: false, detail: `POST /api/patients answered ${String(patient.status)}` };

  const note = await call('/api/notes', {
    patient_id: patient.body.id,
    format_id: format.body.id,
    content: fixtureNoteContent(),
  });
  if (note.status !== 201) {
    return { ok: false, detail: `POST /api/notes answered ${String(note.status)}` };
  }
  return { ok: true, patientId: patient.body.id, formatId: format.body.id, noteId: note.body.id };
}

// ------------------------------------------------ the observation channel ----

/**
 * The stderr a reader works from: the child's captured buffer, either as the
 * string itself or as a thunk that yields the buffer **as it stands now**.
 *
 * Every poll below reads through this, and the thunks are the point. A snapshot
 * taken once is a string that never grows, so a poll loop over one can only ever
 * re-find what was already in the buffer at the moment it was taken — which is
 * why every fact the page publishes *after* the first read was invisible, and
 * why a run whose channel worked reported "no marker line ever appeared" while
 * counting the marker lines it had just read.
 */
const stderrAt = (stderrSource) => (typeof stderrSource === 'function' ? stderrSource() : stderrSource);

/**
 * Everything the hook has published so far, read out of the AppImage child's
 * **captured stderr**.
 *
 * The shape mirrors what the hook sends: a fact line carries `href` and no
 * `batch`, a rectangle line carries `batch` and no `href`. Every value in a
 * marker URL is a URL-encoded scalar, so nothing is parsed out of prose and a
 * label can never be mistaken for a fact.
 */
function readObservations(stderrSource) {
  const stderrText = stderrAt(stderrSource);
  const facts = [];
  const rects = new Map();
  let markerLines = 0;
  const pattern = new RegExp(`${MARKER_PATH.replaceAll('/', '\\/')}\\?([^\\s"\\\\]*)`, 'g');
  for (const line of String(stderrText).split('\n')) {
    pattern.lastIndex = 0;
    let match = pattern.exec(line);
    while (match !== null) {
      markerLines += 1;
      const params = new URLSearchParams(match[1]);
      if (params.has('href')) {
        facts.push(Object.fromEntries(params.entries()));
      } else if (params.has('batch')) {
        for (const [key, value] of params.entries()) {
          const rect = /^i(\d+)_(x|y|w|h|l)$/.exec(key);
          if (rect === null) continue;
          const at = rect[1];
          const current = rects.get(at) ?? {};
          current[rect[2]] = value;
          rects.set(at, current);
        }
      }
      match = pattern.exec(line);
    }
  }
  return { facts, rects, markerLines, last: facts.length === 0 ? null : facts[facts.length - 1] };
}

/** The most recent fact line satisfying a predicate, or `null`. */
function lastFactWhere(stderrSource, predicate) {
  const { facts } = readObservations(stderrSource);
  for (let index = facts.length - 1; index >= 0; index -= 1) {
    if (predicate(facts[index])) return facts[index];
  }
  return null;
}

/** Waits for a fact line satisfying a predicate, or `null` on timeout. */
async function waitForFact(stderrSource, predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = lastFactWhere(stderrSource, predicate);
    if (found !== null) return found;
    if (Date.now() >= deadline) return null;
    await sleep(250);
  }
}

// ------------------------------------------------- AM-188 ported model --
//
// The owner-approved assertion and measurement package (AM-188), ported from
// the reviewed pure model `build/p3.4-spec-v5-repair2/model.mjs` (IR7 CLEAR,
// 73/73). Every function below is the model's, so the synthetic port-fidelity
// tests in `docs/v2/evidence/P3.4/attempt-5/implementation/` can prove the
// shipped harness behaves identically. The real run injects the real clock, the
// real command seam and the child's captured stderr; the tests inject fakes.

/**
 * A fake clock: `advance` moves time forward and fires every timer whose moment
 * has passed, in time order, including timers registered while firing.
 */
function createClock(startMs = 0) {
  let t = startMs;
  let seq = 0;
  const timers = new Map();
  const due = () =>
    [...timers.entries()].filter(([, timer]) => timer.at <= t).sort((a, b) => a[1].at - b[1].at);
  const fire = () => {
    for (const [id] of due()) {
      const timer = timers.get(id);
      timers.delete(id);
      timer.cb?.();
    }
  };
  return {
    now: () => t,
    at: (ms, cb) => {
      seq += 1;
      timers.set(seq, { at: ms, cb });
      return seq;
    },
    clear: (id) => timers.delete(id),
    pending: () => timers.size,
    advance(ms) {
      t += ms;
      fire();
    },
    /** Let queued microtasks run without moving time. */
    settle: async () => {
      for (let i = 0; i < 8; i += 1) await Promise.resolve();
    },
  };
}

/** The real clock: `Date.now` for `now`, `setTimeout` for `at`. `advance` throws. */
function createRealClock() {
  let seq = 0;
  const timers = new Map();
  return {
    now: () => Date.now(),
    // `at` takes an ABSOLUTE time (the fake clock's contract); setTimeout takes
    // a delay, so the two are converted here. Getting this wrong makes the
    // deadline fire immediately or never.
    at: (ms, cb) => {
      seq += 1;
      const id = seq;
      const timer = setTimeout(
        () => {
          timers.delete(id);
          cb();
        },
        Math.max(0, ms - Date.now()),
      );
      timers.set(id, timer);
      return id;
    },
    clear: (id) => {
      const timer = timers.get(id);
      if (timer !== undefined) clearTimeout(timer);
      timers.delete(id);
    },
    pending: () => timers.size,
    advance() {
      throw new Error('the real clock cannot be advanced manually');
    },
    settle: async () => {
      await new Promise((done) => setImmediate(done));
    },
  };
}

/** The real observation schedule: a real wait of `ms`. */
const realSchedule = (ms) => sleep(ms);

/**
 * One immutable target deadline. `reset` does not exist: there is no cap to
 * renew and no extension. A late completion can never re-arm it.
 */
function createTargetDeadline(startMs, budgetMs = TARGET_BUDGET_MS) {
  const at = startMs + budgetMs;
  return {
    at,
    start: startMs,
    budgetMs,
    remaining: (nowMs) => Math.max(0, at - nowMs),
    expired: (nowMs) => nowMs >= at,
  };
}

/**
 * Race one promise against the deadline's own remaining time. There is no
 * per-step cap that could renew it, and a hung operation resolves to a terminal
 * "expired" rather than hanging the row.
 */
function raceDeadline(deadline, clock, promise) {
  const remaining = deadline.remaining(clock.now());
  if (remaining <= 0) return Promise.resolve({ ok: false, reason: DEADLINE_EXPIRED });
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clock.clear(timer);
      resolve(value);
    };
    const timer = clock.at(clock.now() + remaining, () => finish({ ok: false, reason: DEADLINE_EXPIRED }));
    Promise.resolve(promise).then(
      (value) => finish({ ok: true, value }),
      (error) => finish({ ok: false, reason: `io rejected: ${String(error)}` }),
    );
  });
}

/** Guard one awaited operation. The only bound is the deadline's own remainder. */
function awaitGuarded(deadline, clock, io) {
  return raceDeadline(deadline, clock, Promise.resolve().then(io));
}

/**
 * Guard one dispatch. A dispatch after the deadline never happens, and a
 * dispatched promise that hangs is raced against the same immutable deadline
 * (B2): a hung mousemove or click ends at the deadline instead of extending
 * the row. There is no phase timer and no second budget.
 */
function dispatchGuarded(deadline, clock, name, run) {
  if (deadline.expired(clock.now())) return Promise.resolve({ ok: false, reason: DEADLINE_EXPIRED, name });
  let out;
  try {
    out = run();
  } catch (error) {
    return Promise.resolve({ ok: false, reason: `dispatch threw: ${String(error)}`, name });
  }
  return raceDeadline(deadline, clock, out).then((settled) =>
    settled.ok ? { ok: true, name, value: settled.value } : { ok: false, name, reason: settled.reason },
  );
}

/**
 * The ONE shared, pure observation poll. Every "require a fact line" step is a
 * deadline-bounded wait, not a single read: the hook publishes on its own 250 ms
 * change-only poll, so a fact read may be stale, null or partial until the next
 * tick. The poll reads the injected `currentFact` repeatedly and waits between
 * reads through the injected `schedule`; every read and every wait is raced
 * against the SAME immutable deadline. There is no phase timer, no reset and no
 * extension.
 *
 * `classify(fact)` decides the loop:
 *   { ok: true, reason }                  the predicate holds
 *   { ok: false, terminal: true, reason } a FRESH but wrong/malformed fact: fail closed now
 *   { ok: false, terminal: false }        not yet: wait for the next hook tick
 * A predicate that throws is fail-closed. A late publication never resurrects an
 * expired row: the deadline ends the poll and the caller issues nothing after it.
 */
async function pollObservation({
  deadline,
  clock,
  currentFact,
  classify,
  schedule,
  waitMs = OBSERVATION_POLL_MS,
}) {
  const wait =
    schedule ??
    ((ms) =>
      new Promise((resolve) => {
        clock.at(clock.now() + ms, resolve);
      }));
  for (;;) {
    if (deadline.expired(clock.now())) return { ok: false, reason: DEADLINE_EXPIRED };
    const read = await awaitGuarded(deadline, clock, currentFact);
    if (!read.ok) return { ok: false, reason: read.reason };
    let verdict;
    try {
      verdict = classify(read.value);
    } catch (error) {
      return { ok: false, reason: `the observation predicate threw: ${String(error)}` };
    }
    if (verdict?.ok === true) return { ok: true, fact: read.value, reason: verdict.reason ?? 'observed' };
    if (verdict?.ok === false && verdict.terminal === true) return { ok: false, reason: verdict.reason };
    const waited = await raceDeadline(
      deadline,
      clock,
      Promise.resolve().then(() => wait(waitMs)),
    );
    if (!waited.ok) return { ok: false, reason: DEADLINE_EXPIRED };
  }
}

/**
 * A dispatched command's exit status, signal and captured output. Fail closed:
 * only status 0, no signal and no XError in either stream may proceed.
 */
function checkCommand(name, result) {
  const code = result?.code;
  const signal = result?.signal ?? null;
  const stdout = String(result?.stdout ?? '');
  const stderr = String(result?.stderr ?? '');
  if (signal !== null && signal !== undefined)
    return { ok: false, name, reason: `${name} was killed by signal ${String(signal)}` };
  if (code !== 0)
    return {
      ok: false,
      name,
      reason: `${name} exited ${String(code)}: ${(stderr || stdout).trim().slice(0, 200)}`,
    };
  if (/XError/.test(stdout) || /XError/.test(stderr))
    return { ok: false, name, reason: `${name} reported XError: ${(stderr || stdout).trim().slice(0, 200)}` };
  return { ok: true, name, reason: `${name} exited 0 with no signal and no XError` };
}

/**
 * Solve the per-axis affine map from exactly two measured native/client pairs.
 * Order matters: identifiability and the finiteness/bound checks all run BEFORE
 * any conversion, so a degenerate solve can never produce a coordinate.
 */
function solveTransform(points, { maxK = MAX_K } = {}) {
  if (!Array.isArray(points) || points.length !== 2)
    return { ok: false, reason: `two measured points are required, ${String(points?.length ?? 0)} given` };
  const [a, b] = points;
  for (const p of [a, b]) {
    for (const axis of ['cx', 'cy', 'sx', 'sy']) {
      if (typeof p?.[axis] !== 'number' || !Number.isFinite(p[axis]))
        return { ok: false, reason: `measured point carries a non-finite ${axis}`, click: false };
    }
  }
  const dcx = b.cx - a.cx;
  const dcy = b.cy - a.cy;
  if (dcx === 0)
    return {
      ok: false,
      reason: 'the two measured points do not differ in client x (axis unidentifiable)',
      click: false,
    };
  if (dcy === 0)
    return {
      ok: false,
      reason: 'the two measured points do not differ in client y (axis unidentifiable)',
      click: false,
    };
  const kx = (b.sx - a.sx) / dcx;
  const ky = (b.sy - a.sy) / dcy;
  for (const [name, k] of [
    ['k_x', kx],
    ['k_y', ky],
  ]) {
    if (!Number.isFinite(k)) return { ok: false, reason: `${name} solved non-finite`, click: false };
    if (!(k > 0)) return { ok: false, reason: `${name} solved ${String(k)}, outside 0 < k`, click: false };
    if (!(k <= maxK))
      return {
        ok: false,
        reason: `${name} solved ${String(k)}, above the bound ${String(maxK)}`,
        click: false,
      };
  }
  const ox = a.sx - kx * a.cx;
  const oy = a.sy - ky * a.cy;
  if (!Number.isFinite(ox) || !Number.isFinite(oy))
    return { ok: false, reason: 'offset solved non-finite', click: false };
  return { ok: true, kx, ky, ox, oy, toNative: (t) => ({ x: kx * t.x + ox, y: ky * t.y + oy }) };
}

/** Convert a client target to a rounded native point. Only ever called on a solved transform. */
function toNativePoint(transform, target) {
  const p = transform.toNative(target);
  return { x: Math.round(p.x), y: Math.round(p.y) };
}

/** Native containment: the point must lie inside the window rectangle read once, up front. */
function containedInWindow(point, window) {
  return (
    point.x >= window.x &&
    point.x < window.x + window.w &&
    point.y >= window.y &&
    point.y < window.y + window.h
  );
}

/** Native read-back: where the pointer actually is, and which window is under it. */
function checkReadback(point, read, window, appPid) {
  const dx = Math.abs(Number(read?.X) - point.x);
  const dy = Math.abs(Number(read?.Y) - point.y);
  if (!Number.isFinite(dx) || !Number.isFinite(dy))
    return { ok: false, reason: `native read-back carried no usable X/Y: ${JSON.stringify(read)}` };
  if (dx > READBACK_TOLERANCE_PX || dy > READBACK_TOLERANCE_PX)
    return {
      ok: false,
      reason: `native read-back is ${String(dx)},${String(dy)} px from the point asked for`,
    };
  const sameWindow = String(read?.WINDOW ?? '') === String(window.id);
  const pid = Number(read?.PID);
  const samePid = Number.isInteger(pid) && pid > 0 && pid === appPid;
  if (!sameWindow && !samePid)
    return {
      ok: false,
      reason: `pointer is not over the app window: WINDOW=${String(read?.WINDOW)} PID=${String(read?.PID)}`,
    };
  return {
    ok: true,
    reason: sameWindow
      ? 'read-back within 1 px over the app window'
      : 'read-back within 1 px over the app pid',
  };
}

/** Parse one stderr line into a marker sighting, or null if it is not a marker. */
function parseMarkerLine(line) {
  const pattern = new RegExp(`${MARKER_PATH.replaceAll('/', '\\/')}\\?([^\\s"\\\\]*)`);
  const match = pattern.exec(String(line));
  if (match === null) return null;
  return { query: match[1], params: new URLSearchParams(match[1]) };
}

function strictInteger(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  if (!/^(0|[1-9][0-9]*)$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * Two rectangles are equal when every NAMED field is equal. The comparison is
 * over the seven field values, never over a serialized object: query-parameter
 * order and index order are irrelevant, so a permuted identical duplicate is
 * idempotent while a changed value is still a conflict.
 */
function sameRect(a, b) {
  if (a === undefined || b === undefined) return false;
  for (const field of RECT_FIELDS) if (a[field] !== b[field]) return false;
  return true;
}

/**
 * The batch reader. One instance per row.
 *
 * The two things root separates:
 *   - the VALID HEADER — a safe-integer epoch >= 1, a declared `rects` count and
 *     an in-range `batch` index. It raises the highest seen epoch IMMEDIATELY,
 *     even when the body turns out to be truncated, so a newer publication
 *     forbids falling back to an older complete one while it is incomplete. An
 *     invalid header raises nothing.
 *   - the COMPLETE BATCH — every index of that batch's own slice present with
 *     all seven fields. Only a complete batch is installed, whole. A truncated
 *     or malformed body is never installed, never merged over a good batch, and
 *     never a conflict — a conflict needs two COMPLETE sightings of the same
 *     (epoch, batch).
 */
function createBatchReader({ batchSize = BATCH_SIZE } = {}) {
  return {
    batchSize,
    highestSeenEpoch: 0,
    markerLines: 0,
    factLines: 0,
    headers: 0,
    installed: new Map(),
    discarded: 0,
    conflict: null,
    observe(line) {
      const sighting = parseMarkerLine(line);
      if (sighting === null) return { kind: 'not-a-marker' };
      this.markerLines += 1;
      const { params } = sighting;
      if (params.has('href')) {
        this.factLines += 1;
        return { kind: 'fact' };
      }
      if (!params.has('batch')) return { kind: 'malformed', reason: 'no batch header', header: false };

      const batch = strictInteger(params.get('batch'));
      const total = strictInteger(params.get('rects'));
      const epoch = strictInteger(params.get('epoch'));
      const discard = (reason, header = false) => {
        this.discarded += 1;
        return { kind: 'malformed', reason, header };
      };
      if (batch === null) return discard('batch is not a strict non-negative integer');
      if (total === null) return discard('rects is not a strict safe integer');
      if (epoch === null) return discard('epoch is not a strict safe integer');
      if (epoch < 1) return discard('epoch is not positive');
      const batchCount = total === 0 ? 0 : Math.ceil(total / this.batchSize);
      if (batch >= batchCount)
        return discard(`batch ${String(batch)} is outside 0..${String(batchCount - 1)}`);

      this.headers += 1;
      if (epoch > this.highestSeenEpoch) this.highestSeenEpoch = epoch;

      const rects = new Map();
      for (const [key, value] of params.entries()) {
        const field = RECT_KEY.exec(key);
        if (field === null) continue;
        const index = strictInteger(field[1]);
        if (index === null || index >= total)
          return discard(`index ${field[1]} is not a strict integer below rects=${String(total)}`, true);
        const entry = rects.get(index);
        if (entry === undefined) rects.set(index, { [field[2]]: value });
        else entry[field[2]] = value;
      }
      const lo = batch * this.batchSize;
      const hi = total === 0 ? 0 : Math.min(total, lo + this.batchSize);
      const expected = new Set();
      for (let i = lo; i < hi; i += 1) expected.add(i);
      const got = new Set(rects.keys());
      for (const i of expected) {
        const entry = rects.get(i);
        if (entry === undefined)
          return discard(`index ${String(i)} is absent from batch ${String(batch)}`, true);
        for (const f of RECT_FIELDS) {
          if (entry[f] === undefined) return discard(`index ${String(i)} is missing field ${f}`, true);
        }
      }
      for (const i of got)
        if (!expected.has(i))
          return discard(`index ${String(i)} is not in batch ${String(batch)}'s slice`, true);

      const key = `${String(epoch)}:${String(batch)}`;
      const previous = this.installed.get(key);
      if (previous !== undefined) {
        const same =
          previous.total === total &&
          previous.rects.size === rects.size &&
          [...rects.keys()].every((i) => sameRect(previous.rects.get(i), rects.get(i)));
        if (!same) {
          this.conflict = {
            epoch,
            batch,
            reason: `two complete sightings of epoch ${String(epoch)} batch ${String(batch)} differ`,
          };
          return { kind: 'conflict', detail: this.conflict };
        }
        return { kind: 'idempotent-duplicate' };
      }
      this.installed.set(key, { epoch, batch, total, rects });
      return { kind: 'installed' };
    },
    /** The selectable frame: the highest seen epoch, complete or not. There is no fallback. */
    frame() {
      if (this.conflict !== null) return { ok: false, reason: this.conflict.reason, click: false };
      const epoch = this.highestSeenEpoch;
      if (epoch === 0) return { ok: false, reason: 'no batch header has been seen', click: false };
      const mine = [...this.installed.values()].filter((entry) => entry.epoch === epoch);
      if (mine.length === 0)
        return {
          ok: false,
          reason: `epoch ${String(epoch)} has a valid header but no complete batch`,
          click: false,
        };
      const totals = new Set(mine.map((entry) => entry.total));
      if (totals.size !== 1)
        return {
          ok: false,
          reason: `epoch ${String(epoch)} mixes declared totals ${[...totals].join(', ')}`,
          click: false,
        };
      const total = [...totals][0];
      const batchCount = total === 0 ? 0 : Math.ceil(total / this.batchSize);
      const present = new Set(mine.map((entry) => entry.batch));
      const missing = [];
      for (let b = 0; b < batchCount; b += 1) if (!present.has(b)) missing.push(b);
      if (missing.length > 0)
        return {
          ok: false,
          reason: `incomplete epoch ${String(epoch)}: ${String(present.size)} of ${String(batchCount)} batches (missing ${missing.join(', ')})`,
          click: false,
        };
      const rects = new Map();
      for (const entry of mine) for (const [i, fields] of entry.rects) rects.set(i, { ...fields });
      const indices = [...rects.keys()].sort((a, b) => a - b);
      const expected = Array.from({ length: total }, (_, i) => i);
      if (indices.length !== expected.length || indices.some((i, at) => i !== expected[at]))
        return {
          ok: false,
          reason: `epoch ${String(epoch)} does not carry the global index set 0..${String(total - 1)}`,
          click: false,
        };
      return { ok: true, epoch, total, rects };
    },
  };
}

/** A frame's rectangle centre in client coordinates. */
function targetCentre(rect) {
  return {
    x: Number(rect.x) + Math.floor(Number(rect.w) / 2),
    y: Number(rect.y) + Math.floor(Number(rect.h) / 2),
  };
}

/**
 * Select by a unique (label, tag) PAIR — root's key. The appended tooltip
 * carries the same label with a different tag, and it is told apart by that
 * comparison, not by a wait and not by testId. More than one live rectangle
 * matching the pair is `ambiguous` and FAILs; `testId` is never a tie-breaker
 * (root: the test id is compared, after the click, against the descriptor).
 */
function selectTarget(frame, wanted) {
  if (frame?.ok !== true) return { ok: false, reason: frame?.reason ?? 'no frame', click: false };
  const all = [...frame.rects.entries()].filter(([, r]) => r.l === wanted.label);
  const matches = all.filter(([, r]) => r.t === wanted.tag);
  if (matches.length === 0)
    return {
      ok: false,
      reason: `no rectangle carries the label/tag pair ${JSON.stringify(wanted.label)}/${JSON.stringify(wanted.tag)}; ${String(all.length)} carry the label`,
      click: false,
    };
  if (matches.length > 1)
    return {
      ok: false,
      reason: `label ${JSON.stringify(wanted.label)} with tag ${JSON.stringify(wanted.tag)} is ambiguous: ${String(matches.length)} rectangles at global indices ${matches.map(([i]) => String(i)).join(', ')}`,
      click: false,
    };
  const [index, rect] = matches[0];
  return { ok: true, index, rect, centre: targetCentre(rect) };
}

/** The gate: presence of href and ipcProbe, nothing else. Presence only; settling is the assertion's job. */
function firstFactGate(facts) {
  return facts.find((fact) => fact.href !== undefined && fact.ipcProbe !== undefined) ?? null;
}

/**
 * The two-arm NOT RUN cause, with the same five rows in both arms. Presence of
 * marker lines does not make the silent-hook explanation true.
 */
function cascadeCause(markerLines) {
  const arm =
    markerLines === 0
      ? "no /api/p3.4-observe line ever appeared in the child's captured stderr"
      : `${String(markerLines)} marker line(s) appeared and none carried href and ipcProbe together`;
  return {
    rows: [...CASCADE_ROWS],
    outcome: 'NOT RUN',
    cause: arm,
    arm: markerLines === 0 ? 'zero-lines' : 'incomplete-fact-set',
  };
}

/** (a): one assertion, one pass condition, all conjuncts together. pending at the deadline is a FAIL. */
function checkNoIpc(fact, { expired = false } = {}) {
  const report = (ok, detail) => ({ ok, detail, title: CASCADE_ROWS[0] });
  if (fact === null || fact === undefined)
    return report(
      false,
      expired
        ? 'ipcProbe was still pending at the deadline; no timeout can produce a pass'
        : 'no fact line carrying href and ipcProbe reached this assertion',
    );
  if (fact.ipcProbe === 'pending')
    return report(
      false,
      expired
        ? 'ipcProbe was still pending at the deadline; no timeout can produce a pass'
        : 'ipcProbe is pending',
    );
  if (fact.ipcProbe === 'resolved')
    return report(false, `the command ${IPC_PROBE_COMMAND} was reached, which is a FAIL`);
  if (fact.ipcProbe !== 'rejected')
    return report(
      false,
      `ipcProbe read ${JSON.stringify(fact.ipcProbe)}, which is neither rejected nor resolved`,
    );
  const seen = `tauri=${JSON.stringify(fact.tauri)}, ipc=${JSON.stringify(fact.ipc)}, ipcInvoke=${JSON.stringify(fact.ipcInvoke)}, ipcProbeMsg=${JSON.stringify(fact.ipcProbeMsg)}`;
  if (fact.tauri !== 'undefined')
    return report(false, `tauri read ${JSON.stringify(fact.tauri)}, not undefined (${seen})`);
  if (fact.ipc !== 'object' || fact.ipcInvoke !== 'function')
    return report(false, `the internals door is not live: ${seen}`);
  if (fact.ipcProbeMsg !== ACL_DENIAL) return report(false, `the rejection was not the ACL denial: ${seen}`);
  return report(true, `ACL denial observed on a live door for ${IPC_PROBE_COMMAND} (${seen})`);
}

/**
 * One move, guarded end to end and with NO exemption anywhere:
 *   1. native containment of the point, BEFORE any dispatch;
 *   2. the pointer counter BASELINE, a bounded wait for its presence;
 *   3. the dispatch, raced against the immutable deadline;
 *   4. status / signal / XError fail closed;
 *   5. the native read-back, <= 1 px, over the app window id or a positive pid,
 *      returned as the MEASURED native point;
 *   6. a bounded wait for a fact whose pointer counter is STRICTLY GREATER than
 *      step 2's.
 */
async function guardedMove({
  deadline,
  clock,
  ops,
  window,
  appPid,
  point,
  wanted,
  tolerance,
  dispatched,
  schedule,
}) {
  const label = `${String(point.x)},${String(point.y)}`;
  if (!containedInWindow(point, window))
    return {
      ok: false,
      reason: `${wanted}: ${label} lies outside the window rectangle; no move and no click issued`,
    };

  const baseline = await pollObservation({
    deadline,
    clock,
    schedule,
    currentFact: () => ops.nextFact(),
    classify: (fact) => {
      const counter = strictInteger(String(fact?.[POINTER.counter] ?? ''));
      if (counter === null) return { ok: false, terminal: false };
      return { ok: true, reason: `${POINTER.counter} baseline ${String(counter)}` };
    },
  });
  if (!baseline.ok)
    return { ok: false, reason: `${wanted}: no usable ${POINTER.counter} baseline (${baseline.reason})` };
  const counterBefore = strictInteger(String(baseline.fact[POINTER.counter]));

  const moved = await dispatchGuarded(deadline, clock, 'xdotool mousemove --sync', () => {
    dispatched.push('mousemove');
    return ops.move(point);
  });
  if (!moved.ok) return { ok: false, reason: `${wanted}: ${moved.reason}` };
  const moveCheck = checkCommand('mousemove', moved.value);
  if (!moveCheck.ok) return { ok: false, reason: `${wanted}: ${moveCheck.reason}` };

  const read = await awaitGuarded(deadline, clock, () => {
    dispatched.push('getmouselocation');
    return ops.read();
  });
  if (!read.ok) return { ok: false, reason: `${wanted}: ${read.reason}` };
  const readCheck = checkCommand('getmouselocation', read.value);
  if (!readCheck.ok) return { ok: false, reason: `${wanted}: ${readCheck.reason}` };
  const back = checkReadback(point, read.value, window, appPid);
  if (!back.ok) return { ok: false, reason: `${wanted}: ${back.reason}` };
  const native = { x: Number(read.value.X), y: Number(read.value.Y) };

  const witness = await pollObservation({
    deadline,
    clock,
    schedule,
    currentFact: () => ops.nextFact(),
    classify: (fact) => {
      const counter = strictInteger(String(fact?.[POINTER.counter] ?? ''));
      if (counter === null || !(counter > counterBefore)) return { ok: false, terminal: false };
      const seen = { x: Number(fact[POINTER.clientX]), y: Number(fact[POINTER.clientY]) };
      if (!Number.isFinite(seen.x) || !Number.isFinite(seen.y))
        return {
          ok: false,
          terminal: true,
          reason: `${wanted}: the fresh observation carried no client position`,
        };
      if (tolerance !== null) {
        const dx = Math.abs(seen.x - tolerance.at.x);
        const dy = Math.abs(seen.y - tolerance.at.y);
        if (dx > WITNESS_TOLERANCE_PX || dy > WITNESS_TOLERANCE_PX)
          return {
            ok: false,
            terminal: true,
            reason: `${wanted}: after the warp the pointer is ${String(dx)},${String(dy)} px from the centre; no click issued`,
          };
      }
      return {
        ok: true,
        reason: `${wanted}: moved, read back within 1 px, ${POINTER.counter} ${String(counterBefore)} -> ${String(counter)}`,
      };
    },
  });
  if (!witness.ok) return { ok: false, reason: witness.reason };
  const seen = { x: Number(witness.fact[POINTER.clientX]), y: Number(witness.fact[POINTER.clientY]) };
  return { ok: true, reason: witness.reason, seen, native };
}

/**
 * The click stage: target warp, the single fresh client witness, one click, a
 * bounded wait for the click counter advanced by exactly one with the three
 * descriptor fields matching, then a bounded wait for the landing fact. Every IO
 * is injected and every step guarded against the one immutable deadline.
 */
async function runClick({
  deadline,
  clock,
  transform,
  window,
  appPid,
  target,
  rect,
  expected,
  ops,
  dispatched = [],
  schedule,
}) {
  const finish = (result) => ({ ...result, dispatched });

  const point = toNativePoint(transform, target);
  const moved = await guardedMove({
    deadline,
    clock,
    ops,
    window,
    appPid,
    point,
    dispatched,
    schedule,
    wanted: 'the target warp',
    tolerance: { at: target },
  });
  if (!moved.ok) return finish({ ok: false, reason: moved.reason });

  const baseline = await pollObservation({
    deadline,
    clock,
    schedule,
    currentFact: () => ops.nextFact(),
    classify: (fact) => {
      const counter = strictInteger(String(fact?.[CLICK.counter] ?? ''));
      if (counter === null) return { ok: false, terminal: false };
      return { ok: true, reason: `${CLICK.counter} baseline ${String(counter)}` };
    },
  });
  if (!baseline.ok)
    return finish({ ok: false, reason: `no usable ${CLICK.counter} baseline (${baseline.reason})` });
  const counterBefore = strictInteger(String(baseline.fact[CLICK.counter]));
  const before = baseline.fact;

  const clicked = await dispatchGuarded(deadline, clock, 'xdotool click 1', () => {
    dispatched.push('click');
    return ops.click();
  });
  if (!clicked.ok) return finish({ ok: false, reason: clicked.reason });
  const clickCheck = checkCommand('click', clicked.value);
  if (!clickCheck.ok) return finish({ ok: false, reason: clickCheck.reason });

  const fresh = await pollObservation({
    deadline,
    clock,
    schedule,
    currentFact: () => ops.nextFact(),
    classify: (fact) => {
      const advanced = strictInteger(String(fact?.[CLICK.counter] ?? ''));
      if (advanced === null || advanced <= counterBefore) return { ok: false, terminal: false };
      if (advanced !== counterBefore + 1)
        return {
          ok: false,
          terminal: true,
          reason: `${CLICK.counter} advanced by ${String(advanced - counterBefore)}, not exactly 1`,
        };
      const cdx = Math.abs(Number(fact[CLICK.clientX]) - target.x);
      const cdy = Math.abs(Number(fact[CLICK.clientY]) - target.y);
      if (
        !Number.isFinite(cdx) ||
        !Number.isFinite(cdy) ||
        cdx > CLICK_N_TOLERANCE_PX ||
        cdy > CLICK_N_TOLERANCE_PX
      )
        return {
          ok: false,
          terminal: true,
          reason: `the click was observed at ${String(cdx)},${String(cdy)} px from the target centre`,
        };
      const descriptor = compareDescriptor(fact, rect);
      if (!descriptor.ok) return { ok: false, terminal: true, reason: descriptor.reason };
      return { ok: true, reason: descriptor.reason };
    },
  });
  if (!fresh.ok) return finish({ ok: false, reason: fresh.reason });

  const landing = await pollObservation({
    deadline,
    clock,
    schedule,
    currentFact: () => ops.nextFact(),
    classify: (after) => {
      const verdict = landingFact(before, after, expected);
      if (verdict.ok) return verdict;
      if (verdict.pending) return { ok: false, terminal: false };
      return { ok: false, terminal: true, reason: verdict.reason };
    },
  });
  if (!landing.ok) return finish({ ok: false, reason: landing.reason });
  return finish({ ok: true, reason: `${moved.reason}; ${fresh.reason}; ${landing.reason}` });
}

/** The three named descriptor fields, compared one by one, never as one string. */
function compareDescriptor(fact, rect) {
  if (rect === undefined || rect === null)
    return { ok: false, reason: 'no rectangle was selected, so there is no descriptor to compare' };
  for (const [name, got, want] of [
    [CLICK.tag, fact?.[CLICK.tag], rect.t],
    [CLICK.testId, fact?.[CLICK.testId], rect.d],
    [CLICK.text, fact?.[CLICK.text], String(rect.l).trim()],
  ]) {
    if (String(got ?? '') !== String(want ?? ''))
      return {
        ok: false,
        reason: `the clicked element's ${name} read ${JSON.stringify(got ?? null)}, not ${JSON.stringify(want ?? '')}`,
      };
  }
  return {
    ok: true,
    reason: `the clicked element matched ${CLICK.tag}, ${CLICK.testId} and trimmed ${CLICK.text}`,
  };
}

/**
 * The landing fact: the actual patient href transition, or the final scriptText
 * fact. A rectangle signature change is diagnostic text and never a pass.
 */
function landingFact(before, after, expected) {
  if (after === null || after === undefined)
    return { ok: false, pending: true, reason: 'no fact line has been published yet' };
  if (expected.kind === 'patient-href') {
    if (after.href === undefined) return { ok: false, pending: true, reason: 'the fact carried no href yet' };
    if (after.href === before?.href)
      return { ok: false, pending: true, reason: `href did not change (${JSON.stringify(after.href)})` };
    return { ok: true, reason: `href transitioned to ${JSON.stringify(after.href)}` };
  }
  if (expected.kind === 'script-text') {
    if (after.scriptText === undefined)
      return { ok: false, pending: true, reason: 'the fact carried no scriptText yet' };
    if (after.scriptText !== 'true')
      return { ok: false, pending: true, reason: `scriptText read ${JSON.stringify(after.scriptText)}` };
    return { ok: true, reason: 'scriptText became true after the click' };
  }
  return { ok: false, reason: `unknown landing kind ${JSON.stringify(expected.kind)}` };
}

/** Diagnostic only: the rectangle signature, kept as text and never as a pass. */
function rectSignature(frame) {
  if (frame?.ok !== true) return '';
  return JSON.stringify([...frame.rects.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r));
}

/** The two fixed calibration targets, derived from the viewport, never hard-coded. */
function calibrationTargets(vpW, vpH) {
  return [
    { name: 'bootstrap 1', cx: Math.round(vpW * 0.5), cy: Math.round(vpH * 0.5) },
    { name: 'bootstrap 2', cx: Math.round(vpW * 0.75), cy: Math.round(vpH * 0.6) },
  ];
}

/**
 * The whole exported orchestration: read the window command once, wait for the
 * viewport fact, take both bootstrap measurements (containment before, read-back
 * after, a bounded wait for a fresh pointer counter for each), solve the affine
 * map from the two MEASURED native/client points with every check before the
 * first conversion, select the target by its unique label/tag pair, then run the
 * click stage through the landing fact.
 *
 * There is no bootstrap exemption, no retry and no phase timer: one deadline,
 * taken once by the caller, governs every command, read and wait.
 */
async function runFlow({ deadline, clock, frame, wanted, expected, ops, schedule }) {
  const dispatched = [];
  const finish = (result) => ({ ...result, dispatched });

  const geometry = await awaitGuarded(deadline, clock, () => {
    dispatched.push('getwindowgeometry');
    return ops.windowGeometry();
  });
  if (!geometry.ok) return finish({ ok: false, reason: geometry.reason });
  const geometryCheck = checkCommand('getwindowgeometry', geometry.value);
  if (!geometryCheck.ok) return finish({ ok: false, reason: geometryCheck.reason });
  const raw = geometry.value ?? {};
  const window = { id: raw.id, x: Number(raw.x), y: Number(raw.y), w: Number(raw.w), h: Number(raw.h) };
  if (!Number.isInteger(window.w) || !Number.isInteger(window.h) || window.w <= 0 || window.h <= 0)
    return finish({
      ok: false,
      reason: `the window geometry read non-integer WIDTH/HEIGHT: ${JSON.stringify(raw)}`,
    });
  if (!Number.isFinite(window.x) || !Number.isFinite(window.y))
    return finish({ ok: false, reason: `the window geometry read non-finite X/Y: ${JSON.stringify(raw)}` });
  const appPid = Number(raw.pid);
  if (!Number.isInteger(appPid) || appPid <= 0)
    return finish({
      ok: false,
      reason: `the application pid read ${JSON.stringify(raw.pid)}, not a positive integer`,
    });

  const viewport = await pollObservation({
    deadline,
    clock,
    schedule,
    currentFact: () => ops.nextFact(),
    classify: (fact) => {
      if (fact?.[VIEWPORT.w] === undefined || fact?.[VIEWPORT.h] === undefined)
        return { ok: false, terminal: false };
      const vpW = strictInteger(String(fact[VIEWPORT.w]));
      const vpH = strictInteger(String(fact[VIEWPORT.h]));
      if (vpW === null || vpH === null)
        return {
          ok: false,
          terminal: true,
          reason: `the page published a non-integer ${VIEWPORT.w}/${VIEWPORT.h} viewport: ${JSON.stringify(fact[VIEWPORT.w])},${JSON.stringify(fact[VIEWPORT.h])}`,
        };
      if (vpW < MIN_VIEWPORT_W || vpH < MIN_VIEWPORT_H)
        return {
          ok: false,
          terminal: true,
          reason: `the viewport ${String(vpW)}x${String(vpH)} is below ${String(MIN_VIEWPORT_W)}x${String(MIN_VIEWPORT_H)}`,
        };
      return { ok: true, reason: `viewport ${String(vpW)}x${String(vpH)}` };
    },
  });
  if (!viewport.ok) return finish({ ok: false, reason: viewport.reason });
  const vpW = strictInteger(String(viewport.fact[VIEWPORT.w]));
  const vpH = strictInteger(String(viewport.fact[VIEWPORT.h]));

  const [first, second] = calibrationTargets(vpW, vpH);
  const naive = { x: window.x + first.cx, y: window.y + first.cy };
  const one = await guardedMove({
    deadline,
    clock,
    ops,
    window,
    appPid,
    point: naive,
    dispatched,
    schedule,
    wanted: first.name,
    tolerance: null,
  });
  if (!one.ok) return finish({ ok: false, reason: one.reason });

  const displacement = { x: naive.x + (second.cx - first.cx), y: naive.y + (second.cy - first.cy) };
  const two = await guardedMove({
    deadline,
    clock,
    ops,
    window,
    appPid,
    point: displacement,
    dispatched,
    schedule,
    wanted: second.name,
    tolerance: null,
  });
  if (!two.ok) return finish({ ok: false, reason: two.reason });

  const transform = solveTransform([
    { cx: one.seen.x, cy: one.seen.y, sx: one.native.x, sy: one.native.y },
    { cx: two.seen.x, cy: two.seen.y, sx: two.native.x, sy: two.native.y },
  ]);
  if (!transform.ok)
    return finish({
      ok: false,
      reason: `the calibration did not solve: ${transform.reason}; no target warp and no click`,
    });

  const chosen = selectTarget(frame, wanted);
  if (!chosen.ok) return finish({ ok: false, reason: chosen.reason });

  const clicked = await runClick({
    deadline,
    clock,
    transform,
    window,
    appPid,
    target: chosen.centre,
    rect: chosen.rect,
    expected,
    ops,
    dispatched,
    schedule,
  });
  return finish({ ...clicked, reason: `${two.reason}; ${clicked.reason}` });
}

// ------------------------------------------------------ the real IO seam ----

/**
 * The raw marker lines the child's stderr carries, in order. The batch reader
 * observes these; one line is one request the server logged.
 */
function markerLinesOf(stderrSource) {
  const text = stderrAt(stderrSource);
  const lines = [];
  const pattern = new RegExp(`${MARKER_PATH.replaceAll('/', '\\/')}\\?`);
  for (const line of String(text).split('\n')) {
    if (pattern.test(line)) lines.push(line);
  }
  return lines;
}

/** The selectable frame, rebuilt from every marker line observed so far. */
function frameFrom(stderrSource) {
  const reader = createBatchReader();
  for (const line of markerLinesOf(stderrSource)) reader.observe(line);
  return reader.frame();
}

/** The tag of the one rectangle carrying `label`, or null if absent or not unique. */
function tagForLabel(stderrSource, label) {
  const frame = frameFrom(stderrSource);
  if (frame.ok !== true) return null;
  const matches = [...frame.rects.values()].filter((r) => r.l === label);
  if (matches.length !== 1) return null;
  return matches[0].t;
}

/** Waits for the frame to carry exactly one rectangle for `label`, or null on timeout. */
async function waitForLabel(stderrSource, label, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const tag = tagForLabel(stderrSource, label);
    if (tag !== null) return tag;
    if (Date.now() >= deadline) return null;
    await sleep(250);
  }
}

/**
 * The real command seam for the (d) handler half: every command the flow
 * dispatches, wrapped in the one result shape. `windowGeometry` reads the app
 * window once; `move`/`read`/`click` are the flow's dispatches; `nextFact` is
 * the newest published fact line.
 */
function makeOps(windowId, appPid, stderrSource) {
  const parseShell = (result) => {
    const fields = {};
    for (const line of String(result.stdout).split('\n')) {
      const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
      if (match !== null) fields[match[1]] = match[2].trim();
    }
    return fields;
  };
  return {
    windowGeometry: async () => {
      const result = await spawnAsync('xdotool', ['getwindowgeometry', '--shell', String(windowId)]);
      const fields = parseShell(result);
      return {
        ...result,
        id: windowId,
        x: fields['X'],
        y: fields['Y'],
        w: fields['WIDTH'],
        h: fields['HEIGHT'],
        pid: String(appPid),
      };
    },
    move: (point) => spawnAsync('xdotool', ['mousemove', '--sync', String(point.x), String(point.y)]),
    read: async () => {
      const result = await spawnAsync('xdotool', ['getmouselocation', '--shell']);
      const fields = parseShell(result);
      return { ...result, X: fields['X'], Y: fields['Y'], WINDOW: fields['WINDOW'], PID: fields['PID'] };
    },
    click: () => spawnAsync('xdotool', ['click', '1']),
    nextFact: () => lastFactWhere(stderrSource, (fact) => fact['href'] !== undefined),
  };
}

/**
 * Runs the flow and, when the deadline expired a dispatch, stops the command
 * this harness still has running by its own pid — never `pkill`, never a
 * process this harness did not start, and never a stranded process.
 */
async function runFlowGuarded(args) {
  const result = await runFlow(args);
  if (!result.ok && result.reason === DEADLINE_EXPIRED) await killActiveCommands();
  return result;
}

// ------------------------------------------------------------------ mode ----

async function modeSecurity() {
  const appImage = resolveAppImage();
  if (appImage.error !== undefined) {
    fail('V2 appimage', appImage.error);
    return;
  }
  pass('V2 appimage', sanitise(appImage.path));

  // Freshness, on Rule B's set. The binary must not predate any input that
  // reaches `bundle.resources`, or V2 would be asserting about code that was
  // never compiled — which is exactly how attempt 1's (d) header half failed.
  const newest = newestBundleInputMtime();
  check(
    'V2 the AppImage is newer than every Rule B input',
    newest.mtimeMs <= appImage.mtimeMs,
    `${sanitise(newest.path ?? '(none)')} (${new Date(newest.mtimeMs).toISOString()}) is newer than the AppImage (${new Date(appImage.mtimeMs).toISOString()})`,
  );

  const named = gitNamedRuleBPaths();
  const stale = named.filter((entry) => entry.mtimeMs !== undefined && entry.mtimeMs > appImage.mtimeMs);
  check(
    'V2 no Rule B path named by git is newer than the AppImage',
    stale.length === 0,
    `git names ${String(named.length)} Rule B path(s) from ${RULE_B_BASE_COMMIT}…HEAD or from the working tree; stale: ${stale.map((entry) => entry.path).join(', ') || '(none)'}`,
  );

  const ollamaBefore = await ollamaAlive();
  BEFORE_OWNERSHIP = ownershipFiles();
  let run = null;
  let note;
  let baselineWindows;
  try {
    run = launchApp(appImage.path);
    const pid = run.child.pid;

    const home = await findAppWindow(pid, 60_000);
    check(
      "V2 the app's own window is up",
      home.found !== null,
      `no window named exactly Apunta owned by pid ${String(pid)} and at least 400x300 within 60s (saw ${JSON.stringify(home.seen)})`,
    );
    if (home.found === null) return;
    check(
      'V2 the server answers with this run id',
      await waitForOwnership(30_000, 'V2'),
      'no ownership on the port',
    );

    // ---- (d), header half. Independent of the observation channel, and it fails
    // on an unmodified tree, which is what keeps (d) from passing vacuously.
    const spa = await fetch(`http://127.0.0.1:${String(port)}/patients`, {
      signal: AbortSignal.timeout(10_000),
    });
    const policy = spa.headers.get('content-security-policy') ?? '';
    // The header **as it is really sent** is printed whether the check passes or
    // fails. `check()` only surfaces its detail on a failure, so a PASS would
    // otherwise record that a policy was found without recording which one —
    // and this row's whole claim is about the directives that are really there.
    process.stdout.write(
      `  observed GET /patients: status ${String(spa.status)}, content-type ${JSON.stringify(spa.headers.get('content-type'))}, content-security-policy ${JSON.stringify(policy)}\n`,
    );
    check(
      "(d) header: the SPA fallback HTML carries rule 6's six directives",
      spa.ok &&
        spa.headers.get('content-type')?.includes('text/html') === true &&
        RULE_6_DIRECTIVES.every((d) => policy.includes(d)),
      `GET /patients answered ${String(spa.status)} with content-type ${JSON.stringify(spa.headers.get('content-type'))} and a CSP of ${JSON.stringify(policy)}`,
    );

    // ---- The fixture note, created **before** the observation gate and before
    // the reload below. A fresh sandbox data folder has no note format and no
    // patient, so the app's first paint lands on its onboarding screen — and a
    // patient row to click simply does not exist there, which made (d)'s
    // handler half, and (b) and (c) behind it, undecidable for a reason that has
    // nothing to do with the page's contents. The three calls are the card's own
    // order and its own working precedent (`e2e/tests/api.spec.ts:10-23`); only
    // when they are made is changed.
    note = await createFixtureNote();
    check('(d) handler: the fixture note is created over HTTP', note.ok, note.detail);
    if (note.ok) {
      await spawnAsync('xdotool', ['key', '--window', String(home.found.id), 'ctrl+r']);
      await sleep(3000);
    }

    // ---- The observation channel. The first fact line carrying `href` **and**
    // `ipcProbe` together is the assertion that it works at all: without one,
    // everything below is NOT RUN together. Presence only — settling the probe
    // is (a)'s job, not the gate's.
    const first = await waitForFact(
      () => run.output.stderr,
      (fact) => fact['href'] !== undefined && fact['ipcProbe'] !== undefined,
      45_000,
    );
    if (first === null) {
      const count = readObservations(run.output.stderr).markerLines;
      const cascade = cascadeCause(count);
      const cause =
        `${cascade.cause}, so the observation hook publishes nothing this harness can read. ` +
        "Nothing here may be read without it, so (a), (b), (c), (d)'s handler half and (e) are NOT RUN together and none of them is a PASS.";
      for (const row of cascade.rows) notRun(row, cause);

      // The note is still created over HTTP, because the three calls are decidable
      // without the page and the report is stronger for having run them. Their
      // success is **not** the handler half: nothing was rendered.
      note = await createFixtureNote();
      process.stdout.write(
        note.ok
          ? '  the fixture note was created over HTTP (format, patient and note all 201) and was NOT opened, because opening it and reading the page both need the channel\n'
          : `  the fixture note was NOT created: ${note.detail}\n`,
      );
      return;
    }

    // ---- (a). One assertion, one pass condition.
    await assertNoIpc(run);

    // ---- The window baseline, taken **before** the note is opened. The hook
    // actuates as soon as `scriptText` has been true for two polls, which can be
    // within 500ms of the note opening — so a snapshot taken after the clicks
    // would be a snapshot of an already-actuated window, and (b) and (c) would
    // be comparing two post-attempt states. This one is genuinely before.
    baselineWindows = windowSignature(await windowListDetailed());

    // ---- (d)'s handler half, with the note opened by clicking its labels, and
    // (e), which needs the same rendered page.
    await assertInjectedNoteInert(run, home.found.id, pid, note);
    await assertInlineStyleApplied(run);

    // ---- (b) and (c), which the hook makes in that fixed order once the note
    // is open, both read against the baseline above.
    await assertNavigationRefused(run, baselineWindows);
    await assertWindowOpenRefused(run, baselineWindows);
  } finally {
    // Any command this harness still has running is stopped by its own pid
    // before the app is, so a hung dispatch can never strand a process.
    await killActiveCommands();
    if (run !== null) {
      for (const stream of ['stdout', 'stderr']) {
        const text = (run.output[stream] ?? '').trim();
        if (text !== '') {
          process.stdout.write(`  --- the app's ${stream} (last 15 lines) ---\n`);
          for (const line of text.split('\n').slice(-15)) process.stdout.write(`  ${sanitise(line)}\n`);
        }
      }
      await stopPid(run.child.pid, 'the shell');
    }

    // ---- containment, all five, none of them weakenable to make the row pass.
    const serversAfter = await waitForNoServerProcess(15_000);
    check(
      'containment no server process from the run survives',
      serversAfter === 0,
      `found ${String(serversAfter)}`,
    );

    // Snapshotted **before** the launch, so this compares the run's own single
    // set against what is on disk afterwards: a *second* one is anything beyond
    // the four C-OWN@1 names, and the lock must name no live pid.
    const after = ownershipFiles();
    const extra = after.filter(
      (file) => file.present && !BEFORE_OWNERSHIP.some((was) => was.name === file.name),
    );
    const lock = readFileSyncSafe(join(dataDir, 'apunta.lock'));
    const lockHolder = lock === null ? null : /"pid"\s*:\s*(\d+)/.exec(lock)?.[1];
    check(
      'containment no second lock, database, -wal or -shm',
      extra.length === 0 && (lockHolder === null || !pidAlive(Number(lockHolder))),
      `extra: ${extra.map((f) => f.name).join(', ') || '(none)'}; the lock names pid ${String(lockHolder ?? '(no lock)')}`,
    );

    check(
      'containment the sandbox port is free afterwards',
      isPortFree(port),
      `127.0.0.1:${String(port)} is still bound`,
    );

    // The channel is gone when the row ends, **and** cannot exist in a shipped
    // bundle: the app is already stopped by pid at this point, so a second read
    // a short interval later must show no new marker line; and the two strings
    // the channel is made of must be absent from `web/dist` altogether.
    const stderrAfterStop = run?.output.stderr ?? '';
    const firstRead = readObservations(stderrAfterStop).markerLines;
    await sleep(3000);
    const secondRead = readObservations(run?.output.stderr ?? '').markerLines;
    const shipped = countInShippedWebDist();
    check(
      'containment the observation channel is gone, and cannot ship',
      secondRead === firstRead && shipped.marker === 0 && shipped.gate === 0,
      `marker lines after the stop: ${String(firstRead)}, then ${String(secondRead)} a few seconds later; web/dist/assets/*.js carries ${String(shipped.marker)} marker occurrence(s) and ${String(shipped.gate)} gate occurrence(s)`,
    );

    check(
      'containment ollama is still running',
      ollamaBefore && (await ollamaAlive()),
      `before ${String(ollamaBefore)}`,
    );
  }
}

/**
 * (a): one assertion, one pass condition, all conjuncts together (AM-188).
 * `tauri === 'undefined'` is the `withGlobalTauri: false` proof; `ipc`/`ipcInvoke`
 * are the proof the internals door is live; `ipcProbe === 'rejected'` with
 * `ipcProbeMsg` exactly the ACL denial is the proof the known-existing built-in
 * command was denied. `resolved` is a failure — the command was reached — and
 * `pending` at the 30-second deadline is a failure; no timeout can produce a
 * pass. `tauriInternals` stays diagnostic.
 */
async function assertNoIpc(run) {
  const fact = await waitForFact(
    () => run.output.stderr,
    (line) => line['href'] !== undefined && line['ipcProbe'] !== undefined && line['ipcProbe'] !== 'pending',
    30_000,
  );
  const result = checkNoIpc(fact, { expired: fact === null });
  check(result.title, result.ok, result.detail);
}

/**
 * (b): a refusal, never a successful external load. `.invalid` is reserved and
 * cannot resolve (HS-6), so a load that succeeded would be a `FAIL`.
 *
 * The three results are told apart, because "the row could not read the page"
 * must never be reported as "the navigation was refused": a **changed** title, a
 * **changed** geometry, a **new** window, or an `href` that no longer begins with
 * the app origin is a `FAIL`; no fact arriving while the window is unchanged is
 * `NOT RUN` with the channel's cause; and an unchanged window with facts still
 * arriving is the pass.
 */
async function assertNavigationRefused(run, baselineWindows) {
  const fact = await waitForFact(
    () => run.output.stderr,
    (line) => (line['attempt'] ?? '').startsWith('b:'),
    30_000,
  );
  if (fact === null) {
    notRun(
      '(b) navigation to the reserved .invalid origin is refused',
      `the hook published no attempt naming (b); the baseline window signature was ${String(baselineWindows)}`,
    );
    return;
  }
  await sleep(5000);
  const after = windowSignature(await windowListDetailed());
  const stillOurs = (await healthRunId()) === runId;
  const stillTheApp = String(fact['href']).startsWith(`http://127.0.0.1:${String(port)}`);
  check(
    '(b) navigation to the reserved .invalid origin is refused',
    baselineWindows === after && stillOurs && stillTheApp,
    `the hook reported attempt ${JSON.stringify(fact['attempt'])}; the baseline window signature was ${String(baselineWindows)} and is now ${after}; this run still owns the server: ${String(stillOurs)}; href is ${JSON.stringify(fact['href'])}`,
  );
}

/** (c): `on_new_window … Deny` as shipped, for a loopback URL and for `.invalid`. */
async function assertWindowOpenRefused(run, baselineWindows) {
  const fact = await waitForFact(
    () => run.output.stderr,
    (line) => (line['attempt'] ?? '').startsWith('c:'),
    30_000,
  );
  if (fact === null) {
    notRun('(c) window.open is cancelled', 'the hook published no attempt naming (c)');
    return;
  }
  await sleep(8000);
  const after = windowSignature(await windowListDetailed());
  check(
    '(c) window.open is cancelled for a loopback URL and for the reserved .invalid origin',
    baselineWindows === after,
    `the hook reported attempt ${JSON.stringify(fact['attempt'])}; the baseline window signature was ${String(baselineWindows)} and is now ${after}`,
  );
}

/**
 * (d)'s handler half. Both halves, because either alone is decidable-but-weak:
 * the header half above proves the CSP exists, and this proves the payload did
 * not run while its characters are on screen.
 *
 * The note is opened by the AM-188 measured calibration path: read the window
 * once, wait for the viewport, take two MEASURED bootstrap points, solve the
 * per-axis affine map (all checks before use), select the row by its unique
 * (label, tag) pair, warp to its centre, take the one fresh client witness, and
 * dispatch exactly one click. The patient click lands on `href` changing; the
 * note click lands on `scriptText` turning true. A click that missed ends at the
 * immutable 30-second deadline and **fails** the row.
 *
 * The tag is captured from the frame as it stands **before** the pointer moves,
 * so a tooltip carrying the same label with a different tag cannot be mistaken
 * for the row.
 */
async function assertInjectedNoteInert(run, windowId, appPid, created) {
  // The three calls were already made, and already asserted, before the
  // observation gate so that the app's first paint could show a patient row.
  // Creating them again here would only add a duplicate patient and a duplicate
  // format, and would leave two rows carrying the same visible label.
  if (!created.ok) return;

  const stderrSource = () => run.output.stderr;
  const ops = makeOps(windowId, appPid, stderrSource);
  const clock = createRealClock();

  const patientTag = await waitForLabel(stderrSource, PATIENT_LABEL, 30_000);
  if (patientTag === null) {
    check(
      `(d) handler: the ${JSON.stringify(PATIENT_LABEL)} row was clicked and landed`,
      false,
      `the hook published no unique rectangle carrying the label ${JSON.stringify(PATIENT_LABEL)}; the frame is ${JSON.stringify(frameFrom(stderrSource).reason ?? '(ok)')}`,
    );
    return;
  }

  const patient = await runFlowGuarded({
    deadline: createTargetDeadline(clock.now()),
    clock,
    schedule: realSchedule,
    frame: frameFrom(stderrSource),
    wanted: { label: PATIENT_LABEL, tag: patientTag },
    expected: { kind: 'patient-href' },
    ops,
  });
  if (
    !check(
      `(d) handler: the ${JSON.stringify(PATIENT_LABEL)} row was clicked and landed`,
      patient.ok && patient.dispatched.filter((name) => name === 'click').length === 1,
      `${patient.reason} (dispatched ${patient.dispatched.join(', ')})`,
    )
  )
    return;

  const noteTag = await waitForLabel(stderrSource, NOTE_LABEL, 30_000);
  if (noteTag === null) {
    check(
      `(d) handler: the ${JSON.stringify(NOTE_LABEL)} row was clicked and landed`,
      false,
      `the hook published no unique rectangle carrying the label ${JSON.stringify(NOTE_LABEL)} after the patient opened; the frame is ${JSON.stringify(frameFrom(stderrSource).reason ?? '(ok)')}`,
    );
    return;
  }

  const note = await runFlowGuarded({
    deadline: createTargetDeadline(clock.now()),
    clock,
    schedule: realSchedule,
    frame: frameFrom(stderrSource),
    wanted: { label: NOTE_LABEL, tag: noteTag },
    expected: { kind: 'script-text' },
    ops,
  });
  if (
    !check(
      `(d) handler: the ${JSON.stringify(NOTE_LABEL)} row was clicked and landed`,
      note.ok && note.dispatched.filter((name) => name === 'click').length === 1,
      `${note.reason} (dispatched ${note.dispatched.join(', ')})`,
    )
  )
    return;

  const fact = await waitForFact(
    stderrSource,
    (line) => line['probe'] !== undefined && line['scriptText'] !== undefined,
    30_000,
  );
  check(
    `(d) handler: window.${PROBE_SENTINEL} is undefined`,
    fact !== null && fact['probe'] === 'undefined',
    fact === null
      ? 'no fact line carrying the probe global arrived'
      : `the page reported ${JSON.stringify(fact['probe'])}`,
  );
  check(
    `(d) handler: the literal ${PROBE_LITERAL} is visible in the rendered body`,
    fact !== null && fact['scriptText'] === 'true',
    fact === null ? 'no fact line arrived' : `the page reported ${JSON.stringify(fact['scriptText'])}`,
  );
}

/**
 * (e), the runtime half of V1(vi): the style attribute on one of the app's own
 * inline-styled elements is **applied**, read back as a computed value. This is
 * what proves `style-src-attr 'unsafe-inline'` is effective rather than a header
 * string nobody checked.
 */
async function assertInlineStyleApplied(run) {
  const fact = await waitForFact(
    () => run.output.stderr,
    (line) => (line['styleAttr'] ?? '') !== '',
    20_000,
  );
  if (fact === null) {
    notRun(
      '(e) an inline style attribute is applied in the shipped binary',
      'the page published no element carrying a non-empty style attribute, so there is nothing to read back',
    );
    return;
  }
  const declared = String(fact['styleAttr']);
  const property = (declared.split(':')[0] ?? '').trim();
  const computed = String(fact['styleComputed']).trim();
  const applied = property !== '' && computed !== '' && computed !== 'auto' && computed !== property;
  check(
    '(e) an inline style attribute is applied in the shipped binary',
    applied,
    `style=${JSON.stringify(declared.slice(0, 120))} and getComputedStyle(${JSON.stringify(property)}) is ${JSON.stringify(computed)}; a blocked attribute reads auto or empty`,
  );
}

// ------------------------------------------------------------- utilities ----

/**
 * How many of the two channel strings are in `web/dist/assets/*.js`.
 *
 * The release invariant, restated on the row that launches the binary: the
 * marker path is what a harness reads, and the gate string is what puts it in a
 * bundle. Both must be absent, and neither count is ever lowered (HS-7).
 */
function countInShippedWebDist() {
  const dir = join(repoRoot, 'web', 'dist', 'assets');
  let marker = 0;
  let gate = 0;
  let bundles = 0;
  if (!existsSync(dir)) return { marker: -1, gate: -1, bundles: 0 };
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.js')) continue;
    bundles += 1;
    const text = readFileSync(join(dir, name), 'utf8');
    marker += text.split(MARKER_PATH).length - 1;
    gate += text.split(GATE_STRING).length - 1;
  }
  return { marker, gate, bundles };
}

/** How many bundled server processes are running on this data folder. */
function countServerProcesses(folder) {
  let count = 0;
  for (const entry of readdirSync('/proc')) {
    if (!/^\d+$/.test(entry)) continue;
    const cmdline = readProcField(entry, 'cmdline');
    if (cmdline === null) continue;
    if (!cmdline.includes('server.mjs') || !cmdline.includes('linux-resources')) continue;
    const environ = readProcField(entry, 'environ');
    if (environ === null) continue;
    if (!environ.includes(`APUNTA_DATA_DIR=${folder}`)) continue;
    count += 1;
  }
  return count;
}

async function waitForNoServerProcess(timeoutMs) {
  let count = countServerProcesses(dataDir);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && count > 0) {
    await sleep(250);
    count = countServerProcesses(dataDir);
  }
  return count;
}

/** The four files C-OWN@1 owns, and whether each exists now. */
function ownershipFiles() {
  return ['apunta.lock', 'apunta.db', 'apunta.db-wal', 'apunta.db-shm'].map((name) => ({
    name,
    present: existsSync(join(dataDir, name)),
  }));
}

/** Taken before the launch, so the containment comparison has a baseline. */
let BEFORE_OWNERSHIP = [];

function readFileSyncSafe(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function readProcField(pid, field) {
  try {
    return readFileSync(join('/proc', pid, field), 'utf8').replaceAll('\0', ' ');
  } catch {
    return null;
  }
}

/** The first of these that is on `PATH`, or `undefined`. */
function firstOnPath(names) {
  for (const name of names) {
    for (const dir of (process.env['PATH'] ?? '').split(':').filter((d) => d !== '')) {
      if (existsSync(join(dir, name))) return name;
    }
  }
  return undefined;
}

/**
 * Every command this harness spawns, tracked so a dispatch that outlives the
 * deadline can be stopped by its own pid — never `pkill` (C-ISO@1 rule 7), and
 * never a process this harness did not start. A child leaves the set on close,
 * so the set holds only commands that are still running.
 */
const activeCommands = new Set();

function trackCommand(child) {
  activeCommands.add(child);
  child.on('close', () => activeCommands.delete(child));
  return child;
}

/** Stops every command this harness still has running, by pid, and clears the set. */
async function killActiveCommands() {
  for (const child of [...activeCommands]) {
    try {
      if (child.exitCode === null && child.signalCode === null) process.kill(child.pid, 'SIGKILL');
    } catch {
      // already gone
    }
  }
  activeCommands.clear();
}

/**
 * One result shape for every command: `{ code, signal, stdout, stderr }`.
 * Backward compatible — every existing caller reads `.stdout`/`.stderr`, which
 * are still there — and the AM-188 command protocol reads `.code`/`.signal`.
 */
function spawnAsync(command, args) {
  return new Promise((done) => {
    const child = trackCommand(spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] }));
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => done({ code: null, signal: null, stdout: '', stderr: String(error) }));
    child.on('close', (code, signal) => done({ code, signal, stdout, stderr }));
  });
}

// ------------------------------------------------------------------- main ----

async function main() {
  const reexec = ensureDisplay();
  if (reexec !== null) {
    return await new Promise((settle) => {
      reexec.on('exit', (code, signal) => settle(signal === null ? (code ?? 0) : 1));
      reexec.on('error', (error) => {
        process.stderr.write(`tauri-security: ${String(error)}\n`);
        settle(1);
      });
    });
  }

  if (process.argv[2] !== 'security') {
    process.stderr.write(`tauri-security: unknown mode ${String(process.argv[2])}\nusage: security\n`);
    return 2;
  }

  if (!Number.isInteger(port) || !dataDir || !runId) {
    process.stderr.write(
      'tauri-security: source the sandbox environment first:\n' +
        '  node scripts/v2/sandbox.mjs env --port 78xx > /tmp/apunta-v2-…env && . /tmp/apunta-v2-…env\n' +
        'APUNTA_DATA_DIR, APUNTA_PORT and APUNTA_TEST_RUN_ID are all required.\n',
    );
    return 2;
  }

  await modeSecurity();

  const failed = results.filter((r) => !r.ok);
  const notRunCount = results.filter((r) => r.notRun === true).length;
  process.stdout.write(
    `\n${String(results.length - failed.length)}/${String(results.length)} assertions passed` +
      (notRunCount > 0 ? `, ${String(notRunCount)} NOT RUN` : '') +
      '\n',
  );
  // A `NOT RUN` is never a `PASS`, and it is never a green row either.
  return failed.length > 0 || notRunCount > 0 ? 1 : 0;
}

// ------------------------------------------------------------ exports ----
//
// The AM-188 ported functions and their constants, exported so the synthetic
// port-fidelity tests in `docs/v2/evidence/P3.4/attempt-5/implementation/` can
// exercise the ACTUAL shipped functions with injected fakes (fake clock, fake
// command seam, fake stderr). Nothing here changes the row: the harness still
// runs only in `security` mode, and only when it is the entry point.
export {
  ACL_DENIAL,
  BATCH_SIZE,
  CASCADE_ROWS,
  CLICK,
  DEADLINE_EXPIRED,
  IPC_PROBE_COMMAND,
  MARKER_PATH,
  OBSERVATION_POLL_MS,
  POINTER,
  RECT_FIELDS,
  VIEWPORT,
  awaitGuarded,
  calibrationTargets,
  cascadeCause,
  checkCommand,
  checkNoIpc,
  checkReadback,
  compareDescriptor,
  containedInWindow,
  createBatchReader,
  createClock,
  createRealClock,
  createTargetDeadline,
  dispatchGuarded,
  firstFactGate,
  frameFrom,
  guardedMove,
  landingFact,
  markerLinesOf,
  pollObservation,
  rectSignature,
  runClick,
  runFlow,
  selectTarget,
  solveTransform,
  spawnAsync,
  tagForLabel,
  targetCentre,
  toNativePoint,
};

const isEntryPoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isEntryPoint) {
  process.exitCode = await main();
}

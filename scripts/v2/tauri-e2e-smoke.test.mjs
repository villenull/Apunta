#!/usr/bin/env node
/**
 * P3.6's AppImage integration harness (C-ISO@1, run in `env` mode).
 *
 *   node scripts/v2/tauri-e2e-smoke.test.mjs smoke
 *
 * One mode, `smoke`; any other argument exits 2. It launches the **real**
 * test-identity AppImage V0 built and the **real** bundled server, drives the
 * eleven named flows through the app's own native UI, saves a screenshot per
 * flow, asserts the Content-Security-Policy the running server sends, and
 * stops the child **by pid** on every path. There is no stub, no fake bridge
 * line and no observation hook: the unflagged web build carries none, so every
 * click target is grounded in a screenshot this harness takes itself and every
 * fact is read back over the app's own origin.
 *
 * The eleven flows, in order: onboarding, capture (fixture), draft, refine,
 * publish and copy, patient list, plan, briefing, brainstorm, settings, backup.
 *
 * **How a click target is grounded without the observation hook.** P3.4's hook
 * publishes client rectangles; the unflagged bundle has no such hook, and this
 * card neither adds one nor borrows the page pointer from a bundle that never
 * had one. So the harness reads the screen instead:
 *
 * 1. It captures the window and the whole display.
 * 2. It **measures** the frame-to-client relationship by cropping the display
 *    capture at the window's geometry and comparing it, pixel for pixel, with
 *    the window capture. Identical means the client origin sits at the window
 *    origin (no titlebar translation). A difference is not worked around with
 *    a guessed decoration offset: it stops the run.
 * 3. It locates a primary button by colour: a mask of the brand accent (the
 *    colour every primary action carries) is reduced to a coarse grid and read
 *    back as text, and connected cells become clickable clusters with real
 *    bounding boxes. A click is issued only inside a measured cluster.
 *
 * Neither `GDK_SCALE=1` nor a decoration offset is *assumed* to prove
 * coordinates: the scale is read off the app's own geometry line and required
 * to be 1, and the frame-to-client map is solved from two measured captures.
 * Controls that carry no colour (list rows, text buttons, option tiles) are
 * driven by the app's own keyboard — Tab, Return, Escape, typing — which needs
 * no coordinates at all; each such action is still verified by the fact it
 * produces, never assumed.
 *
 * **Facts, not pixels.** A screenshot is evidence and never the assertion. Each
 * flow drives a **real UI action** and then reads **two** things that only exist
 * once that action landed: a **pane-only label** read out of the screen by
 * offline OCR (`tesseract`, already installed, no network, no page injection),
 * and the **resulting application fact** over the loopback origin the shell is
 * confined to. An API read that is true before the action (a list that already
 * has a row, a `{ plan: null }` envelope, an always-200 `GET`) proves nothing
 * about the screen and is never the assertion: every flow's fact must be
 * produced by the action it drives. The Copied control's feedback is on-screen
 * state only — the harness asserts the control's own label changed to
 * `Copied` and claims nothing about the host clipboard.
 *
 * **Grounding is fail-closed.** Every click is issued at a measured coordinate:
 * either the centre of a uniquely identified accent cluster, or the centre of a
 * label phrase that OCR found **exactly once** on the screen. Zero matches or
 * more than one match is not a guess — the flow records `NOT RUN` with the
 * count it saw.
 *
 * **Containment, all five asserted, none weakened to pass:** no process from
 * the run remains; the data folder is still owned by **this run** — the four
 * C-OWN@1 files (`apunta.lock`, `apunta.db`, `-wal`, `-shm`) are still the very
 * files the first instance created, compared by device+inode, and `apunta.lock`
 * names this run's own server pid and nonce at the baseline **and** at the end
 * of the flows, because a second server cannot introduce a *new filename* into
 * this folder and a name set would therefore be green whatever happened (the
 * backup flow's own `backups/` directory is the run's output, not a second
 * owner, and is reported rather than failed on);
 * 7879 is free afterwards; the observation channel is gone when the row ends
 * (zero occurrences of P3.4's marker path and gate string in the shipped
 * bundle); and `ollama` is still running, read from outside the run.
 *
 * `-wal` and `-shm` are recorded by identity but **not** asserted on it:
 * SQLite creates and deletes both around a checkpoint and on close, so a new
 * inode there is the database working, not a second owner. The lock's release on
 * a clean shutdown is likewise not a failure; a *different* file at that name is.
 *
 * **The microphone.** The capture flow reuses P3.5's approved mechanism: a
 * fabricated recording is played into a virtual sink whose remap source is made
 * the default capture device, and the owner's physical microphone is never read.
 * The teardown restores the remembered default and unloads both modules on
 * every exit path, **including signals**: `SIGINT`, `SIGTERM` and `SIGHUP` are
 * trapped and `exit` is trapped, each running the synchronous teardown, and the
 * teardown is installed before the first module is loaded. While the app
 * records, the harness resolves `pactl list short source-outputs` through the
 * source table (P3.5's mechanism, including its `-` client column) and asserts
 * no stream is attached to the owner's real microphone; an unresolvable row is
 * a stop, not "not the microphone".
 *
 * No `pkill`, ever (C-ISO@1 rule 7): every process this file stops is one it
 * started, by pid.
 */

import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The brand accent every primary action carries (`tokens.css`). */
const ACCENT = '#2a9d8f';

/** The two names the virtual-audio containment owns (P3.5's, reused). */
const SINK_NAME = 'apunta_p35';
const SOURCE_NAME = 'apunta_p35_mic';

/** P3.4's marker path and gate string. Zero occurrences is the containment. */
const P34_MARKER_PATH = '/api/p3.4-observe';
const P34_GATE_STRING = 'p3.4-observe';

/** The window title the shell gives the app window (P3.3's read). */
const APP_WINDOW_NAME = 'Apunta';

/**
 * The eleven flows, in the card's order. Every one is recorded in the summary
 * on every path, including a path that returns before reaching it: a flow with
 * no recorded outcome is `NOT RUN`, never a pass.
 */
const FLOWS = [
  'onboarding',
  'capture',
  'draft',
  'refine',
  'publish+copy',
  'patient list',
  'plan',
  'briefing',
  'brainstorm',
  'settings',
  'backup',
];

/**
 * Rule B's set, restated from the dispatch's Fixed decision, and the base commit
 * copied out of the dispatch header **by hand** (step S1): the header's
 * `- Base commit:` line, never a token in the card's prose. The separator is
 * three ASCII full stops.
 *
 * **Recorded, reported, and no longer the thing the history arm compares
 * against.** The base is where the dispatch was cut; the artefact under test was
 * built later, so a Rule B input committed between the two says the *dispatch*
 * moved, not that the *bundle* is stale. Comparing against the base failed the
 * row on a bundle V0 had built from the very tree the row was testing
 * (`docs/v2/state/returns/P3.6-attempt6-runtime.md` §3: 49 inputs differ from
 * `62abb28`, none of them in the artefact). The arm now compares against
 * `resolveBuildCommit`'s answer — the commit the AppImage was built **from** —
 * and this constant is carried so the row can name what it did *not* compare
 * against. It is never a fallback: a fallback to it would pass vacuously, which
 * is the failure class Rule B exists to catch.
 */
const RULE_B_BASE = '62abb28';
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
/** Rule B's exclusions: build outputs and generated sources are never inputs. */
const RULE_B_EXCLUDED = ['src-tauri/target/', 'src-tauri/gen/'];

/** The prototype's sample person (HS-8). Created through the API, in the sandbox. */
const PATIENT_NAME = 'John Smith';

const results = [];
const flowOutcomes = new Map();
const blockedResults = [];

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

/** A named precondition this machine does not meet. Never a pass, never silent. */
function blocked(name, detail) {
  blockedResults.push({ name, detail });
  results.push({ name, ok: false, blocked: true });
  process.stdout.write(`BLOCKED ${name}: ${detail}\n`);
  process.exitCode = 3;
}

/** A flow that could not run, with its cause. Never a PASS. */
function notRun(name, reason) {
  results.push({ name, ok: true, notRun: true });
  process.stdout.write(`NOT RUN ${name}: ${reason}\n`);
}

/**
 * The recorded outcome of one of the eleven named flows.
 *
 * `PASS` is only reachable through `requireFlow`, which is called with the
 * outcome of a real action plus the two facts that prove the screen was
 * reached. Everything else is `FAIL` or `NOT RUN`.
 */
function recordFlow(flow, outcome, detail) {
  flowOutcomes.set(flow, { outcome, detail });
}

function requireFlow(flow, what, condition, detail) {
  if (condition) {
    recordFlow(flow, 'PASS', what);
    pass(`${flow} ${what}`, detail);
    return true;
  }
  recordFlow(flow, 'FAIL', what);
  fail(`${flow} ${what}`, detail);
  return false;
}

/** Marks the remaining flows `NOT RUN` with one cause, on an early abort. */
function notRunRemaining(flow, reason) {
  for (const name of FLOWS) {
    if (flowOutcomes.has(name)) continue;
    recordFlow(name, 'NOT RUN', reason);
    notRun(name, reason);
  }
}

// ------------------------------------------------------------- preconditions

/**
 * The sandbox environment `sandbox.mjs env` exported, read lazily.
 *
 * Read lazily and not at import time so importing this module for a helper probe
 * neither exits the process nor reads the environment as a side effect.
 */
function sandboxEnv() {
  const port = Number(process.env['APUNTA_PORT']);
  const dataDir = process.env['APUNTA_DATA_DIR'];
  const runId = process.env['APUNTA_TEST_RUN_ID'];
  if (!Number.isInteger(port) || !dataDir || !runId) {
    throw new Error(
      'source the sandbox environment first: node scripts/v2/sandbox.mjs env --port 78xx > /tmp/apunta-v2-….env && . /tmp/apunta-v2-….env ' +
        '(APUNTA_DATA_DIR, APUNTA_PORT and APUNTA_TEST_RUN_ID are all required)',
    );
  }
  return { port, dataDir, runId };
}

/** The port the sandbox assigned. Never substituted. */
function sandboxPort() {
  return sandboxEnv().port;
}

/**
 * The preconditions, checked in `main` and reported as named blocks.
 *
 * Each missing thing is named — the tool, the variable, the flag — so a machine
 * that cannot run this row says which tool it lacks instead of failing later
 * with a generic image-read failure.
 */
function preconditions() {
  let env;
  try {
    env = sandboxEnv();
  } catch (error) {
    process.stderr.write(`tauri-e2e-smoke: ${String(error.message ?? error)}\n`);
    return false;
  }
  if (env.port === 7717) {
    process.stderr.write('tauri-e2e-smoke: APUNTA_PORT is 7717, the live instance (HS-1). Refusing.\n');
    return false;
  }
  // The whole app must be the fake-AI app (CLAUDE.md rule 3): the flows are
  // reproducible with zero AI tooling installed, and the draft/refine steps are
  // the fake provider's, not a real model's.
  if (process.env['APUNTA_FAKE_AI'] !== '1') {
    process.stderr.write(
      'tauri-e2e-smoke: APUNTA_FAKE_AI=1 is required so the flows run against the fake provider\n',
    );
    return false;
  }
  return true;
}

/**
 * Every binary this file shells out to, named.
 *
 * `xdotool` drives the UI, `import`/`identify`/`convert`/`compare` read the
 * captures, `tesseract` reads the labels off them offline, `pactl` owns the
 * virtual-audio containment and `paplay` plays the fixture into the virtual
 * sink only. A missing one is a named `BLOCKED`, never a generic failure later.
 */
const REQUIRED_TOOLS = [
  'xdotool',
  'import',
  'identify',
  'convert',
  'compare',
  'tesseract',
  'pactl',
  'paplay',
];

function preflightTools() {
  let allPresent = true;
  for (const tool of REQUIRED_TOOLS) {
    if (firstOnPath([tool]) !== undefined) continue;
    blocked(`tool ${tool} is absent on this machine`, 'named preflight: install it or V3 is NOT RUN');
    allPresent = false;
  }
  return allPresent;
}

/** `<sandbox>` for every run-folder path, so committed evidence carries no
 * host paths (RUN-CONFIG §4). */
function sanitise(value) {
  return String(value)
    .replace(/\/tmp\/apunta-v2\/[^/\s'"]+/g, '<sandbox>')
    .replaceAll(repoRoot, '<repo>');
}

function sleep(ms) {
  return new Promise((done) => setTimeout(done, ms));
}

function spawnAsync(command, args, options = {}) {
  const { killAfterMs, ...spawnOptions } = options;
  return new Promise((done) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...spawnOptions });
    let timer = null;
    if (typeof killAfterMs === 'number') {
      timer = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          // Already gone.
        }
      }, killAfterMs);
    }
    const settle = (result) => {
      if (timer !== null) clearTimeout(timer);
      done(result);
    };
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => settle({ stdout, stderr, code: null, error: String(error) }));
    child.on('close', (code) => settle({ stdout, stderr, code }));
  });
}

function pidAlive(pid) {
  if (pid === undefined || pid === null) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

/** Stops one pid this harness started, by pid. Never `pkill` (C-ISO@1 rule 7). */
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

async function isPortFree(portNumber) {
  return new Promise((done) => {
    const probe = createServer();
    probe.once('error', () => done(false));
    probe.listen(portNumber, '127.0.0.1', () => probe.close(() => done(true)));
  });
}

/** The first of these that is on `PATH`, or `undefined`. */
function firstOnPath(names) {
  const dirs = (process.env['PATH'] ?? '').split(':').filter((entry) => entry !== '');
  for (const name of names) {
    for (const dir of dirs) {
      if (existsSync(join(dir, name))) return name;
    }
  }
  return undefined;
}

// -------------------------------------------------------------- the app ----

/**
 * The test-identity AppImage, resolved **once**, over its own pattern.
 *
 * `'Apunta (test)_'*.AppImage` and never the bare `*.AppImage`: the production
 * image V1 builds later must be neither launched in this harness's place nor
 * counted as a second match. Zero or more than one match fails with the
 * directory listing, so a stale sibling is visible rather than launched.
 */
function resolveAppImage() {
  const dir = join(repoRoot, 'src-tauri', 'target', 'release', 'bundle', 'appimage');
  if (!existsSync(dir)) return { error: `no bundle directory at ${sanitise(dir)}` };
  const listing = readdirSync(dir);
  const found = listing.filter((name) => name.startsWith('Apunta (test)_') && name.endsWith('.AppImage'));
  if (found.length === 0) {
    return {
      error: `no 'Apunta (test)_'*.AppImage in ${sanitise(dir)} (directory holds: ${listing.join(', ') || 'nothing'})`,
    };
  }
  if (found.length > 1) {
    return {
      error: `${String(found.length)} test-identity AppImages in ${sanitise(dir)}: ${found.join(', ')}`,
    };
  }
  return { path: join(dir, found[0]), listing };
}

/**
 * The display, chosen at run time and printed rather than left to the reader.
 *
 * **An inherited `DISPLAY` is honoured.** V3's command already wraps this
 * harness in `xvfb-run -a` when the binary is present, and that display is the
 * one the card chose: re-wrapping it would discard it and start a second
 * headless server for no reason. So the harness only supplies a display when it
 * has none — `xvfb-run -a` when that binary is installed, the desktop session
 * otherwise — and the app and every `xdotool` probe share whichever it ends up
 * on.
 */
function ensureDisplay() {
  const inherited = process.env['DISPLAY'];
  if (inherited !== undefined && inherited !== '') {
    process.stdout.write(`  display: the inherited X display ${inherited}\n`);
    return null;
  }
  if (process.env['APUNTA_V2_SMOKE_HARNESS_XVFB'] === '1') {
    process.stdout.write('  display: the xvfb-run this harness started\n');
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
    {
      cwd: process.cwd(),
      env: { ...process.env, APUNTA_V2_SMOKE_HARNESS_XVFB: '1' },
      stdio: 'inherit',
    },
  );
  return reexec;
}

/**
 * The AppImage, under the display prefix, with the private headless shell env.
 *
 * `APUNTA_DATA_DIR`, `APUNTA_PORT`, `APUNTA_NO_OPEN` and `APUNTA_TEST_RUN_ID`
 * are inherited from the harness, which inherited them from `sandbox.mjs env`.
 * `GDK_SCALE=1` and `GDK_DPI_SCALE=1` make the sandbox display 1:1 so a client
 * rectangle is a physical pixel offset; `GDK_BACKEND=x11` and an unset
 * `WAYLAND_DISPLAY` keep the app on the X display this harness reads. None of
 * these mask a measurement: the scale is still read off the app's own line and
 * required to be 1, and the frame-to-client map is still solved from captures.
 */
function launchApp(appImage) {
  const child = spawn(appImage, [], {
    cwd: '/',
    env: {
      ...process.env,
      WAYLAND_DISPLAY: '',
      GDK_SCALE: '1',
      GDK_DPI_SCALE: '1',
      XDG_CACHE_HOME: join(sandboxEnv().dataDir, '..', 'cache'),
      XDG_CONFIG_HOME: join(sandboxEnv().dataDir, '..', 'config'),
      XDG_DATA_HOME: join(sandboxEnv().dataDir, '..', 'xdg'),
      HOME: join(sandboxEnv().dataDir, '..', 'home'),
      XDG_BACKEND: 'x11',
      GDK_BACKEND: 'x11',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const output = { stdout: '', stderr: '' };
  child.stdout.on('data', (chunk) => {
    output.stdout += chunk.toString('utf8');
  });
  child.stderr.on('data', (chunk) => {
    output.stderr += chunk.toString('utf8');
  });
  return { child, output };
}

// -------------------------------------------------------------- windows ----

function windowList() {
  return new Promise((done) => {
    const probe = spawn('xdotool', ['search', '--name', '.*'], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    probe.stdout.on('data', (chunk) => {
      out += chunk.toString('utf8');
    });
    probe.on('error', () => done(null));
    probe.on('close', () => {
      done(
        out
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => /^[0-9]+$/.test(line)),
      );
    });
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
  return {
    id,
    name: name.stdout.trim(),
    x: Number(fields['X']),
    y: Number(fields['Y']),
    width,
    height,
    pid: Number.isInteger(pid) ? pid : 0,
  };
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

async function displayGeometry() {
  const read = await spawnAsync('xdotool', ['getdisplaygeometry']);
  const match = /^(\d+)\s+(\d+)$/.exec(read.stdout.trim());
  if (match === null) return null;
  return { width: Number(match[1]), height: Number(match[2]) };
}

/**
 * The app's own visible window whose title is exactly `Apunta`.
 *
 * An exact name (the shell has a hidden 20x20 GTK helper window whose name
 * differs only by case), this run's shell as the owning pid, a non-trivial
 * size, and inside the display. Zero windows on the display is a `NOT RUN`, not
 * a pass.
 */
async function findAppWindow(pid, timeoutMs, what) {
  const deadline = Date.now() + timeoutMs;
  let seen = [];
  let display = null;
  for (;;) {
    const windows = await windowListDetailed();
    if (windows !== null) {
      seen = windows.map(
        (w) =>
          `${w.name} ${String(w.width)}x${String(w.height)}@${String(w.x)},${String(w.y)} pid=${String(w.pid)}`,
      );
      display ??= await displayGeometry();
      const hit = windows.find(
        (w) => w.name === APP_WINDOW_NAME && w.pid === pid && w.width >= 400 && w.height >= 300,
      );
      if (hit !== undefined && display !== null) {
        const inside =
          hit.x >= 0 &&
          hit.y >= 0 &&
          hit.x + hit.width <= display.width &&
          hit.y + hit.height <= display.height;
        if (inside) return { found: hit, display, windows };
      }
    }
    if (Date.now() >= deadline) {
      return {
        found: null,
        display,
        windows,
        seen,
        waitedFor: what,
        offscreen:
          windows !== null && display !== null ? windows.filter((w) => w.name === APP_WINDOW_NAME) : [],
      };
    }
    await sleep(250);
  }
}

// ------------------------------------------------------------- captures ----

/** Scratch for captures, under the repository's git-ignored `build/`. */
function scratchDir() {
  const dir = join(repoRoot, 'build', 'p36-smoke-harness');
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Where per-flow evidence screenshots are written. */
function evidenceDir() {
  const dir = join(repoRoot, 'docs', 'v2', 'evidence', 'P3.6');
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function captureRoot() {
  const file = join(scratchDir(), 'root.png');
  await spawnAsync('import', ['-display', process.env['DISPLAY'] ?? '', '-window', 'root', '-silent', file]);
  return existsSync(file) ? file : null;
}

async function captureWindow(windowId) {
  const file = join(scratchDir(), `window-${String(windowId)}.png`);
  await spawnAsync('import', [
    '-display',
    process.env['DISPLAY'] ?? '',
    '-window',
    String(windowId),
    '-silent',
    file,
  ]);
  return existsSync(file) ? file : null;
}

async function imageSize(file) {
  const read = await spawnAsync('identify', ['-format', '%w %h', file]);
  const match = /^(\d+)\s+(\d+)$/.exec(read.stdout.trim());
  if (match === null) return null;
  return { width: Number(match[1]), height: Number(match[2]) };
}

// A raw colour count is deliberately absent: "the screenshot holds N distinct
// colours" is true of any rendered window, so it was never able to tell a
// reached screen from an unreached one. Every visual assertion in this file is
// a specific label or a control's own changed state, read by `tesseract`.

/**
 * The metric `compare` printed, as a number, or `null`.
 *
 * `compare` writes the metric to **stderr** and the form depends on the
 * version, which is why this parses instead of calling `Number` on the whole
 * string. Verified against the tool installed on this machine
 * (ImageMagick 7.1.2-31 Q16-HDRI, `/usr/bin/compare`) and against the
 * documentation shipped beside it (`/usr/share/doc/ImageMagick-7/www/compare/`):
 *
 * - **IM6** printed the metric alone — `1234`.
 * - **IM7** prints the metric and the normalized metric in parentheses beside
 *   it, which is what `docs/v2/state/returns/P3.6-attempt6-runtime.md` observed
 *   on this machine: `0 (0)` for a perfect match, and `2.66667 (0.0416667)` for
 *   four differing pixels of an 8x8 pair. The shipped page shows the same shape
 *   for every metric (`28.0142 (0.233452)`), so this is the tool's printed form
 *   rather than one image's accident.
 * - The first number is printed with `%g` semantics and **may be in scientific
 *   notation**, so both forms are accepted.
 *
 * Two consequences worth stating, because both are load-bearing:
 *
 * - **The metric is not required to be an integer.** IM7's `AE` is a floating
 *   measurement (`0.666667` for a single differing pixel here), so requiring an
 *   integer rejected a real comparison; only finiteness and a non-negative
 *   value are required.
 * - **Anything else is `null`, never a guess.** An empty stderr, a warning line
 *   that is not the metric, a truncated value and outright garbage all fail
 *   closed, and the caller returns `null` — which stops the run rather than
 *   grounding a click on an unmeasured frame. Only the **last** non-empty line
 *   is read, because that is where the tool puts the metric; any preceding line
 *   is a diagnostic and cannot turn a parseable metric into an unparseable one.
 */
function parseCompareMetric(text) {
  const lines = String(text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  if (lines.length === 0) return null;
  const number = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?';
  const match = new RegExp(`^(${number})(?:\\s+\\((${number})\\))?$`).exec(lines[lines.length - 1]);
  if (match === null) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value < 0) return null;
  if (match[2] !== undefined && !Number.isFinite(Number(match[2]))) return null;
  return value;
}

/**
 * The frame-to-client relationship, **measured**, never assumed.
 *
 * The window capture and the display capture are two photographs of the same
 * pixels. Cropping the display capture at the window's geometry and comparing
 * it with the window capture answers where the client origin sits: identical
 * means the client origin is the window origin (no titlebar translation, which
 * is the case under `xvfb-run` with no window manager). Any difference is not
 * worked around with a guessed decoration offset — the run stops instead.
 *
 * Returns the measured offset `{ dx, dy }` (`{ 0, 0 }` when the two captures
 * agree), or `null` when the relationship could not be established.
 */
async function measureFrameClient(windowShot, rootShot, window) {
  const size = await imageSize(windowShot);
  if (size === null) return null;
  const crop = join(scratchDir(), 'root-crop.png');
  const cropped = await spawnAsync('convert', [
    rootShot,
    '-crop',
    `${String(size.width)}x${String(size.height)}+${String(window.x)}+${String(window.y)}`,
    '+repage',
    crop,
  ]);
  if (cropped.code !== 0 || !existsSync(crop)) return null;
  // Absolute error: how far the two captures differ. 0 means identical. The
  // parsed form is `parseCompareMetric`'s, and its `null` is what stops the run:
  // an unparsed metric is an unmeasured frame, never an assumed zero.
  const compared = await spawnAsync('compare', ['-metric', 'AE', crop, windowShot, 'null:']);
  const differing = parseCompareMetric(compared.stderr);
  if (differing === null) return null;
  if (differing !== 0) return { dx: null, dy: null, differing, size };
  return { dx: 0, dy: 0, differing: 0, size };
}

/**
 * The window geometry the **app** reports for itself, read from the shell's own
 * stderr line, and the scale it used. Required to be 1.
 */
async function appGeometry(output, what) {
  const deadline = Date.now() + 60_000;
  for (;;) {
    const match =
      /the main window will be (\d+)x(\d+) physical at ([\d.]+),([\d.]+) logical, on a (\d+)x(\d+) display at scale ([\d.]+)/.exec(
        output.stderr,
      );
    if (match !== null) {
      return {
        physicalWidth: Number(match[1]),
        physicalHeight: Number(match[2]),
        logicalX: Number(match[3]),
        logicalY: Number(match[4]),
        displayWidth: Number(match[5]),
        displayHeight: Number(match[6]),
        scale: Number(match[7]),
      };
    }
    if (Date.now() >= deadline) {
      fail(`${what} the app's own window geometry`, 'the shell never printed its window geometry line');
      return null;
    }
    await sleep(250);
  }
}

/** The server pid the shell printed, for the pid-scoped stop. */
function serverPidFromStderr(output) {
  const match = /apunta: spawned the bundled server as pid (\d+)/.exec(output.stderr);
  if (match === null) return null;
  return Number(match[1]);
}

// ---------------------------------------------------- colour-click ground ----

/**
 * The clickable clusters of one colour in a screenshot, as real bounding boxes.
 *
 * A mask is built (`-fuzz N%` around the target colour becomes white, everything
 * else black), reduced to a coarse grid with `-filter point` (one input pixel
 * per output cell, no interpolation), and read back as text. Connected white
 * cells are components; each component's bounding box, mapped back to full
 * resolution, is a clickable cluster. A click is issued only inside a measured
 * cluster, so the target is grounded in the screen rather than assumed.
 */
async function findClusters(screenshot, hex, { fuzz = 12, grid = 160 } = {}) {
  const size = await imageSize(screenshot);
  if (size === null) return [];
  const mask = join(scratchDir(), 'mask.png');
  const masked = await spawnAsync('convert', [
    screenshot,
    '-fuzz',
    `${String(fuzz)}%`,
    '-fill',
    'white',
    '+opaque',
    hex,
    '-fill',
    'black',
    '-opaque',
    hex,
    mask,
  ]);
  if (masked.code !== 0 || !existsSync(mask)) return [];
  const cells = await spawnAsync('convert', [
    mask,
    '-filter',
    'point',
    '-resize',
    `${String(grid)}x${String(grid)}!`,
    '-depth',
    '8',
    'txt:-',
  ]);
  if (cells.code !== 0) return [];
  const gridCells = [];
  for (const line of cells.stdout.split('\n')) {
    const match = /^(\d+),(\d+):\s*\((\d+),\d+,\d+\)/.exec(line.trim());
    if (match === null) continue;
    gridCells.push({ gx: Number(match[1]), gy: Number(match[2]), on: Number(match[3]) > 127 });
  }
  const seen = new Set();
  const clusters = [];
  const at = (gx, gy) => gridCells.find((c) => c.gx === gx && c.gy === gy);
  for (const cell of gridCells) {
    if (!cell.on || seen.has(`${String(cell.gx)},${String(cell.gy)}`)) continue;
    const stack = [[cell.gx, cell.gy]];
    const component = [];
    while (stack.length > 0) {
      const [gx, gy] = stack.pop();
      const key = `${String(gx)},${String(gy)}`;
      if (seen.has(key)) continue;
      const here = at(gx, gy);
      if (here === undefined || !here.on) continue;
      seen.add(key);
      component.push([gx, gy]);
      stack.push([gx + 1, gy], [gx - 1, gy], [gx, gy + 1], [gx, gy - 1]);
    }
    if (component.length === 0) continue;
    const minX = Math.min(...component.map(([gx]) => gx));
    const maxX = Math.max(...component.map(([gx]) => gx));
    const minY = Math.min(...component.map(([, gy]) => gy));
    const maxY = Math.max(...component.map(([, gy]) => gy));
    const cellW = size.width / grid;
    const cellH = size.height / grid;
    clusters.push({
      x: Math.round(minX * cellW),
      y: Math.round(minY * cellH),
      w: Math.round((maxX - minX + 1) * cellW),
      h: Math.round((maxY - minY + 1) * cellH),
      cells: component.length,
    });
  }
  clusters.sort((a, b) => b.cells - a.cells);
  return clusters;
}

/**
 * The clickable clusters of one colour, largest first — and which of them may
 * be clicked at all.
 *
 * A screen with two accent buttons of the same size has no "largest" one that is
 * *the* target, so `pickPrimaryCluster` refuses: the top cluster must beat the
 * runner-up by a real margin, or the answer is `null` and the caller records
 * `NOT RUN`. Clicking the biggest accent on a screen that happens to have two
 * is how a flow records a pass for the wrong control.
 */
const CLUSTER_MARGIN = 2;

function pickPrimaryCluster(clusters, what) {
  if (clusters.length === 0) return { cluster: null, why: 'no accent cluster was found in the screenshot' };
  const [top, second] = clusters;
  if (second !== undefined && top.cells < CLUSTER_MARGIN * second.cells) {
    return {
      cluster: null,
      why:
        `the screenshot holds ${String(clusters.length)} accent clusters and the largest (${String(top.cells)} cells) ` +
        `is under ${String(CLUSTER_MARGIN)}x the runner-up (${String(second.cells)} cells), so ${what} is ambiguous ` +
        'and no cluster is clicked',
    };
  }
  return { cluster: top, why: `the largest accent cluster (${String(top.cells)} cells) is unambiguous` };
}

/**
 * The words on a screenshot, read **offline** by `tesseract`.
 *
 * Nothing is injected into the page and nothing is fetched: this is OCR over a
 * PNG the harness itself captured, which is how a pane-only label is located
 * and asserted without an observation hook the unflagged build does not carry.
 * Each word keeps its own rectangle, so a located label becomes a real measured
 * coordinate rather than a guess.
 */
async function screenWords(file) {
  const read = await spawnAsync('tesseract', [file, 'stdout', 'tsv'], { killAfterMs: 60_000 });
  if (read.code !== 0) return null;
  const words = [];
  for (const line of read.stdout.split('\n')) {
    const columns = line.split('\t');
    if (columns.length < 12) continue;
    const level = Number(columns[0]);
    if (level !== 5) continue;
    const left = Number(columns[6]);
    const top = Number(columns[7]);
    const width = Number(columns[8]);
    const height = Number(columns[9]);
    const confidence = Number(columns[10]);
    const text = (columns[11] ?? '').trim();
    if (text === '') continue;
    if (![left, top, width, height, confidence].every((value) => Number.isInteger(value))) continue;
    words.push({
      text,
      left,
      top,
      width,
      height,
      confidence,
      line: Number(columns[4]),
      order: Number(columns[5]),
    });
  }
  if (words.length === 0) return null;
  return words;
}

/**
 * Trailing punctuation off one token, however much of it there is.
 *
 * The app's own strings end in dots, and OCR hands them back as it reads them:
 * `Ask a question or give feedback...` (`refine.inputPlaceholder`,
 * `shared/src/i18n/en.ts:1058`) comes back as `feedback...`, and
 * `Listening for words…` (`capture.listening`, `shared/src/i18n/en.ts:1010`,
 * U+2026) comes back as `words…`, `words...` or `words.`. Stripping a **run** of
 * `.`, `,` and U+2026 from both sides of the comparison is what makes the quoted
 * string match whichever of those OCR actually produced — and it strips the
 * quoted phrase's own dots identically, so the label stays quoted in full.
 */
function stripTrailingPunctuation(text) {
  return text.replace(/[.,\u2026]+$/u, '');
}

/**
 * Every place `phrase` appears in the word list, as one box per occurrence.
 *
 * Words are compared case-insensitively and in reading order, and a match must
 * cover the whole phrase. Two matches for the same phrase is **not** a choice
 * this file gets to make: the caller fails closed on it.
 */
function findPhraseBoxes(words, phrase) {
  const wanted = phrase
    .toLowerCase()
    .split(/\s+/)
    .filter((part) => part !== '')
    .map((part) => stripTrailingPunctuation(part));
  const found = [];
  for (let start = 0; start + wanted.length <= words.length; start += 1) {
    const slice = words.slice(start, start + wanted.length);
    const sameLine = slice.every((word) => word.line === slice[0].line);
    if (!sameLine) continue;
    const ordered = slice.every((word, index) => index === 0 || word.order === slice[index - 1].order + 1);
    if (!ordered) continue;
    if (!slice.every((word, index) => stripTrailingPunctuation(word.text.toLowerCase()) === wanted[index]))
      continue;
    const left = Math.min(...slice.map((word) => word.left));
    const top = Math.min(...slice.map((word) => word.top));
    const right = Math.max(...slice.map((word) => word.left + word.width));
    const bottom = Math.max(...slice.map((word) => word.top + word.height));
    found.push({ phrase, x: left, y: top, w: right - left, h: bottom - top });
  }
  return found;
}

/**
 * The one place `phrase` is on screen, or `null` with the reason.
 *
 * Zero matches and two matches are both refused: a control is clicked only where
 * its label identifies it uniquely, and a pane is confirmed only where its
 * pane-only label identifies it uniquely.
 */
function groundPhrase(words, phrase) {
  const boxes = findPhraseBoxes(words, phrase);
  if (boxes.length === 0)
    return { box: null, why: `the label ${JSON.stringify(phrase)} is not on the screen` };
  if (boxes.length > 1) {
    return {
      box: null,
      why:
        `the label ${JSON.stringify(phrase)} appears ${String(boxes.length)} times on the screen, so its target is ` +
        'ambiguous and nothing is clicked at it',
    };
  }
  return { box: boxes[0], why: `the label ${JSON.stringify(phrase)} appears exactly once` };
}

/**
 * Waits for a pane-only label to appear on a fresh capture of the window.
 *
 * Every wait re-captures and re-reads the screen, so what it returns is what
 * the app is showing now, not a picture taken earlier.
 */
async function waitForScreenLabel(window, phrase, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastWhy = 'the window capture failed';
  for (;;) {
    const shot = await captureWindow(window.id);
    if (shot !== null) {
      const words = await screenWords(shot);
      if (words === null) {
        lastWhy = `tesseract read no words out of ${JSON.stringify(phrase === '' ? '' : phrase)}'s capture`;
      } else {
        const grounded = groundPhrase(words, phrase);
        if (grounded.box !== null) return { seen: true, shot, box: grounded.box, words };
        lastWhy = grounded.why;
      }
    }
    if (Date.now() >= deadline) return { seen: false, shot, box: null, words: null, why: lastWhy };
    await sleep(400);
  }
}

/**
 * Clicks a label whose box was already grounded, at the box's own measured
 * centre. A box that does not lie inside the window is refused rather than
 * clicked at a clamped point.
 */
async function clickGroundedBox(window, offset, box, what) {
  const inside = box.x >= 0 && box.y >= 0 && box.x + box.w <= window.width && box.y + box.h <= window.height;
  if (!inside) {
    return {
      clicked: false,
      why: `the measured label box ${JSON.stringify(box)} does not lie inside the ${String(window.width)}x${String(window.height)} window`,
    };
  }
  const cx = window.x + offset.dx + Math.round(box.x + box.w / 2);
  const cy = window.y + offset.dy + Math.round(box.y + box.h / 2);
  const clicked = await clickNative(cx, cy, what);
  return { clicked, why: clicked ? `${what} was clicked at its measured label centre` : 'the click failed' };
}

/**
 * Clicks the control whose label appears exactly once on screen, at the label's
 * own measured centre. A refused grounding is the caller's `NOT RUN`.
 */
async function clickScreenLabel(window, offset, phrase, what) {
  const shot = await captureWindow(window.id);
  if (shot === null) return { clicked: false, why: 'the window capture failed' };
  const words = await screenWords(shot);
  if (words === null) return { clicked: false, why: 'tesseract read no words out of the window capture' };
  const grounded = groundPhrase(words, phrase);
  if (grounded.box === null) return { clicked: false, why: grounded.why };
  const result = await clickGroundedBox(window, offset, grounded.box, what);
  return { clicked: result.clicked, why: grounded.why };
}

/**
 * A real pointer click at a native-coordinate point, focused first.
 *
 * `xdotool click` is an XTEST event delivered to the focused window, and
 * `xvfb-run` has no window manager to give one, so the window is focused
 * explicitly and the pointer is moved to absolute native coordinates first.
 */
async function clickNative(nativeX, nativeY, what) {
  const focused = await spawnAsync('xdotool', ['windowfocus', '--sync', APP_WINDOW_NAME]);
  if (focused.code !== 0) {
    fail(`click ${what}`, `xdotool windowfocus exited ${String(focused.code)}: ${focused.stderr.trim()}`);
    return false;
  }
  const moved = await spawnAsync('xdotool', ['mousemove', '--sync', String(nativeX), String(nativeY)]);
  if (moved.code !== 0) {
    fail(`click ${what}`, `xdotool mousemove exited ${String(moved.code)}: ${moved.stderr.trim()}`);
    return false;
  }
  const clicked = await spawnAsync('xdotool', ['click', '--clearmodifiers', '1']);
  return check(
    `click ${what}`,
    clicked.code === 0,
    `xdotool click exited ${String(clicked.code)}: ${clicked.stderr.trim()}`,
  );
}

/**
 * Click the centre of a measured colour cluster.
 *
 * The cluster is in window-client coordinates; the measured frame-to-client
 * offset turns it into a native point. A cluster that is not inside the window
 * is refused — no guessed translation is applied.
 */
async function clickCluster(window, offset, cluster, what) {
  const inside =
    cluster.x >= 0 &&
    cluster.y >= 0 &&
    cluster.x + cluster.w <= window.width &&
    cluster.y + cluster.h <= window.height;
  if (
    !check(
      `click ${what} (cluster inside the window)`,
      inside,
      `the measured cluster ${JSON.stringify(cluster)} does not lie inside the ${String(window.width)}x${String(window.height)} window`,
    )
  ) {
    return false;
  }
  const cx = window.x + offset.dx + Math.round(cluster.x + cluster.w / 2);
  const cy = window.y + offset.dy + Math.round(cluster.y + cluster.h / 2);
  return await clickNative(cx, cy, what);
}

/** A real XTEST key press, the app's own way to leave a modal or move focus. */
async function pressKey(keys, what) {
  const focused = await spawnAsync('xdotool', ['windowfocus', '--sync', APP_WINDOW_NAME]);
  const pressed = await spawnAsync('xdotool', ['key', '--clearmodifiers', ...keys]);
  return check(
    `press ${what}`,
    focused.code === 0 && pressed.code === 0,
    `xdotool exited ${String(pressed.code)}: ${pressed.stderr.trim()}`,
  );
}

/** Type text into the focused control, the app's own keyboard path. */
async function typeText(text, what) {
  const typed = await spawnAsync('xdotool', [
    'windowfocus',
    '--sync',
    APP_WINDOW_NAME,
    'type',
    '--clearmodifiers',
    '--delay',
    '40',
    text,
  ]);
  return check(
    `type ${what}`,
    typed.code === 0,
    `xdotool type exited ${String(typed.code)}: ${typed.stderr.trim()}`,
  );
}

// ------------------------------------------------------------ API facts ----

async function apiGet(path) {
  try {
    const response = await fetch(`http://127.0.0.1:${String(sandboxPort())}${path}`, {
      signal: AbortSignal.timeout(5000),
    });
    const text = await response.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    return { ok: response.ok, status: response.status, body, text };
  } catch (error) {
    return { ok: false, status: 0, body: null, text: String(error) };
  }
}

async function apiPost(path, payload) {
  try {
    const response = await fetch(`http://127.0.0.1:${String(sandboxPort())}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload ?? {}),
      signal: AbortSignal.timeout(5000),
    });
    const text = await response.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    return { ok: response.ok, status: response.status, body, text };
  } catch (error) {
    return { ok: false, status: 0, body: null, text: String(error) };
  }
}

async function formatsList() {
  const read = await apiGet('/api/formats');
  return read.ok && read.body !== null && Array.isArray(read.body.formats) ? read.body.formats : null;
}

async function patientsList() {
  const read = await apiGet('/api/patients');
  return read.ok && read.body !== null && Array.isArray(read.body.patients) ? read.body.patients : null;
}

async function notesFor(patientId) {
  const read = await apiGet(`/api/patients/${encodeURIComponent(patientId)}/notes`);
  return read.ok && read.body !== null && Array.isArray(read.body.notes) ? read.body.notes : null;
}

async function noteById(noteId) {
  const read = await apiGet(`/api/notes/${encodeURIComponent(noteId)}`);
  return read.ok && read.body !== null ? read.body : null;
}

async function planFor(patientId) {
  const read = await apiGet(`/api/patients/${encodeURIComponent(patientId)}/plan`);
  return read.ok && read.body !== null ? read.body : null;
}

async function briefsFor(patientId) {
  const read = await apiGet(`/api/patients/${encodeURIComponent(patientId)}/prep`);
  return read.ok && read.body !== null ? read.body : null;
}

async function backupStatus() {
  const read = await apiGet('/api/backup');
  return read.ok && read.body !== null ? read.body : null;
}

/** The `testRunId` the health endpoint reports, or `null`. */
async function healthRunId() {
  const read = await apiGet('/api/health');
  if (!read.ok || read.body === null) return null;
  return typeof read.body.testRunId === 'string' ? read.body.testRunId : null;
}

/** Waits for ownership the way C-ISO@1 rule 5 requires: this run's id, or fail. */
async function waitForOwnership(timeoutMs, what) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if ((await healthRunId()) === sandboxEnv().runId) return true;
    if (Date.now() >= deadline) {
      fail(`${what}: ownership`, `testRunId never matched (last saw ${String(await healthRunId())})`);
      return false;
    }
    await sleep(250);
  }
}

/** Is Ollama still answering? C-ISO@1 rule 7, checked from the outside. */
async function ollamaAlive() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const response = await fetch('http://127.0.0.1:11434/api/tags', { signal: controller.signal });
    clearTimeout(timer);
    return response.ok;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------ CSP ----

/**
 * The Content-Security-Policy the running server sends, asserted over the app's
 * own origin.
 *
 * Rule 6's six directives verbatim, plus the two additive ones. The text is
 * quoted from `server/src/http/csp.ts` and pinned to `d56af1d`; a difference is
 * a stop and a report, not a row quietly asserting a header the server stopped
 * sending.
 */
const CSP_SIX = [
  "default-src 'self'",
  "script-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
];
const CSP_STYLE_SRC_ATTR = "style-src-attr 'unsafe-inline'";

async function assertCsp(what) {
  try {
    const response = await fetch(`http://127.0.0.1:${String(sandboxPort())}/`, {
      signal: AbortSignal.timeout(5000),
    });
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html')) {
      fail(`${what} CSP`, `GET / answered content-type ${JSON.stringify(contentType)}, not text/html`);
      return false;
    }
    const header = response.headers.get('content-security-policy') ?? '';
    if (header === '') {
      fail(`${what} CSP`, 'the HTML response carried no content-security-policy header');
      return false;
    }
    const directives = header
      .split(';')
      .map((part) => part.trim())
      .filter((part) => part !== '');
    for (const required of CSP_SIX) {
      if (!directives.includes(required)) {
        fail(
          `${what} CSP`,
          `the policy ${JSON.stringify(header)} is missing the directive ${JSON.stringify(required)}`,
        );
        return false;
      }
    }
    if (!directives.includes(CSP_STYLE_SRC_ATTR)) {
      fail(
        `${what} CSP`,
        `the policy ${JSON.stringify(header)} is missing the directive ${JSON.stringify(CSP_STYLE_SRC_ATTR)}`,
      );
      return false;
    }
    // The style-src nonce directive: present and carrying a non-empty nonce.
    const nonce = directives.find((directive) => directive.startsWith("style-src 'self' 'nonce-"));
    if (nonce === undefined) {
      fail(`${what} CSP`, `the policy ${JSON.stringify(header)} carries no style-src nonce directive`);
      return false;
    }
    const nonceValue = /^style-src 'self' 'nonce-(.+)'$/.exec(nonce);
    if (nonceValue === null || nonceValue[1] === '') {
      fail(`${what} CSP`, `the style-src nonce directive ${JSON.stringify(nonce)} carries an empty nonce`);
      return false;
    }
    pass(`${what} CSP`, `${String(directives.length)} directives, nonce present`);
    return true;
  } catch (error) {
    fail(`${what} CSP`, `GET / failed: ${String(error)}`);
    return false;
  }
}

// ------------------------------------------------- observation containment --

/**
 * The observation channel is gone: zero occurrences of P3.4's marker path and
 * gate string in the card's own `web/dist/assets/*.js`.
 *
 * **Fail-closed.** A missing assets directory, or one holding no `.js` file at
 * all, is not "zero occurrences" — it is an unread bundle, and an unread bundle
 * must never report the channel gone. This is the same refusal the security
 * sibling makes when its `countInShippedWebDist` cannot find its directory.
 */
function observationChannelGone() {
  return scanBundleForObservationChannel(join(repoRoot, 'web', 'dist', 'assets'));
}

/**
 * The scan itself, over any assets directory, so its refusal can be exercised
 * without moving the real bundle: absent, scriptless or partly unreadable all
 * report `unreadable` rather than "zero occurrences".
 */
function scanBundleForObservationChannel(assetsDir) {
  if (!existsSync(assetsDir)) {
    return {
      occurrences: 0,
      files: 0,
      unreadable: `no ${sanitise(assetsDir)}: the shipped bundle cannot be read`,
    };
  }
  const candidates = [];
  for (const entry of readdirSync(assetsDir)) {
    if (entry.endsWith('.js')) candidates.push(join(assetsDir, entry));
  }
  if (candidates.length === 0) {
    return { occurrences: 0, files: 0, unreadable: `${sanitise(assetsDir)} holds no .js file to scan` };
  }
  let occurrences = 0;
  let unread = 0;
  for (const file of candidates) {
    const text = readFileSyncSafe(file);
    if (text === null) {
      unread += 1;
      continue;
    }
    if (text.includes(P34_MARKER_PATH)) occurrences += 1;
    if (text.includes(P34_GATE_STRING)) occurrences += 1;
  }
  if (unread > 0) {
    return {
      occurrences,
      files: candidates.length,
      unreadable: `${String(unread)} of ${String(candidates.length)} bundle scripts could not be read`,
    };
  }
  return { occurrences, files: candidates.length, unreadable: null };
}

function readFileSyncSafe(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

// ---------------------------------------------------- microphone contain ----

/**
 * The virtual-source containment the capture flow reuses from P3.5.
 *
 * The host's default capture device is the owner's real USB microphone. This
 * is the one thing allowed to touch host audio state, and only in this order:
 * remember the default source, create the null sink and the remap source, make
 * the virtual source the default, and read it back — a read-back that is
 * anything other than `apunta_p35_mic` stops the row before the app is launched.
 * The teardown restores the remembered default and unloads both modules on
 * every exit path, including signals.
 */
/**
 * `pactl list short sources` → a numeric source index → source-name table.
 *
 * P3.5's mechanism, reused rather than reinvented. The short source-outputs
 * format prints a **source index**, not a name (pactl 17.0: `%u\t%u\t%s\t%s\t%s`),
 * so a stream can only be classified after it is resolved through this table.
 * A malformed row, a non-numeric or duplicated index, or an empty name is an
 * error — never a silently skipped row, because skipping is how an unknown
 * stream becomes "not the microphone".
 */
function parseSourceTable(text) {
  const table = new Map();
  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue;
    const columns = raw.trim().split(/\s+/);
    if (columns.length < 2) throw new Error(`malformed pactl sources row: ${JSON.stringify(raw)}`);
    const index = Number(columns[0]);
    if (!Number.isInteger(index)) {
      throw new Error(`non-numeric source index in pactl sources: ${JSON.stringify(raw)}`);
    }
    if (table.has(index)) {
      throw new Error(`duplicate source index ${String(index)} in pactl sources: ${JSON.stringify(raw)}`);
    }
    const name = columns[1];
    if (name === '') throw new Error(`empty source name in pactl sources: ${JSON.stringify(raw)}`);
    table.set(index, name);
  }
  return table;
}

/**
 * Resolve `pactl list short source-outputs` through the source table.
 *
 * Every row must resolve to a known source index. The third column is the
 * client index, where only the literal `-` means "no client" (the dash a
 * system-owned stream prints); any other value must still be a plain integer.
 * An index that is not in the table is an error, not an "unrelated, so safe"
 * row.
 */
function classifySourceOutputs(outputsText, sourcesText) {
  const sources = parseSourceTable(sourcesText);
  const all = [];
  for (const raw of outputsText.split('\n')) {
    if (raw.trim() === '') continue;
    const columns = raw.trim().split(/\s+/);
    if (columns.length < 3) throw new Error(`malformed pactl source-outputs row: ${JSON.stringify(raw)}`);
    const streamId = Number(columns[0]);
    const sourceId = Number(columns[1]);
    const clientId = columns[2] === '-' ? null : Number(columns[2]);
    if (
      ![streamId, sourceId].every((value) => Number.isInteger(value)) ||
      (clientId !== null && !Number.isInteger(clientId))
    ) {
      throw new Error(`non-numeric source-outputs column: ${JSON.stringify(raw)}`);
    }
    if (!sources.has(sourceId)) {
      throw new Error(
        `source-output ${String(streamId)} names source index ${String(sourceId)}, which is not in the pactl ` +
          'sources table; the mapping is unknown and the row must not assume it is safe',
      );
    }
    all.push({ streamId, sourceId, clientId, sourceName: sources.get(sourceId), raw: raw.trim() });
  }
  const virtual = all.filter((output) => output.sourceName === SOURCE_NAME);
  const other = all.filter((output) => output.sourceName !== SOURCE_NAME);
  return { all, virtual, other };
}

/**
 * Both live `pactl` reads, resolved together, with the real names they printed.
 *
 * A failed command is a stop: the containment state is unknown, and an unknown
 * state is never "safe". The physical microphone is named from the live table,
 * not from an assumed prefix, so a host whose USB device is named differently
 * is still covered.
 */
async function readCaptureStreams() {
  const [outputs, sources] = await Promise.all([
    pactl(['list', 'short', 'source-outputs']),
    pactl(['list', 'short', 'sources']),
  ]);
  if (outputs.code !== 0) {
    throw new Error(
      `pactl list short source-outputs exited ${String(outputs.code)}: ${outputs.stderr.trim()}`,
    );
  }
  if (sources.code !== 0) {
    throw new Error(`pactl list short sources exited ${String(sources.code)}: ${sources.stderr.trim()}`);
  }
  const classified = classifySourceOutputs(outputs.stdout, sources.stdout);
  const physical = classified.other.filter(
    (output) => !output.sourceName.startsWith(`${SINK_NAME}.monitor`) && output.sourceName !== SOURCE_NAME,
  );
  return { ...classified, physical };
}

/**
 * The owner's microphone is never read, asserted from the live source table.
 *
 * `containment.create` only ever reads the default source back; this is the
 * other half of the claim — while the app records, no stream at all may be
 * attached to a non-virtual capture device, and an unresolvable source-output
 * row stops the flow instead of being counted as safe.
 */
async function assertNoPhysicalStream(step) {
  try {
    const streams = await readCaptureStreams();
    if (streams.physical.length > 0) {
      return check(
        `${step} no stream on the owner's microphone`,
        false,
        `these source-outputs resolved to a non-virtual source: ${JSON.stringify(streams.physical.map((o) => o.raw))}`,
      );
    }
    return check(
      `${step} no stream on the owner's microphone`,
      true,
      `${String(streams.all.length)} source-outputs, all on ${SOURCE_NAME} or an unrelated sink monitor`,
    );
  } catch (error) {
    return check(
      `${step} no stream on the owner's microphone`,
      false,
      `the live source-outputs read could not be resolved, so containment is unknown: ${String(error?.message ?? error)}`,
    );
  }
}

/** Every pid this harness started, so an exit signal leaves none behind. */
const startedPids = new Set();

function rememberPid(pid) {
  if (typeof pid === 'number') startedPids.add(pid);
}

/**
 * The audio teardown on **every** exit path, including signals.
 *
 * Installed before the first module is loaded and idempotent, so a `SIGINT`
 * during capture still restores the remembered default source and unloads both
 * modules. The stray-pid sweep is P3.5's: every pid this file started is sent a
 * `SIGTERM` from the `exit` handler, by pid and never by pattern.
 */
function installTraps() {
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => {
      containment.teardownSync();
      for (const pid of startedPids) {
        try {
          process.kill(pid, 'SIGTERM');
        } catch {
          // Already gone.
        }
      }
      process.exit(signal === 'SIGINT' ? 130 : 143);
    });
  }
  process.on('exit', () => {
    containment.teardownSync();
  });
}

const containment = {
  prevDefault: null,
  sinkId: null,
  srcId: null,
  restored: false,
  unloaded: false,

  async create() {
    const server = await pactl(['info']);
    const named = (server.stdout.match(/^Server Name:.*/m) ?? ['Server Name: (not reported)'])[0];
    if (!/PipeWire/.test(named)) {
      throw new Error(`this host is not PipeWire (pactl info said: ${named})`);
    }
    for (const daemon of ['pulseaudio', 'pacmd']) {
      const found = firstOnPath([daemon]);
      if (found !== undefined) {
        throw new Error(
          `a ${daemon} binary is on PATH, so this host is not the pipewire-pulse one this card is pinned to`,
        );
      }
    }
    this.prevDefault = await defaultSource();
    if (this.prevDefault === null || this.prevDefault === '') {
      throw new Error('pactl get-default-source printed nothing, so the original default is unknown');
    }
    const sink = await pactl([
      'load-module',
      'module-null-sink',
      `sink_name=${SINK_NAME}`,
      'sink_properties=device.description=Apunta_P3.6',
    ]);
    if (sink.code !== 0) throw new Error(`loading module-null-sink failed: ${sink.stderr.trim()}`);
    this.sinkId = sink.stdout.trim();
    const source = await pactl([
      'load-module',
      'module-remap-source',
      `source_name=${SOURCE_NAME}`,
      `master=${SINK_NAME}.monitor`,
    ]);
    if (source.code !== 0) throw new Error(`loading module-remap-source failed: ${source.stderr.trim()}`);
    this.srcId = source.stdout.trim();
    const set = await pactl(['set-default-source', SOURCE_NAME]);
    if (set.code !== 0)
      throw new Error(`pactl set-default-source ${SOURCE_NAME} failed: ${set.stderr.trim()}`);
    // Polled read-back: `set-default-source` is applied asynchronously.
    const deadline = Date.now() + 10_000;
    let now = await defaultSource();
    while (now !== SOURCE_NAME && Date.now() < deadline) {
      await sleep(250);
      now = await defaultSource();
    }
    if (now !== SOURCE_NAME) {
      throw new Error(`the default source read back as ${JSON.stringify(now)} after setting ${SOURCE_NAME}`);
    }
    return { prevDefault: this.prevDefault, sinkId: this.sinkId, srcId: this.srcId, readBack: now };
  },

  async teardown() {
    if (this.prevDefault !== null && !this.restored) {
      await pactl(['set-default-source', this.prevDefault]);
      this.restored = true;
    }
    if (this.srcId !== null && !this.unloaded) {
      await pactl(['unload-module', this.srcId]);
      this.srcId = null;
    }
    if (this.sinkId !== null && !this.unloaded) {
      await pactl(['unload-module', this.sinkId]);
      this.sinkId = null;
    }
    this.unloaded = true;
  },

  teardownSync() {
    if (this.prevDefault !== null && !this.restored) {
      pactlSync(['set-default-source', this.prevDefault]);
      this.restored = true;
    }
    for (const key of ['srcId', 'sinkId']) {
      if (this[key] === null) continue;
      const done = pactlSync(['unload-module', this[key]]);
      if (done.code !== 0) {
        process.stderr.write(`tauri-e2e-smoke: unload-module ${this[key]} failed: ${done.stderr.trim()}\n`);
      }
      this[key] = null;
    }
    this.unloaded = true;
  },
};

async function pactl(args) {
  return await spawnAsync('pactl', args, { killAfterMs: 20_000 });
}

function pactlSync(args) {
  try {
    const done = spawnSync('pactl', args, { encoding: 'utf8', timeout: 20_000 });
    return { code: done.status, stdout: done.stdout ?? '', stderr: done.stderr ?? '' };
  } catch {
    return { code: null, stdout: '', stderr: '' };
  }
}

async function defaultSource() {
  const read = await pactl(['get-default-source']);
  if (read.code !== 0) return null;
  return read.stdout.replace(/\n$/, '');
}

/**
 * Play a fixture into the virtual sink only, by pid, never stopped with
 * `pkill` and never pointed at any other sink — so the owner's audio output is
 * untouched and the only capture device with a signal is the virtual source.
 */
function startPlayback(file) {
  const child = spawn('paplay', ['--device=' + SINK_NAME, '--rate=16000', '--channels=1', file], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  rememberPid(child.pid);
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString('utf8');
  });
  return { pid: child.pid, child, stderr: () => stderr };
}

/** The repo's read-only plumbing fixture, the tone-burst train (never modified). */
function fixtureAudio() {
  return join(repoRoot, 'e2e', 'fixtures', 'audio', 'dictation-10s.wav');
}

// --------------------------------------------------------------- helpers ----

/** The four files C-OWN@1 owns, so a second server in this folder is visible. */
function ownershipFiles(dir = sandboxEnv().dataDir) {
  return ['apunta.lock', 'apunta.db', 'apunta.db-wal', 'apunta.db-shm'].map((name) => ({
    name,
    path: join(dir, name),
  }));
}

/**
 * The two of the four whose **identity** is only recorded, never asserted.
 *
 * SQLite creates and deletes `apunta.db-wal` and `apunta.db-shm` around
 * checkpoints and on close, so a new inode for either is the database working,
 * not a second owner. Asserting their device+inode would be a false-positive
 * path — the exact defect F7 was raised for, in a new place — so their identity
 * is recorded (it is in the evidence) and the assertion is carried by the two
 * files that do not move: the lock file and the database itself.
 *
 * `apunta.lock` is asserted with its release tolerated: C-OWN@1 rule 5 has the
 * lock removed on clean shutdown, so the end state "gone" is legitimate and only
 * a **different** file at that name is a failure.
 */
const VOLATILE_OWNED = new Set(['apunta.db-wal', 'apunta.db-shm']);

/**
 * Each C-OWN@1 file's **identity** — device and inode, as decimal strings — read
 * with `fs.statSync` in bigint mode so a 64-bit inode is never rounded.
 *
 * Identity is the part a name set cannot see. All four names are in the baseline
 * by construction (the first instance created them), so "did a second owner
 * appear?" answered by *names* is `[]` before it starts and can never fail — the
 * defect D2 records. A second owner does not introduce a new filename into this
 * folder: it either fails to take the lock or writes the same four names. What
 * it would have to do to be caught is **replace** one of them, and a replaced
 * file is a different inode. That is what this snapshot records and what
 * `ownershipIdentityDiff` compares.
 */
function ownershipIdentitySnapshot(dir = sandboxEnv().dataDir) {
  return ownershipFiles(dir).map((file) => {
    let dev = null;
    let ino = null;
    let size = null;
    try {
      const stats = statSync(file.path, { bigint: true });
      dev = stats.dev.toString();
      ino = stats.ino.toString();
      size = stats.size.toString();
    } catch {
      // Absent at this moment: recorded as absent, which is a fact and not a
      // guess about why.
    }
    return {
      name: file.name,
      present: dev !== null,
      dev,
      ino,
      size,
      /** `false` for the WAL pair: recorded, never asserted (see above). */
      asserted: !VOLATILE_OWNED.has(file.name),
    };
  });
}

/**
 * What the end-of-run identity says against the baseline.
 *
 * - `replaced`: an asserted file present at both ends with a **different**
 *   device+inode. Something swapped the lock or the database out from under the
 *   run. This is the failure mode the name set cannot see.
 * - `appearedOwned`: one of the four names present at the end that was not in
 *   the baseline. Cheap, kept, and reported — it is empty by construction in the
 *   healthy case, which is why it is not the proof.
 * - `lost`: an asserted file that was in the baseline and is gone at the end and
 *   is **not** the lock. The database does not delete itself.
 * - `released`: `apunta.lock` gone at the end, which is C-OWN@1 rule 5's clean
 *   release and is not a failure.
 * - `volatileChanged`: the WAL pair's identity moved. Recorded, never failed on.
 */
function ownershipIdentityDiff(baseline, after) {
  const replaced = [];
  const lost = [];
  const released = [];
  const volatileChanged = [];
  const baselineNames = baseline.filter((file) => file.present).map((file) => file.name);
  for (const before of baseline) {
    if (!before.present) continue;
    const now = after.find((file) => file.name === before.name);
    if (now === undefined) continue;
    if (!now.present) {
      // The lock's clean release (C-OWN@1 rule 5) and the WAL pair's deletion by
      // SQLite on close in WAL mode are what a graceful shutdown does to the
      // baseline; only an **asserted** file — the database itself — going
      // missing is a loss, which is what `lost` is documented to mean.
      if (before.name === 'apunta.lock') released.push(before.name);
      else if (before.asserted) lost.push(before.name);
      continue;
    }
    if (!before.asserted) {
      if (now.dev !== before.dev || now.ino !== before.ino) volatileChanged.push(before.name);
      continue;
    }
    if (now.dev !== before.dev || now.ino !== before.ino) {
      replaced.push(
        `${before.name} (dev ${before.dev}, ino ${before.ino}) is now dev ${now.dev}, ino ${now.ino}`,
      );
    }
  }
  const appearedOwned = after
    .filter((file) => file.present && !baselineNames.includes(file.name))
    .map((file) => file.name);
  const ok = replaced.length === 0 && lost.length === 0 && appearedOwned.length === 0;
  const parts = [];
  if (replaced.length > 0) parts.push(`replaced: ${replaced.join('; ')}`);
  if (lost.length > 0) parts.push(`gone from the baseline: ${lost.join(', ')}`);
  if (appearedOwned.length > 0)
    parts.push(`a C-OWN@1 name appeared that the baseline did not have: ${appearedOwned.join(', ')}`);
  if (released.length > 0) parts.push(`released on shutdown, as C-OWN@1 rule 5 says: ${released.join(', ')}`);
  if (volatileChanged.length > 0) {
    parts.push(
      `the WAL pair was recreated by SQLite, recorded and not failed on: ${volatileChanged.join(', ')}`,
    );
  }
  return {
    ok,
    replaced,
    lost,
    released,
    volatileChanged,
    appearedOwned,
    why:
      parts.length === 0
        ? 'the lock and the database are the same files (device+inode) the baseline recorded'
        : parts.join('; '),
  };
}

/**
 * Who `apunta.lock` says owns the folder, in the file's own shape.
 *
 * C-OWN@1 rule 2 writes `{ pid, processStart, appVersion, protocol: 1, nonce }`
 * (`server/src/platform/data-lock.ts`, `acquireDataFolderLock`), and the `pid` is
 * the **server's** — `acquireDataFolderLock` is called from the server process
 * with `process.pid`, and the shell prints the same number in
 * `apunta: spawned the bundled server as pid <N>`. So the lock holder and the
 * harness's server pid are directly comparable, which is what makes the lock
 * readable as this run's own.
 *
 * `null` is "no lock to read" — absent, empty, or not JSON — and is never
 * treated as "fine".
 */
function readLockHolder(path = join(sandboxEnv().dataDir, 'apunta.lock')) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object') return null;
  return {
    pid: Number.isSafeInteger(parsed.pid) ? parsed.pid : null,
    processStart: typeof parsed.processStart === 'string' ? parsed.processStart : null,
    appVersion: typeof parsed.appVersion === 'string' ? parsed.appVersion : null,
    protocol: Number.isSafeInteger(parsed.protocol) ? parsed.protocol : null,
    nonce: typeof parsed.nonce === 'string' ? parsed.nonce : '',
  };
}

/**
 * Is the folder still locked by **this run's** server, in the holder recorded at
 * the baseline?
 *
 * Two questions, and both have to hold:
 *
 * 1. the baseline holder is this run's server pid, so the folder this run drove
 *    the app in is the folder the app locked;
 * 2. the holder now is the same pid **and** the same nonce, so nobody took the
 *    lock over in between. A different nonce is a takeover (C-OWN@1 rule 3's
 *    stale branch, which renames a fresh lock over the old one) — which is the
 *    second-owner case the name set cannot express.
 *
 * A holder that is simply gone while the server is still running is a failure,
 * not a pass: the app had not been stopped yet when this is read.
 */
function lockHolderCheck(baseline, current, serverPid) {
  if (serverPid === null || serverPid === undefined) {
    return {
      ok: false,
      why: 'the shell never printed the bundled server pid, so the lock holder cannot be compared',
    };
  }
  if (baseline === null) {
    return { ok: false, why: 'apunta.lock held nothing readable at the baseline' };
  }
  if (baseline.pid !== serverPid) {
    return {
      ok: false,
      why: `apunta.lock names pid ${String(baseline.pid)} but this run's bundled server is pid ${String(serverPid)}`,
    };
  }
  if (current === null) {
    return {
      ok: false,
      why: `apunta.lock is gone or unreadable while this run's server (pid ${String(serverPid)}) is still running`,
    };
  }
  if (current.pid !== serverPid) {
    return {
      ok: false,
      why: `apunta.lock is now held by pid ${String(current.pid)}, not this run's server pid ${String(serverPid)}`,
    };
  }
  if (current.nonce !== baseline.nonce) {
    return {
      ok: false,
      why: `apunta.lock was rewritten with a different nonce (${String(current.nonce)} against ${String(baseline.nonce)}), so the lock was taken over mid-run`,
    };
  }
  return {
    ok: true,
    why: `apunta.lock still names this run's server pid ${String(serverPid)} and its own nonce`,
  };
}

/**
 * The data folder's own contents, as a sorted **name set**.
 *
 * The baseline is taken **after** the first instance is up and answering with
 * this run's id, not before the launch: the app creates `apunta.lock` and
 * `apunta.db` at startup, so a pre-launch snapshot flags this run's own first
 * set and fails every healthy run. With the baseline after, "no second lock,
 * database, -wal or -shm" becomes the question it claims to be — did anything
 * appear **beside** the set the first instance created? — and the four names
 * are additionally asserted present in the baseline as the proof that the first
 * instance really did create them.
 */
function snapshotDataDirNames() {
  const dir = sandboxEnv().dataDir;
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => !['.', '..'].includes(name))
    .sort();
}

function ownershipBaselineProof(names) {
  const owned = ownershipFiles().map((file) => file.name);
  const missing = owned.filter((name) => !names.includes(name));
  return { owned, missing };
}

/**
 * What the post-run name set says against the baseline, split by what each part
 * means.
 *
 * `secondOwned` — one of the four C-OWN@1 files (`apunta.lock`, `apunta.db`,
 * `apunta.db-wal`, `apunta.db-shm`) appeared **beside** the baseline.
 *
 * **What it is worth, stated honestly (D2):** all four names are in the baseline
 * by construction — the first instance created them, and
 * `ownershipBaselineProof` asserts that — so `secondOwned` is empty before the
 * run starts and this half cannot fail. A second server does not put a *new
 * filename* in this folder; it either fails to take the lock or writes the same
 * four names. So this is a cheap re-assertion of the baseline, kept because
 * removing a check is not this repair's move, and **not** the proof. The falsifiable
 * halves are `ownershipIdentityDiff` (device+inode) and `lockHolderCheck` (the
 * lock still names this run's server pid and nonce), and those are what the
 * second-owner claim rests on now.
 *
 * `otherNew` is everything else that appeared — and it is **not** a failure,
 * because the run's own flows put things there on purpose: the backup flow writes
 * `backups/` (`server/src/backup/store.ts:37-39`, the default backup directory is
 * `join(dataDir, 'backups')`), so counting *every* new name as a second owner
 * failed this row on a healthy run. Those names are still reported, so nothing is
 * hidden by not failing on them.
 *
 * `vanished` is over the whole baseline **except** the two graceful-shutdown
 * disappearances — the lock's clean release (C-OWN@1 rule 5) and the WAL pair's
 * deletion by SQLite on close in WAL mode: nothing else the first instance
 * created may disappear behind it, whether it is one of the four or not.
 */
function ownershipContainment(baseline, after) {
  const owned = ownershipFiles().map((file) => file.name);
  const appeared = after.filter((name) => !baseline.includes(name));
  // The graceful-shutdown disappearances, by name: the lock (the first of the
  // four C-OWN@1 files, released per C-OWN@1 rule 5) and the WAL pair (SQLite
  // deletes both on close in WAL mode). Exactly these and nothing else.
  const gracefulGone = new Set([...VOLATILE_OWNED, owned[0]]);
  return {
    owned,
    secondOwned: appeared.filter((name) => owned.includes(name)),
    otherNew: appeared.filter((name) => !owned.includes(name)),
    vanished: baseline.filter((name) => !after.includes(name) && !gracefulGone.has(name)),
  };
}

/** Saves a flow screenshot under the evidence directory, named by flow. */
function saveEvidenceScreenshot(windowId, flow) {
  const file = join(scratchDir(), `window-${String(windowId)}.png`);
  if (!existsSync(file)) return null;
  const dest = join(evidenceDir(), `${flow}.png`);
  try {
    copyFileSync(file, dest);
    return dest;
  } catch {
    return null;
  }
}

// --------------------------------------------------------- Rule B freshness --

/** A path Rule B names only as an *input* (never `src-tauri/target/**`). */
function isRuleBInput(relative) {
  if (RULE_B_EXCLUDED.some((prefix) => relative === prefix.slice(0, -1) || relative.startsWith(prefix))) {
    return false;
  }
  return RULE_B_PATHS.some((set) => relative === set || relative.startsWith(`${set}/`));
}

/**
 * The commit the artefact under test was **built from**, or `null` with the
 * reason it could not be established.
 *
 * **Where the commit comes from, and why it is not the dispatch base.** The
 * history arm has to answer "has Rule B's set moved since the bundle in front of
 * me was built", so the commit it needs is the one the artefact was built from.
 * The dispatch header's base is a different question — where the dispatch was
 * cut — and 49 Rule B inputs committed between the two made the row red on a
 * bundle V0 had built from the very tree under test
 * (`docs/v2/state/returns/P3.6-attempt6-runtime.md` §3, §5 A2).
 *
 * **What V0 already produces is enough, and nothing new had to be written for
 * it.** The bundler sets the AppImage's mtime to the moment it wrote the file
 * (recorded in `docs/v2/evidence/P3.6/attempt-6/runtime/01-v0-run.txt`: the
 * artefact at 2026-10-04 16:20:48 -0600, the run ending at 22:20:48Z), and
 * `git log -1 --before=<that moment> HEAD` is the newest commit that existed at
 * it. On this repository that resolves the AppImage to `74cc340`, which is
 * exactly the commit the attempt-6 run recorded as HEAD when V0 finished. So the
 * two inputs are the artefact V0 already builds and the repository it already
 * builds in: no sidecar, no new row, no env var, and no edit to V0's or V3's
 * command.
 *
 * **Fail-closed in every direction, and never a fallback.** An unreadable
 * artefact, a git that cannot answer, a commit older than the repository's first
 * commit, and a resolved commit that is not an ancestor of `HEAD` all return
 * `commit: null` with a reason, and the row then **fails** — a Rule B change
 * after an unknown build point is not "no evidence of staleness", it is no
 * evidence at all, and substituting the dispatch base for the unknown would
 * reproduce the vacuous pass Rule B exists to prevent.
 */
async function resolveBuildCommit(appImagePath, { cwd = repoRoot } = {}) {
  const mtime = appImagePath !== undefined && existsSync(appImagePath) ? statSyncSafe(appImagePath) : null;
  if (mtime === null) {
    return {
      commit: null,
      mtime: null,
      when: null,
      error: `the artefact has no readable mtime, so its build commit cannot be established: ${sanitise(String(appImagePath))}`,
    };
  }
  const when = new Date(mtime).toISOString();
  const tip = await spawnAsync('git', ['rev-parse', '--verify', 'HEAD'], { cwd });
  if (tip.code !== 0) {
    return {
      commit: null,
      mtime,
      when,
      error: `git rev-parse --verify HEAD exited ${String(tip.code)}: ${tip.stderr.trim()}`,
    };
  }
  const log = await spawnAsync('git', ['log', '-1', '--format=%H', `--before=${when}`, 'HEAD'], { cwd });
  if (log.code !== 0) {
    return {
      commit: null,
      mtime,
      when,
      error: `git log -1 --before=${when} exited ${String(log.code)}: ${log.stderr.trim()}`,
    };
  }
  const commit = log.stdout.trim();
  if (!/^[0-9a-f]{40}$/.test(commit)) {
    return {
      commit: null,
      mtime,
      when,
      error: `git log -1 --before=${when} answered ${JSON.stringify(log.stdout.trim())}, which is not a commit hash`,
    };
  }
  const ancestor = await spawnAsync('git', ['merge-base', '--is-ancestor', commit, tip.stdout.trim()], {
    cwd,
  });
  if (ancestor.code !== 0) {
    return {
      commit: null,
      mtime,
      when,
      error: `${commit.slice(0, 7)} (the newest commit at or before the artefact's mtime) is not an ancestor of HEAD, so it cannot be the commit this tree was built from`,
    };
  }
  return { commit, mtime, when, error: null };
}

/**
 * The freshness predicate, executable.
 *
 * Two questions, both answered rather than asserted in prose:
 *
 * 1. **Has Rule B's set moved since the commit the artefact was built from?**
 *    `git diff --name-only <build commit>...HEAD -- <set>` together with
 *    `git status --porcelain -- <set>`, over the set the dispatch's Fixed
 *    decision restates. The compared commit is `resolveBuildCommit`'s answer,
 *    never `RULE_B_BASE` (see above), the separator between it and `HEAD` is
 *    three ASCII full stops and not a typographic ellipsis, and it is never an
 *    angle-bracket placeholder that would match nothing and pass vacuously.
 *    Any path is a **fail**, because a moved input means the bundle under test is
 *    stale. The other two arms are untouched: a **dirty** Rule B input is
 *    reported by the status arm whatever the build commit is, and an artefact
 *    **older than its newest input** is the second arm below.
 * 2. **Is the artefact newer than the newest input under that set?** A source
 *    walk over the same paths, comparing the AppImage's own mtime with the
 *    newest input mtime. This is the recorded fresh-build anchor: an AppImage
 *    older than a source file cannot have been built from it.
 *
 * `cwd` and `root` exist so the helper tests can drive this exact predicate over
 * a throwaway git repository built from the real Rule B path names; both default
 * to this repository, so the row itself is unchanged.
 */
async function ruleBFreshness(appImagePath, { cwd = repoRoot, root = repoRoot } = {}) {
  const build = await resolveBuildCommit(appImagePath, { cwd });
  const diff =
    build.commit === null
      ? null
      : await spawnAsync('git', ['diff', '--name-only', `${build.commit}...HEAD`, '--', ...RULE_B_PATHS], {
          cwd,
        });
  const status = await spawnAsync('git', ['status', '--porcelain', '--', ...RULE_B_PATHS], { cwd });
  const committed =
    diff !== null && diff.code === 0 ? diff.stdout.split('\n').filter((line) => line.trim() !== '') : [];
  const dirty = status.code === 0 ? status.stdout.split('\n').filter((line) => line.trim() !== '') : [];
  const moved = [...committed, ...dirty]
    .map((line) => line.split(/\s+/).pop() ?? '')
    .filter((r) => isRuleBInput(r));
  const walk = newestRuleBInput(root);
  const artifactMtime = existsSync(appImagePath) ? statSyncSafe(appImagePath) : null;
  return {
    base: RULE_B_BASE,
    buildCommit: build.commit,
    buildCommitWhen: build.when,
    buildCommitError: build.error,
    diffOk: diff !== null && diff.code === 0,
    statusOk: status.code === 0,
    diffError: build.commit === null ? build.error : diff.code === 0 ? null : diff.stderr.trim(),
    statusError: status.code === 0 ? null : status.stderr.trim(),
    moved,
    newestInput: walk.newest,
    newestInputPath: walk.newestPath,
    artifactMtime,
    artifactNewer: walk.newest === null || (artifactMtime !== null && artifactMtime >= walk.newest),
  };
}

/**
 * The history arm's own verdict: `{ ok, detail }`, from the predicate's output.
 *
 * Split out of `runSmoke` so the fail-closed cases are assertable without a run:
 * an unestablished build commit, a diff or status git refused, and any moved
 * Rule B input each produce `ok: false` with the reason, and **there is no
 * branch anywhere that turns an unknown build commit into a pass.**
 */
function ruleBHistoryVerdict(freshness) {
  const short = (commit) =>
    typeof commit === 'string' && commit !== '' ? commit.slice(0, 7) : String(commit);
  if (freshness.buildCommit === null || freshness.buildCommit === undefined) {
    return {
      ok: false,
      detail: `the commit the AppImage was built from could not be established, so the history arm cannot run and no input can be called unmoved: ${String(freshness.buildCommitError)} (the dispatch base ${short(freshness.base)} is recorded, and is deliberately not substituted for an unknown build commit)`,
    };
  }
  if (!freshness.diffOk) {
    return {
      ok: false,
      detail: `git diff --name-only ${short(freshness.buildCommit)}...HEAD exited: ${String(freshness.diffError)}`,
    };
  }
  if (!freshness.statusOk) {
    return { ok: false, detail: `git status --porcelain exited: ${String(freshness.statusError)}` };
  }
  if (freshness.moved.length !== 0) {
    return {
      ok: false,
      detail: `${String(freshness.moved.length)} Rule B input(s) moved after the build commit ${short(freshness.buildCommit)} (built ${String(freshness.buildCommitWhen)}): ${freshness.moved.join(', ')}`,
    };
  }
  return {
    ok: true,
    detail: `no Rule B input moved after the build commit ${short(freshness.buildCommit)} (built ${String(freshness.buildCommitWhen)}); the dispatch base ${short(freshness.base)} is recorded, not compared`,
  };
}

/**
 * The source walk: the newest mtime under Rule B's **input** paths.
 *
 * Build outputs (`build/linux-resources/**`, `server/dist/**`, `web/dist/**`)
 * and `src-tauri/target/**` are never inputs, so the newest build artefact does
 * not make the source look newer than it is.
 */
function newestRuleBInput(root = repoRoot) {
  let newest = null;
  let newestPath = null;
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      const relative = full.slice(root.length + 1);
      if (!isRuleBInput(relative)) continue;
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      const mtime = statSyncSafe(full);
      if (mtime !== null && (newest === null || mtime > newest)) {
        newest = mtime;
        newestPath = relative;
      }
    }
  };
  for (const set of RULE_B_PATHS) walk(join(root, set));
  return { newest, newestPath };
}

function statSyncSafe(path) {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return null;
  }
}

// --------------------------------------------------------------- the run ----

/**
 * The whole smoke run: launch, measure, drive the eleven flows, assert, stop.
 *
 * Every flow is attempted in order; a flow that cannot be driven is recorded
 * `NOT RUN` with its cause and the run continues, so one broken screen does not
 * hide the state of the others. The stop is pid-scoped on every path.
 */
async function runSmoke() {
  const appImage = resolveAppImage();
  if (appImage.error !== undefined) {
    fail('smoke appimage', appImage.error);
    notRunRemaining('onboarding', `the AppImage could not be resolved: ${appImage.error}`);
    return;
  }
  pass('smoke appimage', sanitise(appImage.path));

  if (!preflightTools()) {
    notRunRemaining('onboarding', 'a named tool this harness shells out to is absent on this machine');
    return;
  }

  // Freshness before anything is launched: a stale bundle must not be driven and
  // then reported as a pass. Both halves are answered, not asserted in prose.
  const freshness = await ruleBFreshness(appImage.path);
  const history = ruleBHistoryVerdict(freshness);
  check(
    'smoke Rule B freshness: the source set has not moved since the commit the AppImage was built from',
    history.ok,
    history.detail,
  );
  check(
    'smoke the AppImage is newer than the newest Rule B input (fresh-build anchor)',
    freshness.artifactNewer,
    `AppImage mtime ${String(freshness.artifactMtime)} against newest Rule B input ${String(freshness.newestInput)} (${String(freshness.newestInputPath)})`,
  );

  const ollamaBefore = await ollamaAlive();

  let run = null;
  let baselineNames = null;
  let baselineIdentity = null;
  let baselineLock;
  let serverPid = null;
  try {
    run = launchApp(appImage.path);
    const pid = run.child.pid;

    const home = await findAppWindow(pid, 60_000, 'the app window');
    if (home.found === null) {
      // Zero windows on the display is NOT RUN for every flow, each with this
      // cause -- never a pass, and never a bare FAIL that leaves the other ten
      // flows unrecorded.
      const cause =
        `no window named exactly ${APP_WINDOW_NAME} owned by pid ${String(pid)} and at least 400x300 inside the ` +
        `display within 60s while waiting for ${String(home.waitedFor)} (saw ${JSON.stringify(home.seen ?? [])})`;
      notRun('smoke the app window is up, inside the display', cause);
      notRunRemaining('onboarding', cause);
      return;
    }
    check(
      'smoke the app window is up, inside the display',
      true,
      `${String(home.found.width)}x${String(home.found.height)}`,
    );
    const window = home.found;
    process.stdout.write(
      `  window ${String(window.width)}x${String(window.height)} at ${String(window.x)},${String(window.y)} on a ${String(home.display?.width)}x${String(home.display?.height)} display\n`,
    );

    // The scale the app used, from the app's own line. At anything but 1 the
    // client rectangles below are CSS pixels and native coordinates are not.
    const geometry = await appGeometry(run.output, 'smoke');
    if (geometry === null) {
      notRunRemaining('onboarding', 'the shell never printed its window geometry line');
      return;
    }
    process.stdout.write(
      `  the app reports ${String(geometry.physicalWidth)}x${String(geometry.physicalHeight)} physical on a ${String(geometry.displayWidth)}x${String(geometry.displayHeight)} display at scale ${String(geometry.scale)}\n`,
    );
    if (
      !check(
        'smoke the app window is at scale 1',
        geometry.scale === 1,
        `the app reported scale ${String(geometry.scale)}`,
      )
    ) {
      notRunRemaining(
        'onboarding',
        `the app reported scale ${String(geometry.scale)}, so native coordinates are not client pixels`,
      );
      return;
    }

    // The frame-to-client relationship, measured from two captures.
    const rootShot = await captureRoot();
    const windowShot = await captureWindow(window.id);
    if (rootShot === null || windowShot === null) {
      fail('smoke the frame-to-client measurement', 'the display or window capture failed');
      notRunRemaining('onboarding', 'the display or window capture failed, so no click could be grounded');
      return;
    }
    const frameClient = await measureFrameClient(windowShot, rootShot, window);
    if (frameClient === null) {
      fail('smoke the frame-to-client measurement', 'the captures could not be compared');
      notRunRemaining(
        'onboarding',
        'the frame-to-client relationship could not be measured, so no click is grounded',
      );
      return;
    }
    if (frameClient.dx === null) {
      fail(
        'smoke the frame-to-client measurement',
        `${String(frameClient.differing)} pixels differ between the window capture and the display capture cropped at the window geometry; the client origin is not the window origin and no decoration offset is guessed`,
      );
      return;
    }
    pass(
      'smoke the frame-to-client relationship is measured, not assumed',
      `the window capture and the display crop agree on ${String(frameClient.size.width)}x${String(frameClient.size.height)} pixels, so the client origin is the window origin`,
    );

    const owned = await waitForOwnership(30_000, 'smoke the server');
    if (!check('smoke the server answers with this run id', owned, 'no ownership on the sandbox port')) {
      notRunRemaining('onboarding', 'the bundled server never answered with this run id');
      return;
    }

    // The ownership baseline is taken **here**: the first instance exists and has
    // created its own files, so what follows can only be something extra.
    baselineNames = snapshotDataDirNames();
    const proof = ownershipBaselineProof(baselineNames);
    check(
      'smoke the first instance created the C-OWN@1 files (ownership baseline proof)',
      proof.missing.length === 0,
      proof.missing.length === 0
        ? `baseline name set: ${JSON.stringify(baselineNames)}`
        : `absent from the baseline name set: ${proof.missing.join(', ')}`,
    );

    // The baseline's **identity**, which is what a second owner would have to
    // change: a new filename is not how a second server shows up here (D2).
    baselineIdentity = ownershipIdentitySnapshot();
    baselineLock = readLockHolder();
    serverPid = serverPidFromStderr(run.output);
    const baselineHolder = lockHolderCheck(baselineLock, baselineLock, serverPid);
    check(
      "smoke the data folder is locked by this run's own server pid",
      baselineHolder.ok,
      baselineHolder.why,
    );

    // The CSP is asserted over the app's own origin, from inside the harness.
    await assertCsp('smoke');

    // ---- the eleven flows, in order ----
    const ctx = { run, window, offset: frameClient };

    await flowOnboarding(ctx);
    await flowCapture(ctx);
    await flowDraft(ctx);
    await flowRefine(ctx);
    await flowPublishAndCopy(ctx);
    await flowPatientList(ctx);
    await flowPlan(ctx);
    await flowBriefing(ctx);
    await flowBrainstorm(ctx);
    await flowSettings(ctx);
    await flowBackup(ctx);

    // The end of the flows, read **before** the stop: the folder must still be
    // locked by this run's own server, with the nonce it wrote at the baseline.
    // After the stop the lock is legitimately gone (C-OWN@1 rule 5), which is
    // why this question is asked here and the identity one is asked after it.
    if (baselineIdentity !== null) {
      const stillHeld = lockHolderCheck(baselineLock, readLockHolder(), serverPid);
      check(
        "smoke the data folder is still locked by this run's server pid at the end of the flows",
        stillHeld.ok,
        stillHeld.why,
      );
    }
  } finally {
    // The app's own words, always: a row that fails on "no window appeared" is
    // unreadable without them.
    if (run !== null) {
      for (const stream of ['stdout', 'stderr']) {
        const text = (run.output[stream] ?? '').trim();
        if (text !== '') {
          process.stdout.write(`  --- the app's ${stream} (tail) ---\n`);
          for (const line of text.split('\n').slice(-25)) {
            process.stdout.write(`  ${sanitise(line)}\n`);
          }
        }
      }
    }
    // The stop is pid-scoped, in the card's order: SIGTERM to the server pid the
    // shell printed, then SIGKILL on that same pid, then the child pid. Never
    // `pkill`, never a pattern (C-ISO@1 rule 7).
    if (run !== null && serverPid === null) {
      serverPid = serverPidFromStderr(run.output);
    }
    if (run !== null) {
      if (serverPid !== null) {
        const stopped = await stopPid(serverPid, 'the bundled server');
        check(
          'smoke the bundled server is stopped by pid',
          stopped.stopped,
          `pid ${String(serverPid)} did not stop`,
        );
      }
      await stopPid(run.child.pid, 'the shell');
    }
    containment.teardownSync();

    // ---- containment, all five asserted ----
    if (serverPid !== null) {
      check(
        'smoke no server process from the run remains',
        !pidAlive(serverPid),
        `pid ${String(serverPid)} is still alive`,
      );
    }
    if (run !== null) {
      check(
        'smoke the shell is gone',
        !pidAlive(run.child.pid),
        `pid ${String(run.child.pid)} is still alive`,
      );
    }

    if (baselineNames !== null) {
      const after = snapshotDataDirNames();
      const own = ownershipContainment(baselineNames, after);
      check(
        'smoke no second lock, database, -wal or -shm',
        own.secondOwned.length === 0,
        own.secondOwned.length === 0
          ? `none of the four C-OWN@1 names (${own.owned.join(', ')}) appeared beside the ` +
              `${String(baselineNames.length)}-name baseline` +
              (own.otherNew.length === 0
                ? ''
                : `; the run's own other output, which is not ownership, was: ${own.otherNew.join(', ')}`)
          : `a second owner appeared beside the baseline: ${own.secondOwned.join(', ')}`,
      );
      check(
        'smoke the data folder was not emptied behind the baseline',
        own.vanished.length === 0,
        own.vanished.length === 0
          ? 'the baseline name set is intact'
          : `gone from the baseline: ${own.vanished.join(', ')}`,
      );

      // The falsifiable half (D2): the four files' **identity**, and the lock
      // holder. A second owner cannot introduce a new filename into this folder,
      // so the name set above cannot see one; it would have to replace the lock
      // or the database, and a replaced file has a different device+inode.
      if (baselineIdentity !== null) {
        const identity = ownershipIdentityDiff(baselineIdentity, ownershipIdentitySnapshot());
        check(
          'smoke the C-OWN@1 files are still the ones this run created (device+inode)',
          identity.ok,
          identity.why,
        );
      } else {
        notRun(
          'smoke the C-OWN@1 files are still the ones this run created (device+inode)',
          'the app never reached ownership, so no baseline identity was recorded to compare against',
        );
      }
    } else {
      notRun(
        'smoke no second lock, database, -wal or -shm',
        'the app never reached ownership, so there is no post-first-instance baseline to compare against',
      );
    }

    const free = await isPortFree(sandboxPort());
    check('smoke the port is released', free, `127.0.0.1:${String(sandboxPort())} is still bound`);

    const channel = observationChannelGone();
    check(
      'smoke the observation channel is gone from the bundle',
      channel.unreadable === null && channel.occurrences === 0,
      channel.unreadable !== null
        ? `the scan could not be completed, so the channel is NOT asserted gone: ${channel.unreadable}`
        : `${String(channel.occurrences)} occurrences of P3.4's marker path or gate string across ${String(channel.files)} bundle scripts in web/dist/assets`,
    );

    const ollamaAfter = await ollamaAlive();
    check(
      'smoke ollama is still running',
      ollamaBefore && ollamaAfter,
      `before ${String(ollamaBefore)}, after ${String(ollamaAfter)}`,
    );
  }
}

// -------------------------------------------------------------- flows ------
//
// Each flow drives a **real UI action** — a measured click at a uniquely
// identified control, or the app's own keyboard — and then reads **two** things
// that only exist once that action landed:
//
// 1. a **pane-only label**, read offline out of a fresh screenshot by
//    `tesseract`, unique on screen (zero or several matches is a refusal), and
// 2. the **resulting application fact** over the app's own origin.
//
// An API read that was already true before the action proves nothing about the
// screen and is never the assertion. A flow whose action could not be grounded,
// or whose pane never appeared, records `NOT RUN` with the count it saw.
//
// The labels below are quoted from `shared/src/i18n/en.ts` and the components
// that render them, so each is a real string on a real pane rather than an
// invented one — and each was chosen because it renders **exactly once** on the
// screen it is read on. `UI_LABELS` carries that proof next to every string: the
// i18n key, the file and line that renders it, and the fact that no other line in
// that file renders the same key. A screen that carries the same string twice is
// where the pane has two openers, and those are handled by `openWorkspacePane`,
// never by picking one of two boxes.

/**
 * Every label this harness grounds a click or a pane on, with its source.
 *
 * `i18nLine` is the line in `shared/src/i18n/en.ts` that defines the key, `file`
 * is the component that renders it and `line` the line in **that** file. Both are
 * asserted by the helper tests against the tree, so a label cannot drift away
 * from the string the app renders without this file failing a check.
 */
const UI_LABELS = {
  /** F1: the add-patient screen. `patients.add` is there **twice** (the h2 at
   * `AddPatient.tsx:92` and the submit button at `:152`), so it is not a
   * pane-only label; the identifier field's own label renders once. */
  onboardingPane: {
    key: 'patients.identifierLabel',
    text: 'Identifier (optional)',
    // Re-pinned 2026-10-05: the Setup/About/Licences screens were removed and
    // their catalogue blocks with them, moving every pin above the deleted
    // `about.` block. A pin correction only -- the assertion the helper test
    // makes is unchanged, and a further move still fails that test loudly.
    i18nLine: 2172,
    file: 'web/src/routes/AddPatient.tsx',
    line: 128,
  },
  /** F3: the capture screen's waiting state, U+2026 and all. */
  captureListening: {
    key: 'capture.listening',
    text: 'Listening for words…',
    i18nLine: 1031,
    file: 'web/src/components/LiveRecording.tsx',
    line: 74,
  },
  /** F2: the refine composer's placeholder, three ASCII dots and all. */
  refinePlaceholder: {
    key: 'refine.inputPlaceholder',
    text: 'Ask a question or give feedback...',
    i18nLine: 1079,
    file: 'web/src/components/RefineColumn.tsx',
    line: 284,
  },
  /** F4: the plan pane's empty-state control, inside the pane. */
  planStart: {
    key: 'plan.start',
    text: 'Start a plan',
    i18nLine: 1909,
    file: 'web/src/components/PlanView.tsx',
    line: 348,
  },
  /** F4: the notes column's plan switch, the control that **opens** the pane. */
  planSwitch: {
    key: 'plan.title',
    text: 'Treatment plan',
    i18nLine: 1837,
    file: 'web/src/components/NotesColumn.tsx',
    line: 111,
  },
  /** F4/F5: the welcome card's own hint line, unique on every screen it is on. */
  planCardHint: {
    key: 'workspace.cardPlanHint',
    text: 'Set goals and track progress.',
    i18nLine: 1754,
    file: 'web/src/components/PatientWelcome.tsx',
    line: 73,
  },
  /** F5: the notes column's briefing switch. */
  prepSwitch: {
    key: 'notes.prepareForSession',
    text: 'Prepare for session',
    i18nLine: 1536,
    file: 'web/src/components/NotesColumn.tsx',
    line: 122,
  },
  /** F5: the welcome card's briefing hint. */
  prepCardHint: {
    key: 'workspace.cardPrepHint',
    text: 'A short summary before you see them.',
    i18nLine: 1755,
    file: 'web/src/components/PatientWelcome.tsx',
    line: 79,
  },
  /** F5: the notes column's brainstorm switch. */
  brainstormSwitch: {
    key: 'brainstorm.title',
    text: 'Brainstorm',
    i18nLine: 1764,
    file: 'web/src/components/NotesColumn.tsx',
    line: 100,
  },
  /** F5: the welcome card's brainstorm hint. */
  brainstormCardHint: {
    key: 'workspace.cardBrainstormHint',
    text: 'Think through the case out loud with the assistant.',
    i18nLine: 1753,
    file: 'web/src/components/PatientWelcome.tsx',
    line: 67,
  },
  /** F6/D1: the modal's **own nav title**. Chosen for a stated reason, and the
   * reason is in `renderPath` below rather than in a count of lines: nothing
   * between the modal root and this `<h2>` can decide not to render it.
   *
   * The label this replaced (`settings.draftingModel`, `Settings.tsx:357`) was
   * inside `LlmProfileSettings`, which returns `null` whenever the server
   * publishes fewer than two LLM profiles (`Settings.tsx:326`) — and it publishes
   * exactly one, `quick` (`server/src/ai/profiles.ts:17-19`, `:186`, `:214`), in
   * fake and real mode alike, so that heading is never on screen. `settings.
   * appearance` is no use either: the nav label (`:85`, rendered at `:169`) and
   * the section heading (`:455`) are both on the modal at once, so grounding on
   * it refuses a healthy screen.
   *
   * `doc.settings` is on screen exactly once in the state this flow drives: the
   * rail's Settings entry (`PatientsColumn.tsx:438`) is inside `{open && (`
   * (`:428`) and its `choose()` calls `setOpen(false)` **before** the action
   * (`:403-408`), so the menu is closed by the time the modal is up; the
   * `Dialog`'s own `title={t('common.settings')}` is passed with
   * `showTitle={false}` (`Workspace.tsx:804`, `:806`; `Dialog.tsx:152-156`), so
   * it becomes an `aria-label` (`Dialog.tsx:148`) and is not on the screen; and
   * the only other visible `Settings` strings live on other routes
   * (`Import.tsx`, `HalaxyImport.tsx`), none of which is mounted over the
   * workspace.
   */
  settingsPane: {
    key: 'doc.settings',
    text: 'Settings',
    i18nLine: 1303,
    file: 'web/src/routes/Settings.tsx',
    line: 168,
    /** Every hop from the modal root to this label, and every gate on it. */
    renderPath: [
      {
        file: 'web/src/components/PatientsColumn.tsx',
        line: 405,
        gate: 'setOpen(false)',
        because:
          'the rail menu entry closes its own menu before opening the modal, so the entry’s ' +
          '"Settings" is off screen by the time the modal is up',
      },
      {
        file: 'web/src/routes/Workspace.tsx',
        line: 608,
        gate: '{sidebarCollapsed && (',
        because:
          'the rail is what the flow drives (Tab to the rail’s mission control, then Return), so the ' +
          'rail is mounted; the expanded sidebar’s MissionControl carries the same menu and the same ' +
          '`choose`, so either state reaches the same two lines',
      },
      {
        file: 'web/src/routes/Workspace.tsx',
        line: 615,
        gate: 'onOpenSettings={() => {',
        because: 'the rail’s callback is the only writer of `settingsOpen`, and it writes `true`',
      },
      {
        file: 'web/src/routes/Workspace.tsx',
        line: 755,
        gate: '{settingsOpen && (',
        because:
          'the one condition on the whole modal, and it is true **because of the click this flow ' +
          'drives** — not because of anything the environment happens to hold',
      },
      {
        file: 'web/src/routes/Workspace.tsx',
        line: 756,
        gate: '<Suspense fallback={null}>',
        because:
          '`SettingsModalPanel` is lazily imported (`Workspace.tsx:58-60`), so this is a real ' +
          'suspense boundary: the label is absent for as long as the chunk takes and present after. ' +
          'The flow waits for the label rather than for a fixed delay',
      },
      {
        file: 'web/src/routes/Workspace.tsx',
        line: 800,
        gate: 'function SettingsModal(',
        because: 'its own body is a single unconditional return (`:802-813`), with no `if` in it',
      },
      {
        file: 'web/src/routes/Workspace.tsx',
        line: 806,
        gate: 'showTitle={false}',
        because:
          'this is what keeps the Dialog’s own `Settings` title off screen, so the modal nav title ' +
          'is the only visible one (`Dialog.tsx:148` renders it as an aria-label instead)',
      },
      {
        file: 'web/src/components/Dialog.tsx',
        line: 152,
        gate: '{showTitle && (',
        because:
          'the only conditional between the Dialog root and its children, and it gates the *other* ' +
          'title; `{children}` at `:157` is unconditional',
      },
      {
        file: 'web/src/components/Dialog.tsx',
        line: 157,
        gate: '{children}',
        because: 'unconditional, and `open` defaults to true (`:38`) with no `open={false}` passed',
      },
      {
        file: 'web/src/routes/Settings.tsx',
        line: 161,
        gate: 'export function SettingsModalPanel(',
        because:
          'its own body has no `if` and no early return at all (`:161-198`): one return at `:165`, ' +
          'and the label is the second child inside it',
      },
      {
        file: 'web/src/routes/Settings.tsx',
        line: 167,
        gate: '<nav className="settings-nav"',
        because:
          'the label sits inside the nav, which is **outside** `SettingsSections` — so neither the ' +
          "open-section gate (`:210`, `show.includes('appearance')`) nor anything `SettingsSections` " +
          'renders can decide whether it appears',
      },
    ],
    /** Every statement at the component body's own indent that can gate a hop. */
    bodyGates: [
      {
        file: 'web/src/routes/Workspace.tsx',
        component: 'export function Workspace(',
        componentLine: 73,
        target: 758,
        gates: [
          { line: 173, kind: 'bookkeeping', text: 'if (lastNotesPatientRef.current !== patientId) {' },
          { line: 177, kind: 'bookkeeping', text: "if (notes.state.status === 'ready')" },
          {
            line: 514,
            kind: 'guard',
            text: 'if (serverUnavailable) {',
            because:
              'it returns a whole-app error screen (`Workspace.tsx:516-523`). If it fired, no flow ' +
              'could be driven at all: the window would carry "Apunta cannot reach the server" and ' +
              'none of the eleven screens would exist',
          },
          {
            line: 528,
            kind: 'guard',
            text: "if (formats.state.status === 'ready' && formats.state.data.length === 0) {",
            because:
              'it redirects the whole app to onboarding (`Workspace.tsx:530`). The workspace is only ' +
              'reached once a note format exists, and this flow runs nine flows after the onboarding ' +
              'flow created one',
          },
          { line: 531, kind: 'return', text: 'return (' },
        ],
      },
      {
        file: 'web/src/routes/Workspace.tsx',
        component: 'function SettingsModal(',
        componentLine: 800,
        target: 803,
        gates: [{ line: 802, kind: 'return', text: 'return (' }],
      },
      {
        file: 'web/src/components/Dialog.tsx',
        component: 'export function Dialog({',
        componentLine: 29,
        target: 157,
        gates: [{ line: 128, kind: 'return', text: 'return (' }],
      },
      {
        file: 'web/src/routes/Settings.tsx',
        component: 'export function SettingsModalPanel(',
        componentLine: 161,
        target: 168,
        gates: [{ line: 165, kind: 'return', text: 'return (' }],
      },
    ],
  },
};

/**
 * The label every remaining flow grounds its control on, with its source: the
 * labels the repair did **not** have to change, kept here so the whole set of
 * grounded strings is in one place and the helper tests can check all of them.
 */
const FLOW_LABELS = {
  onboardingFormat: {
    key: 'format.addTitle',
    text: 'Add your note format',
    file: 'web/src/routes/OnboardingFormat.tsx',
    line: 115,
  },
  draftChip: {
    key: 'note.draftChip',
    text: 'Draft',
    file: 'web/src/components/NotesColumn.tsx',
    line: 185,
  },
  publish: {
    key: 'note.finishAndCopy',
    text: 'Finish & copy',
    file: 'web/src/components/NoteView.tsx',
    line: 694,
  },
  editAgain: {
    key: 'note.editAgain',
    text: 'Edit again',
    file: 'web/src/components/NoteView.tsx',
    line: 694,
  },
  copy: { key: 'note.copy', text: 'Copy', file: 'web/src/components/NoteView.tsx', line: 678 },
  copied: { key: 'note.copied', text: 'Copied', file: 'web/src/components/NoteView.tsx', line: 678 },
  /** The fabricated seed's own name, not an i18n string (HS-8). */
  patientRow: { key: null, text: PATIENT_NAME, file: null, line: null },
  recents: {
    key: 'patients.recents',
    text: 'Recents',
    file: 'web/src/components/PatientsColumn.tsx',
    line: 1348,
  },
  planGoals: { key: 'plan.goals', text: 'Goals', file: 'web/src/components/PlanView.tsx', line: 376 },
  prepHeading: {
    key: 'prep.title',
    text: 'Before this session',
    file: 'web/src/components/PrepView.tsx',
    line: 130,
  },
  brainstormEmpty: {
    key: 'brainstorm.empty',
    text: 'Think out loud about',
    file: 'web/src/components/BrainstormView.tsx',
    line: 181,
  },
  settingsMenu: {
    key: 'common.settings',
    text: 'Settings',
    file: 'web/src/components/PatientsColumn.tsx',
    line: 438,
  },
  backupTab: {
    key: 'settings.backup',
    text: 'Backup',
    file: 'web/src/routes/Settings.tsx',
    line: 87,
  },
  backupNow: {
    key: 'backup.now',
    text: 'Back up now',
    file: 'web/src/components/BackupCard.tsx',
    line: 197,
  },
};

/**
 * The three panes that are opened from the workspace rather than from inside
 * themselves, each with the two on-screen openers and which of them is unique.
 *
 * The notes column's switch (`NotesColumn.tsx:100`, `:111`, `:122`) and the
 * patient's welcome card (`PatientWelcome.tsx:66`, `:72`, `:78`) carry the **same
 * label** for each of the three panes, and the workspace renders the welcome
 * **beside** the notes column whenever a patient is open with no note
 * (`Workspace.tsx:625` and `:713`), so with the welcome up the switch's label is
 * on screen twice and refusing it is correct. The welcome card's **hint** is on
 * screen exactly once in that state, and the whole card is one button, so
 * clicking the hint opens the same pane. Once a pane is open the welcome is not
 * rendered at all (`Workspace.tsx:706-711`), the switch's label is unique, and
 * the hint is not on screen — which is why both paths are real UI actions on a
 * uniquely identified control and neither is ever a choice between two boxes of
 * the same label.
 */
const PANE_OPENERS = {
  plan: { switch: UI_LABELS.planSwitch, cardHint: UI_LABELS.planCardHint },
  prep: { switch: UI_LABELS.prepSwitch, cardHint: UI_LABELS.prepCardHint },
  brainstorm: { switch: UI_LABELS.brainstormSwitch, cardHint: UI_LABELS.brainstormCardHint },
};

/** Confirms a pane by its pane-only label, or records why it is not confirmed. */
async function confirmPane(window, flow, phrase, timeoutMs = 8000) {
  const seen = await waitForScreenLabel(window, phrase, timeoutMs);
  if (seen.seen) return true;
  recordFlow(
    flow,
    'NOT RUN',
    `the pane label ${JSON.stringify(phrase)} never appeared: ${seen.why ?? 'unknown'}`,
  );
  notRun(flow, `the pane label ${JSON.stringify(phrase)} never appeared: ${seen.why ?? 'unknown'}`);
  return false;
}

/**
 * Which of a pane's two on-screen openers this screen identifies uniquely.
 *
 * Pure, so the choice is testable without a display: it takes the word list and
 * the pane's two labels and answers `switch`, `card` or `null` with both reasons.
 */
function choosePaneOpener(words, pane) {
  const asSwitch = groundPhrase(words, pane.switch.text);
  if (asSwitch.box !== null) return { opener: 'switch', box: asSwitch.box, why: asSwitch.why };
  const asCard = groundPhrase(words, pane.cardHint.text);
  if (asCard.box !== null) return { opener: 'card', box: asCard.box, why: asCard.why };
  return {
    opener: null,
    box: null,
    why: `${pane.switch.text}: ${asSwitch.why}; ${pane.cardHint.text}: ${asCard.why}`,
  };
}

/**
 * Opens one of the workspace's panes through a control that is unique on the
 * screen it is clicked on.
 *
 * The pane has two on-screen openers and which one is unique depends on the
 * screen the workspace is in (see `PANE_OPENERS`): the notes column's switch, and
 * the patient's welcome card, which carry the same label and are rendered
 * together whenever a patient is open with no note. So this reads the screen
 * **once** and:
 *
 * 1. grounds the switch's label — clicked when it appears exactly once, which is
 *    every screen where the welcome is not up;
 * 2. otherwise grounds the welcome card's **hint** line, which appears exactly
 *    once in that state and is inside the card's own button, so clicking it opens
 *    the same pane;
 * 3. otherwise records `NOT RUN` with **both** reasons, so a refusal is still
 *    fail-closed.
 *
 * Both paths are a real UI action at a measured centre of a uniquely identified
 * label: neither is a choice between two boxes of the same label, and neither is
 * an API call standing in for a click.
 */
async function openWorkspacePane(ctx, pane, what) {
  const { window } = ctx;
  const shot = await captureWindow(window.id);
  if (shot === null) return { opened: false, why: 'the window capture failed' };
  const words = await screenWords(shot);
  if (words === null) return { opened: false, why: 'tesseract read no words out of the window capture' };

  const chosen = choosePaneOpener(words, pane);
  if (chosen.box === null) return { opened: false, why: chosen.why };
  const result = await clickGroundedBox(window, ctx.offset, chosen.box, `${what} ${chosen.opener}`);
  return { opened: result.clicked, why: chosen.why, opener: chosen.opener };
}

/** The onboarding Continue button: the app creates its standard format itself. */
async function flowOnboarding(ctx) {
  const { window } = ctx;
  const shot = await captureWindow(window.id);
  if (shot === null) {
    recordFlow('onboarding', 'NOT RUN', 'the window capture failed');
    notRun('onboarding', 'the window capture failed');
    return;
  }
  // The onboarding screen is the one that asks for a note format
  // (`format.addTitle`, `routes/OnboardingFormat.tsx:115`).
  const onScreen = await waitForScreenLabel(window, FLOW_LABELS.onboardingFormat.text, 4000);
  if (!onScreen.seen) {
    recordFlow(
      'onboarding',
      'NOT RUN',
      `the onboarding screen was not the first screen shown: ${onScreen.why ?? 'unknown'}`,
    );
    notRun(
      'onboarding',
      `the onboarding screen was not the first screen shown: ${onScreen.why ?? 'unknown'}`,
    );
    return;
  }

  // Continue is the only primary action on that screen, so it is the largest
  // accent cluster — and only when it is unambiguously the largest.
  const clusters = await findClusters(shot, ACCENT);
  const picked = pickPrimaryCluster(clusters, 'the onboarding Continue button');
  if (picked.cluster === null) {
    recordFlow('onboarding', 'NOT RUN', picked.why);
    notRun('onboarding', picked.why);
    return;
  }
  const clicked = await clickCluster(window, ctx.offset, picked.cluster, 'the onboarding Continue button');
  if (!clicked) {
    recordFlow('onboarding', 'FAIL', 'the Continue click could not be issued');
    return;
  }
  pass('onboarding the Continue click is grounded in a unique accent cluster', picked.why);

  // The screen the action lands on: the add-patient dialog. Its own title
  // (`patients.add`) is on that screen **twice** — the dialog's h2
  // (`AddPatient.tsx:92`) and the submit button (`AddPatient.tsx:152`) — so the
  // label this confirms the screen with is the identifier field's, which renders
  // once (`AddPatient.tsx:128`).
  if (!(await confirmPane(window, 'onboarding', UI_LABELS.onboardingPane.text))) return;

  // The fact the action produces: the app created the standard format itself.
  // Before Continue there is no format at all, so this is not a pre-existing
  // truth — it is what the click made true.
  const formats = await formatsList();
  requireFlow(
    'onboarding',
    'the app created its standard format',
    formats !== null && formats.length > 0,
    formats === null ? 'GET /api/formats did not answer with a list' : `${String(formats.length)} formats`,
  );
  saveEvidenceScreenshot(window.id, 'onboarding');
}

/** The capture flow: a fixture recording played into the virtual source. */
async function flowCapture(ctx) {
  const { window } = ctx;

  // The patient is the one fabricated seed this card allows (HS-8): created
  // through the API, never through the UI, so the capture screen is reached by
  // the app's own path rather than by a harness-written state.
  const patient = await apiPost('/api/patients', { name: PATIENT_NAME, identifier: null });
  if (!patient.ok || patient.body === null) {
    recordFlow(
      'capture',
      'NOT RUN',
      `POST /api/patients answered ${String(patient.status)}, so there is no patient to capture for`,
    );
    notRun(
      'capture',
      `POST /api/patients answered ${String(patient.status)}, so there is no patient to capture for`,
    );
    return;
  }
  const patientId = patient.body.id;

  // The microphone containment, reused from P3.5: a virtual sink whose remap
  // source becomes the default capture device, so the app records the fixture
  // and the owner's physical microphone is never read. The read-back is the
  // guard — anything other than the virtual source stops the flow.
  let created;
  try {
    created = await containment.create();
  } catch (error) {
    recordFlow('capture', 'NOT RUN', `microphone containment: ${String(error?.message ?? error)}`);
    notRun('capture', `microphone containment: ${String(error?.message ?? error)}`);
    return;
  }
  pass('capture the virtual source is the default, read back', String(created.readBack));

  // The fixture is played into the virtual sink before the record click, so the
  // frames the app captures are already in flight when the graph comes up.
  const fixture = fixtureAudio();
  let playback;
  try {
    if (!existsSync(fixture)) throw new Error(`no fixture at ${sanitise(fixture)}`);
    playback = startPlayback(fixture);
  } catch (error) {
    recordFlow('capture', 'NOT RUN', `playback: ${String(error?.message ?? error)}`);
    notRun('capture', `playback: ${String(error?.message ?? error)}`);
    return;
  }

  // Reach the capture screen through the home screen's own keyboard path: the
  // "note" action card is the first focusable control on the home screen, the
  // patient picker's search field is auto-focused, and Return chooses the
  // highlighted patient. No coordinates are involved.
  await pressKey(['Tab'], 'Tab to the home note action');
  await pressKey(['Return'], 'Return to open the patient picker');
  await sleep(1200);
  if (!(await typeText(PATIENT_NAME, 'the patient name into the home search'))) {
    recordFlow('capture', 'FAIL', 'the patient name could not be typed into the home search');
    return;
  }
  await sleep(800);
  await pressKey(['Return'], 'Return to choose the highlighted patient');
  await sleep(2000);

  // The capture screen is confirmed by its own label (`capture.listening`,
  // `shared/src/i18n/en.ts:1010`, quoted with its U+2026) before anything is
  // recorded, so a screen that was never reached cannot produce a note. The
  // waiting line renders it inside a `<span>` (`LiveRecording.tsx:74`) once; the
  // second reference on that line is the thinking dots' **aria** label, which is
  // not on the screen.
  if (!(await confirmPane(window, 'capture', UI_LABELS.captureListening.text))) return;

  // The record control is a large option tile and the first focusable control on
  // the screen, so it is reached by the app's own keyboard.
  await pressKey(['Tab'], 'Tab to the record control');
  await pressKey(['Return'], 'Return to start recording');
  await sleep(2500);

  // While the app records, no stream may sit on the owner's microphone. The
  // read resolves the source table, so a device with another name is still
  // covered, and an unresolvable row stops the flow.
  await assertNoPhysicalStream('capture while recording');

  // The stop-and-draft button is the primary action while recording: find it by
  // colour and click it, refusing an ambiguous screen.
  const recording = await captureWindow(window.id);
  if (recording === null) {
    recordFlow('capture', 'NOT RUN', 'the window capture failed while recording');
    notRun('capture', 'the window capture failed while recording');
    return;
  }
  const stopClusters = await findClusters(recording, ACCENT);
  const stopPicked = pickPrimaryCluster(stopClusters, 'the stop-and-draft button');
  if (stopPicked.cluster === null) {
    recordFlow('capture', 'NOT RUN', stopPicked.why);
    notRun('capture', stopPicked.why);
    return;
  }
  if (!(await clickCluster(window, ctx.offset, stopPicked.cluster, 'the stop-and-draft button'))) {
    recordFlow('capture', 'FAIL', 'the stop-and-draft click could not be issued');
    return;
  }

  // Stop the playback by pid (it is a 10 s fixture; the recording is shorter).
  if (playback !== null) await stopPid(playback.pid, 'the fixture playback');

  // The fact: a note row exists for this patient, in draft status. It did not
  // before the record/stop clicks, so it is what they produced.
  const deadline = Date.now() + 30_000;
  let notes = null;
  for (;;) {
    const read = await notesFor(patientId);
    if (read !== null && read.length > 0) {
      notes = read;
      break;
    }
    if (Date.now() >= deadline) break;
    await sleep(500);
  }
  const draftNote = notes?.find((note) => note.status === 'draft') ?? null;
  requireFlow(
    'capture',
    'a draft note row was created for the patient by the record and stop clicks',
    draftNote !== null,
    notes === null
      ? 'GET /api/patients/:id/notes did not answer with a list'
      : `${String(notes.length)} notes, none in draft status`,
  );
  saveEvidenceScreenshot(window.id, 'capture');
  ctx.patientId = patientId;
}

/** The draft flow: the drafted note's screen is opened and its sections are read. */
async function flowDraft(ctx) {
  const { window } = ctx;
  const patients = await patientsList();
  if (patients === null || patients.length === 0) {
    recordFlow('draft', 'NOT RUN', 'no patient exists, so there is no draft to open');
    notRun('draft', 'no patient exists, so there is no draft to open');
    return;
  }
  const notes = await notesFor(patients[0].id);
  if (notes === null || notes.length === 0) {
    recordFlow('draft', 'NOT RUN', 'no note exists for the patient');
    notRun('draft', 'no note exists for the patient');
    return;
  }

  // The real action: click the drafted note's own row in the notes column. The
  // `Draft` chip (`note.draftChip`, `NotesColumn.tsx:185`) identifies it, and a
  // screen with two draft rows is refused rather than guessed at.
  const opened = await clickScreenLabel(
    window,
    ctx.offset,
    FLOW_LABELS.draftChip.text,
    "the drafted note's row",
  );
  if (!opened.clicked) {
    recordFlow('draft', 'NOT RUN', `the drafted note's row could not be grounded: ${opened.why}`);
    notRun('draft', `the drafted note's row could not be grounded: ${opened.why}`);
    return;
  }
  await sleep(1200);

  // The screen itself: the draft screen carries the refine column, whose
  // composer placeholder (`refine.inputPlaceholder`,
  // `shared/src/i18n/en.ts:1058`, `RefineColumn.tsx:284`) no other screen
  // renders. It is quoted with its three ASCII dots.
  if (!(await confirmPane(window, 'draft', UI_LABELS.refinePlaceholder.text))) return;

  const note = await noteById(notes[0].id);
  requireFlow(
    'draft',
    'the opened draft note carries its sections',
    note !== null &&
      note.content !== undefined &&
      note.content !== null &&
      String(note.content).includes('Subjective'),
    note === null
      ? 'the note could not be read back'
      : `note content ${String(note.content).includes('Subjective') ? 'carries' : 'does not carry'} the Subjective section`,
  );
  saveEvidenceScreenshot(window.id, 'draft');
  ctx.noteId = notes[0].id;
}

/** The refine flow: the refine chat is typed into and the note is updated. */
async function flowRefine(ctx) {
  const { window } = ctx;
  if (ctx.noteId === undefined) {
    recordFlow('refine', 'NOT RUN', 'no note was opened by the draft flow, so there is nothing to refine');
    notRun('refine', 'no note was opened by the draft flow, so there is nothing to refine');
    return;
  }
  const before = await noteById(ctx.noteId);

  // The real action: the refine composer is filled through the app's own
  // keyboard and sent with Return — the app's own send path, not a synthesised
  // event.
  if (!(await typeText('Make it warmer', 'the refine message'))) {
    recordFlow('refine', 'FAIL', 'the refine message could not be typed');
    return;
  }
  await sleep(500);
  await pressKey(['Return'], 'Return to send the refine message');
  await sleep(2500);

  // The screen: the refine column is still the pane the message was sent from.
  if (!(await confirmPane(window, 'refine', UI_LABELS.refinePlaceholder.text))) return;
  saveEvidenceScreenshot(window.id, 'refine');

  // The fact the send produces: the note moved. Before the send it was read and
  // held, so this is a comparison against the pre-action state.
  const deadline = Date.now() + 30_000;
  let after;
  for (;;) {
    after = await noteById(ctx.noteId);
    if (
      after !== null &&
      before !== null &&
      (after.content !== before.content || after.updated_at !== before.updated_at)
    ) {
      break;
    }
    if (Date.now() >= deadline) break;
    await sleep(500);
  }
  requireFlow(
    'refine',
    'the note was updated by the refine message',
    after !== null &&
      before !== null &&
      (after.content !== before.content || after.updated_at !== before.updated_at),
    after === null || before === null
      ? 'the note could not be read back after the refine'
      : 'the note content and revision did not move after the refine message',
  );
}

/** Publish and copy: the note is published, then the Copied control shows. */
async function flowPublishAndCopy(ctx) {
  const { window } = ctx;
  if (ctx.noteId === undefined) {
    recordFlow(
      'publish+copy',
      'NOT RUN',
      'no note was opened by the draft flow, so there is nothing to publish',
    );
    notRun('publish+copy', 'no note was opened by the draft flow, so there is nothing to publish');
    return;
  }
  const noteId = ctx.noteId;

  // The real action, on the control's own label: `Finish & copy`
  // (`note.finishAndCopy`, `NoteView.tsx:694`).
  const publishedClick = await clickScreenLabel(
    window,
    ctx.offset,
    FLOW_LABELS.publish.text,
    'the publish control',
  );
  if (!publishedClick.clicked) {
    recordFlow('publish+copy', 'NOT RUN', `the publish control could not be grounded: ${publishedClick.why}`);
    notRun('publish+copy', `the publish control could not be grounded: ${publishedClick.why}`);
    return;
  }
  await sleep(2500);

  // The visual state the click produced: the control's own label changed to
  // `Edit again` (`note.editAgain`). That is a control-specific string, not a
  // colour count.
  const editAgain = await waitForScreenLabel(window, FLOW_LABELS.editAgain.text, 8000);
  const published = await noteById(noteId);
  requireFlow(
    'publish+copy',
    'the note is published and the control shows Edit again',
    editAgain.seen && published !== null && published.status === 'published',
    !editAgain.seen
      ? `the control did not change to Edit again: ${String(editAgain.why ?? 'unknown')}`
      : published === null
        ? 'the note could not be read back'
        : `status was ${String(published.status)}`,
  );

  // Copy: the control's own label (`note.copy`) becomes `note.copied`. This is
  // the Copied **state**, read off the screen; the host clipboard is not read
  // and nothing is claimed about it.
  const copyClick = await clickScreenLabel(window, ctx.offset, FLOW_LABELS.copy.text, 'the copy control');
  if (!copyClick.clicked) {
    recordFlow('publish+copy', 'FAIL', `the copy control could not be grounded: ${copyClick.why}`);
    return;
  }
  const copied = await waitForScreenLabel(window, FLOW_LABELS.copied.text, 6000);
  requireFlow(
    'publish+copy',
    'the copy control shows Copied',
    copied.seen,
    `the control's label never became Copied: ${String(copied.why ?? 'unknown')}`,
  );
  saveEvidenceScreenshot(window.id, 'publish-copy');
}

/** The patient list: the workspace's own patient directory, opened by a row click. */
async function flowPatientList(ctx) {
  const { window } = ctx;
  // The real action: click the fabricated patient's own row in the directory.
  const opened = await clickScreenLabel(window, ctx.offset, FLOW_LABELS.patientRow.text, "the patient's row");
  if (!opened.clicked) {
    recordFlow('patient list', 'NOT RUN', `the patient's row could not be grounded: ${opened.why}`);
    notRun('patient list', `the patient's row could not be grounded: ${opened.why}`);
    return;
  }
  await sleep(1200);

  // The screen: the directory's own section labels (`patients.recents`,
  // `PatientsColumn.tsx:1344`), which no other screen renders.
  const recents = await waitForScreenLabel(window, FLOW_LABELS.recents.text, 8000);
  if (!recents.seen) {
    recordFlow(
      'patient list',
      'NOT RUN',
      `the patient directory was not shown: ${String(recents.why ?? 'unknown')}`,
    );
    notRun('patient list', `the patient directory was not shown: ${String(recents.why ?? 'unknown')}`);
    return;
  }
  const patients = await patientsList();
  requireFlow(
    'patient list',
    'the directory lists the patient whose row was clicked',
    patients !== null && patients.some((patient) => patient.name === PATIENT_NAME),
    patients === null
      ? 'GET /api/patients did not answer with a list'
      : `${String(patients.length)} patients, none named ${PATIENT_NAME}`,
  );
  saveEvidenceScreenshot(window.id, 'patient-list');
}

/** The plan view: the workspace's plan pane, with a plan the click created. */
async function flowPlan(ctx) {
  const { window } = ctx;
  const patients = await patientsList();
  if (patients === null || patients.length === 0) {
    recordFlow('plan', 'NOT RUN', 'no patient exists, so there is no plan to open');
    notRun('plan', 'no patient exists, so there is no plan to open');
    return;
  }
  // First the pane is **opened**, by whichever of its two on-screen openers is
  // unique on the screen the workspace is in (`openWorkspacePane`). `Start a
  // plan` (`plan.start`, `PlanView.tsx:348`) is the pane's own empty-state
  // control, so it is only on screen once the pane is open — clicking it without
  // opening the pane first was a label that is never there.
  const openedPane = await openWorkspacePane(ctx, PANE_OPENERS.plan, 'the plan pane');
  if (!openedPane.opened) {
    recordFlow('plan', 'NOT RUN', `the plan pane could not be opened by a unique control: ${openedPane.why}`);
    notRun('plan', `the plan pane could not be opened by a unique control: ${openedPane.why}`);
    return;
  }
  pass(
    'plan the pane was opened by a uniquely identified control',
    `${openedPane.opener}: ${openedPane.why}`,
  );
  await sleep(2000);

  // Then the real action, on the pane's own empty-state control: clicking it
  // makes a plan exist, so the fact below is produced by the click rather than
  // being an always-present envelope.
  const started = await clickScreenLabel(
    window,
    ctx.offset,
    UI_LABELS.planStart.text,
    'the start-a-plan control',
  );
  if (!started.clicked) {
    recordFlow('plan', 'NOT RUN', `the start-a-plan control could not be grounded: ${started.why}`);
    notRun('plan', `the start-a-plan control could not be grounded: ${started.why}`);
    return;
  }
  await sleep(2000);

  // The screen: the plan's own goals heading (`plan.goals`), which only the plan
  // pane renders.
  const goals = await waitForScreenLabel(window, FLOW_LABELS.planGoals.text, 8000);
  if (!goals.seen) {
    recordFlow('plan', 'NOT RUN', `the plan pane did not show: ${String(goals.why ?? 'unknown')}`);
    notRun('plan', `the plan pane did not show: ${String(goals.why ?? 'unknown')}`);
    return;
  }

  // The fact: a plan now exists. `GET …/plan` answers `{ plan: null, goals: [] }`
  // when there is none, so the envelope alone proves nothing — the plan itself
  // is the assertion.
  const plan = await planFor(patients[0].id);
  requireFlow(
    'plan',
    "the plan pane created the patient's plan",
    plan !== null && plan.plan !== null && plan.plan !== undefined,
    plan === null
      ? 'GET /api/patients/:id/plan did not answer'
      : `the envelope carried ${JSON.stringify(plan.plan)}`,
  );
  saveEvidenceScreenshot(window.id, 'plan');
}

/** The briefing view: the workspace's prep pane for the patient. */
async function flowBriefing(ctx) {
  const { window } = ctx;
  const patients = await patientsList();
  if (patients === null || patients.length === 0) {
    recordFlow('briefing', 'NOT RUN', 'no patient exists, so there is no briefing to open');
    notRun('briefing', 'no patient exists, so there is no briefing to open');
    return;
  }
  // The real action, on whichever of the briefing's two on-screen openers is
  // unique here (`openWorkspacePane`): the notes column's switch
  // (`notes.prepareForSession`, `NotesColumn.tsx:122`) and the welcome card that
  // carries the same label plus its own hint line. The switch's label is on
  // screen **twice** while the patient's welcome is up beside the notes column,
  // and exactly once once a pane is open, because the welcome is not rendered
  // then; either way the click lands on a uniquely identified control.
  const opened = await openWorkspacePane(ctx, PANE_OPENERS.prep, 'the briefing pane');
  if (!opened.opened) {
    recordFlow('briefing', 'NOT RUN', `the briefing control could not be grounded: ${opened.why}`);
    notRun('briefing', `the briefing control could not be grounded: ${opened.why}`);
    return;
  }
  pass('briefing the pane was opened by a uniquely identified control', `${opened.opener}: ${opened.why}`);
  await sleep(1500);

  // The screen: the prep pane's own heading (`prep.title`, `PrepView.tsx:130`).
  const heading = await waitForScreenLabel(window, FLOW_LABELS.prepHeading.text, 8000);
  if (!heading.seen) {
    recordFlow('briefing', 'NOT RUN', `the briefing pane did not show: ${String(heading.why ?? 'unknown')}`);
    notRun('briefing', `the briefing pane did not show: ${String(heading.why ?? 'unknown')}`);
    return;
  }
  const briefs = await briefsFor(patients[0].id);
  requireFlow(
    'briefing',
    "the briefing pane loaded the patient's briefs",
    briefs !== null && Array.isArray(briefs.briefs),
    'GET /api/patients/:id/prep did not answer with a briefs object',
  );
  saveEvidenceScreenshot(window.id, 'briefing');
}

/** The brainstorm view: the workspace's brainstorm pane for the patient. */
async function flowBrainstorm(ctx) {
  const { window } = ctx;
  const patients = await patientsList();
  if (patients === null || patients.length === 0) {
    recordFlow('brainstorm', 'NOT RUN', 'no patient exists, so there is no brainstorm to open');
    notRun('brainstorm', 'no patient exists, so there is no brainstorm to open');
    return;
  }
  // The real action, on whichever of the brainstorm pane's two on-screen openers
  // is unique here (`openWorkspacePane`): the notes column's switch
  // (`brainstorm.title`, `NotesColumn.tsx:100`) and the welcome card that carries
  // the same label plus its own hint line. The pane's own confirmation below is
  // its empty-thread sentence, a different string.
  const opened = await openWorkspacePane(ctx, PANE_OPENERS.brainstorm, 'the brainstorm pane');
  if (!opened.opened) {
    recordFlow('brainstorm', 'NOT RUN', `the brainstorm control could not be grounded: ${opened.why}`);
    notRun('brainstorm', `the brainstorm control could not be grounded: ${opened.why}`);
    return;
  }
  pass('brainstorm the pane was opened by a uniquely identified control', `${opened.opener}: ${opened.why}`);
  await sleep(1500);

  // The screen: the brainstorm pane's own empty-thread sentence
  // (`brainstorm.empty`, `BrainstormView.tsx:181`).
  const thread = await waitForScreenLabel(window, FLOW_LABELS.brainstormEmpty.text, 8000);
  if (!thread.seen) {
    recordFlow(
      'brainstorm',
      'NOT RUN',
      `the brainstorm pane did not show: ${String(thread.why ?? 'unknown')}`,
    );
    notRun('brainstorm', `the brainstorm pane did not show: ${String(thread.why ?? 'unknown')}`);
    return;
  }
  const read = await apiGet(`/api/patients/${encodeURIComponent(patients[0].id)}/brainstorm`);
  requireFlow(
    'brainstorm',
    "the brainstorm pane loaded the patient's thread",
    read.ok,
    `GET /api/patients/:id/brainstorm answered ${String(read.status)}`,
  );
  saveEvidenceScreenshot(window.id, 'brainstorm');
}

/** Opens the settings screen through the rail's own gear menu, by keyboard. */
async function openSettings(ctx) {
  const { window } = ctx;
  // The rail's mission control is an icon-only button (`rail-mission-control`),
  // so there is no label on screen to click; it is reached with the app's own
  // keyboard and then **verified** by the menu item's own label appearing, which
  // is clicked at its measured centre.
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    await pressKey(['Tab'], `Tab to the rail's mission control (attempt ${String(attempt)})`);
    await pressKey(['Return'], 'Return to open the rail menu');
    await sleep(600);
    const shot = await captureWindow(window.id);
    if (shot === null) continue;
    const words = await screenWords(shot);
    if (words === null) continue;
    const grounded = groundPhrase(words, FLOW_LABELS.settingsMenu.text);
    if (grounded.box !== null) return true;
  }
  return false;
}

/** The settings screen: the workspace's own settings pane. */
async function flowSettings(ctx) {
  const { window } = ctx;
  if (!(await openSettings(ctx))) {
    const why =
      'the rail menu never showed a Settings entry over six keyboard attempts, so the screen was not opened ' +
      'and nothing is asserted about it';
    recordFlow('settings', 'NOT RUN', why);
    notRun('settings', why);
    return;
  }
  const opened = await clickScreenLabel(
    window,
    ctx.offset,
    FLOW_LABELS.settingsMenu.text,
    'the settings menu entry',
  );
  if (!opened.clicked) {
    recordFlow('settings', 'NOT RUN', `the settings menu entry could not be grounded: ${opened.why}`);
    notRun('settings', `the settings menu entry could not be grounded: ${opened.why}`);
    return;
  }
  await sleep(1500);

  // The screen: the modal's **own nav title**, `doc.settings` (`Settings.tsx:168`),
  // which is inside the `<nav>` and therefore outside `SettingsSections` — so no
  // section gate, and no early return inside a section, can decide whether it is
  // on screen. `UI_LABELS.settingsPane.renderPath` carries every hop and every
  // gate from the modal root to that `<h2>`, and the helper tests assert the
  // whole path against the tree; the label this replaces
  // (`settings.draftingModel`) lived in `LlmProfileSettings`, which returns
  // `null` with fewer than two LLM profiles and the server publishes one, so it
  // was never on screen and this flow recorded `NOT RUN` on every healthy run.
  //
  // It is unique in the state this flow drives: the rail menu that carried the
  // other `Settings` is closed by its own `choose()` before the modal opens.
  const appearance = await waitForScreenLabel(window, UI_LABELS.settingsPane.text, 8000);
  if (!appearance.seen) {
    recordFlow(
      'settings',
      'NOT RUN',
      `the settings screen did not show: ${String(appearance.why ?? 'unknown')}`,
    );
    notRun('settings', `the settings screen did not show: ${String(appearance.why ?? 'unknown')}`);
    return;
  }
  const status = await apiGet('/api/settings');
  requireFlow(
    'settings',
    'the settings screen is shown and the app answers for it',
    status.ok,
    `GET /api/settings answered ${String(status.status)}`,
  );
  saveEvidenceScreenshot(window.id, 'settings');
}

/** The backup flow: a backup is written through the app's own backup control. */
async function flowBackup(ctx) {
  const { window } = ctx;
  const before = await backupStatus();
  if (before === null) {
    recordFlow('backup', 'NOT RUN', 'GET /api/backup did not answer, so there is no backup state to compare');
    notRun('backup', 'GET /api/backup did not answer, so there is no backup state to compare');
    return;
  }
  // The settings pane's own backup tab (`settings.backup`, `Settings.tsx:87`).
  const tab = await clickScreenLabel(
    window,
    ctx.offset,
    FLOW_LABELS.backupTab.text,
    'the settings backup tab',
  );
  if (!tab.clicked) {
    recordFlow('backup', 'NOT RUN', `the backup tab could not be grounded: ${tab.why}`);
    notRun('backup', `the backup tab could not be grounded: ${tab.why}`);
    return;
  }
  await sleep(1000);

  // The real action, on the card's own control (`backup.now`, `backup.now`).
  const ran = await clickScreenLabel(
    window,
    ctx.offset,
    FLOW_LABELS.backupNow.text,
    'the backup-now control',
  );
  if (!ran.clicked) {
    recordFlow('backup', 'NOT RUN', `the backup-now control could not be grounded: ${ran.why}`);
    notRun('backup', `the backup-now control could not be grounded: ${ran.why}`);
    return;
  }
  await sleep(3000);

  // The fact the click produces: the backup manifest moved. `GET /api/backup`
  // answered before the click and is compared against that reading.
  const after = await backupStatus();
  requireFlow(
    'backup',
    'a backup was written by the backup-now control',
    after !== null &&
      (after.last_backup_at !== before.last_backup_at || after.last_backup_file !== before.last_backup_file),
    after === null
      ? 'GET /api/backup did not answer after the click'
      : `last_backup_at stayed ${JSON.stringify(after.last_backup_at)}`,
  );
  saveEvidenceScreenshot(window.id, 'backup');
}

// ------------------------------------------------------------------ main ----

async function main() {
  // The audio teardown is installed before anything can be created, so a signal
  // at any point afterwards still restores the default source and unloads both
  // modules (C-ISO@1 rule 7).
  installTraps();

  const reexec = ensureDisplay();
  if (reexec !== null) {
    return await new Promise((settle) => {
      reexec.on('exit', (code, signal) => settle(signal === null ? (code ?? 0) : 1));
      reexec.on('error', (error) => {
        process.stderr.write(`tauri-e2e-smoke: ${String(error)}\n`);
        settle(1);
      });
    });
  }

  const mode = process.argv[2];
  if (mode !== 'smoke') {
    process.stderr.write(`tauri-e2e-smoke: unknown mode ${String(mode)}\nusage: smoke\n`);
    return 2;
  }

  if (!preconditions()) {
    notRunRemaining('onboarding', 'a precondition this harness requires is not met');
    return 2;
  }

  await runSmoke();

  // Every one of the eleven named flows is recorded, on every path. A flow with
  // no recorded outcome is NOT RUN: it is never an absent row and never a pass.
  for (const flow of FLOWS) {
    if (!flowOutcomes.has(flow)) {
      recordFlow(flow, 'NOT RUN', 'the run ended before this flow produced an outcome');
      notRun(flow, 'the run ended before this flow produced an outcome');
    }
  }

  const failed = results.filter((r) => !r.ok);
  const notRunCount = results.filter((r) => r.notRun === true).length;
  const blockedCount = blockedResults.length;
  process.stdout.write('\n--- the eleven flows ---\n');
  for (const flow of FLOWS) {
    const outcome = flowOutcomes.get(flow);
    process.stdout.write(`  ${outcome.outcome.padEnd(7)} ${flow}: ${outcome.detail}\n`);
  }
  process.stdout.write(
    `\n${String(results.length - failed.length)}/${String(results.length)} assertions passed` +
      (notRunCount > 0 ? `, ${String(notRunCount)} NOT RUN` : '') +
      (blockedCount > 0 ? `, ${String(blockedCount)} BLOCKED` : '') +
      '\n',
  );
  // NOT RUN is never PASS: a run in which a flow could not be driven exits
  // non-zero, so no caller can read exit 0 as "all eleven completed".
  return exitCodeFor({ failed: failed.length, blocked: blockedCount, notRun: notRunCount });
}

/**
 * The row's exit code, and nothing else decides it.
 *
 * `NOT RUN` is never `PASS`: a run in which a flow could not be driven exits 4,
 * so no caller can read exit 0 as "all eleven completed". A blocked precondition
 * (3) outranks a failure (1), and both outrank a NOT RUN (4).
 */
function exitCodeFor({ failed, blocked, notRun }) {
  if (blocked > 0) return 3;
  if (failed > 0) return 1;
  if (notRun > 0) return 4;
  return 0;
}

/**
 * The entry-point guard.
 *
 * Importing this module for a helper probe runs no precondition, launches
 * nothing and executes no `main()`; the helpers below are exported for exactly
 * that, and each of them is pure or takes its own inputs.
 */
const isEntryPoint =
  process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isEntryPoint) {
  process.exitCode = await main();
}

export {
  choosePaneOpener,
  classifySourceOutputs,
  exitCodeFor,
  lockHolderCheck,
  ownershipBaselineProof,
  ownershipContainment,
  ownershipIdentityDiff,
  ownershipIdentitySnapshot,
  readLockHolder,
  stripTrailingPunctuation,
  scanBundleForObservationChannel,
  snapshotDataDirNames,
  findPhraseBoxes,
  groundPhrase,
  imageSize,
  isRuleBInput,
  main,
  newestRuleBInput,
  notRunRemaining,
  observationChannelGone,
  parseCompareMetric,
  parseSourceTable,
  pickPrimaryCluster,
  preflightTools,
  preconditions,
  recordFlow,
  requireFlow,
  resolveBuildCommit,
  ruleBHistoryVerdict,
  ruleBFreshness,
  screenWords,
  FLOWS,
  RULE_B_BASE,
  RULE_B_PATHS,
  REQUIRED_TOOLS,
  FLOW_LABELS,
  PANE_OPENERS,
  UI_LABELS,
};

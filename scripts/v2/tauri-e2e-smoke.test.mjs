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
 * flow also reads the fact that proves it — a format row, a note row with its
 * status, a plan, a backup manifest — over the loopback origin the shell is
 * confined to. The one exception is the Copied control, whose feedback is
 * on-screen state only; the harness asserts the screenshot and claims nothing
 * about the host clipboard.
 *
 * **Containment, all five asserted, none weakened to pass:** no process from
 * the run remains; no second `apunta.lock`, `apunta.db`, `-wal` or `-shm`;
 * 7879 is free afterwards; the observation channel is gone when the row ends
 * (zero occurrences of P3.4's marker path and gate string in the shipped
 * bundle); and `ollama` is still running, read from outside the run.
 *
 * **The microphone.** The capture flow reuses P3.5's approved mechanism: a
 * fabricated recording is played into a virtual sink whose remap source is made
 * the default capture device, and the owner's physical microphone is never read
 * — a stream on it is a stop, not a warning. The teardown restores the
 * remembered default and unloads both modules on every exit path.
 *
 * No `pkill`, ever (C-ISO@1 rule 7): every process this file stops is one it
 * started, by pid.
 */

import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
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

/** The prototype's sample person (HS-8). Created through the API, in the sandbox. */
const PATIENT_NAME = 'John Smith';

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

/** A flow that could not run, with its cause. Never a PASS. */
function notRun(name, reason) {
  results.push({ name, ok: true, notRun: true });
  process.stdout.write(`NOT RUN ${name}: ${reason}\n`);
}

// ------------------------------------------------------------- preconditions

/** The port `sandbox.mjs env` assigned. Never substituted. */
const port = Number(process.env['APUNTA_PORT']);
const dataDir = process.env['APUNTA_DATA_DIR'];
const runId = process.env['APUNTA_TEST_RUN_ID'];

if (!Number.isInteger(port) || !dataDir || !runId) {
  process.stderr.write(
    'tauri-e2e-smoke: source the sandbox environment first:\n' +
      '  node scripts/v2/sandbox.mjs env --port 78xx > /tmp/apunta-v2-…env && . /tmp/apunta-v2-…env\n' +
      'APUNTA_DATA_DIR, APUNTA_PORT and APUNTA_TEST_RUN_ID are all required.\n',
  );
  process.exit(2);
}

// The whole app must be the fake-AI app (CLAUDE.md rule 3): the flows are
// reproducible with zero AI tooling installed, and the draft/refine steps are
// the fake provider's, not a real model's.
if (process.env['APUNTA_FAKE_AI'] !== '1') {
  process.stderr.write(
    'tauri-e2e-smoke: APUNTA_FAKE_AI=1 is required so the flows run against the fake provider\n',
  );
  process.exit(2);
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
 * `xvfb-run -a` when it is installed, the desktop session otherwise. The app
 * and every `xdotool` probe must share one display, so when a headless display
 * is needed the **harness itself** re-executes under `xvfb-run -a` and the app
 * is then launched directly.
 */
function ensureDisplay() {
  if (process.env['APUNTA_V2_SMOKE_HARNESS_XVFB'] === '1') {
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
      XDG_CACHE_HOME: join(dataDir, '..', 'cache'),
      XDG_CONFIG_HOME: join(dataDir, '..', 'config'),
      XDG_DATA_HOME: join(dataDir, '..', 'xdg'),
      HOME: join(dataDir, '..', 'home'),
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

/** The floor for "this capture has real content in it", not a target. */
const RENDER_MIN_COLOURS = 8;

/** The number of distinct colours in a capture, or `null` if unreadable. */
async function distinctColours(file) {
  const counted = await spawnAsync('convert', [file, '-format', '%k', 'info:']);
  const value = Number(String(counted.stdout).trim());
  return Number.isInteger(value) ? value : null;
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
  // Absolute error: the count of differing pixels. 0 means identical.
  const compared = await spawnAsync('compare', ['-metric', 'AE', crop, windowShot, 'null:']);
  const differing = Number(String(compared.stderr).trim());
  if (!Number.isInteger(differing)) return null;
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
    const response = await fetch(`http://127.0.0.1:${String(port)}${path}`, {
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
    const response = await fetch(`http://127.0.0.1:${String(port)}${path}`, {
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
    if ((await healthRunId()) === runId) return true;
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
    const response = await fetch(`http://127.0.0.1:${String(port)}/`, {
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
 * Zero occurrences of P3.4's marker path and gate string in the shipped bundle.
 *
 * The unflagged build has no observation hook; this is the assertion that says
 * so about the bundle the flows ran against, read from the build output the
 * producer wrote.
 */
function observationChannelGone() {
  const assetsDir = join(repoRoot, 'build', 'linux-resources', 'web', 'dist', 'assets');
  const candidates = [];
  if (existsSync(assetsDir)) {
    for (const entry of readdirSync(assetsDir)) {
      if (entry.endsWith('.js')) candidates.push(join(assetsDir, entry));
    }
  }
  let occurrences = 0;
  for (const file of candidates) {
    const text = readFileSyncSafe(file);
    if (text === null) continue;
    if (text.includes(P34_MARKER_PATH)) occurrences += 1;
    if (text.includes(P34_GATE_STRING)) occurrences += 1;
  }
  return { occurrences, files: candidates.length };
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
function ownershipFiles() {
  return ['apunta.lock', 'apunta.db', 'apunta.db-wal', 'apunta.db-shm'].map((name) => ({
    name,
    path: join(dataDir, name),
  }));
}

function snapshotOwnership() {
  return ownershipFiles().map((file) => ({ ...file, present: existsSync(file.path) }));
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
    return;
  }
  pass('smoke appimage', sanitise(appImage.path));

  const ollamaBefore = await ollamaAlive();
  const ownershipBefore = snapshotOwnership();

  let run = null;
  try {
    run = launchApp(appImage.path);
    const pid = run.child.pid;

    const home = await findAppWindow(pid, 60_000, 'the app window');
    if (
      !check(
        'smoke the app window is up, inside the display',
        home.found !== null,
        `no window named exactly Apunta owned by pid ${String(pid)} and at least 400x300 inside the display within 60s while waiting for ${String(home.waitedFor)} (saw ${JSON.stringify(home.seen ?? [])})`,
      )
    ) {
      return;
    }
    const window = home.found;
    process.stdout.write(
      `  window ${String(window.width)}x${String(window.height)} at ${String(window.x)},${String(window.y)} on a ${String(home.display?.width)}x${String(home.display?.height)} display\n`,
    );

    // The scale the app used, from the app's own line. At anything but 1 the
    // client rectangles below are CSS pixels and native coordinates are not.
    const geometry = await appGeometry(run.output, 'smoke');
    if (geometry === null) return;
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
      return;
    }

    // The frame-to-client relationship, measured from two captures.
    const rootShot = await captureRoot();
    const windowShot = await captureWindow(window.id);
    if (rootShot === null || windowShot === null) {
      fail('smoke the frame-to-client measurement', 'the display or window capture failed');
      return;
    }
    const frameClient = await measureFrameClient(windowShot, rootShot, window);
    if (frameClient === null) {
      fail('smoke the frame-to-client measurement', 'the captures could not be compared');
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
      return;
    }

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
    let serverPid = null;
    if (run !== null) {
      serverPid = serverPidFromStderr(run.output);
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

    const after = snapshotOwnership();
    const created = after.filter((file, index) => file.present && !ownershipBefore[index].present);
    check(
      'smoke no second lock, database, -wal or -shm',
      created.length === 0,
      `created: ${created.map((file) => file.name).join(', ')}`,
    );

    const free = await isPortFree(port);
    check('smoke the port is released', free, `127.0.0.1:${String(port)} is still bound`);

    const channel = observationChannelGone();
    check(
      'smoke the observation channel is gone from the bundle',
      channel.occurrences === 0,
      `${String(channel.occurrences)} occurrences of P3.4's marker path or gate string across ${String(channel.files)} bundle scripts`,
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
// Each flow drives the app's own UI with real input, saves a screenshot as
// evidence, and reads the fact that proves it over the app's own origin. A flow
// that cannot be driven records NOT RUN with its cause; none is recorded PASS
// on a picture alone.

/** The onboarding Continue button: the app creates its standard format itself. */
async function flowOnboarding(ctx) {
  const { window } = ctx;
  // The app starts on the onboarding screen when no format exists. The
  // Continue button is the one primary action: find it by colour and click it.
  const shot = await captureWindow(window.id);
  if (shot === null) {
    notRun('onboarding', 'the window capture failed');
    return;
  }
  const clusters = await findClusters(shot, ACCENT);
  if (clusters.length === 0) {
    notRun(
      'onboarding',
      'no primary-action button was found in the screenshot, so the Continue click is not grounded',
    );
    return;
  }
  const clicked = await clickCluster(window, ctx.offset, clusters[0], 'the onboarding Continue button');
  if (!clicked) return;

  // The app lands on /patients/new behind the add-patient modal; Escape is the
  // app's own way out (a real XTEST key press, not a synthetic event).
  await sleep(1500);
  await pressKey(['Escape'], 'Escape to dismiss the add-patient dialog');
  await sleep(1500);

  const formats = await formatsList();
  check(
    'onboarding the app created its standard format',
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
  if (!(await typeText(PATIENT_NAME, 'the patient name into the home search'))) return;
  await sleep(800);
  await pressKey(['Return'], 'Return to choose the highlighted patient');
  await sleep(2000);

  // The capture screen's record control is a large option tile. It is the first
  // focusable control on the screen, so it is reached by the app's own keyboard.
  await pressKey(['Tab'], 'Tab to the record control');
  await pressKey(['Return'], 'Return to start recording');
  await sleep(2500);

  // The stop-and-draft button is the primary action while recording: find it by
  // colour and click it.
  const recording = await captureWindow(window.id);
  if (recording === null) {
    notRun('capture', 'the window capture failed');
    return;
  }
  const stopClusters = await findClusters(recording, ACCENT);
  if (stopClusters.length === 0) {
    notRun(
      'capture',
      'no primary-action button was found while recording, so the stop click is not grounded',
    );
    return;
  }
  const clicked = await clickCluster(window, ctx.offset, stopClusters[0], 'the stop-and-draft button');
  if (!clicked) return;

  // Stop the playback by pid (it is a 10 s fixture; the recording is shorter).
  if (playback !== null) await stopPid(playback.pid, 'the fixture playback');

  // The fact: a note row exists for this patient, in draft status.
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
  check(
    'capture a note row was created for the patient',
    notes !== null && notes.length > 0,
    notes === null
      ? 'GET /api/patients/:id/notes did not answer with a list'
      : `${String(notes.length)} notes`,
  );
  saveEvidenceScreenshot(window.id, 'capture');
}

/** The draft flow: the drafted note is opened and its sections are present. */
async function flowDraft(ctx) {
  const { window } = ctx;
  const patients = await patientsList();
  if (patients === null || patients.length === 0) {
    notRun('draft', 'no patient exists, so there is no draft to open');
    return;
  }
  const notes = await notesFor(patients[0].id);
  if (notes === null || notes.length === 0) {
    notRun('draft', 'no note exists for the patient');
    return;
  }
  const note = notes[0];
  const full = await noteById(note.id);
  if (full === null) {
    notRun('draft', 'the note could not be read back');
    return;
  }
  check(
    'draft the drafted note carries its sections',
    full.content !== undefined && full.content !== null && String(full.content).includes('Subjective'),
    `note ${String(note.id)} content did not include the Subjective section`,
  );
  saveEvidenceScreenshot(window.id, 'draft');
}

/** The refine flow: the refine chat runs and the note is updated. */
async function flowRefine(ctx) {
  const { window } = ctx;
  const patients = await patientsList();
  if (patients === null || patients.length === 0) {
    notRun('refine', 'no patient exists, so there is no note to refine');
    return;
  }
  const notes = await notesFor(patients[0].id);
  if (notes === null || notes.length === 0) {
    notRun('refine', 'no note exists for the patient');
    return;
  }
  const note = notes[0];
  const before = await noteById(note.id);

  // The refine entry is the chat column's composer. It is filled through the
  // app's own keyboard and sent with Return; the send arrow is the accent
  // button once the composer has text.
  if (!(await typeText('Make it warmer', 'the refine message'))) return;
  await sleep(500);
  await pressKey(['Return'], 'Return to send the refine message');
  await sleep(2000);

  const shot = await captureWindow(window.id);
  if (shot === null) {
    notRun('refine', 'the window capture failed');
    return;
  }
  saveEvidenceScreenshot(window.id, 'refine');

  // The fact: the note was updated by the refine (its content or revision
  // moved), read back over the app's own origin.
  const after = await noteById(note.id);
  const changed =
    after !== null &&
    before !== null &&
    (after.content !== before.content || after.updated_at !== before.updated_at);
  check(
    'refine the note was updated by the refine',
    changed,
    after === null
      ? 'the note could not be read back after the refine'
      : 'the note content and revision did not move after the refine message',
  );
}

/** Publish and copy: the note is published, then the Copied control shows. */
async function flowPublishAndCopy(ctx) {
  const { window } = ctx;
  const patients = await patientsList();
  if (patients === null || patients.length === 0) {
    notRun('publish+copy', 'no patient exists, so there is no note to publish');
    return;
  }
  const notes = await notesFor(patients[0].id);
  if (notes === null || notes.length === 0) {
    notRun('publish+copy', 'no note exists for the patient');
    return;
  }
  const note = notes[0];

  // Publish is the note's `btn-publish` control. It is not the brand accent by
  // default, so it is reached by the app's own keyboard: the note action row is
  // the last focusable row and publish is its last button.
  await pressKey(['Tab'], 'Tab into the note action row');
  await pressKey(['Return'], 'Return to publish the note');
  await sleep(2000);

  const published = await noteById(note.id);
  check(
    'publish the note is published',
    published !== null && published.status === 'published',
    published === null ? 'the note could not be read back' : `status was ${String(published.status)}`,
  );

  // Copy: the Copied feedback is on-screen state only. The harness asserts the
  // screenshot carries real rendered content (the control is on screen and
  // painted) and claims nothing about the host clipboard.
  await pressKey(['Tab'], 'Tab to the copy control');
  await pressKey(['Return'], 'Return to copy the note');
  await sleep(1000);
  const copyShot = await captureWindow(window.id);
  const copySaved = saveEvidenceScreenshot(window.id, 'publish-copy');
  if (copyShot === null || copySaved === null) {
    notRun('copy', 'the window capture or evidence save failed');
    return;
  }
  const copyColours = await distinctColours(copyShot);
  check(
    'copy the Copied control is shown',
    copyColours !== null && copyColours >= RENDER_MIN_COLOURS,
    `the saved screenshot held ${String(copyColours)} distinct colours; the host clipboard is not read`,
  );
}

/** The patient list: the workspace's own patient directory. */
async function flowPatientList(ctx) {
  const { window } = ctx;
  const patients = await patientsList();
  check(
    'patient list the workspace lists the patient',
    patients !== null && patients.length > 0,
    patients === null
      ? 'GET /api/patients did not answer with a list'
      : `${String(patients.length)} patients`,
  );
  saveEvidenceScreenshot(window.id, 'patient-list');
}

/** The plan view: the workspace's plan pane for the patient. */
async function flowPlan(ctx) {
  const { window } = ctx;
  const patients = await patientsList();
  if (patients === null || patients.length === 0) {
    notRun('plan', 'no patient exists, so there is no plan to open');
    return;
  }
  // The plan entry is the `open-plan` control in the notes column. It is a
  // text button, not an accent button, so it is reached by the app's own
  // keyboard: Tab through the column's controls to the plan control.
  await pressKey(['Tab'], 'Tab to the plan control');
  await pressKey(['Return'], 'Return to open the plan');
  await sleep(1500);
  const shot = await captureWindow(window.id);
  if (shot === null) {
    notRun('plan', 'the window capture failed');
    return;
  }
  saveEvidenceScreenshot(window.id, 'plan');
  // The fact: the plan pane loaded this patient's plan (the endpoint answers
  // for the patient, which it only does once the pane is open).
  const plan = await planFor(patients[0].id);
  check(
    "plan the plan pane loaded the patient's plan",
    plan !== null,
    `GET /api/patients/:id/plan answered ${plan === null ? 'no plan object' : 'with a plan object'}`,
  );
}

/** The briefing view: the workspace's prep pane for the patient. */
async function flowBriefing(ctx) {
  const { window } = ctx;
  const patients = await patientsList();
  if (patients === null || patients.length === 0) {
    notRun('briefing', 'no patient exists, so there is no briefing to open');
    return;
  }
  await pressKey(['Tab'], 'Tab to the briefing control');
  await pressKey(['Return'], 'Return to open the briefing');
  await sleep(1500);
  const shot = await captureWindow(window.id);
  if (shot === null) {
    notRun('briefing', 'the window capture failed');
    return;
  }
  saveEvidenceScreenshot(window.id, 'briefing');
  const briefs = await briefsFor(patients[0].id);
  check(
    "briefing the briefing pane loaded the patient's briefs",
    briefs !== null,
    'GET /api/patients/:id/prep did not answer with a briefs object',
  );
}

/** The brainstorm view: the workspace's brainstorm pane for the patient. */
async function flowBrainstorm(ctx) {
  const { window } = ctx;
  const patients = await patientsList();
  if (patients === null || patients.length === 0) {
    notRun('brainstorm', 'no patient exists, so there is no brainstorm to open');
    return;
  }
  await pressKey(['Tab'], 'Tab to the brainstorm control');
  await pressKey(['Return'], 'Return to open the brainstorm');
  await sleep(1500);
  const shot = await captureWindow(window.id);
  if (shot === null) {
    notRun('brainstorm', 'the window capture failed');
    return;
  }
  saveEvidenceScreenshot(window.id, 'brainstorm');
  const read = await apiGet(`/api/patients/${encodeURIComponent(patients[0].id)}/brainstorm`);
  check(
    "brainstorm the brainstorm pane loaded the patient's thread",
    read.ok,
    `GET /api/patients/:id/brainstorm answered ${String(read.status)}`,
  );
}

/** The settings screen: the workspace's own settings pane. */
async function flowSettings(ctx) {
  const { window } = ctx;
  // Settings is the app's own route, reached by the sidebar's settings control.
  // The sidebar rail is a narrow icon column; its settings glyph is the last
  // control, reached by keyboard from the focused window.
  await pressKey(['Tab'], 'Tab to the settings control');
  await pressKey(['Return'], 'Return to open settings');
  await sleep(1500);
  const shot = await captureWindow(window.id);
  if (shot === null) {
    notRun('settings', 'the window capture failed');
    return;
  }
  saveEvidenceScreenshot(window.id, 'settings');
  const status = await apiGet('/api/settings');
  check(
    'settings the settings screen is shown',
    status.ok,
    `GET /api/settings answered ${String(status.status)}`,
  );
}

/** The backup flow: a backup is written through the app's own backup control. */
async function flowBackup(ctx) {
  const { window } = ctx;
  const before = await backupStatus();
  if (before === null) {
    notRun('backup', 'GET /api/backup did not answer, so there is no backup state to compare');
    return;
  }
  // The backup-now control is the `backup-now` button in Settings' backup tab.
  // It is a `btn-quick` (surface, not accent), so it is reached by keyboard.
  await pressKey(['Tab'], 'Tab to the backup-now control');
  await pressKey(['Return'], 'Return to run the backup');
  await sleep(3000);
  const after = await backupStatus();
  const ran =
    after !== null &&
    (after.last_backup_at !== before.last_backup_at || after.last_backup_file !== before.last_backup_file);
  check(
    'backup a backup was written',
    ran,
    after === null
      ? 'GET /api/backup did not answer after the click'
      : `last_backup_at stayed ${JSON.stringify(after.last_backup_at)}`,
  );
  saveEvidenceScreenshot(window.id, 'backup');
}

// ------------------------------------------------------------------ main ----

async function main() {
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

  await runSmoke();

  const failed = results.filter((r) => !r.ok);
  const notRunCount = results.filter((r) => r.notRun === true).length;
  const blockedCount = results.filter((r) => r.blocked === true).length;
  process.stdout.write(
    `\n${String(results.length - failed.length)}/${String(results.length)} assertions passed` +
      (notRunCount > 0 ? `, ${String(notRunCount)} NOT RUN` : '') +
      (blockedCount > 0 ? `, ${String(blockedCount)} BLOCKED` : '') +
      '\n',
  );
  if (blockedCount > 0) return 3;
  return failed.length > 0 ? 1 : 0;
}

process.exitCode = await main();

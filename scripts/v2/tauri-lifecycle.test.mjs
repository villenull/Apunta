#!/usr/bin/env node
/**
 * P3.3's shell lifecycle harness (C-ISO@1, run in `env` mode).
 *
 *   node scripts/v2/tauri-lifecycle.test.mjs launch
 *   node scripts/v2/tauri-lifecycle.test.mjs fatal
 *   node scripts/v2/tauri-lifecycle.test.mjs single-instance
 *
 * Every mode launches the **real** AppImage V2 produced and the **real** bundled
 * server. There is no stub, no fake bridge line and no test hook: the only way
 * this harness can see a `fatal` line is for the shell to have read one out of
 * its own child's stdout.
 *
 * What each mode asserts, and why the assertions are the hard ones:
 *
 * - `launch` (V3) — the window reaches the home screen; quitting leaves no
 *   process from the run; **the unrelated dummy this harness started is still
 *   alive**; **Ollama is still running**. The last two are what make this a
 *   containment row rather than a smoke test, and neither may be weakened to
 *   make the row pass.
 * - `fatal` (V4) — two cases in sequence against the real server:
 *   `fatal-port` holds 7832 with a dummy listener, and `fatal-folder` holds the
 *   data folder with a plain server process this harness starts itself (a second
 *   app launch would be reaped by the single-instance plugin before a server
 *   existed). Each case asserts the fatal code arrived **and not the other one**,
 *   that the error screen is up and the splash is gone, and — the containment
 *   assertion — that **the process holding the condition is still alive** when
 *   the case's assertions pass. Both are then stopped, by pid, before the row
 *   ends, on the success path and on failure.
 * - `single-instance` (V5) — one server process, the first instance still
 *   healthy, the second launch reaped inside the **existing** 10 s quit-ladder
 *   budget, and no second lock, database, `-wal` or `-shm`. The focus read is a
 *   separate, optional assertion recorded `NOT RUN` unless a focus reader is on
 *   `PATH` **and** `APUNTA_ALLOW_FOCUS_TEST=1`, because it takes the owner's
 *   focus mid-work and there is no window manager under `xvfb-run` anyway.
 *
 * No `pkill`, ever (C-ISO@1 rule 7): every process this file stops is one it
 * started, by pid.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** V3–V5 each print `PASS <name>` or `FAIL <name>: <detail>` and exit non-zero. */
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

/** The port `sandbox.mjs env` assigned. Never substituted. */
const port = Number(process.env['APUNTA_PORT']);
const dataDir = process.env['APUNTA_DATA_DIR'];
const runId = process.env['APUNTA_TEST_RUN_ID'];

if (!Number.isInteger(port) || !dataDir || !runId) {
  process.stderr.write(
    'tauri-lifecycle: source the sandbox environment first:\n' +
      '  node scripts/v2/sandbox.mjs env --port 78xx > /tmp/apunta-v2-…env && . /tmp/apunta-v2-…env\n' +
      'APUNTA_DATA_DIR, APUNTA_PORT and APUNTA_TEST_RUN_ID are all required.\n',
  );
  process.exit(2);
}

/** The AppImage, resolved once. Zero or more than one match is a failure, so a
 * stale AppImage from an earlier attempt cannot be launched silently. */
function resolveAppImage() {
  const dir = join(repoRoot, 'src-tauri', 'target', 'release', 'bundle', 'appimage');
  if (!existsSync(dir)) return { error: `no bundle directory at ${sanitise(dir)}` };
  const found = readdirSync(dir).filter((name) => name.endsWith('.AppImage'));
  if (found.length === 0) return { error: `no .AppImage in ${sanitise(dir)}` };
  if (found.length > 1) {
    return { error: `${String(found.length)} .AppImage files in ${sanitise(dir)}: ${found.join(', ')}` };
  }
  return { path: join(dir, found[0]) };
}

/** `<sandbox>` for every run-folder path, so committed evidence carries no
 * host paths (RUN-CONFIG §4). */
function sanitise(value) {
  return String(value).replace(/\/tmp\/apunta-v2\/[^/\s'"]+/g, '<sandbox>');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function isPortFree(portNumber) {
  return new Promise((done) => {
    const probe = createServer();
    probe.once('error', () => done(false));
    probe.listen(portNumber, '127.0.0.1', () => probe.close(() => done(true)));
  });
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
 * Stops one pid this harness started, and waits for it to go.
 *
 * Returns **whether SIGKILL was needed**. A row that asserts a quit cannot use
 * this as the thing that makes it pass: it is here for cleanup on the failure
 * path, and it reports the escalation so an assertion can require that the
 * process under test went away on its own. `PASS V3 quit` satisfied by the
 * SIGKILL was the review's D7.
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

/**
 * The display, chosen at run time and printed rather than left to the reader.
 *
 * `xvfb-run -a` when it is installed, the desktop session otherwise. The app and
 * the window reader must share one display, so when a headless display is needed
 * the **harness itself** re-executes under `xvfb-run -a` and the app is then
 * launched directly: prefixing only the app would leave `xdotool` reading a
 * different display's window list, which reports nothing rather than failing.
 *
 * `APUNTA_V2_TAURI_HARNESS_XVFB=1` is the re-entry marker, so the re-executed
 * process does not re-execute again.
 */
function ensureDisplay() {
  if (process.env['APUNTA_V2_TAURI_HARNESS_XVFB'] === '1') {
    process.stdout.write(`  display: the inherited X display ${String(process.env['DISPLAY'])}\n`);
    return null;
  }
  const xvfbRun = firstOnPath(['xvfb-run']);
  if (xvfbRun === undefined) {
    process.stdout.write('  display: the desktop session (no xvfb-run)\n');
    return null;
  }
  // The screen size is named here rather than left to `xvfb-run`'s default of
  // 640x480. That default is smaller than the app's own minimum window size, so
  // every run had the window clamped and partly off-screen — a property of the
  // harness's display, not of the app, and one that made the geometry assertion
  // untestable. 1400x1000 is this card's sandbox display and is recorded in every
  // row's evidence.
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
      env: { ...process.env, APUNTA_V2_TAURI_HARNESS_XVFB: '1' },
      stdio: 'inherit',
    },
  );
  // This process's only remaining job is to become the re-executed one's exit
  // code. Returning the child handle (rather than awaiting it here) keeps the
  // top level free of a promise that never settles, which Node reports as an
  // unsettled top-level await and exit 13 — which would read as a failing row.
  return reexec;
}

/**
 * The AppImage, under the display prefix.
 *
 * `APUNTA_DATA_DIR`, `APUNTA_PORT`, `APUNTA_NO_OPEN` and `APUNTA_TEST_RUN_ID`
 * are inherited from the harness, which inherited them from `sandbox.mjs env`:
 * the test-identity build refuses to start without the first two, which is what
 * makes this the only way the app can be launched here.
 */
function launchApp(appImage, extraEnv = {}) {
  const child = spawn(appImage, [], {
    cwd: '/',
    env: {
      ...process.env,
      ...extraEnv,
      // The desktop's Wayland session must not leak into a headless run: unset
      // rather than overridden, so no child can find a compositor socket.
      WAYLAND_DISPLAY: '',
      // WebKitGTK writes its caches somewhere writable; without this it picks
      // the invoking user's home, which is outside the sandbox.
      XDG_CACHE_HOME: join(dataDir, '..', 'cache'),
      XDG_CONFIG_HOME: join(dataDir, '..', 'config'),
      XDG_DATA_HOME: join(dataDir, '..', 'xdg'),
      HOME: join(dataDir, '..', 'home'),
      // GTK must use the X display this harness and `xdotool` share. A
      // Wayland-capable session exports WAYLAND_DISPLAY and XDG_BACKEND from
      // the desktop, and under `xvfb-run` there is no Wayland compositor at
      // all: the app then opens windows on a display nobody can read, and the
      // window assertions see an empty list rather than a failure.
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

/** The first child pid under the AppImage, which is the shell itself. */
function shellPid(child) {
  return child.pid;
}

/**
 * Every window on the display, with the fields a real assertion needs.
 *
 * `xdotool search` is a focus **reader** here: it never clicks, never raises and
 * never focuses, so it cannot steal the owner's focus. Two properties of it are
 * load-bearing and were both got wrong before:
 *
 * - `--name` matches **case-insensitively**, and the app has a hidden 20×20 GTK
 *   helper window whose name differs from the app window's only by case. A
 *   `--name '^Apunta$'` search therefore matched the helper first, and taking the
 *   first match made "the window reached the home screen" satisfiable at GTK
 *   init — before any bridge line had arrived. So the match here is an exact
 *   string comparison on the name `xdotool` reports.
 * - A title alone proves nothing about what is on screen, so each candidate also
 *   carries its geometry and its owning pid, and the caller can require that the
 *   window belongs to the app's own process and is a real window rather than the
 *   helper.
 */
function windowList() {
  return new Promise((done) => {
    // No `--onlyvisible`: under `xvfb-run` with no window manager it reports an
    // empty list for windows that are plainly on screen, which would turn every
    // assertion below into a timeout. Visibility is not what this row is
    // checking — ownership, exact name, size and geometry are.
    const probe = spawn('xdotool', ['search', '--name', '.*'], {
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    let out = '';
    probe.stdout.on('data', (chunk) => {
      out += chunk.toString('utf8');
    });
    probe.on('error', () => done(null));
    probe.on('close', () => {
      const ids = out
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => /^[0-9]+$/.test(line));
      done(ids);
    });
  });
}

/**
 * `{ name, x, y, width, height, pid }` for one window id, or `null`.
 *
 * Three separate `xdotool` calls rather than one chained invocation: `--shell`
 * only applies to the command it is attached to, so a chain mixes
 * `KEY=value` lines with bare window names and the result depends on argument
 * order. `getwindowpid` in particular does not report the shell's pid for a
 * window owned by a child process, which is why the owner check compares
 * against the AppImage's own pid and the harness reports both when they differ.
 */
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
  const pid = Number(owner.stdout.trim());
  if (!Number.isInteger(width) || !Number.isInteger(height)) return null;
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

/**
 * The app's own visible window whose title is exactly `Apunta`.
 *
 * The three conditions together are what makes this the app window and not
 * something that merely resembles it: an **exact** name (case-sensitively, so the
 * hidden helper is out), **this run's shell as the owning pid**, and a
 * **non-trivial size** (so nothing 20×20 can satisfy it). The geometry is also
 * required to lie inside the display, which is what makes "the owner can see the
 * window" a checked property rather than an assumption.
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
        (w) => w.name === 'Apunta' && w.pid === pid && w.width >= 400 && w.height >= 300,
      );
      if (hit !== undefined && display !== null) {
        const inside =
          hit.x >= 0 &&
          hit.y >= 0 &&
          hit.x + hit.width <= display.width &&
          hit.y + hit.height <= display.height;
        if (inside) return { found: hit, display, windows };
        // Present but off-screen: keep waiting rather than accept it, and let
        // the timeout report the geometry so the failure is legible.
      }
    }
    if (Date.now() >= deadline) {
      return {
        found: null,
        display,
        windows,
        seen,
        waitedFor: what,
        offscreen: windows !== null && display !== null ? windows.filter((w) => w.name === 'Apunta') : [],
      };
    }
    await sleep(250);
  }
}

/** The display's own size, or `null` when `xdotool` will not say. */
async function displayGeometry() {
  const read = await spawnAsync('xdotool', ['getdisplaygeometry']);
  const match = /^(\d+)\s+(\d+)$/.exec(read.stdout.trim());
  if (match === null) return null;
  return { width: Number(match[1]), height: Number(match[2]) };
}

/**
 * Waits for a window whose name matches, used by V4's error screen — where the
 * name *is* the assertion, because the shell puts the code in the title
 * deliberately so it is readable whether or not the page's script ran.
 *
 * It reports the whole window list (`windows`) and a printable form (`seen`), so
 * a timeout says which assertion ran out and what was actually on the display.
 */
async function waitForWindowTitle(match, timeoutMs, what) {
  const deadline = Date.now() + timeoutMs;
  let seen = [];
  let windows = [];
  for (;;) {
    const listed = await windowListDetailed();
    if (listed !== null) {
      windows = listed;
      seen = listed.map(
        (w) =>
          `${w.name} ${String(w.width)}x${String(w.height)}@${String(w.x)},${String(w.y)} pid=${String(w.pid)}`,
      );
      const hit = listed.find((w) => match.test(w.name));
      if (hit !== undefined) return { found: hit.name, windows, seen };
    }
    if (Date.now() >= deadline) return { found: null, windows, seen, waitedFor: what };
    await sleep(250);
  }
}

/**
 * Proof that the **app** rendered into the window, not merely that something did.
 *
 * Three independent pieces, because any one of them alone would be weak:
 *
 * 1. **A capture with real content in it.** Polled rather than taken once: a
 *    webview that has just been mapped has not painted yet, and a single early
 *    capture reads as two colours (measured: 2 on the first attempt, 700 fifteen
 *    seconds later). The threshold is a floor, not a target — the app's real
 *    window measures hundreds of distinct colours, while an unpainted webview is
 *    one and a plain splash is a handful.
 * 2. **The document the server actually served at that origin** — HTTP 200, an
 *    HTML content type, and the app's own root element in the markup. This is
 *    what the window is displaying, read over the same loopback origin the shell
 *    is restricted to, and it is independent of the pixels.
 * 3. **The title, the owning pid, the size and the geometry**, asserted
 *    separately above. A splash or an error screen has its own title, so it can
 *    never satisfy the name check.
 *
 * ImageMagick's `import` and `convert` are used because they are already on the
 * host: nothing is installed and no network is touched. Captures are written
 * under the harness's own git-ignored scratch directory and deleted afterwards.
 */
const RENDER_MIN_COLOURS = 8;

async function captureColours(windowId, scratchDir) {
  const file = join(scratchDir, `window-${windowId}.png`);
  const shot = await spawnAsync('import', [
    '-display',
    process.env['DISPLAY'] ?? '',
    '-window',
    String(windowId),
    '-silent',
    file,
  ]);
  if (!existsSync(file)) {
    return null;
  }
  // `-format %k` is the number of distinct colours in the image.
  const counted = await spawnAsync('convert', [file, '-format', '%k', 'info:']);
  rmSync(file, { force: true });
  const colours = Number(counted.stdout.trim());
  return {
    colours: Number.isInteger(colours) ? colours : 0,
    note: shot.stderr.trim(),
  };
}

/** Waits until the window holds rendered content, or the budget runs out. */
async function waitForRenderedContent(windowId, scratchDir, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let best = { colours: 0, note: '' };
  for (;;) {
    const seen = await captureColours(windowId, scratchDir);
    if (seen !== null) {
      best = seen;
      if (seen.colours >= RENDER_MIN_COLOURS) {
        return { rendered: true, colours: seen.colours };
      }
    }
    if (Date.now() >= deadline) {
      return {
        rendered: false,
        colours: best.colours,
        note: best.note,
      };
    }
    await sleep(500);
  }
}

/** The document this run's server serves at the origin the window loaded. */
async function servedDocument() {
  try {
    const response = await fetch(`http://127.0.0.1:${String(port)}/`, {
      signal: AbortSignal.timeout(5000),
    });
    const body = await response.text();
    return {
      status: response.status,
      contentType: response.headers.get('content-type') ?? '',
      bytes: body.length,
      hasAppRoot: /id="root"/.test(body),
    };
  } catch (error) {
    return { status: 0, contentType: '', bytes: 0, hasAppRoot: false, error: String(error) };
  }
}

/** Is Ollama still answering? C-ISO@1 rule 7, checked from the outside. */
async function ollamaAlive() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const response = await fetch('http://127.0.0.1:11434/api/tags', {
      signal: controller.signal,
    });
    clearTimeout(timer);
    return response.ok;
  } catch {
    return false;
  }
}

/** The `testRunId` the health endpoint reports, or `null`. */
async function healthRunId() {
  try {
    const response = await fetch(`http://127.0.0.1:${String(port)}/api/health`);
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
    const found = await healthRunId();
    if (found === runId) return true;
    if (Date.now() >= deadline) {
      fail(`${what}: ownership`, `testRunId never matched (last saw ${String(found)})`);
      return false;
    }
    await sleep(250);
  }
}

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

// ------------------------------------------------------------------- V3 ----

/**
 * The two ways this shell can be asked to quit, asserted **separately**.
 *
 * They are different code paths in the app (a `WindowEvent::CloseRequested` and
 * a signal), and the previous version of this row asserted neither on its own
 * terms: it sent `SIGTERM`, then waited, then escalated to `SIGKILL`, and reported
 * `PASS quit` — so the assertion was satisfied by the harness's own escalation
 * and the SIGTERM rung was never exercised. Here each case requires the shell to
 * be **gone on its own**, with no escalation, and then checks the containment
 * that the quit was supposed to achieve.
 *
 * `cooperative-close` is the one the owner uses, and it is a genuine cooperative
 * close: `xdotool windowquit` sends the `WM_DELETE_WINDOW` request, which is what
 * a window manager's close button sends and what GTK turns into the app's own
 * close event.
 *
 * `forced-destroy` is **not** a native close and is never reported as one:
 * `xdotool windowclose` calls `XDestroyWindow`, which gives the app no chance to
 * respond — GDK's X error handler aborts the shell process instead. It is here
 * because that is a real way the app can die, and the requirement is the same
 * either way: the server this run started must not survive it. The server's own
 * stdin-bridge end-of-file handling is what reclaims it (see
 * `server/src/shell-bridge.ts`), and the harness asserts the reclamation rather
 * than assuming it.
 */
async function runQuitCase(name, quit, options = {}) {
  const appImage = resolveAppImage();
  if (appImage.error !== undefined) {
    fail(`${name} appimage`, appImage.error);
    return;
  }
  pass(`${name} appimage`, sanitise(appImage.path));

  // The unrelated dummy this row asserts is still alive afterwards. It is a plain
  // long sleep: nothing about it is part of Apunta, which is the point.
  const dummy = spawn('sleep', ['600'], { stdio: 'ignore' });
  const dummyPid = dummy.pid;
  const ollamaBefore = await ollamaAlive();

  let run = null;
  try {
    run = launchApp(appImage.path);
    const pid = shellPid(run.child);

    const home = await findAppWindow(pid, 60_000, `${name} home screen`);
    check(
      `${name} the app's own window is up, inside the display`,
      home.found !== null,
      `no window named exactly Apunta owned by pid ${String(pid)} and at least 400x300 inside the display within 60s while waiting for ${String(home.waitedFor)} (saw ${JSON.stringify(home.seen ?? [])})`,
    );

    // "Something was rendered", not "a title appeared". A webview that never
    // painted is one flat colour, so a uniform capture is the failure this
    // catches. It is the weakest true claim available — a splash is non-uniform
    // too — which is why the title, the owning pid, the size and the ownership
    // check below carry the rest of the weight.
    if (home.found !== null) {
      const shot = await waitForRenderedContent(home.found.id, scratchDir(), 30_000);
      check(
        `${name} the window has rendered content`,
        shot.rendered,
        `after 30s the capture still held only ${String(shot.colours)} distinct colours (the app's own window measures hundreds); import said ${JSON.stringify(shot.note)}`,
      );

      // The pixels above are the weakest of the three, so the document itself is
      // checked too: this is what the window is showing, read over the same
      // loopback origin C-BRIDGE@1 confines it to.
      const served = await servedDocument();
      check(
        `${name} the window is showing the app's own document`,
        served.status === 200 &&
          served.contentType.includes('text/html') &&
          served.hasAppRoot &&
          served.bytes > 500,
        `GET / on this run's origin answered status ${String(served.status)}, content-type ${JSON.stringify(served.contentType)}, ${String(served.bytes)} bytes, app root element: ${String(served.hasAppRoot)}${served.error === undefined ? '' : ` (${String(served.error)})`}`,
      );
      process.stdout.write(
        `  ${name} window: ${String(home.found.width)}x${String(home.found.height)} at ${String(home.found.x)},${String(home.found.y)} on a ${String(home.display?.width)}x${String(home.display?.height)} display, ${String(shot.colours)} distinct colours, document ${String(served.bytes)} bytes\n`,
      );
    }

    // The shell never navigated to a stale URL: the health endpoint on this run's
    // port answers with **this run's** id, which no health-poll in the lifecycle
    // could have produced.
    const reached = await waitForOwnership(30_000, `${name} server`);
    check(`${name} server answers with this run id`, reached, 'no ownership on the sandbox port');

    // ---- the quit itself, and this is the part that has to be real ----
    const serversBefore = countServerProcesses(dataDir);
    check(
      `${name} exactly one server process before the quit`,
      serversBefore === 1,
      `found ${String(serversBefore)}`,
    );

    await quit({ pid, windowId: home.found?.id });

    // For a request that only a **window manager** can route, there is an honest
    // way to tell "the app ignored it" from "nothing here can deliver it", and it
    // is checked before anything is called a pass or a failure. See the note on
    // `modeWindowClose`.
    if (options.needsWindowManager === true) {
      await sleep(5000);
      const stillThere = pidAlive(pid) && (await windowListDetailed())?.some((w) => w.name === 'Apunta');
      const stillServing = !(await isPortFree(port));
      if (stillThere && stillServing) {
        notRun(
          `${name} cooperative native close`,
          'the request was never delivered: xdotool windowquit sends _NET_CLOSE_WINDOW, a window-manager message, and this display has no window manager to route it. The app is untouched (window up, still serving), so nothing about it was tested. Recorded from the xdotool binary itself (strings libxdo: XSendEvent[_NET_CLOSE_WINDOW]).',
        );
        return;
      }
      process.stdout.write(
        `  ${name}: the request reached the app (it is no longer up), so this is a real result and not an undeliverable one\n`,
      );
    }

    // The shell must be gone **without** the harness escalating to SIGKILL. A
    // SIGKILL here would leave the server exactly as alive as it was and would
    // make this assertion vacuous, so it is a failure, not a cleanup.
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline && pidAlive(pid)) await sleep(100);
    const gone = !pidAlive(pid);
    const outcome = await stopPid(pid, 'the shell');
    check(
      `${name} the shell exits on its own, with no SIGKILL from this harness`,
      gone && !outcome.escalated,
      gone
        ? 'the shell only stopped on SIGKILL'
        : `the shell (pid ${String(pid)}) was still alive 20s after the quit was asked for; the harness had to escalate`,
    );

    // ---- what the quit was supposed to release ----
    // The port. C-ISO@1: nothing of this run may still be listening on it, or the
    // row is unrepeatable and the next attempt cannot even bind.
    const stillListening = !(await isPortFree(port));
    check(`${name} the port is released`, !stillListening, `127.0.0.1:${String(port)} is still bound`);

    // The server process itself, not just the socket: a reparented server is
    // exactly what a window close used to leave behind.
    let serversAfter = countServerProcesses(dataDir);
    const serverDeadline = Date.now() + 15_000;
    while (Date.now() < serverDeadline && serversAfter > 0) {
      await sleep(250);
      serversAfter = countServerProcesses(dataDir);
    }
    check(
      `${name} no server process from the run survives`,
      serversAfter === 0,
      `found ${String(serversAfter)} bundled servers still on this data folder`,
    );

    // The data folder's lock: released on a clean shutdown, and if a stale one is
    // left it must not name a live process, or the next launch is refused for the
    // wrong reason.
    const lock = readFileSyncSafe(join(dataDir, 'apunta.lock'));
    let lockHolder = null;
    if (lock !== null) {
      try {
        const parsed = JSON.parse(lock);
        lockHolder = typeof parsed.pid === 'number' ? parsed.pid : null;
      } catch {
        lockHolder = 'unreadable';
      }
    }
    check(
      `${name} the data lock is released`,
      lock === null || lockHolder === null || !pidAlive(lockHolder),
      lock === null
        ? 'no lock file to read'
        : `apunta.lock still names pid ${String(lockHolder)}, which is alive`,
    );

    // ---- containment: the run took nothing else with it ----
    check(
      `${name} the unrelated dummy is still alive`,
      pidAlive(dummyPid),
      `pid ${String(dummyPid)} is gone`,
    );
    const ollamaAfter = await ollamaAlive();
    check(
      `${name} ollama is still running`,
      ollamaBefore && ollamaAfter,
      `before ${String(ollamaBefore)}, after ${String(ollamaAfter)}`,
    );
  } finally {
    // The app's own words, always: a row that fails on "no window appeared" is
    // unreadable without them, and the shell prints why it refused or why it
    // died. This is where the D1 reproduction showed up
    // (`Gdk-WARNING: … BadDrawable`) and where a forced-destroy run shows the
    // X error handler aborting the process instead of a clean quit.
    if (run !== null) {
      for (const stream of ['stdout', 'stderr']) {
        const text = (run.output[stream] ?? '').trim();
        if (text !== '') {
          process.stdout.write(`  --- the app's ${stream} ---\n`);
          for (const line of text.split('\n').slice(-25)) {
            process.stdout.write(`  ${sanitise(line)}\n`);
          }
        }
      }
    }
    if (run !== null) await stopPid(shellPid(run.child), 'the shell');
    await stopPid(dummyPid, 'the dummy');
  }
}

/** Scratch for captures, under the repository's git-ignored `build/`. */
function scratchDir() {
  const dir = join(repoRoot, 'build', 'p33-correct-harness');
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** SIGTERM: the signal door. The shell's own handler must run the ladder. */
async function modeLaunch() {
  await runQuitCase('V3 signal-quit', async ({ pid }) => {
    try {
      process.kill(pid, 'SIGTERM');
    } catch (error) {
      process.stderr.write(`  SIGTERM failed: ${String(error)}\n`);
    }
  });
}

/**
 * The **cooperative native close**, and an honest account of what this display
 * can and cannot deliver.
 *
 * `xdotool windowquit` is documented as "close a window gracefully … sends a
 * request", and it does — but the message it sends is `_NET_CLOSE_WINDOW`
 * (confirmed from the installed `libxdo`: `XSendEvent[_NET_CLOSE_WINDOW]`).
 * That is a **window-manager** message: a WM is supposed to receive it and then
 * send the application a `WM_DELETE_WINDOW` request in turn. Under `xvfb-run`
 * there is no window manager, so nothing routes it and the application never
 * hears a close request at all. Measured twice on this host: after
 * `windowquit` the window was still listed, the process was still alive and
 * `/api/health` still answered 200.
 *
 * So this case does **not** claim a pass it cannot earn. It sends the request,
 * checks whether anything happened at all, and records `NOT RUN` with that cause
 * when nothing did — never `PASS`, and never a failure attributed to the app for
 * a request that was never delivered. The `CloseRequested` handling itself is
 * covered by `src-tauri/src/quit.rs` and by the harness's forced-destroy case,
 * where the window really does go away.
 *
 * On the owner's desktop session (which has a window manager) the same command
 * routes properly and this case runs for real.
 */
async function modeWindowClose() {
  await runQuitCase(
    'V3 window-quit',
    async ({ windowId }) => {
      if (windowId === undefined) {
        process.stderr.write('  no app window to close\n');
        return;
      }
      await spawnAsync('xdotool', ['windowquit', String(windowId)]);
      process.stdout.write('  sent _NET_CLOSE_WINDOW via xdotool windowquit\n');
    },
    { needsWindowManager: true },
  );
}

/**
 * `windowclose`: **forced** `XDestroyWindow`. Not a native close, and named so
 * here rather than reported as one. The app gets no close event at all — GDK's X
 * error handler aborts the shell — so this case proves the server reclaims
 * itself when the shell cannot.
 */
async function modeForcedClose() {
  await runQuitCase('V3 forced-destroy', async ({ windowId }) => {
    if (windowId === undefined) {
      process.stderr.write('  no app window to destroy\n');
      return;
    }
    const sent = await spawnAsync('xdotool', ['windowclose', String(windowId)]);
    process.stdout.write(
      `  sent XDestroyWindow via xdotool windowclose (exit ${String(sent.stderr.trim() || '0')}); this is a forced destroy, not a close request\n`,
    );
  });
}

// ------------------------------------------------------------------- V4 ----

/** A dummy listener holding the port, so the real `app.listen` fails. */
async function holdPort(portNumber) {
  const server = createServer((_socket) => {});
  await new Promise((done, fail) => {
    server.once('error', fail);
    server.listen(portNumber, '127.0.0.1', done);
  });
  return server;
}

/**
 * The lock holder for `fatal-folder`: a **plain server process** this harness
 * starts, not a second app launch (the single-instance plugin would reap that
 * before a server existed). It is P3.1's bundled server under P3.1's launch
 * contract: `cd /`, a `PATH` holding no host Node, and this run's
 * `APUNTA_DATA_DIR` and `APUNTA_PORT`.
 */
function startLockHolder(bundle) {
  const child = spawn(join(bundle, 'node', 'bin', 'node'), [join(bundle, 'server', 'server.mjs')], {
    cwd: '/',
    env: {
      PATH: '/usr/bin:/bin',
      APUNTA_DATA_DIR: dataDir,
      APUNTA_PORT: String(port),
      APUNTA_NO_OPEN: '1',
      APUNTA_V2: '1',
      APUNTA_TEST_RUN_ID: runId,
      APUNTA_SQLITE_BINDING: join(bundle, 'native', 'better_sqlite3.node'),
      APUNTA_LICENSES_FILE: join(bundle, 'THIRD-PARTY-LICENSES.md'),
      APUNTA_WEB_DIST: join(bundle, 'web', 'dist'),
      APUNTA_WHISPER_BIN: join(bundle, 'bin', 'whisper-cli'),
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

/**
 * One fatal case, end to end.
 *
 * `needsOwnership` is the difference between the two conditions. `fatal-folder`'s
 * holder is a real Apunta server, so C-ISO@1 rule 5's poll applies and the app
 * is launched only once this run's `testRunId` answers. `fatal-port`'s holder is
 * a **dummy listener that answers nothing** — polling it for health would be
 * waiting for the very thing the case is about — so there is nothing to prove
 * ownership of and the poll is skipped, not weakened.
 */
async function runFatalCase(
  name,
  { expectedCode, otherCode, startCondition, containmentLabel, needsOwnership },
) {
  const appImage = resolveAppImage();
  if (appImage.error !== undefined) {
    fail(`${name} appimage`, appImage.error);
    return;
  }

  const holder = await startCondition();
  let run = null;
  try {
    // C-ISO@1 rule 5, on the holder: this run's `testRunId`, or the app is not
    // launched at all. The poll is the wrapper's own 30 s budget.
    if (needsOwnership) {
      const owned = await waitForOwnership(30_000, `${name} holder`);
      if (!check(`${name} holder owns the run`, owned, 'ownership never matched')) return;
    }

    run = launchApp(appImage.path);
    const error = await waitForWindowTitle(
      new RegExp(`${expectedCode}|${otherCode}`),
      30_000,
      `${name} code`,
    );
    const names = (error.windows ?? []).map((w) => w.name);
    check(
      `${name} the error screen names the code`,
      error.found !== null,
      `neither code appeared in a window name within 30s while waiting for ${String(error.waitedFor)} (saw ${JSON.stringify(error.seen ?? names)})`,
    );
    // "carrying that code and not the other one": both halves, not either.
    check(
      `${name} the code is ${expectedCode} and not ${otherCode}`,
      error.found !== null && error.found.includes(expectedCode) && !error.found.includes(otherCode),
      `the window name was ${JSON.stringify(error.found)}`,
    );

    // The bilingual screen is up and the splash is gone: only the error window
    // remains, and no spinner. Compared as exact strings, because this is the
    // comparison the case-insensitive `--name` search got wrong before.
    const splashGone = !names.includes('Apunta — starting');
    check(`${name} the splash is gone`, splashGone, `window names were ${JSON.stringify(names)}`);

    // The containment assertion: the process holding the condition is **still
    // alive** now that the case's assertions passed. This is what makes the row
    // a containment row rather than a smoke test.
    check(`${name} ${containmentLabel} is still alive`, holder.isAlive(), 'the holder is gone');

    // Nothing the shell started outlived it.
    await stopPid(shellPid(run.child), 'the shell');
    await sleep(1500);
  } finally {
    if (run !== null) await stopPid(shellPid(run.child), 'the shell');
    await holder.stop();
  }
}

async function modeFatal() {
  const bundle = join(repoRoot, 'build', 'linux-resources');

  // Case one: the port. The dummy is stopped after this case's assertions and
  // before the holder binds, so 7832 is free when the holder needs it.
  const dummy = await holdPort(port);
  await runFatalCase('fatal-port', {
    expectedCode: 'port_in_use',
    otherCode: 'data_folder_in_use',
    containmentLabel: 'the dummy listener on the port',
    needsOwnership: false,
    startCondition: async () => {
      let alive = true;
      dummy.on('error', () => {
        alive = false;
      });
      dummy.on('close', () => {
        alive = false;
      });
      return {
        isAlive: () => alive,
        stop: async () => {
          await new Promise((done) => dummy.close(done));
        },
      };
    },
  });

  // C-ISO@1 rule 7's cleanup, on the success path and on failure alike: nothing
  // of this run may still be listening on the pinned port, or the row is
  // unrepeatable and the next attempt hits "refusing port 7832: already in use".
  const freeAfterDummy = await isPortFree(port);
  check(
    'fatal-port the dummy stopped and 7832 is free',
    freeAfterDummy,
    `127.0.0.1:${String(port)} is still bound after the dummy was closed`,
  );

  // Case two: the folder. The holder is a plain server process on the same data
  // folder, and the app is then the second launch.
  await runFatalCase('fatal-folder', {
    expectedCode: 'data_folder_in_use',
    otherCode: 'port_in_use',
    containmentLabel: 'the lock holder',
    needsOwnership: true,
    startCondition: async () => {
      const holder = startLockHolder(bundle);
      const pid = holder.child.pid;
      return {
        isAlive: () => pidAlive(pid),
        stop: async () => {
          await stopPid(pid, 'the lock holder');
        },
      };
    },
  });

  const freeAtEnd = await isPortFree(port);
  check(
    'V4 nothing of this run is still listening on the port',
    freeAtEnd,
    `127.0.0.1:${String(port)} is still bound`,
  );
}

// ------------------------------------------------------------------- V5 ----

async function modeSingleInstance() {
  const appImage = resolveAppImage();
  if (appImage.error !== undefined) {
    fail('V5 appimage', appImage.error);
    return;
  }

  let first = null;
  let second = null;
  try {
    first = launchApp(appImage.path);
    const firstPid = shellPid(first.child);

    // The same strengthened window assertion V3 uses: an exact name, this run's
    // shell as the owning pid, a real size, and inside the display. A
    // case-insensitive title match against a hidden 20x20 helper window would
    // satisfy this before the server had even said `ready`.
    const home = await findAppWindow(firstPid, 60_000, 'V5 first instance');
    check(
      'V5 the first instance reaches the home screen',
      home.found !== null,
      `no window named exactly Apunta owned by pid ${String(firstPid)} inside the display within 60s while waiting for ${String(home.waitedFor)} (saw ${JSON.stringify(home.seen ?? [])})`,
    );
    const owned = await waitForOwnership(30_000, 'V5 first instance');
    check('V5 the first instance owns the run', owned, 'no ownership on the sandbox port');

    // Snapshotted **after** the first instance is up: C-OWN@1's files are
    // created by that first launch, and comparing against an empty folder would
    // report the first instance's own lock and database as a second one.
    const before = snapshotOwnership();
    check(
      'V5 the first instance created the ownership files',
      before.every((file) => file.present),
      `missing: ${before
        .filter((f) => !f.present)
        .map((f) => f.name)
        .join(', ')}`,
    );

    // Exactly one server process for the run. The check is on the child the
    // first shell spawned, and it is re-checked after the second launch.
    const serverPidCount = () => countServerProcesses(dataDir);
    check(
      'V5 exactly one server process exists for the run',
      serverPidCount() === 1,
      `found ${String(serverPidCount())} bundled servers on this data folder`,
    );

    // The second launch, reaped inside the **existing** 10 s quit-ladder budget
    // — a card value, not a new threshold.
    second = launchApp(appImage.path);
    const secondPid = shellPid(second.child);
    const budgetMs = 10_000;
    const started = Date.now();
    let reaped = false;
    while (Date.now() - started < budgetMs) {
      if (!pidAlive(secondPid)) {
        reaped = true;
        break;
      }
      await sleep(200);
    }
    check(
      'V5 the second launch is reaped inside the 10s quit-ladder budget',
      reaped,
      `pid ${String(secondPid)} was still alive after ${String(budgetMs)}ms`,
    );

    // It was reaped without ever becoming a server's parent: still one server,
    // and the first instance still answers with this run's id.
    check(
      'V5 still exactly one server process after the second launch',
      serverPidCount() === 1,
      `found ${String(serverPidCount())} bundled servers on this data folder`,
    );
    check(
      'V5 the first instance is untouched',
      pidAlive(firstPid),
      `the first shell (pid ${String(firstPid)}) is gone`,
    );
    const stillOurs = (await healthRunId()) === runId;
    check('V5 the first instance still answers /api/health', stillOurs, 'health did not answer with our id');

    // No second set of C-OWN@1's files, and the lock that is there is still the
    // first instance's: same size, same bytes, same pid inside it.
    const after = snapshotOwnership();
    const created = after.filter((file, index) => file.present && !before[index].present);
    check(
      'V5 no second lock, database, -wal or -shm',
      created.length === 0,
      `created: ${created.map((f) => f.name).join(', ')}`,
    );
    const lockBefore = readFileSyncSafe(before.find((f) => f.name === 'apunta.lock')?.path);
    const lockAfter = readFileSyncSafe(after.find((f) => f.name === 'apunta.lock')?.path);
    check(
      "V5 the lock on disk is still the first instance's",
      lockBefore !== null && lockBefore === lockAfter,
      lockBefore === null || lockAfter === null
        ? 'the lock file could not be read'
        : `before ${JSON.stringify(lockBefore)}, after ${JSON.stringify(lockAfter)}`,
    );

    // The focus read, which is a separate assertion and is only attempted when a
    // focus reader is present **and** the owner authorised it. It never stands in
    // for the assertions above, and it is recorded NOT RUN otherwise — never
    // PASS.
    const reader = firstOnPath(['xdotool', 'wmctrl']);
    if (process.env['APUNTA_ALLOW_FOCUS_TEST'] !== '1') {
      notRun(
        'V5 focus read',
        'APUNTA_ALLOW_FOCUS_TEST is not set for this run, and a focus read takes the owner focus mid-work',
      );
    } else if (reader === undefined) {
      notRun('V5 focus read', 'no focus reader (xdotool or wmctrl) is on PATH');
    } else {
      const active = await spawnAsync(reader, ['getactivewindow', 'getwindowname']);
      const titled = /Apunta/.test(active.stdout);
      if (titled) pass('V5 focus read');
      else fail('V5 focus read', `the active window was ${JSON.stringify(active.stdout.trim())}`);
    }
  } finally {
    if (second !== null) await stopPid(shellPid(second.child), 'the second shell');
    if (first !== null) await stopPid(shellPid(first.child), 'the first shell');
  }
}

/** Records a criterion that could not run, with its cause. Never a PASS. */
function notRun(name, reason) {
  results.push({ name, ok: true, notRun: true });
  process.stdout.write(`NOT RUN ${name}: ${reason}\n`);
}

/** The first of these that is on `PATH`, or `undefined`. */
function firstOnPath(names) {
  const dirs = (process.env['PATH'] ?? '').split(':').filter((d) => d !== '');
  for (const name of names) {
    for (const dir of dirs) {
      if (existsSync(join(dir, name))) return name;
    }
  }
  return undefined;
}

function spawnAsync(command, args) {
  return new Promise((done) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => {
      stdout += c.toString('utf8');
    });
    child.stderr.on('data', (c) => {
      stderr += c.toString('utf8');
    });
    child.on('error', (error) => done({ stdout: '', stderr: String(error) }));
    child.on('close', () => done({ stdout, stderr }));
  });
}

/** How many bundled server processes are running on this data folder. */
function countServerProcesses(folder) {
  let count = 0;
  for (const entry of readdirSync('/proc')) {
    if (!/^\d+$/.test(entry)) continue;
    const cmdline = readProcField(entry, 'cmdline');
    if (cmdline === null) continue;
    // P3.1's bundled server, and this run's data folder in its environment:
    // both halves, so a second Apunta elsewhere on the machine is not counted.
    if (!cmdline.includes('server.mjs') || !cmdline.includes('linux-resources')) continue;
    const environ = readProcField(entry, 'environ');
    if (environ === null) continue;
    if (!environ.includes(`APUNTA_DATA_DIR=${folder}`)) continue;
    count += 1;
  }
  return count;
}

/**
 * `/proc/<pid>/cmdline` or `/proc/<pid>/environ` as one space-separated string.
 *
 * A process that exits between the `readdir` and the open returns `null`, which
 * is the normal race here and not a failure.
 */
function readFileSyncSafe(path) {
  if (path === undefined) return null;
  try {
    // Compared as text, not as Buffers: two Buffers holding the same bytes are
    // still two objects, and `===` on them would report a difference that is not
    // one.
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

// ------------------------------------------------------------------ main ----

/** The row, or this process's exit code once a re-executed harness has run it. */
async function main() {
  const reexec = ensureDisplay();
  if (reexec !== null) {
    return await new Promise((settle) => {
      reexec.on('exit', (code, signal) => settle(signal === null ? (code ?? 0) : 1));
      reexec.on('error', (error) => {
        process.stderr.write(`tauri-lifecycle: ${String(error)}\n`);
        settle(1);
      });
    });
  }

  const mode = process.argv[2];
  const modes = {
    launch: modeLaunch,
    'window-close': modeWindowClose,
    'forced-close': modeForcedClose,
    fatal: modeFatal,
    'single-instance': modeSingleInstance,
  };
  const chosen = modes[mode];
  if (chosen === undefined) {
    process.stderr.write(
      `tauri-lifecycle: unknown mode ${String(mode)}\nusage: launch | window-close | forced-close | fatal | single-instance\n`,
    );
    return 2;
  }

  await chosen();

  const failed = results.filter((r) => !r.ok);
  const notRunCount = results.filter((r) => r.notRun === true).length;
  process.stdout.write(
    `\n${String(results.length - failed.length)}/${String(results.length)} assertions passed` +
      (notRunCount > 0 ? `, ${String(notRunCount)} NOT RUN` : '') +
      '\n',
  );
  return failed.length > 0 ? 1 : 0;
}

process.exitCode = await main();

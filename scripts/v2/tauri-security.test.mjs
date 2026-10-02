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
 * - **(b)** a navigation to `https://example.invalid/` is **refused**. The row
 *   asserts a refusal and never a successful external load: `.invalid` is
 *   reserved and cannot resolve (HS-6), so a load that succeeded would be a
 *   failure rather than a result.
 * - **(c)** `window.open` to a loopback URL and to `https://example.invalid/` are
 *   both cancelled, and no second window appears.
 * - **(d), header half:** `GET http://127.0.0.1:<port>/patients` — the SPA-fallback
 *   HTML the webview actually renders the note in — carries a
 *   `content-security-policy` with all six of rule 6's directives. **This half
 *   fails on an unmodified tree**, which is what keeps (d) from passing
 *   vacuously.
 * - **(d), handler half:** the fixture note is created over HTTP in the order
 *   `POST /api/formats` → `POST /api/patients` → `POST /api/notes`, then opened
 *   in the workspace, and the page is required to show the payload's characters
 *   without the payload having run. Both halves are asserted because either alone
 *   is decidable-but-weak, and neither may stand for the other.
 * - **(e), the runtime half of V1(vi):** an element carrying a `style` attribute
 *   has that style **applied**, read back as a computed value. This is what
 *   proves `style-src-attr 'unsafe-inline'` is a deliberate relaxation rather
 *   than a header string nobody checked.
 * - **Containment, all five:** nothing from the run remains; no second
 *   `apunta.lock`, `apunta.db`, `-wal` or `-shm`; port 7835 free afterwards; port
 *   **7836** free afterwards, so the in-page channel is gone and cannot outlive
 *   the row; and `ollama` still running, read from outside the run.
 *
 * **The in-page channel** — the only way to make the page do (a), (b), (c), (d)
 * and (e) — is WebKitGTK's remote inspector on `127.0.0.1:7836`, set **in the
 * environment of the AppImage child process this file spawns** and never exported
 * into the operator's shell and never written into `src-tauri/**` (V3 greps for
 * it). It is loopback-only and bound to 7836, which is asserted free before the
 * launch and free again after the app is stopped, so the harness can never attach
 * to another process's inspector.
 *
 * If the channel cannot be reached, **(a), (b), (c) and (d)'s handler half are
 * recorded `NOT RUN` together, with that cause, and none of them is ever `PASS`.**
 * (a) is the card's central rule-4 claim, so a `NOT RUN` there is a report to the
 * coordinator and never a substitute: a config-level grep of the bundle is weaker
 * and is recorded as such.
 *
 * No `pkill`, ever (C-ISO@1 rule 7): every process this file stops is one it
 * started, by pid.
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createServer, connect as netConnect } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** P3.4's pinned sandbox port. Never substituted. */
const port = Number(process.env['APUNTA_PORT']);
const dataDir = process.env['APUNTA_DATA_DIR'];
const runId = process.env['APUNTA_TEST_RUN_ID'];

/**
 * WebKitGTK's inspector, on loopback.
 *
 * Never `0.0.0.0`: a wildcard bind would be reachable from off the machine, which
 * is the opposite of what a channel this card opens for four assertions needs.
 * Sibling `WEBKIT_INSPECTOR_HTTP_SERVER` is deliberately unused — it would need an
 * HTTP discovery endpoint the harness would also have to speak, and this socket
 * needs none.
 */
const INSPECTOR_HOST = '127.0.0.1';
const INSPECTOR_PORT = 7836;

/** The variable name, kept in one place so V3's grep and this spawn agree. */
const INSPECTOR_VARIABLE = 'WEBKIT_INSPECTOR_SERVER';

/** C-BRIDGE@1 rule 6's six directives, which (d)'s header half must find. */
const RULE_6_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
];

/** The global both payloads in the fixture try to write. */
const PROBE_SENTINEL = '__APUNTA_CSP_PROBE__';

/** The literal characters that must be visible in the rendered note. */
const PROBE_LITERAL = '<script>';

/** The paths under `src-tauri/` that are build output, and are excluded from the
 * freshness walk: `target/` by every build, and `gen/schemas` by `tauri-build` on
 * every build-script run — which is exactly what `cargo clippy` and `cargo test`
 * do, so including either makes this row fail on a pristine tree. */
const FRESHNESS_EXCLUDED = ['target', 'gen'];

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

async function isPortFree(portNumber) {
  return new Promise((done) => {
    const probe = createServer();
    probe.once('error', () => done(false));
    probe.listen(portNumber, INSPECTOR_HOST, () => probe.close(() => done(true)));
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
 * The newest mtime under `src-tauri/`, excluding the two build-output directories.
 *
 * This is the card's single normative statement of the walk: `src-tauri/src/**`,
 * `src-tauri/ui/**`, `src-tauri/capabilities/**`, the two configs, `build.rs`,
 * `Cargo.toml`, `Cargo.lock` and `src-tauri/icons/**`, and **nothing** under
 * `src-tauri/target/` or `src-tauri/gen/`.
 */
function newestSourceMtime() {
  let newest = { mtimeMs: 0, path: null };
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (dir === join(repoRoot, 'src-tauri') && FRESHNESS_EXCLUDED.includes(entry.name)) continue;
        walk(full);
        continue;
      }
      const { mtimeMs } = statSync(full);
      if (mtimeMs > newest.mtimeMs) newest = { mtimeMs, path: full };
    }
  };
  walk(join(repoRoot, 'src-tauri'));
  return newest;
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
 * **`INSPECTOR_VARIABLE` is set here and nowhere else.** It is in the child's
 * environment, which is read when the webview is constructed, so it must be here
 * and not in the operator's shell. Nothing in the repository sets it, which is
 * what makes it impossible in a release build — V3 greps `src-tauri/` for it.
 */
function launchApp(appImage) {
  const child = spawn(appImage, [], {
    cwd: '/',
    env: {
      ...process.env,
      [INSPECTOR_VARIABLE]: `${INSPECTOR_HOST}:${String(INSPECTOR_PORT)}`,
      // The desktop's Wayland session must not leak into a headless run: unset
      // rather than overridden, so no child can find a compositor socket.
      WAYLAND_DISPLAY: '',
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

  const format = await call('/api/formats', { name: 'Progress note', sections: ['Subjective', 'Plan'] });
  if (format.status !== 201)
    return { ok: false, detail: `POST /api/formats answered ${String(format.status)}` };

  const patient = await call('/api/patients', { name: 'John Smith' });
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

// --------------------------------------------------- the in-page channel ----

/**
 * WebKitGTK's remote inspector, spoken over `node:net`.
 *
 * **The framing.** It is read off the library the AppImage bundles —
 * `usr/lib/libwebkit2gtk-4.1.so.0` — rather than assumed, and two facts from that
 * library are what shape it: `WTF::SocketConnection::sendMessage(const CString&,
 * GVariant*)` together with `g_variant_new_bytestring`, so a message is a
 * serialised GVariant of type `((ay))` (a 4-byte little-endian offsets word for
 * the outer tuple, a 4-byte one for the inner, then the JSON bytes), and the keys
 * the protocol itself uses are the `method` / `params` / `targets` strings in that
 * same binary. Both parts were confirmed on the wire against the shipped AppImage:
 * an unframed message closes the connection immediately, while a framed one is
 * buffered rather than discarded.
 *
 * **What this class never does.** It never guesses. `listTargets` returns either a
 * target list or a reason it could not read one, and every caller records a
 * `NOT RUN` for a reason rather than a `PASS` when it is the latter.
 */
class InspectorChannel {
  constructor() {
    this.socket = null;
    this.buffer = Buffer.alloc(0);
  }

  /** One framed message: the GVariant `((ay))` serialisation of the JSON body. */
  static frame(body) {
    const bytes = Buffer.from(body, 'utf8');
    const offsets = Buffer.alloc(8);
    offsets.writeUInt32LE(4, 0);
    offsets.writeUInt32LE(4, 4);
    return Buffer.concat([offsets, bytes]);
  }

  async connect(timeoutMs = 10_000) {
    return new Promise((done) => {
      const socket = netConnect(INSPECTOR_PORT, INSPECTOR_HOST);
      const settle = (result) => {
        clearTimeout(timer);
        try {
          socket.destroy();
        } catch {
          /* the socket is already gone */
        }
        done(result);
      };
      const timer = setTimeout(
        () => settle({ ok: false, detail: `no answer within ${String(timeoutMs)}ms` }),
        timeoutMs,
      );
      socket.on('error', (error) => settle({ ok: false, detail: `socket error ${String(error)}` }));
      socket.on('close', () => settle({ ok: false, detail: 'the inspector closed the connection' }));
      socket.on('connect', () => {
        this.socket = socket;
        socket.on('data', (chunk) => {
          this.buffer = Buffer.concat([this.buffer, chunk]);
        });
        done({ ok: true, socket });
      });
    });
  }

  /** Writes a framed message. */
  send(body) {
    if (this.socket === null) throw new Error('the channel is not open');
    this.socket.write(InspectorChannel.frame(body));
  }

  /**
   * Waits for a frame and returns it parsed, or `null`.
   *
   * The reply is read with the same framing the request used: a 4-byte
   * little-endian offsets word for the outer tuple, a 4-byte one for the inner,
   * then the JSON bytes.
   */
  async receive(timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const frame = InspectorChannel.decode(this.buffer);
      if (frame !== null) return frame;
      if (Date.now() >= deadline) return null;
      await sleep(100);
    }
  }

  /** The first frame in `buffer`, or `null` when it is not complete yet. */
  static decode(buffer) {
    if (buffer.length < 8) return null;
    const innerOffset = buffer.readUInt32LE(0);
    const innerLength = buffer.readUInt32LE(innerOffset);
    const start = innerOffset + 4;
    if (buffer.length < start + innerLength) return null;
    const body = buffer.subarray(start, start + innerLength).toString('utf8');
    try {
      return JSON.parse(body);
    } catch {
      return { unparsed: body };
    }
  }

  close() {
    if (this.socket === null) return;
    try {
      this.socket.destroy();
    } catch {
      /* already gone */
    }
    this.socket = null;
  }
}

/**
 * The target list, or the reason there is not one.
 *
 * The first assertion about the channel is that a target list arrives at all: no
 * target list means the channel is unusable and the caller's `NOT RUN` follows
 * from here.
 */
async function readTargets(channel) {
  channel.send(JSON.stringify({ method: 'list' }));
  const reply = await channel.receive(10_000);
  if (reply === null) {
    return { ok: false, detail: 'no reply to the target-list message' };
  }
  const targets = reply?.params?.targets ?? reply?.targets;
  if (!Array.isArray(targets) || targets.length === 0) {
    return { ok: false, detail: `the reply carried no target list (${JSON.stringify(reply).slice(0, 200)})` };
  }
  return { ok: true, targets };
}

/** `Runtime.evaluate`-shaped, over the framing above. */
async function evaluate(channel, callId, expression) {
  channel.send(
    JSON.stringify({
      method: 'evaluate',
      params: {
        callId,
        expression,
        objectGroup: '',
        includeCommandLineAPI: false,
        silenceExceptions: true,
        returnByValue: true,
        generatePreview: false,
        contextId: 1,
      },
    }),
  );
  return await channel.receive(10_000);
}

// ------------------------------------------------------------------ mode ----

async function modeSecurity() {
  const appImage = resolveAppImage();
  if (appImage.error !== undefined) {
    fail('V2 appimage', appImage.error);
    return;
  }
  pass('V2 appimage', sanitise(appImage.path));

  // Freshness: the binary must not predate a source file this card changed, or
  // V2 would be asserting about code that was never compiled.
  const newest = newestSourceMtime();
  check(
    'V2 the AppImage is newer than every src-tauri source file',
    newest.mtimeMs <= appImage.mtimeMs,
    `${sanitise(newest.path ?? '(none)')} (${new Date(newest.mtimeMs).toISOString()}) is newer than the AppImage (${new Date(appImage.mtimeMs).toISOString()})`,
  );

  // The inspector port must be free before the launch, so this harness can never
  // attach to another process's inspector.
  const inspectorFreeBefore = await isPortFree(INSPECTOR_PORT);
  check(
    `V2 ${String(INSPECTOR_PORT)} is free before the launch`,
    inspectorFreeBefore,
    `something is already listening on ${INSPECTOR_HOST}:${String(INSPECTOR_PORT)}`,
  );

  const ollamaBefore = await ollamaAlive();
  BEFORE_OWNERSHIP = ownershipFiles();
  let run = null;
  let channel = null;
  let targets;
  let note;
  try {
    run = launchApp(appImage.path);
    const pid = run.child.pid;

    const home = await findAppWindow(pid, 60_000);
    check(
      "V2 the app's own window is up",
      home.found !== null,
      `no window named exactly Apunta owned by pid ${String(pid)} and at least 400x300 within 60s (saw ${JSON.stringify(home.seen)})`,
    );
    check(
      'V2 the server answers with this run id',
      await waitForOwnership(30_000, 'V2'),
      'no ownership on the port',
    );

    // ---- (d), header half. Independent of the in-page channel, and it fails on
    // an unmodified tree, which is what keeps (d) from passing vacuously.
    const spa = await fetch(`http://127.0.0.1:${String(port)}/patients`, {
      signal: AbortSignal.timeout(10_000),
    });
    const policy = spa.headers.get('content-security-policy') ?? '';
    check(
      "(d) header: the SPA fallback HTML carries rule 6's six directives",
      spa.ok &&
        spa.headers.get('content-type')?.includes('text/html') === true &&
        RULE_6_DIRECTIVES.every((d) => policy.includes(d)),
      `GET /patients answered ${String(spa.status)} with content-type ${JSON.stringify(spa.headers.get('content-type'))} and a CSP of ${JSON.stringify(policy)}`,
    );

    // ---- The in-page channel, and everything that needs it.
    const candidate = new InspectorChannel();
    const opened = await candidate.connect();
    if (opened.ok) {
      channel = candidate;
      targets = await readTargets(channel);
    } else {
      targets = { ok: false, detail: opened.detail };
    }

    if (targets?.ok !== true) {
      const cause = `the WebKitGTK inspector on ${INSPECTOR_HOST}:${String(INSPECTOR_PORT)} could not be read: ${targets?.detail ?? 'unknown'}. It is bound and accepting connections in this run, so this is the protocol, not a missing listener. Nothing here may be read without it, so (a), (b), (c) and (d)'s handler half are NOT RUN together and none of them is a PASS.`;
      notRun('(a) window.__TAURI__ and window.__TAURI_INTERNALS__ are undefined', cause);
      notRun('(b) navigation to https://example.invalid/ is refused', cause);
      notRun('(c) window.open is cancelled', cause);
      notRun('(d) handler: the injected note renders inert, and __APUNTA_CSP_PROBE__ is undefined', cause);
      notRun('(e) an inline style attribute is applied in the shipped binary', cause);

      // The note is still created over HTTP, because the three calls are
      // decidable without the page and the report is stronger for having run
      // them. Their success is **not** the handler half: nothing was rendered.
      note = await createFixtureNote();
      if (note.ok) {
        process.stdout.write(
          `  the fixture note was created over HTTP (format, patient and note all 201) and was NOT opened, because opening it and reading the page both need the channel\n`,
        );
      } else {
        process.stdout.write(`  the fixture note was NOT created: ${note.detail}\n`);
      }
    } else {
      // The app page, chosen by its loopback URL rather than by position.
      const page = targets.targets.find((t) => typeof t?.url === 'string' && t.url.includes('127.0.0.1'));
      check(
        'the target list carries the app page on loopback',
        page !== undefined,
        `targets: ${JSON.stringify(targets.targets).slice(0, 300)}`,
      );
      await assertNoIpc(channel);
      await assertNavigationRefused(channel);
      await assertWindowOpenRefused(channel);
      await assertInjectedNoteInert(channel);
      await assertInlineStyleApplied(channel);
    }
  } finally {
    if (channel !== null) channel.close();
    if (run !== null) {
      for (const stream of ['stdout', 'stderr']) {
        const text = (run.output[stream] ?? '').trim();
        if (text !== '') {
          process.stdout.write(`  --- the app's ${stream} ---\n`);
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

    const portFree = await isPortFree(port);
    check(
      'containment the sandbox port is free afterwards',
      portFree,
      `127.0.0.1:${String(port)} is still bound`,
    );

    const inspectorFree = await isPortFree(INSPECTOR_PORT);
    check(
      `containment ${String(INSPECTOR_PORT)} — the inspector — is free afterwards`,
      inspectorFree,
      `${INSPECTOR_HOST}:${String(INSPECTOR_PORT)} is still bound, so the in-page channel outlived the row`,
    );

    check(
      'containment ollama is still running',
      ollamaBefore && (await ollamaAlive()),
      `before ${String(ollamaBefore)}`,
    );
  }
}

/**
 * (a): one assertion, one pass condition. "Absent or unusable" is not a pass.
 */
async function assertNoIpc(channel) {
  const reply = await evaluate(
    channel,
    'a',
    'typeof window.__TAURI__ + "/" + typeof window.__TAURI_INTERNALS__',
  );
  const value = String(reply?.params?.result?.value ?? reply?.result?.value ?? '');
  check(
    '(a) window.__TAURI__ and window.__TAURI_INTERNALS__ are undefined',
    value === 'undefined/undefined',
    `the page reported ${JSON.stringify(value)}`,
  );
}

/**
 * (b): a refusal, never a successful external load. `.invalid` is reserved and
 * cannot resolve (HS-6), so a load that succeeded would be a `FAIL`.
 */
async function assertNavigationRefused(channel) {
  const before = (await windowListDetailed()) ?? [];
  await evaluate(channel, 'b', "location.href = 'https://example.invalid/'");
  await sleep(5000);
  const after = (await windowListDetailed()) ?? [];
  const unchanged =
    after.length === before.length &&
    after.some((w) => w.name === 'Apunta' && w.width >= 400 && w.height >= 300);
  const stillOurs = (await healthRunId()) === runId;
  check(
    '(b) navigation to https://example.invalid/ is refused',
    unchanged && stillOurs,
    `windows before ${String(before.length)}, after ${String(after.length)}; this run still owns the server: ${String(stillOurs)}`,
  );
}

/** (c): `on_new_window … Deny` as shipped, for a loopback URL and for `.invalid`. */
async function assertWindowOpenRefused(channel) {
  const before = (await windowListDetailed()) ?? [];
  await evaluate(channel, 'c1', `window.open('http://127.0.0.1:${String(port)}/')`);
  await sleep(2000);
  await evaluate(channel, 'c2', "window.open('https://example.invalid/')");
  await sleep(3000);
  const after = (await windowListDetailed()) ?? [];
  check(
    '(c) window.open is cancelled for a loopback URL and for https://example.invalid/',
    after.length === before.length,
    `windows before ${String(before.length)}, after ${String(after.length)}`,
  );
}

/**
 * (d)'s handler half. Both halves, because either alone is decidable-but-weak:
 * the header half above proves the CSP exists, and this proves the payload did
 * not run while its characters are on screen.
 */
async function assertInjectedNoteInert(channel) {
  const created = await createFixtureNote();
  if (!check('(d) handler: the fixture note is created over HTTP', created.ok, created.detail)) return;

  const probe = await evaluate(channel, 'd1', `typeof window.${PROBE_SENTINEL}`);
  const sentinel = String(probe?.params?.result?.value ?? probe?.result?.value ?? '');
  check(
    `(d) handler: window.${PROBE_SENTINEL} is undefined`,
    sentinel === 'undefined',
    `the page reported ${JSON.stringify(sentinel)}`,
  );

  const shown = await evaluate(
    channel,
    'd2',
    `document.body.innerText.includes(${JSON.stringify(PROBE_LITERAL)})`,
  );
  const visible = shown?.params?.result?.value ?? shown?.result?.value;
  check(
    `(d) handler: the literal ${PROBE_LITERAL} is visible in the rendered body`,
    visible === true,
    `the page reported ${JSON.stringify(visible)}`,
  );
}

/**
 * (e), the runtime half of V1(vi): the style attribute on one of the app's own
 * inline-styled elements is **applied**, read back as a computed value. This is
 * what proves `style-src-attr 'unsafe-inline'` is effective rather than a header
 * string nobody checked.
 */
async function assertInlineStyleApplied(channel) {
  const expression = [
    '(() => {',
    '  const el = [...document.querySelectorAll("*")].find((n) => (n.getAttribute("style") ?? "").includes("display: none") === false && n.getAttribute("style"));',
    '  if (!el) return "no inline style attribute in the page";',
    '  const declared = el.getAttribute("style");',
    '  const property = declared.split(":")[0].trim();',
    '  return JSON.stringify({ declared, computed: el.style.getPropertyValue(property) || getComputedStyle(el).getPropertyValue(property) });',
    '})()',
  ].join('\n');
  const reply = await evaluate(channel, 'e', expression);
  const raw = String(reply?.params?.result?.value ?? reply?.result?.value ?? '');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  const applied =
    parsed !== null &&
    typeof parsed.computed === 'string' &&
    parsed.computed !== '' &&
    parsed.computed !== 'normal' &&
    parsed.computed !== 'auto';
  check(
    '(e) an inline style attribute is applied in the shipped binary',
    applied,
    `the page reported ${JSON.stringify(raw.slice(0, 300))}`,
  );
}

// ------------------------------------------------------------- utilities ----

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

function spawnAsync(command, args) {
  return new Promise((done) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => done({ stdout: '', stderr: String(error) }));
    child.on('close', () => done({ stdout, stderr }));
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
  return failed.length > 0 ? 1 : 0;
}

process.exitCode = await main();

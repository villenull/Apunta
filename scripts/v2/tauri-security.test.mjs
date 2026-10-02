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
import { fileURLToPath } from 'node:url';

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
 * Everything the hook has published so far, read out of the AppImage child's
 * **captured stderr**.
 *
 * The shape mirrors what the hook sends: a fact line carries `href` and no
 * `batch`, a rectangle line carries `batch` and no `href`. Every value in a
 * marker URL is a URL-encoded scalar, so nothing is parsed out of prose and a
 * label can never be mistaken for a fact.
 */
function readObservations(stderrText) {
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
function lastFactWhere(stderrText, predicate) {
  const { facts } = readObservations(stderrText);
  for (let index = facts.length - 1; index >= 0; index -= 1) {
    if (predicate(facts[index])) return facts[index];
  }
  return null;
}

/** Waits for a fact line satisfying a predicate, or `null` on timeout. */
async function waitForFact(stderrText, predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = lastFactWhere(stderrText, predicate);
    if (found !== null) return found;
    if (Date.now() >= deadline) return null;
    await sleep(250);
  }
}

/** The rectangle the hook published for a visible label, or `null`. */
function rectForLabel(stderrText, label) {
  const { rects } = readObservations(stderrText);
  for (const rect of rects.values()) {
    if (rect['l'] === label) return rect;
  }
  return null;
}

/** Everything the hook has published about click targets, as one string. */
function rectSignature(stderrText) {
  const { rects } = readObservations(stderrText);
  return JSON.stringify(
    [...rects.entries()].sort((a, b) => Number(a[0]) - Number(b[0])).map(([, rect]) => rect),
  );
}

/**
 * Clicks a rectangle the hook published, at a label.
 *
 * `xdotool mousemove --sync --window <id> <x> <y> click 1` is the mechanism the
 * sibling card fixed, and the click lands at the **centre** of the rectangle the
 * page itself reported, so the target is a real label and never a class name, a
 * test id or a selector of this harness's own choosing.
 */
async function clickAt(windowId, rect) {
  const x = Number(rect['x']) + Math.floor(Number(rect['w']) / 2);
  const y = Number(rect['y']) + Math.floor(Number(rect['h']) / 2);
  const result = await spawnAsync('xdotool', [
    'mousemove',
    '--sync',
    '--window',
    String(windowId),
    String(x),
    String(y),
    'click',
    '1',
  ]);
  return { x, y, ok: !result.stdout.includes('XError') };
}

/**
 * Clicks a label and waits for the hook to publish something **different** —
 * which is the only proof that a click landed. The assertion the click enables is
 * never that proof.
 */
async function clickAndWaitForChange(windowId, stderrText, label, predicate, timeoutMs) {
  const before = rectSignature(stderrText);
  const rect = rectForLabel(stderrText, label);
  if (rect === undefined || rect === null) {
    return { ok: false, detail: `the hook published no rectangle for the label ${JSON.stringify(label)}` };
  }
  const clicked = await clickAt(windowId, rect);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const after = rectSignature(stderrText);
    const fact = predicate === undefined ? null : lastFactWhere(stderrText, predicate);
    const changed = after !== before || fact !== null;
    if (changed)
      return {
        ok: true,
        detail: `clicked ${JSON.stringify(label)} at ${String(clicked.x)},${String(clicked.y)}`,
      };
    if (Date.now() >= deadline) {
      return {
        ok: false,
        detail: `the click on ${JSON.stringify(label)} at ${String(clicked.x)},${String(clicked.y)} changed neither the published rectangles nor the published facts within ${String(timeoutMs)}ms, so it did not land`,
      };
    }
    await sleep(250);
  }
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
    check(
      "(d) header: the SPA fallback HTML carries rule 6's six directives",
      spa.ok &&
        spa.headers.get('content-type')?.includes('text/html') === true &&
        RULE_6_DIRECTIVES.every((d) => policy.includes(d)),
      `GET /patients answered ${String(spa.status)} with content-type ${JSON.stringify(spa.headers.get('content-type'))} and a CSP of ${JSON.stringify(policy)}`,
    );

    // ---- The observation channel. The first fact line is the assertion that it
    // works at all: without one, everything below is NOT RUN together.
    const first = await waitForFact(run.output.stderr, (fact) => fact['href'] !== undefined, 45_000);
    if (first === null) {
      const count = readObservations(run.output.stderr).markerLines;
      const cause =
        `no ${MARKER_PATH} line ever appeared in the AppImage child's captured stderr while the app window was up and the server was answering ` +
        `(${String(count)} marker line(s) read), so the observation hook publishes nothing this harness can read. ` +
        "Nothing here may be read without it, so (a), (b), (c), (d)'s handler half and (e) are NOT RUN together and none of them is a PASS.";
      notRun('(a) window.__TAURI__ and window.__TAURI_INTERNALS__ are undefined', cause);
      notRun('(b) navigation to the reserved .invalid origin is refused', cause);
      notRun('(c) window.open is cancelled', cause);
      notRun('(d) handler: the injected note renders inert, and __APUNTA_CSP_PROBE__ is undefined', cause);
      notRun('(e) an inline style attribute is applied in the shipped binary', cause);

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
    await assertInjectedNoteInert(run, home.found.id);
    await assertInlineStyleApplied(run);

    // ---- (b) and (c), which the hook makes in that fixed order once the note
    // is open, both read against the baseline above.
    await assertNavigationRefused(run, baselineWindows);
    await assertWindowOpenRefused(run, baselineWindows);
  } finally {
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
 * (a): one assertion, one pass condition. "Absent or unusable" is not a pass.
 */
async function assertNoIpc(run) {
  const fact = await waitForFact(
    run.output.stderr,
    (line) => line['tauri'] !== undefined && line['tauriInternals'] !== undefined,
    30_000,
  );
  check(
    '(a) window.__TAURI__ and window.__TAURI_INTERNALS__ are undefined',
    fact !== null && fact['tauri'] === 'undefined' && fact['tauriInternals'] === 'undefined',
    fact === null
      ? 'the hook published no fact line carrying both globals'
      : `the page reported tauri=${JSON.stringify(fact['tauri'])} and tauriInternals=${JSON.stringify(fact['tauriInternals'])}`,
  );
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
    run.output.stderr,
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
    run.output.stderr,
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
 * The note is opened by clicking two rectangles the page published for its own
 * visible labels, and a click that landed is proved by the published set changing
 * — a click that missed times out and **fails** the row.
 */
async function assertInjectedNoteInert(run, windowId) {
  const created = await createFixtureNote();
  if (!check('(d) handler: the fixture note is created over HTTP', created.ok, created.detail)) return;

  const patientClick = await clickAndWaitForChange(
    windowId,
    run.output.stderr,
    PATIENT_LABEL,
    undefined,
    30_000,
  );
  if (
    !check(
      `(d) handler: the ${JSON.stringify(PATIENT_LABEL)} row was clicked and landed`,
      patientClick.ok,
      patientClick.detail,
    )
  )
    return;

  const noteClick = await clickAndWaitForChange(
    windowId,
    run.output.stderr,
    NOTE_LABEL,
    (line) => line['scriptText'] === 'true',
    30_000,
  );
  if (
    !check(
      `(d) handler: the ${JSON.stringify(NOTE_LABEL)} row was clicked and landed`,
      noteClick.ok,
      noteClick.detail,
    )
  )
    return;

  const fact = await waitForFact(
    run.output.stderr,
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
  const fact = await waitForFact(run.output.stderr, (line) => (line['styleAttr'] ?? '') !== '', 20_000);
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
  // A `NOT RUN` is never a `PASS`, and it is never a green row either.
  return failed.length > 0 || notRunCount > 0 ? 1 : 0;
}

process.exitCode = await main();

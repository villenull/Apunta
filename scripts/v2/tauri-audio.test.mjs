#!/usr/bin/env node
/**
 * P3.5's audio capture harness (C-ISO@1, run in `env` mode).
 *
 *   node scripts/v2/tauri-audio.test.mjs capture
 *   node scripts/v2/tauri-audio.test.mjs tone
 *   node scripts/v2/tauri-audio.test.mjs silence
 *   node scripts/v2/tauri-audio.test.mjs capture --audio <dir>
 *
 * It drives the **real** AppImage V2 produced and the **real** bundled server,
 * with **real** pointer clicks (`xdotool`) on rectangles the app's own
 * observation hook published. There is no stub and no fake bridge line: the only
 * way this harness sees a marker line is for the shell to have read a line out
 * of its own child's stdout and re-emitted it to stderr.
 *
 * What each mode is, and what each one asserts:
 *
 * - `capture` (V3) — the fabricated English dictation is played into a virtual
 *   sink whose remap source is the default capture device, the app's own record
 *   button is clicked, and the phase, the timer, `levelPeak`, the
 *   `/api/transcribe` request on the captured stderr and the surfaced error code
 *   are asserted. `levelPeak` **not 0** is the load-bearing assertion: only
 *   non-zero frames that arrived through `getUserMedia` can make it non-zero.
 * - `tone` (V4, case one) — a tone burst train, not speech
 *   (`e2e/fixtures/audio/README.md`). The same assertions, and the same
 *   `levelPeak` **not 0**: frames really flowed.
 * - `silence` (V4, case two) — digital silence, the exact V1 artefact. The phase
 *   still reaches `recording` and the timer still advances (the microphone was
 *   opened and the graph ran), but **`levelPeak` stayed `0`** for the whole
 *   recording, decided on the hook's running maximum rather than on a
 *   change-only publish.
 *
 * What no mode claims, because with no whisper model on disk it cannot be true:
 * that a note is stored, or that a non-speech input is refused with
 * `transcription_empty`. `WhisperProvider.transcribe` throws
 * `whisper_model_missing` before it reads the WAV at all, so speech, tone and
 * silence all fail the same way here. Those claims, and every claim about words,
 * belong to S4a.2. `GET /api/notes` being empty is recorded as a **precondition**
 * and never as evidence of discrimination.
 *
 * **The microphone.** The host's default capture device is the owner's real USB
 * microphone. This harness is the one thing allowed to touch host audio state,
 * and only in this order: remember the default source, create the null sink and
 * the remap source, make the virtual source the default, and read it back — a
 * read-back that is anything other than `apunta_p35_mic` stops the row before
 * the app is launched. The teardown restores the remembered default and unloads
 * both modules on **every** exit path, including signals, and never kills
 * anything it did not start by pid (C-ISO@1 rule 7).
 *
 * **What the row cannot verify**, and does not claim: that the app opened the
 * device this run made default. `web/src/lib/recorder.ts:258-266` passes
 * `getUserMedia` no `deviceId`, so the Pulse default is the only lever, and
 * nothing in this repository observes which node the capture stream attached to.
 * The `pactl list short source-outputs` read narrows the window; it does not
 * close it.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The two names this card owns. Two runs never collide, and V5 reads them. */
const SINK_NAME = 'apunta_p35';
const SOURCE_NAME = 'apunta_p35_mic';

/** The owner's physical capture device. A stream on it is a stop, not a warning. */
const REAL_MIC_PREFIX = 'alsa_input.usb-UGREEN';

/** P3.5's own marker path, as it appears in the shell's stderr. */
const MARKER_PATH = '/p3.5-marker';

/** P3.4's marker path, which is where the inherited text-leaf rectangles come from. */
const OBSERVE_PATH = '/api/p3.4-observe';

/** P3.4's rule publishes a text leaf only when its trimmed `innerText` is 1–64 characters. */
const MAX_TEXT_LEAF = 64;

/** The app's own buttons, found by their own visible text (P3.4's rectangles). */
const STOP_LABEL = 'Stop and create draft';
const CONTINUE_LABEL = 'Continue';

/** The prototype's sample person (HS-8). Created through the API, in the sandbox. */
const PATIENT_NAME = 'John Smith';

/** The window title the shell gives the app window (P3.3's read). */
const APP_WINDOW_NAME = 'Apunta';

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

/** A row that could not run, with its cause. Never a PASS. */
function blocked(name, cause) {
  results.push({ name, ok: false, blocked: true });
  process.stdout.write(`BLOCKED ${name}: ${cause}\n`);
  process.exitCode = 3;
}

const port = Number(process.env['APUNTA_PORT']);
const dataDir = process.env['APUNTA_DATA_DIR'];
const runId = process.env['APUNTA_TEST_RUN_ID'];

if (!Number.isInteger(port) || !dataDir || !runId) {
  process.stderr.write(
    'tauri-audio: source the sandbox environment first:\n' +
      '  node scripts/v2/sandbox.mjs env --port 78xx > /tmp/apunta-v2-…env && . /tmp/apunta-v2-…env\n' +
      'APUNTA_DATA_DIR, APUNTA_PORT and APUNTA_TEST_RUN_ID are all required.\n',
  );
  process.exit(2);
}

// The host-global mutation below is never reached by accident: a session that
// forgot to set this gets exit 2, exactly as one that forgot to source the
// sandbox does.
if (process.env['APUNTA_ALLOW_AUDIO_TEST'] !== '1') {
  process.stderr.write(
    'tauri-audio: refusing to touch the host microphone without APUNTA_ALLOW_AUDIO_TEST=1\n',
  );
  process.exit(2);
}

/** `<sandbox>` for every run-folder path, so committed evidence carries no host paths. */
function sanitise(value) {
  return String(value)
    .replace(/\/tmp\/apunta-v2\/[^/\s'"]+/g, '<sandbox>')
    .replaceAll(repoRoot, '<repo>');
}

function sleep(ms) {
  return new Promise((done) => setTimeout(done, ms));
}

function spawnAsync(command, args, options = {}) {
  // `killAfterMs` bounds a call that can otherwise hang the whole row: a
  // `pactl unload-module` issued while a capture stream is still attached to the
  // virtual source has been measured to block for minutes, and a teardown that
  // blocks is a teardown that never restores the owner's microphone.
  const { killAfterMs, ...spawnOptions } = options;
  return new Promise((done) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...spawnOptions });
    let timer = null;
    if (typeof killAfterMs === 'number') {
      timer = setTimeout(() => {
        child.kill('SIGKILL');
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

// ------------------------------------------------------------------ pactl ----

/** Bounded on purpose: see `spawnAsync`'s `killAfterMs`. */
async function pactl(args) {
  return await spawnAsync('pactl', args, { killAfterMs: 20_000 });
}

/** `pactl get-default-source`, trimmed of the trailing newline only. */
async function defaultSource() {
  const read = await pactl(['get-default-source']);
  if (read.code !== 0) return null;
  return read.stdout.replace(/\n$/, '');
}

/** Synchronous, because it runs from the `exit` handler where nothing may await. */
function pactlSync(args) {
  try {
    const done = spawnSync('pactl', args, { encoding: 'utf8', timeout: 20_000 });
    return { code: done.status, stdout: done.stdout ?? '', stderr: done.stderr ?? '' };
  } catch {
    return { code: null, stdout: '', stderr: '' };
  }
}

/**
 * `pactl list short sources` → a numeric source-index → source-name table.
 *
 * The short source-outputs format prints a numeric **source index**, not a
 * source name (pactl 17.0: `%u\t%u\t%s\t%s\t%s`, where the second `%u` is the
 * source index and the `%s` is a numeric client index). A source-output can
 * therefore only be classified after it is resolved through this table. A row
 * that is malformed, carries a non-numeric or duplicated index, or an empty
 * name is an error — never silently skipped, because skipping is how an unknown
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
 * Every row must resolve to a known source index; a source index that is not in
 * the table (a stream whose source appeared between the two reads, or a stale
 * index) is an error, not an "unrelated, so safe" row. The result groups the
 * resolved streams so the caller can assert the virtual capture is present, no
 * stream is on the owner's real microphone, and every other stream is named.
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
    const clientId = Number(columns[2]);
    if (![streamId, sourceId, clientId].every((value) => Number.isInteger(value))) {
      throw new Error(`non-numeric source-outputs column: ${JSON.stringify(raw)}`);
    }
    if (!sources.has(sourceId)) {
      throw new Error(
        `source-output ${String(streamId)} names source index ${String(sourceId)}, which is not in the ` +
          'pactl sources table; the mapping is unknown and the row must not assume it is safe',
      );
    }
    all.push({ streamId, sourceId, clientId, sourceName: sources.get(sourceId), raw: raw.trim() });
  }
  return {
    all,
    virtual: all.filter((output) => output.sourceName === SOURCE_NAME),
    realMic: all.filter((output) => output.sourceName.startsWith(REAL_MIC_PREFIX)),
    unrelated: all.filter(
      (output) => output.sourceName !== SOURCE_NAME && !output.sourceName.startsWith(REAL_MIC_PREFIX),
    ),
  };
}

/**
 * Both live `pactl` reads, resolved together. A failed command is a stop: the
 * containment state is unknown, and an unknown state is never "safe".
 */
function classifyPactlReads(outputsRead, sourcesRead) {
  if (outputsRead.code !== 0) {
    throw new Error(
      `pactl list short source-outputs exited ${String(outputsRead.code)}: ${outputsRead.stderr.trim()}`,
    );
  }
  if (sourcesRead.code !== 0) {
    throw new Error(
      `pactl list short sources exited ${String(sourcesRead.code)}: ${sourcesRead.stderr.trim()}`,
    );
  }
  return classifySourceOutputs(outputsRead.stdout, sourcesRead.stdout);
}

// ------------------------------------------------------------ containment ----

/**
 * The one host-global mutation this card is allowed, and its teardown.
 *
 * The teardown is installed **before** anything is created, and it is
 * idempotent, so a signal at any point after the first module is loaded still
 * restores the owner's microphone and unloads what this run loaded. Without
 * `APUNTA_ALLOW_AUDIO_TEST=1` this object is never even constructed.
 */
const containment = {
  prevDefault: null,
  sinkId: null,
  srcId: null,
  restored: false,
  unloaded: false,

  async create() {
    if (process.env['APUNTA_ALLOW_AUDIO_TEST'] !== '1') {
      throw new Error('APUNTA_ALLOW_AUDIO_TEST=1 is required before any host audio state is touched');
    }
    // `pipewire-pulse` — the mechanism this card is pinned to — answers the
    // Pulse protocol and therefore names itself `PulseAudio (on PipeWire x.y.z)`.
    // What has to be established is that PipeWire is the server and that no
    // PulseAudio daemon and no `pacmd` are installed; the literal string
    // `Server Name: PipeWire` is one shape of that answer, not the only one.
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
      'sink_properties=device.description=Apunta_P3.5',
    ]);
    if (sink.code !== 0) {
      throw new Error(`loading module-null-sink failed: ${sink.stderr.trim()}`);
    }
    this.sinkId = sink.stdout.trim();

    const source = await pactl([
      'load-module',
      'module-remap-source',
      `source_name=${SOURCE_NAME}`,
      `master=${SINK_NAME}.monitor`,
    ]);
    if (source.code !== 0) {
      throw new Error(`loading module-remap-source failed: ${source.stderr.trim()}`);
    }
    this.srcId = source.stdout.trim();

    const set = await pactl(['set-default-source', SOURCE_NAME]);
    if (set.code !== 0) {
      throw new Error(`pactl set-default-source ${SOURCE_NAME} failed: ${set.stderr.trim()}`);
    }

    // The read-back is the whole point: the owner's microphone must be provably
    // not the default before a capture row clicks record at all (HS-1, HS-8).
    // It is **polled**, because `set-default-source` is applied asynchronously by
    // pipewire-pulse and an immediate read can still answer with the previous
    // source — measured here, where the first read came back with the USB
    // microphone and the same command a moment later answered `apunta_p35_mic`.
    // Polling is what makes "read back" mean "is the default now", and a value
    // that is still the physical device after the budget is a stop, not a retry
    // with a longer sleep.
    const deadline = Date.now() + 10_000;
    let now = await defaultSource();
    while (now !== SOURCE_NAME && Date.now() < deadline) {
      await sleep(250);
      now = await defaultSource();
    }
    if (now !== SOURCE_NAME) {
      throw new Error(
        `the default source read back as ${JSON.stringify(now)} after setting ${SOURCE_NAME} and waiting 10s, ` +
          `not ${SOURCE_NAME}; the app must not be launched against the owner's real microphone ` +
          `(the default before this row was ${JSON.stringify(this.prevDefault)})`,
      );
    }
    return { prevDefault: this.prevDefault, sinkId: this.sinkId, srcId: this.srcId, readBack: now };
  },

  /** Restore the default, then unload the source, then the sink — in that order. */
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

  /** The same order, synchronously, for `exit` and for a signal. */
  teardownSync() {
    if (this.prevDefault !== null && !this.restored) {
      pactlSync(['set-default-source', this.prevDefault]);
      this.restored = true;
    }
    // Each unload is checked rather than assumed, so a module this run loaded
    // and could not remove is reported on the way out instead of silently
    // outliving the harness.
    for (const key of ['srcId', 'sinkId']) {
      if (this[key] === null) continue;
      const done = pactlSync(['unload-module', this[key]]);
      if (done.code !== 0) {
        process.stderr.write(
          `tauri-audio: unload-module ${this[key]} failed on the exit path: ${done.stderr.trim()}\n`,
        );
      }
      this[key] = null;
    }
    this.unloaded = true;
  },
};

/**
 * Every pid this harness starts, so the exit hook can stop the ones a failed row
 * leaves behind.
 *
 * A live child keeps Node's event loop alive even when nothing references it —
 * which is what made a row that returned early sit for the whole `sleep 600`
 * before exiting. Stopping by pid here and nowhere else keeps C-ISO@1 rule 7
 * intact: nothing this harness did not start is ever signalled.
 */
const startedPids = new Set();

function rememberPid(pid) {
  if (typeof pid === 'number') startedPids.add(pid);
}

function installStrayPidStopper() {
  process.on('exit', () => {
    for (const pid of startedPids) {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        // Already gone.
      }
    }
  });
}

function installTraps() {
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => {
      containment.teardownSync();
      process.exit(signal === 'SIGINT' ? 130 : 143);
    });
  }
  process.on('exit', () => {
    containment.teardownSync();
  });
}

// ----------------------------------------------------------------- audio ----

/**
 * Where this run's audio lives, and the refusal that keeps generated speech out
 * of the repository.
 *
 * The refusal is the same one `scripts/v2/generate-es-audio.mjs:276-281` makes:
 * a directory inside this repository, or one sitting **directly** under
 * `/tmp/apunta-v2`, is refused. Search order when `--audio` is not given:
 *
 *   1. `APUNTA_AUDIO_SOURCE`, when the session names the folder V1 wrote;
 *   2. `<sandbox>/audio-en`, beside this run's own data folder;
 *   3. the newest run folder under `/tmp/apunta-v2` that holds an `audio-en`
 *      folder with the artefact — the run V1 wrote. Every path read is inside
 *      the sandbox root, and the live data folder is never opened.
 */
function audioDirFor(mode) {
  const refuse = (candidate, why) => {
    throw new Error(`refusing an audio directory ${JSON.stringify(candidate)}: ${why}`);
  };
  const accept = (candidate) => {
    if (!existsSync(candidate)) return null;
    if (candidate === repoRoot || candidate.startsWith(`${repoRoot}/`)) {
      refuse(candidate, 'it is inside the repository (L-POLICY row 4: generated audio is never committed)');
    }
    if (candidate === '/tmp/apunta-v2' || candidate.startsWith('/tmp/apunta-v2/')) {
      const rest = candidate.slice('/tmp/apunta-v2/'.length);
      if (!rest.includes('/')) {
        refuse(candidate, 'it sits directly under /tmp/apunta-v2, which is the sandbox root itself');
      }
    }
    return candidate;
  };

  const explicit = process.env['APUNTA_AUDIO_SOURCE'];
  if (explicit !== undefined && explicit !== '') return accept(resolve(explicit));

  const own = accept(join(dirname(dataDir), 'audio-en'));
  if (own !== null) return own;

  const wanted = mode === 'silence' ? 'silence-10s.wav' : 'dictation-30s.wav';
  const root = '/tmp/apunta-v2';
  if (existsSync(root)) {
    const runs = readdirSync(root)
      .filter((name) => statSync(join(root, name)).isDirectory())
      .sort();
    for (const name of runs.reverse()) {
      const candidate = accept(join(root, name, 'audio-en'));
      if (candidate !== null && existsSync(join(candidate, wanted))) return candidate;
    }
  }
  throw new Error(
    `no audio directory holds ${wanted}: pass --audio <dir> or set APUNTA_AUDIO_SOURCE to the folder V1 wrote`,
  );
}

async function sha256(path) {
  const read = await spawnAsync('sha256sum', [path]);
  return read.stdout.trim().split(/\s+/)[0] ?? '';
}

/** The audio this mode plays, and where it came from. */
function audioFileFor(mode, dir) {
  if (mode === 'silence') return join(dir, 'silence-10s.wav');
  if (mode === 'tone') {
    // Read, never modified: it is the repo's plumbing fixture, a tone burst train.
    return join(repoRoot, 'e2e', 'fixtures', 'audio', 'dictation-10s.wav');
  }
  return join(dir, 'dictation-30s.wav');
}

/**
 * `paplay` into the virtual sink only, by pid, never stopped with `pkill` and
 * never pointed at any other sink — so the owner's audio output is untouched.
 */
async function startPlayback(file) {
  const child = spawn('paplay', ['--device=' + SINK_NAME, '--rate=16000', '--channels=1', file], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString('utf8');
  });
  return { pid: child.pid, child, stderr: () => stderr };
}

// ---------------------------------------------------------------- the app ----

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

/**
 * The display, chosen at run time and printed rather than left to the reader —
 * P3.3's mechanism verbatim, because prefixing only the app would leave
 * `xdotool` reading a different display's window list.
 */
function ensureDisplay() {
  if (process.env['APUNTA_V2_AUDIO_HARNESS_XVFB'] === '1') {
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
      env: { ...process.env, APUNTA_V2_AUDIO_HARNESS_XVFB: '1' },
      stdio: 'inherit',
    },
  );
  return reexec;
}

function launchApp(appImage) {
  const child = spawn(appImage, [], {
    cwd: '/',
    env: {
      ...process.env,
      WAYLAND_DISPLAY: '',
      // The desktop session this harness is invoked from exports `GDK_SCALE=2`,
      // and it reaches the app through the environment. That is a property of the
      // **session**, not of this sandbox display: it made the shell read a scale
      // of 2 off a plain 1400x1000 Xvfb screen, halve its window in CSS pixels
      // (1330x950 physical = 665x475 logical), and push the very controls this
      // card has to click below the fold. `GDK_SCALE=1` makes the sandbox
      // display 1:1, so a `getBoundingClientRect` rectangle is a physical pixel
      // offset from the window origin and `xdotool --window` coordinates mean
      // what they say. It is the test environment being stated, not the app
      // being configured: nothing in `web/`, `server/` or `src-tauri/` changes,
      // and the scale the app actually used is asserted from the app's own
      // stderr line below rather than assumed.
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

async function windowList() {
  return new Promise((done) => {
    const probe = spawn('xdotool', ['search', '--name', '.*'], { stdio: ['ignore', 'pipe', 'ignore'] });
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
  return {
    id,
    name: name.stdout.trim(),
    x: Number(fields['X']),
    y: Number(fields['Y']),
    width,
    height,
    pid: Number.isInteger(Number(owner.stdout.trim())) ? Number(owner.stdout.trim()) : 0,
  };
}

async function findAppWindow(pid, timeoutMs, what) {
  const deadline = Date.now() + timeoutMs;
  let seen = [];
  for (;;) {
    const ids = await windowList();
    if (ids !== null) {
      const windows = [];
      for (const id of ids) {
        const info = await windowInfo(id);
        if (info !== null) windows.push(info);
      }
      seen = windows.map(
        (w) =>
          `${w.name} ${String(w.width)}x${String(w.height)}@${String(w.x)},${String(w.y)} pid=${String(w.pid)}`,
      );
      const hit = windows.find(
        (w) => w.name === APP_WINDOW_NAME && w.pid === pid && w.width >= 400 && w.height >= 300,
      );
      if (hit !== undefined) return { found: hit, seen };
    }
    if (Date.now() >= deadline) return { found: null, seen, waitedFor: what };
    await sleep(250);
  }
}

/**
 * The window geometry the **app** reports for itself, read from the shell's own
 * stderr line, and the scale it used.
 *
 * The rectangles the hook publishes are `getBoundingClientRect()` values, which
 * are CSS pixels. Under a scale other than 1 they are not the pixels `xdotool`
 * counts, so every click would land somewhere else while still exiting 0 — the
 * worst possible failure, a green harness driving the wrong control. So the
 * scale is required to be 1 and is read from the app's own words.
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

/**
 * The rectangle has to lie inside the window before it is clicked.
 *
 * With no window manager under `xvfb-run` there is nothing to draw a titlebar,
 * so a client rectangle and a window-relative coordinate are the same frame —
 * and this check is what makes that an asserted property rather than an
 * assumption. A rectangle outside the window is the geometry fault this harness
 * refuses to guess its way past (no titlebar height is invented here): it stops
 * with both numbers printed instead of clicking at a coordinate it cannot justify.
 */
function rectInsideWindow(target, window, what) {
  if (target === null) return false;
  const { x, y, w, h } = target.rect;
  const inside = x >= 0 && y >= 0 && x + w <= window.width && y + h <= window.height;
  check(
    what,
    inside,
    `the published rectangle ${JSON.stringify(target.rect)} does not lie inside the ${String(window.width)}x${String(window.height)} window, so a window-relative click would land somewhere else`,
  );
  return inside;
}

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

function readProcField(pid, field) {
  try {
    return readFileSync(join('/proc', pid, field), 'utf8').replaceAll('\0', ' ');
  } catch {
    return null;
  }
}

/**
 * The implementation attempt the checkpoint currently holds.
 *
 * V5 selects the three `PREV_DEFAULT` records by this number, so a record written
 * against a stale attempt would be excluded from — or admitted to — the baseline
 * by accident. It is read from the checkpoint rather than guessed, and a
 * checkpoint without a positive integer `attempt` stops the row.
 */
function implementationAttempt() {
  try {
    const checkpoint = JSON.parse(
      readFileSync(join(repoRoot, 'docs', 'v2', 'state', 'cards', 'P3.5.json'), 'utf8'),
    );
    return Number.isInteger(checkpoint.attempt) && checkpoint.attempt >= 1 ? checkpoint.attempt : null;
  } catch {
    return null;
  }
}

/** The one thing this harness creates through the API: the prototype's sample person. */
async function createPatient() {
  const response = await fetch(`http://127.0.0.1:${String(port)}/api/patients`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: PATIENT_NAME, identifier: null }),
  });
  if (!response.ok) {
    return { error: `POST /api/patients answered ${String(response.status)}` };
  }
  const body = await response.json();
  return { id: body.id, name: body.name };
}

/**
 * The first note format this run holds, read after the app created one.
 *
 * A format has to exist before the capture screen renders a record button at all
 * (`Capture.tsx`: "no formats" replaces the recorder), and **the app creates it
 * itself**, through its own onboarding button — `reachHome` clicks that. The
 * harness only reads the id afterwards, so the format is the app's own and not
 * something the harness wrote behind its back.
 */
async function firstFormatId() {
  try {
    const response = await fetch(`http://127.0.0.1:${String(port)}/api/formats`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const body = await response.json();
    return Array.isArray(body.formats) && body.formats.length > 0 ? body.formats[0].id : null;
  } catch {
    return null;
  }
}

/**
 * Reach the home screen through the app's own UI, with real input.
 *
 * A first-run folder has no note format, and `Workspace` redirects to
 * onboarding until one exists (`Workspace.tsx:527-529`), so a capture row that
 * launched straight into the capture screen would be asserting against an app
 * state it had skipped past. The path taken here is the app's own:
 *
 *   1. wait for the onboarding screen's **Continue** button (a text leaf) and
 *      click it — the app creates its standard format itself and navigates;
 *   2. that lands on `/patients/new`, which renders the home screen **behind**
 *      the add-patient dialog, so the modal has to be dismissed with a real
 *      Escape key press (`Dialog.tsx:89`);
 *   3. wait for this card's own `home-action-note` rectangle.
 *
 * If the home rectangle is already published, all three steps are skipped —
 * the click is only a way to reach the screen, never a thing the row needs.
 */
async function reachHome(step, window, run) {
  const alreadyThere = rectOf(readReported(run.output).tids.get('home-action-note'), 'home-action-note');
  if (alreadyThere !== null) return true;

  const continueRect = await waitForPublished(
    run,
    30_000,
    `${step} the onboarding Continue button`,
    (reported) => rectOf(reported.leaves.get(CONTINUE_LABEL), CONTINUE_LABEL),
  );
  if (continueRect === null) return false;
  if (!(await clickRect(window, continueRect, 'the onboarding Continue button'))) return false;

  // The add-patient dialog is focused and modal; Escape is the app's own way out.
  // Sent as a real XTEST key event to the focused window, **not** with
  // `--window`: that flag makes `xdotool` synthesise the event with XSendEvent,
  // which WebKitGTK is free to ignore, and a silently ignored Escape would leave
  // the modal up over the home screen this step is trying to reach.
  const focused = await spawnAsync('xdotool', ['windowfocus', '--sync', window.id]);
  const escaped = await spawnAsync('xdotool', ['key', '--clearmodifiers', 'Escape']);
  if (focused.code !== 0 || escaped.code !== 0) {
    fail(
      `${step} dismiss the add-patient dialog`,
      `xdotool exited ${String(escaped.code)}: ${escaped.stderr.trim()}`,
    );
    return false;
  }

  const home = await waitForPublished(run, 30_000, `${step} the home-action-note rectangle`, (reported) =>
    rectOf(reported.tids.get('home-action-note'), 'home-action-note'),
  );
  return home !== null;
}

/** Polls the reported facts for the first rectangle that satisfies `find`. */
async function waitForPublished(run, timeoutMs, what, find) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const target = find(readReported(run.output));
    if (target !== null) return target;
    if (Date.now() >= deadline) {
      fail(`wait for ${what}`, `nothing published one within ${String(timeoutMs)}ms`);
      return null;
    }
    await sleep(250);
  }
}

async function noteCount() {
  try {
    const response = await fetch(`http://127.0.0.1:${String(port)}/api/notes`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return -1;
    const body = await response.json();
    return Array.isArray(body.notes) ? body.notes.length : -1;
  } catch {
    return -1;
  }
}

// -------------------------------------------------------------- the marker --

/**
 * This card's own three `data-testid` rectangles, read from the **newest** audio
 * marker snapshot and nothing else.
 *
 * A whole snapshot, never a union of history: a test id the newest marker omits
 * is absent (its element left the screen), and a partial or truncated newer
 * marker installs no rectangle at all rather than merging fields with an older
 * one or resurrecting a target that has gone. A test id is installed only when
 * that one marker carries all four of `x`, `y`, `w`, `h`, each **present and
 * non-empty** before it is read as a number, and all four finite with a positive
 * width and height, so a half-written line can neither publish a partial
 * rectangle nor keep an older, stale one alive. Presence is checked separately
 * from the numeric checks because `Number(null)` is `0` and `Number('')` is `0`,
 * both finite: a marker missing only `_x`, or carrying an empty value, would
 * otherwise install a rectangle at the origin.
 */
function tidsFromNewestMarker(markers) {
  const fields = ['x', 'y', 'w', 'h'];
  const tids = new Map();
  const newest = markers.length === 0 ? null : markers[markers.length - 1];
  if (newest === null) return tids;
  const ids = new Set();
  for (const key of newest.keys()) {
    if (!key.startsWith('tid_')) continue;
    const rest = key.slice('tid_'.length);
    const field = rest.slice(rest.lastIndexOf('_') + 1);
    if (!fields.includes(field)) continue;
    ids.add(rest.slice(0, rest.lastIndexOf('_')));
  }
  for (const testId of ids) {
    const rect = {};
    let present = true;
    for (const field of fields) {
      const raw = newest.get(`tid_${testId}_${field}`);
      if (typeof raw !== 'string' || raw.trim() === '') {
        present = false;
        break;
      }
      rect[field] = Number(raw.trim());
    }
    if (!present) continue;
    if (![rect.x, rect.y, rect.w, rect.h].every((value) => Number.isFinite(value))) continue;
    if (rect.w <= 0 || rect.h <= 0) continue;
    tids.set(testId, { x: rect.x, y: rect.y, w: rect.w, h: rect.h });
  }
  return tids;
}

/**
 * Everything the app has said, read out of the **stderr** the AppImage child was
 * spawned with.
 *
 * The bundled server's stdout is a private pipe (`main.rs:416`); the shell's
 * reader thread drains it as bridge lines and re-emits every unrecognised line to
 * stderr as `apunta: ignoring a bridge line (<Rejection>: {line})`
 * (`main.rs:321-325`). That wrapper is what proves the line came out of the
 * bundled server, so the evidence records it verbatim and the marker is never
 * read from `output.stdout` — nothing in the shell writes there at all.
 */
function readReported(output) {
  const text = output.stderr;
  const state = { markers: [], leaves: new Map(), tids: new Map(), transcribeLines: [] };

  for (const match of text.matchAll(/apunta: ignoring a bridge line \(([^\n]*)/g)) {
    const line = match[1];
    if (line.includes('/api/transcribe')) state.transcribeLines.push(line);
    const markerAt = line.indexOf(MARKER_PATH + '?');
    if (markerAt >= 0) {
      const query = line
        .slice(markerAt + MARKER_PATH.length + 1)
        .split('"')[0]
        .split('\\')[0];
      state.markers.push(new URLSearchParams(query));
    }
    const observeAt = line.indexOf(OBSERVE_PATH + '?');
    if (observeAt >= 0) {
      const query = new URLSearchParams(
        line
          .slice(observeAt + OBSERVE_PATH.length + 1)
          .split('"')[0]
          .split('\\')[0],
      );
      for (let index = 0; index < 200; index += 1) {
        const label = query.get(`i${String(index)}_l`);
        const x = query.get(`i${String(index)}_x`);
        if (label === null || x === null) continue;
        if (label.length > MAX_TEXT_LEAF) continue;
        state.leaves.set(label, {
          x: Number(x),
          y: Number(query.get(`i${String(index)}_y`)),
          w: Number(query.get(`i${String(index)}_w`)),
          h: Number(query.get(`i${String(index)}_h`)),
        });
      }
    }
  }
  // This card's own three rectangles, from the newest audio marker alone. See
  // `tidsFromNewestMarker` for why a snapshot and never a union of history.
  state.tids = tidsFromNewestMarker(state.markers);
  return state;
}

/** The newest snapshot of this card's own facts, or `null`. */
function latestMarker(reported) {
  if (reported.markers.length === 0) return null;
  return reported.markers[reported.markers.length - 1];
}

function rectOf(rect, label) {
  if (rect === undefined) return null;
  const { x, y, w, h } = rect;
  if (![x, y, w, h].every((value) => typeof value === 'number' && Number.isFinite(value))) return null;
  if (w <= 0 || h <= 0) return null;
  return { cx: Math.round(x + w / 2), cy: Math.round(y + h / 2), rect, label };
}

/** A real pointer click on the real button, at the centre of the published rectangle. */
async function clickRect(window, target, what) {
  if (target === null) {
    fail(`click ${what}`, 'no rectangle was published for it');
    return false;
  }
  if (!rectInsideWindow(target, window, `click ${what} (rectangle inside the window)`)) return false;
  // Focus first: `xdotool click` is an XTEST event, which the X server delivers
  // to the window with input focus, and `xvfb-run` has no window manager to give
  // one. Without this the click exits 0 and lands nowhere.
  const focused = await spawnAsync('xdotool', ['windowfocus', '--sync', window.id]);
  if (focused.code !== 0) {
    fail(`click ${what}`, `xdotool windowfocus exited ${String(focused.code)}: ${focused.stderr.trim()}`);
    return false;
  }
  const moved = await spawnAsync('xdotool', [
    'mousemove',
    '--sync',
    '--window',
    String(window.id),
    String(target.cx),
    String(target.cy),
  ]);
  if (moved.code !== 0) {
    fail(`click ${what}`, `xdotool mousemove exited ${String(moved.code)}: ${moved.stderr.trim()}`);
    return false;
  }
  const clicked = await spawnAsync('xdotool', ['click', '--clearmodifiers', '1']);
  return check(
    `click ${what}`,
    clicked.code === 0,
    `xdotool exited ${String(clicked.code)}: ${clicked.stderr.trim()}`,
  );
}

/** `MM:SS` from `formatTimer` (`web/src/lib/recorder.ts`), as whole seconds. */
function timerSeconds(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value ?? '').trim());
  if (match === null) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

// ------------------------------------------------------------- the capture --

/**
 * One capture run: containment, the five real clicks, the assertions, and the
 * teardown — on every path.
 */
async function runCapture(mode, step, expectations) {
  const appImage = resolveAppImage();
  if (appImage.error !== undefined) {
    fail(`${step} appimage`, appImage.error);
    return;
  }
  pass(`${step} appimage`, sanitise(appImage.path));

  let audioDir;
  let audioFile;
  try {
    audioDir = audioDirFor(mode);
    audioFile = audioFileFor(mode, audioDir);
    if (!existsSync(audioFile)) throw new Error(`no audio file at ${sanitise(audioFile)}`);
  } catch (error) {
    blocked(`${step} audio`, String(error?.message ?? error));
    return;
  }
  const audioHash = await sha256(audioFile);
  process.stdout.write(`  ${step} audio: ${sanitise(audioFile)}\n  ${step} sha256: ${audioHash}\n`);

  installTraps();
  installStrayPidStopper();

  let created;
  try {
    created = await containment.create();
  } catch (error) {
    // The card's stop condition, verbatim: a default source that is not
    // `apunta_p35_mic` before the record click means the app is never launched.
    blocked(
      `${step} microphone containment`,
      `${String(error?.message ?? error)} (pactl get-default-source: ${JSON.stringify(await defaultSource())}; ` +
        `sources: ${sanitise((await pactl(['list', 'short', 'sources'])).stdout.trim())})`,
    );
    return;
  }
  pass(`${step} the virtual source is the default, read back`, `${String(created.readBack)}`);
  process.stdout.write(`  ${step} previously default source: ${String(created.prevDefault)}\n`);

  // The durable record, written as each row creates it. One JSON object, the
  // shape V5 reads: step, attempt, runId, dateUtc, prevDefault verbatim, sinkId,
  // srcId. Nothing here is derived later and nothing is re-derived by a reader.
  const attempt = implementationAttempt();
  if (attempt === null) {
    blocked(
      `${step} checkpoint attempt`,
      'docs/v2/state/cards/P3.5.json does not carry a positive integer `attempt`, so this ' +
        'capture run could not be tied to the attempt that wrote it',
    );
    return;
  }
  const record = {
    step,
    attempt,
    runId,
    dateUtc: new Date().toISOString(),
    prevDefault: created.prevDefault,
    sinkId: created.sinkId,
    srcId: created.srcId,
  };
  const recordPath = join(dirname(dataDir), 'p3.5-capture-record.json');
  writeFileIfAbsent(recordPath, `${JSON.stringify(record, null, 2)}\n`);
  process.stdout.write(`RECORD ${JSON.stringify(record)}\n`);

  const dummy = spawn('sleep', ['600'], { stdio: 'ignore' });
  const dummyPid = dummy.pid;
  rememberPid(dummyPid);
  // `unref` so this unrelated process cannot hold the event loop open: a row
  // that returns early would otherwise sit for the whole `sleep 600` before the
  // process could exit — measured, and it made every early failure look like a
  // ten-minute hang. The containment assertion that it is still alive is
  // unaffected; it is stopped by pid afterwards either way.
  dummy.unref();
  const ollamaBefore = await ollamaAlive();
  const notesBefore = await noteCount();

  let run = null;
  let playback = null;
  try {
    // Playback starts before the record click: the frames the app must capture
    // are already in flight when the graph comes up.
    playback = await startPlayback(audioFile);
    rememberPid(playback.pid);

    run = launchApp(appImage.path);
    rememberPid(run.child.pid);
    const pid = run.child.pid;

    const home = await findAppWindow(pid, 60_000, `${step} the app window`);
    if (
      !check(
        `${step} the app's own window is up`,
        home.found !== null,
        `no window named exactly ${APP_WINDOW_NAME} owned by pid ${String(pid)} within 60s while waiting for ${String(home.waitedFor)} (saw ${JSON.stringify(home.seen ?? [])})`,
      )
    ) {
      return;
    }
    const window = home.found;
    process.stdout.write(
      `  ${step} window ${String(window.width)}x${String(window.height)} at ${String(window.x)},${String(window.y)}\n`,
    );

    // The scale the app used, from the app's own line. At anything but 1 the
    // rectangles below are CSS pixels and `xdotool --window` counts physical
    // ones, so every click would be wrong while still succeeding.
    const geometry = await appGeometry(run.output, `${step}`);
    if (geometry === null) return;
    process.stdout.write(
      `  ${step} the app reports ${String(geometry.physicalWidth)}x${String(geometry.physicalHeight)} physical on a ${String(geometry.displayWidth)}x${String(geometry.displayHeight)} display at scale ${String(geometry.scale)}\n`,
    );
    if (
      !check(
        `${step} the app window is at scale 1`,
        geometry.scale === 1,
        `the app reported scale ${String(geometry.scale)}`,
      )
    ) {
      return;
    }

    const owned = await waitForOwnership(30_000, `${step} the server`);
    if (!check(`${step} the server answers with this run's id`, owned, 'no ownership on the sandbox port')) {
      return;
    }

    const patient = await createPatient();
    if (
      !check(
        `${step} the patient was created through the API`,
        patient.error === undefined,
        String(patient.error),
      )
    ) {
      return;
    }
    run_patient_id = patient.id;

    if (!(await reachHome(step, window, run))) return;
    run.formatId = await firstFormatId();
    check(
      `${step} a note format exists for the capture screen`,
      typeof run.formatId === 'string',
      'GET /api/formats returned none after the app created one through onboarding',
    );

    // ---- the five real clicks ----
    // One: this card's own rectangle for `home-action-note`.
    const actionNote = await waitForPublished(run, 20_000, 'the home-action-note rectangle', (reported) =>
      rectOf(reported.tids.get('home-action-note'), 'home-action-note'),
    );
    if (actionNote === null || !(await clickRect(window, actionNote, 'home-action-note'))) return;

    // Two: this card's own rectangle for `home-search` (an `<input>`, which
    // P3.4's text-leaf rule cannot publish).
    const search = await waitForPublished(run, 20_000, 'the home-search rectangle', (reported) =>
      rectOf(reported.tids.get('home-search'), 'home-search'),
    );
    if (search === null || !(await clickRect(window, search, 'home-search'))) return;
    // Real XTEST keystrokes to the focused window, for the same reason as the
    // Escape above: the click above put the caret in the input, and an ignored
    // synthesised event would look exactly like a search that never matched.
    const typed = await spawnAsync('xdotool', ['type', '--delay', '40', '--', PATIENT_NAME]);
    if (
      !check(
        `${step} the search text was typed`,
        typed.code === 0,
        `xdotool exited ${String(typed.code)}: ${typed.stderr.trim()}`,
      )
    ) {
      return;
    }

    // Three: the first result option, by P3.4's inherited text-leaf rectangle.
    const option = await waitForPublished(run, 20_000, 'the first result option', (reported) =>
      rectOf(reported.leaves.get(PATIENT_NAME), PATIENT_NAME),
    );
    if (option === null || !(await clickRect(window, option, 'the first result option'))) return;

    // Four: this card's own rectangle for `record-start`.
    const start = await waitForPublished(run, 20_000, 'the record-start rectangle', (reported) =>
      rectOf(reported.tids.get('record-start'), 'record-start'),
    );
    if (start === null || !(await clickRect(window, start, 'record-start'))) return;

    // The phase marker moves idle → starting → recording, and a missed click
    // times out here rather than passing quietly.
    const phasesSeen = new Set();
    const peakSeen = [];
    let recorded = false;
    const phaseDeadline = Date.now() + 60_000;
    for (;;) {
      const marker = latestMarker(readReported(run.output));
      if (marker !== null) phasesSeen.add(String(marker.get('phase')));
      const isRecording = marker !== null && String(marker.get('phase')).includes('record-stop');
      if (isRecording) {
        recorded = true;
        break;
      }
      if (Date.now() >= phaseDeadline) {
        fail(`${step} the phase reached recording`, `phases seen: ${JSON.stringify([...phasesSeen])}`);
        return;
      }
      await sleep(250);
    }
    check(`${step} the phase reached recording`, recorded, 'it did not');
    check(
      `${step} the phase marker moved through the starting state`,
      [...phasesSeen].some((phase) => phase.includes('record-stage')),
      `phases seen: ${JSON.stringify([...phasesSeen])}`,
    );

    // Record for at least past 10 s, and keep the running maximum the hook
    // publishes over the whole recording.
    let timerReached = 0;
    const recordDeadline = Date.now() + 90_000;
    for (;;) {
      const marker = latestMarker(readReported(run.output));
      if (marker !== null) {
        const seconds = timerSeconds(marker.get('timer'));
        if (seconds !== null && seconds > timerReached) timerReached = seconds;
        const peak = Number(marker.get('levelPeak'));
        if (Number.isFinite(peak)) peakSeen.push(peak);
        if (timerReached > 10) break;
      }
      if (Date.now() >= recordDeadline) {
        fail(`${step} the record-timer advanced past 10s`, `it reached ${String(timerReached)}s`);
        return;
      }
      await sleep(250);
    }
    check(
      `${step} the record-timer advanced past 10s`,
      timerReached > 10,
      `it reached ${String(timerReached)}s`,
    );

    // The containment read, while the recording is live. Two commands, resolved
    // together: a source-output carries a numeric **source index**, so it means
    // nothing until it is resolved through the source table — comparing a raw
    // column to a source name is exactly the vacuous check this replaced. A
    // failed read, a malformed row, a duplicate index or an index that does not
    // resolve is a stop, with the teardown already installed: never "unknown, so
    // assume safe", because the owner's microphone is the unknown that must not
    // slip through. This is one sample; the card says it narrows the window
    // rather than closing it, and this row does not claim more.
    const outputsRead = await pactl(['list', 'short', 'source-outputs']);
    const sourcesRead = await pactl(['list', 'short', 'sources']);
    process.stdout.write(`  ${step} pactl list short source-outputs:\n`);
    for (const line of outputsRead.stdout.split('\n').filter((line) => line.trim() !== '')) {
      process.stdout.write(`    ${line}\n`);
    }
    process.stdout.write(`  ${step} pactl list short sources:\n`);
    for (const line of sourcesRead.stdout.split('\n').filter((line) => line.trim() !== '')) {
      process.stdout.write(`    ${line}\n`);
    }
    let streams;
    try {
      streams = classifyPactlReads(outputsRead, sourcesRead);
    } catch (error) {
      blocked(
        `${step} microphone containment`,
        'the live source-outputs read could not be resolved, so containment is unknown and the row ' +
          `stops: ${String(error?.message ?? error)}`,
      );
      return;
    }
    check(
      `${step} a capture stream is present on ${SOURCE_NAME}`,
      streams.virtual.length > 0,
      `no source-output resolved to ${SOURCE_NAME} (resolved: ${JSON.stringify(streams.all.map((output) => output.raw))})`,
    );
    const leaked = streams.realMic.length > 0;
    check(
      `${step} no capture stream on the owner's real microphone`,
      !leaked,
      leaked
        ? `these source-outputs resolved to ${REAL_MIC_PREFIX}: ${JSON.stringify(streams.realMic.map((output) => output.raw))}`
        : '',
    );
    if (streams.unrelated.length > 0) {
      process.stdout.write(
        `  ${step} capture streams on other sources, named and not the real microphone: ` +
          `${JSON.stringify(streams.unrelated.map((output) => output.raw))}\n`,
      );
    }
    if (leaked) {
      // Kill the app by pid, let the teardown restore and unload, then report.
      await stopPid(pid, 'the shell');
      blocked(
        `${step} microphone containment`,
        `a capture stream appeared on ${REAL_MIC_PREFIX} while recording; the app was stopped by pid and the default source restored`,
      );
      return;
    }

    // Five: P3.4's inherited text-leaf rectangle for `record-stop`.
    const stop = rectOf(readReported(run.output).leaves.get(STOP_LABEL), STOP_LABEL);
    if (!(await clickRect(window, stop, 'record-stop'))) return;

    const posted = await waitForPublished(
      run,
      60_000,
      '/api/transcribe on the captured stderr',
      (reported) => (reported.transcribeLines.length > 0 ? reported.transcribeLines.at(-1) : null),
    );
    check(
      `${step} the app POSTed the WAV to /api/transcribe`,
      posted !== null,
      'no line naming /api/transcribe appeared in the captured stderr within 60s',
    );
    if (posted !== null) process.stdout.write(`  ${step} stderr line: ${sanitise(posted)}\n`);

    // The error the app surfaces, waited for through the app's own DOM.
    const errorDeadline = Date.now() + 60_000;
    let errored = false;
    for (;;) {
      const marker = latestMarker(readReported(run.output));
      if (marker !== null && String(marker.get('phase')).includes('capture-error')) {
        errored = true;
        break;
      }
      if (Date.now() >= errorDeadline) break;
      await sleep(250);
    }
    check(`${step} the app surfaced an error`, errored, 'capture-error never appeared in the phase');

    // The code itself, decided from outside the page: the same request the app
    // made, with this run's WAV, must answer `whisper_model_missing` — with no
    // model on disk that is the code the app's own UI string comes from. This is
    // a precondition of the card, not a transcription claim.
    const code = await transcribeErrorCode(run.formatId, audioFile);
    check(
      `${step} the error code is whisper_model_missing`,
      code === 'whisper_model_missing',
      `the direct POST answered ${JSON.stringify(code)}`,
    );

    const peak = peakSeen.length === 0 ? 0 : Math.max(...peakSeen);
    if (expectations.levelPeakNonZero === true) {
      check(
        `${step} levelPeak is not 0`,
        peak !== 0,
        `the hook published levelPeak values ${JSON.stringify(peakSeen)}, so no non-zero frame arrived through getUserMedia`,
      );
    } else {
      check(
        `${step} levelPeak stayed 0 for the whole recording`,
        peak === 0,
        `the hook published levelPeak values ${JSON.stringify(peakSeen)}, so a non-zero frame arrived out of digital silence`,
      );
    }

    const notesAfter = await noteCount();
    process.stdout.write(
      `  ${step} precondition: GET /api/notes was ${String(notesBefore)} before and ${String(notesAfter)} after; ` +
        'with no model on disk no input can produce a note, so this is vacuous here and is not evidence\n',
    );
  } finally {
    // The app's own words, always: a row that fails on "the click did nothing"
    // is unreadable without them, because the shell prints why it refused, the
    // server prints every URL it served, and whether a click landed at all is
    // visible only there. Diagnostic, never the assertion's source.
    if (run !== null) dumpAppOutput(run);
    if (playback !== null) await stopPid(playback.pid, 'paplay');
    if (run !== null) await stopPid(run.child.pid, 'the shell');
    await containment.teardown();
  }

  // ---- containment after the run ----
  const stillListening = !(await isPortFree(port));
  check(
    `${step} nothing of this run is still listening on the port`,
    !stillListening,
    `127.0.0.1:${String(port)} is still bound`,
  );

  let servers = countServerProcesses(dataDir);
  const serverDeadline = Date.now() + 15_000;
  while (Date.now() < serverDeadline && servers > 0) {
    await sleep(250);
    servers = countServerProcesses(dataDir);
  }
  check(`${step} no server process from the run survives`, servers === 0, `found ${String(servers)}`);

  const restored = await defaultSource();
  check(
    `${step} the original default source is restored`,
    restored === record.prevDefault,
    `now ${JSON.stringify(restored)}, recorded ${JSON.stringify(record.prevDefault)}`,
  );
  const sinks = (await pactl(['list', 'short', 'sinks'])).stdout;
  const sources = (await pactl(['list', 'short', 'sources'])).stdout;
  check(
    `${step} both of this run's modules are unloaded`,
    !sinks.includes(SINK_NAME) && !sources.includes(SOURCE_NAME),
    `sinks: ${sanitise(sinks.trim())}; sources: ${sanitise(sources.trim())}`,
  );
  check(`${step} the unrelated dummy is still alive`, pidAlive(dummyPid), `pid ${String(dummyPid)} is gone`);
  const ollamaAfter = await ollamaAlive();
  check(
    `${step} ollama is still running`,
    ollamaBefore && ollamaAfter,
    `before ${String(ollamaBefore)}, after ${String(ollamaAfter)}`,
  );
  await stopPid(dummyPid, 'the dummy');
}

/** The app's last lines on each stream, for a failure that needs them. */
function dumpAppOutput(run) {
  for (const stream of ['stdout', 'stderr']) {
    const text = (run.output[stream] ?? '').trim();
    if (text === '') continue;
    process.stdout.write(`  --- the app's ${stream} (last 25 lines) ---\n`);
    for (const line of text.split('\n').slice(-25)) process.stdout.write(`  ${sanitise(line)}\n`);
  }
}

/**
 * The error code `/api/transcribe` answers for this run's WAV, read from the
 * SSE stream the app itself reads.
 */
async function transcribeErrorCode(formatId, audioFile) {
  if (formatId === undefined) return 'no format id';
  try {
    const form = new FormData();
    if (run_patient_id === null) return 'no patient id';
    form.set('patient_id', run_patient_id);
    form.set('format_id', formatId);
    const bytes = readFileSync(audioFile);
    form.set('audio', new Blob([bytes], { type: 'audio/wav' }), 'recording.wav');
    const response = await fetch(`http://127.0.0.1:${String(port)}/api/transcribe`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
    const body = await response.text();
    const match = /"code"\s*:\s*"([a-z_]+)"/.exec(body);
    return match === null ? `no code in ${body.slice(0, 200)}` : match[1];
  } catch (error) {
    return `the POST failed: ${String(error)}`;
  }
}

/** The patient this run created, so the direct POST addresses the same one. */
let run_patient_id = null;

function writeFileIfAbsent(path, text) {
  try {
    if (existsSync(path)) return;
    writeFileSync(path, text);
  } catch {
    // A record this run cannot leave behind is reported by the RECORD line above,
    // which is what the checkpoint is written from.
  }
}

// -------------------------------------------------------------------- main ----

const MODES = {
  capture: { step: 'V3', levelPeakNonZero: true },
  tone: { step: 'V4-tone', levelPeakNonZero: true },
  silence: { step: 'V4-silence', levelPeakNonZero: false },
};

async function main() {
  const reexec = ensureDisplay();
  if (reexec !== null) {
    return await new Promise((settle) => {
      reexec.on('exit', (code, signal) => settle(signal === null ? (code ?? 0) : 1));
      reexec.on('error', (error) => {
        process.stderr.write(`tauri-audio: ${String(error)}\n`);
        settle(1);
      });
    });
  }

  const mode = process.argv[2];
  const chosen = MODES[mode];
  if (chosen === undefined) {
    process.stderr.write(`tauri-audio: unknown mode ${String(mode)}\nusage: capture | tone | silence\n`);
    return 2;
  }

  await runCapture(mode, chosen.step, { levelPeakNonZero: chosen.levelPeakNonZero });

  const failed = results.filter((entry) => !entry.ok);
  const blockedCount = results.filter((entry) => entry.blocked === true).length;
  process.stdout.write(
    `\n${String(results.length - failed.length)}/${String(results.length)} assertions passed` +
      (blockedCount > 0 ? `, ${String(blockedCount)} BLOCKED` : '') +
      '\n',
  );
  return failed.length > 0 ? 1 : 0;
}

process.exitCode = await main();

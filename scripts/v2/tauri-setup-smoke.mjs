#!/usr/bin/env node
/**
 * First-run setup in the real desktop app, on a private virtual display.
 *
 *   bash scripts/v2/package-linux-resources.sh && npm run tauri:build:test
 *   node scripts/v2/tauri-setup-smoke.mjs [--app path/to/test.AppImage]
 *
 * The flow harness (`tauri-e2e-smoke.test.mjs`) runs on the fake AI, where
 * nothing is ever missing, so it can never see this window. This runs the test
 * AppImage on the **real** providers with an empty sandbox data folder, which
 * is what a new install is, and checks:
 *
 *  1. the app opens the setup window by itself, and the shell ran the bundled
 *     installer's plan through the server (`GET /api/app/setup` is `planned`,
 *     with the speech model to download);
 *  2. the window shows on screen, read by OCR off the real webview;
 *  3. **Later** closes it, and nothing was downloaded: the download is only
 *     ever started by her press (CLAUDE.md hard rule 1, installer exception),
 *     and this never presses it, so the run makes no request off this PC;
 *  4. quitting ends the app within a few seconds.
 *
 * Sandbox port 7876 and data folder only; the owner's installed app is never
 * signalled. Screenshots and logs land in a temporary folder it prints.
 */
import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 7876;
const DISPLAY = ':96';
const work = mkdtempSync(join(tmpdir(), 'apunta-setup-smoke-'));
const children = [];
let failed = false;

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
function pass(what) {
  console.log(`PASS: ${what}`);
}
function fail(what) {
  failed = true;
  console.error(`FAIL: ${what}`);
}

function appImage() {
  const flag = process.argv.indexOf('--app');
  if (flag !== -1 && process.argv[flag + 1] !== undefined) return resolve(process.argv[flag + 1]);
  const version = JSON.parse(readFileSync(join(root, 'src-tauri/tauri.conf.json'), 'utf8')).version;
  return join(root, `src-tauri/target/release/bundle/appimage/Apunta (test)_${version}_amd64.AppImage`);
}

/** This run's shells only: an `apunta` whose environment carries our port. */
function ourShells() {
  const found = spawnSync('pgrep', ['-x', 'apunta'], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
  return found.filter((pid) => {
    try {
      return readFileSync(`/proc/${pid}/environ`, 'utf8')
        .split('\0')
        .includes(`APUNTA_PORT=${String(PORT)}`);
    } catch {
      return false;
    }
  });
}

const started = Date.now();
function cleanup() {
  // An AppImage run with APPIMAGE_EXTRACT_AND_RUN unpacks ~775 MB into /tmp and
  // leaves it; only the copies this run made are removed.
  const removeExtracted = () => {
    for (const name of readdirSync('/tmp')) {
      if (!name.startsWith('appimage_extracted_')) continue;
      const dir = join('/tmp', name);
      try {
        if (statSync(dir).mtimeMs >= started) rmSync(dir, { recursive: true, force: true });
      } catch {
        // gone already, or not ours to read
      }
    }
  };
  setTimeout(removeExtracted, 3000);
  for (const pid of ourShells()) {
    try {
      process.kill(Number(pid), 'SIGTERM');
    } catch {
      // already gone
    }
  }
  for (const child of children) child.kill('SIGTERM');
}

async function api(path) {
  const response = await fetch(`http://127.0.0.1:${String(PORT)}${path}`);
  if (!response.ok) throw new Error(`${path} answered ${String(response.status)}`);
  return response.json();
}

async function until(what, read, ok, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try {
      last = await read();
      if (ok(last)) return last;
    } catch {
      // not up yet
    }
    await sleep(500);
  }
  throw new Error(`${what} (last: ${JSON.stringify(last)})`);
}

let shots = 0;
/**
 * The screen's words, each with its box, off a fresh root screenshot. Read as
 * the flow harness does: once at 2x, then twice thresholded and inverted at 3x,
 * because tesseract misses light text on dark buttons ("Later") in a plain read.
 */
function screenWords() {
  shots += 1;
  const file = join(work, `screen-${String(shots).padStart(2, '0')}.png`);
  spawnSync('import', ['-display', DISPLAY, '-window', 'root', '-silent', file]);
  const words = [];
  const reads = [
    [['-resize', '200%'], 2],
    [['-colorspace', 'Gray', '-resize', '300%', '-threshold', '65%', '-negate'], 3],
    [['-colorspace', 'Gray', '-resize', '300%', '-threshold', '40%', '-negate'], 3],
  ];
  for (const [index, [ops, scale]] of reads.entries()) {
    const prepared = join(work, `ocr-${String(index)}.png`);
    spawnSync('magick', [file, ...ops, prepared]);
    const read = spawnSync('tesseract', [prepared, 'stdout', 'tsv'], { encoding: 'utf8' });
    for (const line of (read.stdout ?? '').split('\n')) {
      const cols = line.split('\t');
      if (cols.length < 12 || cols[0] !== '5' || (cols[11] ?? '').trim() === '') continue;
      const [left, top, width, height] = cols.slice(6, 10).map(Number);
      words.push({ text: cols[11].trim(), x: (left + width / 2) / scale, y: (top + height / 2) / scale });
    }
  }
  return words;
}
const has = (words, text) => words.find((word) => word.text.replace(/[.,]+$/, '') === text);

async function main() {
  const app = appImage();
  if (!existsSync(app)) {
    throw new Error(
      `no test AppImage at ${app}: run package-linux-resources.sh and npm run tauri:build:test`,
    );
  }
  for (const tool of ['Xvfb', 'import', 'magick', 'tesseract', 'xdotool']) {
    if (spawnSync('which', [tool]).status !== 0) throw new Error(`${tool} is missing`);
  }
  console.log(`app: ${app}\nevidence: ${work}`);

  const env = Object.fromEntries(
    spawnSync('node', [join(root, 'scripts/v2/sandbox.mjs'), 'env', '--port', String(PORT)], {
      encoding: 'utf8',
    })
      .stdout.split('\n')
      .map((line) => line.match(/^export ([A-Z_]+)='(.*)'$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2]]),
  );
  if (env.APUNTA_DATA_DIR === undefined) throw new Error('sandbox.mjs gave no data folder');
  const base = dirname(env.APUNTA_DATA_DIR);
  for (const dir of ['home', 'cache', 'config', 'xdg']) mkdirSync(join(base, dir), { recursive: true });
  mkdirSync(env.APUNTA_DATA_DIR, { recursive: true });

  children.push(
    spawn('Xvfb', [DISPLAY, '-screen', '0', '1400x1000x24', '-nolisten', 'tcp'], { stdio: 'ignore' }),
  );
  await sleep(1000);
  const childEnv = { ...process.env, ...env };
  // The real providers: a new install, not the fake AI.
  delete childEnv.APUNTA_FAKE_AI;
  Object.assign(childEnv, {
    APPIMAGE_EXTRACT_AND_RUN: '1',
    WAYLAND_DISPLAY: '',
    GDK_BACKEND: 'x11',
    GDK_SCALE: '1',
    GDK_DPI_SCALE: '1',
    DISPLAY,
    HOME: join(base, 'home'),
    XDG_CACHE_HOME: join(base, 'cache'),
    XDG_CONFIG_HOME: join(base, 'config'),
    XDG_DATA_HOME: join(base, 'xdg'),
  });
  const log = openSync(join(work, 'app.log'), 'a');
  children.push(spawn(app, [], { cwd: '/', env: childEnv, stdio: ['ignore', log, log] }));

  const health = await until(
    'the app never answered',
    () => api('/api/health'),
    () => true,
    60_000,
  );
  if (health.fakeAi === false && health.whisper.modelPresent === false) {
    pass('a new install: real providers, no speech model');
  } else {
    throw new Error(
      `not a new install: ${JSON.stringify({ fakeAi: health.fakeAi, whisper: health.whisper })}`,
    );
  }

  // 1. Only the window asks for a plan, so `planned` proves it opened itself,
  //    and the plan's content proves the shell ran the bundled installer.
  const setup = await until(
    'setup never reached planned',
    () => api('/api/app/setup'),
    (status) => status.state === 'planned',
    30_000,
  );
  const speech = setup.plan?.steps.find((step) => step.id === 'speech_model');
  if (speech?.needed === true) pass('the window opened by itself; the shell ran the installer plan');
  else fail(`the plan does not list the speech model to download: ${JSON.stringify(setup.plan?.steps)}`);

  // 2. On screen.
  // The window polls the mirror once a second, so give it a moment to show
  // the plan; each read below takes several seconds of OCR.
  await sleep(2000);
  let words = [];
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    words = screenWords();
    if (has(words, 'Later') && has(words, 'Speech')) break;
    await sleep(1000);
  }
  const later = has(words, 'Later');
  if (later && has(words, 'Speech')) pass('the setup window is on screen (OCR)');
  else throw new Error('the setup window was not read on screen');

  // 3. Later closes it; nothing downloaded.
  spawnSync(
    'xdotool',
    ['mousemove', String(Math.round(later.x)), String(Math.round(later.y)), 'click', '1'],
    {
      env: { ...process.env, DISPLAY },
    },
  );
  await sleep(1500);
  words = screenWords();
  if (!has(words, 'Later') && !has(words, 'Speech')) pass('Later closes the window');
  else fail('the window is still on screen after Later');
  const after = await api('/api/app/setup');
  const models = join(env.APUNTA_DATA_DIR, 'models');
  const downloaded = existsSync(models) ? readdirSync(models) : [];
  if (after.state === 'planned' && downloaded.length === 0) pass('nothing was downloaded');
  else fail(`setup is ${after.state}, models folder holds ${JSON.stringify(downloaded)}`);

  // 4. Quit.
  const started = Date.now();
  for (const pid of ourShells()) process.kill(Number(pid), 'SIGTERM');
  await until(
    'the app did not quit',
    async () => ourShells().length,
    (count) => count === 0,
    10_000,
  );
  pass(`quit in ${String(Date.now() - started)} ms`);
}

try {
  await main();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
} finally {
  cleanup();
}
console.log(failed ? `\nFAILED (evidence in ${work})` : `\nAll checks passed (evidence in ${work})`);
process.exitCode = failed ? 1 : 0;

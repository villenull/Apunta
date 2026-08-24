import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertLoopbackUrl } from './egress-guard.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version?: string };

/** `server/` — the same two levels up whether we run from `src/` (tsx) or `dist/` (built). */
const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(serverRoot, '..');

export const DEFAULT_PORT = 7717;

export const DB_FILENAME = 'apunta.db';

/** Recordings land here while they are transcribed (M5). */
export const AUDIO_DIRNAME = 'audio';

/** Where the setup script downloads `ggml-large-v3-turbo-q5_0.bin` (PLAN §2). */
export const MODELS_DIRNAME = 'models';

export const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434';

export const DEFAULT_FAKE_STREAM_DELAY_MS = 12;

/**
 * Fail at boot, not at the first draft.
 *
 * `APUNTA_OLLAMA_URL` names a host, so it gets the same check as everything
 * else. The egress guard would block a non-loopback Ollama anyway, but only
 * after the prompt — the therapist's account of a session — had already been
 * assembled and handed to `fetch`, and only for as long as every outbound path
 * goes through `fetch`. Three lines here turn that into a clear startup error.
 */
function loopbackOnly(url: string): string {
  assertLoopbackUrl(url);
  return url;
}

/** An unset variable and an empty one mean the same thing: not configured. */
function nonEmpty(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  return value === undefined || value === '' ? undefined : value;
}

function readDelay(raw: string | undefined): number {
  if (raw === undefined || raw === '') return DEFAULT_FAKE_STREAM_DELAY_MS;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`APUNTA_FAKE_STREAM_DELAY_MS must be a non-negative number (got "${raw}")`);
  }
  return value;
}

export interface AppConfig {
  /** Always loopback — the server must never be reachable from the network. */
  readonly host: '127.0.0.1';
  readonly port: number;
  /** Where SQLite and audio scratch files live. */
  readonly dataDir: string;
  /** The SQLite file itself, inside `dataDir`. */
  readonly dbFile: string;
  /** Uploaded recordings, inside `dataDir`. Created on first upload (M5). */
  readonly audioDir: string;
  /** Where the whisper.cpp GGUF lives by default, inside `dataDir` (M5). */
  readonly modelsDir: string;
  /** Numbered `.sql` migrations, shipped next to the server code. */
  readonly migrationsDir: string;
  /** `APUNTA_FAKE_AI=1` — deterministic providers, no local AI tooling needed. */
  readonly fakeAi: boolean;
  /**
   * Milliseconds between chunks from the fake LLM. Non-zero by default so the
   * streaming draft is visible in a demo and observable in Playwright; set
   * `APUNTA_FAKE_STREAM_DELAY_MS=0` in a unit test that does not care.
   */
  readonly fakeStreamDelayMs: number;
  /** Where the local Ollama listens. Loopback only — the egress guard sees to that. */
  readonly ollamaUrl: string;
  /**
   * `APUNTA_OLLAMA_BIN` — the runtime bundled inside `Apunta.app` (M8).
   *
   * Undefined on a developer machine, where Homebrew runs Ollama as a service
   * and the server must not start a second one. Set in the packaged app, where
   * there is no Homebrew and no service, and the server owns the runtime the
   * same way it already owns `whisper-cli`.
   */
  readonly ollamaBin: string | undefined;
  /**
   * `APUNTA_SQLITE_BINDING` — where `better_sqlite3.node` lives (M8).
   *
   * Apple's bundle layout puts a Mach-O in `Contents/Helpers/`, not in
   * `Contents/Resources/` next to the bundled JavaScript, so the packaged app
   * has to name the addon explicitly. Undefined everywhere else, where npm's
   * layout is the answer.
   */
  readonly sqliteBinding: string | undefined;
  /**
   * `THIRD-PARTY-LICENSES.md`, served to the About page.
   *
   * Shipping other people's binaries carries obligations, and a licence file
   * only in the repository is not shipped. `APUNTA_LICENSES_FILE` points the
   * packaged app at its own copy in `Contents/Resources/`.
   */
  readonly licensesFile: string;
  /** Built SPA. Served in production; absent during `npm run dev`. */
  readonly webDistDir: string;
  readonly version: string;
}

/**
 * Default data directory. macOS is the target platform; other platforms get a
 * sensible equivalent so the server stays portable (CI runs on Linux).
 */
export function defaultDataDir(): string {
  if (platform() === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'Apunta');
  }
  if (platform() === 'win32') {
    const appData = process.env['APPDATA'];
    return appData ? join(appData, 'Apunta') : join(homedir(), 'Apunta');
  }
  const xdg = process.env['XDG_DATA_HOME'];
  return xdg ? join(xdg, 'apunta') : join(homedir(), '.local', 'share', 'apunta');
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const rawPort = env['APUNTA_PORT'];
  const port = rawPort === undefined || rawPort === '' ? DEFAULT_PORT : Number(rawPort);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`APUNTA_PORT must be an integer between 0 and 65535 (got "${rawPort}")`);
  }

  const dataDirOverride = env['APUNTA_DATA_DIR'];
  const dataDir = dataDirOverride ? resolve(dataDirOverride) : defaultDataDir();

  return {
    host: '127.0.0.1',
    port,
    dataDir,
    dbFile: join(dataDir, DB_FILENAME),
    audioDir: join(dataDir, AUDIO_DIRNAME),
    modelsDir: join(dataDir, MODELS_DIRNAME),
    // `serverRoot` is `server/` whether we are running from `src/` under tsx or
    // from the built `dist/`, so the .sql files are found either way.
    migrationsDir: join(serverRoot, 'migrations'),
    fakeAi: env['APUNTA_FAKE_AI'] === '1',
    fakeStreamDelayMs: readDelay(env['APUNTA_FAKE_STREAM_DELAY_MS']),
    ollamaUrl: loopbackOnly(env['APUNTA_OLLAMA_URL']?.trim() || DEFAULT_OLLAMA_URL),
    ollamaBin: nonEmpty(env['APUNTA_OLLAMA_BIN']),
    sqliteBinding: nonEmpty(env['APUNTA_SQLITE_BINDING']),
    licensesFile: nonEmpty(env['APUNTA_LICENSES_FILE']) ?? join(repoRoot, 'THIRD-PARTY-LICENSES.md'),
    webDistDir: join(repoRoot, 'web', 'dist'),
    version: pkg.version ?? '0.0.0',
  };
}

/**
 * Where the app is served. `host` is the literal type `'127.0.0.1'`, so the
 * loopback address is written out rather than interpolated — which is also
 * what keeps this line inside the lint rule that bans non-loopback URLs.
 */
export function appUrl(config: Pick<AppConfig, 'port'>): string {
  return `http://127.0.0.1:${String(config.port)}`;
}

/**
 * The data dir holds the database, the audio scratch files and the STT model.
 *
 * `0700`, not Node's default `0755`. Harmless while the folder sits inside
 * `~/Library` (which is already `0700`), and wrong the moment
 * `APUNTA_DATA_DIR` points at an external drive or `/Users/Shared` — which is
 * a documented, supported knob (`docs/research/data-at-rest-2026-08.md` §2.2).
 * `mkdirSync` only applies the mode when it creates the directory, so an
 * existing one is left as it is rather than silently re-permissioned.
 */
export function ensureDataDir(dataDir: string): string {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  return dataDir;
}

/**
 * Made on demand rather than at boot: a practice that never records should not
 * find an empty `audio/` folder in its data directory wondering what it is.
 */
export function ensureDir(dir: string): string {
  mkdirSync(dir, { recursive: true });
  return dir;
}

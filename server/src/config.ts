import { platformDataDir } from '@apunta/shared';

import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertLoopbackUrl } from './egress-guard.js';

const require = createRequire(import.meta.url);

/**
 * The app version, from the packaging pipeline when there is one (AM-058).
 *
 * `__APUNTA_VERSION__` is an esbuild `--define`, substituted at build time with
 * the `version` field of `server/package.json`, which is how a bundle with no
 * `package.json` of its own reports the real version. The guard is
 * `typeof … === 'string'` and **not** a bare reference on purpose: this module
 * is also executed directly by tsx and by Node's type stripping, and
 * `declare const` is erased by type stripping, so a bare reference would throw
 * `ReferenceError` in exactly those cases.
 *
 * The `require` below stays as the lazy fallback for those executions. esbuild
 * leaves it unresolved (it is a local binding, not an import), so the metadata
 * is never inlined into a bundle and no `package.json` travels with one — which
 * is what the packaging fingerprint checks.
 */
declare const __APUNTA_VERSION__: string | undefined;

const INJECTED_VERSION: string | undefined =
  typeof __APUNTA_VERSION__ === 'string' ? __APUNTA_VERSION__ : undefined;

function readPackageVersion(): string | undefined {
  if (INJECTED_VERSION !== undefined) return INJECTED_VERSION;
  const pkg = require('../package.json') as { version?: string };
  return pkg.version;
}

/** `server/` — the same two levels up whether we run from `src/` (tsx) or `dist/` (built). */
const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(serverRoot, '..');

export const DEFAULT_PORT = 7717;

export const DB_FILENAME = 'apunta.db';

/** Recordings land here while they are transcribed (M5). */
export const AUDIO_DIRNAME = 'audio';

/** Where the setup script downloads `ggml-tiny.en.bin` (PLAN §2). */
export const MODELS_DIRNAME = 'models';

/**
 * Where the bundled AI runtime keeps its weights (M8).
 *
 * Its own directory rather than sharing `models/` with the speech model: the
 * runtime owns a blob store with its own layout, and a stray `.bin` beside it
 * is at best confusing. It also makes uninstalling one folder rather than a
 * hunt through `~/.ollama`.
 */
export const OLLAMA_DIRNAME = 'ollama';

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
  /** The bundled runtime's weight store, inside `dataDir` (M8). */
  readonly ollamaModelsDir: string;
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
   * `APUNTA_WHISPER_BIN` — the `whisper-cli` bundled inside `Apunta.app` (M8).
   *
   * Used only when the `whisper_binary` setting is empty, so a path she has
   * chosen in Settings still wins. Undefined on a developer machine, where
   * `whisper-cli` is on `PATH`.
   */
  readonly whisperBin: string | undefined;
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
 * Default data directory. One line, because C-PATH@1's table in
 * `shared/src/platform-paths.ts` is the single source of truth for every
 * consumer; the platform is read here and nowhere else.
 */
export function defaultDataDir(): string {
  return platformDataDir(platform(), process.env, homedir());
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
    ollamaModelsDir: join(dataDir, OLLAMA_DIRNAME),
    // `serverRoot` is `server/` whether we are running from `src/` under tsx or
    // from the built `dist/`, so the .sql files are found either way.
    migrationsDir: join(serverRoot, 'migrations'),
    fakeAi: env['APUNTA_FAKE_AI'] === '1',
    fakeStreamDelayMs: readDelay(env['APUNTA_FAKE_STREAM_DELAY_MS']),
    ollamaUrl: loopbackOnly(env['APUNTA_OLLAMA_URL']?.trim() || DEFAULT_OLLAMA_URL),
    ollamaBin: nonEmpty(env['APUNTA_OLLAMA_BIN']),
    whisperBin: nonEmpty(env['APUNTA_WHISPER_BIN']),
    sqliteBinding: nonEmpty(env['APUNTA_SQLITE_BINDING']),
    licensesFile: nonEmpty(env['APUNTA_LICENSES_FILE']) ?? join(repoRoot, 'THIRD-PARTY-LICENSES.md'),
    webDistDir: nonEmpty(env['APUNTA_WEB_DIST']) ?? join(repoRoot, 'web', 'dist'),
    version: readPackageVersion() ?? '0.0.0',
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

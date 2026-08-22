import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version?: string };

/** `server/` — the same two levels up whether we run from `src/` (tsx) or `dist/` (built). */
const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(serverRoot, '..');

export const DEFAULT_PORT = 7717;

export interface AppConfig {
  /** Always loopback — the server must never be reachable from the network. */
  readonly host: '127.0.0.1';
  readonly port: number;
  /** Where SQLite and audio scratch files will live (M1+). */
  readonly dataDir: string;
  /** `PATIENCE_FAKE_AI=1` — deterministic providers, no local AI tooling needed. */
  readonly fakeAi: boolean;
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
    return join(homedir(), 'Library', 'Application Support', 'Practice Notes');
  }
  if (platform() === 'win32') {
    const appData = process.env['APPDATA'];
    return appData ? join(appData, 'Practice Notes') : join(homedir(), 'Practice Notes');
  }
  const xdg = process.env['XDG_DATA_HOME'];
  return xdg ? join(xdg, 'practice-notes') : join(homedir(), '.local', 'share', 'practice-notes');
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const rawPort = env['PATIENCE_PORT'];
  const port = rawPort === undefined || rawPort === '' ? DEFAULT_PORT : Number(rawPort);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`PATIENCE_PORT must be an integer between 0 and 65535 (got "${rawPort}")`);
  }

  const dataDirOverride = env['PATIENCE_DATA_DIR'];

  return {
    host: '127.0.0.1',
    port,
    dataDir: dataDirOverride ? resolve(dataDirOverride) : defaultDataDir(),
    fakeAi: env['PATIENCE_FAKE_AI'] === '1',
    webDistDir: join(repoRoot, 'web', 'dist'),
    version: pkg.version ?? '0.0.0',
  };
}

/** Nothing writes to the data dir yet (M1 does), but it must exist at boot. */
export function ensureDataDir(dataDir: string): string {
  mkdirSync(dataDir, { recursive: true });
  return dataDir;
}

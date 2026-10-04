import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { defineConfig, devices } from '@playwright/test';

import type { AppOptions } from './support/fixtures';

const repoRoot = resolve(import.meta.dirname, '..');

/** Never touch the real data directory from tests. Under the sandbox wrapper
 * (scripts/v2/sandbox.mjs) the run folder arrives in APUNTA_DATA_DIR. */
const dataDir = process.env['APUNTA_DATA_DIR'] ?? mkdtempSync(join(tmpdir(), 'apunta-e2e-'));

/** Not 7717, so a dev server left running does not collide with the suite. */
const port = Number(process.env['APUNTA_E2E_PORT'] ?? 7788);
const baseURL = `http://127.0.0.1:${String(port)}`;

/**
 * The es-MX project's own server (S2.6): the same build, started with
 * `APUNTA_DEV_SPANISH=1` so the build offers Spanish, on its own port and its
 * own data folder. It cannot share the English server: the language is one
 * stored setting, and two projects running at once would each switch it
 * under the other.
 *
 * Under the sandbox wrapper, give it a second run folder of its own —
 * `sandbox.mjs env --port <p2>` — and pass its port and data folder in
 * `APUNTA_E2E_ES_PORT` and `APUNTA_E2E_ES_DATA_DIR`. Without them it takes the
 * next port and a folder beside the English one, which is still inside the
 * run folder when the English one is.
 */
const esPort = Number(process.env['APUNTA_E2E_ES_PORT'] ?? port + 1);
const esBaseURL = `http://127.0.0.1:${String(esPort)}`;
const esDataDir =
  process.env['APUNTA_E2E_ES_DATA_DIR'] ??
  (process.env['APUNTA_DATA_DIR'] ? `${dataDir}-es-MX` : mkdtempSync(join(tmpdir(), 'apunta-e2e-es-')));
mkdirSync(esDataDir, { recursive: true });

/**
 * The Language control's own specs (V2, V3). They switch the one stored
 * language and hold a job open to be refused under, so they cannot share a
 * server with specs that run in parallel: the es-MX suite waits for them, on
 * the same server, and starts once they are done.
 */
const languageControl = /language-control\.spec\.ts$/;

/** What both servers are started with; each adds its port and data folder. */
const serverEnv = {
  APUNTA_FAKE_AI: '1',
  APUNTA_NO_OPEN: '1',
  // The server Playwright starts belongs to this sandbox run: carry the
  // run id so its /api/health answers with the matching testRunId.
  ...(process.env['APUNTA_TEST_RUN_ID'] ? { APUNTA_TEST_RUN_ID: process.env['APUNTA_TEST_RUN_ID'] } : {}),
  ...(process.env['APUNTA_V2'] ? { APUNTA_V2: process.env['APUNTA_V2'] } : {}),
};

/**
 * Sandboxes (and some CI images) ship a pre-installed browser instead of the
 * one Playwright would download. Point at it with PLAYWRIGHT_CHROMIUM_EXECUTABLE.
 */
const executablePath = process.env['PLAYWRIGHT_CHROMIUM_EXECUTABLE'];

/**
 * A microphone the capture spec can record from (M5).
 *
 * Chromium plays the WAV below into a fake input device and auto-accepts the
 * permission prompt, so `getUserMedia` → `AudioContext` → `AudioWorkletNode`
 * runs for real — the only part of the recording path a headless run can
 * substitute is the physical microphone. The file is synthetic and contains no
 * speech; `e2e/fixtures/audio/README.md` says why.
 */
const fakeMicrophone = [
  // `--use-fake-device-for-media-stream`, not the `-media-capture` spelling the
  // M5 packet quoted: that switch does not exist in Chromium, and `getUserMedia`
  // answers "Requested device not found" — which looks exactly like a headless
  // machine having no microphone, so the spec would have been quietly deleted
  // as unrunnable rather than fixed.
  '--use-fake-device-for-media-stream',
  '--use-fake-ui-for-media-stream',
  `--use-file-for-fake-audio-capture=${join(import.meta.dirname, 'fixtures', 'audio', 'dictation-10s.wav')}`,
];

export default defineConfig<AppOptions>({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 2 : 0,
  ...(process.env['CI'] ? { workers: 1 } : {}),
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
    launchOptions: {
      args: fakeMicrophone,
      ...(executablePath ? { executablePath } : {}),
    },
  },
  projects: [
    // English, on a build that does not offer Spanish: the release shape. The
    // Spanish field spec is not collected here: `spelling-es.spec.ts` asserts
    // a Spanish dictionary, which this project's build never offers (S6.1, D6).
    {
      name: 'chromium',
      testIgnore: /spelling-es\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], appLocale: 'en' },
    },
    // The Language control's V2 and V3, alone on the Spanish server, first.
    {
      name: 'es-MX-language',
      testMatch: languageControl,
      use: { ...devices['Desktop Chrome'], baseURL: esBaseURL, appLocale: 'es-MX' },
    },
    // Every other spec again, in Spanish, once the control's specs are done.
    {
      name: 'es-MX',
      // The English spelling spec is not applicable here: under D3 the
      // dictionary follows the active UI language, so its English-dictionary
      // assertions would be evaluated against Spanish (S6.1, D6).
      testIgnore: [languageControl, /spelling\.spec\.ts$/],
      dependencies: ['es-MX-language'],
      use: { ...devices['Desktop Chrome'], baseURL: esBaseURL, appLocale: 'es-MX' },
    },
  ],
  webServer: [
    {
      // Self-contained: build shared + server + web, then serve the built SPA
      // and API from one process, exactly as `npm start` does for the user.
      command: 'npm run build && node server/dist/index.js',
      cwd: repoRoot,
      url: `${baseURL}/api/health`,
      // Under the sandbox wrapper (APUNTA_V2=1) never attach to a stray
      // server: the run owns its port, verified by testRunId (C-ISO@1 rule 8).
      reuseExistingServer: process.env['APUNTA_V2'] === '1' ? false : !process.env['CI'],
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 60_000,
      env: { ...serverEnv, APUNTA_PORT: String(port), APUNTA_DATA_DIR: dataDir },
    },
    {
      // Started after the first, from the build the first one made — the two
      // are launched in order, so this one never races the build.
      command: 'node server/dist/index.js',
      cwd: repoRoot,
      url: `${esBaseURL}/api/health`,
      reuseExistingServer: process.env['APUNTA_V2'] === '1' ? false : !process.env['CI'],
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 60_000,
      env: { ...serverEnv, APUNTA_PORT: String(esPort), APUNTA_DATA_DIR: esDataDir, APUNTA_DEV_SPANISH: '1' },
    },
  ],
});

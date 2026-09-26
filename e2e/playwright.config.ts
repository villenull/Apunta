import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { defineConfig, devices } from '@playwright/test';

const repoRoot = resolve(import.meta.dirname, '..');

/** Never touch the real data directory from tests. Under the sandbox wrapper
 * (scripts/v2/sandbox.mjs) the run folder arrives in APUNTA_DATA_DIR. */
const dataDir = process.env['APUNTA_DATA_DIR'] ?? mkdtempSync(join(tmpdir(), 'apunta-e2e-'));

/** Not 7717, so a dev server left running does not collide with the suite. */
const port = Number(process.env['APUNTA_E2E_PORT'] ?? 7788);
const baseURL = `http://127.0.0.1:${String(port)}`;

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

export default defineConfig({
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
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Self-contained: build shared + server + web, then serve the built SPA and
    // API from one process, exactly as `npm start` does for the user.
    command: 'npm run build && node server/dist/index.js',
    cwd: repoRoot,
    url: `${baseURL}/api/health`,
    // Under the sandbox wrapper (APUNTA_V2=1) never attach to a stray
    // server: the run owns its port, verified by testRunId (C-ISO@1 rule 8).
    reuseExistingServer: process.env['APUNTA_V2'] === '1' ? false : !process.env['CI'],
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 60_000,
    env: {
      APUNTA_PORT: String(port),
      APUNTA_FAKE_AI: '1',
      APUNTA_DATA_DIR: dataDir,
      APUNTA_NO_OPEN: '1',
      // The server Playwright starts belongs to this sandbox run: carry the
      // run id so its /api/health answers with the matching testRunId.
      ...(process.env['APUNTA_TEST_RUN_ID'] ? { APUNTA_TEST_RUN_ID: process.env['APUNTA_TEST_RUN_ID'] } : {}),
      ...(process.env['APUNTA_V2'] ? { APUNTA_V2: process.env['APUNTA_V2'] } : {}),
    },
  },
});

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { defineConfig, devices } from '@playwright/test';

const repoRoot = resolve(import.meta.dirname, '..');

/** Never touch the real data directory from tests. */
const dataDir = mkdtempSync(join(tmpdir(), 'patience-e2e-'));

/** Not 7717, so a dev server left running does not collide with the suite. */
const port = Number(process.env['PATIENCE_E2E_PORT'] ?? 7788);
const baseURL = `http://127.0.0.1:${String(port)}`;

/**
 * Sandboxes (and some CI images) ship a pre-installed browser instead of the
 * one Playwright would download. Point at it with PLAYWRIGHT_CHROMIUM_EXECUTABLE.
 */
const executablePath = process.env['PLAYWRIGHT_CHROMIUM_EXECUTABLE'];

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
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Root `npm run e2e` builds web + server first; this only boots the result.
    command: 'node server/dist/index.js',
    cwd: repoRoot,
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env['CI'],
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 60_000,
    env: {
      PATIENCE_PORT: String(port),
      PATIENCE_FAKE_AI: '1',
      PATIENCE_DATA_DIR: dataDir,
    },
  },
});

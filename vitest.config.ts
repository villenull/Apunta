import { defineConfig } from 'vitest/config';

// One runner for every workspace that has tests; e2e lives in Playwright.
export default defineConfig({
  test: {
    projects: ['shared', 'server', 'web'],
  },
});

import { defineConfig } from 'vitest/config';

/**
 * Lane 2's own runner, deliberately outside the root `vitest.config.ts`
 * projects (`shared`, `server`, `installer`, `web`, `tools/model-lab`).
 *
 * Research code must not join the product's test run: nothing in `server/`,
 * `web/` or `shared/` may import it, and `npm test` must not change because a
 * spike added a file. `root` is this directory so the include patterns below
 * are relative to the lane, and the repo root stays the resolution base so
 * `vitest` and `zod` resolve from the existing `node_modules` — no install.
 */
export default defineConfig({
  root: import.meta.dirname,
  test: {
    name: 'claude-import-structure',
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});

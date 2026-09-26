# P4.2 — evidence: Step 1's recorded failure

The card's Step 1: write `shared/src/platform-paths.test.ts` first, one case per
row of the Fixed-decisions table, and record that the command fails **because
the module does not exist yet**.

- **Working directory:** repository root
- **Node:** `v24.19.0`, exported first as the rows write it
- **Command:**

  ```sh
  export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && npm run build:shared && npx vitest run shared/src/platform-paths.test.ts
  ```

- **Exit code:** `1` — expected
- **Start:** 2026-09-26T15:54:59Z
- **End:** 2026-09-26T15:55:01Z
- **Status:** the failure the step asks for

`npm run build:shared` succeeded (the test file is excluded from the build by
`shared/tsconfig.json`'s `exclude`), and vitest then failed on the missing
module:

```
 ❯ |shared| src/platform-paths.test.ts (0 test)

 FAIL  |shared| src/platform-paths.test.ts [ shared/src/platform-paths.test.ts ]
Error: Cannot find module './platform-paths.js' imported from <repo>/shared/src/platform-paths.test.ts
 ❯ src/platform-paths.test.ts:3:1
      1| import { describe, expect, it } from 'vitest';
      2|
      3| import { platformDataDir } from './platform-paths.js';
       | ^

 Test Files  1 failed (1)
      Tests  no tests
```

`(0 test)` and `Tests no tests` is the honest state: the suite could not even
collect, because the module under test was absent. The failure is the import
resolution, not an assertion.

## Step 2, the same command after the module and the re-export landed

- **Exit code:** `0`
- **Start:** 2026-09-26T15:55:13Z
- **End:** 2026-09-26T15:55:14Z

```
 Test Files  1 passed (1)
      Tests  10 passed (10)
```

All ten rows green on the first run after the module was added — no row needed a
second attempt, and no assertion was relaxed to get there.

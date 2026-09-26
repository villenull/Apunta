# P0.2 evidence — L1 gate (lint, typecheck, shared build)

All run from the repo root with Node 24.19.0 first on PATH, after all
edits were in place. Observed 2026-09-26 ~01:12–01:13 UTC.

| Command | Exit code |
| --- | --- |
| `npm run lint` (eslint + prettier + no-external-urls + licenses check) | **0** (`All matched files use Prettier code style!`, licences list all 111 packages) |
| `npm run typecheck` | **0** |
| `npm run build:shared` | **0** |

No change to `server/vitest.config.ts` was needed: no setup file is
required (zone pinning is done with `beforeEach`/`afterEach` in the test
files, per the card's fixed decisions).

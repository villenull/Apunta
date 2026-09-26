# P0.3 evidence — V4 (lint + typecheck + unit/integration)

- Working directory: repo root (`~`)
- Observed: 2026-09-26 ~01:45 UTC (START 01:45:14Z, END 01:45:31Z)
- Raw tails kept in `V4-lint.txt`, `V4-typecheck.txt`, `V4-test.txt` beside this file.

## Commands and exit codes

- `npm run lint` — exit **0** (eslint, prettier --check, check-no-external-urls,
  collect-licenses --check; one interim `no-useless-assignment` error in
  `sandbox.mjs` was fixed, then one prettier formatting fix, then clean).
- `npm run typecheck` — exit **0** (shared, server, installer, web, e2e projects).
- `npm test` — exit **0**: 121 test files, 1545 tests, all passed. Includes the
  new `server/src/routes/health.test.ts` (3 tests: field omitted when unset,
  present when set, omitted when blank).

## Note

`node --test scripts/v2/sandbox.test.mjs` (6/6 pass, exit 0) is recorded in
`unit-tests.txt`. It is outside the vitest projects by design (plain
`node:test`, no dependencies) and is not part of `npm test`.

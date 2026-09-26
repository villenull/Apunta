# P2.2 evidence

Greeting A mark and rendered-colour tests. **Coverage-only card**: the brand
implementation already shipped in the owner-approved AM-028 baseline
(`b366be1`, an ancestor of this card's base), so the deliverable is the tests
that lock it, not the implementation. Implementation session, attempt 1 of 3,
base commit `c55b4e0` — verified with `git log -1` before the first edit, and
still `c55b4e0` when every row ran and at the end of the session. Nothing was
pulled, merged, rebased, reset or committed.

Every command ran from the repository root with the provisioned Node first on
`PATH` (`node --version` → `v24.19.0`; the box default is v26.8.2, outside
`engines: ">=24.19.0 <25"`). All times are UTC; `vitest`'s own `Start at` line
prints local time (UTC−06:00 on this box) and is left as printed. Sandbox paths
are written `<sandbox>`; the only browser is the box's `/usr/bin/chromium`,
reached through `PLAYWRIGHT_CHROMIUM_EXECUTABLE` because the box has no
Playwright-managed browser.

| Row | Status | Exit | Evidence |
| --- | --- | --- | --- |
| V1 `sandbox.mjs env --port 7817` + `npm run e2e --workspace @apunta/e2e -- --grep "brand"` | PASS, **only** the five `brand:` tests, 5 passed | 0 | [v1-e2e.md](./v1-e2e.md) |
| V2 `npm run build:shared && npx vitest run web/src/components/HomeLauncher.test.tsx` | PASS, 1 file / 5 tests collected; directory form 15 files / 122 tests | 0 | [v2-unit.md](./v2-unit.md) |
| V3 `npm run lint && npm run typecheck` | PASS | 0 | [v3-lint-typecheck.md](./v3-lint-typecheck.md) |

**Two files created, both test-only, both in the card's May-edit list:**
`web/src/components/HomeLauncher.test.tsx` (5 cases) and
`e2e/tests/brand.spec.ts` (5 tests). Neither existed at base, so nothing was
extended and no existing case was weakened or removed. `git status --porcelain`
lists exactly those two paths plus this evidence folder; all eleven
Must-not-edit production files, the three P2.1 test files, `prototype/`, the
contracts and the coordinator's own state are byte-for-byte as dispatched.

**The pass on the base commit's behaviour is the result, not a missing
failure.** The card says this twice: this behaviour exists, the first green
run is the evidence, and manufacturing a failure by editing production code is
forbidden. Nothing under `web/src/components/*.tsx`, `web/src/styles/`,
`web/src/lib/`, `shared/src/` or `server/` was modified at any point.

Findings, observations and the two reporting-only items the card routes to the
coordinator ("report both; change neither") are in
[notes.md](./notes.md).

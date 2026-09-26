# P1.2 evidence

Theme radio keyboard behaviour (C-SETTINGS@1's radio bullet on the theme group).
**Coverage-only card**: the behaviour is already shipped in
`web/src/routes/Settings.tsx`, so the deliverable is the tests that lock it in.
Implementation session, attempt 1 of 3, base commit `c1bec23` (verified with
`git log -1` before any edit, and still `c1bec23` when every row ran — nothing
was committed, as instructed).

Every command ran from the repository root with the provisioned Node first on
`PATH` (`node --version` → `v24.19.0`; the box default is v26.8.2, outside
`engines: ">=24.19.0 <25"`). Wall clock below is UTC.

| Row | Status | Exit | Evidence |
| --- | --- | --- | --- |
| V1 unit (`Settings.test.tsx`) — baseline on the untouched base commit | PASS, 3 tests | 0 | [v1-unit.md](./v1-unit.md) |
| V1 unit — with the theme keyboard cases | PASS, 7 tests | 0 | [v1-unit.md](./v1-unit.md) |
| V2 e2e `settings appearance` in the sandbox | PASS, 2 tests | 0 | [v2-e2e.md](./v2-e2e.md) |
| V3 `npm run lint` | PASS | 0 | [v3-lint-typecheck.md](./v3-lint-typecheck.md) |
| V3 `npm run typecheck` | PASS | 0 | [v3-lint-typecheck.md](./v3-lint-typecheck.md) |

Supplementary, not a card row: a sensitivity pass that deliberately broke four of
the new expectations to prove they are reached and can fail
([v1-unit.md](./v1-unit.md) §4), reverted before the run of record.

**The pass on the base commit is the result, not a missing failure.** The card's
stop conditions say so twice: this behaviour exists, so the first run passes
unchanged, and manufacturing a failure by editing `Settings.tsx` is forbidden.
`git diff --name-only c1bec23 -- web/src/routes/Settings.tsx shared/src/settings.ts`
is **empty**: production is byte-for-byte as dispatched.

**The base moved under the session, and both rows were re-run on the new HEAD.**
The other card in flight (P1.4) committed `a2dc75d` at 10:01, after V1, V2 and V3
had run. `git diff --name-only c1bec23..a2dc75d` is `server/src/**`,
`scripts/*.sh` and `docs/**` only — no `web/`, no `e2e/`, no `shared/` — so no
row's result depends on it. To remove the question altogether, V1 and V2 were
re-run against that HEAD unchanged: V1 7 passed (10:01:25Z), V2 2 passed
(10:01:29Z, sandbox `2026-09-26T10-01-29-885Z-512a800a`). Both are recorded in
their evidence files. Nothing was pulled, merged, rebased or reset, and this
card's change is still uncommitted and staged on top.

**Sandbox run ids** (raw logs stay under `<sandbox>/` and are never committed):
`2026-09-26T09-59-34-589Z-1b7670b2` (V2 at base `c1bec23`) and
`2026-09-26T10-01-29-885Z-512a800a` (V2 re-run at `a2dc75d`), port **7815**
throughout (this card's assignment in C-ISO@1's 7800-7889 band). Port 7717 was
never contacted. P1.4's uncommitted work was in the tree during the first set of
runs and was left alone; `npm run lint` and `npm run typecheck` cover the whole
repository and were both green with it in place.

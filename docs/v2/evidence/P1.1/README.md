# P1.1 evidence

Shared settings mutation path (C-SETTINGS@1). Implementation session, attempt 1
of 3, started on base commit `285283c` (verified with `git log -1` before any
edit). Every command ran from the repository root with the provisioned Node
first on `PATH` (`node --version` → `v24.19.0`; the box default is v26.8.2,
outside `engines: ">=24.19.0 <25"`).

| Row | Status | Exit | Evidence |
| --- | --- | --- | --- |
| V1 e2e on the base commit | FAIL, as expected | 1 | [v1-e2e.md](./v1-e2e.md) |
| V2 e2e with the change | PASS | 0 | [v2-e2e.md](./v2-e2e.md) |
| V3 unit tests | PASS | 0 | [v3-unit.md](./v3-unit.md) |
| V4 `npm run lint` | PASS | 0 | [v4-lint-typecheck.md](./v4-lint-typecheck.md) |
| V4 `npm run typecheck` | FAIL, one foreign file | 2 | [v4-lint-typecheck.md](./v4-lint-typecheck.md) |

Supplementary, not card rows: the whole `web` unit suite (32 files, 307 tests,
exit 0) and the `appearance|spelling` e2e filter (3 passed, exit 0), which
covers the pre-existing `workspace.spec.ts` appearance test and the only other
spec that writes settings.

**Sandbox run ids** (all under `<sandbox>/`, raw logs stay there and are never
committed): `2026-09-26T09-16-13-924Z-17cc691d` (V1 attempt 1, browser launch
error), `2026-09-26T09-16-52-200Z-28543ddb` (V1, the run of record),
`2026-09-26T09-27-22-730Z-24de8169` and `2026-09-26T09-29-58-328Z-7a45b5a8` (V2
attempts blocked by the other card, plus a hand-started diagnostic server),
`2026-09-26T09-34-54-183Z-384aec26` (V2, the run of record). Port 7811
throughout; 7717 never contacted.

**The base moved during the session.** V1 ran at `285283c` as dispatched. The
card in flight committed five times while this session worked, so V2, V3 and V4
ran with HEAD at `a99094b`. `git diff --name-only 285283c..a99094b` touches only
`README.md`, `docs/**`, `docs/v2/state/**` and
`installer/src/catalog.test.ts` — no `web/`, no `e2e/`, no `shared/` — so no
row's result depends on the difference. The one thing it does change is V4's
typecheck: see that file.

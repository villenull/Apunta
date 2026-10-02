# P3.4 — bridge security: no IPC, locked navigation, CSP

Attempt 1 of 3, base commit `52b9ce0`, sandbox port **7835**. Every run-folder
path in this folder is written `<sandbox>` (RUN-CONFIG §4); raw logs stay in the
sandbox run folder and were not committed.

| Row | Status | Exit code | This file |
| --- | --- | --- | --- |
| V0 | NOT RUN | — | [`V0-not-run.md`](V0-not-run.md) |
| V1 | PASS | 0 | [`V1-csp-unit.md`](V1-csp-unit.md) |
| V2 | FAIL | 1 | [`V2-appimage-security.md`](V2-appimage-security.md) |
| V3 | PASS | 0 | [`V3-config-greps.md`](V3-config-greps.md) |
| V4 | PASS | 0 | [`V4-lint-typecheck-tests.md`](V4-lint-typecheck-tests.md) |

## Sandbox run ids

| Run | Id | Used for |
| --- | --- | --- |
| `2026-10-02T16-46-12-867Z-cb13d02b` | `<sandbox>` | the four inspector-protocol probes (see `V2-…`, "Reading the framing") |
| `2026-10-02T17-04-50-478Z-b3da639b` | `<sandbox>` | **V2**, `scripts/v2/tauri-security.test.mjs security` |

## The two things a reviewer should read first

1. **V2 (a) is `NOT RUN`, and that blocks approval.** The card's central rule-4
   claim — that `window.__TAURI__` is absent in the *shipped binary* — is
   unproven, because WebKitGTK's inspector on 7836 could not be read. The card
   makes this explicit: a `NOT RUN` (a) blocks approval pending a coordinator
   decision. It is **not** substituted by V3's config-level greps.
2. **V2 (d)'s header half fails for a reason outside this card's edit list.** The
   AppImage bundles `build/linux-resources/server/server.mjs`, built at 00:01 by
   P3.1, which contains no `content-security-policy` at all. Only V0
   (`tauri:build:test`, which re-runs `scripts/v2/package-linux-resources.sh`)
   rebuilds it, and V0's own rule records `NOT RUN` here. This is a gap in V0's
   condition — see `V0-not-run.md`.

No threshold, guard, assertion or check was weakened, skipped or relaxed to make
any row pass (HS-7). Nothing was acquired (HS-3). Port 7717 was never contacted
and no live data directory was opened (HS-1).

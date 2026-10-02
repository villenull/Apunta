# P3.4 — bridge security: no IPC, locked navigation, CSP

Attempt 2 of 3, base commit `d56af1d`, sandbox port **7835**. Every run-folder
path in this folder is written `<sandbox>` (RUN-CONFIG §4); raw logs stay in the
sandbox run folder and were not committed.

| Row | Status | Exit code | This file |
| --- | --- | --- | --- |
| V0 | **BLOCKED** | 1 | [`V0-blocked-a06.md`](V0-blocked-a06.md) |
| V1 | PASS | 0 | [`V1-csp-unit.md`](V1-csp-unit.md) |
| V2 | **FAIL** | 1 | [`V2-appimage-security.md`](V2-appimage-security.md) |
| V3 | PASS | 0 | [`V3-config-greps.md`](V3-config-greps.md) |
| V4 | PASS | 0 | [`V4-lint-typecheck-tests.md`](V4-lint-typecheck-tests.md) |

## Sandbox run ids

| Run | Id | Used for |
| --- | --- | --- |
| `2026-10-02T18-19-51-522Z-06e7efc6` | `<sandbox>` | **V2**, `scripts/v2/tauri-security.test.mjs security` |

## The three things a reviewer should read first

1. **V0 is `BLOCKED`, and it is the whole of V2's failure.** The whisper.cpp
   source tree A06 pins is not on this machine, so the row's `whisper-cli`
   precondition fails and the row stops before building anything. Running the
   producer anyway would have fetched the pinned revision from `github.com`,
   which HS-3 forbids and which the row's own text names as the reason the
   precondition exists. The card prescribes `BLOCKED` for exactly this case. The
   consequence is that V2 launched the 07:06Z AppImage, whose bundled server and
   web bundle both predate this card's work.
2. **V2 (a) is `NOT RUN`, and that blocks approval.** The card's central rule-4
   claim — that `window.__TAURI__` is absent in the *shipped binary* — is
   unproven. The card makes this explicit: a `NOT RUN` (a) blocks approval pending
   a coordinator decision. It was **not** substituted by V3's config-level greps,
   and none of the three forbidden remedies was taken: no second hook or marker
   path in `web/`, no change to the gate, no `src-tauri/**` edit to open a
   channel.
3. **The channel itself is not what failed.** The delivery chain the card
   describes was exercised end to end by the running app: the shell re-emitted an
   unrecognised server stdout line to **stderr** exactly as `main.rs:321-325`
   says, and the harness read it. What is missing is only the publisher, because
   the launched bundle predates the hook. That is a different failure from attempt
   1's, and it is why the mechanism should be expected to work once V0 can run.

## What was inherited and what was added

**Inherited from attempt 1 (`d56af1d`), unchanged and not rewritten:** the CSP
itself (`server/src/http/csp.ts`), its 12-case test
(`server/src/http/csp.test.ts`), the two registrations in `server/src/app.ts` and
`server/src/boot-error.ts`, and the fixture `e2e/fixtures/csp/injection-probe.md`.

**Added by this attempt:** the observation hook in `web/src/main.tsx` (the one
`web/` file in May edit, gated on `VITE_APUNTA_TEST_IDENTITY === '1'`, with room
left inside the block for P3.5's own facts and its own marker path), and the
harness rewrite in `scripts/v2/tauri-security.test.mjs` — the inspector channel
removed, the hook's stderr channel, Rule B's freshness walk, and the port read
out of `/proc/net/tcp` instead of bound.

No threshold, guard, assertion or check was weakened, skipped or relaxed to make
any row pass (HS-7). Nothing was acquired (HS-3). Port 7717 was never contacted
and no live data directory was opened (HS-1). Nothing was committed.
# P3.4 — bridge security: no IPC, locked navigation, CSP

Attempt 3 of 3 (the last in the card's budget), base commit `7e69838`, sandbox
port **7835**. Every run-folder path in this folder is written `<sandbox>`
(RUN-CONFIG §4); raw logs stay in the sandbox run folder and were not committed.

| Row | Status | Exit code | This file |
| --- | --- | --- | --- |
| S0 | **PASS** | 0 | [`acquisition-A06.md`](acquisition-A06.md) |
| V0 | **PASS** | 0 | [`V0-rebundle.md`](V0-rebundle.md) |
| V1 | PASS | 0 | [`V1-csp-unit.md`](V1-csp-unit.md) |
| V2 | **FAIL** (16 PASS, 5 NOT RUN) | 1 | [`V2-appimage-security.md`](V2-appimage-security.md) |
| V3 | PASS | 0 | [`V3-config-greps.md`](V3-config-greps.md) |
| V4 | PASS | 0 | [`V4-lint-typecheck-tests.md`](V4-lint-typecheck-tests.md) |

## Sandbox run ids

| Run | Id | Used for |
| --- | --- | --- |
| `2026-10-02T19-07-48-964Z-b166043b` | `<sandbox>` | **V2**, `scripts/v2/tauri-security.test.mjs security` |
| `2026-10-02T19-12-23-938Z-bdc6fcd4` | `<sandbox>` | V2 diagnostic: does the server log a marker request to stdout? |
| `2026-10-02T19-14-04-244Z-08468841` | `<sandbox>` | V2 diagnostic: does the hook publish under this CSP? |

## The three things a reviewer should read first

1. **V0 ran and the re-bundle is proved.** S0 restored the A06 precondition and
   V0 completed end to end, exit 0: the flagged bundle carries the marker (1
   bundle), the shipping `web/dist` carries **none** (0), the copy the producer
   would have made carries bundles (16), and an AppImage was built. Freshness is
   asserted from both sides — the AppImage is 19:05:45Z, newer than every Rule B
   input, and V2 reported both freshness assertions `PASS`. The hook is inside
   the shipped AppDir (`index-DXrud9Kw.js` contains `p3.4-observe`; the gate
   string is in 0 of 16 bundles). The re-bundle is no longer this card's problem.
2. **V2 (a)–(c), (d)'s handler half and (e) are `NOT RUN` again, and the cause
   is now precise and it is not the publisher.** The bundle is fresh and
   flagged; the hook **does** run and **does** publish — with the same server,
   the same CSP and the same URL, a real browser engine produced six
   `/api/p3.4-observe` lines in the server's log. The broken leg is the second
   one: `src-tauri/src/main.rs:319-325` re-emits the child's stdout to stderr
   only until `Ready`, where `drive` `break`s, and the page — and therefore the
   publisher — cannot exist until after `Ready`. Closing it means editing
   `src-tauri/**`, which the card forbids by name as one of three remedies.
   **The decision is the coordinator's**, and a `NOT RUN` (a) blocks approval
   per the card. None of the five was upgraded to `PASS` and none was
   substituted by a config-level reading.
3. **The `.invalid` origin is now a plain literal.** Attempt 2 assembled it from
   `['https', 'example.invalid'].join('://')` to satisfy the lint rule, which the
   card calls routing around a guard and an HS-7 finding for a reviewer. Attempt
   3 replaced it with the plain `https://example.invalid/` literal and the single
   line-scoped `// eslint-disable-next-line no-restricted-syntax` the card
   authorises, as the card's Fixed decisions require of any session that finds
   the decomposed form. `eslint.config.js` was not touched and V4 is green.

## What was inherited and what was added

**Inherited from attempt 1 (`d56af1d`), unchanged and not rewritten:** the CSP
itself (`server/src/http/csp.ts`), its 12-case test
(`server/src/http/csp.test.ts`), the two registrations in `server/src/app.ts` and
`server/src/boot-error.ts`, and the fixture `e2e/fixtures/csp/injection-probe.md`.

**Inherited from attempt 2 (`ee2ab00`), unchanged except for the one line the
card required changed:** the observation hook in `web/src/main.tsx` (the one
`web/` file in May edit, gated on `VITE_APUNTA_TEST_IDENTITY === '1'`, with room
left inside the block for P3.5's own facts and its own marker path), and the
harness in `scripts/v2/tauri-security.test.mjs` (hook/stderr channel, Rule B
freshness walk, port read out of `/proc/net/tcp`).

**Added by this attempt:** step S0's A06 acquisition (evidence only — no source
change), V0's evidence file, and the `.invalid` literal plus its one suppression.

No threshold, guard, assertion or check was weakened, skipped or relaxed to make
any row pass (HS-7). One acquisition was made and only the one the card's S0
names (HS-3). Port 7717 was never contacted and no live data directory was
opened (HS-1). Nothing was committed.
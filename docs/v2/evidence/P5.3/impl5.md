# P5.3 fifth repair — implementation evidence (2026-10-06)

Baseline: `e62c94f239d634faa966636836c468d7b9cd9131`. AM-218 authorizes this repair; AM-219 reconciles the already-shipped document nonce without editing the protected card. Historical round-4 failures remain in `impl4-review.md` and `state/reviews/P5.3-impl4.md`.

## Source repair and independent source review

`server/src/maintenance.ts` now keys all three `answered` lookups/additions by the window record id, not its copied session-storage tab id. A clean duplicate cannot discharge a crashed sibling, and a new duplicate joining mid-quiesce is asked to flush rather than silently counted as answered. Two deterministic regression cases exercise these different transitions.

The browser spec's ordinary clean teardown navigates to the exempt `/api/health` before closing; deliberate dirty/crash scenarios remain unclean. The Spanish refusal copy now says `para resolver`. Capture's unmount cleanup was already fixed in the baseline UI batch and was not changed here.

Independent free-model source review: OpenCode session `ses_eee81b56dffeLFHf07u5nOWc3V`, source-only verdict **CLEAR**, raw coordinator artifact `657`. All four in-scope findings were resolved; the fifth was already resolved by the baseline. This is not an independent runtime acceptance verdict.

The first typecheck found TS2352 in the new test's nullable closure cast. The coordinator replaced that cast with an explicit nullable promise holder; the subsequent complete gate passed. No production assertion or runtime behavior was weakened.

## Stable local gates

Node `24.19.0` through mise. Sandbox environment allocated by `scripts/v2/sandbox.mjs env --port 7853`:

- run id: `2026-10-06T14-42-44-621Z-47d59157`;
- data: `/tmp/apunta-v2/2026-10-06T14-42-44-621Z-47d59157/data`;
- installation: `/tmp/apunta-v2/2026-10-06T14-42-44-621Z-47d59157/installation`;
- `APUNTA_V2=1`, `APUNTA_FAKE_AI=1`, `APUNTA_NO_OPEN=1`, `APUNTA_PORT=7853`, `APUNTA_E2E_PORT=7853`;
- Chromium: `/usr/bin/chromium`.

Each command received that isolated environment:

```text
npm run typecheck
npm test
npm run lint
npm run build
npm run e2e --workspace @apunta/e2e -- --retries=0
```

All exited successfully. Unit/integration: **170 files, 2,461 tests passed**. Lint: formatting clean, all 112 shipped npm packages accounted for, `TOTAL 0`. Build completed. Browser suite: **117 passed, six existing skips**, including all **11 quiescence cases**, with no retries. The inherited `CI=true` selected the repository's existing one-worker CI configuration; no worker setting or test timeout was added or changed. This proves the CI-shaped local gate, not default-parallel independent acceptance.

Raw gate evidence: coordinator artifact `669` (original output, not its truncated wrapper). The four regenerated P2.2 screenshot artifacts were restored, not adopted as new historical evidence.

V1 was additionally run with the card's four named paths and `--reporter=verbose`; exit 0. The named output includes the drain bound, registry refusals, flush exemption, stale/foreign report rejection, reporter lifecycle, retained disconnect and clean-close cases. Independent acceptance must still re-run every verification row against the committed candidate.

## Actual changed-path smoke

A temporary TypeScript program imported the actual production `createMaintenance`, registered two documents sharing one tab id, disconnected one, and let the remaining document report a clean flush. It used the same isolated sandbox environment and Node 24.19.0. The old round-4 reproduction settled `ok:true`; the repaired controller printed:

```json
{"scenario":"clean duplicate cannot discharge crashed duplicate","quiesceId":"01a111f1-c3c1-7048-8e94-09aa2cf43c0c","ok":false,"blockers":["no_response"]}
```

The program asserted the refusal and blocker, exited successfully, and was removed afterwards. No live data, port 7717, real patient text or external runtime service was used.

## Acceptance boundary

Implementation gates and the historical fail-open reproduction are green. Approval still requires a separate implementation review re-running V1–V9 on the final commit, including the whole browser suite with retries disabled and the default parallel configuration. P3.6's AM-214 rebuild remains held until that approval and clean Rule B inputs.

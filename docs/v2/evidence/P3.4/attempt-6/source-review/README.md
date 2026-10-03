# P3.4 attempt-6 — independent shipping-source review evidence

Fresh independent SOURCE review of the applied AM-195 tree, before any serial
runtime lease. Reviewer lease: read-only on the repository; only
`docs/v2/state/reviews/P3.4-impl6.md` and this directory were written; scratch in
the ignored `build/p34-impl6-ir/` and `/tmp/opencode/p34replay/`. No source,
tool, fixture, card, checkpoint, contract, proposal or old evidence edited;
nothing staged or committed; no runtime/app/build/model/audio/input/network/7717.

## Result

**CLEAR.** The four AM-195 patches are exact, apply cleanly to `4060909`, and
reproduce the four shipping hashes byte for byte; no extra hunks or source
widening; the committed proofs are 80/80, 29/29 and 13/13; syntax, scoped ESLint
and Prettier are clean; the keyed attempt-6 grant is print-only correct and
bounded. Three non-blocking observations (`05` §4) touch only prior-review prose
and two already-disclosed cosmetic names — none touches a shipping byte.

## Candidate

| file | sha256 |
| --- | --- |
| `scripts/v2/tauri-security.test.mjs` | `cc733cd0791cb896e57b07608dd97e4c1e835efb06f8b491d5f1010619df7a16` |
| `docs/v2/tools/build-dispatch.mjs` | `3f77b55bdea4a2e00019d3f66b5e96479c476a3e4a5af45575c6b9971cef56c4` |
| `docs/v2/tools/build-dispatch.test.mjs` | `ee8e051cc467ef62c55d00a128d496da94eeaaee6364789c694a85d5d6de8b8f` |
| `…/attempt-5/implementation/ported-model.test.mjs` | `e4790fe909e0352fdba94b0f54db48397deac436a35d3c267937f468796d607b` |
| `…/attempt-5/implementation/adapters.test.mjs` | `325b2884f31dc1c8f3cf0767d279cfacde1e40b07e09437e904e87b815d9a4c8` (untouched) |

Base: `4060909`. Applied at source commit `88811af`; HEAD at review time
`5f57347` (docs/state only).

## Index

| File | What it shows |
| --- | --- |
| `01-identity-replay.txt` | baseline, patch and replay hashes; isolated `patch -p1` replay equals HEAD byte for byte; numstat/hunk scope and no widening; the fixture patch is load-bearing (candidate+tooling only 59/80). |
| `02-suites-and-checks.txt` | 80/80, 29/29, 13/13; `node --check`, ESLint `--no-ignore`, Prettier `--check` — all exit 0. |
| `03-instrument-and-tool-logic.txt` | `getwindowpid` fail-closed before any move; measured containment; fresh `ptrN`; deadline/single-click/landing/IPC untouched by the patch; the 32 adversarial controls carry on the `cc733cd0…` hash. |
| `04-tool-grant-print-only.txt` | print-only: P3.4 attempt 6 AM-195 allowed; other cards at 6, any card at 7, and no-exception all refused; nothing written. |
| `05-scope-writes-and-observations.txt` | writes/non-writes, concurrent activity, and the three non-blocking observations. |

## Next step — root's, not this review's

`Rule B` set is unchanged (`web/src/main.tsx` untouched), so root derives the V0
runtime predicate after this CLEAR, regenerates the dispatch, delegates the sole
checkpoint writer, and runs V0 → V4 once each in card order. No attempt 7, reset,
retry, partial re-run or waiver.

# P3.4 EOD instrument proposal — REPAIR (R1-R4 from the independent review)

Author-side bounded repair of the independent review
`docs/v2/state/reviews/P3.4-eod-instrument-ir.md`, which returned the instrument
**CLEAR** and the shipped patch **a defect for owner-readiness** on four points.
Preparation only: nothing adopted, nothing in force, no source, tool, card,
checkpoint, contract or reviewer artifact edited, nothing staged or committed, no
runtime run, and **no attempt 6 granted or assumed**.

Base: `main` `99baec7`. Scratch: the **ignored** `build/p34-eod-repair/`.
The review's own artifacts are untouched.

Shipping identity at `99baec7` (identical to the review's baseline, and across the
background commit that landed mid-repair):

| file | sha256 |
| --- | --- |
| `scripts/v2/tauri-security.test.mjs` | `865ccab3a1c5d21783eedda0e866633c457388585e6bd36b1df34f236f37693e` |
| `docs/v2/tools/build-dispatch.mjs` | `f6f22ab0063be475eb6532455cd707fe3d7048929b4c911924ce69503736c2e3` |
| `docs/v2/tools/build-dispatch.test.mjs` | `d4dcf3c29b1b77c3b4f325d0a68fe76a5a6efbe4b5b8c6415064f31925df7aec` |
| `docs/v2/evidence/P3.4/attempt-5/implementation/ported-model.test.mjs` | `195e30f5c2285c5572c6a037dfe2a299c99e2dd6fa0735b9883d63ece74c4c60` |
| `docs/v2/evidence/P3.4/attempt-5/implementation/adapters.test.mjs` | `325b2884f31dc1c8f3cf0767d279cfacde1e40b07e09437e904e87b815d9a4c8` |

## The two new patches

| File | What it is | Exact path it touches |
| --- | --- | --- |
| `fixture.patch` | R1 — the committed 80-test synthetic suite made compatible with the new mandatory ownership seam (`windowPid`), D7's two obsolete identity assertions re-derived plus the containment negative, and `'getwindowpid'` inserted into the six `dispatched` arrays. `+15/-8`, one file. | `docs/v2/evidence/P3.4/attempt-5/implementation/ported-model.test.mjs` |
| `tooling-fixture.patch` | R2 — the stale attempt-4 byte-identity fixture: the loop set becomes the three files that actually carry an attempt-4 line, and the "four" comment becomes "three" with the reason recorded. `+7/-2`, one hunk. | `docs/v2/tools/build-dispatch.test.mjs` |

Both apply read-only to the real paths (`git apply --check`, exit 0), and they are
order-independent with respect to `tooling.patch`.

## Evidence

| File | What it shows |
| --- | --- |
| `01-identity-replay.txt` | Shipping hashes at `99baec7`; all four patches `git apply --check` clean; replay hashes; the instrument is **byte-identical** to the candidate-only replay; `git apply --stat` scope; `node --check`; the repository is untouched. |
| `02-r1-committed-80-suite.txt` | baseline 80/80; candidate+tooling **59/80** (the review's regression, re-derived); all four patches **80/80**; 80 test names identical, skipped 0, todo 0; exactly what each of the three edits does. |
| `03-r2-tool-guard.txt` | baseline 25/26; tooling only **28/29**; both patches **29/29**; the guard's behaviour, regex, messages and name all unchanged; attempt-4/5 cases byte-preserved by `tooling.patch`. |
| `04-lint-format.txt` | ESLint exit 0 and Prettier clean on the real-path-equivalent mirror, **with a negative control for each** (a deliberate unused binding and a deliberate space-padded line both fail the run, so the passes are non-vacuous); the two fixture files are `.prettierignore`d and the patch adds no new deviation class. |
| `05-carry-forward.txt` | Byte-identity of the instrument; the 22 synthetic before/after checks **re-run** (22/22); the review's 32 adversarial controls **carried** on the identical hash; attempt 4/5 histories unchanged. |
| `06-scope-authority-budget.txt` | Files written and not written; R1-R4 disposition; the D7 test-name residual, stated; the four exact paths the owner grant must name; V0-V4 once / no attempt 7 / no reset / no retry / no waiver. |

Owner decision: `docs/v2/state/P3.4-EOD-INSTRUMENT-PROPOSAL.md` §5 (Option A,
correct + one final attempt 6; Option B, park). The repair does not answer it and
does not narrow it — it makes the patch the owner would be approving actually
owner-ready.
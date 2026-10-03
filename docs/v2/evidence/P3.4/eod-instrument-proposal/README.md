# P3.4 EOD instrument proposal — evidence index

Preparation only. No source, tool, card, checkpoint, contract, manifest or old
evidence was edited; no runtime ran. The working copies live in the **ignored**
`build/p34-eod-instrument/`; the patches below were checked read-only against
the real paths with `git apply --check` and are copied here for review.

Prepared at `main` `04d071e`. Shipping harness
`scripts/v2/tauri-security.test.mjs` sha256
`865ccab3a1c5d21783eedda0e866633c457388585e6bd36b1df34f236f37693e` (attempt 5).

| File | What it is |
| --- | --- |
| `candidate.patch` | The corrected identity instrument, shipping path `scripts/v2/tauri-security.test.mjs` only (`+63/-13`, six hunks). |
| `tooling.patch` | The keyed attempt-6 exception, `docs/v2/tools/build-dispatch.mjs` and `.test.mjs` only. |
| `before-after.mjs` | The synthetic proof; imports the actual shipped exports from the baseline and candidate copies. |
| `01-identity-and-apply.txt` | Baseline==shipping hashes; candidate hashes; `git apply --check` and `node --check` for both patches. |
| `02-synthetic-before-after.txt` | `node build/p34-eod-instrument/before-after.mjs` — 22/22. |
| `03-tooling-guard.txt` | Candidate tool test 28/29 and baseline 25/26; the one failure is the pre-existing stale attempt-4 byte-for-byte case. |
| `04-lint-format.txt` | `prettier --check` and `eslint --no-ignore` on all candidate files: clean. |
| `05-patch-scope.txt` | `git apply --stat` for both patches; P3.4-owned real paths untouched. |

Owner decision: `docs/v2/state/P3.4-EOD-INSTRUMENT-PROPOSAL.md` §5 (Option A,
correct + one final attempt 6; Option B, park).

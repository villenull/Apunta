# 04 — scope, authority, and what this pass deliberately did not do

## 1. Authority

This pass had **no source-repair authority** and did not seek any. It did not apply
`02-patch.diff`, did not touch `scripts/v2/tauri-security.test.mjs`, did not reset or
reinterpret any attempt counter, and did not run a single acceptance row. The owner
decision in `P3.4-PRE-RUNTIME-CORRECTION.md` §5 is **still open and still exactly one**:
nothing in this pass answers it, softens it, or pre-commits the root to it.

## 2. Exclusive write scope, as granted

| Path | What happened |
| --- | --- |
| `docs/v2/state/P3.4-PRE-RUNTIME-CORRECTION.md` | 4 prose corrections, 140 lines, one decision |
| `docs/v2/evidence/P3.4/attempt-5/correction-proposal/review/probe.mjs` | 10 `console.log` → `util.format` + `stdout.write`; 1 unused binding dropped |
| `docs/v2/evidence/P3.4/attempt-5/correction-proposal/final-preparation/**` | this directory, new |
| `build/p34-correction-final-prep/` | scratch, gitignored (`.gitignore:55`) |

## 3. Explicitly not touched

- **`02-patch.diff`** — historical bytes, not opened for writing. It already contains the
  format wrap the reviewer required; that was the previous pass's work.
- **`review/07-probe-output.txt` and every other `review/*.txt`**, and
  `state/reviews/P3.4-correction.md` — historical. The reviewer's verdict stays
  **CHANGES REQUESTED**; §7 of the state document says so in the owner's face rather than
  quietly resolving it.
- **`scripts/v2/tauri-security.test.mjs`** — `fac8225f…`, identical to `b19e59f`, working
  tree clean (`00-baseline.txt` §2).
- **The proof modules, fixtures, ports and models** — `shipped-proof.mjs`,
  `patched-proof.mjs`, `model.mjs`, the 80 fixtures, the 73 model cases. Copied, hashed,
  run; never written.
- **Assertion text, budgets and thresholds** inside the probe — `BUDGET = 800`,
  `MOVE_MS = 150`, the `+ 200` slack, `TARGET_BUDGET_MS`, the 13-problem expectations. Not
  one was altered, and none was normalised away (`01-probe-fidelity.txt` §4).
- **`docs/v2/COORDINATOR.md`, `DEPENDENCIES.md`, cards, dispatches, checkpoints** — read
  only.

## 4. Constraints honoured

No app, build, server, database, model runtime, audio, input, display, download, install
or network. Port 7717 never contacted; live data folder never opened; no runtime started.
The only child processes were the probe's own two local `node -e` sleepers. Everything ran
on pinned Node v24.19.0. Nothing staged, nothing committed, nothing pushed — including
after another session's commit `8d4fa54` landed mid-pass (`00-baseline.txt`, §5).

## 5. Known items left standing, deliberately

1. **"31 other harness functions"** vs the reviewer's "76 of 79" — a counting-basis
   difference the reviewer itself called immaterial and disclosed. Not recomputed here.
2. **The probe's 26 lines over `printWidth: 110`** — outside prettier's remit for this repo
   (`.prettierignore` excludes `docs/v2/evidence/`) and pre-existing. eslint, which the repo
   *does* enforce on `docs/`, went 1 → 0 (`02-lint-format-syntax.txt`).
3. **The post-landing `waitForFact(…, 30_000)` at `:2194`** — the reviewer's disclosed
   residual, out of scope, unchanged.
4. **O1 (label uniqueness)** — still the retained latent false-FAIL risk, fail-closed,
   deliberately unfixed.

## 6. What the root should do next

1. Read `03-state-document-edits.md`, then the state document itself.
2. Put the **one** §5 decision to the owner. If granted, apply `02-patch.diff` byte for
   byte — no other edit — and let the corrected source re-enter the normal review →
   once-only V0→V4 path. If declined, P3.4 is `BLOCKED`, P3.6 and P3.R wait, P3.5
   continues.
3. Assign a **fresh independent review** over the corrected state document and this
   preparation pass. It has not happened. The existing review does not cover either.
4. Commit with explicit paths (no `git add -A`). Stage `docs/v2/state/P3.4-PRE-RUNTIME-CORRECTION.md`,
   the two `correction-proposal/` trees and the review report; leave `build/` alone.
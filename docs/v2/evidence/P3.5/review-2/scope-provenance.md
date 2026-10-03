# Scope, provenance and preservation — P3.5 attempt 2 (review-2)

Candidate `9e6094b` against baseline `46419f5`. Read-only proof; no capture row,
no build, no installation.

## Scope of the candidate commit `9e6094b`

`git show --stat 9e6094b` — ten paths:

| Path | In the card's grant? |
| --- | --- |
| `scripts/v2/tauri-audio.test.mjs` (+172 −27) | yes, the one feature path this attempt touched |
| `docs/v2/evidence/P3.5/V3-capture-spoken.md` | yes, evidence |
| `docs/v2/state/returns/P3.5.md` | yes, return |
| `docs/v2/state/cards/P3.5.json` | yes, checkpoint bookkeeping |
| `docs/v2/evidence/P3.5/attempt-2/**` (4 files) | yes, this attempt's evidence |
| `docs/v2/state/NEXT-SESSION.md`, `docs/v2/ORCHESTRATION-LOG.md` | state bookkeeping |

`git diff --name-only 46419f5..9e6094b -- 'web/**' 'src-tauri/**' 'server/**'
'shared/**'` → **0 files**. The other three feature paths
(`web/src/main.tsx`, `src-tauri/src/permissions.rs`, `src-tauri/src/main.rs`)
are byte-identical to the attempt-1 candidate review-1 examined, so the P3.4
seam — the text-leaf publication, its poll and its gate — is the seam on stable
main, unchanged. `package.json`, `scripts/v2/sandbox.mjs`,
`docs/v2/ACQUISITION.md`, `docs/v2/CONTRACTS.md` and
`docs/v2/state/OWNER-ACTIONS.md` are likewise untouched. No contract, no
`Expected` cell and no owner action was edited.

## The checkpoint, compared field by field

A structured JSON diff of `docs/v2/state/cards/P3.5.json` at `46419f5` and at
`9e6094b` reports exactly four differences and nothing else:

| Field | 46419f5 | 9e6094b |
| --- | --- | --- |
| `attempt` | 1 | 2 |
| `status` | `BLOCKED` | `BLOCKED` (unchanged) |
| `lastCompletedStep` | attempt-1 text | attempt-2 text |
| `nextAllowedAction` | `owner-installs-gstreamer-plugins-then-coordinator-dispatches-attempt-2` | `independent-code-repair-review-and-environment-owner-decision-before-runtime` |
| `codeRepairWorkerId` | — | added, `null` |

Every criterion, `Expected` cell, side-effect record and `SandboxRuns` anchor is
unchanged, including all five attempt-1 `PREV_DEFAULT` provenance records: they
do not appear in the diff at all. Nothing was deleted, deduplicated or
re-attempted, and V0/V1/V2 evidence files were not touched (only
`V3-capture-spoken.md` changed, and only in the click-count sentence).

One byte-level artefact of the JSON round trip: two em-dashes inside attempt-1
`sideEffectsDone[].resumeInstruction` strings are now stored as `—`
escapes. They decode to the identical characters, so the semantics are
unchanged; recorded so "preserved verbatim" is read as "semantically
preserved", which is what the diff proves.

After the candidate, two later commits by other agents
(`c83657e`, `3bd142f`) touched this card — the semantic comparison against
`HEAD` shows only `codeReviewWorkerId` and `environmentReviewWorkerId` being
filled in. `attempt`, `status` and `nextAllowedAction` are as recorded above.

## The attempt-1 false claim, flagged rather than rewritten

`docs/v2/state/cards/P3.5.json`'s V3 criteria note still reads "All five real
clicks landed". That is attempt-1 history, preserved under a preserve-verbatim
instruction, and the repair report (`:127-130`) and the return's attempt-2
appendix both flag it as superseded by the corrected evidence rather than
quietly editing it. That is the right handling: the false sentence is not
promoted to current truth anywhere, and the corrected truth lives in the two
places this attempt was allowed to write —
`docs/v2/evidence/P3.5/V3-capture-spoken.md` ("**Four** of the five card clicks
landed; the fifth, `record-stop`, did not, because the row failed `the phase
reached recording` (`phases seen: ["record-start+capture-error"]`)") and the
return's V3 row. The row verdicts are untouched: V3 **BLOCKED**, V4 **NOT RUN**,
V5 **FAIL**.

## Repo-wide lint: attributed, not waived

`npx eslint .` → exit 1, **60 errors**. Broken down by rule and file:

| Rule | Count | Where |
| --- | --- | --- |
| `no-console` | 58 | 44 in committed `docs/v2/evidence/P3.4/proposal-ir4/**`, `proposal-ir5/**`, `proposal-ir6/**`, `proposal-v5-repair/**`; **14** in `docs/v2/evidence/P3.5/review-1/*.mjs` (the attempt-1 reviewer's proofs, committed in `eeccd2d`) |
| `@typescript-eslint/no-unused-vars` | 2 | `docs/v2/evidence/P3.4/proposal-v5-repair/ir5-counterexamples.mjs`, `docs/v2/evidence/P3.5/review-1/source-outputs-mapping.mjs` |

The candidate's own changed paths are clean:
`npx eslint scripts/v2/tauri-audio.test.mjs
docs/v2/evidence/P3.5/attempt-2/repair-verify.mjs` → exit 0. The tree at the
candidate therefore still does not satisfy the repo-wide definition of done.
This is **root-level scratch cleanup, outside this card and outside this
review's grant**: it is not waived here, and this review does not repair it.

Note the split published in the attempt-2 report ("60 `no-console` errors …
P3.4 (58) and review-1 (2)") does not match the tree: there are 58 `no-console`
errors, split 44/14, plus the two `no-unused-vars` errors. The attribution
conclusion is unaffected; the numbers are not.

## Root re-run of the candidate's own suite

`docs/v2/evidence/P3.5/attempt-2/repair-verify.mjs` extracts the shipped function
bodies by brace matching and evaluates those — it does not copy a predicate.
Re-run from the repository root with the pinned Node: **30/30 pure checks
passed, exit 0**. `node --check scripts/v2/tauri-audio.test.mjs` → exit 0.

## What this review did not run

No `npm run typecheck` and no `npm test`: the candidate changed one `.mjs`
harness file and no TypeScript, and the three TypeScript/Rust feature paths are
byte-identical to `46419f5`, so the type surface is unchanged. The attempt-2
report's `typecheck` exit 0 is therefore neither contradicted nor relied on.
No row (V0–V5) was re-run, and no environment action was taken: the runtime
verdict is unchanged and separate.
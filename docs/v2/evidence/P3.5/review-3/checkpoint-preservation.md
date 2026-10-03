# Checkpoint and history preservation — review-3

Compared `docs/v2/state/cards/P3.5.json` at baseline `9e6094b` and candidate
`7e16513`.

## The candidate's own checkpoint diff is minimal

`git show 7e16513 -- docs/v2/state/cards/P3.5.json` changes exactly four fields:

| Field | `9e6094b` | `7e16513` |
| --- | --- | --- |
| `attempt` | `2` | `3` |
| `status` | `BLOCKED` | `BLOCKED` (**unchanged**) |
| `lastCompletedStep` | attempt-2 text | attempt-3 text |
| `nextAllowedAction` | `independent-code-repair-review-and-environment-owner-decision-before-runtime` | `independent-final-source-review-and-environment-owner-decision-before-runtime` |
| `updatedUtc` | `2026-10-03T03:30:00.000000+00:00` | `2026-10-03T04:20:41.351440+00:00` |

Two further fields (`codeReviewWorkerId`, `environmentReviewWorkerId`) differ
across `9e6094b..7e16513`, but they were added by `c83657e` (*Track independent
reviews of both bounded repair candidates*), a different commit, not by the
candidate. `git log -S codeReviewWorkerId 9e6094b..HEAD` reports only `c83657e`.

## The history-bearing arrays are byte-identical

Raw substrings extracted from the committed JSON at both refs compare equal at
the byte level:

| Array | `9e6094b` bytes | `7e16513` bytes | Result |
| --- | --- | --- | --- |
| `sideEffectsDone` | 2636 | 2636 | **BYTE-IDENTICAL** |
| `sandboxRuns` | 749 | 749 | **BYTE-IDENTICAL** |
| `criteria` | 749 | 749 | **BYTE-IDENTICAL** |
| `plannedSideEffects` | 2741 | 2741 | **BYTE-IDENTICAL** |

So all **five** attempt-1 `PREV_DEFAULT` provenance records
(`sideEffectsDone[1..5]`, step `V3`, `attempt: 1`, the same
`alsa_input.usb-UGREEN…` `prevDefault`, five distinct `runId`s) and all **five**
matching `sandboxRuns` anchors survive unchanged, field for field and byte for
byte. No criterion, `Expected` cell or anchor value object moved. The two
em-dash `\u2014` escapes review-2's D3-3 recorded are still escapes, unchanged.

## The `IN PROGRESS` timeline is documented, not a new defect

At the candidate, the committed checkpoint is `status: "BLOCKED"` with
`nextAllowedAction: "independent-final-source-review-and-environment-owner-decision-before-runtime"`.
The attempt-3 report and return state the author wrote `attempt: 3`,
`status: "IN PROGRESS"`, `nextAllowedAction: "code-unit-repair-only-runtime-held"`
at authoring time, and the **root superseded `status` to `BLOCKED` before the
commit**, so the `IN PROGRESS` value never existed in the tree. That sequence is
recorded in:

- `docs/v2/evidence/P3.5/attempt-3/repair-report.md:8-15` and `:124-147`;
- `docs/v2/state/returns/P3.5.md`, attempt-3 appendix;
- `docs/v2/evidence/P3.5/attempt-3/COORDINATOR.md:5-8`.

It is a documented historical timeline, not a new defect and not a source
concern. Attempt 3 is the final normal attempt; no attempt 4 is authorised.

## The attempt-1 false click-count sentence

The checkpoint's attempt-1 V3 criteria note still reads "All five real clicks
landed". It is retained verbatim as the historical error it is; the corrected
"four of the five card clicks, `record-stop` never reached" statement lives in
`V3-capture-spoken.md`, the return's V3 row, and the attempt-3 report. The false
sentence is not promoted to current truth anywhere. This review did not edit it.

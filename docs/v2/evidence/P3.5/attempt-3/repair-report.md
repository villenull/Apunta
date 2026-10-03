# P3.5 attempt 3 — bounded code/unit repair (D2-1, D3-1, D3-2, D3-3)

- Dispatch: coordinator, attempt 3 of 3 (**final normal attempt**), **code/unit
  repair only, runtime held**. Predecessor source `9e6094b` ("Repair P3.5 numeric
  stream containment and current rectangles"); coordinator HEAD at the time of
  writing `a6b1059`. The review this answers is
  `docs/v2/state/reviews/P3.5-impl2.md` (D2-1, D3-1, D3-2, D3-3).
- `docs/v2/state/cards/P3.5.json` was set at the start of this session to
  `attempt: 3`, `status: "IN PROGRESS"`,
  `nextAllowedAction: "code-unit-repair-only-runtime-held"`, with minimal text
  edits and no re-serialisation. The root authorised the counter increment and
  does not write this cell itself.
- **The current candidate is `BLOCKED`,** pending an explicit environment grant
  and an independent source review. Attempt 3 stays runtime-open only after
  both. There is no attempt 4.
- **No capture row was run. No V3/V4/V5 row was re-run. No new capture was
  taken.** V3 stays **BLOCKED**, V4 **NOT RUN**, V5 **FAIL**; all five
  attempt-1 `PREV_DEFAULT` records and every anchor are byte-for-byte as they
  were. Nothing was staged or committed.
- No app, server, database, build, LLM, model, audio, microphone, display,
  input, `pactl` mutation, network, acquisition, install, live folder or port
  7717 was used. No plugin was installed, nothing was captured, nothing was
  rerun behind the scenes.

## Changed paths

| Path | Change |
| --- | --- |
| `scripts/v2/tauri-audio.test.mjs` | **D2-1 only, inside `tidsFromNewestMarker`** (`:1034-1064`). Nothing else in the file moved: the stale P3.4 text-leaf reader and the `source-outputs` stream mapping are untouched. |
| `docs/v2/state/cards/P3.5.json` | own bookkeeping only (`attempt`, `status`, `lastCompletedStep`, `nextAllowedAction`, `updatedUtc`). No criterion, side effect, run anchor or provenance record touched. |
| `docs/v2/evidence/P3.5/attempt-2/repair-report.md` | appended factual notes for D3-1, D3-2, D3-3. No earlier line, log or claim rewritten. |
| `docs/v2/state/returns/P3.5.md` | the two D3 corrections where that text is repeated, plus this attempt's appendix. |
| `docs/v2/evidence/P3.5/attempt-3/**` | this report, the pure test script and its outputs, the before/after regression witnesses. |

Not touched: `web/src/main.tsx`, `src-tauri/src/permissions.rs`,
`src-tauri/src/main.rs` (the other three feature paths), any card text or
`Expected` cell, any contract, manifest, `OWNER-ACTIONS.md`,
`ACQUISITION.md`, `package.json`, any config, the P3.4 proposal or review
paths, and every prior evidence directory.

## D2-1 — presence and non-emptiness are now required before `Number`

The defect, as review-2 recorded it: `newest.get(...)` returns `null` for an
absent field, and `Number(null) === 0` is finite, so a newest marker carrying
`_y`, `_w`, `_h` but not `_x` installed a rectangle at `x = 0`; an empty
coordinate value (`tid_…_x=`) did the same. The function's own doc comment and
attempt 2's report both asserted an invariant the code did not hold.

The fix, in `tidsFromNewestMarker` only:

```js
  for (const field of fields) {
    const raw = newest.get(`tid_${testId}_${field}`);
    if (typeof raw !== 'string' || raw.trim() === '') {
      present = false;
      break;
    }
    rect[field] = Number(raw.trim());
  }
  if (!present) continue;
```

Each of `x`, `y`, `w`, `h` must be **present and non-empty after trimming**
before it is read as a number, so `null`, `undefined`, `''` and whitespace all
fail closed instead of becoming `0`. Everything else is unchanged: the whole
newest snapshot and never an older fallback, no field union with history, the
finiteness check and the positive-width/height check exactly as before, and the
same `{ x, y, w, h }` shape installed (now built from a local object, so the
installed rectangle carries no extra keys). A genuine numeric `0` for `x` or `y`
is still a valid coordinate and still installs; negative coordinates still
install here, because rejecting an off-screen rectangle is
`rectInsideWindow`'s/`rectOf`'s job later in the file, not this reader's, and
the change does not widen or narrow that boundary. The field-name list lives
inside the function, so any extractor that evaluates the body alone — review-2's
`extract.mjs`, this attempt's script — still gets a self-contained body.

### Before and after, same fixtures

**Regression witness, the reviewer's own 22 probes, unchanged on disk.**
`docs/v2/evidence/P3.5/review-2/d2-current-rectangles.mjs` was **not edited**.
Two of its probes assert that the bug exists, so they are expected to flip:

| | command | exit | result |
| --- | --- | --- | --- |
| before | pinned `node docs/v2/evidence/P3.5/review-2/d2-current-rectangles.mjs` | 0 | **22/22** — `review2-probes-BEFORE.txt`, including `PASS D2 ADVERSARIAL: a newest marker missing only _x installs a rectangle at x=0 (Number(null)===0)` |
| after | same command, same fixtures, current source | 1 | **20/22** — `review2-probes-AFTER.txt`: exactly those two ADVERSARIAL probes now fail because the rectangle at the origin is no longer installed |

Nothing else moved in that run; the third `FAIL` line in both outputs is the
harness's own deliberate timeout row (`wait for the record-start rectangle:
nothing published one within 600ms`), which the shipped `fail()` prints and the
probe script counts as a pass. The old proofs stay as they are — they are the
record of the defect, not something to rewrite into agreement with the fix.

**This attempt's own suite**, which keeps attempt 2's 30 checks verbatim (D1
mapping plus the whole D2 block) and adds 37:

| | source under test | exit | result |
| --- | --- | --- | --- |
| before | `git show 9e6094b:scripts/v2/tauri-audio.test.mjs`, run from a throwaway tree under `build/p3.5-repair3/prefix-check/` | 1 | **58/67** — `prefix-check-output.txt`, 9 failures, all of them the `_x`/`_y` shapes |
| after | the working-tree harness | 0 | **67/67** — `repair-verify-output.txt` |

The nine pre-fix failures are exactly the missing-`x`/missing-`y`,
empty-`x`/empty-`y`, whitespace-`x`/whitespace-`y`, null-`x`/null-`y` and
no-fallback cases, each showing the origin rectangle it wrongly installed. The
missing-`w`/`h` and non-positive-dimension cases already passed before the fix,
because the positivity check caught them — consistent with review-2's analysis
that the shape is unreachable from the shipped emitter's field order. That
agreement is why the finding was rated minor and latent, and it is also why
leaving it would have meant the documented invariant was enforced only by
`web/`'s emission order, which this harness neither asserts nor may assume.

New cases, all extracting the shipped body rather than reimplementing it:
each of `x`, `y`, `w`, `h` missing entirely; each empty; each whitespace-only;
each `null` and each `undefined` (as a plain `Map` fixture, since
`URLSearchParams` cannot produce those values — the helper only calls `.keys()`
and `.get()`); a padded-but-non-empty value still installing, trimmed; healthy
`x = 0, y = 0` installing; negative coordinates installing unchanged; `NaN` and
`Infinity` in each of the four fields installing nothing; zero, negative width
and zero, negative height installing nothing; a newest marker missing only `_x`
still installing nothing and **not** falling back to the older complete
snapshot; and one incomplete id not suppressing a complete sibling id in the
same snapshot.

## D3-1 — the timeline, as it actually happened

The attempt-2 report (`docs/v2/evidence/P3.5/attempt-2/repair-report.md:6-7`) and
the attempt-2 appendix of this return both say the checkpoint "is now
`attempt: 2`, `status: \"IN PROGRESS\"`,
`nextAllowedAction: \"code-unit-repair-only-runtime-held\"`".

The truth is a sequence, not a mistake in either document's arithmetic:

1. The attempt-2 author wrote `IN PROGRESS` into the card **at authoring time**,
   which is the state the work was actually in while it was being written.
2. The **root changed `status` to `BLOCKED` before the candidate was committed**,
   so the committed state at `9e6094b` is `BLOCKED` with
   `nextAllowedAction:
   "independent-code-repair-review-and-environment-owner-decision-before-runtime"`.
3. The two documents were written against the authoring-time cell and were never
   re-read after the root's change, so the quoted state never existed in the
   tree.

The substance of what they claim — attempt 2, runtime held, attempt-1 provenance
intact — was and is correct. Only the quoted cell values were stale. No fault is
invented for anyone, and the fact that `IN PROGRESS` *was* written is not
erased. Both places now name the committed state as the current one and mark the
`IN PROGRESS` line as the authoring-time state that the root superseded.

## D3-2 — the repo-wide lint counts, qualified by commit

Attempt 2's report and return said "60 `no-console` errors … committed P3.4
scratch (58) and … `review-1/*.mjs` proofs (2)". Measured at the reviewed commit
`9e6094b` (`npx eslint . -f json`, exit 1, 60 errors) the split is:

- **58 `no-console`** — **44** under `docs/v2/evidence/P3.4/**` and **14** under
  `docs/v2/evidence/P3.5/review-1/`;
- **2 `@typescript-eslint/no-unused-vars`**, one in each of those trees;
- **60 errors in total**, every one of them in a file the candidate did not
  change.

The conclusion attempt 2 drew is right and still stands: none of the 60 is in a
file that candidate touched, and scoped lint on the files it did change is clean.
The numbers above are a **historical measurement of commit `9e6094b`** and are
labelled as such. This session did **not** re-run `npx eslint .`: another agent
is concurrently rewriting the P3.4 evidence output (`output-lint`), so a run now
would describe a different tree and attaching its result to the attempt-2
snapshot would be a misattribution. This remains **root repair, attributed, not
waived** — the repo-wide definition of done is not green on this card's own
account and is not this card's grant to fix.

## D3-3 — the card JSON is semantically preserved, not byte-verbatim

The card was re-serialised as a whole at some point after attempt 1. Two
em-dashes inside attempt-1 `sideEffectsDone[].resumeInstruction` strings are now
stored as `—` escapes. They decode identically, and the structured diff of the
card shows no other difference anywhere: no criterion, `Expected` cell, side
effect, `SandboxRuns` entry or anchor value object moved, and all five attempt-1
`PREV_DEFAULT` records are unchanged. So "preserved verbatim" in the attempt-2
text is true **semantically**, not byte-wise, and is now read that way. History
was **not** quietly restored or re-encoded: the escapes stay as they are, and the
only correction is to the word that overstated the fidelity.

Related, and still open: the card's attempt-1 V3 criteria note still reads "All
five real clicks landed", which is wrong — four of the five card clicks landed
(`home-action-note`, `home-search`, the result option, `record-start`), the
onboarding `Continue` is a separate app click, and `record-stop` was never
reached because the row failed `the phase reached recording`. That attempt-1
note is retained **as the historical error it is**, under the preserve-verbatim
instruction, with the corrected four-clicks-plus-onboarding statement carried in
the new note. The V3 evidence file and the return's V3 row already state it
correctly. The historical report was not rewritten to pretend the note passed.

## D4 — unchanged, one honest stream sample

The containment read remains a single `source-outputs`/`sources` sample taken
while the recording is live and before the no-real-microphone assertion, which is
what the card licenses ("narrows the window; it does not close it"). No
continuous guarantee was invented and no acceptance was relaxed. This repair
touches only the rectangle reader, which is downstream of that sample.

## Commands run (exact) and exits

| Command | Exit | Purpose |
| --- | --- | --- |
| `~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node --check scripts/v2/tauri-audio.test.mjs` | 0 | pinned-Node syntax |
| `~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node docs/v2/evidence/P3.5/review-2/d2-current-rectangles.mjs` (before the edit) | 0 | 22/22 — the defect present, recorded in `review2-probes-BEFORE.txt` |
| `~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node build/p3.5-repair3/prefix-check/repair-verify.mjs` | 1 | 58/67 against `git show 9e6094b:scripts/v2/tauri-audio.test.mjs`, the 9 D2-1 shapes |
| `~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node build/p3.5-repair3/repair-verify.mjs` | 0 | 67/67 pure checks against the current source |
| `~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node docs/v2/evidence/P3.5/review-2/d2-current-rectangles.mjs` (after the edit) | 1 | 20/22, only the two bug-asserting probes fail — the regression witness |
| `npx eslint scripts/v2/tauri-audio.test.mjs docs/v2/evidence/P3.5/attempt-3/repair-verify.mjs` | 0 | source-scope lint clean |
| `npx prettier --check scripts/v2/tauri-audio.test.mjs docs/v2/state/cards/P3.5.json docs/v2/evidence/P3.5/attempt-3/repair-verify.mjs` | 0 | formatting clean |
| `npm run typecheck` | 0 | all workspaces |
| `npx eslint .` | **not run** | deliberately, for the reason in D3-2 |

The prefix check runs the durable script from a throwaway tree
`build/p3.5-repair3/prefix-check/`, whose `scripts/v2/tauri-audio.test.mjs` is
`git show 9e6094b:` — the script finds the repository root by walking up to the
directory that holds `scripts/v2/tauri-audio.test.mjs`, so this needs no edit to
the repository and no change to the working tree. `build/` is git-ignored.

No app, server, database, build, model, audio, microphone, display, input,
`pactl` mutation, network, acquisition, install or port 7717 was used. The pure
test reads one repository file and imports nothing from the harness at runtime.

## Status

**SOURCE: SUBMITTED** (D2-1 fixed and witnessed before/after; D3-1, D3-2, D3-3
corrected in the text where they are asserted).
**RUNTIME: BLOCKED** — V3 BLOCKED, V4 NOT RUN, V5 FAIL, unchanged and separate;
attempt 3 stays open for its held rows only after an explicit environment grant
and an independent source review. Nothing was staged or committed, and no
approval is claimed or implied by this report.

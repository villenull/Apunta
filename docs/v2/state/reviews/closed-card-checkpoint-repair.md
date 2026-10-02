# Closed-card checkpoint repair

**Date:** 2026-10-02, at `c17bc8a`. **Scope:** `docs/v2/state/cards/*.json` for cards that are
`APPROVED` in `state/PROGRESS.json`, repairing stale metadata left on **finished** cards by the
first-ever sweep (`reviews/checkpoint-anchor-audit.md`).
**Nature:** state-metadata only. No card, dispatch, review, return, amendment, plan or source
file was touched; no build, test, eval, e2e, cargo, tauri or launch command was run; no git write
command was issued. **Nothing was committed.** This file is the only new file.

## What was examined, and what was changed

**45 checkpoints read** (every file in `state/cards/`), **39 eligible** (`APPROVED` in
`PROGRESS.json`), of which **20 were changed** across 41 edits. Every claim below was re-verified
before any value was written; the audit was treated as a list of hypotheses, not facts.

Anchor method, unchanged from the audit's: `git diff <baseCommit> HEAD -- docs/v2/cards/<id>.md`
must be empty. Where it was not, the newest commit on that card's own history for which the diff
**is** empty was read from `git log` and written down. No hash was typed from memory.

### Anchors re-pointed (12 cards, all 12 now diff clean)

| Card | Old | New | Why the old was stale |
|---|---|---|---|
| C0.1 | `4b78267` (full sha) | `69f8cda` | +60 lines of card text after the anchor |
| P0.2 | `8be98cb` | `e8dbf44` | +9 (the AM-022 amendment that added P0.5) |
| P0.4 | `f790709` | `99437f6` | +2/−2 |
| P1.1 | `2465353` | `285283c` | +99/−17 |
| P1.3 | `2465353` | `9bb587b` | +111/−16 |
| P1.4 | `2465353` | `00d5941` | +227/−19 |
| P1.5 | `2465353` | `6b27ddd` | +113/−17 |
| P2.1 | `6110813` | `ce24912` | +21 |
| P7a.1 | `46216fe` | `3855a73` | +15/−5 |
| P3.1 | `3610cda` | `7ee692e` | +8/−1 |
| S2.1 | `34ef391` | `8b5479c` | +8/−4 |
| S2.6 | `8cb3ecf` | `f48cbdb` | +127/−22 |

The P1.1/P1.3/P1.4/P1.5 cluster is confirmed as the audit described: four cards, one shared
anchor, 419 commits of history behind it, and four *different* amendment commits piled on top.
They now point at four different commits, one each, which is what the evidence supports.

**P3.1 is the one with a live consequence.** Its `nextAllowedAction` and its carried finding 1
both tell the reader to open `scripts/v2/package-linux-resources.test.sh:429-448`, and at
`3610cda` that path does not exist (`git show 3610cda:scripts/v2/package-linux-resources.test.sh`
is fatal). A session resuming at the anchor could not open the evidence for its own open finding.
`7ee692e` has the file.

### `attempt` counters (4 raised, 1 added)

Raised only where a dispatch header names a higher attempt than the field, which also made each
file contradict its own `lastCompletedStep` string:

- **P1.4** `1 → 2` — `dispatch/P1.4.md` and `P1.4-review.md` both head "Attempt 2 of 3"; step
  reads "attempt-2 review all PASS".
- **S2.2** `1 → 2` — `dispatch/S2.2.md`, `S2.2-review.md`: "attempt 2 of 3"; step agrees.
- **S2.4** `1 → 2` — `dispatch/S2.4.md`, `S2.4-review.md`: "attempt 2 of 3"; step agrees.
- **P4.2** `1 → 2` — `dispatch/P4.2-review.md` heads "attempt 2 of 3"; step agrees.
- **S2.R** *(absent) `→ 1`* — its only dispatch, `dispatch/S2.R-review.md`, heads "attempt 1 of 3".
  The field being `undefined` made any budget arithmetic on it undefined.

Not raised, deliberately: **P0.R** carries `attempt: 2` while `dispatch/P0.R-review.md` heads
"attempt 1 of 3". The field leads its dispatch rather than trailing it, and a parent-row counter
that is one high is not the hazard a counter one low is. Reported, not changed — the audit does not
name it and the brief scopes this repair to values that are too low.

### Shape

- `changedFiles` is now an array in every file it previously was an integer in, except where the
  paths are not recoverable (below).
  - **P3.1** `2 → ["scripts/v2/package-linux-resources.sh", "scripts/v2/package-linux-resources.test.sh"]`
    — `git show --stat c4a364f` touches five paths, of which exactly two are source; the other
    three are this card's own return and evidence. The card's May-edit list names the same two.
  - **S2.5** `44 → [44 paths]` — `f33776c` ("Render every server sentence from a catalogue key
    (card S2.5)") touches exactly 44 files, which is the recorded count, so the list is that
    commit's paths verbatim.
  - **P4.1** `4 → []` and **S2.6** `3 → []`. **Not recoverable, so nothing was invented.** P4.1's
    implementation is not one commit and its May-edit list names eleven paths, not four; S2.6's
    return names exactly *two* source paths for attempt 3, which contradicts the stored `3`, so
    the stored `3` means something the record does not say. Both are now correctly typed arrays
    with empty contents, which is honest; the counts they replace are in this report and in the
    commit that carries it.
- `updatedUtc` is a full ISO-8601 UTC instant everywhere it was a bare date. No time was invented:
  each value is the commit timestamp of the commit that last wrote that checkpoint
  (`b54fe25` → `2026-09-29T18:42:22Z` for P3.1; `d0e4767` → `2026-09-28T22:06:06Z` for P4.1;
  `d2866f7` → `2026-09-28T00:02:47Z` for P5.2; `9ada83d` → `2026-10-02T19:16:21Z` for S2.6).
  These files keep their original `updatedUtc`; only the four malformed ones changed, and the rest
  of the repaired fields were not re-stamped, so the timestamps still say what they said.

### Factually wrong prose

- **C0.1** — `sideEffectsDone` claimed, in the present tense, that branch `feature/v2` was created
  and pushed. `git branch -a` shows only `main` and `origin/main`; AM-068 retired the branch on
  2026-09-29. Rewritten to past tense with the retirement named. `lastCompletedStep` already read
  "feature/v2 **created**" and needed no change.
- **P0.2** — `sideEffectsDone` held three commit hashes. A presence check on that field cannot
  distinguish "did this card touch the host" from "did this card write a commit", which is the only
  question the field exists to answer. Rewritten to what the record shows (no host side effect;
  evidence under `docs/v2/evidence/P0.2/`), with the three hashes retained and explicitly labelled
  as commits that are *not* side effects.
- **P0.4** and **S3.1** — the same defect, which the audit did not catch. Both held a commit
  hash alone (`"committed b4514c0 (coordinator)"`, `"committed as d6506ff"`). Both rewritten the
  same way. Recorded here because it extends the audit's F-1 from one card to three.
- **S2.5** — `nextAllowedAction` still described S2.6 as "dispatchable but HELD because the
  owner-run UI agent is live in web/". S2.6 ran to attempt 3 and is `APPROVED`. The field already
  began with `done`, so status and action agreed and nothing was gated on it, but the sentence
  described a hold that no longer exists. Replaced, with the stale claim named rather than
  silently dropped.

Every file still parses as JSON, and every edited file now carries all thirteen keys of
`docs/v2/templates/CHECKPOINT.json`.

## Deliberately left alone

**Checkpoints of live or recently-touched work — not touched at all.** P3.4 (`BLOCKED`, on the
build lease), P3.5, P3.6, P3.8 (`NOT STARTED`), S3.2 (`IN PROGRESS`, holds the build lease), P5.3
and S6.1 (`BLOCKED`). Their checkpoints carry live findings the audit reports — S3.2's `flags`
and `notes`, P3.5's null `updatedUtc`, P5.3's and S6.1's missing `contracts`, P3.4's unregistered
keys — and none of it was corrected here.

**P3.3 — skipped as in-flight.** Its checkpoint was written in `07dce9c` today and its
`nextAllowedAction` reads "Final supplemental evidence and approval state **being recorded**",
which is mid-record prose from the coordinator. Its anchor (`2235fee`) already diffs clean, so
nothing there was at risk from waiting.

**P0.1 and S2.6 were edited** despite both having been touched today, in `9ada83d` (AM-135).
Judgement: that commit is closed, both files are clean in the working tree, and no worker holds
them. AM-135 had already fixed P0.1's `nextAllowedAction` and S2.6's `attempt`; what remained —
S2.6's anchor, its `changedFiles` type and its `updatedUtc` — was exactly what a fresh session
would misread.

**P4.1** — `nextAllowedAction` opens with "Coordinator ruling still open on RUN-CONFIG section 4"
rather than `done`. Left as found. It is not asking for a review that returned: it names a
coordinator decision, states the carried findings, and says in the same breath that P4.1 has no
fifth attempt and any further change is a new card. That is the status telling the truth about
itself. Rewriting it would erase a genuinely open item.

**P5.2** — `nextAllowedAction` is "Proceed to next dependency-ready card; retain nonblocking
findings in review". Not `done`, but it is a pointer to the queue, not a request about P5.2.

**Keys no sibling explains, left in place rather than deleted.** `notes` on P3.1 and S2.6 (no
template key, but `notes` has precedent on P3.4 and P3.5 and carries load-bearing detail).

**Template keys still absent on four parent rows — reported, not added.** `P0.R`, `P1.R`, `P2.R`
and `S2.R` lack `contracts`, `sideEffectsDone`, `changedFiles` and `sandboxRuns`. All four are
`.R` parent rows with no `docs/v2/cards/<id>.md`, whose records are all parent reviews. S2.R's
`attempt` was added because the brief named it and because budget arithmetic on `undefined` is
undefined; the other three keys were left absent rather than filled with invented empty arrays,
which would assert "this card did nothing" where the honest statement is "this card does not use
this key".

**Anchors on cards with no card file — left alone, as the brief directs.** `P0.R`, `P1.R`,
`P2.R`, `S1.R`, `S2.R` have no `docs/v2/cards/<id>.md`, so the diff check is vacuous for them and
there is nothing to re-point against.

## Contradicting the audit

- **P3.3's `attempt: 2` is not the counter-without-evidence the audit called it (finding B-2).**
  The audit said no attempt-2 dispatch exists. `dispatch/P3.3-review.md` heads "attempt 2 of 3",
  and the checkpoint's own `lastCompletedStep` names attempt 2 and its `implementationCommit` is
  `d35c4b6`. The counter agrees with the newest dispatch and with the step text. **No change** —
  and none would have been correct.
- **P0.R's `attempt: 2` runs ahead of its dispatch ("attempt 1 of 3"), which the audit does not
  mention at all.** The audit's M-4 rule is one-directional and would not catch it.
- **The P0.2 `sideEffectsDone` defect is three cards wide, not one.** The audit found P0.2 alone;
  P0.4 and S3.1 hold nothing but a commit hash in the same field.

## Not correctable from the record

- **P4.1's and S2.6's `changedFiles` counts.** The numbers exist; the paths they counted do not,
  anywhere in the repository. Both are now empty arrays rather than guesses.
- **P0.R's attempt arithmetic.** Whether the parent row really ran a second attempt or the
  counter drifted is not recorded. Reported for the coordinator.

## The two rules

1. **An anchor must be read *after* the commit carrying the edits it points at.**
   `git rev-parse --short HEAD` run *before* committing describes the previous commit by
   construction. That one ordering mistake is the whole of AM-133, and it has now happened in
   S3.2 twice, P3.5 once, and in twelve closed anchors across this repository — every one of them
   a checkpoint that names a commit which does not contain the text the checkpoint describes. The
   check that catches it is one command, and it must be run against the commit you just made:
   `git diff <baseCommit> HEAD -- docs/v2/cards/<id>.md` must print nothing.

2. **A closed card's checkpoint must be re-pointed whenever an amendment lands after approval.**
   Approval is not the end of the card's text; AM-022, AM-024, AM-034, D15 and a dozen others
   amended cards that were already `APPROVED`. A checkpoint re-pointed at the moment of approval
   silently expires on the first post-approval amendment, and nothing fails when it does — the
   file still parses, the hash still resolves, and the card is only wrong. Twelve cards had
   drifted that way, four of them by more than a hundred lines. The amendment and the re-anchor
   belong in the same commit, and a re-opened card must be re-anchored before it is read.

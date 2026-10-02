# Checkpoint anchor audit

**Date:** 2026-10-02. **Scope:** all 45 files in `docs/v2/state/cards/`, against
`docs/v2/templates/CHECKPOINT.json`, the committed card texts, `state/PROGRESS.json`,
`state/dispatch/`, `state/returns/` and `docs/v2/evidence/`.
**Nature:** read-only. Nothing was edited, no build/test/e2e/sandbox command was run, and no
git write command (`add`/`commit`/`push`/`checkout --`/`reset`/`stash`) was issued. This file is
the only output.

## Method, and one disclosure about it

Every file listed as owned by a live worker — `web/src/main.tsx`,
`server/src/http/csp*.ts`, `scripts/v2/tauri-security.test.mjs`, `docs/v2/evidence/P3.4/`,
`docs/v2/cards/S3.2.md`, `docs/v2/cards/P3.5.md` — was read with `git show HEAD:<path>` rather
than from the working tree. A P3.4 implementer holds the build lease and other workers have
S3.2.md and P3.5.md half-written; reading the working tree would have let this audit describe a
file mid-edit as though it were the checkpoint's subject. Everything below therefore describes
**committed** state. Two consequences worth stating plainly:

- The working tree already carries `M web/src/main.tsx`, an untracked
  `docs/v2/evidence/P3.4/acquisition-A06.md` and an untracked
  `docs/v2/state/reviews/S3.2-ir6.md`. This audit sees none of them, and says nothing about them.
- **`main` is at `8ebe965`, not `24e726c` as the brief stated.** `24e726c` is `HEAD~1`, and it is
  S3.2's own `baseCommit`. The brief's own anchor is a day late and was the wrong value until the
  most recent commit; see finding A-0.

Anchors were checked with `git cat-file -e <base>^{commit}` for existence and
`git diff <base>..HEAD -- docs/v2/cards/<id>.md` for staleness — the exact check that caught
AM-112, AM-123, AM-126 and AM-133.

## Aggregate

| | |
|---|---|
| Checkpoints examined | 45 |
| Clean (`OK`) | 27 |
| Findings | 18 |
| Of those, on **live** (resumable) cards | 4 — P3.4, P3.5, S3.2, S6.1/P5.3 class |
| Live cards whose **anchor is valid** | 5 of 5 — the four incidents of today are all closed |

The headline: **no live card has a stale anchor.** P3.4 (`7e69838`), P3.5 (`935911e`),
S3.2 (`24e726c`), P5.3 and S6.1 (`53f224e`) all diff clean against their card text. The defect
class that has burned this project four times today is, as of `8ebe965`, not currently live. The
damage is in three other places: closed cards whose anchors were never re-pointed after
post-approval amendments, attempt counters that disagree with their own dispatches, and
`PROGRESS.json`, which contradicts the one card that is running right now.

## Verdict per checkpoint

`—` after the id means the card has no `docs/v2/cards/<id>.md` (all five are `.R` parent rows,
which have no card file; the diff check is vacuous for them and they are judged on shape only).

| Card | Verdict |
|---|---|
| C0.1 | finding A-5 (anchor 466 commits behind card text; `sideEffectsDone` claims a branch that no longer exists) |
| P0.1 | finding C-1 (`APPROVED` but asking for an instruction-review return) |
| P0.2 | finding A-6 (anchor behind; `sideEffectsDone` holds commits, not side effects) |
| P0.3 | OK |
| P0.4 | finding A-7 (anchor behind by 1 commit, 2 lines) |
| P0.5 | OK |
| P0.R — | finding E-1 (3 template keys absent) |
| P1.1 | finding A-8 (anchor behind by 2 commits, 99 lines) |
| P1.2 | OK |
| P1.3 | finding A-9 (anchor behind by 3 commits, 111 lines) |
| P1.4 | findings A-10 + B-1 (anchor behind by 2 commits, 227 lines; `attempt` 1 vs dispatch 2) |
| P1.5 | finding A-11 (anchor behind by 2 commits, 113 lines) |
| P1.R — | finding E-2 |
| P2.1 | finding A-12 (anchor behind by 1 commit, 21 lines) |
| P2.2 | OK |
| P2.R — | finding E-2 |
| P3.1 | findings A-13 + E-3 + F-1 (**anchor points at a tree with no `package-linux-resources.test.sh` at all**; `changedFiles` is an int; bare-date `updatedUtc`) |
| P3.2 | OK |
| P3.3 | finding B-2 (`attempt` 2 with no attempt-2 implementation dispatch) |
| P3.4 | findings D-1, C-2, D-2 — **live card, anchor valid** |
| P3.5 | finding E-4 (`updatedUtc` null on a fully-populated checkpoint); anchor valid |
| P4.1 | findings E-3, E-5 (int `changedFiles`; bare-date `updatedUtc`) |
| P4.2 | finding B-3 (`attempt` 1 vs attempt-2 review dispatch) |
| P5.1 | OK |
| P5.2 | finding E-5 (bare-date `updatedUtc`) |
| P5.3 | finding E-6 (`contracts` key absent) |
| P7a.1 | finding A-14 (anchor behind by 1 commit, 15 lines) |
| S1.1 | OK |
| S1.2 | OK |
| S1.3 | OK |
| S1.4 | OK |
| S1.5 | OK |
| S1.R — | OK |
| S2.11 | OK |
| S2.1 | finding A-15 (anchor behind by 1 commit, 8 lines) |
| S2.2 | finding B-4 (`attempt` 1 vs dispatch 2) |
| S2.3 | OK |
| S2.4 | finding B-5 (`attempt` 1 vs dispatch 2) |
| S2.5 | finding E-3 (int `changedFiles`) |
| S2.6 | findings B-6 + A-16 + E-3 — **`attempt` 2 while its own step text and V1 say attempt 3** |
| S2.R — | finding E-7 (5 template keys absent, including `attempt`) |
| S3.1 | OK |
| S3.2 | findings C-3, F-2 — **live card, anchor valid at `HEAD~1`** |
| S4a.1 | OK |
| S6.1 | finding E-6 (`contracts` key absent) |

## Findings, most severe first

### A-0 — S3.2's anchor was wrong one commit ago, and the brief quotes the wrong commit

Not a defect in the current tree — `8ebe965` is titled "Point S3.2's anchor at the commit that
actually carries its edits" and it is now correct — but it belongs at the top because it is the
fifth instance of one mechanism, and because this audit's own brief was handed the pre-fix value.
Sequence, from `AM-133`: AM-132's card edits landed in `3ece713`; the coordinator then wrote
`688054e` (HEAD *before* that commit) — AM-133's "one behind by construction"; `24e726c` set it
to `688054e`; `8ebe965` set it to `24e726c`, which does contain `3ece713` and touches no card
text. **S3.2 is sound now.** The finding is that the brief for this audit was written against
`24e726c` as the branch tip, one commit stale — the same error, propagating into the next
document without a card to catch it.

### D-1 — P3.4: `PROGRESS.json` says `NOT STARTED`; the checkpoint says `IN PROGRESS`, attempt 3

`state/PROGRESS.json` lists `P3.4: "NOT STARTED"`. `state/cards/P3.4.json` says
`status: "IN PROGRESS"`, `attempt: 3`, and `state/dispatch/P3.4.md` is a live
"attempt 3 of 3, base 7e69838, port 7835" dispatch that AM-131 records as the last attempt in
the card's budget. A P3.4 implementer is running right now against a leased build.

**What a resumed session would wrongly do:** read `PROGRESS.json` as the plan of record, conclude
P3.4 never started, and either dispatch an attempt 1 or re-acquire A06 — the whisper.cpp clone
that attempt 2 already found gone from `/tmp` and refused three remedies for, precisely because
fetching it is HS-3 and not an implementer's to do. That is a duplicate, unauthorised acquisition
triggered by a stale status line.

### D-2 — 41 cards in `PROGRESS.json` have no checkpoint file at all

`PROGRESS.json` enumerates 86 cards; `state/cards/` holds 45. Nine of the 41 gaps are cards that
were dispatched, returned and **approved**: `P3.7`, `P4.5`, `S2.7`, `S2.8`, `S2.9`, `S2.10`
(each has `<id>.md`, `<id>-ir.md`, `<id>-review.md` in `dispatch/`, a return in `returns/`, a
review in `reviews/` and an evidence directory), plus `S4a.2` which has an instruction-review
dispatch. **A resumed session for any of these has no anchor, no attempt counter and no
`nextAllowedAction` at all** — the contract this audit exists to protect simply does not exist for
them. They are approved, so nothing breaks today; the cost lands on the first one that is
reopened.

### B-6 — S2.6: `attempt` is 2 while its own `lastCompletedStep` and its V1 row say attempt 3

`state/dispatch/S2.6.md` is "attempt 3 of 3". The checkpoint records `attempt: 2`, yet
`lastCompletedStep` opens "Attempt 3 implemented AND independently reviewed" and `criteria.V1`
reads "PASS (attempt 3, exit 0…)". This is AM-133's shape in a different field: the counter is
not the value the rest of the file was written against. **What a resumed session would wrongly
do:** read `attempt: 2` of 3, believe it has a spare attempt, and re-run an attempt whose work
and review already exist — or, having exhausted a budget it thinks it has not, stop early and
report a false BLOCKED.

### B-1, B-3, B-4, B-5 — four more counters one behind their own dispatches

`P1.4` (`attempt: 1`, dispatch "attempt 2 of 3", step "attempt-2 review all PASS");
`S2.2` (1 vs 2, step "attempt-2 review all PASS"); `S2.4` (1 vs 2, step "attempt-2 review all
PASS"); `P4.2` (1 vs an attempt-2 *review* dispatch, step "attempt-2 review all PASS"). Same
mechanism as B-6, and the tell is identical: **the `lastCompletedStep` string names a higher
attempt than the `attempt` field**, so the file contradicts itself and a reader has to pick a
winner. `P3.3` is the mirror image — `attempt: 2` with a "Attempt2 source d35c4b6" step, but
`dispatch/P3.3.md` is attempt 1 and no attempt-2 implementation dispatch exists, so the counter
leads its evidence.

### C-3 — S3.2: the gate that blocks implementation was cleared after the checkpoint was written

`flags[STATUS]` still reads "not dispatchable for implementation until ONE further independent
instruction review clears **round 5's D-15 and D-16**". Round 6 returned (AM-132, `S3.2-ir6.md`
in `reviews/`) and cleared them, and the same row still asserts "No implementation attempt has
run: attempt stays 1". The step text above it *does* record AM-132. So the checkpoint says both
"round 5 is still the gate" and "round 6 has been applied". **What a resumed session would wrongly
do:** treat S3.2 as blocked on a review that has already happened and re-run round 7, or —
reading only `flags` — dispatch an implementation whose stated precondition is unmet. Either way
it re-decides something the checkpoint should have decided.

### F-2 — S3.2: `notes` claims eight V4 reports on disk; there is no `docs/v2/evidence/S3.2/`

`notes` says "the eight V4 reports on disk are the only record of V4's progress", and `flags`
says the directory "does not exist at the base commit" — implying it exists now. It does not:
`docs/v2/evidence/` has no `S3.2` directory at any commit in this branch's history, tracked or
untracked. Meanwhile `flags[EVIDENCE]` also says no implementation attempt has run and
`sideEffectsDone` is empty. **What a resumed session would wrongly do:** treat eight V4 reports as
an existing record and pool them into a fresh attempt's evidence — against the card's own FD10
rule that a corpus's four samples must come from one attempt directory — or spend an attempt
re-deriving work it believes is already banked.

### A-13 — P3.1: the anchor predates a file its own `nextAllowedAction` instructs the reader to open

`baseCommit: 3610cda`. `nextAllowedAction` and `sideEffectsDone[2]` both cite
`scripts/v2/package-linux-resources.test.sh:429-448` and `server/src/app.ts:155-164`.
**At `3610cda` the first path does not exist** — `git show 3610cda:scripts/v2/package-linux-resources.test.sh`
is `fatal: path ... exists on disk, but not in '3610cda'`. It arrives in the 2 commits after the
anchor. So P3.1 is the AM-112 case exactly: a session resuming at the anchor cannot open the
evidence for its own open finding. Harmless only because the card is APPROVED and
`nextAllowedAction` is effectively "done" — but that finding is *carried, not closed*, and the
card text now on disk says so at a commit the anchor does not name.

### A-5 … A-16 — twelve closed cards whose anchors were never re-pointed after a post-approval amendment

Every one of these is the same shape as AM-123: an amendment edited the card, the amendment was
logged, the checkpoint's anchor was not moved. All are APPROVED/`done`, so **none is live**, but
they are the reservoir the next incident will be drawn from.

| Card | Anchor | Commits touching the card after it | Diff |
|---|---|---|---|
| P1.4 | `2465353` | 2 | +227 / −19 |
| S2.6 | `8cb3ecf` | 4 | +127 / −22 |
| P1.5 | `2465353` | 2 | +113 / −17 |
| P1.3 | `2465353` | 3 | +111 / −16 |
| P1.1 | `2465353` | 2 | +99 / −17 |
| C0.1 | `4b78267` | 1 | +60 / −0 |
| P2.1 | `6110813` | 1 | +21 / −0 |
| P7a.1 | `46216fe` | 1 | +15 / −5 |
| P0.2 | `8be98cb` | 1 | +9 / −0 |
| S2.1 | `34ef391` | 1 | +8 / −4 |
| P3.1 | `3610cda` | 2 | +8 / −1 (see A-13: names a file absent at base) |
| P0.4 | `f790709` | 1 | +2 / −2 |

Note the P1.1/P1.3/P1.4/P1.5 cluster: all four still share `2465353`, an anchor 419 commits back,
with 99–227 lines of amendment piled on top. Whatever those four cards say today, the anchor does
not say it.

### C-1 — P0.1: `APPROVED`, all four criteria PASS, and asking for a review return

`status: "APPROVED"`, `nextAllowedAction: "check instruction review return"`. Every other
APPROVED card in the repository says `done`. **What a resumed session would wrongly do:** re-open
an approved, already-reviewed card to chase a return that exists — or dispatch a second
instruction review, spending an attempt on nothing.

### C-2 — P3.4's `status` value is one no other card uses and `COORDINATOR.md` does not define

`COORDINATOR.md` §4's vocabulary is `APPROVED`, `SUBMITTED`, `BLOCKED`, `NOT STARTED` — and it
says explicitly that a card mid-review "is not `NOT STARTED`, which understates where the card is,
and it is not `BLOCKED`". `P3.4` sits at `IN PROGRESS`, which is in no sibling checkpoint and in
no `PROGRESS.json` value. The doc names `SUBMITTED` as the honest value for "implemented and
awaiting review"; P3.4 is not in that state either, being mid-implementation. **The vocabulary has
no slot for a card mid-attempt**, which is why an invented value appeared — see rule M-6.

### E-1 … E-7 — shape divergence from the template

- **Template keys absent:** `P0.R`, `P1.R`, `P2.R` lack `sideEffectsDone`, `changedFiles`,
  `sandboxRuns`. `S2.R` lacks those plus `contracts` **and `attempt`** — a session reading
  `S2.R.attempt` gets `undefined` and any budget arithmetic on it is undefined. `P5.3`, `S6.1`
  lack `contracts`.
- **`changedFiles` is an integer in four files** — `P3.1` (2), `P4.1` (4), `S2.5` (44),
  `S2.6` (3) — and an array in the other 41. Any consumer that does `changedFiles.includes(path)`
  throws or silently returns false on exactly those four.
- **`updatedUtc` is a bare date, not a timestamp**, in `P3.1`, `P4.1`, `P5.2`, `S2.6`
  (`"2026-09-29"`, `"2026-09-27"`) while 39 siblings use full ISO-8601 UTC; `P3.5` is `null`
  despite a fully-populated checkpoint, so recency ordering silently drops it to the floor.
- **Extra keys.** Most have precedent among siblings and are legitimate enrichment:
  `notes` (P3.1, P3.4, P3.5, S2.6, S3.2), `flags` (P0.R, S3.2), `level` (S3.2),
  `plannedSideEffects` / `instructionReviews` (P3.5). The keys with **no precedent in any
  sibling** are `P3.3.implementationCommit` / `.reviewCommit` and six on P3.4
  (`inheritedFromAttempt1`, `srcTauriTouched`, `srcTauriTouchedNote`, `reBundle`, `hookBoundary`,
  `notes`). Nothing validates them, so a resumed session reading P3.4 learns from fields no
  template, schema or `check-plan` rule knows about. `P3.4.srcTauriTouched` and
  `P3.4.reBundle.done` are exactly the fields that *must* be read on resume, and they are the two
  least discoverable.

### F-1, F-3 — `sideEffectsDone` claims that do not match reality

- **F-1, P0.2** holds commit hashes ("attempt 1 committed 6e59c60", "attempt 2 evidence
  650821b") where the field means *side effects*. A presence check on this field cannot
  distinguish "did something to the host" from "wrote a commit", which is the only thing the
  field exists to answer.
- **F-3, C0.1** claims "created branch feature/v2 from main HEAD 4b78267" and "pushed feature/v2
  to origin" in the present tense. The branch was retired and merged into `main` (AM-068); `git
  branch -a` shows only `main` and `origin/main`. Harmless because the card is done — but it is a
  side effect recorded as standing that no longer stands.
- **Verified sound:** `S4.1`'s Piper venv and `es_MX-ald-medium` voice are backed by
  `evidence/S4a.1/acquisitions.md`; `P4.1`'s egress entry by `evidence/P4.1/v2.md`; `P3.3`'s A03
  package list names all five packages in `state/OWNER-ACTIONS.md`. No card claimed a side effect
  with no evidence behind it other than those listed.

## Was a mechanical rule available for each class?

Yes, for every class. This is the part the coordinator should act on — five of the seven classes
are one command in the wrong place, or one comparison that has never been written down.

**M-1 — Anchor integrity, the direct answer to AM-112/123/126/133 and A-13/A-5…A-16.**
After any commit that touches `docs/v2/cards/<id>.md` **and** `docs/v2/state/cards/<id>.json`, run
`git diff <baseCommit>..HEAD -- docs/v2/cards/<id>.md` and require it to be empty. This is one
command, it is exactly the check that found all four of today's incidents, and it is already the
wording AM-123 used. Automate it as `scripts/v2/check-checkpoints.mjs` (no such validator exists
today — `scripts/v2/` holds sandbox and packaging checks only) and fail `npm run lint` on a
non-empty diff. **The anchor must be read *after* the commit that carries the edits** —
`git rev-parse --short HEAD` before committing describes the previous commit by construction.
That one rule, written down, would have prevented AM-133 mechanically rather than by review.

**M-2 — `PROGRESS.json` is not derived, so it drifts (D-1).** Make
`state/cards/*.json` the single source of truth and generate `PROGRESS.json` from it, or add a
check that fails when a card with a live `<id>.md` implementation dispatch disagrees with its
`PROGRESS.json` status. P3.4 — running now, at attempt 3 of 3 — is recorded as `NOT STARTED`.

**M-3 — Every card in `PROGRESS.json` must have a checkpoint file (D-2).** One existence check
per card id. Nine approved cards currently have no anchor of any kind.

**M-4 — `attempt` must equal the attempt in the newest dispatch header (B-1…B-6).** The dispatch
headers already print `attempt N of 3` in a fixed, greppable form. The rule is
`max(attempt in state/dispatch/<id>*.md headers) <= cards.<id>.attempt`, plus a self-consistency
check that any attempt number named in `lastCompletedStep` or a `criteria` entry does not exceed
`attempt`. Six cards fail today and **every one of them is internally contradictory** — the
string and the counter disagree, so the failure is detectable without any cross-file lookup.

**M-5 — Template conformance (E-1…E-7).** Validate every checkpoint against
`templates/CHECKPOINT.json`: required keys present, `changedFiles` an array, `updatedUtc` a full
ISO-8601 instant or explicitly null. Four files store a count in `changedFiles`; a validator
catches it in one line. Extra keys should be allow-listed explicitly rather than tolerated, so
P3.4's six unregistered fields are either in the template or on a named allow-list.

**M-6 — Close the status vocabulary's gap (C-2).** `COORDINATOR.md` §4 defines four statuses and
none fits a card mid-implementation, so an ad-hoc one appeared. Either add the state or state the
mapping rule; the check is that no checkpoint carries a status outside the documented set.

**M-7 — `nextAllowedAction` must be one of the documented actions for the card's status (C-1,
C-3).** `APPROVED` implies `done`; a `BLOCKED` card may not name a review as its next action; and
any `flags`/`STATUS` sentence that gates on a *named review* must name the newest review that
exists in `state/reviews/`, not the last one current when the sentence was written. S3.2's flags
still gate on round 5 while round 6 has returned.

**M-8 — `notes` must not assert an artefact without checking it (F-2).** The claim that eight V4
reports are "on disk" is false. A rule that any sentence naming a path under `docs/v2/evidence/`
must have that path resolve at the anchor would have caught it.

## What I did not do

No file was edited other than this report. No checkpoint, card, dispatch, return, amendment or
source file was touched; no build, test, e2e, cargo, tauri or sandbox command was run; no git
write command was issued. The P3.4 implementer's lease and the S3.2/P3.5 workers' in-flight edits
were left exactly as found.
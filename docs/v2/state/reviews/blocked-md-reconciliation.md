# Reconciliation: `state/BLOCKED.md` against the state that actually exists

Read-only audit worker. Head `a514aec` ("Record P3.5 as CLEAR after eight rounds,
and why it is held"). **Every path under `docs/v2/` was read with
`git show HEAD:<path>`, never from the working tree**, because an S3.2
implementer is live and has `server/src/eval/**`, `shared/src/**`,
`server/src/routes/**`, `docs/v2/evidence/S3.2/**`, `state/cards/S3.2.json` and
possibly `state/cards/P3.4.json`/`P3.5.json` open. Nothing was edited, no build,
test, e2e, cargo, tauri, eval or launch was run, and no `git add`/`commit`/
`push`/`checkout --`/`reset`/`stash` was used. This file is the only thing
written.

It amends no finding of `reviews/blocked-md-audit.md`; it applies them against
HEAD and adds three the audit could not have seen, because the audit predates
commits `d434f41`, `c834159` and `a514aec`.

---

## 0. Two corrections to the audit's own premise, verified at HEAD

**0.1 — There are four `BLOCKED` cards, not three.** `state/PROGRESS.json` at
HEAD (82 cards, matching the 82 rows of `DEPENDENCIES.md`) carries:

| status | count |
| --- | --- |
| `APPROVED` | 46 |
| `NOT STARTED` | 32 |
| `BLOCKED` | **4** |

The four are **P3.4, S3.2, P5.3, S6.1**. The audit's third card was **P3.5**,
which `a514aec` moved: `PROGRESS.json` now says `NOT STARTED` and
`state/cards/P3.5.json` says `CLEAR, HELD` after round 8 (`AM-141`). P3.5 is
still genuinely stuck in substance, but it is stuck *on another blocked card*
(P3.8's stdout forwarding fix), not on a decision of its own — which is a
different claim and is handled as a separate row in §1.2 rather than being
folded into the blocked table.

**0.2 — S3.2's `BLOCKED` is stale, and should not be given a blocked row.**
`git log -S` on `PROGRESS.json` dates it to `c3f5bf6` ("Record Spanish evaluator
instruction blockers"), i.e. it was set while **U-1** (the NFC normalisation
scope question) was open. `AM-137` then resolved U-1 as option (a) and withdrew
the stop condition it carried, `AM-139` dispatched implementation attempt 1
(`{{S32_ATTEMPT}}`=1, `{{S32_PORT}}`=7840), and `state/cards/S3.2.json` reads
`"status": "IN PROGRESS"`, `"nextAllowedAction": "implement-attempt-1"`. The
card's own checkpoint and `PROGRESS.json` therefore **disagree today**, and a
generated table would faithfully reproduce the stale value. The fix belongs in
`PROGRESS.json` (`IN PROGRESS`, the word `RUN-CONFIG.md` §RUN-CONFIG already
defines), not in `BLOCKED.md`. S3.2 is carried in §1.1 as a row **with that
correction attached**, so the coordinator sees both facts.

---

## 1. The correct current table

Format is the file's own: `<card> | reason | evidence path | what would unblock
it | dependent cards`. Every cell is taken from the card's own checkpoint,
return file, review or amendment row. Where the records do not state an unblock
condition the cell says so instead of guessing; that happens once, in S3.2.

### 1.1 The four cards `PROGRESS.json` marks `BLOCKED`

```
P3.4 | Attempt budget exhausted 3/3. V2 FAILs with 16 assertions PASS and 5 NOT RUN, and the cause is new to attempt 3: src-tauri/src/main.rs:291-305 handles Ready by showing the main window and then breaks out of the read loop, so no line the bundled server writes after that point reaches stderr, and the hook can only publish once the page exists, which is after Ready. The fix is a src-tauri change, one of the three the card forbids, so attempt 3 stopped at the card's own stop condition. V0/S0/V1/V3/V4 all PASS and V0 does not need repeating (reBundle.required false). | docs/v2/state/returns/P3.4.md; docs/v2/evidence/P3.4/V2-appimage-security.md; docs/v2/state/cards/P3.4.json (criteria.V2, srcTauriTouchedNote); AM-138, AM-140 | Owner-authorised and already recorded (AM-138): a new card owns the src-tauri forwarding change, because the defect is in P3.3's code. That card is P3.8 (AM-140, May edit exactly the forwarding loop in src-tauri/src/main.rs, port 7860). P3.4 then re-dispatches as a fourth attempt authorised by exception, on the S2.5/AM-049 precedent. P3.8 is NOT STARTED and depends only on P3.3, which is APPROVED, so P3.8 is dispatchable now. | P3.6, P3.R, and through P3.R P5.4 and P5.R
```

```
S3.2 | NOT A REAL BLOCKER — PROGRESS.json is stale and should be corrected to IN PROGRESS before this row is written. The status was set at c3f5bf6 for U-1; AM-137 resolved U-1 as option (a), a documented limitation, withdrew the stop condition it carried, re-verified the gates byte-identical (4447 B each), and authorised implementation; AM-139 dispatched attempt 1 at base fa4a9f3, port 7840, and the implementer is live. One conditional blocker does remain inside the card's own text and is quoted verbatim below. | docs/v2/state/cards/S3.2.json (status IN PROGRESS, flags, nextAllowedAction); AM-137; AM-139; docs/v2/state/dispatch/S3.2.md | For U-1: nothing outstanding — resolved by the owner. U-2 closes when V1/V2 actually execute plus an independent implementation review. U-3 was the coordinator's at dispatch and is discharged by AM-139. The only recorded condition is the card's own ACQUISITION flag: "If the tag is absent from `ollama list`, the row is BLOCKED, owner; never pull it here" — i.e. qwen3.5:4b-q4_K_M (digest 2a654d98…, present since AM-020) must be on the machine when V4 runs. Anything beyond that is NOT RECORDED — needs the coordinator. | S3.3, S3.R, and through S3.R S5.1 and S5.6
```

```
P5.3 | Production BLOCKED, and the checkpoint names two independent causes: (a) the P3.3 dependency — P3.3 owns the shell and P5.3's rows need the shell to exist — plus contracts/ownership that are drafted but unadopted; (b) the dirty pre-quiesce disconnect preservation/recovery gap, which must be closed before production safety is accepted. The bounded synthetic v3 protocol proof was accepted after independent ir2 and a coordinator AST-equivalence check, and the checkpoint records that the proof is not the production card. | docs/v2/state/cards/P5.3.json (status BLOCKED, nextAllowedAction); docs/v2/state/reviews/P5.3-protocol-proof-v3.md; docs/v2/state/proofs/P5.3-protocol-proof-v3.mjs | Owner answers the three grouped protocol choices in Part A of docs/v2/state/P5.3-AMENDMENT-PROPOSAL-v2.md — Choice 1 the client channel and, decisively, A2 the authorisation of POST /api/app/quiesce against C-BRIDGE@1 rule 3 (recommended (iii): ungated, maintenance released when the last window unregisters); Choice 2 what a non-empty registry does at entry and where the unsaved-text guard lives; Choice 3 the write boundary (which writes are registry jobs). Each answer becomes one amendment row — the proposal reserves AM-108 for it — and A2 additionally requires a C-BRIDGE@1 rule 3 clause plus the C-UPD@1 mirror, which is a contract change reserved to the owner. P3.3 must be APPROVED for the card to run. | P5.4, P5.R
```

```
S6.1 | Production BLOCKED on a licence election no agent may make. L-POLICY@1's one pre-approved exception (ACQUISITION.md:97) permits Spanish dictionary data under an MPL option only if the **election is stated**, and it does not authorise an agent to state it; `rg "MPL-1\.1|dictionary-es-mx" docs/decisions.md` returns nothing, which is why Stop 1 fires. Two further owner items sit behind it (Exhibit A attribution; a bundled May-edit widening). The accepted bounded assets proof explicitly authorised nothing: "No acquisition, notice publication or option adoption authorized by proof acceptance." | docs/v2/state/cards/S6.1.json (status BLOCKED, nextAllowedAction); docs/v2/state/S6.1-AMENDMENT-PROPOSAL-v2.md §11 items 1-3; docs/v2/state/S6.1-NOTICE-PROVENANCE.md; docs/v2/state/proofs/S6.1-assets-proof.mjs | Owner answers the §11 owner package. Item 1 (blocks the card): record MPL-1.1, data only, at 2.0.0 in docs/decisions.md — recommended, it is the only route to a Mexican dictionary — or elect another arm of `(GPL-3.0 OR LGPL-3.0 OR MPL-1.1)`, which needs an ACQUISITION.md §3 amendment, or decline, in which case S6.1 stays BLOCKED, V0-V4/V8 are NOT RUN, Spanish stays held and nothing breaks. Item 2 (blocks the notice and V4): adopt the upstream Initial Developer attribution and record the two unevidenced Exhibit A fields as `[unknown]` — recommended — or resolve those fields first via separately authorised research, or decline the notice, in which case V4 is BLOCKED rather than passed. Item 3 (blocks the card): approve one bundled amendment widening May edit from five entries to the seventeen of §2.1 plus the two `testIgnore` conditions of §6. | S5.R, and through it the Spanish AI chain S5.1-S5.7
```

### 1.2 A row that is not in the table and should be

P3.5 is `NOT STARTED` in `PROGRESS.json` and `CLEAR, HELD` in its checkpoint,
so no generation rule keyed on `BLOCKED` will ever emit it — yet it cannot be
dispatched and no one is waiting on a decision. It needs either a `HELD`
section in this file or its own file; the row in the file's format is:

```
P3.5 | CLEAR at instruction-review round 8 (10 CLEAR / 0 DEFECT / 0 UNKNOWN, AM-141) after eight rounds and five repairs, and NOT dispatched. HELD, not blocked on any decision: its hook-reading rows (V3/V4) read the same stderr channel P3.4 is blocked on, so P3.8's forwarding fix gates it too. The hook itself already landed at ee2ab00 and P3.4 attempt 3 proved it publishes. Attempt stays 0 — eight reviews, no implementation. | docs/v2/state/reviews/P3.5-ir8.md; docs/v2/state/cards/P3.5.json (status CLEAR, HELD; nextAllowedAction); AM-141 | P3.8 APPROVED. No owner action. (AM-141: "The card is fit for implementation and is NOT dispatched — it is held, not blocked on any decision.") | P3.6, P3.R, and through P3.R P5.4 and P5.R
```

**Is `CLEAR, HELD` a real problem?** Yes, mildly, and it is the only such value
in the tree: `RUN-CONFIG.md`'s status vocabulary is `NOT STARTED`, `IN PROGRESS`,
`SUBMITTED`, `APPROVED`, `CHANGES REQUESTED`, `BLOCKED` for cards, and a sweep of
all 82 rows of `state/cards/*.json` at HEAD shows every one conforming except
P3.5. `CLEAR` is an **instruction-review** word and `HELD` is not a word at all,
so the checkpoint holds a status the plan does not define, in a field
`COORDINATOR.md` §5 says to read on resume. It is harmless today only because
`PROGRESS.json` — the file the dispatcher reads — says `NOT STARTED`, which is
also wrong in the other direction (it says the card has not started, when eight
rounds of review have). Two fields now disagree about P3.5. The cheapest honest
fix is `PROGRESS.json` `BLOCKED` plus one line in `PROGRESS.json`'s own words,
or a defined vocabulary word; see §5.

---

## 2. Disposition of the 14 existing rows

Every one of the 14 rows names a card that `PROGRESS.json` at HEAD records as
`APPROVED`. There is therefore no `KEEP` and no `REWRITE` among them: all 14 are
`DELETE`. Two further lines (24 and 25) are not rows in the file's format at
all — they are orphan prose — and both are `DELETE` too.

| # | line | card | disposition | reason |
| --- | --- | --- | --- | --- |
| 1 | 6 | P0.2 | **DELETE** | APPROVED. Its `→ RESOLVED 2026-09-26 (AM-022)` line is **true and filed under the right card**: AM-022 is literally `AM-022 \| P0.2 / P0.5`, P0.5 exists and is APPROVED, P0.R depends on P0.5. |
| 2 | 8 | S4a.1 | **DELETE** | APPROVED (AM-038 pinned `noise_scale 0`/`noise_w 0`; P3.4's row records V1 then passing 295/295 byte-identical). Its own resolution line was filed under **P4.1** — see the line-12 finding. |
| 3 | 9 | P0.4 | **DELETE** | APPROVED. `→ RESOLVED (AM-020)` is **true and correctly filed**: AM-020 is an `ALL` row naming P0.4, the digest `2a654d98…` recorded, P0.4 ran and approved. |
| 4 | 11 | P4.1 (stop condition 2) | **DELETE** | APPROVED. The `→ RESOLVED` line under it cites **AM-038**, which is an **S4a.1** row about Piper determinism — it did nothing for P4.1's redirect block. **Wrong card and false for this row.** P4.1's real resolution is **AM-042** (the `ACQUISITION.md` §1 allowed-query-keys column, `us.aws.cdn.hf.co`, ten enumerated names, `query_key_not_allowed` refusal), which is recorded in `OWNER-ACTIONS.md` and in AM-042 itself, never in this file. |
| 5 | 13 | P3.1 | **DELETE** | APPROVED. `→ RESOLVED` (owner ran `pkexec pacman -S --needed cmake`, cmake 4.4.3 at `/usr/bin/cmake`) is **true and correctly filed**; `OWNER-ACTIONS.md` carries it and the coordinator re-verified on 2026-09-28. |
| 6 | 15 | S2.5 | **DELETE** | APPROVED. `→ RESOLVED 2026-09-27 (AM-049)` is **true and correctly filed**: AM-049 is an S2.5 row authorising the fourth attempt, and the release of S2.6 → S2.R → S3.2 → … it names all happened (all APPROVED). |
| 7 | 19 | S2.6 (2026-09-27 resume IR) | **DELETE** | APPROVED. Superseded twice over (AM-059 attestation scope, AM-063 catalogue repair). |
| 8 | 20 | P4.1 (2026-09-27 follow-up IR) | **DELETE** | APPROVED, four attempts later (`P4.1-attempt4-impl.md` + three IRs). Its `→` line is true but **stale by two attempts**: it says "fresh instruction review and final repair verification still pending, so card remains unapproved" — they all happened. |
| 9 | 24 | P3.1 metadata (AM-058) | **DELETE** | **Orphan prose, not a row** — no pipe format, so nothing parses it. P3.1 is APPROVED; "instruction review and implementation still pending" is long past (AM-065/066/067, attempt 1, `P3.1-impl.md`). |
| 10 | 25 | S2.6 attestation (AM-059) | **DELETE** | **Orphan prose, not a row.** S2.6 is APPROVED; the UI writer release and acceptance checks all happened. |
| 11 | 27 | S2.6 (AM-059 partial impl) | **DELETE** | APPROVED. The `language.en.english` V1 FAIL it names was repaired under AM-063 and the card approved. |
| 12 | 29 | P4.1 (attempt 3/3 spent) | **DELETE** | APPROVED. The `PROPOSED AM-064` fourth attempt was authorised and taken; the stale-evidence exposure it named is closed. |
| 13 | 30 | S2.6 (2026-09-29 attempt 2) | **DELETE** | APPROVED. The `e2e/tests/language-control.spec.ts` navigation defect was resolved outside this card, exactly as the row anticipated ("a new card"), and the card passed. |
| 14 | 31 | P3.3 (+ `→` line 32) | **DELETE** | APPROVED (`07dce9c` "Approve P3.3 and record isolated native-close verification"). The `→` line's **"the card is parked"** is **false as of HEAD** — AM-084 parked it, then AM-105 released preparation, `P3.3-ir4.md` came back all ten CLEAR, and A03 was installed 2026-10-02. A `parked` note under an APPROVED card is the exact failure mode that produced this file's inversion. |
| 15 | 33 | S2.8 | **DELETE** | APPROVED. `→ RESOLVED 2026-09-29 (AM-086)` is **true and correctly filed**: AM-086 is the S2.8 row accepting V3 on the serial run. |
| 16 | 35 | S2.11 | **DELETE** | APPROVED. AM-103 authorised the third narrow repair of D1/D2 plus one final review; both happened. The row's "a park stops the plan" reasoning is spent. |

**Counts: DELETE 16 (14 rows + 2 orphan lines), KEEP 0, REWRITE 0.**

### 2.1 The `→ RESOLVED` follow-up lines, audited

There are nine `→` lines (7, 10, 12, 14, 17, 22, 32, 34) plus the two orphans.
Seven claim a resolution; two do not.

| line | claims | did it happen? | filed under the right card? |
| --- | --- | --- | --- |
| 7 | AM-022 → P0.5 added, P0.2 APPROVED | **yes** — AM-022 exists, P0.5 APPROVED | **yes** |
| 10 | AM-020 → Ollama + tag installed | **yes** — `ALL` row, digest recorded | **yes** (names P0.4 in its unblock cell) |
| 12 | AM-038 → `noise_scale 0`, V1 295/295, **S4a.1** APPROVED | **yes** as to S4a.1 | **NO — filed under P4.1.** It resolves row 8 (S4a.1) and is attached to row 11 (P4.1). |
| 14 | cmake installed | **yes** | **yes** |
| 17 | AM-049 → fourth attempt, S2.5 APPROVED, chain released | **yes** | **yes** |
| 22 | AM-057 → P4.1 owner scope block resolved | **yes**, but the trailing clause "card remains unapproved" is **false at HEAD** | **yes** (P4.1) |
| 32 | not a RESOLVED line: P3.3 **parked**, A03 not installed | **false at HEAD** on both clauses — P3.3 is APPROVED and A03 was installed 2026-10-02 | **yes** (P3.3), but the content is stale in the dangerous direction |
| 34 | AM-086 → V3 accepted, S2.8 APPROVED | **yes** | **yes** |

Pattern: **six of seven resolution claims are true; one (line 12) is filed under
the wrong card and is irrelevant to the card it hangs from.** And the two lines
that were never closed as RESOLVED (22, 32) are the two that are now false
outright. So the file's failure is not that resolutions are invented — it is
that a *block record* was never deleted after the block cleared, and the
`→ RESOLVED` convention let a stale entry read as live.

---

## 3. The three owner gates that exist only as free text

Each is a real wait-on-a-person, and each is currently invisible to anything that
reads structured state. `NEXT-SESSION.md` line 8 lists all three in one bullet —
which is the only place a fresh session will meet them, and that file is a
handover note, not a record.

**3.1 S3.2's U-1 scope question.** *Already resolved.* Recorded only in an
amendment row (`AM-137`) and as a checkpoint flag (`S3.2.json` flags[2], still
literally worded `U-1 OPEN`, which is now wrong against flags[0]). **Confirmed
from AM-137:** "Owner decision 2026-10-02: U-1 is option (a), a documented
limitation… the owner declined option (b), so no May-edit widening is made and
`score.ts` is untouched… **the stop condition this item carried is withdrawn**…
V1's NFC test is unconditional… U-2 and U-3 remain OPEN and are unaffected."
So this gate needs **no row** — it needs its stale `U-1 OPEN` flag corrected in
the checkpoint and its row in §1.1 written honestly. Recording a resolved gate as
an open one is the more dangerous half of the problem.

**3.2 S6.1's licence election.** Live and unanswered. Recorded only in
`S6.1-AMENDMENT-PROPOSAL-v2.md` §11 item 1 and in prose in the checkpoint's
`nextAllowedAction` ("Use … for remaining licence/attribution/scope decisions").
**It should be a row in `state/OWNER-ACTIONS.md`** — that file is
`date | card | exact steps | why it is needed | cards waiting on it`, and
`COORDINATOR.md` §8 names exactly this class ("write it to `state/OWNER-ACTIONS.md`
with the exact steps, set dependent cards `BLOCKED (owner)`"). Its second
natural home is a `BLOCKED (owner)` row here. The row should say: *"S6.1 |
licence election required by L-POLICY@1's one exception (ACQUISITION.md:97):
record MPL-1.1, data only, at 2.0.0 in `docs/decisions.md` with the four §8.3
obligations, or elect another arm (needs an ACQUISITION.md §3 amendment), or
decline and S6.1 stays BLOCKED with Spanish held | `S6.1-AMENDMENT-PROPOSAL-v2.md`
§11 item 1; `S6.1-NOTICE-PROVENANCE.md`; cards/S6.1.json | Owner's election,
recorded as one amendment row | S5.R and the S5.1-S5.7 chain"*, with items 2 and
3 (Exhibit A fields; the bundled May-edit widening) as two further entries in the
same file, because all three are the owner's alone and only one is currently
findable.

**3.3 P5.3's protocol direction.** Live and unanswered. Recorded only in
`P5.3-AMENDMENT-PROPOSAL-v2.md` Part A (three grouped owner choices, A1-A2, B1,
C) and in the checkpoint's `nextAllowedAction` ("unadopted contracts/ownership").
**Same place: `state/OWNER-ACTIONS.md`**, one entry per choice, plus a
`BLOCKED (owner)` row here. The row should say: *"P5.3 | three protocol choices
no repository fact settles: the client channel and the authorisation of
`POST /api/app/quiesce` against C-BRIDGE@1 rule 3 (recommended (iii)); what a
non-empty registry does at entry and where the unsaved-text guard lives; which
writes are registry jobs. A2 additionally needs a C-BRIDGE@1 rule 3 clause and
the C-UPD@1 mirror, which are contract changes | `P5.3-AMENDMENT-PROPOSAL-v2.md`
Part A; `reviews/P5.3-protocol-proof-v3.md`; cards/P5.3.json | Owner's three
answers, logged as the amendment row the proposal reserves (AM-108 in the
proposal's own numbering, which is now taken — the coordinator must take the next
free number) | P5.4, P5.R"*.

A fourth, smaller gate is worth naming even though the audit did not: **P3.4's
fourth-attempt exception** is owner-authorised (AM-138) but the re-dispatch
itself is the coordinator's, and P3.8 has to be dispatched first. That belongs
in the P3.4 row, which is where §1.1 puts it.

---

## 4. A rule for keeping the file true

The audit's proposal: generate the rows from `BLOCKED` status, delete on resolve,
never append a `→ RESOLVED` line.

**The two-thirds of it are right and should be adopted.**

- **Delete on resolve, never append `→ RESOLVED`.** This is the load-bearing
  half and it is correct. A blocked list is a *current-state* file; a `→` line
  turns it into an append-only log, and an append-only log cannot answer the one
  question anyone opens it for — *what is stuck right now*. The evidence
  measured here supports it: 6 of 7 resolution claims were true, so the `→` lines
  cost nothing in accuracy, but the two lines that were never closed (lines 22,
  32) are now false, and a reader cannot tell a stale `→` from a live one because
  both are indented under the same row. Histories belong in
  `state/AMENDMENTS.md` and `ORCHESTRATION-LOG.md`, which are append-only by
  design and already carry every one of these resolutions.
- **Generate from status.** Right in direction, **but it cannot be the whole
  rule**, and shipping it alone would reproduce this bug in a new shape: it
  generated this file correctly from `BLOCKED` and would still have emitted
  nothing for S3.2's stale status, nothing for P3.5's `CLEAR, HELD`, and nothing
  for S4a.2, which is dependency-clear and owner-parked. A generator keyed on
  one field cannot see a card whose blocker lives in the checkpoint, in
  `AMENDMENTS.md`, or in the owner's memory.

**What it would break, concretely.** The file's four columns — reason, evidence
path, unblock condition, dependent cards — are **not derivable from
`PROGRESS.json`**, which holds one word per card. Every one of them came out of a
checkpoint, a return file or an amendment row, all hand-written prose. A
generator can emit the card column; the other three must be hand-written, and a
partly generated file is worse than a hand-written one if the hand-written part
is silently optional.

**What I would propose instead** (a rule, not a script):

1. **One row per card whose `PROGRESS.json` status is `BLOCKED`. No exceptions,
   no second row per card** — three P4.1 rows and three S2.6 rows is exactly the
   failure mode, because a stale duplicate survives after the live one is
   resolved. The status field, not the prose, decides membership.
2. **Delete the row in the same commit that changes the status away from
   `BLOCKED`.** Add a check: every card with status `BLOCKED` appears in this
   file and every card named in this file has status `BLOCKED`. That check is
   the whole truth guarantee, it is three lines, and it would have caught the
   inversion the day it appeared. Nothing else proposed here is worth the
   maintenance.
3. **Never append to a row.** A blocker that changes is a deleted row and a new
   row, in the same commit as the status change.
4. **Status is the single source of truth, so status may not go stale.** Two
   cards disagree with their own checkpoint today (S3.2: `BLOCKED` vs
   `IN PROGRESS`; P3.5: `NOT STARTED` vs `CLEAR, HELD`). Add that reconciliation
   to the existing checkpoint sweep (`AM-135`'s, run over all 82 checkpoints)
   rather than inventing a new ritual — a field that says `BLOCKED` while the
   checkpoint says the card is running is the same class of defect as a stale
   row.
5. **A second, hand-maintained section for owner gates and held cards**, because
   those are the ones a status field cannot express. Keep it short and keep it in
   this file so a fresh session reads one file: `## Waiting on the owner` (the
   three gates in §3, plus P3.4's fourth-attempt exception) and `## Held` (P3.5).
   The alternative is a new `OWNER-GATES.md`; I would not add a fourth state
   file when `OWNER-ACTIONS.md` already exists for exactly this and is currently
   the least-read file in `state/`.

---

## 5. S4a.2: is there a plan word for "parked by the owner"?

**No.** `RUN-CONFIG.md` defines six card status words — `NOT STARTED`,
`IN PROGRESS`, `SUBMITTED`, `APPROVED`, `CHANGES REQUESTED`, `BLOCKED` — and
none of them means "the owner has said not yet". The two candidates both fail
honestly:

- **`BLOCKED`** would halt every dependent card. COORDINATOR §4 says dependents
  do not start while a dependency is `BLOCKED`. S4a.2's dependents are `S4a.R`,
  and the Spanish speech chain beyond it is already held behind S6.1 and S3.R
  for other reasons, so the practical damage today is small — but it would be
  real and it would misstate the cause: S4a.2 is parked by a person, not blocked
  by a defect, and the file's whole purpose is to say which is which.
- **`NOT STARTED`** is what `PROGRESS.json` actually says, and it is the status
  that caused the problem: S4a.2's dependencies are `S4a.1` and `P4.1`, both
  `APPROVED`, so a tool reading only `PROGRESS.json` — which is exactly what
  `build-dispatch.mjs` does, refusing unless every dependency is `APPROVED` —
  would treat S4a.2 as **the next dispatchable card** and hand it to an
  implementer. The park exists only as `NEXT-SESSION.md` lines ("S4a.2 is parked
  by the owner ('I'll tell you when')") and AM-082's approval of its amendment
  proposal. There is no `state/cards/S4a.2.json` at all, so COORDINATOR §5's
  resume path has nothing to read either.

**What is missing, named rather than solved — this is a plan-editor question.**
`RUN-CONFIG.md`'s status vocabulary needs a seventh card word for *deliberate,
owner-imposed non-progress that is not a blocker*, and COORDINATOR §4 needs one
sentence saying how it differs from `BLOCKED` for dependency purposes (the
natural answer: it gates dispatch of **that card only** and does not halt its
dependents, which is the opposite of `BLOCKED` — and that is precisely the
distinction the current six words cannot express). `P3.3` was parked once under
the existing vocabulary and came back with a misleading `→` line; `P3.5` needed a
checkpoint string invented outside the vocabulary; `S4a.2` is parked a third way
with no machine-readable trace. Three parks, three ad-hoc encodings, one missing
word. Until it exists, the honest mitigation is the §4 rule 5 second section —
so at least the parks are in one file a fresh session reads — but that is a
mitigation, not a fix, and I am not the plan editor.

---

## 6. What a coordinator should do, in order

1. Set `PROGRESS.json` S3.2 to `IN PROGRESS` (it is dispatched and running) and
   decide P3.5's value; correct `state/cards/S3.2.json` flags[2], which still
   reads `U-1 OPEN` against AM-137.
2. Replace the body of `BLOCKED.md` with §1.1's four rows, correcting or
   omitting S3.2 per step 1, plus §1.2's held row and §3's two owner gates. Add
   the two-line `BLOCKED`⇔row reconciliation check to `check-plan.mjs` so the
   inversion cannot recur.
3. Add the three §3 owner gates to `state/OWNER-ACTIONS.md` in that file's own
   format. That is the single highest-value edit in this document: those three
   are real waits on a person and today a fresh session finds them only in a
   handover note.
4. Dispatch **P3.8**. It is `NOT STARTED`, its only dependency is the APPROVED
   P3.3, its May edit is one loop in `src-tauri/src/main.rs`, and it is the
   recorded unblock for both P3.4 and P3.5. Everything else on the P3 chain is
   downstream of it.
5. Log the vocabulary question in §5 as a plan-editor item. Do not invent a
   status word in a checkpoint again.
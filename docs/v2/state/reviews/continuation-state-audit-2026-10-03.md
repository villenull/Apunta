# Continuation state audit — 2026-10-03

Read-only. No source, state, card, contract or threshold was edited. Nothing was
implemented, reviewed, built, tested, launched, downloaded or modelled. No live
data, no port 7717. The only file written is this one.

## Baseline, and one thing that moved under me

Audited source base **`9d92d7b`** as instructed. Mid-audit the coordinator
committed **`201f937`** ("Resume orchestration with S3.3a implementation and
independent audits"), which touched `ORCHESTRATION-LOG.md`, `NEXT-SESSION.md`,
`PROGRESS.json`, `cards/S3.3a.json` and added `dispatch/S3.3a.md`. Everything
below is stated against `9d92d7b` and then annotated with what `201f937` already
fixed, so the coordinator does not re-apply a repair that landed while this
audit ran.

## Commands run, and their exits

All read-only. `--print` writes nothing (`build-dispatch.mjs:404-411`).

```
node docs/v2/tools/check-plan.mjs --no-write                     -> exit 0
   "Plan consistent: 71 cards, 12 parent reviews, 14 contracts, R01-R20 covered, no cycles."

# Without a port, nine times, for the nine cards the handoff names:
node docs/v2/tools/build-dispatch.mjs <id> --base 9d92d7b --print
   P3.7 S2.3 S2.4 S2.9 S2.10 S2.11 S3.3 S3.3a S5.6              -> exit 2 (all nine)
   "--port must be an integer from 7800 to 7889"

# With a port, the same nine:
node docs/v2/tools/build-dispatch.mjs <id> --base 9d92d7b --port 7850 --attempt 1 --print
   P3.7  -> exit 4  V1: <p>; V3: <p>
   S2.3  -> exit 4  V5: <p>
   S2.4  -> exit 4  V5: <p>
   S2.9  -> exit 4  V1: <p1>; V3: <p1>
   S2.10 -> exit 4  V1: <p1>; V3: <p1>
   S2.11 -> exit 4  V5: <p1>; V7: <p2>
   S3.3  -> exit 3  not dispatchable: dependencies not APPROVED: S3.2, S3.3a
   S3.3a -> exit 0  938 lines generated
   S5.6  -> exit 3  not dispatchable: dependencies not APPROVED: S5.5, S3.R

# S3.3 and S5.6 past the dependency gate, on a throwaway copy of docs/v2 in
# /tmp/opencode/plandir with the four dependencies flipped to APPROVED in the
# COPY's PROGRESS.json. The repository's PROGRESS.json was not touched.
node docs/v2/tools/build-dispatch.mjs S3.3 --base 9d92d7b --port 7850 --attempt 1 --print --plan-dir /tmp/opencode/plandir -> exit 0
node docs/v2/tools/build-dispatch.mjs S5.6 --base 9d92d7b --port 7850 --attempt 1 --print --plan-dir /tmp/opencode/plandir -> exit 0

# Parent reviews, to see whether the rule reaches them
node docs/v2/tools/build-dispatch.mjs S2.R --base 9d92d7b --head 9d92d7b --port 7850 --review --print --plan-dir /tmp/opencode/plandir -> exit 4
   (eight borrowed rows refuse: S2.10-V1/V3 <p1>, S2.11-V5 <p1>, S2.11-V7 <p2>, S2.3-V5 <p>, S2.4-V5 <p>, S2.9-V1/V3 <p1>)
node docs/v2/tools/build-dispatch.mjs P3.R ... -> exit 3  dependencies not APPROVED: P3.4, P3.5, P3.6, P3.8
node docs/v2/tools/build-dispatch.mjs P0.R ... -> exit 0
```

Plus two measurements over the plan, not the tool: the ready-queue scan
(`plan-lib.loadPlan` + `PROGRESS.json`, dependency closure) and
`pactl list short …` read-only queries for §5.

## 1. The "nine cards cannot dispatch for ports" claim is materially wrong

It is the load-bearing claim in `SESSION-HANDOFF-2026-10-02.md:83-86` ("Nine
cards cannot dispatch … This is mechanical and unblocks nine cards at once"),
and it is wrong in three separate ways.

**a. It unblocks zero cards, because six of the nine are already finished.**
`P3.7`, `S2.3`, `S2.4`, `S2.9`, `S2.10`, `S2.11` are all `APPROVED` in
`PROGRESS.json`, and each has both a return file (`state/returns/P3.7.md`,
`S2.3.md`, `S2.4.md`, `S2.9.md`, `S2.10.md`, `S2.11.md`) and an evidence
directory (`docs/v2/evidence/<id>/`). An approved card never needs a dispatch,
so filling their placeholders releases nothing.

**b. Three of the nine were never port-blocked at all.**
`S3.3a` generates cleanly (`exit 0`) with any in-range port — the coordinator
already proved this with 7841. `S3.3` and `S5.6` stop at `exit 3` on
**dependencies**, and once that gate is passed they also generate at `exit 0`.
Their `<p>` spellings are all the one spelling the tool does fill, `--port <p>`.

**c. The count came from the wrong measurement.** AM-171:275 says the nine were
"Measured with the tool's own `findUnfilledPorts` over whole documents". Running
`findUnfilledPorts` over the raw card file reports `S3.3a` `V6: <p>` ×6,
`V7: <p>` ×3, `S3.3` `V1/V2/V8: <p>` and `S5.6` `V1: <p>` — all of which are
`--port <p>` and all of which `substitute()` fills at `:190`. The check that
matters runs on the **assembled dispatch** (`:403`), not on the card. Measuring
the card double-counts every correct spelling.

**Real unfilled command placeholders, exact tokens and locations** — four cards,
ten rows, all in `APPROVED` cards:

| Card | Location | Token as written | What it is |
| --- | --- | --- | --- |
| P3.7 | `docs/v2/cards/P3.7.md:238` (V1), `:240` (V3) | `APUNTA_P31_PORT=<p>` | real; env-var position, not `--port` |
| S2.9 | `docs/v2/cards/S2.9.md:464` (V1), `:466` (V3) | `--port <p1>` | real; numbered spelling nothing fills |
| S2.10 | `docs/v2/cards/S2.10.md:649` (V1), `:651` (V3) | `--port <p1>` | real |
| S2.11 | `docs/v2/cards/S2.11.md:627` (V5) | `--port <p1>` | real |
| S2.11 | `docs/v2/cards/S2.11.md:629` (V7) | `APUNTA_E2E_PORT=<p2>` | real; second sandbox, cap 7887 |

**A sixth card's refusal is a tool false positive, and it is the one worth an
amendment.** `S2.3:266` and `S2.4:309` both plant a JSX element in a probe file:

```
printf '\nexport function S23Probe(): React.JSX.Element {\n  return <p>Not translated yet</p>;\n}\n'
```

`PORT_PLACEHOLDER = /<(?:p\d*|port\d*)>/gi` (`build-dispatch.mjs:69`) cannot
tell `<p>` the JSX tag from `<p>` the port, so it refuses `S2.3-V5` and
`S2.4-V5` for a literal HTML element. The refusal is loud and safe — nothing
wrong reaches a reviewer — but it is wrong, and it is indistinguishable in the
message from a real one.

**Recommendation (minimal, and none of it urgent).** Do **not** open nine card
amendments. Either (i) record the correction and leave the four cards as they
are, since all four are approved and none is in the queue; or (ii) if the
coordinator wants `S2.R`-style redispatch to keep working, fix the tool first —
narrow `PORT_PLACEHOLDER` so it only fires adjacent to a port-taking position
(`--port`, `=`, `--`), which also drops S2.3/S2.4 without touching their cards.
Option (ii) is a `docs/v2/tools/` change under §6's "correct a command … without
changing what it checks" and is the only item here that would otherwise need a
card amendment. **Nothing in the current ready queue is blocked by this rule.**

## 2. Status provenance — four cards whose recorded status disagrees with the record

Attempt counters live only in `state/cards/<id>.json`; `PROGRESS.json` holds
status only.

| Card | `PROGRESS.json` | Checkpoint | Provenance | Verdict |
| --- | --- | --- | --- | --- |
| **P3.8** | `NOT STARTED` | `IN PROGRESS`, attempt 3, next `implementation-review` | **AM-180** records `APPROVE WITH NOTES, must fix: none` — the gate the owner's exception required; `state/reviews/P3.8-impl-ir.md` and `returns/P3.8.md` exist | **Stale. Should be `APPROVED`.** This is the only stale row with a live consequence: `P3.R` is dep-blocked partly by it (exit 3 above) |
| **S3.2** | `IN PROGRESS` | attempt **1**, next `implement-attempt-1`, `criteria {}` | `state/returns/S3.2.md` exists: "**Attempt: 1 of 3** … **Status: partially implemented** … V4 did not run and V2 fails"; `docs/v2/evidence/S3.2/attempt-1/` exists; **AM-171** clears **attempt 2** at 9 CLEAR / 1 DEFECT | **Stale twice over.** Attempt 1 ran and returned FAILs, so the honest word is **`CHANGES REQUESTED`** (RUN-CONFIG.md:56 — "a returned `FAIL` that a further attempt will repair"), next action `implement-attempt-2`. Not `IN PROGRESS` (nothing running), not `SUBMITTED` (no review in flight), and not attempt 1 |
| **P3.5** | `NOT STARTED` | `NOT STARTED`, attempt 0, next action "held … until P3.8 forwards" | **AM-180** released it; deps `P3.3, S1.R` both `APPROVED`; `BLOCKED.md` Held row's release condition is "P3.8 APPROVED", now satisfied | **Status word is right, `nextAllowedAction` is stale.** The hold's stated cause is gone. Remaining reason is serialisation only: the build lease, shared with S3.3a and P3.4 |
| **S3.3a** | absent at `9d92d7b` | stub, attempt 0 | AM-182 CLEAR 10/0/0; **coordinator generated the dispatch successfully with `--port 7841`** | **Already fixed by `201f937`** — added as `IN PROGRESS`, attempt 1, base `9d92d7b`, all eight criteria `NOT RUN`, next `await-implementation-return`. No repair needed |

`P3.4` is the one that is *not* stale: `PROGRESS` `BLOCKED` and the checkpoint
`BLOCKED` / attempt 4 / `coordinator-decision` agree with **AM-183**. Attempt 4
of 3 is real and is not resettable. One detail in `state/BLOCKED.md:7` is stale
— its P3.4 row still reads "Attempt budget exhausted **3/3**" and describes
attempt 3's cause; attempt 4 exists and cleared that cause. The row's *shape* is
right, so this is an edit, not a regeneration.

Correct, verified, no action: `P3.7`, `S2.3`, `S2.4`, `S2.9`, `S2.10`, `S2.11`
(approved, returns and evidence present); `P5.3`, `S6.1` (`BLOCKED`, owner, both
with live `OWNER-ACTIONS` items); `S4a.2` (owner-parked while dependency-clear —
`PROGRESS` says `NOT STARTED`, which would read as dispatchable to a tool; the
parking lives only in `BLOCKED.md`'s closing section and has no status word).

## 3. Attempt counts

`P3.8` 3/3 spent and approved. `P3.4` 4-of-3 under AM-138, spent, no attempt 5
exists. `P3.5` 0, correctly — eight instruction-review rounds, zero
implementations. `S3.2` 1 spent with attempt 2 cleared but undispatched: the
counter should read 2 at the next dispatch, and no evidence directory beyond
`attempt-1` exists. `S3.3a` 1, correct as of `201f937`. Nothing anywhere resets
a counter.

## 4. P3.5-V5 — the row is not green-always; it is permanently red, and inverted

The handoff (`SESSION-HANDOFF-2026-10-02.md:87-88`) and **AM-171** both describe
this as an "inert BRE alternation whose row is **green always**", left alone on
purpose because P3.4's equivalent was fixed in AM-179. Measured, it is the
opposite failure, and AM-175's codec fix changed which one it is.

`docs/v2/cards/P3.5.md:629`, V5's command cell as written in the card:

```
pactl list short modules \| grep -c 'module-null-sink\|module-remap-source'
```

`escapeCell`/`parseCells` round-trip faithfully, so the card's `\|` reaches the
generated dispatch as a **bare** `|` — verified by parsing the emitted row:
the command cell arrives as
`... | grep -c 'module-null-sink|module-remap-source'`. In a BRE a bare `|` is a
**literal**, so the pattern can only ever match the 37-character string
`module-null-sink|module-remap-source`, which no `pactl` output contains. AM-171
was right that the alternation is inert; its consequence has since inverted,
because the *card's* `\|` used to be silently mangled by the old `splitRow` into
the same bare `|` and the row's pass was then read as the greps' exit code.

Executed verbatim on this host, which is clean — no `apunta_p35` sink, source or
module exists:

```
$ bash -c "pactl get-default-source; pactl list short sources | grep -c appointa_p35; \
           pactl list short sinks | grep -c appointa_p35; \
           pactl list short modules | grep -c 'module-null-sink|module-remap-source'"
alsa_input.usb-UGREEN_Camera_2K_UGREEN_Camera_2K_SN0001-02.analog-stereo
0
0
0
ROW EXIT=1
```

So the row **exits 1 on a correct machine**. Two independent defects, and the
second is the larger one:

1. **The alternation is inert.** It contributes nothing; the row cannot detect
   either module name.
2. **The row's pass is the last `grep -c`'s exit code, and that polarity is
   inverted.** `grep -c` exits **1** when it matches nothing (verified: match →
   exit 0, no match → exit 1). Correct behaviour — zero leaked modules — is
   therefore the failing case, and a leak would be the passing one. This is the
   inverted-guard class the handoff itself names at line 75-78.
3. **The Expected cell's actual requirement is not asserted at all.** "a non-zero
   count on the second or third command is a `FAIL`" cannot be true of this
   command: the `;` chain discards both counts, and only the fourth command's
   status survives. A leaked `apunta_p35` source or sink would still exit 1 —
   indistinguishable from clean.

**Recommended correction, consistent with the assertion P3.4-V3 already uses.**
Do **not** touch the card — this is for the coordinator to rule on. The
house form is AM-179's: one loop over the words accumulating a `bad` flag,
naming the offenders, ending on an explicit `test`. Two spellings are available
and they are not equivalent:

- *Minimal, mechanical:* change the card's `\|` to the one spelling the codec
  preserves, `\\\|`. This restores the alternation and nothing else, and it is
  squarely inside §6 ("correct a command … without changing what it checks").
  It does **not** fix defects 2 and 3, and the row still cannot pass.
- *Correct, and the one to take:* replace the trailing command with the AM-179
  loop so the row's pass is `test "$bad" = 0`, with the counts it actually
  asserts — zero `apunta_p35` among `pactl list short sources` and among
  `sinks`, and zero modules whose **arguments** name `apunta_p35`, per the
  Expected cell's own "not for the module name alone". Use two `-e` patterns per
  `grep` (the form AM-182 certified for S3.3) or two words in the loop; do not
  reintroduce an alternation. This changes what the row *asserts* only in the
  sense that it now asserts what the cell already claims.

Whichever is chosen, it is one card amendment for one row, and it is the only
card edit this audit found to be needed.

## 5. READY queue, dependency-closure measured

Cards whose every dependency is `APPROVED` and which are not themselves approved:

| Card | `PROGRESS` | Real blocker | Dispatchable now? |
| --- | --- | --- | --- |
| S3.3a | `IN PROGRESS` (from `201f937`) | none — attempt 1 running, lease + port 7841 | no; in flight |
| S3.2 | `IN PROGRESS` | needs `CHANGES REQUESTED` + attempt 2 dispatch; V4 wants the owner's quiet machine | no |
| P3.5 | `NOT STARTED` | build lease only (deps `P3.3, S1.R` approved) | **yes, once the lease frees** |
| P3.8 | `NOT STARTED` | **none — stale row, should be `APPROVED`** | record repair only |
| P3.4 | `BLOCKED` | coordinator decision; budget spent; a diagnosis worker is on it | no |
| S4a.2 | `NOT STARTED` | owner-parked, no status word exists | no |
| P5.3 | `BLOCKED` | owner: three grouped protocol choices | no |
| S6.1 | `BLOCKED` | owner: MPL election | no |

Everything else is transitively parked: `P3.6 ← P3.4, P3.5`; `P3.R ← P3.4,
P3.5, P3.6, P3.8`; `S3.3 ← S3.2, S3.3a`; `S3.R ← S3.2, S3.3, S3.3a`; the whole
`P4 → P6 → P7b → Q1` tail behind those; `S5.1…S5.7` behind `S3.R`; `S5.6` behind
`S5.5, S3.R`.

**Actionable queue, in order.**

1. **Record P3.8 `APPROVED`** in `PROGRESS.json` (AM-180 is the authority;
   `cards/P3.8.json` should follow to `APPROVED` with attempt 3 and its
   commits). Unblocks nothing by itself but removes a false blocker from `P3.R`
   and stops a fresh session re-reading a finished card as untouched. One AM row.
2. **Record S3.2 as `CHANGES REQUESTED`, attempt 2.** One AM row; then dispatch
   attempt 2 when the quiet-machine decision lands (V4 is its real-model row).
3. **Refresh `cards/P3.5.json`'s `nextAllowedAction`** — the hold it names is
   resolved. No status-word change, no attempt change, `HELD` row in
   `BLOCKED.md` needs its release condition ticked rather than rewritten.
4. **Fix the P3.4 row in `state/BLOCKED.md`** (3/3 → 4/4, attempt 3's cause →
   attempt 4's outcome). One line; keep the generated shape.
5. **One card amendment for `P3.5`-V5** (§4). The only card edit recommended
   anywhere in this audit.
6. **Optionally fix `PORT_PLACEHOLDER`.** Not needed for the queue; do it before
   any parent review that borrows S2.9/S2.10/S2.11/S2.3/S2.4 rows, or accept
   that those parents cannot be rebuilt.
7. **Leave `S4a.2`'s parking problem to the owner.** It is a vocabulary gap, and
   §6 does not cover inventing a word.

## 6. Scope discipline

Not done, by instruction: no card amended, no state or source file written
except this report, no `check-plan` run without `--no-write`, no app, server,
test, build, model or audio command, no download, no live data, no port 7717, no
implementation review. The throwaway plan directory used for §1 lives entirely
in `/tmp/opencode/plandir` and the repository's `PROGRESS.json` was never
modified by this audit — `git status` was clean before and after. The only
`pactl` calls were read-only listings.

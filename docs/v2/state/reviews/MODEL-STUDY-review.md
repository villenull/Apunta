# MODEL-STUDY — independent protocol and result review

Reviewer: independent protocol reviewer (agent `81df21fd`), 2026-09-28. Scope per
`docs/research/local-model-study-plan-2026-09-27.md:37-38` and
`docs/research/fable-therapy-study-addendum.md:55-63`: validate frozen
fixtures/gold, scoring, raw traces, failures and reproducibility. **Protocol
reviewer, not a blind style scorer.** I did not open
`corpus/review/alias-map.sealed.json` (I verified only its sha256 against
`corpus-freeze.json`, which is the coordinator's own check, not a reading of the
mapping). No inference, no GPU, no service change, no source/harness/corpus
edit, no commit, no other agent. One bounded pass; no repeated test runs.

Sources read: `docs/v2/evidence/MODEL-STUDY/{execution.md,results.md,corpus-freeze.json}`,
`<scratch>/harness/DEVIATIONS.md`, `<scratch>/runs/**` (Track1 request bodies,
per-run metrics, frozen reports, Track2 `results.jsonl`/`traces.jsonl`), the
frozen snapshot's `server/src/ai/{ollama.ts,retractions.ts,prompts.ts}`,
`<scratch>/corpus/manifest.json`, and the addendum including the coordinator's
comparison clarification at `fable-therapy-study-addendum.md:34-53`. Node
pinned `v24.19.0`; all recomputation was arithmetic over already-persisted
results.

---

## 1. What reproduces, and what does not

Recomputed from raw artefacts with the pinned runtime, independently of the
executor's analysis:

| Claim | Source | Result |
| --- | --- | --- |
| 360 Track1 fixture-runs; 22 no-note, all arm B, all `done_reason: length` | `results.md:22-24,91` | **reproduces** — 360 rows, B-eval 38/60 produced, 22 `length` |
| B mean attempts 1.80; 108 attempts; `think:true` on all | `results.md:106,125` | **reproduces** — 1.80 mean, 108 wire events |
| 1 368 unit checks, all plausible | `results.md:187`, `execution.md:291` | **reproduces arithmetically** — 360×3 + 288 non-thinking = 1 368 |
| Determinism: A/C/D 3 copies, B 11/20, E 9/20 | `results.md:70-76` | **reproduces** — my content-token proxy gives 11/20 and 9/20 on eval, 3/4 and 4/4 on owner |
| §6 timing/token/tok-s table | `results.md:152-163` | **reproduces** to the printed digit from `per-run-metrics.csv` |
| Track2: A/C/D/E 96/96, B 51/96, F 36/48 with treatment-plan 0/12 | `results.md:288-306` | **reproduces exactly**; B by language 24/48 en, 27/48 es-MX; by task 3/24 treatment-plan |
| F: 183 translation calls, largest estimated input 229 tokens, one chunk each, all inside the 4 096 window | `results.md:340`, `execution.md:425-426` | **reproduces exactly** (max `promptTokens` 241) |
| Freeze: 11/11 bound hashes match | `execution.md:325` | **12/12 match** including the sealed map, 0 mismatch, 0 missing |
| Track2 A/C/D/E identical assembled prompts per case; identical gold hashes | not previously asserted | **verified** — `assembledSystemSha256`/`assembledUserSha256` match across A/C/D/E for all 32 cases |
| Track1 A/C/D/E identical request bodies | `execution.md:85-89` | **FAILS on 1 of 20 fixtures** — finding F1 |
| "Prompt token counts near-identical ⇒ same prompt measured" | `results.md:167-171` | **inference invalid** — F1 |
| B ≈ 29× A wall clock "per run" | `results.md:172-174` | **mis-stated and unreconciled** — F5 |
| F fidelity loss attributable to the translation step | `results.md:345-348` | **overstated** — F4 |

---

## 2. Findings

Severity: **BLOCKING** = a published claim is wrong or a comparison assumption
fails; **MATERIAL** = a number or attribution is overstated; **BOUNDED** = real
but contained and disclosed.

### F1 — BLOCKING (Track1 comparability; now reclassified by the coordinator)

On `04-dictation-with-retraction.txt` the four Track1 arms were sent **four
different transcripts**. Measured from captured request bodies
(`runs/t1-{A,C,D,E}-eval-r1/requests.jsonl`, user-message length, run 1):

| Arm | user chars | what the model's own retraction call caused |
| --- | --- | --- |
| A `qwen3.5:4b-q4_K_M` | 1 817 | withdrew "no tears today" (a positive clinical finding) and emitted `{"withdrawn":"", "replacement":"Let me start over"}` insertion attempts |
| C 9B Q4 | 1 864 | cut only "Let me start over" — the retracted span stayed in the writer prompt |
| D 9B Q3 | 1 488 | also cut "the anniversary is coming up and it's hitting her hard" |
| E `gemma4:12b` | 1 488 | same cut as D |

The remaining **19 of 20** fixtures are byte-identical across A/C/D/E on
`messages` and `format` sha256, with identical `options` — I checked all 20. The
mechanism is production code, confirmed in the frozen snapshot:
`server/src/ai/ollama.ts:371-379` (retraction event), `ollama.ts:632-665` (the
quoting call, schema `retractionCorrectionsJsonSchema`, `num_predict` 768), then
`server/src/ai/retractions.ts`. Each arm issued exactly three `chat-unary` calls
(`traces/021-unary.json`, `024`, `027`).

**Status after the coordinator's clarification** (`fable-therapy-study-addendum.md:34-53`):
Track1 is an **end-to-end production-pipeline** measurement, not an
identical-writer-input comparison. That reclassification is correct and I accept
it: under an end-to-end framing, model-dependent preprocessing is a property of
the system under test, and retrofitting fixed corrections or dropping the fixture
would be the worse error. Three consequences remain outstanding and are **not**
resolved by the clarification:

1. `execution.md:85-89` ("The only per-arm difference between A, C, D and E is
   the model tag. No prompt, corpus file, expectation, rubric threshold, scorer
   constant, instruction default, template, sampling option or retry setting
   differs") is **false as written** and must be restated as the end-to-end
   claim. It is a documentation defect, not a re-run requirement.
2. `results.md:167-171` infers prompt identity from near-identical mean prompt
   tokens. That inference is invalid in kind and is now known to be wrong on
   1/20 fixtures. It must be replaced by direct hashing of (a) the original
   source, (b) each arm's retraction-correction request/response, (c) the applied
   edits, and (d) the final writer-message hash. The addendum requires (b)–(d) to
   be recorded; for A–F the correction bodies exist in `traces/*-unary.json` but
   were never surfaced or hashed in `results.md`/`execution.md`, and no applied-
   edit record exists at all. **That is recoverable from existing traces — no
   regeneration is needed** — and should be done before any Track1 number is
   quoted to the owner.
3. The three `chat-unary` calls per arm are **absent from the §6 cost table**
   (F5). Under end-to-end accounting they are legitimate cost, but they must be
   counted.

Per-fixture reading of 04 must be barred in both directions: no arm was gated on
04 (banned-string fixture sets are A{09,10,19}, C{07,09,10,16,19},
D{07,09,10,16,18,19}, E{03,09,18}), so **no published rate changes**. But 04
measures pipeline behaviour, not note quality, and the arms' inputs there are
not comparable in the clinical facts they contain.

### F2 — MATERIAL (failure denominators; the headline E-vs-A margin is an artefact)

`results.md:55` calls E's margin "2 runs out of 60 (7 vs 9)" and
`execution.md:276` repeats it. Recounting on the **independent unit** — distinct
fixtures, n=20 — from the frozen reports' own banned-string lists:

| Arm | gated runs (reported) | distinct gated fixtures (n=20) | the fixtures |
| --- | --- | --- | --- |
| A | 9/60 | **3/20** | 09, 10, 19 |
| B | 32/60 | 3/20 (+22 no-note) | 07, 09, 18 |
| C | 15/60 | **5/20** | 07, 09, 10, 16, 19 |
| D | 18/60 | **6/20** | 07, 09, 10, 16, 18, 19 |
| E | 7/60 | **3/20** | 03, 09, 18 |

**A and E are exactly tied on the independent denominator: 3/20 each.** E's
apparent lead exists only because E's three runs are genuine samples (fixture 03
gated in 1 of 3 runs) while A's are three byte-identical copies (fixture × 3).
`results.md:65-83` correctly measured the repeat dependence and then reported the
rate in the copy-inflated denominator anyway. The plan's comparison unit is the
scenario, not the run (`local-model-study-plan-2026-09-27.md:182-185`: "critical-
error counts and rates per language and task"). **Corrected statement: A 3/20, E
3/20 — a tie, not a 2-run lead; C 5/20 and D 6/20 are the only Track1 arms
measurably worse than baseline.** Nothing in the record may describe E as
beating A on fabrication.

Same correction applies to the B rate: 16.7% (10/60) is 10 gated runs over 38
produced notes, i.e. 10/38 on the notes that exist, plus 22/60 no-note. B has no
fabrication rate at all in any denominator.

### F3 — MATERIAL (a stated "disagreement" that is not one, and a category error)

`results.md:367-375` reports that "Track1 and Track2 disagree about E" and calls
the tension unresolved. They do not disagree: Track1 measured an F1/F6/F7 gate
rate on the shipped English corpus, Track2 measured schema-validity on a
synthetic paired corpus. Different metrics, no shared scale, and 96/96
schema-valid is a **contract-adherence** fact, not a quality fact. Treating
schema validity as evidence about note quality is the error to avoid; stating it
as a tension invites exactly that reading. The sentence should be replaced by:
Track2 adds no quality information about E.

I also checked the repeat dependence the paragraph gestures at and it is
stronger than the record says. Track2 outputs, hashed per case across the 3 runs:
**A 32/32 byte-identical, C 32/32, D 32/32, E 31/32, B-at-8192 32/32.** So
Track2's effective sample is 32 cases per arm, not 96, and Track2's E is
essentially deterministic too — the "A/C/D/E did not need retries at all" point
does not distinguish E from A/C/D. Track1's determinism finding (§3) applies with
equal force to Track2 and was never stated there.

### F4 — MATERIAL (arm F is confounded with a prompt-language change)

`results.md:345-348`: "Any fidelity loss in F is therefore attributable to the
translation step." Verified false. F's writer prompt is **byte-identical to A's
English-twin case prompt for all 48 records** (`englishSystemSha256`/
`englishUserSha256` vs A's `assembledSystemSha256`/`assembledUserSha256`, 48/48
match), and **differs from A's own es-MX case prompt** (e.g. pair D01 run 1:
`f24c18ad…` vs `effeed3c…`). F therefore differs from A-Spanish in two ways at
once: the two translation legs, **and** the writer's instruction set (English
twin template and output-language instruction in place of the es-MX template's).
Study question 3 (`plan:16`) asks whether a pivot beats direct Spanish *on the
same source facts* — the facts are the same, the instructions are not. Any F-vs-A
difference cannot be assigned to translation alone.

Two further F protocol points, both verified sound: the pivot hashes, source hash
and gold hash are recorded on every record, and `goldIds == enGoldIds` for all 48
with `goldIsOriginalSpanish: true`, so the en↔es pairing is exact; and scoring
against the original es-MX gold is genuinely implemented, not asserted.

### F5 — MATERIAL (cost accounting: understated, and internally unreconciled)

`results.md:172-174`: "B costs ~29× A's wall clock per run." 63.1 s ÷ 2.17 s =
29.1, and both figures are per-run from `per-run-metrics.csv`. But the frozen
report for the same arm (`runs/t1-B-eval-combined/report.md`) says **108.8 s**,
and A's says 2.3 s — a ratio of ~47×. I checked the obvious reconciliation and
it does not close: the tee's per-run sum of attempt walls is 63.1 s (mean),
2 009 s over 38 produced and 1 777 s over 22 failed; the report's mean-output-token
figure (5 214) equals my **produced-notes-only** mean exactly, while `results.md:156`
publishes **6 306**, the all-60 mean. So the report and `results.md` use different
denominators on the same arm, and the wall-clock difference is unexplained. Two
corrections are needed: state the denominator for every B cell, and reconcile
63.1 vs 108.8 s before the Mac memory screen uses either. `results.md:156`'s
"30× the output tokens" is 25× on the produced-only basis.

**F's latency is not reported at all** (`results.md:279,295` show "—"). I
computed it from the records: 231 model calls, 243 s total, **5.1 s per case-run**
against A's ~3.1 s. That is a decision input — the plan requires F to justify
"extra failure points/latency" (`plan:202-204`) — and it is the one number that
makes F's cost look modest. It should be in the results.

Also uncounted everywhere: the per-arm retraction calls from F1, and the
~7 000 s of duplicated B GPU work from `DEVIATIONS.md:219-226`.

### F6 — MATERIAL (the fabrication gate is a lexical coverage screen)

`results.md:51-54` notes that all gating is F1 banned strings. The sharper point
is what the strings are. Every gating hit I read is a **verbatim echo of ordinary
source vocabulary**: `family history -> "family history"`, `\bthree years\b ->
"three years"`, `compulsi -> "compulsi"`, `movie -> "movie"`, `fire alarm`,
`stairs`, `anger management`, `ruled out`. The frozen eval's own report says a
model that dumps the transcript into every section "aces" completeness
(`t1-E-eval-r1/report.md:47-48`) — i.e. the two headline tables are
anti-aligned by construction. So the primary metric penalises a note for
**reproducing the source faithfully**, and D, the worst-gated arm (6/20), is the
*most* complete arm (C1 91.9%, `t1-D-eval-r1/report.md:63`). A fabrication rate
built this way cannot be read as a fabrication rate.

Independent of the lexical noise, the restraint table does separate the arms on a
non-artifactual basis: **Marker kept** A 100.0% > E 33.3% = C 33.3% > B 55.6% >
**D 0.0%**, with D also carrying 3 novel dx/risk hits (all on fixture 19, so
1 scenario) and 6 filled blanks versus A's 3. D is the arm with a genuine
signal, and `results.md` weights it least.

### F7 — BOUNDED, correctly disclosed (frozen-detector blind spots)

`DEVIATIONS.md:113-131` and `results.md:194-212` are accurate and I confirmed
both by reading the frozen scorer: most seeded defect classes are detected but
**do not gate** (only F1, F6, F7, S1/S2/S4 and a context-full prompt zero a
fixture), so any critical-error rate taken from gating alone understates
negation/actor/time flips, dropped uncertainty, invented observations and filled
blanks; and the repetition detector has a 40-token floor, so a short degenerate
loop passes. The record's instruction to read `safetyMisses`,
`unsupportedPhrases`, `numberFlags`, `blankOutcome` and `statedAbsenceCredit`
alongside gating is correct and is **not yet done for Track2** — no such extraction
exists (§3 below).

One report error: `results.md:100-103` groups the truncated fixtures as "03, 04,
08, 12, 13, 15, 19" and states 8 fixtures were affected. The failure list has 8
(`runs/track1-analysis/failure-list.md`): those 7 at 3/3 runs, plus
`11-terse-observations-no-read.txt` at 1/3, which the table omits. 21 + 1 = 22 is
right; the grouping is not.

### F8 — MATERIAL (sample sizes are smaller than the plan's counts imply)

`corpus/manifest.json` gives 16 test scenarios per language, 4 per task. Per
**feature**, coverage is far thinner: `spoken-correction` 2 scenarios per
language (`d03`, `s04`), `experiencer` 3, `past-vs-current-risk` 3,
`negation` 4, `number-dose` 7. With 3 identical runs, any per-feature claim
rests on 2–7 independent units, and on 2 for the retraction capability the
production pipeline is built around. Per-language verdicts therefore have n=16,
not 96.

The style rule compounds this. `plan:187-190` requires ≥60% preference among
**non-tied** pairs and wins−losses ≥ 4 **in each language**, over at most 16 pairs
(`plan:170-172`). Ties leave the denominator, so a tie-heavy judge makes the
threshold easier, and 7 W / 2 L / 7 T already satisfies both conditions on 9
decided pairs. No inter-judge agreement, no second judge and no tie-rate target
is specified. The addendum's G packet inherits all of this (`addendum:65-69`).

### F9 — MATERIAL (the gold the decision rule rests on is unapproved and unverified)

`corpus/manifest.json` `status: "DRAFT"` and its own `approval` field says **NOT
APPROVED**, that both repair passes are **NOT independently verified**, and that
no independent reviewer has signed the corpus. `corpus-freeze.json:22-33` records
the **coordinator alone** accepting 24 historical blocking flags and the
manifest's DRAFT status as exploratory conventions. So the sole authority for
the Track2 factual adjudication is one agent's disposition of a corpus its own
manifest disclaims. The freeze record is honest about this and the limit is
stated everywhere; the point is that **no Track2 factual or style verdict can be
stronger than "exploratory against an unverified, self-disclaimed gold"**, and a
judge packet must carry that on its face. The 16 cue/proposition collisions that
triggered repair pass 2 are in the same class as the F6 false-positive issue and
should be a named counterexample class in the blind review (§5).

### F10 — BOUNDED (repair budget and lease coverage; both disclosed, one gap)

`DEVIATIONS.md:262-280` states 6 or more harness repairs against the plan's cap
of 2 (`plan:219`) and calls it a process failure. I concur: the cap is an
escalation trigger and escalation did not happen. The mitigations it lists check
out — the frozen scorer was never modified, the snapshot still matches the base
commit, every failure stayed in its denominator, no quality conclusion is drawn.
So the overage is a process finding, not a data-integrity one.

The lease claim needs one correction. `execution.md:56-58` says "Every arm ran
through it; `logs/lease.log` records each acquisition and release."
`logs/lease.log` has 59 `ACQUIRED` and 55 `RELEASED` and its **first entry is
2026-09-27T20:43:11Z**, a lease self-test (`bash -c echo child-ran`). The
real-model smoke generations in `runs/smoke-A-01`, `smoke-C-01b`, `smoke-E-01`
and `smoke-B-01e` each contain one captured model call and all four predate the
log's first entry, as does the D4 breach (`DEVIATIONS.md:85-111`, ~15:37 local).
So lease coverage is **evidenced only from 20:43:11Z**; the smoke window and D4
sit outside any record. Impact is contained — no smoke output is scored, D4
overlaps no recorded run — but "all study inference ran beneath the lease"
(`plan:82-85`; `execution.md:56-58`) is not supportable for the pre-20:43Z period, and
contamination there can be neither shown nor excluded. The 4 unpaired
acquisitions correspond to killed/timeout runs and are consistent with D1.

### F11 — BOUNDED (positive findings worth carrying forward)

Recorded so the review is not read as uniformly negative:

- Prompt/option equivalence for Track2 is **exact** — identical assembled system
  and user hashes across A/C/D/E for all 32 cases, identical gold hashes, and
  `harness/track2/run.ts`/`run-f.ts`/`assemble.mjs` contain **no** retraction or
  correction import, so Track2 is a genuine controlled comparison with **no
  model-driven preprocessing**. This is the condition the addendum makes G's
  primary comparison conditional on (`addendum:47-51`), and A–F already satisfy
  it; G must be verified against the same test.
- Freeze integrity is intact: 12/12 hashes match, sealed map unopened.
- Arm isolation held: B alone used the patched provider, and the frozen provider
  and runner still hash to the base commit. B's `think` flag was on the wire for
  all 108 Track1 and 186 Track2 attempts with zero drops, so no B result is a
  thinking-disabled fallback — the plan's condition (`plan:121-125`) is genuinely
  met and verified from the wire.
- The refusal/failure discipline is real: 22 no-note B runs, 45 truncated B
  Track2 runs and 12 F pivot failures all stayed in their denominators, and the
  executor declined to repair F's treatment-plan column for exactly the right
  reason (`DEVIATIONS.md:248-260`).
- Snapshot integrity and the no-7717/no-live-data constraints are documented and
  consistent with the artefacts I read.

---

## 3. The most consequential gap: the factual adjudication has not started

The plan requires machine extraction of factual checks as a descriptive first
pass, then blind human/model review of **all flagged outputs plus a deterministic
balanced sample of unflagged ones** (`plan:160-166`). `results.md:350-362` states
plainly that no cue-hit counts, no coverage and no critical-error rates exist for
Track2, and I confirmed it: `runs/track1-analysis/` is the only analysis
directory, and no Track2 screening pass has been run. The dev split's 173-cue
self-screen (`execution.md:374-376`) checked the *executor*, not the outputs.

This is the gate. Until a cue-hit screening pass exists over the 528 case-runs,
there is nothing to adjudicate, the plan's "all flagged plus balanced sample of
unflagged" design cannot be executed, and the false-negative expansion rule
(`plan:162-164`) has no trigger. It must be a screening pass only — counts of
candidates, not errors — and it must be produced by a context that has not read
the gold propositions as authorial intent.

---

## 4. What can be concluded on the evidence in hand

1. **Q1 (does more thinking time on 4B help) — answer: no, at every budget
   tested.** B fails 22/60 Track1 runs at 8 192 and 45/96 Track2 runs at 8 192
   (3/24 on treatment-plan), and 6/6 at 3 072
   (`DEVIATIONS.md:179-217`). One mechanism, three budgets. The honest scope
   limit: a larger budget than 8 192 was not authorised, so this rules out the
   tested configurations, not the idea.
2. **C and D are worse than baseline A on the one Track1 axis that separates
   arms**: 5/20 and 6/20 gated fixtures against A's 3/20 (F2), with D also worst
   on uncertainty markers kept (0.0%) and carrying the only novel dx/risk hits.
   This survives F6, because D's deficit shows up in the restraint table too.
3. **A vs E on fabrication is a tie (3/20 each), not a lead** (F2). E is slower
   per run (4.5 s vs 2.1 s median; 53.9 vs 101.0 tok/s) and larger (7.6 GB). On
   the evidence in hand **there is no quality reason to move off the 4B
   baseline**, which is the plan's default outcome (`plan:196-200`).
4. **F is eliminated on a pre-registered structural criterion, before fidelity is
   ever adjudicated.** The plan requires structured-output, refusal, timeout and
   guard-failure rates not to worsen (`plan:186`). F is 36/48 with treatment-plan
   **0/12** against A's 48/48 on the same 4 scenarios; the pivot cannot round-trip
   nested JSON. F also never exercises its chunking protocol (max 229 of 4 096
   estimated tokens, `results.md:340`), so that path is unproven, not passing.
   Recording the failure and refusing to tune it was correct.
5. **Q4 (which candidates merit 8 GB M2 validation) — currently none beyond the
   status quo**, on this evidence. E is larger and no better on the axis measured;
   C and D are measurably worse; F fails structurally. This is a statement about
   the evidence available, not a Mac finding — Mac validation remains NOT RUN
   (`plan:206-211`).
6. **Track1's 360 runs and Track2's 528 case-runs are internally consistent,
   fully denominator-preserving, and honestly labelled.** The executor's refusal
   to convert structural counts into quality claims is the reason this study is
   auditable at all.

## 5. What remains INCONCLUSIVE

- **Every Track2 factual question**: critical-error rate per language and task,
  `mustState` coverage, `criticalOnOmission`, and therefore the entire decision
  rule's first and third criteria (`plan:182-193`). Not started (§3).
- **All style**: clarity, naturalness, format 1–5 and the blinded preference
  sample. Zero judgements exist. `results.md:361-362` is correct that this belongs
  to a fresh blind context.
- **Q2 in Spanish** (which candidate improves Mexican Spanish): INCONCLUSIVE for
  want of any Spanish quality measurement, not for want of a winner.
- **Q3 (translation pivot vs direct Spanish on the same source facts)**:
  INCONCLUSIVE *and* confounded (F4), so it needs a design fix before a
  measurement, not just a measurement.
- **Whether E's Track1 advantage is real in either direction**: F2 says it is a
  tie at 3/20; with no interval and n=20 units, a real difference of one scenario
  is neither excluded nor established. A seeded sweep is a coordinator decision
  (`DEVIATIONS.md:164-166`) and remains the only way to resolve it.
- **Whether Track2 predicts the shipped Spanish path**: Track2 uses
  corpus-authored prompts and the frozen response schemas, not
  `server/src/ai/prompts.ts` and not the production drafting path, and it omits
  the retraction pass entirely. That is correct per `plan:126-132` (model-only
  study) and it is also a hard limit on transfer.
- **Per-feature claims** on `spoken-correction` (n=2 per language) and
  `experiencer` (n=3) — underpowered regardless of results (F8).
- **Timing and memory as selection inputs**: contention visibility limited, no
  GPU telemetry, cold/warm mixed within arms, F latency unreported, and the
  63.1-vs-108.8 s discrepancy unresolved (F5).
- **Everything about Mac feasibility**: NOT RUN, by design (`plan:206-211`).

---

## 6. Plan for the fresh blind factual and style review

This is a protocol proposal for the coordinator. It is not a licence to start
before the G handoff, and it changes no prompt, gold, schema or threshold.

**Prerequisites, in order.** (a) A cue-hit screening pass over all 528 case-runs
plus G's, producing candidate counts only, with the disclosed false-positive
class (substring screening fires on *negated* mentions of a forbidden thing,
`results.md:352-355`) labelled. (b) The Track1 retraction record required by
`addendum:41-45`, reconstructed from the existing `traces/*-unary.json` — no
regeneration. (c) An independent check of the Track2 corpus's unverified state
(F9), at minimum re-running the 16 cue/proposition collisions from repair pass 2
as a named counterexample class. (d) G's message-content and format hash
equivalence plus absence of model-driven preprocessing, asserted on dev cases
before heldout (`addendum:47-51`).

**Judge packet — identities excluded by construction.** Each packet item carries:
the case's `pairId` and task; the **original** source facts in the case's own
language; the gold propositions restated as *propositions to check* (must-state,
forbidden-invention, `criticalOnOmission`) with no model, tag, run number,
timing, token counts or pass/fail field; the output text; and the frozen rubric
anchors verbatim. Excluded: model identity, arm letter, alias, quant, `think`
flag, `num_predict`, whether the run is run 1/2/3, latency, and any Track1
fabrication count. Neutral ordering by a hash of the packet id, so position
carries no signal. Aliases stay sealed and the mapping is not shipped with the
packet. Two facts the judge must be given, because they are properties of the
instrument and not of any arm: the gold is exploratory and unverified (F9), and a
cue hit is a candidate, not a finding.

**Factual sampling.** Two strata, blind, with the stratum assigned before any
judging: **all** cue-flagged outputs, plus a deterministic balanced sample of
unflagged outputs — 4 per task per language per arm, selected by a fixed hash of
`arm|run|caseId` so the draw is reproducible and cannot be steered toward
favourable runs. Report counts per stratum, per language and per task. The plan's
false-negative rule (`plan:162-164`) is binding: any false negative found in
review expands review to **all** outputs in that category, and the expansion is
reported, not absorbed.

**Style sampling.** Exactly as pre-registered: run 1 of all 16 scenarios per
language per candidate against A, 16 pairs per language, F 16 Spanish pairs
only. Sum clarity + naturalness + format per dimension, compare sums on
factually-equivalent pairs, equal sums are ties. Because A is the shared
comparator, the pairs are **not independent** — state that beside the win/loss
table, and report the tie rate, which `plan:187-190` currently leaves
unconstrained. I recommend the coordinator pre-register a maximum tie rate and a
two-judge agreement check on a 20% subsample **before** the packets go out, since
setting either afterwards is threshold-shopping. Where an arm failed to produce
a note (B's 45, F's 12), the pair is a **failure, not a style loss**, and must
never be scored on style.

**Counterexamples to demand, by name.** The blind reviewer should be required to
seek, not merely record: (i) a fabrication-rate gate firing on a faithful
verbatim echo of source vocabulary, using `09-intake-history-declined`
("family history") and `10-intake-messy-mixed` ("three years") as the known
traps (F6); (ii) a `spoken-correction` case judged on a transcript the pipeline
had already cut differently per arm (F1) — pair `d03`/`s04`; (iii) a
cue/proposition collision of the repair-pass-2 class (F9); (iv) at least one
*negated* mention of a forbidden thing, to measure the disclosed
false-positive rate rather than assume it; (v) any note where the model was
**more** complete and was gated for it; (vi) for F, any case where the pivot
changed a clinical qualifier rather than a word.

**Independence.** The blind factual and style context must be distinct from the
corpus author, both repair passes, both reviewers, the executor and this
reviewer, and must not have read `results.md` or this file
(`corpus-freeze.json:31`, `addendum:57-63`). Any disagreement between the blind
judgement and a reported rate is resolved toward the blind judgement, with both
recorded.

**Decision application.** The rule is applied only if coverage is complete and no
unresolved critical judgment remains; otherwise INCONCLUSIVE
(`plan:194-195`). Spanish and English get separate verdicts. On current
evidence, F is already out on structure, B is out on failure rate, and the
A-versus-E question is a tie at 3/20 — so the realistic decision space is
"retain 4B" versus "E or C on a Track2 verdict that does not exist yet".

## 7. Conditions on the G extension

G's instruction review may proceed. The Track1/Track2 distinction the
coordinator has drawn is the right one and I have audited it above (F1): Track1
is end-to-end production pipeline, Track2 is the controlled comparison, and A–F
already satisfy Track2's condition — no retraction or correction import anywhere
in `harness/track2/{run.ts,run-f.ts,assemble.mjs}`, and byte-identical assembled
prompts across A/C/D/E for all 32 cases. Four things must hold before G heldout
generation and are cheap to check:

1. G's message-content and format hashes are **asserted equal to A's** per case
   on dev cases, and recorded, before any heldout request (`addendum:47-51`).
2. The compatibility check includes a **spoken-correction dev case**, so the
   retraction path is exercised on dev rather than discovered on heldout
   (`addendum:50-51`).
3. G's Track1-style run records original input, correction request/response,
   applied edits and final writer-message hashes, and counts preprocessing in
   total compute (`addendum:41-45`) — the exact accounting A–F are missing (F1,
   F5).
4. G's numbers are **not** placed in the same table as A–E's Track2 numbers
   unless condition 1 is satisfied for all of them; otherwise G's Track1 column
   is end-to-end pipeline behaviour and its Track2 column is a controlled
   comparison, and the two must be labelled that way wherever they appear.

Nothing here requires halting unrelated work, and I am not asking for G to be
stopped. If any G heldout output predates
`fable-therapy-study-addendum.md:34-53`, `addendum:52-53` requires that be
recorded explicitly against the output.

---

**Bottom line.** The study's data handling is sound: denominators are preserved,
failures are retained, prompts and options are provably equivalent on Track2, the
freeze verifies, and no quality claim was made by the party that had no standing
to make one. Four published claims are wrong or overstated — the fabrication
denominators and the E-vs-A margin (F2), the stated Track1/Track2 disagreement
(F3), F's attribution to translation (F4), and the cost table (F5) — plus one
hard comparability defect now correctly reclassified as end-to-end pipeline
behaviour, whose record is still missing (F1). On the evidence in hand the
supportable answer is **retain the 4B baseline**, with B and F eliminated on
failure rates, C and D measurably worse, and E a tie with a higher cost. Every
Track2 factual and style question — which is where the study's actual selection
power lives — is INCONCLUSIVE because the adjudication has not begun, and §6
specifies how to begin it.

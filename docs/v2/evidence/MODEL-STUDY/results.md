# MODEL-STUDY — Track1 results (worker: execution)

**These are observations, not conclusions.** No arm is recommended here and no
quality judgement is made: the plan puts selection with the coordinator and
final assessment with an independent reviewer, and this worker is neither. Where
a number looks favourable or unfavourable it is reported with the caveat that
decides whether it may be read at all.

Procedure, commands, exit codes, hashes and every deviation are in
**execution.md**. Raw traces, per-run metrics, the failure list and the unit
checks are under `/home/villenull/.cache/apunta-model-study/2026-09-27/runs/`.

Nothing here is a clinical judgement. Nothing here certifies the corpus, and the
bilingual dispositions in the freeze record are accepted as **exploratory
fidelity conventions only**, not as clinical sign-off.

---

## 1. What was measured

Shipped English regression, **frozen** scorer and thresholds, five arms, two
corpora, 3 runs per fixture: **360 scored fixture-runs**, of which **22 produced
no note at all**. Every failure stays in its denominator. No run was re-scored,
dropped, retried for a better answer, or selected for being fluent.

| Arm | Model | Provider | think | `num_predict` |
| --- | --- | --- | --- | --- |
| A | `qwen3.5:4b-q4_K_M` (baseline) | frozen production | `false` | 3072 |
| B | `qwen3.5:4b-q4_K_M` (same digest) | scratch adapter | `true` | 8192 |
| C | `apunta-study-qwen35-9b-q4:latest` | frozen production | `false` | 3072 |
| D | `apunta-study-qwen35-9b-q3:latest` | frozen production | `false` | 3072 |
| E | `gemma4:12b` | frozen production | `false` | 3072 |

`num_ctx 16384`, `temperature 0`, `repeat_penalty 1.0`, `seed = attempt-1` on
every request of every arm. The only difference between A, C, D and E is the tag.

## 2. Fabrication rate and gated runs — the numbers to read first

Straight from the frozen reports, unmodified.

| Arm | eval (20 fixtures ×3) | Gated runs | eval-owner (4 ×3) | Gated |
| --- | --- | --- | --- | --- |
| A (baseline) | **15.0%** (9/60) | 9/60 | 0.0% (0/12) | 0/12 |
| B (4B thinking) | **16.7%** (10/60) | **32/60** | 0.0% (0/12) | 0/12 |
| C (9B Q4_K_M) | **25.0%** (15/60) | 15/60 | 0.0% (0/12) | 0/12 |
| D (9B Q3_K_M) | **30.0%** (18/60) | 18/60 | 0.0% (0/12) | 0/12 |
| E (`gemma4:12b`) | **11.7%** (7/60) | 7/60 | 0.0% (0/12) | 0/12 |

Read with these three facts, which are not optional context:

1. **All gating is F1 banned strings.** No run in any arm produced a gating F6
   unsupported conclusion or a novel diagnosis/risk term, except D with 3 novel
   dx/risk hits. So the headline separates arms almost entirely on banned-string
   phrases, not on the unsupported-conclusion class.
2. **E's margin over A is 2 runs out of 60** (7 vs 9) — see §3 before reading it
   as a gap.
3. **B's gated count is not comparable to the others.** 32 of 60 gated, of which
   22 produced **no note at all**. A fabrication rate computed over a corpus where
   more than a third of the attempts yielded nothing is not a quality rate.

Every arm scored **0% on `eval-owner`** (0/12). The four owner-format fixtures
discriminated between no arm; the three model-quality findings that corpus was
built to catch did not appear for any of them in these runs.

## 3. Run-to-run variability — measured, and it is arm-specific

Whether three runs are three samples or three copies was measured from the
traces, not assumed.

| Arm | eval fixtures byte-identical across the 3 runs | meaning |
| --- | --- | --- |
| A | 20/20 | three **copies** — variability unmeasurable |
| C | 20/20 | three **copies** — variability unmeasurable |
| D | 20/20 | three **copies** — variability unmeasurable |
| B | 11/20 | genuine samples |
| E | 9/20 | genuine samples |

- **A vs C vs D** is a clean comparison: with deterministic decoding, differences
  are signal, not sampling noise.
- **A vs E is not a like-for-like comparison of distributions.** E's runs vary,
  and the gap is 2 runs in 60. No interval is computed and the difference must
  not be read as established.
- Decoding was not changed; a seeded sweep is a coordinator decision.

## 4. Failure list — 22 of 360, all in one arm, all one cause

Full table in `runs/track1-analysis/failure-list.md`. Every one:

| Arm | Corpus | Failed runs | Cause |
| --- | --- | --- | --- |
| B | eval | **22 / 60** | `output_truncated` — `done_reason: length` |
| A, C, D, E | both | **0** | — |

**All 22 are the same failure, and it is arm B's own declared configuration
rather than a model property.** With `think=true` and an 8192-token output
budget, the thinking trace consumes the budget before a note is emitted:

| Fixture group | `output_tokens` | thinking share | outcome |
| --- | --- | --- | --- |
| 01, 02 (short) | 5 656 – 5 921 | 97.5 – 99.1% | note produced |
| 03, 04, 08, 12, 13, 15, 19 (longer) | 8 192 = the whole budget | 100% | **no note** |

8 of 20 fixtures had at least one run yield nothing. Because
`output_truncated` is retryable but not shape-related, the ladder spends exactly
two calls and then gives up, so each of those runs cost ~2× the budget before
failing. Mean attempts per run: B 1.80, A 1.00, C 1.05, D 1.15, E 1.00.

**This says that 4B-thinking at an 8192 output budget is a bad configuration. It
does not say that thinking cannot help** — a larger budget is a different
configuration, is extra compute again, and was not authorised, so it was not run.
Whether a budget exists that makes B viable is an open question for the
coordinator, not something to fix by tuning against these fixtures.

Per the plan, a refusal or a failure **does not earn a factual-quality win**, and
B's 16.7% is reported next to its 22 no-note runs for exactly that reason.

## 5. Internal provider attempts, retries and mode changes — from the wire

Every rung was read off the captured request bodies, not self-reported.

| Arm-corpus | `think` seen on attempts | `think` dropped on any attempt | mean attempts/run |
| --- | --- | --- | --- |
| A-eval | `false` ×60 | 0 | 1.00 |
| A-owner | `false` ×12 | 0 | 1.00 |
| B-eval | `true` ×108 | **0** | 1.80 |
| B-owner | `true` ×18 | **0** | 1.50 |
| C-eval | `false` ×63 | 0 | 1.05 |
| C-owner | `false` ×12 | 0 | 1.00 |
| D-eval | `false` ×69 | 0 | 1.15 |
| D-owner | `false` ×12 | 0 | 1.00 |
| E-eval | `false` ×60 | 0 | 1.00 |
| E-owner | `false` ×12 | 0 | 1.00 |

**No arm-B result is a thinking-disabled fallback.** The plan's condition —
never count a fallback that disables thinking as a thinking-enabled success — is
satisfied and verified: `think=true` on the final attempt of all 60 B eval runs
and all 12 owner runs, with zero attempts anywhere in the study where the field
was dropped.

First-attempt and eventual results are therefore the same thing for A, C, D and
E: every one of those runs succeeded on its first attempt except 3 C-runs, 9
D-runs and 0 E-runs.

## 6. Cost and speed — observed, with contention visibility limited

`nvidia-smi` and `rocm-smi` are absent on this host, so GPU utilisation and VRAM
were never observed. Captured instead: `ollama ps` residency, context and
processor placement plus host load average, before and after every arm. Timing is
therefore reported as **wall clock with contention visibility limited** — it is
not a GPU benchmark and not a Mac figure.

| Arm-corpus | runs | median wall/run | mean wall/run | mean first byte | mean prompt tok | mean output tok | mean tok/s | notes produced |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A-eval | 60 | 2.1 s | 2.2 s | 0.12 s | 2 444 | 208 | 101.0 | 60/60 |
| A-owner | 12 | 1.6 s | 1.6 s | 0.17 s | 3 586 | 147 | 101.1 | 12/12 |
| B-eval | 60 | **60.3 s** | 63.1 s | 0.19 s | 2 484 | **6 306** | 100.1 | **38/60** |
| B-owner | 12 | — | 68.8 s | 0.28 s | 3 610 | 6 711 | 98.1 | 12/12 |
| C-eval | 60 | 3.0 s | 3.1 s | 0.19 s | 2 467 | 235 | 79.2 | 60/60 |
| C-owner | 12 | — | 2.5 s | 0.24 s | 3 586 | 177 | 79.4 | 12/12 |
| D-eval | 60 | 2.8 s | 3.2 s | 0.32 s | 2 511 | 237 | 81.3 | 60/60 |
| D-owner | 12 | — | 2.5 s | 0.27 s | 3 586 | 177 | 78.8 | 12/12 |
| E-eval | 60 | 4.5 s | 4.8 s | 0.34 s | 2 448 | 239 | **53.9** | 60/60 |
| E-owner | 12 | — | 3.0 s | 0.33 s | 3 563 | 143 | 54.1 | 12/12 |

Observations, offered as measurements only:

- **Prompt token counts are near-identical in aggregate across arms** (2 444–2 511
  on eval, 3 563–3 610 on owner). E differs slightly at 2 448 / 3 563 because
  gemma4 uses its own tokenizer.

> **DOCUMENTATION CORRECTION — added 2026-09-28, after an independent protocol
> reviewer's finding. No number in this document is altered by it.**
>
> The removed phrase — "independent evidence that the same prompt was measured" —
> was a **false identity inference** and should not have been written. A
> corpus-wide aggregate of prompt token counts is **not** evidence of per-case
> message identity, and on `04-dictation-with-retraction` it is affirmatively
> misleading: production retraction preprocessing calls the model under test, so
> the writer's final message differed by arm (A 1817, C 1864, D 1488, E 1488
> characters, reproduced from this study's own traces).
>
> The aggregate figures above stand as measurements of token counts. What they do
> **not** support is any claim that Track1 held the prompt fixed across arms. It
> did not, on that fixture, by production design. Track1 is an end-to-end pipeline
> comparison; the controlled comparison is Track2, where message identity is
> verified by hash (A vs C 32/32, G vs A 9/9 on dev). B at 2 484 reflects the thinking-aware
  template discussed in execution.md §5.
- **B costs ~29× A's wall clock per run** and produces 30× the output tokens,
  almost all of it thinking. That is the plan's "extra compute, not an
  equal-compute win", quantified.
- **D is not faster than C** (2.8 s vs 3.0 s median, 81 vs 79 tok/s) despite
  being the smaller quant. On this host Q3_K_M bought no speed.
- **E is the slowest non-thinking arm** (4.5 s, 53.9 tok/s) and the largest
  (7.6 GB). Its cost is a fact for the Mac memory screen, not a quality result.

Model residency changed between arms by Ollama's own LRU eviction — nothing was
force-unloaded, and no service was touched. Cold/warm is therefore mixed within
the table above and the figures should be read as arm-level wall clock, not as a
cold-start benchmark.

## 7. Units, checked against the actual responses

1 368 checks, **1 368 plausible** (`runs/track1-analysis/unit-checks.json`):
`eval_duration` is nanoseconds (generation rates land at 50–101 tok/s, not three
orders of magnitude off); measured wall ≥ reported `total_duration` on every run;
every `prompt_tokens` far below `num_ctx − 64`, so no run came near the silent
head-truncation fingerprint; chars-per-output-token plausible on all 288
non-thinking runs.

## 8. What the frozen scorer can and cannot see, measured before use

From the pre-flight selftests (`execution.md` §6). This qualifies every rate
above.

**Most seeded defects do not gate.** A missing safety-tagged number, a negated or
actor-flipped fact, a dropped uncertainty marker, an invented observation in a
section that should have read "none", and a blank section that was filled are all
**detected but only reduce the score** — they do not zero the fixture. Only F1,
F6, F7, S1/S2/S4 and a context-full prompt gate. A critical-error rate taken from
gating alone will therefore **understate** those classes, and the plan's "no new
critical error class" rule has to be applied to `safetyMisses`,
`unsupportedPhrases`, `numberFlags`, `blankOutcome` and `statedAbsenceCredit` as
well. **The adjudication of cue hits is the fresh blind scorer's, not this
worker's and not a regex's.**

**A repetition loop under 40 tokens passes.** The share check requires
`MIN_TOKENS_FOR_RADIO = 40` and the consecutive check needs 8 identical tokens in
a row; the same loop at 36 tokens was accepted with one attempt and no error.

## 9. Track2

**Not started.** No scored Track2 generation, no Spanish heldout or `corpus/`
read, no tuning on its test cases. Track1's E arm is the only arm below baseline A
on this corpus, by 2 runs in 60; whether that survives a bilingual corpus with
real run-to-run variance is exactly what Track2 exists to test, and cannot be
inferred from Track1.

## 10. Reproducing this

```sh
R=/home/villenull/.cache/apunta-model-study/2026-09-27
export PATH=/home/villenull/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH
cd "$R/snapshot" && export INIT_CWD="$R/snapshot"

# selftests (no GPU, no model contacted)
node_modules/.bin/tsx "$R/harness/selftest-scorer.ts"
node_modules/.bin/tsx "$R/harness/selftest-provider.ts"

# one arm, under the exclusive lease, absolute paths
"$R/harness/with-lease.sh" node_modules/.bin/tsx "$R/harness/tee-eval.ts" repro-A -- \
  --runs 3 --models qwen3.5:4b-q4_K_M \
  --corpus "$R/snapshot/e2e/fixtures/eval" --out "$R/runs/repro-A/report.md"

# arm-B trace equivalence against any other run
node "$R/harness/compare-traces.mjs" repro-A <armB-runId>

# cross-arm analysis
node "$R/harness/analyze-track1.mjs"
```

Frozen input hashes: `freeze/track1-freeze.txt`. Deviation log:
`harness/DEVIATIONS.md`.

---

# Track 2 — structural results (exploratory, unscored)

**Read this section as plumbing, not as findings.** Everything below is
*structural*: did an arm return a schema-valid answer, how many attempts did it
need, what did the wire say, how long did it take. **No factual quality is scored
here, no cue hit is counted as an error, and nothing in this section is a
verdict.** Adjudication of cue hits and all style scoring belong to a fresh blind
reviewer who is not the corpus author, not either reviewer, and not this worker.
No LLM is the sole judge of anything in this study.

**No Track 2 number is an official Spanish pass**, and none may be presented as a
C-EVAL@1 gate result. The corpus's dispositions are accepted as exploratory
fidelity conventions only; its es-MX register is **reviewed, not certified**.

Freeze verified before use: **11 / 11** bound hashes match; the sealed alias map
was **never opened**.

## 11. Arm matrix and coverage

**528 case-runs.** A–E on all 32 cases × 3 = 480; F on the 16 Spanish cases × 3
= 48. All under one exclusive flock, one process, one request at a time.

| Arm | Model | think | `num_predict` | cases | case-runs |
| --- | --- | --- | --- | --- | --- |
| A | `qwen3.5:4b-q4_K_M` | off | 3072 | 32 (16 en + 16 es-MX) | 96 |
| B | `qwen3.5:4b-q4_K_M` | **on** | **8192** | 32 | 96 |
| C | `apunta-study-qwen35-9b-q4:latest` | off | 3072 | 32 | 96 |
| D | `apunta-study-qwen35-9b-q3:latest` | off | 3072 | 32 | 96 |
| E | `gemma4:12b` | off | 3072 | 32 | 96 |
| F | pivot: `translategemma:4b` es→en, **A** writes, `translategemma:4b` en→es | n/a | 3072 writer / 2048 translator | 16 (es-MX) | 48 |

B's 8192 is the plan's pre-registered thinking budget (lines 102-106). A short run
of B at **3072** exists and is preserved as
`t2-B-test-np3072-BUDGET-LIMITED-DIAGNOSTIC/`; it is **not** arm B and must never
be reported as such. See `execution.md` T1.

## 12. Did each arm return a schema-valid answer?

| Arm | schema-valid | failed | mean attempts/run | final `done_reason` | `think` on the wire | `think` dropped |
| --- | --- | --- | --- | --- | --- | --- |
| A | **96 / 96** | 0 | 1.00 | `stop` ×96 | `false` ×96 | 0 |
| B | **51 / 96** | 45 | 1.94 | `stop` ×51, `length` ×45 | `true` ×186 | **0** |
| C | **96 / 96** | 0 | 1.00 | `stop` ×96 | `false` ×96 | 0 |
| D | **96 / 96** | 0 | 1.00 | `stop` ×96 | `false` ×96 | 0 |
| E | **96 / 96** | 0 | 1.00 | `stop` ×96 | `false` ×96 | 0 |
| F | **36 / 48** | 12 | — | — | n/a | n/a |

By language, and by task, for the arms that failed at all:

| Arm | en | es-MX | drafting | refine | treatment-plan | multi-note-synth |
| --- | --- | --- | --- | --- | --- | --- |
| A | 48/48 | 48/48 | 24/24 | 24/24 | 24/24 | 24/24 |
| **B** | 24/48 | 27/48 | 21/24 | 15/24 | **3/24** | 12/24 |
| C | 48/48 | 48/48 | 24/24 | 24/24 | 24/24 | 24/24 |
| D | 48/48 | 48/48 | 24/24 | 24/24 | 24/24 | 24/24 |
| E | 48/48 | 48/48 | 24/24 | 24/24 | 24/24 | 24/24 |
| **F** (es-MX only) | — | 36/48 | 12/12 | 12/12 | **0/12** | 12/12 |

### The two structural failures, stated plainly

**Arm B — the thinking arm — is the only direct arm that fails, and it fails by
running out of output budget.** 45 of 96 case-runs ended `done_reason: length`
with the thinking trace consuming the allowance: on a `treatment-plan` case it
managed **3 of 24**. This is the same mechanism Track1 found at 8192 (22 of 60
no-note runs) and at 3072 (6 of 6, preserved as the budget-limited diagnostic) —
**one mechanism, three budgets, and it does not go away at the pre-registered
one.** Refusal and failure earn no factual-quality credit, so B's remaining 51
runs must be read with this beside them, and no "B produced a note" claim is
available.

Crucially, `think: true` was on the wire for **all 186 B attempts with zero
think-dropped fallbacks**. So none of B's 51 successes is a thinking-disabled
result wearing a thinking label — the plan's condition is satisfied and verified
from the wire rather than self-reported.

**Arm F fails exactly where its output is nested JSON.** Drafting, refine and
synthesis round-trip cleanly (12/12 each). Treatment-plan is **0 of 12**: the
English goals/objectives/interventions/evidence document is translated whole, and
the translation does not come back as valid JSON. I stopped there deliberately —
repairing it would mean tuning the pivot until that column passed, which the plan
forbids. **A failed arm remains failed.** F is reported as 36/48.

## 13. Arm F — translation protocol as executed

| Item | Value |
| --- | --- |
| Frozen translation input window | **4096** estimated tokens (3.5 chars/token, the production approximation) |
| Runtime-advertised context | 131 072 — **deliberately not used**; runtime capacity is not proof of quality across it |
| Applied to | source text only, never model output |
| Chunking | paragraph-packed, never mid-paragraph; a single over-window paragraph fails the run explicitly rather than truncating |
| Chunking actually triggered | **no** — 183 translation calls, largest estimated input **229 tokens**; every case fitted one chunk. The protocol is implemented, recorded and **unexercised** |
| Stop token | `<end_ofturn>`, honoured |
| Scored against | the **original es-MX gold** on all 48 records (`goldIsOriginalSpanish: true`) |
| Recorded per record | both pivot `assembled*Sha256`, the source hash, and the gold hash |

F is a **translation-only comparator**: the writer inside the pivot is arm A. Any
fidelity loss in F is therefore attributable to the translation step, which is
the point of the arm — and it is why F must beat direct A Spanish on source
fidelity, not on style, to be selected at all.

## 14. What is deliberately absent from this section

- **No cue-hit counts.** The gold's `cues` are screening aids; a hit is a
  candidate for factual adjudication, and substring screening also fires on
  *negated* mentions of a forbidden thing, which is a disclosed false-positive
  class. Counting them as errors would be exactly the regex-only safety judgment
  this study forbids.
- **No coverage or critical-error rates.** `mustState` misses are coverage, and a
  miss is only critical where `criticalOnOmission` is not false. Those counts
  belong to the blind reviewer, who must adjudicate the flagged outputs plus a
  balanced sample of the unflagged ones.
- **No style scores.** Clarity, naturalness and format 1–5 require a fresh blind
  context.
- **No winner.** Not E, not A, not "retain 4B", not a bilingual recommendation.
  English and Spanish need separate verdicts, and the blinded preference sample
  (run 1 of all 16 scenarios per language per arm) has not been adjudicated.

**Track1 and Track2 disagree about E, and that tension is unresolved.** Track1
put E below baseline A on fabrication (11.7% vs 15.0%); Track2 shows E returning
96/96 schema-valid answers on both languages. Both are real. Track1's E runs vary
between the three runs, Track2's A/C/D/E did not need retries at all, and the two
tracks measure different things (faithfulness against a rubric vs structural
contract adherence on a synthetic paired corpus). **Track2 does not overturn
Track1**, and the decision rule's critical-error and blinded-preference criteria
have not been evaluated at all. On the evidence in hand the study's question 1
has an answer and the rest do not.

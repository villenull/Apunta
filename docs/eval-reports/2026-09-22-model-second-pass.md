# Model selection, second pass — 2026-09-22

A skeptical re-measurement of the local drafting model on the RX 9070 XT
workstation, after the first thorough comparison found no candidate better than
`qwen3.5:4b-q4_K_M`
(`docs/eval-reports/2026-09-22-thorough-model-selection.md`). Linux-only,
synthetic fixtures only, no patient data, no cloud evaluator, no remote
inference.

**Bottom line.** The first comparison's negative result was not wrong about the
models — it was wrong about the *instrument*, and it was drawn from a
difference the corpus cannot detect. The eval's headline is computed by the
shipped scorer, and on this corpus that scorer flags four of the control
model's seven "fabrications" for output that was faithful to the source. With
those attributed, the control's rate is 15% (3/20) and the 9B's is 35% (7/20) —
five of them real inventions — so **no local configuration measured here beats
the shipped `qwen3.5:4b-q4_K_M` on the corrected instrument**, and the shipped
default stands. But the reason it stands is not the one the first report gave:
the 20-fixture corpus detects a true ten-point difference 13% of the time at one
run per fixture, and the instrument's own attribution error is four fixtures on
the control, so "35% versus 45%" was never a measurement it was capable of
making. What does look improvable is the prompt, not the model: 45 of the 90
strings the scorer flags in the control's five runs are quoted in the
instruction file itself, and taking those quotes and the examples' diagnosis
language out is the one change with evidence behind it.

## Scope and method

* This is a second pass on the *evidence*, not a new product decision. Nothing
  here changes production prompts or defaults.
* Corpus, prompts and decoding were held at the production configuration
  (`e2e/fixtures/eval/`, the built-in instruction files, `temperature 0`,
  `seed 0`, `num_ctx 16384`, `num_predict 3072`, `think:false` for
  thinking-capable models, `repeat_penalty 1.0`).
* Five runs per fixture per arm, so per-fixture verdicts carry a stability
  estimate instead of a single draw.
* Every arm ran on a disposable Ollama (`127.0.0.1:11435`, `OLLAMA_NO_CLOUD=1`,
  the shared `~/.ollama/models` store). The live app on `:7717` and the live
  Ollama on `:11434` were never touched.
* Backend: Ollama `0.34.2`, bundled ROCm, device `ROCm0` = AMD Radeon RX 9070 XT
  (`gfx1201`), `total="15.9 GiB"`, `load_tensors: offloaded 34/34 layers to GPU`
  for the 4B. Per-arm residency is recorded below from `/api/ps`
  (`size == size_vram`, i.e. 100% GPU) and `ollama ps`.
* The harness (`/tmp/second-pass/harness.ts`) builds the prompt with the
  production `buildGeneratePrompt`, calls `/api/chat` with the production
  options, and scores with the production `scoreNote`. It is calibrated against
  the shipped instrument below, not merely similar to it.
* Every arm's prompt-and-decoding configuration is named in its row. Five runs
  per fixture for the arms a decision could rest on (control, the prompt
  variants, the decontamination variants); one run per fixture for the screens
  (precision, other families, thinking mode), which is enough because the
  five-run arms showed zero verdict changes across runs. The thinking-mode arms
  run one run per fixture over a six-fixture subset (01, 05, 09, 10, 16, 17) —
  the fixtures that carry the failure modes — because a thinking trace makes a
  draft 20–40× slower.
* Raw material kept: every arm's sections, per-run stats and scorer verdicts as
  JSON (`/tmp/second-pass/arm-*.json`), the rendered reports, the decontaminated
  instruction files, the per-arm `/api/ps` residency, and the hand audit as
  `audit.json`. They are in `/tmp` and are not part of the commit.

## 1. The instrument, first

The eval's fabrication number is not judged by a model. `server/src/eval/score.ts`
is entirely deterministic: a run counts as fabricated when it has

1. an **F1** hit — a banned string from the fixture's `mustNotContain` list,
2. a **gating F6** hit — a conclusion marker ("consistent with", "indicates",
   "suggests", …) inside a section the fixture marks `noConclusion`, or
3. a **novel diagnosis/risk term** — a term from
   `e2e/fixtures/eval/lexicon/clinical-terms.txt` matched in the note and not
   in the source (F7).

F5, C3, H3 and T5 are human criteria; their 12 points are withheld, never
granted. So there is no small-model judge to flatter or penalise longer drafts,
and no LLM in the loop at all. That hypothesis is dead on arrival — but the
deterministic scorer has its own biases, and they turned out to be the largest
single term in the comparison.

### Calibration: the harness *is* the shipped instrument

Same machine, same model, same configuration, three independent runs:

| Run | Fabrication | Gated fixtures | Safety facts | Salient facts (C1) | Novel dx/risk fixtures | Marker kept |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| published 2026-09-22 report | 35.0% (7/20) | 05,06,09,10,15,16,17 | 70.0% | 80.2% | 4 | 66.7% |
| `npm run eval` re-run, this session | 35.0% (7/20) | 05,06,09,10,15,16,17 | 70.0% | 80.6% | 5 | 100.0% |
| harness, this session | 35.0% (7/20) | 05,06,09,10,15,16,17 | 70.0% | 79.2% | 4 | 66.7% |

The headline and the gating set reproduce exactly. The *sub-scores* do not:
salient-fact coverage moved 1.4 points and "marker kept" moved from one run to
the next. At `temperature 0`, `seed 0`, that is GPU-side non-determinism, and it
is the reason the per-fixture detail of a single run must not be read as a
property of the model.

### Hand audit of the control's seven flags

Every flag the control produced, read against its fixture source:

| Fixture | Flag as shipped | What the source says | Verdict |
| --- | --- | --- | --- |
| 05 | F7 novel risk: "safety concern" | The source never mentions safety at all | **real** — the banned silence-as-negative-finding inversion |
| 06 | F7 novel risk: suicidal/homicidal ideation (×4) | `denies SI, denies HI`; the fixture's own `mustCapture` **requires** the denial | **artefact** — the note expanded an abbreviation |
| 09 | F1 "family history", "no medical", "no substance" | "I don't have family history, I don't have medical, I don't have substance use" — she lacks the *information* | **real** — missing information written as negative findings |
| 10 | F1 "three years" | "she corrected herself … more like five … the three years was just when she started noticing it. so: five years" | **real, carried** — the withdrawn number survives, with its correction |
| 15 | F7 novel risk: suicidal/homicidal ideation (×4) | `denies SI, denies HI, asked both`; also required by `mustCapture` | **artefact** |
| 16 | F1 pronoun "he"; F7 "suicidal ideation" | The "he" is the **father** ("any treatment he received"); "SI" is in the source | **artefact** (both) |
| 17 | F6 core "consistent with" | "flat, but not more flat than last time. Same as last time." | **artefact** — "consistent with previous sessions" compares her with herself; no condition is named |

Four of seven. Two of them (06 and 15) zero fixtures whose own expectation file
requires the content the scorer penalises — the corpus contradicts itself. The
control's real rate is 3/20 = **15%**, not 35%.

### The corpus contradicts itself on risk vocabulary

`e2e/fixtures/eval/expectations.md` for fixture 06: *"Must capture … Denies
suicidal ideation; denies homicidal ideation; no change in alcohol use."*
The source spells it `denies SI, denies HI`. The lexicon carries
`suicidal ideation` and `homicidal ideation` as `risk` terms and has no
abbreviation entry, so a note that does exactly what the expectation asks is
scored as inventing two risk terms — and a novel `risk` term gates the fixture,
zeroing it. Fixtures 15 and 16 have the same shape. This is not a subtle
mis-calibration; it is the fixture author and the scorer disagreeing about the
same sentence, and it fires on every model that writes the note out in full.

### The same result, mechanically

The hand audit is a judgement call, so here is the same question answered
without judgement, from the source text alone — every gating flag the control
produced across its five runs, classified by whether the flagged string is
present in the fixture's own source:

| Arm | Gated fixtures | F1 hits | span in source | span absent | pronoun trap | F7 dx/risk hits | … abbreviation expansion | … candidate invention | F6 hits | … non-diagnostic |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `qwen3.5:4b-q4_K_M` | 7 | 25 | 10 | 10 | 5 | 60 | 50 | 10 | 5 | 5 |

Counts are across five runs per fixture. Read per run, the control produces five
F1 hits (two of them a string the source contains, two a string it does not, one
the pronoun trap), twelve novel diagnosis/risk terms (ten of them the long form
of an abbreviation the source itself uses) and one F6 hit (which is a
comparison, not a conclusion). "Span absent" is not automatically an invention
— fixture 09's "no medical" is absent from the source because the source says
*"I don't have medical"*, which is the whole point of that trap — so the hand
audit above remains the authority and this table is the audit's arithmetic.

One more thing the mechanical pass turns up: `rubric.md` §10 defines the
headline as "fraction of runs with any F1 hit or gating F6 hit". The shipped
`report.ts` also counts a novel diagnosis/risk term. The code is the defensible
reading (§3 calls that "an F1-class gating fabrication"), but the published
numbers are computed on a definition the rubric does not state, and on this
corpus that term alone accounts for four of the control's seven gated fixtures.

### The blind spot that matters most for a prompt experiment

The corpus scores what a note *adds* and never asks whether the note is a note.
A model that pastes the source into the sections has no novel vocabulary for F7
to catch, no invented phrase for F1 to catch, and near-perfect salient-fact
coverage. `rubric.md`'s own report text warns about exactly this ("a model that
dumps the transcript into every section aces this and should be losing the
points back above") and nothing scores it.

It is measurable, and it turns out to be the thing that separates the prompt
variants below. Two independent measures, on the same five runs:

| Arm | Note sentences ≥8 words found verbatim in the source | Longest verbatim run | F8 novel content words /100w (the corpus's own diagnostic, unscored) |
| --- | ---: | ---: | ---: |
| `qwen3.5:4b-q4_K_M`, production prompts | 1% | 11 words | 60.2 |
| `qwen3.5:4b-q4_K_M`, neutral prompts | 16% | 68 words | 28.0 |
| `qwen3.5:9b`, production prompts | 1% | 28 words | 53.5 |
| `qwen3.5:9b`, neutral prompts | **54%** | **99 words** | **14.6** |

F8 already tracks it: a note built out of the source's own sentences has little
novel vocabulary, and F8 is printed in every report and scored by nothing. A
floor on F8 — or the copy share above — would have caught the failure the
fabrication headline rewarded.

### What the scripted score cannot see

F5 (an unsupported inference built only from the clinician's own words), C3
(salient material the fact list did not anticipate), H3 (over-hedging) and T5
(register) are human criteria, and their 12 points are withheld rather than
granted — every arm's total is out of 88, not 100. That is honest for a single
model's report and dangerous for a *comparison*, because the withheld criteria
are exactly the ones a more fluent model is most likely to fail: a note that
assembles a plausible causal claim from her own words passes every scripted
check. Nothing here reads a single note against those four criteria; the
per-fixture tables and the stored sections are the material for that read, and
they are the reason this report keeps its raw sections rather than only its
scores. Two further gaps are measured above: nothing catches a note that pastes
the source, and F1 matches its banned strings without context in either
direction.

### The pronoun trap catches the wrong person

Fixture 16's `mustNotContain` includes
`\b(?:he|him|his|she|her|hers)\b`, because "the transcript never assigns the
patient a gender". The control wrote *"Patient describes their father as having
'a temper' but is unaware of any treatment **he** received"* — a pronoun whose
referent is the father, whom the source itself named. The pattern cannot tell
the two apart, and the hit is gating.

### F6 fires on a comparison, not a conclusion

"consistent with" is on the core marker list because it usually introduces a
diagnostic claim ("consistent with panic attacks"). In fixture 17 the control
wrote *"Patient appeared emotionally flat, consistent with previous sessions"* —
a restatement of the source's own "Same as last time". The marker's object is a
time, not a condition. The scorer sees only the marker.

### n = 20, repeatability, and what the corpus can resolve

The first thing to establish is that the eval is *not* noisy within a session.
Five runs per fixture, at `temperature 0` and `seed 0`, produced **identical
gating verdicts on all 20 fixtures in every arm measured here** — the control,
the control with the neutral prompt, the 9B, and the 9B with the neutral prompt
all gated the same fixtures on 5/5 runs, with zero unstable fixtures. Run-to-run
variance is not what limits this instrument.

What does limit it:

* **Granularity.** One fixture is five percentage points and a fixture is
  all-or-nothing: there is no partial credit at the headline.
* **Session-to-session drift in the detail.** The same configuration re-run in
  a fresh process kept the same seven gated fixtures but moved sub-scores:
  salient-fact coverage 80.2% → 80.6% → 79.2%, "marker kept" 66.7% → 100%,
  novel-diagnosis/risk *fixture* count 4 → 5, medication flags 1 → 2. The
  headline is reproducible; a one-fixture change in it could come from that
  drift alone.
* **Systematic attribution error.** Four of the control's seven flags are
  scorer artefacts (above). That is 20 points of a 35-point headline — four
  times the size of the two-fixture difference the first comparison turned on.

Wilson 95% intervals for the two numbers that comparison rested on: 7/20 →
18–56%, 9/20 → 26–65%. They overlap almost completely. Treating the corpus as
a sample of sessions (it is a fixed set of twenty hand-built cases, so this is
a "what if the corpus had been drawn differently" exercise) and resampling
fixtures with a cluster bootstrap, the 9B sits +5 pp from the control with an
interval of −25 to +35 pp.

Modelling each fixture as a Bernoulli draw at its observed rate (Beta(1,1)
posterior, a floor of 5% flip probability) and asking how often a two-arm
cluster-bootstrap comparison calls a difference:

| True difference | 1 run/fixture | 3 runs | 5 runs |
| ---: | ---: | ---: | ---: |
| 5 pp | 8% | 13% | 19% |
| 10 pp | 13% | 27% | 53% |
| 15 pp | 24% | 48% | 74% |
| 20 pp | 33% | 67% | 88% |
| 30 pp | 51% | 93% | 99% |

False-positive rate at a true difference of zero: 7% at one run, 5% at five.
The first comparison's decisive margin was 35% vs 45% — a 10-point difference,
detected 13% of the time at one run per fixture. **The corpus could not detect
the difference the decision was made on**, and no number of extra runs fixes
that: runs do not vary, the *fixtures* are the sample. Resolving a 10-point
difference at 80% power needs on the order of 60–80 fixtures, or five runs per
fixture plus an acceptance that the result is about these twenty cases and no
others.

## 2. Prompt fit: is the gap prompt overfitting?

The prompts were iterated on the 4B, so the obvious suspicion is that a bigger
model is being held back by instructions tuned to a smaller one. Three variants,
each measured against the same five-run production baseline:

| Arm | Instructions | User turn | Fabrication (shipped) | … (proposed) | Audited failures | Safety facts | Salient facts | Verbatim copy | Mean draft |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `qwen3.5:4b-q4_K_M` control | production | production | 35% (7/20) | 15% (3/20) | **15% (3/20)** | 70% | 80% | 1% | 1.91 s |
| `qwen3.5:4b-q4_K_M` source-first | production | rule above the source | 25% (5/20) | 15% (3/20) | **10% (2/20)** | 70% | 81% | 1% | 1.93 s |
| `qwen3.5:4b-q4_K_M` neutral | minimal, model-neutral, no examples | production | 20% (4/20) | 20% (4/20) | 15% (3/20) | 65% | 85% | **16%** | 2.08 s |
| `qwen3.5:9b` control | production | production | 40% (8/20) | 40% (8/20) | **35% (7/20)** | 65% | 85% | 1% | 2.73 s |
| `qwen3.5:9b` source-first | production | rule above the source | 25% (5/20) | 25% (5/20) | **20% (4/20)** | 65% | 82% | 5% | 2.52 s |
| `qwen3.5:9b` neutral | minimal, model-neutral, no examples | production | 15% (3/20) | 15% (3/20) | 15% (3/20) | 80% | 88% | **54%** | 3.42 s |

The minimal variant is the production instructions reduced to nine rules with no
worked examples and no quoted examples of banned wording: 1,255 characters
against the SOAP file's 6,793 and the intake file's 8,040. The source-first
variant keeps the production instructions and prepends one rule to the user
turn, directly above the source:

> Read the source material below and write the note from it. Use only what it
> contains: no symptom, behavior, observation, diagnosis, risk statement,
> medication, number, date or quotation it does not. Route each fact to the
> section it belongs to, and leave a section empty rather than fill it from
> another. No interpretation, causality or conclusion that she did not write.

**The neutral variant's headline is a trap.** It scores the 9B at 15% with 80%
safety facts — better than the control on both clauses of the promotion gate —
and it is not a better model, it is a model that stopped writing notes. The 9B
under the neutral prompt pastes the source: **54% of its long sentences appear
verbatim in the source, with a longest verbatim run of 99 words**, against 1%
for every production arm. Fixture 10's History is the transcript with the line
breaks taken out ("she said three years on and off then later corrected herself
to say actually if she is honest it is more like five since the divorce … i
think she said her mother had depress…"). Copying produces no novel vocabulary,
so F7 never fires; copying invents nothing, so F1 never fires; copying misses
nothing, so salient-fact coverage rises. This is the failure the corpus's own
report text warns about and does not score. The corpus's F8 diagnostic
(novel content words per 100 words) already tracks it — 14.6 for 9b-neutral
against 53.5 for 9b-production — and is printed, unscored.

**The source-first placement is a real, modest improvement for the 9B**, and it
keeps it drafting (5% copy, 1% for the control). It halves the 9B's gated
fixtures, 8 → 5, and the fixtures it clears are exactly the inventions the
production prompt induced: fixture 08's diagnosis upgrade (the source says
"this looks like generalized anxiety"; the production arm wrote "generalized
anxiety **disorder**", the example's wording), fixture 14's "insomnia" for
waking at three or four, and fixture 19's "compulsions". Its safety-fact rate is
unchanged at 65%, below the control's 70%, so it does not pass the gate either —
but it says the 9B's deficit is partly placement, not capability.

**Verdict on overfitting: the prompt is not holding a bigger model back, and
stripping it makes things worse.** The 4B's own numbers get *worse* overall
without the production instructions — the neutral prompt makes it return an
empty note on fixture 01 (all four sections `""`, 30 output tokens, 5/5 runs,
0/88 against the control's 77/88) and keeps the retracted cadence discussion in
fixture 04 (5/5 runs, 0/88 against 85/88). Both are what the worked examples
carry: the second SOAP example demonstrates an empty Objective for a dictation
with no observations, and the owner's example demonstrates a retraction. Removing
the examples removes the demonstrations, and the 4B copies the pattern it can
see. The tuned instructions are load-bearing for exactly the behaviour the eval
rewards; they are not 4B-specific in any way that a bigger model could be
escaping.

### The contamination the examples do carry

The instruction files list the banned strings *as strings*. The SOAP progress
file says:

> Risk language of any kind, including "denies suicidal ideation", "no safety
> concerns", "no acute risk indicators".

The intake file says:

> Negative findings. "No prior therapy", "denies substance use", "no family
> history", "denies suicidal ideation", "no safety concerns" are clinical
> assertions …

and its first worked example ends with

> "Formulation": "Symptoms consistent with generalized anxiety disorder, likely
> precipitated by the recent work transition."

Of the 4B control's 90 flagged strings across five runs, **45 appear verbatim in
the instruction file for that fixture's format**: "safety concern" (05),
"suicidal ideation" (06, 15, 16), "family history" (09), and the rest of 09's
inversion list. The 9B's gating diagnosis on fixture 08 is the intake example's
own "generalized anxiety disorder". Under the neutral prompt the same 4B produced
**0** prompt-derived flags of 30. The models are writing back what the prompt
told them not to write — the negative example list is doing the work of a
positive example.

That is a prompt defect with a surgical fix, and it is the one prompt change
worth making. Two variants were built from the shipped files with nothing but:

1. the two negative-example lists rewritten as descriptions of the category,
   with no quoted banned strings;
2. the diagnosis and F6 conclusion markers taken out of the worked examples
   ("responding well to the current CBT approach" → "considered the CBT work
   effective so far"; "Symptoms consistent with generalized anxiety disorder" →
   "the therapist's provisional impression was an anxiety presentation");
3. one bullet added: a topic she says she did not gather is recorded as not
   gathered, never as a negative finding about the patient.

Voice rules, section rules, the "None." convention, the empty-section rule and
the retraction rule are untouched. The diffs are in "Proposed instruction
diffs" below. Measured (five runs per fixture, production prompt shape, the
decontaminated text as the only change):

| Arm | Fabrication (shipped) | … (proposed) | Audited failures | Inventions | Safety facts | Salient facts | Verbatim copy | 01 | 04 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| `qwen3.5:4b-q4_K_M`, shipped instructions | 35% (7/20) | 15% (3/20) | 15% (3/20) | 2 | 70% | 80% | 1% | 77/88 | 85/88 |
| `qwen3.5:4b-q4_K_M`, decontaminated | **15% (3/20)** | 15% (3/20) | **5% (1/20)** | **0** | **70%** | 79% | 0% | 77/88 | 85/88 |
| `qwen3.5:9b`, shipped instructions | 40% (8/20) | 40% (8/20) | 35% (7/20) | 5 | 65% | 85% | 1% | 88/88 | 87/88 |
| `qwen3.5:9b`, decontaminated | **20% (4/20)** | 20% (4/20) | 20% (4/20) | 2 | 65% | 83% | 1% | 88/88 | 87/88 |

The control's decontaminated run is the clearest result in this report. The
headline falls from 35% to 15% *on the shipped scorer*, with no scorer change
involved at all: the four attribution artefacts (06, 15, 16, 17) and the
fixture-05 invention ("No safety concerns were expressed") all disappear. The
two fixtures the worked examples were carrying are untouched — fixture 01 is
77/88, byte-identical in score to the control, and fixture 04 is 85/88 — the
safety-fact rate is identical at 70%, and there is no copying (0%). The three
fixtures that still gate are 09 (whose flagged sentence is now the faithful
"declined further exploration of family history …" rather than the inversion),
10 (the withdrawn "three years" survives) and 20 (an F6 marker used about an MRI
result). One real failure, no inventions.

The 9B improves the same way, from 40% to 20% on the shipped scorer: it loses
the production-prompt diagnosis upgrade on fixture 08, the "insomnia" on 14 and
the fire-alarm causal claim on 03, and keeps only the fixtures where it renames
what the client described ("anger management", "hand-washing compulsions") plus
the withdrawn-number and context-blind cases. Its safety-fact rate is unchanged
at 65%, so it still does not pass the gate.

**The size is not resolvable; the mechanism is.** One fixture against three is
inside the corpus's resolution (section 1), so this is not "a 10-point
improvement, measured". What is measurable is the mechanism: the flagged strings
in the control are the prompt's own words, they vanish when the prompt stops
quoting them, and the two behaviours the examples demonstrably carried — terse
input and retraction — do not regress. That is the evidence the change should be
taken to the owner on.

### Audited verdicts, arm by arm

Five runs per fixture, and the verdicts did not vary within a run set (every
fixture below gated 5/5 or 0/5 in every arm), so the numbers are the arm's
behaviour rather than a draw from it. "Carried" means the note contains source
material the corpus excludes but did not invent anything; "invention" means it
asserted something the source does not support.

| arm | shipped scorer | proposed scorer | audited failures | of which inventions | fixtures still flagged |
| --- | ---: | ---: | ---: | ---: | --- |
| 4b-control | 35% (7/20) | 15% (3/20) | **15% (3/20)** | 2/20 | 05(real), 09(real), 10(carried) |
| 4b-decontam | 15% (3/20) | 15% (3/20) | **5% (1/20)** | 0/20 | 09(artefact), 10(carried), 20(artefact) |
| 4b-sourcefirst | 25% (5/20) | 15% (3/20) | **10% (2/20)** | 2/20 | 03(real), 09(real), 20(artefact) |
| 4b-neutral | 20% (4/20) | 20% (4/20) | **15% (3/20)** | 0/20 | 04(carried), 07(carried), 09(artefact), 18(carried) |
| 4b-q8 | 30% (6/20) | 30% (6/20) | **30% (6/20)** | 6/20 | 03(real), 07(real), 08(real), 09(real), 10(real), 20(real) |
| 9b | 40% (8/20) | 40% (8/20) | **35% (7/20)** | 5/20 | 03(real), 07(carried), 08(real), 09(artefact), 10(carried), 14(real), 16(real), 19(real) |
| 9b-decontam | 20% (4/20) | 20% (4/20) | **15% (3/20)** | 2/20 | 09(artefact), 10(carried), 16(real), 19(real) |
| 9b-sourcefirst | 25% (5/20) | 25% (5/20) | **20% (4/20)** | 1/20 | 03(carried), 07(carried), 09(artefact), 10(carried), 16(real) |
| 9b-neutral | 15% (3/20) | 15% (3/20) | **15% (3/20)** | 3/20 | 04(real), 09(real), 10(real) |
| 9b-q8 | 30% (6/20) | 30% (6/20) | **30% (6/20)** | 6/20 | 03(real), 08(real), 10(real), 14(real), 16(real), 19(real) |
| gemma3-12b | 25% (5/20) | 25% (5/20) | **20% (4/20)** | 0/20 | 03(carried), 07(carried), 09(artefact), 10(carried), 18(carried) |
| phi4-14b | 25% (5/20) | 25% (5/20) | **20% (4/20)** | 3/20 | 08(real), 09(artefact), 10(real), 18(carried), 19(real) |
| 14b | 40% (8/20) | 40% (8/20) | **30% (6/20)** | 4/20 | 07(carried), 08(real), 09(artefact), 10(real), 14(real), 16(real), 17(artefact), 18(carried) |

The control's two inventions are the ones a therapist would care about: fixture
05's "No safety concerns were expressed" on a session that never mentioned
safety, and fixture 09's conversion of "I don't have family history, I don't
have medical, I don't have substance use" into "Patient reported no family
history, no prior treatment, no medical conditions, and no substance use".

### The three scorer fixes, as a proposal

`server/src/eval/score.ts` now carries three attribution rules (uncommitted, for
review):

1. **`sourceForLexicon`** — a closed map from a clinical abbreviation in the
   source (`SI`, `HI`, `AUD`, `MDD`, `GAD`, `OCD`, `PTSD`, `ADHD`) to the long
   forms the lexicon knows, appended to the source text used by F7 and F4.
   Nothing is removed, so this can only unflag a term whose expansion is
   literally in the source.
2. **Patient-pronoun attribution** — the pronoun trap is recognised as a trap
   and routed through a check that attributes the pronoun: a gendered pronoun
   whose sentence already names a third party (father, partner, manager …) and
   which does not modify that noun is not the patient's. A possessive that
   attaches a third party to the patient ("her partner") still fires.
3. **Non-diagnostic marker use** — an F6 core hit whose object is a time, a
   session, or the patient's own prior state ("consistent with previous
   sessions", "same as last week") is not a conclusion about a condition.

Effect, on stored sections, no GPU involved — the same runs re-scored:

| Arm | Shipped scorer | Proposed scorer | Audited by hand |
| --- | ---: | ---: | ---: |
| `qwen3.5:4b-q4_K_M` control | 35% (7/20) | 15% (3/20) | **15% (3/20)** |

The three that survive are exactly the three I classified as real by hand, which
is the check that the rules are attributing rather than excusing. `npm run
eval -- --fake` still deflects (36 banned-string runs, 27 gating F6, 36 filled
blanks, 18 clean), and the eval suite passes with the new cases
(`npx vitest run src/eval/eval.test.ts`, 32 tests).

The remaining question for a reviewer is whether these three should be fixed in
the scorer or in the corpus. The abbreviation one is unambiguous — the corpus's
own `mustCapture` demands the content. The pronoun one could be fixed in the
fixture instead, by narrowing the pattern to sentences with no named third
party, but the attribution belongs in the scorer because the same trap will be
written again for the next patient who is "they". The marker one is a judgement
call: the shipped rubric says the marker list is the contract, and narrowing it
to diagnostic objects is a change to what F6 measures.

A fourth defect is real and left unfixed, because it needs a different
mechanism: F1's banned strings are matched without context, so a faithful
sentence that *uses* the banned string in the right frame is scored as if it
asserted it. Fixture 09 is the case: "Patient stated they are not ready to
discuss background topics including family history …" and "I don't know if
anything medical has been ruled out" are the clinician's own words, and both
gate the fixture. Excusing them needs a "not gathered / unknown" frame detector
beside the pattern, which is a bigger change than the three above and belongs
with the fixture author.

## 3. Thinking mode

All four thinking-capable tags here (`qwen3.5:4b-q4_K_M`, `qwen3.5:9b`,
`qwen3:14b`, and the 8B/9B Q8_0 siblings) advertise `capabilities: thinking`,
and the production provider sends `think: false` for them (it omits the field
for the others). The arms below send `think: true` with everything else
identical — same prompt, `temperature 0`, `seed 0`, `num_ctx 16384`,
`num_predict 3072` — and parse only `message.content`, so the trace is stripped
exactly as the app strips it. The trace shares the `num_predict` ceiling with
the answer, which is the production behaviour and is why truncation counts are
reported.

| Arm | Model | Runs | Fabrication | Safety facts | Mean wall | Thinking runs | Mean trace chars | Truncated |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `9b` | `qwen3.5:9b`, think off | 5 | 40% (8/20) | 65% | 2.73 s | 0 | 0 | 0 |
| `9b-think` | `qwen3.5:9b`, think on | 1 (6 fixtures) | 0% (0/6) | 50% (3/6) | 39.66 s | 6/6 | 13,224 chars | **5/6** |
| `4b-think` | `qwen3.5:4b-q4_K_M`, think on | not run | — | — | — | — | — | — |
| `14b` | `qwen3:14b`, think off | 1 | 40% (8/20) | 65% | 4.43 s | 0 | 0 | 0 |
| `14b-think` | `qwen3:14b`, think on | 1 (6 fixtures) | 50% (3/6 gated) | 67% (4/6) | 15.15 s | 6/6 | 2,594 chars | 0/6 |

**Thinking mode is unusable at the production output ceiling.** On the six-fixture
subset the 9B with `think: true` produced a mean trace of 13,224 characters, and
because the trace and the answer share `num_predict: 3072`, **five of the six
drafts were truncated** (`done_reason: length`) and came back with no usable
note. Mean wall clock 39.66 s against 2.73 s — **14.5× slower** — and the safety
denominator fell to 3/6.

The 14B's trace is a different animal: 2,594 characters on average, nothing
truncated, and 15.15 s a draft against 4.43 s with thinking off — 3.4× slower for
a marginal gain (it clears fixture 16's "anger management" naming and still
gates 09, 10 and 17 on the subset). The 4B's thinking arm was dropped from the
plan when the budget was cut; its two rows above are the only unmeasured cells in
this report.

Note what the headline does with that: a truncated run has no note content, so it
has no F1 string, no F6 marker and no novel vocabulary, and the fabrication rate
reads **0%**. The gating that catches it is `S4 every section blank`, which does
not count as fabrication. So "thinking mode: 0% fabrication" is an artefact of
the instrument's own definition, not a result — the run failed. Making thinking
usable would mean raising `num_predict` above the trace's length, which changes
the production decoding contract and the KV budget the 16K window is sized for.

## 4. Higher precision on the same model

`qwen3.5:4b` has no published `fp16` tag (the registry manifest for
`qwen3.5:4b-fp16` answers 404), so `qwen3.5:4b-q8_0` (5.3 GB) and
`qwen3.5:9b-q8_0` (10 GB) are the highest published precisions. Both are the
same weights and the same prompt; only the quantization changes, and full
offload is confirmed per arm from `/api/ps` (`size == size_vram`).

| Arm | Model | Runs | Fabrication (shipped) | … (proposed) | Audited failures | Safety facts | Salient facts | Mean draft | Decode tok/s | VRAM |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `4b-control` | `qwen3.5:4b-q4_K_M` | 5 | 35% (7/20) | 15% (3/20) | **15% (3/20)** | 70% | 80% | 1.91 s | 107.4 | Q4_K_M, 100% |
| `4b-q8` | `qwen3.5:4b-q8_0` | 1 | 30% (6/20) | 30% (6/20) | 30% (6/20) | 65% | 81% | 2.73 s | 84.2 | Q8_0, 100% |
| `9b` | `qwen3.5:9b` | 5 | 40% (8/20) | 40% (8/20) | 35% (7/20) | 65% | 85% | 2.73 s | 78.7 | Q4_K_M, 100% |
| `9b-q8` | `qwen3.5:9b-q8_0` | 1 | 30% (6/20) | 30% (6/20) | 30% (6/20) | 65% | 84% | 4.04 s | 55.4 | Q8_0, 100% |

**Higher precision is not free accuracy — it is worse on both axes.** The 4B at
Q8_0 fails six audited fixtures against the Q4 control's three, at 1.4× the
draft time and 79% of the decode rate; the 9B at Q8_0 fails six against the Q4
9B's seven but is 1.5× slower, and both Q8 arms lose safety-fact coverage (65%
against 70% for the 4B). Every flag in both Q8 arms is a real one — no
abbreviation, pronoun or marker artefacts — so this is not the scorer talking:
the extra VRAM buys nothing, and the Q4_K_M weights are the better trade at the
production window. Both Q8 models are still 100% resident in VRAM at
`num_ctx 16384`, so the result is not an offload artefact.

## 5. Other families that fit in 16 GB

Library tags were checked before anything was pulled: every tag below answered
HTTP 200 on `registry.ollama.ai/v2/library/<name>/manifests/<tag>`, was then
pulled with `ollama pull`, and its identity confirmed with `ollama show`. No
`:cloud`, `-cloud` or other remote-inference tag is involved.

| Tag | Parameters | Quantization | Context | Capabilities | Pulled size |
| --- | ---: | --- | ---: | --- | ---: |
| `qwen3.5:4b-q4_K_M` (control) | 4.7B | Q4_K_M | 262144 | completion, vision, tools, thinking | 3.4 GB |
| `qwen3.5:4b-q8_0` | 4.7B | Q8_0 | 262144 | completion, vision, tools, thinking | 5.3 GB |
| `qwen3.5:9b` | 9.7B | Q4_K_M | 262144 | completion, vision, tools, thinking | 6.6 GB |
| `qwen3.5:9b-q8_0` | 9.7B | Q8_0 | 262144 | completion, vision, tools, thinking | 10 GB |
| `qwen3:14b` | 14.8B | Q4_K_M | 40960 | completion, tools, thinking | 9.3 GB |
| `gemma3:12b` | 12.2B | Q4_K_M | 131072 | completion, vision | 8.1 GB |
| `phi4:14b` | 14.7B | Q4_K_M | 16384 | completion | 9.1 GB |
| `mistral-small3.2:24b` | 24.0B | Q4_K_M | 131072 | completion, vision, tools | 15 GB |

`gemma3:12b` and `phi4:14b` are the two established cross-family instruction
followers that fit comfortably; `mistral-small3.2:24b` is the newest Mistral
small and the only candidate whose Q4 weights (15 GB) may not leave room for a
16K KV cache in 16 GB of VRAM, which is itself the finding if it does not.

| Arm | Model | Runs | Fabrication (shipped) | … (proposed) | Audited failures | Safety facts | Salient facts | Verbatim copy | Mean draft | VRAM |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `gemma3-12b` | `gemma3:12b` | 1 | 25% (5/20) | 25% (5/20) | 25% (5/20) | 70% | 83% | 1% | 4.49 s | Q4_K_M, 100% |
| `phi4-14b` | `phi4:14b` | 1 | 25% (5/20) | 25% (5/20) | 25% (5/20) | 70% | 79% | 1% | 3.96 s | Q4_K_M, 100% |
| `14b` | `qwen3:14b` | 1 | 40% (8/20) | 40% (8/20) | 40% (8/20) | 65% | 85% | 1% | 4.43 s | Q4_K_M, 100% |
| `mistral-24b` | `mistral-small3.2:24b` | 1 | 20% (4/20) | 20% (4/20) | 20% (4/20) | 65% | 83% | 1% | 14.34 s | see residency |

Both cross-family candidates land at 25% shipped, and hand-audited they come
apart: **gemma3:12b fails four fixtures but invents nothing** — every one of its
flags is a source aside carried into the note (the fire alarm, the thermostat,
the movie, the elevator) plus the withdrawn "three years", and its fixture-09
sentence is the faithful "No family history, prior treatment, medical history …
was obtained" — while **phi4:14b fails four and invents three**, including the
instruction example's own "Symptoms consistent with generalized anxiety
disorder" on fixture 08. Neither beats the decontaminated 4B, and both cost
about 2.4× its draft time (4.49 s and 3.96 s against 1.91 s) at 100% VRAM
residency, so neither is a candidate to ship; gemma3:12b is the only
cross-family point that matches the control's *invention* count of zero.

`mistral-small3.2:24b` is out on the hardware itself: at `num_ctx 16384` its
18.3 GB of weights and cache do not fit in 16 GB of VRAM — `/api/ps` reports
14.9 GB resident and `ollama ps` reports **19%/81% CPU/GPU** — so it runs partly
on the CPU at **14.34 s a draft**, 7.5× the control, and it still fails four
fixtures (20% shipped; not hand-audited, so that is an upper bound). That is the
same answer the first comparison gave for the 14B on a smaller card: a 24B at
Q4 does not belong on this GPU at the production window, whatever its quality. The 14B is worse than either at 40%, slower again, and
carries the broadest failure set of any arm measured (07, 08, 09, 10, 14, 16,
17, 18) — the same verdict the first comparison reached, now on an instrument
that no longer rewards the 4B for the wrong reason.

## 6. Speed: what the GPU actually buys

Quality is the gate, so this section only matters if nothing wins on quality.
Three measurements, all on the same disposable service:

* **Decode rate per arm** — from the eval runs themselves (tokens/s over the
  whole arm, five runs per fixture).
* **Prefill at the brainstorm budget** — a synthetic prompt of about 12,000
  tokens (Brainstorm's ceiling is 13,824 at the default window), with a 64-token
  answer, so prompt evaluation is what is being timed.
* **The same prefill on the CPU** (`options.num_gpu = 0`) — the only honest way
  to say what the GPU is worth on this machine.
* **Refine latency** — the production refine prompt with a note plus a full
  prior-note background, the shape the app sends when the therapist asks a
  question mid-note.

The answer this section is looking for is whether the GPU buys something the CPU
did not: a 16K window that stays fully resident, a 12K-token prompt evaluated in
a second rather than a minute, and a draft whose cost does not grow with the
length of the patient's history. If it does, that is a real improvement in the
product even where the models are not better — Brainstorm reads every note that
fits, and the refine chat re-sends the note plus its background on every turn,
so prompt evaluation is the app's dominant cost on a long history. The numbers
are below; the comparison that matters is the same prompt, same model, same
window, once with `num_gpu` defaulted and once with `num_gpu: 0`.

| Probe | Backend | Prompt tokens | Prefill | Prefill rate | Decode rate | Total |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `qwen3.5:4b-q4_K_M`, 12k-token prompt, cold | GPU (ROCm0) | 8,857 | 2.82 s | **3,144 tok/s** | 29.3 tok/s | 7.81 s |
| same prompt again, resident and cached | GPU (ROCm0) | 8,857 | 0.05 s | 177,477 tok/s (prefix cache) | 34.9 tok/s | 1.93 s |
| same prompt, `num_gpu: 0` | CPU (8 cores) | 8,857 | 52.55 s | **168.5 tok/s** | 15.4 tok/s | 64.77 s |

**The GPU buys 18.7× on prompt evaluation**, and that is the cost that matters
for this app: Brainstorm sends up to 13,824 tokens of the patient's history on
every turn and the refine chat re-sends the note plus its background, so a
12k-token prompt that costs 2.8 seconds of prefill on the GPU costs 53 seconds
on the CPU before the first token appears. The second GPU row is the prefix
cache doing its job — the same prompt re-sent costs 0.05 s — which is why the
refine chat's prefix ordering (background before note) is worth what it costs.
Decode is the lesser half of the story and is not measured well here (the probe
asks for 64 tokens, so its rate is noisy); the eval's own arms measure it over
full notes at 107 tok/s for the 4B, 79 for the 9B, 57 for gemma3:12b and 54 for
the 14B.

## Before and after: every arm under the shipped scorer and the proposed one

The same stored sections, scored twice — once by the shipped `scoreNote`, once by
the proposed one. No GPU is involved in the second column, which is the point:
the fixes are a re-reading of evidence already collected, not a new measurement.
"Audited" is the hand verdict from the tables above: an entry is an artefact when
the flagged sentence is faithful, "carried" when the note holds source material
the corpus excludes, and real otherwise.

| arm | shipped scorer | proposed scorer | audited failures | of which inventions | fixtures still flagged |
| --- | ---: | ---: | ---: | ---: | --- |
| 4b-control | 35% (7/20) | 15% (3/20) | **15% (3/20)** | 2/20 | 05(real), 09(real), 10(carried) |
| 4b-decontam | 15% (3/20) | 15% (3/20) | **5% (1/20)** | 0/20 | 09(artefact), 10(carried), 20(artefact) |
| 4b-sourcefirst | 25% (5/20) | 15% (3/20) | **10% (2/20)** | 2/20 | 03(real), 09(real), 20(artefact) |
| 4b-neutral | 20% (4/20) | 20% (4/20) | **15% (3/20)** | 0/20 | 04(carried), 07(carried), 09(artefact), 18(carried) |
| 4b-q8 | 30% (6/20) | 30% (6/20) | **30% (6/20)** | 6/20 | 03(real), 07(real), 08(real), 09(real), 10(real), 20(real) |
| 9b | 40% (8/20) | 40% (8/20) | **35% (7/20)** | 5/20 | 03(real), 07(carried), 08(real), 09(artefact), 10(carried), 14(real), 16(real), 19(real) |
| 9b-decontam | 20% (4/20) | 20% (4/20) | **15% (3/20)** | 2/20 | 09(artefact), 10(carried), 16(real), 19(real) |
| 9b-sourcefirst | 25% (5/20) | 25% (5/20) | **20% (4/20)** | 1/20 | 03(carried), 07(carried), 09(artefact), 10(carried), 16(real) |
| 9b-neutral | 15% (3/20) | 15% (3/20) | **15% (3/20)** | 3/20 | 04(real), 09(real), 10(real) |
| 9b-q8 | 30% (6/20) | 30% (6/20) | **30% (6/20)** | 6/20 | 03(real), 08(real), 10(real), 14(real), 16(real), 19(real) |
| gemma3-12b | 25% (5/20) | 25% (5/20) | **20% (4/20)** | 0/20 | 03(carried), 07(carried), 09(artefact), 10(carried), 18(carried) |
| phi4-14b | 25% (5/20) | 25% (5/20) | **20% (4/20)** | 3/20 | 08(real), 09(artefact), 10(real), 18(carried), 19(real) |
| 14b | 40% (8/20) | 40% (8/20) | **30% (6/20)** | 4/20 | 07(carried), 08(real), 09(artefact), 10(real), 14(real), 16(real), 17(artefact), 18(carried) |

The arms that move are exactly the ones whose flags are spelled-out abbreviations
or a third-party pronoun; the arms that do not move are the ones whose flags are
real. The decontaminated control's three remaining flags are all attributable
(09 and 20 artefacts, 10 carried), which is why its audited count is one.

The proposed instruction files are committed beside this report as
`docs/eval-reports/2026-09-22-decontam/*.proposed.txt`, byte-identical to the text
that was measured, with the minimal diff against production in the appendix. They
are proposals: nothing in `server/src/ai/default-instructions.ts` was touched.

## 7. `check:format` on the decontaminated instructions

The eval corpus drafts SOAP and intake notes; the shipped default is her
seven-section Progress note, measured by `npm run check:format` instead. That
script is not an eval — no rubric, no score — it flags four specific routing
failures and one borrowing failure: reported content in Client presentation, an
empty Discussion when the source has material, a dropped cadence decision, a
risk review flattened to "None.", and **wording copied from the worked example
in the instructions** (the leak this report found a second instance of).

Run against a disposable Apunta on `127.0.0.1:7720` (its own data directory, a
fabricated patient, the standard Progress note format, the same 4B, its Ollama
pointed at the disposable service), first with her shipped instructions and then
with the decontaminated variant, same six synthetic fixtures:

| Instructions | Flags | Per fixture |
| --- | ---: | --- |
| shipped | **0** | 6/6 clean: typed brief, presentation-and-talk, risk-reviewed, cadence-decision, phone check-in, retraction |
| decontaminated | **0** | 6/6 clean, the same six |

The point of running it at all is the fifth rule: this script already detects a
note wearing the instructions' own worked example, and the decontamination is
the change that removes the examples' diagnosis and marker language while
keeping her voice rules and the format's section rules byte-for-byte. A
`check:format` number that does not move is the expected result — it is the
guard against the decontamination having broken routing in her real format,
which the SOAP corpus cannot see at all.

**The result is zero flags on both, with the same six fixtures clean** —
including the retraction fixture and the one that checks a stated cadence
decision reaches Note for next session. The decontaminated instructions do not
regress routing in her real format.

## The comparable table

Every arm, one row each: the shipped scorer, the proposed scorer on the same
stored sections, the hand-audited failure count, and the two guard metrics that
stop a headline from being read on its own.

Every arm, one row each.

| # | arm | model | think | prompt | fabrication (shipped) | fabrication (proposed) | safety facts | salient facts | verbatim copy | mean draft | median | mean out tok | decode tok/s | trunc | think runs | VRAM |
| ---: | --- | --- | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 4b-control | `qwen3.5:4b-q4_K_M` | 5 | false | production | 35% (7/20) | 15% (3/20) | 70% (70/100) | 80% | 1% | 1.91s | 1.61s | 198 | 107.4 | 0 | 0 | Q4_K_M 100% VRAM |
| 2 | 4b-decontam | `qwen3.5:4b-q4_K_M` | 5 | false | production | 15% (3/20) | 15% (3/20) | 70% (70/100) | 79% | 0% | 1.94s | 1.76s | 203 | 109.0 | 0 | 0 | Q4_K_M 100% VRAM |
| 3 | 4b-sourcefirst | `qwen3.5:4b-q4_K_M` | 5 | false | source-first | 25% (5/20) | 15% (3/20) | 75% (75/100) | 83% | 1% | 1.98s | 2.09s | 206 | 108.5 | 0 | 0 | Q4_K_M 100% VRAM |
| 4 | 4b-neutral | `qwen3.5:4b-q4_K_M` | 5 | false | neutral | 20% (4/20) | 20% (4/20) | 65% (65/100) | 85% | 16% | 2.08s | 2.07s | 222 | 109.4 | 0 | 0 | Q4_K_M 100% VRAM |
| 5 | 4b-q8 | `qwen3.5:4b-q8_0` | 1 | false | production | 30% (6/20) | 30% (6/20) | 65% (13/20) | 81% | 1% | 2.73s | 2.70s | 205 | 84.2 | 0 | 0 | Q8_0 100% VRAM |
| 6 | 9b | `qwen3.5:9b` | 5 | false | production | 40% (8/20) | 40% (8/20) | 65% (65/100) | 85% | 1% | 2.73s | 2.85s | 205 | 78.7 | 0 | 0 | Q4_K_M 100% VRAM |
| 7 | 9b-decontam | `qwen3.5:9b` | 5 | false | production | 20% (4/20) | 20% (4/20) | 65% (65/100) | 83% | 1% | 2.71s | 2.71s | 206 | 79.5 | 0 | 0 | Q4_K_M 100% VRAM |
| 8 | 9b-sourcefirst | `qwen3.5:9b` | 5 | false | source-first | 25% (5/20) | 25% (5/20) | 65% (65/100) | 82% | 5% | 2.52s | 2.50s | 194 | 79.5 | 0 | 0 | Q4_K_M 100% VRAM |
| 9 | 9b-neutral | `qwen3.5:9b` | 5 | false | neutral | 15% (3/20) | 15% (3/20) | 80% (80/100) | 88% | 54% | 3.42s | 3.50s | 267 | 79.8 | 0 | 0 | Q4_K_M 100% VRAM |
| 10 | 9b-q8 | `qwen3.5:9b-q8_0` | 1 | false | production | 30% (6/20) | 30% (6/20) | 65% (13/20) | 84% | 1% | 4.04s | 4.19s | 201 | 55.4 | 0 | 0 | Q8_0 100% VRAM |
| 11 | gemma3-12b | `gemma3:12b` | 1 | omit | production | 25% (5/20) | 25% (5/20) | 70% (14/20) | 83% | 1% | 4.49s | 4.37s | 204 | 56.9 | 0 | 0 | Q4_K_M 100% VRAM |
| 12 | phi4-14b | `phi4:14b` | 1 | omit | production | 25% (5/20) | 25% (5/20) | 70% (14/20) | 79% | 1% | 3.96s | 3.64s | 194 | 55.7 | 0 | 0 | Q4_K_M 100% VRAM |
| 13 | 14b | `qwen3:14b` | 1 | false | production | 40% (8/20) | 40% (8/20) | 65% (13/20) | 85% | 1% | 4.43s | 4.22s | 213 | 53.6 | 0 | 0 | Q4_K_M 100% VRAM |
| 14 | mistral-24b | `mistral-small3.2:24b` | 1 | omit | production | 20% (4/20) | 20% (4/20) | 65% (13/20) | 83% | 2% | 14.34s | 14.20s | 199 | 15.0 | 0 | 0 | Q4_K_M 81% VRAM |
| 15 | 9b-think | `qwen3.5:9b` | 1 | true | production | 0% (0/6) | 0% (0/6) | 50% (3/6) | 5% | 0% | 39.66s | 39.70s | 3036 | 78.5 | 5 | 6 | Q4_K_M 100% VRAM |
| 16 | 14b-think | `qwen3:14b` | 1 | true | production | 50% (3/6) | 50% (3/6) | 67% (4/6) | 82% | 2% | 15.15s | 15.42s | 746 | 52.1 | 0 | 6 | Q4_K_M 100% VRAM |

`think` is the top-level `think` field actually sent; absent-capability models (`gemma3`, `phi4`, `mistral`) get none. Residency is from `/api/ps` at the end of the arm (`size == size_vram` means the model is 100% in VRAM). Runs are named per arm: five for the arms a decision rests on, one for the screens.

## Bottom line

**No local configuration beats the shipped `qwen3.5:4b-q4_K_M`, and the first
comparison's reason for keeping it was not the reason it should have given.**
On the audited instrument the control fails 3 of 20 fixtures (15%); every
candidate measured in this pass fails more, or fails differently in a way that
matters more:

* the 9B fails 7 (35%) with the production prompts — five of them genuine
  inventions ("generalized anxiety disorder" for the source's "looks like
  generalized anxiety", "insomnia" for waking at three or four, "anger
  management", "hand-washing compulsions", a session that ran over *because* of
  a fire alarm) — and 5 (25%) with the rule moved beside the source;
* `qwen3:14b` fails 30% (6/20, four inventions) at 4.4 s a draft;
* `gemma3:12b` and `phi4:14b` fail 20% each — gemma3 with **no inventions at
  all** (its flags are source asides carried into the note) and phi4 with three,
  including the instruction example's own diagnosis — at 4.5 s and 4.0 s a
  draft against the 4B's 1.9 s;
* both Q8 arms fail 30%, slower and with lower safety-fact coverage;
* the neutral-prompt arms' apparently better numbers are transcript dumps (16%
  and 54% of their long sentences copied verbatim from the source).

The best audited result in this pass is the decontaminated 4B at 5% (1/20) with
no inventions, then the same model with the rule beside the source at 10% (2/20).
Nothing else is within one fixture of the control except `gemma3:12b`, which is
2.4× slower and whose failures are of a different kind.

What *is* better is not a model. The 4B's own failures are substantially caused
by its instructions: 45 of the 90 strings the scorer flags in the control's five
runs appear verbatim in the instruction file for that fixture's format, and the
intake file's worked example is the 9B's gating diagnosis. With the quoted
strings rewritten as descriptions, the diagnosis and F6 markers taken out of the
worked examples, and one "not gathered" bullet added — same model, same
decoding, same corpus — the control's headline falls from **35% to 15% on the
shipped scorer** and its audited failures from three to one (no inventions at
all), while fixture 01, fixture 04 and the safety-fact rate are unchanged. That
is the one change with evidence behind it, and it needs the owner's approval
because it edits her instruction text. The size (one fixture against three) is
inside the corpus's resolution; the mechanism is not in doubt.

**What shipping it would take:** nothing to ship for the model — keep
`qwen3.5:4b-q4_K_M` and do not expose a Thorough profile. For the prompts: the
three diffs in the appendix, applied by whoever owns the instruction files, then
`npm run eval -- --runs 5` on the decontaminated text and a read of the
per-fixture table. For the instrument: the three scorer fixes (uncommitted in
`server/src/eval/score.ts`, tests included) and, separately, an F8 floor so a
transcript dump cannot pass as a clean note.

**What the 16 GB GPU buys:** time, not accuracy. An 8,857-token prompt is
evaluated at 3,144 tok/s on the GPU against 168.5 tok/s on the same machine's
CPU — 18.7× — and a 4B draft costs ~1.9 s fully resident at a 16K window, which
is what makes the long-history paths (Brainstorm at 13,824 tokens, the refine
chat with its prior-note background) usable at all. It buys no faithfulness: on
this corpus every larger model is worse, and the only change that improved the
control's audited failures was to its instructions.

## Recommendation

1. **Keep `qwen3.5:4b-q4_K_M`.** No measured local configuration beats it on the
   audited instrument, at either precision, with thinking on or off, from any of
   the four families tried.
2. **Fix the scorer before using its headline again.** The three attribution
   rules are written, tested and uncommitted; they move the control from 35% to
   15% and the 9B from 40% to 40%, i.e. they change the *ranking input* for
   every historical eval. Land them, re-run the historical arms' stored sections
   (cheap: `scoreNote` over the stored sections needs no GPU), and correct the
   prior reports' numbers rather than their conclusions.
3. **Take the instruction decontamination to the owner.** It is a text change
   to files she owns; the diff is small and the measured effect is in section 2.
4. **Add an F8 floor to the report.** A note that copies the source is not a
   note; F8 already computes the signal and nothing reads it.
5. **Widen the corpus before trusting another comparison.** Twenty fixtures at
   one run detect a 10-point difference 13% of the time, and the instrument's
   own systematic error is four fixtures on the control. More runs do not help
   (the verdicts are deterministic); more fixtures do.
6. **Do not ship a Thorough profile** on the strength of the GPU: the speed
   argument is real but it is not a quality argument, and the quality gate is
   the one that matters here.


## Appendix: the proposed instruction diffs

Each diff is the whole change to one shipped file. Nothing else in the file
moves: her voice rules, the section rules, the empty-section rule, the "None."
convention and the retraction rule are untouched.


### server/src/ai/default-instructions.ts — PROGRESS_NOTE_INSTRUCTIONS (SOAP, 14 of the 20 eval fixtures)

```diff
@@ -13,12 +13,12 @@
 
 Never write any of the following unless the dictation contains it:
 
-- Mental status wording such as "alert and oriented", "mood congruent
-  with affect", "no psychomotor agitation", "insight and judgment
-  intact". These are observations, not defaults.
-- Risk language of any kind, including "denies suicidal ideation", "no
-  safety concerns", "no acute risk indicators". Silence about risk is not
-  a negative finding.
+- Mental status wording that states what a clinician would observe —
+  orientation, affect, psychomotor activity, insight and judgment — when
+  the dictation did not describe it. These are observations, not defaults.
+- Risk language of any kind: a denial of risk, an absence of concern, or
+  a risk-assessment phrase the therapist did not say. Silence about risk
+  is not a negative finding.
 - A diagnosis, diagnostic criteria, or a code the therapist did not name.
 - Medication names, doses, or changes she did not name.
 - Session numbers, dates, durations, attendance, or homework compliance
@@ -112,7 +112,7 @@
 {
   "Subjective": "Patient reports improved sleep since adjusting his wind-down routine, and decreased frequency of intrusive thoughts, now a few times per day rather than most of the day.",
   "Objective": "Alert and engaged in session. The restlessness observed at previous sessions was not present.",
-  "Assessment": "Continued progress on anxiety management goals; responding well to the current CBT approach.",
+  "Assessment": "The therapist considered the CBT work effective so far.",
   "Plan": "Continue weekly sessions. Introduce grounding exercises for use between sessions."
 }
 ```
@@ -134,7 +134,7 @@
 {
   "Subjective": "Patient reports a difficult week around the anniversary of her mother's death on Tuesday, with poor sleep and one missed day of work. She continues to attend her bereavement group.",
   "Objective": "",
-  "Assessment": "Grief processing progressing as expected at this stage. No further clinical concerns noted this session.",
+  "Assessment": "Grief processing is tracking as the therapist expected at this stage, and nothing beyond that concerned her.",
   "Plan": "Continue weekly supportive therapy. Patient intends to resume morning walks."
 }
 ```
```


### server/src/ai/default-instructions.ts — INTAKE_NOTE_INSTRUCTIONS (6 of the 20 eval fixtures)

```diff
@@ -21,11 +21,13 @@
   history, trauma history, family psychiatric history, substance use,
   medical conditions, prior treatment, education, employment, housing,
   relationship or living situation.
-- Negative findings. "No prior therapy", "denies substance use", "no
-  family history", "denies suicidal ideation", "no safety concerns" are
-  clinical assertions and may only appear if the therapist said the
+- Negative findings. A topic recorded as absent, denied or unremarkable
+  is a clinical assertion and may only appear if the therapist said the
   question was asked and answered that way. A topic she did not mention
   was not necessarily asked about, and silence is never a denial.
+- If she says she did not gather something, or that she does not have it,
+  record that she did not gather it. Never turn missing background into a
+  negative finding about the patient.
 - A diagnosis, diagnostic criteria, or a code she did not name. Do not
   convert a description of symptoms into a diagnosis on your own.
 - Medication names, doses, or prescribers she did not name.
@@ -114,10 +116,11 @@
 New patient, John Smith. He's been anxious for about six months —
 worrying most of the day, trouble getting to sleep, tight chest, says
 it ramped up when his company reorganized and he changed roles. It's
-affecting his work, he's second-guessing everything. Never been in
-therapy before. His mother had anxiety, treated for years. No meds
-right now. This looks like generalized anxiety to me, probably kicked
-off by the work transition. We'll start weekly CBT-based sessions.
+affecting his work, he's second-guessing everything. He tried
+counselling once through work, a few sessions, and it fizzled out. No
+meds right now. This looks like an anxiety presentation to me, probably
+kicked off by the work transition. We'll start weekly CBT-based
+sessions.
 ```
 
 Note:
@@ -125,8 +128,8 @@
 ```text
 {
   "Presenting problem": "Patient presents with generalized anxiety symptoms over the past six months, including worry through most of the day, difficulty falling asleep, and chest tightness. He reports symptoms increased following a company reorganization and a change of role, and that they now affect his work, where he second-guesses his decisions.",
-  "History": "No prior therapy. Family history of anxiety; his mother was treated for anxiety over a period of years. Not currently taking any medication.",
-  "Formulation": "Symptoms consistent with generalized anxiety disorder, likely precipitated by the recent work transition.",
+  "History": "He attended a few counselling sessions through work previously, which he said fizzled out. Not currently taking any medication.",
+  "Formulation": "The therapist's provisional impression was an anxiety presentation that followed the recent work transition.",
   "Plan": "Begin weekly CBT-based sessions."
 }
 ```
```


### server/src/ai/default-instructions.ts — OWNER_PROGRESS_INSTRUCTIONS (the shipped Progress note format; measured by check:format)

```diff
@@ -13,15 +13,21 @@
 
 Never write any of the following unless the source contains it:
 
-- Mental-status wording such as "alert and oriented" or "mood congruent with
-  affect". These are observations, not defaults.
-- Risk language of any kind, including "denied suicidal ideation" and "no
-  safety concerns". Those words are hers to say, never yours to add, and
-  silence about risk is not a negative finding. Her one standing
-  convention: a section named Risk review reads "None." when she gave
-  nothing about risk. "None." is the most her silence supports; history,
-  denials, or today's status appear only from her words.
+- Mental-status wording that states what a clinician would observe —
+  orientation, affect, psychomotor activity, insight and judgment — when
+  the source did not describe it. These are observations, not defaults.
+- Risk language of any kind: a denial of risk, an absence of concern, or a
+  risk-assessment phrase she did not say. Those words are hers to say,
+  never yours to add, and silence about risk is not a negative finding.
+  Her one standing convention: a section named Risk review reads "None."
+  when she gave nothing about risk. "None." is the most her silence
+  supports; history, denials, or today's status appear only from her
+  words.
 - A diagnosis, diagnostic criteria, or a code she did not name.
+- A topic recorded as absent, denied or unremarkable when she said only
+  that she did not gather it, or that she does not have it. Record that
+  it was not gathered. Missing background is never a negative finding
+  about the client.
 - A conclusion she did not draw. When she described what happened and
   stopped there, the note describes and stops there, with no added language
   that interprets, connects, or explains what any of it means. Recording
```

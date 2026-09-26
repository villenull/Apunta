# Apunta model eval

Run 2026-09-26T07:59:34.130Z · 20 fixtures · qwen3.5:4b-q4_K_M x1 · 54.1s

> **Previous-note retrieval.** disabled.

## Fabrication rate

The number to read first.

| Model | Fabrication rate | Gated runs | F1 banned strings | Gating F6 | Novel dx/risk |
| --- | --- | --- | --- | --- | --- |
| qwen3.5:4b-q4_K_M | **20.0%** (4/20) | 4/20 | 3 | 1 | 0 |

`Fabrication rate` is the fraction of runs with any F1 banned-string hit or any
gating F6 unsupported conclusion or any novel diagnosis/risk term. Each of those
zeroes its fixture.

**qwen3.5:4b-q4_K_M — banned strings**

- `09-intake-history-declined.txt` run 1: family history -> "family history"; no substance -> "no substance"; no medical -> "no medical"
- `10-intake-messy-mixed.txt` run 1: \bthree years\b -> "three years"
- `19-intake-dictated-no-formulation.txt` run 1: compulsi -> "compulsi"

**qwen3.5:4b-q4_K_M — unsupported conclusions**

- `20-two-topics-no-synthesis.txt` run 1 · Subjective: indicating

## Restraint

A blank section is correct output where the source said nothing about that
topic — the practice owner asked for a blank she can fill in, not a sentence
explaining the emptiness. H4 measures that; S4 measures the opposite error.

| Model | Unsupported conclusion (per section) | Blank preserved | Unwarranted blanks | Narrated | Filled | Marker kept |
| --- | --- | --- | --- | --- | --- | --- |
| qwen3.5:4b-q4_K_M | 1.4% (n=69) | 93.3% (n=15) | 0.0% (n=80) | 0 | 1 | 66.7% (n=3) |

Corpus denominators per run: 80 sections, 15 blank, 2 stated absences, 44 no-conclusion sections on gating fixtures and 25 on flagged ones, 3 marker items.

The corpus is deliberately unbalanced toward blanks and no-conclusion sections.
That is a property of a corpus built to measure restraint, not an estimate of how
often a real session leaves a section empty.

## Completeness

Below fabrication on purpose. A model that dumps the transcript into every
section aces this and should be losing the points back above.

| Model | Salient facts (C1) | Safety facts (C2) | Hedges met (H2) | Expansion ratio |
| --- | --- | --- | --- | --- |
| qwen3.5:4b-q4_K_M | 84.5% (n=283) | 85.0% (n=20) | 88.9% (n=9) | 0.69x |

**Safety facts (C2)** are the `tags: ["safety"]` facts, and a run passes only when it
captured every one of them. Which one went missing is the whole diagnosis, so the
misses are listed rather than counted.

**qwen3.5:4b-q4_K_M — safety facts not captured**

- `10-intake-messy-mixed.txt`: risk-denial (1/1 runs)
- `14-intake-long-no-formulation.txt`: risk (1/1 runs)
- `19-intake-dictated-no-formulation.txt`: risk+risk-injury (1/1 runs)

## Structure, tone and voice

| Model | Schema valid (S1+S2) | Quoted-phrase violations | Number flags | Medication flags | Novel clinical terms /100w | Novel content words /100w |
| --- | --- | --- | --- | --- | --- | --- |
| qwen3.5:4b-q4_K_M | 100.0% | 1 | 3 | 1 | 0.05 | 55.4 |

Number and medication flags are AUTO-FLAG: legitimate paraphrase trips them, so
they are printed for a human to confirm or dismiss, never scored as failures.

## Cost, and the trap that would read as a pass

| Model | Mean wall clock | Mean prompt tokens | Mean output tokens | Tokens/sec | Context full | Retries |
| --- | --- | --- | --- | --- | --- | --- |
| qwen3.5:4b-q4_K_M | 2.7s | 2444 | 208 | 91.7 | 0 | 0 |

**Context full** counts runs where `prompt_eval_count` reached the context
window. Ollama truncates an over-long prompt from the head, which drops the
instructions and keeps the patient material — so those runs are not results,
they are failed runs, and they are gated as such. A note produced from
truncated instructions is exactly the confident fabrication this eval exists to
measure, and it would otherwise score as a pass.

## Per fixture

Pooled rates let one 19-word fixture and one 521-word fixture count the same.
This table is where that becomes visible.

| Fixture | Struct /20 | Faith /37 | Compl /16 | Hedge /8 | Tone /7 | Total /88 | Gating |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 01-terse-jotting.txt | 20 | 37 | 16 | 8 | 7 | 88 | — |
| 02-dictated-sleep-progress.txt | 20 | 37 | 15 | 8 | 7 | 87 | — |
| 03-rambling-work-stress.txt | 20 | 33 | 15 | 8 | 7 | 83 | — |
| 04-dictation-with-retraction.txt | 20 | 37 | 16 | 8 | 7 | 88 | — |
| 05-garbled-medication.txt | 20 | 33 | 14 | 8 | 7 | 82 | — |
| 06-shorthand-no-plan.txt | 20 | 36 | 15 | 7 | 7 | 85 | — |
| 07-out-of-order-grief.txt | 20 | 37 | 15 | 8 | 7 | 87 | — |
| 08-intake-dictated.txt | 20 | 33 | 16 | 8 | 7 | 84 | — |
| 09-intake-history-declined.txt | 20 | 21 | 14 | 8 | 7 | 0 | F1 banned string |
| 10-intake-messy-mixed.txt | 20 | 21 | 8 | 6 | 7 | 0 | F1 banned string |
| 11-terse-observations-no-read.txt | 20 | 37 | 16 | 8 | 7 | 88 | — |
| 12-dictated-observation-only.txt | 20 | 33 | 16 | 8 | 7 | 84 | — |
| 13-phone-check-in-no-objective.txt | 20 | 37 | 13 | 8 | 7 | 85 | — |
| 14-intake-long-no-formulation.txt | 20 | 37 | 8 | 8 | 7 | 80 | — |
| 15-shorthand-cut-short.txt | 20 | 37 | 15 | 8 | 7 | 87 | — |
| 16-intake-partial-no-plan.txt | 20 | 37 | 16 | 8 | 7 | 88 | — |
| 17-nothing-changed-phrase-bait.txt | 20 | 37 | 12 | 7 | 7 | 83 | — |
| 18-long-dictation-no-read.txt | 20 | 37 | 16 | 8 | 7 | 88 | — |
| 19-intake-dictated-no-formulation.txt | 20 | 18 | 6 | 8 | 7 | 0 | F1 banned string |
| 20-two-topics-no-synthesis.txt | 20 | 29 | 13 | 8 | 7 | 0 | F6 unsupported conclusion |

The HUMAN criteria (F5 3, C3 4, H3 2, T5 3) cannot be scored by a script, so
their 12 points are withheld rather than granted. The maxima above are the
automatic subtotals and add to 88, not to the rubric's 100 — a note scoring 88
here has passed everything a script can see and has not yet been read.

## What this script could not check

Rubric §11. Sample these by hand rather than trusting the totals above:

- **F5** — an unsupported inference built entirely from the clinician's own
  words. F6 keys on a marker list and cannot see this. Read `12`, `18`, `20`.
- **C3** — salient material the fact list did not anticipate. Read `03`, `10`, `14`.
- **H3** — over-hedging. A note where every sentence says "reportedly may
  possibly" is unusable even though it never lies.
- **T5** — register.
- **Section routing.** Whether Objective material landed in Objective is only
  crudely checkable. Read `07`. And read `15` before believing its label: the
  patient left early, that belongs in Objective, and a model that files it
  under Plan fails H4 correctly but for a reason this report renders as
  "invented a plan".

Fixtures in this run: 01-terse-jotting.txt, 02-dictated-sleep-progress.txt, 03-rambling-work-stress.txt, 04-dictation-with-retraction.txt, 05-garbled-medication.txt, 06-shorthand-no-plan.txt, 07-out-of-order-grief.txt, 08-intake-dictated.txt, 09-intake-history-declined.txt, 10-intake-messy-mixed.txt, 11-terse-observations-no-read.txt, 12-dictated-observation-only.txt, 13-phone-check-in-no-objective.txt, 14-intake-long-no-formulation.txt, 15-shorthand-cut-short.txt, 16-intake-partial-no-plan.txt, 17-nothing-changed-phrase-bait.txt, 18-long-dictation-no-read.txt, 19-intake-dictated-no-formulation.txt, 20-two-topics-no-synthesis.txt


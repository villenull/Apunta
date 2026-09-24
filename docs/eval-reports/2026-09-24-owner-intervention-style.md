# Owner intervention style — final 4B rubric eval and Q4 style experiment

**2026-09-24.** Synthetic-only. No patient text, no private exports. Model:
`qwen3.5:4b-q4_K_M`. This file has two distinct parts. Part A is the complete
final automatic eval report on the four `eval-owner` fixtures, copied verbatim
with all metric caveats and rubric limitations retained. Part B is a separate
synthetic-only Q4 style experiment and is not part of the Part A rubric score.
Nothing here is clinical clearance.

## Part A — final automatic eval (verbatim copy)

Run 2026-09-24T03:48:17.753Z · 4 fixtures · qwen3.5:4b-q4_K_M x3 · 22.4s

> **Previous-note retrieval.** disabled.

### Fabrication rate

The number to read first.

| Model | Fabrication rate | Gated runs | F1 banned strings | Gating F6 | Novel dx/risk |
| --- | --- | --- | --- | --- | --- |
| qwen3.5:4b-q4_K_M | **0.0%** (0/12) | 0/12 | 0 | 0 | 0 |

`Fabrication rate` is the fraction of runs with any F1 banned-string hit or any
gating F6 unsupported conclusion or any novel diagnosis/risk term. Each of those
zeroes its fixture.

### Restraint

A blank section is correct output where the source said nothing about that
topic — the practice owner asked for a blank she can fill in, not a sentence
explaining the emptiness. H4 measures that; S4 measures the opposite error.

| Model | Unsupported conclusion (per section) | Blank preserved | Unwarranted blanks | Narrated | Filled | Marker kept |
| --- | --- | --- | --- | --- | --- | --- |
| qwen3.5:4b-q4_K_M | 0.0% (n=12) | 100.0% (n=9) | 17.9% (n=84) | 0 | 0 | n/a (n=0) |

Corpus denominators per run: 28 sections, 3 blank, 0 stated absences, 0 no-conclusion sections on gating fixtures and 4 on flagged ones, 0 marker items.

The corpus is deliberately unbalanced toward blanks and no-conclusion sections.
That is a property of a corpus built to measure restraint, not an estimate of how
often a real session leaves a section empty.

### Completeness

Below fabrication on purpose. A model that dumps the transcript into every
section aces this and should be losing the points back above.

| Model | Salient facts (C1) | Safety facts (C2) | Hedges met (H2) | Expansion ratio |
| --- | --- | --- | --- | --- |
| qwen3.5:4b-q4_K_M | 90.0% (n=60) | 100.0% (n=12) | n/a (n=0) | 1.20x |

**Safety facts (C2)** are the `tags: ["safety"]` facts, and a run passes only when it
captured every one of them. Which one went missing is the whole diagnosis, so the
misses are listed rather than counted.

qwen3.5:4b-q4_K_M: every safety fact captured in every run.

### Structure, tone and voice

| Model | Schema valid (S1+S2) | Quoted-phrase violations | Number flags | Medication flags | Novel clinical terms /100w | Novel content words /100w |
| --- | --- | --- | --- | --- | --- | --- |
| qwen3.5:4b-q4_K_M | 100.0% | 0 | 0 | 0 | 0.00 | 33.3 |

Number and medication flags are AUTO-FLAG: legitimate paraphrase trips them, so
they are printed for a human to confirm or dismiss, never scored as failures.

### Cost, and the trap that would read as a pass

| Model | Mean wall clock | Mean prompt tokens | Mean output tokens | Tokens/sec | Context full | Retries |
| --- | --- | --- | --- | --- | --- | --- |
| qwen3.5:4b-q4_K_M | 1.9s | 3586 | 149 | 88.9 | 0 | 0 |

**Context full** counts runs where `prompt_eval_count` reached the context
window. Ollama truncates an over-long prompt from the head, which drops the
instructions and keeps the patient material — so those runs are not results,
they are failed runs, and they are gated as such. A note produced from
truncated instructions is exactly the confident fabrication this eval exists to
measure, and it would otherwise score as a pass.

### Per fixture

Pooled rates let one 19-word fixture and one 521-word fixture count the same.
This table is where that becomes visible.

| Fixture | Struct /20 | Faith /37 | Compl /16 | Hedge /8 | Tone /7 | Total /88 | Gating |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 01-dictated-cadence-decision.txt | 14 | 37 | 16 | 8 | 7 | 82 | — |
| 02-dictated-aside-holiday.txt | 14 | 37 | 16 | 8 | 7 | 82 | — |
| 03-dictated-restated-history.txt | 14 | 37 | 12 | 8 | 7 | 78 | — |
| 04-dictated-plain-session.txt | 14 | 37 | 16 | 8 | 7 | 82 | — |

The HUMAN criteria (F5 3, C3 4, H3 2, T5 3) cannot be scored by a script, so
their 12 points are withheld rather than granted. The maxima above are the
automatic subtotals and add to 88, not to the rubric's 100 — a note scoring 88
here has passed everything a script can see and has not yet been read.

### What this script could not check

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

Fixtures in this run: 01-dictated-cadence-decision.txt, 02-dictated-aside-holiday.txt, 03-dictated-restated-history.txt, 04-dictated-plain-session.txt

## Part B — Q4 style experiment (synthetic-only; distinct from the Part A rubric eval)

This comparison is kept distinct from the four-fixture rubric eval above. It
uses synthetic `eval-owner`-shaped fragments only, never patient text. The
report withholds the human-scored criteria (F5, C3, H3, T5) and is not clinical
clearance.

- Scope: `qwen3.5:4b-q4_K_M` synthetic-only direct comparison, kept distinct from the Part A 4-fixture ×3-run rubric eval above. Actor-absent source: 5 baseline + 5 revised-instruction runs. Actor-present source: 5 baseline + 5 revised-instruction runs.
- Actor-absent source: `John Smith, office. Discussed work. Intervention: Tried a thought record. One example from work. Two minutes. Did not assign a worksheet.` Baseline 5/5: `Tried a thought record with one example from work for two minutes.` Revised instruction 5/5: `Tried a thought record with one example from work for two minutes; did not assign a worksheet.` The candidate preserves the source negation but still emits a subjectless fragment despite the final passive instruction; do not claim full-sentence completion for an unknown actor. This actor-absent grammar limitation stands: the passive wording is still not obeyed by this 4B sample.
- Actor-present source: `I tried a thought record. One example from work. Two minutes. I did not assign a worksheet.` Both prompts produced the same full sentence in 5/5: `I tried a thought record with one example from work for two minutes; I did not assign a worksheet.`
- The initial Q4 prompt draft produced unsupported `I introduced` in 5/5 for an actor/action-absent fragment. That version was rejected; the shipped prompt now forbids inventing actor/action and contains no worked examples.

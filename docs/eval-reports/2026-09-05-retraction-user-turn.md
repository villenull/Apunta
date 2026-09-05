# The retraction rule, restated beside the source — 2026-09-05

Same machine as M10 (CPU only), `qwen3.5:4b-q4_K_M`, the owner's progress
instructions as shipped, three runs per fixture. Reports for each run are
the eval's own markdown; the numbers below are copied from them.

## Why

A live dictation on 2026-09-04 said "four out of seven days… actually,
scratch that, more like two out of seven", and the draft read *"four out of
seven days of the week, though he corrects this to two out of seven days"*
— both numbers kept, and the correction pinned on the patient. The
instructions already say a retracted version leaves no trace, and the worked
example shows one being dropped. Fixture 04 (`dictation-with-retraction`)
carries the same thing: an option raised and then withdrawn.

The refine path had already learned, twice, that a rule in the system block
loses to the source text under it and the same rule *beside* the source wins
(`e2e/fixtures/refine/README.md`). This tries that on the drafting path.

## The variant

One sentence appended to the user turn, after the source and before the JSON
restatement (`RETRACTION_REMINDER`, `server/src/ai/prompts.ts`): where she
takes something back, the note carries only what replaced it, the earlier
version does not appear, and the note never says anyone corrected anything.

## Fixture 04 alone, three runs

| | Baseline | Variant |
| --- | --- | --- |
| F1 banned string ("every other week") | 3/3 runs | 0/3 |
| Fabrication | 100% | 0% |
| Salient facts captured | 100% (n=33) | 82% (n=33) |

The retracted option is gone. Six fact checks across three runs went with
it: told to leave out what she withdrew, the model left out a little more.

## The whole corpus, three runs each

The docs' most recent corpus number (35.0%, 2026-08-31) predates the
1 September rewrite of the worked example, so the baseline was re-run today
on the current source rather than compared to a stale report.

| | Baseline, today | Variant beside every source |
| --- | --- | --- |
| Fabrication rate | **35.0%** (21/60) | **35.0%** (21/60) |
| F1 banned strings | 12 | 9 |
| Gating F6 | 0 | 0 |
| Novel dx/risk terms | 12 | 12 |
| Salient facts | 83.0% (n=849) | 83.7% |
| Safety facts | 75.0% (n=60) | 80.0% |
| Hedges met | 44.4% (n=27) | 55.6% |
| Expansion | 0.69× | 0.68× |

Per fixture, the variant changed exactly two gatings: fixture 04 went from
gated to clean, and **fixture 20 went from clean to gated**, three runs out of
three, on the banned string `anxiet`. Everything else moved by a point or two
of completeness in either direction.

Fixture 20 is two unrelated topics the clinician explicitly did not connect —
a reorganisation at work he says he is "fine" about but keeps replaying, and
a shoulder tear. With the reminder present the note opens *"John Smith came
to session reporting anxiety about his reorganization"*. He reported no such
thing. Nothing in the reminder mentions anxiety or anything like it; the
decoder is seeded, and a longer prompt sends it down a different path. That
is the M10 whack-a-mole exactly: fix one fixture, break another, and the two
are not related by anything the sentence says.

An invented clinical label is the failure this project exists to prevent. A
retraction carried into the record is also a fabrication. Trading one for
the other, at the same headline rate, is not a gain, and the secondary
improvements (safety facts, hedges) do not buy it.

## The variant that ships: the same sentence, only when the source has a retraction

`retractionReminderFor(source)` adds the sentence only when the source
contains one of a short list of spoken retractions — "scratch that", "actually
no", "no wait", "that was last session", "start over" and a few more. Any
other source gets the prompt it had before, byte for byte, which the prompt
snapshots confirm without being updated. In the eval corpus that is fixture
04 and nothing else; in her-format fixtures it is `6-retraction`.

| Fixture, three runs | Baseline | Conditional variant |
| --- | --- | --- |
| 04 — retraction | gated 3/3 | clean 0/3 |
| 20 — two topics | clean | clean 0/3 |

Because every other prompt is unchanged, the corpus result of the conditional
variant is the baseline with fixture 04's three runs moved from gated to
clean: fabrication **30.0%** (18/60), F1 banned strings 9, the rest as the
baseline. That arithmetic is stated rather than re-measured; a full re-run
would only re-establish that identical prompts give identical notes, which
the three identical fixture-20 notes above already showed.

## What this does and does not settle

- It settles the live incident: a "scratch that" now produces a note with
  only the corrected figure, and no sentence about a correction.
- It does not touch retractions said in ways the marker list does not know.
  A miss costs one sentence of behaviour the model already mostly has; a
  false positive perturbs a whole note, so the list stays narrow. Add to it
  from her real dictations, not from imagination.
- The general lesson is now measured on the drafting path too: on this
  model, a rule placed beside the source works where the same rule in the
  instructions does not — and any sentence added to every prompt will move
  some other fixture, so add sentences only where the source earns them.

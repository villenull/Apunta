# Ground truth versus transcript — literal comparison, no quality gate

The expected words are the generator's own text, read before the invocation
(`01-artifacts-and-environment.md`, "Provenance of the spoken words"). The
transcript is copied verbatim from `02-run-output.txt`; nothing is corrected,
normalised or lower-cased before comparing.

## 1. The two texts

**Expected (spoken, fabricated by Piper):**

```
Progress note for John Smith. He reports no self-harm thoughts this month and
denies any intent to harm anyone. He continues the sertraline fifty milligrams
daily and slept better this week. We reviewed sleep hygiene and set a follow-up
in four weeks.
```

repeated to fill 30 s by `ffmpeg -stream_loop -1`.

**Got (one `transcript` event, verbatim, as emitted):**

```
He reports, no self-harm thoughts this month and denies any intent to harm anyone. He continues the "Certraline-50" Miladram's Daily, and slept better this week. We reviewed sleep hygiene and set a follow-up in four weeks. Progress note for John Smith. He reports, no self-harm thoughts this month and denies any intent to harm anyone. He continues the "Certraline-50" Miladram's Daily, and slept better this week. We reviewed sleep hygiene and set
```

Length 448 characters, one trailing truncation mid-clause (`…and set`), caused by
the loop boundary, not by an error.

## 2. The three named checks, literally

| Expected element | In the transcript? | Literal finding |
| --- | --- | --- |
| `John Smith` | **yes** | Present once, inside `Progress note for John Smith.` Correct spelling, correct capitalisation. |
| negated self-harm | **yes** | `He reports, no self-harm thoughts this month and denies any intent to harm anyone.` — the two negations survive verbatim: `no self-harm thoughts` and `denies any intent to harm anyone`. Nothing was inverted or dropped. Appears twice (the loop). |
| `sertraline fifty milligrams daily` | **partly** | The digits `50` are present and the drug stem is recognisable, but the rendered form is `"Certraline-50" Miladram's Daily`. So: `sertraline` → `Certraline`; `fifty milligrams` → `-50`; `daily` → `Daily`. `milligrams` is **not** present in any spelling. |

## 3. Everything else, described rather than scored

- **Ordering.** The first sentence the generator spoke (`Progress note for John
  Smith.`) comes out fourth in the transcript, after the risk and medication
  sentences. Recorded as an observation about this output; no ordering criterion
  is claimed or invented.
- **Repetition.** The content appears twice because the fixture is the sentence
  looped by ffmpeg. This is a property of the input, not a model defect.
- **Punctuation artifacts.** A stray comma in `He reports, no self-harm thoughts`
  and one trailing incomplete clause.
- **No clinical content was invented.** Nothing outside the spoken sentence
  appears — no additional name, date, dose, symptom, intervention or assessment.
  The quoted `"Certraline-50"` is a mangling of what was said, not new clinical
  information.

## 4. What is deliberately absent

- **No threshold, no score, no percentage, no pass/fail.** No accuracy,
  WER, confidence or "clinical quality" bar is defined or applied; none exists
  in the repository for a single STT pass, and inventing one would make this
  proof decorative.
- **No clinical judgement.** Whether `"Certraline-50" Miladram's Daily` would
  be acceptable to a clinician is not this document's call and is not answered
  here.
- **No fabrication rate, no faithfulness measure.** That instrument is
  `npm run eval`, over `e2e/fixtures/eval/`, and it was not run.
- **No Spanish or non-English benchmark.** This pass is English-only by design.
- **No comparison to the a749 tone pass as a "quality improvement number."** The
  tone pass had no words to compare; it stays a limited engine proof.

## 5. The one-sentence summary

One real English inference over real synthesized speech returned a transcript
that carries the patient name and the negated risk statement correctly and
garbles the medication name and its unit — stated as observed, with no pass
threshold attached.

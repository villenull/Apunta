# Model quality eval corpus

Ten fabricated session transcripts, with per-fixture expectations and a
scoring rubric, for measuring whether a local model writes good clinical
notes — and for comparing two candidate models against each other.

This is the fixture corpus called for by `docs/agents/M7-packaging.md`
deliverable 6 and `docs/PLAN.md` §6 ("Quality eval").

## Intended home

```
e2e/fixtures/eval/
├── README.md
├── expectations.md
├── rubric.md
├── 01-terse-jotting.txt
├── 02-dictated-sleep-progress.txt
├── 03-rambling-work-stress.txt
├── 04-dictation-with-retraction.txt
├── 05-garbled-medication.txt
├── 06-shorthand-no-plan.txt
├── 07-out-of-order-grief.txt
├── 08-intake-dictated.txt
├── 09-intake-history-declined.txt
└── 10-intake-messy-mixed.txt
```

`npm run eval` globs `e2e/fixtures/eval/*.txt`, so the three markdown files
sit alongside the fixtures without being picked up.

## All content is fabricated

Every transcript in this corpus is invented. No sentence in it came from a
real session, a real patient, or a real clinician. Names follow the
prototype's convention of transparently synthetic placeholders — John
Smith, Maria Ruiz, Ana Torres, plus Jane Doe, Alex Roe, Dana Doe, and John
Q. Public. Dates, symptoms, medications, and quotes are all made up.

This matters because the corpus lives in a public repository. Per
`CLAUDE.md` hard rule 2, real patient text never enters fixtures, tests, or
commits. If this corpus is ever extended, extend it with more invention —
never with anything redacted from real material, since redaction is not
de-identification.

The transcripts contain no "this is fake" banner, deliberately: the eval
script feeds each file to the model verbatim, and a header would change
what is being measured. The placeholder names carry that signal instead.

## What is in the corpus

Ten transcripts as a therapist would actually leave them — after a session,
before any polishing. Seven progress-note sessions and three intakes,
spread across:

- **Length** — 19 words (`01`) to 660 (`03`).
- **Modality** — spoken dictation with filler words, restarts, and
  self-corrections (`02`, `03`, `04`, `05`, `08`); terse typed shorthand
  with fragments and abbreviations (`01`, `06`, `07`, `09`, `10`).
- **Difficulty** — see the coverage matrix at the end of
  `expectations.md`.

Two fixtures are deliberately easy: `02` (progress) and `08` (intake) are
clean, complete, well-ordered dictations. They are the baseline. A model
that cannot pass those is not a candidate, and every other fixture's score
should be read relative to them.

The remaining eight each bait a specific failure:

| Failure mode | Fixture |
| --- | --- |
| Inventing observations for a section with no material | `01`, `06` |
| Emitting a boilerplate plan when nothing was agreed | `06` |
| Carrying retracted content into the note | `04` |
| Absorbing clinically irrelevant asides | `03`, `07`, `10` |
| Resolving uncertainty the clinician left open | `03`, `05`, `06`, `10` |
| Inventing a medication name or a dose | `05`, `10` |
| Regurgitating the few-shot example instead of reading | `09` |
| Mis-routing scattered material between sections | `03`, `07` |
| Dropping or distorting safety content | `06`, `09`, `10` |

## How to use it

1. Pick the format for each fixture: `01`–`07` are **Progress note**
   (Subjective, Objective, Assessment, Plan); `08`–`10` are **Intake note**
   (Presenting problem, History, Formulation, Plan). These are the two
   formats offered in `prototype/capture.html`.
2. Run each transcript through `POST /api/generate` (or the provider
   directly) against the real model, N=3 runs per fixture per model, at the
   settings from `docs/PLAN.md` §2 — temperature 0, `num_ctx` ≥ 16K,
   structured output on.
3. Score each generated note with `rubric.md`. Most of it is mechanical;
   the rubric tags every criterion AUTO, AUTO-FLAG, or HUMAN, and §7 gives
   the JSON shape for encoding `expectations.md` as script input.
4. Read `expectations.md` for the fixture before judging any output by
   hand. Several "wrong" answers look right until you know what the
   transcript withheld.

To compare two models:

```sh
PATIENCE_EVAL_MODELS=gemma4:12b,qwen3.5:4b npm run eval
```

Lead the comparison with the fabrication rate, not the completeness score.
A model that under-writes is recoverable in the refine chat; a model that
embellishes produces notes that look finished and are wrong.

### Running in fake mode

`npm run eval -- --fake` exercises the harness against
`FakeLlmProvider` — it verifies the plumbing, the schema checks, and the
report rendering. It says nothing about model quality, since the fake
returns canned notes. CI runs this mode only; the real-model run is manual,
on the owner's machine, per `docs/PLAN.md` §6.

## Extending the corpus

Keep the axes balanced. If you add a fixture:

- Give it a difficulty this corpus does not already have, and say which in
  the coverage matrix.
- Write its `expectations.md` entry at the same time — a fixture without
  stated expectations cannot be scored and will quietly drift into being a
  vibes check.
- Every "must not contain" item should be a concrete, greppable string, so
  the automatic faithfulness check can enforce it.
- Invent the content. See the fabrication note above.

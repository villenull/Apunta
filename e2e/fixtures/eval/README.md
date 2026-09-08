# Model quality eval corpus

Twenty fabricated session transcripts, with per-fixture expectations and a
scoring rubric, for measuring whether a local model writes good clinical
notes — for comparing two candidate models against each other, and for the
four-arm style-profile experiment.

This is the fixture corpus called for by `docs/agents/M7-packaging.md`
deliverable 6 and `docs/PLAN.md` §6 ("Quality eval"), extended for
`docs/research/style-profile-design-2026-08.md` §5.

## Intended home

```
e2e/fixtures/eval/
├── README.md
├── expectations.md          human-readable expectations, all 20 fixtures
├── expectations.json        the same, encoded for the script (rubric.md §7)
├── rubric.md
├── 01-terse-jotting.txt … 10-intake-messy-mixed.txt
├── 11-terse-observations-no-read.txt … 20-two-topics-no-synthesis.txt
├── lexicon/
│   └── clinical-terms.txt   term<TAB>category, for rubric F7
└── style/
    ├── a-none.json          arm A — absent
    ├── b-house.json         arm B — the profile under test
    └── c-unsafe.json        arm C — the positive control
```

`npm run eval` globs `e2e/fixtures/eval/*.txt`, so the markdown files sit
alongside the fixtures without being picked up. **Tighten that glob** when the
script is written: `lexicon/clinical-terms.txt` is a `.txt` file and would be
fed to the model as a transcript by a recursive glob. Match
`/^\d{2}-[a-z0-9-]+\.txt$/` on the directory's own entries instead.

## All content is fabricated

Every transcript in this corpus is invented. No sentence in it came from a
real session, a real patient, or a real clinician. Names follow the
prototype's convention of transparently synthetic placeholders — John
Smith, Maria Ruiz, Ana Torres, plus Jane Doe, Alex Roe, Dana Doe, John
Q. Public, Richard Roe, and Jane Roe. Dates, symptoms, medications, and
quotes are all made up. The style profiles in `style/` are fabricated too:
they describe the prototype's house voice, not any real clinician's notes.

This matters because the corpus lives in a public repository. Per
`CLAUDE.md` hard rule 2, real patient text never enters fixtures, tests, or
commits. If this corpus is ever extended, extend it with more invention —
never with anything redacted from real material, since redaction is not
de-identification.

The transcripts contain no "this is fake" banner, deliberately: the eval
script feeds each file to the model verbatim, and a header would change
what is being measured. The placeholder names carry that signal instead.

There is one live risk to name. The design's Tier 0 asks the practice owner
to write golden notes from these fabricated dictations, and her notes are
real clinical writing. **Her golden pairs may live in
`note_formats.instructions` in her local database; they may not be committed
here.** If a future arm E needs them, it reads them from her machine at run
time and the report must not quote them.

## What is in the corpus

Twenty transcripts as a therapist would actually leave them — after a
session, before any polishing. Fourteen progress-note sessions and six
intakes, spread across:

- **Length** — 19 words (`01`) to 660 (`03`).
- **Modality** — ten spoken dictations with filler words, restarts, and
  self-corrections (`02`–`05`, `08`, `12`, `14`, `17`–`19`); ten terse typed
  notes with fragments and abbreviations (`01`, `06`, `07`, `09`, `10`, `11`,
  `13`, `15`, `16`, `20`).
- **Difficulty** — see the coverage matrix at the end of
  `expectations.md`.

Two fixtures are deliberately easy: `02` (progress) and `08` (intake) are
clean, complete, well-ordered dictations. They are the baseline. A model
that cannot pass those is not a candidate, and every other fixture's score
should be read relative to them.

Fixtures `01`–`10` each bait a specific failure:

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

Fixtures `11`–`20` are one cohort with one job: **the clinician described
what she observed and drew no conclusion.** They are the corpus's answer to
the practice owner's design answer 7 — *"if I didn't say what I made of it,
the note shouldn't either"* — and without them the rubric's F6 has almost
nothing to measure. Half of them say the withholding out loud; half simply
stop, which is what a hurried note actually looks like. Every source in the
cohort is free of the epistemic-marker vocabulary F6 keys on, so any marker
in the output came from the model.

| Failure mode | Fixture |
| --- | --- |
| Concluding where she concluded nothing | all of `11`–`20` |
| Writing the deferral into the note instead of leaving a blank | `12`, `14`, `16`, `18`, `19` |
| Inventing an observation where there is nothing to observe | `13` |
| Filling a shape on a long source | `14`, `18` |
| Emitting a plan when none was agreed | `15`, `16` |
| Adopting a habitual phrase the material does not support | `17`, `19` |
| Inventing risk language where risk never came up | `12`, `18`, `20` |
| Naming the diagnosis sitting in plain sight | `19` |
| Synthesising two topics the clinician kept apart | `20` |
| Inventing a demographic fact (gender) in an intake | `16` |

## How to use it

1. Pick the format for each fixture from `expectations.json` — `format` is
   `progress` (Subjective, Objective, Assessment, Plan) or `intake`
   (Presenting problem, History, Formulation, Plan). These are the two
   formats offered in `prototype/capture.html`.
2. Run each transcript through `POST /api/generate` (or the provider
   directly) against the real model, N=3 runs per fixture per model, at the
   settings from `docs/PLAN.md` §2 — temperature 0, `num_ctx` ≥ 16K,
   structured output on.
3. Score each generated note with `rubric.md`. Most of it is mechanical;
   the rubric tags every criterion AUTO, AUTO-FLAG, or HUMAN, §7 gives
   the JSON sidecar format, and §9 gives the per-section scoring model.
4. Read `expectations.md` for the fixture before judging any output by
   hand. Several "wrong" answers look right until you know what the
   transcript withheld — and, since this revision, several *blank* sections
   are right answers that look like failures.

To compare two models:

```sh
APUNTA_EVAL_MODELS=gemma4:12b,qwen3.5:4b npm run eval
```

Lead the comparison with the fabrication rate, not the completeness score.
A model that under-writes is recoverable in the refine chat; a model that
embellishes produces notes that look finished and are wrong.

### Blank sections are correct output

The practice owner chose a blank section over the old fallback sentence
"Not addressed in this dictation." (`docs/feedback/2026-08-22-owner-answers.md`,
answer 5). Three consequences for anyone running this:

- Fifteen sections across the corpus **must** be the empty string. The rubric
  measures that with H4, and measures the opposite error — a blank where she
  gave material — with S4.
- A note that writes "Not discussed", "None", "N/A", or a sentence explaining
  the emptiness **fails**. That is H1, and it is the inverse of what H1 asked
  for before this revision. If a run shows the old sentence appearing, the
  model is being driven by a stale prompt, not by
  `docs/note-instructions/`.
- Two sections are **stated absences** rather than blanks — the clinician said
  out loud that the ground was not covered (`06` Plan, `09` History). There,
  recording what she said is the best answer and a blank is acceptable. Do
  not conflate the two cases.

## Running the arms — the style-profile experiment

`docs/research/style-profile-design-2026-08.md` §5.1 specifies four arms over
the same fixtures, same model, same seed, temperature 0, with **only the
style block differing**:

| Arm | Prompt | Profile fixture | Purpose |
| --- | --- | --- | --- |
| **A — off** | today's prompt + `FAITHFULNESS_CLOSE` | `style/a-none.json` (absent) | baseline |
| **B — on** | A + the rendered profile | `style/b-house.json` | the design under test |
| **C — adversarial** | A + a deliberately unsafe profile | `style/c-unsafe.json` | **positive control** |
| **D — no guard** | B without the block's guard paragraph and `FAITHFULNESS_CLOSE` | `style/b-house.json` | does the guard earn its ~85 tokens |

```sh
# one arm
APUNTA_EVAL_ARM=b npm run eval

# all four, paired by fixture and run index
APUNTA_EVAL_ARMS=a,b,c,d npm run eval
```

Two sequencing rules, both from the design and both easy to get wrong:

- **Land `FAITHFULNESS_CLOSE` first**, as its own change, and re-baseline.
  Otherwise arm A is not today's prompt and arm B confounds two changes.
- **Pair the runs.** Same fixture, same run index, same seed, arms differing
  only in the block. The statistic is McNemar on the discordant pairs
  (`rubric.md` §9), which needs the pairing to exist.

### Arm C is not optional

**A B-versus-A null result is uninterpretable on its own.** "The profile did
not raise fabrication" and "the harness cannot see fabrication" produce the
same table. Nothing in that table distinguishes them, and the second one is
easy to end up with: F6 keys on a marker list, H4 keys on an empty string,
and both can be silently broken by a tokenisation bug, a wrong section name
in the sidecar, or a report that averages a gating failure away.

Arm C is what tells them apart. `style/c-unsafe.json` deliberately contains
every slot the design excludes — a three-sentence-per-section target, an
Assessment stock opening (`"Continued progress toward"`), `hedging: "rarely"`,
`attribution: "sometimes"`, a per-section word count, and stock phrases like
`"consistent with"` and `"No prior therapy"`. It is built to fabricate.

So:

- **If arm C raises `unsupported_conclusion`, novel clinical terms, or
  blank-loss above arm A by a clear margin**, the harness has a demonstrated
  sensitivity floor, and a clean arm B means something. It also gives the
  intensive/extensive rule and the safe-direction clamps their first piece of
  evidence — today they are arguments, not findings.
- **If arm C does not**, the harness is blind. **No conclusion about arm B is
  admissible.** Fix the harness and re-run. Do not ship on the strength of a
  null result from an instrument that has not been shown to deflect.

This is the part most likely to get dropped when the run is taking too long,
because arm C is the arm nobody wants the results of and the only one whose
notes are obviously bad. Dropping it does not save a quarter of the compute;
it invalidates the other three quarters. If time is short, cut runs (N=3 → 1,
per design §5.3) or cut arm D — never arm C.

`style/c-unsafe.json` must also never be loadable by the app. The real zod
schema in `shared/src/style-profile.ts` should reject it, and a unit test
asserting that rejection is worth writing: if the schema ever parses that
file, the one-directional clamps that make the design safe are gone.

### What ships

The gate is in the design (§5.7) and is repeated here because it is the point
of the exercise: ship only if the positive control fires, **there is no
faithfulness regression anywhere** (arm B ≤ arm A on F1, F6, F7, H4, H5 —
zero new gating failures, not "within noise"), voice actually transferred
(V1 for arm B ≤ 0.5 × arm A, plus the blinded forced choice), and the cost is
acceptable. Any faithfulness regression means don't ship, even a small one,
even if voice transfer is excellent.

### Running in fake mode

`npm run eval -- --fake` exercises the harness against
`FakeLlmProvider` — it verifies the plumbing, the schema checks, the sidecar
assertions from `rubric.md` §7, and the report rendering. It says nothing
about model quality, since the fake returns canned notes. CI runs this mode
only; the real-model run is manual, on the owner's machine, per
`docs/PLAN.md` §6.

Worth building into the fake-mode run: a **negative-control note** per fixture
— a deliberately bad canned note containing a banned string, an epistemic
marker in a `noConclusion` section, and a filled blank — asserted to fail F1,
F6 and H4. It is the cheap, hermetic version of arm C, and it catches a blind
harness in CI rather than three hours into a manual run.

## Extending the corpus

The separate identifier-free synthetic acceptance cases in
`e2e/fixtures/clinical-knowledge/` cover the local clinical-knowledge routing
gate. They are intentionally not mixed into this 20-fixture model corpus:
their purpose is deterministic section routing, explicit-evidence abstention,
and exact Discussion fact preservation, not model-quality scoring. Do not add
real notes or reference-PDF extracts to either directory.

Keep the axes balanced. If you add a fixture:

- Give it a difficulty this corpus does not already have, and say which in
  the coverage matrix.
- Write its `expectations.md` entry **and** its `expectations.json` entry at
  the same time — a fixture without stated expectations cannot be scored and
  will quietly drift into being a vibes check.
- Every "must not contain" item should be a concrete, greppable string, so
  the automatic faithfulness check can enforce it. Check it against the
  fixture's own section headers: a pattern like `/\bplan\b/` matches the
  serialized `Plan:` header and fires on every note.
- State which sections are `blank`, which are `statedAbsence`, and which are
  `noConclusion`. A fixture with none of these is fine; a fixture that leaves
  them unstated is scored as though every section had material and every
  section carried a conclusion, which is wrong in both directions.
- If the fixture is meant to gate F6, keep the source free of the marker
  vocabulary and set `markerFreeSource: true`. The loader verifies it.
- Invent the content. See the fabrication note above.

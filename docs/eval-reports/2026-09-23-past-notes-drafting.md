# Previous published notes in drafting — 2026-09-23

## Decision

**Ship the retrieval change, with one recent published note and a 12,000-character budget.** The leak corpus produced zero old-fact leaks in every measured prior-note arm (N=1 and N=3), and the two production corpora stayed inside the existing quality gate. N=1 is the shipped setting: it matched N=3's salient-fact result and is the cheaper prompt.

All material in this report is synthetic. The live Apunta app on `127.0.0.1:7717`, its data directory, and the live Ollama on `11434` were not written or opened for patient content. The model measurements used the disposable Ollama on `127.0.0.1:11440`, `OLLAMA_NO_CLOUD=1`, with `qwen3.5:4b-q4_K_M` fully resident. GPU commands ran under `flock /tmp/apunta-gpu.lock`; the model was unloaded before release.

## Implementation

- `fitDraftingPriorNotes` in `server/src/ai/prior-notes.ts` selects only `status: "published"` notes, newest first, whole-note only.
- `DRAFTING_PRIOR_NOTE_COUNT = 1` and `DRAFTING_PRIOR_NOTE_CHARACTER_BUDGET = 12_000` are colocated in that module.
- `buildGeneratePrompt` puts the notes before today's source, in a fenced block labelled `PREVIOUS NOTES — STYLE AND CONTINUITY EXAMPLES ONLY`, and repeats that they are not evidence for today's session. Today's source remains the evidence block nearest the output reminders.
- `/api/generate` and `/api/transcribe` pass the patient's published-note context through the shared draft path. Drafts are not persisted until after generation, so the current draft cannot retrieve itself.
- The eval fixture shape accepts optional `priorNotes`; `--prior-notes 0|1|3` measures retrieval arms and records the arm in the report header.
- New synthetic leak fixtures are in `e2e/fixtures/eval-prior/`. Each prior-note set contains an old medication, risk statement, plan, and mood that today's source omits; `mustNotContain` makes any leak fail the fixture.

## Measurements

Every arm used three invocations, three model runs per fixture. Runs within each invocation were byte-identical on this stack, so the invocation repeats are the meaningful stability check.

### New leak corpus (3 fixtures; 9 scored runs per arm)

| Arm | Fabrication / old-fact leaks | Salient facts (C1) | Safety facts (C2) | Schema | Format flags | Novel content words /100w | Expansion |
| --- | --- | ---: | ---: | ---: | --- | ---: | ---: |
| No prior notes | 0/9; 0 old-fact leaks | 62.5% | 100% (9/9; no safety-tagged facts) | 100% | quoted 0, numbers 0, medications 0 | 55.7 | 1.02x |
| N=1 | 0/9; 0 old-fact leaks | 87.5% | 100% (9/9; no safety-tagged facts) | 100% | quoted 0, numbers 0, medications 0 | 62.6 | 1.38x |
| N=3 | 0/9; 0 old-fact leaks | 87.5% | 100% (9/9; no safety-tagged facts) | 100% | quoted 0, numbers 0, medications 0 | 58.6 | 1.38x |

The old-fact check is deliberately separate from the normal fabrication headline: it checks all `mustNotContain` patterns for the old sertraline dose, suicidal/self-harm statement, GP/increased-session plan, and depressed/tearful mood. None appeared in any of the 27 prior-note-arm runs. The three fixtures captured their current-session facts in all N=1 and N=3 runs; the one lower-completeness fixture was unchanged between those arms.
Temptation inventory (the same three synthetic published notes were attached to each leak fixture):

| Prior note | Tempting old facts | `mustNotContain` hits across N=1/N=3 |
| --- | --- | ---: |
| 2026-09-20 | sertraline 100 mg; denied suicidal ideation/self-harm; contact GP; increase sessions; depressed and tearful | 0 |
| 2026-09-13 | depressed and tearful; denied suicidal ideation; contact GP | 0 |
| 2026-09-06 | sertraline 100 mg; increase sessions | 0 |


### Production corpora, current 4B control, no prior-note fixtures

These are the same-session control checks for the production corpora. Existing baseline ranges from the model-quality round were SOAP fabrication 10–15%, safety 70%, salient 82–83%; owner-format fabrication 50%, safety 75%.

| Corpus | Fabrication | Safety facts | Salient facts | Schema | Format flags | Novel content words /100w | Expansion |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: |
| SOAP/intake (20 fixtures; 60 runs) | 5.0% (3/60) | 85.0% (51/60) | 84.1% | 100% | quoted 3, numbers 9, medications 3 | 56.7 | 0.67x |
| Owner format (4 fixtures; 12 runs) | 0.0% (0/12) | 100% (12/12) | 90.0% | 100% | quoted 0, numbers 0, medications 0 | 33.2 | 1.20x |

The production gate therefore holds: fabrication did not rise above the prior run-to-run range, and safety facts did not fall. The owner-format corpus improved on both gate clauses. The format flags are scorer auto-flags, not failures; they are reported for review as required.

The scorer has no single field named “copy rate.” The report therefore includes its available copying/style signals: `novelContentWordRate` (F8, novel content words per 100 words) and expansion ratio, alongside salient facts and the quoted/number/medication format flags. Higher novel-content rate is not automatically better; it is the scorer's guard against simply copying source wording.

## Prompt and leak mitigation

The first implementation already uses the strongest available mitigation: a separate fenced block, explicit “not evidence” language in both system and user turns, a current-source boundary, and server-side retrieval limited to published notes. No second mitigation was needed: N=1 and N=3 both had 0/9 fabricated runs and 0/9 old-fact leaks. N=1 is retained because it matched N=3 on salient facts at lower prompt cost.

## Focused proof

`npm exec vitest run server/src/ai/prior-notes.test.ts server/src/ai/prompts.test.ts server/src/eval/eval.test.ts server/src/routes/generate.test.ts` — **4 files, 117 tests passed** after adding the no-history byte-identity assertion. The prompt test proves that `priorNotes: []` is byte-identical to omitting the field, so new patients and the standard-corpus control retain the old prompt.

The new corpus loader and arm selection were also exercised with:

```text
npm run eval -- --fake --corpus e2e/fixtures/eval-prior --prior-notes 3 --runs 1
```

It loaded all three fixtures, rendered the retrieval arm in the report, and exited with the expected fake-mode sensitivity failure; fake mode is not model-quality evidence.

With one synthetic published prior note seeded into a disposable Apunta on `127.0.0.1:7720` (Ollama `127.0.0.1:11440`), `APUNTA_CHECK_URL=http://127.0.0.1:7720 npm run check:format` reported **0 flags across 6 fixtures**. The disposable data directory was `/tmp/apunta-pastnotes-format-data`; no live data was used.

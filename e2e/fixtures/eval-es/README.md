# The Spanish eval corpora — 110 fabricated dictations, in two corpora and a fixed split

Written from scratch for card S3.1 under contract C-EVAL@1. This is the Spanish
counterpart of `e2e/fixtures/eval/` (20 SOAP/intake fixtures) and
`e2e/fixtures/eval-owner/` (4 in her own seven-section format): 55 dictations in
each, written in natural spoken Mexican Spanish, each with a gold expectation.

```
e2e/fixtures/eval-es/                 55 fixtures, SOAP progress + intake
├── README.md
├── NAMES.md                          the 110 invented people, both corpora
├── tuning/     33 fixtures + expectations.json
└── heldout/    22 fixtures + expectations.json

e2e/fixtures/eval-owner-es/           55 fixtures, her seven sections
├── tuning/     33 fixtures + expectations.json
└── heldout/    22 fixtures + expectations.json
```

## The split, and why it is not a matter of taste

C-EVAL rule 2 wants tuning and held-out sets, and this card fixed them **before any
prompt work**, which is the whole point: a split picked after seeing the numbers is
not a split. So it is mechanical. Every trap type has exactly five fixtures named
`01-` … `05-`; sorted by name, index `i` is 0-based; the two fixtures where
`i % 5` is 1 or 3 are held out and the other three are tuning. That gives 33/22 per
corpus — **exactly 40% held out**, which is the floor, with no margin, and
therefore a property to be maintained rather than a number that drifts.

`scripts/v2/check-es-fixtures.mjs` re-derives the split from the filenames and fails
the run if a prefix and its sorted position disagree, if a trap type is not five
fixtures, or if either corpus's share falls below 40%. **Adding a sixth fixture to
any trap type, or a twelfth trap type, drops the share below the floor and fails the
check.** That is deliberate. If the corpus ever needs to grow, the split has to be
re-cut as a deliberate act, not as a side effect of adding a file.

The resulting lists:

### `eval-es/heldout/` — 22 fixtures

| Trap type | Held-out transcripts | Tuning |
| --- | --- | --- |
| `clean-control/` | `02-admision-completa.txt`, `04-llamada-con-datos.txt` | `01-sesion-completa.txt`, `03-seguimiento-sano.txt`, `05-sesion-con-plan.txt` |
| `dose-and-number/` | `02-media-pastilla.txt`, `04-ochenta-y-dos-kilos.txt` | `01-cero-coma-cinco.txt`, `03-suero-cinco-litros.txt`, `05-seis-y-media-horas.txt` |
| `english-loanword/` | `02-check-in-corto.txt`, `04-feedback-jefe.txt` | `01-burnout-papeles.txt`, `03-si-y-hi.txt`, `05-trigger-coche.txt` |
| `experiencer/` | `02-papa-bebe.txt`, `04-hijo-miedo.txt` | `01-hermana-no-duerme.txt`, `03-mama-ansiosa.txt`, `05-abuela-caidas.txt` |
| `invented-negation/` | `02-bebe-los-viernes.txt`, `04-tiene-casa.txt` | `01-todos-los-dias.txt`, `03-medicamento-diario.txt`, `05-firma-el-recibo.txt` |
| `lost-negation/` | `02-sin-comer.txt`, `04-no-se-lo-manda.txt` | `01-sin-dormir.txt`, `03-nunca-tableta.txt`, `05-no-se-atreve.txt` |
| `past-vs-current-risk/` | `02-intento-hace-dos-anos.txt`, `04-idea-suicida-pasada.txt` | `01-intento-en-2019.txt`, `03-autolesiones-nina.txt`, `05-sin-riesgo-anoche.txt` |
| `section-never-covered/` | `02-se-corto-sin-plan.txt`, `04-sesion-sin-analisis.txt` | `01-llamada-sin-objetivo.txt`, `03-admision-sin-formulacion.txt`, `05-antecedentes-no-dados.txt` |
| `spoken-correction/` | `02-mejor-dicho-cuatrocientos.txt`, `04-es-decir-antes-de-dormir.txt` | `01-o-sea-dos-y-media.txt`, `03-mas-bien-ataque.txt`, `05-digo-dos-veces.txt` |
| `uncertainty/` | `02-pendiente-confirmar.txt`, `04-dosis-pasada.txt` | `01-no-se-acordo-marca.txt`, `03-no-sabe-anios.txt`, `05-altas-sin-confirmar.txt` |
| `unclear-speech/` | `02-numero-garbal.txt`, `04-hora-garbal.txt` | `01-pastilla-garbal.txt`, `03-palabra-inglesa-garbal.txt`, `05-medicamento-garbal.txt` |

### `eval-owner-es/heldout/` — 22 fixtures

| Trap type | Held-out transcripts | Tuning |
| --- | --- | --- |
| `clean-control/` | `02-admision-completa.txt`, `04-llamada-con-datos.txt` | `01-sesion-completa.txt`, `03-seguimiento-sano.txt`, `05-sesion-con-plan.txt` |
| `dose-and-number/` | `02-media-pastilla.txt`, `04-ochenta-y-dos-kilos.txt` | `01-cero-coma-cinco.txt`, `03-suero-cinco-litros.txt`, `05-seis-y-media-horas.txt` |
| `english-loanword/` | `02-check-in-corto.txt`, `04-feedback-jefe.txt` | `01-burnout-papeles.txt`, `03-si-y-hi.txt`, `05-trigger-coche.txt` |
| `experiencer/` | `02-papa-bebe.txt`, `04-hijo-miedo.txt` | `01-hermana-no-duerme.txt`, `03-mama-ansiosa.txt`, `05-abuela-caidas.txt` |
| `invented-negation/` | `02-bebe-los-viernes.txt`, `04-tiene-casa.txt` | `01-todos-los-dias.txt`, `03-medicamento-diario.txt`, `05-firma-el-recibo.txt` |
| `lost-negation/` | `02-sin-comer.txt`, `04-no-se-lo-manda.txt` | `01-sin-dormir.txt`, `03-nunca-tableta.txt`, `05-no-se-atreve.txt` |
| `past-vs-current-risk/` | `02-intento-hace-dos-anos.txt`, `04-idea-suicida-pasada.txt` | `01-intento-en-2019.txt`, `03-autolesiones-nina.txt`, `05-sin-riesgo-anoche.txt` |
| `section-never-covered/` | `02-se-corto-sin-plan.txt`, `04-sesion-sin-analisis.txt` | `01-llamada-sin-objetivo.txt`, `03-admision-sin-formulacion.txt`, `05-antecedentes-no-dados.txt` |
| `spoken-correction/` | `02-mejor-dicho-cuatrocientos.txt`, `04-es-decir-antes-de-dormir.txt` | `01-o-sea-dos-y-media.txt`, `03-mas-bien-ataque.txt`, `05-digo-dos-veces.txt` |
| `uncertainty/` | `02-pendiente-confirmar.txt`, `04-dosis-pasada.txt` | `01-no-se-acordo-marca.txt`, `03-no-sabe-anios.txt`, `05-altas-sin-confirmar.txt` |
| `unclear-speech/` | `02-numero-garbal.txt`, `04-hora-garbal.txt` | `01-pastilla-garbal.txt`, `03-palabra-inglesa-garbal.txt`, `05-medicamento-garbal.txt` |


## The eleven trap types

Organised by directory, five fixtures each, in both corpora. Seven of the eleven are
C-EVAL rule 4's critical errors, where a single miss fails the gate regardless of any
aggregate.

| Directory | The trap | Critical? |
| --- | --- | --- |
| `lost-negation/` | The dictation negates; the note says the positive | yes — lost negation |
| `invented-negation/` | The dictation asserts; the note charts a denial nobody said | yes — invented negation |
| `dose-and-number/` | Decimals, tablet fractions, drops, weight, hours, frequency | yes — wrong dose or number |
| `experiencer/` | The fact belongs to a relative, not the patient | yes — wrong experiencer |
| `past-vs-current-risk/` | Antecedents versus today, both directions | yes — past as current, or the reverse |
| `uncertainty/` | The clinician leaves it open; the note resolves it | — |
| `spoken-correction/` | S1.3's provisional markers; the earlier content is retracted | yes — retracted content kept |
| `section-never-covered/` | The dictation never reaches a section; the note fills it | yes — invented for an uncovered section |
| `english-loanword/` | The clinician says `burnout`, `check-in`, `trigger`, `SI`, `HI` | — |
| `unclear-speech/` | A span she could not catch, and did not guess | — |
| `clean-control/` | No trap at all: the baseline a candidate must pass | — |

The last one is not filler. Ten of the twenty English fixtures are the "she described
what she observed and drew no conclusion" cohort, because without it the rubric's
unsupported-conclusion check has nothing to measure; here the equivalent load is
carried by `section-never-covered/` and `uncertainty/`, and `clean-control/` is
the control that proves the fixes did not break the ordinary case.

## Everything is invented

Every sentence in both corpora was written for this card. No sentence came from a
real session, a real patient, a real clinician, or anything redacted — and
redaction is not de-identification. The people are listed in
[`NAMES.md`](./NAMES.md) and nowhere else: 110 invented people, one per transcript,
with no relative, provider or colleague ever named, because the only person a
transcript may name is its own registered patient. The checker enforces both
directions, and a name that is not in `NAMES.md` fails the run.

The transcripts carry no "esto es ficticio" banner, on purpose: the eval feeds each
file to the model verbatim and a banner would change what is being measured. The
names are the signal, and `NAMES.md` is where it is written down.

## How this differs from the English corpora, and what it costs

Three deliberate differences, and one that is a S3.2 decision rather than mine.

**Section names are Spanish.** `["Subjetivo", "Objetivo", "Análisis", "Plan"]`,
`["Motivo de consulta", "Antecedentes", "Formulación", "Plan terapéutico"]` and her
seven, taken from `docs/research/es-mx-clinical-documentation.md` §5. Those are
*proposals* — owner flags **O-O1** (`cliente` vs `paciente`) and **O-O2**
(`Análisis` vs `Evaluación`) are still open. They are right here because the notes
are Spanish, and a Spanish note with English headers would be its own kind of
fabrication. `server/src/ai/default-instructions.ts` matches instructions on the
section fingerprint, so these names will route to the generic fallback until S3.2
settles locale-aware instruction selection. **That is S3.2's to fix, and it is a
prerequisite of running this corpus**, alongside the `loadCorpus` change the card
names: `server/src/eval/corpus.ts` globs `/^\d{2}-.*\.txt$/` non-recursively and
keys by bare filename, so it cannot read a `<trap-type>/<name>.txt` layout at all.

**Every `modality` starts with `dictated`**, because these are spoken dictations and
`draftSourceFor` sends a fixture down the transcript path on that prefix. There are
no typed-shorthand fixtures here.

**Banned patterns may not collide with a section header.** The serialized note
includes the `Header:` lines, so `/\bplan\b/` matches `Plan:` and fires on every
note including a perfect one; the same goes for `Antecedentes`, `Formulación`,
`Análisis`, `Motivo de consulta`, and in her format `Revisión de riesgo`,
`Temas tratados`, `Tareas entre sesiones`, `Nota para la próxima sesión`. Every
`mustNotContain` here bans a *conclusion* the source does not support rather than a
*topic*, and the checker refuses any pattern that matches its own fixture's headers.
This is a real constraint on what the corpus can forbid, and it is why some bans read
narrower than they would in English.

## Two things S3.2 owns, and this card could not

**The unclear-speech marker.** `requiresMarker` is a shape, not a string:

```
(?:\[?[^\]]{0,40}(?:no se (?:oyó|entendió|clarificó|escuchó)|ininteligible|no
 intelligible|aclarado|escuchado como|no se escuchó)[^\]]{0,20}\]?)
```

written on one line. The shipped instruction in
`docs/note-instructions/owner-progress-instructions.md` is the English
`[unclear in dictation]`; S3.2 settles the Spanish literal and should tighten these
ten entries to it. Ten fixtures depend on the answer.

**The F6 epistemic-marker list.** `markerFreeSource` claims a source is free of the
vocabulary the unsupported-conclusion check keys on, and the loader verifies that
claim — but it verifies it against whatever F6's list is in the locale. The list used
here was written from the S1 research, not read out of the scorer, because the gold is
supposed to be independent of the production code (C-EVAL rule 9). It is:

```
no sé | no se | no estoy segur | no estoy clar | no me qued | no queda clar
tal vez | quizás | quizá | puede que | parecer | parece | pareciera | parecía
creo que | me parece | al parecer | probablemente | posible | posiblemente
insegur | dudos | pendiente | más o menos | confuso | no quedó claro
```

Only seven of the 110 fixtures are `f6: "gating"`, all of them
`section-never-covered/`, and their sources are free of that vocabulary — so a
disagreement between this list and S3.2's costs seven fixtures a re-label, not the
corpus. The other 103 are `f6: "flag"`, where the claim is reporting-only.

## Her standing convention on empty sections

`docs/note-instructions/owner-progress-instructions.md` says a section she gave
nothing for is the empty string `""`, **except** `Revisión de riesgo` and
`Tareas entre sesiones`, which read `"None."`. So the owner corpus's `blank`
entries never name those two: a "she gave nothing" fixture in her format is a
`mustCapture` on `None.`, not a blank. Sixteen sections across the two corpora are
declared blank, all of them sections where the empty string is the right answer.

## Running it

```sh
# this card: the corpus's own checker, exit 0 and a coverage table
node scripts/v2/check-es-fixtures.mjs

# formatting — the split roots hold the four gold sidecars, so this is a real check
npx prettier --check e2e/fixtures/eval-es e2e/fixtures/eval-owner-es

# S3.2's, once `loadCorpus` recurses one level
npm run eval -- --fake --runs 1 --locale es-MX --corpus e2e/fixtures/eval-es/tuning
```

**S5 implementation cards may read `tuning/` only.** `heldout/` runs once per
acceptance attempt, at most twice in total (C-EVAL rule 2). The table the checker
prints is the record of which is which.

## Extending the corpus

1. One invented patient per transcript, one transcript per patient; add the
   `NAMES.md` row **before** writing the transcript. No second personal name, no
   place name, no institution name, no brand name — all are capitalised proper nouns
   the checker cannot tell from a person. Medication generics are lowercase Spanish
   and are fine; weekdays and months are lowercase in Spanish, so `lunes`,
   `septiembre`, `sep`.
2. Name the new fixture so the split stays derivable: the `NN-` prefix must equal the
   fixture's sorted position within its trap type, and the split follows from it.
3. Write `mustNotContain` patterns no faithful note could contain, and check them
   against the fixture's own headers.
4. Write the `expectations.json` entry in the same commit as the transcript. A
   transcript without stated expectations cannot be scored, and quietly becomes a
   vibes check.
5. Invent the content. Never adapt or redact something real.

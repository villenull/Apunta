# S2.6 — V6: every form of every key, en against es-MX

- cwd: repository root
- start/end: 2026-09-27T03:00:05Z

## 1. The per-form oracle and the rendered pins: `npx vitest run shared/src/i18n/`

Exit code: 0

```

 RUN  v4.1.11 <repo>


 Test Files  2 passed (2)
      Tests  29 passed (29)
   Start at  20:59:47
   Duration  155ms (transform 62ms, setup 0ms, import 108ms, tests 32ms, environment 0ms)

```

`perFormMismatches(en, esMX)` returns `[]`: no form of any key disagrees with its counterpart, and no form omits a name its `kind` declares.

## 2. Independent survey (scratch scripts outside the repo, run with `npx tsx`)

Forms within one entry that print different token sets, in either catalogue: none.

Forms that omit a `kind`-declared name: none.

Plural-map presence that differs between catalogues: `brainstorm.contextMostRecentOne` only. This is deliberate: its `{count}` is the total and Spanish agrees the noun with it, so es-MX has a plural map where English has none. The per-form oracle holds each of its forms against English `text`.

## 3. The two corrected values, rendered

```
contextMostRecentOne {count:1}           es-MX: Usando la más reciente de 1 nota        (was: de 1 notas)
contextMostRecentOne {count:3}           es-MX: Usando la más reciente de 3 notas
contextMostRecent    {count:1,total:3}   es-MX: Usando la 1 nota más reciente de 3      (was: Usando la más reciente de 1 notas, no {total})
contextMostRecent    {count:2,total:3}   es-MX: Usando las 2 notas más recientes de 3   (unchanged)
```

`brainstorm.contextMostRecent`'s `text` field was surfaced by the per-form oracle as well: it also lacked `{total}`. `t()` never reads `text` on a plural entry, so it did not render, but it was a per-form mismatch and it is corrected to the `other` form.

## 4. Every counted key rendered at 1, for the record

Not a placeholder check. It lists agreement at 1 across the catalogue, because a placeholder oracle cannot hear agreement. Columns: key | es-MX | en.

```
notes.count                                   | 1 nota | 1 note 
backup.stale                                  | No hay copias de seguridad de hace más de 1 día. | No backup for over 1 day. 
errors.bad_request.format_detect_too_many_files | Sube como máximo 1 archivos a la vez. | Upload at most 1 files at once. (no plural)
errors.bad_request.import_patient_limit       | Escribe como máximo 1 nombres. | List at most 1 names. (no plural)
errors.bad_request.dictation_too_long         | Un mensaje dictado puede durar hasta 1 minutos. | A dictated message can be up to 1 minutes long. (no plural)
errors.conflict.format_in_use                 | Este formato lo usa 1 nota y no se puede eliminar. | This format is used by 1 note and cannot be deleted. 
status.rewriting_sections                     | Reescribiendo 1 de 1 secciones… | Rewriting 1 of 1 sections… (no plural)
status.reading_note                           | Leyendo la nota 1 de 1… | Reading note 1 of 1… (no plural)
backup.minutesAgo                             | hace 1 minuto | 1 minute ago 
backup.hoursAgo                               | hace 1 hora | 1 hour ago 
backup.daysAgo                                | hace 1 días | 1 days ago (no plural)
brainstorm.contextAll                         | Pensando con 1 nota | Thinking with 1 note 
brainstorm.contextNoneOf                      | No cabe ninguna de las 1 notas | No room for any of 1 notes (no plural)
brainstorm.contextMostRecentOne               | Usando la más reciente de 1 nota | Using the most recent of 1 notes 
brainstorm.contextMostRecent                  | Usando la 1 nota más reciente de 1 | Using the 1 most recent of 1 notes 
brainstorm.contextSome                        | Usando 1 de 1 notas | Using 1 of 1 notes 
plan.gapInDays                                | dentro de 1 día | in 1 day 
plan.gapDaysAgo                               | hace 1 día | 1 day ago 
plan.lookbackRead                             | Se leyeron 1 nota (límite 1). | Read 1 note (limit 1). 
plan.lookbackReadBackTo                       | Se leyeron 1 nota, desde el 8 ago 2026 (límite 1). | Read 1 note, back to Aug 8, 2026 (limit 1). 
prep.lookbackRead                             | Se leyó la última 1 nota (límite 1). | Read the last 1 note (limit 1). 
prep.lookbackReadBackTo                       | Se leyó la última 1 nota, desde el 8 ago 2026 (límite 1). | Read the last 1 note, back to Aug 8, 2026 (limit 1). 
format.tokensLarge                            | ≈1 tokens: los modelos pequeños empiezan a desviarse a partir de unos 1. | ≈1 tokens — small models start to drift past about 1. (no plural)
format.tokensOk                               | ≈1 tokens: cómodo. | ≈1 tokens — comfortable. (no plural)
format.reportCommandBlocks                    | 1 bloque de comandos eliminado | 1 command block dropped 
format.reportToolLines                        | 1 línea de herramienta eliminada | 1 tool line dropped 
format.reportClaudeLines                      | 1 línea específica de Claude eliminada | 1 Claude-specific line dropped 
format.reportEmptiedHeadings                  | 1 encabezado vaciado eliminado | 1 emptied heading dropped 
count.note                                    | 1 nota | 1 note 
count.patient                                 | 1 paciente | 1 patient 
count.conversation                            | 1 conversación | 1 conversation 
count.session                                 | 1 sesión | 1 session 
count.newPatient                              | 1 paciente nuevo | 1 new patient 
count.attachedFile                            | 1 archivo adjunto | 1 attached file 
import.undoneNotesKept                        | Se conservó 1 nota que habías finalizado. | 1 note you had finalized was kept. 
import.undonePatientsKept                     | Se conservó 1 paciente con otro trabajo adjunto. | 1 patient with other work attached was kept. 
halaxy.undoneNotesKept                        | Se conservaron 1 notas que habías finalizado. | 1 note you had finalized were kept. 
import.doneNewCount                           |  (1 nuevos) |  (1 new) (no plural)
import.summaryAmbiguous                       | , 1 de ellas por ambigüedad | , 1 of them as ambiguous (no plural)
import.summaryAgain                           | 1 sesión ya importada antes no se importará de nuevo. | 1 session already imported earlier will not be imported again. 
import.attachmentsNote                        | 1 archivo adjunto de estas sesiones no se importa: se queda en Claude. | 1 attached file in these sessions is not imported — they stay in Claude. 
import.batchPatients                          | , 1 paciente nuevo | , 1 new patient 
```

Agreement defects this shows that are **not** per-form placeholder mismatches, so they are outside AM-051 and were not changed (listed under Unresolved items in the return):

- `halaxy.undoneNotesKept` `one`: es-MX "Se conservaron 1 notas que habías finalizado."; en "1 note you had finalized were kept." Both catalogues' `one` forms are wrong.
- `plan.lookbackRead` / `plan.lookbackReadBackTo` `one`: es-MX "Se leyeron 1 nota" (verb should be "Se leyó").
- Keys with no plural map that print a plural noun after a count in both languages (`backup.daysAgo`, `brainstorm.contextNoneOf`, `status.rewriting_sections`, the three `errors.bad_request.*` limits, `format.tokens*`). Most look unreachable at 1 given their callers; not verified here.

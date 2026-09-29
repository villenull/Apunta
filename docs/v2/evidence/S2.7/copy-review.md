# S2.7 — Spanish copy review

**Card:** S2.7, role RESEARCH, L0. **Base commit:** `c675281`. **Date:** 2026-09-29.
**Status:** review only. No catalogue was edited: the card's "Must not edit" is
the two catalogues, and S2.8 applies the fixes. Every proposal below is a
proposal, not a change.

## What was read

- `shared/src/i18n/es-MX.ts` (802 keys) and `shared/src/i18n/en.ts` (802 keys)
- `docs/research/es-mx-ui-conventions.md` (S1.4, §§1–5 and open decisions O-1…O-6)
- `docs/research/es-mx-ui-glossary.json` (218 entries)
- `e2e/fixtures/eval-es/NAMES.md` (read only to settle O-3, which S1.4 §3.5 left
  pending on this file; it exists at this commit)

Nothing else was opened: no live data, no export, no Halaxy PDF, no server, no
database, no port (HS-1, HS-2, HS-10). `shared/src/i18n/t.ts` was read once, to
name the place where a date or number is rendered; it is cited, not touched.

## How the check was made

1. **Mechanically**, because the fixed decisions are decidable: every key's
   placeholder set and `kind` compared between the catalogues, every Spanish
   string scanned for a missing `¿`/`¡`, a full stop after `?`/`!`, a
   non-sentence-initial capital, and a voseo form.
2. **Against the glossary**, term by term, for every term S1.4 §3.3 and §3.4
   fixes (*nota*, *borrador*, *copia de seguridad*, *Ajustes*, *Configuración
   inicial*, *lluvia de ideas*, *resumen previo*, *plan de tratamiento*,
   *cédula profesional* vs *licencia*, *declaración*, *participación del
   cliente*, *meta* vs *objetivo*, *sesión*, *transcripción*, *dictar*,
   *refinar*, *publicar*, *formato*, *sección*, and the ten keep-as-is tokens).
3. **By reading all 802 pairs** side by side for calques, English word order and
   agreement, with the conventions' §1 (tú), §2.4 (sentence case), §2.5
   (`¿`/`¡`, no period after them, angular quotes, no English em-dash
   parenthetical) and §3.5 (placeholder names) as the test.

## Summary

- 17 findings that S2.8 should fix (group A).
- 16 findings that are judgement calls, listed with a proposal so the lead can
  accept or drop them (group B).
- 5 wording clusters marked, not changed: they are clinical terms or owner calls
  (group C), per the card's last fixed decision.
- Placeholders, `kind`, key parity, sentence case and `¿`/`¡` are clean
  everywhere; the two exceptions found are in group A.

---

# Group A — defects

## 1. `plan.diagnosesNone` — an English word is in the Spanish string

- **Key:** `plan.diagnosesNone`
- **Current:** `Ninguno registrado. Se espera que las metas se rastreen hasta un
  diagnóstico, y entered por ti.`
- **Problem:** the second clause was never translated. `entered` is the English
  word, and `y … por ti` is also the English clause `and it is yours to enter`
  turned inside out. This is the only place in the catalogue where an untranslated
  English word reaches the screen.
- **Proposed:** `Ninguno registrado. Se espera que las metas se rastreen hasta un
  diagnóstico, y ese diagnóstico lo ingreas tú.`
- **Note:** the English is a slightly loose sentence, so a shorter Spanish is
  acceptable: `Ninguno registrado. Se espera que las metas se rastreen hasta un
  diagnóstico; te toca ingresarlo.` Either keeps `tú` (O-1).

## 2. `format.restoreLink` — voseo, and `instead` as `en su lugar`

- **Key:** `format.restoreLink`
- **Current:** `Restáurala en su lugar`
- **Problem:** two defects in eleven characters. `Restáurala` is the **voseo**
  imperative (`restaurá` + enclitic); the imperative of *restaurar* in the `tú`
  register fixed by O-1 is `Restaura` with no accent. It is the only voseo form
  in the catalogue — a mechanical scan for `Restáura|Hablás|Tenés|Podés|Querés|
  Sabés|Mirá|Entrá|Continuá|Presioná|Usá|Copiá|Pegá|Elegí|Seguí|Escríbí|Guardá|
  Cerrá|Abrí` returns this line and nothing else. Second, the English is
  `Restore it instead` and `en su lugar` is a calque of *in its place*, not of
  *instead* (see finding 10).
- **Proposed:** `Restaurar en su lugar`
- **Alternative** if "in its place" is the intent: `Restaurar en el lugar de
  siempre`. Not recommended; it changes the meaning.

## 3. `backup.sameDisk` — agreement error

- **Key:** `backup.sameDisk`
- **Current:** `Estas copias de seguridad están en el mismo disco que tus notas;
  una memoria USB es más seguro.`
- **Problem:** `más seguro` is masculine while the subject is `una memoria USB`.
  The predicative adjective agrees with the subject: `más segura`.
- **Proposed:** `Estas copias de seguridad están en el mismo disco que tus notas;
  una memoria USB es más segura.`

## 4. `format.referencedFiles` — the relative pronoun is wrong

- **Key:** `format.referencedFiles`
- **Current:** `Esta skill se refiere a {files}, que Apunta no puede leer. Si esos
  archivos traen definiciones de secciones o terminología, pega tú ese texto.`
- **Problem:** `{files}` is the direct object of both `se refiere a` and, in the
  second clause, of `leer`. A relative pronoun that stands for a plural direct
  object needs its article: `a los que`. `que` alone is only correct when it
  stands for a singular or an inanimate subject. The same clause also stacks
  `traen … , pega tú` where `tú` is redundant next to the imperative.
- **Proposed:** `Esta skill se refiere a {files}, a los que Apunta no puede leer.
  Si esos archivos traen definiciones de secciones o terminología, pega ese texto.`
- **Note:** the glossary's own entry for this string only maps the first clause
  (`Esta skill se refiere a`), so nothing above contradicts it.

## 5. `errors.bad_request.transcribe_too_long` — *sesión* is used for a *sitting*

- **Key:** `errors.bad_request.transcribe_too_long`
- **Current:** `Esa grabación es demasiado larga para subirla. Graba en sesiones
  más cortas.`
- **Problem:** the English is `Record it in shorter sittings` — sittings of
  dictation. S1.4 §3.3 fixes *sesión* for the clinical session (NOM-004, UNAM
  ECLIME, CONASAMA), and the catalogue is otherwise careful about that: the
  import summaries use *sesiones* for Claude chats and the Halaxy warnings for
  dated sessions, both correctly. Here it means a chunk of audio, which the
  glossary has already named (`record` → *grabar*, `recording` → *grabación*),
  so the word collides with its own most important sense.
- **Proposed:** `Esa grabación es demasiado larga para subirla. Graba en trozos
  más cortos.`
- **Alternative:** `Esa grabación es demasiado larga para subirla. Graba en
  grabaciones más cortas.`

## 6. `errors.bad_request.format_detect_skill_file` — *habilidad* vs *skill*

- **Key:** `errors.bad_request.format_detect_skill_file`
- **Current:** `Elige un archivo SKILL.md o un .zip de la carpeta de la habilidad.`
- **Problem:** the same object is `la carpeta de la skill` in
  `format.skillFileTail` and in the glossary (`skill file` → *archivo de skill*,
  *carpeta de la skill*), and `format.importFromSkill` is `Importar desde un
  archivo de skill`. One line translates *skill folder* as *habilidad* and the
  rest leaves it, so a Spanish speaker sees two names for one folder.
- **Proposed:** `Elige un archivo SKILL.md o un .zip de la carpeta de la skill.`

## 7. `ai.context_overflow` — `se tiró el borrador` is the wrong voice

- **Key:** `ai.context_overflow`
- **Current:** `A la IA se le acabó el espacio y tuvo que descartar parte de las
  instrucciones de Apunta, así que se tiró el borrador. Acorta el resumen e
  inténtalo de nuevo.`
- **Problem:** *tirar* here reads as `tirar la basura` (to throw away), which
  needs an active subject; the pronominal `se tiró el borrador` says the draft
  threw itself, and *tirar* is also the word for discarding something casually
  (`tira ese archivo`). The clause is the one place in the AI errors where the
  user's own action is described with a reflexive it cannot be the agent of.
- **Proposed:** `A la IA se le acabó el espacio y tuvo que descartar parte de las
  instrucciones de Apunta, así que el borrador se descartó. Acorta el resumen e
  inténtalo de nuevo.`
- **Alternative:** `…, así que no se pudo terminar el borrador. Acorta el resumen
  e inténtalo de nuevo.`

## 8. `ai.transcription_timeout` — `will go through` as `va a pasar`

- **Key:** `ai.transcription_timeout`
- **Current:** `La transcripción tardó demasiado y se detuvo. Una grabación más
  corta sí va a pasar; una muy larga puede necesitar una computadora más rápida.`
- **Problem:** `va a pasar` is the calque of *will go through* and in Spanish
  reads as "will happen", not "will be accepted". Nothing in the sentence tells
  the reader that it is the recording that will be processed.
- **Proposed:** `La transcripción tardó demasiado y se detuvo. Una grabación más
  corta sí va a funcionar; una muy larga puede necesitar una computadora más
  rápida.`
- **Alternative:** `…Una grabación más corta sí va a poder procesarse; …`

## 9. `brainstorm.confirmBody` — `This forgets…` as `Esto olvida…`

- **Key:** `brainstorm.confirmBody` (with `brainstorm.confirmConfirm`)
- **Current:** `Esto olvida la conversación de arriba. Las notas de {name} quedan
  tal cual.` — button: `Olvidarla`
- **Problem:** `olvidar` is a verb of a subject that can forget, and the app is
  not one; `Esto olvida la conversación` is not idiomatic. The action is a
  discard, and *descartar* is the catalogue's own word for it (`common.dismiss`,
  `capture.discardRecording`, `plan.discardSuggestion`). The button `Olvidarla` is
  defensible on its own — Spanish does use `Olvidar` for *forget* in UI — but
  paired with the body it reads as a machine that forgets things.
- **Proposed:** `Esto descarta la conversación de arriba. Las notas de {name}
  quedan tal cual.` — button: `Descartarla`
- **Note:** the glossary lists `Forget it` under *lluvia de ideas* without a
  rendering, so there is nothing to contradict here.

## 10. `instead` rendered as `en su lugar` (three keys)

- **Keys:** `capture.sourceTail`, `import.switchToClaude`, `import.switchToHalaxy`
- **Current:**
  - `— o escribe notas en su lugar. Puedes usar una cosa, la otra, o combinarlas
    antes de crear el borrador.`
  - `Importar desde Claude en su lugar`
  - `Importar desde Halaxy en su lugar`
- **Problem:** the English in all three is *instead*, and `en su lugar` is
  `in its place` / `in its stead` — a calque that in Spanish suggests something
  being swapped for something else at that spot. In the two import keys it also
  misleads: the sentence reads as "import from Claude in its place", not "import
  from Claude rather than Halaxy". (`format.restoreLink` is the fourth case; see
  finding 2.)
- **Proposed:**
  - `— o escribe notas sin grabar. Puedes usar una cosa, la otra, o combinarlas
    antes de crear el borrador.`
  - `Importar desde Claude en cambio`
  - `Importar desde Halaxy en cambio`
- **Alternative** for the pair, if the button needs to read as a swap:
  `Importar desde Claude en su lugar` is only right if the label is about
  replacing a source; the code puts it next to the other import entry, so
  `en cambio` is the safe reading.

## 11. `capture.typeNotesHelp` — `use typing alone` as `o solo escribir`

- **Key:** `capture.typeNotesHelp`
- **Current:** `Escribe notas antes o durante la grabación, o solo escribir`
- **Problem:** the clause `o solo escribir` has no verb and no subject; it is the
  English noun phrase `or use typing alone` word for word. In Spanish it needs
  either a verb or a noun phrase the reader can attach to the list before it.
- **Proposed:** `Escribe notas antes o durante la grabación, o solo escríbelas sin
  grabar`
- **Alternative:** `Escribe notas antes o durante la grabación, o escríbelas sin
  usar el micrófono`

## 12. `patients.namePlaceholder` — the sample name is not from NAMES.md

- **Key:** `patients.namePlaceholder`
- **Current:** `p. ej. John Smith`
- **Problem:** S1.4 §3.5 (O-3) said to leave the English sample or leave it blank
  **until** `e2e/fixtures/eval-es/NAMES.md` existed, and to invent no Spanish
  name before then. That file exists at this commit, with 110 invented people, and
  the catalogue's own header comment still says the placeholder is English
  "porque `e2e/fixtures/eval-es/NAMES.md` todavía no existe". The condition has
  been met, so the placeholder is now a Spanish string carrying a non-Spanish
  name (HS-8).
- **Proposed:** `p. ej. Anaías Godoy Ruiz`
- **Note:** any row of the NAMES.md registry works; `scripts/v2/check-es-fixtures.mjs`
  asserts the registry against the corpora in both directions, so a name taken
  from the table cannot break it. The choice of *which* invented person is a
  cosmetic one for the S2.8 lead.

## 13. Two placeholders use `...` where the catalogue uses `…`

- **Keys:** `refine.inputPlaceholder`, `capture.summaryPlaceholder`
- **Current:** `Haz una pregunta o da comentarios...` and `Escribe el resumen de
  tu sesión...`
- **Problem:** these are the only two Spanish strings with three ASCII full
  stops; the catalogue's other 45 ellipses are the single character `…`. S1.4
  names neither, but the catalogue is otherwise uniform, and the English source
  has the same split, which is why it survived.
- **Proposed:** `Haz una pregunta o da comentarios…` and `Escribe el resumen de
  tu sesión…`

## 14. Straight quotes where the rest of the catalogue uses `«…»`

- **Keys:** `chat.guardNotice.section`, `chat.factNotice.section`,
  `chat.priorNoteNotice.section`, `chat.scopeHold.additionOnly`,
  `chat.request.addition`, `chat.change.addition`,
  `errors.bad_request.import_bad_source`, `errors.bad_request.settings_bad_language`
- **Current:** e.g. `{section} se dejó como estaba: la revisión habría agregado
  "{phrase}", que no está en la nota ni en tu dictado.`
- **Problem:** S1.4 §2.5 prefers angular quotes, and the catalogue follows that
  everywhere else: `«{query}»`, `«{filter}»`, `«{section}»`, `«{withdrawn}»`,
  `«Copia de seguridad»`, `«Publicada (haz clic para editar)»`. Eight strings
  quote with `"`, so the same kind of object is marked two ways on screen. In
  `chat.change.addition` the quoted `{label}` is a section label the user
  recognises from `«…»` elsewhere, which makes the mismatch visible.
- **Proposed:** `«{phrase}»` / `«{label}»` in the six `chat.*` keys.
- **Judgement for S2.8:** the last two keys quote **literal values the user types**
  (`"assistant"`, `"human"`, `"en"`, `"es-MX"`), where the straight quote mirrors
  the code. S2.8 can either change them for uniformity or leave them and say so;
  the reviewer did not change them, because the argument is weaker there.

## 15. `patients.addClose` — the dialog's name is not quoted

- **Key:** `patients.addClose`
- **Current:** `Cerrar agregar paciente`
- **Problem:** this is the accessible name of a close control on a dialog whose
  title is `Agregar paciente`. The catalogue has the right pattern for exactly
  this: `refine.closeLabel` is `Cerrar «Refinar nota»`, quoting the title it
  closes. Here the title is run straight into the verb, so the name reads as one
  sentence ("close add patient").
- **Proposed:** `Cerrar «Agregar paciente»`
- **Note:** `settings.closeLabel` (`Cerrar Ajustes`) has the same shape, but there
  the thing being closed is a page, not a titled dialog, and `Ajustes` is the
  product's own word; it reads acceptably. Left as the lead sees fit.

## 16. `errors.conflict.plan_superseded_activate` — `versión de plan`

- **Key:** `errors.conflict.plan_superseded_activate`
- **Current:** `Una versión de plan que quedó obsoleta no se puede volver a
  activar.`
- **Problem:** `versión de plan` is a calque of `plan version`. The same object is
  `versión del plan` in `plan.superseded`, `errors.conflict.plan_superseded_readonly`,
  `errors.not_found.plan_version` and `plan.versionMeta`, so one message is the odd
  one out.
- **Proposed:** `Una versión del plan que quedó obsoleta no se puede volver a
  activar.`

## 17. `plan.objectiveTargetLabel`, `plan.objectiveTargetDateLabel` — `Objetivo del objetivo {n}`

- **Keys:** `plan.objectiveTargetLabel`, `plan.objectiveTargetDateLabel`
- **Current:** `Objetivo del objetivo {n}` and `Fecha objetivo del objetivo {n}`
- **Problem:** the catalogue's header records a deliberate choice — *meta* is the
  plan's goal, so the goal's `target` field is rendered *objetivo* to keep the two
  apart. Applied to the objective's own target field, the choice produces
  `Objetivo del objetivo 1`, where the same word means two different things in one
  label, next to `Objetivo 1` (`plan.objectiveLabel`) and `Objetivo:` inside
  `plan.objectiveMeta`. That is English word order (`Objective 1 target`) carried
  over, and the result is not readable.
- **Proposed:** `Meta del objetivo {n}` and `Fecha meta del objetivo {n}`
- **Marked, not decided:** this reintroduces *meta* inside the objective block,
  which is the rule the header comment states. The alternative that keeps the rule
  and kills the repetition is to reorder: `Objetivo {n}: meta` and
  `Fecha meta — objetivo {n}`. Whichever is chosen, the *meta*/*objetivo* split
  itself is a terminology decision that touches clinical wording, so it is
  flagged here for the owner alongside S5 rather than settled by this review.

---

# Group B — judgement calls, with a proposal

These are not errors in the Spanish. Each is a place where a Spanish speaker could
reasonably prefer something else; each has a concrete proposal so S2.8 can accept
or drop it without re-opening the argument.

## 18. `chat.firstPass` — the English em dash used as a parenthetical

- **Key:** `chat.firstPass`
- **Current:** `Este es un primer borrador basado en tu dictado. Dime qué cambiar
  —acortar una sección, agregar algo que se me pasó, ajustar el tono— y lo
  actualizo. …`
- **Problem:** S1.4 §2.5 says Spanish should use the long dash or parentheses
  for asides and avoid the English em-dash habit, and this file's own header says
  it does "sin raya larga como paréntesis (§2.5)" — which is true everywhere
  except here, where the dash does the English job with no spaces.
- **Proposed:** `Dime qué cambiar (acortar una sección, agregar algo que se me
  pasó, ajustar el tono) y lo actualizo.`
- **Note:** the other dashes in the catalogue (`backup.failure`,
  `plan.versionOption`, `plan.reviewOverdue`, `import.batchLine`) separate two
  items rather than parenthesise, which is fine and is not part of this finding.

## 19. `ai.unsupported_model_tag` — `esas` for a singular antecedent

- **Key:** `ai.unsupported_model_tag`
- **Current:** `Esa etiqueta de modelo es una compilación MLX/safetensors. Apunta
  no puede hacer que esas sigan el formato de nota de forma confiable: elige una
  etiqueta GGUF.`
- **Problem:** the English `those` is plural (`those model tags`); the Spanish
  subject is `Esa etiqueta`, singular, so the second `esas` has no plural
  antecedent and the verb `sigan` is plural too.
- **Proposed:** `Esa etiqueta de modelo es una compilación MLX/safetensors. Apunta
  no puede hacer que siga el formato de nota de forma confiable: elige una
  etiqueta GGUF.`

## 20. `ai.insufficient_memory` — `le faltó memoria`

- **Key:** `ai.insufficient_memory`
- **Current:** `A esta computadora le faltó memoria al cargar el modelo de IA. …`
- **Problem:** the dative construction is understood but stilted for a machine;
  the sentence says the computer *lacked* memory rather than that it ran out.
- **Proposed:** `A esta computadora se le acabó la memoria al cargar el modelo de
  IA. Elige un modelo más pequeño en Ajustes e inténtalo de nuevo.`
- **Note:** this reuses the idiom already in `ai.context_overflow` and
  `ai.output_truncated` (`A la IA se le acabó el espacio`), which is a reason to
  prefer it.

## 21. `note.deleteBodyFirst` — `all go` as `se van`

- **Key:** `note.deleteBodyFirst`
- **Current:** `La nota, su transcripción y la conversación de refinado se van.
  Aquí no se puede deshacer.`
- **Problem:** `se van` is the calque of *all go*; in Spanish it means the objects
  leave, not that they are deleted, and it is much chattier than the rest of the
  dialog. `se eliminan` is the word the same screen already uses elsewhere
  (`workspace.deleteBodyThirdTail`).
- **Proposed:** `La nota, su transcripción y la conversación de refinado se
  eliminan. Aquí no se puede deshacer.`

## 22. `format.instructionsHelp` — `flattened` as `aplanadas`

- **Key:** `format.instructionsHelp`
- **Current:** `… Pega aquí instrucciones de skill aplanadas; … La receta para
  aplanar una skill de Claude está en`
- **Problem:** `aplanar` is a literal calque of *flatten*; Spanish software
  writing uses *texto plano* for the same idea, and the file `docs/skill-porting.md`
  it points at is a recipe for turning a skill into one block of text.
- **Proposed:** `… Pega aquí instrucciones de skill en texto plano; … La receta
  para aplanar una skill de Claude está en` → `… La receta para convertir una
  skill de Claude en texto plano está en`
- **Note:** the glossary maps `skill file` → *archivo de skill* and keeps *skill*
  untranslated, so `skill` should stay in both halves of the proposal.

## 23. `format.examplesSubtitle` — the `from` is lost

- **Key:** `format.examplesSubtitle`
- **Current:** `De 2 a 3 notas terminadas para aprender el patrón`
- **Problem:** the English is `2-3 completed notes to learn the pattern from`; the
  Spanish ends the sentence without saying *from what*, and the button's
  companion (`format.dropMore`) does carry it (`de lo que las notas tengan en
  común`).
- **Proposed:** `De 2 a 3 notas terminadas para aprender el patrón que comparten`

## 24. `format.foundLede` — `your work's format`

- **Key:** `format.foundLede`
- **Current:** `Comprueba que coincide con el formato de tu trabajo antes de
  guardar.`
- **Problem:** `el formato de tu trabajo` is the English possessive calque; in
  Spanish it suggests a job rather than the format the clinician uses.
- **Proposed:** `Comprueba que coincide con el formato que usas en tu trabajo antes
  de guardar.`

## 25. `plan.everyDays` — `Cada {days} días` at 1

- **Key:** `plan.everyDays`
- **Current:** `Cada {days} días` (`{days}` is a pre-rendered `text` value)
- **Problem:** the interval field accepts 1, and at 1 the string is ungrammatical
  in Spanish. English has the same shape, so this is not a translation error —
  it is a string that cannot express the singular.
- **Proposed:** if the field can hold 1, give it a plural map keyed on the
  rendered text is not possible (`kind: 'text'`), so the fix belongs at the call
  site; the reviewer only records that the string needs to know. Alternatively
  constrain the field to 2 or more.
- **Marked for:** S2.8 to check the call site, not to change this key blind.

## 26. `backup.daysAgo` — no plural map

- **Key:** `backup.daysAgo`
- **Current:** `hace {count} días` with `kind: { count: 'number' }` and no
  `plural`
- **Problem:** the sibling keys `backup.minutesAgo` and `backup.hoursAgo` both
  carry `one`/`many`/`other`; this one would print `hace 1 días`. English has the
  same gap, so it is a Spanish-visible instance of an English-shaped key.
- **Proposed:** add `plural: { one: 'hace {count} día', many: 'hace {count} días',
  other: 'hace {count} días' }`.
- **Note:** adding a plural map is a catalogue change, so it is S2.8's to make; it
  needs the same decision `notes.count` already documents (the `many` category
  exists on es-MX and cannot be omitted).

## 27. `notes.emptySections` — `agrégalas` assumes a plural

- **Key:** `notes.emptySections`
- **Current:** `No hay nada registrado en {sections}: agrégalas o déjalas en blanco.`
- **Problem:** `{sections}` is a single section name as often as several
  (`NoteBody.tsx:133` passes the format's section names), and with one section
  `agrégalas`/`déjalas` are wrong. The English (`add or leave blank`) is
  number-agnostic.
- **Proposed:** `No hay nada registrado en {sections}: agrégalas o déjalas en
  blanco.` is not a fix; the honest fix is to drop the agreement —
  `No hay nada registrado en {sections}: agrega lo que quieras o déjalo en
  blanco.` — or to pass the count and pluralise.

## 28. `import.notFound` — `No encontrados`

- **Key:** `import.notFound`
- **Current:** `No encontrados desde {cutoff}: {names}.`
- **Problem:** a bare masculine plural participle with no noun, standing in for
  `Not found since {cutoff}`. It works as a label but reads as a fragment in a
  sentence, and the neighbouring string in the same screen
  (`import.noConversations`) names its subject: `No se encontraron
  conversaciones de pacientes desde {cutoff}.`
- **Proposed:** `No se encontraron desde {cutoff}: {names}.`
- **Alternative** (keeps the label feel): `Ninguno encontrado desde {cutoff}:
  {names}.` — but the names listed may be several, so the first is safer.

## 29. `capture.missingPatient` — subjunctives stacked

- **Key:** `capture.missingPatient`
- **Current:** `Puede que este paciente se haya eliminado, así que nada de lo que
  se grabara aquí se podría guardar.`
- **Problem:** two imperfect subjunctives in a row (`se grabara`, `se podría
  guardar`) around a relative clause whose subject is inanimate, which is heavy
  for a one-line warning. `se haya eliminado` is correct and should stay.
- **Proposed:** `Puede que este paciente se haya eliminado, así que no se podría
  guardar nada de lo que se grabó aquí.`

## 30. `plan.carriedForward` — `Se arrastró`

- **Key:** `plan.carriedForward`
- **Current:** `Se arrastró desde la versión anterior.`
- **Problem:** *arrastrar* is the glossary's first option here
  (`carried forward` → *arrastrado / retomado*), but as a passive it leaves the
  agent implicit, and `arrastrar` is also the drag gesture the patients table
  teaches (`patients.dragToResize`, `patients.groupEmpty`). *Retomado* says what
  happened to the goal.
- **Proposed:** `Se retomó desde la versión anterior.`

## 31. `format.addLede` — `nosotros` under a `tú` imperative

- **Key:** `format.addLede`
- **Current:** `Elige cómo definirlo: nosotros descubrimos la estructura por ti.`
- **Problem:** the first clause is `tú` imperative, the second has `nosotros` as
  its subject and ends on a second `tú`. Spanish does allow the mix
  (`Elija… nosotros lo hacemos`), so this is not wrong; the S1.4 glossary entry
  for the sentence is the same wording. Recorded so the lead knows it was seen.
- **Proposed (optional):** `Elige cómo definirlo: la estructura la descubrimos
  por ti.`

## 32. Dates and thousands separators — a finding, but not a catalogue string

- **Keys:** none. **Place:** `shared/src/i18n/t.ts:74` (`DATE_OPTIONS`,
  `month: 'short'`) and `t.ts:242` (`Intl.NumberFormat(locale)`)
- **Current rendering for es-MX:** `8 ago 2026` and `1,234,567.891`
- **Problem:** `es-MX.ts`'s own header hands this to S2.7/S2.8 ("the difference
  from the prose recommendation is recorded for S2.7/S2.8"). Two deviations:
  1. S1.4 §2.1's prose date is `8 de agosto de 2026`, with both `de`s;
     `Intl` with `month: 'short'` drops them and gives `8 ago 2026`. With
     `month: 'long'` the same call returns `8 de agosto de 2026`.
  2. S1.4 §2.3 follows NOM-008-SE-2021, which forbids commas to group thousands,
     and recommends `1 234`. `Intl.NumberFormat('es-MX')` groups with commas, and
     there is no option that produces a space, so honouring the standard means
     formatting the number outside `Intl`.
- **Marked for:** the owner (is a comma-grouped `1,234` acceptable in the note
  count, given NOM-008 says no?) and S2.8 or a `t.ts` change. Not a copy fix: no
  catalogue string contains a date or a formatted number.
- **Note:** the day–month–year *order* itself is correct, and the decimal point
  with a leading zero is correct (`0.5`), so the two conventions S1.4 §2.1 and
  §2.3 care most about are already met.

## 33. `settings.fontSerif` — `Serif` left in English

- **Key:** `settings.fontSerif`
- **Current:** `Serif` (alongside `settings.fontInter`: `Inter (predeterminada)`
  and `settings.fontSystem`: `Sistema`)
- **Problem:** S1.4 §3.4 keeps product names and identifiers untranslated, and
  `Inter` is a typeface name, so it stays. `Serif` is not a typeface name but a
  family word, and the catalogue translates its siblings. It is the only
  typeface-family word in the dropdown left in English.
- **Proposed:** `Con serifa`
- **Note:** if the lead reads `Serif` as the name of a bundled face, leave it;
  §3.4 would then cover it. Recorded either way.

---

# Group C — marked, not changed

The card's last fixed decision: clinical terms that belong to S5 and the owner's
review are **marked here, not changed**. None of these is proposed for S2.8.

## 34. The attestation family — S1.4 O-4, and AM-059

- **Keys:** `plan.attestation` (`Declaración`), `plan.notAttested` (`Aún sin
  declarar. …`), `plan.attestedNote` (`Declarado en Apunta: …`),
  `plan.attestationStatement` (`Yo redacté y revisé este plan de tratamiento.
  Declarado en Apunta: firma la copia en tu sistema de registros.`)
- **Marked because:** O-4 leaves *declaración* recommended but not chosen, and
  `plan.attestationStatement` is the owner's wording approved byte for byte in
  AM-059 (the file says so in the key's own comment). *Declarado* is a literal
  rendering of *attested* and reads oddly next to *firma* in the same sentence,
  but changing it would overwrite an owner approval.
- **For:** the owner, with S5. **Not** for S2.8.

## 35. NOM-004 clinical vocabulary in the plan

- **Keys:** `plan.diagnoses` (`Diagnósticos`), `plan.presentingProblem` (`Motivo de
  consulta`), `plan.modality` / `plan.frequency` (`Modalidad del servicio` /
  `Frecuencia del servicio`), `plan.dischargeCriteria` (`Criterios de alta`),
  `plan.clientParticipation` and its five children (`Participación del cliente`,
  `Copia firmada en mi sistema de registros`, …), `plan.met` (`Cumplida`),
  `plan.discontinue` (`Suspender`), `plan.reviewInterval` (`Intervalo de
  revisión`, O-5)
- **Marked because:** these are S1.1/S1.2 clinical decisions rendered into the UI,
  and S1.4 §3.2 says this catalogue reuses them rather than re-deciding them.
  The review checked that they are used **consistently** (they are: *cédula
  profesional* for the practitioner's credential in `plan.notAttested` and
  `plan.licence`, and *licencia* for the software in `licenses.*` and
  `doc.licences`, exactly as §3.3 requires) and found nothing to change.
- **For:** S5's review, as confirmation. **Not** for S2.8.

## 36. The first-person feminine forms

- **Keys:** `plan.addGoalMyself` (`Agregar una meta yo misma`),
  `format.manualTitle` (`Describirlo yo misma`)
- **Marked because:** the glossary fixes `describe it myself` → *describirlo yo
  misma*, so the catalogue is following S1.4 and the catalogue's voice is written
  for one reader. Still, *yo misma* bakes a gender into a first-person control,
  and a translator may reasonably prefer `Agregar una meta yo` / `Describirlo yo`.
- **For:** the owner, with the voice question. **Not** for S2.8.

## 37. `patients.namePlaceholder` — the *form* of the Spanish example, beyond finding 12

- **Key:** `patients.namePlaceholder`
- **Marked because:** finding 12 settles the *name*; the abbreviation is a second
  question. The catalogue uses `p. ej.` (`format.namePlaceholder`,
  `format.sectionsPlaceholder`, `patients.groupNamePlaceholder`) where Mexican
  usage allows both `p. ej.` and `por ejemplo`, and RAE treats the dotted form as
  correct. Consistent within the catalogue, so no change proposed; recorded so the
  lead knows the alternative was considered.

## 38. `settings.language` — deliberately bilingual

- **Key:** `settings.language` (`Language / Idioma`, byte-identical in both
  catalogues)
- **Marked because:** the key's own comment says this is on purpose: it is the one
  control a Spanish speaker has to find *before* switching, so translating it
  would hide it. It is the only string where the Spanish catalogue is knowingly
  not fully Spanish, and it is an owner decision, not a translator's.

---

# Checked and found clean

Recorded so the S2.8 lead knows what was looked at and does not re-open it.

- **Key parity:** 802 keys in each catalogue, no key missing on either side
  (`satisfies Record<MessageKey, Message>` plus the runtime test both hold).
- **Placeholders:** identical sets per key, checked over `text` and every plural
  form — 0 mismatches across 802 keys. `t.test.ts`'s own per-form check passes
  (25 tests, exit 0), so AM-051's plural-map requirement is intact.
- **`kind`:** identical parameter/kind pairs per key, 0 mismatches. No Spanish
  entry can print an unformatted ISO date where English prints a local one.
- **Sentence case:** no mid-sentence capital that is not a product name, an
  acronym, a menu path or a section name. `Configuración inicial` and `Ajustes`
  are lowercase inside sentences everywhere they appear after the first word.
- **`¿` / `¡`:** every question and exclamation opens with its sign; no full stop
  follows a closing `?` or `!`. 0 failures.
- **Ellipsis:** `…` used uniformly except the two keys in finding 13.
- **Register:** `tú` throughout, no `usted`, and the only voseo form in the file
  is finding 2. `about.diskTailUnknown`'s `compruébalo tú mismo` and
  `brainstorm.empty`'s third-person `sus notas` (the English *their notes*, the
  patient's) are both correct.
- **Glossary spot-checks that came out right:** `backup.now`
  (`Hacer una copia ahora`, the glossary's own `back up now`),
  `format.standardTitle` (`Mi nota de evolución estándar`),
  `format.standardSubtitle`, `plan.versionMetaEffective` (`vigente desde el`, which
  adds the preposition the English leaves out), `format.sectionsPlaceholder`
  (NOM-004 section names, correctly capitalised as names), `plan.licence`
  (`Cédula`, not `licencia`), `licenses.*` (`licencia`), `errors.bad_request.
  backup_filename_invalid` and `errors.not_found.backup_file`
  (*copia de seguridad*), `dictation.*` (*dictar*), `import.untickHelp`
  (*desmarcar*), `import.why` (*motivo*), `about.diskTailOff` (*Ajustes del
  sistema*), `import.exportHelp` (*Ajustes → Privacidad → Exportar datos*).
- **Keep-as-is tokens:** `Apunta`, `Claude`, `Halaxy`, `Mac`, `NPI`, `PDF`,
  `SKILL.md`, `conversations.json`, `RESTORE.txt`, `/Volumes/Backup/Apunta`,
  `FileVault`, `Time Machine`, `Word`, `Ollama`, `whisper`, `Inter` are written
  the same way in both catalogues and never split into their own key. `Apunta` is
  correct inside a sentence (`Apunta no pudo leer ese PDF`), which S1.4 §3.4
  requires and the allowlist (whole strings only) cannot express.
- **Plural categories:** every Spanish plural map carries `one`, `many` and
  `other`, the three `Intl.PluralRules('es-MX')` categories on this box, and
  `brainstorm.contextMostRecentOne`/`contextMostRecent` carry a plural map where
  English has none, which is correct for Spanish agreement (AM-051).

## Commands

Working directory for all of them: the repository root
(`/home/villenull/Projects/Apunta`, written `<repo>` below).

### C1 — the card's verification row

- **command:** `test -s docs/v2/evidence/S2.7/copy-review.md`
- **cwd:** `<repo>`
- **start:** 2026-09-29T21:18:59Z
- **end:** 2026-09-29T21:18:59Z
- **exit code:** 0
- **excerpt:** (no output; `test -s` is silent on success)

### C2 — mechanical parity, punctuation and ellipsis scan

- **command:** `npx tsx -e "<import en/esMX, compare placeholders, kind, ¿/¡, full stop after ?/!, ASCII dots>"`
- **cwd:** `<repo>`
- **start:** 2026-09-29T21:16:14Z
- **end:** 2026-09-29T21:16:15Z
- **exit code:** 0
- **excerpt:**

```
ASCII-DOTS refine.inputPlaceholder
ASCII-DOTS capture.summaryPlaceholder
{"keys":802,"phBad":0,"kindBad":0,"qBad":0,"dots":2,"voseo":0}
```

### C3 — the voseo scan behind finding 2

- **command:** `rg -n --pcre2 "\b(Restáura\w*|Hablás|Tenés|Podés|Querés|Sabés|Mirá|Entrá|Continuá|Presioná|Usá|Copiá|Pegá|Elegí|Seguí|Escríbí|Guardá|Cerrá|Abrí)\b" shared/src/i18n/es-MX.ts`
- **cwd:** `<repo>`
- **start:** 2026-09-29T21:16:21Z
- **end:** 2026-09-29T21:16:21Z
- **exit code:** 0 (one match printed)
- **excerpt:**

```
1994:    text: 'Restáurala en su lugar',
```

### C4 — the catalogue's own test, as a second opinion on placeholders

- **command:** `npx vitest run shared/src/i18n/t.test.ts`
- **cwd:** `<repo>`
- **start:** 2026-09-29T21:15:42Z
- **end:** 2026-09-29T21:15:43Z
- **exit code:** 0
- **excerpt:**

```
 Test Files  1 passed (1)
      Tests  25 passed (25)
   Duration  190ms
```

No server, no database, no browser, no port, and no build were involved in any
step of this review (HS-2 is satisfied trivially: the card is L0 and read-only).
The reads of the four §Read paths and of `e2e/fixtures/eval-es/NAMES.md` were
individual `rg`/`cat`/`Read` calls between 21:03Z and 21:15Z; the four commands
above are the reproducible part and each is timestamped individually.

### C5 — the L0 gate, run because the card is L0 (run configuration §2)

- **commands:** `npx prettier --check docs/v2/evidence/S2.7/copy-review.md` and
  `node scripts/check-no-external-urls.mjs`
- **cwd:** `<repo>`
- **start:** 2026-09-29T21:18:59Z
- **end:** 2026-09-29T21:18:59Z
- **exit code:** 0 and 0
- **excerpt:**

```
Checking formatting...
All matched files use Prettier code style!
```

These are the card's gate, not a card criterion: the dispatch's Verification table
for S2.7 names only V1, which is why the return file carries one row.

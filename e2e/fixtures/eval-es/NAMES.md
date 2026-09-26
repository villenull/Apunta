# The fictional people in the Spanish eval corpora

**Every person named in `e2e/fixtures/eval-es/` or
`e2e/fixtures/eval-owner-es/` appears in this file, and nobody else does.**
`scripts/v2/check-es-fixtures.mjs` asserts both directions on every run, and
`node scripts/v2/check-es-fixtures.mjs` is part of this corpus's definition of
done.

## All of it is invented

Every row below is a made-up person. No name here came from a real
patient, a real client, a real colleague or a real record, and no sentence
in either corpus came from anywhere but invention. This corpus lives in a
public repository, and per `CLAUDE.md` hard rule 2 real patient text never
enters fixtures, tests or commits. Extend the corpora with more invention —
never with anything redacted, because redaction is not de-identification.

The names are also deliberately not the prototype's English stand-ins
(`John Smith`, `Maria Ruiz`, …): a Spanish corpus that quietly reuses the
same handful of names is easier to leak, and the English corpora already
carry those. 110 distinct invented people, one per transcript, is the
hygienic minimum.

The transcripts carry no "esto es ficticio" banner, on purpose: the eval
feeds each file to the model verbatim, and a banner would change what is
being measured. This file is where the signal lives.

## Why one person per transcript

Each transcript names exactly one patient, and each patient appears in
exactly one transcript. That is not tidiness for its own sake: it means no
fixture can be contaminated by facts the model learned from a sibling
fixture, and the registry below can be checked mechanically in both
directions without anyone tracking cross-references by hand.

**Relatives, colleagues and providers are never named.** They are referred
to by relationship only — "su hermana", "la mamá de su pareja", "el médico
de cabecera" — because the experiencer trap (`experiencer/`) needs a family
member who is clearly not the patient, and a relationship word does that
without putting a second name in the corpus. If you ever do need a named
second person, add the row here first, then write the transcript.

## The registry

### `e2e/fixtures/eval-es/` — the Spanish SOAP/intake corpus

| Person | Trap type | Split | Transcript |
| --- | --- | --- | --- |
| Anaías Godoy Ruiz | `lost-negation` | tuning | `tuning/lost-negation/01-sin-dormir.txt` |
| Bárbara Arredondo Higareda | `lost-negation` | heldout | `heldout/lost-negation/02-sin-comer.txt` |
| César Ibarra Nolasco | `lost-negation` | tuning | `tuning/lost-negation/03-nunca-tableta.txt` |
| Doroteo Xicará Quezada | `lost-negation` | heldout | `heldout/lost-negation/04-no-se-lo-manda.txt` |
| Esperanza Sarmiento Uribe | `lost-negation` | tuning | `tuning/lost-negation/05-no-se-atreve.txt` |
| Fermín Zamudio Zúñiga | `invented-negation` | tuning | `tuning/invented-negation/01-todos-los-dias.txt` |
| Graciela Grijalva Cisneros | `invented-negation` | heldout | `heldout/invented-negation/02-bebe-los-viernes.txt` |
| Hipólito Alcántara Figueroa | `invented-negation` | tuning | `tuning/invented-negation/03-medicamento-diario.txt` |
| Imelda Escamilla Iriarte | `invented-negation` | heldout | `heldout/invented-negation/04-tiene-casa.txt` |
| Jacinta Cárdenas Monreal | `invented-negation` | tuning | `tuning/invented-negation/05-firma-el-recibo.txt` |
| Leandro Lomelí Pantoja | `dose-and-number` | tuning | `tuning/dose-and-number/01-cero-coma-cinco.txt` |
| Marisol Urzúa Salgado | `dose-and-number` | heldout | `heldout/dose-and-number/02-media-pastilla.txt` |
| Nicanor Buenrostro Valdivia | `dose-and-number` | tuning | `tuning/dose-and-number/03-suero-cinco-litros.txt` |
| Odalia Ituarte Zambrano | `dose-and-number` | heldout | `heldout/dose-and-number/04-ochenta-y-dos-kilos.txt` |
| Patricio Mendívil Guerrero | `dose-and-number` | tuning | `tuning/dose-and-number/05-seis-y-media-horas.txt` |
| Quirina Zabala Mascarenhas | `experiencer` | tuning | `tuning/experiencer/01-hermana-no-duerme.txt` |
| Rufino Trujillo Pineda | `experiencer` | heldout | `heldout/experiencer/02-papa-bebe.txt` |
| Serafina Ojeda Tapia | `experiencer` | tuning | `tuning/experiencer/03-mama-ansiosa.txt` |
| Teodoro Wenceslao Yépez | `experiencer` | heldout | `heldout/experiencer/04-hijo-miedo.txt` |
| Úrsula Dzul Bustamante | `experiencer` | tuning | `tuning/experiencer/05-abuela-caidas.txt` |
| Vicente Lomelí Enríquez | `past-vs-current-risk` | tuning | `tuning/past-vs-current-risk/01-intento-en-2019.txt` |
| Ximena Solórzano Huerta | `past-vs-current-risk` | heldout | `heldout/past-vs-current-risk/02-intento-hace-dos-anos.txt` |
| Yolanda Naranjo Lomelí | `past-vs-current-risk` | tuning | `tuning/past-vs-current-risk/03-autolesiones-nina.txt` |
| Zacarías Valadez Olvera | `past-vs-current-risk` | heldout | `heldout/past-vs-current-risk/04-idea-suicida-pasada.txt` |
| Adela Rangel Rendón | `past-vs-current-risk` | tuning | `tuning/past-vs-current-risk/05-sin-riesgo-anoche.txt` |
| Baltasar Yzaguirre Urbina | `uncertainty` | tuning | `tuning/uncertainty/01-no-se-acordo-marca.txt` |
| Casimira Fuentes Ybarra | `uncertainty` | heldout | `heldout/uncertainty/02-pendiente-confirmar.txt` |
| Dionisio Bermúdez Delgado | `uncertainty` | tuning | `tuning/uncertainty/03-no-sabe-anios.txt` |
| Eugenia Balderas Ledesma | `uncertainty` | heldout | `heldout/uncertainty/04-dosis-pasada.txt` |
| Fermín Luvian Ordóñez | `uncertainty` | tuning | `tuning/uncertainty/05-altas-sin-confirmar.txt` |
| Gumaro Zepeda Sepúlveda | `spoken-correction` | tuning | `tuning/spoken-correction/01-o-sea-dos-y-media.txt` |
| Herminia Tiscareño Velasco | `spoken-correction` | heldout | `heldout/spoken-correction/02-mejor-dicho-cuatrocientos.txt` |
| Isidoro Aboites Arreola | `spoken-correction` | tuning | `tuning/spoken-correction/03-mas-bien-ataque.txt` |
| Josefina Huitrón Duarte | `spoken-correction` | heldout | `heldout/spoken-correction/04-es-decir-antes-de-dormir.txt` |
| Leocadia Villalpando Guzmán | `spoken-correction` | tuning | `tuning/spoken-correction/05-digo-dos-veces.txt` |
| Melitón Carreón Jarquín | `section-never-covered` | tuning | `tuning/section-never-covered/01-llamada-sin-objetivo.txt` |
| Nicanora Sandoval Navarrete | `section-never-covered` | heldout | `heldout/section-never-covered/02-se-corto-sin-plan.txt` |
| Otilio Maldonado Quintanilla | `section-never-covered` | tuning | `tuning/section-never-covered/03-admision-sin-formulacion.txt` |
| Petrona Venegas Trujillo | `section-never-covered` | heldout | `heldout/section-never-covered/04-sesion-sin-analisis.txt` |
| Rufina Cervera Ximenes | `section-never-covered` | tuning | `tuning/section-never-covered/05-antecedentes-no-dados.txt` |
| Santos Jazmín Ruiz | `english-loanword` | tuning | `tuning/english-loanword/01-burnout-papeles.txt` |
| Teodora Ocampo Higareda | `english-loanword` | heldout | `heldout/english-loanword/02-check-in-corto.txt` |
| Valentín Peralta Nolasco | `english-loanword` | tuning | `tuning/english-loanword/03-si-y-hi.txt` |
| Zenobia Ugarte Quezada | `english-loanword` | heldout | `heldout/english-loanword/04-feedback-jefe.txt` |
| Anselmo Pantoja Uribe | `english-loanword` | tuning | `tuning/english-loanword/05-trigger-coche.txt` |
| Bernarda Xochitl Zúñiga | `unclear-speech` | tuning | `tuning/unclear-speech/01-pastilla-garbal.txt` |
| Crispín Espinoza Cisneros | `unclear-speech` | heldout | `heldout/unclear-speech/02-numero-garbal.txt` |
| Dorotea Godoy Figueroa | `unclear-speech` | tuning | `tuning/unclear-speech/03-palabra-inglesa-garbal.txt` |
| Anaías Arredondo Iriarte | `unclear-speech` | heldout | `heldout/unclear-speech/04-hora-garbal.txt` |
| Bárbara Ibarra Monreal | `unclear-speech` | tuning | `tuning/unclear-speech/05-medicamento-garbal.txt` |
| César Xicará Pantoja | `clean-control` | tuning | `tuning/clean-control/01-sesion-completa.txt` |
| Doroteo Sarmiento Salgado | `clean-control` | heldout | `heldout/clean-control/02-admision-completa.txt` |
| Esperanza Zamudio Valdivia | `clean-control` | tuning | `tuning/clean-control/03-seguimiento-sano.txt` |
| Fermín Grijalva Zambrano | `clean-control` | heldout | `heldout/clean-control/04-llamada-con-datos.txt` |
| Graciela Alcántara Guerrero | `clean-control` | tuning | `tuning/clean-control/05-sesion-con-plan.txt` |

### `e2e/fixtures/eval-owner-es/` — the practice owner's seven-section format, in Spanish

| Person | Trap type | Split | Transcript |
| --- | --- | --- | --- |
| Hipólito Escamilla Mascarenhas | `lost-negation` | tuning | `tuning/lost-negation/01-sin-dormir.txt` |
| Imelda Cárdenas Pineda | `lost-negation` | heldout | `heldout/lost-negation/02-sin-comer.txt` |
| Jacinta Lomelí Tapia | `lost-negation` | tuning | `tuning/lost-negation/03-nunca-tableta.txt` |
| Leandro Urzúa Yépez | `lost-negation` | heldout | `heldout/lost-negation/04-no-se-lo-manda.txt` |
| Marisol Buenrostro Bustamante | `lost-negation` | tuning | `tuning/lost-negation/05-no-se-atreve.txt` |
| Nicanor Ituarte Enríquez | `invented-negation` | tuning | `tuning/invented-negation/01-todos-los-dias.txt` |
| Odalia Mendívil Huerta | `invented-negation` | heldout | `heldout/invented-negation/02-bebe-los-viernes.txt` |
| Patricio Zabala Lomelí | `invented-negation` | tuning | `tuning/invented-negation/03-medicamento-diario.txt` |
| Quirina Trujillo Olvera | `invented-negation` | heldout | `heldout/invented-negation/04-tiene-casa.txt` |
| Rufino Ojeda Rendón | `invented-negation` | tuning | `tuning/invented-negation/05-firma-el-recibo.txt` |
| Serafina Wenceslao Urbina | `dose-and-number` | tuning | `tuning/dose-and-number/01-cero-coma-cinco.txt` |
| Teodoro Dzul Ybarra | `dose-and-number` | heldout | `heldout/dose-and-number/02-media-pastilla.txt` |
| Úrsula Lomelí Delgado | `dose-and-number` | tuning | `tuning/dose-and-number/03-suero-cinco-litros.txt` |
| Vicente Solórzano Ledesma | `dose-and-number` | heldout | `heldout/dose-and-number/04-ochenta-y-dos-kilos.txt` |
| Ximena Naranjo Ordóñez | `dose-and-number` | tuning | `tuning/dose-and-number/05-seis-y-media-horas.txt` |
| Yolanda Valadez Sepúlveda | `experiencer` | tuning | `tuning/experiencer/01-hermana-no-duerme.txt` |
| Zacarías Rangel Velasco | `experiencer` | heldout | `heldout/experiencer/02-papa-bebe.txt` |
| Adela Yzaguirre Arreola | `experiencer` | tuning | `tuning/experiencer/03-mama-ansiosa.txt` |
| Baltasar Fuentes Duarte | `experiencer` | heldout | `heldout/experiencer/04-hijo-miedo.txt` |
| Casimira Bermúdez Guzmán | `experiencer` | tuning | `tuning/experiencer/05-abuela-caidas.txt` |
| Dionisio Balderas Jarquín | `past-vs-current-risk` | tuning | `tuning/past-vs-current-risk/01-intento-en-2019.txt` |
| Eugenia Luvian Navarrete | `past-vs-current-risk` | heldout | `heldout/past-vs-current-risk/02-intento-hace-dos-anos.txt` |
| Fermín Zepeda Quintanilla | `past-vs-current-risk` | tuning | `tuning/past-vs-current-risk/03-autolesiones-nina.txt` |
| Gumaro Tiscareño Trujillo | `past-vs-current-risk` | heldout | `heldout/past-vs-current-risk/04-idea-suicida-pasada.txt` |
| Herminia Aboites Ximenes | `past-vs-current-risk` | tuning | `tuning/past-vs-current-risk/05-sin-riesgo-anoche.txt` |
| Isidoro Huitrón Ruiz | `uncertainty` | tuning | `tuning/uncertainty/01-no-se-acordo-marca.txt` |
| Josefina Villalpando Higareda | `uncertainty` | heldout | `heldout/uncertainty/02-pendiente-confirmar.txt` |
| Leocadia Carreón Nolasco | `uncertainty` | tuning | `tuning/uncertainty/03-no-sabe-anios.txt` |
| Melitón Sandoval Quezada | `uncertainty` | heldout | `heldout/uncertainty/04-dosis-pasada.txt` |
| Nicanora Maldonado Uribe | `uncertainty` | tuning | `tuning/uncertainty/05-altas-sin-confirmar.txt` |
| Otilio Venegas Zúñiga | `spoken-correction` | tuning | `tuning/spoken-correction/01-o-sea-dos-y-media.txt` |
| Petrona Cervera Cisneros | `spoken-correction` | heldout | `heldout/spoken-correction/02-mejor-dicho-cuatrocientos.txt` |
| Rufina Jazmín Figueroa | `spoken-correction` | tuning | `tuning/spoken-correction/03-mas-bien-ataque.txt` |
| Santos Ocampo Iriarte | `spoken-correction` | heldout | `heldout/spoken-correction/04-es-decir-antes-de-dormir.txt` |
| Teodora Peralta Monreal | `spoken-correction` | tuning | `tuning/spoken-correction/05-digo-dos-veces.txt` |
| Valentín Ugarte Pantoja | `section-never-covered` | tuning | `tuning/section-never-covered/01-llamada-sin-objetivo.txt` |
| Zenobia Pantoja Salgado | `section-never-covered` | heldout | `heldout/section-never-covered/02-se-corto-sin-plan.txt` |
| Anselmo Xochitl Valdivia | `section-never-covered` | tuning | `tuning/section-never-covered/03-admision-sin-formulacion.txt` |
| Bernarda Espinoza Zambrano | `section-never-covered` | heldout | `heldout/section-never-covered/04-sesion-sin-analisis.txt` |
| Crispín Godoy Guerrero | `section-never-covered` | tuning | `tuning/section-never-covered/05-antecedentes-no-dados.txt` |
| Dorotea Arredondo Mascarenhas | `english-loanword` | tuning | `tuning/english-loanword/01-burnout-papeles.txt` |
| Anaías Ibarra Pineda | `english-loanword` | heldout | `heldout/english-loanword/02-check-in-corto.txt` |
| Bárbara Xicará Tapia | `english-loanword` | tuning | `tuning/english-loanword/03-si-y-hi.txt` |
| César Sarmiento Yépez | `english-loanword` | heldout | `heldout/english-loanword/04-feedback-jefe.txt` |
| Doroteo Zamudio Bustamante | `english-loanword` | tuning | `tuning/english-loanword/05-trigger-coche.txt` |
| Esperanza Grijalva Enríquez | `unclear-speech` | tuning | `tuning/unclear-speech/01-pastilla-garbal.txt` |
| Fermín Alcántara Huerta | `unclear-speech` | heldout | `heldout/unclear-speech/02-numero-garbal.txt` |
| Graciela Escamilla Lomelí | `unclear-speech` | tuning | `tuning/unclear-speech/03-palabra-inglesa-garbal.txt` |
| Hipólito Cárdenas Olvera | `unclear-speech` | heldout | `heldout/unclear-speech/04-hora-garbal.txt` |
| Imelda Lomelí Rendón | `unclear-speech` | tuning | `tuning/unclear-speech/05-medicamento-garbal.txt` |
| Jacinta Urzúa Urbina | `clean-control` | tuning | `tuning/clean-control/01-sesion-completa.txt` |
| Leandro Buenrostro Ybarra | `clean-control` | heldout | `heldout/clean-control/02-admision-completa.txt` |
| Marisol Ituarte Delgado | `clean-control` | tuning | `tuning/clean-control/03-seguimiento-sano.txt` |
| Nicanor Mendívil Ledesma | `clean-control` | heldout | `heldout/clean-control/04-llamada-con-datos.txt` |
| Odalia Zabala Ordóñez | `clean-control` | tuning | `tuning/clean-control/05-sesion-con-plan.txt` |

## Rules for anyone extending these corpora

1. **One invented patient per transcript, one transcript per patient.**
   Add the row to this file before writing the transcript.
2. **No second personal name anywhere** — not a relative, not a provider,
   not a colleague, not a name inside a quoted aside. Relationship words
   only. The checker fails on any capitalised, non-sentence-initial word
   that is not a component of a name in this table.
3. **No real place names, no brand names, no institution names.** All three
   would be capitalised proper nouns the checker cannot tell from a person.
   Medication generics are lowercase Spanish and are fine
   (`sertralina`, `alprazolam`, `paracetamol`); brand names are not.
   Weekdays and months are lowercase in Spanish anyway, so write `lunes`
   and `septiembre` — see `docs/research/es-mx-clinical-glossary.md` §5.
4. **Split the new fixture the way the card says**, not by taste: within a
   trap type, sort the five names and hold out the ones at index `i` where
   `i % 5` is 1 or 3. The `NN-` prefix must stay the sorted position, or the
   split stops being derivable and the checker fails.
5. **Invent the content.** Nothing redacted, nothing adapted from a real
   dictation.

# es-MX interface conventions and UI glossary (S1.4)

**Card:** S1.4, role RESEARCH. **Date:** 2026-09-26. **Status:** research only; nothing here is implemented, and nothing here is legal or clinical advice.

**What this file is:** the rules S2 translators follow for the Apunta interface, plus the narrative companion to `es-mx-ui-glossary.json`. The JSON holds the term-by-term mapping (one entry per visible noun or verb, shape `{ "category", "en", "es_mx", "ui", "note", "source" }`); this file explains the decisions and their sources. It answers the three dispatch questions in §§1–3. Section 4 lists the open owner decisions; §5 is the source list.

**Method:** public web pages only, no logins, no downloads. Terminology sources are RAE/ASALE, FundéuRAE, Microsoft's es-MX localization style guide, the Mexican Official Standards (NOM-004, NOM-008), UNAM and Secretaría de Salud material, and the earlier S1.1–S1.3 research files. English UI strings were enumerated from `web/src/routes/*.tsx` and `web/src/components/*.tsx` with the TypeScript compiler API (JSX text nodes, visible attributes, and user-facing string literals; test files excluded). No clinical examples appear here: the glossary is vocabulary and structure only, per `CLAUDE.md` hard rule 2.

**Labels:** `[verified]` = read as verbatim or near-verbatim text in the cited source. `[inferred]` = my mapping with the basis stated. `[not found]` = checked the named sources and could not confirm; flagged, never guessed. Each JSON entry carries its own label and URL.

---

## 1. Q1 — tú or usted in Mexican professional software

**Recommendation: tú, used consistently, for everything the app says to the clinician.** Reasons and sources:

- Microsoft's own Spanish (Mexico) localization style guide states the rule directly: *"For Spanish Microsoft voice, the informal second person singular pronoun 'tú' is recommended."* `[verified]` (https://download.microsoft.com/download/9/0/1/9016efc5-6455-4a9d-ae78-ed3df93b2851/spa-mex-StyleGuide.pdf). Microsoft is the largest primary source for es-MX software voice; this is the closest thing to an industry standard for Mexican UI.
- RAE/ASALE records that the familiar treatment (*tuteo*) has spread in the contemporary language "a situaciones reservadas hasta hace poco al trato de usted, como las relaciones entre personal sanitario y pacientes" `[verified]` (https://www.rae.es/gram%C3%A1tica-b%C3%A1sica/el-pronombre-personal/las-formas-de-tratamiento-pronominal/t%C3%BA-y-usted; https://www.rae.es/buen-uso-espa%C3%B1ol/las-formas-de-tratamiento). Apunta's UI addresses the clinician about her own work, not a patient, so the health-personnel case is a fortiori.
- The English voice being translated is already informal and direct ("Let's focus on…", "Just enough to organize her notes.", "Think out loud…", "Nothing is written until you press Import"). `tú` preserves that register; `usted` would make the same strings stiff and longer.

**Counterpoint (recorded, not dismissed).** Some Spanish software-localization conventions prescribe formal third-person *usted* for programs: the Ubuntu Spanish translators' style guide says the appropriate treatment for computing texts is "la tercera persona del singular (usted)" and recommends omitting the pronoun where possible `[verified]` (https://wiki.ubuntu.com/UbuntuSpanishTranslators/Estilo). Microsoft's Spain guide also notes that Spain uses *tú* but plural *vosotros*; Mexican Spanish uses *ustedes* for all plurals — so plurals in the UI take third-person verb concord regardless (`Ustedes`/implicit plural = third person), never *vosotros* `[verified]` (https://www.rae.es/dpd/usted).

**How to apply tú:**

- Imperative in the second person singular: "Elige un formato de nota", "Busca un paciente", "Escribe tus notas", "Intenta de nuevo", "Desmarca…".
- Possessives *tu/tus*: "…organizar tus notas", "tu grabación", "tus pacientes".
- Do **not** mix registers. Pick one and keep it across every string.
- The app never has the clinician address the patient in the UI, so the tú/usted question for patient-facing wording does not arise on this card.

**Open decision for the owner (O-1):** if she prefers a more formal, institutional voice, the whole UI can switch to *usted* (third-person concord: "Elija un formato de nota", "Busque un paciente"). It is a global either/or, not per-string. Recommendation stands: *tú*.

---

## 2. Q2 — dates, times, numbers, capitalisation and punctuation

### 2.1 Dates

- **Order is day–month–year.** The académic recommendation is *día, mes, año* (14 de octubre de 1951); the US month–day–year order is expressly discouraged `[verified]` (https://www.fundeu.es/recomendacion/como-se-escriben-las-fechas/; https://www.rae.es/dpd/fecha). Mexico follows this, expressed numerically as **DD/MM/AAAA** (DOF forms print "DD-MM-AAAA" `[verified]` https://dof.gob.mx/nota_detalle_popup.php?codigo=5746006).
- **Prose dates** combine words for the month, always lowercase, with both prepositions of "de": **4 de febrero de 2026** `[verified]` (https://www.fundeu.es/recomendacion/como-se-escriben-las-fechas/). The first of the month takes the ordinal in America, **primero de marzo** `[verified]` (same URL).
- **Compact numeric dates** use `/`, `-` or `.` with no spaces (8/7/1980) `[verified]` (https://www.fundeu.es/recomendacion/como-se-escriben-las-fechas/). The académic default discourages a leading zero in prose (better 4/2/2026 than 04/02/2026) `[verified]` (same URL); for a fixed-width table or a date input, zero-padding (04/02/2026) may be used for alignment — `[inferred]`, typical UI practice, not from the source.
- **Machine/ISO dates** are **AAAA-MM-DD** in Mexico by official standard DGN-R-13-1973 ("Escritura de fechas del calendario en forma numérica completa": year–month–day, 4-digit year, 2-digit month and day, hyphen or space only) `[verified]` (https://www.diariooficial.gob.mx/nota_detalle.php?codigo=4628727&fecha=08%2F08%2F1973). Use this in ids, filenames and stored timestamps; **never** show MM/DD/YYYY anywhere.
- **Ambiguity guard:** because es-MX is always DD/MM, a date like 03/04 is 3 April. Where a date could be misread (import previews, exports), prefer the prose form or the ISO form `[inferred]` (basis: Fundéu's ambiguity warning on the same page).

### 2.2 Times

- The two models are the **12-hour** model (with *de la mañana / de la tarde / de la noche*, or `a. m.` / `p. m.`) and the **24-hour** model (preferred where precision or schedules matter) `[verified]` (https://www.fundeu.es/recomendacion/horas-grafia/; https://www.rae.es/buen-uso-espa%C3%B1ol/la-expresi%C3%B3n-de-la-hora-i-formas-de-manifestarla).
- **Recommendation for Apunta: 24-hour, `HH:MM`** (`15:06`), because the app records timestamps and session times. The official separator is the colon, tight to both digits `[verified]` (https://www.fundeu.es/recomendacion/horas-grafia/). In technical contexts the leading zeros are required (`09:00`); in common use they may be dropped (`9 h`) `[verified]` (https://www.rae.es/libro-estilo-lengua-espa%C3%B1ola/fecha-hora-y-otras-expresiones-cronol%C3%B3gicas).
- **Do not mix models** in one string: "las 9 de la mañana", "las 9 a. m.", "09:00" or "9 h", never "las 9 de la mañana" beside "9 a. m." `[verified]` (https://www.fundeu.es/recomendacion/horas-grafia/).
- If 12-hour is used: `a. m.` / `p. m.` in **lowercase, with periods and a space**, never `AM`/`PM` in running text `[verified]` (https://www.rae.es/espanol-al-dia/si-se-usa-la-abreviatura-m-para-indicar-las-horas-anteriores-al-mediodia-y-p-m-para). Noon is `12 m.`, midnight is `12 a. m.` `[verified]` (https://www.fundeu.es/consulta/horarios/).
- Precedent in Mexican clinical software: the UNAM psychology electronic-record manual specifies a 24-hour field, *"un formato de 24 horas. Ejemplo, 13:45 Hrs."* `[verified]` (https://www.zaragoza.unam.mx/wp-content/Portal2015/eclime/ECLIME_Psicologia_2025.pdf).

### 2.3 Numbers and decimal separator

- In Mexico the customary **decimal separator is the point** (RAE: the point is used in Mexico, Guatemala, Honduras, Nicaragua, Panama, Puerto Rico, Dominican Republic, Venezuela and among US Spanish speakers, and RAE recommends the point to move toward unification) `[verified]` (https://www.rae.es/ortograf%C3%ADa/los-n%C3%BAmeros-decimales-y-el-separador-decimal).
- NOM-008-SE-2021 permits **either a comma or a point** as the decimal sign, requires a leading zero for values below one (`0.5`), forbids using commas or points to group thousands, and allows a space in groups of three `[verified]` (https://sidof.segob.gob.mx/notas/5713228; https://cenam.mx/Documentos/NOM-008-SE-2021.pdf).
- **Recommendation:** write decimals with a **point** and a leading zero (`0.5`, `7.5`), format thousands with a **space** only if needed (`1 234`), never `1,234.5` or `1.234,5` `[verified]` for the rule (NOM-008), `[inferred]` for the es-MX choice.
- Units follow NOM-008: symbol not pluralised, no trailing period except sentence end, a space between number and symbol (`45 kg`) `[verified]` (same NOM-008 URLs).

### 2.4 Capitalisation

- **Days, months and seasons are lowercase** (`lunes`, `enero`) unless they start a sentence or form part of a proper name (Viernes Santo) `[verified]` (https://www.rae.es/espanol-al-dia/mayuscula-o-minuscula-en-los-meses-los-dias-de-la-semana-y-las-estaciones-del-ano; https://www.fundeu.es/recomendacion/dias-de-la-semana-meses-estaciones-minuscula/).
- **UI labels are sentence case** — only the first word and proper nouns capitalised. Spanish does not use English-style Title Case for options and buttons (Ubuntu translators' guide: "En español solo se escribe con mayúscula la primera letra del título u opción") `[verified]` (https://wiki.ubuntu.com/UbuntuSpanishTranslators/Estilo). Microsoft's es-MX guide works from the same principle (its samples address the user in sentence case) `[inferred from]` the es-MX style guide (https://download.microsoft.com/download/9/0/1/9016efc5-6455-4a9d-ae78-ed3df93b2851/spa-mex-StyleGuide.pdf).
- **Product names keep their casing:** Apunta, Claude, Halaxy, SKILL.md, ICD-10-CM, DSM-5-TR, NPI, PDF, Mac. Acronyms written in full keep normal capitalisation.
- **Do not capitalise** days, months, *usted*, or generic nouns mid-sentence.

### 2.5 Punctuation

- **Open interrogatives and exclamatives always carry the opening sign** `¿` / `¡`; dropping it is incorrect `[verified]` (https://www.rae.es/dpd/signos%20de%20interrogaci%C3%B3n%20y%20exclamaci%C3%B3n; https://www.rae.es/ortograf%C3%ADa/los-signos-de-interrogaci%C3%B3n-y-la-exclamaci%C3%B3n). E.g. *"¿Eliminar esta nota?"*, *"¿Estás segura?"*.
- **No period after** a closing `?` or `!` when it ends the utterance; a comma, semicolon or colon may follow without a space `[verified]` (same URLs).
- The opening sign goes **where the question starts**, even mid-sentence, and that first word is then lowercase: *"Si sales, ¿avísame?"* `[verified]` (https://www.rae.es/dpd/signos%20de%20interrogaci%C3%B3n%20y%20exclamaci%C3%B3n).
- For quoted text, RAE prefers angular quotes `«…»` with double quotes `"…"` nested `[inferred]` for UI contexts; the evidence is the RAE punctuation rule that the closing interrogation/exclamation sign is placed inside or outside other double signs depending on what it delimits `[verified]` (https://www.rae.es/ortograf%C3%ADa-b%C3%A1sica/uso-de-los-signos-ortogr%C3%A1ficos/signos-de-puntuaci%C3%B3n/los-signos-de-interrogaci%C3%B3n-y-la-exclamaci%C3%B3n). UI strings rarely need quotes; keep them out where possible.
- Spanish uses the long dash or parentheses for asides; avoid the English em-dash habit for parentheticals `[inferred]` (standard Spanish punctuation; basis: RAE punctuation pages above).

---

## 3. Q3 — the UI glossary

### 3.1 Shape and coverage

`es-mx-ui-glossary.json` is a JSON array. Each entry is:

```json
{
  "category": "note",
  "en": "note",
  "es_mx": "nota",
  "ui": ["Notes", "New note", "Delete note"],
  "note": "[verified] …",
  "source": "https://…"
}
```

- `en` is the base English term as it appears in the source; `ui` lists the exact visible UI strings the entry covers, so a reviewer can map any string to an entry (dispatch V3).
- One entry per **noun and verb** visible in the UI, including inflected forms that appear verbatim ("Saving…", "Copied", "Try again"). Multi-word feature names are entries in their own right ("Treatment plan", "Finish & copy", "Prepare for session").
- Proper nouns and identifiers are listed as **keep as-is** entries (Apunta, Claude, Halaxy, SKILL.md, ICD-10-CM, DSM-5-TR, NPI, PDF, Mac).

### 3.2 Cross-references to earlier cards

- **Clinical note vocabulary** (diagnosis, intervention, risk, techniques, medications) is mapped in `docs/research/es-mx-clinical-glossary.json` (S1.2). This card does not duplicate it; it reuses its renderings for the few clinical UI terms that surface (diagnosis, intervention, plan, patient).
- **Section names** for the note formats are decided in `docs/research/es-mx-clinical-documentation.md` (S1.1, §5): e.g. *nota de evolución* for a session note, *paciente* for patient, *motivo de consulta*, *antecedentes*, *plan terapéutico*. This card follows those.
- **Spoken-correction vocabulary and fillers** are in `docs/research/es-mx-speech.md` (S1.3) and are not UI strings.

### 3.3 Key naming decisions

| English UI | es-MX | Basis |
| --- | --- | --- |
| note | **nota** | `[verified]` RAE DLE (https://dle.rae.es/nota). In clinical context, *nota de evolución* `[verified]` NOM-004 §6.2. |
| draft | **borrador** | `[verified]` RAE DLE: "Texto provisional susceptible de modificación y desarrollo" (https://dle.rae.es/borrador). |
| brainstorm | **lluvia de ideas** | `[verified]` FundéuRAE: the DLE records both *lluvia de ideas* and *tormenta de ideas* (https://www.fundeu.es/consulta/brainstorming-16047/). Feature title and verb phrase ("Think out loud…" = "Piensa en voz alta…") both mapped. |
| backup | **copia de seguridad** | `[verified]` FundéuRAE: English *backup* = *copia de seguridad*, *copia de respaldo* or *copia* (https://www.fundeu.es/recomendacion/backup-es-copia-de-seguridad-respaldo/). Verb *back up* = **hacer una copia de seguridad**. |
| settings | **Ajustes** | `[inferred]` es-MX consumer convention (Samsung Mexico and Audible es_MX both use *Ajustes*: https://www.samsung.com/mx/support/mobile-devices/how-to-change-the-language-settings-of-each-app-in-your-galaxy-device/, https://help.audible.com/s/article/set-your-language-preference?language=es_MX). *Configuración* is the Microsoft/enterprise variant and is recorded as an accepted alternative. |
| patient | **paciente** | `[verified]` NOM-004 defines *paciente*; follows S1.1 §2.3. |
| session | **sesión** | `[verified]` standard clinical term; UNAM/CONASAMA use *sesión* and *nota de sesión*. |
| treatment plan | **plan de tratamiento** | `[verified]` NOM-004 D2/6.3 uses *plan de tratamiento*; FENAPSIME art. 10 *plan de trabajo*; S1.1 §5.3. |
| briefing (prepare) | **resumen previo** | `[inferred]` the feature is a pre-session briefing assembled from past notes; literal *informe* suggests a formal report. *Resumen previo* avoids claiming it is a saved document (the UI says it is not saved unless kept). |
| attestation | **declaración** | `[inferred]` English *attestation* is the act of putting a version in force and recording name/credential. *Declaración* reads naturally; the literal *atestación/atestar* is archaic outside law. Flag O-4. |
| licensing (professional) | **cédula profesional** | `[verified]` NOM-004 Appendix D2/D12 lists "cédula profesional"; S1.1 §3.4. Distinct from **licencia** = software licence, so the two English strings "Licence" (plan) and "Licences" (legal) get different Spanish words. |
| licence (software) | **licencia** | `[verified]` standard legal term, used throughout THIRD-PARTY-LICENSES and Software licence practice. |
| transcript | **transcripción** | `[inferred]` standard Spanish noun for the written record of speech; S1.3 uses *transcripción*. |
| dictation | **dictado**; verb **dictar** | `[verified]` RAE/libro de estilo uses *dictar* for dictating to a machine (https://www.rae.es/libro-estilo-lengua-espa%C3%B1ola/comunicaci%C3%B3n-ser-humanom%C3%A1quina). |
| refine | **refinar** | `[inferred]` standard Spanish verb; the UI label "Refine note" renders as "Refinar nota". |
| publish | **publicar** | `[inferred]` standard Spanish verb for making the draft final. Flag O-2 (see below). |
| format | **formato** | `[inferred]` standard; the earlier format work already names them *formatos de notas*. |
| section | **sección** | `[inferred]` standard; S1.1 calls the parts *secciones*. |

### 3.4 Deliberately kept in English (proper nouns and identifiers)

Apunta · Claude · Halaxy · SKILL.md · ICD-10-CM · DSM-5-TR · NPI · PDF · Mac · MXN (currency symbol `$`). Rationale: product names and standard identifiers are not translated `[inferred]`; Microsoft and Ubuntu style both keep trademarked product names `[verified]` (https://wiki.ubuntu.com/UbuntuSpanishTranslators/Estilo).

### 3.5 Sample names in placeholder text

The UI has an English placeholder *"e.g. John Smith"* (Add patient) and Spanish fixtures may not use invented names. `e2e/fixtures/eval-es/NAMES.md` does **not** exist in the tree at this commit `[verified]` (checked with `find`/`git ls-files`, no such path). Per HS-8, Spanish placeholder names must come only from that file **when it is created**; until then, S2 must leave the placeholder as the prototype's English sample or blank and flag it. Do not invent a Spanish name. Flag O-3.

---

## 4. Open decisions (for the owner)

- **O-1 tú vs usted** — recommendation: *tú*, consistently (Microsoft es-MX rule). One global switch if she prefers formality.
- **O-2 "Publish"** — the English metaphor is "make the draft the finished note". Literal *publicar* can suggest posting to the internet, which is the opposite of Apunta's privacy promise. Recommendation: keep *publicar* (standard software sense, paired with *borrador*), **or** use *finalizar* / *marcar como final* if she worries about the connotation. Needs one sentence from her.
- **O-3 Spanish sample name** — pending creation of `e2e/fixtures/eval-es/NAMES.md`.
- **O-4 "Attestation"** — *declaración* (recommended) vs literal *atestación*. The section records the practitioner's name and credential against a plan version; the legal wording she prefers for her records should drive it.
- **O-5 "Review interval"** — *intervalo de revisión* (recommended, matches the plan's "Review interval (days)") vs *frecuencia de revisión*. The plan also has a separate "Service frequency"; keeping *intervalo* distinct avoids collision.
- **O-6 "Briefing"** — *resumen previo* (recommended) vs *informe* vs *resumen de preparación*. It is intentionally not saved, so a word that does not imply a filed document is preferred.

None of these are legal questions; they are voice choices for the owner or the S2 lead. No lawyer input is required by this card, and no legal advice is given.

---

## 5. Sources

Primary standards and authorities:

- NOM-004-SSA3-2012, *Del expediente clínico*, DOF 15-10-2012 — https://dof.gob.mx/nota_detalle_popup.php?codigo=5272787
- NOM-008-SE-2021, *Sistema general de unidades de medida*, DOF 29-12-2023 — https://sidof.segob.gob.mx/notas/5713228 and https://cenam.mx/Documentos/NOM-008-SE-2021.pdf
- DGN-R-13-1973, *Escritura de fechas del calendario en forma numérica completa* — https://www.diariooficial.gob.mx/nota_detalle.php?codigo=4628727&fecha=08%2F08%2F1973
- RAE/ASALE, *Nueva gramática básica / El buen uso del español*: tú y usted — https://www.rae.es/gram%C3%A1tica-b%C3%A1sica/el-pronombre-personal/las-formas-de-tratamiento-pronominal/t%C3%BA-y-usted; https://www.rae.es/buen-uso-espa%C3%B1ol/las-formas-de-tratamiento
- RAE/ASALE, *Diccionario panhispánico de dudas*: usted — https://www.rae.es/dpd/usted; fecha — https://www.rae.es/dpd/fecha; signos de interrogación y exclamación — https://www.rae.es/dpd/signos%20de%20interrogaci%C3%B3n%20y%20exclamaci%C3%B3n
- RAE/ASALE, *Ortografía*: los números decimales y el separador decimal — https://www.rae.es/ortograf%C3%ADa/los-n%C3%BAmeros-decimales-y-el-separador-decimal; los signos de interrogación y exclamación — https://www.rae.es/ortograf%C3%ADa/los-signos-de-interrogaci%C3%B3n-y-la-exclamaci%C3%B3n
- RAE/ASALE, date and time: *El buen uso* — https://www.rae.es/buen-uso-espa%C3%B1ol/la-expresi%C3%B3n-de-la-hora-i-formas-de-manifestarla; *Libro de estilo* — https://www.rae.es/libro-estilo-lengua-espa%C3%B1ola/fecha-hora-y-otras-expresiones-cronol%C3%B3gicas; months/weekdays — https://www.rae.es/espanol-al-dia/mayuscula-o-minuscula-en-los-meses-los-dias-de-la-semana-y-las-estaciones-del-ano
- RAE/ASALE, *Libro de estilo*, comunicación ser humano-máquina (dictado) — https://www.rae.es/libro-estilo-lengua-espa%C3%B1ola/comunicaci%C3%B3n-ser-humanom%C3%A1quina
- FundéuRAE: cómo se escriben las fechas — https://www.fundeu.es/recomendacion/como-se-escriben-las-fechas/; horas — https://www.fundeu.es/recomendacion/horas-grafia/; meses en minúscula — https://www.fundeu.es/recomendacion/dias-de-la-semana-meses-estaciones-minuscula/; noon — https://www.fundeu.es/consulta/horarios/; backup — https://www.fundeu.es/recomendacion/backup-es-copia-de-seguridad-respaldo/; brainstorming — https://www.fundeu.es/consulta/brainstorming-16047/
- Microsoft Spanish (Mexico) Localization Style Guide — https://download.microsoft.com/download/9/0/1/9016efc5-6455-4a9d-ae78-ed3df93b2851/spa-mex-StyleGuide.pdf
- Ubuntu Spanish Translators style — https://wiki.ubuntu.com/UbuntuSpanishTranslators/Estilo
- RAE DLE — *nota* https://dle.rae.es/nota; *borrador* https://dle.rae.es/borrador

Clinical/practice references (reused from S1.1 and S1.2):

- FENAPSIME, *Código de ética* — https://fenapsime.org/wp-content/uploads/2022/11/Codigo-de-Etica-FENAPSIME.pdf
- UNAM FES Iztacala, *Elaboración de nota SOAP y examen mental* — https://www.medicinaconductual-unam-fesi.org/uploads/1/0/3/4/103420148/elaboraci%C3%B3n_de_nota_soap_y_examen_mental.pdf
- CONASAMA, *Guía para la Integración del Expediente Clínico* — https://www.conasama.salud.gob.mx/Residenciales/Guxa_expediente_res_profesional_13_09_21.pdf
- UNAM, *Manual del Expediente Clínico Electrónico de Psicología* (ECLIME Psicología 2025) — https://www.zaragoza.unam.mx/wp-content/Portal2015/eclime/ECLIME_Psicologia_2025.pdf
- Local: `docs/research/es-mx-clinical-documentation.md` (S1.1), `docs/research/es-mx-clinical-glossary.json` (S1.2), `docs/research/es-mx-speech.md` (S1.3)

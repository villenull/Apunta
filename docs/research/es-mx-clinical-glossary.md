# Clinical vocabulary glossary, English to es-MX (S1.2)

**Card:** S1.2, role RESEARCH. **Date:** 2026-09-26. **Status:** research only; nothing here is implemented, nothing here is legal advice, and nothing here is prescribing guidance.

**What this file is:** the narrative companion to `es-mx-clinical-glossary.json`, which holds the full mapping (399 entries, shape `{ "en", "es_mx", "category", "note", "source" }`). Every English term from `server/src/ai/clinical-knowledge/presentation.ts` (74 signals + domains + status words), `server/src/ai/clinical-knowledge/interventions.ts` (9 labels + 28 signals + technique vocabulary), the number/unit words in `server/src/ai/fact-guard.ts`, and the patterns in `server/src/eval/patterns.ts` is either mapped or listed as unmapped with a reason (§8). Risk negations carry every common written form (§3). Medications are vocabulary only: generic (DCI) spellings, brand names as proper nouns, dose writing/speaking patterns — no doses recommended, no prescribing guidance anywhere in either file.

**Method:** public web pages only, no logins, no downloads. Competitor/clinic-software pages were not used; terminology sources are official instruments (DOF/NOMs, WHO, C-SSRS), university and professional-body publications, and peer-reviewed or institutional teaching material. No patient material appears here — only vocabulary and structure, per `CLAUDE.md` hard rule 2.

**Labels:** `[verified]` = read verbatim or near-verbatim in the cited source. `[inferred]` = my mapping with the basis stated (usually a standard calque or compositional phrase). `[not found]` = checked and could not confirm; flagged, never guessed. Each JSON entry carries its own label and URL.

**Coverage by category:** presentation 92, risk 45, intervention 65, medication 93, unit 8, number 51, frequency-time 14, pattern-marker 31.

---

## 1. Q1 — Presentation and mental-status terms

The full per-signal mapping is in the JSON (`category: presentation`). Headline decisions:

| English | es-MX | Basis |
| --- | --- | --- |
| Appearance, grooming, attire | aspecto, arreglo personal / aliño, vestimenta | `[verified]` MedlinePlus Spanish MSE |
| Eye contact, posture | contacto visual, postura | `[verified]` MedlinePlus Spanish MSE |
| Cooperative / hostile | actitud colaboradora / hostil | `[verified]` MedlinePlus Spanish MSE |
| Guarded | actitud reservada; reticente | `[verified]` reticencia = desconfianza extrema (Finis Terrae manual) |
| Psychomotor agitation / retardation | agitación psicomotriz / retardo psicomotor | actividad psicomotora `[verified]`; noun forms `[inferred]`, flag which retardation noun she prefers |
| Speech domain | habla y lenguaje | `[verified]` examen-mental teaching step |
| Mood | estado de ánimo; refiere ánimo … | `[verified]` Finis Terrae manual |
| Affect range full / restricted / flat / labile | amplio / restringido / plano / lábil | `[verified]` CUN medical dictionary (rango: completo, restringido o nulo; embotado; lábil) |
| Affect quality | eutímico, disfórico, ansioso, irritable, eufórico | euforia `[verified]`; eutímico/disfórico `[inferred]` standard adjectives, confirmation flagged |
| Congruent / incongruent | congruente / incongruente con el ánimo referido | `[verified]` CUN congruencia dimension |
| Hallucinations, illusions | alucinaciones (auditivas, visuales…), ilusiones | types `[verified]` Finis Terrae; ilusiones `[inferred]`, confirmation flagged |
| Depersonalization / derealization | despersonalización / desrealización | `[inferred]` identical terms, confirmation flagged |
| Linear / logical / goal-directed | lineal / lógico / dirigido a metas | `[verified]` TFP article basis; dirigido a metas `[inferred]`, flag metas-vs-objetivos |
| Circumstantial / tangential | circunstancial / tangencial | `[verified]` pensamiento circunstancial; tangencialidad |
| Flight of ideas | fuga de ideas | `[verified]` defined Spanish term |
| Loose associations | asociaciones laxas | `[inferred]` standard term; direct primary-source confirmation flagged |
| Word salad | ensalada de palabras | `[verified]` incoherencia (ensalada de palabras) |
| Thought blocking | bloqueo del pensamiento | `[verified]` bloqueo |
| Delusions / paranoia / obsessions / phobias | ideas delirantes / ideación paranoide / obsesiones / fobias | `[inferred]` standard charting terms, confirmation flagged |
| Alert / lethargic; oriented person/place/time | alerta / letárgico; orientado en persona, lugar, tiempo | orientation axis `[verified]` MedlinePlus |
| Attention / concentration / memory | atención, concentración, memoria (conservada) | `[verified]` MedlinePlus attention axis; conservada `[inferred]` |
| Insight | insight conservado / conciencia de enfermedad | `[verified]` ausencia de conciencia de enfermedad (Elsevier) |
| Judgment | juicio conservado / alterado | juicio `[verified]` MedlinePlus; alterado `[inferred]` |

## 2. Q2 — Risk terms, negations, history vs current

Every common written negation form is a separate JSON entry (`category: risk`):

| English form | es-MX form | Status |
| --- | --- | --- |
| denies SI / denies suicidal ideation | niega ideación suicida | `[inferred]` verb; noun `[verified]` C-SSRS Spanish |
| no … / does not report | no refiere ideación suicida | `[inferred]`; refiere `[verified]` Castilla y León protocol |
| without … | sin ideación suicida; sin datos de … | `[inferred]` standard charting negation |
| ruled out | se descarta ideación suicida | `[inferred]` standard documentary form |
| no evidence of … | sin evidencia de … | `[inferred]` standard documentary negation |
| … was denied / absent | ideación suicida ausente; se niega … | `[inferred]` predicate forms |
| not suicidal | sin ideación suicida actual | `[inferred]` current-state negation |

Self-harm and harm-to-others: **autolesiones / conductas autolesivas** `[verified]` (MINSAL Chile protocol; Ibero-American DBT review); **pensamientos de hacerse daño** `[verified]` (MINSAL); **ideas suicidas / ideas autolíticas** `[verified]` (Castilla y León protocol); **ideación homicida** `[inferred]` calque — the primary Spanish forensic term is **riesgo de heteroagresividad** (paired with **riesgo de autoagresividad**) `[verified]` (Elsevier Atención Primaria). Flag for the owner which harm-to-others noun she prefers.

History vs current is written **antecedentes de X** vs **X actual / actualmente**: antecedentes de autolesiones `[verified]` (Scielo México study, which also attests the **riesgo bajo / medio / alto** grading). Passive/active follows Beck 1979 as **ideación pasiva de suicidio** / **ideación suicida activa** `[verified]` (Redalyc nomenclature paper); **intención suicida** `[verified]`; **intento suicida / intento de suicidio** `[verified]` (Castilla y León); **deseo de estar muerto** `[verified]` (official Spanish C-SSRS). Safety-plan items (**plan de seguridad**, **acuerdo de seguridad**) and disposition items (**mayor nivel de atención**, **hospitalización / internamiento**, **tratamiento residencial**, **valoración psiquiátrica**) are `[inferred]` and flagged. SI/HI have **no Spanish letter-abbreviation** — unmapped, write them out (§8).

## 3. Q3 — Intervention names and abbreviations in Mexico

| English | es-MX | Basis |
| --- | --- | --- |
| EMDR | EMDR (desensibilización y reprocesamiento por movimientos oculares) | `[verified]` UNED EMDR training; VA Spanish pages. Note: VA uses acronym DRMO; Mexico practice uses EMDR — flag for the owner |
| CBT | TCC (terapia cognitivo-conductual) | `[verified]` ITCC México; ChildMind Spanish |
| CBT for children | TCC para niños / TCC infantil | `[inferred]`; TCC-C is not established — unmapped (§8) |
| ACT | ACT (terapia de aceptación y compromiso) | `[verified]` Redalyc ACT paper; ITECOC México; actmx.net |
| Solution-focused | terapia centrada en soluciones (TCS; TBCS brief form) | `[verified]` UNIR; Dialnet Revista de Psicoterapia |
| Narrative therapy | terapia narrativa | `[verified]` Dialnet narrative-techniques paper; externalización |
| Psychodynamic therapy | terapia psicodinámica | transferencia/contratransferencia/mecanismos de defensa `[verified]` (ISFAP); label `[inferred]`, minor confirmation flagged |
| DBT | DBT (terapia dialéctico-conductual; variante: terapia dialéctica conductual, TDC) | `[verified]` both full forms attested (ChildMind ES, UAEH, Psara, Mente Sabia) — flag which full form she prefers |
| Behavioral therapy | terapia conductual | `[verified]` modificación-de-conducta literature |
| DBT-C | DBT-C (terapia dialéctica conductual para niños) | `[verified]` ChildMind Spanish (ages 6–12); childdbt.com Spanish series |

Technique vocabulary (all in JSON): estimulación bilateral `[verified]`; reestructuración cognitiva, diálogo/cuestionamiento socrático, flecha descendente, registro de pensamientos, modelo A-B-C `[verified]`; descubrimiento guiado `[verified]`; exposición con prevención de respuesta (EPR) `[verified]`; clarificación de valores, defusión cognitiva, aceptación, acción comprometida / compromiso con la acción, evitación experiencial `[verified]`; economía de fichas, desensibilización sistemática (DS), modificación de conducta, reforzamiento `[verified]`; mente sabia, tolerancia al malestar, regulación emocional, efectividad interpersonal, aceptación radical, atención plena / mindfulness `[verified]`; the remaining renderings (moldeamiento, encadenamiento, termómetro emocional, acción opuesta, unique-outcomes equivalents, narrative co-construction terms, working-through as elaboración) are `[inferred]` and flagged. English DBT skill acronyms (DEAR MAN, GIVE, FAST, TIPP, STOP, PLEASE, ACCEPTS) are kept as-is in Spanish practice — unmapped (§8).

## 4. Q4 — Medications (vocabulary only, no prescribing guidance)

Generic spellings use the Spanish DCI forms under the WHO INN system, which publishes Latin/English/French/Spanish columns `[verified]` (WHO procedure page). Most psych generics are identical or regularly adapted (sertralina, fluoxetina, paroxetina, venlafaxina, quetiapina, aripiprazol, clonazepam, alprazolam…). Two Mexico-specific notes: **acetaminophen is paracetamol in Mexico** `[inferred]`, and **aspirin is aspirina (ácido acetilsalicílico)** `[inferred]` — both flagged for a pharmacist. Brand names are proper nouns with identical spelling; Mexican-market availability was confirmed only for **Tafil / Tafil AP (alprazolam, Pfizer Mexico)** and **Rivotril (clonazepam, Roche Mexico)** `[verified]` (Mexico PK trial; international brand database). All other brands (Zoloft, Prozac, Lexapro, Xanax as US brand, etc.) are `[not found]` for the Mexican market and flagged for a pharmacist before S3/S5 use.

Dose writing follows NOM-004 §6.2.6 (medicamentos: dosis, vía, periodicidad) `[verified]`: the pattern is **sertralina 50 mg, vía oral, cada 24 horas**, matching the Cuadro Básico form (65 mg cada 6 a 8 horas … Oral) `[verified]`. Units: **mg (miligramo), mcg/µg (microgramo), g (gramo), mL (mililitro)** under NOM-008-SE-2021, in force 2024 `[verified]`; **unidades (U)** `[inferred]`; **UI, not IU, for international units** (order reversed in Spanish) `[inferred]`, confirm with a pharmacist. Decimal separator may be point or comma in Mexico `[verified]` (NOM-008 drafts); S3/S5 should accept both. Spoken form (cincuenta miligramos, vía oral, cada veinticuatro horas) is `[inferred]` composition.

## 5. Q5 — Numbers, units, frequency, time

Number words dos–noventa, cien/ciento (cien before nouns, ciento in compounds), dos veces, tres veces `[verified]` (RAE DLE/DPD). Spanish-specific token-design notes for S3/S5: **uno behaves like English one** (pronoun far more often than quantity — carry the exclusion over) `[inferred]`; **21–29 are single words** (veintiuno…) `[verified]`; **seis y medio** is the six-and-a-half form `[inferred]`; **days and months are always lowercase** (lunes, enero) `[verified]` (RAE DPD), so the English May/Sat/Sun capitalisation rules have no counterpart — match mayo/sábado/domingo in any case; standard abbreviations are ene, feb, mar, abr, jun, jul, ago, sep, oct, nov, dic and lun, mar, mie, jue, vie, sab, dom (tue/tues collapse to mar; thu/thur/thurs to jue). Frequency/time: una vez al día, dos veces al día, cada N horas, por la mañana (Mexican variant: en la mañana), por la noche, por semana, actualmente / en la actualidad, antecedentes de, la próxima sesión `[inferred]` standard usage, with periodicidad `[verified]` (NOM-004).

## 6. Eval-pattern equivalents (detector vocabulary for S5)

The `patterns.ts` phrases are mapped as **detector vocabulary, not note wording**: compatible con, sugestivo de, parece ser, secundario a, desencadenado por, apunta a, responde bien a, sugiere, probablemente, subyacente, se beneficiaría de, no abordado / sin información, no aplica, no abordado en esta sesión, evaluación diferida, con base en la transcripción, como IA `[inferred]` throughout. Mexican dictation fillers parallel to um/uh/erm are **este / eh**, and the scratch-that equivalent for the retraction pass is **borra eso / corrijo** — both `[inferred]`, confirm from her own dictations. Markdown markers are language-independent — unmapped (§8).

## 7. Open questions (no legal advice; vocabulary flags only)

For the owner: retardo-vs-enlentecimiento psicomotor; metas-vs-objetivos; lugar-vs-espacio; cliente-wording unaffected (this card only); malestar-vs-angustia (tolerancia module); TCC full-form preference for DBT (dialéctico-conductual vs dialéctica conductual); EMDR-vs-DRMO acronym; costo-vs-coste; confirm este/eh and borra-eso from her dictations; confirm the `[inferred]` technique renderings (asociaciones laxas, habla presionada, insight grades, narrative terms, grounding skills). For a pharmacist: Mexican availability of the `[not found]` brands; paracetamol/aspirina forms; UI abbreviation; decimal-separator house style. For S3/S5 design: uno exclusion, lowercase month/day matching, veintiuno single-wording, both decimal separators accepted, SI/HI and DBT acronyms kept as-is, positive-vs-negated risk findings never interchangeable.

## 8. Unmapped terms (with reasons)

1. **SI / HI abbreviations** — no established Spanish letter-abbreviations; write ideación suicida / ideación homicida in full.
2. **CBT-C abbreviation** — not established; write TCC para niños / TCC infantil.
3. **DEAR MAN / GIVE / FAST / TIPP / STOP / PLEASE / ACCEPTS** — kept in English in Spanish DBT practice; gloss in Spanish on first use.
4. **nil (placeholder)** — no Spanish charting equivalent; use ninguno/ninguna.
5. **Markdown markers** — notation, identical in Spanish; detect with the same patterns.

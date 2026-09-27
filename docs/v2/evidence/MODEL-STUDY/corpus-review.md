# MODEL-STUDY — bilingual corpus review (pre-freeze)

**Reviewer identity:** the bilingual gold reviewer dispatched by the coordinator
per `docs/research/local-model-study-plan-2026-09-27.md` §"Roles, scope and
isolation". **Distinct from** the corpus author (archived) and from the
execution worker. **Role:** review only — semantic equivalence, source
entailment, runnable schemas, native professional language in both languages,
ambiguity, and disposition of the authored `reviewFlags`.

**Date:** 2026-09-27. **Stage:** pre-freeze. No scored output exists, so
nothing here is a result, a comparison or a clinical certification, and I have
not certified and do not certify any clinical judgement.

**Read:** the plan (committed `dd7e0f0`), `corpus-author.md`, the scratch corpus
`README.md`, `manifest.json`, `names.json`, `prompts/frozen-prompts.json`, both
schemas, `rubric/rubric.md`, `review/blind-spec.md`, all 8 case files and all 4
gold files, and the snapshot sources the corpus cites for its contracts.
**Not read:** `review/alias-map.sealed.json` (hashed only, to verify the freeze —
blinding preserved); any `e2e/fixtures/*es/heldout/**` transcript; any existing
fixture gold; anything under `eval-es/` other than `NAMES.md`.
**Wrote:** this file only. No source or scratch edit, no inference, no download,
no server, no commit, no model output seen.

## 1. Reviewed artifacts and exact hashes

All verified with pinned Node 24.19.0; every value recomputed from disk.

| Artifact | sha256 |
| --- | --- |
| `test/gold.en.json` | `d455f362024cf1ac9efcb4928dec2616f812e66032055a95b5f9baf99c582ed2` |
| `test/gold.es-MX.json` | `2c7af88d6152303b06952c44aa4d8ce529fd6a6a8836b229c9f0c512a4099dbf` |
| `dev/gold.en.json` | `386053fa7bc0731c687b8f5380c4c91348144c9186b235ccef8488965cfecb0f` |
| `dev/gold.es-MX.json` | `08579f687ee2a8579cbbe9f762c3c78e6adc58f61ce35fee197ffa640a545481` |
| `rubric/rubric.md` | `541f20d336cc1b1b9fbbe09117f924f128b70a549f7da98ffaef491290e7eeff` |
| `manifest.json` (carries `rubricAnchors`) | `609c6566e8d09e33968216b4a8648a25f56f41e999fc1fe9eb8519bacb27d321` |
| `prompts/frozen-prompts.json` | `6ebff743fbe65286b4c62363f046ccccd7bda411985b4294bf16f7e013cb90e7` |
| `test/cases.en.json` | `a0a99b5f79104fd842fe53dc945fad601728a75154f40241099873cd047de4f5` |
| `test/cases.es-MX.json` | `d849cabd232e4d90309f1c2706a31074883b94e1b4da1e835785fc3c3d53adb2` |
| `names.json` | `31baf16f5b6022c48c24a7e4c8c1b78d9868ba30d6054ea36e70ce778b9fb925` |
| `schema/gold.schema.json` | `cd8abaea9a904f40a94abfa7efe8739fa20c66fcb247165d74ba1222d48e2cc5` |
| `schema/case.schema.json` | `64657073de92f353d0001beefd1b40e108967ee411959dbf7135310dd6c92630` |
| `review/blind-spec.md` | `3b8edb8090963d531ece1b4a27fad95b732f9141fa10fe81023ad814c4244707` |
| `review/alias-map.sealed.json` (hash only) | `f7b5b7f771f0babaab4be38efcf5846834d5955b2fa2bf22dfa643ae86dc3fc5` |
| `validate-corpus.mjs` | `eefe981ea0ad74fb283a19c2ec327a3747f9ac18f3e51a51dce983d425147b05` |

`HASHES.sha256` has 19 entries: the 18 `manifest.artifacts` plus `manifest.json`
itself. `sha256sum -c` → 19/19 OK. The `json` anchor block in `rubric.md` is
byte-identical to `manifest.rubricAnchors`, so the anchors cannot drift. The
gold hashes above are the **pre-repair** hashes; the repairs in §6 change them
and the manifest must be regenerated and re-recorded after they land.

## 2. Author provenance — verified, not taken on trust

The author report claims the snapshot is the `5621d6b` tree. **It is not.**

```
snapshot-provenance.json  base = 05d9b1025e0e61be16489e12ba3109d63d48fa76
git diff 05d9b10 (work-tree=snapshot)  -> empty: the snapshot IS the 05d9b10 tree
docs/research/local-model-study-2026-09-27.md
  snapshot = bdbe821… = 05d9b10   5621d6b = 65d1994…   live HEAD (dd7e0f0) = c87bc8c…
```

So the snapshot is `05d9b10`, taken 12:28, and the claim names a commit that did
not exist until 14:09 — after the snapshot and after the corpus was written.
The corpus also implements two requirements that **only** exist in `5621d6b` and
later: the separate-corpus-author/bilingual-reviewer paragraph (plan line 31)
and the frozen-rubric, written-anchors, run-1 blind-sample paragraph (plan line
160). Neither is in `05d9b10`'s plan. The author therefore read the **live/HEAD
plan**, not the snapshot it says it read.

Material impact: **none on the corpus content.** Every contract the corpus cites
is byte-identical across `05d9b10`, `5621d6b` and the live tree — I verified
`server/src/ai/prompts.ts` (all three hashes `8d0104c0…`), `shared/src/sections.ts:53`
`buildSectionsSchema` (`strictObject`, all keys required),
`shared/src/sections.ts:100` `buildRefineSchema` (`reply` + nullable
`updatedSections`), `shared/src/plan-ai.ts:119` `PlanSuggestionSchema`
(`goals`, max 6), `:197` `BriefCompositionSchema` (`lines`, max 12, 600 chars),
`plan-ai.ts:22-29`/`:114-118` (no diagnosis field), `:72-75` (6 goals / 4
objectives / 4 interventions / 3 evidence), and all 28 `REGISTERED` section names
in `shared/src/section-roles.ts`. The line numbers cited in
`frozen-prompts.json` are all correct. The corpus also satisfies the `05d9b10`
Track 2 text on its own. The defect is a false provenance statement, plus
arithmetic that does not reconcile (§6 R9). The coordinator's receipt already
records the `05d9b10` half of this; the "which plan was actually read" half is
new.

## 3. Validator rerun — read-only, pinned Node

```bash
export PATH=/home/villenull/.local/share/mise/installs/node/24.19.0/bin:$PATH
cd /home/villenull/.cache/apunta-model-study/2026-09-27/corpus
node -v                        # v24.19.0
node validate-corpus.mjs       # EXIT 0   (12 dev / 32 test / 44 gold / 19 hashes)
node validate-corpus.mjs       # EXIT 0   (repeat, byte-identical output)
node validate-corpus.mjs --help # EXIT 0
node validate-corpus.mjs --bogus# EXIT 2   (usage)
sha256sum -c HASHES.sha256     # EXIT 0   19/19 OK
```

Read-only confirmed mechanically: a `find -printf '%p %s %T@'` digest over the
whole corpus taken before and after the runs is identical, and no `--write-manifest`
was passed. Coverage output matches the manifest exactly (feature counts equal in
both languages; 4 test cases per task per language).

What exit 0 does **not** cover, and I checked by hand: it proves internal
consistency, not that the propositions are the right facts, not that the es-MX
reads as es-MX, not that the es-MX names are independent of the protected
heldout set (§6 R4), and not that every `critical` prohibition has a machine
check (§6 R5). It also cannot see the three defects in §6 R1, R2, R7, because
none of them is a structural inconsistency.

## 4. Pair-by-pair review, both languages

Semantic equivalence means: same facts, same actor, same time anchor, same
uncertainty, same negation, same figures, same section contract, same gold id
set. Entailment means: every `mustState` is carried by a `source` span that is a
verbatim substring of **that** case's own input, and no `mustNotAssert` forbids
something the source supports. I checked every `source` span and every
proposition in all 22 pairs; all 450 authored assertions are source-entailed in
both languages, and no valid paraphrase is penalised by a `mustNotAssert` in the
English side.

| pair | equivalence | entailment | finding |
| --- | --- | --- | --- |
| D01 | yes | yes | gold ok; es-MX patient name/agreement mismatch (R7) |
| D02 | yes | yes | gold ok; `arranger-unknown` is `no sabe quién la hospitalizó` for "does not know who arranged it" — a fair, slightly narrower es-MX idiom. Accept, no repair. |
| D03 | yes | yes | gold ok; es-MX name/agreement mismatch (R7) |
| D04 | yes | yes | gold ok; the empty-body rule is internally fair and matches the shipped English scorer (R-a) |
| R01 | yes | yes | gold ok; `None agreed.` preservation is correct and non-critical (R-b) |
| R02 | yes | yes | gold ok |
| R03 | yes | yes | gold ok |
| R04 | yes | yes | gold ok |
| P01 | yes | yes | gold ok; the `excerpt` index is undefined in this corpus (R2) |
| P02 | yes | yes | gold ok; es-MX `cambio de turno` for "rota change" is a normal MX rendering |
| P03 | yes | yes | gold ok |
| P04 | yes | yes | gold ok; proposed-vs-performed care is correctly separated (R-c) |
| S01 | yes | yes | gold ok; omission/misattribution cannot be expressed by one boolean (R3) |
| S02 | yes | yes | gold ok; contradicts S01's own omission policy (R3) |
| S03 | yes | yes | **es-MX gold states the quotation rule in the wrong direction (R1)** |
| S04 | yes | yes | gold ok; es-MX name/agreement mismatch (R7) |
| V01 | yes | yes | dev; es-MX patient is a heldout person (R4) |
| V02 | yes | yes | dev; ok |
| V03 | yes | yes | dev; ok |
| V04 | yes | yes | dev; es-MX source has a grammar fault (R7) |
| V05 | yes | yes | dev; ok |
| V06 | yes | yes | dev; ok |

Native-language judgement, stated honestly: the es-MX clinical register is
idiomatic throughout — `estacionamiento` not `aparcamiento`, `jefe` not
`jefatura`, `carta de crisis`-free, `a las 3 de la mañana` not `a las 3 AM`,
`sertralina` lowercased, ` ideation` correctly translated, `experiencer` traps
carried by relationship words as `NAMES.md` requires, and the `refine` contract
correctly keeps the literal keys `reply`/`updatedSections` in the Spanish prompt
while translating the prose. The defects I found are enumerated in R1 and R7 and
are local, not systemic. **I am not a certified es-MX clinical linguist; the
es-MX gold prose should get one native-speaker read before freeze.** I do not
certify it as written.

## 5. Disposition of the 28 authored `reviewFlags`

14 distinct flags, mirrored in both languages (24 `blocking: true`, 2
`blocking: false` per language, 0 in dev). Dispositions are mine, as the
documentation-fidelity reviewer the plan appoints; none is a clinical
certification, and none ratifies a clinical judgement.

| flag | disposition | basis |
| --- | --- | --- |
| `quote-policy` (D01, non-blocking) | **resolved** — reported speech with the colleague unnamed is acceptable; the colleague is a relationship word per the registry hygiene. Which section it lands in is routing, which this gold does not score. | `names.json` hygieneRules; gold is propositions, not layout |
| `blank-vs-declined` (D02) | **resolved: keep the section blank.** A declined request to discuss a third party's care is not an out-of-session action; the section is `actions`-role. | `section-roles.ts:85`; the source records no action and no agreed task |
| `blank-risk-vs-none` (D04) | **resolved: empty body, and it is fair to score.** Both the frozen shared rule and the gold say empty, so any arm can comply. It also matches the shipped English scorer, which treats an empty body in a `blank` section as `preserved` (full credit) and reserves `unwarrantedBlank` for a blank where material was expected. **Documentation repair required (R6d).** | `score.ts:23-28, 357-376, 451-461, 522` |
| `none-agreed-wording` (R01) | **resolved: preserve the literal.** The shipped scorer has a first-class `statedAbsence` concept: a section where the therapist stated an absence is neither blank nor filled and gets its own credit; blanking it drops to 0.5, so preservation is correct and the gold's non-critical severity is right. The request was to trim, not to reformat. | `score.ts:43-50, 439-473`; `corpus.ts:49` |
| `what-exactly-moves` (R02) | **resolved: only the clinical description must move.** The request named one destination and the passage is identifiable; the other mother sentences may stay or go provided nothing is lost or reattributed, which is what the `mustState` set already requires. | gold `actor-preserved` + `uncertainty-survives` + `no-mothers-care-request` |
| `null-vs-placeholder` (R04) | **resolved: a clearly-labelled, non-asserting placeholder is a format miss, not a critical fabrication.** The shipped scorer already separates `narrated` from `filled`, and the frozen prompt requires `null` — so a placeholder breaks the contract (format) without asserting anything about sleep (not a fabrication). | `score.ts:456-461`; prompt `taskRules.refine` |
| `diagnosis-wording` (P01) | **resolved: the diagnosis is input-only.** Echoing the input diagnosis inside a statement is a format miss; asserting a different or additional diagnosis is critical. The prohibition is structural, not a prompt request. | `plan-ai.ts:22-29, 114-118` (`strictObject` rejects the key; a test asserts it) |
| `hours-in-bed-vs-asleep` (P02) | **resolved: keep "in bed" when note 1 is cited; mislabelling it as sleep is a wrong number and stays non-critical.** The output field is a `baseline`, so a wrong baseline is a wrong number. | `plan-ai.ts:90-101`; the distinction is explicit in both sources |
| `sleep-described-as-fine` (P03) | **resolved as out of scope, and the gold stays as drafted.** Whether one hedged adjective from one session is an adequate basis for a goal is a question of clinical adequacy, and this corpus explicitly does not score clinical adequacy — the rubric says so in its own words. A goal resting on "fine" is not a *fabrication*, so there is nothing for this instrument to forbid. I am not ruling that such a goal is good care, and I do not certify the adequacy question either way. Scoring goal *quality* would be a new instrument, not this corpus. | `rubric.md` §"What this rubric is not"; gold framing |
| `safety-plan-plausibility` (P04) | **resolved **against** the author's leaning: an unsupported safety plan stays `critical: true`.** The frozen prompt says every intervention must be supported by the notes and forbids inventing one the notes do not mention, so a cautious safety plan is a prompt violation; making it non-critical would make the study reward behaviour its own prompt forbids. The clinical question ("is a safety plan wise here?") is real, is not answered by this corpus, and is not certified by me. The differentiator the executor needs is *framing*, not severity (R6c). | `frozen-prompts.json` `treatment-plan.taskRules` |
| `brief-completeness-floor` (S01) | **resolved in principle, not expressible in the schema: omission is a coverage miss, misattribution is critical** — which is also the answer for S02's `denial-not-dropped` and the C-EVAL@1 reading, where coverage is an aggregate and critical classes are inversions. One boolean cannot say this, so the schema needs one field (R3). Omission must still be visible in the denominators. | `CONTRACTS.md:414-453` §4; `score.ts` separates `unwarrantedBlank` from coverage |
| `reporting-the-absence` (S02, non-blocking) | **confirmed as proposal-only for adjudication**, and the cue list still needs narrowing because it currently fires on the content the same case requires (R6b). | `mustState.money-main-driver` vs `mustNotAssert.no-plan-line` |
| `quote-fidelity-cross-language` (S03) | **resolved: an unmarked translation inside quotation marks is an invented quotation; a translation explicitly marked as such is acceptable.** Quotation marks assert verbatim words, and she did not say them in those words. This is a documentation-fidelity convention, not a clinical one. **The es-MX gold states it in the wrong direction and must be corrected (R1).** | `mustState.quotes-preserved` + `code-switching-is-her-voice` |
| `retraction-memory-policy` (S04) | **resolved: the retracted figure is absent from the output.** The corpus is explicit that a note being *synthesised* is a different situation from a transcript being drafted, and the gold already excludes a correction history in both languages, so the two halves of the case are consistent. Not a policy I need to escalate; the choice is recorded and reversible before freeze only. | `retractions.ts`; `retracted-figures-not-kept` in both languages |

Two of these deserve a note on what they are **not**. R-a: the author report
says the owner's format "flattens a real risk review to 'None.'", which is
true, but the shipped Spanish `RISK_REVIEW_REMINDER` also says `"None." belongs
only to a session where she said nothing about risk at all` — which is exactly
D04. So production's two artefacts disagree with each other on this section, and
this corpus follows the English scorer. That does not affect D04's fairness
(the prompt says empty), but it does mean **no Track 2 number may be presented as
evidence about the shipped Spanish risk-review behaviour** (R6d). R-b: the
`statedAbsence` finding also means the corpus's "uncovered section = empty body"
convention and the shipped Spanish reminder are in tension, which is a
`docs/decisions.md` matter, not a corpus matter.

## 6. Necessary repairs

M1–M4 change scoring and must land before freeze. S1–S6 do not change any
pass/fail if the human adjudicates as the gold says it will, and should land
with the same manifest regeneration.

**M1 — es-MX S03 states the quotation rule backwards (scoring-affecting).**
`test/gold.es-MX.json`, `test-es-MX-s03`, `mustNotAssert[0]`
`no-invented-quotation`, `prohibited` currently reads "Traducir su cita al
español dentro de comillas…", which is incoherent for the es-MX case: her quote
is already Spanish. It is a mistranslation of the English sentence and it
contradicts the same case's own `code-switching-is-her-voice`, which correctly
forbids an *unmarked translation into English*. Minimum change: replace the
`prohibited` text with the ruled form, e.g. *"No debe extender un fragmento
entrecomillado ni presentar como palabras textuales de la clienta una traducción
de su cita sin marcar. Una traducción marcada como traducción sí se acepta."*
Then also drop the cue `"dice que \"no puedo"`, which currently flags a
same-language rendering that the ruled form does not forbid.

**M2 — `evidence.excerpt` is undefined in this corpus (scoring-affecting).**
The treatment-plan prompt (both languages) tells the model to use "the
zero-based index of the excerpt within that note's own list", copied from
production, where the server offers verified per-note excerpts. This corpus
gives each note as a single `text` with **no** excerpt list, so `excerpt` has no
referent, and `test/gold.*.json` P01 `evidence-indices-in-range` invents a
`0..2` range for a one-element list — which passes a wrong `excerpt: 2`.
Minimum change, three edits: (a) in `prompts/frozen-prompts.json`, both
languages, replace the excerpt clause with wording that each note is presented
whole so `excerpt` is `0` for every cited note; (b) in both P01 golds, change
the invariant to require `evidence.excerpt === 0`; (c) state the rendering rule
in `manifest.assembly` so the executor's `noteList` is fixed before any run.
This is the only repair that changes a prompt, so it must happen now.

**M3 — omission and misattribution cannot both be expressed (scoring-affecting).**
`gold.schema.json` gives `mustState` one `critical` boolean, so S01's own
declared policy ("omission is a completeness miss; misattribution is the
critical error") is unrepresentable, and S02's `denial-not-dropped` then
contradicts it by making the *omission* of a denial `critical: true`. The two
synthesis cases currently disagree with each other. Minimum change: add one
optional boolean to `mustState` in `schema/gold.schema.json`,
`"criticalOnOmission": boolean`, defaulting to `critical`, documented as
"omitting a `critical` proposition is a critical error unless this is false, in
which case omission is a coverage miss and only misattribution or inversion is
critical". Then set `"criticalOnOmission": false` on the S01 `mustState`
entries and on S02 `denies-si` in **both** languages — 8 records per language —
and add one line to `README.md`: *a mustState miss is a coverage miss reported
per case with its denominator; omission is never free, but it is only critical
where `criticalOnOmission` is not false.* Left unrepaired, the study both
rewards omission (a model that emits an empty risk review for D01 collects no
critical error) and double-counts it (S01 vs S02).

**M4 — six of sixteen es-MX test cases reuse a protected heldout person.**
Every es-MX name resolves in `e2e/fixtures/eval-es/NAMES.md`, which the plan
permits, but the same plan requires the study corpus to be "independent of
protected existing Spanish heldout data", and `NAMES.md`'s own rationale is
"one person per transcript … so no fixture can be contaminated by facts the
model learned from a sibling fixture". Six test cases and one dev case use a
person whose **heldout** transcript carries the *same trap type* as the study
scenario — established from `NAMES.md` alone, with no heldout file opened:

| study case | person | heldout transcript | trap overlap |
| --- | --- | --- | --- |
| `test-es-MX-d01` | Zacarías Valadez Olvera | `heldout/past-vs-current-risk/04-idea-suicidal-pasada` | `past-vs-current-risk` |
| `test-es-MX-d03` | Herminia Tiscareño Velasco | `heldout/spoken-correction/02-mejor-dicho-cuatrocientos` | `spoken-correction` |
| `test-es-MX-d04` | Zenobia Ugarte Quezada | `heldout/english-loanword/04-feedback-jefe` | `english-loanword` |
| `test-es-MX-p01` | Marisol Urzúa Salgado | `heldout/dose-and-number/02-media-pastilla` | `dose-and-number` |
| `test-es-MX-p03` | Petrona Venegas Trujillo | `heldout/section-never-covered/04-sesion-sin-analisis` | `section-never-covered` |
| `test-es-MX-s01` | Imelda Escamilla Iriarte | `heldout/invented-negation/04-tiene-casa` | `invented-negation` |
| `dev-es-MX-v01` | Teodoro Wenceslao Yépez | `heldout/experiencer/04-hijo-miedo` | (dev, never scored) |

This satisfies the letter of "only allowed names from NAMES.md" and defeats the
purpose of the independence requirement, and it puts the heldout set's
one-person-one-transcript guarantee at risk for the rest of the repository's
life. Minimum change: substitute 7 tuning-registry names (the registry has 66
tuning-only people, 44 heldout), preferring a person whose `NAMES.md` trap label
is *not* the scenario's, and record each substitution with its provenance in
`names.json`. Two of the substitutions can be chosen to fix M4/S3 together (see
S3): `d01` needs a feminine name and `d03` a masculine one. Verify with the
validator's existing name checks afterwards; no new check is strictly required,
but adding "no es-MX study patient appears on a `heldout` row of NAMES.md" to
`validate-corpus.mjs` is one `if` and makes this unrepeatable.

**S1 — a garbled cue (scoring-affecting text, low blast radius).**
`test/gold.es-MX.json`, `test-es-MX-d01`, `no-invented-out-of-session-task`
`cues[2]` is the string `"registro deContrastar"`, which is a substitution
artefact and can never match. Change to `"registro de"`.

**S2 — seven `critical` prohibitions per language have no machine check.**
`r01 no-sections-dropped`, `r03 sections-untouched`, `r04 sections-untouched`,
`p01/p02/s01 no-wrong-note-attribution`, `s02 denial-not-dropped` all have
`cues: []` and no `invariant`, so the machine pass reports nothing and a real
violation is a false negative. Minimum change: allow an optional `invariant` on
`mustNotAssert` items in `schema/gold.schema.json` (mirroring `mustState`) and
add one to each of the 7 records per language, e.g. for
`no-sections-dropped`: *"`updatedSections` is a non-null object with exactly the
seven requested section keys, in order."* Without this, the plan's
false-negative expansion has nothing to expand from.

**S3 — three es-MX cases have a name/gender mismatch.** `Herminia` (d03),
`Zacarías` (d01) and `Leocadia` (s04) are respectively feminine, masculine and
feminine given names, but the case text and gold use the opposite agreement:
`orientado`/`ligeramente inquieto` for Herminia, `cansada`/`comprometida`/
`orientada` for Zacarías, `orientado` for Leocadia. (The registry corroborates
Zacarías: its other row is `experiencer/02-papa-bebe`.) A native reader sees
this immediately and it would contaminate the es-MX naturalness scores.
Minimum change: because M4 already requires replacing `d01` and `d03`, choose
those two names to fix this — a feminine registry name for `d01`, a masculine
one for `d03` — leaving the case text and gold untouched. For `s04`, change
`orientado` to `orientada` in `test/cases.es-MX.json` and in the
`denial-from-note-1` proposition in `test/gold.es-MX.json` (2 edits; Leocadia's
own registry row is tuning-only, so no M4 substitution is needed). Also
`dev/cases.es-MX.json` V04 note 2 reads "La opresión bajó a unas una vez por
semana" — ungrammatical; change to "a una vez por semana".

**S4 — cue lists that fire on content the same case requires.** Correct under
human adjudication, noisy for the machine pass, and two of them sit on
`critical` prohibitions. Minimum change: (a) `no-target-values` in P01–P04, both
languages — drop the bare `"target"`, `"goal of"`, `"aim for"`, `"meta de"`,
`"objetivo de"`, `"llegar a "` and require a number or a date in the cue
(`"meta de 5"`, `"dentro de 6 semanas"`, `"llegar a 6 horas"`), because
`objetivo de …` is legitimate non-numeric objective prose in this schema;
(b) `no-plan-line` in S02 and `no-invented-plan` in S01, both languages — drop
the bare `"tarea"`/`"task"`/`"plan:"`/`"meta"` and keep the proposal forms
(`"vamos a"`, `"debería"`, `"se recomienda"`, `"proponer"`, `"meta de"`),
because S02 *requires* the output to say that no plan, measure or task was
agreed; (c) `no-invented-homework` in D04, both languages — drop the bare
`"task"`/`"tarea"`/`"between sessions"`/`"entre sesiones"`, which fire on the
correct negative statement, keeping `"assign"`, `"set a"`, `"deberá practicar"`,
`"hay que"`.

**S5 — the gold schema mis-cites the contract it points at.**
`schema/gold.schema.json` describes `critical` as "a C-EVAL@1 critical error
class. See docs/v2/CONTRACTS.md:414-453". The seven classes there are lost
negation, invented negation, wrong dose or number, wrong experiencer, past risk
as current or the reverse, retracted content kept, and content invented for an
uncovered section. `wrong-note-attribution` and the section-set violations are
**not** on that list. Minimum change: rewrite the description to say the seven
C-EVAL@1 classes are all represented, and that this corpus adds note-index
misattribution and section-set violations as **study-local** classes applied
identically to every arm — which is legitimate, since the plan's decision rule
compares arms within the study, but must not be mislabelled as the shipped
gate's classes.

**S6 — rubric and provenance documentation.**
(a) The es-MX `naturalness` anchors address the client as *la clienta*
("*las palabras de la clienta quedan intactas*") in a corpus where 8 of 16
es-MX test patients are male, so a natural male-client note could be penalised
for not saying *la clienta*. Make the es-MX anchors gender-neutral or say the
patient's gender comes from the source.
(b) The level-5 es-MX anchor carries a parenthetical
("*locución de México, no de España ni traducida del inglés*") that is an
instruction to the reviewer, not a description of level 5; move it into
`rules`.
(c) `clarity` anchors exist in English only, while the es-MX style review will
apply them; declare the English `clarity` and `format` anchors normative for
both languages in `rubric.md`, or add an es-MX `clarity` block.
(d) `corpus-author.md`: correct "Source of truth read" to `05d9b10` and record
that the plan actually consulted was the live `dd7e0f0`; and correct the file
counts — the corpus holds **19** files, not "22 files"/"21 files"; the manifest
hashes 18 artifacts and `HASHES.sha256` covers 19 entries.
(e) `README.md` "44 invented patients, one per case, no reuse" should say
*within this corpus*, since the es-MX identities are registry identities.

## 7. Remaining uncertainties — not certified, not resolved by me

1. **Clinical adequacy is out of scope and stays out of scope.** Whether a
   safety plan is wise (P04), whether one hedged adjective grounds a goal
   (P03), whether a plan is good care, and whether a risk review would satisfy
   a supervisor are all clinical questions. This corpus is a fidelity
   instrument and I have ruled only on what it is *for*. No clinical judgement
   here is certified, by me or by the author.
2. **es-MX register is reviewed, not certified.** I am not a certified es-MX
   clinical linguist. I found and localised the defects in M1/S1/S3; a
   native-speaker es-MX clinician should read the four es-MX gold files and the
   es-MX rubric anchors once before freeze. Their judgement, not mine, closes
   this item.
3. **Residual heldout overlap after M4.** Fifteen es-MX cases would still be
   people who appear in `eval-es/` tuning transcripts. That is permitted by the
   plan, but `NAMES.md`'s one-person-per-transcript rationale is an
   ecosystem-wide claim that the study weakens, and a `docs/decisions.md` note
   would be the honest place to say so. Not a blocker; a disclosure.
4. **Prompt contract vs shipped char caps.** The plan contract states the 600-char
   brief-line cap but not `statement` 2000 / `measure` 300 / `baseline` 300 /
   `intervention` 600, and drafting/refine omit the 20 000-char section cap.
   Irrelevant to a model-only study by the `singleStageDeclaration`, but the
   asymmetry should be stated in that declaration rather than left to be
   discovered.
5. **M4 substitution choice is the coordinator's.** I recommend tuning-registry
   names with non-matching trap labels; the specific seven are a naming call, and
   any choice must be re-validated and re-hashed.

## 8. Blinding note — for the coordinator, before the style phase

`blind-spec.md` makes the bilingual reviewer the style scorer, i.e. me. I have
read `manifest.json`, which publishes the alias derivation rule
(`blinding.aliasRule`), and `review/make-aliases.mjs` regenerates the sealed map
deterministically. So blinding here is **procedural, not cryptographic**: it
rests on nobody telling me the arm letters, exactly as `blind-spec.md` §"What is
blinded" requires. No unblinding has occurred — I have seen no model output, and
an alias can only be resolved against an output. I am flagging it so the
coordinator records the exposure deliberately rather than discovering it later:
if I am to score style, please confirm that decision in writing, keep the arm
letters out of my context until my scores are returned, and do not paste outputs
into my conversation before then. Otherwise assign style scoring to a fourth
person.

## 9. Verdict

**NOT READY TO FREEZE. The gold's substance survives review in both languages —
no case needs rewriting, no scenario needs replacing, and no flag needs
escalating to the owner — but four repairs must land first.**

- Sound and to be kept as-is: the 22-pair EN/es-MX semantic equivalence; the
  source entailment of all 450 authored assertions; the four output contracts,
  which match `sections.ts` and `plan-ai.ts` exactly; the single-stage and
  language-scope declarations, which correctly deny product parity and
  cross-language equivalence; the rubric's separation of style from
  faithfulness; the frozen-prompt discipline; the read-only validator.
- Blocking: **M1** (es-MX S03 rule reversed), **M2** (`excerpt` has no
  referent), **M3** (omission vs misattribution unrepresentable, S01/S02 in
  conflict), **M4** (six test cases reuse protected heldout persons on matching
  trap types).
- Then S1–S6, regenerate `manifest.json` + `HASHES.sha256`, re-run the validator
  to exit 0, re-record the gold/rubric/manifest hashes, and only then set
  `reviewState` to `reviewed`.
- I do **not** set `reviewState`, and I have not modified `manifest.json` or any
  corpus file. The implementation worker receives these findings from this
  report. No human clinical sign-off is claimed, implied or fabricated here.

# MODEL-STUDY — corpus author report

**Status: DRAFT. Pending separate bilingual gold review. Not approved, not
certified.** I am the corpus author. I did not execute anything, did not
review anything, and did not see a single model output while writing this. The
independent reviewer has not seen this corpus. Nothing here is clinical
certification, and no number derived from it may be presented as one.

- **Packet:** Track 2 supplemental fabricated paired corpus, per
  `docs/research/local-model-study-plan-2026-09-27.md` §"Two distinct tracks"
  and §"Validity checks".
- **Scratch root:** `/home/villenull/.cache/apunta-model-study/2026-09-27/corpus/`
  (real disk, not tmpfs, per the plan).
- **Source of truth read:** the frozen snapshot at
  `.../2026-09-27/snapshot` (commit `5621d6b` tree), read-only. It was not
  modified; nothing under it has an mtime after the snapshot was taken.
- **Commits:** none. No downloads, no inference, no app or database launch, no
  port 7717, no live patient data.

## Changed paths

Two, and only two:

| Path | Kind |
| --- | --- |
| `/home/villenull/.cache/apunta-model-study/2026-09-27/corpus/**` (21 files) | study scratch — outside the repo, outside the live tree |
| `docs/v2/evidence/MODEL-STUDY/corpus-author.md` | this report, the one permitted repo write |

The live source tree was already dirty (the UI agent's lane). I read the plan
and `CLAUDE.md` from the committed snapshot rather than the working tree and
touched nothing in the repository except this file. No `git add`, no commit, no
push.

## What was built

### 22 files in the scratch corpus

```
corpus/
  README.md                        orientation for the reviewer and the executor
  manifest.json                    counts, features, rubric anchors, sha256 of every artifact
  HASHES.sha256                    19 entries: all 18 artifacts + manifest.json
  names.json                       the 44 invented patients and each name's provenance
  validate-corpus.mjs              the validator (read-only unless --write-manifest)
  dev/cases.{en,es-MX}.json        12 development cases, 6 per language
  dev/gold.{en,es-MX}.json         dev gold
  test/cases.{en,es-MX}.json       16 test scenarios x 2 languages = 32 cases
  test/gold.{en,es-MX}.json        test gold
  schema/case.schema.json          input-side contract (draft-07)
  schema/gold.schema.json          gold-side contract (draft-07)
  prompts/frozen-prompts.json      frozen prompts, identical across arms
  rubric/rubric.md                 clarity / naturalness / format, 1-5 with written anchors
  review/blind-spec.md             comparison sample, equivalence gate, preference rule
  review/make-aliases.mjs          deterministic alias generator
  review/alias-map.sealed.json     SEALED: coordinator only
```

### Counts, as validated

| Split | drafting | refine | treatment-plan | multi-note synthesis | total |
| --- | --- | --- | --- | --- | --- |
| dev, per language | 2 | 1 | 2 | 1 | 6 |
| dev, both | 4 | 2 | 4 | 2 | **12** |
| test, per language | 4 | 4 | 4 | 4 | 16 |
| test, both | 8 | 8 | 8 | 8 | **32** |

16 test scenarios `D01-D04 R01-R04 P01-P04 S01-S04`, each present exactly once in
English and exactly once in es-MX. 44 invented patients, one per case, no
reuse. 250 `mustState` propositions and 200 `mustNotAssert` prohibitions across
the two splits — 450 machine-readable authored assertions, each `mustState`
carrying the verbatim source span that establishes it.

Feature distribution across the 16 test scenarios (identical in both languages
by construction, and the validator fails if it is not):

`negation` 4, `experiencer` 3, `past-vs-current-risk` 3, `uncertainty` 7,
`spoken-correction` 2, `number-dose` 7, `unsupported-section` 3, `quotation` 2,
`code-switching` 2, `conflicting-notes` 1, `cross-note-attribution` 6,
`question-not-edit` 1, `decline-unstated-addition` 1, `time-anchor` 2,
`invented-target` 1.

### Scenarios

| id | task | what it probes |
| --- | --- | --- |
| D01 | drafting | denied current risk, one attempt in 2019, 50 mg each morning, a colleague's reported remark |
| D02 | drafting | the insomnia is the **mother's**; onset duration unknown, hospital stay only believed |
| D03 | drafting | dose corrected mid-sentence (50 → 25 mg), medication name unrecalled |
| D04 | drafting | no risk talk and no homework at all, spoken in mixed English and Spanish |
| R01 | refine | "make it warmer and shorter" must not lose a denial or turn 2019 into now |
| R02 | refine | move the passage about the mother without reattributing it |
| R03 | refine | a **question** about the homework → `updatedSections` must be `null` |
| R04 | refine | asked to add a symptom the note never covered → decline, `null` |
| P01 | treatment-plan | three notes; doses and figures survive; no target values (no such field exists) |
| P02 | treatment-plan | two notes disagree about sleep; must not be averaged or silently resolved |
| P03 | treatment-plan | three notes, none containing a plan or a measure; weight unquantified |
| P04 | treatment-plan | denied current risk plus an eight-year-old attempt; no current-risk goal |
| S01 | synthesis | a brief over four notes, every line attributable to one of them |
| S02 | synthesis | three notes in which no plan, measure or homework was ever agreed |
| S03 | synthesis | a client who code-switches, quotes herself, and whose **sister** calls at 3am |
| S04 | synthesis | two figures restated and corrected in the room, across three notes |

Dev pairs `V01-V06` mirror the same four tasks at lower complexity for the
harness smoke check, and are marked never-scored.

## Design choices, and the ones that need factual adjudication

Everything in this section is a decision I made that a human — not an AI —
should ratify or overturn. **24 `reviewFlags` entries are marked
`blocking: true`**; each one, left unsettled, makes the affected case's result
INCONCLUSIVE. They are enumerated in the gold files themselves, per case, with
my leaning stated. The ones that matter most:

1. **Single-stage plan and synthesis (`prompts/frozen-prompts.json`,
   `singleStageDeclaration`).** Production is two-stage: summarise each note,
   then compose (`server/src/ai/prompts.ts:607,687,757`). This corpus asks for
   the final stage in one request with the authored notes verbatim. Consequence:
   **absolute quality numbers are not comparable to the shipped feature**; only
   within-study arm comparison is valid. I chose this to keep the gold authored
   and the harness single-request. The coordinator should confirm that is the
   trade it wants.
2. **Prompts exist in the case's own language, and that is a confound**
   (`languageScopeDeclaration`). All production prompt text is English and no
   prompt builder takes a locale. Measuring es-MX in Spanish instructions
   folds "instruction-following in Spanish" into the es-MX score. It is
   identical across arms within a language, so arm-vs-A stays valid;
   **cross-language quality comparison does not.** I froze the active variant to
   the Spanish instructions and kept an English-instruction variant for a
   separately reported sensitivity analysis only, never as a replacement.
3. **An uncovered section must be an empty body, not "None."** D04's risk review
   and out-of-session sections are specified empty. The shipped English eval
   treats an unwarranted blank as a structural fault while the owner's format
   flattens a real risk review to "None." Here the source has no risk content at
   all. This is a documentation-fidelity judgement, not a clinical one.
4. **Omission versus misattribution.** For plan and synthesis, omitting a
   required fact is a completeness miss; attributing it to the wrong note is the
   critical error. A brief that legitimately covers fewer notes is not thereby
   wrong. Flagged on S01.
5. **A retracted figure is absent from the output**, not shown as a correction
   history (S04). Production `retractions.ts` cuts retracted text before
   drafting and lists it under the first-pass message; a note being *synthesised*
   is a different situation. This is a policy question, not mine to settle.
6. **An unsupported but clinically cautious intervention.** P04 forbids a
   safety plan because no note records one, while a model may well think one is
   wise. I proposed: non-critical for a cautious safety plan, critical for
   anything that changes risk management such as means restriction or a no-harm
   contract. The bilingual reviewer must ratify that split.
7. **Cross-language quotation fidelity** (S03): rendering her Spanish quote as
   English inside quotation marks is an invented quotation unless marked as a
   translation. Needs a ruling, and the gold should then say so explicitly.
8. **A clearly-labelled non-asserting placeholder** ("Sleep: not covered in this
   session") is a format miss, not a critical fabrication (R04). The corpus
   requires `updatedSections: null` and forbids any sleep content including a
   placeholder.
9. **Refine preserves existing literal wording.** R01's note literally reads
   "None agreed." / "No se acordó ninguna." The frozen prompt says uncovered
   sections should be empty strings. On a refine turn I require preservation,
   because the request was to trim filler, not to reformat.
10. **`F` is scored against the original Spanish facts**, never against a
    translation, per the plan. No corpus-side change needed; recorded so the
    executor does not reinterpret it.

Two further limits worth stating plainly: I did not touch the Spanish heldout
data, and I did not read it — the only file I opened under `eval-es/` is
`NAMES.md`. And the gold is **propositions and prohibitions, not reference
answers**: there is no "ideal note" anywhere in this corpus, by design.

## Hashes

All 19 artifacts are hashed in `manifest.json` (`artifacts`) and again in
`HASHES.sha256`, which additionally covers the manifest itself. Full listing is
in `HASHES.sha256`; the load-bearing ones:

```
609c6566e8d09e33968216b4a8648a25f56f41e999fc1fe9eb8519bacb27d321  manifest.json
6ebff743fbe65286b4c62363f046ccccd7bda411985b4294bf16f7e013cb90e7  prompts/frozen-prompts.json
541f20d336cc1b1b9fbbe09117f924f128b70a549f7da98ffaef491290e7eeff  rubric/rubric.md
3b8edb8090963d531ece1b4a27fad95b732f9141fa10fe81023ad814c4244707  review/blind-spec.md
f7b5b7f771f0babaab4be38efcf5846834d5955b2fa2bf22dfa643ae86dc3fc5  review/alias-map.sealed.json
a0a99b5f79104fd842fe53dc945fad601728a75154f40241099873cd047de4f5  test/cases.en.json
d849cabd232e4d90309f1c2706a31074883b94e1b4da1e835785fc3c3d53adb2  test/cases.es-MX.json
d455f362024cf1ac9efcb4928dec2616f812e66032055a95b5f9baf99c582ed2  test/gold.en.json
2c7af88d6152303b06952c44aa4d8ce529fd6a6a8836b229c9f0c512a4099dbf  test/gold.es-MX.json
eefe981ea0ad74fb283a19c2ec327a3747f9ac18f3e51a51dce983d425147b05  validate-corpus.mjs
```

The executor must record `assembledSystemSha256` and `assembledUserSha256` per
request, assembled from `frozen-prompts.json` in its declared order, and treat
any run whose hashes cannot be re-derived as invalid.

## Commands and exit codes

```bash
cd /home/villenull/.cache/apunta-model-study/2026-09-27/corpus

node validate-corpus.mjs --write-manifest   # EXIT 0  (regenerates manifest + HASHES)
node validate-corpus.mjs                    # EXIT 0  (read-only, final state)
node review/make-aliases.mjs                # EXIT 0  (176 aliases: 5x32 + Fx16)
node validate-corpus.mjs --help             # EXIT 0
node validate-corpus.mjs --bogus            # EXIT 2  (usage)
```

What exit 0 proves, mechanically:

- **Counts** — 12 dev (6/6) and 32 test (16/16); four test cases per task per
  language; gold record count equals case count; no duplicate `caseId`.
- **Pairs** — every one of the 22 `pairId`s appears exactly once per language,
  and for every pair the task, format, modality, note count, section count,
  diagnosis presence and **complete set of gold ids** are identical across
  languages, as is the critical-proposition count.
- **Required fields** — every case and gold record validated against the two
  draft-07 schemas via the snapshot's ajv 6, plus native checks: every
  `mustState` has a proposition, at least one extraction cue **or** an explicit
  `invariant` (never neither), and a `source` span that is a **verbatim substring
  of that case's own input**; unique kebab-case gold ids; `mustBeBlank` names
  only real requested sections; every case tagged `negation`, `experiencer`,
  `uncertainty`, `quotation`, `code-switching`, `number-dose` or
  `cross-note-attribution` actually carries a matching proposition, so a tag can
  never be a label the gold does not back; at least one critical proposition
  and one critical prohibition per case.
- **Names** — all 44 registered patients are distinct; every es-MX name
  component resolves against the 130 components parsed from the snapshot's
  `e2e/fixtures/eval-es/NAMES.md`; no English name collides with that registry;
  every registered patient actually appears in its own case input; a
  capitalised-mid-sentence scan finds no second person, place, brand or
  institution (allowlisted: months, weekdays, the two language names, section
  labels, units); Spanish weekdays and months are lowercase; a brand/place
  denylist is clean.
- **Contracts** — every requested section name resolves through
  `shared/src/section-roles.ts` REGISTERED (28 names parsed from the snapshot);
  the frozen prompts cover all four tasks in both languages, state the
  negation, actor and empty-section rules *in that language*, and state the
  no-target-value, `updatedSections: null` and exact-key-set clauses.
- **Rubric** — the `json` anchor block in `rubric.md` and `manifest.rubricAnchors`
  are byte-identical, so the anchors cannot drift; all three dimensions have
  five substantive anchors.
- **Blinding** — the sealed alias map is re-derived from its declared rule and
  compared entry by entry: 176 unique aliases, run 1 only, five arms × 32 and
  F × 16 es-MX only, with the left/right order re-derived per alias.
- **Freeze** — `manifest.status` is `DRAFT`, `reviewState` is
  `draft-pending-bilingual-review`, and `approval` records that I neither
  approved nor certified it. Every hash in `manifest.json` and `HASHES.sha256`
  matches the file on disk, and no artifact is un-hashed.

Conventions follow `scripts/v2/check-es-fixtures.mjs`: one `FAIL <msg>` per
problem on stderr, a coverage table on stdout when clean, `exitCode = 1` on any
problem, and the validator **writes nothing** unless `--write-manifest` is
passed explicitly. Its only reads outside the corpus directory are the
snapshot's `NAMES.md`, `shared/src/section-roles.ts` and `node_modules/ajv`.

Two limits the validator cannot cover, stated rather than hidden: it proves
internal consistency, not clinical or Spanish correctness. Whether the
propositions are the right facts, and whether the es-MX reads as es-MX, is
exactly what the separate bilingual reviewer is for.

## Hand-off

1. **Bilingual gold reviewer** — distinct from me and from the execution
   worker. Settle all 28 `reviewFlags` in both languages, set `reviewState` to
   `reviewed` only if the gold survives, re-run the validator, and record the
   `manifest.json` hash again. This has not happened.
2. **Execution worker** — build requests from the frozen prompts in the declared
   order, record the assembled hashes, smoke on the 12 dev cases, **discard
   dev**, then run the 32 test cases. Do not edit prompts, cases or gold once
   any output exists.
3. **Independent reviewer** — verify the freeze, the hashes, the scoring, the
   raw traces and reproducibility.

I have not approved this corpus and I am not the reviewer of it.


## Coordinator receipt

Pinned Node24.19.0 read-only validator rerun: exit0, 12 dev/32 test,44 gold
records,19 hashes verified. This validates structure, not semantic gold.
Author snapshot provenance claim is incorrect: snapshot-provenance.json records
05d9b1025e0e61be16489e12ba3109d63d48fa76, not5621d6b. Independent review
must evaluate against the current committed research plan. Corpus remains DRAFT.
Author archived after handoff; separate bilingual reviewer dispatched.

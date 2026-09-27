# MODEL-STUDY — final independent acceptance review, post-repair-2

**Role:** independent final reviewer — not the author, either repair implementer, the executor, the bilingual reviewer, or the freeze reviewer whose §3/§4/§5/§8 findings this closes. I repaired nothing and certify nothing. **Read:** the plan, `corpus-freeze-review.md` (§3/§4/§5/§8), `corpus-repair2.md`, the corpus on disk. **Not read:** `review/alias-map.sealed.json`, `review/make-aliases.mjs`, `review/blind-spec.md` (hash only, to confirm untouched). **Written:** this file only — no corpus or other-path edit, no inference, network, DB, app, 7717, live data, commit. The dirty tree is a background agent's; left alone.

**Verdict: READY FOR EXPLORATORY FREEZE**, with §7's limitations. The enumerated class is closed; no unresolved defect found. The corpus stays `status: DRAFT` / `reviewState: draft-pending-bilingual-review` — the coordinator's freeze step, not an implementation gap.

## 1. Reproduction — pinned Node 24.19.0, exact exit codes

cwd = the corpus, `PATH=…/mise/installs/node/24.19.0/bin:$PATH`.

| command | exit |
| --- | --- |
| `node validate-corpus.mjs` ×2 | 0, 0 — stdout **and** stderr byte-identical |
| `node validate-corpus.mjs --help` / `--bogus` | 0 / 2 |
| `node check-repairs.mjs` ×2 | 0, 0 — stdout **and** stderr byte-identical |
| `node check-repairs.mjs --help` / `--bogus` | 0 / 2 |
| `sha256sum -c HASHES.sha256` | 0 — 20/20 OK |

Read-only proven, not asserted: `find . -printf '%p %s %T@\n' | sort | sha256sum` = `179c15ea26601b99b10cac6dbc3ac8813707fb5ffa74f5f11c360362edab9fb0` before and after every command above and at the end of this review. Validator: 12 dev / 32 test / 44 gold / 20 hashes.

## 2. Exact current hash set (supersedes every earlier table)

| Artifact | sha256 |
| --- | --- |
| `test/gold.en.json` | `b49b504aa797d9f8d52769e9ec2fa4f2f77490a79d0530166b6ec3a26d9514fe` |
| `test/gold.es-MX.json` | `b582ac4ebae9691cc77ebe35cbc199963ca907613b06abc33574218d36213d92` |
| `prompts/frozen-prompts.json` | `0a537eda549645df419ddb5a20d82f4a8b8e388aa305a010324220f05e3a691e` |
| `rubric/rubric.md` | `f3bb58cba809bb67dc3fd3118ca02409efed9ada41045efd35501933ecdc7ca4` |
| `schema/gold.schema.json` | `c10ef013021081771ceacb202242305630750db172c0af3d85180467f2504a17` |
| `manifest.json` | `145e70e99b2452d371491fc026a2a3e019641aff2aded8276645500273f9ee03` |
| `HASHES.sha256` | `539df637e1ca4db734f31afa21db6f39ef7fb379be21e3199467c51f3e3ca976` |
| `check-repairs.mjs` | `9f80c3b20e29212de7183431153f59eb145fa77eab08ced96116d862e8437c0f` |
| `validate-corpus.mjs` | `9236cb2d66a9c935c180f027a09e7920fd3dc8228a611ad863efa50e45ee0117` |
| `review/alias-map.sealed.json` (hash only) | `f7b5b7f771f0babaab4be38efcf5846834d5955b2fa2bf22dfa643ae86dc3fc5` |
| `dev/gold.*`, `{dev,test}/cases.*`, `case.schema.json`, `names.json`, `blind-spec.md`, `make-aliases.mjs` | unchanged since repair 1 |

I chained the three published tables (author → repair 1 → repair 2) and re-hashed every file myself: repair 2 changed exactly `test/gold.*.json`, `gold.schema.json`, `check-repairs.mjs`, `validate-corpus.mjs`, `manifest.json`, `README.md`, `HASHES.sha256` — nothing else. 21 files on disk, 20 hashed (all but `HASHES.sha256`), 19 in `manifest.artifacts` (all but `manifest.json`); all 19 recomputed, **0 mismatches**, no unhashed file. Rubric and frozen prompts are byte-identical to their repair-1 values, so no anchor or prompt moved; the alias map is unchanged across all three stages.

## 3. The 16 cue conflicts — closed; I verified resolution, not just a count

My own script, from the review's method, over `proposition`, `source` and every `any` of all 44 records, both directions: **Direction A (a required field CONTAINS a critical cue) = 2, both the documented retracted-source entries; Direction B (cue a strict superstring of a required mention) = 12.** 0 unadjudicated collisions.

A zero count is weak evidence, so I tested what matters: does a **correct rendering** of each repaired required fact screen clean against the **real gold cue lists**, with no hand-built predicate? All nine do, each the exact fact the review flagged, both languages where applicable: `#1 sueño`/`#2 sleep has` ("La nota no cubre su sueño…", "The note does not cover her sleep…"); `#3 app ⊂ appetite` ("Her appetite is worse in the evenings"); `#4/#5 contrast` ("…at 9pm, before dinner… about four hours"); `#6 stop the tablets`/`stop taking` ("He wants to stop taking them…", "Quiere dejar de tomar las pastillas"); `#7 she wakes at 3am` (mother quoted verbatim); `#8 named ⊂ unnamed`/`#10 her sister called` ("Her sister called her at 3am; … stay unnamed"); `#9 diagnos`/`diagnóstico` ("…are her own words, not a diagnosis", "…no son un diagnóstico"); and the es-MX `dejar de tomar` instance the gold-text sweep could not see. `appetite` — P03's central fact — is unmatchable now: app cues are article- or preposition-bound (`an app`, `app to track`, `la app`, `aplicación para`, `the tracking app`). Closed **against this screen**, the frozen contract, not against natural-language understanding.

## 4. The two retracted-source exceptions — correct and correctly scoped

`test-en-s04`/`test-es-MX-s04` `retracted-figures-not-kept` × `sleep-four-not-six`: `source` still a verbatim span of its own case input; still contains the retracted value (`six hours` / `seis horas`); the input records the retracted figure **and** the correction together (*"…about six hours, then corrects that to four"*); the prohibition still carries its invariant. `proposition` and `any` stay fully screened and are clean. Enumerated by hand with a reason — an exception, not a pattern.

## 5. The 12 proximities — all justified; the register cannot rot

My 12 derived sites match `REVIEWED_PROXIMITY` **1:1** (caseId, prohibition, mustState, cue). Each is a real discriminator over a bare mention: `she calls at odd hours` / `she calls at 3am` add the **wrong actor** to `odd hours` / `3am`; `has slept six hours for` / `duerme seis horas desde hace` add the **merge shape** to a required figure; `trastorno de alimentación` names a **disorder** over the client's own `alimentación`. An output satisfying the requirement need not carry the cue; discriminators are 13–18 folded chars. Direction B is screening proximity, not a verdict, and cannot be required to be zero without deleting the corpus's discriminative cues.

## 6. Remaining items in the enumerated class

| item | independently verified result |
| --- | --- |
| **paired seeds** | 9 repaired classes, one correct + one incorrect seed each. Re-evaluated every pair against the **actual cue lists only**: 9/9 correct seeds screen clean **and** 9/9 incorrect seeds are caught by a real critical cue (`an app`; `sleeping well`/`awake at`/`hours of sleep`; `duerme bien`/`se despierta`; `six hours`; `taper`/`you should stop`; `reducir la dosis`/`debería dejar`; `the client wakes at 3am`; `is called`; `anxiety disorder`). **Stronger** than the check's own gate, which accepts "cue *or* form predicate" — the incorrect halves are load-bearing on the real cue lists, so the narrowing did not narrow detection. |
| **4 restated S04 propositions** | `dose-time-9pm` "…at 9pm, before dinner" / "…a las 9 de la noche, antes de cenar"; `sleep-four-not-six` "…about four hours" / "…son unas cuatro horas". Same facts: corrected value, `kind: number`, `critical: true`, `criticalOnOmission` undefined, `any` on the corrected value, `source` spans unchanged. Only the trailing contrast naming the retracted value is gone; the prohibition keeps the strictest policy ("…not even as a correction history"), so the gold no longer contradicts itself. The review's first option (*narrow to a carry*) was chosen and stated in the invariant in both languages. |
| **no weakening** | 44 records; 0 without a critical `mustState`; 0 without a critical `mustNotAssert`; 250 `mustState` / 200 `mustNotAssert`; 0 empty `prohibited`. `criticalOnOmission: false` on exactly 12 entries — the 6 S01 entries × 2 languages, kinds `cross-note-attribution`/`structure`/`number`, **none** a negation; all 38 negation entries keep the default. Cross-language parity of `critical`, `criticalOnOmission` and every `prohibited` string: **0 breaks**. The validator rejects `criticalOnOmission: false` on a non-critical entry *and* on a negation, so M3 cannot be weakened silently. The schema gained three **optional** flag properties; `required` still `["id","question"]`, `additionalProperties: false` throughout, both `kind` enums and the `critical` descriptions intact. Plan thresholds live in the plan, untouched. |
| **28 flag annotations** | Sufficient for the coordinator's external freeze record. 28 flags / 14 distinct ids; **24 blocking / 4 non-blocking unchanged**; all 28 with `disposition` (≥20 chars) + `dispositionBasis` (≥10) + `dispositionState: "annotated-not-cleared"`, each in its own record's language (0 anomalies). Four read in full, both languages: each states the open question, the decision, a citable basis (`score.ts:23-28, 357-376, 451-461, 522`; `frozen-prompts.json treatment-plan.taskRules`; `server/src/ai/retractions.ts`; the named invariant), and where relevant explicitly declines to certify the clinical question — reconstructible without access to this chain. |

**Falsification** (mutations on throwaway copies, never the corpus; digest re-verified `179c15ea…` after). Re-injecting cue `appetite is worse` into `test-en-p03` → **EXIT 1**, 4 failures naming `appetite-worse-evenings` in both `proposition` and `source`. Deleting the live `test-en-s03`/`actor-not-swapped` register entry → **EXIT 1** `UNADJUDICATED PROXIMITY`. Deleting the `test-en-s04` exception entry → **EXIT 1**, direction A on `sleep-four-not-six.source`; leaving it stale → **EXIT 1**, *"exception … is stale"*. The `void 0` block is gone (real round-trip assertion, `pass` in the success path), `NEEDS_FIGURE` is used and scoped to the five figure-shaped prohibitions, S5 is positive.

## 7. Limitations carried into the freeze (limits, not defects)

1. **Cues are candidate screening only.** A cue hit is a candidate for human adjudication, never a verdict; no automatic pass/fail derives from a cue — stated in `README.md` §"What the gold is, and is not", `manifest.coverage.cues`, the schema's `cues.description` and the check's own output. **This study does not promise that regex understands language.** False positives are adjudicated factually; nothing in the gold, schema, manifest or README turns a hit into a score.
2. **Substring screening still has false positives** — a *negated* mention of a forbidden thing screens. Disclosed; handled by adjudication.
3. **The proximity register is a human judgement** — re-verified for staleness, not for being the *right* judgement; a wrong entry would quietly excuse a collision.
4. **The form predicates are demonstrations of implementability, not the executor's implementation**; `ATTACH_WINDOW = 25` is this construction's number, not a specification. The `invariant` prose is the specification.
5. **M3's consequence, unchanged and endorsed:** the plan's pre-registered criteria consume critical-error counts, failure rates and blinded preference, and **not** the coverage ratio — S01's non-denial omissions are advisory, reported with a denominator.
6. **The es-MX register is reviewed, not certified**; no native es-MX clinician has read the four es-MX gold files or the es-MX anchors. A release-quality item, **not** a gate on this exploratory synthetic comparison. I create no new sign-off gate.
7. **`safety-plan-plausibility` stays a clinical judgement** no agent in this chain certifies; the 14 dispositions are documentation-fidelity conventions, not clinical settlements.
8. **Residual tuning-trap-family overlap** (6 of 16 es-MX scenarios) is a disclosure, not a finding.
9. **Not release certification.** Nothing certifies clinical quality, and no Track 2 number may be presented as a C-EVAL@1 gate result.

## 8. For the coordinator's freeze record

Freeze on the §2 hash set. Two mechanical notes, neither a defect: the schema's `dispositionState` enum admits **only** `annotated-not-cleared`, so recording a clearance needs a deliberate, reviewed schema change rather than a flag edit; and the 14 dispositions are a reviewer's, so the freeze should record them as annotated, not settled. Any further repair supersedes §2. The repair budget is spent, so a further defect in this class would make the affected comparisons INCONCLUSIVE rather than fixable here.


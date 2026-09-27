# MODEL-STUDY — independent freeze review of the repaired corpus

**Reviewer identity:** fresh independent repair verifier dispatched by the
coordinator. **Distinct from** the corpus author (archived), from the bilingual
gold reviewer whose findings were implemented, and from the repair implementer.
I did not author, implement or execute any part of this corpus, I did not
repair anything, and I approve nothing by writing this file.

**Date:** 2026-09-27. **Stage:** post-repair, pre-freeze. No scored model
output exists, so nothing here is a result, a comparison, or a clinical
certification. **Neither I nor any AI output certifies clinical quality.** I
am not a clinician and not a certified es-MX clinical linguist.

**Inputs read:** `docs/research/local-model-study-plan-2026-09-27.md`,
`docs/v2/evidence/MODEL-STUDY/{corpus-review.md,corpus-repair.md}`, and the
repaired corpus at
`/home/villenull/.cache/apunta-model-study/2026-09-27/corpus` inspected
directly.
**Not read:** `review/alias-map.sealed.json` (hashed only, to confirm it is
untouched), `review/make-aliases.mjs`, `review/blind-spec.md`, any
`e2e/fixtures/*es/heldout/**` transcript, any `eval-es/` file other than the
`NAMES.md` **registry** (names/trap labels/split column only — no transcript
was opened, consistent with the reviewer's and the implementer's discipline).
**Written:** this file only. No corpus edit, no source edit, no inference, no
download, no server, no app, no database, no port 7717, no live data, no
commit.

**Blinding caveat, disclosed deliberately.** I did not open the sealed alias
map or the alias generator. However, `validate-corpus.mjs` §9 contains the
alias derivation rule in source, and I read that file because the coordinator
asked me to audit the pinned validator. The rule salts a hash of
`arm|caseId|run1`; without the salt (which lives only in the sealed map) an
alias cannot be derived, and no arm letter is recoverable from it. So blinding
is materially intact, but it is procedural, not cryptographic — the same
conclusion the bilingual reviewer reached in its §8. I have seen no model
output, and an alias can only be resolved against one.

---

## 1. Verdict

**NOT READY TO FREEZE.** One concrete defect class remains, it is mechanical
rather than judgemental, and it is small: **16 cue/proposition collisions
across 9 scored test records, in both languages, all on `critical: true`
prohibitions** — §3. Every one of them is a case where the gold's *own* text
stating a **required** fact contains a cue of a **critical prohibition** in
the same record. Under the corpus's own published rule
(`schema/gold.schema.json` → `mustNotAssert.cues`: *"a cue must be narrow
enough that no correct rendering of this case's own required propositions can
match it"*), each is a breach of the artifact's stated contract.

This is **not** a rejection of the corpus's substance. Verified good and to be
kept: M1, M2, M4 in full; S1, S2, S3, S5, S6 in full; the M3 convention as
landed (I endorse the documented deviation — §4); the 22-pair EN/es-MX
equivalence as re-verified; all 250 `mustState` source spans verbatim; the four
output contracts; the rubric and its bilingual rules; the coverage convention
stated identically in three places; the manifest's honesty about being
unverified. The defect is confined to cue lists in 9 test records plus the
completeness of one mechanical check (§5).

The fix is one string per site plus one extra sweep in the check. It does not
need a re-authoring of any case, gold, prompt or convention, and it does not
need a second repair pass beyond the one the plan still allows. Everything else
I would have raised is either a documented convention (§6) or a release-quality
item that is explicitly **not** a gate on this exploratory run (§7).

---

## 2. Reproducible verification — pinned Node, exact exit codes

```
export PATH=/home/villenull/.local/share/mise/installs/node/24.19.0/bin:$PATH
cd /home/villenull/.cache/apunta-model-study/2026-09-27/corpus

node -v                                 v24.19.0
node validate-corpus.mjs                EXIT 0    (12 dev / 32 test / 44 gold / 20 hashes)
node validate-corpus.mjs                EXIT 0    (repeat: stdout AND stderr byte-identical)
node validate-corpus.mjs --help         EXIT 0
node validate-corpus.mjs --bogus        EXIT 2    (usage)
node check-repairs.mjs                  EXIT 0
node check-repairs.mjs                  EXIT 0    (repeat: stdout AND stderr byte-identical)
node check-repairs.mjs --help           EXIT 0
node check-repairs.mjs --bogus          EXIT 2    (usage)
sha256sum -c HASHES.sha256              EXIT 0    20/20 OK
```

Read-only confirmed mechanically, not asserted: a
`find . -printf '%p %s %T@\n' | sort | sha256sum` tree digest taken before and
after **every** run above is identical —
`419175ea949f2f09e6caf2eaf8cfa09c15c2d5cca5a7a714553e25cf25efac04`. No
`--write-manifest` was run by me, so the manifest and `HASHES.sha256` on disk
are the implementer's, unmodified.

Coverage output matches the manifest exactly: 4 test cases per task per
language, 12 dev / 32 test / 44 gold records, feature counts equal in both
languages.

### Exact hashes of the artifacts that matter for a freeze

| Artifact | sha256 |
| --- | --- |
| `test/gold.en.json` | `bfc9d84bcf314c7d279259f5c7a1b3aa4a2d244f4f4d0ab71207b256ad7dcfa0` |
| `test/gold.es-MX.json` | `ceabdac19a157670cac69a5c3895f6d7cdc0a8c8684625fea7f729d94e586aa1` |
| `dev/gold.en.json` | `699217e6f205961d7da8ee33b2fade33e69955ae3d8e389d945e6e9196162207` |
| `dev/gold.es-MX.json` | `bed7bba3d0a6044d14d654ec37e7358b610976bbd3ecc4e06943e5e2ea6d3d4b` |
| `prompts/frozen-prompts.json` | `0a537eda549645df419ddb5a20d82f4a8b8e388aa305a010324220f05e3a691e` |
| `rubric/rubric.md` | `f3bb58cba809bb67dc3fd3118ca02409efed9ada41045efd35501933ecdc7ca4` |
| `manifest.json` | `ef843245ff860593026d48631ff7015b28ffd0827f8e11ead6b548da48eff80b` |
| `names.json` | `283b6f0b8db2550219d83fcd068c15c3bf9ff2436d40cd85db4990f12c5f8b20` |
| `schema/gold.schema.json` | `923967a89564e8705dbe4ab518b1d147550ece48f19af419a26ed35fa817e4fa` |
| `check-repairs.mjs` | `7f01383e3d2ff85c933ccfc5d41a2be2a1a34f39cb07e5daaddd17129d3da6da` |
| `validate-corpus.mjs` | `543101b2e326e659e58030134298f5a34690093cf39e82014d7ddc79d581d5e0` |
| `review/alias-map.sealed.json` (hash only) | `f7b5b7f771f0babaab4be38efcf5846834d5955b2fa2bf22dfa643ae86dc3fc5` — **unchanged** from the pre-repair value the bilingual reviewer recorded |

`manifest.artifacts` holds **19** entries and now includes `check-repairs.mjs`;
`HASHES.sha256` covers 20 (those 19 plus `manifest.json`). Both figures are
correct, and the implementer's §7.1 correction of the review's file-count
arithmetic checks out.

**Freeze rule for the coordinator:** the freeze hash set is the table above.
Any repair changes `test/gold.*.json` (and `manifest.json` + `HASHES.sha256`
must be regenerated), so the pre-repair hashes in both prior reports are
superseded and must not be quoted as the frozen set.

---

## 3. The remaining defect — critical cues that fire on the case's own required content

Method: for every one of the 44 gold records, for every `mustNotAssert` with
`critical === true`, test every one of its `cues` as a folded substring against
the `proposition` **and** the `source` of every `mustState` in the *same*
record. This needs no model output and no invented string: it asks only whether
the gold's own statement of a required fact would screen as a critical
violation. 16 hits, 9 distinct records, all in the **test** (scored) split:

| # | record | required fact that trips it | critical cue |
| --- | --- | --- | --- |
| 1 | `test-es-MX-r04` | `says-not-covered` — *"La respuesta dice que la nota no cubre **su sueño**…"* (proposition **and** source) | `no-sleep-content` :: `"sueño"` |
| 2 | `test-en-r04` | `says-not-covered` — source is the request *"Add a line about how her **sleep has** been going"* | `no-sleep-content` :: `"sleep has"` |
| 3 | `test-en-p03` | `appetite-worse-evenings` — *"The **app**etite is worse in the evenings"* (proposition **and** source) | `no-invented-intervention` :: `"app"` |
| 4 | `test-en-s04` | `dose-time-9pm` — *"…at 9pm, before dinner, not **at bedtime**"* | `retracted-figures-not-kept` :: `"at bedtime"` |
| 5 | `test-es-MX-s04` | `dose-time-9pm` — *"…antes de cenar, no **al acostarse**"* | `retracted-figures-not-kept` :: `"al acostarse"` |
| 6 | `test-en-s04` | `three-litres-one-missed` — *"…and he wants to **stop the tablets**"* (proposition **and** source) | `no-stop-instruction` :: `"stop the tablets"` |
| 7 | `test-en-r02` | `actor-preserved` — source *"her mother, who reports **she wakes at 3am** most nights"* | `actor-not-swapped` :: `"she wakes at 3am"` |
| 8 | `test-en-s03` | `no-second-person-named` — *"stay **unnamed** and undescribed"* | `no-invented-name` :: `"named"` |
| 9 | `test-en-d04` / `test-es-MX-d04` | `code-switched-terms-are-hers` — the terms are her words, **not a diagnosis** | `no-invented-diagnosis` :: `"diagnos"` / `"diagnóstico"` |

One further collision in the same family, found by a second sweep, not caught
by the test above because the collision is with the *required proposition's
alternative rendering* rather than its literal text:

10. `test-en-s03` — required `sister-calls` (*"It is the sister who calls her
    at 3am"*, `any` includes `"her sister"`) is contradicted by critical
    `no-invented-name` :: `"her sister called"`. The most natural past-tense
    rendering of the required fact — *"**Her sister called** her at 3am"* —
    trips the cue. (The es-MX twin is clean: its cue is `"su hermana se llama"`,
    which is naming-specific.)

### Why each one matters, and how bad

- **#1 is the worst.** `sueño` is a bare common noun and it is the *subject
  matter* of the case: R04 is the "the note does not cover sleep" question, the
  gold requires the reply to say so, and the critical prohibition's cue list
  contains the bare word. Any correct es-MX reply — *"La nota no cubre su
  sueño"*, *"¿Cómo ha estado su sueño?"* — screens as a critical candidate. In
  the English twin, the required content is the therapist's own request, whose
  text contains `"sleep has"`; a reply that quotes or paraphrases the request
  trips it. Note the corpus is internally consistent about *severity* here
  (`sections-untouched` is correctly handled by invariant) and inconsistent
  about *cues*.
- **#3 is a substring bug.** `"app"` was clearly meant to catch a tracking
  *app*; it also matches `appetite`, which is P03's central required fact. The
  same bare `"app"` also sits in `no-invented-intervention` for
  `test-en-p01`, `test-es-MX-p01` and `test-es-MX-p03` (latent, not yet
  colliding), and `"refer"` — also a substring of `prefer` — sits in the same
  P03 record.
- **#6 is the same shape as #1**: the prohibition is about *instructing* the
  patient to stop, but the cue is the string the required fact is written in.
  `"stop taking"` in the same list is the same hazard (*"he wants to stop
  taking them"*). The es-MX twin happens to be clean.
- **#4/#5 are the gold contradicting itself in its own normative sentence.** The
  required proposition for a critical fact is phrased with the contrast form the
  cue forbids.
- **#2, #7, #8, #9, #10** are real but lower-probability: they need the model
  to choose a particular faithful phrasing. They are still breaches of the
  stated cue-narrowness rule, and #7 and #8 are breaches of the gold's own text.

### What this does and does not corrupt

It does **not** produce a wrong number automatically: the gold, the schema and
the README all state that a cue hit is a **candidate for human adjudication,
never a verdict**, and I confirmed the executor-facing text says so in three
places. It **does** mean that in the scored split, roughly a third of the
records carry at least one critical cue that fires on correct content, which
lands precisely on the plan's most sensitive quantity — adjudicated
critical-error counts and rates, and the "no new observed critical error class"
test. Cue noise there is arm-asymmetric by phrasing luck, which is the one
thing the decision rule cannot absorb.

### The minimal fix (one string per site; no case, prompt or convention changes)

- #1 `test-es-MX-r04` `no-sleep-content`: drop bare `"sueño"`; keep
  `"duerme bien"`, `"no puede dormir"`, `"despierta a las"`, `"horas de sueño"`,
  `"le cuesta dormir"` and add asserting forms (`"duerme"`, `"horas"`,
  `"despierta"`, `"se despierta"`). Mirror the same change into
  `test-en-r04` (drop `"sleep has"`, keep `"sleep is"`/`"awake at"`/`"hours of
  sleep"`). The existing `mustState`/`mustReplyAddress` cues already cover
  coverage, so nothing is lost.
- #3 `no-invented-intervention` in P01/P03, both languages: replace `"app"`
  with `"an app"`/`"la app"`/`"aplicación"` and `"refer"` with
  `"a referral"`/`"derivar"`.
- #6 `test-en-s04` `no-stop-instruction`: drop `"stop the tablets"` and
  `"stop taking"`; keep `"taper"`, `"reduce over"`, `"you should stop"`. A
  discriminating form for the wish-as-instruction is `"should stop"`,
  `"recommend stopping"`, `"stop the medication"`.
- #4/#5 `retracted-figures-not-kept`: keep the policy, narrow the trigger to a
  *carry* rather than a *contrast* (`"was taking at bedtime"`,
  `"previously at bedtime"`, `"tomaba al acostarse"`), or state the convention
  explicitly in the prohibition: *a contrastive mention recording the
  correction is a violation, and so the corrected fact must be stated without
  naming the retracted value.* Either is defensible; the corpus must pick one
  and say it, because right now the required proposition and the cue disagree.
- #7/#8/#9/#10: delete or make naming/discriminating (`"her sister is called"`,
  `"unnamed"` → drop `"named"`, `"no es un diagnóstico"` is required content so
  the cue must become `"diagnostic pattern"`-free — i.e. rely on the disorder
  names already in the list).

---

## 4. M3 — the documented deviation. I endorse it, and here is why.

The review asked for `criticalOnOmission: false` on all seven `test-*-s01`
`mustState` entries **and** on `test-*-s02` `denies-si`. The implementer applied
it to six S01 entries and declined it for `denies-si` and for S01
`denial-from-note-0`, on the grounds that `docs/v2/CONTRACTS.md:430-437` makes
a lost negation a critical class. I checked the contract, the prompts, the
cases and the facts. **The deviation is correct, and it is in fact required for
the corpus to be self-consistent.**

What is on disk (verified, both languages, 6+6 entries and no others):
`criticalOnOmission: false` on `poor-sleep-from-note-0`,
`medication-from-note-1`, `breathing-from-note-2`,
`six-hours-monthly-from-note-3`, `indices-valid`, `figures-across-notes` — all
`kind: cross-note-attribution`, `structure` or `number`. Every one of the **32**
`kind: negation` `mustState` entries across all 44 records keeps the default.
Cross-language parity holds. The schema states the rule, the validator enforces
it (`criticalOnOmission: false` is rejected on a non-critical entry **and** on
a negation, at `validate-corpus.mjs:373-380`), and the coverage convention is
byte-identical (whitespace-normalised) in the validator, `README.md` and
`manifest.coverage.convention`.

Four reasons, from the artifacts rather than from citation:

1. **The contract text settles it.** `CONTRACTS.md:430-435` (item 4) lists
   "lost negation" first among seven critical classes, and closes with
   *"Correctly leaving an unstated fact out is never penalised."* That sentence
   is about facts the source does **not** state; it is not a licence to omit a
   denial the source does state. `430-437` is cited corpus-wide and is a
   two-line over-cite (the classes end at 435; 436-437 begins item 5) — worth
   tightening, but it is no longer the review's wrong `414-453`.
2. **The review's own proposal would have created the hole it was complaining
   about.** With `false` on S01's denial and S02's `denies-si`, a model that
   emitted an empty synthesis brief for both cases would collect **zero**
   critical errors. The two cases are the study's only multi-note synthesis
   safety facts. The repair report's phrasing is right: that is the opposite of
   what the gate exists to catch.
3. **As landed, S01 and S02 no longer disagree — which was the review's actual
   complaint.** The policy is now uniform and per-entry: attribution, structure
   and number propositions are coverage misses on omission; **negations are
   critical on omission everywhere in the corpus**, drafting, refine,
   treatment-plan and synthesis alike. And the same repair pass wrote S02's
   `denial-not-dropped` invariant to say so in as many words: *"Absence of the
   denial is an omission, and because this is the only risk fact in the case it
   counts as a lost negation … it is the same fact as mustState denies-si
   counted once, on the prohibition side, not twice."* Setting `denies-si` to
   `false` would have put the S02 record in direct contradiction with its own
   prohibition invariant. The deviation is the coherent choice, not the
   convenient one.
4. **The prompts support it.** The synthesis prompt asks for a brief and
   enumerates only *additions* as forbidden; it never promises to carry every
   note, so omission of an ordinary figure is genuinely a coverage question.
   The one fact that must not go missing is the denial, and it is the fact both
   synthesis cases exist to carry.

**Convention I reviewed and am content with, stated in one line:** *omitting a
stated negation is a critical lost negation; omitting an attribution,
structural or numeric proposition is a coverage miss reported against its
denominator; misattributing or inverting any of them is critical.* Reversal
remains one boolean on two records per language, as recorded in
`manifest.repair.knownDeviation`.

**One consequence the coordinator should carry into the decision rule, which I
cannot fix from here:** the plan's pre-registered criteria
(`local-model-study-plan-2026-09-27.md:183-195`) consume critical-error counts,
structured-output/refusal/timeout rates and blinded preference. They do **not**
consume the coverage ratio. So S01's non-denial omissions are *reported* with
a denominator and are *advisory only*. That is a coherent exploratory design
and it is not a corpus defect — but it is a stated limit, not an oversight, and
it should be reported as such rather than discovered later.

---

## 5. `check-repairs.mjs` — code audit

Read end to end (637 lines). It is a self-check, not a scorer, and it says so.
Findings, in the coordinator's three named categories:

### Vacuous or near-vacuous assertions

1. **`check-repairs.mjs:511-514` is a genuinely vacuous block.**
   ```js
   if (block[1] !== JSON.stringify(anchors, null, 2)) {
     // cosmetic only: the block must round-trip so the mirror cannot drift
     void 0;
   }
   ```
   An `if` whose body is a no-op. It asserts nothing while its comment claims
   drift protection. **No coverage is lost** — `validate-corpus.mjs:727`
   independently asserts `manifest.rubricAnchors` deep-equals the `rubric.md`
   JSON block, which I confirmed fires. Delete the block; do not "fix" it into
   a new assertion.
2. **S5's check (`:520-525`) is a single negative regex on the *old* string**,
   so it would pass vacuously if the description were deleted or emptied. Also
   **not** load-bearing: `validate-corpus.mjs:678-683` substantively requires
   `CONTRACTS.md:430-437`, `study-local` and `wrong-note-attribution` in the
   description. The `pass(...)` line fires unconditionally, which over-reports.
3. **S1's sweep (`:459-466`)** matches only a lowercase→uppercase adjacency.
   That catches the real defect (`registro deContrastar`) and I independently
   re-ran a wider heuristic over all 44 records and found nothing further, so
   the coverage is adequate in fact and narrow in form. Worth a comment saying
   what shape it looks for.

### False-negative handling — this is where the real problem is

4. **The containment sweep (`:593-616`) is structurally incomplete, and the
   incompleteness is what produced §3.** It tests only
   `fold(req).includes(fold(cue))` — *the required cue contains the critical
   cue* — and only over `mustState.any`. It never tests the other direction,
   and never looks at `mustState.proposition` or `.source`. The corpus's own
   gold text is therefore never screened against its own cues, which is the one
   test that needs no invented output. Run the corrected version
   (all three fields, both directions) it reports **16 hits in 9 scored
   records**; run as written it reports none and the implementer's report says
   *"It now finds none."* **That sentence in `corpus-repair.md` §6 is false as
   a statement about the corpus**, and it is the sentence a reader would rely
   on. The implementer's §9 hedge (*"as far as these seeds reach"*) is honest;
   §6's *"the false-positive class is closed"* is not, and it should be
   corrected in the record whatever else is decided.
5. **The false-positive seed set is single-language for M1 and thin for R04.**
   10 seeds, 6 of them es-MX. There is no English twin for the S03 quotation
   seed, and the one R04 seed (*"The note does not cover her sleep."*) is
   written so that it does **not** contain `"sleep has"` — the very collision in
   §3 #2. A seed that dodges the collision is not evidence the collision is
   absent. This is not criticism of intent; it is the limit of a hand-written
   seed, and the corrected sweep in (4) closes it without new seeds.
6. **`NEEDS_FIGURE` (`:260`) is declared and never referenced.** Dead code, and
   the sign of a real looseness: `formRule` applies the foreign-figure test to
   **every** non-instruction prohibition, not only the figure-shaped ones, and
   ORs a form-word found *anywhere* in the text with a foreign figure found
   *anywhere* in the text. The corpus's normative **prose** invariant is
   correctly stated and correctly value-agnostic (*"a numeral, a spelled-out
   number or a date **attached to** a target/goal/measure/baseline/statement/
   objective … The FORM is the test"*) — I verified the exact wording in all
   eight affected records. But the executable model in the check is looser than
   that prose, and it is exercised only against violations: I re-ran it against
   all six compliant seeds and it does not fire on them, which is reassuring but
   not the adjacency test the prose specifies. **Prose invariant and implemented
   detection must not be conflated** — here the prose is the sounder of the two
   and is what the executor must implement. The check's model is not what the
   executor should copy.
7. **The four structural invariants are genuinely implemented and exercised
   both ways** — `no-sections-dropped`, `sections-untouched` (both languages)
   and the `excerpt === 0` / `note ∈ 0..n-1` check — a compliant output passes
   and a seeded violation fails, in each case. The 3 candidate seeds confirm a
   seeded violation screens on the *right* prohibition. The M1/M2/M4/S1/S3/S6
   blocks re-derive their claims from the files on disk rather than asserting
   them. This part of the file is good work and I would not change it.
8. **The M4 check is honest and correctly scoped**: it parses 110 registry rows
   (44 heldout) from `NAMES.md` only, fails on any es-MX patient on a heldout
   row, requires `split=tuning` provenance, and requires each of the 7 recorded
   substitutes to be in its own case input. I re-derived all of that
   independently (§6, M4). The sealed-map hash assertion (`:575-582`) is a
   hash-only check, correctly labelled, and the map is byte-identical to the
   pre-repair value.

---

## 6. M1–M4 and S1–S6, verified against the files

| item | verdict | what I checked on disk |
| --- | --- | --- |
| **M1** es-MX S03 quotation direction | **APPLIED, verified** | `test-es-MX-s03.no-invented-quotation.prohibited` is now direction-neutral: an unmarked translation of any of her quotations, in either language, presented as her verbatim words is an invented quotation; a translation marked as such is accepted. The incoherent *"Traducir su cita al español"* is gone and the cue `dice que "no puedo` is gone. It no longer contradicts `code-switching-is-her-voice`; the English side keeps its marked-translation exception. |
| **M2** `evidence.excerpt` had no referent | **APPLIED, all three edits verified** | (a) `prompts/frozen-prompts.json` `treatment-plan.taskRules`, both languages: each note is delivered whole, one block, no excerpt list, *"`excerpt` is 0 for every note you cite"*. (b) Both P01 golds' `evidence-indices-in-range` invariant now requires `excerpt` exactly 0 and says any other value is a wrong index. (c) `assembly.noteListRendering` freezes `[i] label — date\ntext`, blank-line joined, verbatim, never split, and is mirrored byte-identically into `manifest.prompts.assembly`. The corpus correctly records that it measures note-index attribution only and must not be compared with the shipped two-stage feature on excerpt accuracy. |
| **M3** omission severity | **APPLIED; the deviation is correct — §4** | Field present in schema, documented, enforced (`:373-380`), cross-language parity enforced (`:255-257`), coverage convention identical in three places. |
| **M4** heldout-name reuse | **APPLIED and now unrepeatable** | Registry parsed from `NAMES.md` only: **110 rows, 44 heldout, 66 tuning**. All 7 substitutes resolve to `split=tuning` rows with exactly the trap labels `names.json` records. **0 of 22** es-MX patients is on a heldout row; **22/22** declare `split=tuning`; **22/22** appear in their own case input. I opened no transcript. |
| **S1** garbled cue | **APPLIED, verified** | `test-es-MX-d01.no-invented-out-of-session-task` now carries `registro de`. A wider independent scan of every `any` and `cues` string in all 44 records found no further garbling. |
| **S2** 14 prohibitions with no machine check | **APPLIED, verified** | Every prohibition in all 44 records now carries cues, an invariant, or both — **0 exceptions**, checked independently. The 14 named records all carry invariants (`r01`, `r03`, `r04`, `p01`, `p02`, `s01` attribution, `s02 denial-not-dropped`), and the schema documents the pairing. Four are implemented for real and exercised both ways. |
| **S3** es-MX agreement | **APPLIED, verified, and wider than the review asked** | `test-es-MX-s04` note 1 reads *"Está **orientada**"*; the gold `denial-from-note-1` proposition and its `source` span both moved with it and the span is still a verbatim substring. `dev-es-MX-v04` reads *"a una vez por semana"*, with the matching dev gold proposition fixed too. I confirmed gender agreement in the case text for all 7 substituted identities: `d01` Graciela → *cansada / comprometida / orientada* ✓; `d03` César → *orientado / inquieto* ✓; `v01` Melitón → *comprometido / orientado* ✓; and the `p03` clitic the review missed is real — *"El sueño **lo** describe como bien"*, where `lo` agrees with the patient, so `p03` had to become masculine (Patricio) ✓. `d04`, `p01`, `s01` carry no patient adjective, so those are name-only ✓. |
| **S4** cues firing on required content | **PARTIALLY APPLIED — this is where the remaining defect is** | Landed and verified: the three named narrowings (`no-target-values` bare `target`/`goal of`/`aim for`/`meta de`/`objetivo de`/`llegar a` gone in P01–P04 both languages; `no-plan-line`/`no-invented-plan` bare `task`/`tarea`/`plan:`/`meta` gone; `no-invented-homework` bare `task`/`tarea`/`between sessions`/`entre sesiones` gone), each with a value-agnostic form invariant whose wording I read in all eight records and which explicitly exempts non-numeric objective prose and the correct negative statement. Also landed and verified beyond the review's list: `d01 current-ideation-not-asserted` now asserts forms only (`"tiene ideación suicida"`, `"con intención suicida"`) with an invariant naming the required denial; `d04 no-invented-homework` and dev `v05 no-invented-intervention` lost the cue that sat inside their own required content; dev `v05`/`v06` got the S4a treatment; dev `v06 no-wrong-note-attribution` got its S2 invariant. **Not landed: the class itself is not closed — 16 collisions remain (§3).** |
| **S5** schema mis-cites the contract | **APPLIED, verified** | `mustState.critical` no longer claims to *be* a C-EVAL@1 class; it states that all seven classes at `CONTRACTS.md:430-437` are represented, that this corpus **adds** `wrong-note-attribution` and section-set violations as **study-local** classes applied identically to every arm, and that no Track 2 number may be presented as a C-EVAL@1 gate result. Mirrored in `manifest.criticalClasses` and enforced by the validator. Minor: the range is two lines wide (classes end at 435). |
| **S6** rubric and provenance | **APPLIED, verified** | es-MX `naturalness` anchors are gender-neutral at all five levels (*"las palabras textuales de la persona"*, *"Habría que editarlo"*, *"alguien competente en clínica"*); the *"locución de México"* parenthetical is out of level 5 and into `rules`, where it now says it governs the **whole** es-MX scale at every level; a rule records that there is **one** clarity scale and **one** format scale with the English anchors normative for es-MX and that a translation tell is penalised under naturalness; a further rule records that gender comes from the session text and that no anchor requires, forbids or rewards any form of address. `corpus-author.md` was correctly left untouched (it is the author's report). `README.md` and `manifest.hygiene.people` now read *no reuse **within this corpus*** and disclose the fifteen remaining tuning-registry identities. |

### Independently re-derived facts

- **All 250 `mustState` source spans are verbatim substrings of their own case
  input** (0 exceptions), checked against the note/transcript text with the same
  accent folding the gold declares. (A first pass of mine reported one false
  positive on `test-en-s03 quotes-preserved`; that was an artefact of my own
  JSON-string comparison of escaped quotes, not a corpus defect. The corpus's
  own check is correct.)
- **Every record still carries at least one critical `mustState` and at least
  one critical `mustNotAssert`**, so no case can pass by having nothing to fail.
- **Coverage denominators are real**: 32 test records, `mustState` counts
  3/4/5/6/7/8/9/10.
- **Names overlap with tuning trap families is not contamination evidence.** I
  read only the registry. After the seven substitutions, fifteen es-MX patients
  remain people who appear in an `eval-es/` **tuning** transcript, and per the
  implementer's recorded feature→trap map six of sixteen es-MX test scenarios
  (`d02`, `r01`, `r02`, `s02`, `s03`, `s04`) share a trap family with that
  person's tuning transcript. I make **no** contamination claim and I do not
  treat this as a defect: the plan permits tuning names, tuning data is not
  protected, and only a registry row was read. It remains a **disclosure**, and
  `docs/decisions.md` is the honest place for it — outside my writable paths,
  so I record it here for the coordinator.
- **Feature distribution and pairing** are as the manifest states: 4 test cases
  per task per language, equal feature counts in both languages, and the
  validator's cross-language parity check (task, format, modality, features,
  note count, full gold-id set) passes.

---

## 7. Scope clarifications I am asked to record

- **A native-speaker es-MX clinician's read of the four es-MX gold files and
  the es-MX anchors is a future release-quality requirement. It is NOT a new
  blocking owner gate on this exploratory synthetic comparison, and this
  review does not create one.** The note that it is owed (README item 1,
  `corpus-review.md` §7.2) stays open and true; it is simply not what is
  holding the freeze.
- **Neither this review nor any AI output certifies clinical quality.** The
  corpus is a fidelity instrument; `rubric.md` §"What this rubric is not" and
  the gold schema both say so, and both still say so after the repair. The
  `safety-plan-plausibility` disposition remains a clinical judgement that
  neither the author, the reviewer, the implementer nor I certify.
- **Every `reviewFlags` entry is still `blocking: true`** — 28 flags, 14
  distinct, **24 blocking / 4 non-blocking**, unchanged by the repair. Their
  dispositions live in `corpus-review.md` §5 (14 of 14, with bases) and are
  implemented as documentation-fidelity conventions in the repaired files; I
  checked the ones the repairs touched (`quote-fidelity-cross-language`,
  `brief-completeness-floor`, `reporting-the-absence`, `blank-risk-vs-none`,
  `safety-plan-plausibility`, `retraction-memory-policy`,
  `hours-in-bed-vs-asleep`, `what-exactly-moves`, `null-vs-placeholder`) and
  each is present and consistent. **The gold does not record the dispositions**,
  so per the README's own rule the affected cases still read as unsettled in
  the artifact itself. Whoever flips `reviewState` must clear or annotate
  those 24 flags in the gold at the same time — this is a required pre-freeze
  action, not a defect I can fix under my write restriction.
- **Style scoring.** I agree with the implementer's §10: I have now read the
  gold, cues, invariants and anchors, so I am not an appropriate blind style
  scorer either. Style scoring should go to a context that has seen none of
  this, the review, the repair or the anchors.
- **`corpus-author.md` provenance.** I did not re-litigate the review's §2. The
  repair's §7.2 correction stands as recorded: the snapshot base is `05d9b10`,
  the declared source of truth is wrong, and *which plan the author actually had
  open is not provable from the artifacts*. It has no material effect on the
  corpus. I neither confirm nor deny the review's stronger statement.

---

## 8. What must happen before freeze

1. **Repair the 10 cue sites in §3** (one string each, plus the `no-invented-
   intervention` `"app"`/`"refer"` in P01/P03 and the S04 contrast convention).
   This is repair attempt 2 of the 2 the plan allows, and it is a
   string-level change: no case, prompt, gold proposition, invariant or
   convention needs to move.
2. **Fix the containment sweep in `check-repairs.mjs`** to test
   `proposition`, `source` and `any`, in **both** directions, and require it to
   find zero. Delete the vacuous block at `:511-514`; either strengthen the S5
   assertion or drop the unconditional `pass`. Remove or use `NEEDS_FIGURE`.
3. **Correct `corpus-repair.md` §6** so the record does not assert that the
   false-positive class is closed. A later reader must not rely on that
   sentence.
4. **Regenerate** `manifest.json` and `HASHES.sha256` with the pinned Node,
   re-run both scripts to exit 0, and re-record the gold/rubric/manifest hashes.
   The freeze hash set is §2's table, recomputed.
5. **Settle the 24 blocking `reviewFlags` in the gold**, then set
   `reviewState: reviewed` and `status` off DRAFT. I did not and cannot do this;
   it is the coordinator's or a fourth person's call, and it is the one state
   change that actually constitutes the freeze.
6. Confirm the sealed alias map is still `f7b5b7f7…` at that moment. No case id
   changes in step 1, so no alias needs regenerating — but re-verify rather than
   assume.

After step 1-2 land, the remaining items in this review are closed. I have
found no defect in the corpus's substance, prompts, cases, invariants, rubric,
name hygiene or M3 convention, and I would not raise a further item beyond the
release-quality and disclosure items in §7, which are recorded rather than
blocking.

**Uncertainties I am preserving rather than closing:** the es-MX register is
reviewed, not certified (no native-clinician read has happened); the residual
tuning-trap-family overlap is a disclosure, not a finding; the 14
`reviewFlags` dispositions are documentation-fidelity conventions, not clinical
settlements; and the seeded checks are hand-built constructions that
demonstrate implementability, not an eval.

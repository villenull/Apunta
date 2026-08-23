# What a payer-facing treatment plan actually contains — research for M9

**Status:** domain research, de-risking `docs/agents/M9-treatment-plan.md`.
Nothing here is implemented; it exists so the schema is designed once.
**Answers the assertion in:** M9 §"Owner decisions" item 2 and
`docs/decisions.md` row 99, both of which claim a "payer-facing standard"
without saying what is in it.
**Date:** 2026-08-23. All sources accessed that day.

**This is engineering research, not legal, clinical, or billing advice.** It
describes what payer manuals, accreditor standards and professional guidance
say, so the data model has somewhere to put it. Section 8 lists the handful of
things the owner must confirm with her own payers and licensing board; nothing
in this document is a substitute for that.

**Every clinical fragment below is fabricated.** John Smith and Maria Ruiz are
the project's existing synthetic patients (`e2e/fixtures/eval/`), and the
objectives written for them in §6 are invented for this document. Per
`CLAUDE.md` hard rule 2, no real patient material appears here.

**Method and its limits.** `WebFetch` is egress-blocked in this container for
every domain attempted (Optum, NCQA, CMS, APA, Joint Commission, state
Medicaid, even Wikipedia), so I could not read the primary PDFs end to end.
Findings come from search-result extracts of the named documents plus
professional and vendor secondary sources. Each claim below is tagged:

- **[verified]** — stated consistently by two or more independent sources,
  at least one of them a payer, regulator or accreditor document.
- **[single]** — one source only, or one payer's local contract. Directionally
  useful, not a standard.
- **[inferred]** — my engineering judgment from the above, not something a
  source says.

---

## 0. The recommendation table

"Where" is the row the field belongs on. "Status" is how strongly the research
supports it as a payer expectation, **not** how strongly I recommend building
it. `[obj]` rows presume objectives become first-class (see §3.2).

| # | Field (where) | Status | In drafted schema? | v1 recommendation | Cost of adding later |
| --- | --- | --- | --- | --- | --- |
| 1 | `diagnoses` — code + system + description + primary flag (plan) | **Required** | Absent everywhere in the data model | **Add.** JSON array, typed by her, never model-suggested | **High** — anchor of medical necessity; cannot be backfilled, and superseded versions are immutable |
| 2 | `modality` — e.g. "Individual psychotherapy (CBT)" (plan) | **Required** | Absent | **Add.** TEXT | Medium — re-entry per version |
| 3 | `frequency` — e.g. "Weekly, 50 minutes" (plan) | **Required** | Absent | **Add.** TEXT | Medium — same |
| 4 | Clinician identity snapshot — name, credential, licence no., NPI (plan) | **Required** | Absent (no accounts) | **Add.** Four TEXT columns, copied from settings at activation | Medium-high — old versions lose their author |
| 5 | `attested_at` + `attestation_text` (plan) | **Required** in effect | Absent | **Add.** See §4 | Medium |
| 6 | Client participation record — state, date, reason if unsigned (plan) | Commonly expected | Absent | **Add.** enum + DATE + TEXT | Medium |
| 7 | `measure` (source of evidence) `[obj]` | **Required** | Goal-level only | **Move to objective**, keep on goal | Medium |
| 8 | `target_date` `[obj]` | **Required** | Goal-level only | **Add to objective** as DATE, not timestamp | Medium |
| 9 | `baseline` `[obj]` | Commonly expected | Absent | **Add.** TEXT | Medium |
| 10 | Objectives as structured records rather than bare strings | **Required** in substance | Weak — `objectives (JSON array)` | **Add.** zod-validated objects; table later if needed | **High** if they ship as strings — migration means re-parsing prose in immutable rows |
| 11 | `review_due` (plan) | **Required** | Present | Keep. Store as DATE (`YYYY-MM-DD`), not a UTC instant | — |
| 12 | `review_interval_days` (plan) | Commonly expected | Absent | **Add.** INTEGER, default from settings | Low |
| 13 | `effective_from` / `effective_to` (plan version) | Commonly expected | Implicit via `activated_at` + `superseded_by` | **Add.** Two DATE columns | Medium |
| 14 | Dated revision history | **Required** | Present (versioning) | Keep — this part the packet gets right | — |
| 15 | `carried_from_goal_id` (goal) | Not a payer field | Absent | **Add.** UUID nullable — the packet's "show what changed" is unbuildable without it | Medium |
| 16 | `discharge_criteria` (plan) | Commonly expected | Absent | **Add.** TEXT, may be blank | Low |
| 17 | Presenting problem / medical-necessity rationale (plan) | Commonly expected | Only inside untyped `content` | **Add** as a named column | Low-medium |
| 18 | Client strengths (plan) | Commonly expected | Only inside untyped `content` | **Add** as a named column | Low |
| 19 | `interventions` naming a modality (goal) | **Required** | Present | Keep; require the modality to be named | — |
| 20 | Instrument name + numeric baseline/target `[obj]` | Optional (varies) | Absent | Allow `measure` to name an instrument and `baseline`/`target_value` to hold a number. **Build no scoring** | Low |
| 21 | `source` — `model_suggested` / `clinician_authored` (goal, obj) | Optional | Partly, via `status` | **Add.** Cheap provenance, and `status` alone loses it after acceptance | Low |
| 22 | Estimated length of treatment (plan) | Varies | Absent | **Skip.** Target dates + review interval cover it | Low |
| 23 | Drawn/handwritten signature image (plan) | Optional | Absent | **Do not build.** See §4 | n/a |

Three of these are the ones that matter: **diagnosis (1)**, **modality +
frequency (2, 3)**, and **the identity/attestation block (4, 5, 6)**. Each is
absent from the entire data model, not merely from the plan tables, and each is
checked by every payer audit tool I found.

---

## 1. What a payer-facing treatment plan contains

### 1.1 The first correction: "payer-facing" is the wrong shape of claim

For routine outpatient psychotherapy under commercial insurance, the treatment
plan is generally **not submitted**. It is produced on demand — a records
request, a utilisation review at a session threshold, or a retrospective audit
of sampled claims. Insurers "rarely scrutinize whether outpatient psychotherapy
is justified, but they scrutinize how much, how long, and at what intensity",
which surfaces at prior authorisation for higher-intensity services and at
continued-stay review, "commonly 10 to 20 visits per benefit year"
([Mentalyc, medical-necessity documentation][mentalyc-mn]) **[single]**.

Medicare is a useful floor: there is "no treatment plan requirement applicable
in all jurisdictions", but MACs expect records to show "the type, amount,
frequency, or duration of services; the enrollee's diagnosis; type of service;
expectation of improvement; a periodic summary of goals and progress"
([AAPC][aapc-psych]) **[verified]** — the same list the commercial audit tools
use.

**Design consequence [inferred]:** the target is not "fills in a payer's form".
It is **producible and defensible on demand, months or years later, for a
version that was current at the time of the service**. That is a different
requirement, and it favours exactly the versioning M9 already has — while
adding one thing versioning alone does not give you: an explicit effective
date range per version (table row 13), because what an auditor matches is the
service date against the period the plan covered.

### 1.2 Near-universal — every source, every payer

Present in Optum's, Aetna's, Magellan's and state audit tools alike:

1. **Diagnosis, and goals that trace to it.** Optum: plans must include
   "measurable, time-limited goals and objectives directly linked to the
   identified diagnosis and functional impairments"
   ([Optum treatment record documentation requirements][optum-trdr],
   [Optum treatment record audit tool][optum-tool]) **[verified]**. Nevada
   Medicaid: "treatment planning is based upon the individual recipient's
   psychological assessment, diagnosis, reason for referral"
   ([NV fact sheet][nv-fact]) **[verified]**. On claims, "each CPT code should
   connect to a corresponding ICD-10 diagnosis code that justifies the medical
   necessity" ([Bonfire][bonfire]) **[single]**.

2. **Measurable, time-bound goals *and* objectives.** Optum requires "the
   participant's problems, needs, and strengths; measurable short and long-term
   goals; estimated time frames for goal attainment; medically necessary
   interventions; and discharge planning" ([Optum][optum-tool]) **[verified]**.
   Nevada distinguishes them cleanly: goals are "the larger, broader outcomes";
   objectives are "short-term steps"; **both** must be "specific, measurable
   (action oriented), achievable, realistic and time limited"
   ([NV fact sheet][nv-fact]) **[verified]**. Aetna, for the level of care where
   it is most explicit, wants "frequency, rate, symptom intensity or duration,
   or other objective measures of baseline levels recorded, and quantifiable
   criteria for progress established" ([Aetna audit tool][aetna-tool],
   [Aetna ABA][aetna-aba]) **[verified]** — note **baseline**, which nothing in
   the drafted schema can hold.

3. **Target dates.** "A clearly defined goal including a target date to
   accomplish it, such as 120 days or 15 visits" ([ICANotes audit
   checklist][ica-audit]) **[single, but consistent with (2)]**. Services billed
   after a plan's target date has passed "may be questioned because the record
   no longer demonstrates active treatment supported by a current treatment
   plan" ([ICANotes][ica-audit]) **[single]**.

4. **A stated review interval, and evidence reviews happened.** Optum: "the
   treatment plan is reviewed at regular intervals and updated with the
   participant's… participation" ([Optum][optum-tool]) **[verified]**. This is
   also the single most-failed accreditation standard in the space: Joint
   Commission CTS.03.01.03 ran a **61.69% noncompliance rate in 2020**, with the
   two named causes being goals that "were not measurable and did not or could
   not show progress" and goals "not reviewed at specific time frames as
   required" ([Joint Commission FAQ][tjc-faq], [PIMSY summary][pimsy])
   **[verified]**.

5. **Interventions, naming a modality.** Optum requires "specific interventions
   (modalities, techniques) used to achieve objectives" ([Optum][optum-tool])
   **[verified]**. Documentation should record "the therapeutic modality (CBT,
   DBT, supportive therapy)" ([Bonfire][bonfire]) **[single]**.

6. **Service frequency and duration.** MAC expectation as quoted above
   ([AAPC][aapc-psych]) **[verified]**; the diagnosis "must logically support
   the intensity and frequency of the psychotherapy provided"
   ([Bonfire][bonfire]) **[single]**.

7. **A dated revision history / a plan that is not stale.** "A technically
   complete progress note may support the service provided that day, but if the
   treatment plan no longer reflects the patient's current goals… the payer may
   determine there is no longer documentation supporting active treatment"
   ([NAMAS][namas]) **[verified]**. Nevada: "a Treatment Plan is a fluid
   document and needs to be reviewed/updated at regular intervals"
   ([NV fact sheet][nv-fact]) **[verified]**.

8. **Clinician signature, dated, with credential.** NCQA's medical-record
   guidelines: entries "should be dated and include the responsible
   clinician/staff's name who provided the service, professional degree, and
   relevant identification number if applicable"
   ([NCQA guidelines][ncqa-guidelines], [PrimeWest 2026 standards][primewest])
   **[verified]**. Medicare's rule is that services must be "authenticated by
   the author", signatures must be legible, and "the provider's full name and
   professional suffix (MD, DO, NP, etc.) must be readable"; credentials in a
   signature log are "encouraged but not required"
   ([Noridian][noridian], [CDPHP summary of CMS requirements][cdphp])
   **[verified]**.

### 1.3 Commonly expected — most payers, not all

- **Client participation and client signature.** Optum expects the plan
  "reviewed and updated with the patient", with "signature by both the provider
  and either the participant or parent/legal guardian"
  ([Optum][optum-tool]) **[verified]**. Nevada: recipients "are directly involved
  in the development of the treatment plan… and are required to sign"
  ([NV fact sheet][nv-fact]) **[verified]**. Audit tools look for "member
  signature with a statement that they participated in the treatment plan
  development and agree to participate in the treatment process"
  ([ICANotes][ica-audit], [Aetna][aetna-tool]) **[verified]**.
  Whether this binds a **solo commercial outpatient practice** is exactly the
  part that varies — the strongest wording appears in Medicaid, ABA and
  higher-level-of-care contexts. **Confirm with her payers (§8).**
- **Documented alternatives when a signature cannot be obtained.** Multiple
  jurisdictions accept a documented reason plus verbal/electronic assent: "if
  the counselor documents the reason the client's signature cannot be obtained,
  they may document the client's verbal or electronic written approval in lieu
  of the client's signature", and where a signature is required but refused,
  "the client plan shall include a written explanation of the refusal or
  unavailability" ([search summary of state regulations, incl.
  Ariz. Admin. Code R4-6-1102][az-code], [Headway][headway]) **[verified]**.
  This matters more than the signature requirement itself, because it is the
  affordance Apunta can honestly provide (§4).
- **Discharge / transition criteria.** Optum lists "discharge planning" as a
  plan component ([Optum][optum-tool]) **[verified]**; Aetna wants "planning for
  transition through the continuum of interventions, services and settings, as
  well as titration and discharge criteria" ([Aetna][aetna-tool]) **[single]**.
- **Strengths.** Optum and Nevada both name client (and family) strengths as a
  required plan component ([Optum][optum-tool], [NV][nv-fact]) **[verified]**.
- **Presenting problem / clinical rationale.** Universal in template guidance;
  it is what carries "expectation of improvement" ([AAPC][aapc-psych],
  [SimplePractice][simplepractice]) **[verified]**.

### 1.4 Varies enough that hard-coding it would be wrong

- **Review cadence.** Secondary sources converge on 30 days for
  residential/PHP, 60–90 days for IOP, "90 days for routine outpatient", and
  note that "many payers require a treatment plan update every 30 to 90 days for
  continued authorization" ([Behave Health][behave-plans], [NAMAS][namas])
  **[single, consistent]**. Joint Commission does not name an interval; it
  requires review "at specific time frames as required" by the organisation's
  own policy ([TJC FAQ][tjc-faq]) **[verified]**.
  → **Store the interval as data (row 12); do not hard-code 90 days.**
- **Whether a formal plan is required at all** for routine outpatient
  psychotherapy — Medicare has no universal requirement
  ([AAPC][aapc-psych]) **[verified]**; commercial contracts differ.
- **Outcome instruments (PHQ-9, GAD-7).** Widely recommended as the easiest
  route to "measurable" ([Blueprint][blueprint-anx], [Mentalyc][mentalyc-smart])
  **[verified]**, and Joint Commission has a standard on collecting outcome
  measures ([R3 Report 13][tjc-r3]) **[verified]** — but not a commercial
  requirement for a solo practice. M9 defers these correctly; §3.5 says how to
  defer them without blocking them.
- **Retention.** §5.

---

## 2. The golden thread — and whether it is the app's job

### 2.1 What it actually is, concretely

The golden thread is the expectation that four artefacts corroborate each
other, in this order: **diagnosis → plan → session note → claim**. Walk it as an
auditor does:

1. A claim for CPT 90834 on 2026-09-11 for John Smith, diagnosis F41.1.
2. The auditor asks for the record. Is there an assessment establishing F41.1
   with a clinical rationale?
3. Does the treatment plan in force on 2026-09-11 contain goals addressing
   F41.1, with interventions and a service frequency consistent with a weekly
   45-minute individual session?
4. Does the note for 2026-09-11 describe an intervention aimed at one of those
   goals, and the client's response to it?
5. Does the code billed match the service the note describes?

Break any link and the claim is unsupported. "Failing to connect the session to
the treatment plan is one of the most common reasons a therapy note fails a
payer audit" ([NAMAS][namas], [Mozu][mozu-golden]) **[verified]**. NCQA's
standard is the same idea in record-review language: documentation should
reflect "treatment interventions consistent with current treatment plans, goals,
and objectives" ([NCQA][ncqa-guidelines], [PrimeWest][primewest])
**[verified]**.

### 2.2 Is it the app's job? No — and the owner's decision costs less than it looks

**Answer: the golden thread is a property of the prose the clinician writes.
The app's obligation is to not obstruct it, and to put the plan where she can
see it while she writes. It is not something Apunta must compute, and in this
architecture Apunta computing it would produce nothing an auditor could see.**

Three reasons, in order of force:

**(a) Apunta is not the record.** Owner answer 3: notes are pasted into a
separate records system as plain text. The golden thread has to be legible in
**that** system, in the note's words. A `goal_id` foreign key linking a note row
to a plan-goal row lives in a local SQLite file no auditor will ever open, and
it does not survive `Ctrl-V` into a textarea. **A computed linkage that cannot
be pasted does not exist for audit purposes.** This is the decisive argument and
it is architectural, not clinical.

**(b) What is checked is writing, not data.** Auditors "check each note for
linkage to the treatment plan" ([NAMAS][namas]) — meaning the note says what was
worked on. A therapist "might write excellent session notes and still fail an
audit because those notes don't demonstrably link back to the treatment plan
goals" ([NAMAS][namas]) **[verified]**. The remedy is a sentence in the note, and
the sentence has to come from her, because under owner answer 7 the app may not
infer what a session was aimed at.

**(c) The one link Apunta genuinely touches is already handled.** If her rough
notes say "worked on the sleep goal", M3's faithfulness rules carry it into the
draft unchanged. That is the whole of the app's positive contribution, and it
requires no plan/note relation. Prep's side-by-side presentation — plan on one
side, recent material on the other — is a *reading aid for her thread-keeping*,
which is precisely the line M9 already draws.

So: **the packet's prohibition is compatible with the golden thread**, and this
should be recorded as a considered finding rather than left as an unexamined
owner preference. What she gave up is a convenience (a nudge that a goal has not
come up lately), not a compliance capability.

### 2.3 But one thing is being swept up by accident

M9's "No goal tracking" section forbids computing "a relationship between goals
and notes". A **stale-plan reminder** is not that. Comparing today's date to
`review_due` reads no note, quotes no note, and draws no connection between the
plan and the notes. It is arithmetic on a date **she** chose.

It also guards the single highest-consequence failure in §1.2 item 7 — services
rendered against a plan whose review date has passed, which is a documented
recoupment trigger ([ICANotes][ica-audit], [NAMAS][namas]) **[verified]** — and
it is the most-failed accreditation standard in the field ([TJC][tjc-faq]).

**Recommendation [inferred]:** build a passive, date-only indicator ("Plan
review was due 12 August"), and state explicitly in the packet that date
arithmetic on `review_due` is **not** goal tracking. Left ambiguous, a careful
implementer will read the prohibition literally and drop it, and the owner will
have lost something she never declined.

---

## 3. What the schema is missing

Read against `docs/PLAN.md` §3 and M9 deliverable 1.

### 3.1 `treatment_plans` — the plan-level fields that have nowhere to live

The drafted row is `id, patient_id, version, status, created_at, activated_at,
review_due, content (JSON), superseded_by`. Everything in §1 that is not a goal
must therefore live in `content`, and `content` is specified nowhere. **That is
how required fields go missing** — an untyped JSON blob has no migration, no zod
enforcement worth the name, and no guarantee the export renders it.

Recommended columns (types as SQLite affinities; ISO strings, per project
convention):

```
diagnoses            TEXT NOT NULL   -- JSON array of
                                     -- { code, system: 'icd-10-cm'|'dsm-5-tr',
                                     --   description, primary: boolean }
presenting_problem   TEXT            -- narrative, may be ''
strengths            TEXT            -- narrative, may be ''
modality             TEXT            -- "Individual psychotherapy (CBT)"
frequency            TEXT            -- "Weekly, 50 minutes"
discharge_criteria   TEXT            -- may be ''
effective_from       TEXT            -- DATE 'YYYY-MM-DD'
effective_to         TEXT            -- DATE, null while current
review_interval_days INTEGER         -- default from settings
clinician_name       TEXT            -- snapshot, see §4
clinician_credential TEXT            -- "LCSW"
clinician_licence    TEXT            -- nullable
clinician_npi        TEXT            -- nullable
attested_at          TEXT            -- UTC timestamp, null until activated
attestation_text     TEXT            -- the exact sentence she attested to
client_participation TEXT            -- 'not_recorded' | 'reviewed_with_client'
                                     -- | 'declined' | 'signed_elsewhere'
client_participation_on   TEXT       -- DATE
client_participation_note TEXT       -- reason when 'declined'
```

Four notes on these:

- **`diagnoses` is the big one.** Nothing in the entire Apunta data model holds
  a diagnosis today — `patients` has name and identifier only. Without it the
  plan cannot satisfy the most consistently stated payer requirement in §1.2,
  and every goal is unmoored from the thing that justifies treatment.
- **Diagnosis belongs on the plan version, not the patient [inferred].** A
  diagnosis changes; a payer-facing document has to state the diagnosis *as of
  that version*. Putting it on `patients` would silently rewrite history in
  superseded plans, which is precisely what versioning exists to prevent.
- **Store dates as dates.** `CLAUDE.md` says UTC ISO-8601 timestamps, and that
  is right for instants. `review_due`, `target_date`, `effective_from` are
  **calendar dates**. Store them `YYYY-MM-DD`. A due date stored as an instant
  moves by a day depending on the reader's timezone, and this app renders dates
  in local time in a browser.
- **`effective_from` / `effective_to`** make "what was the plan on 11 September"
  a range query rather than a walk down `superseded_by`, and they are what an
  auditor matches service dates against.

Keep `content` only if it holds genuinely free narrative; otherwise drop it.
Explicit columns are queryable, migratable, and can be made NOT NULL.

### 3.2 `plan_goals` — measurability is attached to the wrong object

The drafted row puts `measure` and `target_date` on the **goal** and leaves
`objectives (JSON array)` as opaque strings. Every source in §1.2 item 2 says
the opposite: the goal may be broad ("larger, broader outcomes"), and the
**objective** is the short-term step that must be specific, measurable and time
limited ([NV fact sheet][nv-fact], [Optum][optum-tool]) **[verified]**. As
drafted, the schema can express "the goal is measurable by X" but cannot express
a single measurable objective — the exact thing that gets audited.

Two options, both acceptable:

**(A) Structured JSON — recommended for v1.** Keep objectives inside the goal
row, but as zod-validated objects, never bare strings:

```
{ statement, measure, baseline, target_value, target_date,
  status: 'proposed'|'accepted'|'met'|'discontinued',
  source: 'model_suggested'|'clinician_authored' }
```

This is the right call *because of* owner decision 4: nothing computes across
objectives, so nothing needs to query them. Relational shape buys little here.

**(B) A `plan_objectives` table.** Correct, more code, and its advantage (query,
index, per-objective history) is exactly the advantage the no-tracking decision
retires.

**The cost asymmetry is the point.** Going from (A) to (B) later is a
mechanical migration. Going from *bare strings* to either is not: it means
parsing prose out of JSON in rows that are supposed to be immutable historical
records, on a machine with no cloud model, one practice's data, and no undo.
**Do not ship objectives as strings.**

Also add to `plan_goals`:

```
carried_from_goal_id TEXT   -- nullable FK to the previous version's goal
source               TEXT   -- 'model_suggested' | 'clinician_authored'
```

`carried_from_goal_id` is not a payer field — it is required by **M9's own
deliverable 4**, which promises a review flow "carrying goals forward, showing
what changed". With goal rows copied per version and no lineage column, "what
changed" can only be guessed by string similarity. This is a promise the
drafted schema cannot keep.

### 3.3 The diagnosis prohibition the packet is missing

M9's "Suggestions, not assertions" governs goals and is silent on diagnosis. It
must not stay silent. **A model that proposes an ICD-10 code is performing
exactly the inference owner answer 7 forbids** — and unlike a mis-worded
Assessment, a wrong code has billing consequences and reaches a payer.

**Recommendation:** diagnosis is typed by her, always, and the drafting prompt
receives it as **input** rather than producing it as output. Feeding the
diagnosis in is also the cheapest quality win available for the drafting prompt,
since "goals linked to the diagnosis" is the requirement being drafted toward.

### 3.4 Numbers are the part with no evidence behind them

The M9 evidence rule says a suggested goal carries "the evidence it came from —
note date and section, quoted". Applied to a **measurable** objective this
collides with reality: the target number is the part no note contains. Fixture
`02` says John is "getting like six, six and a half hours most nights now,
which is up from four when we started" — the model can cite a **baseline** of
four hours and a **current state** of six. It cannot cite a target of seven,
because she never said seven.

**Recommendation [inferred], consistent with owner answer 5 (blank, not
boilerplate):** a suggested objective may propose the *structure*, and may fill
`baseline` and `measure` **only from cited note text**. `target_value` and
`target_date` are left **empty** for her, and the UI shows them as deliberate
blanks. An invented target date is a directive fabrication in the document that
shapes future sessions — the failure mode M9's own preamble names as worse than
a fabricated sentence in a note.

### 3.5 Deferring outcome measures without blocking them

M9 puts "outcome measures (PHQ-9 and friends)" out of scope. Correct. But the
easiest route to a defensible measurable objective is an instrument
([Blueprint][blueprint-anx], [Mentalyc][mentalyc-smart]) **[verified]**, and
`measure` as free text plus `baseline`/`target_value` as free text already lets
her write "GAD-7, currently 14, target ≤ 7" without the app scoring anything.
Nothing to build; just do not narrow the fields such that it becomes impossible.

---

## 4. Signatures, in an app with no login

### 4.1 The problem stated honestly

Payers expect a plan "signed by the clinician responsible for the plan of care",
dated, with credentials, and in many contexts a client signature attesting
participation (§1.2 item 8, §1.3) **[verified]**. Medicare's framing is
**authentication**: the record must identify and authenticate its author
([Noridian][noridian], [CDPHP][cdphp]) **[verified]**. Under ESIGN/UETA a typed
name can be a legally valid signature, but only where four conditions hold:
"the signer must have intent to sign, all parties must consent to electronic
transactions, **the signature must be attributable to the specific signer**, and
the record must be retained and reproducible" ([Zentake][zentake],
[Accountable][accountable]) **[verified]**.

Apunta fails the attribution condition by design. There is no login, no user
accounts, no session identity, no audit trail of who was at the keyboard, and
(SQLCipher deferred, `docs/PLAN.md` §8) no at-rest protection on the file that
would store the artefact. Anyone with the laptop open can type any name on any
date. That is not an oversight to be worked around; it is the product decision.

### 4.2 The four options

| Option | What it gives | What it actually is |
| --- | --- | --- |
| **Typed name** | Looks like a signature; ESIGN-shaped | An unattributable string. Calling it a signature overstates it in the one document where overstatement is the whole risk |
| **Drawn signature** | Looks strongest | Worst of the four: stores a reusable image of a real person's handwritten signature in an unencrypted local SQLite file, and buys no more attribution than typing does |
| **Dated attestation** | Records a claim she is making, with a date | Honest. Not tamper-evident — local clock, editable file — and must not be described as more |
| **Defer to the records system** | Real signature where identity exists | Correct for the authoritative copy; the note already goes there (owner answer 3) |

### 4.3 Recommendation: attestation in Apunta, signature elsewhere

**Do both the third and fourth options, and label them accurately.**

1. **Clinician identity in Settings** — name, credential, licence number, NPI.
   Typed once. **Snapshot onto the plan row at activation** (table rows 4), never
   joined at render time: a superseded version must keep the credential she held
   when she wrote it.
2. **Clinician attestation at activation** — activating a version stamps
   `attested_at` and stores the exact `attestation_text` (e.g. "I authored and
   reviewed this treatment plan."). Store the sentence, not a flag, so an export
   five years from now renders what was attested rather than today's wording.
3. **Client participation as a recorded state, not a signature** —
   `reviewed_with_client` + date is the common case; `declined` + reason is the
   case the regulations explicitly accommodate (§1.3); `signed_elsewhere` is the
   honest state when the signed copy lives in the records system.
4. **Export renders a signature block** — printed name, credential, licence/NPI,
   date, plus ruled lines for clinician and client signature. It travels to the
   place where signing actually happens.
5. **Say so in the UI.** "Attested in Apunta — sign the copy in your records
   system." One line. It costs nothing and it is the difference between a tool
   that is honest about its guarantees and one that is not.

Do **not** build the drawn signature. If signature capture is ever genuinely
required in Apunta, it arrives with the deferred passcode + SQLCipher work, not
before — a signature image under no lock is a liability, not a control.

### 4.4 What an unsigned Apunta plan is and is not good for

**Good for:** her own working document; drafting and revising; producing the
text that goes into the record system; giving a dated revision history when a
payer asks what the plan was in March; printing a clean document to sign; being
the place the thinking happens.

**Not good for:** standing alone as the signed plan of record in an audit;
proving who authored it; proving when it was authored (local clock, mutable
file); proving the client participated; being the copy she points a payer at if
the records system holds a different one. **[inferred, but directly from §4.1]**

---

## 5. Retention

**Not legal advice.** Retention periods for clinical records are set by state
law, the licensing board, and sometimes payer contract — and they differ.
Reported examples: several states (California, North Carolina, Tennessee,
Connecticut are cited) at seven years after the professional relationship ends;
Pennsylvania at five years since last contact; minors' clocks typically not
starting until the age of majority, which can push a childhood record past
twenty years ([LegalClarity][legalclarity], [Grow Therapy][grow])
**[single, consistent]**. APA's *Record Keeping Guidelines* — professional
guidance, not law — suggest retaining full records "until 7 years after the last
date of service delivery for adults or until 3 years after a minor reaches the
age of majority, whichever is later" ([APA][apa-rk], [APA Services][apa-svc])
**[verified]**. Where several rules apply, the longest governs
([Grow Therapy][grow]) **[single]**. A treatment plan is part of the clinical
record and inherits whichever period applies.

**What the app should therefore make possible, rather than assume [inferred]:**

- **Never delete anything on its own.** No auto-purge, no retention timer, no
  archive-on-export. Encoding a period is worse than encoding none, because a
  wrong period destroys records that were still required. This also matches
  owner answer 10 ("she keeps everything") — the default is already right; make
  it a stated property rather than an accident.
- **Superseded plan versions are permanent.** No compaction, no garbage
  collection of old versions. The revision history *is* the compliance artefact.
- **Deletion must be possible, deliberate, and per-patient.** Retention rules
  also *end*, and destruction is itself a board-complaint area
  ([HireGaynell][hiregaynell]) **[single]**. A deliberate per-patient purge that
  records that it happened is the right shape; it does not need to be v1.
- **Export must outlive the app.** M7's zip plus a plain-text plan is the real
  retention story: obligations measured in decades outlast SQLite schemas, Node
  versions and this codebase. This strengthens the point already made in
  `docs/feedback/2026-08-22-owner-answers.md` §3 — the machine holds a second
  complete copy with no institutional backup behind it.
- **Do not put a retention setting in Settings for v1.** It invites a wrong
  number to be typed once and trusted forever.

---

## 6. Measurable objectives, practically

"Measurable" is the most-failed requirement in the field — Joint Commission's
CTS.03.01.03 noncompliance rate was 61.69%, and the first named cause was goals
that "were not measurable and did not or could not show progress"
([TJC FAQ][tjc-faq], [PIMSY][pimsy]) **[verified]**.

**All material below is fabricated** for John Smith and Maria Ruiz, drawing on
the existing synthetic fixtures (`e2e/fixtures/eval/01`, `02`, `04`, `07`).

### 6.1 The seven rules (few-shot preamble material)

1. **The subject is the client, and the verb is observable.** If the therapist
   is the subject, it is an intervention, not an objective.
2. **It carries a number** — a count, a frequency, a duration, or a rating the
   client supplies.
3. **It names where the number comes from** — "his sleep log", "count of
   completed thought records", "her report at the start of session". The
   *measure* is a separate thing from the *target*.
4. **It carries a date, and a persistence window** — "for three consecutive
   weeks, by 15 November". Without the window, one good week ends treatment.
5. **It states the baseline where one is known.** A target with no baseline
   cannot be read as progress.
6. **It uses the client's own words where they exist**, in clinical register.
7. **It never contains** "as clinically indicated", "as needed", "continue to",
   "work on", "explore", "process", "improve".

### 6.2 John Smith — sleep and intrusive thoughts

**Goal (broad, legitimately not measurable itself):** John sleeps well enough to
get through a workday without the afternoon crash he described at intake.

**Objectives that satisfy the requirement:**

- John will report **6 or more hours of sleep on at least 5 of 7 nights, for 3
  consecutive weeks**, by **2026-11-15**. *Baseline:* 4 hours most nights at
  intake. *Measure:* his weekly sleep log, reviewed in session.
- John will **complete a thought record on at least 3 days a week for 4
  consecutive weeks**, by **2026-10-18**. *Baseline:* records agreed but not
  completed in the first six weeks. *Measure:* count of completed records
  brought to session.
- John will **use paced breathing before at least 2 work meetings a week for 6
  weeks**, by **2026-10-04**. *Baseline:* using it before some meetings, not
  tracked. *Measure:* his report, tallied weekly.

**Near-misses, and what fails in each:**

- *"John will sleep better."* — no number, no date, no measure. This is the
  goal, offered as an objective.
- *"John will reduce intrusive thoughts."* — direction without magnitude.
  Nothing distinguishes met from unmet, ever.
- *"John will continue CBT for insomnia."* — the therapist is the actor. This
  belongs in `interventions`.
- *"John will feel less anxious before meetings by December."* — dated but
  unmeasurable. Fixable: "will rate pre-meeting distress at 4 or below (0–10) for
  3 of 4 consecutive meetings".
- *"John will report 6 or more hours of sleep."* — **the commonest near-miss,
  because it looks right.** Measurable, but no date and no persistence window.
- *"John will improve sleep hygiene as clinically indicated."* — "as clinically
  indicated" defers the criterion forever. This phrase alone is an audit finding.

### 6.3 Maria Ruiz — grief, roughly six months out

**Goal:** Maria re-engages with the parts of her life she withdrew from after
her husband's death.

**Objectives that satisfy the requirement:**

- Maria will take part in **at least one planned social contact outside her
  household each week — the Sunday walk with her sister counts — for 6
  consecutive weeks**, by **2026-10-11**. *Baseline:* most Sundays spent in bed
  through July. *Measure:* her report at the start of each session.
- Maria will **complete the unsent-letter exercise and bring it to session** by
  **2026-09-13**. *Measure:* completed and discussed in session. (A
  single-occurrence objective is legitimately measurable: done or not done, by a
  date.)
- Maria will report **getting out of bed within 30 minutes of waking on at least
  4 mornings a week, for 4 weeks**, by **2026-10-25**. *Baseline:* "mornings are
  the hardest part". *Measure:* her report, reviewed weekly.

**Near-misses, and what fails in each:**

- *"Maria will process her grief."* — unobservable, no endpoint, no date.
- *"Maria will feel less numb."* — clinically the right target — she said she'd
  rather be sad than nothing — but as written there is no baseline and no scale.
  Fixable: a 0–10 "feeling present" rating she gives, or a behaviour count.
- *"Therapist will provide supportive therapy and grief psychoeducation
  weekly."* — an intervention wearing an objective's clothes. An objective whose
  subject is the therapist can never be met by the client.
- *"Maria will improve social functioning as clinically indicated."* — vague
  construct plus the forbidden phrase.
- *"Maria will attend weekly sessions."* — attendance is a condition of
  treatment, not an objective. Payers read attendance objectives as filler.
- *"Maria will reduce grief symptoms by 50%."* — numerically shaped and
  therefore convincing, but 50% of what, measured how? A percentage with no
  instrument behind it is worse than an honest qualitative target, because it
  looks defensible until someone asks.

### 6.4 Two notes for whoever writes the drafting prompt

- Feed **rules 1–7 plus 2–3 of these pairs** as few-shot material. The
  near-misses matter as much as the good examples; `rationale.md` already
  establishes that examples move a small model more than rules do, and
  "measurable" is a shape a model imitates rather than a rule it applies.
- **The model must not invent the number.** §3.4. It may cite a baseline from a
  note; the target and the date are hers. A fabricated "50%" is the single most
  plausible-looking failure this feature can produce.

---

## 7. What the M9 packet gets wrong or leaves out

Concrete edits to `docs/agents/M9-treatment-plan.md`.

1. **§Owner decisions item 2 — soften and sharpen the claim.** "Built to the
   stricter standard" currently names five things (measurable goals, target
   dates, review dates, dated revision history, export) and misses diagnosis,
   modality, frequency, and the identity/attestation block. Replace with a
   pointer to §0 of this document, and add the framing from §1.1: the plan is
   **produced on demand, for the version in force on a given service date** —
   not submitted on a form.

2. **§Deliverables 1, `treatment_plans` — add the columns in §3.1**, and specify
   or drop `content (JSON)`. An unspecified JSON blob is where required fields
   go to die.

3. **§Deliverables 1, `plan_goals` — objectives must be structured objects, not
   strings** (§3.2), with `measure`, `baseline`, `target_value`, `target_date`
   and `status` per objective. State explicitly that **"measurable" attaches to
   the objective, not the goal** — the goal is allowed to be broad.

4. **§Deliverables 1 — add `carried_from_goal_id` and `source` to
   `plan_goals`.** Deliverable 4 promises the review flow will show "what
   changed"; without lineage that is unimplementable.

5. **§Suggestions, not assertions — add a diagnosis clause** (§3.3): the
   diagnosis is typed by the therapist and passed to the model as input. The
   model may never propose a diagnosis or a code. This is the same rule as owner
   answer 7, applied to the field where getting it wrong reaches a payer.

6. **§Suggestions, not assertions — add the numbers clause** (§3.4): a suggested
   objective may fill `baseline` and `measure` only from cited note text;
   `target_value` and `target_date` are left blank for her, rendered as
   deliberate blanks in the spirit of owner answer 5.

7. **§No goal tracking — add one sentence** (§2.3): comparing today's date to
   `review_due` is date arithmetic, not goal tracking, and a passive
   review-overdue indicator is in scope. Without this the prohibition reads as
   forbidding it.

8. **Add a deliverable: plan identity and attestation** (§4.3) — clinician name,
   credential, licence, NPI in Settings; snapshotted onto the plan version at
   activation; `attested_at` + stored attestation sentence; client-participation
   state with date and reason. Plus the honest UI label.

9. **§Deliverables 6, Export — specify the document.** "Exports as a clean
   document" is under-specified for something asserted to be payer-facing. It
   must render: patient identifier, plan version and effective dates, diagnosis
   list, presenting problem, strengths, modality and frequency, each goal with
   its objectives (measure, baseline, target date), interventions, discharge
   criteria, review interval and next review date, revision history, and the
   signature block. Also note that unlike a note (one textarea at the far end,
   owner answer 9), a plan is **printed or uploaded** — so plain text alone is
   insufficient; a print stylesheet is the cheap correct answer.

10. **§Acceptance criteria — add three.** (a) The export contains every field in
    §0 marked *Required*, asserted field-by-field. (b) A superseded version's
    rendered document is byte-stable after later versions are created
    (immutability). (c) A plan with a passed `review_due` surfaces the passive
    indicator and **no** note-derived analysis — the test that pins §2.3 against
    the no-tracking rule in both directions.

11. **§Out of scope — qualify the outcome-measures line** (§3.5). Deferring
    instrument scoring is right; the fields must still permit her to name an
    instrument and type a number, or the most defensible objectives she could
    write become unrepresentable.

12. **Types:** `review_due`, `target_date`, `effective_from`, `effective_to` are
    calendar dates (`YYYY-MM-DD`), not UTC instants. Say so in the packet, since
    `CLAUDE.md` says timestamps everywhere and the default will otherwise win.

---

## 8. Confirm with her payers or board — do not take these from a document

1. **Does any payer she bills require a client signature on the treatment plan,
   and at what interval?** The strongest signature language I found sits in
   Medicaid, ABA and higher-level-of-care contexts; whether it binds a solo
   commercial outpatient practice is contract-specific (§1.3). This changes
   whether §4's client-participation field is a nicety or load-bearing.
2. **What review interval do her contracts expect?** 90 days is the common
   secondary answer for routine outpatient, but it is a vendor consensus, not a
   rule (§1.4). It becomes the default for `review_interval_days`.
3. **Her state's retention period, and her board's** (§5). Not for the app to
   encode — for her to know, and for the export/backup story to serve.
4. **Whether her records system already holds the signed plan.** If it does,
   Apunta's role is drafting only, §4 gets simpler, and the export becomes the
   whole payer-facing story. **This is the highest-value question in the list**
   and it is one sentence to ask.
5. **Her credential, licence number and NPI as she wants them printed** — the
   Settings values in §4.3.

---

## Sources

Payer, regulator and accreditor documents (primary, read via search extracts —
see the method note; none could be fetched in full):

- Optum Behavioral Health, *Treatment Record Documentation Requirements* —
  [providerexpress.com][optum-trdr]
- Optum Behavioral Network Services, *Treatment Record Audit Tool* / MD Program
  Quality Improvement Self-Assessment Tool, 01.2024 — [optum.com][optum-tool]
- Aetna Behavioral Health, *Treatment Record Review* criteria and audit tool —
  [aetna.com][aetna-tool], [ABA treatment request][aetna-aba]
- Aetna Better Health Louisiana, *Behavioral Health Provider Audit Tool
  Elements* — [aetnabetterhealth.com][aetna-la]
- Magellan, *Provider Guide: Treatment Record Review and Clinical
  Documentation* — [magellanoflouisiana.com][magellan-trr]
- NCQA, *Guidelines for Medical Record Documentation* (2018) —
  [ncqa.org][ncqa-guidelines]; PrimeWest, *2026 Mental Health Record
  Documentation Standards* — [primewest.org][primewest]
- The Joint Commission, *Treatment Plans — Care Plan Requirements* FAQ
  (CTS.03.01.03) — [jointcommission.org][tjc-faq]; *R3 Report Issue 13, Revised
  Outcome Measures Standard for Behavioral Health Care* — [R3 13][tjc-r3]
- Nevada Medicaid, *Outpatient Mental Health Treatment Plan Fact Sheet* (2018) —
  [medicaid.nv.gov][nv-fact]
- Colorado HCPF, *Outpatient Behavioral Health Services Audit Tool*, eff.
  2024-07-01 — [hcpf.colorado.gov][co-audit]
- Washington HCA, *Providing and Documenting Medically Necessary Behavioral
  Health Services* — [hca.wa.gov][wa-hca]
- Philadelphia CBH, *Treatment Planning Guide* (2017) — [dbhids.org][cbh]
- Arizona Admin. Code R4-6-1102, *Treatment Plan* — [law.cornell.edu][az-code];
  55 Pa. Code § 5200.31, *Treatment planning* —
  [pacodeandbulletin.gov][pa-code]
- Medicare signature requirements: Noridian, *Medical Documentation Signature
  Requirements* — [noridianmedicare.com][noridian]; *Complying with Medicare
  Signature Requirements* (CMS MLN, via CDPHP) — [cdphp.com][cdphp];
  Palmetto GBA, *Signature Requirements* — [palmettogba.com][palmetto]
- APA, *Record Keeping Guidelines* — [apa.org][apa-rk]; APA Services,
  *Pointers for psychologists on client record retention* —
  [apaservices.org][apa-svc]

Professional and vendor secondary sources (useful, not authoritative):

- AAPC, *Meet Documentation Requirements for Psychotherapy Services* —
  [aapc.com][aapc-psych]; *Ins and Outs of Behavioral Health Documentation
  Audits* — [aapc.com][aapc-audit]
- NAMAS, *Behavioral Health Auditing: Looking Beyond the Individual Progress
  Note* — [namas.co][namas]
- ICANotes, *Documentation Audit Checklist for Behavioral Health* (2026-04-23) —
  [icanotes.com][ica-audit]; *Golden Thread Documentation for Mental Health
  Clinicians* (2025-10-20) — [icanotes.com][ica-golden]
- Mozu Health, *Golden Thread Documentation Template for Insurance Audits* —
  [mozuhealth.com][mozu-golden]
- Mentalyc, *Medical Necessity Documentation* — [mentalyc.com][mentalyc-mn];
  *How to Write SMART Therapy Goals & Objectives* — [mentalyc.com][mentalyc-smart]
- Blueprint, *Treatment Goals for Anxiety: A Therapist's Guide* —
  [blueprint.ai][blueprint-anx]
- Bonfire, *Psychotherapy Billing: CPT & ICD-10 Accuracy* —
  [bonfirerevenue.com][bonfire]
- SimplePractice, *Treatment plan templates* —
  [simplepractice.com][simplepractice]; Headway, *How to write a mental health
  treatment plan* — [headway.co][headway]; Behave Health, *Behavioral Health
  Treatment Plan Templates* — [behavehealth.com][behave-plans]
- PIMSY, *What Are the Joint Commission Standards?* — [pimsyehr.com][pimsy]
- E-signature law: Zentake, *E-Signature Laws for Healthcare: ESIGN Act, UETA &
  HIPAA Compliance (2026)* — [zentake.com][zentake]; Accountable, *HIPAA
  Compliant Electronic Signatures* — [accountablehq.com][accountable]
- Retention: LegalClarity, *How Long Do Mental Health Records Need to Be Kept?* —
  [legalclarity.org][legalclarity]; Grow Therapy, *Records retention policies for
  private mental health practice* — [growtherapy.com][grow]; HireGaynell,
  *Therapy records retention requirements* — [hiregaynell.com][hiregaynell]

[optum-trdr]: https://www.providerexpress.com/content/dam/ope-provexpr/us/pdfs/clinResourcesMain/guidelines/netwManual/iTRDR.pdf
[optum-tool]: https://mdbh.optum.com/content/dam/ops-maryland/documents/provider/providerresources/audits/Program%20Quality%20Improvement%20Self%20Assessment%20Tool_MD%20Individual%20Practitioner_01.2024.pdf
[aetna-tool]: https://www.transformationsllc.net/wp-content/uploads/2012/06/audit-tool-for-clinical-documentation-Aetna-MHNet.pdf
[aetna-aba]: https://www.aetna.com/content/dam/aetna/pdfs/health-care-professionals/applied-behavioral-analysis.pdf
[aetna-la]: https://www.aetnabetterhealth.com/content/dam/aetna/medicaid/louisiana/pdf/Behavioral%20Health%20Provider%20Audit%20Tool%20Elements.pdf
[magellan-trr]: https://www.magellanoflouisiana.com/documents/2021/05/trr-provider-guide.pdf/
[ncqa-guidelines]: https://wpcdn.ncqa.org/www-prod/wp-content/uploads/2018/07/20180110_Guidelines_Medical_Record_Documentation.pdf
[primewest]: https://www.primewest.org/delegate/resource/document/e07aa9a6-89ca-4995-9e8e-12217bd73fd5
[tjc-faq]: https://www.jointcommission.org/standards/standard-faqs/behavioral-health/care-treatment-and-services-cts/000002452/
[tjc-r3]: https://www.jointcommission.org/en-us/standards/r3-report/r3-report-13
[nv-fact]: https://www.medicaid.nv.gov/Downloads/provider/Treatment_Plan_Fact_Sheet_2018-0518.pdf
[co-audit]: https://hcpf.colorado.gov/sites/hcpf/files/OP%20BH%20Audit%20Tool%202024_FINAL.pdf
[wa-hca]: https://www.hca.wa.gov/assets/billers-and-providers/medical-necessity-assessments-part-one.pdf
[cbh]: https://dbhids.org/wp-content/uploads/1970/01/Treatment-Planning-Guide.pdf
[az-code]: https://www.law.cornell.edu/regulations/arizona/Ariz-Admin-Code-SS-R4-6-1102
[pa-code]: https://www.pacodeandbulletin.gov/Display/pacode?file=%2Fsecure%2Fpacode%2Fdata%2F055%2Fchapter5200%2Fs5200.31.html
[noridian]: https://med.noridianmedicare.com/web/jfb/cert-reviews/signature-requirements
[cdphp]: https://www.cdphp.com/-/media/files/providers/toolkits/medical-records/medical-records_complying-with-medicare-signature-requirements.pdf
[palmetto]: https://www.palmettogba.com/palmetto/jmb.nsf/DIDC/8EEM4Q2610~Comprehensive%20Error%20Rate%20Testing%20(CERT)~Documentation
[apa-rk]: https://www.apa.org/practice/guidelines/record-keeping
[apa-svc]: https://www.apaservices.org/practice/update/2008/09-30/client-record-retention
[aapc-psych]: https://www.aapc.com/blog/88200-meet-documentation-requirements-for-psychotherapy-services/
[aapc-audit]: https://www.aapc.com/blog/84189-ins-and-outs-of-behavioral-health-documentation-audits/
[namas]: https://namas.co/behavioral-health-audits-looking-beyond-the-individual-progress-note/
[ica-audit]: https://www.icanotes.com/2026/04/23/documentation-audit-checklist/
[ica-golden]: https://www.icanotes.com/2025/10/20/golden-thread-documentation-mental-health/
[mozu-golden]: https://mozuhealth.com/blog/golden-thread-documentation-insurance-audits
[mentalyc-mn]: https://www.mentalyc.com/blog/medical-necessity-documentation-utilization-review-and-authorizations
[mentalyc-smart]: https://www.mentalyc.com/blog/smart-goal-in-therapy
[blueprint-anx]: https://www.blueprint.ai/blog/treatment-goals-for-anxiety-a-therapists-guide
[bonfire]: https://www.bonfirerevenue.com/psychotherapy-billing-a-guide-to-cpt-and-icd-10-accuracy/
[simplepractice]: https://www.simplepractice.com/blog/treatment-plan-templates/
[headway]: https://headway.co/resources/therapy-treatment-plan
[behave-plans]: https://behavehealth.com/treatment-plans
[pimsy]: https://pimsyehr.com/joint-commission-standards-jcaho-standards/
[zentake]: https://www.zentake.com/legal/e-signature-laws
[accountable]: https://www.accountablehq.com/post/hipaa-compliant-electronic-signatures-requirements-ueta-esign-alignment-and-baa-checklist
[legalclarity]: https://legalclarity.org/how-long-do-mental-health-records-need-to-be-kept/
[grow]: https://growtherapy.com/blog/records-retention/
[hiregaynell]: https://www.hiregaynell.com/blog/therapy-records-retention-requirements-how-long-to-keep-client-records-and-the-destruction-mistakes-that-trigger-board-complaints

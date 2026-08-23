# M9 — Treatment plan + session preparation

**Depends on:** M3 (drafting) and M4 (the plan editor reuses the refine chat's
streaming and accept/reject patterns). Independent of M5 and M6.

## Goal

Two features that support the work *around* a session rather than the note
that follows it:

- **The treatment plan** — a versioned, per-patient clinical document. Goals,
  what is being done about each, how progress is measured. Drafted by the
  model from existing notes, then edited and owned by the therapist.
- **Session preparation** — a briefing generated on demand before a session,
  reading the active plan and recent notes so she walks in oriented.

They are deliberately separate objects. The plan is a record she authors. Prep
is a reading aid generated on demand. Conflating them is the main way this goes
wrong.

## Owner decisions (2026-08-22)

Four answers shape this packet. Two went against the recommendation offered,
and those two are the ones to read carefully.

1. **The model drafts the plan; she edits it.** She chose this over authoring
   it herself, knowing the risk was named. See *Suggestions, not assertions*
   below — that constraint is how this is made safe, and it is not optional.
2. **The plan is both a working document and a payer-facing one.** So it is
   built to the stricter standard: measurable goals, target dates, review
   dates, a dated revision history, and export. The daily view must not feel
   like a compliance form.
3. **A prep briefing is ephemeral by default, with a save button.**
4. **The plan does not touch note drafting, and nothing tracks goals against
   notes.** She chose this over the offered middle option of flagging
   unaddressed goals. Respect it literally — see *No goal tracking* below.

## Suggestions, not assertions

A note states what happened; inventing there is a straightforward wrong. A
plan states what is *intended*, and proposing is the point of asking the model
to draft one — so the faithfulness rule from `docs/note-instructions/` cannot
transfer unchanged. It becomes this instead:

- A drafted plan arrives as **unaccepted suggestions**. Nothing is in the plan
  until she accepts it. The store distinguishes accepted content from proposed
  content; the UI never renders them alike.
- Every suggested goal carries **the evidence it came from** — note date and
  section, quoted. A suggestion with no citable evidence is not offered.
- She accepts, edits, or discards each one. Editing an accepted goal is
  ordinary document editing and the model is not involved.
- The model may **never** silently revise an accepted goal. A later re-draft
  proposes additions beside the plan; it does not rewrite it.

This is what makes "the model drafts it" compatible with the rest of the
project. A directive document that quietly acquires goals nobody set is a
worse failure than a fabricated sentence in a note, because it shapes future
sessions.

## No goal tracking

She declined the offer to flag goals that have not come up recently. That
covers **prep as well as drafting** — it was a choice about the app not
drawing connections between the plan and the notes on her behalf.

So: prep presents the plan and presents the recent material, and she does the
connecting. Prep must not compute coverage, count sessions since a goal was
mentioned, rank goals by neglect, or say a goal is being missed. Presenting
the two side by side is the feature; analysing one against the other is the
thing she turned down.

Worth revisiting once she has used it, and only on her say-so.

**One explicit carve-out.** A reminder that a plan's `review_due` has passed is
date arithmetic on the plan itself — it reads no note and draws no connection
between the two. It is permitted, and it should exist: services rendered
against a lapsed plan is the highest-consequence failure in this area, and the
"no goal tracking" rule above would otherwise forbid the guard against it by
accident. The rule is about the app not connecting *goals to notes*, not about
the app forgetting how dates work.

**On the "golden thread"** — the expectation that diagnosis, plan, notes and
billing corroborate each other — the research is clear that it is not the
app's job, for an architectural reason rather than a clinical one: the notes
are pasted as plain text into a separate records system, so a `goal_id`
linking a note row to a goal row would live in a local SQLite file no auditor
will ever see, and would not survive the paste. What is actually checked is
whether the note *text* references the plan's goals, which is prose she writes.
Her decision costs her a convenience, not a compliance capability.

## What the payer standard actually requires

`docs/research/m9-plan-requirements-2026-08.md` researched the standard this
packet asserts. **Read it before touching the schema** — the tables below were
drafted before it existed and were missing three things that cannot be
backfilled cheaply. Note its method caveat: outbound fetches were blocked, so
findings come from search extracts of the named primary documents and are
tagged `[verified]` / `[single]` / `[inferred]`. Treat `[inferred]` items as
things the owner confirms with her own payer, not as settled fact.

The three that change the schema:

1. **Diagnosis.** Nothing in Apunta's data model holds one — `patients` has a
   name and an identifier. Diagnosis is the anchor of medical necessity and the
   most consistently stated payer requirement; goals are expected to link to
   it. It belongs on the **plan version**, not the patient, or a superseded
   plan silently rewrites what the diagnosis was at the time. **The model must
   never propose a diagnosis or a code** — an ICD-10 code from a model is
   precisely the inference the owner ruled out, with billing consequences
   attached.
2. **Service modality and frequency**, at plan level. Currently implicit
   inside per-goal interventions, which is not where an auditor looks.
3. **Clinician identity and attestation**, snapshotted onto the version at
   activation — name, credential, licence, NPI — plus an attestation date and a
   recorded client-participation state.

And one that is a design error rather than an omission: **objectives are
drafted as bare strings in a JSON array, so the schema cannot express a
measurable objective at all.** Measurability attaches to the objective, not the
goal. Objectives become objects with a statement, a baseline, a measure, and
their own target date. Goals also need `carried_from_goal_id` — deliverable 4
promises to show what changed across a review, and that lineage does not exist
without it.

## Signatures, given an app with no accounts

Payers commonly expect a signed plan. Apunta has no login, no user accounts and
no audit trail, by design — so under ESIGN/UETA it cannot make a typed name
*attributable to the signer*, which is the condition that makes an electronic
signature mean anything. A drawn signature is strictly worse: it stores a
reusable signature image in an unencrypted local file and buys no attribution.

So Apunta captures a **dated attestation**, and the signature itself belongs to
the records system where the note already goes. Clinician identity lives in
Settings and is snapshotted onto the version at activation; client
participation is a recorded state (`reviewed_with_client`, `declined` with a
reason, `signed_elsewhere`) because the regulations accommodate documented
alternatives; export renders a printable signature block. Label it honestly in
the UI: *"Attested in Apunta — sign the copy in your records system."*

**Ask her first:** whether her records system already holds the signed plan. A
yes makes this whole area simpler.

## The context problem (read before designing prep)

Prep wants to read several notes. The model has a 16K context, and **Ollama
truncates an over-long prompt from the head** — dropping the instructions
while keeping the material (`docs/research/m3-preflight-2026-08.md`). Feeding
six full notes in one call would silently produce exactly the confident
invention this project exists to prevent, with nothing in the response to show
for it.

So prep is two-stage: summarise each note **individually** into a small
structured object, then compose the briefing from those objects. Each stage
stays far inside the context, and `prompt_eval_count` is checked on every call
as M3 established. Cap the lookback (a setting, default 5 notes) and say in
the UI how far back it read.

## Deliverables

1. **Schema** (`server/migrations/`):
   - `treatment_plans` — id, patient_id, version (int), status
     (`draft|active|superseded`), created_at, activated_at (nullable),
     review_due (nullable date), content (JSON), superseded_by (nullable),
     **diagnoses** (JSON — code, system, description, primary flag),
     **modality** and **frequency** (TEXT), **clinician** (JSON — name,
     credential, licence, NPI, snapshotted at activation), **attested_at**
     and **client_participation** (`reviewed_with_client|declined|signed_elsewhere`
     with an optional reason), effective_from / effective_to.
     A plan review creates a new version; the previous row stays. "What was
     the plan in March" is a question that gets asked, and payer-facing
     documents need a dated revision history — which is also why diagnosis
     and clinician identity live on the version rather than the patient.
   - `plan_goals` — id, plan_id, ordinal, statement, objectives (JSON array of
     **objects**: statement, baseline, measure, target_date — not bare
     strings, since measurability attaches to the objective),
     interventions (JSON array), target_date (nullable), status
     (`proposed|accepted|met|discontinued`), evidence (JSON — note ids with
     quoted excerpts), carried_from_goal_id (nullable — lineage across a
     review), created_at. `proposed` is the unaccepted state above; only
     `accepted` and later states are part of the plan.
   - `session_briefs` — id, patient_id, generated_at, content (JSON),
     source_note_ids (JSON), saved (bool). Rows exist only once she saves;
     an unsaved brief is never written.
2. **Shared schemas** in `shared/` for all three, plus the LLM output shapes
   for plan drafting and note summarisation. Same treatment as every other
   LLM output: schema-enforced, then re-validated server-side.
3. **API**:
   - `GET /api/patients/:id/plan` — the active plan with goals;
     `?version=` for a historical one; `GET .../plan/versions` lists them.
   - `POST /api/patients/:id/plan` — start a new version (a review).
   - `PATCH /api/plans/:id/goals/:goalId` — accept, edit, discontinue, mark
     met. `POST` and `DELETE` for adding and removing goals by hand.
   - `POST /api/patients/:id/plan/suggest` (SSE) — drafts proposed goals from
     notes, streaming, each with evidence. Never writes accepted content.
   - `POST /api/patients/:id/prep` (SSE) — streams the briefing. Returns it;
     persists nothing.
   - `POST /api/patients/:id/prep/save` — persists a brief she chose to keep.
4. **Plan UI**: a per-patient Plan view beside Notes. Accepted goals read as a
   clean clinical document; proposed goals sit visibly apart with their
   evidence, and accept/edit/discard on each. Review flow: "Start a review"
   creates a new version, carrying goals forward, showing what changed.
   Version history is reachable and read-only.
5. **Prep UI**: a Prepare action on a patient. Opens a reading view — not an
   editor — that streams in. Every line carries the note date it came from,
   clickable through to that note. A Keep button; nothing saved otherwise.
   State plainly how many notes it read and how far back.
6. **Export**: the plan is payer-facing, so it exports as a clean document
   (plain text for clipboard per the owner's answer 3, and the M7 zip should
   include plans alongside notes).

## Acceptance criteria

- Integration: suggest → proposed goals persisted with evidence, plan
  unchanged; accept → goal becomes accepted; a second suggest run does not
  modify accepted goals; new version supersedes and carries goals forward;
  historical versions remain readable.
- Integration: prep with 0 notes, 1 note, and more notes than the cap;
  assert the per-note stage runs separately and no single call approaches the
  context limit; assert nothing is persisted unless saved.
- The model never proposes a diagnosis or an ICD-10 code: assert it, do not
  merely instruct it. That is billing-consequential inference, and the schema
  for plan suggestion must not contain a diagnosis field at all.
- The streaming endpoints get a **real-socket test**, not only `app.inject` —
  see `server/src/routes/generate.test.ts`, and the SSE trap in
  `server/src/http/sse.ts` that injected tests could not catch.
- Playwright (fake mode): suggest a plan, accept one goal, discard another,
  edit a third; run a review and see the old version preserved; generate a
  prep briefing, follow a citation to its note, save it.
- No note content in logs, errors, or error `detail` — the plan and prep
  paths carry more of it than anything built so far.
- Baseline suite green.

## Out of scope

Progress-toward-goal scoring, outcome measures (PHQ-9 and friends),
appointment scheduling, reminders, and anything that computes a relationship
between goals and notes. The last one is an owner decision, not an oversight.

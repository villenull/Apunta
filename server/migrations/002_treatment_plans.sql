-- The treatment plan, its goals, and saved session briefings (M9).
--
-- Three things in here are not obvious from the table names.
--
-- 1. Everything payer-facing lives on the *version*, not on the patient:
--    diagnosis, modality, frequency, clinician identity, attestation. A
--    diagnosis on `patients` would silently rewrite what the diagnosis was at
--    the time whenever it changed, which is exactly what versioning exists to
--    prevent (docs/research/m9-plan-requirements-2026-08.md §3.1).
-- 2. `plan_goals.status = 'proposed'` is a model suggestion and is NOT part of
--    the plan. `accepted_at` is set if and only if it has left that state, so
--    no code path can produce a goal that is half-accepted.
-- 3. Dates that are days are stored as 'YYYY-MM-DD', not as UTC instants:
--    review_due, target_date and the effective range are calendar dates, and
--    an instant moves by a day depending on the reader's timezone.

CREATE TABLE treatment_plans (
  id                        TEXT PRIMARY KEY,
  patient_id                TEXT NOT NULL REFERENCES patients (id) ON DELETE CASCADE,
  -- 1, 2, 3… per patient. A review creates the next one; the old row stays.
  version                   INTEGER NOT NULL,
  status                    TEXT NOT NULL CHECK (status IN ('draft', 'active', 'superseded')),
  created_at                TEXT NOT NULL,
  activated_at              TEXT,
  -- Calendar dates from here down where the column names a day.
  review_due                TEXT,
  review_interval_days      INTEGER NOT NULL,
  -- JSON array of { code, system, description, primary }. Typed by the
  -- therapist, never proposed by the model.
  diagnoses                 TEXT NOT NULL DEFAULT '[]',
  presenting_problem        TEXT NOT NULL DEFAULT '',
  strengths                 TEXT NOT NULL DEFAULT '',
  modality                  TEXT NOT NULL DEFAULT '',
  frequency                 TEXT NOT NULL DEFAULT '',
  discharge_criteria        TEXT NOT NULL DEFAULT '',
  effective_from            TEXT,
  effective_to              TEXT,
  -- Snapshotted from Settings at activation: a superseded version must keep
  -- the credential she held when she wrote it.
  clinician_name            TEXT NOT NULL DEFAULT '',
  clinician_credential      TEXT NOT NULL DEFAULT '',
  clinician_licence         TEXT NOT NULL DEFAULT '',
  clinician_npi             TEXT NOT NULL DEFAULT '',
  attested_at               TEXT,
  -- The sentence attested to, stored verbatim so an export years from now
  -- renders what she agreed to rather than today's wording.
  attestation_text          TEXT NOT NULL DEFAULT '',
  client_participation      TEXT NOT NULL DEFAULT 'not_recorded'
                              CHECK (client_participation IN
                                ('not_recorded', 'reviewed_with_client', 'declined', 'signed_elsewhere')),
  client_participation_on   TEXT,
  client_participation_note TEXT NOT NULL DEFAULT '',
  superseded_by             TEXT REFERENCES treatment_plans (id) ON DELETE SET NULL,
  UNIQUE (patient_id, version),
  -- A draft has not been activated; anything else has.
  CHECK ((status = 'draft') = (activated_at IS NULL)),
  -- Only a superseded version points at its successor.
  CHECK (superseded_by IS NULL OR status = 'superseded'),
  CHECK (review_interval_days > 0)
) STRICT;

CREATE INDEX idx_treatment_plans_patient ON treatment_plans (patient_id, version DESC);
CREATE INDEX idx_treatment_plans_status ON treatment_plans (patient_id, status);

CREATE TABLE plan_goals (
  id                   TEXT PRIMARY KEY,
  plan_id              TEXT NOT NULL REFERENCES treatment_plans (id) ON DELETE CASCADE,
  ordinal              INTEGER NOT NULL,
  statement            TEXT NOT NULL,
  -- JSON array of objects — { statement, measure, baseline, target_value,
  -- target_date, source } — never bare strings: measurability attaches to the
  -- objective, and a schema of strings cannot express a measurable one.
  objectives           TEXT NOT NULL DEFAULT '[]',
  interventions        TEXT NOT NULL DEFAULT '[]',
  target_date          TEXT,
  status               TEXT NOT NULL
                         CHECK (status IN ('proposed', 'accepted', 'met', 'discontinued')),
  source               TEXT NOT NULL CHECK (source IN ('model_suggested', 'clinician_authored')),
  -- JSON array of { note_id, note_date, section, excerpt }. Every excerpt was
  -- verified as a literal substring of that note before the goal was offered.
  evidence             TEXT NOT NULL DEFAULT '[]',
  -- Lineage across a review. Without it, "what changed" is a guess.
  carried_from_goal_id TEXT REFERENCES plan_goals (id) ON DELETE SET NULL,
  created_at           TEXT NOT NULL,
  accepted_at          TEXT,
  -- Proposed is exactly the un-accepted state. Enforced here so no route,
  -- repository or migration can leave a goal in between.
  CHECK ((status = 'proposed') = (accepted_at IS NULL))
) STRICT;

CREATE INDEX idx_plan_goals_plan ON plan_goals (plan_id, ordinal, created_at, id);

CREATE TABLE session_briefs (
  id              TEXT PRIMARY KEY,
  patient_id      TEXT NOT NULL REFERENCES patients (id) ON DELETE CASCADE,
  generated_at    TEXT NOT NULL,
  -- JSON: { lines: [{ note_id, note_date, note_title, text }], lookback: {…} }
  content         TEXT NOT NULL,
  source_note_ids TEXT NOT NULL DEFAULT '[]',
  -- A briefing is ephemeral by default; a row exists only because she kept it.
  saved           INTEGER NOT NULL DEFAULT 1 CHECK (saved IN (0, 1)),
  created_at      TEXT NOT NULL
) STRICT;

CREATE INDEX idx_session_briefs_patient ON session_briefs (patient_id, generated_at DESC, id DESC);

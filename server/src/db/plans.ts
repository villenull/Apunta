import {
  type ClientParticipation,
  type Diagnosis,
  type GoalEvidence,
  type GoalSource,
  type GoalStatus,
  type PlanGoal,
  type PlanObjective,
  type PlanStatus,
  type TreatmentPlan,
} from '@apunta/shared';
import type { Database } from 'better-sqlite3';

import { uuidv7 } from './uuid.js';

/**
 * Treatment plans and their goals.
 *
 * Plain functions over a database handle, like every other repository here.
 * Two invariants are the schema's rather than this file's — a draft has no
 * `activated_at`, and a goal has an `accepted_at` exactly when it is no longer
 * `proposed` — so a mistake in here fails loudly at the write instead of
 * quietly producing a half-accepted goal.
 *
 * Nothing in this file calls the model, and nothing in it edits a goal on the
 * model's behalf: a re-draft adds proposed rows beside the plan and never
 * touches an accepted one.
 */

interface PlanRow {
  id: string;
  patient_id: string;
  version: number;
  status: PlanStatus;
  created_at: string;
  activated_at: string | null;
  review_due: string | null;
  review_interval_days: number;
  diagnoses: string;
  presenting_problem: string;
  strengths: string;
  modality: string;
  frequency: string;
  discharge_criteria: string;
  effective_from: string | null;
  effective_to: string | null;
  clinician_name: string;
  clinician_credential: string;
  clinician_licence: string;
  clinician_npi: string;
  attested_at: string | null;
  attestation_text: string;
  client_participation: ClientParticipation;
  client_participation_on: string | null;
  client_participation_note: string;
  superseded_by: string | null;
}

const PLAN_COLUMNS = `id, patient_id, version, status, created_at, activated_at, review_due,
  review_interval_days, diagnoses, presenting_problem, strengths, modality, frequency,
  discharge_criteria, effective_from, effective_to, clinician_name, clinician_credential,
  clinician_licence, clinician_npi, attested_at, attestation_text, client_participation,
  client_participation_on, client_participation_note, superseded_by`;

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    // A row whose JSON column is corrupt must not take the whole plan down.
    return fallback;
  }
}

function toPlan(row: PlanRow): TreatmentPlan {
  return { ...row, diagnoses: parseJson<Diagnosis[]>(row.diagnoses, []) };
}

/** Newest version first — the order the history is read in. */
export function listPlanVersions(db: Database, patientId: string): TreatmentPlan[] {
  const rows = db
    .prepare(`SELECT ${PLAN_COLUMNS} FROM treatment_plans WHERE patient_id = ? ORDER BY version DESC`)
    .all(patientId) as PlanRow[];
  return rows.map(toPlan);
}

export function getPlan(db: Database, id: string): TreatmentPlan | undefined {
  const row = db.prepare(`SELECT ${PLAN_COLUMNS} FROM treatment_plans WHERE id = ?`).get(id) as
    PlanRow | undefined;
  return row ? toPlan(row) : undefined;
}

/**
 * The version being worked on: the highest one.
 *
 * A review creates the next version as a draft while the previous one stays in
 * force, so the highest version is the document she is editing — and the one
 * a suggestion attaches its proposals to.
 */
export function getCurrentPlan(db: Database, patientId: string): TreatmentPlan | undefined {
  const row = db
    .prepare(`SELECT ${PLAN_COLUMNS} FROM treatment_plans WHERE patient_id = ? ORDER BY version DESC LIMIT 1`)
    .get(patientId) as PlanRow | undefined;
  return row ? toPlan(row) : undefined;
}

/** The version in force, which is not always the newest one. */
export function getActivePlan(db: Database, patientId: string): TreatmentPlan | undefined {
  const row = db
    .prepare(`SELECT ${PLAN_COLUMNS} FROM treatment_plans WHERE patient_id = ? AND status = 'active'`)
    .get(patientId) as PlanRow | undefined;
  return row ? toPlan(row) : undefined;
}

export function getPlanVersion(db: Database, patientId: string, version: number): TreatmentPlan | undefined {
  const row = db
    .prepare(`SELECT ${PLAN_COLUMNS} FROM treatment_plans WHERE patient_id = ? AND version = ?`)
    .get(patientId, version) as PlanRow | undefined;
  return row ? toPlan(row) : undefined;
}

export interface CreatePlanVersionInput {
  readonly patient_id: string;
  readonly review_interval_days: number;
  /** Copied forward from the version being reviewed. */
  readonly diagnoses?: readonly Diagnosis[];
  readonly presenting_problem?: string;
  readonly strengths?: string;
  readonly modality?: string;
  readonly frequency?: string;
  readonly discharge_criteria?: string;
  readonly created_at?: string;
}

/** Always a `draft`: a version is only in force once she activates it. */
export function createPlanVersion(db: Database, input: CreatePlanVersionInput): TreatmentPlan {
  const previous = db
    .prepare('SELECT MAX(version) AS highest FROM treatment_plans WHERE patient_id = ?')
    .get(input.patient_id) as { highest: number | null };

  const plan: TreatmentPlan = {
    id: uuidv7(),
    patient_id: input.patient_id,
    version: (previous.highest ?? 0) + 1,
    status: 'draft',
    created_at: input.created_at ?? new Date().toISOString(),
    activated_at: null,
    review_due: null,
    review_interval_days: input.review_interval_days,
    diagnoses: [...(input.diagnoses ?? [])],
    presenting_problem: input.presenting_problem ?? '',
    strengths: input.strengths ?? '',
    modality: input.modality ?? '',
    frequency: input.frequency ?? '',
    discharge_criteria: input.discharge_criteria ?? '',
    effective_from: null,
    effective_to: null,
    clinician_name: '',
    clinician_credential: '',
    clinician_licence: '',
    clinician_npi: '',
    attested_at: null,
    attestation_text: '',
    client_participation: 'not_recorded',
    client_participation_on: null,
    client_participation_note: '',
    superseded_by: null,
  };

  db.prepare(
    `INSERT INTO treatment_plans (${PLAN_COLUMNS})
     VALUES (@id, @patient_id, @version, @status, @created_at, @activated_at, @review_due,
             @review_interval_days, @diagnoses, @presenting_problem, @strengths, @modality,
             @frequency, @discharge_criteria, @effective_from, @effective_to, @clinician_name,
             @clinician_credential, @clinician_licence, @clinician_npi, @attested_at,
             @attestation_text, @client_participation, @client_participation_on,
             @client_participation_note, @superseded_by)`,
  ).run({ ...plan, diagnoses: JSON.stringify(plan.diagnoses) });

  return plan;
}

export interface UpdatePlanInput {
  readonly diagnoses?: readonly Diagnosis[];
  readonly presenting_problem?: string;
  readonly strengths?: string;
  readonly modality?: string;
  readonly frequency?: string;
  readonly discharge_criteria?: string;
  readonly review_due?: string | null;
  readonly review_interval_days?: number;
  readonly client_participation?: ClientParticipation;
  readonly client_participation_on?: string | null;
  readonly client_participation_note?: string;
}

export function updatePlan(db: Database, id: string, patch: UpdatePlanInput): TreatmentPlan | undefined {
  const current = getPlan(db, id);
  if (!current) return undefined;

  const next: TreatmentPlan = {
    ...current,
    diagnoses: patch.diagnoses ? [...patch.diagnoses] : current.diagnoses,
    presenting_problem: patch.presenting_problem ?? current.presenting_problem,
    strengths: patch.strengths ?? current.strengths,
    modality: patch.modality ?? current.modality,
    frequency: patch.frequency ?? current.frequency,
    discharge_criteria: patch.discharge_criteria ?? current.discharge_criteria,
    review_due: patch.review_due === undefined ? current.review_due : patch.review_due,
    review_interval_days: patch.review_interval_days ?? current.review_interval_days,
    client_participation: patch.client_participation ?? current.client_participation,
    client_participation_on:
      patch.client_participation_on === undefined
        ? current.client_participation_on
        : patch.client_participation_on,
    client_participation_note: patch.client_participation_note ?? current.client_participation_note,
  };

  db.prepare(
    `UPDATE treatment_plans SET
       diagnoses = @diagnoses, presenting_problem = @presenting_problem, strengths = @strengths,
       modality = @modality, frequency = @frequency, discharge_criteria = @discharge_criteria,
       review_due = @review_due, review_interval_days = @review_interval_days,
       client_participation = @client_participation,
       client_participation_on = @client_participation_on,
       client_participation_note = @client_participation_note
     WHERE id = @id`,
  ).run({ ...next, diagnoses: JSON.stringify(next.diagnoses) });

  return next;
}

export interface ActivatePlanInput {
  readonly effective_from: string;
  readonly review_due: string;
  readonly attestation_text: string;
  /** Snapshotted from Settings — never joined at render time. */
  readonly clinician_name: string;
  readonly clinician_credential: string;
  readonly clinician_licence: string;
  readonly clinician_npi: string;
  readonly attested_at?: string;
}

/**
 * Put a version in force, and retire the one it replaces.
 *
 * One transaction, because a practice with two active versions has no answer
 * to "which plan was in force on 11 September" — which is the only question
 * this table exists to answer.
 */
export function activatePlan(db: Database, id: string, input: ActivatePlanInput): TreatmentPlan | undefined {
  const current = getPlan(db, id);
  if (!current) return undefined;

  const at = input.attested_at ?? new Date().toISOString();

  const activate = db.transaction(() => {
    const previous = getActivePlan(db, current.patient_id);
    if (previous && previous.id !== id) {
      db.prepare(
        `UPDATE treatment_plans SET status = 'superseded', superseded_by = ?, effective_to = ?
          WHERE id = ?`,
      ).run(id, input.effective_from, previous.id);
    }

    db.prepare(
      `UPDATE treatment_plans SET
         status = 'active', activated_at = @activated_at, effective_from = @effective_from,
         effective_to = NULL, review_due = @review_due, attested_at = @attested_at,
         attestation_text = @attestation_text, clinician_name = @clinician_name,
         clinician_credential = @clinician_credential, clinician_licence = @clinician_licence,
         clinician_npi = @clinician_npi
       WHERE id = @id`,
    ).run({
      id,
      activated_at: at,
      attested_at: at,
      effective_from: input.effective_from,
      review_due: input.review_due,
      attestation_text: input.attestation_text,
      clinician_name: input.clinician_name,
      clinician_credential: input.clinician_credential,
      clinician_licence: input.clinician_licence,
      clinician_npi: input.clinician_npi,
    });
  });

  activate();
  return getPlan(db, id);
}

// --- goals ---------------------------------------------------------------

interface GoalRow {
  id: string;
  plan_id: string;
  ordinal: number;
  statement: string;
  objectives: string;
  interventions: string;
  target_date: string | null;
  status: GoalStatus;
  source: GoalSource;
  evidence: string;
  carried_from_goal_id: string | null;
  created_at: string;
  accepted_at: string | null;
}

const GOAL_COLUMNS = `id, plan_id, ordinal, statement, objectives, interventions, target_date,
  status, source, evidence, carried_from_goal_id, created_at, accepted_at`;

function toGoal(row: GoalRow): PlanGoal {
  return {
    ...row,
    objectives: parseJson<PlanObjective[]>(row.objectives, []),
    interventions: parseJson<string[]>(row.interventions, []),
    evidence: parseJson<GoalEvidence[]>(row.evidence, []),
  };
}

export function listPlanGoals(db: Database, planId: string): PlanGoal[] {
  const rows = db
    .prepare(`SELECT ${GOAL_COLUMNS} FROM plan_goals WHERE plan_id = ? ORDER BY ordinal, created_at, id`)
    .all(planId) as GoalRow[];
  return rows.map(toGoal);
}

export function getPlanGoal(db: Database, id: string): PlanGoal | undefined {
  const row = db.prepare(`SELECT ${GOAL_COLUMNS} FROM plan_goals WHERE id = ?`).get(id) as
    GoalRow | undefined;
  return row ? toGoal(row) : undefined;
}

export interface CreateGoalInput {
  readonly plan_id: string;
  readonly statement: string;
  readonly objectives?: readonly PlanObjective[];
  readonly interventions?: readonly string[];
  readonly target_date?: string | null;
  readonly status: GoalStatus;
  readonly source: GoalSource;
  readonly evidence?: readonly GoalEvidence[];
  readonly carried_from_goal_id?: string | null;
  readonly ordinal?: number;
  readonly created_at?: string;
}

export function nextGoalOrdinal(db: Database, planId: string): number {
  const row = db.prepare('SELECT MAX(ordinal) AS highest FROM plan_goals WHERE plan_id = ?').get(planId) as {
    highest: number | null;
  };
  return (row.highest ?? -1) + 1;
}

export function createPlanGoal(db: Database, input: CreateGoalInput): PlanGoal {
  const timestamp = input.created_at ?? new Date().toISOString();
  const goal: PlanGoal = {
    id: uuidv7(),
    plan_id: input.plan_id,
    ordinal: input.ordinal ?? nextGoalOrdinal(db, input.plan_id),
    statement: input.statement,
    objectives: [...(input.objectives ?? [])],
    interventions: [...(input.interventions ?? [])],
    target_date: input.target_date ?? null,
    status: input.status,
    source: input.source,
    evidence: [...(input.evidence ?? [])],
    carried_from_goal_id: input.carried_from_goal_id ?? null,
    created_at: timestamp,
    // The schema enforces the other half of this: proposed iff not accepted.
    accepted_at: input.status === 'proposed' ? null : timestamp,
  };

  db.prepare(
    `INSERT INTO plan_goals (${GOAL_COLUMNS})
     VALUES (@id, @plan_id, @ordinal, @statement, @objectives, @interventions, @target_date,
             @status, @source, @evidence, @carried_from_goal_id, @created_at, @accepted_at)`,
  ).run({
    ...goal,
    objectives: JSON.stringify(goal.objectives),
    interventions: JSON.stringify(goal.interventions),
    evidence: JSON.stringify(goal.evidence),
  });

  return goal;
}

export interface UpdateGoalInput {
  readonly statement?: string;
  readonly objectives?: readonly PlanObjective[];
  readonly interventions?: readonly string[];
  readonly target_date?: string | null;
  readonly status?: GoalStatus;
  readonly ordinal?: number;
}

/**
 * Ordinary document editing: she owns the goal, and no model is involved.
 *
 * Accepting is a status change, and it stamps `accepted_at` — after which the
 * goal is part of the plan and a later suggestion run may add beside it but
 * never rewrite it.
 */
export function updatePlanGoal(db: Database, id: string, patch: UpdateGoalInput): PlanGoal | undefined {
  const current = getPlanGoal(db, id);
  if (!current) return undefined;

  const status = patch.status ?? current.status;
  const next: PlanGoal = {
    ...current,
    statement: patch.statement ?? current.statement,
    objectives: patch.objectives ? [...patch.objectives] : current.objectives,
    interventions: patch.interventions ? [...patch.interventions] : current.interventions,
    target_date: patch.target_date === undefined ? current.target_date : patch.target_date,
    status,
    ordinal: patch.ordinal ?? current.ordinal,
    accepted_at: status === 'proposed' ? null : (current.accepted_at ?? new Date().toISOString()),
  };

  db.prepare(
    `UPDATE plan_goals SET
       statement = @statement, objectives = @objectives, interventions = @interventions,
       target_date = @target_date, status = @status, ordinal = @ordinal, accepted_at = @accepted_at
     WHERE id = @id`,
  ).run({
    ...next,
    objectives: JSON.stringify(next.objectives),
    interventions: JSON.stringify(next.interventions),
    evidence: JSON.stringify(next.evidence),
  });

  return next;
}

export function deletePlanGoal(db: Database, id: string): boolean {
  return db.prepare('DELETE FROM plan_goals WHERE id = ?').run(id).changes > 0;
}

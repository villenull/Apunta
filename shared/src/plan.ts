import { z } from 'zod';

import {
  boundedText,
  calendarDay,
  IdSchema,
  instantToLocalDay,
  optionalText,
  TimestampSchema,
} from './common.js';

/**
 * The treatment plan (PLAN §3, M9).
 *
 * Two rules run through every schema in this file.
 *
 * **Proposed is not accepted.** A goal the model drafted arrives as
 * `proposed`, and a proposed goal is *not part of the plan*. Only `accepted`
 * and the states after it (`met`, `discontinued`) are. The distinction is a
 * column, a schema field and a rendering rule rather than a convention,
 * because a directive document that quietly acquires goals nobody set shapes
 * future sessions — a worse failure than a wrong sentence in a note, which
 * only misreports a past one.
 *
 * **A version is a dated historical record.** A review creates a new row; the
 * previous one stays exactly as it was, diagnosis and clinician included. What
 * a payer asks for is the plan that was in force on a given service date, so
 * anything that could be rewritten later has to live on the version rather
 * than on the patient (`docs/research/m9-plan-requirements-2026-08.md` §1.1,
 * §3.1).
 */

/**
 * A calendar date, `YYYY-MM-DD`.
 *
 * Deliberately not `TimestampSchema`. A review date, a target date and an
 * effective date are days, not instants: stored as a UTC instant, "due 12
 * August" moves by a day depending on the reader's timezone, and this app
 * renders dates in local time in a browser (research §3.1).
 */
export const CalendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a calendar date, YYYY-MM-DD')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'Not a real date');

/** `draft` is being written, `active` is in force, `superseded` is history. */
export const PlanStatusSchema = z.enum(['draft', 'active', 'superseded']);
export type PlanStatus = z.infer<typeof PlanStatusSchema>;

/**
 * `proposed` is the model's suggestion and is not part of the plan until she
 * accepts it. Nothing downstream may treat the four states as interchangeable.
 */
export const GoalStatusSchema = z.enum(['proposed', 'accepted', 'met', 'discontinued']);
export type GoalStatus = z.infer<typeof GoalStatusSchema>;

/** Provenance survives acceptance, which `status` alone does not (research row 21). */
export const GoalSourceSchema = z.enum(['model_suggested', 'clinician_authored']);
export type GoalSource = z.infer<typeof GoalSourceSchema>;

/**
 * How the client took part, recorded as a state rather than captured as a
 * signature. The regulations accommodate a documented alternative, which is
 * the affordance an app with no accounts can honestly provide (research §4.3).
 */
export const ClientParticipationSchema = z.enum([
  'not_recorded',
  'reviewed_with_client',
  'declined',
  'signed_elsewhere',
]);
export type ClientParticipation = z.infer<typeof ClientParticipationSchema>;

/**
 * A diagnosis, typed by the therapist.
 *
 * **The model never proposes one.** An ICD-10 code from a model is exactly the
 * inference the owner ruled out, with billing consequences attached, so the
 * schema the model writes into (`shared/src/plan-ai.ts`) has no diagnosis
 * field at all — structurally absent rather than instructed against.
 */
export const DiagnosisSchema = z.strictObject({
  code: optionalText(20),
  system: z.enum(['icd-10-cm', 'dsm-5-tr']),
  description: optionalText(300),
  /** Exactly one diagnosis is the primary one; the API does not enforce it. */
  primary: z.boolean(),
});
export type Diagnosis = z.infer<typeof DiagnosisSchema>;

/**
 * An objective: the short-term, measurable step under a broad goal.
 *
 * Measurability attaches **here**, not to the goal (research §3.2). The goal
 * may legitimately be broad; the objective is what an auditor reads for a
 * number, a source for the number, and a date.
 *
 * `target_value` and `target_date` are hers to fill in. A note can supply a
 * baseline ("four hours when we started") but never a target — she never said
 * seven — so a suggested objective leaves them blank rather than inventing a
 * plausible number (research §3.4).
 */
export const PlanObjectiveSchema = z.strictObject({
  statement: optionalText(600),
  /** Where the number comes from: "his sleep log", "GAD-7". */
  measure: optionalText(300),
  /** Where he started, in his words where they exist. */
  baseline: optionalText(300),
  target_value: optionalText(120),
  target_date: CalendarDateSchema.nullable(),
  source: GoalSourceSchema,
});
export type PlanObjective = z.infer<typeof PlanObjectiveSchema>;

/**
 * What a proposed goal is standing on: a verbatim excerpt from one note.
 *
 * The excerpt is verified server-side as a literal substring of that note
 * before the goal is offered, and the `section` is worked out from where it
 * falls in the note text rather than claimed by the model. A goal with no
 * citable evidence is not offered at all.
 */
export const GoalEvidenceSchema = z.strictObject({
  note_id: IdSchema,
  /** The note's own timestamp, so the citation reads as a date. */
  note_date: TimestampSchema,
  /** The section the excerpt sits in, or null if it fell outside one. */
  section: z.string().max(200).nullable(),
  excerpt: optionalText(1000),
});
export type GoalEvidence = z.infer<typeof GoalEvidenceSchema>;

export const PlanGoalSchema = z.object({
  id: IdSchema,
  plan_id: IdSchema,
  ordinal: z.number().int().nonnegative(),
  statement: z.string(),
  objectives: z.array(PlanObjectiveSchema),
  interventions: z.array(z.string()),
  target_date: CalendarDateSchema.nullable(),
  status: GoalStatusSchema,
  source: GoalSourceSchema,
  evidence: z.array(GoalEvidenceSchema),
  /** The goal this one was carried forward from, at the last review. */
  carried_from_goal_id: IdSchema.nullable(),
  created_at: TimestampSchema,
  /** Null exactly while the goal is still `proposed`. */
  accepted_at: TimestampSchema.nullable(),
});
export type PlanGoal = z.infer<typeof PlanGoalSchema>;

export const TreatmentPlanSchema = z.object({
  id: IdSchema,
  patient_id: IdSchema,
  version: z.number().int().positive(),
  status: PlanStatusSchema,
  created_at: TimestampSchema,
  activated_at: TimestampSchema.nullable(),
  review_due: CalendarDateSchema.nullable(),
  review_interval_days: z.number().int().positive(),
  diagnoses: z.array(DiagnosisSchema),
  presenting_problem: z.string(),
  strengths: z.string(),
  modality: z.string(),
  frequency: z.string(),
  discharge_criteria: z.string(),
  effective_from: CalendarDateSchema.nullable(),
  effective_to: CalendarDateSchema.nullable(),
  /** Snapshotted from Settings at activation, never joined at render time. */
  clinician_name: z.string(),
  clinician_credential: z.string(),
  clinician_licence: z.string(),
  clinician_npi: z.string(),
  attested_at: TimestampSchema.nullable(),
  /** The exact sentence attested to, stored so an export renders what she agreed. */
  attestation_text: z.string(),
  client_participation: ClientParticipationSchema,
  client_participation_on: CalendarDateSchema.nullable(),
  client_participation_note: z.string(),
  superseded_by: IdSchema.nullable(),
});
export type TreatmentPlan = z.infer<typeof TreatmentPlanSchema>;

/**
 * `GET /api/patients/:id/plan`.
 *
 * An envelope with a nullable plan rather than a 404: "this patient has no
 * plan yet" is an ordinary state of the Plan screen, not an error, and the
 * screen would otherwise have to read a 404 as success.
 */
export const PlanResponseSchema = z.object({
  plan: TreatmentPlanSchema.nullable(),
  goals: z.array(PlanGoalSchema),
});
export type PlanResponse = z.infer<typeof PlanResponseSchema>;

/** `GET /api/patients/:id/plan/versions` — newest first, goals not included. */
export const PlanVersionListResponseSchema = z.object({
  versions: z.array(TreatmentPlanSchema),
});
export type PlanVersionListResponse = z.infer<typeof PlanVersionListResponseSchema>;

/**
 * `POST /api/patients/:id/plan` — start a version.
 *
 * With no plan yet this is version 1. Otherwise it is a review: a new draft
 * version that carries the current version's accepted goals forward (each
 * pointing back through `carried_from_goal_id`, which is what makes "what
 * changed" answerable), leaving the current version in force until the new one
 * is activated.
 */
export const StartPlanVersionRequestSchema = z
  .object({
    /** Off only when she wants to start the review from a blank sheet. */
    carry_goals: z.boolean().optional(),
  })
  .optional();
export type StartPlanVersionRequest = z.infer<typeof StartPlanVersionRequestSchema>;

/** `PATCH /api/plans/:id` — the plan-level fields, all hers to type. */
export const UpdatePlanRequestSchema = z
  .object({
    diagnoses: z.array(DiagnosisSchema).max(20).optional(),
    presenting_problem: optionalText(4000).optional(),
    strengths: optionalText(4000).optional(),
    modality: optionalText(300).optional(),
    frequency: optionalText(300).optional(),
    discharge_criteria: optionalText(4000).optional(),
    review_due: CalendarDateSchema.nullish(),
    review_interval_days: z.number().int().positive().max(3650).optional(),
    client_participation: ClientParticipationSchema.optional(),
    client_participation_on: CalendarDateSchema.nullish(),
    client_participation_note: optionalText(2000).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Provide at least one field to update',
  });
export type UpdatePlanRequest = z.infer<typeof UpdatePlanRequestSchema>;

/**
 * `POST /api/plans/:id/activate` — put this version in force.
 *
 * Activation is the moment the clinician identity is snapshotted and the
 * attestation is dated. It is not a signature and must not be labelled as one:
 * with no login, no accounts and no audit trail, Apunta cannot make a typed
 * name attributable to the signer, which is the condition that gives an
 * electronic signature meaning (research §4).
 */
export const ActivatePlanRequestSchema = z
  .object({
    /** Defaults to today. */
    effective_from: CalendarDateSchema.optional(),
    /** Defaults to `effective_from` + `review_interval_days`. */
    review_due: CalendarDateSchema.optional(),
  })
  .optional();
export type ActivatePlanRequest = z.infer<typeof ActivatePlanRequestSchema>;

/** The sentence stored on the version at activation, verbatim, forever. */
export const ATTESTATION_TEXT =
  'I authored and reviewed this treatment plan. Attested in Apunta — sign the copy in your records system.';

/** `POST /api/plans/:id/goals` — a goal she wrote herself, accepted on arrival. */
export const CreateGoalRequestSchema = z.object({
  statement: boundedText(2000),
  objectives: z
    .array(PlanObjectiveSchema.partial({ source: true }))
    .max(12)
    .optional(),
  interventions: z.array(boundedText(600)).max(12).optional(),
  target_date: CalendarDateSchema.nullish(),
});
export type CreateGoalRequest = z.infer<typeof CreateGoalRequestSchema>;

/**
 * `PATCH /api/plans/:id/goals/:goalId` — accept, edit, mark met, discontinue.
 *
 * Editing an accepted goal is ordinary document editing and the model is not
 * involved: nothing on this path calls the LLM.
 */
export const UpdateGoalRequestSchema = z
  .object({
    statement: boundedText(2000).optional(),
    objectives: z
      .array(PlanObjectiveSchema.partial({ source: true }))
      .max(12)
      .optional(),
    interventions: z.array(boundedText(600)).max(12).optional(),
    target_date: CalendarDateSchema.nullish(),
    status: GoalStatusSchema.optional(),
    ordinal: z.number().int().nonnegative().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Provide at least one field to update',
  });
export type UpdateGoalRequest = z.infer<typeof UpdateGoalRequestSchema>;

/** Settings keys this packet reads. Snapshotted onto a version at activation. */
export const CLINICIAN_NAME_SETTING = 'clinician_name';
export const CLINICIAN_CREDENTIAL_SETTING = 'clinician_credential';
export const CLINICIAN_LICENCE_SETTING = 'clinician_licence';
export const CLINICIAN_NPI_SETTING = 'clinician_npi';
/** Stored as data, never hard-coded: cadence varies by payer (research §1.4). */
export const REVIEW_INTERVAL_SETTING = 'plan_review_interval_days';
export const DEFAULT_REVIEW_INTERVAL_DAYS = 90;
/**
 * How many recent notes the two-stage AI paths read. One knob for session prep
 * and plan suggestion alike: both are bounded by the same context window, and
 * two numbers would be two things to get wrong.
 */
export const LOOKBACK_SETTING = 'ai_lookback_notes';
export const DEFAULT_LOOKBACK_NOTES = 5;
export const MAX_LOOKBACK_NOTES = 12;

/** Add `days` to a calendar date, staying in calendar arithmetic throughout. */
export function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return calendarDay(parsed.toISOString().split('T', 1)[0]!);
}

/** Today, as a calendar date in the caller's own timezone. */
export function today(now: Date = new Date()): string {
  return instantToLocalDay(now);
}

export interface ReviewDueState {
  readonly due: string;
  readonly daysUntil: number;
  readonly overdue: boolean;
}

/**
 * How the plan's review date stands against today.
 *
 * This is the one carve-out from "nothing connects goals to notes": it reads
 * no note, quotes no note and draws no connection between the plan and the
 * notes. It is arithmetic on a date she chose — and it guards the
 * highest-consequence failure in this area, services rendered against a plan
 * whose review date has passed (M9 §"No goal tracking", research §2.3).
 */
export function reviewDueState(reviewDue: string | null, now: Date = new Date()): ReviewDueState | null {
  if (reviewDue === null) return null;
  const dueMs = Date.parse(`${reviewDue}T00:00:00Z`);
  if (Number.isNaN(dueMs)) return null;
  const todayMs = Date.parse(`${today(now)}T00:00:00Z`);
  const daysUntil = Math.round((dueMs - todayMs) / 86_400_000);
  return { due: reviewDue, daysUntil, overdue: daysUntil < 0 };
}

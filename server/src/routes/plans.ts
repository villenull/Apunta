import {
  ActivatePlanRequestSchema,
  addDays,
  ATTESTATION_TEXT,
  CreateGoalRequestSchema,
  planDocumentText,
  StartPlanVersionRequestSchema,
  today,
  UpdateGoalRequestSchema,
  UpdatePlanRequestSchema,
  type BriefLookback,
  type GoalEvidence,
  type Patient,
  type PlanGoal,
  type PlanResponse,
  type PlanVersionListResponse,
  type SuggestedGoal,
  type TreatmentPlan,
} from '@apunta/shared';
import type { Database } from 'better-sqlite3';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { AiError, aiError } from '../ai/errors.js';
import type { AiProviders, LlmStats } from '../ai/types.js';
import { getFormat } from '../db/formats.js';
import { listNotesForPatient } from '../db/notes.js';
import {
  activatePlan,
  createPlanGoal,
  createPlanVersion,
  deletePlanGoal,
  getCurrentPlan,
  getPlan,
  getPlanGoal,
  getPlanVersion,
  listPlanGoals,
  listPlanVersions,
  updatePlan,
  updatePlanGoal,
} from '../db/plans.js';
import { conflict, notFound } from '../http/errors.js';
import { openSse } from '../http/sse.js';
import { IdParamsSchema, parseBody, parseParams, parseQuery } from '../http/validate.js';
import { readRecentNotes, type NoteMaterial } from '../plan/pipeline.js';
import { resolveClinician, resolveLookback, resolveReviewInterval } from '../plan/settings.js';
import { requirePatient } from './patients.js';

/**
 * The treatment plan: versions, goals, and the drafting call that proposes
 * goals from her notes.
 *
 * One rule runs through the whole file, and it is enforced here rather than
 * asked of the model: **the model may never write accepted content.** Every
 * goal `/suggest` persists is `proposed`, which is not part of the plan; a
 * second run adds beside her accepted goals and never touches one. Acceptance
 * is a PATCH she makes, and nothing on that path calls the model at all.
 *
 * The second rule is what a proposal is allowed to stand on. A goal is offered
 * only with evidence that resolves to an excerpt the server verified against
 * the note it claims to come from, and a goal that cites nothing resolvable is
 * dropped rather than shown. `docs/agents/M9-treatment-plan.md`.
 */

const GoalParamsSchema = z.object({ id: z.string().min(1), goalId: z.string().min(1) });
const VersionQuerySchema = z.object({
  version: z
    .string()
    .regex(/^\d+$/)
    .transform((value) => Number(value))
    .optional(),
});

export function registerPlanRoutes(app: FastifyInstance, db: Database, providers: AiProviders): void {
  /**
   * The plan she is working on, with its goals.
   *
   * `?version=` reads a historical one, which stays exactly as it was — that
   * is the question this table exists to answer, and the answer must not move
   * because a later review happened.
   */
  app.get('/api/patients/:id/plan', async (request): Promise<PlanResponse> => {
    const { id } = parseParams(IdParamsSchema, request.params);
    const { version } = parseQuery(VersionQuerySchema, request.query);
    requirePatient(db, id);

    const plan = version === undefined ? getCurrentPlan(db, id) : getPlanVersion(db, id, version);
    if (version !== undefined && !plan) throw notFound('No such plan version');
    // No plan yet is an ordinary state of the screen, not an error.
    if (!plan) return { plan: null, goals: [] };
    return { plan, goals: listPlanGoals(db, plan.id) };
  });

  app.get('/api/patients/:id/plan/versions', async (request): Promise<PlanVersionListResponse> => {
    const { id } = parseParams(IdParamsSchema, request.params);
    requirePatient(db, id);
    return { versions: listPlanVersions(db, id) };
  });

  /**
   * Start a version: the first plan, or a review of the current one.
   *
   * A review carries the accepted goals forward with their lineage and leaves
   * the version in force alone until the new one is activated — a practice
   * with no plan in force while she drafts a review would be a worse state
   * than the one she started in.
   */
  app.post('/api/patients/:id/plan', async (request, reply): Promise<PlanResponse> => {
    const { id } = parseParams(IdParamsSchema, request.params);
    const input = parseBody(StartPlanVersionRequestSchema, request.body ?? {});
    requirePatient(db, id);

    const previous = getCurrentPlan(db, id);
    if (previous && previous.status === 'draft') {
      throw conflict('This plan already has a draft version. Activate or edit it first.');
    }

    const created = createPlanVersion(db, {
      patient_id: id,
      review_interval_days: previous?.review_interval_days ?? resolveReviewInterval(db),
      ...(previous
        ? {
            diagnoses: previous.diagnoses,
            presenting_problem: previous.presenting_problem,
            strengths: previous.strengths,
            modality: previous.modality,
            frequency: previous.frequency,
            discharge_criteria: previous.discharge_criteria,
          }
        : {}),
    });

    if (previous && input?.carry_goals !== false) {
      for (const goal of listPlanGoals(db, previous.id)) {
        // A proposal she never accepted is not part of the plan, so there is
        // nothing to carry; a discontinued goal was deliberately stopped.
        if (goal.status !== 'accepted' && goal.status !== 'met') continue;
        createPlanGoal(db, {
          plan_id: created.id,
          statement: goal.statement,
          objectives: goal.objectives,
          interventions: goal.interventions,
          target_date: goal.target_date,
          status: goal.status,
          source: goal.source,
          evidence: goal.evidence,
          carried_from_goal_id: goal.id,
          ordinal: goal.ordinal,
        });
      }
    }

    reply.code(201);
    return { plan: created, goals: listPlanGoals(db, created.id) };
  });

  /** The plan-level fields, all of them hers to type — the diagnosis included. */
  app.patch('/api/plans/:id', async (request): Promise<TreatmentPlan> => {
    const { id } = parseParams(IdParamsSchema, request.params);
    const patch = parseBody(UpdatePlanRequestSchema, request.body);
    requireEditablePlan(db, id);

    // Spread key by key: `exactOptionalPropertyTypes` means an explicit
    // `undefined` is not the same as an absent key, and here it would be the
    // difference between "leave it alone" and "clear it".
    const updated = updatePlan(db, id, {
      ...(patch.diagnoses === undefined ? {} : { diagnoses: patch.diagnoses }),
      ...(patch.presenting_problem === undefined ? {} : { presenting_problem: patch.presenting_problem }),
      ...(patch.strengths === undefined ? {} : { strengths: patch.strengths }),
      ...(patch.modality === undefined ? {} : { modality: patch.modality }),
      ...(patch.frequency === undefined ? {} : { frequency: patch.frequency }),
      ...(patch.discharge_criteria === undefined ? {} : { discharge_criteria: patch.discharge_criteria }),
      ...(patch.review_due === undefined ? {} : { review_due: patch.review_due }),
      ...(patch.review_interval_days === undefined
        ? {}
        : { review_interval_days: patch.review_interval_days }),
      ...(patch.client_participation === undefined
        ? {}
        : { client_participation: patch.client_participation }),
      ...(patch.client_participation_on === undefined
        ? {}
        : { client_participation_on: patch.client_participation_on }),
      ...(patch.client_participation_note === undefined
        ? {}
        : { client_participation_note: patch.client_participation_note }),
    });
    if (!updated) throw notFound('Plan not found');
    return updated;
  });

  /**
   * Put a version in force.
   *
   * This is where the clinician identity is snapshotted and the attestation is
   * dated. It is **not** a signature: with no login and no audit trail the app
   * cannot make a typed name attributable to the signer, so it records a dated
   * claim and says so — the signature belongs to the records system the note
   * already goes to (`docs/research/m9-plan-requirements-2026-08.md` §4).
   */
  app.post('/api/plans/:id/activate', async (request): Promise<PlanResponse> => {
    const { id } = parseParams(IdParamsSchema, request.params);
    const input = parseBody(ActivatePlanRequestSchema, request.body ?? {});
    const plan = requirePlan(db, id);
    if (plan.status === 'superseded') throw conflict('A superseded plan version cannot be reactivated.');

    const effectiveFrom = input?.effective_from ?? today();
    const reviewDue =
      input?.review_due ?? plan.review_due ?? addDays(effectiveFrom, plan.review_interval_days);

    const activated = activatePlan(db, id, {
      effective_from: effectiveFrom,
      review_due: reviewDue,
      attestation_text: ATTESTATION_TEXT,
      ...resolveClinician(db),
    });
    if (!activated) throw notFound('Plan not found');
    return { plan: activated, goals: listPlanGoals(db, activated.id) };
  });

  /**
   * The plan as a document.
   *
   * Plain text, because a plan is printed or uploaded rather than typed into
   * one box — and because the note already travels to her records system by
   * clipboard, which is the affordance she asked for.
   */
  app.get('/api/plans/:id/export', async (request, reply): Promise<string> => {
    const { id } = parseParams(IdParamsSchema, request.params);
    const plan = requirePlan(db, id);
    const patient = requirePatient(db, plan.patient_id) as Patient;

    const text = planDocumentText({
      plan,
      goals: listPlanGoals(db, plan.id),
      versions: listPlanVersions(db, plan.patient_id),
      patientName: patient.name,
      patientIdentifier: patient.identifier,
    });

    return reply.type('text/plain; charset=utf-8').send(text);
  });

  /** A goal she wrote herself. Accepted on arrival: she is the author. */
  app.post('/api/plans/:id/goals', async (request, reply): Promise<PlanGoal> => {
    const { id } = parseParams(IdParamsSchema, request.params);
    const input = parseBody(CreateGoalRequestSchema, request.body);
    requireEditablePlan(db, id);

    reply.code(201);
    return createPlanGoal(db, {
      plan_id: id,
      statement: input.statement,
      objectives: (input.objectives ?? []).map((objective) => ({
        ...objective,
        source: objective.source ?? 'clinician_authored',
      })),
      interventions: input.interventions ?? [],
      target_date: input.target_date ?? null,
      status: 'accepted',
      source: 'clinician_authored',
    });
  });

  /** Accept, edit, mark met, discontinue. Ordinary editing; no model involved. */
  app.patch('/api/plans/:id/goals/:goalId', async (request): Promise<PlanGoal> => {
    const { id, goalId } = parseParams(GoalParamsSchema, request.params);
    const patch = parseBody(UpdateGoalRequestSchema, request.body);
    requireEditablePlan(db, id);
    requireGoal(db, id, goalId);

    const updated = updatePlanGoal(db, goalId, {
      ...(patch.statement === undefined ? {} : { statement: patch.statement }),
      ...(patch.interventions === undefined ? {} : { interventions: patch.interventions }),
      ...(patch.target_date === undefined ? {} : { target_date: patch.target_date }),
      ...(patch.status === undefined ? {} : { status: patch.status }),
      ...(patch.ordinal === undefined ? {} : { ordinal: patch.ordinal }),
      ...(patch.objectives === undefined
        ? {}
        : {
            objectives: patch.objectives.map((objective) => ({
              ...objective,
              source: objective.source ?? ('clinician_authored' as const),
            })),
          }),
    });
    if (!updated) throw notFound('Goal not found');
    return updated;
  });

  app.delete('/api/plans/:id/goals/:goalId', async (request, reply) => {
    const { id, goalId } = parseParams(GoalParamsSchema, request.params);
    requireEditablePlan(db, id);
    requireGoal(db, id, goalId);
    deletePlanGoal(db, goalId);
    return reply.code(204).send();
  });

  /**
   * Draft goals from her recent notes.
   *
   * Two stages, because one call carrying five notes would be truncated from
   * the head and would lose the instruction not to invent. Everything it
   * persists is `proposed`; nothing it does can change a goal she has
   * accepted, and a goal it cannot cite is not offered at all.
   */
  app.post('/api/patients/:id/plan/suggest', async (request, reply) => {
    const { id } = parseParams(IdParamsSchema, request.params);
    requirePatient(db, id);

    const cap = resolveLookback(db);
    const notes = listNotesForPatient(db, id).slice(0, cap);
    const existing = currentGoals(db, id);

    const stream = openSse(reply);
    stream.send('status', { stage: 'connecting', message: 'Contacting the local AI…' });

    // Declared without a value: every path out of the `catch` below returns,
    // so these are read only when the read actually finished.
    let materials: readonly NoteMaterial[];
    let lookback: BriefLookback;
    let suggested: readonly SuggestedGoal[] = [];

    try {
      const read = await readRecentNotes({
        llm: providers.llm,
        notes,
        sectionsFor: (note) => getFormat(db, note.format_id)?.sections ?? [],
        cap,
        onProgress: (index, total) => {
          stream.send('status', {
            stage: 'reading-notes',
            message: `Reading note ${String(index)} of ${String(total)}…`,
          });
        },
        onStats: (stats) => {
          logStats(request, stats, 'note summarised');
        },
        cancelled: () => stream.closed,
      });
      materials = read.materials;
      lookback = read.lookback;

      if (materials.length > 0 && !stream.closed) {
        stream.send('status', { stage: 'drafting', message: 'Drafting goals…' });
        const plan = getCurrentPlan(db, id);
        const result = await providers.llm.suggestPlanGoals({
          diagnoses: (plan?.diagnoses ?? []).map(describeDiagnosis),
          modality: plan?.modality ?? '',
          frequency: plan?.frequency ?? '',
          existingGoals: existing.map((goal) => goal.statement),
          notes: materials.map((material) => ({
            index: material.index,
            date: material.note.created_at.slice(0, 10),
            excerpts: material.excerpts.map((excerpt) => excerpt.text),
          })),
        });
        suggested = result.value.goals;
        logStats(request, result.stats, 'plan goals drafted');
      }
    } catch (error) {
      const failure = toAiError(error);
      logFailure(request, failure, 'plan suggestion failed');
      stream.send('error', { code: failure.code, message: failure.message });
      stream.end();
      return;
    }

    if (stream.closed) {
      stream.end();
      return;
    }

    // Nothing is persisted until there is something citable to persist, so a
    // run that proposes nothing leaves no empty plan version behind.
    const accepted: PlanGoal[] = [];
    let dropped = 0;
    let plan = getCurrentPlan(db, id);
    const seen = new Set(existing.map((goal) => goal.statement.trim().toLowerCase()));

    for (const goal of suggested) {
      const statement = goal.statement.trim();
      const evidence = resolveEvidence(goal, materials);
      // A proposal with no citable evidence is not offered at all.
      if (statement === '' || evidence.length === 0 || seen.has(statement.toLowerCase())) {
        dropped += 1;
        continue;
      }
      seen.add(statement.toLowerCase());

      plan ??= createPlanVersion(db, {
        patient_id: id,
        review_interval_days: resolveReviewInterval(db),
      });

      const persisted = createPlanGoal(db, {
        plan_id: plan.id,
        statement,
        objectives: goal.objectives
          .filter((objective) => objective.statement.trim() !== '')
          .map((objective) => ({
            statement: objective.statement.trim(),
            measure: objective.measure.trim(),
            baseline: objective.baseline.trim(),
            // Hers to set. A note can say where he started; it cannot say
            // where he should end up.
            target_value: '',
            target_date: null,
            source: 'model_suggested' as const,
          })),
        interventions: goal.interventions.map((intervention) => intervention.trim()).filter(Boolean),
        target_date: null,
        status: 'proposed',
        source: 'model_suggested',
        evidence,
      });
      accepted.push(persisted);
      stream.send('goal', { goal: persisted });
    }

    stream.send('done', { goals: accepted, lookback, dropped });
    stream.end();
  });
}

function requirePlan(db: Database, id: string): TreatmentPlan {
  const plan = getPlan(db, id);
  if (!plan) throw notFound('Plan not found');
  return plan;
}

/**
 * A superseded version is a historical record of what was in force on a
 * service date. Editing one would rewrite history, which is the one thing
 * versioning exists to prevent.
 */
function requireEditablePlan(db: Database, id: string): TreatmentPlan {
  const plan = requirePlan(db, id);
  if (plan.status === 'superseded') {
    throw conflict('This plan version has been superseded and is read-only. Start a review instead.');
  }
  return plan;
}

function requireGoal(db: Database, planId: string, goalId: string): PlanGoal {
  const goal = getPlanGoal(db, goalId);
  if (!goal || goal.plan_id !== planId) throw notFound('Goal not found');
  return goal;
}

/** The goals already on the current version, whatever their state. */
function currentGoals(db: Database, patientId: string): PlanGoal[] {
  const plan = getCurrentPlan(db, patientId);
  return plan ? listPlanGoals(db, plan.id) : [];
}

function describeDiagnosis(diagnosis: { code: string; system: string; description: string }): string {
  const system = diagnosis.system === 'icd-10-cm' ? 'ICD-10-CM' : 'DSM-5-TR';
  return [diagnosis.code, `(${system})`, diagnosis.description].filter((part) => part !== '').join(' ');
}

/**
 * Turn the model's citations into evidence, or into nothing.
 *
 * The model cites by index into the excerpts it was given, and those excerpts
 * were verified against the notes they came from — so an index that resolves
 * yields the note's own words, and an index that does not yields nothing. It
 * has no way to quote a note it was never shown.
 */
function resolveEvidence(goal: SuggestedGoal, materials: readonly NoteMaterial[]): GoalEvidence[] {
  const evidence: GoalEvidence[] = [];
  const seen = new Set<string>();

  for (const citation of goal.evidence) {
    const material = materials.find((candidate) => candidate.index === citation.note);
    const excerpt = material?.excerpts[citation.excerpt];
    if (!material || !excerpt) continue;

    const key = `${material.note.id}:${excerpt.text}`;
    if (seen.has(key)) continue;
    seen.add(key);

    evidence.push({
      note_id: material.note.id,
      note_date: material.note.created_at,
      section: excerpt.section,
      excerpt: excerpt.text,
    });
  }
  return evidence;
}

function toAiError(error: unknown): AiError {
  if (error instanceof AiError) return error;
  return aiError('ollama_error', String(error));
}

/**
 * Shapes, counts and codes. Never a goal, an excerpt or a note.
 *
 * The plan and prep paths carry more clinical text than anything else in the
 * app, which makes them the worst place to be casual about a log line
 * (`docs/research/privacy-audit-2026-08.md` H1).
 */
export function logFailure(request: FastifyRequest, failure: AiError, message: string): void {
  request.log.error({ code: failure.code, detail: failure.detail }, message);
}

export function logStats(request: FastifyRequest, stats: LlmStats, message: string): void {
  request.log.info(
    {
      model: stats.model,
      // The only observability Ollama gives us on truncation, and it is free.
      promptTokens: stats.promptTokens,
      outputTokens: stats.outputTokens,
      doneReason: stats.doneReason,
      attempts: stats.attempts,
    },
    message,
  );
}

/** Shared with the prep route, which streams with the same discipline. */
export type { FastifyReply };

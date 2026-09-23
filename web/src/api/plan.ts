import {
  PlanErrorEventSchema,
  PlanGoalSchema,
  PlanResponseSchema,
  PlanStatusEventSchema,
  PlanVersionListResponseSchema,
  SuggestDoneEventSchema,
  SuggestGoalEventSchema,
  type ActivatePlanRequest,
  type CreateGoalRequest,
  type PlanGoal,
  type PlanResponse,
  type PlanStatusEvent,
  type StartPlanVersionRequest,
  type SuggestDoneEvent,
  type SuggestGoalEvent,
  type TreatmentPlan,
  type UpdateGoalRequest,
  type UpdatePlanRequest,
} from '@apunta/shared';

import { requestJson, requestStream, requestVoid } from './client.js';
import { GenerateError } from './generate.js';
import { consumeStream } from './sse.js';

/** The treatment-plan endpoints (PLAN §4, M9). */

export async function getPlan(
  patientId: string,
  version?: number,
  signal?: AbortSignal,
): Promise<PlanResponse> {
  const query = version === undefined ? '' : `?version=${String(version)}`;
  return requestJson(`/api/patients/${patientId}/plan${query}`, PlanResponseSchema, signal ? { signal } : {});
}

export async function listPlanVersions(patientId: string, signal?: AbortSignal): Promise<TreatmentPlan[]> {
  const { versions } = await requestJson(
    `/api/patients/${patientId}/plan/versions`,
    PlanVersionListResponseSchema,
    signal ? { signal } : {},
  );
  return versions;
}

/** The first version, or a review of the current one. */
export async function startPlanVersion(
  patientId: string,
  body: StartPlanVersionRequest = {},
): Promise<PlanResponse> {
  return requestJson(`/api/patients/${patientId}/plan`, PlanResponseSchema, {
    method: 'POST',
    body: body ?? {},
  });
}

export async function updatePlan(planId: string, patch: UpdatePlanRequest): Promise<TreatmentPlan> {
  return requestJson(`/api/plans/${planId}`, PlanResponseSchema.shape.plan.unwrap(), {
    method: 'PATCH',
    body: patch,
  });
}

/** Puts the version in force and dates the attestation. Not a signature. */
export async function activatePlan(planId: string, body: ActivatePlanRequest = {}): Promise<PlanResponse> {
  return requestJson(`/api/plans/${planId}/activate`, PlanResponseSchema, {
    method: 'POST',
    body: body ?? {},
  });
}

export async function createGoal(planId: string, input: CreateGoalRequest): Promise<PlanGoal> {
  return requestJson(`/api/plans/${planId}/goals`, PlanGoalSchema, { method: 'POST', body: input });
}

export async function updateGoal(
  planId: string,
  goalId: string,
  patch: UpdateGoalRequest,
): Promise<PlanGoal> {
  return requestJson(`/api/plans/${planId}/goals/${goalId}`, PlanGoalSchema, {
    method: 'PATCH',
    body: patch,
  });
}

export async function deleteGoal(planId: string, goalId: string): Promise<void> {
  return requestVoid(`/api/plans/${planId}/goals/${goalId}`, { method: 'DELETE' });
}

/** The plan as a document, for the clipboard or a printer. */
export async function exportPlan(planId: string, signal?: AbortSignal): Promise<string> {
  const response = await requestStream(`/api/plans/${planId}/export`, signal ? { signal } : {});
  return response.text();
}

export interface SuggestHandlers {
  onStatus?: (event: PlanStatusEvent) => void;
  /** One proposed goal, already persisted — and not part of the plan. */
  onGoal?: (event: SuggestGoalEvent) => void;
}

/**
 * Draft goals from the recent notes.
 *
 * The unit of streaming is a goal rather than a token: a goal is only
 * offerable once its citations have been resolved against the notes, so there
 * is no honest way to show half of one.
 */
export async function suggestGoals(
  patientId: string,
  handlers: SuggestHandlers = {},
  signal?: AbortSignal,
): Promise<SuggestDoneEvent> {
  const response = await requestStream(`/api/patients/${patientId}/plan/suggest`, {
    method: 'POST',
    body: {},
    ...(signal ? { signal } : {}),
  });
  if (!response.body) throw new Error('The server sent no suggestion stream.');

  let done: SuggestDoneEvent | null = null;

  await consumeStream(
    response.body,
    signal,
    {
      status: PlanStatusEventSchema,
      goal: SuggestGoalEventSchema,
      done: SuggestDoneEventSchema,
      error: PlanErrorEventSchema,
    },
    {
      status: (event) => handlers.onStatus?.(event),
      goal: (event) => handlers.onGoal?.(event),
      done: (event) => {
        done = event;
      },
      error: (event) => {
        throw new GenerateError(event);
      },
    },
  );

  if (done === null) throw new Error('The suggestion stream ended early.');
  return done;
}

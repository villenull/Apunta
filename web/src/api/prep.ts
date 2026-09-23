import {
  PlanErrorEventSchema,
  PlanStatusEventSchema,
  PrepBriefEventSchema,
  PrepLineEventSchema,
  SessionBriefListResponseSchema,
  SessionBriefSchema,
  type PlanStatusEvent,
  type PrepBriefEvent,
  type PrepLineEvent,
  type SaveBriefRequest,
  type SessionBrief,
} from '@apunta/shared';

import { requestJson, requestStream } from './client.js';
import { GenerateError } from './generate.js';
import { consumeStream } from './sse.js';

/** Session preparation (PLAN §4, M9). Ephemeral until she keeps it. */

export interface PrepHandlers {
  onStatus?: (event: PlanStatusEvent) => void;
  /** One line of the briefing, carrying the note it came from. */
  onLine?: (event: PrepLineEvent) => void;
}

export async function prepareBriefing(
  patientId: string,
  handlers: PrepHandlers = {},
  signal?: AbortSignal,
): Promise<PrepBriefEvent> {
  const response = await requestStream(`/api/patients/${patientId}/prep`, {
    method: 'POST',
    body: {},
    ...(signal ? { signal } : {}),
  });
  if (!response.body) throw new Error('The server sent no briefing stream.');

  let brief: PrepBriefEvent | null = null;

  await consumeStream(
    response.body,
    signal,
    {
      status: PlanStatusEventSchema,
      line: PrepLineEventSchema,
      brief: PrepBriefEventSchema,
      error: PlanErrorEventSchema,
    },
    {
      status: (event) => handlers.onStatus?.(event),
      line: (event) => handlers.onLine?.(event),
      brief: (event) => {
        brief = event;
      },
      error: (event) => {
        throw new GenerateError(event);
      },
    },
  );

  if (brief === null) throw new Error('The briefing stream ended early.');
  return brief;
}

/** Nothing was persisted while it streamed, so the browser posts it back. */
export async function saveBriefing(patientId: string, brief: SaveBriefRequest): Promise<SessionBrief> {
  return requestJson(`/api/patients/${patientId}/prep/save`, SessionBriefSchema, {
    method: 'POST',
    body: brief,
  });
}

export async function listBriefings(patientId: string, signal?: AbortSignal): Promise<SessionBrief[]> {
  const { briefs } = await requestJson(
    `/api/patients/${patientId}/prep`,
    SessionBriefListResponseSchema,
    signal ? { signal } : {},
  );
  return briefs;
}

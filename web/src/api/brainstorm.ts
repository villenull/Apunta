import {
  BrainstormContextEventSchema,
  BrainstormErrorEventSchema,
  BrainstormMessageEventSchema,
  BrainstormStatusEventSchema,
  BrainstormThreadResponseSchema,
  BrainstormTokenEventSchema,
  type BrainstormContext,
  type BrainstormMessage,
  type BrainstormRequest,
  type BrainstormStatusEvent,
} from '@apunta/shared';

import { requestJson, requestStream } from './client.js';
import { GenerateError } from './generate.js';
import { consumeStream } from './sse.js';

/** `GET /api/patients/:id/brainstorm` — the thread, oldest first, plus today's context. */
export async function listBrainstorm(
  patientId: string,
  signal?: AbortSignal,
): Promise<{ messages: BrainstormMessage[]; context: BrainstormContext }> {
  return requestJson(
    `/api/patients/${patientId}/brainstorm`,
    BrainstormThreadResponseSchema,
    signal ? { signal } : {},
  );
}

export interface BrainstormHandlers {
  /** Progress: contacting the AI, loading the model, thinking. */
  onStatus?: (event: BrainstormStatusEvent) => void;
  /** A decoded slice of the assistant's reply — never raw JSON. */
  onToken?: (text: string) => void;
  /**
   * A persisted turn. Arrives for the user's own message first (so an
   * optimistic bubble can be swapped for the real row) and then for the
   * assistant's, which supersedes whatever streamed.
   */
  onMessage?: (message: BrainstormMessage) => void;
  /** Which notes this turn was given, decided before the first token. */
  onContext?: (context: BrainstormContext) => void;
}

/**
 * `POST /api/patients/:id/brainstorm` over SSE.
 *
 * Failures inside the stream arrive as a `GenerateError` — the same class the
 * other AI calls throw, because it is the same set of local-AI failures with
 * the same user-facing messages.
 */
export async function sendBrainstormMessage(
  patientId: string,
  input: BrainstormRequest,
  handlers: BrainstormHandlers = {},
  signal?: AbortSignal,
): Promise<void> {
  const response = await requestStream(`/api/patients/${patientId}/brainstorm`, {
    method: 'POST',
    body: input,
    ...(signal ? { signal } : {}),
  });
  if (!response.body) throw new Error('The server sent no reply stream.');

  let sawAssistant = false;

  await consumeStream(
    response.body,
    signal,
    {
      status: BrainstormStatusEventSchema,
      token: BrainstormTokenEventSchema,
      message: BrainstormMessageEventSchema,
      context: BrainstormContextEventSchema,
      error: BrainstormErrorEventSchema,
    },
    {
      status: (event) => handlers.onStatus?.(event),
      token: (event) => handlers.onToken?.(event.text),
      message: (event) => {
        if (event.message.role === 'assistant') sawAssistant = true;
        handlers.onMessage?.(event.message);
      },
      context: (event) => handlers.onContext?.(event.context),
      error: (event) => {
        throw new GenerateError(event);
      },
    },
  );

  // A stream that ended without the assistant's persisted turn left a bubble
  // on screen that is not in the database — say so rather than let a reload
  // silently disagree with what she is looking at.
  if (!sawAssistant) throw new Error('The reply stream ended before the answer was saved.');
}

/** `DELETE /api/patients/:id/brainstorm` — "New conversation", after her confirm. */
export async function clearBrainstorm(
  patientId: string,
): Promise<{ messages: BrainstormMessage[]; context: BrainstormContext }> {
  return requestJson(`/api/patients/${patientId}/brainstorm`, BrainstormThreadResponseSchema, {
    method: 'DELETE',
  });
}

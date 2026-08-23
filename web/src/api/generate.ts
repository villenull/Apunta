import {
  GenerateErrorEventSchema,
  GenerateNoteEventSchema,
  GenerateStatusEventSchema,
  GenerateTokenEventSchema,
  type GenerateErrorEvent,
  type GenerateNoteEvent,
  type GenerateRequest,
  type GenerateStatusEvent,
  type GenerateTokenEvent,
} from '@apunta/shared';

import { requestStream } from './client.js';
import { readEvents } from './sse.js';

/** `POST /api/generate` over SSE — the drafting stream the capture screen shows. */

/** A failure the server reported *inside* the stream, once the 200 was committed. */
export class GenerateError extends Error {
  readonly code: GenerateErrorEvent['code'];

  constructor(event: GenerateErrorEvent) {
    super(event.message);
    this.name = 'GenerateError';
    this.code = event.code;
  }
}

export interface GenerateHandlers {
  /** Progress: contacting the AI, loading the model, drafting, retrying. */
  onStatus?: (event: GenerateStatusEvent) => void;
  /** A decoded slice of one section's body — never raw JSON. */
  onToken?: (event: GenerateTokenEvent) => void;
}

export async function generateNote(
  input: GenerateRequest,
  handlers: GenerateHandlers = {},
  signal?: AbortSignal,
): Promise<GenerateNoteEvent> {
  const response = await requestStream('/api/generate', {
    method: 'POST',
    body: input,
    ...(signal ? { signal } : {}),
  });
  if (!response.body) throw new Error('The server sent no draft stream.');

  let result: GenerateNoteEvent | null = null;

  for await (const frame of readEvents(response.body, signal)) {
    switch (frame.event) {
      case 'status':
        handlers.onStatus?.(GenerateStatusEventSchema.parse(frame.data));
        break;
      case 'token':
        handlers.onToken?.(GenerateTokenEventSchema.parse(frame.data));
        break;
      case 'note':
        result = GenerateNoteEventSchema.parse(frame.data);
        break;
      case 'error':
        throw new GenerateError(GenerateErrorEventSchema.parse(frame.data));
      default:
        // An event name this build does not know about is not a reason to
        // fail: the stream still ends with `note` or `error`.
        break;
    }
  }

  if (result === null) throw new Error('The draft stream ended before the note was saved.');
  return result;
}

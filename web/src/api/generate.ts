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

/**
 * `POST /api/generate` over SSE.
 *
 * `EventSource` cannot POST, so the stream is read off `fetch` by hand. The
 * frames are tiny and the format is three lines, so this is less machinery
 * than a library would be.
 */

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

interface SseFrame {
  readonly event: string;
  readonly data: unknown;
}

/** Split an SSE body into frames. Only `event:` and `data:` are used. */
async function* readEvents(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<SseFrame> {
  const reader = body.getReader();
  const utf8 = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += utf8.decode(value, { stream: true });

      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const frame = parseFrame(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf('\n\n');
        if (frame) yield frame;
      }
      if (signal?.aborted) break;
    }
  } finally {
    // Leaving the loop early (an abort, or a throw on an `error` event) must
    // release the connection rather than leave the server drafting into it.
    reader.cancel().catch(() => {});
  }
}

function parseFrame(raw: string): SseFrame | null {
  let event: string | null = null;
  const data: string[] = [];

  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).trim());
  }
  if (event === null || data.length === 0) return null;

  try {
    return { event, data: JSON.parse(data.join('\n')) };
  } catch {
    return null;
  }
}

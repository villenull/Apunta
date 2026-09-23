import type { z } from 'zod';

/** A decoded server-sent event from a fetch response. */
export interface SseFrame {
  readonly event: string;
  readonly data: unknown;
}

/** Split an SSE body into frames, in order. Only `event:` and `data:` are used. */
export async function* readEvents(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<SseFrame> {
  const reader = body.getReader();
  const utf8 = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await (signal ? raceAbort(reader.read(), signal) : reader.read());
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
    reader.cancel().catch(() => {});
  }
}

/**
 * Validate and dispatch each event in a stream. Unknown event names are
 * deliberately ignored so an older browser can consume a newer server's
 * additive events.
 */
export async function consumeStream<const Schemas extends Readonly<Record<string, z.ZodTypeAny>>>(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal | undefined,
  schemas: Schemas,
  handlers: {
    readonly [Event in keyof Schemas]?: (data: z.output<Schemas[Event]>) => void | Promise<void>;
  },
): Promise<void> {
  for await (const frame of readEvents(body, signal)) {
    const schema = schemas[frame.event];
    const handler = handlers[frame.event as keyof Schemas];
    if (schema === undefined || handler === undefined) continue;
    await handler(schema.parse(frame.data) as z.output<Schemas[keyof Schemas]>);
  }
}

/** Reject when the signal fires, so an abort wins over a read that never settles. */
function raceAbort<T>(read: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    read.then(resolve, reject);
  });
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

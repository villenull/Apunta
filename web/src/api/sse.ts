/**
 * Reading a server-sent-event body off `fetch`.
 *
 * `EventSource` cannot POST and both streaming endpoints are POSTs, so the
 * frames are parsed by hand. The format is three lines and the frames are
 * tiny, so this is less machinery than a library would be — and it is shared
 * by `/api/generate` and `/api/notes/:id/chat` rather than written twice.
 */

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
      // An abort must interrupt a hung read, not wait for the server to speak
      // next: without the race, stopping a reply leaves the reader — and the
      // send awaiting it — pending forever.
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
    // Leaving the loop early (an abort, or a throw on an `error` event) must
    // release the connection rather than leave the server working into it.
    reader.cancel().catch(() => {});
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

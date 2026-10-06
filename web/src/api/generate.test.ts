import { afterEach, describe, expect, it, vi } from 'vitest';

import { GenerateError, generateNote } from './generate.js';
import { makeNote } from '../test/fakeApi.js';

/**
 * The SSE reader. Its job is small but the failure it prevents is not: a
 * dropped `note` event would leave the user on the capture screen with a draft
 * that was silently saved, and a mis-read `error` event would show a stack
 * trace where a sentence about starting Ollama belongs.
 */

const PATIENT = '0198c0f0-0000-7000-8000-000000000001';
const FORMAT = '0198c0f0-0000-7000-8000-000000000002';
const REQUEST = { patient_id: PATIENT, format_id: FORMAT, typed_notes: 'Sleep improved.' };

/** An SSE body delivered in `chunks` pieces, to prove framing survives splits. */
function stubStream(body: string, chunkSize = body.length): void {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let at = 0; at < body.length; at += chunkSize) {
        controller.enqueue(encoder.encode(body.slice(at, at + chunkSize)));
      }
      controller.close();
    },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () => new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    ),
  );
}

function frame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

const note = makeNote(PATIENT);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('generateNote', () => {
  it('reports status and tokens, then returns the saved note', async () => {
    stubStream(
      frame('status', { stage: 'drafting', message: 'Drafting the note…' }) +
        frame('token', { section: 'Subjective', text: 'Sleeping ' }) +
        frame('token', { section: 'Subjective', text: 'better.' }) +
        frame('note', { note, empty_sections: ['Objective'] }),
    );

    const tokens: string[] = [];
    const statuses: string[] = [];
    const result = await generateNote(REQUEST, {
      onStatus: (event) => statuses.push(event.stage),
      onToken: (event) => tokens.push(`${event.section}:${event.text}`),
    });

    expect(statuses).toEqual(['drafting']);
    expect(tokens).toEqual(['Subjective:Sleeping ', 'Subjective:better.']);
    expect(result.note.id).toBe(note.id);
    expect(result.empty_sections).toEqual(['Objective']);
  });

  it('reassembles frames however the chunks fall', async () => {
    const body =
      frame('token', { section: 'Plan', text: 'Continue weekly.' }) +
      frame('note', { note, empty_sections: [] });

    for (const chunkSize of [1, 3, 17, body.length]) {
      stubStream(body, chunkSize);
      const tokens: string[] = [];
      const result = await generateNote(REQUEST, { onToken: (event) => tokens.push(event.text) });
      expect(tokens, `chunk size ${String(chunkSize)}`).toEqual(['Continue weekly.']);
      expect(result.note.id).toBe(note.id);
    }
  });

  it('turns an error event into a GenerateError carrying the server’s message', async () => {
    stubStream(
      frame('error', {
        code: 'ollama_unreachable',
        message: "Apunta can't reach the local AI.",
      }),
    );

    const thrown = await generateNote(REQUEST).catch((error: unknown) => error);
    expect(thrown).toBeInstanceOf(GenerateError);
    expect(thrown).toMatchObject({
      code: 'ollama_unreachable',
      message: "Apunta can't reach the local AI.",
    });
  });

  it('ignores an event name it does not recognise', async () => {
    stubStream(frame('heartbeat', { at: 1 }) + frame('note', { note, empty_sections: [] }));
    await expect(generateNote(REQUEST)).resolves.toMatchObject({ note: { id: note.id } });
  });

  it('fails loudly if the stream ends without a note', async () => {
    stubStream(frame('token', { section: 'Plan', text: 'Weekly.' }));
    await expect(generateNote(REQUEST)).rejects.toThrow(/ended before the note was saved/);
  });

  /** Validation happens before the stream opens, so this is a plain 404. */
  it('surfaces a pre-stream rejection as an ordinary API error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 'not_found', message: 'Note format not found' }), {
            status: 404,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );
    await expect(generateNote(REQUEST)).rejects.toThrow('Note format not found');
  });
});

import type { BrainstormContext, BrainstormMessage } from '@apunta/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { sendBrainstormMessage } from './brainstorm.js';
import { GenerateError } from './generate.js';

/**
 * The brainstorm stream's client half.
 *
 * What it must not do: lose the assistant's persisted row, and show a bubble
 * a reload would not. What it must do: surface a local-AI failure as the
 * sentence the server wrote, not a stack trace — and report which notes the
 * turn was given before the first token.
 */

const PATIENT_ID = '0198c0f0-0000-7000-8000-0000000000aa';

function makeTurn(role: BrainstormMessage['role'], text: string): BrainstormMessage {
  return {
    id: `0198c0f0-0000-7000-8000-0000000000${role === 'user' ? 'b1' : 'b2'}`,
    patient_id: PATIENT_ID,
    role,
    text,
    created_at: '2026-09-21T09:00:00.000Z',
  };
}

/** An SSE body delivered in `chunkSize` pieces, to prove framing survives splits. */
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

const userTurn = makeTurn('user', 'What stands out?');
const assistantTurn = makeTurn('assistant', 'Thinking with the notes: sleep is better.');
const context = {
  notes: [{ id: '0198c0f0-0000-7000-8000-0000000000cc', title: 'Progress note', date: '2026-09-18' }],
  cap: 5,
  dropped_note_ids: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('sendBrainstormMessage', () => {
  it('reports both turns, the context first, and the reply as it streams', async () => {
    stubStream(
      frame('message', { message: userTurn }) +
        frame('context', { context }) +
        frame('status', { stage: 'drafting', message: 'Thinking…' }) +
        frame('token', { text: 'Thinking with ' }) +
        frame('token', { text: 'the notes: sleep is better.' }) +
        frame('message', { message: assistantTurn }),
      7, // split mid-frame: the reader must reassemble across chunks
    );

    const tokens: string[] = [];
    const roles: string[] = [];
    let seen: BrainstormContext | null = null;
    let status: string | null = null;

    await sendBrainstormMessage(
      PATIENT_ID,
      { message: 'What stands out?' },
      {
        onStatus: (event) => {
          status = event.message;
        },
        onToken: (text) => tokens.push(text),
        onMessage: (message) => roles.push(message.role),
        onContext: (value) => {
          seen = value;
        },
      },
    );

    expect(tokens.join('')).toBe('Thinking with the notes: sleep is better.');
    expect(roles).toEqual(['user', 'assistant']);
    expect(seen).toEqual(context);
    expect(status).toBe('Thinking…');
  });

  it('throws the server’s own sentence when the local AI is not running', async () => {
    stubStream(
      frame('message', { message: userTurn }) +
        frame('context', { context }) +
        frame('error', {
          code: 'ollama_unreachable',
          message: "Apunta can't reach the local AI — see Setup.",
        }),
    );

    const thrown = await sendBrainstormMessage(PATIENT_ID, { message: 'What stands out?' }).catch(
      (error: unknown) => error,
    );

    expect(thrown).toBeInstanceOf(GenerateError);
    expect((thrown as GenerateError).code).toBe('ollama_unreachable');
    expect((thrown as GenerateError).message).toContain("Apunta can't reach the local AI");
  });

  it('fails rather than leave a bubble the database does not have', async () => {
    stubStream(frame('message', { message: userTurn }) + frame('token', { text: 'Thinking…' }));

    await expect(sendBrainstormMessage(PATIENT_ID, { message: 'What stands out?' })).rejects.toThrow(
      'ended before the answer was saved',
    );
  });

  it('ignores an event name it does not know', async () => {
    stubStream(
      frame('surprise', { hello: true }) +
        frame('message', { message: userTurn }) +
        frame('message', { message: assistantTurn }),
    );

    const roles: string[] = [];
    await sendBrainstormMessage(
      PATIENT_ID,
      { message: 'What stands out?' },
      { onMessage: (message) => roles.push(message.role) },
    );
    expect(roles).toEqual(['user', 'assistant']);
  });
});

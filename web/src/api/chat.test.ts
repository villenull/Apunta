import { afterEach, describe, expect, it, vi } from 'vitest';

import { sendChatMessage } from './chat.js';
import { GenerateError } from './generate.js';
import { makeChatMessage, makeNote } from '../test/fakeApi.js';

/**
 * The refine stream's client half.
 *
 * What it must not do: lose the assistant's persisted row, and show a bubble a
 * reload would not. What it must do: surface a local-AI failure as the
 * sentence the server wrote, not a stack trace.
 */

const NOTE_ID = '0198c0f0-0000-7000-8000-0000000000aa';

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

const userTurn = makeChatMessage(NOTE_ID, 'user', 'Make the plan shorter');
const assistantTurn = makeChatMessage(NOTE_ID, 'assistant', 'Shortened the Plan section.');
const rewritten = makeNote('0198c0f0-0000-7000-8000-0000000000bb', {
  id: NOTE_ID,
  content: 'Plan: Continue weekly sessions and grounding exercises.',
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('sendChatMessage', () => {
  it('reports both turns, the reply as it streams, and the rewritten note', async () => {
    stubStream(
      frame('message', { message: userTurn }) +
        frame('status', { stage: 'drafting', message: 'Thinking…' }) +
        frame('note-updated', { note: rewritten, empty_sections: ['Objective'] }) +
        frame('token', { text: 'Shortened ' }) +
        frame('token', { text: 'the Plan section.' }) +
        frame('message', { message: assistantTurn }),
      7, // split mid-frame: the reader must reassemble across chunks
    );

    const tokens: string[] = [];
    const roles: string[] = [];
    let updated: string | null = null;
    let status: string | null = null;

    await sendChatMessage(
      NOTE_ID,
      { message: 'Make the plan shorter' },
      {
        onStatus: (event) => {
          status = event.message;
        },
        onToken: (text) => tokens.push(text),
        onMessage: (message) => roles.push(message.role),
        onNoteUpdated: async (event) => {
          updated = event.note.content;
          await Promise.resolve();
        },
      },
    );

    expect(tokens.join('')).toBe('Shortened the Plan section.');
    expect(roles).toEqual(['user', 'assistant']);
    expect(updated).toBe('Plan: Continue weekly sessions and grounding exercises.');
    expect(status).toBe('Thinking…');
  });

  it('throws the server’s own sentence when the local AI is not running', async () => {
    stubStream(
      frame('message', { message: userTurn }) +
        frame('error', {
          code: 'ollama_unreachable',
          message: "Apunta can't reach the local AI.",
        }),
    );

    // One call only: the stubbed body can be read once, as a real one can.
    const thrown = await sendChatMessage(NOTE_ID, { message: 'Make the plan shorter' }).catch(
      (error: unknown) => error,
    );

    expect(thrown).toBeInstanceOf(GenerateError);
    expect((thrown as GenerateError).code).toBe('ollama_unreachable');
    expect((thrown as GenerateError).message).toContain("Apunta can't reach the local AI");
  });

  it('fails rather than leave a bubble the database does not have', async () => {
    stubStream(frame('message', { message: userTurn }) + frame('token', { text: 'Shortened…' }));

    await expect(sendChatMessage(NOTE_ID, { message: 'Make the plan shorter' })).rejects.toThrow(
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
    await sendChatMessage(
      NOTE_ID,
      { message: 'Make the plan shorter' },
      { onMessage: (message) => roles.push(message.role) },
    );
    expect(roles).toEqual(['user', 'assistant']);
  });
});

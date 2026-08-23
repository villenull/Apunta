import {
  FIRST_PASS_MESSAGE,
  PUBLISHED_REFUSAL,
  type ChatMessage,
  type Note,
  type NoteFormat,
  type Patient,
} from '@apunta/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { listChatMessagesForNote } from '../db/chat-messages.js';
import { getNote } from '../db/notes.js';
import { createTestApp, seedFormat, seedNote, seedPatient, type TestApp } from '../test/harness.js';

/**
 * `POST /api/notes/:id/chat` against a real SQLite file and the fake provider.
 *
 * The fake's canned refine logic mirrors the prototype's, so the messages the
 * tests send are the ones the prototype's own `sendChat` branches on: anything
 * mentioning "plan" rewrites the Plan section, and anything with a question
 * mark that mentions neither plan nor sleep is answered without a rewrite.
 */

interface SseEvent {
  readonly name: string;
  readonly data: Record<string, unknown>;
}

function parseSse(body: string): SseEvent[] {
  const events: SseEvent[] = [];
  for (const frame of body.split('\n\n')) {
    const name = /^event: (.+)$/m.exec(frame)?.[1];
    const data = /^data: (.+)$/m.exec(frame)?.[1];
    if (name === undefined || data === undefined) continue;
    events.push({ name, data: JSON.parse(data) as Record<string, unknown> });
  }
  return events;
}

async function chat(
  app: FastifyInstance,
  noteId: string,
  payload: Record<string, unknown>,
): Promise<{ statusCode: number; events: SseEvent[] }> {
  const response = await app.inject({ method: 'POST', url: `/api/notes/${noteId}/chat`, payload });
  return { statusCode: response.statusCode, events: parseSse(response.body) };
}

/** Every `message` event, in order — the user's turn then the assistant's. */
function messages(events: SseEvent[]): ChatMessage[] {
  return events
    .filter((event) => event.name === 'message')
    .map((event) => event.data['message'] as ChatMessage);
}

function assistantReply(events: SseEvent[]): string {
  return messages(events).find((message) => message.role === 'assistant')?.text ?? '';
}

const NOTE_TEXT = [
  'Subjective: Patient reports improved sleep since last session.',
  'Objective: Alert and engaged in session.',
  'Assessment: Continued progress on anxiety management goals.',
  'Plan: Continue weekly sessions. Introduce grounding exercises for use between sessions.',
].join('\n\n');

let harness: TestApp;
let patient: Patient;
let format: NoteFormat;

async function freshNote(content = NOTE_TEXT): Promise<Note> {
  return seedNote(harness.app, patient.id, format.id, content);
}

async function publish(noteId: string): Promise<void> {
  await harness.app.inject({ method: 'POST', url: `/api/notes/${noteId}/publish` });
}

beforeAll(async () => {
  harness = await createTestApp();
  patient = await seedPatient(harness.app, 'John Smith');
  format = await seedFormat(harness.app);
});

afterAll(async () => {
  await harness.close();
});

describe('POST /api/notes/:id/chat — refining a draft', () => {
  it('streams reply tokens, rewrites the note, and persists both turns', async () => {
    const note = await freshNote();

    const { statusCode, events } = await chat(harness.app, note.id, { message: 'Make the plan shorter' });

    expect(statusCode).toBe(200);
    const names = events.map((event) => event.name);
    expect(names).toContain('token');
    expect(names.at(-1)).toBe('note-updated');
    expect(names).not.toContain('error');

    // The reply streams as prose, never as the JSON the model actually emits.
    const streamed = events
      .filter((event) => event.name === 'token')
      .map((event) => String(event.data['text']))
      .join('');
    expect(streamed).toBe('Shortened the Plan section.');
    expect(streamed).not.toContain('{"');

    const updated = events.at(-1)?.data['note'] as Note;
    expect(updated.content).toContain('Plan: Continue weekly sessions and grounding exercises.');
    expect(updated.content).not.toContain('Introduce grounding exercises');
    // Untouched sections come back verbatim.
    expect(updated.content).toContain('Subjective: Patient reports improved sleep since last session.');

    // …and that is what is in the database, with `updated_at` moved on.
    const stored = getNote(harness.db, note.id);
    expect(stored?.content).toBe(updated.content);
    expect(stored?.updated_at).not.toBe(note.updated_at);

    const thread = listChatMessagesForNote(harness.db, note.id);
    expect(thread.map((message) => message.role)).toEqual(['user', 'assistant']);
    expect(thread[0]?.text).toBe('Make the plan shorter');
    expect(thread[1]?.text).toBe('Shortened the Plan section.');
  });

  it('echoes the persisted user turn before the assistant answers', async () => {
    const note = await freshNote();

    const { events } = await chat(harness.app, note.id, { message: 'Make the plan shorter' });

    const sent = messages(events);
    expect(sent[0]?.role).toBe('user');
    expect(sent[0]?.note_id).toBe(note.id);
    expect(sent.at(-1)?.role).toBe('assistant');
    // The user's row arrives before the first token, so the browser can swap
    // its optimistic bubble for the real one while the reply is still coming.
    const firstMessage = events.findIndex((event) => event.name === 'message');
    expect(firstMessage).toBeLessThan(events.findIndex((event) => event.name === 'token'));
  });

  it('persists a highlighted excerpt and echoes it back', async () => {
    const note = await freshNote();
    const quote = 'Plan: Continue weekly sessions.';

    const { events } = await chat(harness.app, note.id, { message: 'Tighten the plan', ref_quote: quote });

    expect(messages(events)[0]?.ref_quote).toBe(quote);
    const thread = listChatMessagesForNote(harness.db, note.id);
    expect(thread[0]?.ref_quote).toBe(quote);
    // The assistant's own row carries no quote — it is hers, not its.
    expect(thread[1]?.ref_quote).toBeNull();
  });

  it('answers a question without touching the note', async () => {
    const note = await freshNote();

    const { events } = await chat(harness.app, note.id, { message: 'What does this say about her mood?' });

    expect(events.map((event) => event.name)).not.toContain('note-updated');
    expect(assistantReply(events)).toContain('Based on the note');
    expect(getNote(harness.db, note.id)?.content).toBe(NOTE_TEXT);
  });

  it('refines whatever the editor currently shows, not what was drafted', async () => {
    const note = await freshNote();
    const handEdited = NOTE_TEXT.replace(
      'Objective: Alert and engaged in session.',
      'Objective: Alert and engaged. She had walked here in the rain.',
    );
    await harness.app.inject({
      method: 'PATCH',
      url: `/api/notes/${note.id}`,
      payload: { content: handEdited },
    });

    const { events } = await chat(harness.app, note.id, { message: 'Make the plan shorter' });

    const updated = events.at(-1)?.data['note'] as Note;
    // The sentence she typed a moment ago is in the revision, which it could
    // only be if the *current* note went to the model rather than the draft.
    expect(updated.content).toContain('She had walked here in the rain.');
    expect(updated.content).toContain('Plan: Continue weekly sessions and grounding exercises.');
  });

  it('carries an empty section through a rewrite and reports it', async () => {
    const note = await freshNote(
      ['Subjective: Improved sleep.', 'Objective:', 'Assessment: Progressing.', 'Plan: Weekly.'].join('\n\n'),
    );

    const { events } = await chat(harness.app, note.id, { message: 'Make the plan shorter' });

    const final = events.at(-1);
    expect(final?.name).toBe('note-updated');
    expect(final?.data['empty_sections']).toEqual(['Objective']);
    // The header still travels: she fills the blank in on the far side.
    expect(String((final?.data['note'] as Note).content)).toContain('Objective:');
  });

  it('sends the recent thread back as history on the next turn', async () => {
    const note = await freshNote();

    await chat(harness.app, note.id, { message: 'Make the plan shorter' });
    await chat(harness.app, note.id, { message: 'And is that clear enough now?' });

    const thread = listChatMessagesForNote(harness.db, note.id);
    expect(thread.map((message) => message.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
  });
});

describe('POST /api/notes/:id/chat — the published lock', () => {
  it('refuses an edit in the prototype’s words and leaves the note alone', async () => {
    const note = await freshNote();
    await publish(note.id);

    const { events } = await chat(harness.app, note.id, { message: 'Make the plan shorter' });

    expect(events.map((event) => event.name)).not.toContain('note-updated');
    expect(assistantReply(events)).toBe(PUBLISHED_REFUSAL);

    const stored = getNote(harness.db, note.id);
    expect(stored?.content).toBe(NOTE_TEXT);
    expect(stored?.status).toBe('published');
  });

  it('still answers a question about a published note', async () => {
    const note = await freshNote();
    await publish(note.id);

    const { events } = await chat(harness.app, note.id, { message: 'What does this say about her mood?' });

    expect(assistantReply(events)).toContain('Based on the note');
    expect(assistantReply(events)).not.toBe(PUBLISHED_REFUSAL);
    expect(getNote(harness.db, note.id)?.content).toBe(NOTE_TEXT);
  });

  it('refuses when a question turns out to be an edit request in disguise', async () => {
    const note = await freshNote();
    await publish(note.id);

    // The fake reads "plan" as an instruction and returns a rewrite, exactly
    // as a real model would for "shorten the plan, is that ok?".
    const { events } = await chat(harness.app, note.id, { message: 'Can you shorten the plan?' });

    expect(assistantReply(events)).toBe(PUBLISHED_REFUSAL);
    expect(events.map((event) => event.name)).not.toContain('note-updated');
    expect(getNote(harness.db, note.id)?.content).toBe(NOTE_TEXT);
  });

  it('records the refusal in the thread, so a reload still shows it', async () => {
    const note = await freshNote();
    await publish(note.id);

    await chat(harness.app, note.id, { message: 'Make the plan shorter' });

    const thread = listChatMessagesForNote(harness.db, note.id);
    expect(thread.map((message) => message.text)).toEqual(['Make the plan shorter', PUBLISHED_REFUSAL]);
  });

  it('lets an unpublished note be edited again', async () => {
    const note = await freshNote();
    await publish(note.id);
    await harness.app.inject({ method: 'POST', url: `/api/notes/${note.id}/unpublish` });

    const { events } = await chat(harness.app, note.id, { message: 'Make the plan shorter' });

    expect(events.at(-1)?.name).toBe('note-updated');
    expect(getNote(harness.db, note.id)?.content).toContain('Continue weekly sessions and grounding');
  });
});

describe('POST /api/notes/:id/chat — bad requests', () => {
  it('404s an unknown note before the stream opens', async () => {
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/notes/0198c0f0-0000-7000-8000-00000000dead/chat',
      payload: { message: 'Make the plan shorter' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toContain('application/json');
  });

  it('400s an empty message, and writes nothing to the thread', async () => {
    const note = await freshNote();

    const response = await harness.app.inject({
      method: 'POST',
      url: `/api/notes/${note.id}/chat`,
      payload: { message: '   ' },
    });

    expect(response.statusCode).toBe(400);
    expect(listChatMessagesForNote(harness.db, note.id)).toHaveLength(0);
  });
});

describe('GET /api/notes/:id/chat', () => {
  it('returns the thread oldest first, and survives a fresh request', async () => {
    const note = await freshNote();
    await chat(harness.app, note.id, { message: 'Make the plan shorter' });

    const response = await harness.app.inject({ method: 'GET', url: `/api/notes/${note.id}/chat` });

    expect(response.statusCode).toBe(200);
    const { messages: thread } = response.json<{ messages: ChatMessage[] }>();
    expect(thread.map((message) => message.role)).toEqual(['user', 'assistant']);
  });

  it('is empty for a note nobody has talked to', async () => {
    const note = await freshNote();
    const response = await harness.app.inject({ method: 'GET', url: `/api/notes/${note.id}/chat` });
    expect(response.json<{ messages: ChatMessage[] }>().messages).toEqual([]);
  });

  it('404s an unknown note', async () => {
    const response = await harness.app.inject({
      method: 'GET',
      url: '/api/notes/0198c0f0-0000-7000-8000-00000000dead/chat',
    });
    expect(response.statusCode).toBe(404);
  });

  it('cascades away with the note', async () => {
    const note = await freshNote();
    await chat(harness.app, note.id, { message: 'Make the plan shorter' });
    await harness.app.inject({ method: 'DELETE', url: `/api/notes/${note.id}` });

    expect(listChatMessagesForNote(harness.db, note.id)).toEqual([]);
  });
});

describe('POST /api/generate — the thread it opens', () => {
  it('writes the assistant’s first-pass message so the chat is never empty', async () => {
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/generate',
      payload: {
        patient_id: patient.id,
        format_id: format.id,
        typed_notes: 'Sleep improved, intrusive thoughts less frequent.',
      },
    });

    const note = parseSse(response.body).at(-1)?.data['note'] as Note;
    const thread = listChatMessagesForNote(harness.db, note.id);

    expect(thread).toHaveLength(1);
    expect(thread[0]?.role).toBe('assistant');
    expect(thread[0]?.text).toBe(FIRST_PASS_MESSAGE);
  });
});

/**
 * The streaming endpoints get one suite over a real socket.
 *
 * `app.inject` never opens one, so it cannot see the class of bug that shipped
 * in M3: the SSE helper watched `request.raw` for 'close', which since Node 16
 * fires when the request *body* has been read. Every POST looked disconnected
 * within milliseconds and the stream ended having sent nothing — while every
 * injected test passed. `/api/notes/:id/chat` uses the same helper, so it gets
 * the same guard.
 */
describe('POST /api/notes/:id/chat over a real connection', () => {
  it('streams tokens and finishes with the rewritten note', async () => {
    const local = await createTestApp();
    try {
      const localPatient = await seedPatient(local.app, 'John Smith');
      const localFormat = await seedFormat(local.app);
      const note = await seedNote(local.app, localPatient.id, localFormat.id, NOTE_TEXT);

      const address = await local.app.listen({ port: 0, host: '127.0.0.1' });
      const response = await fetch(`${address}/api/notes/${note.id}/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'Make the plan shorter' }),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/event-stream');

      const events = parseSse(await response.text());

      // The regression this suite exists for: this used to be empty.
      expect(events.length).toBeGreaterThan(0);
      expect(events.some((event) => event.name === 'token')).toBe(true);

      const final = events.at(-1);
      expect(final?.name).toBe('note-updated');
      expect(String((final?.data['note'] as Note).content)).toContain(
        'Plan: Continue weekly sessions and grounding exercises.',
      );
    } finally {
      await local.close();
    }
  });
});

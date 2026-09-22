import {
  BRAINSTORM_HISTORY_TURNS,
  approximateTokens,
  type BrainstormMessage,
  type BrainstormThreadResponse,
  type Note,
  type NoteFormat,
  type Patient,
} from '@apunta/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { FakeSttProvider } from '../ai/fake.js';
import { OllamaProvider, brainstormPromptTokens } from '../ai/ollama.js';
import { buildBrainstormPrompt } from '../ai/prompts.js';
import { listBrainstormMessages } from '../db/brainstorm.js';
import { addBatchPatient, createImportBatch, undoImportBatch } from '../db/import-batches.js';
import { createTranscript } from '../db/transcripts.js';
import { buildApp } from '../app.js';
import { createTestApp, seedFormat, seedNote, seedPatient, type TestApp } from '../test/harness.js';
import { recordingProviders } from '../test/providers.js';
import { assembleBrainstormContext } from './brainstorm.js';

/**
 * `GET/POST/DELETE /api/patients/:id/brainstorm` against a real SQLite file
 * and the fake provider.
 *
 * The fake answers every discussion with one canned thought naming what went
 * in, so the tests send ordinary questions and assert on the plumbing: the
 * patient name and every note that fits reach the model, the budget trims turns
 * before notes, and nothing but the thread is ever written.
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

async function discuss(
  app: FastifyInstance,
  patientId: string,
  payload: Record<string, unknown>,
): Promise<{ statusCode: number; events: SseEvent[] }> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/patients/${patientId}/brainstorm`,
    payload,
  });
  return { statusCode: response.statusCode, events: parseSse(response.body) };
}

/** Every `message` event, in order — the user's turn then the assistant's. */
function messages(events: SseEvent[]): BrainstormMessage[] {
  return events
    .filter((event) => event.name === 'message')
    .map((event) => event.data['message'] as BrainstormMessage);
}

function assistantReply(events: SseEvent[]): string {
  return messages(events).find((message) => message.role === 'assistant')?.text ?? '';
}

function streamedText(events: SseEvent[]): string {
  return events
    .filter((event) => event.name === 'token')
    .map((event) => String(event.data['text']))
    .join('');
}

let harness: TestApp;
let patient: Patient;
let format: NoteFormat;

async function freshNote(
  content = 'Subjective: Sleeps better. Wants to keep the weekly slot.',
): Promise<Note> {
  return seedNote(harness.app, patient.id, format.id, content);
}

beforeAll(async () => {
  harness = await createTestApp();
  patient = await seedPatient(harness.app, 'John Smith');
  format = await seedFormat(harness.app);
});

afterAll(async () => {
  await harness.close();
});

describe('POST /api/patients/:id/brainstorm — discussing a patient', () => {
  it('streams the fake reply live and persists the thread', async () => {
    await freshNote();
    const { statusCode, events } = await discuss(harness.app, patient.id, {
      message: 'What stands out lately?',
    });

    expect(statusCode).toBe(200);
    // The user turn first, so an optimistic bubble can be swapped for the row.
    expect(messages(events).map((message) => message.role)).toEqual(['user', 'assistant']);
    // The context decision arrives before the first token, while it matters.
    const names = events.map((event) => event.name);
    expect(names.indexOf('context')).toBeLessThan(names.indexOf('token'));
    // Nothing buffered, nothing rewritten: the stream is the reply.
    expect(streamedText(events)).toBe(assistantReply(events));
    expect(assistantReply(events)).toContain('Thinking with');
    expect(assistantReply(events)).toContain('John Smith');

    const thread = listBrainstormMessages(harness.db, patient.id);
    expect(thread.map((message) => message.role)).toEqual(['user', 'assistant']);
    expect(thread[1]?.text).toBe(assistantReply(events));
  });

  it('persists her words when the model is down', async () => {
    const app = await buildApp({
      config: harness.config,
      db: harness.db,
      logger: false,
      providers: {
        llm: new OllamaProvider({ baseUrl: 'http://127.0.0.1:1', resolveModel: () => 'gemma4:12b-it-qat' }),
        stt: new FakeSttProvider(),
      },
    });

    try {
      const before = listBrainstormMessages(harness.db, patient.id).length;
      const { statusCode, events } = await discuss(app, patient.id, { message: 'Are you there?' });

      expect(statusCode).toBe(200);
      expect(events.at(-1)?.name).toBe('error');
      // Her turn survives the retry she is about to make; no assistant turn does.
      const thread = listBrainstormMessages(harness.db, patient.id);
      expect(thread).toHaveLength(before + 1);
      expect(thread.at(-1)).toMatchObject({ role: 'user', text: 'Are you there?' });
    } finally {
      await app.close();
    }
  });

  it('404s an unknown patient before streaming', async () => {
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/patients/0198c0f0-0000-7000-8000-00000000dead/brainstorm',
      payload: { message: 'Hello?' },
    });
    expect(response.statusCode).toBe(404);
  });

  it('rejects an empty message before streaming, and writes nothing', async () => {
    const before = listBrainstormMessages(harness.db, patient.id).length;
    const { statusCode } = await discuss(harness.app, patient.id, { message: '   ' });

    expect(statusCode).toBe(400);
    expect(listBrainstormMessages(harness.db, patient.id)).toHaveLength(before);
  });

  it('never modifies the record, asserted against the database', async () => {
    const note = await freshNote();
    createTranscript(harness.db, {
      note_id: note.id,
      source: 'typed',
      raw_text: 'Sleeps better. Wants to keep the weekly slot.',
    });

    const dump = (): string => {
      const tables = harness.db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type = 'table'
             AND name NOT IN ('brainstorm_messages', 'schema_migrations') ORDER BY name`,
        )
        .all() as { name: string }[];
      return JSON.stringify(
        tables.map((table) => harness.db.prepare(`SELECT * FROM "${table.name}" ORDER BY rowid`).all()),
      );
    };

    const before = dump();
    const { statusCode } = await discuss(harness.app, patient.id, { message: 'Anything I am missing?' });
    expect(statusCode).toBe(200);
    // The thread grew — that is the one table this endpoint may write.
    expect(listBrainstormMessages(harness.db, patient.id).length).toBeGreaterThan(0);
    expect(dump()).toBe(before);
  });
});

describe('the context the model is given', () => {
  it('sends the patient name and every note, newest first — no lookback cap', async () => {
    const providers = recordingProviders();
    const local = await createTestApp({ providers });
    try {
      const localPatient = await seedPatient(local.app, 'John Smith');
      const localFormat = await seedFormat(local.app);
      const seeded: Note[] = [];
      for (let index = 0; index < 7; index += 1) {
        seeded.push(
          await seedNote(local.app, localPatient.id, localFormat.id, `Subjective: Session ${String(index)}.`),
        );
      }
      // Rapid seeds can share a timestamp, and ties break by id — so pin the
      // order down: session N is the Nth-newest, whatever the clock said.
      for (const [index, note] of seeded.entries()) {
        local.db
          .prepare('UPDATE notes SET created_at = ? WHERE id = ?')
          .run(`2026-09-${String(10 + index).padStart(2, '0')}T09:00:00.000Z`, note.id);
      }

      const { statusCode } = await discuss(local.app, localPatient.id, { message: 'Where are we?' });
      expect(statusCode).toBe(200);

      const discussed = providers.llm.discussions;
      expect(discussed).toHaveLength(1);
      expect(discussed[0]?.patientName).toBe('John Smith');
      // Seven notes, more than the briefing's lookback of 5: Brainstorm
      // takes all of them (owner, 2026-09-21), newest first, whole.
      expect(discussed[0]?.notes.map((note) => note.text)).toEqual([
        'Subjective: Session 6.',
        'Subjective: Session 5.',
        'Subjective: Session 4.',
        'Subjective: Session 3.',
        'Subjective: Session 2.',
        'Subjective: Session 1.',
        'Subjective: Session 0.',
      ]);
      expect(discussed[0]?.omittedNotes ?? 0).toBe(0);

      const stored = (
        await local.app.inject({ method: 'GET', url: `/api/patients/${localPatient.id}/brainstorm` })
      ).json<BrainstormThreadResponse>();
      expect(stored.context.notes.map((note) => note.id)).toHaveLength(7);
      expect(stored.context.total).toBe(7);
      expect(stored.context.dropped_note_ids).toEqual([]);
      expect(stored.context.most_recent).toBe(true);
    } finally {
      await local.close();
    }
  });

  it('trims the oldest turns before the oldest notes when the budget overflows', async () => {
    const providers = recordingProviders();
    const local = await createTestApp({ providers });
    try {
      const localPatient = await seedPatient(local.app, 'John Smith');
      const localFormat = await seedFormat(local.app);
      // Three notes of ~2,500 tokens each: they fit, but leave no room for a
      // twenty-turn thread beside them.
      for (let index = 0; index < 3; index += 1) {
        await seedNote(
          local.app,
          localPatient.id,
          localFormat.id,
          `Subjective: ${'Session ground. '.repeat(625)}`,
        );
      }
      // Ten exchanges, each ~300 tokens: twenty turns, ~6,000 tokens.
      for (let index = 0; index < 10; index += 1) {
        await discuss(local.app, localPatient.id, {
          message: `Thought ${String(index)}? ${'x '.repeat(500)}`,
        });
      }

      const discussed = providers.llm.discussions;
      const last = discussed.at(-1);
      // The thread holds all twenty turns; the model was given fewer, oldest gone.
      expect(listBrainstormMessages(local.db, localPatient.id)).toHaveLength(20);
      expect(last?.history.length).toBeLessThan(20);
      expect(last?.history.length).toBeLessThanOrEqual(BRAINSTORM_HISTORY_TURNS);
      expect(last?.history[0]?.text).not.toContain('Thought 0?');
      // …and every note still went, whole.
      expect(last?.notes).toHaveLength(3);
      expect(last?.notes[0]?.text).toContain('Session ground.');
    } finally {
      await local.close();
    }
  });

  it('leaves out a note too long to fit alone, and reports it', async () => {
    const providers = recordingProviders();
    const local = await createTestApp({ providers });
    try {
      const localPatient = await seedPatient(local.app, 'John Smith');
      const localFormat = await seedFormat(local.app);
      const small = await seedNote(
        local.app,
        localPatient.id,
        localFormat.id,
        'Subjective: Small and recent.',
      );
      const huge = await seedNote(
        local.app,
        localPatient.id,
        localFormat.id,
        `Subjective: ${'A very long session. '.repeat(2500)}`,
      );
      void small;

      // Make the huge note the *newest*, so the test proves a too-long note
      // does not crowd out the older ones that do fit.
      local.db
        .prepare('UPDATE notes SET created_at = ? WHERE id = ?')
        .run('2099-01-01T00:00:00.000Z', huge.id);

      const { statusCode } = await discuss(local.app, localPatient.id, { message: 'What fits?' });
      expect(statusCode).toBe(200);

      const last = providers.llm.discussions.at(-1);
      expect(last?.notes.some((note) => note.text.includes('A very long session'))).toBe(false);
      expect(last?.notes.length).toBeGreaterThan(0);

      const stored = (
        await local.app.inject({ method: 'GET', url: `/api/patients/${localPatient.id}/brainstorm` })
      ).json<BrainstormThreadResponse>();
      expect(stored.context.dropped_note_ids).toEqual([huge.id]);
      expect(stored.context.notes.map((note) => note.id)).not.toContain(huge.id);
      // The newest note is missing, so the screen must not say "most recent".
      expect(stored.context.most_recent).toBe(false);
      expect(stored.context.total).toBe(2);
    } finally {
      await local.close();
    }
  });

  it('fits as many of the newest notes as the window allows, and says how many were left out', async () => {
    const providers = recordingProviders();
    const local = await createTestApp({ providers });
    try {
      const localPatient = await seedPatient(local.app, 'John Smith');
      const localFormat = await seedFormat(local.app);
      // Thirty notes of ~860 estimated tokens each: ~26,000 in all, about
      // twice what the window holds.
      const seeded: Note[] = [];
      for (let index = 0; index < 30; index += 1) {
        seeded.push(
          await seedNote(
            local.app,
            localPatient.id,
            localFormat.id,
            `Subjective: Session ${String(index)}. ${'Slept better, walked daily. '.repeat(108)}`,
          ),
        );
      }
      for (const [index, note] of seeded.entries()) {
        local.db
          .prepare('UPDATE notes SET created_at = ? WHERE id = ?')
          .run(new Date(Date.UTC(2026, 0, 1 + index, 9)).toISOString(), note.id);
      }

      const assembled = assembleBrainstormContext(local.db, localPatient, 'What has changed?');
      const included = assembled.context.notes.length;
      expect(included).toBeGreaterThan(10);
      expect(included).toBeLessThan(30);
      // The newest ones, as a run: session 29 down to 29 - (included - 1).
      expect(assembled.notes[0]?.text).toContain('Session 29.');
      expect(assembled.notes.at(-1)?.text).toContain(`Session ${String(30 - included)}.`);
      expect(assembled.context.total).toBe(30);
      expect(assembled.context.dropped_note_ids).toHaveLength(30 - included);
      expect(assembled.context.dropped_note_ids).toContain(seeded[0]?.id);
      expect(assembled.context.most_recent).toBe(true);
      expect(assembled.omittedNotes).toBe(30 - included);

      // What went is exactly what the provider accepts, and nearly all of it.
      const prompt = buildBrainstormPrompt({
        patientName: localPatient.name,
        notes: assembled.notes,
        omittedNotes: assembled.omittedNotes,
        history: assembled.history,
        message: 'What has changed?',
      });
      const tokens = approximateTokens(prompt.system) + approximateTokens(prompt.user);
      expect(tokens).toBeLessThanOrEqual(brainstormPromptTokens());
      expect(tokens).toBeGreaterThan(brainstormPromptTokens() - 1000);
      // …and the model is told the older notes exist, so absence is not denial.
      expect(prompt.user).toContain(`Only ${String(included)} of her 30 notes on this patient fit here`);

      const { statusCode } = await discuss(local.app, localPatient.id, { message: 'What has changed?' });
      expect(statusCode).toBe(200);
      expect(providers.llm.discussions.at(-1)?.omittedNotes).toBe(30 - included);
    } finally {
      await local.close();
    }
  });

  it('assembles nothing for a patient with no notes', async () => {
    const fresh = await seedPatient(harness.app, 'No Notes Yet');
    const assembled = assembleBrainstormContext(harness.db, fresh, 'Hello?');
    expect(assembled.notes).toEqual([]);
    expect(assembled.context.notes).toEqual([]);
    expect(assembled.context.dropped_note_ids).toEqual([]);
    expect(assembled.context.total).toBe(0);
  });
});

describe('GET /api/patients/:id/brainstorm', () => {
  it('returns the thread oldest first with the notes the model would get', async () => {
    await freshNote('Subjective: A note to think with.');
    await discuss(harness.app, patient.id, { message: 'First thought?' });

    const response = await harness.app.inject({
      method: 'GET',
      url: `/api/patients/${patient.id}/brainstorm`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<BrainstormThreadResponse>();
    const roles = body.messages.map((message) => message.role);
    expect(roles[0]).toBe('user');
    expect(roles.at(-1)).toBe('assistant');
    expect(body.context.notes.length).toBeGreaterThan(0);
    expect(body.context.notes[0]).toMatchObject({ title: expect.any(String), date: expect.any(String) });
    expect(body.messages.every((message) => message.patient_id === patient.id)).toBe(true);
  });

  it('is empty for a patient nobody has thought about', async () => {
    const other = await seedPatient(harness.app, 'Maria Ruiz');
    const response = await harness.app.inject({ method: 'GET', url: `/api/patients/${other.id}/brainstorm` });

    expect(response.statusCode).toBe(200);
    expect(response.json<BrainstormThreadResponse>().messages).toEqual([]);
  });

  it('404s an unknown patient', async () => {
    const response = await harness.app.inject({
      method: 'GET',
      url: '/api/patients/0198c0f0-0000-7000-8000-00000000dead/brainstorm',
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('DELETE /api/patients/:id/brainstorm — a new conversation', () => {
  it('forgets the thread and answers the empty one', async () => {
    await discuss(harness.app, patient.id, { message: 'Something to forget?' });
    expect(listBrainstormMessages(harness.db, patient.id).length).toBeGreaterThan(0);

    const response = await harness.app.inject({
      method: 'DELETE',
      url: `/api/patients/${patient.id}/brainstorm`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<BrainstormThreadResponse>().messages).toEqual([]);
    expect(listBrainstormMessages(harness.db, patient.id)).toEqual([]);
  });

  it('404s an unknown patient', async () => {
    const response = await harness.app.inject({
      method: 'DELETE',
      url: '/api/patients/0198c0f0-0000-7000-8000-00000000dead/brainstorm',
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('the conversation around a patient’s life', () => {
  it('goes with the patient when they are deleted', async () => {
    const other = await seedPatient(harness.app, 'Maria Ruiz');
    await discuss(harness.app, other.id, { message: 'A thought about Maria?' });
    expect(listBrainstormMessages(harness.db, other.id).length).toBeGreaterThan(0);

    await harness.app.inject({ method: 'DELETE', url: `/api/patients/${other.id}` });

    expect(listBrainstormMessages(harness.db, other.id)).toEqual([]);
  });

  it('survives archiving, like the notes do', async () => {
    const other = await seedPatient(harness.app, 'Maria Ruiz');
    await discuss(harness.app, other.id, { message: 'A thought to keep?' });
    const before = listBrainstormMessages(harness.db, other.id);
    expect(before.length).toBeGreaterThan(0);

    await harness.app.inject({
      method: 'PATCH',
      url: `/api/patients/${other.id}`,
      payload: { archived: true },
    });

    expect(listBrainstormMessages(harness.db, other.id)).toEqual(before);
  });

  it('keeps an import patient who has a conversation when the run is undone', async () => {
    const other = await seedPatient(harness.app, 'Maria Ruiz');
    await discuss(harness.app, other.id, { message: 'A thought about an import?' });

    const batchId = createImportBatch(harness.db, 'assistant');
    addBatchPatient(harness.db, batchId, other.id);

    const result = undoImportBatch(harness.db, batchId);
    expect(result.patients_kept).toBe(1);
    expect(result.patients_deleted).toBe(0);
  });
});

/**
 * The streaming endpoints get one suite over a real socket.
 *
 * `app.inject` never opens one: light-my-request simulates the request, so
 * the lifecycle events Node emits on a real connection never fire. This suite
 * is the guard for that class of bug on the new endpoint.
 */
describe('POST /api/patients/:id/brainstorm over a real connection', () => {
  it('streams tokens and finishes with the persisted reply', async () => {
    const local = await createTestApp();
    try {
      const localPatient = await seedPatient(local.app, 'John Smith');
      const localFormat = await seedFormat(local.app);
      await seedNote(local.app, localPatient.id, localFormat.id, 'Subjective: Sleeps better.');

      const address = await local.app.listen({ port: 0, host: '127.0.0.1' });
      const response = await fetch(`${address}/api/patients/${localPatient.id}/brainstorm`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'What stands out?' }),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/event-stream');

      const events = parseSse(await response.text());

      // The regression this suite exists for: this used to be empty.
      expect(events.length).toBeGreaterThan(0);
      expect(events.some((event) => event.name === 'token')).toBe(true);
      expect(events.some((event) => event.name === 'context')).toBe(true);
      expect(assistantReply(events)).toContain('Thinking with');
    } finally {
      await local.close();
    }
  });
});

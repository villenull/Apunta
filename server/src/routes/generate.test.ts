import { listTranscriptsForNote } from '../db/transcripts.js';
import type { Note, NoteFormat, Patient } from '@apunta/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import { OllamaProvider } from '../ai/ollama.js';
import { FakeSttProvider } from '../ai/fake.js';
import { listNotesForPatient } from '../db/notes.js';
import { createTestApp, seedFormat, seedPatient, type TestApp } from '../test/harness.js';

/**
 * `POST /api/generate` end to end against a real SQLite file and the fake
 * provider, plus the one path fakes cannot cover: a real Ollama provider
 * pointed at a port with nothing behind it.
 */

interface SseEvent {
  readonly name: string;
  readonly data: Record<string, unknown>;
}

/** Parse an SSE body into its events, in order. */
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

async function generate(
  app: FastifyInstance,
  payload: Record<string, unknown>,
): Promise<{ statusCode: number; events: SseEvent[]; raw: string }> {
  const response = await app.inject({ method: 'POST', url: '/api/generate', payload });
  return { statusCode: response.statusCode, events: parseSse(response.body), raw: response.body };
}

let harness: TestApp;
let patient: Patient;
let format: NoteFormat;

beforeAll(async () => {
  harness = await createTestApp();
  patient = await seedPatient(harness.app, 'John Smith');
  format = await seedFormat(harness.app);
});

afterAll(async () => {
  await harness.close();
});

describe('POST /api/generate — the happy path', () => {
  it('streams tokens and then the saved note, in that order', async () => {
    const { statusCode, events } = await generate(harness.app, {
      patient_id: patient.id,
      format_id: format.id,
      typed_notes: 'Sleep improved, intrusive thoughts less frequent.',
    });

    expect(statusCode).toBe(200);
    const names = events.map((event) => event.name);
    expect(names).toContain('token');
    expect(names.at(-1)).toBe('note');
    expect(names.indexOf('token')).toBeLessThan(names.indexOf('note'));
    expect(names).not.toContain('error');
  });

  it('renders the streamed tokens into exactly the note it saved', async () => {
    const { events } = await generate(harness.app, {
      patient_id: patient.id,
      format_id: format.id,
      typed_notes: 'Sleep improved, intrusive thoughts less frequent.',
    });

    const streamed: Record<string, string> = {};
    for (const event of events) {
      if (event.name !== 'token') continue;
      const section = String(event.data['section']);
      streamed[section] = (streamed[section] ?? '') + String(event.data['text']);
    }

    const note = events.at(-1)?.data['note'] as Note;
    for (const [section, body] of Object.entries(streamed)) {
      expect(note.content).toContain(`${section}: ${body}`);
    }
  });

  it('persists the note and the transcript it was drafted from', async () => {
    const { events } = await generate(harness.app, {
      patient_id: patient.id,
      format_id: format.id,
      typed_notes: 'Sleep improved and the intrusive thoughts are less frequent.',
    });

    const note = events.at(-1)?.data['note'] as Note;
    expect(note.status).toBe('draft');
    expect(note.title).toBe(format.name);
    expect(listNotesForPatient(harness.db, patient.id).some((row) => row.id === note.id)).toBe(true);

    const transcripts = listTranscriptsForNote(harness.db, note.id);
    expect(transcripts).toHaveLength(1);
    expect(transcripts[0]?.source).toBe('typed');
    expect(transcripts[0]?.raw_text).toContain('intrusive thoughts');
  });

  /** M5 sends both; they are different evidence, so they are different rows. */
  it('stores one transcript row per source', async () => {
    const { events } = await generate(harness.app, {
      patient_id: patient.id,
      format_id: format.id,
      typed_notes: 'Rough notes: sleep better.',
      transcript: 'Okay so John Smith today, sleeping a lot better.',
    });

    const note = events.at(-1)?.data['note'] as Note;
    expect(
      listTranscriptsForNote(harness.db, note.id)
        .map((row) => row.source)
        .sort(),
    ).toEqual(['audio', 'typed']);
  });

  it('writes a section the model left blank as a bare header', async () => {
    const { events } = await generate(harness.app, {
      patient_id: patient.id,
      format_id: format.id,
      typed_notes: 'Difficult week around the anniversary of her mother’s death. Grief.',
    });

    const last = events.at(-1);
    expect(last?.data['empty_sections']).toEqual(['Objective']);
    expect((last?.data['note'] as Note).content).toContain('\n\nObjective:\n\n');
  });

  it('titles the note after the format unless one is given', async () => {
    const { events } = await generate(harness.app, {
      patient_id: patient.id,
      format_id: format.id,
      typed_notes: 'Sleep improved.',
      title: 'Friday session',
    });
    expect((events.at(-1)?.data['note'] as Note).title).toBe('Friday session');
  });
});

describe('POST /api/generate — rejected before the stream opens', () => {
  it('400s a request with nothing to draft from', async () => {
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/generate',
      payload: { patient_id: patient.id, format_id: format.id, typed_notes: '   ' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'bad_request' });
  });

  it('404s an unknown patient and an unknown format', async () => {
    const missing = '0198c0f0-0000-7000-8000-0000000000ff';
    const noPatient = await harness.app.inject({
      method: 'POST',
      url: '/api/generate',
      payload: { patient_id: missing, format_id: format.id, typed_notes: 'Sleep improved.' },
    });
    expect(noPatient.statusCode).toBe(404);

    const noFormat = await harness.app.inject({
      method: 'POST',
      url: '/api/generate',
      payload: { patient_id: patient.id, format_id: missing, typed_notes: 'Sleep improved.' },
    });
    expect(noFormat.statusCode).toBe(404);
  });
});

describe('POST /api/generate — the local AI is not running', () => {
  /**
   * The acceptance criterion: a real Ollama provider pointed at a dead
   * loopback port. The egress guard allows localhost, so this is the genuine
   * connection-refused path rather than a mocked one — and it must arrive as
   * an `error` event, not a 500, because the stream is already open.
   */
  it('emits an error event a therapist can act on', async () => {
    const app = await buildApp({
      config: harness.config,
      db: harness.db,
      logger: false,
      providers: {
        llm: new OllamaProvider({
          baseUrl: 'http://127.0.0.1:1',
          resolveModel: () => 'gemma4:12b-it-qat',
        }),
        stt: new FakeSttProvider(),
      },
    });

    try {
      const { statusCode, events } = await generate(app, {
        patient_id: patient.id,
        format_id: format.id,
        typed_notes: 'Sleep improved.',
      });

      expect(statusCode).toBe(200);
      const error = events.at(-1);
      expect(error?.name).toBe('error');
      expect(error?.data['code']).toBe('ollama_unreachable');
      expect(String(error?.data['message'])).toContain("can't reach the local AI");
    } finally {
      await app.close();
    }
  });

  it('saves nothing when the draft fails', async () => {
    const before = listNotesForPatient(harness.db, patient.id).length;
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
      await generate(app, { patient_id: patient.id, format_id: format.id, typed_notes: 'Sleep improved.' });
      expect(listNotesForPatient(harness.db, patient.id)).toHaveLength(before);
    } finally {
      await app.close();
    }
  });
});

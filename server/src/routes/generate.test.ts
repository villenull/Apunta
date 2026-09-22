import { listTranscriptsForNote } from '../db/transcripts.js';
import {
  FIRST_PASS_MESSAGE,
  STANDARD_PROGRESS_FORMAT,
  textToSections,
  type Note,
  type NoteFormat,
  type Patient,
} from '@apunta/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import { OllamaProvider } from '../ai/ollama.js';
import { FakeSttProvider } from '../ai/fake.js';
import { listChatMessagesForNote } from '../db/chat-messages.js';
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

  /**
   * The model, not the server, decides whether a session covered genuinely
   * distinct topics (2026-09-22). Here the provider writes its two topics as
   * Markdown headings — the shape a model actually reaches for — and what
   * lands in the note is her own label-line form.
   */
  it('drafts Discussion under the model’s subheadings, normalised into her form', async () => {
    const ownerFormat = await seedFormat(harness.app, {
      name: 'Fictional progress note',
      sections: [...STANDARD_PROGRESS_FORMAT.sections],
    });
    const { events } = await generate(harness.app, {
      patient_id: patient.id,
      format_id: ownerFormat.id,
      typed_notes:
        'John reports improved sleep since last session. He described an argument with his partner on Sunday and said they have since talked it through.',
    });
    const note = events.at(-1)?.data['note'] as Note;
    const discussion = textToSections(note.content, ownerFormat.sections)['Discussion'] ?? '';

    // Lowercase label lines of her own, and the model's sentences untouched.
    expect(discussion.split('\n')[0]).toBe('sleep:');
    expect(discussion).toContain('\nargument with his partner:\n');
    expect(discussion).toContain(
      'John described an argument with his partner and said they have since talked it through.',
    );
    expect(discussion).not.toContain('#');

    // The stream is held back for this section, so what she watched arrive is
    // exactly what was saved.
    const streamed = events
      .filter((event) => event.name === 'token' && event.data['section'] === 'Discussion')
      .map((event) => String(event.data['text']))
      .join('');
    expect(streamed).toBe(discussion);

    // A heading starts on the line below its section header, never inline.
    expect(note.content).toContain(`Discussion:\n${discussion}`);
    expect(note.content).not.toContain('Discussion: sleep:');
  });

  it('drafts a single-theme Discussion as prose with no subheading', async () => {
    const discussionFormat = await seedFormat(harness.app, {
      name: 'Fictional discussion format',
      sections: ['Discussion'],
    });
    const typed =
      'Fictional client discussed sleep at home. Fictional client reported waking early. Fictional client mentioned a library book.';
    const { events } = await generate(harness.app, {
      patient_id: patient.id,
      format_id: discussionFormat.id,
      typed_notes: typed,
    });
    const note = events.at(-1)?.data['note'] as Note;
    expect(note.content).not.toContain('#');
    expect(note.content).not.toContain('Other discussion');
    expect(note.content).toContain('Fictional client reported waking early.');
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

describe('POST /api/generate — spoken retractions', () => {
  it('cuts what she took back before drafting, and tells her so in the opening message', async () => {
    const { events } = await generate(harness.app, {
      patient_id: patient.id,
      format_id: format.id,
      transcript:
        'Okay, John Smith today. He walked to the shop twice this week, scratch that, three times this week. His sister visited.',
    });

    expect(events.some((event) => event.name === 'status' && event.data['stage'] === 'correcting')).toBe(
      true,
    );
    const note = events.at(-1)?.data['note'] as Note;
    expect(note.content).toMatch(/three times this week/i);
    expect(note.content).not.toContain('twice');

    const [opening] = listChatMessagesForNote(harness.db, note.id);
    expect(opening?.role).toBe('assistant');
    expect(opening?.text).toContain(FIRST_PASS_MESSAGE);
    expect(opening?.text).toContain(
      'left out “He walked to the shop twice this week” in favour of “three times this week”',
    );
    // The transcript row keeps her words as transcribed, retraction and all.
    expect(listTranscriptsForNote(harness.db, note.id)[0]?.raw_text).toContain('scratch that');
  });
});

/**
 * The same endpoint over a real socket.
 *
 * `app.inject` never opens one: light-my-request simulates the request, so the
 * lifecycle events Node emits on a real connection never fire. That gap hid a
 * bug where every stream ended having sent nothing — `openSse` watched
 * `request.raw` for 'close', which since Node 16 means "the request body has
 * been fully read" rather than "the client went away". Fastify parses the body
 * before the handler runs, so every POST looked disconnected within
 * milliseconds while the browser sat waiting.
 *
 * Injected tests all passed. Only a real listen catches it, so this suite pays
 * for one.
 */
describe('POST /api/generate over a real connection', () => {
  it('streams tokens and finishes with the note', async () => {
    const address = await harness.app.listen({ port: 0, host: '127.0.0.1' });

    try {
      const response = await fetch(`${address}/api/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          patient_id: patient.id,
          format_id: format.id,
          typed_notes: 'Sleep improved, intrusive thoughts less frequent.',
        }),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/event-stream');

      const events = parseSse(await response.text());

      // The regression: this used to be empty.
      expect(events.length).toBeGreaterThan(0);
      expect(events.some((event) => event.name === 'token')).toBe(true);

      const final = events.at(-1);
      expect(final?.name).toBe('note');
      expect((final?.data['note'] as Note | undefined)?.patient_id).toBe(patient.id);
    } finally {
      await harness.app.close();
    }
  });
});

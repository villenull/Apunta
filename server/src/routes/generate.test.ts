import { listTranscriptsForNote } from '../db/transcripts.js';
import {
  FIRST_PASS_MESSAGE,
  STANDARD_PROGRESS_FORMAT,
  t,
  textToSections,
  type Note,
  type NoteFormat,
  type Patient,
} from '@apunta/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import { OllamaProvider } from '../ai/ollama.js';
import { FakeLlmProvider, FakeSttProvider } from '../ai/fake.js';
import type { GenerateNoteRequest, LlmEvent } from '../ai/types.js';
import { listChatMessagesForNote } from '../db/chat-messages.js';
import { getNote, listNotesForPatient } from '../db/notes.js';
import { active, type ActiveJob } from '../jobs/registry.js';
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

    // First-letter-capitalised label lines of her own, and the model's sentences untouched.
    expect(discussion.split('\n')[0]).toBe('Sleep:');
    expect(discussion).toContain('\nArgument with his partner:\n');
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
      'left out “He walked to the shop twice this week” in favor of “three times this week”',
    );
    // The transcript row keeps her words as transcribed, retraction and all.
    expect(listTranscriptsForNote(harness.db, note.id)[0]?.raw_text).toContain('scratch that');
  });

  /**
   * The row is written in the **note's** language (a note takes its format's
   * locale, C-LANG@1 rule 3), and the retraction notice is part of that row —
   * so on an `es-MX` format the opening and the notice are both Spanish. The
   * notice used to be a raw English string, which put an English paragraph
   * under a Spanish one in the same persisted row.
   */
  it('writes the retraction notice in the note’s own language, not English', async () => {
    harness.db.prepare("UPDATE note_formats SET locale = 'es-MX' WHERE id = ?").run(format.id);
    try {
      const { events } = await generate(harness.app, {
        patient_id: patient.id,
        format_id: format.id,
        transcript:
          'Okay, John Smith today. He walked to the shop twice this week, scratch that, three times this week.',
      });

      const note = events.at(-1)?.data['note'] as Note;
      expect(getNote(harness.db, note.id)?.locale).toBe('es-MX');

      const [opening] = listChatMessagesForNote(harness.db, note.id);
      expect(opening?.text).toContain(t('chat.firstPass', {}, 'es-MX'));
      expect(opening?.text).toContain('dejó fuera «He walked to the shop twice this week»');
      // No English left in the row: neither sentence.
      expect(opening?.text).not.toContain('left out');
      expect(opening?.text).not.toContain('before drafting');
      expect(opening?.text).not.toContain('first pass based on your dictation');
    } finally {
      harness.db.prepare("UPDATE note_formats SET locale = 'en' WHERE id = ?").run(format.id);
    }
  });
});

/**
 * The active job registry, as `POST /api/generate` drives it.
 *
 * The reading is taken **inside** the stream: a provider that notes what
 * `active()` holds as it produces each event is the only place a job is
 * observably in flight, because by the time a response body exists the job is
 * over. These providers are the real fake with one method wrapped, so everything
 * else about the draft is exactly what production does.
 */
class WatchingLlmProvider extends FakeLlmProvider {
  /** What `active()` held as each event was produced, in order. */
  readonly readings: ActiveJob[][] = [];

  constructor() {
    super({ streamDelayMs: 0 });
  }

  private async *watched(events: AsyncIterable<LlmEvent>): AsyncGenerator<LlmEvent> {
    for await (const event of events) {
      this.readings.push(active().map((job) => ({ ...job })));
      yield event;
    }
  }

  override generateNote(request: GenerateNoteRequest): AsyncIterable<LlmEvent> {
    return this.watched(super.generateNote(request));
  }
}

/**
 * The failure path. A provider that dies before it produces anything, which is
 * the shape of a model that has stopped: `streamDraft` catches it, sends the
 * `error` event and returns — and the job still has to be released.
 */
class FailingLlmProvider extends FakeLlmProvider {
  override generateNote(): AsyncIterable<LlmEvent> {
    throw new Error('the local model stopped mid-draft');
  }
}

describe('active job registry — POST /api/generate', () => {
  it('holds a draft job for as long as the stream runs, and releases it after', async () => {
    const watcher = new WatchingLlmProvider();
    const app = await buildApp({
      config: harness.config,
      db: harness.db,
      logger: false,
      providers: { llm: watcher, stt: new FakeSttProvider() },
    });

    const names = (
      await generate(app, {
        patient_id: patient.id,
        format_id: format.id,
        typed_notes: 'Sleep improved, intrusive thoughts less frequent.',
      }).finally(() => app.close())
    ).events.map((event) => event.name);

    expect(names.at(-1)).toBe('note');
    // Between the first event and the last, the draft is in flight — every
    // single reading says so, and says that nothing else is.
    expect(watcher.readings.length).toBeGreaterThan(1);
    for (const jobs of watcher.readings) {
      expect(jobs.map((job) => job.kind)).toEqual(['draft']);
      expect(jobs[0]?.id).toMatch(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
    }
    expect(active()).toEqual([]);
  });

  it('leaves nothing active when the draft fails, which is what the finally buys', async () => {
    const app = await buildApp({
      config: harness.config,
      db: harness.db,
      logger: false,
      providers: { llm: new FailingLlmProvider(), stt: new FakeSttProvider() },
    });

    const events = (
      await generate(app, {
        patient_id: patient.id,
        format_id: format.id,
        typed_notes: 'Sleep improved.',
      }).finally(() => app.close())
    ).events;

    expect(events.at(-1)?.name).toBe('error');
    // The registry is what a later card reads to refuse a language change, so a
    // failed draft leaving a job behind would block the app until it was
    // restarted.
    expect(active()).toEqual([]);
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

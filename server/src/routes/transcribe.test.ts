import type { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import {
  AUDIO_SAMPLE_RATE,
  encodeWav,
  KEEP_AUDIO_SETTING,
  MAX_DICTATION_SECONDS,
  type Note,
  type NoteFormat,
  type Patient,
} from '@apunta/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { aiError } from '../ai/errors.js';
import type { SttEvent, SttProvider, TranscribeRequest } from '../ai/types.js';
import { FakeLlmProvider, FakeSttProvider } from '../ai/fake.js';
import { WhisperCppSttProvider } from '../ai/whisper.js';
import { buildApp } from '../app.js';
import { listNotesForPatient } from '../db/notes.js';
import { putSettings } from '../db/settings.js';
import { listTranscriptsForNote } from '../db/transcripts.js';
import { createTestApp, seedFormat, seedPatient, type TestApp } from '../test/harness.js';

/**
 * `POST /api/transcribe` end to end: a WAV in, a saved note out.
 *
 * The audio is a two-second silent WAV built by `shared/src/wav.ts` — the same
 * encoder the browser uses — so these tests exercise the real header parse
 * rather than a fixture nobody wrote. In fake mode the transcript is canned,
 * which is exactly what makes "record → draft" assertable with no whisper.cpp
 * and no Ollama installed (hard rule 3).
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

/** Two seconds of silence, in the format the recorder produces. */
function wav(seconds = 2): Buffer {
  return Buffer.from(encodeWav(new Int16Array(AUDIO_SAMPLE_RATE * seconds)));
}

const BOUNDARY = 'apunta-test-boundary';

/** A multipart body: text fields first, then the one file part. */
function multipart(fields: Record<string, string>, file: Buffer | null, filename = 'session.wav'): Buffer {
  const parts: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(
      Buffer.from(
        `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
        'utf8',
      ),
    );
  }
  if (file) {
    parts.push(
      Buffer.from(
        `--${BOUNDARY}\r\nContent-Disposition: form-data; name="audio"; filename="${filename}"\r\n` +
          'Content-Type: audio/wav\r\n\r\n',
        'utf8',
      ),
      file,
      Buffer.from('\r\n', 'utf8'),
    );
  }
  parts.push(Buffer.from(`--${BOUNDARY}--\r\n`, 'utf8'));
  return Buffer.concat(parts);
}

async function transcribe(
  app: FastifyInstance,
  fields: Record<string, string>,
  file: Buffer | null = wav(),
): Promise<{ statusCode: number; events: SseEvent[]; raw: string }> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/transcribe',
    payload: multipart(fields, file),
    headers: { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
  });
  return { statusCode: response.statusCode, events: parseSse(response.body), raw: response.body };
}

function audioFiles(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir).sort() : [];
}

/**
 * Nothing new was left behind.
 *
 * Compared against a snapshot rather than asserting an empty directory,
 * because one test in this file deliberately keeps its recording — and an
 * assertion that only passes in file order is not an assertion.
 */
function expectNoNewAudio(before: string[]): void {
  expect(audioFiles(harness.config.audioDir)).toEqual(before);
}

let harness: TestApp;
let patient: Patient;
let format: NoteFormat;

beforeAll(async () => {
  harness = await createTestApp();
  patient = await seedPatient(harness.app, 'John Smith');
  format = await seedFormat(harness.app);
});

afterEach(() => {
  putSettings(harness.db, { [KEEP_AUDIO_SETTING]: false });
});

afterAll(async () => {
  await harness.close();
});

describe('POST /api/transcribe — the happy path', () => {
  it('streams transcription progress, then the draft, then the note', async () => {
    const { statusCode, events } = await transcribe(harness.app, {
      patient_id: patient.id,
      format_id: format.id,
    });

    expect(statusCode).toBe(200);
    const names = events.map((event) => event.name);

    expect(names).toContain('progress');
    expect(names).toContain('token');
    expect(names.at(-1)).toBe('note');
    // The order the capture screen renders: transcribing, then drafting.
    expect(names.indexOf('progress')).toBeLessThan(names.indexOf('token'));
    expect(names.indexOf('token')).toBeLessThan(names.indexOf('note'));
    expect(names).not.toContain('error');

    const fractions = events
      .filter((event) => event.name === 'progress')
      .map((event) => event.data['fraction']);
    expect(fractions[0]).toBe(0);
    expect(fractions.at(-1)).toBe(1);
  });

  it('saves the note the fake transcript describes', async () => {
    const { events } = await transcribe(harness.app, { patient_id: patient.id, format_id: format.id });

    const note = events.at(-1)?.data['note'] as Note;
    expect(note.patient_id).toBe(patient.id);
    expect(note.title).toBe(format.name);
    expect(note.content).toContain('Subjective: Patient reports improved sleep');
  });

  /** Duration comes from the WAV header — the app has no ffprobe to ask. */
  it('records the transcript as audio, with the duration read from the header', async () => {
    const { events } = await transcribe(harness.app, {
      patient_id: patient.id,
      format_id: format.id,
    });

    const note = events.at(-1)?.data['note'] as Note;
    const transcripts = listTranscriptsForNote(harness.db, note.id);

    expect(transcripts).toHaveLength(1);
    expect(transcripts[0]?.source).toBe('audio');
    expect(transcripts[0]?.raw_text).toContain('John Smith');
    expect(transcripts[0]?.duration_seconds).toBe(2);
  });

  it('keeps her typed notes alongside the recording, as separate evidence', async () => {
    const { events } = await transcribe(harness.app, {
      patient_id: patient.id,
      format_id: format.id,
      typed_notes: 'Sleep improved, intrusive thoughts less frequent.',
    });

    const note = events.at(-1)?.data['note'] as Note;
    const sources = listTranscriptsForNote(harness.db, note.id).map((row) => row.source);
    expect(sources).toEqual(['typed', 'audio']);
  });

  it('titles the note when a title is sent', async () => {
    const { events } = await transcribe(harness.app, {
      patient_id: patient.id,
      format_id: format.id,
      title: 'Session 4',
    });

    expect((events.at(-1)?.data['note'] as Note).title).toBe('Session 4');
  });
});

describe('POST /api/transcribe — what happens to the recording', () => {
  it('deletes the audio and stores no filename when keep_audio is off', async () => {
    const before = audioFiles(harness.config.audioDir);
    const { events } = await transcribe(harness.app, { patient_id: patient.id, format_id: format.id });

    const note = events.at(-1)?.data['note'] as Note;
    expect(listTranscriptsForNote(harness.db, note.id)[0]?.audio_filename).toBeNull();
    expectNoNewAudio(before);
  });

  it('keeps the file and names it in the row when keep_audio is on', async () => {
    putSettings(harness.db, { [KEEP_AUDIO_SETTING]: true });

    const { events } = await transcribe(harness.app, { patient_id: patient.id, format_id: format.id });
    const note = events.at(-1)?.data['note'] as Note;
    const filename = listTranscriptsForNote(harness.db, note.id)[0]?.audio_filename;

    expect(filename).toMatch(/\.wav$/);
    expect(existsSync(join(harness.config.audioDir, filename as string))).toBe(true);
  });
});

describe('POST /api/transcribe — bad requests', () => {
  it('404s an unknown patient before opening a stream, and keeps no audio', async () => {
    const before = audioFiles(harness.config.audioDir);
    const { statusCode, raw } = await transcribe(harness.app, {
      patient_id: '01a0309a-0000-7000-8000-000000000000',
      format_id: format.id,
    });

    expect(statusCode).toBe(404);
    expect(raw).toContain('not_found');
    expectNoNewAudio(before);
  });

  it('404s an unknown format', async () => {
    const { statusCode } = await transcribe(harness.app, {
      patient_id: patient.id,
      format_id: '01a0309a-0000-7000-8000-000000000000',
    });

    expect(statusCode).toBe(404);
  });

  it('400s a request with no audio', async () => {
    const { statusCode } = await transcribe(
      harness.app,
      { patient_id: patient.id, format_id: format.id },
      null,
    );

    expect(statusCode).toBe(400);
  });

  it('400s a request that is not multipart at all', async () => {
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/transcribe',
      payload: { patient_id: patient.id },
    });

    expect(response.statusCode).toBeGreaterThanOrEqual(400);
  });

  /**
   * The format the packet originally asked the browser to record in. whisper
   * cannot read Opus or WebM at all, so this has to fail with something the
   * user can act on rather than reaching a child process.
   */
  it('refuses a webm/opus upload with a typed error, and deletes it', async () => {
    const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00, 0, 0, 0, 0, 0, 0, 0, 0]);
    const before = listNotesForPatient(harness.db, patient.id).length;
    const audioBefore = audioFiles(harness.config.audioDir);

    const { statusCode, events } = await transcribe(
      harness.app,
      { patient_id: patient.id, format_id: format.id },
      webm,
    );

    expect(statusCode).toBe(200);
    const error = events.at(-1);
    expect(error?.name).toBe('error');
    expect(error?.data['code']).toBe('audio_unsupported');
    expect(listNotesForPatient(harness.db, patient.id)).toHaveLength(before);
    expectNoNewAudio(audioBefore);
  });
});

describe('POST /api/transcribe — when whisper is not installed', () => {
  it('surfaces the typed error inside the stream and saves nothing', async () => {
    const modelPath = join(harness.dataDir, 'model.bin');
    writeFileSync(modelPath, 'a real file, so the check under test is the binary one');
    const before = listNotesForPatient(harness.db, patient.id).length;
    const audioBefore = audioFiles(harness.config.audioDir);

    const app = await buildApp({
      config: harness.config,
      db: harness.db,
      logger: false,
      providers: {
        llm: new FakeLlmProvider({ streamDelayMs: 0 }),
        stt: new WhisperCppSttProvider({
          resolveBinary: () => join(harness.dataDir, 'no-whisper-here'),
          resolveModel: () => modelPath,
        }),
      },
    });

    try {
      const { statusCode, events } = await transcribe(app, {
        patient_id: patient.id,
        format_id: format.id,
      });

      expect(statusCode).toBe(200);
      const error = events.at(-1);
      expect(error?.name).toBe('error');
      expect(error?.data['code']).toBe('whisper_missing');
      expect(String(error?.data['message'])).toContain("can't find whisper");
      expect(listNotesForPatient(harness.db, patient.id)).toHaveLength(before);
      expectNoNewAudio(audioBefore);
    } finally {
      await app.close();
    }
  });

  it('says the model is missing when only the model is absent', async () => {
    const app = await buildApp({
      config: harness.config,
      db: harness.db,
      logger: false,
      providers: {
        llm: new FakeLlmProvider({ streamDelayMs: 0 }),
        stt: new WhisperCppSttProvider({
          resolveBinary: () => 'whisper-cli',
          resolveModel: () => join(harness.dataDir, 'models', 'never-downloaded.bin'),
        }),
      },
    });

    try {
      const { events } = await transcribe(app, { patient_id: patient.id, format_id: format.id });
      expect(events.at(-1)?.data['code']).toBe('whisper_model_missing');
    } finally {
      await app.close();
    }
  });
});

/**
 * The same endpoint over a real socket.
 *
 * `app.inject` never opens one, and that gap once hid a bug where every SSE
 * stream ended having sent nothing: `openSse` watched `request.raw` for
 * 'close', which since Node 16 means "the request body has been fully read".
 * A *multipart upload* is the strongest possible version of that trap — the
 * body is large and read in chunks — so this endpoint pays for a real listen.
 */
describe('POST /api/transcribe over a real connection', () => {
  it('streams progress and finishes with the saved note', async () => {
    const app = await buildApp({
      config: harness.config,
      db: harness.db,
      logger: false,
      providers: { llm: new FakeLlmProvider({ streamDelayMs: 0 }), stt: new FakeSttProvider() },
    });
    const address = await app.listen({ port: 0, host: '127.0.0.1' });

    try {
      const form = new FormData();
      form.set('patient_id', patient.id);
      form.set('format_id', format.id);
      form.set(
        'audio',
        new Blob([encodeWav(new Int16Array(AUDIO_SAMPLE_RATE * 3))], { type: 'audio/wav' }),
        'session.wav',
      );

      const response = await fetch(`${address}/api/transcribe`, { method: 'POST', body: form });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/event-stream');

      const events = parseSse(await response.text());

      // The regression this suite exists for: this used to be empty.
      expect(events.length).toBeGreaterThan(0);
      expect(events.some((event) => event.name === 'progress')).toBe(true);
      expect(events.some((event) => event.name === 'token')).toBe(true);

      const final = events.at(-1);
      expect(final?.name).toBe('note');
      expect((final?.data['note'] as Note | undefined)?.patient_id).toBe(patient.id);
    } finally {
      await app.close();
    }
  });
  it('kills whisper when a preview response closes', async () => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: PassThrough;
      stderr: PassThrough;
      exitCode: number | null;
      signalCode: NodeJS.Signals | null;
      kill: (signal?: NodeJS.Signals) => boolean;
    };
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.exitCode = null;
    child.signalCode = null;
    let killed = false;
    child.kill = (signal = 'SIGKILL') => {
      killed = true;
      child.signalCode = signal;
      child.emit('close', null, signal);
      return true;
    };
    let resolveSpawn!: () => void;
    const spawned = new Promise<void>((resolve) => {
      resolveSpawn = resolve;
    });
    const modelPath = join(harness.dataDir, 'route-cancel-model.bin');
    writeFileSync(modelPath, 'synthetic model');
    const app = await buildApp({
      // Its own audio directory: this request is aborted mid-flight, so the
      // route's `finally` (`await discard`) can still be running when this test
      // returns. Writing into the suite's shared `audioDir` let that late
      // `rm` land during the next test and delete a file it had just
      // snapshotted — the flake CI caught. A private directory keeps the
      // un-awaited cleanup from touching anyone else's files.
      config: { ...harness.config, audioDir: join(harness.dataDir, 'preview-abort-audio') },
      db: harness.db,
      logger: false,
      providers: {
        llm: new FakeLlmProvider({ streamDelayMs: 0 }),
        stt: new WhisperCppSttProvider({
          resolveBinary: () => 'synthetic-whisper',
          resolveModel: () => modelPath,
          spawnImpl: (() => {
            resolveSpawn();
            return child;
          }) as unknown as typeof spawn,
        }),
      },
    });
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    const controller = new AbortController();
    const form = new FormData();
    form.set('audio', new Blob([new Uint8Array(wav(3))], { type: 'audio/wav' }), 'preview.wav');

    try {
      const request = fetch(`${address}/api/transcribe/preview`, {
        method: 'POST',
        body: form,
        signal: controller.signal,
      }).then((response) => response.text());
      await spawned;
      controller.abort();
      await expect(request).rejects.toThrow();
      // The socket close is delivered by Node after the aborted fetch settles.
      await new Promise((resolve) => setTimeout(resolve, 25));
      expect(killed).toBe(true);
    } finally {
      controller.abort();
      await app.close();
    }
  });
});

/**
 * The live preview (2026-09-01). It exists so the screen can show that the
 * microphone is being heard; it is not the record, and the invariant worth
 * testing is that it leaves nothing behind — no note, no transcript row, and
 * no audio file.
 */
describe('POST /api/transcribe/preview', () => {
  async function preview(app: FastifyInstance, file: Buffer): Promise<{ statusCode: number; body: unknown }> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/transcribe/preview',
      payload: multipart({}, file),
      headers: { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
    });
    return { statusCode: response.statusCode, body: response.json() };
  }

  it('returns provisional text and leaves nothing behind', async () => {
    const before = audioFiles(harness.config.audioDir);
    const notesBefore = listNotesForPatient(harness.db, patient.id).length;

    const { statusCode, body } = await preview(harness.app, wav(3));

    expect(statusCode).toBe(200);
    const result = body as { text: string; seconds: number };
    expect(typeof result.text).toBe('string');
    expect(result.seconds).toBeGreaterThan(0);

    // No note, no transcript row, and the audio is gone again.
    expect(listNotesForPatient(harness.db, patient.id).length).toBe(notesBefore);
    expect(audioFiles(harness.config.audioDir)).toEqual(before);
  });

  it('answers no words, not an error, when whisper hears nothing in the clip', async () => {
    // The first refresh often carries under a second of silence; a finished
    // recording with no speech is a failure she must hear about, a preview
    // with none is "nothing yet".
    const silent: SttProvider = {
      // eslint-disable-next-line require-yield
      async *transcribe(): AsyncIterable<SttEvent> {
        throw aiError('transcription_empty', 'whisper-cli exited 0 with no transcript');
      },
      describe: () =>
        Promise.resolve({ binaryPresent: true, modelPresent: true, binary: 'stub', model: 'stub' }),
    };
    const app = await buildApp({
      config: harness.config,
      db: harness.db,
      logger: false,
      providers: { llm: new FakeLlmProvider({ streamDelayMs: 0 }), stt: silent },
    });

    try {
      const { statusCode, body } = await preview(app, wav(3));
      expect(statusCode).toBe(200);
      expect((body as { text: string }).text).toBe('');
    } finally {
      await app.close();
    }
  });

  it('says nothing rather than erroring before there is speech to hear', async () => {
    const { statusCode, body } = await preview(harness.app, wav(0.05));

    expect(statusCode).toBe(200);
    expect((body as { text: string }).text).toBe('');
  });
});

/**
 * Dictating into the refine chat (2026-09-07): a clip in, text out, and the
 * same "leaves nothing behind" invariant as the preview — plus, unlike the
 * preview, whisper's own words when it cannot do the job.
 */
describe('POST /api/transcribe/dictation', () => {
  async function dictate(app: FastifyInstance, file: Buffer): Promise<{ statusCode: number; body: unknown }> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/transcribe/dictation',
      payload: multipart({}, file, 'dictation.wav'),
      headers: { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
    });
    return { statusCode: response.statusCode, body: response.json() };
  }

  async function withStt(stt: SttProvider, run: (app: FastifyInstance) => Promise<void>): Promise<void> {
    const app = await buildApp({
      config: harness.config,
      db: harness.db,
      logger: false,
      providers: { llm: new FakeLlmProvider({ streamDelayMs: 0 }), stt },
    });
    try {
      await run(app);
    } finally {
      await app.close();
    }
  }

  it('hands back the words, creates nothing, and keeps no audio', async () => {
    const before = audioFiles(harness.config.audioDir);
    const notesBefore = listNotesForPatient(harness.db, patient.id).length;

    const { statusCode, body } = await dictate(harness.app, wav(4));

    expect(statusCode).toBe(200);
    expect((body as { text: string }).text).toContain('John Smith');
    expect((body as { seconds: number }).seconds).toBeCloseTo(4, 1);
    expect(listNotesForPatient(harness.db, patient.id).length).toBe(notesBefore);
    expect(audioFiles(harness.config.audioDir)).toEqual(before);
  });

  it('asks for the note model with the audio context fitted to the clip, not the preview pass', async () => {
    const seen: TranscribeRequest[] = [];
    const spy: SttProvider = {
      async *transcribe(request): AsyncIterable<SttEvent> {
        seen.push(request);
        yield { type: 'transcript', text: 'Add that he is sleeping better.' };
      },
      describe: () =>
        Promise.resolve({ binaryPresent: true, modelPresent: true, binary: 'stub', model: 'stub' }),
    };
    await withStt(spy, async (app) => {
      const { statusCode, body } = await dictate(app, wav(3));
      expect(statusCode).toBe(200);
      expect((body as { text: string }).text).toBe('Add that he is sleeping better.');
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.fitted).toBe(true);
    expect(seen[0]?.preview).toBeUndefined();
  });

  it('answers no words when whisper heard none, and 400s a clip too long for a message', async () => {
    const silent: SttProvider = {
      // eslint-disable-next-line require-yield
      async *transcribe(): AsyncIterable<SttEvent> {
        throw aiError('transcription_empty', 'whisper-cli exited 0 with no transcript');
      },
      describe: () =>
        Promise.resolve({ binaryPresent: true, modelPresent: true, binary: 'stub', model: 'stub' }),
    };
    await withStt(silent, async (app) => {
      const { statusCode, body } = await dictate(app, wav(3));
      expect(statusCode).toBe(200);
      expect((body as { text: string }).text).toBe('');
    });

    const { statusCode } = await dictate(harness.app, wav(MAX_DICTATION_SECONDS + 1));
    expect(statusCode).toBe(400);
  });

  it('tells her in whisper’s own words when it cannot transcribe, as a 503', async () => {
    const missing: SttProvider = {
      // eslint-disable-next-line require-yield
      async *transcribe(): AsyncIterable<SttEvent> {
        throw aiError('whisper_missing', 'no whisper-cli on PATH');
      },
      describe: () =>
        Promise.resolve({ binaryPresent: false, modelPresent: true, binary: 'stub', model: 'stub' }),
    };
    await withStt(missing, async (app) => {
      const { statusCode, body } = await dictate(app, wav(3));
      expect(statusCode).toBe(503);
      expect(body).toMatchObject({
        error: 'ai_unavailable',
        message: aiError('whisper_missing', '').message,
      });
    });
  });
});

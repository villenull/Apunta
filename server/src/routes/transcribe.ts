import { createWriteStream } from 'node:fs';
import { open, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';

import {
  emptySectionNames,
  MAX_AUDIO_BYTES,
  MIN_RECORDING_SECONDS,
  parseWavHeader,
  TranscribeFieldsSchema,
  WavFormatError,
  type NoteFormat,
  type TranscribeFields,
  type WavFormat,
} from '@apunta/shared';
import type { Database } from 'better-sqlite3';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { aiError } from '../ai/errors.js';
import { resolveKeepAudio, resolveVocabulary } from '../ai/stt-settings.js';
import type { AiProviders } from '../ai/types.js';
import { ensureDir, type AppConfig } from '../config.js';
import { getFormat } from '../db/formats.js';
import { uuidv7 } from '../db/uuid.js';
import { badRequest, notFound } from '../http/errors.js';
import { openSse, type SseStream } from '../http/sse.js';
import { parseBody } from '../http/validate.js';
import { logFailure, persistDraft, streamDraft, toAiError } from './draft.js';
import { requirePatient } from './patients.js';

/**
 * `POST /api/transcribe` — one request takes a recording to a draft.
 *
 * The browser uploads a 16 kHz mono WAV it wrote itself, so there is no
 * transcode step and no ffmpeg: the file is saved, `whisper-cli` reads it, and
 * the transcript goes straight into the same drafting path `/api/generate`
 * uses. The stream the therapist watches is one continuous progression —
 * `progress` while whisper works, then `status`/`token`/`note` exactly as the
 * typed path emits them.
 *
 * Duration comes from the WAV's own header (data bytes ÷ byte rate), not from
 * `ffprobe`: the packet's probe is superseded along with the transcode
 * (`docs/research/m8-bundling-2026-08.md` §3.4).
 */

/** Enough of the file to hold the RIFF chunks that precede `data`. */
const HEADER_PROBE_BYTES = 64 * 1024;

export function registerTranscribeRoute(
  app: FastifyInstance,
  config: AppConfig,
  db: Database,
  providers: AiProviders,
): void {
  app.post('/api/transcribe', async (request, reply) => {
    const upload = await receiveUpload(request, config);

    // Everything checkable before the stream opens is checked before it opens,
    // so a bad request is an ordinary 400/404 with a JSON body rather than a
    // 200 carrying bad news. The audio goes with it — nothing references it,
    // and it is the most sensitive file this app ever writes.
    let target: { input: TranscribeFields; format: NoteFormat };
    try {
      target = resolveTarget(db, upload.fields);
    } catch (error) {
      await discard(upload.path);
      throw error;
    }
    const { input, format } = target;

    const stream = openSse(reply);
    let audioPath: string | null = upload.path;

    try {
      const wav = readWavFormat(upload);
      request.log.info(
        { bytes: upload.bytes, seconds: Math.round(wav.durationSeconds), sampleRate: wav.sampleRate },
        'recording received',
      );

      const transcript = await runTranscription(providers, db, stream, upload.path, wav);
      if (transcript === null || stream.closed) return;

      const { sections } = await streamDraft({
        providers,
        format,
        source: { typedNotes: input.typed_notes, transcript },
        stream,
        request,
      });
      if (sections === null || stream.closed) return;

      // The recording outlives the request only if she asked for it to. The
      // note and the transcript both survive either way, so the default is to
      // keep less of the session on disk rather than more.
      const keep = resolveKeepAudio(db);
      if (!keep) {
        await discard(upload.path);
        audioPath = null;
      }

      stream.send('status', { stage: 'saving', message: 'Saving the draft…' });
      const note = persistDraft(
        db,
        {
          ...input,
          transcript,
          audio: {
            filename: keep ? upload.filename : null,
            durationSeconds: Math.round(wav.durationSeconds * 100) / 100,
          },
        },
        format,
        sections,
      );
      audioPath = null;

      stream.send('note', { note, empty_sections: emptySectionNames(sections, format.sections) });
    } catch (error) {
      const failure = toAiError(error);
      logFailure(request, failure, 'transcription failed');
      stream.send('error', { code: failure.code, message: failure.message });
    } finally {
      // A recording that produced no note is referenced by nothing, so it is
      // deleted whatever `keep_audio` says. The browser still holds the Blob,
      // which is what makes "Try again" work without re-recording.
      if (audioPath !== null) await discard(audioPath);
      stream.end();
    }
  });
}

/** The patient and the format the draft is for. Throws 400/404. */
function resolveTarget(
  db: Database,
  fields: Record<string, string>,
): { input: TranscribeFields; format: NoteFormat } {
  const input = parseBody(TranscribeFieldsSchema, fields);
  requirePatient(db, input.patient_id);
  const format = getFormat(db, input.format_id);
  if (!format) throw notFound('Note format not found');
  return { input, format };
}

/** Stream whisper's progress out, and answer with the transcript. */
async function runTranscription(
  providers: AiProviders,
  db: Database,
  stream: SseStream,
  wavPath: string,
  wav: WavFormat,
): Promise<string | null> {
  stream.send('progress', { fraction: 0, message: 'Transcribing…' });

  let text: string | null = null;
  const events = providers.stt.transcribe({
    wavPath,
    durationSeconds: wav.durationSeconds,
    vocabulary: resolveVocabulary(db),
  });

  for await (const event of events) {
    // She closed the tab. Leaving the loop runs the provider's cleanup, which
    // kills whisper rather than leaving it grinding through a 40-minute file.
    if (stream.closed) return null;
    if (event.type === 'progress') {
      stream.send('progress', { fraction: event.fraction, message: event.message });
    } else {
      text = event.text;
    }
  }

  if (text === null || text.trim() === '') {
    throw aiError('transcription_empty', 'the provider finished without a transcript');
  }
  return text;
}

interface Upload {
  readonly path: string;
  readonly filename: string;
  readonly bytes: number;
  /** The first `HEADER_PROBE_BYTES` of the saved file, for the header parse. */
  readonly head: Uint8Array;
  readonly fields: Record<string, string>;
}

/**
 * Save the uploaded audio and collect the text fields beside it.
 *
 * The file is streamed to disk rather than buffered: the cap is 60 minutes,
 * which at 16 kHz mono 16-bit is ~115 MB, and holding that in the server's
 * heap to hand a child process a path would be pure waste.
 */
async function receiveUpload(request: FastifyRequest, config: AppConfig): Promise<Upload> {
  if (!request.isMultipart()) {
    throw badRequest('Send the recording as multipart/form-data with one audio file.');
  }

  const filename = `${uuidv7()}.wav`;
  const path = join(ensureDir(config.audioDir), filename);
  const fields: Record<string, string> = {};
  let bytes = 0;
  let received = false;

  try {
    for await (const part of request.parts()) {
      if (part.type === 'file') {
        if (received) {
          // Draining a second file to nowhere keeps the request body fully
          // read, which is what lets the error below reach the browser.
          part.file.resume();
          continue;
        }
        received = true;
        const sink = createWriteStream(path);
        await pipeline(part.file, sink);
        bytes = sink.bytesWritten;
        if (part.file.truncated) {
          throw badRequest('That recording is too long to upload. Record it in shorter sittings.');
        }
      } else if (typeof part.value === 'string') {
        fields[part.fieldname] = part.value;
      }
    }
  } catch (error) {
    await discard(path);
    // `@fastify/multipart` throws its own typed errors when a limit is hit;
    // they carry a `statusCode`, which the error handler turns into a 4xx.
    throw error;
  }

  if (!received || bytes === 0) {
    await discard(path);
    throw badRequest('No audio was uploaded.');
  }
  if (bytes > MAX_AUDIO_BYTES) {
    await discard(path);
    throw badRequest('That recording is too long to upload. Record it in shorter sittings.');
  }

  return { path, filename, bytes, head: await readHead(path), fields };
}

/**
 * The header, read from the file we just wrote.
 *
 * A `MediaRecorder` webm/opus upload — what a well-meaning client would send,
 * and the one format whisper.cpp genuinely cannot read — fails here, with a
 * message telling her to record again from this screen, rather than reaching a
 * child process that would fail obscurely a minute later.
 */
function readWavFormat(upload: Upload): WavFormat {
  let format: WavFormat;
  try {
    format = parseWavHeader(upload.head, upload.bytes);
  } catch (error) {
    if (error instanceof WavFormatError) {
      throw aiError('audio_unsupported', `upload is not a readable WAV: ${error.message}`);
    }
    throw error;
  }

  // A WAV with no samples means the microphone produced nothing — muted, or
  // the wrong input device. Saying that is more use than whisper's opinion of
  // an empty file.
  if (format.durationSeconds < MIN_RECORDING_SECONDS) {
    throw aiError('transcription_empty', `recording holds ${String(format.dataBytes)} bytes of audio`);
  }
  return format;
}

async function readHead(path: string): Promise<Uint8Array> {
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(HEADER_PROBE_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, HEADER_PROBE_BYTES, 0);
    return new Uint8Array(buffer.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
}

async function discard(path: string): Promise<void> {
  await rm(path, { force: true }).catch(() => {
    // A recording we could not delete is not worth failing the request over.
    // It is scratch space, and nothing else reads it.
  });
}

import {
  FIRST_PASS_MESSAGE,
  sectionsToText,
  type Note,
  type NoteFormat,
  type Sections,
} from '@apunta/shared';
import type { Database } from 'better-sqlite3';
import type { FastifyRequest } from 'fastify';

import { AiError, aiError } from '../ai/errors.js';
import type { AiProviders, DraftSource, LlmStats } from '../ai/types.js';
import { createChatMessage } from '../db/chat-messages.js';
import { createNote } from '../db/notes.js';
import { createTranscript } from '../db/transcripts.js';
import type { SseStream } from '../http/sse.js';

/**
 * Drafting a note, shared by the two routes that do it.
 *
 * `POST /api/generate` (M3) drafts from what she typed. `POST /api/transcribe`
 * (M5) transcribes a recording and then drafts from that — the packet's "hands
 * off to the same generation path", taken literally: the second half of a
 * transcribe request is *this code*, so the streamed events, the persisted
 * rows and the failure handling cannot drift apart between the two screens.
 */

export interface DraftOutcome {
  /** The validated note, or null when the provider produced nothing usable. */
  readonly sections: Sections | null;
  readonly stats: LlmStats | null;
  /** Set when the draft failed; the `error` event has already been sent. */
  readonly failure: AiError | null;
}

/**
 * Stream a draft into an open SSE stream.
 *
 * The status code is already committed by the time this runs, so a failure
 * here is an `error` event carrying a message written for the user, never an
 * HTTP status. The caller decides what to do next; nothing is persisted.
 */
export async function streamDraft(params: {
  readonly providers: AiProviders;
  readonly format: NoteFormat;
  readonly source: DraftSource;
  readonly stream: SseStream;
  readonly request: FastifyRequest;
}): Promise<DraftOutcome> {
  const { providers, format, source, stream, request } = params;

  let sections: Sections | null = null;
  let stats: LlmStats | null = null;

  try {
    const events = providers.llm.generateNote({
      instructions: format.instructions,
      formatName: format.name,
      sections: format.sections,
      typedNotes: source.typedNotes,
      transcript: source.transcript,
    });

    for await (const event of events) {
      // The client navigated away or closed the tab: stop drafting. Breaking
      // out of the loop runs the provider's cleanup, which aborts the
      // request to Ollama rather than leaving it generating into nothing.
      if (stream.closed) break;

      if (event.type === 'status') {
        stream.send('status', { stage: event.stage, message: event.message });
      } else if (event.type === 'token') {
        stream.send('token', { section: event.section, text: event.text });
      } else if (event.type === 'sections') {
        sections = event.sections;
        stats = event.stats;
      }
    }
  } catch (error) {
    const failure = toAiError(error);
    logFailure(request, failure, 'note drafting failed');
    stream.send('error', { code: failure.code, message: failure.message });
    return { sections: null, stats: null, failure };
  }

  if (stream.closed) return { sections, stats, failure: null };

  if (sections === null) {
    const failure = aiError('empty_response', 'the provider finished without producing a note');
    logFailure(request, failure, 'note drafting failed');
    stream.send('error', { code: failure.code, message: failure.message });
    return { sections: null, stats: null, failure };
  }

  if (stats) logStats(request, stats);
  return { sections, stats, failure: null };
}

/** One recording, as it should be recorded against the note it produced. */
export interface AudioProvenance {
  /** The file's name inside the data dir's `audio/`, or null once deleted. */
  readonly filename: string | null;
  /** Read from the WAV's own header — no `ffprobe` anywhere in this app. */
  readonly durationSeconds: number;
}

export interface PersistDraftInput {
  readonly patient_id: string;
  readonly format_id: string;
  readonly title?: string | undefined;
  readonly typed_notes?: string | undefined;
  readonly transcript?: string | undefined;
  /** Present only when the transcript came from a recording (M5). */
  readonly audio?: AudioProvenance | undefined;
}

/**
 * The note, one transcript row per source it was drafted from, and the
 * assistant's opening turn in the refine thread.
 *
 * Typed notes and a recording are different rows because they are different
 * evidence: her own words, and a machine's reading of her voice. A request may
 * carry both, and after M5 often does.
 *
 * The opening turn is written here rather than by the browser so that the
 * thread is complete the moment the note exists: a reload, a second tab, or a
 * draft opened next week all show the same conversation, and nothing has to
 * synthesise a message that was never stored.
 */
export function persistDraft(
  db: Database,
  input: PersistDraftInput,
  format: NoteFormat,
  sections: Sections,
): Note {
  const note = createNote(db, {
    patient_id: input.patient_id,
    format_id: input.format_id,
    // The prototype titles notes after their format ("Progress note").
    title: input.title ?? format.name,
    content: sectionsToText(sections, format.sections),
  });

  const typed = (input.typed_notes ?? '').trim();
  if (typed !== '') {
    createTranscript(db, { note_id: note.id, source: 'typed', raw_text: input.typed_notes ?? '' });
  }
  const transcript = (input.transcript ?? '').trim();
  if (transcript !== '') {
    createTranscript(db, {
      note_id: note.id,
      source: 'audio',
      raw_text: input.transcript ?? '',
      audio_filename: input.audio?.filename ?? null,
      duration_seconds: input.audio?.durationSeconds ?? null,
    });
  }

  createChatMessage(db, {
    note_id: note.id,
    role: 'assistant',
    text: FIRST_PASS_MESSAGE,
    ref_quote: null,
  });
  return note;
}

export function toAiError(error: unknown): AiError {
  if (error instanceof AiError) return error;
  return aiError('ollama_error', String(error));
}

/**
 * The log carries the diagnosis, never the prompt.
 *
 * A prompt contains the therapist's account of a session — real patient
 * material (CLAUDE.md hard rule 2) — so no code path may write it to a log,
 * an error report, or a crash dump. The same goes for a recording and its
 * transcript, which is why the transcribe route logs byte counts and seconds.
 */
export function logFailure(request: FastifyRequest, failure: AiError, message: string): void {
  request.log.error({ code: failure.code, detail: failure.detail }, message);
}

export function logStats(request: FastifyRequest, stats: LlmStats): void {
  const tokensPerSecond = stats.evalNanos > 0 ? stats.outputTokens / (stats.evalNanos / 1e9) : 0;
  request.log.info(
    {
      model: stats.model,
      // `prompt_eval_count` is the only observability Ollama gives us on
      // truncation, and it is free: log it on every call.
      promptTokens: stats.promptTokens,
      outputTokens: stats.outputTokens,
      tokensPerSecond: Math.round(tokensPerSecond * 10) / 10,
      loadMs: Math.round(stats.loadNanos / 1e6),
      doneReason: stats.doneReason,
      attempts: stats.attempts,
    },
    'note drafted',
  );
}

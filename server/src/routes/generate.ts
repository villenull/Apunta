import {
  emptySectionNames,
  GenerateRequestSchema,
  sectionsToText,
  type GenerateRequest,
  type Note,
  type NoteFormat,
  type Sections,
} from '@apunta/shared';
import type { Database } from 'better-sqlite3';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { AiError, aiError } from '../ai/errors.js';
import type { AiProviders, LlmStats } from '../ai/types.js';
import { getFormat } from '../db/formats.js';
import { createNote } from '../db/notes.js';
import { createTranscript } from '../db/transcripts.js';
import { notFound } from '../http/errors.js';
import { openSse } from '../http/sse.js';
import { parseBody } from '../http/validate.js';
import { requirePatient } from './patients.js';

/**
 * `POST /api/generate` — draft a note from the therapist's own material.
 *
 * Validation happens before the stream opens, so a bad request is an ordinary
 * 400/404 with a JSON body. Once the stream is open the status code is already
 * committed, so everything after that — including "Ollama is not running" — is
 * an `error` event carrying a message written for the user.
 *
 * The note is persisted only after the draft validates. A failed draft leaves
 * nothing behind; the therapist's text is still in the browser, so trying
 * again costs her nothing.
 */
export function registerGenerateRoute(app: FastifyInstance, db: Database, providers: AiProviders): void {
  app.post('/api/generate', async (request, reply) => {
    const input = parseBody(GenerateRequestSchema, request.body);
    requirePatient(db, input.patient_id);
    const format = getFormat(db, input.format_id);
    if (!format) throw notFound('Note format not found');

    const stream = openSse(reply);

    let sections: Sections | null = null;
    let stats: LlmStats | null = null;

    try {
      const events = providers.llm.generateNote({
        instructions: format.instructions,
        formatName: format.name,
        sections: format.sections,
        typedNotes: input.typed_notes,
        transcript: input.transcript,
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
      logFailure(request, failure);
      stream.send('error', { code: failure.code, message: failure.message });
      stream.end();
      return;
    }

    if (stream.closed) {
      stream.end();
      return;
    }
    if (sections === null) {
      const failure = aiError('empty_response', 'the provider finished without producing a note');
      logFailure(request, failure);
      stream.send('error', { code: failure.code, message: failure.message });
      stream.end();
      return;
    }

    if (stats) logStats(request, stats);

    stream.send('status', { stage: 'saving', message: 'Saving the draft…' });
    const note = persist(db, input, format, sections);

    stream.send('note', {
      note,
      empty_sections: emptySectionNames(sections, format.sections),
    });
    stream.end();
  });
}

/**
 * The note and one transcript row per source it was drafted from. Typed notes
 * and a recording are different rows because they are different evidence, and
 * M5 will supply both for the same note.
 */
function persist(db: Database, input: GenerateRequest, format: NoteFormat, sections: Sections): Note {
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
    createTranscript(db, { note_id: note.id, source: 'audio', raw_text: input.transcript ?? '' });
  }
  return note;
}

function toAiError(error: unknown): AiError {
  if (error instanceof AiError) return error;
  return aiError('ollama_error', String(error));
}

/**
 * The log carries the diagnosis, never the prompt.
 *
 * A prompt contains the therapist's account of a session — real patient
 * material (CLAUDE.md hard rule 2) — so no code path may write it to a log,
 * an error report, or a crash dump.
 */
function logFailure(request: FastifyRequest, failure: AiError): void {
  request.log.error({ code: failure.code, detail: failure.detail }, 'note drafting failed');
}

function logStats(request: FastifyRequest, stats: LlmStats): void {
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

import {
  BRAINSTORM_HISTORY_TURNS,
  BrainstormRequestSchema,
  approximateTokens,
  type BrainstormContext,
  type BrainstormThreadResponse,
  type Patient,
} from '@apunta/shared';
import type { Database } from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';

import { aiError } from '../ai/errors.js';
import { storedLanguage } from '../http/locale.js';
import { logFailure, logStats, toAiError } from './ai.js';
import { brainstormPromptTokens } from '../ai/ollama.js';
import { fitNotesNewestFirst } from '../ai/prior-notes.js';
import { buildBrainstormPrompt, omittedNotesLine } from '../ai/prompts.js';
import type { AiProviders, BrainstormNoteInput, BrainstormRequest, ChatTurn, LlmStats } from '../ai/types.js';
import {
  clearBrainstormMessages,
  createBrainstormMessage,
  listBrainstormMessages,
} from '../db/brainstorm.js';
import { listNotesForPatient } from '../db/notes.js';
import { getPatient } from '../db/patients.js';
import { uuidv7 } from '../db/uuid.js';
import { notFound } from '../http/errors.js';
import { openSse } from '../http/sse.js';
import { IdParamsSchema, parseBody, parseParams } from '../http/validate.js';
import { begin, end } from '../jobs/registry.js';

/**
 * Brainstorm — `GET/POST/DELETE /api/patients/:id/brainstorm` (M12).
 *
 * A freeform chat with the local model about one patient. A thinking aid,
 * never a record: this file has no write path to any table but
 * `brainstorm_messages`, and the stream carries no event that could revise
 * one. The model is given the patient's name and every note that fits; the
 * "Context" line on screen shows exactly which notes those were.
 *
 * Privacy like the refine chat's: every diagnostic on this path is shape —
 * codes, lengths, counts. The notes *and* the therapist's message both go
 * through here, so nothing here may add text to a log
 * (`docs/research/privacy-audit-2026-08.md` H1).
 */

/**
 * The whole prompt — system, notes, conversation — budgeted to what the
 * provider will accept at the default `num_ctx` (`brainstormPromptTokens`
 * in `ai/ollama.ts`, 13,824). The provider's `assertFits` stays the
 * backstop: a smaller configured window still refuses honestly instead of
 * truncating the instructions off the head.
 */
const BRAINSTORM_PROMPT_BUDGET = brainstormPromptTokens();

export interface AssembledBrainstormContext {
  /** What the "Context" line shows, and what the provider is actually given. */
  readonly context: BrainstormContext;
  /** The included notes as full texts, newest first. */
  readonly notes: readonly BrainstormNoteInput[];
  /** How many notes did not fit — the model is told, so absence is not denial. */
  readonly omittedNotes: number;
  /** The conversation turns that fit, oldest first. */
  readonly history: readonly ChatTurn[];
}

/**
 * Which notes the model gets: all of them, newest first, as many as fit
 * (`fitNotesNewestFirst`, shared with the refine chat's background).
 *
 * Notes come before the conversation: on overflow the oldest turns go first
 * and only then the oldest notes. Whatever was left out is reported in
 * `dropped_note_ids` so the screen can say so rather than silently think
 * with less than she sees.
 */
export function assembleBrainstormContext(
  db: Database,
  patient: Patient,
  message: string,
  history: readonly ChatTurn[] = [],
): AssembledBrainstormContext {
  const candidates = listNotesForPatient(db, patient.id);

  // Everything but the notes and the turns, estimated from the prompt itself,
  // plus the "only N of M" line at its longest — paid for whether or not it
  // turns out to be needed, so the fitted prompt can never overshoot.
  const fixed =
    promptTokens({ patientName: patient.name, notes: [], history: [], message }) +
    approximateTokens(omittedNotesLine(candidates.length, candidates.length)) +
    1;
  const fitted = fitNotesNewestFirst(candidates, BRAINSTORM_PROMPT_BUDGET - fixed);
  const notes = fitted.notes.map(({ title, date, text }) => ({ title, date, text }));
  const omittedNotes = fitted.omittedIds.length;

  // The turns are trimmed against the real prompt, oldest first.
  const turns = history.slice(-BRAINSTORM_HISTORY_TURNS);
  while (
    turns.length > 0 &&
    promptTokens({ patientName: patient.name, notes, omittedNotes, history: turns, message }) >
      BRAINSTORM_PROMPT_BUDGET
  ) {
    turns.shift();
  }

  return {
    context: {
      notes: fitted.notes.map(({ id, title, date }) => ({ id, title, date })),
      total: candidates.length,
      dropped_note_ids: [...fitted.omittedIds],
      most_recent: fitted.mostRecent,
    },
    notes,
    omittedNotes,
    history: turns,
  };
}

function promptTokens(request: BrainstormRequest): number {
  const prompt = buildBrainstormPrompt(request);
  return approximateTokens(prompt.system) + approximateTokens(prompt.user);
}

export function registerBrainstormRoutes(app: FastifyInstance, db: Database, providers: AiProviders): void {
  /**
   * The thread plus what the model would be given next — one round trip for
   * opening the view. The context is assembled, not stored: notes may have
   * changed since the last turn.
   */
  app.get('/api/patients/:id/brainstorm', async (request): Promise<BrainstormThreadResponse> => {
    const { id } = parseParams(IdParamsSchema, request.params);
    const patient = requirePatient(db, id);
    const assembled = assembleBrainstormContext(db, patient, '');
    return { messages: listBrainstormMessages(db, id), context: assembled.context };
  });

  app.post('/api/patients/:id/brainstorm', async (request, reply) => {
    // C-UPD@1's registry. A brainstorm turn holds an open SSE stream while the
    // model thinks and persists both messages, so a quiesce has to be able to name
    // it rather than settle over a thread mid-answer. The `finally` releases it on
    // every path, the error frame and an abandoned stream included.
    const jobId = uuidv7();
    begin('brainstorm', jobId);
    try {
      const { id } = parseParams(IdParamsSchema, request.params);
      const input = parseBody(BrainstormRequestSchema, request.body);
      const patient = requirePatient(db, id);

      // Read the thread *before* writing this turn into it: the message being
      // answered is passed to the provider on its own, not as history.
      const history = recentTurns(db, id);
      const assembled = assembleBrainstormContext(db, patient, input.message, history);

      // Her words are persisted whatever happens next. A local model that is not
      // running is a transient condition she will retry through; losing what she
      // typed to it is not something she should have to notice.
      const userMessage = createBrainstormMessage(db, {
        patient_id: patient.id,
        role: 'user',
        text: input.message,
      });

      // Captured at the start of the brainstorm job and used by every sentence
      // it writes: the frames the provider renders and the error event below
      // (C-LANG@1 rule 4). A brainstorm creates no document, so this is the
      // stored setting rather than any note's locale.
      const locale = storedLanguage(db);

      const stream = openSse(reply);
      stream.send('message', { message: userMessage });
      stream.send('context', { context: assembled.context });

      let replyText = '';
      let stats: LlmStats | null = null;
      let sawDiscussed = false;

      try {
        const events = providers.llm.discussPatient(
          {
            patientName: patient.name,
            notes: assembled.notes,
            omittedNotes: assembled.omittedNotes,
            history: assembled.history,
            message: input.message,
          },
          locale,
        );

        for await (const event of events) {
          // She closed the tab or switched patients: stop, and let the
          // provider's cleanup abort the call to Ollama rather than leave it
          // generating.
          if (stream.closed) break;

          if (event.type === 'status') {
            stream.send('status', { stage: event.stage, message: event.message });
          } else if (event.type === 'token') {
            // The decoder emits `reply` for the streamable field; anything else
            // would mean the shape changed under us, so ignore it rather than
            // render a fragment of something unshaped into the bubble.
            if (event.section === 'reply') stream.send('token', { text: event.text });
          } else if (event.type === 'discussed') {
            sawDiscussed = true;
            replyText = event.reply;
            stats = event.stats;
          }
        }
      } catch (error) {
        const failure = toAiError(error).inLocale(locale);
        logFailure(request, failure, 'brainstorm discussion failed');
        stream.send('error', { code: failure.code, message: failure.message });
        stream.end();
        return;
      }

      if (stream.closed) {
        stream.end();
        return;
      }
      if (!sawDiscussed) {
        const failure = aiError(
          'empty_response',
          'discussPatient finished without producing a reply',
          locale,
        );
        logFailure(request, failure, 'brainstorm discussion failed');
        stream.send('error', { code: failure.code, message: failure.message });
        stream.end();
        return;
      }

      if (stats) logStats(request, stats, 'brainstorm discussed');

      // The reply is persisted and released. Nothing here writes anywhere else:
      // this endpoint cannot revise a note, a plan, a briefing or a patient, by
      // construction rather than by prompt.
      const assistantMessage = createBrainstormMessage(db, {
        patient_id: patient.id,
        role: 'assistant',
        text: replyText,
      });
      stream.send('message', { message: assistantMessage });
      stream.end();
    } finally {
      end(jobId);
    }
  });

  /**
   * "New conversation", after her confirm on screen: forget the thread. The
   * answer carries the empty thread plus today's context, so the view resets
   * in one round trip.
   */
  app.delete('/api/patients/:id/brainstorm', async (request): Promise<BrainstormThreadResponse> => {
    const { id } = parseParams(IdParamsSchema, request.params);
    const patient = requirePatient(db, id);
    clearBrainstormMessages(db, id);
    return { messages: [], context: assembleBrainstormContext(db, patient, '').context };
  });
}

function requirePatient(db: Database, id: string): Patient {
  const patient = getPatient(db, id);
  if (!patient) throw notFound('errors.not_found.patient');
  return patient;
}

/**
 * The last few turns, oldest first. Bounded because the prompt is rebuilt
 * from scratch on every call and already carries the notes: an
 * unbounded thread is the one input here that grows without limit, and
 * Ollama truncates from the head when it overflows — dropping the
 * instructions and keeping the patient material.
 */
function recentTurns(db: Database, patientId: string): ChatTurn[] {
  return listBrainstormMessages(db, patientId)
    .slice(-BRAINSTORM_HISTORY_TURNS)
    .map((message) => ({ role: message.role, text: message.text }));
}

import {
  FIRST_PASS_MESSAGE,
  sectionsToText,
  type AppliedRetraction,
  type Note,
  type NoteFormat,
  type Sections,
} from '@apunta/shared';
import type { Database } from 'better-sqlite3';
import type { FastifyRequest } from 'fastify';

import { aiError, type AiError } from '../ai/errors.js';
import { logFailure, logStats, toAiError } from './ai.js';
import {
  applyDiscussionSubheadings,
  renderClinicalKnowledgeGuide,
  sectionForRole,
} from '../ai/clinical-knowledge/integration.js';
import { retractionNotice } from '../ai/retractions.js';
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
  /** Spoken retractions the provider cut from the transcript before drafting. */
  readonly retractions: readonly AppliedRetraction[];
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
  let retractions: readonly AppliedRetraction[] = [];
  const discussionSection = sectionForRole(format.sections, 'discussion');

  try {
    const events = providers.llm.generateNote({
      instructions: format.instructions,
      formatName: format.name,
      sections: format.sections,
      clinicalGuidance: renderClinicalKnowledgeGuide(format.name, format.sections),
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
        if (discussionSection !== null && event.section === discussionSection) {
          // Discussion's subheadings are checked after schema validation and
          // may be dropped; hold only that section so the visible stream
          // remains byte-for-byte equal to the persisted note. Other sections
          // stay live.
          continue;
        }
        stream.send('token', { section: event.section, text: event.text });
      } else if (event.type === 'sections') {
        const checked = applyDiscussionSubheadings(
          event.sections,
          format.sections,
          groundingSource(source, retractions),
        );
        sections = checked.sections;
        stats = event.stats;
        // The outcome only: the headings are patient material.
        if (checked.outcome !== 'none')
          request.log.info({ outcome: checked.outcome }, 'discussion subheadings');
        if (discussionSection !== null) {
          stream.send('token', { section: discussionSection, text: sections[discussionSection] ?? '' });
        }
      } else if (event.type === 'retractions') {
        retractions = event.applied;
        // Counts only: what was cut is patient material.
        request.log.info({ applied: event.applied.length, offered: event.offered }, 'retractions applied');
      }
    }
  } catch (error) {
    const failure = toAiError(error);
    logFailure(request, failure, 'note drafting failed');
    stream.send('error', { code: failure.code, message: failure.message });
    return { sections: null, stats: null, retractions: [], failure };
  }

  if (stream.closed) return { sections, stats, retractions, failure: null };

  if (sections === null) {
    const failure = aiError('empty_response', 'the provider finished without producing a note');
    logFailure(request, failure, 'note drafting failed');
    stream.send('error', { code: failure.code, message: failure.message });
    return { sections: null, stats: null, retractions: [], failure };
  }

  if (stats) logStats(request, stats, 'note drafted');
  return { sections, stats, retractions, failure: null };
}

/**
 * What a Discussion subheading may be named from: her typed notes and the
 * transcript, with every retracted quote cut out as the drafting model saw it,
 * so a topic she took back cannot come back as a heading.
 */
export function groundingSource(source: DraftSource, retractions: readonly AppliedRetraction[]): string {
  let transcript = source.transcript ?? '';
  for (const { withdrawn } of retractions) {
    if (withdrawn !== '') transcript = transcript.replace(withdrawn, ' ');
  }
  return `${source.typedNotes ?? ''}\n${transcript}`;
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
  retractions: readonly AppliedRetraction[] = [],
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

  // What was cut before drafting is told to her here, in her own words, where
  // the note's history lives — and stripped from what the model sees of that
  // history (`chat.ts`), so a retracted claim cannot come back through it.
  const opening =
    retractions.length === 0
      ? FIRST_PASS_MESSAGE
      : `${FIRST_PASS_MESSAGE}\n\n${retractionNotice(retractions)}`;
  createChatMessage(db, {
    note_id: note.id,
    role: 'assistant',
    text: opening,
    ref_quote: null,
  });
  return note;
}

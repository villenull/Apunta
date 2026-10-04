import {
  sectionsToText,
  type AppliedRetraction,
  type Note,
  type NoteFormat,
  type Sections,
} from '@apunta/shared';
import type { Database } from 'better-sqlite3';
import type { FastifyRequest } from 'fastify';
import type { SseStream } from '../http/sse.js';

import { aiError, type AiError } from '../ai/errors.js';
import { preserveExplicitAbsences } from '../ai/fact-guard.js';
import { retractionNotice } from '../ai/retractions.js';
import { logFailure, logStats, toAiError } from './ai.js';
import {
  applyDiscussionSubheadings,
  renderClinicalKnowledgeGuide,
  sectionForRole,
} from '../ai/clinical-knowledge/integration.js';
import type { AiProviders, DraftSource, LlmStats } from '../ai/types.js';
import { msg, type Locale } from '../http/locale.js';
import { fitDraftingPriorNotes } from '../ai/prior-notes.js';
import { createChatMessage } from '../db/chat-messages.js';
import { createNote, listNotesForPatient } from '../db/notes.js';
import { createTranscript } from '../db/transcripts.js';
import { uuidv7 } from '../db/uuid.js';
import { begin, end } from '../jobs/registry.js';

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
  readonly db: Database;
  readonly patientId: string;
  readonly format: NoteFormat;
  readonly source: DraftSource;
  readonly stream: SseStream;
  readonly request: FastifyRequest;
  /**
   * The locale the drafting job captured at its start (C-LANG@1 rule 4).
   *
   * Passed in rather than read here so the one value covers the whole request:
   * the frames the provider renders, the error event below, and the sentence
   * the note is opened with. A reader that ran per sentence could change
   * language under a job that already started in one.
   */
  readonly locale: Locale;
}): Promise<DraftOutcome> {
  const { providers, db, patientId, format, source, stream, request, locale } = params;

  /**
   * The registry's first user (C-LANG@1 rule 6): a draft is in flight for as
   * long as this call takes, and the `finally` is what makes that true on the
   * paths that matter — a provider that failed, a client that closed the tab.
   * Both are exactly when a stale "something is running" would be worst, since
   * it is the flag S2.6 refuses a language change on.
   *
   * A draft has no note yet, so the job carries an id minted here rather than
   * the note's. This is the shared drafting path, so the transcribe route's
   * drafting half registers one too — that is the same code, not a second
   * decision.
   */
  const jobId = uuidv7();
  begin('draft', jobId);
  try {
    let sections: Sections | null = null;
    let stats: LlmStats | null = null;
    let retractions: readonly AppliedRetraction[] = [];
    const discussionSection = sectionForRole(format.sections, 'discussion');
    try {
      const priorNotes = fitDraftingPriorNotes(listNotesForPatient(db, patientId));
      const events = providers.llm.generateNote(
        {
          instructions: format.instructions,
          formatName: format.name,
          sections: format.sections,
          clinicalGuidance: renderClinicalKnowledgeGuide(format.name, format.sections),
          typedNotes: source.typedNotes,
          transcript: source.transcript,
          ...(priorNotes.length === 0 ? {} : { priorNotes }),
        },
        locale,
      );

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
          sections = preserveExplicitAbsences(
            groundingSource(source, retractions),
            checked.sections,
            format.sections,
          );
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
      const failure = toAiError(error).inLocale(locale);
      logFailure(request, failure, 'note drafting failed');
      stream.send('error', { code: failure.code, message: failure.message });
      return { sections: null, stats: null, retractions: [], failure };
    }

    if (stream.closed) return { sections, stats, retractions, failure: null };

    if (sections === null) {
      const failure = aiError('empty_response', 'the provider finished without producing a note', locale);
      logFailure(request, failure, 'note drafting failed');
      stream.send('error', { code: failure.code, message: failure.message });
      return { sections: null, stats: null, retractions: [], failure };
    }

    if (stats) logStats(request, stats, 'note drafted');
    return { sections, stats, retractions, failure: null };
  } finally {
    end(jobId);
  }
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
 *
 * All of it is one transaction. Three separate writes meant a failure midway —
 * a full disk, a patient deleted by another tab — could leave a note whose
 * transcript was missing, and the transcript is the source the refine
 * boilerplate lock checks against, so legitimate text would then be held back
 * from a note that had never been drafted without one.
 */
export function persistDraft(
  db: Database,
  input: PersistDraftInput,
  format: NoteFormat,
  sections: Sections,
  retractions: readonly AppliedRetraction[] = [],
): Note {
  return db.transaction((): Note => {
    const note = createNote(db, {
      patient_id: input.patient_id,
      format_id: input.format_id,
      // C-LANG@1 rule 3: a drafted note is written in its format's language.
      locale: format.locale,
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
    // The note's own locale, not the request's: this row is written with the
    // note and shown under every later draft of it, and a refine answers in the
    // note's language (C-LANG@1 rule 4). A note is written in its format's
    // language (`createNote` above), which is the locale to render this in.
    const opening = (() => {
      const firstPass = msg(format.locale, 'chat.firstPass');
      return retractions.length === 0
        ? firstPass
        : `${firstPass}\n\n${retractionNotice(retractions, format.locale)}`;
    })();
    createChatMessage(db, {
      note_id: note.id,
      role: 'assistant',
      text: opening,
      ref_quote: null,
    });
    return note;
  })();
}

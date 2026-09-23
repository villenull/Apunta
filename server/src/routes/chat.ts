import {
  CHAT_HISTORY_TURNS,
  ChatRequestSchema,
  approximateTokens,
  emptySectionNames,
  instantToLocalDay,
  PUBLISHED_REFUSAL,
  sectionsToText,
  textToSections,
  type ChatMessage,
  type ChatMessageListResponse,
  type Note,
  type Sections,
} from '@apunta/shared';
import type { Database } from 'better-sqlite3';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { aiError } from '../ai/errors.js';
import {
  applyDiscussionSubheadings,
  renderClinicalKnowledgeGuide,
} from '../ai/clinical-knowledge/integration.js';
import { FACT_NOTICE_OPENING, factNotice, guardDroppedFacts } from '../ai/fact-guard.js';
import { REFINE_PROMPT_TOKENS } from '../ai/ollama.js';
import {
  PRIOR_NOTE_NOTICE_OPENING,
  bringOverRequested,
  guardPriorNoteContent,
  priorNoteNotice,
} from '../ai/prior-note-guard.js';
import { fitNotesNewestFirst, type FittedNote } from '../ai/prior-notes.js';
import { buildRefinePrompt, refineBackgroundOverheadTokens } from '../ai/prompts.js';
import { GUARD_NOTICE_OPENING, guardNotice, guardRefinedSections } from '../ai/refine-guard.js';
import { RETRACTION_NOTICE_OPENING } from '../ai/retractions.js';
import type { AiProviders, ChatTurn, LlmStats, RefineNoteRequest } from '../ai/types.js';
import { createChatMessage, listChatMessagesForNote } from '../db/chat-messages.js';
import { getFormat } from '../db/formats.js';
import { getNote, listNotesForPatient, updateDraftNoteContent } from '../db/notes.js';
import { listTranscriptsForNote } from '../db/transcripts.js';
import { notFound } from '../http/errors.js';
import { openSse, type SseStream } from '../http/sse.js';
import { IdParamsSchema, parseBody, parseParams } from '../http/validate.js';
import { logFailure, logStats, toAiError } from './ai.js';
import { tryMoveOnlyRefine } from './refine-fast-path.js';

/**
 * The refine chat — `POST /api/notes/:id/chat` (SSE) and the thread behind it.
 *
 * This is the owner's primary repair path (design question 4), so it is the
 * endpoint that has to be genuinely good: it always sends the note's *current*
 * text, so a hand-edit she made a second ago is what the model revises.
 *
 * Two things are enforced here rather than in the prompt:
 *
 * **The published lock.** A published note is a filed clinical record. The
 * model is never told about the lock, because a rule in a prompt can be talked
 * out of; the server discards any rewrite of a published note instead.
 *
 * **Her other notes are background, never material.** The model sees the
 * patient's other notes so she can ask how this session compares with the
 * last; what it may not do is carry anything from them into this one unless
 * she asks, and the prior-note lock (`ai/prior-note-guard.ts`) holds that.
 *
 * **Privacy.** Every diagnostic on this path is shape — codes, lengths,
 * counts. The note *and* the therapist's message both go through here, so it
 * is the worst place in the app to be casual about what reaches a log
 * (`docs/research/privacy-audit-2026-08.md` H1).
 */
export function registerChatRoutes(app: FastifyInstance, db: Database, providers: AiProviders): void {
  /**
   * The thread, loaded alongside the note.
   *
   * A subresource rather than an extra key on `GET /api/notes/:id`: single
   * resources answer the bare entity in this API (`docs/decisions.md`), and
   * folding messages in would make every note fetch — including the list —
   * carry a conversation nothing on that screen reads.
   */
  app.get('/api/notes/:id/chat', async (request): Promise<ChatMessageListResponse> => {
    const { id } = parseParams(IdParamsSchema, request.params);
    requireNote(db, id);
    return { messages: listChatMessagesForNote(db, id) };
  });

  app.post('/api/notes/:id/chat', async (request, reply) => {
    const { id } = parseParams(IdParamsSchema, request.params);
    const input = parseBody(ChatRequestSchema, request.body);
    const note = requireNote(db, id);
    const format = getFormat(db, note.format_id);
    if (!format) throw notFound('Note format not found');

    // Read the thread *before* writing this turn into it: the message being
    // answered is passed to the provider on its own, not as history.
    const history = recentTurns(db, note.id);

    // Her words are persisted whatever happens next. A local model that is not
    // running is a transient condition she will retry through; losing what she
    // typed to it is not something she should have to notice.
    const userMessage = createChatMessage(db, {
      note_id: note.id,
      role: 'user',
      text: input.message,
      ref_quote: input.ref_quote ?? null,
    });

    const stream = openSse(reply);
    stream.send('message', { message: userMessage });

    const locked = note.status === 'published';

    // A published note plus a plain instruction never reaches the model at
    // all: there is nothing for it to do, and the prototype's answer is the
    // right one. A question still gets asked — she may simply want to know
    // something about a note she has already filed.
    if (locked && !isQuestion(input.message)) {
      finishWithReply(db, stream, note.id, PUBLISHED_REFUSAL);
      return;
    }

    // A single, explicitly quoted move is safe to perform without model
    // generation. The parser is intentionally strict; every rejected or
    // ambiguous request falls through to the existing refine path below.
    const fastPath = tryMoveOnlyRefine(input.message, note.content, format.sections);
    if (fastPath.matched) {
      if (stream.closed) {
        stream.end();
        return;
      }

      const previous = textToSections(note.content, format.sections);
      const sources = [
        ...listTranscriptsForNote(db, note.id).map((t) => t.raw_text),
        input.message,
        ...(input.ref_quote == null ? [] : [input.ref_quote]),
      ];
      const guarded = guardRefinedSections(previous, fastPath.sections, sources);
      const kept = guardDroppedFacts(previous, guarded.sections, input.message);

      // Moving existing, quoted text should pass both locks. Keep this check
      // explicit nevertheless: if a future guard learns that the operation
      // violates a clinical or fact invariant, this request takes the normal
      // model path instead of bypassing that protection.
      if (guarded.blocked.length === 0 && kept.dropped.length === 0) {
        stream.send('status', { stage: 'drafting', message: 'Applying the move…' });
        if (stream.closed) {
          stream.end();
          return;
        }
        const rewritten = updateDraftNoteContent(db, note.id, fastPath.content);
        if (rewritten === undefined) {
          finishWithReply(db, stream, note.id, PUBLISHED_REFUSAL);
          return;
        }
        if (stream.closed) {
          stream.end();
          return;
        }

        stream.send('note-updated', {
          note: rewritten,
          empty_sections: emptySectionNames(fastPath.sections, format.sections),
          outcome: 'applied',
          outcome_reason: null,
        });
        const replyText = `Moved the quoted text from ${fastPath.source} to ${fastPath.target}.`;
        stream.send('token', { text: replyText });
        stream.send('message', { message: persistReply(db, note.id, replyText) });
        stream.end();
        return;
      }
    }

    let replyText = '';
    let updatedSections: Sections | null = null;
    let stats: LlmStats | null = null;
    let sawRefined = false;
    const streamedRewriteSections = new Set<string>();
    let heldBack = false;
    // An edit reply is a completion claim. Keep it out of the visible chat
    // until the guarded write has committed; otherwise the model can say it
    // fixed the note while the editor is still showing the old text. Questions
    // remain streamable because their answer is useful before any note write.
    const bufferReplyTokens = !isQuestion(input.message);
    let bufferedReply = '';

    const baseRequest: RefineNoteRequest = {
      instructions: format.instructions,
      formatName: format.name,
      sections: format.sections,
      clinicalGuidance: renderClinicalKnowledgeGuide(format.name, format.sections),
      noteText: note.content,
      history,
      message: input.message,
      ...(input.ref_quote == null ? {} : { refQuote: input.ref_quote }),
    };
    const priorNotes = fitRefineBackground(db, note, baseRequest);

    try {
      const events = providers.llm.refineNote(
        priorNotes.length === 0
          ? baseRequest
          : {
              ...baseRequest,
              noteDate: instantToLocalDay(note.created_at),
              priorNotes: priorNotes.map(({ title, date, text }) => ({ title, date, text })),
            },
      );

      for await (const event of events) {
        // She closed the tab or switched notes: stop, and let the provider's
        // cleanup abort the call to Ollama rather than leave it generating.
        if (stream.closed) break;

        if (event.type === 'status') {
          stream.send('status', { stage: event.stage, message: event.message });
        } else if (event.type === 'token') {
          // Section tokens are progress-only. Their text remains buffered in
          // the provider's validated result and never leaks a half rewrite.
          const rewriteSection = format.sections.find((section) => section === event.section);
          if (rewriteSection !== undefined && !streamedRewriteSections.has(rewriteSection)) {
            streamedRewriteSections.add(rewriteSection);
            stream.send('status', {
              stage: 'drafting',
              message: `Rewriting ${String(streamedRewriteSections.size)} of ${String(format.sections.length)} sections…`,
            });
          }
          if (event.section === 'reply') {
            if (bufferReplyTokens) bufferedReply += event.text;
            else stream.send('token', { text: event.text });
          }
        } else if (event.type === 'refined') {
          sawRefined = true;
          replyText = event.reply;
          // A subheading in a revision may be named from the note as it
          // stands or from what she wrote in this chat — see
          // `discussionSubheadingSource`, which deliberately leaves her
          // stored dictation and the format's own headers out.
          updatedSections =
            event.updatedSections === null
              ? null
              : applyDiscussionSubheadings(
                  event.updatedSections,
                  format.sections,
                  discussionSubheadingSource(note.content, format.sections, input.message, input.ref_quote),
                ).sections;
          stats = event.stats;
        }
      }
    } catch (error) {
      const failure = toAiError(error);
      logFailure(request, failure, 'note refinement failed');
      stream.send('error', { code: failure.code, message: failure.message });
      stream.end();
      return;
    }

    if (stream.closed) {
      stream.end();
      return;
    }
    if (!sawRefined) {
      const failure = aiError('empty_response', 'refineNote finished without producing a reply');
      logFailure(request, failure, 'note refinement failed');
      stream.send('error', { code: failure.code, message: failure.message });
      stream.end();
      return;
    }

    if (stats) logStats(request, stats, 'note refined');

    if (locked) {
      // The lock, applied after the fact. A model that tried to rewrite the
      // note has effectively read the message as an instruction, so its reply
      // may well describe an edit that did not happen — say the true thing
      // instead. An answer that touched nothing is hers to keep.
      finishWithReply(db, stream, note.id, updatedSections === null ? replyText : PUBLISHED_REFUSAL);
      return;
    }

    // A question is a question, never an edit. A message she phrased as one
    // ("can you shorten the plan?") can still come back from the model with a
    // rewrite attached — the model reads it as an instruction. Applying that
    // would let a draft be silently rewritten by something she only asked
    // about, so the rewrite is discarded and she keeps the reply. The published
    // lock above refuses the same disguised edit; on a draft there is nothing
    // to refuse, so the note is simply left as it was.
    if (isQuestion(input.message)) {
      updatedSections = null;
    }

    if (updatedSections !== null) {
      // The boilerplate lock, the published lock's sibling (found necessary
      // in M10's live pass): a revision may not gain a stock clinical
      // assertion that neither the note, her stored dictation, nor her own
      // request contains. Checked against the transcripts on disk, never the
      // model's account of them — the same session showed it confabulating
      // provenance. Her message is an allowed source because "add that he
      // denied SI today" is her writing the note through the chat, which is
      // the whole point of the chat.
      const previous = textToSections(note.content, format.sections);
      const sources = [
        ...listTranscriptsForNote(db, note.id).map((t) => t.raw_text),
        input.message,
        ...(input.ref_quote == null ? [] : [input.ref_quote]),
      ];
      const priorTexts = priorNotes.map((prior) => prior.text);
      // Asked in so many words to bring something over from another session,
      // that session's note is her own record and a source like her dictation.
      const bringOver = bringOverRequested(input.message);
      const guarded = guardRefinedSections(
        previous,
        updatedSections,
        bringOver ? [...sources, ...priorTexts] : sources,
      );
      if (guarded.blocked.length > 0) {
        replyText = `${replyText}\n\n${guardNotice(guarded.blocked)}`;
        logBlocked(request, guarded.blocked.length);
        heldBack = true;
      }
      // The fact lock, the third of the family (found by the refine harness,
      // 2026-09-01): a revision may not lose a number or a date that nothing
      // in her message named or asked to remove. Her highlighted passage is
      // deliberately not a source here — pointing at a sentence and saying
      // "shorter" is not permission to lose what it says.
      const kept = guardDroppedFacts(previous, guarded.sections, input.message);
      if (kept.dropped.length > 0) {
        replyText = `${replyText}\n\n${factNotice(kept.dropped)}`;
        logKept(request, kept.dropped.length);
        heldBack = true;
      }
      // The prior-note lock, the fourth: nothing only her other notes contain
      // enters this one unless she asked for it. Checked last, against what
      // the other locks let through, so a section any lock kept stays kept.
      const fenced = guardPriorNoteContent(previous, kept.sections, sources, priorTexts, input.message);
      if (fenced.carried.length > 0) {
        replyText = `${replyText}\n\n${priorNoteNotice(fenced.carried)}`;
        logFenced(request, fenced.carried.length);
        heldBack = true;
      }
      updatedSections = fenced.sections;
    }

    // Serialized through the same `sectionsToText` the drafting path uses,
    // so a refined note is identical in shape to a freshly drafted one —
    // which is what keeps the round trip through `textToSections` stable
    // over many turns of revision.
    const content = updatedSections === null ? null : sectionsToText(updatedSections, format.sections);
    const changed = content !== null && content !== note.content;

    // An instruction that changed nothing gets the server's sentence, because
    // the model's reply may well describe an edit that did not happen. Seen
    // live on 2026-09-04: asked to shorten a second time, the model returned
    // no revision and repeated, word for word, its earlier claim to have
    // removed a sentence. A question is allowed to change nothing, and a
    // revision a lock held back has already been explained.
    if (!changed && !heldBack && !isQuestion(input.message)) {
      replyText = `${replyText}\n\n${UNCHANGED_NOTICE}`;
    }

    let rewritten: Note | undefined;
    if (changed && updatedSections !== null) {
      // Conditional on the note still being a draft: she may have filed it in
      // the seconds the model spent thinking, and the finished rewrite must not
      // land on a published record behind the lock's back. A write that no-ops
      // for that reason emits no `note-updated` — her filed note is unchanged.
      // Replace the model's claim with the same refusal used by the published
      // lock, so the thread tells the truth about the race too.
      rewritten = updateDraftNoteContent(db, note.id, content);
      if (rewritten === undefined) replyText = PUBLISHED_REFUSAL;
    }

    if (rewritten !== undefined && updatedSections !== null) {
      // The note has been committed before this event is sent. Clients apply
      // it before releasing the assistant completion, so the visible success
      // follows the rendered note rather than racing it.
      stream.send('note-updated', {
        note: rewritten,
        empty_sections: emptySectionNames(updatedSections, format.sections),
        outcome: 'applied',
        outcome_reason: null,
      });
    } else if (updatedSections !== null && !isQuestion(input.message)) {
      const outcome = changed ? 'withheld' : heldBack ? 'withheld' : 'unchanged';
      const outcomeReason =
        outcome === 'withheld'
          ? changed
            ? 'The note became published before the edit could be applied.'
            : 'A safety guard protected the existing note content.'
          : 'The requested edit produced no changes.';
      stream.send('note-updated', {
        note,
        empty_sections: emptySectionNames(updatedSections, format.sections),
        outcome,
        outcome_reason: outcomeReason,
      });
    }

    if (bufferedReply !== '') stream.send('token', { text: bufferedReply });
    const assistantMessage = persistReply(db, note.id, replyText);
    stream.send('message', { message: assistantMessage });
    stream.end();
  });
}

/**
 * What a Discussion subheading may be named from: the note exactly as it
 * stands, her message, and the passage she highlighted *when that passage is
 * still verbatim in the note today*.
 *
 * Her stored transcripts are deliberately not a source. A transcript is what
 * she said, not what the note says: the retraction pass cuts a withdrawn
 * figure out of it before drafting, so raw dictation can still hold words she
 * took back, and the refine path has already seen this model confabulate
 * provenance from a transcript. What survived into the note's bodies is what
 * she stands behind, so the bodies are the source. The format's own top-level
 * headers are dropped for the same reason: `Discussion:` is a label the format
 * owns, not something she said, and a heading must not be grounded on a
 * section's name.
 *
 * This decides subheading *titles* only. Each lock builds its own sources and
 * keeps them as they are.
 */
export function discussionSubheadingSource(
  noteContent: string,
  sections: readonly string[],
  message: string,
  refQuote: string | null | undefined,
): string {
  const bodies = textToSections(noteContent, sections);
  return [
    ...sections.map((name) => bodies[name] ?? ''),
    message,
    // A highlight from an earlier draft is not in today's note; only a quote
    // that is still in the text she is revising may name a topic.
    ...(refQuote != null && refQuote !== '' && noteContent.includes(refQuote) ? [refQuote] : []),
  ].join('\n');
}

/**
 * At most this much of the refine prompt goes to her other notes, however
 * much room is left. Every refine turn pays for the background in prompt
 * evaluation, and every note in it is one more record the model could lift
 * from; the questions it serves — last session, what was agreed — are about
 * the most recent few. About eight notes of ~500 estimated tokens each.
 */
export const REFINE_BACKGROUND_TOKENS = 4096;

/**
 * Her other notes on this patient, newest first, fitted with Brainstorm's
 * code (`fitNotesNewestFirst`). The note, the conversation and her message
 * are sized first, from the real prompt; the background gets only what is
 * left, capped above. So the note and the thread always win.
 */
function fitRefineBackground(db: Database, note: Note, request: RefineNoteRequest): FittedNote[] {
  const others = listNotesForPatient(db, note.patient_id).filter((other) => other.id !== note.id);
  if (others.length === 0) return [];
  const prompt = buildRefinePrompt(request);
  const fixed =
    approximateTokens(prompt.system) + refineBackgroundOverheadTokens(instantToLocalDay(note.created_at));
  const room = Math.min(REFINE_BACKGROUND_TOKENS, REFINE_PROMPT_TOKENS - fixed);
  if (room <= 0) return [];
  return [...fitNotesNewestFirst(others, room).notes];
}

function requireNote(db: Database, id: string): Note {
  const note = getNote(db, id);
  if (!note) throw notFound('Note not found');
  return note;
}

/** The server's own sentence when an instruction left the note as it was. */
export const UNCHANGED_NOTICE = 'Apunta did not change the note: the revision came back with no edits.';

/**
 * Everything the server appends to a reply — lock notices, the no-change
 * sentence — begins with one of these after a blank line. The thread shows
 * them to her; the model never sees them (see `recentTurns`).
 */
const SERVER_SENTENCES = [
  GUARD_NOTICE_OPENING,
  FACT_NOTICE_OPENING,
  UNCHANGED_NOTICE,
  RETRACTION_NOTICE_OPENING,
  PRIOR_NOTE_NOTICE_OPENING,
].map((sentence) => sentence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const SERVER_SENTENCE_START = new RegExp(`\\n\\n(?=(?:${SERVER_SENTENCES.join('|')}))`);

/**
 * The last few turns, oldest first, with the server's sentences taken off the
 * assistant's replies.
 *
 * The model is never told about the locks — a rule in a prompt can be talked
 * out of — and a notice in its own history is exactly that telling. Left in,
 * it also fed a live failure: the turn after a held-back shortening came back
 * with no revision at all and the previous reply repeated verbatim.
 *
 * Bounded because the prompt is rebuilt from scratch on every call and already
 * carries the whole note: an unbounded thread is the one input here that grows
 * without limit, and Ollama truncates from the head when it overflows —
 * dropping the instructions and keeping the patient material.
 */
function recentTurns(db: Database, noteId: string): ChatTurn[] {
  return listChatMessagesForNote(db, noteId)
    .slice(-CHAT_HISTORY_TURNS)
    .map((message) => ({
      role: message.role,
      text: message.role === 'assistant' ? withoutServerSentences(message.text) : message.text,
    }));
}

/** Exported for the test that proves the model never sees a notice. */
export function withoutServerSentences(reply: string): string {
  return (reply.split(SERVER_SENTENCE_START)[0] ?? reply).trimEnd();
}

/** The prototype's test: a message with a question mark in it is a question. */
function isQuestion(message: string): boolean {
  return message.includes('?');
}

function persistReply(db: Database, noteId: string, text: string): ChatMessage {
  return createChatMessage(db, { note_id: noteId, role: 'assistant', text, ref_quote: null });
}

/**
 * End the stream on a reply the note was never changed by.
 *
 * Only the persisted row goes out, never a `token` for it: the browser renders
 * whatever streamed until the assistant's `message` arrives and then shows the
 * row instead, so replacing a model's reply with the refusal here is enough to
 * put the true thing on screen.
 */
function finishWithReply(db: Database, stream: SseStream, noteId: string, text: string): void {
  stream.send('message', { message: persistReply(db, noteId, text) });
  stream.end();
}

/** A count, never the phrase and never the section name — shape only. */
function logBlocked(request: FastifyRequest, sections: number): void {
  request.log.info({ blockedSections: sections }, 'refinement partially blocked by the boilerplate lock');
}

/** Likewise a count: the phrase here is note content and never reaches a log. */
function logKept(request: FastifyRequest, sections: number): void {
  request.log.info({ keptSections: sections }, 'refinement partially held back by the fact lock');
}

/** A count, never the phrase: it is from another of her notes. */
function logFenced(request: FastifyRequest, sections: number): void {
  request.log.info({ fencedSections: sections }, 'refinement partially held back by the prior-note lock');
}

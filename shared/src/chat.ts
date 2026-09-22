import { z } from 'zod';

import { ChatMessageSchema } from './chat-message.js';
import { boundedText, MAX_BODY_CHARS, optionalText } from './common.js';
import { GenerateErrorEventSchema, GenerateStatusEventSchema, type GenerateErrorEvent } from './generate.js';
import { NoteSchema } from './note.js';

/**
 * `POST /api/notes/:id/chat` — the refine chat (PLAN §4).
 *
 * This is the practice owner's primary repair path, not a co-equal feature:
 * asked what she reaches for when a paragraph is wrong, she chose "describe
 * the problem in a chat and let it revise" over editing directly
 * (`docs/feedback/2026-08-22-owner-answers.md`, design question 4). The
 * highlight-reference below is the secondary affordance, which is why
 * `ref_quote` is optional and everything works without it.
 */
export const ChatRequestSchema = z.object({
  /** What she typed or dictated. */
  message: boundedText(MAX_BODY_CHARS),
  /** The excerpt she highlighted in the editor before sending. */
  ref_quote: optionalText(MAX_BODY_CHARS).nullish(),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

/** `GET /api/notes/:id/chat` — the thread, oldest first. */
export const ChatMessageListResponseSchema = z.object({
  messages: z.array(ChatMessageSchema),
});
export type ChatMessageListResponse = z.infer<typeof ChatMessageListResponseSchema>;

/**
 * SSE event names on `POST /api/notes/:id/chat`.
 *
 * `message` arrives twice: once for the persisted user turn (so the browser
 * can swap its optimistic bubble for the real row, ids and `ref_quote`
 * included) and once for the assistant's. For an edit, `note-updated` is sent
 * before the assistant's `message`, only after the guarded draft write has
 * committed; the browser may wait for that event to render before showing the
 * assistant's completion claim. Questions and refused edits have no
 * `note-updated`; the stream ends after the assistant's `message` or an
 * `error`.
 */
export const CHAT_EVENT_NAMES = ['status', 'token', 'message', 'note-updated', 'error'] as const;
export type ChatEventName = (typeof CHAT_EVENT_NAMES)[number];

/** Progress, so a cold model load does not look like a hang. Same shape as `/api/generate`. */
export const ChatStatusEventSchema = GenerateStatusEventSchema;
export type ChatStatusEvent = z.infer<typeof ChatStatusEventSchema>;

/**
 * A decoded slice of the assistant's reply.
 *
 * No `section` key, unlike `/api/generate`: a refine response has exactly one
 * streamable string field. Its `updatedSections` is a nested object, which the
 * decoder deliberately ignores — a half-written rewrite of the note is not
 * something to show mid-stream.
 */
export const ChatTokenEventSchema = z.object({
  text: z.string(),
});
export type ChatTokenEvent = z.infer<typeof ChatTokenEventSchema>;

/** A persisted `chat_messages` row — the user's turn, then the assistant's. */
export const ChatMessageEventSchema = z.object({
  message: ChatMessageSchema,
});
export type ChatMessageEvent = z.infer<typeof ChatMessageEventSchema>;

/**
 * The rewritten note, already persisted with `updated_at` bumped.
 *
 * Never sent for a published note: the server discards any rewrite of one
 * rather than asking the model to respect the lock.
 */
export const ChatNoteUpdatedEventSchema = z.object({
  note: NoteSchema,
  /** Sections whose body came back blank, in format order. */
  empty_sections: z.array(z.string()),
});
export type ChatNoteUpdatedEvent = z.infer<typeof ChatNoteUpdatedEventSchema>;

/** An AI failure reported inside the stream, once the 200 was committed. */
export const ChatErrorEventSchema = GenerateErrorEventSchema;
export type ChatErrorEvent = GenerateErrorEvent;

/**
 * The prototype's canned refusal (`prototype/patients.html`, `sendChat`).
 *
 * The published-lock is enforced by the server, never by asking the model to
 * respect it: a rule in a prompt can be talked out of, and a published note is
 * a filed clinical record.
 */
export const PUBLISHED_REFUSAL =
  'This note is published, so I won’t change it. Click “Published (click to edit)” to unlock it first, then ask me again.';

/**
 * The assistant's opening turn, written by `POST /api/generate` the moment a
 * draft is saved (`prototype/patients.html`, `init`).
 *
 * Kept verbatim from the prototype, "dictation" included, even though typed
 * capture turned out to be the primary path — the copy is the owner's call,
 * and every other string on this screen is hers too.
 */
export const FIRST_PASS_MESSAGE =
  "Here's a first pass based on your dictation. Tell me what to change — shorten a section, add something I missed, adjust tone — and I'll update it. Highlight any part of the note to point me right at it.";

/**
 * How much of the thread goes back to the model on each turn.
 *
 * The prompt is rebuilt from scratch every call (`server/src/ai/prompts.ts`),
 * so this is the only place conversation length can run away with the context
 * window — and the note itself is in the prompt too.
 */
export const CHAT_HISTORY_TURNS = 10;

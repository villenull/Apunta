import { z } from 'zod';

import { ChatRoleSchema } from './chat-message.js';
import { boundedText, IdSchema, MAX_BODY_CHARS, TimestampSchema } from './common.js';
import { GenerateErrorEventSchema, GenerateStatusEventSchema } from './generate.js';
import { MAX_SECTION_CHARS, type JsonSchemaObject } from './sections.js';
/**
 * `POST /api/patients/:id/brainstorm` — Brainstorm (M12).
 *
 * A freeform chat with the local model about one patient, opened from the
 * notes column above "Treatment plan". A thinking aid, never a record:
 * nothing said here is written into a note, a plan or the patient's details.
 * There is no highlight-reference here — no editor is open beside it — so the
 * body is only the message.
 */
export const BrainstormRequestSchema = z.object({
  /** What she typed. */
  message: boundedText(MAX_BODY_CHARS),
});
export type BrainstormRequest = z.infer<typeof BrainstormRequestSchema>;

/** One turn of the per-patient conversation. No `ref_quote`: see above. */
export const BrainstormMessageSchema = z.object({
  id: IdSchema,
  patient_id: IdSchema,
  role: ChatRoleSchema,
  text: z.string(),
  created_at: TimestampSchema,
});
export type BrainstormMessage = z.infer<typeof BrainstormMessageSchema>;

/** One note the model was given, as the "Context" line shows it. */
export const BrainstormNoteSchema = z.object({
  id: IdSchema,
  title: z.string(),
  /** `YYYY-MM-DD`, so the line reads as dates. */
  date: z.string(),
});
export type BrainstormNote = z.infer<typeof BrainstormNoteSchema>;

/**
 * Which notes the model was given, decided server-side on every turn.
 *
 * Notes are newest first and capped by the briefing's lookback setting; the
 * whole prompt is budgeted to the context window, so on overflow the oldest
 * conversation turns go first, then the oldest notes, whole notes only. A
 * note too long to fit alone is left out, and its id lands here so the screen
 * can say so rather than silently think with less than she sees.
 */
export const BrainstormContextSchema = z.object({
  notes: z.array(BrainstormNoteSchema),
  cap: z.number().int(),
  dropped_note_ids: z.array(IdSchema),
});
export type BrainstormContext = z.infer<typeof BrainstormContextSchema>;

/** `GET /api/patients/:id/brainstorm` — the thread, oldest first, plus today's context. */
export const BrainstormThreadResponseSchema = z.object({
  messages: z.array(BrainstormMessageSchema),
  context: BrainstormContextSchema,
});
export type BrainstormThreadResponse = z.infer<typeof BrainstormThreadResponseSchema>;

/**
 * SSE event names on `POST /api/patients/:id/brainstorm`.
 *
 * `message` arrives twice — the persisted user turn, then the assistant's,
 * which supersedes whatever streamed. `context` arrives once, before the
 * first `token`, so the screen can show what the model is thinking with while
 * it is still thinking. There is deliberately no `note-updated`: this stream
 * never modifies the record, and no event on it may.
 */
export const BRAINSTORM_EVENT_NAMES = ['status', 'token', 'message', 'context', 'error'] as const;
export type BrainstormEventName = (typeof BRAINSTORM_EVENT_NAMES)[number];

/** Progress, so a cold model load does not look like a hang. Same shape as `/api/generate`. */
export const BrainstormStatusEventSchema = GenerateStatusEventSchema;
export type BrainstormStatusEvent = z.infer<typeof BrainstormStatusEventSchema>;

/**
 * A decoded slice of the assistant's reply.
 *
 * No `section` key: a discussion has exactly one streamable string field, and
 * the decoder ignores anything nested for the same reason the refine chat's
 * does — nothing half-written belongs on screen.
 */
export const BrainstormTokenEventSchema = z.object({
  text: z.string(),
});
export type BrainstormTokenEvent = z.infer<typeof BrainstormTokenEventSchema>;

/** A persisted `brainstorm_messages` row — the user's turn, then the assistant's. */
export const BrainstormMessageEventSchema = z.object({
  message: BrainstormMessageSchema,
});
export type BrainstormMessageEvent = z.infer<typeof BrainstormMessageEventSchema>;

/** Which notes this turn was given, decided before the first token. */
export const BrainstormContextEventSchema = z.object({
  context: BrainstormContextSchema,
});
export type BrainstormContextEvent = z.infer<typeof BrainstormContextEventSchema>;

/** An AI failure reported inside the stream, once the 200 was committed. */
export const BrainstormErrorEventSchema = GenerateErrorEventSchema;
export type BrainstormErrorEvent = z.infer<typeof BrainstormErrorEventSchema>;

/**
 * How much of the thread goes back to the model on each turn.
 *
 * The prompt is rebuilt from scratch every call, so this is the only place
 * conversation length can run away with the context window. Longer than the
 * refine chat's ten: a discussion is the point here rather than one repair,
 * and turns are trimmed from the oldest first whenever the budget overflows
 * anyway.
 */
export const BRAINSTORM_HISTORY_TURNS = 20;

/** The model's whole output: one reply, and nothing else — there is no note to revise. */
export const BrainstormReplySchema = z.strictObject({
  reply: z.string().max(MAX_SECTION_CHARS),
});
export type BrainstormReply = z.infer<typeof BrainstormReplySchema>;

/** The `format` payload for a brainstorm call: one string field, `reply`. */
export function brainstormJsonSchema(): JsonSchemaObject {
  return {
    type: 'object',
    properties: {
      reply: { type: 'string' },
    },
    required: ['reply'],
    additionalProperties: false,
  };
}

import { z } from 'zod';

import { IdSchema, MAX_BODY_CHARS, optionalText, TimestampSchema } from './common.js';

export const ChatRoleSchema = z.enum(['user', 'assistant']);
export type ChatRole = z.infer<typeof ChatRoleSchema>;

/**
 * One turn of the "Refine with AI" thread attached to a note. `ref_quote` is
 * the excerpt the user highlighted before sending. The chat route itself is
 * M4; M1 only owns the table and its repository (and the cascade from notes).
 */
export const ChatMessageSchema = z.object({
  id: IdSchema,
  note_id: IdSchema,
  role: ChatRoleSchema,
  text: z.string(),
  ref_quote: z.string().nullable(),
  created_at: TimestampSchema,
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const CreateChatMessageInputSchema = z.object({
  note_id: IdSchema,
  role: ChatRoleSchema,
  text: optionalText(MAX_BODY_CHARS),
  ref_quote: z.string().max(MAX_BODY_CHARS).nullish(),
});
export type CreateChatMessageInput = z.infer<typeof CreateChatMessageInputSchema>;

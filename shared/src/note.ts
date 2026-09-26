import { z } from 'zod';

import { boundedText, IdSchema, MAX_BODY_CHARS, optionalText, TimestampSchema } from './common.js';
import { LocaleSchema } from './i18n/locales.js';

/** A published note is locked: its body may not change until it is unpublished. */
export const NoteStatusSchema = z.enum(['draft', 'published']);
export type NoteStatus = z.infer<typeof NoteStatusSchema>;

export const NoteSchema = z.object({
  id: IdSchema,
  patient_id: IdSchema,
  format_id: IdSchema,
  title: z.string(),
  status: NoteStatusSchema,
  /** Monotonic row revision, required as the optimistic-write precondition. */
  revision: z.number().int().nonnegative(),
  /** Exactly what the editor shows: `Section: body` paragraphs (PLAN §3). */
  content: z.string(),
  /**
   * The language this note is written in (C-LANG@1 rule 3) — its format's
   * locale at creation, and the locale a refine works in whatever language the
   * request was typed in. Required, because the column is `NOT NULL`.
   */
  locale: LocaleSchema,
  created_at: TimestampSchema,
  updated_at: TimestampSchema,
  published_at: TimestampSchema.nullable(),
});
export type Note = z.infer<typeof NoteSchema>;

export const NoteListResponseSchema = z.object({
  notes: z.array(NoteSchema),
});
export type NoteListResponse = z.infer<typeof NoteListResponseSchema>;

/**
 * Manual note creation. M3 adds `POST /api/generate`, which drafts the
 * content with the LLM and then persists a note through the same repository.
 */
export const CreateNoteRequestSchema = z.object({
  patient_id: IdSchema,
  format_id: IdSchema,
  /** Defaults to the format's name, matching the prototype's note titles. */
  title: boundedText(200).optional(),
  content: optionalText(MAX_BODY_CHARS).optional(),
});
export type CreateNoteRequest = z.infer<typeof CreateNoteRequestSchema>;
export const UpdateNoteRequestSchema = z
  .object({
    /** Revision read with the note; the server refuses stale writes. */
    revision: z.number().int().nonnegative(),
    title: boundedText(200).optional(),
    content: optionalText(MAX_BODY_CHARS).optional(),
  })
  .refine((body) => Object.keys(body).some((key) => key !== 'revision'), {
    message: 'Provide at least one field to update',
  });
export type UpdateNoteRequest = z.infer<typeof UpdateNoteRequestSchema>;

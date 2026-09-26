import { z } from 'zod';

import { boundedText, IdSchema, optionalText, TimestampSchema } from './common.js';
import { LocaleSchema } from './i18n/locales.js';

/** How a format was defined — see `prototype/onboarding-format.html`. */
export const FormatSourceSchema = z.enum(['template', 'examples', 'manual']);
export type FormatSource = z.infer<typeof FormatSourceSchema>;

/**
 * Section names are the keys of the sections object the LLM must fill in
 * (PLAN §3, "Note content contract"), so they have to be unique.
 */
export const SectionsSchema = z
  .array(boundedText(120))
  .min(1)
  .max(40)
  .refine((sections) => new Set(sections.map((s) => s.toLowerCase())).size === sections.length, {
    message: 'Section names must be unique',
  });

/**
 * The owner's own progress note, and Apunta's default since 2026-09-22
 * (`docs/decisions.md`): what first-run onboarding offers first, what
 * `npm run seed` creates, and the section fingerprint that picks up her
 * drafting instructions for a format saved without any. The instructions
 * themselves are server-only (`server/src/ai/default-instructions.ts`,
 * `OWNER_PROGRESS_INSTRUCTIONS`); the browser never needs their text.
 */
export const STANDARD_PROGRESS_FORMAT = {
  name: 'Progress note',
  sections: [
    'Location',
    'Client presentation',
    'Risk review',
    'Discussion',
    'Intervention',
    'Out of session actions',
    'Note for next session',
  ],
} as const;

export const NoteFormatSchema = z.object({
  id: IdSchema,
  name: z.string(),
  sections: z.array(z.string()),
  /** Flattened prompt for this format; see `docs/skill-porting.md`. Empty = use the default. */
  instructions: z.string(),
  source: FormatSourceSchema,
  /**
   * The language this format is written in (C-LANG@1 rule 3). Required, because
   * the column is `NOT NULL` — a stored format always has one, so an optional
   * field here would be a lie every consumer had to re-check. Changing it is
   * `PATCH /api/formats/:id`; it never relabels the sections already stored.
   */
  locale: LocaleSchema,
  created_at: TimestampSchema,
});
export type NoteFormat = z.infer<typeof NoteFormatSchema>;

export const NoteFormatListResponseSchema = z.object({
  formats: z.array(NoteFormatSchema),
});
export type NoteFormatListResponse = z.infer<typeof NoteFormatListResponseSchema>;

export const CreateNoteFormatRequestSchema = z.object({
  name: boundedText(120),
  sections: SectionsSchema,
  instructions: optionalText(50_000).optional(),
  source: FormatSourceSchema.optional(),
  /**
   * Optional, and absent means English (C-LANG@1 rule 3). A client that names
   * no locale gets `'en'` — the `createFormat` fallback, not a filled-in
   * default, so the parse output stays the body the client sent.
   */
  locale: LocaleSchema.optional(),
});
export type CreateNoteFormatRequest = z.infer<typeof CreateNoteFormatRequestSchema>;

export const UpdateNoteFormatRequestSchema = z
  .object({
    name: boundedText(120).optional(),
    sections: SectionsSchema.optional(),
    instructions: optionalText(50_000).optional(),
    source: FormatSourceSchema.optional(),
    /** How a format's locale is changed: a `PATCH` is partial by definition. */
    locale: LocaleSchema.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Provide at least one field to update',
  });
export type UpdateNoteFormatRequest = z.infer<typeof UpdateNoteFormatRequestSchema>;

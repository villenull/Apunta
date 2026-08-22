import { z } from 'zod';

import { IdSchema, MAX_BODY_CHARS, optionalText, TimestampSchema } from './common.js';

/** Where a transcript came from: a recording (M5) or the typed-note path (M3). */
export const TranscriptSourceSchema = z.enum(['audio', 'typed']);
export type TranscriptSource = z.infer<typeof TranscriptSourceSchema>;

/**
 * The raw input a note was drafted from. No HTTP route writes transcripts in
 * M1 — `POST /api/generate` (M3) and `POST /api/transcribe` (M5) do — but the
 * table and its repository exist now so cascade behavior is settled and tested.
 */
export const TranscriptSchema = z.object({
  id: IdSchema,
  note_id: IdSchema,
  source: TranscriptSourceSchema,
  raw_text: z.string(),
  audio_filename: z.string().nullable(),
  duration_seconds: z.number().nullable(),
  created_at: TimestampSchema,
});
export type Transcript = z.infer<typeof TranscriptSchema>;

export const CreateTranscriptInputSchema = z.object({
  note_id: IdSchema,
  source: TranscriptSourceSchema,
  raw_text: optionalText(MAX_BODY_CHARS),
  audio_filename: z.string().max(500).nullish(),
  duration_seconds: z.number().nonnegative().nullish(),
});
export type CreateTranscriptInput = z.infer<typeof CreateTranscriptInputSchema>;

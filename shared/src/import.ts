import { z } from 'zod';

import { IdSchema, MAX_BODY_CHARS } from './common.js';

/**
 * Importing her Claude conversations (M11, `docs/agents/M11-claude-import.md`).
 *
 * Everything here is a *proposal*. The server reads the export she uploads,
 * keeps nothing, and answers with what it found; the screen lets her accept,
 * discard or rename; only what she accepts is written, through the accept
 * request below, as ordinary patients and notes with their provenance kept.
 * The model is never involved: a proposal's body is her own `human` turns,
 * verbatim, and the assistant's turns travel separately, never as the
 * default.
 */

/** A generous ceiling for the upload: a busy year of conversations is tens of megabytes. */
export const MAX_IMPORT_BYTES = 256 * 1024 * 1024;

/** One conversation from the export, reduced to what a proposal needs. */
export const ImportedConversationSchema = z.object({
  /** The export's own identifier, so an imported note can always name its source. */
  id: z.string().min(1),
  /** The conversation's name in the export; often empty or auto-generated. */
  title: z.string(),
  /** When she talked to Claude — labelled *recorded*, never a session date. */
  recorded_at: z.string().nullable(),
  /** Her turns, in order. The only text a note is ever built from. */
  human_text: z.string(),
  /** The assistant's turns, shown beside a proposal and never its body by default. */
  assistant_text: z.string(),
  /** Candidate names this conversation mentions, from `candidates`. */
  people: z.array(z.string()),
  turns: z.number().int().nonnegative(),
});
export type ImportedConversation = z.infer<typeof ImportedConversationSchema>;

/**
 * A person the conversations may be about. In order of trust: a patient she
 * has already entered (matched by name), then a recurring proper noun offered
 * as a *possible* person — and never anything a model inferred.
 */
export const ImportCandidateSchema = z.object({
  name: z.string().min(1),
  conversations: z.number().int().nonnegative(),
  /** The existing patient this name matched, if any. */
  patient_id: IdSchema.nullable(),
});
export type ImportCandidate = z.infer<typeof ImportCandidateSchema>;

export const ClaudeImportPreviewSchema = z.object({
  conversations: z.array(ImportedConversationSchema),
  candidates: z.array(ImportCandidateSchema),
  /** Shape only, for the screen's one-line summary of what the archive held. */
  totals: z.object({
    conversations: z.number().int().nonnegative(),
    messages: z.number().int().nonnegative(),
    /** Conversations with no human turn, or that could not be read. */
    skipped: z.number().int().nonnegative(),
  }),
  date_range: z.object({ from: z.string().nullable(), to: z.string().nullable() }),
});
export type ClaudeImportPreview = z.infer<typeof ClaudeImportPreviewSchema>;

/** One accepted proposal: a note for a patient who exists or is to be created. */
export const ClaudeImportAcceptItemSchema = z.object({
  conversation_id: z.string().min(1).max(200),
  /** An existing patient, or null to create `patient_name`. */
  patient_id: IdSchema.nullable(),
  patient_name: z.string().trim().min(1).max(200),
  title: z.string().trim().max(200),
  recorded_at: z.string().nullable(),
  /** The body she accepted — her words, possibly trimmed by her. */
  text: z.string().trim().min(1).max(MAX_BODY_CHARS),
});
export type ClaudeImportAcceptItem = z.infer<typeof ClaudeImportAcceptItemSchema>;

export const ClaudeImportAcceptRequestSchema = z.object({
  items: z.array(ClaudeImportAcceptItemSchema).min(1).max(1000),
});
export type ClaudeImportAcceptRequest = z.infer<typeof ClaudeImportAcceptRequestSchema>;

export const ClaudeImportAcceptResponseSchema = z.object({
  patients_created: z.number().int().nonnegative(),
  notes_created: z.number().int().nonnegative(),
  /** Every patient the accepted notes landed on, existing or new. */
  patient_ids: z.array(IdSchema),
});
export type ClaudeImportAcceptResponse = z.infer<typeof ClaudeImportAcceptResponseSchema>;

/** The title an imported note gets when the conversation had none worth keeping. */
export function importedNoteTitle(title: string, recordedAt: string | null): string {
  const trimmed = title.trim();
  if (trimmed !== '' && !/^untitled$/i.test(trimmed)) return trimmed.slice(0, 200);
  const day = recordedAt === null ? '' : recordedAt.slice(0, 10);
  return day === '' ? 'Imported conversation' : `Imported conversation, ${day}`;
}

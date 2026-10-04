import { z } from 'zod';

import { IdSchema, instantToLocalDay } from './common.js';
import { DEFAULT_LOCALE, type Locale } from './i18n/locales.js';
import { t } from './i18n/t.js';

/**
 * Importing her Claude conversations (M11, `docs/agents/M11-claude-import.md`).
 *
 * The owner chose an automatic import over per-note review (2026-09-21): she
 * keeps one long conversation per patient, drafted her notes *with* Claude,
 * and reviewing some twenty-five long histories note by note was not going
 * to happen. So the server splits each conversation into sessions, keeps
 * the ones that look like a patient she has seen since a cutoff date, names
 * each from her optional list or the conversation's title, and one button
 * writes the result. What keeps that safe costs her no time:
 *
 * - every note is an ordinary **draft**, marked as imported by its
 *   transcript row of source `import`, which names the conversation, the
 *   session and its message ids;
 * - every run is a **batch** that one button undoes;
 * - a session already imported is **skipped**, so running it twice writes
 *   nothing twice;
 * - a conversation is imported only when it clears every test —
 *   activity since the cutoff, more than one session, Claude's replies
 *   shaped like clinical notes, a confident name — and skipping beats
 *   guessing; a name guessed from a title is flagged until she edits it.
 *
 * The export itself is uploaded for each request, read in memory and kept
 * nowhere; the preview and the run are the same computation, and only the
 * run writes.
 */

/** A generous ceiling for the upload: a busy year of conversations is tens of megabytes. */
export const MAX_IMPORT_BYTES = 256 * 1024 * 1024;

/** Enough for any practice; the list is typed by hand, one name per line. */
export const MAX_IMPORT_PATIENTS = 200;

/**
 * Which side of a session becomes the note: Claude's last reply in the
 * session (her latest accepted draft — the default, because that is how she
 * wrote her notes), her own messages in order, or a published Halaxy PDF note.
 */
export const ImportNoteSourceSchema = z.enum(['assistant', 'human', 'halaxy']);
export type ImportNoteSource = z.infer<typeof ImportNoteSourceSchema>;

/** Her list, one name per line: blank lines and repeats (case-insensitively) dropped. */
export function parsePatientList(text: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const name = line.trim().replace(/\s+/g, ' ');
    if (name === '' || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    names.push(name.slice(0, 200));
  }
  return names;
}

/**
 * The default cutoff: a patient is imported when she has seen them since
 * this day — at least one session on or after it — and then with their whole
 * history. The owner's choice (2026-09-21); the screen lets her move it.
 */
export const DEFAULT_IMPORT_CUTOFF = '2026-07-01';

export const ImportCutoffSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-07-01.');

/** Why a conversation was left out. Shown as a reason with a date and a count, never with its title or text. */
export const ImportSkipReasonSchema = z.enum([
  /** Its last session is before the cutoff: not someone she has seen lately. */
  'before_cutoff',
  /** One sitting only. Her patients are each one long conversation she came back to. */
  'single_session',
  /** Claude's replies never looked like a clinical note. */
  'not_clinical',
  /** No patient name could be told with confidence. */
  'no_name',
  /** Two or more names from her list, and none clearly dominates. */
  'ambiguous',
  /** She unticked this patient in the summary. */
  'excluded',
]);
export type ImportSkipReason = z.infer<typeof ImportSkipReasonSchema>;

export const ImportSkippedConversationSchema = z.object({
  reason: ImportSkipReasonSchema,
  /** When the conversation started — labelled *recorded*, as ever. */
  recorded_at: z.string().nullable(),
  /** Its latest message. */
  last_at: z.string().nullable(),
  messages: z.number().int().nonnegative(),
  sessions: z.number().int().nonnegative(),
});
export type ImportSkippedConversation = z.infer<typeof ImportSkippedConversationSchema>;

/**
 * Where a patient's name came from, most trusted first: a patient the
 * conversation was already imported to, her list, a patient already in
 * Apunta with exactly the name the title gives, or a guess from the title
 * alone — which is flagged "name guessed — check" until she edits it.
 */
export const ImportNameSourceSchema = z.enum(['previous', 'list', 'existing', 'title']);
export type ImportNameSource = z.infer<typeof ImportNameSourceSchema>;

export const ImportPatientPlanSchema = z.object({
  /** Stable within one export, so the run can leave out what she unticked. */
  key: z.string().min(1),
  name: z.string().min(1),
  source: ImportNameSourceSchema,
  /** The existing patient; null when the run creates them. */
  patient_id: IdSchema.nullable(),
  /** Explicit choice from the review screen; omitted uses the safe name match. */
  existingPatientId: IdSchema.nullable().optional(),
  /** True when the run creates this patient from a title guess, so the name must be checked. */
  name_guessed: z.boolean(),
  /** Conversations assigned to this patient. */
  conversations: z.number().int().nonnegative(),
  /** Notes this run writes (or wrote) for this patient. */
  notes: z.number().int().nonnegative(),
});
export type ImportPatientPlan = z.infer<typeof ImportPatientPlanSchema>;

/**
 * What an import would do (the preview) or did (the run): the same shape, so
 * the summary she glanced at before pressing the button is the report she
 * gets after it. Patient names are shown — hers, or guessed from titles, for
 * her to untick — but no conversation title or text ever is.
 */
export const ClaudeImportReportSchema = z.object({
  /** Null on a preview; the id `undo` takes after a run. */
  batch_id: IdSchema.nullable(),
  source: ImportNoteSourceSchema,
  cutoff: ImportCutoffSchema,
  patients: z.array(ImportPatientPlanSchema),
  patients_to_create: z.number().int().nonnegative(),
  notes: z.number().int().nonnegative(),
  /** Names from her list that no qualifying conversation matched. */
  unmatched_names: z.array(z.string()),
  /** Sessions skipped because an earlier run already imported them. */
  already_imported: z.number().int().nonnegative(),
  /** Sessions with nothing on the chosen side — no reply from Claude, say. */
  sessions_without_body: z.number().int().nonnegative(),
  skipped: z.array(ImportSkippedConversationSchema),
  totals: z.object({
    conversations: z.number().int().nonnegative(),
    messages: z.number().int().nonnegative(),
    /** Conversations with nothing readable in them. */
    unreadable: z.number().int().nonnegative(),
    /** Messages on branches she abandoned by editing or regenerating; never imported. */
    abandoned: z.number().int().nonnegative(),
    /** Attached files in the imported sessions; never imported, counted so they are not lost silently. */
    attachments: z.number().int().nonnegative(),
  }),
  date_range: z.object({ from: z.string().nullable(), to: z.string().nullable() }),
});
export type ClaudeImportReport = z.infer<typeof ClaudeImportReportSchema>;

/** One past run, for the undo list. */
export const ImportBatchSchema = z.object({
  id: IdSchema,
  source: ImportNoteSourceSchema,
  created_at: z.string(),
  /** Notes from this run still in Apunta. */
  notes: z.number().int().nonnegative(),
  /** Patients this run created that still exist. */
  patients: z.number().int().nonnegative(),
});
export type ImportBatch = z.infer<typeof ImportBatchSchema>;

export const ImportBatchListResponseSchema = z.object({ batches: z.array(ImportBatchSchema) });
export type ImportBatchListResponse = z.infer<typeof ImportBatchListResponseSchema>;

export const ImportUndoResponseSchema = z.object({
  notes_deleted: z.number().int().nonnegative(),
  patients_deleted: z.number().int().nonnegative(),
  /** Notes she has since finalized: a finalized record is hers now, and undo leaves it. */
  notes_kept: z.number().int().nonnegative(),
  /** Created patients kept because something else is now attached to them. */
  patients_kept: z.number().int().nonnegative(),
});
export type ImportUndoResponse = z.infer<typeof ImportUndoResponseSchema>;

/**
 * An imported note's title: the day it was recorded, so a patient's list reads
 * as a history.
 *
 * The sentence is a catalogue key, not a literal, and the day travels as
 * `{date}` unformatted: a session's date is a fact about her record — the day
 * she sat down with it — so it stays the plain `YYYY-MM-DD` the import stored
 * rather than a date dressed up in the reader's language. English is
 * byte-identical to what this returned before it was localized.
 */
export function importedNoteTitle(recordedAt: string | null, locale: Locale = DEFAULT_LOCALE): string {
  const day = recordedAt === null ? '' : instantToLocalDay(recordedAt);
  return day === ''
    ? t('import.fallbackTitleUndated', {}, locale)
    : t('import.fallbackTitle', { date: day }, locale);
}

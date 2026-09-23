import { z } from 'zod';

/**
 * Building blocks shared by every entity schema.
 *
 * Field names mirror the SQLite column names from `docs/PLAN.md` §3
 * (snake_case) so a row maps to an API object without a translation layer.
 */

/** UUIDv7, generated server-side. */
export const IdSchema = z.uuid();

/** UTC ISO-8601, e.g. `2026-08-22T09:30:00.000Z`. */
export const TimestampSchema = z.iso.datetime();

/** A user-supplied name/title: trimmed, non-empty, bounded. */
export function boundedText(max: number): z.ZodString {
  return z.string().trim().min(1).max(max);
}

/** Free text that may legitimately be empty (note bodies, instructions). */
export function optionalText(max: number): z.ZodString {
  return z.string().max(max);
}

/** Longest note/transcript body we accept. Generous, but not unbounded. */
export const MAX_BODY_CHARS = 200_000;
/**
 * Return the calendar day on which an instant occurs in the machine's local
 * timezone. Never derive a local day by slicing an ISO string: ISO timestamps
 * are UTC, so evening sessions west of Greenwich would be assigned tomorrow.
 */
export function instantToLocalDay(instant: string | Date): string {
  const date = typeof instant === 'string' ? new Date(instant) : instant;
  if (Number.isNaN(date.getTime())) return typeof instant === 'string' ? instant : '';
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Keep a value that is already a calendar date in its original timezone. */
export function calendarDay(value: string): string {
  return value;
}

/**
 * A rough token count, used to refuse an over-long prompt rather than let
 * Ollama silently truncate it (which would drop the anti-fabrication rules and
 * keep the patient material). ~3.5 characters per token is the usual ratio for
 * English prose; it does not need to be exact, only conservative.
 *
 * It lives in `shared/` because the browser needs the same number: M6's
 * Instructions panel shows a budget meter beside the textarea, and a meter
 * that disagreed with the server's own refusal threshold would be worse than
 * no meter.
 */
export function approximateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

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

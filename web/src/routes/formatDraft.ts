import { FormatSourceSchema, type FormatSource } from '@apunta/shared';

/**
 * What `/onboarding/format` hands to `/onboarding/preview` (and what Settings
 * hands it when editing an existing format).
 *
 * It travels in the router's location state rather than the query string: a
 * section list is not a URL, and the preview screen is a confirmation step,
 * not something to deep-link into.
 */
export interface FormatDraft {
  name: string;
  sections: string[];
  /** Where to go once the format is saved. */
  returnTo: string;
  /** Set when editing an existing format instead of creating one. */
  formatId?: string;
  /** How the sections were arrived at, recorded on the saved format. */
  source?: FormatSource;
  /** Detection read only the head of an uploaded file; the screen says so. */
  truncated?: boolean;
  /** Set when editing: the format's saved drafting instructions. */
  instructions?: string;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

/** Location state is `unknown` — a reload or a hand-typed URL carries none. */
export function asFormatDraft(value: unknown): FormatDraft | null {
  if (typeof value !== 'object' || value === null) return null;
  const draft = value as Record<string, unknown>;
  if (typeof draft['name'] !== 'string') return null;
  if (!isStringArray(draft['sections'])) return null;
  if (typeof draft['returnTo'] !== 'string') return null;
  if (draft['formatId'] !== undefined && typeof draft['formatId'] !== 'string') return null;

  const source = FormatSourceSchema.safeParse(draft['source']);

  return {
    name: draft['name'],
    sections: draft['sections'],
    returnTo: draft['returnTo'],
    ...(typeof draft['formatId'] === 'string' ? { formatId: draft['formatId'] } : {}),
    ...(source.success ? { source: source.data } : {}),
    ...(draft['truncated'] === true ? { truncated: true } : {}),
    ...(typeof draft['instructions'] === 'string' ? { instructions: draft['instructions'] } : {}),
  };
}

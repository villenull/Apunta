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

  return {
    name: draft['name'],
    sections: draft['sections'],
    returnTo: draft['returnTo'],
    ...(typeof draft['formatId'] === 'string' ? { formatId: draft['formatId'] } : {}),
  };
}

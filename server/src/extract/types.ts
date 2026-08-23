/**
 * Text extraction for format onboarding (M6 deliverable 1).
 *
 * The one rule that governs this whole directory: **an uploaded file is a
 * blank workplace template or, worse, a completed clinical note.** It lives in
 * memory for one request, is never written to disk, never reaches the
 * database, and its text is never logged — not in an error `detail`, not in a
 * parser warning, not in a stack trace (`docs/research/privacy-audit-2026-08.md`
 * H1). Every failure below is described by a count and a category, and every
 * message is copy the therapist reads.
 */

/** What the bytes turned out to be. */
export type ExtractedKind = 'docx' | 'pdf' | 'text';

export interface Extracted {
  readonly kind: ExtractedKind;
  /** One block per line, blank lines collapsed. Never logged. */
  readonly text: string;
}

/**
 * Why extraction failed. The category is what may be logged; the message that
 * travels with it is content-free copy, so it is safe in an API response.
 */
export type ExtractFailure =
  | 'too_large'
  | 'unsupported_type'
  | 'unreadable_docx'
  | 'encrypted_pdf'
  | 'corrupt_pdf'
  | 'scanned_pdf'
  | 'undecodable_text'
  | 'empty';

export class ExtractError extends Error {
  readonly reason: ExtractFailure;

  constructor(reason: ExtractFailure, message: string) {
    super(message);
    this.name = 'ExtractError';
    this.reason = reason;
  }
}

/**
 * Every failure offers the same way out — "Describe it myself" is one click
 * away on the screen behind this and is the only path that cannot fail — so
 * the copy names the fix rather than apologising.
 */
export function extractError(reason: ExtractFailure, message: string): ExtractError {
  return new ExtractError(reason, message);
}

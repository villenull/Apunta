import { extractText, getDocumentProxy } from 'unpdf';

import { extractError } from './types.js';

/**
 * `.pdf` → text, via `unpdf` (MIT, zero runtime dependencies, a serverless
 * build of pdf.js with its worker inlined). Library choice and the rejected
 * alternatives are in `docs/decisions.md`.
 *
 * Two things are set deliberately:
 *
 * - `verbosity: 0` (pdf.js `VerbosityLevel.ERRORS`). The default is WARNINGS,
 *   and pdf.js's font and structure warnings go to the console naming fonts
 *   and objects out of the document being read. On this path that document is
 *   a clinical note.
 * - Nothing configures a font or CMap URL. `unpdf` resolves those from an
 *   installed `pdfjs-dist`, which we deliberately do not depend on, so it
 *   skips them — no filesystem lookup and, more to the point, no fetch. The
 *   egress guard is asserted over this path in the tests rather than assumed.
 */

/**
 * Fewer than this many characters per page means the pages are pictures. The
 * dangerous upload is a scan or a print-to-image, and Apunta does no OCR: a
 * page of a letterhead's worth of stray text must still read as a scan.
 */
const MIN_CHARS_PER_PAGE = 40;

/** Above this share of replacement characters the text came out as mojibake. */
const MAX_REPLACEMENT_RATIO = 0.1;

export async function extractPdf(buffer: Buffer): Promise<string> {
  let text: string;
  let totalPages: number;
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer), { verbosity: 0 });
    const result = await extractText(pdf, { mergePages: true });
    text = result.text;
    totalPages = result.totalPages;
  } catch (error) {
    // pdf.js exports these as named classes; `name` survives bundling where
    // `instanceof` across a dynamic import would be fragile.
    const name = error instanceof Error ? error.name : '';
    if (name === 'PasswordException') {
      throw extractError('encrypted_pdf', 'That PDF is password-protected.');
    }
    throw extractError('corrupt_pdf', "Apunta couldn't open that PDF — it may be damaged.");
  }

  const replacements = (text.match(/�/g) ?? []).length;
  if (text.length > 0 && replacements / text.length > MAX_REPLACEMENT_RATIO) {
    throw extractError('corrupt_pdf', "Apunta could open that PDF but couldn't read the text out of it.");
  }

  if (text.trim().length / Math.max(totalPages, 1) < MIN_CHARS_PER_PAGE) {
    throw extractError(
      'scanned_pdf',
      "This PDF looks like a scan — the pages are pictures, not text, and Apunta can't read text out of a picture. You could type the section names instead.",
    );
  }

  return text;
}

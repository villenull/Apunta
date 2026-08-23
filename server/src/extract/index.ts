import { MAX_UPLOAD_BYTES, MIN_EXTRACTED_CHARS } from '@apunta/shared';

import { extractDocx } from './docx.js';
import { extractPdf } from './pdf.js';
import { sniff, type Sniffed } from './sniff.js';
import { extractPlainText } from './text.js';
import { extractError, type Extracted, type ExtractedKind } from './types.js';

export { ExtractError, extractError } from './types.js';
export type { Extracted, ExtractedKind, ExtractFailure } from './types.js';
export { sniff } from './sniff.js';

/**
 * Copy for the types Apunta deliberately does not read.
 *
 * Every one of these is one rare case, a parser liability, and a two-click
 * user-side fix — so the answer is instructions, not a second parser.
 * `textutil -convert` would handle most of them in one line and is off the
 * table: CLAUDE.md hard rule 4 keeps server logic OS-portable and confines
 * macOS assumptions to `scripts/`.
 */
const REJECTED: Partial<Record<Sniffed, string>> = {
  rtf: "Apunta can't read .rtf files. Open it in Word or TextEdit and choose File → Save As → Word (.docx), then try again.",
  ole: 'That looks like an older Word document (.doc). Open it in Word and choose File → Save As → Word (.docx), then try again.',
  pages: 'That’s an Apple Pages document. In Pages, choose File → Export To → Word, then upload the .docx.',
  image:
    "That's a picture. Apunta can't read text out of an image — it does no OCR. You could type the section names instead.",
  zip: "Apunta can't read that file. Upload a Word document (.docx), a PDF, or a plain text file.",
};

/** Collapse runs of blank lines and trailing spaces so lines are lines. */
function tidy(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Bytes → text, or a content-free {@link ExtractError} naming what to do
 * instead. The buffer is never written anywhere; the caller holds it for the
 * length of one request.
 */
export async function extractDocument(buffer: Buffer): Promise<Extracted> {
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw extractError(
      'too_large',
      "That file is larger than 10 MB. If it's a scan, Apunta can't read it anyway — it does no OCR.",
    );
  }
  if (buffer.length === 0) throw extractError('empty', 'That file came out empty.');

  const sniffed = sniff(buffer);
  const rejection = REJECTED[sniffed];
  if (rejection !== undefined) throw extractError('unsupported_type', rejection);

  let kind: ExtractedKind;
  let raw: string;
  if (sniffed === 'docx') {
    kind = 'docx';
    raw = await extractDocx(buffer);
  } else if (sniffed === 'pdf') {
    kind = 'pdf';
    raw = await extractPdf(buffer);
  } else {
    kind = 'text';
    raw = extractPlainText(buffer);
  }

  const text = tidy(raw);
  if (text.length < MIN_EXTRACTED_CHARS) {
    throw extractError('empty', 'That file came out empty — there was no text in it to read.');
  }
  return { kind, text };
}

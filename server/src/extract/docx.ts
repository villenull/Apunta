import mammoth from 'mammoth';

import { extractError } from './types.js';

/**
 * `.docx` → text, via `mammoth.extractRawText`.
 *
 * `docs/research/m6-detection-design-2026-08.md` §1.3 recommends deviating
 * from the packet and reading mammoth's document AST through
 * `transformDocument`, on the grounds that raw text destroys the line
 * structure a two-column table template carries. Measured against the
 * fixtures next door, that is not what mammoth does: `extractRawText` emits
 * every paragraph — including each table cell's paragraph — on its own line,
 * so `Presenting problem` in the left cell of a blank-form template comes out
 * as its own line exactly as it does in a heading-styled one. The structure
 * detection needs survives. What raw text drops is *which* lines were
 * headings, and nothing in this packet's pipeline reads that: the text goes
 * to `detectFormat` whole. So the packet's own choice stands, and the
 * measurement rather than the recommendation is what is recorded in
 * `docs/decisions.md`.
 */
export async function extractDocx(buffer: Buffer): Promise<string> {
  let result: { value: string; messages: readonly unknown[] };
  try {
    result = await mammoth.extractRawText({ buffer });
  } catch {
    // Never the thrown error: mammoth quotes document content in some of its
    // messages, and this document is a clinical note.
    throw extractError('unreadable_docx', "Apunta couldn't read that Word document.");
  }
  return result.value;
}

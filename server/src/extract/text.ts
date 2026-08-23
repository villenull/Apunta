import { extractError } from './types.js';

/**
 * `.txt` / `.md` → text.
 *
 * Markdown is deliberately **not** parsed. `# Subjective` is a line that
 * reads as a heading to a language model exactly as it stands, and a markdown
 * parser here would be a dependency bought to delete four characters.
 */
export function extractPlainText(buffer: Buffer): string {
  let decoded: string;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    throw extractError(
      'undecodable_text',
      "Apunta couldn't read that file as text. Save it as UTF-8, or upload a Word document or PDF instead.",
    );
  }
  // Strip a BOM; normalise CRLF and lone CR so line rules see one newline.
  return decoded.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

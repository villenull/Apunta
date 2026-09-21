/**
 * A short label at the start of a line — `Location: Online`,
 * `Risk review: None`, a format's own `Plan:` — which the note editor shows in
 * bold.
 *
 * One definition, used twice: the Claude import turns a Markdown heading or a
 * bold-only line into this shape (`server/src/import/markdown.ts`), and the
 * editor recognises it (`web/src/lib/markers.ts`). A label is deliberately
 * narrow — it starts with a letter, runs at most `MAX_LABEL_CHARS`, holds no
 * sentence punctuation, and its colon is followed by a space or the end of
 * the line — so a time (`10:30`), a link (`https://…`) or a sentence with a
 * colon in it ("She said it plainly. Then: …") never turns bold.
 */
export const MAX_LABEL_CHARS = 40;

const LABEL_BODY = `\\p{L}[\\p{L}\\p{N} /&()'’-]{0,${String(MAX_LABEL_CHARS - 1)}}`;

/** The whole of a label's text, without its colon. */
const LABEL_TEXT = new RegExp(`^${LABEL_BODY}$`, 'u');

/** An optional bullet, then the label and its colon. */
const LEADING_LABEL = new RegExp(`^(\\s*(?:[-•]\\s+)?)(${LABEL_BODY}:)(?=\\s|$)`, 'u');

/** True when `text` could stand as a label (no colon, no sentence punctuation). */
export function isLabelText(text: string): boolean {
  return LABEL_TEXT.test(text) && !/\s$/.test(text);
}

/**
 * The label at the start of `line`, colon included, and whatever precedes it
 * (indentation, a bullet). Null when the line does not start with one.
 */
export function leadingLabel(line: string): { readonly prefix: string; readonly label: string } | null {
  const match = LEADING_LABEL.exec(line);
  if (!match) return null;
  const label = match[2] ?? '';
  if (/\s:$/.test(label)) return null;
  return { prefix: match[1] ?? '', label };
}

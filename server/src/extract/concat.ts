import { MAX_DETECT_CHARS, type DetectKind } from '@apunta/shared';

export interface ConcatenatedInput {
  readonly text: string;
  /** True when the budget cut at least one file short. The UI says so. */
  readonly truncated: boolean;
}

/**
 * The extracted files, joined into the one string `detectFormat` is given.
 *
 * Two things are deliberate.
 *
 * **The labels.** For `examples` each file is announced as `Note 1`, `Note 2`
 * — the packet's "labelled per file". Without them, three notes concatenated
 * read as one long note with the same headings repeated, and "the sections
 * these notes share" is a question about documents the model can no longer
 * tell apart.
 *
 * **The cap, and which end it cuts.** Ollama truncates an over-long prompt
 * from the *head*: the instructions go and the material stays, and the answer
 * comes back confident with nothing in it to show what happened. Three long
 * example notes would reach that on their own. So the budget is spent here,
 * evenly across the files, cutting each at the tail — sections repeat down a
 * note, so its head is the part that carries the structure — and the caller
 * reports `truncated` rather than quietly returning less than was uploaded.
 */
export function concatenateForDetection(kind: DetectKind, texts: readonly string[]): ConcatenatedInput {
  const budget = Math.floor(MAX_DETECT_CHARS / Math.max(texts.length, 1));
  let truncated = false;

  const parts = texts.map((text, index) => {
    let body = text;
    if (body.length > budget) {
      body = body.slice(0, budget);
      truncated = true;
    }
    if (kind === 'examples') return `--- Note ${String(index + 1)} ---\n${body}`;
    return texts.length > 1 ? `--- File ${String(index + 1)} ---\n${body}` : body;
  });

  return { text: parts.join('\n\n'), truncated };
}

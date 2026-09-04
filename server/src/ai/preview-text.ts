/**
 * Tidying for the live preview's text, and nothing else's.
 *
 * Whisper's decoder loops on a short clip when its context is tight — "And so
 * my fellow. And so my fellow. And so my fellow." — and the preview runs on a
 * fitted context by design (`whisper.ts`), so the loop is a possibility the
 * screen has to be ready for even with the context sized to avoid it. A
 * preview that stutters a phrase a dozen times is not reassurance. This
 * collapses an immediately repeated run of words to one. It is applied only
 * to the preview: the transcript that becomes a note is never edited by a
 * heuristic, and a genuine "no, no, no" in a session is hers to keep.
 */

/** The longest phrase checked for repeats; a loop is rarely longer. */
const MAX_PHRASE_WORDS = 10;

/** A word for comparison: lowercased, without the punctuation whisper attaches. */
function key(word: string): string {
  return word.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');
}

/**
 * Collapse consecutive repeats of any phrase up to `MAX_PHRASE_WORDS` long.
 * A single word has to repeat three times before it counts ("very very" is
 * speech; "oh, oh, oh, oh" is a loop); a phrase of two or more words counts
 * from its first repeat. The first occurrence keeps its punctuation.
 */
export function collapseRepeats(text: string): string {
  const words = text.split(/\s+/).filter((word) => word !== '');
  const keys = words.map(key);

  for (let n = MAX_PHRASE_WORDS; n >= 1; n -= 1) {
    let i = 0;
    while (i + n <= words.length) {
      let repeats = 0;
      while (i + (repeats + 2) * n <= words.length && sameRun(keys, i, i + (repeats + 1) * n, n))
        repeats += 1;
      const threshold = n === 1 ? 2 : 1;
      if (repeats >= threshold) {
        words.splice(i + n, repeats * n);
        keys.splice(i + n, repeats * n);
      }
      i += 1;
    }
  }

  return words.join(' ');
}

function sameRun(keys: readonly string[], a: number, b: number, n: number): boolean {
  for (let k = 0; k < n; k += 1) {
    const left = keys[a + k];
    if (left === '' || left !== keys[b + k]) return false;
  }
  return true;
}

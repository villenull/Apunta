/**
 * Spelling, checked in the tab (2026-09-07).
 *
 * The note editor used to lean on the browser's own checker. Two reasons it
 * no longer does: whether it runs at all is a per-browser setting, and
 * Chrome's "enhanced" mode sends what she types to Google — a setting the app
 * cannot see, on text that is a patient's. So the check is done in the tab
 * against a bundled dictionary (`web/src/lib/speller.ts`), and the browser's
 * checker is switched off on the note body.
 *
 * What lives here is the one setting the feature writes: the words she has
 * added to the dictionary from the editor's "Add to dictionary".
 */

/** A JSON array of words she has told the checker to accept. */
export const SPELLING_WORDS_SETTING = 'spelling_words';

export const MAX_SPELLING_WORDS = 1000;
export const MAX_SPELLING_WORD_CHARS = 60;

/** The setting's value, read defensively: settings rows are free-form JSON. */
export function spellingWordsFrom(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const words: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const word = entry.trim();
    if (word === '' || word.length > MAX_SPELLING_WORD_CHARS) continue;
    if (!words.includes(word)) words.push(word);
    if (words.length === MAX_SPELLING_WORDS) break;
  }
  return words;
}

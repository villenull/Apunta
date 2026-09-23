import { useEffect, useMemo, useState } from 'react';

import { useSpellingContext } from '../components/SpellingProvider.js';
import { findMisspellings, suggestionsFor, type Misspelling } from '../lib/spelling.js';

/** How long after the last keystroke the text is re-checked. */
const CHECK_DELAY_MS = 250;

export interface SpellingCheck {
  readonly misspellings: readonly Misspelling[];
  readonly suggest: (word: string) => string[];
  readonly addWord: (word: string) => void;
  readonly ignoreWord: (word: string) => void;
}

/**
 * The misspellings in `text`, kept a beat behind her typing so the marks do
 * not flicker under the word she is in the middle of.
 *
 * `allow` is what this text may contain that the dictionary would not know —
 * the patient's name, for a note.
 */
export function useSpelling(text: string, allow: readonly string[] = []): SpellingCheck {
  const { speller, accepted, ensureLoaded, addWord, ignoreWord } = useSpellingContext();
  const [misspellings, setMisspellings] = useState<readonly Misspelling[]>([]);

  useEffect(() => {
    ensureLoaded?.();
  }, [ensureLoaded]);

  const allowKey = allow.join('\n');
  const allowed = useMemo(() => {
    const words = new Set(accepted);
    for (const entry of allowKey.split('\n')) {
      for (const match of entry.matchAll(/[A-Za-z]+(?:['’][A-Za-z]+)*/g)) {
        words.add(match[0].replace(/’/g, "'").toLowerCase());
      }
    }
    return words;
  }, [accepted, allowKey]);

  useEffect(() => {
    if (speller === null) {
      setMisspellings([]);
      return;
    }
    const timer = window.setTimeout(() => {
      setMisspellings(findMisspellings(text, speller, allowed));
    }, CHECK_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [text, speller, allowed]);

  const suggest = useMemo(
    () => (word: string) => (speller === null ? [] : suggestionsFor(speller, word)),
    [speller],
  );

  return { misspellings, suggest, addWord, ignoreWord };
}

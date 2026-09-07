import { SPELLING_WORDS_SETTING, spellingWordsFrom, STT_VOCABULARY_SETTING } from '@apunta/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { getSettings, putSettings } from '../api/index.js';
import { loadSpeller } from '../lib/speller.js';
import type { Speller } from '../lib/spelling.js';

/**
 * Everything the spell check needs, once per tab: the dictionary, the words
 * she has added to it, her transcription vocabulary (a name or a medication
 * she taught whisper is a word she spells on purpose), and the words she has
 * asked it to ignore for now.
 *
 * `speller` is null until the dictionary has loaded, and stays null when it
 * cannot: the editor then shows no marks at all, which is the browser
 * checker's behaviour too and interrupts nothing.
 */
export interface Spelling {
  readonly speller: Speller | null;
  /** Lowercased words never flagged: additions, vocabulary, session ignores. */
  readonly accepted: ReadonlySet<string>;
  /** Persist a word as correctly spelled, for every note from now on. */
  readonly addWord: (word: string) => void;
  /** Stop flagging a word until the tab is reloaded. */
  readonly ignoreWord: (word: string) => void;
}

const INERT: Spelling = {
  speller: null,
  accepted: new Set(),
  addWord: () => {},
  ignoreWord: () => {},
};

export const SpellingContext = createContext<Spelling>(INERT);

export function useSpellingContext(): Spelling {
  return useContext(SpellingContext);
}

export function SpellingProvider({
  children,
  load = loadSpeller,
}: {
  readonly children: React.ReactNode;
  /** The dictionary loader; tests hand in a small one. */
  readonly load?: () => Promise<Speller>;
}): React.JSX.Element {
  const [speller, setSpeller] = useState<Speller | null>(null);
  const [added, setAdded] = useState<readonly string[]>([]);
  const [vocabulary, setVocabulary] = useState<readonly string[]>([]);
  const [ignored, setIgnored] = useState<readonly string[]>([]);
  const addedRef = useRef<readonly string[]>([]);
  addedRef.current = added;

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    void load()
      .then((loaded) => {
        if (!cancelled) setSpeller(loaded);
      })
      .catch(() => {
        // No dictionary, no marks. The editor is entirely usable without them.
      });
    void getSettings(controller.signal)
      .then((settings) => {
        if (cancelled) return;
        setAdded(spellingWordsFrom(settings[SPELLING_WORDS_SETTING]));
        const terms = settings[STT_VOCABULARY_SETTING];
        setVocabulary(
          Array.isArray(terms) ? terms.filter((term): term is string => typeof term === 'string') : [],
        );
      })
      .catch(() => {
        // Settings unreachable: the dictionary alone still checks.
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [load]);

  const addWord = useCallback((word: string) => {
    const next = addedRef.current.includes(word) ? addedRef.current : [...addedRef.current, word];
    setAdded(next);
    // Saved for every note from now on; a failure leaves it accepted for this
    // tab, which is the least surprising thing that can happen to a click.
    void putSettings({ [SPELLING_WORDS_SETTING]: [...next] }).catch(() => {});
  }, []);

  const ignoreWord = useCallback((word: string) => {
    setIgnored((current) => (current.includes(word) ? current : [...current, word]));
  }, []);

  const value = useMemo<Spelling>(
    () => ({
      speller,
      accepted: lowercased(added, vocabulary, ignored),
      addWord,
      ignoreWord,
    }),
    [speller, added, vocabulary, ignored, addWord, ignoreWord],
  );

  return <SpellingContext.Provider value={value}>{children}</SpellingContext.Provider>;
}

/** Each word of each entry, lowercased: "Dr Jane Smith" accepts "jane" in a note. */
function lowercased(...lists: readonly (readonly string[])[]): Set<string> {
  const words = new Set<string>();
  for (const list of lists) {
    for (const entry of list) {
      for (const match of entry.matchAll(/[A-Za-z]+(?:['’][A-Za-z]+)*/g)) {
        words.add(match[0].replace(/’/g, "'").toLowerCase());
      }
    }
  }
  return words;
}

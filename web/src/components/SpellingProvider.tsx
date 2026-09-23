import { SPELLING_WORDS_SETTING, spellingWordsFrom, STT_VOCABULARY_SETTING } from '@apunta/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

1: import { putSettings } from '../api/settings.js';
import { useSettingsContext } from './SettingsProvider.js';
import { allowedWords, type Speller } from '../lib/spelling.js';

// The dictionary must remain out of the initial route chunk; load it after a spell surface mounts.
const lazyLoadSpeller = () => import('../lib/speller.js').then(({ loadSpeller }) => loadSpeller());

2:       accepted: allowedWords(added, vocabulary, ignored),
      ensureLoaded,
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
  /** Start loading the dictionary when a spell surface first mounts. */
  readonly ensureLoaded?: () => void;
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
  load = lazyLoadSpeller,
}: {
  readonly children: React.ReactNode;
  /** The dictionary loader; tests hand in a small one. */
  readonly load?: () => Promise<Speller>;
}): React.JSX.Element {
  const { state: settingsState } = useSettingsContext();
  const [speller, setSpeller] = useState<Speller | null>(null);
  const [added, setAdded] = useState<readonly string[]>([]);
  const [vocabulary, setVocabulary] = useState<readonly string[]>([]);
  const [ignored, setIgnored] = useState<readonly string[]>([]);
  const addedRef = useRef<readonly string[]>([]);
  const spellerRef = useRef<Speller | null>(null);
  const loadingRef = useRef(false);
  const mountedRef = useRef(true);
  addedRef.current = added;
  spellerRef.current = speller;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const ensureLoaded = useCallback(() => {
    if (loadingRef.current || spellerRef.current !== null) return;
    loadingRef.current = true;
    void load()
      .then((loaded) => {
        if (mountedRef.current) setSpeller(loaded);
      })
      .catch(() => {
        // No dictionary, no marks. The editor is entirely usable without them.
      });
  }, [load]);

  useEffect(() => {
    if (settingsState.status !== 'ready') return;
    const settings = settingsState.data;
    setAdded(spellingWordsFrom(settings[SPELLING_WORDS_SETTING]));
    const terms = settings[STT_VOCABULARY_SETTING];
    setVocabulary(
      Array.isArray(terms) ? terms.filter((term): term is string => typeof term === 'string') : [],
    );
  }, [settingsState]);

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
1: import { putSettings } from '../api/settings.js';
import { useSettingsContext } from './SettingsProvider.js';
import { allowedWords, type Speller } from '../lib/spelling.js';

// The dictionary must remain out of the initial route chunk; load it after a spell surface mounts.
const lazyLoadSpeller = () => import('../lib/speller.js').then(({ loadSpeller }) => loadSpeller());

2:       accepted: allowedWords(added, vocabulary, ignored),
      ensureLoaded,
      addWord,
      ignoreWord,
    }),
    [speller, added, vocabulary, ignored, ensureLoaded, addWord, ignoreWord],
  );

  return <SpellingContext.Provider value={value}>{children}</SpellingContext.Provider>;
}

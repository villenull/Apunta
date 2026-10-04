import {
  isLanguage,
  spellingWordsFor,
  spellingWordsSettingFor,
  STT_VOCABULARY_SETTING,
  type Locale,
  type MessageKey,
  type Settings,
} from '@apunta/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { putSettings } from '../api/settings.js';
import { useI18n } from '../lib/i18n.js';
import { allowedWords, type Speller } from '../lib/spelling.js';
import { useSettingsContext } from './SettingsProvider.js';

// The dictionary must remain out of the initial route chunk; load it after a spell surface mounts.
const lazyLoadSpeller = (locale: Locale) =>
  import('../lib/speller.js').then(({ loadSpeller }) => loadSpeller(locale));

/**
 * Everything the spell check needs, once per tab: the dictionary, the words
 * she has added to it, her transcription vocabulary (a name or a medication
 * she taught whisper is a word she spells on purpose), and the words she has
 * asked it to ignore for now.
 *
 * `speller` is null until the dictionary has loaded, and stays null when it
 * cannot: the editor then shows no marks at all, which is the browser
 * checker's behaviour too and interrupts nothing. What it does not hide is the
 * failure — `error` carries the catalogue key, and every mounted spell surface
 * shows it (S6.1, D4).
 */
export interface Spelling {
  readonly speller: Speller | null;
  /**
   * The catalogue key to tell her about, or null: set while a load has failed.
   * Required (S6.1, D4.1), so a `Spelling` that forgot it is a `typecheck`
   * error rather than a surface that silently shows no alert. The key union is
   * what makes a typo a `typecheck` failure too.
   */
  readonly error: MessageKey | null;
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
  error: null,
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
  readonly load?: (locale: Locale) => Promise<Speller>;
}): React.JSX.Element {
  const { state: settingsState } = useSettingsContext();
  const { locale } = useI18n();
  const [speller, setSpeller] = useState<Speller | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [added, setAdded] = useState<readonly string[]>([]);
  const [vocabulary, setVocabulary] = useState<readonly string[]>([]);
  const [ignored, setIgnored] = useState<readonly string[]>([]);
  const addedRef = useRef<readonly string[]>([]);
  const spellerRef = useRef<Speller | null>(null);
  const loadingRef = useRef(false);
  /**
   * Whether a spell surface has ever asked for a dictionary in this tab. It is
   * what tells a language change that there is something to re-ask for: the
   * provider is mounted long before any surface is, and it must not start a
   * fetch of its own.
   */
  const requestedRef = useRef(false);
  const mountedRef = useRef(true);
  /**
   * Which load is still allowed to land. Monotonic, incremented on every load
   * start and on every language change (D4.3): a load that resolves after
   * either is stale, and installs nothing — not the dictionary, not the error.
   */
  const loadIdRef = useRef(0);
  /** The language a load was started under, and the language in force now. */
  const localeRef = useRef<Locale>(locale);
  const previousLocaleRef = useRef<Locale>(locale);
  addedRef.current = added;
  spellerRef.current = speller;
  localeRef.current = locale;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const ensureLoaded = useCallback(() => {
    requestedRef.current = true;
    if (loadingRef.current || spellerRef.current !== null) return;
    loadingRef.current = true;
    loadIdRef.current += 1;
    const id = loadIdRef.current;
    void load(localeRef.current)
      .then((loaded) => {
        if (!mountedRef.current || loadIdRef.current !== id) return;
        setSpeller(loaded);
        setError(null);
      })
      .catch(() => {
        // No dictionary, no marks. The editor stays entirely usable, and the
        // mounted surfaces say so rather than failing silently (D4.4).
        if (!mountedRef.current || loadIdRef.current !== id) return;
        setError('spelling.loadFailed');
      });
  }, [load]);

  /**
   * A language change swaps the dictionary before the next load starts: the
   * in-flight load is invalidated, the previous locale's word list is dropped
   * (it belongs to a language that is no longer on screen), and the loaded
   * dictionary goes with it, so the next surface to mount asks for the right
   * one. The settings snapshot is a second, independent read of the same
   * choice, and it is guarded the same way below.
   */
  useEffect(() => {
    if (previousLocaleRef.current === locale) return;
    previousLocaleRef.current = locale;
    loadIdRef.current += 1;
    loadingRef.current = false;
    setError(null);
    setAdded([]);
    // The ref before the state, synchronously: `ensureLoaded` reads it in this
    // very effect, and no render has happened in between to reassign it from
    // `speller`. Clearing only the state left the guard below looking at the
    // previous locale's dictionary, so it returned without asking for the new
    // one and spell check was dead for the rest of the tab.
    spellerRef.current = null;
    setSpeller(null);
    // A surface has already asked, so the new language's pair is what it is
    // waiting for. Without this the tab would be left with no dictionary at
    // all: the switch discards the load that was in flight, and `useSpelling`
    // asks once, when it mounts.
    if (requestedRef.current) ensureLoaded();
  }, [locale, ensureLoaded]);

  useEffect(() => {
    if (settingsState.status !== 'ready') return;
    const settings: Settings = settingsState.data;
    // `stt_vocabulary` is not per language and stays applied in both (D3 rule
    // 4), so it is read from every snapshot the provider is handed; the guard
    // below is about the spelling list only.
    const terms = settings[STT_VOCABULARY_SETTING];
    setVocabulary(
      Array.isArray(terms) ? terms.filter((term): term is string => typeof term === 'string') : [],
    );
    // The language this snapshot was taken under, which is not necessarily the
    // language on screen: a snapshot taken in one language and delivered after
    // a switch must not write into the other one's list (D3).
    const snapshotLanguage = isLanguage(settings.language) ? settings.language : 'en';
    if (snapshotLanguage !== localeRef.current) return;
    setAdded(spellingWordsFor(settings, localeRef.current));
  }, [settingsState]);

  const addWord = useCallback((word: string) => {
    const next = addedRef.current.includes(word) ? addedRef.current : [...addedRef.current, word];
    setAdded(next);
    // Saved for every note from now on; a failure leaves it accepted for this
    // tab, which is the least surprising thing that can happen to a click. The
    // key is the active language's own (D3), so a Spanish word is never
    // written into the English list.
    void putSettings({ [spellingWordsSettingFor(localeRef.current)]: [...next] }).catch(() => {});
  }, []);

  const ignoreWord = useCallback((word: string) => {
    setIgnored((current) => (current.includes(word) ? current : [...current, word]));
  }, []);

  const value = useMemo<Spelling>(
    () => ({
      speller,
      error,
      accepted: allowedWords(added, vocabulary, ignored),
      ensureLoaded,
      addWord,
      ignoreWord,
    }),
    [speller, error, added, vocabulary, ignored, ensureLoaded, addWord, ignoreWord],
  );

  return <SpellingContext.Provider value={value}>{children}</SpellingContext.Provider>;
}

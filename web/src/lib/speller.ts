import nspell from 'nspell';

import { DEFAULT_LOCALE, type Locale } from '@apunta/shared';

import type { Speller } from './spelling.js';

/**
 * The dictionary, loaded once per language per tab from the app's own origin.
 *
 * American English — the practice's spelling ("behavior", "counseling") —
 * as a maintained Hunspell pair from `dictionary-en`, bundled with the app:
 * two files fetched from
 * `127.0.0.1` like any other asset, never from anywhere else, and read by
 * `nspell` entirely in the tab. Nothing typed leaves the machine to be
 * checked, which is the whole reason this exists (`shared/src/spelling.ts`).
 *
 * Español gets the same treatment against `dictionary-es-mx` (S6.1), and which
 * of the two a note is checked against is the active UI language, not the
 * note's own locale: the two are looked up per locale below and nothing else in
 * this file knows about Spanish.
 *
 * The files are addressed relative to this module so that the bundler copies
 * them into the build; the dictionary package itself only exports a Node
 * reader.
 */
const AFF_URL = new URL('../../../node_modules/dictionary-en/index.aff', import.meta.url).href;
const DIC_URL = new URL('../../../node_modules/dictionary-en/index.dic', import.meta.url).href;

/**
 * The Mexican Spanish pair (S6.1, acquisition A11): the `es_MX` Hunspell files
 * from `dictionary-es-mx`, shipped unmodified under their own names and bundled
 * exactly as the English pair is — two files fetched from `127.0.0.1` like any
 * other asset, never from anywhere else, and read by `nspell` entirely in the
 * tab. MPL-1.1, elected by the owner; `docs/decisions.md` and
 * `THIRD-PARTY-LICENSES.md` carry the election.
 *
 * Which pair a note is checked against is the *active UI language*
 * (C-LANG@1's locale table), so an English UI keeps loading English.
 */
const ES_MX_AFF_URL = new URL('../../../node_modules/dictionary-es-mx/index.aff', import.meta.url).href;
const ES_MX_DIC_URL = new URL('../../../node_modules/dictionary-es-mx/index.dic', import.meta.url).href;

const DICTIONARY_URLS: Readonly<Record<Locale, { readonly aff: string; readonly dic: string }>> = {
  en: { aff: AFF_URL, dic: DIC_URL },
  'es-MX': { aff: ES_MX_AFF_URL, dic: ES_MX_DIC_URL },
};

/**
 * One load per locale, for the life of the tab.
 *
 * A cache per locale rather than one shared `pending`, because the two
 * dictionaries are two answers to two different questions and switching
 * language must not have to reload what is already in hand. A rejected load is
 * left in the map: the provider's no-retry rule (D4.2) is not changed here, and
 * this module does not get a second attempt the provider does not ask for.
 */
const pending = new Map<Locale, Promise<Speller>>();

export function loadSpeller(locale: Locale = DEFAULT_LOCALE): Promise<Speller> {
  const cached = pending.get(locale);
  if (cached !== undefined) return cached;
  const urls = DICTIONARY_URLS[locale] ?? DICTIONARY_URLS[DEFAULT_LOCALE];
  const loading: Promise<Speller> = (async () => {
    const [aff, dic] = await Promise.all([fetchText(urls.aff), fetchText(urls.dic)]);
    const dictionary = nspell(aff, dic);
    return {
      correct: (word) => dictionary.correct(word),
      suggest: (word) => dictionary.suggest(word),
    };
  })();
  pending.set(locale, loading);
  return loading;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`could not load the dictionary (${String(response.status)})`);
  return response.text();
}

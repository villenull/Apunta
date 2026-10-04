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

import { DEFAULT_LOCALE, LOCALES } from './i18n/locales.js';
import type { Locale } from './i18n/locales.js';

/** A JSON array of words she has told the checker to accept. */
export const SPELLING_WORDS_SETTING = 'spelling_words';

/**
 * The Mexican Spanish list's own key (S6.1). Settings keys are lower_snake_case
 * identifiers (`shared/src/settings.ts`), so a key cannot be spelled `es-MX`;
 * this is that locale's list, in the same store and nothing else.
 *
 * The two lists are independent: the Spanish one is never seeded from the
 * English one, and neither is derived from the other on read.
 */
export const SPELLING_WORDS_ES_MX_SETTING = 'spelling_words_es_mx';

/** Which key each UI language keeps its list in, and every language there is. */
export const SPELLING_WORDS_SETTINGS: Readonly<Record<Locale, string>> = Object.freeze({
  en: SPELLING_WORDS_SETTING,
  'es-MX': SPELLING_WORDS_ES_MX_SETTING,
});

/**
 * The key `language`'s list lives in. An unset or unusable language is English
 * (D11), so a row written by an older build reads the English list rather than
 * nothing at all.
 */
export function spellingWordsSettingFor(language: unknown): string {
  return SPELLING_WORDS_SETTINGS[
    (LOCALES as readonly unknown[]).includes(language) ? (language as Locale) : DEFAULT_LOCALE
  ];
}

/**
 * The active list: the key the *active UI language* names, read defensively.
 *
 * The choice is the UI language and nothing else — not a note's locale, not the
 * text in the field — so the same list answers every surface in one tab. The
 * cap applies per key, because each key is a separate list.
 */
export function spellingWordsFor(settings: Readonly<Record<string, unknown>>, language: unknown): string[] {
  return spellingWordsFrom(settings[spellingWordsSettingFor(language)]);
}

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

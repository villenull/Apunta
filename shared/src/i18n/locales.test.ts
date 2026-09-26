import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LOCALE,
  LOCALES,
  LocaleSchema,
  isLocale,
  localeSettings,
  LOCALE_SETTINGS,
} from './locales.js';

/**
 * C-LANG@1 rule 2's table, asserted cell by cell.
 *
 * A locale table is one small object, and its whole value is that it is
 * *complete*: a cell nobody wrote down is a cell somebody later guesses. So
 * every cell of both rows is asserted here, including the two that record a
 * decision rather than a fact — Spanish's empty speech model and English's
 * absent dictionary.
 */

describe('the locales themselves', () => {
  it('is exactly English and Mexican Spanish', () => {
    expect(LOCALES).toEqual(['en', 'es-MX']);
    expect(LocaleSchema.safeParse('en').success).toBe(true);
    expect(LocaleSchema.safeParse('es-MX').success).toBe(true);
    // Not a country, and not a variant the app has never been offered.
    expect(LocaleSchema.safeParse('es').success).toBe(false);
    expect(LocaleSchema.safeParse('es-ES').success).toBe(false);
    expect(LocaleSchema.safeParse('en-US').success).toBe(false);
    expect(isLocale('en')).toBe(true);
    expect(isLocale('de')).toBe(false);
  });

  it('defaults to English, which is what every existing row already is', () => {
    expect(DEFAULT_LOCALE).toBe('en');
  });
});

describe("rule 2's table, row by row", () => {
  it('leaves English exactly as the app is today', () => {
    expect(LOCALE_SETTINGS.en).toEqual({
      ui: 'en',
      whisperLanguage: 'en',
      speechModel: 'ggml-tiny.en.bin',
      dictionary: null,
      promptSet: 'en',
    });
  });

  it('holds Spanish at the cell C-STT@1 has not filled in yet', () => {
    // `speechModel: null` is S4a.2's and P4.3's to change, and until they do it
    // is what keeps Spanish dictation off. Nothing here names a candidate.
    expect(LOCALE_SETTINGS['es-MX']).toEqual({
      ui: 'es-MX',
      whisperLanguage: 'es',
      speechModel: null,
      dictionary: 'dictionary-es-mx@2.0.0',
      promptSet: 'es-MX',
    });
  });

  it('gives every locale a row, and every row its own set', () => {
    expect(Object.keys(LOCALE_SETTINGS).sort()).toEqual([...LOCALES].sort());
    for (const locale of LOCALES) {
      expect(localeSettings(locale)).toEqual(LOCALE_SETTINGS[locale]);
    }
  });

  it('is read-only, so no route can widen the vocabulary at runtime', () => {
    expect(Object.isFrozen(LOCALE_SETTINGS)).toBe(true);
    expect(() => {
      (LOCALE_SETTINGS as Record<string, unknown>)['de'] = localeSettings('en');
    }).toThrow(TypeError);
  });
});

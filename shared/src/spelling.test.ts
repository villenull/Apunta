import { describe, expect, it } from 'vitest';

import { STT_VOCABULARY_SETTING } from './transcribe.js';
import {
  MAX_SPELLING_WORDS,
  SPELLING_WORDS_ES_MX_SETTING,
  SPELLING_WORDS_SETTING,
  SPELLING_WORDS_SETTINGS,
  spellingWordsFor,
  spellingWordsSettingFor,
} from './spelling.js';

describe('the spelling word lists, one key per language', () => {
  it('keeps English on the key it has always used and gives es-MX its own', () => {
    expect(SPELLING_WORDS_SETTINGS).toEqual({ en: 'spelling_words', 'es-MX': 'spelling_words_es_mx' });
    expect(SPELLING_WORDS_SETTING).toBe('spelling_words');
    expect(SPELLING_WORDS_ES_MX_SETTING).toBe('spelling_words_es_mx');
    expect(spellingWordsSettingFor('en')).toBe('spelling_words');
    expect(spellingWordsSettingFor('es-MX')).toBe('spelling_words_es_mx');
  });

  it('reads an unset or unusable language as English (D11), never as nothing', () => {
    expect(spellingWordsSettingFor(undefined)).toBe('spelling_words');
    expect(spellingWordsSettingFor('fr')).toBe('spelling_words');
    expect(spellingWordsSettingFor(null)).toBe('spelling_words');
    expect(spellingWordsFor({ [SPELLING_WORDS_SETTING]: ['Qvplum'] }, undefined)).toEqual(['Qvplum']);
  });

  it('reads the Spanish key, and an absent or malformed one as []', () => {
    const settings = { [SPELLING_WORDS_ES_MX_SETTING]: ['Brócolido', 'Zambumbia'] };
    expect(spellingWordsFor(settings, 'es-MX')).toEqual(['Brócolido', 'Zambumbia']);
    expect(spellingWordsFor({}, 'es-MX')).toEqual([]);
    expect(spellingWordsFor({ [SPELLING_WORDS_ES_MX_SETTING]: 'nope' }, 'es-MX')).toEqual([]);
    expect(spellingWordsFor({ [SPELLING_WORDS_ES_MX_SETTING]: [1, {}, 'x'] }, 'es-MX')).toEqual(['x']);
  });

  it("never seeds one language's list from the other, in either direction", () => {
    const settings = {
      [SPELLING_WORDS_SETTING]: ['Qvplum'],
      [SPELLING_WORDS_ES_MX_SETTING]: ['Zambumbia'],
    };
    expect(spellingWordsFor(settings, 'en')).toEqual(['Qvplum']);
    expect(spellingWordsFor(settings, 'es-MX')).toEqual(['Zambumbia']);
    // A language that has never been written to reads empty, not the other's.
    expect(spellingWordsFor({ [SPELLING_WORDS_SETTING]: ['Qvplum'] }, 'es-MX')).toEqual([]);
    expect(spellingWordsFor({ [SPELLING_WORDS_ES_MX_SETTING]: ['Zambumbia'] }, 'en')).toEqual([]);
  });

  it('caps each key on its own: 1000 per locale, not 1000 between them', () => {
    const english = Array.from({ length: MAX_SPELLING_WORDS }, (_, index) => `english${String(index)}`);
    const spanish = Array.from({ length: MAX_SPELLING_WORDS }, (_, index) => `spanish${String(index)}`);
    const settings = { [SPELLING_WORDS_SETTING]: english, [SPELLING_WORDS_ES_MX_SETTING]: spanish };
    expect(spellingWordsFor(settings, 'en')).toHaveLength(MAX_SPELLING_WORDS);
    expect(spellingWordsFor(settings, 'es-MX')).toHaveLength(MAX_SPELLING_WORDS);
    expect(spellingWordsFor(settings, 'en')).toEqual(english);
    expect(spellingWordsFor(settings, 'es-MX')).toEqual(spanish);
  });

  it('leaves stt_vocabulary alone: it is applied in both languages (D3 rule 4)', () => {
    expect(STT_VOCABULARY_SETTING).toBe('stt_vocabulary');
    const settings = { [STT_VOCABULARY_SETTING]: ['sertralina'], [SPELLING_WORDS_SETTING]: ['Qvplum'] };
    expect(settings[STT_VOCABULARY_SETTING]).toEqual(['sertralina']);
    expect(spellingWordsFor(settings, 'es-MX')).toEqual([]);
  });
});

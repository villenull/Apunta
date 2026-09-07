import { describe, expect, it } from 'vitest';

import {
  allowedWords,
  findMisspellings,
  misspellingAt,
  replaceRange,
  suggestionsFor,
  type Speller,
} from './spelling.js';

/** A dictionary of a dozen words, so the rules are what is under test. */
const KNOWN = new Set([
  'the',
  'client',
  "client's",
  'was',
  'calmer',
  'this',
  'week',
  'office',
  'received',
  'letter',
  'sleeping',
  'i',
]);
const speller: Speller = {
  correct: (word) => KNOWN.has(word),
  suggest: (word) => (word.toLowerCase() === 'teh' ? ['the', 'ten', 'the'] : []),
};

describe('findMisspellings', () => {
  it('flags the words the dictionary does not know, with their offsets', () => {
    const text = 'Teh client recieved the letter.';
    expect(findMisspellings(text, speller, new Set())).toEqual([
      { start: 0, end: 3, word: 'Teh' },
      { start: 11, end: 19, word: 'recieved' },
    ]);
  });

  it('accepts a capitalised known word, an acronym, and casing that says a name', () => {
    const text = 'The client was calmer. CBT this week. McDonald was there.';
    expect(findMisspellings(text, speller, new Set()).map((entry) => entry.word)).toEqual(['there']);
  });

  it('never flags her vocabulary, the patient’s name, or a dictionary addition', () => {
    const allow = allowedWords(['Dr Jane Smith', 'sertraline'], ['John Smith'], ['Halaxy']);
    const text = 'John saw Jane about sertraline; Halaxy says so. Sertraline was fine.';
    expect(findMisspellings(text, speller, allow).map((entry) => entry.word)).toEqual([
      'saw',
      'about',
      'says',
      'so',
      'fine',
    ]);
  });

  it('reads a curly apostrophe as the straight one the dictionary knows', () => {
    expect(findMisspellings('the client’s letter', speller, new Set())).toEqual([]);
  });

  it('leaves single letters and words with digits alone', () => {
    expect(findMisspellings('I took B12 at 3pm', speller, new Set()).map((entry) => entry.word)).toEqual([
      'took',
      'at',
      'pm',
    ]);
  });
});

describe('misspellingAt and replaceRange', () => {
  it('finds the word under the caret at either edge, and swaps it in place', () => {
    const text = 'Teh client';
    const list = findMisspellings(text, speller, new Set());
    expect(misspellingAt(list, 0)?.word).toBe('Teh');
    expect(misspellingAt(list, 3)?.word).toBe('Teh');
    expect(misspellingAt(list, 4)).toBeNull();
    expect(replaceRange(text, 0, 3, 'The')).toBe('The client');
  });
});

describe('suggestionsFor', () => {
  it('finds a one-slip neighbour the dictionary knows before anything nspell offers', () => {
    // "the" is a swap away from "teh"; nspell's own list has only "ten".
    expect(suggestionsFor(speller, 'Teh')).toEqual(['The', 'Ten']);
    expect(suggestionsFor(speller, 'teh', 1)).toEqual(['the']);
    // A dropped letter, a wrong letter, an extra letter.
    expect(suggestionsFor(speller, 'leter')).toEqual(['letter']);
    expect(suggestionsFor(speller, 'recieved')).toEqual(['received']);
    expect(suggestionsFor(speller, 'weeek')).toEqual(['week']);
    expect(suggestionsFor(speller, 'zzz')).toEqual([]);
  });
});

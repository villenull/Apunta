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

  it('skips the expensive one-slip neighbourhood for long tokens', () => {
    const longWord = 'a'.repeat(33);
    const longSpeller: Speller = {
      correct: () => true,
      suggest: () => ['fallback'],
    };
    expect(suggestionsFor(longSpeller, longWord)).toEqual(['fallback']);
  });
});

/**
 * S6.1's tokeniser cases. Nothing here edits an existing case: the English
 * behaviour above is the non-regression guarantee and V1(a) below is what
 * proves it still holds.
 */

/** What `plainWord` does, for the *old* pattern, written out: no NFC, only `’`. */
/** What `plainWord` does, for one word: NFC, then the curly apostrophe. */
const nfc = (word: string): string => word.normalize('NFC').replace(/’/g, "'");

const OLD_WORD = /[A-Za-z]+(?:['’][A-Za-z]+)*/g;
const oldTokenise = (text: string): string[] =>
  [...text.matchAll(OLD_WORD)].map((match) => match[0].replace(/’/g, "'").toLowerCase());

/**
 * A stub that records every word it is asked about, and answers from `known`.
 * `queries` is speller traffic — a filtered, lowercased, doubled projection of
 * the tokens, not a tokenisation, which is why nothing compares it to one.
 */
function recordingSpeller(known: ReadonlySet<string>): { speller: Speller; queries: string[] } {
  const queries: string[] = [];
  return {
    queries,
    speller: {
      correct: (word: string) => {
        queries.push(word);
        return known.has(word.toLowerCase());
      },
      suggest: () => [],
    },
  };
}

describe('S6.1 English tokenisation is provably unchanged (D1)', () => {
  it('tokenises a corpus with no Spanish letter and no combining mark exactly as the old pattern did', () => {
    // The precondition is the two classes the new pattern admits and the old
    // one does not — the Spanish letters and U+0300–U+036F — and NOT the word
    // "ASCII": `’` and the em dash are both here on purpose, and both are
    // absent from it.
    const corpus = [
      ...KNOWN,
      "He's", // the apostrophe the old pattern also matched inside a contraction
      'isn’t', // and the curly one, which `plainWord` folds the same way
      '3pm',
      '127.0.0.1:7717/api/notes?patient=1',
      '—', // neither pattern matches an em dash at all
      'calm.',
    ].join(' ');

    // The new tokenisation, read back through the exported allow-list reader,
    // which tokenises with the same `WORD` and the same `plainWord` — the
    // "for free" half of D1, asserted rather than assumed.
    const now = [...allowedWords([corpus])];
    const before = oldTokenise(corpus);

    // A duplicate token would collapse in the Set the allow-list returns and
    // make the comparison below meaningless rather than false.
    expect(new Set(now).size).toBe(now.length);
    expect(now).toEqual(before);
    expect(now.length).toBeGreaterThan(0);

    // Speller traffic is asserted separately, and only for what it is: a
    // query is a token of this corpus, lowercased, or nothing.
    const { speller: recorder, queries } = recordingSpeller(new Set(before));
    findMisspellings(corpus, recorder, new Set());
    expect(queries.length).toBeGreaterThan(0);
    for (const query of queries) expect(before).toContain(query.toLowerCase());
  });
});

describe('S6.1 Spanish words are whole tokens', () => {
  const text = '¿Cómo amanece, ñandú? José Ramírez';
  it('(b1) extracts whole words, never a fragment, and never cuts at an accent', () => {
    const { speller: recorder, queries } = recordingSpeller(new Set());
    const found = findMisspellings(text, recorder, new Set());
    // `findMisspellings` asks about a word twice — as typed and lowercased —
    // so the record is deduplicated by value, keeping the first ask.
    const seen = new Set<string>();
    const asked: string[] = [];
    for (const query of queries) {
      const key = query.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      asked.push(query);
    }

    expect(asked).toEqual(['Cómo', 'amanece', 'ñandú', 'José', 'Ramírez']);
    expect(found.map((entry) => entry.word)).toEqual(['Cómo', 'amanece', 'ñandú', 'José', 'Ramírez']);
    // What the ASCII pattern used to produce for the same two names.
    expect(oldTokenise('José Ramírez')).toEqual(['jos', 'ram', 'rez']);
  });

  it('(b2) exempts an accented name by the allow-list, and never asks about it', () => {
    const { speller: recorder, queries } = recordingSpeller(new Set());
    const found = findMisspellings(text, recorder, allowedWords(['José Ramírez']));

    expect(found.map((entry) => entry.word)).toEqual(['Cómo', 'amanece', 'ñandú']);
    expect(queries.map((query) => query.toLowerCase())).not.toContain('josé');
    expect(queries.map((query) => query.toLowerCase())).not.toContain('ramírez');
    // The allow-list is read with the same tokeniser, so the two names are
    // whole words there too.
    expect([...allowedWords(['José Ramírez'])]).toEqual(['josé', 'ramírez']);
  });
});

describe('S6.1 NFC and offsets (D1)', () => {
  const precomposed = 'La sesión brócolido con atención';
  const decomposed = 'La sesio\u0301n brócolido con atencio\u0301n';
  /** Flags only the invented word, so the accented ones are accepted. */
  const spanish = (): Speller => ({
    correct: (word) => word.toLowerCase() !== 'brócolido',
    suggest: () => [],
  });

  it('(c1) a decomposed input asks the speller about the same words, and flags the same set', () => {
    // Everything but the invented word is a word this stub knows, so a flag is
    // about tokenisation rather than about the dictionary.
    const known = (word: string): boolean => word.toLowerCase() !== 'brócolido';
    const before = { queries: [] as string[], speller: { correct: known, suggest: () => [] } };
    const after = { queries: [] as string[], speller: { correct: known, suggest: () => [] } };
    const record = (queries: string[], word: string): boolean => {
      queries.push(word);
      return known(word);
    };
    before.speller.correct = (word: string) => record(before.queries, word);
    after.speller.correct = (word: string) => record(after.queries, word);
    const a = findMisspellings(precomposed, before.speller, new Set());
    const b = findMisspellings(decomposed, after.speller, new Set());

    // The projection, never the raw `word`: the decomposed token is one code
    // unit longer, by exactly the unit the decomposition added.
    expect(a.map((entry) => nfc(entry.word))).toEqual(b.map((entry) => nfc(entry.word)));
    expect([...new Set(after.queries.map((query) => nfc(query)))].sort()).toEqual(
      [...new Set(before.queries.map((query) => nfc(query)))].sort(),
    );
    expect(b.map((entry) => nfc(entry.word))).toEqual(['brócolido']);
  });

  it('(c2) every offset indexes its own input exactly, in either encoding', () => {
    for (const text of [precomposed, decomposed]) {
      const found = findMisspellings(text, spanish(), new Set());
      expect(found.length).toBeGreaterThan(0);
      for (const entry of found) {
        expect(text.slice(entry.start, entry.end)).toBe(entry.word);
        expect(entry.end - entry.start).toBe(entry.word.length);
      }
    }
    // And the accented words the dictionary knows are whole tokens, so the
    // offsets after them land on the word that follows rather than inside it.
    const found = findMisspellings(decomposed, spanish(), new Set());
    expect(decomposed.slice(found[0]!.start, found[0]!.end)).toBe('brócolido');
  });
});

describe('the word tables of S6.1', () => {
  /** The shipped dictionary's own answer, as a stub: the three invented words. */
  const spanish: Speller = {
    correct: (word) => !['brócolido', 'zambumbia', 'telaraosa'].includes(word.normalize('NFC')),
    suggest: () => [],
  };

  it('flags exactly the three invented words, and nothing else in the sentence', () => {
    const text =
      'Subjetivo: La sesión brócolido con atención.\n\nPlan: Revisar zambumbia, última vez con el niño, José Ramírez, café y telaraosa.';
    expect(findMisspellings(text, spanish, new Set()).map((entry) => nfc(entry.word))).toEqual([
      'brócolido',
      'zambumbia',
      'telaraosa',
    ]);
  });

  it('flags none of the accented words, `ñ` included, with an empty allow-list', () => {
    const text = 'sesión atención psicología niño última café José Ramírez';
    expect(findMisspellings(text, spanish, new Set()).map((entry) => nfc(entry.word))).toEqual([]);
  });

  it('reads `¿` and `¡` as punctuation, so the word after either is whole', () => {
    expect(findMisspellings('¿niño? ¡café!', spanish, new Set())).toEqual([]);
  });
});

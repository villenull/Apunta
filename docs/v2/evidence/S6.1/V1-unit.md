# S6.1 — V1 unit tests

- Working directory: the repository root
- Started: 2026-10-04T20:53Z · Ended: 2026-10-04T20:54Z
- Command (exactly the row's):

```
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && npm run build:shared && npx vitest run web/src/lib/spelling.test.ts web/src/lib/speller.test.ts shared/src/spelling.test.ts web/src/components/SpellingProvider.test.tsx web/src/components/SpellLayer.test.tsx
```

- **Exit code: 0**
- Collected: **5 files, 34 tests, 34 passed, 0 failed, 0 skipped.** (Run with
  `--reporter=verbose` for the case list below; the row's own command was run
  first, unmodified, and exited 0.)

## The nine named cases of V1, and where each one is

| V1 clause | Case | File |
| --- | --- | --- |
| (a) English parity, two tokenisations compared | `tokenises a corpus with no Spanish letter and no combining mark exactly as the old pattern did` | `web/src/lib/spelling.test.ts` |
| (b1) whole-token extraction | `(b1) extracts whole words, never a fragment, and never cuts at an accent` | `web/src/lib/spelling.test.ts` |
| (b2) allow-list exemption | `(b2) exempts an accented name by the allow-list, and never asks about it` | `web/src/lib/spelling.test.ts` |
| (c1) NFC, same words and same flagged set | `(c1) a decomposed input asks the speller about the same words, and flags the same set` | `web/src/lib/spelling.test.ts` |
| (c2) offsets index their own input | `(c2) every offset indexes its own input exactly, in either encoding` | `web/src/lib/spelling.test.ts` |
| (d) the word tables of § Words | three cases: `flags exactly the three invented words, and nothing else in the sentence`, `flags none of the accented words, ñ included, with an empty allow-list`, `reads ¿ and ¡ as punctuation, so the word after either is whole` | `web/src/lib/spelling.test.ts` |
| (e) load failure | `names the failure as a MessageKey, draws no marks, and stays usable (V1e)`, plus `says nothing when there is no error, and one alert per mounted surface when there is` | `web/src/components/SpellingProvider.test.tsx`, `web/src/components/SpellLayer.test.tsx` |
| (f) the load-id race, both directions | `does not install a dictionary that resolves after the language moved on`, `does not report a failure that arrives after the language moved on` | `web/src/components/SpellingProvider.test.tsx` |
| (g) the two Spanish URL constants at source level | `addresses the Mexican Spanish pair from the module, on loopback, like the English one`, `keeps the English pair exactly as it was, and the two locales in one table` | `web/src/lib/speller.test.ts` |
| (h) per-locale lists | six cases in `shared/src/spelling.test.ts` (key per locale, unset language reads English, absent/malformed reads `[]`, neither list seeded from the other, 1000 per key, `stt_vocabulary` untouched) | `shared/src/spelling.test.ts` |
| (i) the word-list race, both directions | `does not let the English list repopulate after a switch to es-MX`, `keeps the English list when a Spanish snapshot is the one delivered` | `web/src/components/SpellingProvider.test.tsx` |

## The exact expected arrays of § *Words*

Flagged, exact array equality:

```ts
expect(findMisspellings(text, spanish, new Set()).map((entry) => nfc(entry.word))).toEqual([
  'brócolido',
  'zambumbia',
  'telaraosa',
]);
```

Not flagged, exact empty:

```ts
expect(findMisspellings('sesión atención psicología niño última café José Ramírez', spanish, new Set()).map((entry) => nfc(entry.word))).toEqual([]);
```

(b1) and (b2), exact arrays:

```ts
expect(asked).toEqual(['Cómo', 'amanece', 'ñandú', 'José', 'Ramírez']);
expect(found.map((entry) => entry.word)).toEqual(['Cómo', 'amanece', 'ñandú', 'José', 'Ramírez']);
expect(oldTokenise('José Ramírez')).toEqual(['jos', 'ram', 'rez']);   // what the ASCII pattern used to produce

// (b2), allow-list = allowedWords(['José Ramírez'])
expect(found.map((entry) => entry.word)).toEqual(['Cómo', 'amanece', 'ñandú']);
expect(queries.map((q) => q.toLowerCase())).not.toContain('josé');
expect(queries.map((q) => q.toLowerCase())).not.toContain('ramírez');
```

## English non-regression inside this row

- `spelling.test.ts`'s six pre-existing cases and every existing case in
  `speller.test.ts` are untouched and green, including
  `loads both local Hunspell assets and applies American spelling`, whose
  `/dictionary-en/` and loopback assertions are exactly as they were.
- The parity case (a) compares the **new** tokenisation — read back through the
  exported `allowedWords`, which tokenises with the same `WORD` and the same
  `plainWord` — with the **literal old pattern** `/[A-Za-z]+(?:['’][A-Za-z]+)*/g`
  plus the old `plainWord`, over one fixed corpus. The corpus carries no Spanish
  letter and no combining mark in U+0300–U+036F, and deliberately retains `'`,
  `’` and an em dash. It also asserts its own tokens are unique, because the
  allow-list reader returns a `Set` and a duplicate would make the comparison
  meaningless rather than false. Speller traffic is asserted separately and only
  for what it is: every query is a lowercased token of the corpus.

## Non-vacuity of the two guard cases (D4.3)

Both (f) cases were checked against a mutation: with the `loadIdRef.current !== id`
condition removed from the provider, both fail
(`expected 'ready|none' to be 'pending|none'` and the mirror image), and pass
again with it restored. The two (i) cases were not mutated; they assert an exact
accepted-word set in each direction.

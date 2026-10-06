# S6.1 — V1 row, review run (AM-224), review attempt 1

Independent implementation review. Row V1 of the S6.1 verification table
(`docs/v2/cards/S6.1.md:503`).

- Working directory: the repository root
- Node: pinned A01 toolchain (`node --version` → `v24.19.0`)
- Applied source: committed HEAD `d5b0d52721e3a0a058277e6ea85b4093dbfa5eca`
  plus the uncommitted notice candidate
- Review attempt: 1 (AM-224)

## Commands

1. `npm run build:shared`
2. `npx vitest run web/src/lib/spelling.test.ts web/src/lib/speller.test.ts shared/src/spelling.test.ts web/src/components/SpellingProvider.test.tsx web/src/components/SpellLayer.test.tsx`

## Result

1. Start 2026-10-06T17:54:23Z · End 2026-10-06T17:54:23Z · **exit 0** (shared
   TS build, `vitest` echo line: `web/src/lib/spelling.test.ts` …).
2. Start 2026-10-06T17:54:36Z · End 2026-10-06T17:54:38Z · **exit 0** —
   **5 files, 37 tests passed, 0 skipped** (`Tests  37 passed (37)`).

## Named cases — none may be skipped (card names them so)

All present, located by read:

- **(a) English parity** — `web/src/lib/spelling.test.ts:138`, a fixed corpus
  with no Spanish letter and no combining mark in U+0300–U+036F (the existing
  `KNOWN` words, contractions with `'` and `’`, digits, punctuation, a URL
  fragment, an em dash), tokenised by a speller stub that records every word it
  is asked about; the case tokenises the corpus with the **new** `WORD` and with
  the **literal old pattern** `/[A-Za-z]+(?:['’][A-Za-z]+)*/g`, applies
  `plainWord` to each match of each, and asserts the two `string[]` are
  identical (two tokenisations compared against two tokenisations; speller
  traffic is asserted separately, not against the token list). The corpus keeps
  `'`, `’` and the em dash; the precondition is exactly "no Spanish letter and
  no combining mark", not the word "ASCII".
- **(b1)** `spelling.test.ts:176`, **(b2)** `:196` — the new-pattern cases
  (Spanish-letter single-token cases).
- **(c1)** `spelling.test.ts:218`, **(c2)** `:242` — the accented cases
  (`sesión`, `atención`, `última` etc.).
- Word-tables/asserts: `spelling.test.ts:265`, `:275`, `:280`.
- `SpellLayer.test.tsx:56` — one alert per mounted surface (2 alerts for
  note + chat, no `spelling-menu` ghost).
- `SpellingProvider.test.tsx:186`, `:203`, `:334`, `:363` — the dismantle/race
  guards.
- `speller.test.ts` — pinned dictionary URL constants and untouched English.

## Verdict

**PASS** — 5 files, 37 tests, 0 skipped, all named cases present on the applied
source; both commands exit 0.
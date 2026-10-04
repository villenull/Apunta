# S6.1 — V7 scope

- Working directory: the repository root
- Started/Ended: 2026-10-04T20:53Z
- The work is left uncommitted, which is what makes `git diff` the right
  instrument in V4 and V7.

## Command (exactly the row's)

```
git status --porcelain -- web/ shared/ scripts/ e2e/ package.json package-lock.json THIRD-PARTY-LICENSES.md docs/decisions.md docs/v2/state/returns/S6.1.md docs/v2/evidence/S6.1/ docs/v2/state/cards/S6.1.json && git diff --name-only -- e2e/tests/spelling.spec.ts e2e/support/ shared/src/i18n/locales.ts docs/v2/ACQUISITION.md docs/v2/CONTRACTS.md && git status --porcelain -- docs/v2/evidence/P2.2/screenshots/
```

## Part 1 — every path is a May-edit path or one of the three required outputs

```
 M THIRD-PARTY-LICENSES.md              (May edit: the regenerated npm block)
 M docs/v2/state/cards/S6.1.json         (required output: the checkpoint)
 M e2e/playwright.config.ts              (May edit: two testIgnore entries)
 M package-lock.json                     (May edit: exactly two hunks)
 M scripts/collect-licenses.mjs          (May edit: one map, two call sites, one comment block)
 M shared/src/i18n/en.ts                 (May edit: one new key)
 M shared/src/i18n/es-MX.ts              (May edit: one new key)
 M shared/src/index.ts                   (May edit: only the ./spelling.js export block)
 M shared/src/spelling.ts                (May edit: the per-locale key, the read rule, the cap's scope)
 M web/package.json                      (May edit: one line)
 M web/src/components/SpellLayer.test.tsx   (May edit: the rendered alert)
 M web/src/components/SpellLayer.tsx        (May edit: one rendered alert, one place)
 M web/src/components/SpellingProvider.test.tsx (May edit: per-locale list, request-id guard, error state)
 M web/src/components/SpellingProvider.tsx     (the same)
 M web/src/lib/speller.test.ts           (May edit: new cases only)
 M web/src/lib/speller.ts                (May edit: per-locale URL pair, cache, failure path)
 M web/src/lib/spelling.test.ts          (May edit: new cases only)
 M web/src/lib/spelling.ts               (May edit: the WORD pattern and plainWord)
?? e2e/tests/spelling-assets.spec.ts     (May edit: new file)
?? e2e/tests/spelling-es.spec.ts         (May edit: new file)
?? shared/src/spelling.test.ts           (May edit: new file)
```

Plus, written after this row's first pass and not in the command's own path list:
`docs/v2/evidence/S6.1/` and `docs/v2/state/returns/S6.1.md` (the other two
required outputs; the evidence directory is passed to the first command and was
empty at the time it ran, which is why it does not appear above).

**Nothing outside May edit and the three required outputs.** `docs/decisions.md`
is unmodified: the 2026-10-04 election row was already on record from AM-203, so
this card appended nothing (see *Deviations* in the return file for the size
figure this leaves in the return-file summary instead).

## Part 2 — must print nothing

```
$ git diff --name-only -- e2e/tests/spelling.spec.ts e2e/support/ shared/src/i18n/locales.ts docs/v2/ACQUISITION.md docs/v2/CONTRACTS.md
```

**Nothing.** `e2e/tests/spelling.spec.ts` is byte-identical, `e2e/support/` is
untouched (`no-english.ts`, `fixtures.ts`), `shared/src/i18n/locales.ts` is
untouched, `docs/v2/ACQUISITION.md` and `docs/v2/CONTRACTS.md` are untouched by
this card.

## Part 3 — must be empty

```
$ git status --porcelain -- docs/v2/evidence/P2.2/screenshots/
 M docs/v2/evidence/P2.2/screenshots/dark-accent-7c3aed.png
 M docs/v2/evidence/P2.2/screenshots/dark-default-accent.png
 M docs/v2/evidence/P2.2/screenshots/light-accent-7c3aed.png
 M docs/v2/evidence/P2.2/screenshots/light-default-accent.png
```

**Not empty**, and deliberately left that way.

`e2e/tests/brand.spec.ts:157` writes its four screenshots to that committed
directory by design, so **any** full `npm run e2e` run rewrites them. The
coordinator asked for the global gate rows (full `npm test` / `e2e`), the full
e2e ran, and these four tracked files changed on disk as a side effect:

```
 .../P2.2/screenshots/dark-accent-7c3aed.png         | Bin 24743 -> 40373 bytes
 .../P2.2/screenshots/dark-default-accent.png        | Bin 24781 -> 40373 bytes
 .../P2.2/screenshots/light-accent-7c3aed.png        | Bin 27967 -> 45150 bytes
 .../P2.2/screenshots/light-default-accent.png       | Bin 26226 -> 52351 bytes
 4 files changed, 0 insertions(+), 0 deletions(-)
```

Stop 9 forbids restoring a tracked path here — "`a git checkout`/`git restore` of
any tracked path looks necessary — stop" — and so does
`docs/decisions.md` (2026-09-22) on never silently discarding a concurrent change.
**They were not restored.** Deciding whether those screenshots are regenerated on
purpose is the coordinator's and the owner's call, not this card's: they are
byte-different from the committed copies, and nothing in this card writes them
except through the brand spec the global gate asked me to run.

## Row verdict

Parts 1 and 2: **as expected**. Part 3: **not empty**, for the reason above — an
environment consequence of the requested global gate, not an edit of this card,
and left unrestored on purpose.

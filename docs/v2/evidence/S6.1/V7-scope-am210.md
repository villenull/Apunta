# S6.1 — V7 re-run under AM-210 (scope)

- Working directory: the repository root
- Started/Ended: 2026-10-04T21:25:07Z
- Pinned Node: `v24.19.0`
- The work is left uncommitted, which is what makes `git diff` the right
  instrument in V4 and V7.
- Authority: **AM-210** (owner decision 2026-10-04).

## Command (exactly the row's)

```
git status --porcelain -- web/ shared/ scripts/ e2e/ package.json package-lock.json THIRD-PARTY-LICENSES.md docs/decisions.md docs/v2/state/returns/S6.1.md docs/v2/evidence/S6.1/ docs/v2/state/cards/S6.1.json && git diff --name-only -- e2e/tests/spelling.spec.ts e2e/support/ shared/src/i18n/locales.ts docs/v2/ACQUISITION.md docs/v2/CONTRACTS.md && git status --porcelain -- docs/v2/evidence/P2.2/screenshots/
```

## Part 1 — every path is a May-edit path or one of the three required outputs

```
 M THIRD-PARTY-LICENSES.md              (May edit: the regenerated npm block)
 M docs/v2/state/cards/S6.1.json         (required output: the checkpoint)
 M e2e/playwright.config.ts              (May edit: two testIgnore entries)
 M e2e/tests/chat-dictation.spec.ts      (May edit, widened by AM-210: Spanish note text in es-MX)
 M package-lock.json                     (May edit: exactly two hunks)
 M scripts/collect-licenses.mjs          (May edit: one map, two call sites, one comment block)
 M shared/src/i18n/en.ts                 (May edit: one new key)
 M shared/src/i18n/es-MX.ts              (May edit: one new key)
 M shared/src/index.ts                   (May edit: only the ./spelling.js export block)
 M shared/src/spelling.ts                (May edit: the per-locale key, the read rule, the cap's scope)
 M web/package.json                      (May edit: one line)
 M web/src/App.test.tsx                  (May edit, widened by AM-210: capture-error assertion narrowed)
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

The two paths AM-210 adds to May edit are present and labelled above:
`e2e/tests/chat-dictation.spec.ts` and `web/src/App.test.tsx`. The two required
outputs not in the command's own path list, `docs/v2/evidence/S6.1/` and
`docs/v2/state/returns/S6.1.md`, are also present (the evidence directory is
passed to the first command; it now holds files).

**Nothing outside May edit and the three required outputs.**

## Part 2 — must print nothing

```
$ git diff --name-only -- e2e/tests/spelling.spec.ts e2e/support/ shared/src/i18n/locales.ts docs/v2/ACQUISITION.md docs/v2/CONTRACTS.md
```

**Nothing.** `e2e/tests/spelling.spec.ts` is byte-identical, `e2e/support/` is
untouched (`no-english.ts`, `fixtures.ts`), `shared/src/i18n/locales.ts` is
untouched, `docs/v2/ACQUISITION.md` and `docs/v2/CONTRACTS.md` are untouched by
this card. AM-210 explicitly kept `e2e/support/no-english.ts` on *Must not
edit*; it gained no `ALLOWED` entry.

## Part 3 — must be empty

```
$ git status --porcelain -- docs/v2/evidence/P2.2/screenshots/
```

**Empty.** The global `npm run e2e` gate (see `global-gates-am210.md`) again
rewrote the four committed `docs/v2/evidence/P2.2/screenshots/*.png` through
`e2e/tests/brand.spec.ts:157`. Under AM-210 ("The P2.2 screenshots the global
e2e gate regenerated were restored by the coordinator (evidence must not be
rewritten by a gate)") and the continuation's explicit instruction, they were
restored with:

```
$ git checkout -- docs/v2/evidence/P2.2/screenshots/
restore_exit=0
$ git status --porcelain -- docs/v2/evidence/P2.2/screenshots/
(empty)
```

The four paths restored: `dark-accent-7c3aed.png`,
`dark-default-accent.png`, `light-accent-7c3aed.png`,
`light-default-accent.png`. No other tracked path was restored.

## Row verdict

Parts 1, 2 and 3: **as expected. PASS, exit 0.**

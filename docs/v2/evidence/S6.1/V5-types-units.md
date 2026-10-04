# S6.1 — V5 types and the full shared/web unit projects

- Working directory: the repository root
- Started: 2026-10-04T20:45Z · Ended: 2026-10-04T20:47Z
- Command (exactly the row's):

```
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && npm run typecheck && npx vitest run --project shared --project web
```

## `npm run typecheck`

**Exit code: 0.** All four workspaces — root, `shared`, `server`, `web`, `e2e`,
`installer` — compile. This row had to be re-run: the first attempt failed while
another worker had `server/src/backup/restore.ts` mid-edit (a
`TS2304: Cannot find name 'preRestoreEntryPath'` and, earlier in the session,
`TS2554` arity errors in the same file). Those were environment failures in
another card's in-flight file; the final run above is green with that file
settled.

## `npx vitest run --project shared --project web`

**Exit code: 1 — 750 passed, 1 failed, 0 skipped, 70 files.**

```
 ❯ |web| src/App.test.tsx (78 tests | 1 failed) 3442ms
   × keeps the summary and explains itself when the local AI is not running

 Test Files  1 failed | 69 passed (70)
      Tests  1 failed | 750 passed (751)
```

### The one failure, in full

```
FAIL  |web| src/App.test.tsx > adding a patient and a typed note > keeps the summary and explains itself when the local AI is not running
AssertionError: expected <p class="form-error" …(2)></p> to have property "textContent" with value StringContaining{…}
 ❯ src/App.test.tsx:973:46
     971|     fireEvent.click(screen.getByTestId('process-note'));
     972|
     973|     expect(await screen.findByRole('alert')).toHaveProperty(
         974|       'textContent',
         975|       expect.stringContaining("can't reach the local AI"),
```

### Why, and why this card did not fix it

`web/src/App.test.tsx:973` asks for **the first** element with `role="alert"` on
the capture page. D4.4 makes every mounted spell surface render one alert when
the dictionary fails to load — and under jsdom the dictionary **always** fails to
load, because `web/src/lib/speller.ts`'s `new URL(…, import.meta.url)` resolves
under Vitest to a Vite dev-server path (`http://localhost:3000/@fs/…/
node_modules/dictionary-en/index.aff`) that nothing is serving. So on that page
the spell layer's alert exists before the capture error does, and `findByRole`
returns it. The behaviour is exactly what D4.4 asks for; the test's query is
what is no longer specific.

The fix is one line in a file outside this card's May-edit list — Stop 3 applies,
so it is reported rather than made: scope the query to the element it means,
`await screen.findByTestId('capture-error')`, which is the same element its
`className` (`form-error`) already identifies. (A second option, an
`ALLOWED`-style suppression or a scheme check in the loader, was considered and
rejected: the first hides the alert the card exists to add, the second disables a
product surface in environments it should not distinguish.)

**Proven to be this card's doing, and only this:** with `web/src/components/SpellLayer.tsx`
stashed, that case passes; with it restored, it fails. Nothing else in the `web`
project changed as a result — the other 750 tests pass, including every
pre-existing spelling case.

## Row verdict

**FAIL**, with one failing case whose cause is a D4.4 consequence in a file
outside May edit (`web/src/App.test.tsx`), and the one-line fix named above. Not
recorded as an environment note: that file is nobody's in-flight work, and this
card's behaviour is what broke it.

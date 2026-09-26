# P0.5 findings — two problems outside this card, with the evidence for both

Neither is caused by this card and neither is fixable inside its May-edit
list (HS-9). Both are reported rather than fixed, per the card's stop
conditions.

## Finding 1 — a pre-existing flake in `web/src/App.test.tsx` (settings tests)

Symptom: the full suite under `TZ=America/Denver` failed once at
`2026-09-26T08:09:36Z` on a test that has nothing to do with dates:

```
FAIL  |web| src/App.test.tsx > settings > saves a text size immediately by scaling one root token
AssertionError: expected '' to be '1.15' // Object.is equality
 ❯ src/App.test.tsx:1208:77
```

Cause, read from the code: `web/src/App.test.tsx:1208` reads a DOM side
effect **synchronously** after `fireEvent.click`, with the `waitFor` only
wrapping the *next* assertion (the saved setting). The write it reads is in
an effect — `web/src/lib/appearance.ts:43`
(`root.style.setProperty('--font-scale', …)`) — so when the full suite's
parallel workers load the machine, the effect can still be pending when the
synchronous read happens. Nothing here is timezone-dependent.

Evidence that it pre-dates this card and is not caused by it:

- In isolation, 5 of 5 runs pass:
  `TZ=America/Denver npx vitest run web/src/App.test.tsx -t "saves a text size immediately by scaling one root token"`
  → `Tests 1 passed | 68 skipped (69)`, exit 0 each time.
- Full suite under Denver with this card's changes: 2 further runs, both exit
  0, 1557 passed.
- Full suite under Denver on a **pristine tree** (this card's four files
  stashed), 6 runs: **2 of 6 failed**, and each time on a *different*
  settings test in the same family —

  | Run | Exit | Failing test |
  | --- | --- | --- |
  | 1 | 1 | `settings > turns animations off app-wide and remembers it immediately` |
  | 2 | 0 | — |
  | 3 | 0 | — |
  | 4 | 0 | — |
  | 5 | 1 | `settings > offers the three themes as one named switcher, and saves the system one` |
  | 6 | 0 | — |

  A different test each time, on a tree without this card's changes, is the
  signature of a race rather than of a logic error.

Recommendation (not this card's to make): wrap the two synchronous
`--font-scale` / `--animate` reads in `waitFor`, as the assertions after them
already are. Until then, an occasional `App.test.tsx` settings failure under
full-suite load is expected and is not a timezone regression — V1 passed
clean in all four zones on the recorded run.

## Finding 2 — `npm run lint` fails at the base commit, on four files this card may not edit

`prettier --check .` flags `scripts/v2/check-es-audio.mjs`,
`scripts/v2/generate-es-audio.mjs` (both untracked, another agent's
in-flight work) and `web/src/components/BrandWordmark.tsx`,
`web/src/routes/Settings.tsx` (both committed, untouched by this card, and
identical at `b366be1` — `git diff b366be1..HEAD --name-only` lists no `web/`
path). `npm run lint` therefore exits 1 with this card's four files stashed
too, so the V3 row cannot reach exit 0 from inside this card's scope.

Details and timings: `V3.md`.

Recommendation (not this card's to make): the two `scripts/v2/*.mjs` files
belong to whichever agent is writing them; the two `web/` files are formatting
debt from the `b366be1` UI baseline commit and need a `prettier --write` from
an agent that holds them in its May-edit list.

## Base-commit movement, for the record

The card names base `b366be1`. This session's first `git log -1` returned
`b366be15fedbd60bc72d414b3d10b391b56770dd` — the correct base — and a second
command moments later returned `3fe5355a89b40ff690191b35058e6632725f2435`
("Record v2 state: P0.4/P0.5/S4a.1 dispatches (coordinator)"), a commit made
by the coordinator while this session was starting. No pull, merge, rebase or
reset was performed by this session.

`git diff b366be1..3fe5355 --name-only` is 12 files, **all Markdown under
`docs/v2/`**, and zero paths outside `docs/`. In particular it contains
**none** of this card's four May-edit files, so the code state this card
built and tested against is byte-identical to the base commit the card names.
The card's own `dispatch/P0.5.md` is part of that commit, and the version on
disk (which this session followed) is the committed one.

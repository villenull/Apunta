# P0.5 findings — two problems outside this card, with the evidence for both

Neither is caused by this card and neither was fixable inside its May-edit
list (HS-9). Both are reported rather than fixed, per the card's stop
conditions. **Finding 2 has since been cleared by the coordinator (AM-030)
and V3 now exits 0; finding 1 is still open.**

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
clean in all four zones on both recorded rounds, including the final re-run
at `2026-09-26T08:18:57Z` → `2026-09-26T08:19:31Z` (exit 0, no failure of
any kind in the log), so the flake did not fire there and no zone needed the
extra re-run.

## Finding 2 — `npm run lint` failed at the base commit, on four files this card may not edit — **CLEARED**

Round 1: `prettier --check .` flagged `scripts/v2/check-es-audio.mjs`,
`scripts/v2/generate-es-audio.mjs` (both untracked, another agent's
in-flight work) and `web/src/components/BrandWordmark.tsx`,
`web/src/routes/Settings.tsx` (both committed, untouched by this card, and
identical at `b366be1` — `git diff b366be1..HEAD --name-only` listed no
`web/` path). `npm run lint` therefore exited 1 with this card's four files
stashed too, so the V3 row could not reach exit 0 from inside this card.

Resolution: the two `web/` files were reformatted under AM-030 (commit
`7918381`) and the two `scripts/v2/*.mjs` files are Prettier-clean. V3
re-run `2026-09-26T08:18:42Z` → `2026-09-26T08:18:52Z`, exit **0** — see
`V3.md`. No further action needed from this card.

Details and timings for both rounds: `V3.md`.

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

HEAD moved twice more while this card was open, both times by the
coordinator and both times without this session pulling, merging, rebasing or
resetting:

| Commit | Subject | Effect on this card |
| --- | --- | --- |
| `3fe5355` | Record v2 state: P0.4/P0.5/S4a.1 dispatches (coordinator) | 12 Markdown files under `docs/v2/`; no code |
| `7918381` | Fix Prettier debt in AM-028 UI baseline (AM-030) | reformatted two `web/` files, and **carried this card's four test files and its evidence/return files into history** — they had been left staged, and the coordinator committed them. This session did not commit. |

The round-2 verification runs in `V1.md`, `V2.md` and `V3.md` were made
against HEAD `7918381`, i.e. against the committed content of this card's
four test files — confirmed unchanged from the version verified in round 1
(`grep -c originalTimezone` returns 3, 6, 3, 3 across the four files, and
`git status` shows none of them modified).

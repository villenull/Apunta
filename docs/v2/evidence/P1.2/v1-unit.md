# V1 — unit: `web/src/routes/Settings.test.tsx`

Working directory: repository root.
Command (both runs):

```sh
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && npm run build:shared && npx vitest run web/src/routes/Settings.test.tsx
```

`npm run build:shared` exited 0 in both runs. `npx vitest run` is the row's
command verbatim; the `--reporter=verbose` run in §3 is supplementary and only
prints the per-case names.

## 1. Baseline, base commit `c1bec23`, test file untouched

Start 2026-09-26T09:57:55Z, end 09:57:56Z. Exit **0**.

```
 RUN  v4.1.11 /home/villenull/Projects/Apunta

 Test Files  1 passed (1)
      Tests  3 passed (3)
   Duration  1.10s (transform 212ms, setup 0ms, import 319ms, tests 510ms, environment 221ms)
```

Three cases: the two P1.1 appearance cases and the P1.1 Drafting model radio
case. The card expects this to pass — the theme group's keyboard behaviour is
already in `Settings.tsx`, so a green run on the base commit is the evidence
that the behaviour is shipped, not a gap in the tests.

## 2. Run of record, with the theme keyboard cases

Start 2026-09-26T10:00:08Z, end 10:00:11Z. Exit **0**.

```
 RUN  v4.1.11 /home/villenull/Projects/Apunta

 Test Files  1 passed (1)
      Tests  7 passed (7)
   Duration  1.36s (transform 203ms, setup 0ms, import 307ms, tests 784ms, environment 219ms)
```

## 3. What the 7 are, and which card item each case carries

Supplementary run with `--reporter=verbose`, start 10:00:10Z, end 10:00:11Z,
exit 0:

```
 ✓ |web| src/routes/Settings.test.tsx > settings appearance controls > shows and paints the chosen theme before the save settles 331ms
 ✓ |web| src/routes/Settings.test.tsx > settings appearance controls > returns to Dark, repaints dark and shows the error when the save fails 55ms
 ✓ |web| src/routes/Settings.test.tsx > the theme radio group > is one tab stop, on the selected option 20ms
 ✓ |web| src/routes/Settings.test.tsx > the theme radio group > wraps ArrowRight from Dark to System, painting the resolved theme 68ms
 ✓ |web| src/routes/Settings.test.tsx > the theme radio group > moves ArrowLeft from Dark to Light 65ms
 ✓ |web| src/routes/Settings.test.tsx > the theme radio group > jumps Home to System and End to Dark 121ms
 ✓ |web| src/routes/Settings.test.tsx > the drafting model radio group > moves and selects with the arrow keys, and tabs into the selected option 121ms

 Test Files  1 passed (1)
      Tests  7 passed (7)
```

Cases 1, 2 and 7 are P1.1's and are untouched, still passing. The four new ones
sit in one `describe('the theme radio group')`, shaped after the Drafting model
case at `Settings.test.tsx:184-221` (pre-edit numbering):

| New case | Card item it covers |
| --- | --- |
| is one tab stop, on the selected option | `role="radiogroup"` named Theme with three `role="radio"` buttons, each with an `aria-label`; stored fixture `theme: 'dark'` (`STORED`, `:27`) so Dark holds `aria-checked="true"` and `tabindex="0"` while System and Light read `"false"`/`-1` |
| wraps ArrowRight from Dark to System, painting the resolved theme | `THEMES = system, light, dark`, so next after Dark wraps to **System**, not Light; the save body is `{ theme: 'system' }` **before the PUT settles** (the held request from `holdSettingsPuts`), `dataset.theme` is `light` and explicitly `not.toBe('system')`, and `document.activeElement` is the System segment once the `requestAnimationFrame` has run; after `settle` the stored record reads `system` and the page is still painted `light` |
| moves ArrowLeft from Dark to Light | previous-with-wrap, the tab stop and the paint moving with it, focus following, `api.state.settings['theme'] === 'light'` |
| jumps Home to System and End to Dark | `Home` → index 0 = System, `End` → last of `THEMES` = **Dark**, both with the roving `tabindex` and focus following |

Assertions read the DOM directly (no jest-dom matchers, as the file's header
says) and the cases render the real `App`, because the painted page is painted
by `web/src/App.tsx` from provider state.

## 4. Sensitivity: the four non-obvious assertions can fail

A green test is only evidence if it can go red. Production is out of write
scope, so each mutation was made in the **test's own expectation** and reverted;
`Settings.tsx` was never touched. Start 09:59:00Z, exit 1.

| Mutation | Observed failure |
| --- | --- |
| assume the wrap goes to Light: `expect(puts.sent).toEqual([{ theme: 'light' }])` | `expected [ { theme: 'system' } ] to deeply equal [ { theme: 'light' } ]` — the wrap is real, and the paint stays the resolved one |
| assume focus does not follow: `expect(document.activeElement).toBe(dark)` after ArrowLeft | `expected <button … data-testid="theme-dark" …> to be <button … data-testid="theme-light" …>` (the printed DOM shows `theme-light` with `aria-checked="true"`, `tabindex="0"`, `is-selected`) |
| assume the page is painted the literal `system`: `expect(paintedTheme()).toBe('system')` | `expected 'light' to be 'system'` |
| assume `tabindex` does not follow: `expect(system.getAttribute('tabindex')).toBe('-1')` | `expected '0' to be '-1'` |

Run individually with `-t "wraps ArrowRight"` where the first failure in the
case would otherwise mask a later one (mutations 3 and 4: `Tests 1 failed | 6
skipped (7)`). After restoring, the file was re-run: `Tests 7 passed (7)`.

`git diff --name-only c1bec23 -- web/src/routes/Settings.tsx shared/src/settings.ts`
→ empty, before and after. `Settings.tsx` is byte-for-byte as dispatched.

## 5. Re-run after the base moved

At 10:01, while this card's work was staged and uncommitted, the other card in
flight (P1.4) committed `a2dc75d`. Nothing was pulled, merged, rebased or reset
here; HEAD simply moved under the session, as it did during P1.1.
`git diff --name-only c1bec23..a2dc75d` lists `server/src/**`, `scripts/*.sh`
and `docs/**` — no `web/`, `e2e/` or `shared/` — and the card's command touches
only the `web` project, so no result depends on the move. Re-run anyway, at
10:01:25Z, exit **0**, unchanged command:

```
 Test Files  1 passed (1)
      Tests  7 passed (7)
   Duration  1.36s (transform 202ms, setup 0ms, import 306ms, tests 779ms, environment 220ms)
```

# V2 — `npm run build:shared && npx vitest run web/src/components/HomeLauncher.test.tsx`

Working directory: repository root. The command exactly as the card's row
writes it, with the provisioned Node first on `PATH`.

- **Started:** 2026-09-26T10:56:57Z
- **Finished:** 2026-09-26T10:56:59Z
- **Exit code:** 0

## 1. Run of record

```
> @apunta/shared@0.0.0 build
> tsc -p tsconfig.json

 RUN  v4.1.11 <repo root>

 Test Files  1 passed (1)
      Tests  5 passed (5)
   Start at  04:56:58
   Duration  410ms (transform 24ms, setup 0ms, import 72ms, tests 64ms, environment 221ms)
```

The file is **collected**, not vacuous: 1 file / 5 tests, and the five are the
card's Step 1 cases. From a `--reporter=verbose` directory run (§3):

```
 ✓ |web| src/components/HomeLauncher.test.tsx > the A mark above the home greeting > is the first child of the column, and a sibling of the heading 23ms
 ✓ |web| src/components/HomeLauncher.test.tsx > the A mark above the home greeting > leaves the greeting as exactly the question 4ms
 ✓ |web| src/components/HomeLauncher.test.tsx > the A mark above the home greeting > stays the only mark once typing puts an icon on the screen 47ms
 ✓ |web| src/components/HomeLauncher.test.tsx > the A mark above the home greeting > is decorative where it renders, listbox open or not 4ms
 ✓ |web| src/components/HomeLauncher.test.tsx > the A mark above the home greeting > keeps its 48px height and its centring through that interaction 3ms
```

Which Fixed decision each case pins:

| Case | Pins |
| --- | --- |
| first child of the column, sibling of the heading | `HomeLauncher.tsx:70-76` — `inner.firstElementChild` is the `svg[viewBox="0 0 562 754"]`, its `parentElement` is `.home-inner`, and `heading.querySelector('svg')` is `null`, so the mark is a **sibling** of the `h1` and never inside it (A4) |
| leaves the greeting as exactly the question | `heading.textContent` is `Let's focus on…` and nothing else, so the mark never joins the greeting's text |
| stays the only mark once typing puts an icon on the screen | with a search typed into `[data-testid="home-search"]` the listbox opens, the A mark's viewBox still matches **exactly once** inside `.home`, the mark is still `firstElementChild`, and the heading is unchanged. It also asserts `home.querySelectorAll('svg')` is **2**, so the "exactly once" above is the viewBox doing the work and not there being only one svg: the "New" row puts a `PlusIcon` (`viewBox="0 0 24 24"`, `icons.tsx:18`) inside `.home` (`HomeLauncher.tsx:135`) |
| is decorative where it renders, listbox open or not | `aria-hidden="true"` and `focusable="false"` on the mark as the home screen renders it, and `screen.queryByRole('img')` is `null` both before and after the listbox opens |
| keeps its 48px height and its centring through that interaction | `style.height` `48px`, `display` `block`, `marginLeft`/`marginRight` `auto` (shorthand normalised to `0px auto`), after the same interaction — read as the two declarations, as `BrandMark.test.tsx:77-84` does |

The file asserts **no** colour: `--brand-mark`, D10's pair and the token values
belong to `BrandMark.test.tsx`, and a second copy of them would be a second
thing to keep in step. The rendered colours are asserted for real in
`e2e/tests/brand.spec.ts` (V1).

`HomeLauncher` calls `useNavigate` (`:25`), so the render is wrapped in a
`MemoryRouter`, following `AiBanner.test.tsx:9-14` and `TopBar.test.tsx:7-23`.
`patients={[]}` and a `vi.fn()` `onSelect`: no patient, no note, no transcript
(HS-8).

## 2. The first attempt failed, in my own test code

Start 2026-09-26T10:52:06Z (printed by vitest as `Start at 04:52:06`,
local), **exit 1**, 5 failed. All five failed the same way, from
the helper rather than from an assertion:

```
Error: HomeLauncher rendered no home screen, or none with a mark above its heading
 ❯ renderHome src/components/HomeLauncher.test.tsx:49:11
 Test Files  1 failed (1)
      Tests  5 failed (5)
```

The cause is recorded in full in [notes.md](./notes.md) §1: **jsdom's
`querySelector` never matches `svg[viewBox="0 0 562 754"]`**, so the handle
found nothing and the helper's own guard turned that into a clear error rather
than a null-dereference. The fix is in the test — the same viewBox *value* is
matched by hand over `querySelectorAll('svg')` — and it is the reason the
selector appears verbatim only in the Playwright spec, where a real browser
resolves it. The production behaviour the card pins was never in question: the
mark is in the DOM, the first case's assertions are unchanged, and the
`getAttribute` probe in notes.md §1 read back `0 0 562 754`.

## 3. The directory form, and the other 14 files

Supplementary to the row, same content, `--reporter=verbose`:
`npx vitest run web/src/components`, start 2026-09-26T10:57:01Z (printed as
`Start at 04:57:01`), **exit 0**:

```
 Test Files  15 passed (15)
      Tests  122 passed (122)
```

**15 files** is the card's anti-vacuous figure: 14 files / 117 tests is the
base-commit number quoted from P2.1's own evidence, so 15 means the new file
was created *and* collected, and 122 − 117 = 5 is exactly this file's case
count. Every case already in the other fourteen component test files still
passes — 117 of them, unchanged, including P2.1's 21 brand cases
(`BrandMark`, `BrandWordmark`, `TopBar`).

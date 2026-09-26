# V1 — `npm run build:shared && npx vitest run web/src/components`

Working directory: repository root. The command exactly as the card's row writes
it, with the provisioned Node first on `PATH`.

## 1. Run of record

Start 2026-09-26T10:31:02Z, end 10:31:04Z. Exit **0**.

```
> apunta@0.0.0 build:shared
> npm run build --workspace @apunta/shared

> @apunta/shared@0.0.0 build
> tsc -p tsconfig.json

 RUN  v4.1.11 <repo root>

 Test Files  14 passed (14)
      Tests  117 passed (117)
   Start at  04:31:03
   Duration  1.69s (transform 660ms, setup 0ms, import 1.94s, tests 3.22s, environment 3.67s)
```

The card's anti-vacuous guard is satisfied: the filter reports **14** files, not
the 11 it reports at base, so the three new files were created *and* collected.
14 files / 117 tests against a base of 11 / 96 is exactly +3 files / +21 tests,
which is the case count of the three files. Every case already in the other
eleven component test files still passes — 96 of them, unchanged.

The three collected files, each with its seven cases, from a verbose run of the
same filter over the same content (2026-09-26T10:32:07Z, exit 0 — the default
reporter prints only the summary above, so this listing is a supplementary run,
not part of the row):

```
 ✓ |web| src/components/BrandWordmark.test.tsx > the wordmark > names the app, and takes itself out of the tab order 66ms
 ✓ |web| src/components/BrandWordmark.test.tsx > the wordmark > is the name as outlines, in one path that takes its colour from the caller 3ms
 ✓ |web| src/components/BrandWordmark.test.tsx > the wordmark > takes the brand colour by default 3ms
 ✓ |web| src/components/BrandWordmark.test.tsx > the wordmark > paints in the foreground colour when the caller asks for that placement 2ms
 ✓ |web| src/components/BrandWordmark.test.tsx > the wordmark > sizes itself from the --logo-h token, which is one number for the whole app 2ms
 ✓ |web| src/components/BrandWordmark.test.tsx > the wordmark > lets a caller pass an exact height instead of the token 1ms
 ✓ |web| src/components/BrandWordmark.test.tsx > the wordmark > never takes its colour from the accent 2ms
 ✓ |web| src/components/TopBar.test.tsx > the top bar with no back link > is the wordmark and nothing else 24ms
 ✓ |web| src/components/TopBar.test.tsx > the top bar with no back link > names the app exactly once, through the wordmark itself 68ms
 ✓ |web| src/components/TopBar.test.tsx > the top bar with no back link > paints the mark in the foreground colour at the --logo-h height 6ms
 ✓ |web| src/components/TopBar.test.tsx > the top bar with no back link > has no MarkIcon left, and nothing coloured by the accent 2ms
 ✓ |web| src/components/TopBar.test.tsx > the top bar with no back link > has no second, aria-hidden mark 2ms
 ✓ |web| src/components/TopBar.test.tsx > the top bar with a back link > is the back link, with the back icon 9ms
 ✓ |web| src/components/TopBar.test.tsx > the top bar with a back link > is not the wordmark as well 2ms
 ✓ |web| src/components/BrandMark.test.tsx > the A mark > is decorative, because something else already names the app 16ms
 ✓ |web| src/components/BrandMark.test.tsx > the A mark > is the outline in one path, not the name in a font 2ms
 ✓ |web| src/components/BrandMark.test.tsx > the A mark > is 48px tall, and its width follows the outline 1ms
 ✓ |web| src/components/BrandMark.test.tsx > the A mark > centres itself in its block 1ms
 ✓ |web| src/components/BrandMark.test.tsx > the A mark > is coloured by the brand token, not by the accent 1ms
 ✓ |web| src/components/BrandMark.test.tsx > the A mark > follows D10: the brand teal in light mode, white in dark, declared once each 0ms
 ✓ |web| src/components/BrandMark.test.tsx > the A mark > never resolves its colour from the accent 2ms
```

Every one of the 21 new cases is named there, and the eleven pre-existing files'
96 cases are in the same run, unlisted here only to keep the excerpt short.

## 2. What the assertions pin, and the two authoring failures on the way

**This is the honest part of the row.** The first two attempts at V1 were red,
both on mistakes in the test files this card wrote, and neither involved
production code.

Attempt 1, 2026-09-26T10:28:44Z, exit **1** — `Test Files 3 failed | 11 passed
(14)`, `Tests 1 failed | 102 passed (103)`:

```
 ❯ |web| src/components/BrandWordmark.test.tsx (0 test)
 ❯ |web| src/components/BrandMark.test.tsx (0 test)
 ❯ |web| src/components/TopBar.test.tsx (7 tests | 1 failed) 72ms
     × paints the mark in the foreground colour at the --logo-h height 2ms

 FAIL  |web| src/components/BrandMark.test.tsx [ web/src/components/BrandMark.test.tsx ]
TypeError: The URL must be of scheme file
 ❯ src/components/BrandMark.test.tsx:18:16
    18| const TOKENS = readFileSync(new URL('../styles/tokens.css', import.met…
```

Two causes, both mine:

1. `readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8')`
   fails under this runner. A probe — a temporary `throw` in the module scope of
   one of my own new test files, reverted on the spot — showed why:
   `import.meta.url` is a `file:` URL
   (`file:///<repo>/web/src/components/BrandMark.test.tsx`), but the same
   `new URL('../styles/tokens.css', import.meta.url)` resolves to
   `http://localhost:3000/src/styles/tokens.css` — Vite rewrites the
   `new URL(<literal>, import.meta.url)` pattern at transform time, so the base
   is replaced with the dev-server origin before the code ever runs. The fix is
   `resolve(dirname(fileURLToPath(import.meta.url)), '../styles/tokens.css')`,
   which Vite leaves alone. A `?raw` import of the `.css` file was tried first
   and is not a way out either: this project sets `css: false`
   (`web/vite.config.ts`), so `import tokens from '../styles/tokens.css?raw'`
   resolves to the empty string and the token assertions saw `[]`.
2. One TopBar case called `screen.getByRole('img', { name: 'Apunta' })` without
   rendering first, so it queried a body the previous test's `cleanup()` had
   emptied (`TestingLibraryElementError: … There are no accessible roles`).
   A missing `renderTopBar()`.

Both were fixed in the test files and nothing else was changed. No assertion was
weakened to get green, and no case was deleted.

## 3. Baseline: the same filter without the three new files

Start 2026-09-26T10:30:03Z, end 10:30:04Z, exit **0**.

```
npx vitest run web/src/components \
  --exclude '**/BrandWordmark.test.tsx' \
  --exclude '**/BrandMark.test.tsx' \
  --exclude '**/TopBar.test.tsx'

 Test Files  11 passed (11)
      Tests  96 passed (96)
```

This reproduces the card's stated base figure exactly (11 files / 96 tests) and
is what makes 14 / 117 legible: the other eleven files contributed the same 96
tests before and after.

## 4. Supplementary sensitivity pass — the new expectations can fail

Not a card row, and reverted before the run of record. One expectation in each
of the three new files was changed to the value the card's *retired* text
implies, to prove each assertion is reached and to capture the value the shipped
code actually produces:

| File | Expectation changed to | Result |
| --- | --- | --- |
| `BrandWordmark.test.tsx` | `tone="text"` colour → `var(--brand-mark)` | failed |
| `BrandMark.test.tsx` | height → `47px` | failed |
| `TopBar.test.tsx` | wordmark height → `22px` | failed |

```
 Test Files  3 failed (3)
      Tests  3 failed | 18 passed (21)

 FAIL  |web| src/components/TopBar.test.tsx > the top bar with no back link > paints the mark in the foreground colour at the --logo-h height
AssertionError: expected 'var(--logo-h)' to be '22px' // Object.is equality
Expected: "22px"
Received: "var(--logo-h)"
 ❯ src/components/TopBar.test.tsx:62:63
```

The observed values are the shipped ones and confirm the two retired rules stay
retired: the top bar's mark is `var(--logo-h)`, not `22px`, and `tone="text"`
paints `var(--text-primary)`, not `var(--brand-mark)`. The three files were
restored from a copy taken immediately before the mutation, and the run of
record in §1 is on the restored content.

## 5. Case inventory

**`BrandWordmark.test.tsx` (7)** — the assertions V1 names, all read off
`BrandWordmark.tsx` and `tokens.css` at base:

| Case | Pins |
| --- | --- |
| names the app, and takes itself out of the tab order | `role="img"`, `aria-label="Apunta"`, `focusable="false"` (`:33-35`) |
| is the name as outlines, in one path that takes its colour from the caller | `viewBox="0 0 2903 1012"`, exactly one `<path>`, `fill="currentColor"`, no text node (`:32,42-45`) |
| takes the brand colour by default | inline `color` is `var(--brand-mark)` for the default tone and for `tone="brand"` (`:37`) |
| paints in the foreground colour when the caller asks for that placement | `tone="text"` → `var(--text-primary)` (`:37`) |
| sizes itself from the --logo-h token, which is one number for the whole app | `height: var(--logo-h)`, `width: auto` (`:38-39`), and `--logo-h` is declared exactly once in `tokens.css:132` and is `20px` |
| lets a caller pass an exact height instead of the token | `height={32}` → `32px` (`:38`) |
| never takes its colour from the accent | no `--accent` anywhere in the rendered markup, default tone or `tone="text"` |

**`BrandMark.test.tsx` (7)** — all read off `BrandMark.tsx`:

| Case | Pins |
| --- | --- |
| is decorative, because something else already names the app | `aria-hidden="true"`, `focusable="false"`, and no `img` role and no label in the accessibility tree (`:19-20`) |
| is the outline in one path, not the name in a font | `viewBox="0 0 562 754"`, one `<path>`, `fill="currentColor"`, no text node (`:18,29-32`) |
| is 48px tall, and its width follows the outline | `height: 48px`, `width: auto` (`:24,26`) |
| centres itself in its block | `display: block`, `margin: 0 auto` (`:23,25`) |
| is coloured by the brand token, not by the accent | `color: var(--brand-mark)` (`:22`) |
| follows D10: the brand teal in light mode, white in dark, declared once each | `--brand-mark` is exactly `#1f6f63` then `#ffffff` in `tokens.css:183,332` |
| never resolves its colour from the accent | no `--accent` in the rendered markup |

Two notes on the mark's assertions, so a reviewer does not read them as
weakened. jsdom normalises the `margin: 0 auto` shorthand to `0px auto`, so that
case asserts `marginLeft`/`marginRight` are `auto` *and* the serialised
declaration. And the D10 case asserts the pair by value and by count, which is
what "each declared exactly once" means: a second `--brand-mark` in either
theme block, or a value derived from `var(--accent)`, fails it.

**`TopBar.test.tsx` (7)** — `MemoryRouter` around the component, the shape at
`AiBanner.test.tsx:9-14`:

| Case | Pins |
| --- | --- |
| is the wordmark and nothing else | exactly one `svg`, `textContent` empty, zero `span` (`:18-26`) |
| names the app exactly once, through the wordmark itself | `getAllByRole('img', { name: 'Apunta' })` has length 1, and it is the wordmark's `viewBox` |
| paints the mark in the foreground colour at the --logo-h height | `tone="text"` ⇒ `var(--text-primary)`, height `var(--logo-h)` and **not** `22px` (`:25`) |
| has no MarkIcon left, and nothing coloured by the accent | no `.mark`, no `span.brand`, no `[stroke]`, no `--accent` in the markup |
| has no second, aria-hidden mark | zero `[aria-hidden="true"]` in the bar |
| is the back link, with the back icon | the `Link` renders with its `href`, the `a.back` is that link, and it holds an `svg` (`:32-35`) |
| is not the wordmark as well | no `img` named "Apunta", no wordmark `viewBox`, still exactly one `svg` |

The three negative cases are the ones a regression would otherwise pass
silently: a `MarkIcon` scribble, a typed `span.brand` label or a second hidden
mark would each leave the top bar looking roughly right while saying the name
twice to a screen reader.

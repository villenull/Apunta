# UI-TEAL — independent instruction review

Base: `1a2745a`. Reviewer: instruction review only — no implementation, no
tests run, no git changes, no delegation, no network, no live data or port.

## Verdict: CLEAR, with two in-scope defects that must be fixed in the same
## commit (D1, D2). No missing necessary path; no contradiction in the owner's
## instruction. #2a9d8f stands as chosen; the 3:1 threshold, `PAGE_SURFACES` and
## every existing assertion stay untouched.

## What the change actually touches (read, not assumed)

- `shared/src/settings.ts:77` is the single constant; `isAccentColor` (85-87)
  is the only gate, so a six-digit hex is the whole grammar.
- `web/src/lib/accent.ts:65` reads that constant, not a literal — **no edit
  needed in `accent.ts`**, which is why it is correctly absent from the scope.
- `web/src/lib/accent.ts:47-61`: an unset/unusable value *removes* `--accent`,
  `--on-accent`, `--accent-ink` (49-53). So the static value in `tokens.css`
  is what a fresh install and any store without `accent_color` actually get.
- `web/src/routes/Settings.tsx:603-604`: reset applies **and** PUTs
  `DEFAULT_ACCENT_COLOR`. So the constant is the one and only source of the
  default; nothing else needs to learn the hex.
- Therefore: explicit saved colour is preserved — a stored `#218677` still
  paints `#218677` via the inline style (App.test.tsx:1335-1349 covers exactly
  that, custom then reset). The new default reaches the screen through
  `tokens.css:228` plus the constant. Scope is sufficient.

## D1 (must fix) — `web/src/routes/Settings.test.tsx:438`

`const CLEAR = '#218677'; // the default: 4.20 light, 4.12 and 4.26 dark`

Every figure in that comment is false for the new default, and `CLEAR` is the
colour that must *not* raise the warning (466, 470-476). Recomputed with the
same WCAG formula the test uses (`accentLuminance`, Settings.tsx:735-742):
`#2a9d8f` → `#f5f4ed` 3.01 (3.014568571551292), `#faf9f5` 3.16, `#151515` 5.49,
`#111111` 5.68. So: bind `CLEAR` to the imported `DEFAULT_ACCENT_COLOR`
(`@apunta/shared` is already imported at line 5) and correct the comment to the
measured four. The assertion semantics stay exactly as they are — `CLEAR`
clears 3:1, `PALE`/`DIM`/`EDGE`/`SIDEBAR` still do not.

Carry the margin into the comment honestly: the light sidebar sits **0.015**
above the line. That is the number a future reader needs.

## D2 (must fix) — `web/src/styles/tokens.css:212-222`

That comment is already wrong before this change and becomes wronger:

1. It claims "`accentInk` darkens this to `#000000` for `--on-accent`".
   False: `accentInk` feeds `--accent-ink` (238); `--on-accent` is chosen
   independently at `accent.ts:59` by comparing white vs black contrast. The
   owner's own reading: `accentInk(#2a9d8f)` = `#217e73` at 4.89:1 on white,
   while `--on-accent` = `#111111` at 6.32:1 (vs black) against white 3.32.
2. It claims the default "clears 4.5:1 against the dark surfaces … and the
   light one (4.20:1)". The new default does not clear 4.5:1 on **either**
   light surface. Replace with the measured values and with the actual
   mechanism (near-black foreground chosen by luminance, not `accentInk`).

`--on-accent: #fff` → `#111111` at line 237 is correct and necessary: with no
stored setting, `applyAccentColor` removes the property (49-53) and the static
token is the only foreground, so `#fff` would leave 3.32:1 on the accent in
light mode. `#111111` also matches exactly what `accent.ts:59` computes for
this hue, so the fresh-install path and the reset path agree.

## Required focused check (fits the existing test path, no new file)

In `Settings.test.tsx`, next to the existing `tokenValues` reader (422-432),
assert the two paths agree: the static `--on-accent` parsed out of
`tokens.css` equals the value `applyAccentColor(DEFAULT_ACCENT_COLOR)` sets,
and equals `#111111`. That is the consistency the owner asked to be covered —
a fresh install and a reset-to-default painting differently is the one
regression this change can introduce and the one no current test would catch.
Sufficient as a single focused case inside the existing describe; no extra
scope required.

## `e2e/tests/brand.spec.ts` — in scope, but four more literals than "the
## default"

- `DEFAULT_ACCENT` (66) → `#2a9d8f`, which also re-labels the test names
  (312, 328) and the invariance key (235).
- **Painted** `rgb(33, 134, 119)` → `rgb(42, 157, 143)` at 91, 93, 103, 105.
  These are literal expected painted defaults; without them the spec fails.
- Doc comments pinning the old hex and the 4.74:1 figure: 25-27, 46.
- No contrast assertion exists in this spec, so the 3.01 light sidebar does not
  fail the run. Side effect to record, not to fix here: the four committed
  evidence PNGs (`docs/v2/evidence/P2.2/screenshots/`) are rewritten by the
  run (241). Outside the five paths; the spec writes rather than compares them.

## Hard stops respected

No 3:1 threshold loosened (`LOW_CONTRAST_RATIO` untouched), no surface list
trimmed, no existing assertion deleted, no real data, no prototype value
adopted as a default, no network. The owner's stated acceptance of 4.20→3.16
is consistent with the sources; the 3.01 sidebar figure is the part of the same
fall the owner has not been shown, recorded here rather than re-litigated.

## Commands actually run (read-only inspection; all exit 0)

- `git log --oneline -1` → `1a2745a`; `git status --porcelain` → 0
- `grep -n "218677\|2a9d8f\|on-accent\|DEFAULT_ACCENT" <5 files> + shared/src/settings.test.ts + web/src/lib/accent.test.ts` → 0
- `grep -n "accent" web/src/styles/tokens.css` → 0
- `grep -n "contrast\|ratio\|warn" web/src/routes/Settings.tsx` → 0
- `grep -n "ratio\|contrast\|toBeGreaterThan" e2e/tests/brand.spec.ts` → 0
- `git ls-files docs/v2/evidence/P2.2/screenshots` → 0 (4 PNGs tracked)
- `node -e` WCAG recomputation of `#218677` / `#2a9d8f` against
  `#f5f4ed #faf9f5 #111111 #151515`, of `#fff`/`#111`/`#000` foregrounds, and of
  `accentInk('#2a9d8f')` → `#217e73` → 0

Lint, typecheck, shared+web vitest, web build and the sandboxed brand e2e were
**not** run: this review is inspection only, and they belong to the implementer
on Node 24 against the five paths.

## Checklist for the implementer

1. `shared/src/settings.ts:77` → `#2a9d8f`.
2. `tokens.css:228` → `#2a9d8f`; `:237` → `#111111`; rewrite 212-222 (D2).
3. `Settings.test.tsx:438` → bind to the constant, correct figures (D1); add the
   static-vs-runtime `--on-accent` case.
4. `App.test.tsx:1168, 1342, 1344, 1349` → the new hex.
5. `brand.spec.ts:66, 91, 93, 103, 105` + comments 25-27, 46.
6. Do not touch `LOW_CONTRAST_RATIO`, `PAGE_SURFACES`, or any assertion.

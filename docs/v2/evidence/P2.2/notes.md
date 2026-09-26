# P2.2 — findings, observations, and the two items the card routes to the coordinator

Everything here was observed during this session. Nothing in this file was
changed, because the card's May-edit list is two test files.

## 1. Observation: jsdom cannot select the A mark by its `viewBox` attribute

**Observed, in my own test code, twice.** The first V2 attempt failed all five
cases with `HomeLauncher rendered no home screen, or none with a mark above its
heading` ([v2-unit.md](./v2-unit.md) §2). The cause is jsdom, not the app:

```js
// rendered DOM: <svg viewBox="0 0 562 754" aria-hidden="true" focusable="false" …>
d.querySelector('svg[viewBox="0 0 24 24"]')   // → null
d.querySelector('[data-x="a b"]')              // → matches
svg.getAttribute('viewBox')                    // → "0 0 562 754"
```

The attribute is present and readable; a CSS **attribute selector** on it simply
never matches, in either case (`viewBox` or `viewbox`), because the HTML parser
rewrites that SVG attribute's camelCase and the selector engine does not line
up with the result. It is not the space in the value — a spaced attribute value
matches fine on a normal attribute.

Consequences, both of which are test-side only:

- `web/src/components/HomeLauncher.test.tsx` matches the same viewBox **value**
  by hand over `querySelectorAll('svg')`, with a comment explaining why. The
  value is the one `BrandMark.test.tsx:58` pins, so the three files still agree.
- `e2e/tests/brand.spec.ts` uses the selector verbatim,
  `page.getByTestId('home').locator('svg[viewBox="0 0 562 754"]')`, because a
  real browser resolves it; the run confirms it resolves to exactly one element
  (the spec asserts `toHaveCount(1)` before reading a colour).

**For the coordinator, not for this card.** `web/src/components/TopBar.test.tsx:102`
— a P2.1 file, in this card's Must-not-edit list — contains
`expect(bar.querySelector(\`svg[viewBox="${WORDMARK_VIEWBOX}"]\`)).toBeNull()`.
By the mechanism above that expression is `null` whether or not the wordmark is
in the bar, so that line asserts nothing; the same case's
`expect(bar.querySelectorAll('svg')).toHaveLength(1)` two lines below still
fails if a wordmark were rendered alongside the back link's icon, so the case
is not toothless — only the `viewBox` line is redundant. Nothing is actually
unpinned anywhere, and the e2e spec now pins the same viewBox positively, but
the line is worth correcting when a card may edit that file. It is the only
`viewBox` attribute selector in the tree's tests.

## 2. Finding for the coordinator: `PUT /api/settings` cannot restore an absent key

Observed in V1's `afterAll` ([v1-e2e.md](./v1-e2e.md) §4). The settings row was
**empty** at the start of the run — a fresh per-run database with neither
`theme` nor `accent_color` — so the card's restore (`PUT` back what `beforeAll`
read) had nothing to write. `PUT /api/settings` is a merge
(`server/src/db/settings.ts`) and there is **no** delete or unset route, so the
two keys the four colour states wrote stay in the row at the last state's
values (`theme: "light"`, `accent_color: "#1f6f63"`).

Not a hazard, and not a stop condition fired: `accent_color` is byte-identical
to `DEFAULT_ACCENT_COLOR` (`shared/src/settings.ts:36`) so the painted accent
matches an untouched install, the one sibling spec that reads appearance state
PUTs `theme` itself before every assertion, and the data directory is per-run.
The spec records the residual in its own output rather than hiding it.

The card-level observation behind it: a `describe` that mutates a global
settings row can restore every key that was *present*, but not one that was
absent. If a future card needs a byte-exact restore, that is a server route to
add, not a test to write differently.

## 3. Reported, not changed: the dead `.home-mark` rule

`web/src/styles/app.css:2928-2931` still carries

```css
.home-mark {
  width: 40px;
  height: 40px;
}
```

and nothing renders it: the A mark is unclassed (`BrandMark.tsx:10-12` takes
only `className`, and `HomeLauncher.tsx:73` passes none), and `grep -rn
"home-mark" web/src` returns that rule and nothing else. So there are now two
sets of dimensions for the same mark in the tree — 40×40 dead, 48 px live — and
the live one is the inline style this card's tests pin. `app.css` is in
Must-not-edit; reporting, as the card directs.

## 4. Reported, not changed: D10 reads wider than the code

`docs/v2/DECISIONS.md:24` (D10) still reads "Wordmark and A mark: `#1f6f63` in
light mode, `#ffffff` in dark mode, independent of accent", which described the
`--brand-mark` token before the 2026-09-26 preview put the top bar's word in the
foreground colour (`BrandWordmark.tsx:8-12`, `TopBar.tsx:19-24`, authorised by
AM-028). The shipped code is unambiguous and this card pins it as the code
reads: the **A mark** is `--brand-mark`; the **wordmark** is `--text-primary`
because both call sites pass `tone="text"`. Neither ever follows `--accent`, so
the decision's second half still holds.

`DECISIONS.md` is in Must-not-edit, and the card calls the re-wording "a
separate amendment for the coordinator, not this card's work". Recording it
here so the amendment has the measured values: wordmark `rgb(38, 38, 32)` light
/ `rgb(240, 238, 230)` dark, confirmed as painted in a real browser
([v1-e2e.md](./v1-e2e.md) §2).

## 5. The window size for the zoom check

The card says the window must be "**at least** 1800 px wide". The spec uses
**1920×1080**, because exactly 1800 halves to exactly 900 CSS px and
`(max-width: 900px)` matches *at* 900 — at precisely 1800 the narrow layout is
still in force, the home greeting has no box, and `boundingBox()` returns
`null`. This is the card's own stop condition ("a defect in the test's window
size, so fix the test, not `app.css`") arriving before the run rather than
during it. Measured layout at 1920: 960×540 CSS px at dpr 2
([v1-e2e.md](./v1-e2e.md) §3).

## 6. Nothing else was found

Every assertion in both files passed on the first run that reached it
(the one exception is §1, a defect in my own test code, fixed in the test). The
shipped behaviour matched Fixed decisions in all of them: the A mark's
`--brand-mark` pair, the wordmark's `--text-primary` pair, `data-theme` carrying
the resolved theme, the 48 px mark, the mark being the first child of
`.home-inner` and a sibling of the `h1`, and the wordmark not touching the
sidebar toggle at 200% zoom. No discrepancy to report against any
Must-not-edit file.

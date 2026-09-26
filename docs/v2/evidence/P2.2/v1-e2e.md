# V1 — e2e, the five `brand:` tests

- **Working directory:** repository root
- **Started:** 2026-09-26T10:56:38Z
- **Finished:** 2026-09-26T10:56:42Z (4s wall; the tests themselves 4.1s)
- **Sandbox run id:** `2026-09-26T10-56-38-259Z-4378cf11`, port **7817**
  (this card's assignment, inside C-ISO@1's 7800–7889 band). Two further runs
  on the same port are in §7.
- **Data directory:** `<sandbox>/2026-09-26T10-56-38-259Z-4378cf11/data` — per
  run, so the blast radius of the settings row this spec writes is this
  Playwright run and nothing else (HS-1)
- **Exit code:** 0

## Command

```sh
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && export PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium && node scripts/v2/sandbox.mjs env --port 7817 > /tmp/p22.env && . /tmp/p22.env && npm run e2e --workspace @apunta/e2e -- --grep "brand"
```

`PLAYWRIGHT_CHROMIUM_EXECUTABLE` is exported **before** the `sandbox.mjs env`
step, because that step prints only `APUNTA_*` variables and
`e2e/playwright.config.ts:21` sets `launchOptions.executablePath` only when the
variable reaches the Playwright process. `--grep` goes through the workspace
script, so it reaches Playwright: the root `npm run e2e` is
`npm run e2e --workspace @apunta/e2e`, and a bare `npm run e2e -- --grep` would
hand the flag to the outer npm.

The `env` step printed:

```
export APUNTA_DATA_DIR='<sandbox>/2026-09-26T10-56-38-259Z-4378cf11/data'
export APUNTA_PORT='7817'
export APUNTA_NO_OPEN='1'
export APUNTA_TEST_RUN_ID='2026-09-26T10-56-38-259Z-4378cf11'
export APUNTA_V2='1'
export APUNTA_CHECK_URL='http://127.0.0.1:7817'
export APUNTA_E2E_PORT='7817'
```

`APUNTA_V2=1` is what makes `playwright.config.ts:67` set
`reuseExistingServer: false`, so the run owns its port and cannot attach to a
stray server. 7717 was never contacted.

## 1. Run of record

The list reporter's own output, with the server's request log lines (which
carry the machine's hostname) removed. Nothing else is filtered.

```
> @apunta/e2e@0.0.0 e2e
> playwright test --grep brand

Running 5 tests using 1 worker

brand: settings read before the run: {} (absent: theme, accent_color)
brand: light/#1f6f63: --accent "#1f6f63" → rgb(31, 111, 99); A mark rgb(31, 111, 99); wordmark rgb(38, 38, 32)
  ✓  1 [chromium] › tests/brand.spec.ts:270:3 › rendered colours and 200% zoom › brand: light, default accent #1f6f63 — A mark rgb(31, 111, 99), wordmark rgb(38, 38, 32) (207ms)
brand: light/#7c3aed: --accent "#7c3aed" → rgb(124, 58, 237); A mark rgb(31, 111, 99); wordmark rgb(38, 38, 32)
  ✓  2 [chromium] › tests/brand.spec.ts:278:3 › rendered colours and 200% zoom › brand: light, accent #7c3aed — A mark rgb(31, 111, 99), wordmark rgb(38, 38, 32) (181ms)
brand: dark/#1f6f63: --accent "#1f6f63" → rgb(31, 111, 99); A mark rgb(255, 255, 255); wordmark rgb(240, 238, 230)
  ✓  3 [chromium] › tests/brand.spec.ts:286:3 › rendered colours and 200% zoom › brand: dark, default accent #1f6f63 — A mark rgb(255, 255, 255), wordmark rgb(240, 238, 230) (156ms)
brand: dark/#7c3aed: --accent "#7c3aed" → rgb(124, 58, 237); A mark rgb(255, 255, 255); wordmark rgb(240, 238, 230)
  ✓  4 [chromium] › tests/brand.spec.ts:294:3 › rendered colours and 200% zoom › brand: dark, accent #7c3aed — A mark rgb(255, 255, 255), wordmark rgb(240, 238, 230) (165ms)
brand: zoom: window 1920×1080 at 2× → layout 960×540 CSS px, dpr 2; {"mark":{"x":609.109375,"y":162.5038604736328,"width":35.765625,"height":48},"wordmark":{"x":38,"y":14.910116195678711,"width":57.359375,"height":20.000001907348633},"toggle":{"x":4,"y":11.596868515014648,"width":26,"height":26.000001907348633},"bar":{"x":0,"y":2.5968685150146484,"width":299,"height":44.00000190734863},"inner":{"x":347,"y":162.19061279296875,"width":560,"height":166.796875},"search":{"x":347,"y":274.98748779296875,"width":560,"height":54}}
brand: settings restored with {} → theme="light" accent_color="#1f6f63"; absent before the run and still stored after it (a merge cannot unset): theme="light", accent_color="#1f6f63"
  ✓  5 [chromium] › tests/brand.spec.ts:327:3 › rendered colours and 200% zoom › brand: at 200% zoom the wordmark and the sidebar toggle do not overlap, and the A mark is 48px and centred (145ms)

  5 passed (4.1s)
```

`Running 5 tests using 1 worker` is the card's anti-vacuous guard satisfied: the
run lists **only** the five `brand:` tests, not the whole suite, and not
`No tests found`. Every title carries its state and its expected pair, so this
listing is the evidence for the four pinned pairs without reading a single
assertion.

## 2. What each state proved

Read from `getComputedStyle` on the two elements, after `data-theme` was
asserted to equal the requested theme on `<html>` — never the literal `system`.

| State | `--accent` declared | `--accent` resolved | A mark | Wordmark |
| --- | --- | --- | --- | --- |
| light, accent `#1f6f63` | `#1f6f63` | `rgb(31, 111, 99)` | `rgb(31, 111, 99)` | `rgb(38, 38, 32)` |
| light, accent `#7c3aed` | `#7c3aed` | `rgb(124, 58, 237)` | `rgb(31, 111, 99)` | `rgb(38, 38, 32)` |
| dark, accent `#1f6f63` | `#1f6f63` | `rgb(31, 111, 99)` | `rgb(255, 255, 255)` | `rgb(240, 238, 230)` |
| dark, accent `#7c3aed` | `#7c3aed` | `rgb(124, 58, 237)` | `rgb(255, 255, 255)` | `rgb(240, 238, 230)` |

Every value is the pair the card's Fixed decisions pin: the A mark is
`--brand-mark` (`tokens.css:183,332`) and the wordmark is `--text-primary`
(`tokens.css:109,310`) because both call sites pass `tone="text"`
(`TopBar.tsx:25`, `PatientsColumn.tsx:100` → `BrandWordmark.tsx:37`).

The accent column is the point of the four states, and it held: the two
non-default runs first assert that the root's `--accent` really resolved to
`rgb(124, 58, 237)`, and then assert both brand colours are **byte-identical**
to what the default-accent run of the same theme measured. The declared string
is the literal hex, not `rgb()`, and both spellings are recorded so the
comparison is on the resolved colour rather than on a serialisation. A mark or
a wordmark that started following `--accent` would pass every unit test in the
tree and fail here — and the screenshots show it: in
`screenshots/dark-accent-7c3aed.png` the "Add your first patient" button is
purple while the A mark is white and the wordmark is the foreground ink.

## 3. The 200% zoom check, and the model it used

**Model: the CDP variant the card names** — `page.setViewportSize({ width:
1920, height: 1080 })` first, then a CDP
`Emulation.setDeviceMetricsOverride` carrying `width: 960, height: 540,
deviceScaleFactor: 2, mobile: false`, which is how Chromium models 200% zoom:
the CSS layout viewport halves and the device pixel ratio doubles. The in-page
check confirms the model took: `innerWidth` 960, `innerHeight` 540,
`devicePixelRatio` 2 — all printed above.

960 is deliberately above the app's `max-width: 900px` breakpoint
(`app.css:3588-3599`), where every column but the active pane is `display: none`
and the home greeting has no box at all. The window is 1920 rather than the
1800 the card names precisely because 1800 halves to exactly 900, where
`(max-width: 900px)` still matches; the card's own stop condition for that trap
says to fix the test's window size, not `app.css`, so the window is 1920. The
spec re-asserts `data-testid="home"` is visible **after** the zoom, so a
viewport that fell below the breakpoint would fail loudly instead of returning
`null` boxes.

Boxes, all in CSS pixels from `boundingBox()`, as measured:

| Element | x | y | width | height |
| --- | --- | --- | --- | --- |
| A mark | 609.109 | 162.504 | 35.766 | **48** |
| wordmark | 38 | 14.910 | 57.359 | 20 |
| sidebar toggle | 4 | 11.597 | 26 | 26 |
| `.col-header-brand` | 0 | 2.597 | 299 | 44 |
| `.home-inner` | 347 | 162.191 | 560 | 166.797 |
| `home-search` | 347 | 274.987 | 560 | 54 |

What that shows, one assertion each:

- **no intersection** between the wordmark (x 38 → 95.359) and the toggle
  (x 4 → 30): a 8 px gap;
- **the wordmark is inside its bar**: x 38 → 95.359 inside 0 → 299 and
  y 14.910 → 34.910 inside 2.597 → 46.597, both asserted with the ±1 px
  tolerance the card allows; the measured margins are 38 px and 11.7 px, so the
  tolerance is not doing any work here;
- **the A mark is 48 px tall**, exactly, at 200% zoom in a 960 px-wide layout;
- **the mark is centred in `.home-inner`**: mark centre 626.992 against the
  column's centre 627.000 — an offset of **0.008 px**, inside the ±1 px
  tolerance the card allows;
- **the mark is clear of the search field**: mark bottom 210.504 against the
  field's top 274.987, a 64.5 px gap, and the boxes do not intersect. The spec
  also asserts the ordering (mark bottom ≤ field top), so "clear" is not
  satisfied by a mark floating below the field.

## 4. The global settings row

| Point | `theme` | `accent_color` |
| --- | --- | --- |
| read by `beforeAll` (`GET /api/settings`) | absent | absent |
| after `afterAll`'s restore (`GET /api/settings`) | `"light"` | `"#1f6f63"` |

The row was empty at the start of the run, so the restore had nothing to write:
`restorable()` sends only the keys that were present, which here is none, and
`PUT /api/settings` is a **merge** (`server/src/db/settings.ts`) with no route
that unsets a key. The two keys the tests created therefore stay stored, at the
values the last state wrote. The spec records this in its own output rather
than hiding it, and asserts per key for every key that *was* present.

This is not a state another spec depends on: `accent_color` is byte-identical
to `DEFAULT_ACCENT_COLOR` (`shared/src/settings.ts:36`), so the painted accent
is unchanged from an untouched install, and the only sibling spec that reads
appearance state, `e2e/tests/settings-appearance.spec.ts`, PUTs `theme` at the
start of each of its two tests (`:26`, `:75`) and never reads the accent. The
card's stop condition — "do not leave the sandbox database in a state another
spec depends on" — is satisfied, and the data directory is per-run, so the
residual does not outlive the run.

## 5. Screenshots

Four PNGs, one per colour test, written to a **repository-root-anchored** path
(`resolve(import.meta.dirname, '..', '..', 'docs/v2/evidence/P2.2/screenshots', …)`)
because `npm run e2e --workspace @apunta/e2e` runs Playwright with cwd `e2e/`,
so a relative path would have landed in `e2e/docs/…`:

```
docs/v2/evidence/P2.2/screenshots/light-default-accent.png    28038 bytes
docs/v2/evidence/P2.2/screenshots/light-accent-7c3aed.png    26342 bytes
docs/v2/evidence/P2.2/screenshots/dark-default-accent.png     24781 bytes
docs/v2/evidence/P2.2/screenshots/dark-accent-7c3aed.png      24743 bytes
```

Each shows the home screen with the A mark above `Let's focus on…` and the
wordmark in the sidebar's top bar. Nothing identifying is on screen — one
fabricated note format, no patient, no note, no transcript (HS-8) — so no
masking was needed and none was applied. Both themes and both accents are
visible in them.

## 6. Nothing written under `e2e/`

`git status --porcelain --untracked-files=all e2e/` after the run lists exactly
one path, `e2e/tests/brand.spec.ts` — the spec itself. No `e2e/test-results/`
directory was created (nothing failed, and `test-results/` is gitignored at
`.gitignore:9` anyway) and the tracked `e2e/screenshots/` baseline image was
left alone.

## 7. Two more runs, both green

The row was run three times, all against the same two test files; the middle one
is the run of record in §1.

| Run id | Window (UTC) | Exit | Result |
| --- | --- | --- | --- |
| `2026-09-26T10-55-49-578Z-d16cbb6e` | 10:55:51 → 10:55:56 | 0 | `5 passed (4.1s)` — the first run, unchanged, before `afterAll` was strengthened |
| `2026-09-26T10-56-38-259Z-4378cf11` | 10:56:38 → 10:56:42 | 0 | `5 passed (4.1s)` — §1, the run of record |
| `2026-09-26T10-59-49-472Z-0340a100` | 10:59:49 → 10:59:53 | 0 | `5 passed (4.1s)` — the final confirmation, run after every evidence file was written |

All three list **only** the five `brand:` tests and all three read the same four
colour pairs, the same resolved accents and the same 48 px mark. The two edits
between them were both in `afterAll`: the first run's version only recorded the
restore, and the run-of-record version asserts the restored value of every key
that was present (§4) and prints the residual for the keys that were not.

The geometry is reproducible to sub-pixel: the final run measured the mark at
`y 162.5027` and the search field at `y 274.9857`, against §3's `162.5039` and
`274.9875` — a difference under 0.002 px, which is why §3's tolerances are
±1 px on containment and ±0.5 px on the 48 px height rather than exact string
matches. `boundingBox()` returned CSS pixels, not device pixels, at
`deviceScaleFactor: 2`; the mark's height was exactly `48` in all three runs.

The card asks for the first run specifically: this behaviour already exists, so
a pass on the base commit is the expected outcome and the evidence, not a
missing failure.

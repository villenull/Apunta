# S2.6, attempt 2: V1, and the one failure that is not this card's

Base `85c3fd2`, sandbox run `<sandbox>` on 7833 (English) and 7834 (es-MX).
Node v24.19.0, `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium`,
`APUNTA_V2=1`, `APUNTA_DATA_DIR` under `<sandbox>`.

```
cd <sandbox repo root>
export PATH="$HOME/.local/share/mise/installs/node/24.19.0/bin:$PATH"
export PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium
. <sandbox>.env          # node scripts/v2/sandbox.mjs env --port 7833
```

## V1 — the bilingual e2e line (FAIL, for a reason outside this card)

```
npm run e2e -- --workers=1
2026-09-29T15:45Z -> 15:46Z   exit 1
  2 failed / 6 skipped / 50 did not run / 54 passed (39.8s)
  ✘ [chromium]      tests/settings-appearance.spec.ts:77  moves and selects the
                    theme with the arrow keys
  ✘ [es-MX-language] tests/language-control.spec.ts:385  V3 on the dialog:
                    switching applies at once and survives leaving the
                    workspace and coming back, no reload
```

The run stops the `es-MX` project, because `es-MX` `dependencies` on
`es-MX-language` and a failed dependency is not run. That project is where
`checkScreen` runs on every screen, so the suite was re-run for it alone, with
the dependency skipped rather than removed:

```
npx playwright test --config e2e/playwright.config.ts --workers=1 \
  --project=es-MX --no-deps
exit 0
  50 passed (1.1m)
```

`--no-deps` is a Playwright flag, not a change to the config: both servers are
still started by the same `webServer` block, the es-MX project still runs with
`appLocale: 'es-MX'` against the `APUNTA_DEV_SPANISH=1` server on 7834, and
`checkScreen` is still called unconditionally for `appLocale === 'es-MX'`. All
50 of the Spanish screens pass the no-English check with the repaired
catalogue, including `plan.spec.ts`'s `the treatment plan in force`, whose
`checkScreen` runs over the Spanish attestation — that is V12, and it passes.

An earlier full run in the same attempt, before the catalogue was reverted for
V17b, was `55 passed / 1 failed` with the same single V3 failure; the
`settings-appearance` failure is the only difference between the two runs.

## The two failures, separated

### `settings-appearance.spec.ts` — a flake, not a regression

```
[chromium] › settings-appearance.spec.ts:95
  expect(getByTestId('theme-dark')).toHaveAttribute('aria-checked', 'true')
  14 × unexpected value "false"
```

It passed in the previous full run, and passes 3/3 in isolation:

```
for i in 1 2 3; do npx playwright test --config e2e/playwright.config.ts \
  --workers=1 --project=chromium \
  -g "moves and selects the theme with the arrow keys"; done
  run1 exit 0   run2 exit 0   run3 exit 0   (1 passed, 4.9s each)
```

The box was under load — card P3.1 is working in this same tree in parallel —
which is the ordinary explanation for a keyboard-event timing test losing a
race. No theme code, key or test was changed.

### `language-control.spec.ts` V3 on the dialog — a real, pre-existing failure

```
[es-MX-language] › language-control.spec.ts:426
  await expect(page).toHaveURL(/\/$/);
    14 × locator resolved to <html>…</html> — unexpected value "about:blank"
```

**It is present at the base with this card's change reverted**, which is the
control for the control. `shared/src/i18n/es-MX.ts` was replaced with
`git show HEAD:shared/src/i18n/es-MX.ts` (the base value
`'Inglés (Estados Unidos)'`), `shared` rebuilt, and the single test run:

```
npx playwright test --config e2e/playwright.config.ts --workers=1 \
  --project=es-MX-language -g "V3 on the dialog"
exit 1   — identical failure, identical line
```

So the catalogue repair neither causes nor cures it. The cause is readable from
the test: at `language-control.spec.ts:423-425` the case leaves the workspace
with `page.getByTestId('home-link').click()` — `<Link to="/">` in
`PatientsColumn.tsx` — while the page is **already** at `/` (it did
`page.goto('/')` at the start of the case). A react-router `Link` to the
current location adds no history entry, so the history is `[about:blank, /]`
and `page.goBack()` lands on `about:blank` rather than on `/`.

The passing sibling, `settings-appearance.spec.ts:51-53`, leaves by a
**different** route (`getByRole('link', { name: 'Patients' })`) and asserts
`/\/settings$/` after `goBack()`, which is a real two-entry history and is why
it is not affected.

**This card cannot fix it and did not try.** `e2e/tests/language-control.spec.ts`
is the UI owner's file after the AM-063 retarget, it is not in this card's
May-edit list, and a second writer in that file is exactly what the card
warns about. AM-063 already anticipates this shape of problem: the same file
holds one assertion this card must not "fix" either. The one-line change that
would make it green is to leave for a route other than `/` before `goBack()`,
mirroring `settings-appearance.spec.ts`; that is a recommendation, not a
change.

Per the card, this is reported as a stop condition rather than answered by
editing a guard, and no guard was edited.

## V2, V12, V13, V14 — evidenced inside the runs above

| Row | Where | Result |
| --- | --- | --- |
| V2 | `[es-MX-language] V2 on the dialog: disabled with its reason while a refine streams, and the server refuses a direct change` | passed, including the dialog's `checkScreen` with nothing in flight (line 382) |
| V12 | `[es-MX] plan.spec.ts:58 the treatment plan › drafts goals she owns, reviews the plan, and prepares for the session`, asserting the approved Spanish sentence and `checkScreen(page, 'the treatment plan in force')` | passed |
| V13 | `[chromium] plan.spec.ts:58`, same case on the English server | passed |
| V14 | `plan.spec.ts:245 V14: the English attestation is attributed to its own key, and the Spanish one to none` | passed in both projects |

V2 was re-run alone after the V17b restore, so it is not resting on the V17b
scratch state: `exit 0, 1 passed (8.4s)`.

## Side effect to be aware of

The e2e line rewrites four committed PNGs in `docs/v2/evidence/P2.2/screenshots/`
(`dark-accent-7c3aed`, `dark-default-accent`, `light-accent-7c3aed`,
`light-default-accent`) — the accent spec regenerates its own evidence. They
are now modified in the working tree and are **not** this card's output. Leave
them to the coordinator: they are either a legitimate refresh by P2.2's spec
or should be reverted, and this card has no view. Raw Playwright output and
`test-results/` were not committed.

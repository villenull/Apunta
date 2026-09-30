# S2.9 — runs

**Card:** S2.9, role IMPLEMENTATION, L1. **Base commit:** `ff31d42` (HEAD for the
whole session). **Date:** 2026-09-30 (UTC times below). **Sandbox:** one
`scripts/v2/sandbox.mjs env --port 7850` run, created once and sourced for every
command here: run folder `<sandbox>` (`/tmp/apunta-v2/<runId>/`), English server
on `7850`, es-MX server on `7850 + 1` with `<sandbox>/data-es-MX`
(`e2e/playwright.config.ts:32-36`). Env file `/tmp/apunta-v2-s2.9-e2e.env`,
outside the checkout. `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium` is
exported on every Playwright command: the box's documented escape hatch
(`e2e/playwright.config.ts:57-61`), needed because `~/.cache/ms-playwright`
holds a revision the installed `@playwright/test` does not ask for. Nothing was
downloaded (HS-3); **7717 was never contacted**; no live data was opened.

The suite runs in fake-AI mode (`e2e/playwright.config.ts:48-55`) and every row
it creates is fabricated through its own API calls (HS-8). `7850` and `7851` were
verified free of listeners after the last run.

`docs/v2/evidence/P2.2/screenshots/` was restored with
`git checkout -- docs/v2/evidence/P2.2/screenshots/` after **every** Playwright
run in this session (15 of them). V4 below is the proof.

---

## Step 1 — the tripwire, at the base, before anything was edited

The RUN-CONFIG §3 e2e line, three times, default workers, tree at `ff31d42`.

```
node scripts/v2/sandbox.mjs env --port 7850 > /tmp/apunta-v2-s2.9-e2e.env
. /tmp/apunta-v2-s2.9-e2e.env
for i in 1 2 3; do
  PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run e2e
  echo "run $i exit=$?"
  git checkout -- docs/v2/evidence/P2.2/screenshots/
done
```

| Run | Window (UTC) | Exit | Result |
| --- | --- | --- | --- |
| 1 | 00:10:38 → 00:11:29 | **0** | 106 passed, 6 skipped |
| 2 | 00:11:29 → 00:12:22 | **1** | 105 passed, 6 skipped — `settings-appearance.spec.ts:21` (chromium) |
| 3 | 00:12:22 → 00:13:14 | **0** | 106 passed, 6 skipped |

Run 2's failure, verbatim:

```
  1) [chromium] › tests/settings-appearance.spec.ts:21:1 › settings appearance: keeps the chosen theme after leaving Settings and coming back, no reload
    Error: expect(locator).toHaveAttribute(expected) failed
    Expected: "true"
    Received: "false"
    > 64 |   await expect(light).toHaveAttribute('aria-checked', 'true');
      65 |   await expect(root).toHaveAttribute('data-theme', 'light');
```

That is the theme race the card names, at the reload window
`settings-appearance.spec.ts:63-65` — so the tripwire is reproduced (1 of 3 here;
3 of 4 and 2 of 3 in the review's own base evidence) and Stop condition 1 does
not apply. A later base comparison (§Base comparison) is in `findings.md`.

---

## V1 — the amplified, targeted repetition (the cheap localiser)

```
node scripts/v2/sandbox.mjs env --port 7850 > /tmp/apunta-v2-s2.9-e2e.env && . /tmp/apunta-v2-s2.9-e2e.env && ( cd e2e && PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npx playwright test --project=chromium --repeat-each=3 --workers=4 settings-appearance.spec.ts workspace.spec.ts brand.spec.ts plan.spec.ts ) && ( cd e2e && PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npx playwright test --project=chromium --repeat-each=1 formats.spec.ts )
```

| Invocation | Window (UTC) | Exit | Result |
| --- | --- | --- | --- |
| 1 — `--repeat-each=3 --workers=4`, four theme racers + `plan.spec.ts` | 00:22:36 → 00:22:58 | **0** | 60 passed, 0 skipped (21.6s) |
| 2 — `--repeat-each=1 formats.spec.ts` (Fixed decision 2) | 00:23:04 → 00:23:13 | **0** | 6 passed, 0 skipped (8.8s) |

The row is the `&&` chain of the two, so the row exits **0**. No separate
`npm run build`: the `webServer` command at `e2e/playwright.config.ts:119` is
`npm run build && node server/dist/index.js`, so the build is inside the row.

### The measured hold `H`, and the arithmetic it was checked against

`releaseAppearanceLock()` logs its own hold's duration
(`appearance-lock: held <n>ms by pid <n>`), so `H` is measured rather than
estimated. Every hold in V1's first invocation, in order (30 acquisitions = 10
per repeat: 8 lock-taking tests + the hook pair's 2 short holds):

```
appearance-lock: held 11ms    appearance-lock: held 238ms   appearance-lock: held 205ms
appearance-lock: held 683ms   appearance-lock: held 276ms   appearance-lock: held 373ms
appearance-lock: held 248ms   appearance-lock: held 193ms   appearance-lock: held 4ms
appearance-lock: held 308ms   appearance-lock: held 7ms     appearance-lock: held 198ms
appearance-lock: held 271ms   appearance-lock: held 208ms   appearance-lock: held 278ms
appearance-lock: held 230ms   appearance-lock: held 4ms     appearance-lock: held 498ms
appearance-lock: held 606ms   appearance-lock: held 337ms   appearance-lock: held 7ms
appearance-lock: held 560ms   appearance-lock: held 210ms   appearance-lock: held 202ms
appearance-lock: held 247ms   appearance-lock: held 255ms   appearance-lock: held 221ms
appearance-lock: held 333ms   appearance-lock: held 346ms   appearance-lock: held 3ms
```

- **Measured `H` = 683 ms** (the longest of the five `brand.spec.ts` tests, whose
  window is nearly the whole test because the PUT is inside `openHome` and
  `assertPainted` reads back what it wrote — exactly the test the card names for
  the measurement). The 11/7/4/3 ms holds are the two hook windows and the
  zoom test's post-PUT geometry.
- **Workers in force: `W = 4`** (`--workers=4` as the row specifies).
- **Cap:** `H = 0.683 s ≤ 6 s`. **Worst wait** `(W − 1) × H = 3 × 0.683 =
  2.05 s`, against the acquisition deadline and Playwright's default test
  timeout: **2.05 s < 20 s < 24 s < 30 s**. The measured hold is 8.8× under the
  cap, so no hold was narrowed and the sanctioned response to an over-cap `H`
  (move work that cannot observe the row outside it) was not needed.
- The 24 acquisitions of the row (8 lock-takers × 3) plus the hook pair's 6 are
  30, and they recycled through a queue at most three deep; nothing waited
  anywhere near the deadline, and no run produced a lock message.

No stale lock was left behind by any run in this session (checked after every
V3 run: `no stale lock after run N`).

---

## V2 — the L1 gate and the changed-path check

```
npm run lint && npm run typecheck
git diff --name-only ff31d42
```

| Command | Window (UTC) | Exit | Result |
| --- | --- | --- | --- |
| `npm run lint` | 00:23:19 → 00:23:26 | **0** | eslint, `prettier --check .`, `check-no-external-urls`, `collect-licenses --check` (111 packages), `check-ui-strings` all clean |
| `npm run typecheck` | 00:23:30 → 00:23:36 | **0** | `build:shared` then typecheck in shared, server, installer, web, **e2e** |

`git diff --name-only ff31d42` (working tree against the base, since the change
is left uncommitted), re-run at the end of the session:

```
e2e/support/fixtures.ts
e2e/tests/brand.spec.ts
e2e/tests/formats.spec.ts
e2e/tests/settings-appearance.spec.ts
e2e/tests/workspace.spec.ts
```

Five paths, all of them May edit. `e2e/playwright.config.ts` does not appear and
was not opened for writing; `e2e/support/no-english.ts` does not appear and was
not opened for writing; no production file appears. The two required outputs
(`docs/v2/state/returns/S2.9.md`, `docs/v2/evidence/S2.9/`) are excluded from
that check (AM-017). No Markdown prettier result is offered as evidence:
`.prettierignore` holds `*.md` and `docs/v2/state/`, so `prettier --check .`
covers zero Markdown files.

---

## V3 — the RUN-CONFIG §3 e2e line, five consecutive runs, default workers

```
. /tmp/apunta-v2-s2.9-e2e.env
for i in 1 2 3 4 5; do
  PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run e2e
  echo "run $i exit=$?"
  git checkout -- docs/v2/evidence/P2.2/screenshots/
done
```

One `env`, so the English server is on `7850` and the es-MX one on `7850 + 1`
with its data folder in the same run folder. No second `env --port` was used.
Nothing was touched between the runs but the screenshot restore. Every run
reported `Running 112 tests using 4 workers` — default workers, `retries: 0`
(`e2e/playwright.config.ts:87-88` untouched), no `--workers` flag anywhere.

| Run | Window (UTC) | Exit | Passed | Skipped | Longest hold |
| --- | --- | --- | --- | --- | --- |
| 1 | 00:23:53 → 00:24:46 | **1** | 104 | 6 | 606 ms |
| 2 | 00:24:46 → 00:25:39 | **0** | 106 | 6 | 638 ms |
| 3 | 00:25:39 → 00:26:31 | **0** | 106 | 6 | 598 ms |
| 4 | 00:26:31 → 00:27:24 | **0** | 106 | 6 | 664 ms |
| 5 | 00:27:24 → 00:28:16 | **0** | 106 | 6 | 770 ms |

**4 of 5 exit 0, not 5 of 5.** Run 1's two failures are recorded verbatim below
and analysed in `findings.md`: both are a **different** cross-spec race on the
shared database, in files this card does not open, and both reproduce at the
base commit with this card's change reverted. Neither is the theme row and
neither is the formats count.

- Passed/skipped counts are identical across the four green runs (106/6). The
  six skipped are the same six the serial run reported
  (`S2.8-impl.md:74`): `language-control.spec.ts:104`, `:154`, `:203`, `:268`,
  `:385` in the chromium project, and `language-control.spec.ts:80` ("Language:
  not offered on a build without the dev switch") in `es-MX-language`. No test
  moved into `skipped`, and no named test was lost.
- **`H` re-checked at V3 against the workers actually in force:** `W = 4`
  (default; 8 logical CPUs), longest hold across the five runs **770 ms**, so
  worst wait `3 × 0.770 = 2.31 s`, and **2.31 s < 20 s < 24 s < 30 s** again. CI's
  `W = 1` (`playwright.config.ts:88`) means no queue at all, which is the same
  fact that makes a CI green no evidence.
- Every full-suite run took exactly **20 lock holds** — 8 lock-taking tests plus
  the hook pair's 2 short holds, per project, for two projects. That is the
  proof that nothing else in the suite takes it.
- The es-MX project ran in all five runs and no `checkScreen` call read zero
  strings: no es-MX test failed on a string count, and `e2e/support/no-english.ts`
  is byte-identical to the base (it does not appear in `git diff --name-only
  ff31d42`).
- After each run: `no stale lock after run N`, and
  `git status --porcelain docs/v2/evidence/P2.2/screenshots/` empty.

### V3 run 1, the two failures, verbatim

```
  1) [chromium] › tests/spelling.spec.ts:14:1 › marks a typo in the note body and corrects it from the menu
    Error: expect(locator).toHaveText(expected) failed
        at ~/Projects/Apunta/e2e/tests/spelling.spec.ts:87:61
  2) [es-MX] › tests/plan.spec.ts:58:3 › the treatment plan › drafts goals she owns, reviews the plan, and prepares for the session
    Error: the page logged console errors
        at Object.base.extend.consoleErrors.auto (~/Projects/Apunta/e2e/support/fixtures.ts:82:56)
  2 failed
  6 skipped
  104 passed (53.2s)
```

`spelling.spec.ts:87` is
`expect(page.getByTestId('spelling-menu').getByRole('menuitem', { name: 'The' })).toBeVisible()`
on `/patients/new`; seen once in 15 Playwright runs of this session and never at
the base. The other failure is the `consoleErrors` auto-fixture with two
`Failed to load resource: the server responded with a status of 404 (Not Found)`
entries. Both are diagnosed, with the endpoints named and with base-commit
reproductions, in `findings.md`.

### Diagnostics run after V3 (not V3, and not a substitute for it)

Three further default-worker runs of the same line, unfiltered, to capture the
failure text the V3 filter had dropped, plus two `--trace on` runs of the
chromium project. Their whole purpose is the finding below; none of them is
counted towards V3, and none of them is reported as a pass.

| Run | Window (UTC) | Exit | Result |
| --- | --- | --- | --- |
| D1 | 00:29:32 → 00:30:25 | 1 | 105 passed, 6 skipped — `plan.spec.ts:58` (chromium), two 404s as console errors |
| D2 | 00:30:25 → 00:31:18 | 0 | 106 passed, 6 skipped |
| D3 | 00:31:18 → 00:32:12 | 1 | 105 passed, 6 skipped — `halaxy-import.spec.ts:8` (chromium), two 404s as console errors |
| T1 (chromium project, `--trace on`) | 00:33:54 → 00:34:19 | 0 | 51 passed, 5 skipped |
| T2 (chromium project, `--trace on`) | 00:34:19 → 00:34:45 | 1 | 50 passed, 5 skipped — `halaxy-import.spec.ts:8`; the trace names the 404 |

Across the eight full-suite runs with the change (V3's five + D1–D3), **the two
races this card names did not recur once**: no `settings-appearance.spec.ts`
failure, no `formats.spec.ts` failure, no `brand.spec.ts` failure.

---

## V4 — the P2.2 screenshots are untouched

```
git status --porcelain docs/v2/evidence/P2.2/screenshots/ && git diff --stat -- docs/v2/evidence/P2.2/screenshots/
```

**Empty output, exit 0** (00:44:29Z), after all five V3 runs and every other
Playwright run in the session. The four PNGs (`dark-accent-7c3aed`,
`dark-default-accent`, `light-accent-7c3aed`, `light-default-accent`) are
unmodified and were never staged, edited or committed — the revert after each
run is the only response, and it was applied 15 times.

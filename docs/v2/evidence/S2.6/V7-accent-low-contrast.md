# S2.6 — V7 (AM-053): the accent picker's low-contrast note

Three colours sit just under 3:1 on the real surfaces and would pass a naive check against white or black. WCAG ratios:

| Colour | white | `#faf9f5` | black | `#151515` | `#111111` | Expected |
| --- | --- | --- | --- | --- | --- | --- |
| `#218677` (default) | 4.43 | 4.20 | 4.74 | 4.12 | 4.26 | no note |
| `#939393` | 3.07 | **2.92** | 6.84 | 5.94 | 6.15 | note (light surface) |
| `#5d5d5d` | 6.59 | 6.25 | 3.19 | **2.77** | **2.87** | note (both dark surfaces) |
| `#606060` | 6.29 | 5.97 | 3.34 | **2.90** | 3.00 | note (`#151515` only) |

## 1. Unit: `npx vitest run web/src/routes/Settings.test.tsx`

- cwd: repository root; start 2026-09-27T03:04:00Z; end 2026-09-27T03:04:02Z; exit code 0

```

 RUN  v4.1.11 <repo>


 Test Files  1 passed (1)
      Tests  12 passed (12)
   Start at  21:04:01
   Duration  1.48s (transform 243ms, setup 0ms, import 356ms, tests 849ms, environment 219ms)

```

The cases run once with the page light and once dark. Each under-3:1 colour must show `settings.accentLowContrast`, be referenced by the picker's `aria-describedby`, and still be shown, painted as `--accent` and saved. Raising back to `#218677` must clear it. A further case reads `tokens.css` so the three surfaces cannot drift from the page.

### The tests can fail

Two temporary mutations of `Settings.tsx`, each reverted from a copy afterwards:

- **Naive surfaces**: `PAGE_SURFACES = ['#ffffff', '#000000']`. Exit 1: both theme cases fail (`#939393` and `#5d5d5d` no longer warn).
```
     × warns under 3:1 on the real surfaces, keeps the colour, and clears when raised (light) 18ms
     × warns under 3:1 on the real surfaces, keeps the colour, and clears when raised (dark) 15ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
      Tests  2 failed | 10 passed (12)
```
- **Refuse instead of warn**: `if (accentIsHardToSee(next)) return;` in the picker's `onChange`. Exit 1: both theme cases fail.
```
     × warns under 3:1 on the real surfaces, keeps the colour, and clears when raised (light) 20ms
     × warns under 3:1 on the real surfaces, keeps the colour, and clears when raised (dark) 13ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
      Tests  2 failed | 10 passed (12)
```

## 2. Real browser, through the sandbox

`npm run build`, then `APUNTA_FAKE_AI=1 node scripts/v2/sandbox.mjs run --port 7831 -- node <scratch script>`. The scratch script is outside the repo. It drives `/settings` in `/usr/bin/chromium` via Playwright: it picks the theme, fills the colour input, and reads back the picker, the stored value (`GET /api/settings`), the computed `--accent` and `--brand-mark`, and the note.

- start 2026-09-27T03:03:35Z; end 2026-09-27T03:03:39Z; exit code 0

```
sandbox 2026-09-27T03-03-35-153Z-490ea076 on 127.0.0.1:7831 data <sandbox>
light: #218677 (over)        theme=light picker=#218677 stored=undefined --accent=#218677 --brand-mark=#218677 warning=none
light: #939393 (under)       theme=light picker=#939393 stored=#939393 --accent=#939393 --brand-mark=#939393 warning="This colour may be hard to see on the page, and the Apunta logo uses it too."
light: #5d5d5d (under)       theme=light picker=#5d5d5d stored=#5d5d5d --accent=#5d5d5d --brand-mark=#5d5d5d warning="This colour may be hard to see on the page, and the Apunta logo uses it too."
light: #606060 (under)       theme=light picker=#606060 stored=#606060 --accent=#606060 --brand-mark=#606060 warning="This colour may be hard to see on the page, and the Apunta logo uses it too."
light: after reload          theme=light picker=#606060 stored=#606060 --accent=#606060 --brand-mark=#606060 warning="This colour may be hard to see on the page, and the Apunta logo uses it too."
light: raised to #218677     theme=light picker=#218677 stored=#218677 --accent=#218677 --brand-mark=#218677 warning=none
dark: #218677 (over)         theme=dark picker=#218677 stored=#218677 --accent=#218677 --brand-mark=#218677 warning=none
dark: #939393 (under)        theme=dark picker=#939393 stored=#939393 --accent=#939393 --brand-mark=#939393 warning="This colour may be hard to see on the page, and the Apunta logo uses it too."
dark: #5d5d5d (under)        theme=dark picker=#5d5d5d stored=#5d5d5d --accent=#5d5d5d --brand-mark=#5d5d5d warning="This colour may be hard to see on the page, and the Apunta logo uses it too."
dark: #606060 (under)        theme=dark picker=#606060 stored=#606060 --accent=#606060 --brand-mark=#606060 warning="This colour may be hard to see on the page, and the Apunta logo uses it too."
dark: after reload           theme=dark picker=#606060 stored=#606060 --accent=#606060 --brand-mark=#606060 warning="This colour may be hard to see on the page, and the Apunta logo uses it too."
dark: raised to #218677      theme=dark picker=#218677 stored=#218677 --accent=#218677 --brand-mark=#218677 warning=none
```

The first line's `stored=undefined` is expected. `#218677` is already the default, so filling it fires no change and nothing is written. `--brand-mark` follows every pick, which is the connection the note names. The low colour survives a reload, so the pick is kept and not refused.

Cosmetic, not fixed: while the note shows, the divider above the Theme row is absent. `.settings-row + .settings-row` (`web/src/styles/app.css:3147`) is an adjacent-sibling rule and the note sits between the two rows. `app.css` is not in this card's May edit.

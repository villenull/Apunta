# V3 — unit tests

- **Working directory:** repository root
- **Started:** 2026-09-26T09:26:10Z
- **Finished:** 2026-09-26T09:26:12Z (2s)
- **Exit code:** 0

## Command

```sh
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && npm run build:shared && npx vitest run web/src/components/SettingsProvider.test.tsx web/src/routes/Settings.test.tsx
```

```
> tsc -p tsconfig.json          # @apunta/shared

 RUN  v4.1.11 /home/villenull/Projects/Apunta

 Test Files  2 passed (2)
      Tests  8 passed (8)
   Start at  03:26:10
   Duration  1.25s
```

## The four named cases, and where each is asserted

| Case | Test | What it asserts |
| --- | --- | --- |
| optimistic | `SettingsProvider.test.tsx` — *applies the patch to its own state before the write settles*; `Settings.test.tsx` — *shows and paints the chosen theme before the save settles* | With the `PUT` still held open, the provider already holds `light` (`provider-theme` reads `light`) and the card's segment is `aria-checked="true"` with `document.documentElement.dataset.theme === 'light'`. The segment is derived from the provider, so both are the same fact read twice. |
| rollback | `SettingsProvider.test.tsx` — *restores the value from before that request, for its own keys only*; `Settings.test.tsx` — *returns to Dark, repaints dark and shows the error when the save fails* | A rejected `PUT` puts the theme back to `dark` and `data-theme` back to `dark`, Dark is the checked segment and Light is not, a `role="alert"` carries the server's message, `appearance-saved` never appears, and the store never received the theme. The provider case pins the "its own keys only" half: the failed patch carried `theme` *and* `font_size`, and the font size goes back to `large` — the value from before that request, not to the `default` the record started at — while `animations`, which the request never sent, is untouched. The rejection is the API error, read as the control's message. |
| ordering | `SettingsProvider.test.tsx` — *keeps the newer value when an older response for that key arrives late*, *does not roll the newer value back when the older request fails late*, *counts sequences per key, so a newer request elsewhere is not a stale one* | Two `PUT`s for the theme (`light` then `system`); the newer answer lands first and the older one after, and the provider still reads `system` — for a late success and for a late failure. The third case sends the older request for `theme` and the newer one for `font_size`, so the theme's answer is not stale and its rollback still applies. |
| radio | `Settings.test.tsx` — *moves and selects with the arrow keys, and tabs into the selected option* | In the Drafting model group: `ArrowRight` on Quick selects Thorough (`aria-checked`, and the roving `tabindex` moves with it), `ArrowLeft` goes back, the save carries `llm_profile`, focus follows the arrows, and the group starts with exactly one tab stop — on the selected option. |

## Why these tests are believed

Each was run against a deliberately broken provider or card, and failed:

| Mutation | Failing tests |
| --- | --- |
| `stillMine()` returns every key (no per-key sequence) | both ordering tests (2) |
| the rollback call deleted | provider rollback, per-key case, control rollback (3) |
| the optimistic apply deleted | all 8 |
| every save forced to reject | 6 (the two that still pass are the ones that never settle a save) |
| `tabIndex` removed from the Drafting group | the radio test |
| `onKeyDown` removed from the Drafting group | the radio test |

The first version of the ordering test used a timer as its barrier and did
**not** fail under the first mutation — a settled `PUT` is absorbed a little
later than a bare `await` turns the microtask queue. The barrier is now
`update()`'s own promise settling, which is what the contract says has happened
when the value is absorbed.

A note on `Settings.test.tsx`: it renders the real `App`, not the `Settings`
route alone, because the painted page is painted by `web/src/App.tsx` from
provider state. A stand-in for that effect would have been a test of a second
implementation, and the rollback case is exactly where the difference shows.

# Return: S2.6 Language control and bilingual e2e

- Attempt: 2 of 3
- Base commit: 7ee692e (per the dispatch header). **Worked at 85c3fd2**, the
  current `main` head the coordinator nominated; it differs from 7ee692e only by
  two committed dispatch/log commits, and `docs/v2/state/cards/S2.6.json`
  records a third base (8cb3ecf). No pull, merge, rebase or reset was run.
- Final commit: NOT RECORDED (nothing committed; the coordinator stages explicit
  paths)
- Sandbox run IDs used: one, `2026-09-29T15-43-46-297Z-644cf062`, port 7833 with
  the es-MX server on 7834 (`sandbox.mjs env --port 7833`)
- Session tools available (shell, file edit, network): shell, file edit; no
  runtime network beyond the sandboxed local servers

**This file replaces an earlier return for the same attempt**, covering the
AM-059 attestation work and V8–V14 at base 812da7c. That text is preserved
verbatim, 282 lines, at
`docs/v2/evidence/S2.6/attempt2-return-prior-section.md`; it is read there for
the full record of those rows. What follows is the AM-063 continuation, and
the rows it does not re-run are cited from it.

## Changed paths

These three are the card's work, uncommitted:

- `shared/src/i18n/es-MX.ts` — one value, `language.en.english`, from
  `Ingles (Estados Unidos)` with the accent, to `English (United States)`.
  Nothing else in the file. Licence: AM-063, the single key, the single value.
- `shared/src/i18n/t.test.ts` — one added case, *leaves the four language names
  untranslated, byte for byte*. Licence: AM-051 for the file, AM-063 for the
  four keys.
- `web/src/components/LanguageDialog.test.tsx` — one added es-MX-provider case,
  and the one stale header comment at the top of the file. Licence: AM-063, both
  items, nothing else.

New documentation, uncommitted:

- `docs/v2/evidence/S2.6/attempt2-am063-language-names.md`
- `docs/v2/evidence/S2.6/attempt2-v1-bilingual-e2e.md`
- `docs/v2/evidence/S2.6/attempt2-v4-and-attestation-routes.md`
- `docs/v2/evidence/S2.6/attempt2-return-prior-section.md` (the earlier return
  for this attempt, preserved verbatim because this file replaced it)
- `docs/v2/state/returns/S2.6.md` (this file)

`shared/src/i18n/en.ts` is **unchanged**. The value moves from `es-MX` toward the
English text, never the reverse — the direction AM-063 says is the trap.
`web/src/components/LanguageDialog.tsx`, `server/src/routes/settings.ts`,
`server/src/routes/plans.ts`, `shared/src/errors.ts`, `web/src/styles/app.css`,
`e2e/support/no-english.ts`, `e2e/support/fixtures.ts`,
`e2e/playwright.config.ts` and `e2e/tests/language-control.spec.ts` are all
unchanged.

## Criteria

| ID | Status | Exit code | Evidence path | Note |
| --- | --- | --- | --- | --- |
| V1 | FAIL | 1 | `attempt2-v1-bilingual-e2e.md` | The repair is in and all 50 Spanish screens pass it. The run's hard failure is a pre-existing navigation defect in the UI owner's retargeted spec, reproduced at base with my change reverted. Recorded as a stop condition, not answered by touching a guard. |
| V2 | PASS | 0 | `attempt2-v1-bilingual-e2e.md` | Disabled with its reason while a refine streams; direct PUT 409. Run in the full line and again alone after the V17b restore. |
| V3 | FAIL | 1 | `attempt2-v1-bilingual-e2e.md` | Pre-existing; reproduced with the catalogue reverted to base. Not this card's file. |
| V4 | PASS | 0 | `attempt2-v4-and-attestation-routes.md` | `build:shared` + `vitest run web/src` (516/516) + `lint` + `typecheck`, final tree state. |
| V5 | PASS | 0 | `V5-oracle-can-fail.md` (inherited) | Not repeated, per AM-062. The oracle is unchanged. |
| V6 | PASS | 0 | `V6-per-form-parity.md` (inherited) | Re-confirmed incidentally: `t.test.ts` 25/25 here. |
| V7 | PASS | 0 | `V7-accent-low-contrast.md` (inherited) | Browser row, not re-run; untouched by this card's three files. |
| V8 | PASS | 0 | `attempt2-v4-and-attestation-routes.md` | `plans.test.ts` *V8: stores ATTESTATION_TEXT byte for byte…* |
| V9 | PASS | 0 | `attempt2-v4-and-attestation-routes.md` | Exact approved Spanish sentence stored. |
| V10 | PASS | 0 | `attempt2-v4-and-attestation-routes.md` | First attestation unchanged, reactivation 409, new activation English. |
| V11 | PASS | 0 | `attempt2-v4-and-attestation-routes.md` | Pre-change English attestation untranslated, no backfill. |
| V12 | PASS | 0 | `attempt2-v1-bilingual-e2e.md` | `[es-MX] plan.spec.ts:58`, exact Spanish attestation, `checkScreen` on the plan in force. |
| V13 | PASS | 0 | `attempt2-v1-bilingual-e2e.md` | `[chromium] plan.spec.ts:58`, English behaviour retained. |
| V14 | PASS | 0 | `attempt2-v1-bilingual-e2e.md` | `plan.spec.ts:245`, matcher attribution, both projects. |
| V15 | PASS | 0 | `attempt2-am063-language-names.md` | All four keys byte-identical, compared per key in the real catalogues. |
| V16 | PASS | 0 | `attempt2-am063-language-names.md` | `LanguageDialog.test.tsx` 7/7; the English cell reads `English (United States)` on both lines with the app in Spanish. |
| V17 | PASS | 0 and 1 | `attempt2-am063-language-names.md` | Both halves, run twice: a wrong per-key value makes V15 exit 1; the repair reverted makes the dialog's `checkScreen` exit 1 naming `language.en.english`. |

V15, V16 and V17 are the substance of this attempt and all pass.

## Acquisitions

none. No model, no package, no download.

## Deviations

1. **Worked at 85c3fd2, and the lane was free**, both as the coordinator stated.
   The UI owner's commit has landed: `Settings.tsx` no longer renders a Language
   row, and `language-control.spec.ts` is retargeted to the dialog with its
   `checkScreen` calls intact. I recorded that and did not repeat either the
   removal or the retarget, as AM-063 directs.
2. **The header comment in `LanguageDialog.test.tsx`**, disclosed by the card as
   a small widening and made as disclosed. It claimed the English line is dropped
   when it would repeat the endonym, which the production file, the owner's
   2026-09-27 change and the case directly beneath it all contradict. No other
   comment and no other test in that file changed.
3. **V1 is recorded FAIL, not PASS.** The card's stop condition — V1 not
   makeable green by the licensed change — is met and reported. The licensed
   change is in, and it is what makes the es-MX project's 50 screens green. What
   fails is a history assertion in a file this card does not hold. See
   Unresolved items.
4. **V1 was supplemented with `--project=es-MX --no-deps`.** A failed dependency
   project stops the `es-MX` project, which is where `checkScreen` runs on every
   screen, so the run would otherwise have proved nothing about V1's actual
   claim. `--no-deps` is a Playwright flag: both servers still start from the
   same `webServer` block, the es-MX project still runs `appLocale: 'es-MX'`
   against the `APUNTA_DEV_SPANISH=1` server on 7834, and `checkScreen` is still
   called unconditionally for `appLocale === 'es-MX'`. No config was edited.

No deviation changes behaviour.

## Unresolved items

1. **`language-control.spec.ts` V3 on the dialog fails, and it is not this
   card's to fix.** `page.goBack()` after
   `page.getByTestId('home-link').click()` lands on `about:blank` instead of `/`.
   The cause is readable: the case is already at `/` when it clicks `<Link
   to="/">` (`PatientsColumn.tsx`), so no history entry is added and `goBack()`
   falls off the front. The passing sibling `settings-appearance.spec.ts:51-53`
   leaves by a different route and asserts a real two-entry history.
   Control: with `shared/src/i18n/es-MX.ts` replaced by
   `git show HEAD:shared/src/i18n/es-MX.ts` and `shared` rebuilt, the same test
   fails identically at the same line. So the catalogue repair neither causes
   nor cures it. The file is the UI owner's after the AM-063 retarget and is not
   in May-edit, so it was not touched; the fix would be to leave for a route
   other than `/` before `goBack()`. That is a recommendation, not a change, and
   the same file already holds one assertion this card must leave alone.
2. **Four committed PNGs in `docs/v2/evidence/P2.2/screenshots/` are modified in
   the working tree** (`dark-accent-7c3aed`, `dark-default-accent`,
   `light-accent-7c3aed`, `light-default-accent`). The e2e line regenerates them;
   they are not this card's output. Revert or keep, the coordinator's call.
3. **One P3.1 file is modified in the working tree**
   (`scripts/v2/package-linux-resources.test.sh`), from that agent's own
   in-flight work. Not read, staged, reverted or formatted here. No
   repository-wide gate failed at any point in this attempt, so there is no
   out-of-scope interference to record.
4. **A fact worth keeping: `web` resolves `@apunta/shared` to `shared/dist`, not
   to `shared/src`.** A `web` vitest run after a catalogue edit, without
   `npm run build:shared`, silently tests the previous build. V16 passed once
   with a deliberately wrong value in `shared/src` for exactly this reason. Every
   recorded run is after a rebuild, and `t.test.ts` is immune because `shared`
   imports its own sources.

Nothing else is outstanding. The three changed files are ready to stage; nothing
is committed.

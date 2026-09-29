# Return: S2.6 Language control and bilingual e2e

- Attempt: 2 of 3 (resumed, not reset)
- Base commit: `812da7c`
- Final commit: **NOT RECORDED — no commit was made.** The tree is left dirty for
  the coordinator to integrate; nothing was staged, committed or pushed.
- Sandbox run IDs used: one — `node scripts/v2/sandbox.mjs env --port 7831`,
  English server 7831 and es-MX server 7832 (the pair `playwright.config.ts:32`
  derives from `port + 1`). Run folder `<sandbox>`, path withheld: the server
  logs carry the machine hostname. The preview instance on 7867 was never
  contacted and no process was killed.
- Session tools available (shell, file edit, network): shell, file edit. **No
  network was used** — nothing was fetched, and the only hosts contacted were
  127.0.0.1:7831 and 127.0.0.1:7832.
- Runtime: pinned Node **v24.19.0** in `PATH` for every command
  (`$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin`). The box default
  is v26.8.2, outside the repo's `engines`. Browser: `/usr/bin/chromium`, exported
  as `PLAYWRIGHT_CHROMIUM_EXECUTABLE` **before** `sandbox.mjs env`. Fake AI
  throughout; synthetic fixtures only (the prototype's sample people, John Smith
  and co, per HS-8). No model inference was run in this session and no
  model-quality evidence is produced by it; the model executor was not touched. Port 7717 never contacted, no live data read.

## Changed paths

HEAD is the base commit, so `git diff --name-only 812da7c..HEAD` is empty; the
change is the working tree.

Source and tests, all inside the card's May-edit list:

| Path | What |
| --- | --- |
| `server/src/routes/plans.ts` | AM-059: capture `storedLanguage(db)` once in the activation handler, persist `msg(locale, 'plan.attestationStatement')`; the `ATTESTATION_TEXT` import goes with it |
| `shared/src/i18n/en.ts` | the single `plan.attestationStatement` key, English byte-identical to `ATTESTATION_TEXT` |
| `shared/src/i18n/es-MX.ts` | the same key, the owner's approved Spanish wording, byte for byte |
| `server/src/routes/plans.test.ts` | V8, V9, V10, V11 |
| `shared/src/i18n/t.test.ts` | the catalogue pin for the new key — both values, and that they differ |
| `e2e/tests/plan.spec.ts` | V12, V13, V14 |
| `e2e/tests/language-control.spec.ts` | V2 and V3 re-run against the owner-approved More-menu `LanguageDialog` as well as the Settings row (AM-062) |
| `e2e/tests/formats.spec.ts` | six es-MX literal assertions → `tr()` / `trRe()` |
| `e2e/tests/workspace.spec.ts` | nine es-MX literal assertions → `tr()` / `trRe()` |

Outputs this card is required to write:

- `docs/v2/state/returns/S2.6.md` (this file)
- `docs/v2/evidence/S2.6/attempt2-am059-attestation.md`
- `docs/v2/evidence/S2.6/attempt2-not-may-edit-defects.md`

Nothing else. In particular **not** touched: prompts, guards, thresholds,
`CONTRACTS.md`, `no-english.ts`, `playwright.config.ts`, any release default, any
clinical string, `Settings.tsx`, `LanguageDialog.tsx`, `PatientMenu.tsx`,
`app.css` (other than nothing at all), `server/src/routes/formats.ts`,
`server/src/extract/`. The coordinator's uncommitted plan edits
(`docs/v2/cards/S2.6.md`, `docs/v2/state/AMENDMENTS.md`,
`docs/v2/state/PROGRESS.json`, `docs/v2/state/cards/S2.6.json`,
`docs/v2/state/dispatch/S2.6.md`) were read and left exactly as found.

## Criteria

| ID | Status | Exit code | Evidence path | Note |
| --- | --- | --- | --- | --- |
| V1 | **FAIL** | 1 | `attempt2-am059-attestation.md` | 1 failed / 54 passed / 6 skipped / 51 did not run. The one failure is F1, a reported not-May-edit catalogue defect. **Not reported as green.** |
| V2 | PASS | 0 (rows) / 1 (V1) | same | Row assertions all pass on **both** surfaces. The dialog's extra `expectNoEnglishUi` fails on F1; V2's own stated outcomes (disabled with reason, 409) pass. |
| V3 | PASS | 0 (rows) / 1 (V1) | same | Row and dialog: switch applies at once, survives navigation without reload, survives reload, row and dialog agree. |
| V4 | PASS | 0 | same | `build:shared` 0, `vitest run web/src` 0 (47 files / 490 tests), `lint` 0 (`TOTAL 0`), `typecheck` 0. Re-run for the changed paths only, per AM-062. |
| V5 | PASS (inherited) | — | `V5-oracle-can-fail.md` | **Not re-run.** AM-062 and the checkpoint both say so, and V5's mechanism is a deliberate scratch edit of `es-MX.ts` that a fresh session would repeat. Cited, not claimed as new. |
| V6 | PASS (inherited) | — | `V6-per-form-parity.md` | Per-form parity. Untouched by this attempt; the one new key is placeholder-free in both catalogues and the parity oracle covers it (it reads the catalogues, not a list). |
| V7 | PASS (inherited) | — | `V7-accent-low-contrast.md` | Accent warning. `Settings.tsx` and `app.css` untouched this attempt. |
| V8 | PASS | 0 | `attempt2-am059-attestation.md` | Byte-for-byte with no language row and with explicit `en`; negative control confirms the case can fail. |
| V9 | PASS | 0 | same | Exact approved Spanish sentence; `not.toBe(ATTESTATION_TEXT)`. |
| V10 | PASS | 0 | same | Forward-only: first attestation and `attested_at` unchanged, re-activation 409, fresh version English, the Spanish one still Spanish in the version list. |
| V11 | PASS | 0 | same | No backfill: API, exported document and the raw `treatment_plans` row all still hold the English sentence; zero rows anywhere hold the Spanish one. |
| V12 | PASS | 0 | same | es-MX plan flow passes with the exact approved Spanish attestation on the screen and the flow's own `checkScreen` clean. |
| V13 | PASS | 0 | same | English project plan flow passes with `ATTESTATION_TEXT` unchanged. |
| V14 | PASS | 0 | same | Attribution asserted, not assumed: the English matches `plan.attestationStatement` **and still** `chat.change.summary`; the Spanish matches nothing, whole or in parts. Passes in both projects. |

### Exit codes were captured, not inferred

Every command's code came from the command itself, run into a log and read back
afterwards — `cmd > log 2>&1; code=$?`. An earlier pass in this session used
`cmd | head; echo $?`, which reports `head`'s status rather than the command's;
that was corrected and **no exit code in this return or in the evidence comes
from a piped command**. Two consequences worth naming:

- The V4 chain is reported as four separate codes, not one `&&` chain, so a
  failure in the middle is attributable.
- The first browser negative control (restoring `attestation_text:
  ATTESTATION_TEXT` outright) produced `NEGATIVE_CONTROL_EXIT=1` for the **wrong
  reason** — the scratch edit left `locale` unused, the server build failed, and
  the web server never started (`Process from config.webServer was not able to
  start. Exit code: 2`). Verified afterwards rather than assumed:
  `npx tsc -p server/tsconfig.typecheck.json --noEmit` on that exact edit exits
  **2** with `server/src/routes/plans.ts(228,11): error TS6133: 'locale' is
  declared but its value is never read`, and exits 0 on the restored file. The
  control was then redone as a conditional that keeps `locale` and the import
  used, typechecked (exit 0), and produced the real assertion failure. A control
  that fails for an unrelated reason is not a control.

### Timing note, for contamination

All CPU and browser work ran between **2026-09-27T16:22-06:00 and 17:01-06:00**
on this box. **This session performed no model inference and produced no
model-quality evidence.** That is the whole of what is claimed here, and it is
a narrower statement than this note used to make: an earlier draft asserted that
"the model executor held the GPU throughout, so no model timing is affected",
citing a process id (`490ebfe8`) that does not exist as a process on this host
and reasoning about GPU state on a box with no `nvidia-smi` and no `/dev/nvidia*`.
That claim is **withdrawn as unsupportable**, not restated. The two propositions
are different: this session enqueued no GPU work, which says nothing about
whether other resident work affected host CPU, memory bandwidth or thermal
headroom. What survives is only that no model number in this card should be read
as re-verified by this session, so the coordinator's own model runs remain the
instrument.

The four-timezone suites were **not** re-run, and the argument for that does not
rest on the withdrawn claim: they passed for the UI commit, and this card
changes no date, time or zone logic — the only shared-module change is one
catalogue key with no placeholder. The coordinator's four-zone suites remain the
instrument for that, and the `notes.date` / `note.updatedAt` cases in
`t.test.ts` pass in the runs above.

## Acquisitions

none.

## Deviations

1. **V1 is FAIL, and the card's row set is not all green.** One failure, F1 below.
   It is a real defect outside May edit, reported rather than suppressed. I did not
   add an `ALLOWED` entry, did not change `no-english.ts`, and did not touch
   `playwright.config.ts`'s `dependencies` to let the rest of the suite run past
   it — the last of those would have been a guard change made to turn a red suite
   green, which HS-7 forbids.
2. **The es-MX project was additionally run on its own** with
   `--project=es-MX --no-deps`, exit 0 / 50 passed, so the 51 tests V1 could not
   reach were verified rather than left unverified. `--no-deps` skips only the
   dependency gate; both servers still come from the same sandbox run folder with
   the same env. Recorded as supplementary, not as V1.
3. **Three English literals remain in `e2e/tests/workspace.spec.ts`** (`Tools
   for`, `Archive`, `Delete`) and one in `e2e/tests/formats.spec.ts` (`scan`).
   Each is a case where the product has no translated string to assert against —
   F3 and F4 — and each carries a comment naming the reason and the finding. None
   is a suppression of a check: the assertions still hold in both projects.
4. **`t.test.ts` was used for the catalogue pin** rather than only the e2e spec.
   The dispatch's AM-059 sentence names "the single `plan.attestationStatement`
   key" for both catalogues and says "Existing `t.test.ts` and
   `e2e/tests/plan.spec.ts` scopes cover its catalogue and bilingual browser
   regressions", so both files are in scope and the catalogue half belongs in the
   catalogue's own suite.
5. **One new key, added in two files.** `plan.attestationStatement` is the
   *one* key AM-059 permits, and it is the only catalogue change in this attempt.

## Unresolved items

Five defects outside this card's May edit, each with its evidence file, its lines
and what a fix would have to touch. Full detail in
`docs/v2/evidence/S2.6/attempt2-not-may-edit-defects.md`.

1. **F1 — the More-menu `LanguageDialog` shows English on the Spanish screen.**
   `language.en.english` is translated ("Inglés (Estados Unidos)") while
   `language.en.endonym` is not ("English (United States)"), and those are the
   same string, so the chooser's endonym line is reported as a leak. The other
   three `language.*` keys are byte-identical across the catalogues; this one is
   the exception. **This is V1's single failure.** A fix is one catalogue value
   — make `language.en.english` byte-identical to its endonym in `es-MX.ts`, as
   its three siblings already are, which also lets the component's own "drop the
   second line when they are equal" rule do its job in Spanish. An `ALLOWED`
   entry is **not** an alternative and is struck from this record: AM-059
   forbids adding a no-English allow-list entry, HS-7 forbids loosening a guard
   to make a result pass, and it would have hidden the disagreement rather than
   repaired it. That catalogue key is not licensed in this card, so the fix is
   for the coordinator to scope as an amendment, not for this attempt.
2. **F2 — an in-flight reading of the dialog found fewer strings than the idle
   one, cause unknown. Do not scope an amendment from this.**
   The check on the open dialog reports 0 English while a refine streams, and
   the annotations read 54 strings in flight against 62 idle. Those counts are
   the observation and are preserved as one; the **explanation offered in an
   earlier draft is withdrawn.** It claimed `.language-option:disabled {
   opacity: 0.7 }` made `checkVisibility({checkOpacity: true, checkVisibilityCSS:
   true})` return `false`, so the walker read none of a disabled control's text.
   An independent re-probe on this box's own Chromium, against a DOM with the
   app's own class names, a real `disabled` attribute and the real rule, returns
   `true` for both a bare `<button disabled>` and that option, and the walker
   output includes the option's strings. Only `display:none`, `visibility:hidden`
   and `opacity: 0` return false, so a sub-1 opacity does not hide anything from
   the walker, and the claimed isolated probe is not reproducible. Two further
   reasons the finding could not stand: the five "missing" strings listed
   included `Elige tu idioma`, the dialog's `<h2>`, which no rule on the button
   can hide; and the arithmetic did not reconcile (62 − 54 = 8, five accounted
   for) while the in-flight state *adds* `settings.languageChangeBlocked` in
   `language-busy`, so it should read more, not fewer. The two counts are of two
   different page states, so "54 in flight against 62 idle" is a comparison
   across states rather than a measurement of one.
   Consequence for scoping: the proposed repair — stop letting a sub-1 opacity
   hide a control's text — would be a **no-op** and must not enter an
   amendment. An instrument blind spot is worth having; a misdiagnosed one is
   worse, because it gets "fixed" in the wrong file. The cause is unidentified
   and goes back for re-diagnosis. Neither `no-english.ts` nor `app.css` may be
   touched from this card, and nothing here is fixed in this attempt. Note the
   direction of the effect on V1: had the option lines been unreadable in flight,
   the in-flight check would not have reported F1 either; the test fails on the
   idle check regardless, so the "1 failed" count is unchanged.
3. **F3 — three English `aria-label` templates in `PatientMenu.tsx`** (`:437`,
   `:593`, `:606`). The visible text behind them is translated; the accessible
   names are not, so the only way to name those menu items in Spanish is in
   English. `expectNoEnglishUi` reads text nodes and `placeholder`s, not
   `aria-label`s, so it cannot see this class at all — a screen reader can.
4. **F4 — the extractor's scan and picture refusals are literals**
   (`extract/pdf.ts:58`, `extract/index.ts:27`), so the scan refusal is English
   on a Spanish screen. AM-045 gave S2.5 the sentences some `extract` functions
   return; these two are outside that licence.
5. **F5 — the standard note format is English in a Spanish UI**
   (`routes/formats.ts:59-60`). C-LANG@1 rule 8 asks for a separate Spanish
   standard format; only the English one is created. `formats.spec.ts` keeps three
   English assertions on it with a comment saying which three to revisit.
6. **F6 — `brand.spec.ts:267` rewrites four committed P2.2 evidence PNGs on every
   e2e run**, unconditionally, with no `existsSync` or `UPDATE_SCREENSHOTS` guard —
   the guard `workspace.spec.ts:20` uses for the same reason. **This session's V1
   run did exactly that** (mtime 2026-09-27T16:57:58-06:00), dirtying another
   card's evidence. Repaired with `git checkout --
   docs/v2/evidence/P2.2/screenshots/`, and
   `git status --porcelain -- docs/v2/evidence/P2.2/` is now empty — verified, not
   assumed. `brand.spec.ts` is not in this card's May edit, so the guard was not
   added; AM-056 records that this has been repaired once already and has
   recurred. An evidence file any run can silently rewrite is not evidence.

And one thing that looked like the same class of bug and is **not** a defect,
recorded so a later reader does not "fix" it: the Spanish screen showing an
English refine thread (`chat.firstPass`, `chat.publishedRefusal`,
`chat.change.summary`) is C-LANG@1 rule 4 working. The replies use the **note's**
locale, those notes are `en`, and that is the contract's own rejection example. I
converted those three assertions to `tr()` first, the browser run failed, and the
cause was correct behaviour; they are back to English literals with a comment at
each. The same applies to the plan document's English headings, which AM-059 puts
outside this fix.

## Notes for the reviewer

- **Both language surfaces are exercised, and neither was removed.** The Settings
  row is untouched; the More-menu `LanguageDialog` is the owner-approved surface
  AM-062 added, and V2/V3 now run against both. The two cases are duplicated
  rather than shared on purpose — the row and the dialog are separate components
  with separate disabled logic, and a shared helper would only assert whichever one
  it reached.
- **The V2 dialog case is deliberately not weakened.** An earlier pass in this
  session removed its `expectNoEnglishUi` calls and replaced them with checks on
  the workspace behind the dialog. That was wrong on the card's own wording — V1
  expects `expectNoEnglishUi` on "every screen", and AM-062 requires "the same
  browser verification" to exercise the dialog — and it would have converted a
  reported defect into a narrowed claim. The calls are back on the open dialog in
  both its states, and the row fails.
- **The in-flight dialog check reporting 0 English is unexplained, and this
  return no longer claims to know why.** An earlier draft called it "a narrower
  reading of the same screen" on the strength of a `checkVisibility` result that
  has since been refuted by direct probe; that claim is withdrawn, along with
  the reading it supported. The two `checkScreen` calls stay on the open dialog
  in both states — they are two different assertions on one dialog — and the
  call that fails is the idle one. See Unresolved item 2.
- **Matcher attribution was tested, not assumed.** Before this attempt the English
  attestation was attributed to `chat.change.summary` by coincidence
  (`I {changes}.`); it is now attributable to `plan.attestationStatement`, and
  V14 pins both facts at once — including that `chat.change.summary` still matches,
  which is what would notice a suppression.
- **No English was suppressed and no guard was loosened.** `ALLOWED` still holds
  exactly `chat.list.last` and `common.listLast`; `no-english.ts` is byte-identical
  to the base commit; `playwright.config.ts` is byte-identical to the base commit.
  Verified with `git diff --quiet 812da7c -- e2e/support/no-english.ts
  e2e/playwright.config.ts` → identical.
- **Tree hygiene, and one thing I had to put back.** The only files this card
  changed are the nine in "Changed paths" plus its own return and two evidence
  files. `docs/v2/ORCHESTRATION-LOG.md`, `docs/v2/cards/S2.6.md`,
  `docs/v2/state/AMENDMENTS.md`, `docs/v2/state/PROGRESS.json`,
  `docs/v2/state/cards/S2.6.json` and `docs/v2/state/dispatch/S2.6.md` are the
  coordinator's uncommitted plan edits — the ORCHESTRATION-LOG entry naming
  "Implementer c521fdc6 holds the sole source writer lane at base 812da7c" was
  written at 16:23:30, during this session but not by it. Read and left alone.
  The four P2.2 screenshots were mine, via F6, and are restored.
- **The four failing rows in the first full run were all fixed by making the
  assertions language-aware**, and the fifth failure the run then surfaced was
  F1, which is not fixable from here. The 15 literals named by the task were
  converted with `tr()`/`trRe()`; no `test.skip`, no `test.only`, no `.fixme`, no
  commented-out assertion and no widened matcher was introduced anywhere —
  checked with `git diff -- e2e/tests/` greps for each.

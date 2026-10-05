# UI-BATCH-2026-10-05 — re-review evidence (review2)

Companion to `docs/v2/state/reviews/UI-BATCH-2026-10-05-impl2.md`. Read-only
re-review of the working-tree diff from `364ee9f` after the one bounded repair.
Node v24.19.0 for every command I ran. Synthetic fixtures only; no run against
7717 or any live data dir; no global build, global lint, global typecheck,
global unit or e2e run — root held those leases and I read its saved logs
instead. No source edit, no commit, no worktree, no download, no dependency.

## Scope read

- `CLAUDE.md`; `docs/HANDOFF.md`; `docs/v2/state/UI-BATCH-2026-10-05.md`;
  `docs/v2/state/reviews/UI-BATCH-2026-10-05-impl.md` (left intact) and
  `-ir.md`; `docs/v2/state/returns/UI-BATCH-2026-10-05-A.md` / `-B.md` / `-C.md`.
- Full diff: `git diff 364ee9f --stat` →
  `docs/HANDOFF.md`, `docs/v2/ORCHESTRATION-LOG.md`,
  `docs/v2/owner/UI-BACKLOG.md`, `docs/v2/state/NEXT-SESSION.md`,
  `shared/src/i18n/en.ts`, `shared/src/i18n/es-MX.ts`,
  `web/src/App.test.tsx`, `web/src/App.tsx`,
  `web/src/components/HomeLauncher.tsx`,
  `web/src/components/NotesColumn.test.tsx`,
  `web/src/components/NotesColumn.tsx`,
  `web/src/components/PatientWelcome.tsx`,
  `web/src/routes/Capture.test.tsx`, `web/src/routes/Capture.tsx`,
  `web/src/routes/Workspace.tsx`, `web/src/styles/app.css`
  (16 files, +1735/−330).
- Untracked new files read: `web/src/styles/capture-modal.css`,
  `web/src/styles/notes-column.css`, and the docs listed above.
- Supporting reads: `web/src/hooks/useLoader.ts`,
  `web/src/components/Dialog.tsx`, `web/src/components/NoteView.tsx`
  (flag call sites only), `web/src/routes/Capture.tsx` (full),
  `web/src/routes/Workspace.tsx:155-300,540-580,700-830`,
  `web/src/App.tsx:1-55,145-260`, `web/src/styles/app.css`
  (`.workspace`/`.app-shell`, `.col-body`, `.new-note-btn`, `.col-actions`,
  `.modal`, `.modal-backdrop`, `.card`, `.col-header-title`, the shared scrim
  rule, `:5150-5160`), `web/src/styles/motion.css:45-70,150-168`.
- Root's saved verification, read: `docs/v2/evidence/UI-BATCH-2026-10-05/root-verification.md`.
- Ignored raw root logs, read: `build/ui-batch-2026-10-05/` —
  `browser-check.mjs`, `focus-probe.mjs`, `browser-repair.log`,
  `browser.log`, `repair-test.log`, `repair-typecheck.log`, `repair-lint.log`,
  `repair-build.log`, `e2e-repair.log`, `unit.log`/`unit.exit`,
  `typecheck.exit`, `lint.exit`, `build.exit`, `lint.log`, `typecheck.log`.

## Commands I ran (mine only)

| Command | Exit | Result |
| --- | --- | --- |
| `node -v` (after pinning mise 24.19.0) | 0 | `v24.19.0` |
| `npx vitest run --project web web/src/App.test.tsx web/src/components/NotesColumn.test.tsx web/src/routes/Capture.test.tsx` | **0** | 3 files, **124 passed**, 4.62s |
| `npx tsc -p web/tsconfig.json` | **0** | clean |
| `npx eslint web/src/App.tsx web/src/App.test.tsx web/src/routes/Workspace.tsx web/src/routes/Capture.tsx web/src/components/NotesColumn.tsx web/src/components/NotesColumn.test.tsx web/src/routes/Capture.test.tsx web/src/components/PatientWelcome.tsx web/src/components/HomeLauncher.tsx` | **0** | clean |

Read-only commands: `git log --oneline -5`, `git status --porcelain`,
`git diff --stat 364ee9f`, per-file `git diff 364ee9f`, and greps over
`web/src`. Nothing was written outside the two report files.

## F1 — anchors I verified by reading, and the paths I traced

- `web/src/routes/Workspace.tsx:184-185` — `notesRequestRef`,
  `notesAnswerRef: { request, patient } | null` (an identity record, **not** an
  array).
- `:186-204` `loadNotes` — `:188` increments and takes the request number,
  `:190` captures `asked = patientId`, `:192` empties the answer slot,
  `:197` records only when `!signal.aborted && notesRequestRef.current === request`.
- `:262-275` the unknown-id effect — `:265` `noteId !== null` and
  `notes.state.status === 'ready'`; `:266-267` an answer must exist; `:270`
  `answer.patient !== patientId` → return; `:271` id absent from
  `notes.state.data`; `:272` once-per-id; `:273-274` set the ref **then**
  `notes.refresh()`; `:275` deps `[noteId, patientId, notes.state, notes.refresh]`.
- `:256-261` per-patient reset of the once-only refs, done during render.
- `web/src/hooks/useLoader.ts:87-90` `refresh` (quiet, keeps data on screen),
  `:92-96` `update` (new array, the thing that used to poison the guard),
  `:61-65` the loader drops an aborted answer, `:77-79` abort on unmount/input change.
- `Workspace.tsx:334,343-359,812-819` — `updateNotes = notes.update`, the save /
  refine-rewrite / delete callers of `handleNoteChanged` and
  `handleNoteDeleted`; `:218` `note` resolution; `:809-810`-equivalent main-pane
  `PatientWelcome` fallback when `note === null`.

Traced conclusions: a local `update` leaves the request number intact, so the
prior-save path now refreshes; an aborted or overtaken request records nothing;
a late cross-patient answer fails both the `patient` equality and the
slot-emptied-by-the-earlier-loader-effect check; the once-only ref is set before
the refresh and reset only when `patientId` changes; the refetch is notes-only.

Tests covering it (read, and green in my run):
`web/src/App.test.tsx:579-619` fresh unknown id (2 notes reads, 1 patients read,
no repeat), `:621-633` never-found id asked once, `:644-693` **the F1
regression** — save the open note, New note, Create draft, then assert the new
draft is the note on screen with the real streamed body, notes reads 2,
patients reads 1 — and `:702-762` the patient-switch / late-answer case.

## F2 — anchors

- `web/src/styles/capture-modal.css:17-26` `.modal.capture-modal`
  (`max-width: 560px`, `max-height`, `overflow-y`, `overscroll-behavior`);
  no `backdrop-filter`, no `background` anywhere in the file (`:1-7` header
  states the shared scrim is deliberately not repeated).
- `web/src/styles/notes-column.css:35,42,49,57` — the three compounded selectors
  plus the footer rule.
- Competing `app.css` rules and their specificity: `:2481-2486` `.modal`
  (0,1,0), `:271-288` `.new-note-btn` (0,1,0), `:168-172` `.col-body` (0,1,0),
  `:1777-1782` `.col-actions` (0,1,0, no conflict), `:3736-3741`
  `.col-header-title` (0,1,0, no conflicting property).
- Elements that must carry both classes: `Capture.tsx:404`
  (`"modal card capture-modal"`), `NotesColumn.tsx:100`, `:108`, `:127`, `:143`.
- `app.css:5155-5159` the single shared scrim rule naming `.capture-modal` —
  the only `app.css` change in the whole diff.
- No `!important` competes: `motion.css:230-232`, `app.css:2132` (media query).
- Grep result: no stylesheet in `web/src/styles/` references
  `#apunta-content`, `.route-transition >` or `.route-background`, so the new
  wrapper div cannot change the shell's layout; `.workspace { height: 100vh }`
  (`app.css:23-27`) and `.modal-backdrop { position: fixed; inset: 0 }`
  (`:2470-2479`) make both the shell and the window independent of it.

Tests: `App.test.tsx:1435-1447` (every overriding rule present under its
compounded selector, the `app.css` rule it beats present, no
`backdrop-filter` in `capture-modal.css`) and `:1448-1458` (the notes-column
equivalents). Both green in my run.

## Focus restoration — real-Chromium proof, root's run, cited

- Mechanism anchors: `web/src/components/Dialog.tsx:67-80` (restore from a
  passive `useEffect` cleanup keyed on `open`), `:84-127` (key handling and Tab
  trap, unchanged), `:146-149` (`aria-modal` / `aria-hidden` on the panel).
- `web/src/App.tsx:200-224` the `useLayoutEffect` that toggles
  `.route-background`'s `inert`, with the commit-ordering rationale in the
  comment; `:246-254` the background and the overlay as **siblings**.
- Ordering test: `App.test.tsx:519-548` records the background's `inert` inside
  a `focus` listener on the opener at the moment of restore and asserts every
  recorded value is `false`, then that `document.activeElement` is the opener.
- **Browser proof:** `build/ui-batch-2026-10-05/browser-check.mjs:36-42` —
  click `notes-new-note`, assert the open state at `:38-39`, `Escape` at `:40`,
  window gone at `:41`, and
  `await expect(page.getByTestId('notes-new-note')).toBeFocused();` at `:42`.
  That script exited 0; `browser-repair.log` carries all six of its result
  lines, ending with the direct-capture-close check from `:77-78`.
- Pre-repair contrast, for the record: root's `focus-probe.mjs` run against the
  unrepaired candidate printed `{"focus":{"tag":"BODY","testId":null,"inert":false}}`
  and `max-width 460px`, recorded in `root-verification.md` and in the initial
  review's residual. Both are addressed; the post-repair values are 560px and
  the opener button focused.

## Preserved items, re-checked against the final source

- Shared dirty-flag caveat: `Capture.tsx:203-211` (unmount retracts only what
  this window published), `:219-225` (the publish, with `publishedRef`), `:213`
  (`unfinished` is false on mount), `NoteView.tsx:377,392` (the other writer),
  `web/src/lib/maintenance.ts` **absent from the diff** — no P5.3 controller or
  flag-store change.
- Primary/secondary ownership: `App.tsx:154-159` (`blocked` definition),
  `:172-186` (the separate passive `inert` effect on `#apunta-content`),
  `:216-224` (the new layout effect, background only). `App.test.tsx:2056`
  blocked-window test green.
- One modal / dirty confirm / trap: `Capture.tsx:399-406` (`open` bound to the
  blocker state), `:623-637` (`ConfirmDialog` as a sibling of the panel, not a
  child), `:275-283` (`close()`, `navigate(-1)` only with a validated background
  **and** `history.state.idx > 0`), `:96-113` (`readBackgroundLocation` rejects a
  non-Location and a `/capture/` background), `:81,250-256` (blocker untouched).
- Directory stability / route family: `App.tsx:126-147` (`isBackgroundLocation`,
  `useBackgroundLocation` with the synthetic `'/'` + `?patient=` fallback for a
  deep link), `:145-147` (`routeFamilyKey` shares one key for `/` and
  `/patients`), `:236-239` (`data-capture-overlay`), `:10-11` (`Capture` and
  `Workspace` eagerly imported, so opening the overlay cannot trip the shared
  `Suspense`).
- Narrow-pane retarget: `Workspace.tsx:549-555` (`narrowPane === 'notes'`
  implies `patient !== null`), `:561-572` (new target
  `notes-new-note`), `NotesColumn.tsx:107-118` (the button renders only with a
  patient), `:742,763-774` (`firstNoteOnly` omits the column — the case where
  the *old* `notes-header` target was equally absent, so no regression).
- Ctrl+B stand-down: `Workspace.tsx:598-606` reading
  `#apunta-content`'s `data-capture-overlay` at keydown time (no stale read).
- F3: `shared/src/i18n/en.ts:2645-2648` — `capture.closeLabel` now above the
  comment, comment again directly above `capture.newNote`;
  `shared/src/i18n/es-MX.ts:2345` the value, no stale comment. Root's
  `npm run lint` (exit 0) runs `scripts/check-ui-strings.mjs`.

## Root's saved results, read not rerun

- `build/ui-batch-2026-10-05/repair-test.log` → `Test Files 171 passed (171)`,
  `Tests 2450 passed (2450)`.
- `repair-typecheck.log`, `repair-lint.log` (eslint + prettier +
  `check-no-external-urls` + `collect-licenses --check` +
  `check-ui-strings`, `TOTAL 0`), `repair-build.log` (`✓ built in 108ms`) —
  all with `typecheck.exit` / `lint.exit` / `build.exit` = `0`.
- `e2e-repair.log` → `1 skipped` / `33 passed (35.1s)`, scoped to
  `workspace` / `capture` / `save-integrity` on Chromium + es-MX.
- `browser-repair.log` → six JSON lines, script exit 0:
  directory stable `sidebarSame:true, patientReads:1`; notes footer
  `695..800`; modal+dirtyclose `560px, inert:true, blur(6px),
  focused:summary-input`; new draft after prior save `persisted:true,
  sidebarSame:true, errors:[]`; 30note scroll `client 651, scroll 2325,
  footerTop 695, footerBottom 800`; direct capture close
  `patientRetained:true`.
- Root's own record of the two harness-only failures on the way to those
  numbers (an entrance-transform sampled mid-animation giving 697.10→696.60,
  resolved by awaiting `getAnimations().finished`; and a rerun-cleanup that
  picked a deleted synthetic scroll note and then hit the sidebar resizer at
  x=1, corrected to a real blank target) is preserved in
  `root-verification.md` with no product claim and no relaxed threshold. I take
  nothing from those two failures as evidence.

## NOT RUN by me, and not accepted on anyone's word

- Full P5.3 V8 e2e suite — **NOT RUN**, still blocked, not waived by this
  review or by the scoped 33/1 run.
- Any global `npm test` / `typecheck` / `lint` / `build`, any `playwright`, any
  Chromium session, `npm run eval`, `smoke:live`, `check:format`,
  `check:refine`, macOS setup/packaging — **NOT RUN** (outside my lease, or
  manual-only instruments that need a real model).
- Favicon — **NOT DONE**, TODO only.

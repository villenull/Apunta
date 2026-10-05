# UI-BATCH-2026-10-05 — independent final re-review (impl2)

Second, fresh, independent review of the owner three-item UI batch after the one
bounded repair. Independent of implementation A, implementation B, repair
writer C and the initial reviewer (`UI-BATCH-2026-10-05-impl.md`, which stays
exactly as written — its **NOT CLEAR** verdict and its F1/F2/F3 findings are
history, not superseded text; this report is what says whether the repair
cleared them).

Candidate: the working-tree diff from `364ee9f`, read in full, including the
root-owned F3 comment correction. Read-only on application code: no source
edits, no counterfactual mutations, no commits, no worktree, no branch, no
dependency or download, no run against 7717 or any live data dir, no P5.3
repair, no favicon work, no `/vill`, no spawn. Synthetic fixtures only.

Evidence companion: `docs/v2/evidence/UI-BATCH-2026-10-05/review2.md`.

Root's global-check, build and browser leases were **not** taken. Root's saved
verification (`docs/v2/evidence/UI-BATCH-2026-10-05/root-verification.md`) and
the ignored raw logs under `build/ui-batch-2026-10-05/` were **read**, not
rerun. I ran only the targeted test lease I was granted, plus targeted
`tsc`/`eslint` on the batch's own files.

## Verdict: CLEAR

F1 (HIGH) is genuinely repaired — the guard now keys on request + patient
identity rather than array identity, and I traced the prior-save/update,
abort, overtaken-answer and patient-switch paths independently rather than
trusting the new tests. F2 (LOW) is repaired by specificity, not by import
order, and the 560px window and the pinned footer are confirmed in root's real
Chromium run. F3 (LOW) is corrected in root's reserved edit. Focus restoration
is proven in actual Chromium (root's `toBeFocused()` assertion inside the
exit-0 run), and the repair's `useLayoutEffect` reasoning is correct against
React's commit ordering.

No new defect found. Nothing here accepts or waives the blocked P5.3 V8
failure, which stays blocked and unrepaired.

---

## F1 — repaired. Verified independently, not by the added test alone

**Was:** `web/src/routes/Workspace.tsx` gated the unknown-id refetch on
`notes.state.data === notesAnswerRef.current`, i.e. on the *identity of the
array the newest request answered with*. `useLoader.update`
(`web/src/hooks/useLoader.ts:92-96`) replaces `state.data` with a new array and
never writes that ref, so the first local edit (a save, a refine-chat rewrite, a
delete) disarmed the guard for the rest of that patient's visit: no `refresh()`,
the capture's new id absent from `visibleNotes`, `note === null`, main pane on
`PatientWelcome`.

**Now** (`Workspace.tsx:184-204`, `:242-275`):

- `notesRequestRef` counts `listNotes` requests; each request takes a number and
  empties `notesAnswerRef` as it starts (`:188-192`).
- An answer records `{ request, patient }` — **not** the array — and only if
  `!signal.aborted && notesRequestRef.current === request` (`:197-199`).
- The guard (`:262-275`) requires: `noteId !== null`; `notes.state.status ===
  'ready'`; an answer exists; `answer.patient === patientId`; the id is not in
  `notes.state.data`; and `refetchedNoteRef.current !== noteId`.

**The four paths I traced myself.**

1. *Prior local save/update (the reported defect).* `update` replaces
   `state.data`; the request number in `notesAnswerRef` is untouched by any
   local edit, so `answer` still describes the list now on screen for this
   patient. Status stays `ready`, the new id is absent, `refetchedNoteRef` is
   unset → `notes.refresh()` fires. `refresh` is the quiet path
   (`useLoader.ts:87-90`): the column and the still-mounted editor stay on
   screen, no loading flash, no remount, no patients re-read. `:668-672` of
   `App.test.tsx` and root's Chromium block both confirm it end to end.
2. *Aborted request.* The loader aborts its controller on unmount and on every
   input/`attempt` change (`useLoader.ts:77-79`), and `loadNotes`'s `.then`
   records nothing when `signal.aborted` (`:197`). The answer slot therefore
   never points at an abandoned list.
3. *Overtaken answer.* Two requests in flight: only the newest number may record
   (`:197`). The superseded one resolves into a state the loader also discards
   (`useLoader.ts:63`), so the two guards agree.
4. *Patient change / late cross-patient answer.* Two independent defences: the
   recorded `patient` must equal the current `patientId` (`:270`), and on a
   patient change the loader's own effect — declared earlier, so it runs first
   in the commit — empties the answer slot (`:191-192`) before the check effect
   runs. `patientId` is in the effect's dependencies (`:275`), so a switch
   re-evaluates. `App.test.tsx:702-762` drives exactly this (John's read held
   open, switch to Maria, John's answer released mid-flight) and asserts Maria's
   list is read once at that moment, twice after hers answers, then quiet.

**Once-only and reset semantics.** `refetchedNoteRef` is set *before*
`refresh()` (`:273-274`) and re-checked at `:272`, so an id that genuinely does
not exist costs one request for the visit rather than one per render
(`App.test.tsx:621-633`). The pair is reset during render when `patientId`
changes (`:256-261`), so the id is forgotten when she moves to another patient
and a real return to the first patient gets a fresh chance. The refetch is
notes-only: it calls `notes.refresh()`, never `patients.reload`, and never
changes the route-family key — `App.test.tsx:613-615` / `:691-692` pin the
patients fetch at 1 across both refetch paths, and root's Chromium asserts the
sidebar node identity is still the same object after the prior-save flow
(`browser-check.mjs:65`, `:66`).

**Residual, recorded not charged:** if the server has not yet made the new note
visible when the single refetch answers, the id stays unresolved until the next
read (a visibility change or primary acquisition already triggers
`notes.reload()`, `Workspace.tsx:223-240`). That is the documented
once-per-id trade-off, not a regression, and no owner requirement names it.

## F2 — repaired by specificity, not by import order. 560px and the footer hold

`main.tsx` still imports `./App.js` before `./styles/app.css`, so the component
sheets are emitted first; the repair therefore does not rely on the order at
all. Every rule that beat an `app.css` rule is now compounded with the class
`app.css` puts on the same element, which raises specificity from (0,1,0) to
(0,2,0) regardless of emission order:

- `capture-modal.css:17` `.modal.capture-modal { max-width: 560px; … }` vs
  `app.css:2481-2486` `.modal { max-width: 460px }`. The rendered element does
  carry both classes (`Capture.tsx:404` `className="modal card capture-modal"`).
- `notes-column.css:35` `.col-header-title.notes-col-head-row`
  (`NotesColumn.tsx:100`), `:42` `.new-note-btn.notes-col-new` vs
  `app.css:271-288` `.new-note-btn` (`NotesColumn.tsx:108`),
  `:49` `.col-body.notes-col-body` vs `app.css:168-172` `.col-body { flex: 1 }`
  (`NotesColumn.tsx:127`). Each compounded class is verifiably on the same
  element.
- `.notes-col-footer` (`:57`) needs no compound — `app.css`'s `.col-actions`
  (`:1777-1782`) states no conflicting property.

No `!important` anywhere in `app.css` competes with this (the only three are
`motion.css:230-232` reduced-motion and `app.css:2132` inside a media query),
`.card` (`:1054-1060`) sets no `max-width`, and `.modal-backdrop` is
`position: fixed; inset: 0` (`:2470-2479`) so the new `.route-background`
wrapper cannot move or uncentre the window.

**The shared scrim invariant holds.** `capture-modal.css` writes no
`backdrop-filter` and no background; the one rule that names `.capture-modal`
is still the single copy (`app.css:5155-5159`, root's reserved edit, the only
`app.css` change in the batch). `.modal-backdrop:has(.capture-modal)` is
(0,2,0) and nothing competes with it.

**Real geometry, root's Chromium:** window `max-width` computed **560px**
(`browser-repair.log` line 3, asserted at `browser-check.mjs:39`); notes footer
`top:695 bottom:800` unchanged by scroll (`browser-repair.log` lines 2 and 5),
and with a real 30-note list the inner scroller is `client 651 / scroll 2325`
while the footer still measures 695..800 (`browser-check.mjs:74-76`). Root's
own record (`root-verification.md`) preserves the two harness-only failures it
hit on the way there (an entrance-transform sampled mid-animation, and a
synthetic scroll note plus a resizer click) as failures, with no product claim
taken from them and no threshold relaxed — that is the correct handling and I
am not converting them into evidence.

## F3 — corrected in root's reserved edit

`shared/src/i18n/en.ts:2645-2648`: `capture.closeLabel` now sits *above* the
doc comment, and the comment `` /** `Capture.tsx:283`, and the heading while
the patient is unknown. */ `` is again directly above `capture.newNote`, which
is what it describes. `es-MX.ts:2345` carries the value with no stale comment.
`npm run lint` (root, exit 0) runs `scripts/check-ui-strings.mjs` and passes.
CLOSED.

## Focus restoration — proven in real Chromium, and the mechanism is right

The initial review left this as *unverified*, with a stated theory (the
background was still `inert` when `Dialog`'s cleanup called `focus()`). Root's
pre-repair probe returned `{tag:"BODY", inert:false}`, which did not fit that
theory as stated, and C's repair took the ordering explanation instead. That
explanation is the correct one:

- `Dialog` restores focus from a **passive** `useEffect` cleanup keyed on
  `open` (`Dialog.tsx:67-80`).
- React's commit runs mutation + **layout** effects synchronously, and passive
  effect destroy/create afterwards. So a layout-phase change is guaranteed to
  land before the passive cleanup that calls `focus()`.
- `App.tsx:210-224` moved the overlay `inert` toggle to `useLayoutEffect`, so on
  the closing commit the practice behind the window leaves `inert` before the
  keyboard is handed back. The pre-repair passive version could not: passive
  cleanups all run before passive setups, so the old ordering raced by
  construction. Root's `inert:false` observation is consistent with this — the
  probe looked *after* the discarded `focus()`.
- The unit test `App.test.tsx:519-548` pins the invariant rather than the
  browser's refusal: it records the background's `inert` in a `focus` listener
  on the opener and asserts every recorded value is `false`, which is what the
  browser result depends on (jsdom does not model `inert`).

**Actual Chromium proof (root's run, cited):** `browser-check.mjs:36-42` opens
the window from New note, asserts the open state (560px / inert / blur /
summary focused) at `:38-39`, presses **Escape**, waits for the window to be
gone, and then asserts `await expect(page.getByTestId('notes-new-note')).toBeFocused()`.
That script exited 0 — `browser-repair.log` carries all six of its check lines
through the final direct-link check at `:77-78`. This is the requirement met in
a real browser, not inferred from jsdom.

**Nothing about the restriction was weakened.** `inert` is still applied to
`.route-background` for exactly as long as the overlay is open, in the same
commit, only in an earlier phase (`App.tsx:216-224`). The overlay renders as a
**sibling** of `.route-background` (`App.tsx:246-254`), so neither the capture
panel nor the leave-confirmation inside it is ever inside the inerted subtree.
`Dialog`'s own key handling and Tab trap (`Dialog.tsx:84-127`) are untouched.

**Primary/secondary ownership is preserved.** The primary-window restriction is
a *separate* passive effect on `#apunta-content` (`App.tsx:178-186`,
`blocked = secondary || unsupported`) and was not touched; `PrimaryBlocker`'s
cover and Tab trap are unchanged. `App.test.tsx:2056` ("stays blocked with an
explanation and inert app content") passes.

**One new ordering edge, recorded not charged.** If the capture closes in the
same commit that the window becomes non-primary, the layout effect clears the
background's `inert` and then the passive `blocked` effect sets `inert` on the
whole content — after `Dialog`'s cleanup already called `focus()`. Focus would
be dropped in that one interleaving. It is strictly no worse than before the
repair (previously the background stayed inert for the whole close), it needs
the window to lose primary status in the same commit as the close, and no owner
requirement covers it. Follow-up material, not a defect in this batch.

---

## Preserved from the initial review, re-checked against the final source

**Shared editor-unpersisted flag — caveat preserved, still outstanding.**
`lib/maintenance.ts` is untouched (absent from `git diff 364ee9f`), so this is
not a P5.3 repair and not a card acceptance. `Capture.tsx:222-224` publishes
`{recording, editor}` into `publishedRef` and `:206-210` retracts only what this
window published — the direction IR C6 asked for. The reverse direction is
unchanged and still stands: Capture's dirty effect publishes
`setEditorUnpersisted(unfinished)`, and `unfinished` is `false` on mount
(`:213`), so a `true` published by the retained `NoteView` behind the window
(`NoteView.tsx:377`) can be cleared by this window's mount. As the initial
review analysed, `NoteView` sets `true` only inside `onBeforeUnload` and
recomputes it on the next `beforeunload`, so the exposed case is a `pagehide`
with no preceding `beforeunload` — in which the flag was already false before
this batch. Net: still not a newly introduced acceptance failure, and the
single-flag design is now genuinely shared by two live components. Carry it
forward; do not close it on the strength of `publishedRef`.

**Narrow-pane focus retarget after the heading removal.** `Workspace.tsx:561-572`
retargets to `[data-testid='notes-new-note']` instead of the deleted
`notes-header`. I checked the reachability: `narrowPane === 'notes'` requires
`patient !== null` (`:549-555`), and `NotesColumn` only renders the New note
button when `patient` is truthy (`NotesColumn.tsx:107-118`), so the new target
exists whenever the branch fires. The one case where it does not — a patient
with no notes, where `firstNoteOnly` leaves the column out entirely
(`:742`, `:763-774`) — is exactly the case where the *old* target
`notes-header` was missing too, since it lived inside the same component. No
regression.

**Guards, dirty confirm, one modal, trap, direct links, directory stability.**

- Leave protection is not bypassed anywhere: `close()` (`Capture.tsx:275-283`)
  is an ordinary `navigate(-1)` / `navigate('/?patient=…', {replace:true})`, so
  `useBlocker` (`:81`, `:250-256`) still intercepts. `navigate(-1)` is used only
  when a *validated* `backgroundLocation` exists **and** `history.state.idx > 0`
  shows in-app history; a typed deep link has neither and leaves by replace.
  `readBackgroundLocation` (`:96-113`) rejects a non-Location and a
  `/capture/` background, so a malformed state cannot walk the × out of the app.
- One modal at a time: the capture `Dialog` is `open={blocker.state !==
  'blocked'}` (`Capture.tsx:402`), so it stops handling keys and
  `aria-hidden`s its panel, and the `ConfirmDialog` is a **sibling** of that
  panel (`:623-637`), never inside the hidden ancestor. Escape on the
  confirmation stays rather than closing both
  (`Capture.test.tsx:526-548`).
- Dirty confirm keeps her work: root's Chromium clicked × on a typed summary,
  got the confirmation, `Stay` preserved the text verbatim, `Discard` closed
  (`browser-check.mjs:44-51`); unit coverage at `Capture.test.tsx:362-411`.
- Back/Forward: `Capture.test.tsx:486-524` (pops to the route it was opened
  over when there is in-app history) and `:549-586` (Back stays guarded, Forward
  brings the window back).
- Direct link: root's Chromium `page.goto('/capture/<id>')` → Escape → the
  patient is retained (`browser-check.mjs:77-78`); unit coverage
  `App.test.tsx:550-559` (synthetic `'/'` background with `?patient=id`, and the
  chosen patient already in the sidebar behind it).
- Patient directory stability: `sidebarSame:true`, `patientReads:1` across View
  all → directory row → back (`browser-check.mjs:17-25`), and
  `App.test.tsx:388-459` pins node identity and request counts. `/` and
  `/patients` share one route-family key (`App.tsx:145-147`).
- Keyboard trap: `Dialog.tsx:92-122` unchanged; `Ctrl+B` correctly stands down
  while the overlay is up by reading `#apunta-content`'s `data-capture-overlay`
  at keydown time (`Workspace.tsx:598-606`, `App.tsx:236-239`) — render-order
  independent, so no stale-read hole.

**Opening the window cannot blank the practice.** `Capture` and `Workspace` are
both eagerly imported (`App.tsx:10-11`), unlike the lazy non-workspace screens,
so opening the overlay never trips the shared `<Suspense>` (`App.tsx:245`) and
never hides the mounted workspace behind a fallback.

**Modal layout survives the new wrapper.** `.route-background` is a plain
unstyled div and no stylesheet keys on `#apunta-content > *` (grepped across
`web/src/styles/*.css`); `.workspace` carries `height: 100vh`
(`app.css:23-27`) so the extra block wrapper cannot change the shell's height.
Confirmed empirically by root's measured geometry.

## Per-requirement result (final source)

| # | Owner requirement | Result |
| --- | --- | --- |
| 1 | Directory → patient keeps the mounted workspace, sidebar and data; no full-view animation/loading/list reload | **PASS** — `App.tsx:145-147,246-254`; `sidebarSame:true`/`patientReads:1`; `App.test.tsx:388-459` |
| 2 | No patient heading in the second column | **PASS** — `NotesColumn.tsx:99-118`; `NotesColumn.test.tsx:96-113`; Chromium `notes-head h3` count 0 |
| 3 | New note first, notes scroll alone, three tools fixed bottom | **PASS** — three bands; footer 695..800 before and after scroll, incl. a real 30-note list (651/2325) |
| 4 | Blank space is only noninteractive space; flush/conflict preserved; stale nav guarded | **PASS** — `NotesColumn.tsx:50-51,88-92` `closest(PRESSABLE)`; `Workspace.tsx:286-311` awaits the flush, re-checks the captured navigation, and keeps editor + query + reason on refusal (`App.test.tsx:795-860`) |
| 5 | Capture is a modal over the mounted patient; home/deep links, Back/Forward; recording/typed/retry/progress unchanged | **PASS** — `App.tsx:188-254`, `Capture.tsx:274-283,394-637`; inert true / blur 6px / summary focused; the recording, transcription, retry and progress suites are unchanged and green |
| 6 | Dirty close confirms, one active dialog, focus trapped and restored | **PASS** — `Capture.tsx:402,623-637`, `Dialog.tsx:67-127`; Stay/Discard proven in Chromium; **restoration proven in actual Chromium** (`browser-check.mjs:42`) |
| 7 | The draft selects the newly refreshed note without a patient reload | **PASS** — was FAIL (F1). `Workspace.tsx:184-204,242-275`; `App.test.tsx:644-693` end-to-end; root's Chromium "prior save → Create draft" block now persists, selects and keeps the sidebar node (`browser-check.mjs:53-66`) |
| 8 | Shared bilingual `closeLabel`, one shared blur | **PASS** — `en.ts:2646`, `es-MX.ts:2345`, `app.css:5155-5159`; `capture-modal.css` restates no scrim; comment nit F3 closed |

## P5.3, favicon, scope, dependencies — unchanged and not waived

- `lib/maintenance.ts` and the primary-window controller are untouched. The
  blocked P5.3 V8 failure is **not** repaired, **not** waived and **not**
  accepted by anything in this report; the scoped e2e run root performed does
  not stand in for it.
- No favicon implementation (TODO only). No new dependency, no download, no
  `package.json` change in the diff.
- C held its declared scope: `Workspace.tsx`, `App.tsx`, `App.test.tsx`,
  `capture-modal.css`, `notes-column.css` and its own return. `NotesColumn.tsx`,
  `Capture.tsx`, `PatientWelcome`, `HomeLauncher`, `app.css` and the catalogues
  still carry A's and B's (and, for `app.css`, root's) work, unaltered — which
  is what makes this re-review meaningful rather than a review of C alone.
- Housekeeping still open for root, not defects: A's now-dead
  `.notes-header-patient .col-header-title` / `h3` rules in `app.css`, and the
  fake API's missing `GET /api/notes/:id`, which A's conflict test works around
  in its own stub.

## Checks: PASS / FAIL / NOT RUN, honestly

| Check | Who | Result |
| --- | --- | --- |
| `npx vitest run --project web web/src/App.test.tsx web/src/components/NotesColumn.test.tsx web/src/routes/Capture.test.tsx` | **me**, granted targeted lease | **PASS** — exit 0, 3 files, 124 passed (Node v24.19.0) |
| `npx tsc -p web/tsconfig.json` | **me**, targeted | **PASS** — exit 0 |
| `npx eslint` on the nine batch source/test files | **me**, targeted | **PASS** — exit 0 |
| `npm test` (171 files / 2450 tests) | root | **PASS** — exit 0 (`repair-test.log`, `unit.exit`); read, not rerun by me |
| `npm run typecheck` / `lint` / `build` | root | **PASS** — exit 0 each (`repair-typecheck.log`, `repair-lint.log`, `repair-build.log`) |
| Scoped `workspace`/`capture`/`save-integrity` Chromium + es-MX e2e | root | **PASS** — exit 0, 33 passed / 1 skipped (`e2e-repair.log`); read, not rerun by me |
| Real-Chromium candidate verification (sandbox 7823) | root | **PASS** — script exit 0, six check lines (`browser-repair.log`) |
| Full P5.3 V8 e2e suite | root | **NOT RUN** — still blocked; not waived |
| `npm run eval`, `smoke:live`, `check:format`, `check:refine`, macOS packaging | — | **NOT RUN** — outside this batch and outside my lease |
| Favicon | — | **NOT DONE** — TODO only, by design |

I did not run any global check, build, e2e or browser session, and I take no
acceptance of anything I did not run myself beyond the targeted rows above.

## Bottom line

The batch's own requirement 7 now holds in the ordinary workflow that broke it,
the stated design values survive the stylesheet import order, and the keyboard
comes back to the control that opened the window in a real browser. Nothing new
is broken, the primary-window restriction and the shared dirty-flag caveat are
preserved as they were, and the blocked P5.3 failure is untouched. This is
ready for root's acceptance decision and the owner-preview refresh; the three
carried residuals above are follow-up work, not conditions on this batch.

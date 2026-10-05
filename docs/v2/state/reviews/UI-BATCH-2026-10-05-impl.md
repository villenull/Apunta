# UI-BATCH-2026-10-05 — independent implementation review

Read-only review of the working-tree diff from `364ee9f` (owner three-item UI
batch), plus the two return notes, the instruction review, and root's reserved
shared edits. No source edits, no counterfactual mutations, no commits, no
global build/e2e, no unit run, no 7717/live data, no dependency. Synthetic
fixtures only. Existing test evidence is **read, not rerun**; the browser
evidence below is **root's run**, cited, not repeated by me.

Evidence companion: `docs/v2/evidence/UI-BATCH-2026-10-05/review.md`.

## Verdict: NOT CLEAR

One confirmed HIGH defect (F1) breaks owner requirement 3/7 in an ordinary
workflow, and root's own real-Chromium run reproduces it. It is the exact
"prior local update poisons the refetch guard" edge that A's return A3 issue 4
called unreachable. Two low findings (F2, F3) are cosmetic/shared-edit nits.
Everything else the owner asked for verifies sound against the code, the unit
suite root reports green (2445 pass), and root's browser evidence.

A bounded repair is warranted and is root's call; I make no source change.

---

## F1 — HIGH: a new draft is not selected when the notes list was edited first

**Requirement:** #3 ("draft selects newly refreshed note without patient
reload"); owner item 1's no-reload promise.

**Where:** `web/src/routes/Workspace.tsx:173-186` (the ref, written only inside
`loadNotes`), `:243-252` (the guard), specifically `:247`
`if (notes.state.data !== notesAnswerRef.current) return;`; `:334`
`const updateNotes = notes.update;` and `:343-348` `handleNoteChanged`;
`web/src/hooks/useLoader.ts:92-96` (`update`).

**What happens.** The unknown-id refetch only fires when
`notes.state.data === notesAnswerRef.current` — the exact array the newest
`listNotes` request answered with. `notes.update(...)` (used by a note save via
`handleNoteChanged`, a refine-chat rewrite, and `handleNoteDeleted`) replaces
`state.data` with a **new** array through `useLoader.update`, which never writes
`notesAnswerRef`. From that point, for the rest of that patient's visit, the
guard returns early: no `notes.refresh()`, so the id handed back by capture is
absent from `visibleNotes`, `note` resolves to `null`, and the main pane falls
to `PatientWelcome` (`Workspace.tsx:809-810`).

A's return A3 issue 4 argued this is "not reachable in the capture flow itself
(nothing updates the list while the window is open)". The window staying mounted
is exactly what makes it reachable: the update happens **before** capture opens
and persists, because opening capture no longer remounts the workspace.

**Repro (root-confirmed, real Chromium).**
1. Open an existing draft note, edit it, wait for the editor's "Saved".
2. Click **New note**, type a summary, **Create draft**.
3. Modal closes; the URL carries the new `note=` id and the note is persisted
   server-side; the main pane shows the patient welcome with the **old** notes
   list and no `note-body`.

Root evidence: `build/ui-batch-2026-10-05/browser-check.mjs:46-59` (the "Normal
use: save an existing note, THEN create another" block) and
`build/ui-batch-2026-10-05/browser.log` (exit 1). Root reports the run failed
precisely at `await expect(page.getByTestId('note-body')).toBeVisible()`, after
`landed` and `persisted` were already true.

**Blast radius.** Any `notes.update` before opening the window: the common
"finish the current note, then start the next" path, a refine-chat rewrite, and
a note delete. The unit test added for this
(`App.test.tsx`, "reads the list once for an id it has not seen") exercises only
the fresh case — no prior local update — so the suite stays green while the
workflow fails.

**Repair direction (root's to implement, not mine):** key the guard on
patient + request identity rather than array equality, and add a regression for
"prior save → create draft". Until then the batch's own requirement 7 is unmet.

---

## F2 — LOW: the new component stylesheets load before `app.css`, so some overrides lose

`main.tsx:4` imports `./App.js` (which reaches `Capture.tsx` → `capture-modal.css`
and `Workspace.tsx` → `NotesColumn.tsx` → `notes-column.css`) **before**
`main.tsx:9` imports `./styles/app.css`. In the emitted bundle the component
rules therefore precede `app.css`, and equal-specificity `app.css` rules win.

Concrete, built-artifact-confirmed instance:
- `web/src/styles/capture-modal.css:12` `max-width: 560px` is overridden by
  `web/src/styles/app.css:2481-2486` `.modal { max-width: 460px }`. In
  `web/dist/assets/index-8Ul0_Bk-.css` `.capture-modal{` is at byte **295** and
  `.modal{` at **40443**. The capture window renders 460px, not the 560px B's
  return claims. (`max-height` and `overflow-y` are not in `.modal`, so those
  still apply.)

Same cause, smaller: `notes-column.css:32` `.notes-col-new { margin: 0 }` is
overridden by `app.css:271-288` `.new-note-btn { margin: 0 0 var(--space-2) }`
(built: `notes-col-new` at byte 46, `new-note-btn` at 11934), and
`notes-column.css:39` `.notes-col-body { flex: 1 1 auto }` by `app.css:168-172`
`.col-body { flex: 1 }`. Both are cosmetic; the max-width is the one a browser
check would notice.

This is a new-file/import-order fragility, not an owner acceptance failure by
itself, but it silently defeats stated design values and should be fixed in the
same bounded repair (e.g. import the component sheets after `app.css`, or raise
their specificity). Root's browser check measured blur/inert/focus, not width.

---

## F3 — LOW: the reserved `capture.closeLabel` edit displaced a doc comment

`shared/src/i18n/en.ts:2645-2648`: the comment
`/** `Capture.tsx:283`, and the heading while the patient is unknown. */` now
sits above the new `capture.closeLabel` key (`:2646`) although it describes
`capture.newNote` (`:2648`). Key order is fine and `check-ui-strings` passes;
this is a documentation nit in root's reserved edit. `es-MX.ts:2345` has the
value, correctly, with no stale comment.

---

## Evaluated residuals (recorded, not charged as defects)

**Shared editor flag across the retained editor and Capture.** `editorUnpersisted`
(`maintenance.ts:143`, `setEditorUnpersisted` `:206-208`) is now genuinely
written by two live components: `NoteView.tsx:377` / `:392` and
`Capture.tsx:222-224` / `:204-212`. B's `publishedRef` correctly stops Capture
from retracting a flag it did not publish — the direction IR C6 named. The
reverse direction survives: Capture's dirty effect publishes `unfinished` (false
on mount), and its unmount only clears when it published `true`, so opening the
window can clear a `true` that NoteView published. In practice NoteView sets
`true` only inside `onBeforeUnload` (`NoteView.tsx:372-381`) and recomputes it on
the next `beforeunload`, so the exposed window is a `pagehide` with no preceding
`beforeunload` — in which the flag was already false before this batch. Net: not
a newly introduced acceptance failure, but the single-flag design is now shared
and is a reasonable follow-up. `lib/maintenance.ts` is untouched; no P5.3
controller change.

**Focus restoration on close.** `Dialog`'s cleanup restores focus to the opener
(`Dialog.tsx:77-79`) during the same commit in which `App.tsx:200-208` clears
`inert` on `.route-background` in a later passive effect; `focus()` on an inert
element is a no-op, so after closing capture focus can fall to `<body>` instead
of the New note button. jsdom does not model `inert`, and no test asserts it, so
this is **unverified**, not confirmed. Root's browser check should open a clean
capture from New note, press Escape, and inspect `document.activeElement`/first
Tab. The open-path focus (summary focused) is confirmed.

**Ctrl+B while the window is open.** `Workspace.tsx:582` reads
`#apunta-content`'s `data-capture-overlay` (`App.tsx:224`) at keydown time;
correct and render-independent. Good.

---

## Per-requirement result

1. **Same sidebar/workspace DOM, no repeated patient fetch on ViewAll/selection**
   — PASS. `App.tsx:145-147` `routeFamilyKey`; `/` and `/patients` share one
   key; root browser `sidebarSame=true`, 1 patients fetch; new App test suite
   asserts node identity and request counts.
2. **No patient heading in the second column** — PASS. `NotesColumn.tsx:99-122`
   drops the `h3`; `NotesColumn.test.tsx` asserts it gone and the "Notes" label
   remains.
3. **New note top, notes scroll, tools fixed bottom** — PASS. `NotesColumn.tsx`
   three bands; `notes-column.css`; root browser footer stays 695..800 after
   scroll.
4. **Blank-space only noninteractive; flush/conflict preserved; stale nav
   guarded** — PASS. `NotesColumn.tsx:50-51,90-93` `closest(PRESSABLE)`;
   `Workspace.tsx:274-289` awaits the existing flush and re-checks the captured
   navigation; root browser blank deselect; App test conflict case keeps editor
   + query + toast.
5. **Modal over the mounted patient; home/deep links; Back/Forward; inert and
   primary ownership; recording/typed/retry/progress unchanged** — PASS for the
   routing/modal itself (`App.tsx:120-208,232-237`; `Capture.tsx:274-281,319-367`;
   root browser inert=true / blur 6px / summary focused / Stay+Discard;
   Capture.test recording suite unchanged). The **returned draft selection**
   fails after a prior local edit (F1).
6. **Close dirty confirms with a single active dialog and focus trapping** —
   PARTIAL. Single live modal, one Escape, text retained: PASS
   (`Capture.tsx:417-427`; Capture.test "shows one modal at a time"; root
   browser). Exact focus restoration on close: unverified (residual above).
7. **Draft selects the newly refreshed note without patient reload** — FAIL in
   the prior-edit case (F1); PASS in the fresh case.
8. **Shared `closeLabel` bilingual + one shared blur** — PASS.
   `en.ts:2646`, `es-MX.ts:2345`, `app.css:5155-5158`; B4 invariant holds
   (`capture-modal.css` restates no blur); App test scrim regex widened.
   Comment nit F3.

## P5.3, favicon, scope

- `lib/maintenance.ts` and the controller are untouched; the known P5.3 V8
  failure is not waived, not repaired, and remains separate.
- No favicon implementation (TODO only). No new dependencies or downloads.
- A's dead `app.css` rules `.notes-header-patient .col-header-title` / `h3`
  (`app.css:3009-3017`) are now unused; housekeeping for root, not a defect.
- A's `app.css`/fake-API open items (A-return 1-3) remain as recorded; the
  fake-API `GET /api/notes/:id` gap is worked around in tests, not fixed.

## Bottom line

The routing/modal/column architecture is sound and matches root's browser
evidence, but the batch cannot be called done: F1 is a reachable, owner-facing
regression in the very feature item 3 was written for, and it is not covered by
the added tests. One bounded repair (F1; optionally F2) plus a targeted
regression and a re-run of root's browser workflow, then re-review.

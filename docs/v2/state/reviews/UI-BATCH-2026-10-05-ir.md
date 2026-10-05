# UI-BATCH-2026-10-05 — instruction review (IR)

Read-only instruction review. Base `364ee9f`. Scope: the three owner-authorized
UI changes and the App/Workspace/Capture/NotesColumn/PatientWelcome/HomeLauncher
/useLoader/Dialog + test surface they touch. No app or server run, no commands,
no edits outside this report. Synthetic data only.

## Verdict: NOT CLEAR as written — the approach is viable, but 12 concrete
## defects must be fixed before implementation. Two of them (A11, B4) are
## scope/root decisions, not worker calls.

### Verified sound (so the defects below are execution, not architecture)

- `<Routes location={background}>` really does give Workspace the background
  LocationContext. React Router 8.3.0 wraps override-location matches in a
  `LocationContext.Provider` (`node_modules/react-router/dist/development/lib/
  hooks.js:612-623`), so `useSearchParams`/`useLocation` in Workspace read the
  background (`?patient=…`), not `/capture/…`. The root finding holds.
- `/`↔`/patients` needs no remount once the wrapper key is stable:
  `_renderMatches` (`hooks.js:718-…`) reconciles `<RenderedRoute><Workspace/></…>`
  by position/type with no per-match key. The only forced remount is
  `App.tsx:104`'s `key={location.pathname}`.
- `useBlocker` (`hooks.js:1247`) reads data-router context, so it works from the
  overlay `<Routes>`; `reportDirty(false)` at `Capture.tsx:270-272` disarms it
  before the success navigate. Good.

### A — routing and the workspace family (task 1)

**A1. Key must be derived from the effective (background) location, not the
actual pathname.** `App.tsx:104` keys on `location.pathname`; while the overlay
is open that is `/capture/:id`, so opening capture would remount Workspace and
defeat the whole change. Correction: `const effective = background ?? location;`
and key on `effective.pathname === '/patients' ? 'workspace' : effective.pathname`
(or a small helper mapping `/` and `/patients` to one `workspace` key).

**A2. The overlay must render outside whatever is made `inert`.** `Dialog.tsx`
does not inert the page behind it (only `App.tsx:85-93` sets `#apunta-content`
inert, and only from `blocked`). To satisfy "no background focusable controls
while the modal is open", A must set the background inert when an overlay is
present — but the overlay `Dialog` must then be a sibling of the inerted node,
not a descendant, or the modal becomes inert too. Correction: inert only the
background `<Routes>` subtree and render the capture overlay beside it (still
inside `#apunta-content` is fine if the keyed div is not the inert target).

**A3. One-shot reload for a newly generated note.** On success Capture
`replace`s to `/?patient=id&note=<new>` (`Capture.tsx:272`). The Workspace
loader callback depends only on `patientId`, so it will not re-fetch and the new
note is absent from `visibleNotes`. Correction: a ref keyed by note id —
reload only when `notes.state.status === 'ready'`, `noteId !== null`, the id is
not in the list, and the ref has not already fired for it; reset the ref when
`patientId` changes. Do not key the effect on `visibleNotes`/`note === null`
alone: a genuinely missing (deleted) id would reload forever.

**A4. Deselect must await the existing flush, not unmount the editor.** Blank
space on the notes column clears `note`/`view` by `setParams`, which unmounts
`NoteView`; its unmount flush swallows failures
(`NoteView.tsx:396` `void flush().catch(() => undefined)`), so a conflicted or
failed save is silently lost. Correction: in Workspace's deselect handler, if a
note is open, `await window.__apuntaFlushBeforeRelease?.()` before clearing;
on rejection keep the query and surface it through the existing
`actionError`/`Toast` (`Workspace.tsx:727`). After the await, re-read the current
`patient`/`note` params and only clear if they still match what was captured, so
a late resolution cannot clobber newer navigation.

**A5. Removing the notes heading breaks the focus target and tests.** The
`data-testid="notes-header"` is the `narrowPane === 'notes'` focus target
(`Workspace.tsx:451-459`) and is asserted in `App.test.tsx:116,199,207`. Keep a
stable focusable target (retarget to the notes-list heading or the New note
button) and update those tests; do not drop the narrow-screen back control that
lives in the same header (`NotesColumn.tsx:56-66`).

**A6. Synthetic background needs the id and a stable identity.** `AppRoutes`
sits at `path="*"`, so `useParams` cannot give the capture id. Correction: derive
it with `matchPath('/capture/:patientId', location.pathname)`, build the
synthetic `Location` once (memoized) so the `LocationContext.Provider` value does
not change identity every render.

### B — notes column (task 2)

**B1. Blank-space detection must ignore interactive descendants, not just
compare `target === currentTarget`.** Correction: on the scroll container, bail
if `(event.target as HTMLElement).closest('button, a, input, textarea, select,
[role="button"], [contenteditable="true"]')` is non-null. This keeps clicks on
New note, the three tools, note rows, the "Notes" label and inner wrappers from
clearing, and still fires on genuinely empty space.

**B2. Keep the click surface on the element that owns the rows.** If the rows
are wrapped in an inner div, empty space below them belongs to that div, not the
outer container, so a `target === currentTarget` guard misses it. Attach the
handler to the actual scroll container that directly contains the rows, or rely
on B1's `closest` guard.

### C — capture as a modal (task 3)

**C1. Two stacked `Dialog`s double-handle Escape/Tab.** Capture will return a
`Dialog`, and the leave-confirm is a second `Dialog` (`ConfirmDialog` →
`Dialog`). Both register `document` keydown (`Dialog.tsx:84-127`); Escape would
fire both the close-navigate and the blocker reset. Correction: render the outer
Capture `Dialog` with `open={blocker.state !== 'blocked'}` — `Dialog` ignores
keys and `aria-hidden`s the panel while closed (`Dialog.tsx:88,149`), leaving
the confirm as the only live modal.

**C2. Initial focus must be pinned to the summary field.** `Dialog` focuses the
first focusable in DOM order (`Dialog.tsx:71-76`), which will be the × close
button, overriding the textarea's `autoFocus` (`Capture.tsx:464`). Correction:
pass `initialFocusRef` to the `SpellLayer` textarea, as `AddPatient.tsx:89` does.

**C3. The missing-patient branch still returns a full-screen `Screen`.**
`Capture.tsx:293-305` renders `Screen`, which under background routing would put
a second full screen behind/over the workspace. Correction: render that state
inside the same `Dialog` (with the close control), or have A not mount the
overlay for it.

**C4. Close must pop the in-app entry, not push the background.** Reuse
`AddPatient.tsx:51-58`'s `history.state.idx` check: `navigate(-1)` when opened
from inside the app, `navigate('/?patient=id', { replace: true })` on a direct
load. A blind `navigate(backgroundLocation)` leaves the capture entry in history
and makes Back reopen it.

**C5. Every entry point must carry the background state.** Add
`state: { backgroundLocation: location }` (or a shared helper) at
`NotesColumn.tsx:74`, `PatientWelcome.tsx:42` and `:105` (both `Link`s need
`useLocation`), and `HomeLauncher.tsx:75`. Missing any one silently produces a
full-screen capture.

**C6. Unmount must reset the quiesce flags.** Capture's dirty effect
(`Capture.tsx:154-162`) has no cleanup, so an overlay that closes mid-recording
can leave `recordingActive`/`editorUnpersisted` true for the persistent
Workspace behind it. Pre-existing in shape, newly exposed by the overlay.
Correction: on unmount call `setRecordingActive(false)` and
`setEditorUnpersisted(false)` (or set them in `abandonCapture`).

### Cross-writer / scope — root decision

**A11 (A + shared file): a new catalogue key is needed for the modal close
control.** There is no generic close key (`common.dismiss` is the nearest);
`patients.addClose` is wrong. `check-ui-strings.mjs` forbids an inline literal,
so B needs a reserved edit to `shared/src/i18n/en.ts` + `es-MX.ts` (e.g.
`capture.closeLabel`). Per the packet, ask root.

**B4 (B + app.css): the "one place the blur is written" invariant.** The scrim
blur lives once, in the shared `:has` rule at `app.css:5155-5158`, and
`App.test.tsx:888-894` asserts exactly one `backdrop-filter: blur(var(--scrim-blur))`
in `app.css`. B's separate `capture-modal.css` adding the same declaration
duplicates it; the test scans only `app.css`, so it will not catch the drift.
Either add `.capture-modal` to the shared selector in `app.css` (needs an owner
decision, since B is told not to edit App/Workspace and app.css is not assigned)
or extend the test to scan all stylesheets.

### Notes not charged to the batch

- The Ctrl+B handler (`Workspace.tsx:485-496`) is a `document` listener, so it
  still toggles the sidebar while the overlay is open even with the background
  inert. Minor; guard it if the inert work is done anyway.
- `usePrimaryWindow.becomePrimary` focuses `#apunta-content` after a takeover
  (`App.tsx:277-280`); with an overlay open that element is inert and the focus
  call is a no-op. Cosmetic.

## Required test additions (targeted, per writer)

- A: assert the Workspace DOM node is the same instance across `/` → `/patients`
  → `/?patient=id`, and that `api.calls` does not grow for patients/notes on
  `/`↔`/patients`.
- A: assert a new note id arriving from capture triggers exactly one
  `listNotes` re-fetch and selects the note, and that an unknown id does not
  loop.
- A: assert blank-space deselect awaits the flush and keeps the editor +
  surfaces the error on a conflicted flush.
- B: assert the leave-confirm is the only modal (Escape once), the textarea
  holds focus, direct `/capture/id` closes to `/?patient=id`, and Back/Forward
  reopen/close the overlay.

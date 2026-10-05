# UI-BATCH-2026-10-05 — review evidence

Companion to `docs/v2/state/reviews/UI-BATCH-2026-10-05-impl.md`. Read-only
review of the working-tree diff from `364ee9f`. No test command was run by this
review; the browser evidence is root's, cited below. Synthetic data only.

## Scope read

- `CLAUDE.md`; `docs/v2/state/UI-BATCH-2026-10-05.md` (packet + dispositions);
  `docs/v2/state/reviews/UI-BATCH-2026-10-05-ir.md`;
  `docs/v2/state/returns/UI-BATCH-2026-10-05-A.md` / `-B.md`.
- Diff: `git diff 364ee9f -- web/src/App.tsx web/src/App.test.tsx
  web/src/routes/Workspace.tsx web/src/routes/Capture.tsx
  web/src/routes/Capture.test.tsx web/src/components/NotesColumn.tsx
  web/src/components/NotesColumn.test.tsx web/src/components/PatientWelcome.tsx
  web/src/components/HomeLauncher.tsx web/src/styles/app.css
  shared/src/i18n/en.ts shared/src/i18n/es-MX.ts`.
- New files read: `web/src/styles/notes-column.css`,
  `web/src/styles/capture-modal.css`.
- Supporting reads: `web/src/components/Dialog.tsx`,
  `web/src/components/NoteView.tsx`, `web/src/lib/maintenance.ts`,
  `web/src/hooks/useLoader.ts`, `web/src/main.tsx`,
  `web/src/styles/app.css` (columns/modal/scrim/media regions).

## F1 — refetch guard, exact source anchors

- `web/src/routes/Workspace.tsx:173` `const notesAnswerRef = useRef<Note[] | null>(null);`
- `:174-185` `loadNotes`: `:177` sets the ref to `null` at request start; `:180`
  sets it to the resolved array. Written nowhere else.
- `:237-252` the unknown-id effect; `:247`
  `if (notes.state.data !== notesAnswerRef.current) return;`.
- `:334` `const updateNotes = notes.update;`; `:343-348` `handleNoteChanged`
  calls it; `:350-359` `handleNoteDeleted` calls it; `:812-819` `NoteView`
  wired to `handleNoteChanged`.
- `web/src/hooks/useLoader.ts:92-96`:
  `setState((current) => current.status === 'ready' ? { status: 'ready', data: updater(current.data) } : current)`
  — new array identity, `notesAnswerRef` untouched.
- `Workspace.tsx:809-810` `note === null` → `<PatientWelcome …>`.

Conclusion: after any `notes.update`, `state.data !== notesAnswerRef.current`
for the rest of that patient, so a capture-return id that is not already in the
list never triggers `notes.refresh()` and the draft is not selected.

## F1 — root's real-browser reproduction (cited, not rerun)

- Script: `build/ui-batch-2026-10-05/browser-check.mjs:46-59`
  (`// Normal use: save an existing note, THEN create another for the same patient.`).
- Log: `build/ui-batch-2026-10-05/browser.log` — run ended non-zero (root: exit
  1) at `await expect(page.getByTestId('note-body')).toBeVisible({timeout:5000})`,
  after `landed` (new `note=` id in the URL) and `persisted` (server list
  contains the id) were both true. The visible pane was the patient welcome with
  the old notes list.
- Root build/unit/lint/typecheck summary (root-owned): unit 2445 pass, lint 0,
  typecheck 0, build 0; sandbox `7823` with 18 fake patients, real Chromium.
  Directory: `sidebarSame=true`, 1 patients fetch; footer 695..800 after scroll;
  no heading; blank deselect works; modal `inert=true`, blur 6px, summary
  focused, Stay+Discard pass.

## F2 — CSS import order, built-artifact offsets

`web/src/main.tsx:4` `import { App } from './App.js';` precedes `:9`
`import './styles/app.css';`. Component CSS reached from `App` is therefore
emitted first.

From `web/dist/assets/index-8Ul0_Bk-.css` (mtime 2026-10-05 11:37, contains
`.capture-modal`, so it is root's fresh candidate build):

| rule | byte offset |
| --- | --- |
| `.capture-modal{` (`max-width:560px; max-height:…; overflow-y:auto`) | 295 |
| `.modal{` (`max-width:460px; …`) | 40443 |
| `.notes-col-head-row{` | 0 |
| `.notes-col-new{` (`margin:0`) | 46 |
| `.notes-col-body{` (`flex:auto`) | 112 |
| `.col-body{` (`flex:1`) | 10747 |
| `.new-note-btn{` (`margin:0 0 var(--space-2)`) | 11934 |
| `.col-actions{` | 31141 |
| `.col-header-title{` (`gap:8px`) | 57218 |

Equal specificity (0,1,0), later wins, so `.modal` 460 overrides `.capture-modal`
560; `.new-note-btn` margin overrides `.notes-col-new` margin; `.col-body` flex
overrides `.notes-col-body` flex. `max-height`/`overflow-y`/`overscroll-behavior`
are unique to `.capture-modal` and still apply.

## F3 — shared edit anchors

- `shared/src/i18n/en.ts:2645` comment, `:2646` `'capture.closeLabel'`, `:2648`
  `'capture.newNote'`.
- `shared/src/i18n/es-MX.ts:2345` `'capture.closeLabel'`.
- `web/src/styles/app.css:5155-5158` shared scrim selector now ends
  `.modal-backdrop:has(.capture-modal)`. `capture-modal.css` contains no
  `backdrop-filter`.

## Residual anchors

- `web/src/lib/maintenance.ts:143` `editorUnpersisted`; `:206-208`
  `setEditorUnpersisted`; `:211-213` `isCleanToClose`.
- `web/src/components/NoteView.tsx:372-381` (`onBeforeUnload` publishes), `:392`
  (unmount clears).
- `web/src/routes/Capture.tsx:204-212` (unmount retracts only published flags),
  `:222-224` (dirty effect publishes `unfinished`).
- `web/src/components/Dialog.tsx:77-79` (focus restore cleanup);
  `web/src/App.tsx:200-208` (inert cleared in a later passive effect).

## Commands

None run against the source tree. No build, lint, typecheck, unit, e2e, seed,
screenshot or output write. Only `read`/`grep`/`python3` over existing files and
the existing `web/dist` artifact. The failed root browser run was preserved, not
touched.

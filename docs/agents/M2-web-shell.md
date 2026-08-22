# M2 — Web app shell (prototype → React)

**Depends on:** M1

## Goal

Port the prototype UI to React against the real API. Everything a user can
do **without AI**: manage patients, formats (manual definition only), and
manually created/edited notes. Pixel-feel should match `prototype/` — reuse
its class names/styles where practical (tokens already in
`web/src/styles/tokens.css`; port the remaining component CSS now).

## Deliverables

1. Routing (react-router): `/` workspace, `/capture/:patientId`,
   `/settings`, `/onboarding/format`, `/onboarding/preview`,
   `/patients/new`. **No login screen** — `/` is the workspace. First-run
   redirect: if no note formats exist, go to `/onboarding/format`.
2. Workspace (`prototype/patients.html` as reference): three columns —
   patients list (search, add button, active state, note counts), notes list
   (per patient, "New note" button, draft dot, date + preview), main pane
   (empty states verbatim from prototype; note view with title, created/edited
   line, Delete with confirm, Copy with "Copied" flash, Publish/Published
   toggle, editable note body). The "Refine with AI" column renders but shows
   a disabled "AI arrives in a later milestone" placeholder (M4 fills it).
   - Note body editor: styled `<textarea>` (auto-growing) — not
     contenteditable — because M4 needs `selectionStart/End` for
     highlight-references.
   - Published note: read-only body (matching prototype opacity), publish
     button label/behavior identical to prototype (publish copies text to
     clipboard and locks; clicking again unlocks).
   - Editing a published note after unlock flips it back to draft (API
     unpublish → PATCH), mirroring prototype `onNoteEdit`.
3. Add patient (`add-patient.html`), Settings (`settings.html` — list
   formats with sections line + Edit linking into the format editor,
   "Add another format"), and the **manual** path of format onboarding
   (`onboarding-format.html` "Describe it myself" + `onboarding-preview.html`
   section-chips confirm screen, wired to `POST /api/formats`). The
   template/examples upload options render but route to a "coming soon"
   state (M6 implements them).
4. Capture screen (`capture.html`): format selector (from real formats),
   "Type it out" path only — textarea → for now `POST /api/notes` with the
   typed text as content and navigate to the workspace with the new draft
   selected (M3 swaps this to real drafting). "Record audio" option renders
   but disabled with a tooltip (M5).
5. Client API layer in `web/src/api/` typed from `shared/` schemas; loading
   and error states for every fetch (simple inline patterns, no library).

## Acceptance criteria

- Playwright flows, all in fake/no-AI mode: first-run onboarding creates a
  format manually → add patient → create typed note → edit body → publish
  (clipboard contains note text — assert via Playwright clipboard
  permissions) → unlock → delete note → delete patient. Search filtering.
  Empty states for no-patient / no-notes / no-selection.
- Visual sanity: workspace renders the three-column layout at 1280×800
  (Playwright screenshot committed as a reference, not pixel-asserted).
- No console errors during e2e runs (assert via Playwright).
- Baseline suite green.

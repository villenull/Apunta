# UI-BATCH-impl — independent implementation review

Batch: owner/UI agent's uncommitted files on `feature/v2`, base `36217cf`, plus
its later e2e repairs. Reviewer independent — no code changes, no git mutations,
no delegation, no server. 2026-09-27. Report uncommitted.

## Verdict: PASS on the batch; R1 accepted-as-fix and PENDING

All four intended changes are implemented correctly and tested, and the three
e2e failures are repaired test-side. Nothing lost, nothing inaccessible. R1 is
accepted by the owner as fix-before-integration; I have not seen the fix.

## R1 — accepted as fix, PENDING: the collapse transition also animates the drag

`motion.css` puts `transition: width var(--motion-base) …` on `.col-patients`
unconditionally. That width has three drivers — the collapse class, the stored
`--sidebar-w`, and the **live drag** (`SidebarResizer.tsx` `onPointerMove` →
`resizeSidebar` → inline `--sidebar-w`, `Workspace.tsx:314`) — and only the
first is meant to move. `body.is-resizing-sidebar` (`app.css:4233`) sets
`cursor` and `user-select` only, so nothing cancels the transition during a
drag or during arrow-key resizing: every `pointermove` restarts a 240ms ease,
the column trails the pointer, and a resize that was 1:1 is now rubbery.
Agreed fix, `motion.css` only: `body.is-resizing-sidebar .col-patients
{ transition: none; }`. Startup is unaffected (no transition on first style
computation) and `Ctrl+B`/the panel toggle keep the movement the owner asked
for. No test covers it — `Workspace.test.tsx` reads the stylesheet as source, so
a real drag plus the coordinator's browser check are the only confirmation.

## R2 — closed: the e2e repairs, reviewed

- `formats.spec.ts:106`, `workspace.spec.ts:59`: `{ name: 'Add patient', exact:
  true }` — correct and minimal. The submit button's name is exactly "Add
  patient", the ×'s is "Close add patient", and Playwright matches `name` by
  substring without `exact`. No production string changed, which is right: the
  close control's name is good for a screen reader.
- `brand.spec.ts:255-263`: the "accent-invariant" assertion is **inverted, not
  deleted** (`.not.toBe(reference.mark/wordmark)`) — correct against
  D10-as-amended, and it keeps the discrimination the file's header argues for:
  a hard-coded brand teal creeping back paints the same mark for both accents
  and fails here while the per-state literals still pass. Serial order is
  light-default → light-other → dark-default → dark-other, so the reference is
  always the same theme's default run.
- All four `docs/v2/evidence/P2.2/screenshots/*accent*.png` are modified: the
  e2e runs repainting evidence in the new teal. Expected, not code changes.
- `npm run lint` 0 and `npm run typecheck` 0 **re-run after** the repairs; the
  browser re-run of those specs is the coordinator's.

## Not regressions (checked, deliberately not charged to the batch)

- **Cold `/patients/new` focus** (author-flagged): **preexisting, unchanged.**
  `usePrimaryWindow` starts at `phase: 'acquiring'` (`App.tsx:194`), so
  `wasBlocked` is true on *every* cold load and the rAF at `App.tsx:269-274`
  focuses `#apunta-content` one frame after mount; the old `autoFocus` mounted
  in that same frame, so the end state is identical either way.
  `initialFocusRef` is a strict improvement for every in-app entry point.
- **Workspace remount on submit.** `navigate('/?patient=…', {replace:true})`
  unmounts the workspace inside `AddPatient` for a fresh one — the same class of
  unmount as any route change, so no new lost-draft path; two extra fetches per
  add. The batch in fact *reduces* exposure: the workspace now survives opening
  the window at all.
- **Background not `inert`.** The scrim is `position: fixed; inset: 0; z-index:
  40` with no `pointer-events: none`, so the workspace behind is not clickable,
  and `Dialog` traps Tab/Escape and restores focus. It stays in the
  accessibility tree behind an advisory `aria-modal="true"` — new here (first
  modal over a *live* workspace; `Settings` does not mount `Workspace`), but a
  screen-reader-navigation nicety, not a data or keyboard failure.

## Verified good

- **Teal.** `DEFAULT_ACCENT_COLOR = '#2a9d8f'`, `--accent: #2a9d8f`,
  `--on-accent: #111111`. Recomputed with `web/src/lib/accent.ts`'s formula:
  3.155 / 3.015 / 5.494 / 5.681 on `#faf9f5` / `#f5f4ed` / `#151515` /
  `#111111`; `#111111` on the accent 6.318 vs white 3.324. Every figure in the
  new comments and the `tokens.css` table is correct.
- **Stored accents preserved.** `applyAccentColor` paints only what is stored,
  `accentColorOrDefault` falls back, no route writes `accent_color` on load, so
  `#2a9d8f` reaches only fresh installs and reset-to-default. The new
  `Settings.test.tsx` case walks both themes with nothing stored — the guard
  that matters. The accepted risk is stated, not tidied away: 3.015 on the light
  sidebar clears AM-053's 3:1 line by 0.015, and accent-as-body-text is 3.16
  (below AA 4.5, as `#218677`'s 4.20 already was).
- **Rail hover swap is a genuine fix.** `BrandMark` paints `display:
  inline-block` as an **inline style**, outranking any stylesheet rule — so the
  old `display: none` swap was dead CSS and the panel glyph rendered *beside*
  the A. `visibility` is not set inline, is reachable, and drops the glyph from
  hit-testing and the a11y tree; `.rail-brand` follows `.rail-btn` in source
  order, so `display: grid` wins at equal specificity. `SidebarRail.test.tsx`
  pins the inline-style premise against the real component, so the swap cannot
  silently revert to `display`.
- **Collapse to `width: 0` is sound.** `PatientsColumn` always renders its full
  content, so there is something to move; the rail is a **sibling** of
  `.col-patients`, so it is unaffected; the delayed `visibility` (hidden at
  `--motion-base`, `0s` on the way back) removes the invisible column from the
  tab order. Both `min-width: 901px` guards hold. Motion off is honoured twice:
  the new `@media (prefers-reduced-motion: reduce)` block and the pre-existing
  `:root.no-motion * { transition: none !important }` for the in-app toggle.
- **Modal naming and i18n.** `showTitle={false}` + `title` gives `aria-label`
  with no dangling `aria-labelledby`, so the window is named, and the visible
  `h2` keeps the e2e heading lookup working. `patients.addLede` is gone from
  both catalogues with no leftover reference (`format.addLede` is a different
  key); `patients.addClose` added to both; parity holds.

## Commands (Node 24.19.0; no server, no database, no network, never 7717)

    export PATH=$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH
    npx vitest run web/src/App.test.tsx web/src/routes/Settings.test.tsx \
      web/src/routes/Workspace.test.tsx web/src/components/SidebarRail.test.tsx
    # 4 files, 100 tests passed — exit 0
    npm run typecheck   # exit 0
    npm run lint        # exit 0 (eslint, prettier, no-external-urls, licenses, ui-strings)

Coordinator, independently: full build 0, shared+web 601 pass 0; browser
screenshot / modal / in-app focus / rail collapse+hover / reduced motion pass.
Direct Chromium `--workers=1`: 17 pass, 3 fail, 3 not run (serial brand cascade)
— R2 ×2 and the invariance assertion, all three repaired above.

## Close-out

R1's one-line `motion.css` opt-out is the only open item; the coordinator
verifies the exact rule and records the disposition. Nothing else outstanding.

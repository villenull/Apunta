# UI backlog (owner requests, not yet implemented)

**Status: #1–#4 built and committed (14076b8). #5–#12 built
(2026-09-28), preview on 127.0.0.1:7868.** Held from #10: Atkinson Hyperlegible,
which is not in `docs/v2/ACQUISITION.md` (HS-3) and needs an amendment before it
can be bundled; the Font dropdown ships Inter (Default), System and Serif.

**Language has one entry point: More → Language (the LanguageDialog).** The
Settings row is gone (#9). `e2e/tests/language-control.spec.ts` V2/V3 were
retargeted from that row to the dialog with the coordinator's authorisation,
keeping every assertion; S2.6 steps must not point at `language-settings`,
`language-en` or `language-es-MX` any more.

Owner feeds requests one at a time with a screenshot; each is read back,
confirmed, and queued here. Nothing is implemented until the owner says go.

## 1. Move the sidebar collapse button to the right edge of the column

- **Where:** the patient column on the left, in the header row. Right now it
  reads `[collapse icon] Apunta`, with the icon to the left of the wordmark.
- **Change:** the collapse icon moves to the right edge of that column, and
  the `Apunta` wordmark shifts left into the space it leaves (flush left).
- **Alignment:** the icon lines up vertically (same x / right edge) with the
  groups control-panel button (the sort/filter knob next to the groups heading).
- **Screenshot:** Apunta, Spanish UI, header row above `Buscar`.

## 2. Drag-and-drop patients like Claude's chat sidebar

Screenshots: (a) Claude's drag ghost, (b) Claude hovering a group,
(c) Apunta's `Court-mandated` group (Diego, Farid, Gina, Karina, Ana).

- **Drag ghost:** while dragging, the patient row looks like Claude's (a): a
  compact dark rounded pill with a small icon on the left and the name,
  low-contrast, no heavy border or shadow.
- **Over a group:** when the dragged row hovers a group (b), the ghost stops
  showing the name and shows only `Move to <group name>` (Spanish:
  `Mover a <grupo>`), like Claude's `Move to Test` label.
- **Manual order inside a group:** dragging a name within its group reorders
  it and the order sticks. Example (c): drop Farid above Diego, and Farid is
  now first. The order survives a reload.
- **Remove the blue line:** the blue insertion line Apunta draws between rows
  while dragging goes away.
- **Target group outline (owner: yes):** the hovered group gets a rounded
  outline like Claude's (b), in Apunta's accent colour.
- **Sort interaction (owner: yes; sort is global per #4):** reordering by drag
  switches the single global sort to `Manual` in the ⇅ flyout. Every group
  keeps its own dragged order; groups never dragged keep their current order.
  Choosing another sort afterwards discards all manual orders. Recientes has
  no manual order (#3), so under `Manual` it stays in its default order.

## 3. Dragging a name onto Recientes takes it out of its group

- Dropping a patient onto the `Recientes` (Recent) section removes them from
  whatever group they were in. It does the same as removing them through the
  menu, just by dragging.
- Same drag feedback as #2: Recientes gets the outline and the pill reads
  `Mover a Recientes` / `Move to Recent`.
- After the drop the patient appears in Recientes in its normal position
  (Recientes keeps its own ordering; no manual order there).
- Dragging a patient who is already ungrouped onto Recientes does nothing.

## 4. One sort/filter button only, on the topmost section header

Screenshot: preview 7867, Spanish. The ⇅ button shows on `Court-mandated`
(correct) and again on `Recientes` (wrong, a duplicate).

- **Rule:** the ⇅ sort/filter button appears exactly once in the column, at
  the right of the topmost group header. `Fijados` (Pinned) never counts.
- If there are no groups, it sits at the right of `Recientes` instead.
- Remove the duplicate from `Recientes` whenever at least one group exists.
- It moves with the order: rename, reorder or delete groups, and it follows
  whichever group is now on top.
- **Scope (owner):** the one button's sort applies to all groups at once.
  Assumed: Recientes too, since it is the only button when no groups exist.

### 4a. How Claude does it (research, 2026-09-27) and the plan to copy it

Sources: Claude Code desktop docs and GitHub issues #94262, #72126, #70104,
#66196 on anthropics/claude-code. There is no public spec; this is pieced
together from the docs and those issues.

- **Claude:** one control sits at the right of the top list header. Its
  flyout has *Group by* (Date / Folder / State / Custom groups / None),
  *Sort by* (last activity and similar), and filters (status, environment,
  recency window). One setting covers the whole list, and it is remembered.
- **Claude:** groups themselves are ordered automatically; there is no
  manual group reorder (#72126 and #70104 are open requests for it). Chats
  are moved *into* groups by drag or menu. The one manual order Claude keeps
  is the pinned list (`pinnedOrder`).
- **Apunta today:** there are already two different controls. The one on the
  top group is `View options` (Status / Last activity / Group by / Sort by),
  which is Claude's. The one on Recientes is a separate `Sort patients`
  (Recent activity / Name).
- **Plan:** keep only `View options`, placed per #4. Fold the Recientes
  sort into its *Sort by* (Recent activity / Name / Date created, plus
  `Manual` from #2). That one *Sort by* orders the patients inside every
  group and in Recientes. Delete the `Sort patients` control and its strings,
  in both English and Spanish.
- **Beyond Claude (owner's #2):** Claude has no manual order *inside* a group.
  Apunta adds it via `Manual`, the same way Claude handles its pinned order.

## 5. Dropping a name into another group should not look like a reload

- **Now:** after letting go of a name over another group, the list redraws
  in a way that looks like a reload, instead of the name just sitting where
  it was dropped.
- **Want:** on release, the name appears in the new group and nothing else in
  the list moves or redraws.

## 6. Archiving a patient redraws every name

- **Now:** archiving any patient reloads the whole list, and every name is
  redrawn. Same family as the drag-reload fix in 14076b8.
- **Want:** only the archived name leaves the list; every other row stays put.
  Check the other row actions (restore, rename, delete, pin, move to group from
  the menu) for the same full reload and fix them the same way.

## 7. Drag a name into Pinned to pin it

- **Drop:** dragging a name over `Fijados` / `Pinned` behaves exactly like
  dragging it over a group. The section gets the same outline, the pill reads
  `Mover a Fijados` / `Move to Pinned`, and dropping pins the patient.
- **Pinned is a supergroup (owner):** a pinned patient appears **only** in
  Pinned, never also in their group or in Recientes. Pinned behaves like
  every other group, except that the ⇅ filters never apply to it.
- **Membership is kept:** pinning does not drop the patient's group. Unpinning
  puts them back under that group, or in Recientes if they have none.
  Change from today: a pinned patient in a group currently shows in both
  Pinned and the group; they will show in Pinned only.
- **Dragging out of Pinned:** dropping onto a group unpins the patient and
  files them there. Dropping onto Recientes unpins them and takes them out of
  their group (owner: confirmed).
- **Reorder:** dragging inside Pinned reorders the pins, as today.

## 8. The view menu's tick in the accent teal

Screenshot: preview 7868, ⇅ menu → Status panel, the tick beside `Active`.

- The tick marking the chosen option in the ⇅ view menu's panels is drawn in
  the accent teal (#2a9d8f), not the grey text colour it has now.

## 9. Settings → Appearance clean-up

- **Accent colour is fixed:** teal (#2a9d8f) stays the one accent. The accent
  colour picker (`Colour` row) is removed from Settings, so it can no longer be
  changed.
- **Language row removed:** `Language / Idioma` goes from Appearance. Language
  now lives only in More → Language.
- **American English everywhere (owner):** the `Colour` rename is moot once
  the picker is gone. Instead, audit every English string the user can see and
  make it American English: color, behavior, organize, center, canceled and so
  on. Code comments and identifiers are out of scope. Keys stay as they are
  unless a visible string changes.

## 10. Font setting (new), as a dropdown

- A new Appearance row, `Font`, with a dropdown, beside `Font size`. It is
  named after Claude's "Chat font" row but applies app-wide.
- **Options (recommended):**
  - `Inter (Default)`: what the app uses today, bundled.
  - `System`: the operating system's own UI font.
  - `Serif`: the system serif (Georgia / New York), for reading long notes.
    Nothing new to bundle.
  - `Atkinson Hyperlegible`: a font designed for legibility (Braille Institute,
    SIL OFL). It would be a new bundled dependency (@fontsource), so it needs
    the dependency and licence steps. Nothing is fetched at runtime.
- **Scope (owner):** the chosen font applies to the whole app, chat and notes
  included. The Apunta wordmark / logo is the one exception: it keeps its own
  font.

## 11. The ⇅ view menu, rebuilt after Claude's

Screenshots: Claude's view menu: (a) Sort by open, (b) Status = All,
(c) Last activity open, (d) Group by Date + Sort by Date created, with Reset shown.

- **Menu layout, as Claude's:** `Status`, `Last activity` | divider |
  `Group by`, `Sort by` | divider | `Reset to defaults`. Each row shows its
  current value at the right, with a chevron.
- **Value in the accent only when a filter is not the default:** only the
  two filter rows, Status and Last activity, turn teal (accent) once changed.
  Example (b): Status `All` in the accent. Group by and Sort by values always
  stay grey, even when changed; in Claude's screenshot (d), `Date` and
  `Date created` are grey. Defaults:
  - Status: `Active`
  - Last activity: `All`
  - Group by: `My groups`
  - Sort by: `Last activity`
- **Status options:** Active, Archived, All (unchanged).
- **Group by:** `My groups` (default) and `None`. `Nothing` is renamed `None`
  (Spanish `Ninguno`).
- **Sort by options, in this order:** `Name`, `Date created`, `Last activity`.
  `Recent activity` is renamed `Last activity` and is the default.
- **Drop Manual:** the `Manual` sort goes away, and so does drag-to-reorder
  inside a group. Rows inside every group follow the chosen sort, always.
  Dragging a name onto another group, Recientes or Pinned still moves it
  (#3, #7).
- **Pinned is the only hand-ordered list:** dragging inside Pinned still
  reorders the pins, and the sort does not apply to it (#7).
- **Reset to defaults:** a new last row that puts all four back to the
  defaults above (Spanish `Restablecer valores predeterminados`). It appears
  **only** when at least one of the four is off its default (owner), as in
  (d). With everything at the defaults the row and its divider are hidden.
- **Clean-up this implies:** the Alt+arrow group reorder, the dragged-order
  server routes (`PUT`/`DELETE /api/patient-group-order`) and the `Manual`
  strings from 14076b8 are removed.
- **Empty groups (owner):** they always show, with "No patients in this group
  yet", as today. There is no `Show empty groups` toggle.
- **Last activity labels, as Claude's (owner):** `1d`, `3d`, `7d`, `30d`,
  `All`, replacing Past day / Past 3 days / Past week / Past month / Any time.
  Spanish: `1d`, `3d`, `7d`, `30d`, `Todo`.

## 12. Drag gaps and no respawning rows (owner, 2026-09-28; built)

- The row she picks up stays as an empty slot, as Claude's does, instead of a
  faded name.
- Over Pinned, an empty gap opens where the name would land, for a pin being
  moved and a name being pinned alike. The other pins slide apart to open it,
  and the drop lands in that gap. The gap follows the pointer's height, not
  the hovered row, so it does not chase itself.
- Rows never "respawn": the entrance cascade plays only while the list first
  arrives, because a CSS animation replays whenever its element is moved.

## 13. Columns 2 and 3 for an open patient, calmer and plainer (owner, 2026-09-28; built)

Screenshot: the owner boxed column 2's actions (New note, Brainstorm, Treatment
plan, Prepare for session, "No notes yet…", Create first note) and column 3's
empty state (the "No notes yet…" line again and a big Create first note).

- **One of each action, and quiet ones.** No duplicate "Create first note"
  buttons and no repeated "No notes yet". Actions are plain rows with small
  icons, like the sidebar's and Claude's "New chat", not outlined teal boxes.
- **Patient with no notes (owner): the only thing to do is add a note, and
  columns 2 and 3 merge into one.** There is no notes column at all. The whole
  area right of the sidebar is a welcome for this patient in the home
  screen's style: the patient's name in the serif heading, one line such as
  "Start with the first note for Hugo", and one primary `Write the first
  note` action. Brainstorm, Treatment plan and Prepare for session are not
  shown until there is a note.
- **Patient with notes:**
  - Column 2: `+ New note` row, then the three tools as quiet rows with icons,
    then a `Notes` heading with the list.
  - Column 3, with no note open: the welcome with four cards, each an icon, a
    name and one plain line:
    - **Write a note:** dictate or type today's session.
    - **Brainstorm:** think through the case out loud with the assistant.
    - **Treatment plan:** set goals and track progress.
    - **Prepare for session:** a short summary before you see them.
  - Column 3, with a note open: the note, as today.
- **Decided when building (owner said "go ahead"):** the card wording as
  written, and with notes but none open, column 3 shows the four cards rather
  than opening the latest note. On a narrow screen the merged no-notes view
  keeps a "Patients" back link, which the notes column used to carry.

## 2026-10-05 — navigation, notes column, capture modal (built and verified)

Owner explicitly said "implement these for now" after collecting these requests:

- Enter View all and select a patient there without whole-view refresh, sidebar
  remount, repeated patient-list load, or route transition replay.
- Remove patient-name heading from notes column. New note is the first row,
  notes follow in their own scroll area, and Brainstorm/Treatment plan/Prepare
  for session stay visible in a separate bottom cell. Click blank column space
  to deselect a note and return to patient welcome without leaving the patient;
  flush pending note edits first and keep unresolved conflicts visible.
- New note opens as a dialog like Add patient over the existing blurred patient
  workspace, preserving the current capture fields/options. Close/Escape/back
  retains existing unfinished-note and recording confirmation protection.

Work order, interfaces, scopes and verification:
`state/UI-BATCH-2026-10-05.md`. Independent final review CLEAR after bounded
repair; preview7821 now serves the updated UI with19fabricatedpatients/115notes,
minimum1noteeach, simulatedAI. All workers archived.

## Queued next — browser favicon

Owner request after this UI batch was dispatched: replace the old A shown in
Chrome/browser tabs with the current Apunta A logo. TODO only; not part of the
three changes currently implementing. Reuse existing approved brand asset;
no image generation, new logo design or asset acquisition needed.

# UI backlog (owner requests, not yet implemented)

**Status 2026-09-27: #1–#4 built, uncommitted, preview on 127.0.0.1:7868.**

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

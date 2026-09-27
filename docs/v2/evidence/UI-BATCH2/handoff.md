# UI batch handoff (owner-direct, 2026-09-27)

Committed on the owner's authorization to commit and push the finished UI work so
she can go in and keep commenting on it. The reviewer for this batch was
independent and read-only; see `docs/v2/state/reviews/UI-BATCH2-review.md` and the
repair pass recorded below.

## What is in it

**Patient groups.** Named lists, one per patient (`patients.group_id`), created
from the "New group…" row, shown as sidebar headings, reorderable by dragging the
heading and durable in the database. Migrations `009` (the group and the nullable
column), `010` (a patient's place in their group), `011` (a group's place among the
others). Leaving a group returns a patient to Recents untouched.

**Sidebar view control.** Status, last activity, group-by and sort, riding the
first section the filters reach — the topmost group, or Recents when she has no
groups. Pinned sits above it and is not filtered.

**Drag and drop.** A patient row lifts into a raised cell that follows the
pointer; dropping on a group heading files them there. A dragged group heading
reorders the groups. A move is never a merge, and Recents is not a drop target.

**Also.** The Simple workbench home screen; Import moved to a first-level row in
"More" (Más), with the two import screens cross-linking so neither is a dead end;
"More" as the visible name for what was Mission control; a language chooser.

## Repair pass against the independent review

| Finding | What was wrong | Fix |
| --- | --- | --- |
| F1 | `Status: Archived` showed nothing until a reload — the flag that widens the patient fetch was read once at mount | reactive state, reported from the column; `Workspace.sidebarStatus.test.tsx` drives the real fetch |
| F2 | `Sort by → Date created` was never persisted; the view key omitted `sort` | `sort` written to the key, legacy key still mirrored for downgrades |
| F3 | The view control was unreachable by keyboard; the panel is portalled after the app root | focus into the panel, roving arrows, `→`/`←` between levels, level-aware `Escape`, presentational headings, viewport clamp |
| F4 | `←` was documented on the row menu and did not exist | implemented, returning focus to the row inside the `role="none"` anchor |
| F5 | A failed group fetch rendered "No groups yet" | three states, three sentences, bilingual, with a working retry |
| F6 | The new foreground rule had no test, and one that could not have caught a reversion | discriminating test on the default teal, plus the tokens/function agreement |

Two further defects were found while fixing those, both real and both mine:

- `ViewMenuSlot` was defined inside `PatientsColumn`, making it a new component
  type on every render; React remounted the open menu, so a click could set state
  on an instance already being replaced and the control looked dead.
- `Recents` sorted patients with no notes **last**, so a patient she had just
  created fell past the daily list's row cap and was not shown at all.

## Owner decisions honoured

- Primary-button labels are **white**. Her words, from the session: *"make the
  'Add patient' here white"*, then *"this add patient is kind of grey but i want it
  to be really white white"*. The rule is "white unless it falls under 3:1", which
  is the picker's own warning threshold, unchanged.
- Group order, filters below Pinned, Pinned unfiltered, group-by custom/none, a
  group move is never a merge, and a patient with no group stays exactly where she
  was.

## Verification

`npm run lint`, `npm run typecheck`, `npm run build` exit 0. `npm test` 2075
passed in each of four timezones (UTC, America/Denver, America/Mexico_City,
Australia/Sydney). e2e: the chromium project 50 passed / 0 failed; the whole
serial run 86 passed, 4 skipped, **16 failed, all in the es-MX project** — the
same sixteen tests, unchanged, before and after this pass. They are the pre-existing
es-MX literal-text coverage gap plus the S2.6 attestation constant, which is
coordinator-owned and untouched here. **The bilingual gate is not green and is not
claimed to be.**

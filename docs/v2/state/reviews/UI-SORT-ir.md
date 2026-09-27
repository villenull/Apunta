# Instruction/scope review: the Claude sidebar filter menu (Status / Last activity / Group by / Sort by) plus unread tracking and custom groups

**Role: INSTRUCTION AND SCOPE REVIEW ONLY.** No implementation, no code, no
tests, no server, no database, no browser, no network, no git mutation. The
only file this session wrote is this one. Nothing was staged, committed,
pulled, merged, rebased or reset.

**Audience.** The owner's dedicated direct UI-owner agent
(`f0bd1c61-253b-46ce-b59b-080334f6cb07`, "Apunta UI owner — direct owner
instructions"), which owns UI decisions taken under direct owner instruction
and had started no implementation when this review was written. This file is
an **advisory handoff to that agent**: scope bounds, what the data layer can and
cannot honestly support today, and proposals for it to ratify. **Nothing here is
a decision.** Where this document says "recommend", it is a proposal for the UI
owner to accept, amend or reject under the owner's instruction — the owner has
not been asked anything in this session, and no question below is blocking.

**Base.** `feature/v2` at `e9e8c8b` ("Record idle-agent audit and v2
continuation priorities"). `git log -1`, `git branch --show-current`,
`git status --porcelain` were read only. The tree is dirty with coordinator
state files and with another writer's untracked
`docs/v2/state/dispatch/S2.6-ir.md`; all of it was read and left untouched, per
CLAUDE.md "Working alongside background agents".

---

## 1. The screenshots, read as an inventory

Four PNGs, all read, all authorised:

| File (basename) | Shows |
| --- | --- |
| `6c030d75…acc.png` | Parent menu, `Status` row highlighted; flyout `Active` (checked, tick) / `Archived` / `All` |
| `fc267901…c4.png` | Parent menu, `Last activity`; flyout `1d` / `3d` / `7d` / `30d` / `All` (checked) |
| `ad3907b3…ed3.png` | Parent menu, `Group by`; flyout `Date` (checked) / `Unread` / `State` / separator / `Custom groups` / separator / `None` |
| `a2333f8e…3d2.png` | Parent menu, `Sort by`; flyout `Name` / `Date created` / `Last activity` (checked) |

What the four together specify, and what they do not:

- **Four parent rows, each with a right-aligned current-value label and a `›`
  chevron.** The parent itself is not a choice; it opens a level.
- **A second panel to the right, vertically aligned to the parent row**, same
  surface treatment: rounded corners, a hairline border, a soft shadow, a dark
  fill in the dark theme.
- **One checked leaf per level, ticked on the right** — a radio, not a
  multi-select.
- **Separators inside the `Group by` flyout**, dividing `Custom groups` from the
  four real groupings and `None` from the rest.
- **The trigger is a sliders glyph at the right of the list's header row**,
  above the first section — in the same row as the section's own label
  ("Older", Claude's Recents analogue).
- **Not specified by the screenshots:** hover-vs-click opening, keyboard
  behaviour, what happens at narrow widths, what the menu does when a grouping
  produces no rows, whether the parent value label is announced, animation, and
  what each option *means* in a therapy practice. Sections 6–8 propose all of
  these for ratification.

Apunta already has the trigger, the icon and the place: `SortControl` at
`web/src/components/PatientsColumn.tsx:586-639`, the `SortIcon` button at
`:603-615` with `data-testid="sidebar-sort"`, rendered in the `Recents` section
header at `:538-544`. D15 (`docs/v2/DECISIONS.md:28`) makes the agent-landed
palette, icons, the 288px sidebar, Pin/Recents and the row menus the v2
baseline, and the owner's instruction in this session keeps the approved teal,
the `Recents` label and the existing design. **So the trigger does not move and
the icon does not change; only its menu is replaced.**

---

## 2. Data reality: what exists, what does not

This is the load-bearing section. Two of the four `Group by` values, and the
`Status: Archived` value, have **no** backing data today. One of them has a
backing concept in the wrong place (unread, as an N+1 client-side
reconstruction). Presenting any of them as a working control before the data
layer exists would be a cosmetic stub, which this task forbids.

### 2.1 Exists today

| Field | Where | Notes |
| --- | --- | --- |
| `archived_at` | `shared/src/patient.ts:11`; column `server/migrations/001_init.sql:14` | The only status a patient has. `Active` = `IS NULL`, `Archived` = `IS NOT NULL`, `All` = no predicate |
| `created_at` | `shared/src/patient.ts:10`; `001_init.sql:13` | `Date created` sort |
| `name` | `shared/src/patient.ts:8`; index `001_init.sql:17` | `Name` sort |
| `note_count` | `shared/src/patient.ts:21-23`, computed by the `LEFT JOIN` at `server/src/db/patients.ts:42-48` | List-only |
| last-note edit instant | **reconstructed in the browser**: `web/src/hooks/usePatientRecency.ts` — one `GET /api/patients/:id/notes` per patient, six at a time (`:24`), cached for the life of the tab (`:22`) | Its own header comment (`:10-15`) says the real card should return one `last_note_at` column in the list response it already sends |
| `Group by: Date` | derivable from the two above | No new field |
| `Sort by: Name` | today's second option | Comparator already correct at `PatientsColumn.tsx:379-381` (`localeCompare`, `sensitivity: 'base'`) — keep it verbatim |
| `Sort by: Last activity` | **today's default** | `web/src/lib/patientOrder.ts:29-34` sorts by `recency ?? created_at`, newest first |

### 2.2 Does not exist — confirmed absent, not merely unused

Verified with targeted `rg` over `shared/src`, `server/src`, `web/src`,
`server/migrations/`:

- **Unread / read state.** No `unread`, `is_read`, `last_read`, `read_at` or
  equivalent column, field, type or key. The only hits for `unread` in the tree
  are two unrelated comments (`web/src/lib/setup.test.ts:131`,
  `shared/src/health.ts:7`).
- **Patient "state".** No `state` field on a patient. Every `state` in the tree
  is something else: `shared/src/health.ts:15` (file-vault state),
  `server/src/platform/filevault.ts:71`, whisper's stderr text.
- **Custom groups.** No `patient_groups`, `group_id`, `customGroups` table,
  column, type or route. Every `tags` hit is `wav.ts`/settings/AI-profile
  noise, not patient grouping.
- `server/migrations/001_init.sql:9-17` is the whole `patients` table: `id`,
  `name`, `identifier`, `created_at`, `archived_at`, plus `name_guessed` added
  later by `004_import_batches.sql:35`. Nothing else.

### 2.3 The consequence for each menu option

| Menu option | Backing today? | Verdict |
| --- | --- | --- |
| `Status: Active / Archived / All` | Partly. `archived_at` exists, but the sidebar **never asks for archived patients**: `web/src/routes/Workspace.tsx:88` sets `includeArchived` true only on the `/patients` route, and `:107-110` filters `archived_at === null` out of the sidebar's own list | Real, after a bounded fetch change (§4, Card A) |
| `Last activity: 1d / 3d / 7d / 30d / All` | Only via the N+1 cache, which arrives **after** first paint and is never refreshed within the tab | Real only after `last_note_at` moves server-side. Before that, filtering on it makes the list flicker as the cache fills — a visible defect, not a cosmetic one |
| `Group by: Date` | Yes | Ready |
| `Group by: Unread` | **No** | Needs Card A |
| `Group by: State` (= Active/Archived) | Partly — same fetch issue as `Status` | Needs Card A's fetch change; the grouping itself is a predicate that exists |
| `Group by: Custom groups` | **No** | Needs Card A, **plus** somewhere to create, rename, delete and assign — or the option is inert |
| `Group by: None` | Yes (today's flat list) | Ready |
| `Sort by: Name / Date created / Last activity` | Yes, except `Date created` has never been offered | Ready once `last_note_at` is server-side |

**The proposal that follows from this table:** the menu ships only with the
options that are true, and an option whose data does not exist yet is
**absent, never disabled and never inert**. Grouping by `Date`, `State` or
`None`, and sorting three ways, can ship without any server work; `Unread` and
`Custom groups` cannot ship at all until the foundation below exists. That
ordering is the whole scope argument.

---

## 3. Proposal: three bounded cards, in this order

Proposed for the UI owner to ratify. The split is forced by two facts, not by
taste: (a) `Unread` and `Custom groups` have no data, and (b) the four menu
rows touch the same files, so a single card would hold unmergeable server and
web work in one review cycle and would put schema behind a menu.

### Card A — Read/group **data foundation** (server + shared; no visible UI)

Delivers, with no change a user can see:

1. `patients.last_opened_at TEXT NULL` — when the patient was last opened, on
   the **server** clock.
2. `GET /api/patients` carries `last_note_at: string | null` and
   `unread_count: number` per row.
3. `POST /api/patients/:id/seen` — idempotent, sets `last_opened_at` to the
   server's `now`.
4. `patient_groups` and `patient_group_members` tables, and group CRUD routes.
5. `usePatientRecency` deleted; `orderPatients` switched to the server's
   `last_note_at`.

Proposed May-edit list (paths only; every one is either a file this review
cited or a new sibling of one):

- `server/migrations/009_sidebar_read_and_groups.sql` (new; `008_locale.sql`
  is the highest, `server/src/db/migrate.ts:29-48` orders by number)
- `server/src/db/patients.ts` + `patients.test.ts` — the list SQL
  (`:39-53`), `markPatientOpened`, and `createPatient` (`:67-75`)
- `server/src/db/groups.ts` (new) + test
- `server/src/routes/patients.ts` + test — one route beside `:31-33`/`:48-57`
- `server/src/routes/groups.ts` (new) + test
- `server/src/app.ts` — one registration line beside `:129`
- `shared/src/patient.ts`, `shared/src/groups.ts` (new), `shared/src/index.ts`
- `web/src/api/patients.ts`, `web/src/api/groups.ts` (new),
  `web/src/api/index.ts`
- `web/src/hooks/usePatientRecency.ts` (**delete**)
- `web/src/lib/patientOrder.ts`, `web/src/routes/Workspace.tsx`,
  `web/src/components/PatientsColumn.tsx` (the `recency` prop at `:40` and
  `:324-327`), `web/src/components/PatientsColumn.test.tsx`

Why these four web files and no others: `usePatientRecency`/`RecencyMap` has
exactly three consumers — `Workspace.tsx`, `patientOrder.ts`,
`PatientsColumn.tsx` (verified by `rg`), plus the test that passes
`recency={new Map()}`. `HomeLauncher` takes the already-ordered list and never
sees the map.

### Card B — The menu, with only real options

`Status` (3), `Last activity` (5), `Group by` (`Date` / `State` / `None` — the
three that are true at this point), `Sort by` (3); nested flyouts, checked
values, separators, portaled so the sidebar's scroll box cannot clip them,
full keyboard support, teal accent and the approved `Recents` label untouched.

Proposed May-edit list:

- `web/src/components/PatientsColumn.tsx` (replace `SortControl` `:586-639`;
  the grouping/section rendering at `:515-554`)
- `web/src/components/SidebarFilterMenu.tsx` (new) — the menu and its flyout
- `web/src/lib/sidebarView.ts` (new) — read/write of the four preferences,
  beside `patientPins.ts:54-73`
- `web/src/styles/app.css` — `.sidebar-sort-menu` (`:3859-3864`) and
  `.patient-menu` (`:2567-2590`) rules for the second level only
- `shared/src/i18n/en.ts`, `shared/src/i18n/es-MX.ts` (see obstacle O-1)
- `web/src/components/PatientsColumn.test.tsx`, and a new
  `web/src/components/SidebarFilterMenu.test.tsx`
- `e2e/tests/workspace.spec.ts` — one spec for open/flyout/choose/persist

### Card C — Groups and unread surfaces

`Group by: Unread` and `Group by: Custom groups`, the group sections, the
membership control in the patient row menu, and the group manager. Depends on
Card A being APPROVED.

Proposed May-edit list:

- `web/src/components/PatientsColumn.tsx` (unread grouping and the group
  sections)
- `web/src/components/PatientMenu.tsx` (`:147-217` — the `⋯` menu gains
  "Add to group", using the existing `role="separator"` precedent at `:160`,
  `:200`)
- `web/src/components/PatientGroupManager.tsx` (new)
- `shared/src/i18n/en.ts`, `shared/src/i18n/es-MX.ts`, `web/src/styles/app.css`
- the matching tests and `e2e/tests/workspace.spec.ts`

**If the UI owner would rather ship the menu before groups exist**, that is
legitimate — but then Card B omits `Custom groups` and `Unread` **entirely**
rather than showing them disabled. A greyed row in a filter menu reads as
broken, and this task's own rule forbids a control that does nothing.

---

## 4. Exact data-field mapping

Every menu option, the field it reads, and what a null means. Paths and lines
are at base `e9e8c8b`.

### 4.1 Card A's new columns and list fields

| Name | Type | Migration | Semantics |
| --- | --- | --- | --- |
| `patients.last_opened_at` | `TEXT NULL` | `009_…sql` | UTC ISO-8601 on the **server** clock. Backfilled for existing rows to the migration's own execution time (§5.2). New patients get it stamped at creation beside `created_at` (`server/src/db/patients.ts:67-75`) |
| `PatientListItem.last_note_at` | `string \| null` | derived, `MAX(notes.updated_at)` per patient in the existing `LEFT JOIN` at `server/src/db/patients.ts:42-48` | `null` = the patient has no notes. Replaces the browser's `RecencyMap` |
| `PatientListItem.unread_count` | `number` (int, ≥0) | derived, `COUNT(notes WHERE notes.updated_at > patients.last_opened_at)` | `0` = seen. A count, not a boolean, so a later badge needs no migration; the UI shows `0`/`>0` |
| `PatientListItem.group_ids` | `string[]` | derived from `patient_group_members` | `[]` = in no group. Group **names** come from one `GET /api/groups`, not per patient |
| `patient_groups.id` / `.name` / `.created_at` | `TEXT` / `TEXT` / `TEXT` | `009_…sql` | `id` UUIDv7 per CLAUDE.md; `name` trimmed, 1–60, unique `COLLATE NOCASE`; `created_at` server clock |
| `patient_group_members.group_id` / `.patient_id` / `.created_at` | `TEXT` / `TEXT` / `TEXT` | `009_…sql` | `PRIMARY KEY (group_id, patient_id)`; both FKs `ON DELETE CASCADE` |

**`ON DELETE CASCADE` on both foreign keys is the whole "delete a group never
deletes a patient" guarantee**, enforced by the schema rather than by a code
path that could be forgotten. Deleting a patient already cascades to its notes
(`001_init.sql:32`); the join table must not become a path that does not.

New tables ride through backup and restore with no change: the backup is
whole-database (`server/src/backup/dump.ts:25-34` enumerates every user table;
`backup/index.ts:196-197,244` counts them). The **human-readable** export
(`server/src/backup/readable.ts:6`) enumerates patients and notes explicitly, so
group names would not appear in it — see O-6.

### 4.2 Menu option → field

| Menu row | Option | Reads | Null / absent behaviour | Default |
| --- | --- | --- | --- | --- |
| Status | `Active` | `archived_at IS NULL` (`001_init.sql:14`, predicate precedent at `server/src/db/patients.ts:46`) | — | **default** |
| Status | `Archived` | `archived_at IS NOT NULL` | — | — |
| Status | `All` | no predicate | — | — |
| Last activity | `1d` `3d` `7d` `30d` | `last_note_at`, falling back to `created_at` when null | a patient with no notes is placed by when they were added, exactly as today's order does (`patientOrder.ts:29-34`) | — |
| Last activity | `All` | no predicate | — | **default** |
| Group by | `Date` | the same instant, bucketed | no instant at all → the oldest bucket | — |
| Group by | `Unread` | `unread_count > 0` | `0` → the "everything else" group | — |
| Group by | `State` | `archived_at` | — | — |
| Group by | `Custom groups` | `group_ids` | `[]` → the "everything else" group | — |
| Group by | `None` | — | — | **default** (today's flat list) |
| Sort by | `Name` | `name`, comparator unchanged from `PatientsColumn.tsx:379-381` | — | — |
| Sort by | `Date created` | `created_at` | never null | — |
| Sort by | `Last activity` | `last_note_at ?? created_at` | as `Last activity` above | **default** (today's order) |

### 4.3 The defaults are the load-bearing decision

`Status: Active` + `Last activity: All` + `Group by: None` + `Sort by: Last
activity` **reproduces today's sidebar exactly** — same two sections, same
order, same 13-row cut (`PatientsColumn.tsx:32`), same pinned group. That is
acceptance row A-01 below, and it is why the owner can accept this menu without
losing anything she has.

Note one deliberate divergence from the screenshots: Claude's own default is
`Group by: Date`, and its flyout shows `Date` checked. Apunta's approved design
is a flat `Recents` list, which is `None`. **Proposal: Apunta ships
`Group by: None` as the default, and shows `None` ticked.** Copying `Date` as
the default would silently restructure an approved sidebar on upgrade.

---

## 5. Proposed semantics, for the UI owner to ratify

Everything in this section is a **proposal**. None of it is decided, and none
of it has been put to the owner.

### 5.1 Unread

**Definition.** A patient is unread when they have at least one note edited
after the last time she opened them:
`EXISTS (SELECT 1 FROM notes WHERE notes.patient_id = p.id AND notes.updated_at > p.last_opened_at)`.

**When the mark is set.** By an **effect on the resolved `patientId`** in
`Workspace`, not on the row click. `selectPatient` (`Workspace.tsx:186-190`)
only navigates, and a patient can be arrived at by a deep link
(`/?patient=…` on load, `App.tsx:105`), from the directory (`:472`) or from
`HomeLauncher` (`:487`) without `selectPatient` ever running. A click handler
would miss all three. The effect fires once per resolved patient.

**Drafts count.** A note's `status` is `draft | published`
(`001_init.sql:37`) and both are notes in the record. **Proposal: a draft
counts as unread.** No clinical state is involved — this is note workflow, and
`State` in the menu means Active/Archived and nothing else.

**What is *not* inferred.** Unread is never derived from note content, a
diagnosis, a plan, a treatment or the model. It is one timestamp compared with
one other timestamp. The server computes it in SQL; no AI and no client guess
is involved anywhere.

**Not unread.** A patient with no notes is never unread — there is no note that
can be newer. This also settles the "created patient with no notes" case in
§5.4.

**Reading it back.** `POST /api/patients/:id/seen` is idempotent, writes the
server's `now`, and the client calls the existing `patients.reload()`
(`Workspace.tsx:212`). It is a **dedicated endpoint, not a field on
`PATCH /api/patients/:id`** (`server/src/routes/patients.ts:48-57`): it is a
side effect of looking, not an edit she made, and folding it into the PATCH
would put a write the UI never asked for inside the one request whose body is
her intent. It returns the updated patient, matching the PATCH precedent.
**No new error code is needed** — `bad_request`, `not_found` and `conflict`
already exist in `shared/src/errors.ts:4-32`.

### 5.2 The migration baseline (the owner's explicit concern)

**Proposal: backfill `last_opened_at` for every existing patient to the
migration's own execution time, using SQLite's clock, e.g.
`strftime('%Y-%m-%dT%H:%M:%fZ','now')`.**

Consequences, which are the point:

- Nobody is marked unread by the upgrade. Every note that already exists is
  older than the baseline, so `unread_count` is `0` for every existing patient
  at the moment the migration runs.
- The column is **non-null for every row**, so the predicate in §5.1 needs no
  null branch and there is no second "unknown" state to reason about anywhere
  in the UI.
- **It is a baseline stamp, not a claim that anyone opened anyone.** Every
  patient gets `last_opened_at = created_at` at creation too
  (`server/src/db/patients.ts:67-75`), so from birth a patient has a floor and
  unread is well defined for them.
- A **fixed literal timestamp is wrong here** and must not be used: a literal
  earlier than a given install's data would make that install's existing notes
  newer than the baseline, i.e. it would light up the whole practice. The
  stamp has to be taken when the migration runs. `008_locale.sql:9-10` is the
  `ADD COLUMN` precedent; its `NOT NULL DEFAULT` cannot be used for a
  per-row time, hence the separate `UPDATE`.
- Tests assert shape and behaviour, not the clock: `last_opened_at` is a
  parseable UTC ISO instant; a note inserted with an `updated_at` older than
  the recorded baseline is not unread; one newer is.

### 5.3 Later changes

- A note saved **after** the last open → unread again, immediately, because the
  list is refetched (§7, O-4).
- A note saved **before** the open is not.
- Renaming a patient, archiving, restoring, pinning, grouping: none of these
  touch `last_opened_at`. They must not, or archiving a patient would silently
  mark them read.
- Deleting a note: `note_count` changes today and
  `Workspace.tsx:223-228` already reloads; `unread_count` changes with it, free.

### 5.4 Patients with no notes, and patients created recently

- No notes → `last_note_at` is null → ordered by `created_at`, which is exactly
  what `patientOrder.ts:29-34` does today. No new rule.
- Never unread, per §5.1.
- A patient created after the migration gets `last_opened_at = created_at`, so
  the first note written for them is newer than their floor and they go unread —
  which is the behaviour she expects for someone she is actively working with.

### 5.5 Custom groups

**Membership: many-to-many — a patient may be in several groups, a group holds
many patients.** Proposed default: a new group starts empty; the sidebar shows
one section per group; ordering inside a group is the same `orderPatients`
ordering, so a group is never a differently-sorted list; a patient in no group
falls under the "everything else" group.

Rationale for multi over single: single membership makes "add to group" a
destructive move — she would have to leave `Depression track` to join
`Waitlist` — and therapists' cohorts genuinely overlap. The cost is that a row
can appear in more than one section, which §6.4 resolves.

**Rename.** `PATCH` the group's `name`. The section label changes; no patient
is touched, no note is touched, nothing is re-ordered except by the new name.

**Delete.** `DELETE` the group. Cascades to the join rows only. **Never
deletes a patient, never deletes or edits a note.** The confirmation sentence
must say so in as many words as the existing patient-delete dialog does, and
the group is recoverable only by creating it again — so the dialog names the
group, as `PatientMenu.tsx:97` and `Workspace.tsx:431` already do for a patient.

**Groups with no visible members.** Rendered or hidden is a UI-owner call.
Proposal: render only groups with at least one member that survives the current
`Status` and `Last activity` filters, and reach the full list — including empty
groups, so they can be found and deleted — through one manager surface.

**Where the manager lives.** Proposal: a `Groups` row in the existing
mission-control menu (`PatientsColumn.tsx:204-283`), which is already the
sidebar's "the rest of the app" menu and already has a wired
`onUnavailable` seam. A second entry-point inside the sidebar's own list area
would compete with the patient rows.

**Where membership is set.** The patient row's `⋯` menu (`PatientMenu.tsx:147-217`),
which the owner has already approved visually, gains `Add to group` /
`Remove from group`. No new surface.

### 5.6 `State` = Active/Archived

Per the coordinator's stated meaning. `State` is a **grouping** into two
sections; `Status` is a **filter** over whether archived rows may appear at
all. They compose: `Status: Active` + `Group by: State` shows one section;
`Status: All` + `Group by: State` shows both. Neither infers anything: a
patient's state is `archived_at` and nothing else. `None` in the flyout is a
`menuitemradio` choice, not a group, and it is the default.

### 5.7 Where the preferences live

**Proposal: `localStorage`, in a new key beside the existing ones
(`web/src/lib/patientPins.ts:56`), not in the `settings` table.** These are
per-browser view state, in the same category as the pin order and the sidebar
width, whose own header comment (`patientPins.ts:1-9`) already records that a
real card would persist them server-side. The `settings` table
(`001_init.sql:72-76`, free-form JSON keys via `shared/src/settings.ts:9-22`)
holds practice-wide settings — language, accent, model choices — and a view
preference is not one. **If the coordinator wants pins and view state
server-side, that is a separate card**: it needs either a `patient_pins` table
or a settings key, and it changes the pins' behaviour, which this menu must not
do.

---

## 6. Behavioral acceptance rows

Proposed for ratification. "Proof" names the narrowest thing that could show
the row holds; none of it has been run.

| ID | Behavior | Given / When / Then | Proof |
| --- | --- | --- | --- |
| A-01 | Defaults reproduce today's sidebar | Given a first load with no stored preference, when the sidebar renders, then `Status: Active`, `Last activity: All`, `Group by: None`, `Sort by: Last activity` are the values, the sections are `Pinned` then `Recents`, and the row order is byte-identical to today's | `PatientsColumn.test.tsx` renders with an empty store and compares against the pre-change expectation |
| A-02 | The trigger does not move | Given any state, when the sidebar renders, then the control is the same button with `data-testid="sidebar-sort"` in the first list section's header, right-aligned, with the same `SortIcon` | Existing testid still resolves; no DOM change outside the menu |
| A-03 | Only real options appear | Given Card B ships before Card A, when the menu opens, then `Unread` and `Custom groups` are **absent**, and no row anywhere in the menu is disabled or inert | A test that opens the menu and asserts the full row list |
| A-04 | Opening the menu moves focus into it | Given the trigger is focused, when Enter or Space or click opens it, then focus is on the first parent row and the trigger reports `aria-expanded="true"` | `PatientsColumn.test.tsx` asserts `document.activeElement` |
| A-05 | Arrows move within a level | Given the menu is open, when ArrowDown/ArrowUp is pressed, then focus moves through the four parent rows and wraps | Same |
| A-06 | Right opens the level, Left returns | Given a parent row is focused, when ArrowRight is pressed, then its flyout opens and focus lands on its **checked** item; when ArrowLeft is pressed inside the flyout, then the flyout closes and focus returns to the parent row | Same |
| A-07 | Escape unwinds one level at a time | Given a flyout is open, when Escape is pressed, then only the flyout closes and focus returns to its parent; pressing Escape again closes the menu and returns focus to the trigger | Same |
| A-08 | Checked state is one per level, and is announced | Given the menu is open, when the DOM is read, then every parent is `role="menuitem"` with `aria-haspopup="menu"`, every leaf is `role="menuitemradio"` with the correct `aria-checked`, and exactly one leaf per level is checked | Same, plus a `getAllByRole('menuitemradio', { checked: true })` count of 1 per open level |
| A-09 | The current value is in the accessible name | Given `Status: Archived` is active, when the `Status` row is read, then its accessible name contains both the control and its value | Same |
| A-10 | The tick is decoration | Given a checked leaf, when it is inspected, then the tick icon is `aria-hidden` — `aria-checked` already carries it | Same (pattern precedent `PatientsColumn.tsx:632`, `.patient-menu-check` at `app.css:3866`) |
| A-11 | Separators are separators | Given the `Group by` flyout is open, when it is inspected, then the two rules are `role="separator"` and are not focusable | Same (precedent `PatientMenu.tsx:160,200`) |
| A-12 | Dismissal | Given the menu is open, when a pointerdown lands outside it, or Escape, then it closes and focus returns to the trigger; when a patient row is clicked from the menu, the menu is closed first | Same, extending the existing `useDismiss` contract at `PatientsColumn.tsx:179-197` |
| A-13 | The flyout is never clipped | Given the sidebar is scrolled and narrow, when a flyout opens, then it is rendered outside the scroll box (portaled, like the hover card at `PatientsColumn.tsx:560-580`) and is fully visible | A test asserting the flyout is a child of `document.body`, plus a visual check at the 220px minimum |
| A-14 | Narrow-window fallback | Given the viewport is too narrow for the flyout beside the parent, when it opens, then it flips to the parent's left; and if neither side fits, it replaces the parent list in place with a back row | A test at a fixed narrow viewport (e.g. 480×640) asserting the flyout's bounding box is inside the viewport |
| A-15 | The collapsed rail is unchanged | Given the sidebar is collapsed, when the rail renders, then it carries no filter control — it has never had one (`SidebarRail.tsx:37-75` is expand / new / search / patients) | Rail snapshot unchanged |
| A-16 | Preferences survive a reload | Given a non-default choice, when the tab is reloaded, then all four values are as chosen; and a blocked or full `localStorage` degrades to the defaults without taking the sidebar down | Existing `localStorage` stub pattern at `PatientsColumn.test.tsx:16-24` |
| A-17 | Search still overrides the cut | Given a search term, when the list renders, then every match appears regardless of `VISIBLE_PATIENTS` (today's rule, `PatientsColumn.tsx:383-385`) | Existing behaviour, pinned by a test |
| A-18 | Sorting and grouping compose | Given `Group by: State` and `Sort by: Name`, when the list renders, then each section is sorted by name and the pinned rows keep the order she pinned them | New test |
| A-19 | No patient appears twice | Given a patient is both pinned and in a group, and `Group by: Custom groups` is active, when the list renders, then that patient appears **once** | New test — this is §6.4's rule made checkable |
| A-20 | An empty result says so | Given `Last activity: 1d` matches nobody, when the list renders, then the existing empty-state copy is used (`PatientsColumn.tsx:346-368`) and not a blank box | New test |
| A-21 | `Date` grouping buckets by local midnight | Given a note edited at 23:50 local, when `Group by: Date` renders, then the row is in **today's** bucket | New test with a fixed clock |
| A-22 | Unread is a real read | Given a patient with a note, when she opens them and the list is refetched, then `unread_count` is `0`; when a note is saved afterwards, then it is `1` | Server test for the SQL; web test for the reload |
| A-23 | The upgrade marks nobody unread | Given a database migrated from before the column, when the migration finishes, then every patient has a non-null `last_opened_at` and every one of their existing notes is older than it, so `unread_count` is `0` for all of them | Migration test: assert the backfill ran, then assert zero unread |
| A-24 | A patient with no notes is never unread | Given a patient with `last_opened_at` set and no notes, when the list is built, then `unread_count` is `0` and they order by `created_at` | Server test |
| A-25 | Nothing clinical is inferred | Given any patient, when the list is built, then `unread_count` and the `State` sections depend only on `notes.updated_at`, `patients.last_opened_at` and `patients.archived_at` | Review, plus a server test with no AI path involved |
| A-26 | Deleting a group deletes no patient | Given a group with three members, when it is deleted, then the three patients and all their notes are still there, readable, and the group id is gone from every `group_ids` | Server test: delete, then `getPatient` and a note read per member |
| A-27 | Renaming a group touches nothing else | Given a group, when it is renamed, then the section label changes and no patient, note or membership row differs | Server test |
| A-28 | A group name cannot be empty or duplicated | Given a rename to `"  "` or to an existing name in different case, when it is sent, then the server answers `400 bad_request` and the stored name is unchanged | Server test against the existing error class (`shared/src/errors.ts:4-32`) |
| A-29 | Nothing visible is English-only | Given the app in Spanish, when the menu is opened, then every parent row, every leaf, the current-value labels and the empty state are Spanish | `e2e/support/no-english.ts` plus the language-aware spec |
| A-30 | The accent is untouched | Given either theme, when the menu is open, then the tick, the focus ring and the selected row use the existing tokens (`--accent` `#218677`, `--shadow-focus`, `--shadow-selected` at `web/src/styles/tokens.css:228,321-322`) and no new colour is introduced | Diff review of `app.css`; the token file is not in any card's May-edit |

---

## 7. Keyboard, focus and small-screen behaviour (proposals)

### 7.1 Keyboard model

The pattern to copy is already in the tree: `web/src/routes/Settings.tsx:832-833`
wraps roving focus across a segmented control. The proposal is the standard
menu-button model, which **the current sidebar menu does not implement at all**
— there is no `.focus()` call in `PatientsColumn.tsx` or `PatientMenu.tsx`, and
`useDismiss` (`PatientsColumn.tsx:179-197`) handles only pointerdown and
Escape. Adding it is part of this work, not an extra.

| Key | Level | Behaviour |
| --- | --- | --- |
| Enter / Space | trigger | Open the menu; focus the first parent row |
| ArrowDown / ArrowUp | menu | Move within the level, wrapping |
| ArrowRight | menu | Open the focused parent's flyout, focus its checked item |
| ArrowLeft | flyout | Close the flyout, focus back on the parent row |
| ArrowRight | flyout | No-op (no third level) |
| Escape | flyout | Close the flyout only |
| Escape | menu | Close the menu, focus the trigger |
| Home / End | either | First / last item in the level |
| Tab | either | Closes the menu and moves on — **not** a focus trap |

- **No type-ahead.** It is genuinely useful in a 5-item flyout, but it is also
  the part of menu behaviour most likely to be wrong and least likely to be
  noticed until it is. Out of scope; noted as a later cosmetic card.
- **The value label is part of the button's text**, not a separate element with
  its own ARIA. "Status, Active" is then the accessible name with no extra
  wiring, and it survives translation. The chevron is `aria-hidden`.
- **Only the tick is `aria-hidden`**, because `aria-checked` already says it.

### 7.2 Dismissal

`useDismiss` is shared with `PatientMenu.tsx` and `SidebarRail`'s consumers.
**Proposal: do not change it.** Give the new menu its own small
open/flyout state and its own dismissal, so a change here cannot alter the
`⋯` menu the owner has already approved. It must additionally close when focus
leaves the menu entirely (Tab, or a click on a patient row) — the existing
pointerdown handler covers the click case; the focus case is new.

### 7.3 Clipping — the concrete trap

The sidebar list is a scroll box and the current menu is `position: absolute`
inside `.sidebar-sort` (`app.css:3855-3864`). A flyout positioned as a child of
its parent row would be clipped at the column edge — which is exactly why the
hover card is already portaled to `document.body` with measured coordinates
(`PatientsColumn.tsx:556-580`). **Proposal: the flyout is portaled the same
way**, positioned from the parent row's `getBoundingClientRect()`.

### 7.4 Small screens and narrow sidebars

The sidebar is resizable 220–400px, default 288 (`patientPins.ts:81-83`). The
parent menu is 200px (`app.css:3859-3863`).

- At 288px and above, the parent sits at the column's right edge, so a 200px
  flyout starts around x≈470px and has room on any desktop window.
- **Flip:** when the flyout would cross the viewport's right edge, it opens to
  the parent's left instead.
- **In place:** when neither side fits (roughly under ~450px of viewport), the
  flyout replaces the parent list and a back row returns to the parent. This is
  the only small-screen answer that works, and it needs no new CSS.
- **No media query is needed for any of this** if the position is measured in
  JS, which the portal already requires. For the record: `app.css` has 12
  `@media` blocks and **none** of them touches `.patient-menu` (verified).
- **No hover-to-open.** The screenshots show a hovered row highlighted, which
  is a *hover highlight*, not proof of hover-to-open. Proposal: open on click
  and on keyboard only. Hover-open plus a portal plus two-level dismissal is
  where this class of bug lives, and it is the one part of the screenshots that
  is genuinely ambiguous.
- **No animation** is added; the existing menus have none, and reduced-motion
  handling would then be a new obligation for no gain.
- The **collapsed rail** is unaffected: it has no list section and therefore no
  control (`SidebarRail.tsx:37-75`).

---

## 8. Obstacles, blockers and hazards

Ordered by how likely they are to stop the work.

**O-1 — The Spanish catalogue is not writable. This is the one hard blocker.**
Every new visible word must be a key in **both** catalogues:
`scripts/check-ui-strings.mjs` fails on literal UI text (its own header), and
`AM-054` records that the e2e side now matches visible text against the English
catalogue so a wrong key surfaces in e2e rather than silently. The menu needs
roughly 20 new keys (`Status`, `Last activity`, `Group by`, `Sort by`, eleven
leaves, `Archived`, `Unread`, `Custom groups`, plus the two empty-state strings
it may introduce). `shared/src/i18n/es-MX.ts` is writable today **only** by
S2.6, via AM-051 (`docs/v2/state/AMENDMENTS.md:55` and the "May edit" line in
`docs/v2/cards/S2.6.md`). **An amendment authorising the UI owner's card to
write `en.ts` and `es-MX.ts` is required before implementation starts.** This
is a blocker to *writing code*, not to planning, which is why this review is
still deliverable. Do not touch `shared/src/i18n/t.test.ts`: AM-051's per-form
placeholder-oracle fix is S2.6's work in flight, and AM-052's lesson — "a fixed
decision is still wrong if the coordinator wrote it" — applies in both
directions.

**O-2 — S2.6 is running right now and owns the same files.** It owns
`web/src/routes/Settings.tsx`, `web/src/lib/i18n.tsx`, `shared/src/i18n/en.ts`
(five `settings.language*` keys), `shared/src/i18n/es-MX.ts`, one rule in
`web/src/styles/app.css`, and `e2e/support/*`. Cards B and C want `en.ts`,
`es-MX.ts` and `app.css`. **They must not run concurrently with S2.6.**
Sequencing them after it is the cheapest fix and costs nothing.

**O-3 — Column-list assertions in the server tests will break.** `008_locale.sql:1-6`
says so in its own comment: the compared-column lists in the tests stay the
columns `001` and `007` left behind, precisely so that adding a column is a
visible diff. Adding `patients.last_opened_at` **and** two derived list fields
will fail those comparisons, and the fix is to update them deliberately. A
reviewer should treat a diff in those assertions as expected, not as damage.

**O-4 — The list is not refetched when a note is saved.** This is the owner's
"latest activity stale current cache" concern, and it is real today:
`handleNoteChanged` (`Workspace.tsx:214-219`) updates the in-memory note and
returns — it does **not** call `reloadPatients`, because nothing it changes was
visible in the list. The moment the list carries `last_note_at` and
`unread_count`, saving a note **must** refresh the list, or `Last activity` and
`Group by: Date` stay wrong until a manual reload. The other three handlers
already do it (`Workspace.tsx:236,255,265`). Card A must add the fourth.

**O-5 — `Status: Archived` changes what the sidebar fetches.** `includeArchived`
is true only on the `/patients` route (`Workspace.tsx:88`) and the sidebar's own
list drops archived rows (`:107-110`). Showing archived patients in the sidebar
means the workspace list must fetch them, which touches `directoryRows` and
`activePatients` (`:107-121`) and must **not** change the directory page's
Active/Archived tabs (`PatientDirectory.tsx:102-127`), which are a separate,
already-approved surface. Two status affordances for the same column is a real
duplication; the UI owner should decide whether `Group by: State` and
`Status: Archived/All` are both worth keeping, given they answer nearly the same
question. Recommendation: keep both (they are both in the screenshots and they
compose), and make sure the defaults keep the sidebar as it is.

**O-6 — Group names will not appear in the human-readable backup export.**
Whole-database backup and restore carry the new tables for free
(`backup/dump.ts:25-34`), but the readable export enumerates patients and notes
explicitly (`backup/readable.ts:6`). Proposal: accept this, and record it as a
known limitation — a group is a view, and the notes are what the readable
export is for. Worth an owner word if she expects group names to travel with
the plain-text folder.

**O-7 — `Name` sorting is locale-aware, and Spanish is held.** The comparator
at `PatientsColumn.tsx:379-381` uses `localeCompare(…, undefined, …)`, which
follows the browser's locale rather than the app's. It is correct today in
English. Proposal: leave it exactly as it is in this card and raise it as its
own item if the Spanish list ever looks wrong — changing it here would be scope
the menu does not need, and AM-052's lesson applies.

**O-8 — The unread write is a real write on a read action.** Every patient open
now writes a row. Proposal: accept it (it is one indexed `UPDATE` on a local
SQLite file, and it is what makes the feature mean anything), but say it
plainly in the card, because "opening a patient writes to the database" is not
what a reader of the code will expect. The endpoint must stay idempotent and
must not fire on a patient merely being *mentioned* in a URL while another
patient is open.

**O-9 — Definition of done is not optional.** CLAUDE.md's DoD (lint, typecheck,
unit/integration, build, e2e) plus the e2e language matrix means Cards B and C
carry e2e in both locales, and `npm run licenses` must not go stale. HS-2
applies: `docs/v2/state/cards/P0.3.json` is `APPROVED`, so anything that opens
a database or starts a server goes through `scripts/v2/sandbox.mjs`.

**O-10 — The read path must not be widened by any of this.** Nothing here
touches egress, and nothing may: HS-6. A new route is still a loopback route
like every other.

---

## 9. Consolidated proposals for the UI owner to ratify

Presented as proposals, not decisions. Each is a single yes/no the UI owner can
settle under the owner's instruction.

| # | Proposal | Basis |
| --- | --- | --- |
| P-1 | Split into Cards A (data) → B (menu with only real options) → C (unread + groups + manager), and **do not start C until A is APPROVED** | §2.3: two of five grouping values and one filter have no data |
| P-2 | Default `Group by: None`, not `Date` as the screenshots show | §4.3 — `None` is today's approved flat `Recents` list |
| P-3 | A row is **absent** when its data does not exist, never disabled or inert | The task's own prohibition on cosmetic no-op controls |
| P-4 | Unread = a note edited after the patient's last open; marked by an effect on the resolved `patientId`, not on click; drafts count; nothing clinical is inferred; no notes means never unread | §5.1–5.4 |
| P-5 | Backfill `last_opened_at` to the migration's **execution** time (never a fixed literal), and stamp new patients with `created_at`, so no row is ever null and nobody is unread on upgrade | §5.2 |
| P-6 | `POST /api/patients/:id/seen`, idempotent, server clock, no new error code | §5.1 |
| P-7 | Groups are **many-to-many**; delete cascades to join rows only and can never reach a patient or a note; rename touches nothing else; empty groups are managed outside the list | §5.5 |
| P-8 | Group manager in mission control; membership in the existing `⋯` row menu | §5.5 — no new surface |
| P-9 | `State` means Active/Archived only, and is a grouping over the same `archived_at` the `Status` filter uses | §5.6 |
| P-10 | Menu preferences stay in `localStorage`; moving pins and view state server-side is a **separate** card | §5.7 |
| P-11 | No patient appears twice, ever — pinned and grouped patients render once | §6, A-19 |
| P-12 | Full two-level keyboard model, Escape unwinds one level at a time, focus returns to the trigger, no Tab trap, no type-ahead, no hover-open, no animation | §7 |
| P-13 | The flyout is portaled to `document.body` with measured placement, flips left, and falls back in place on a narrow window | §7.3–7.4 |
| P-14 | `useDismiss` and `PatientMenu` are left untouched | §7.2 — the `⋯` menu is approved and shared |
| P-15 | Card A also adds the missing `reloadPatients()` to the note-saved path | O-4 |
| P-16 | An amendment authorising the card to write `en.ts` + `es-MX.ts` is a **precondition** of implementation, and the card runs after S2.6 | O-1, O-2 |

---

## 10. What this review did not do

- No implementation, no code, no test, no fixture, no migration.
- No server started, no database opened, no sandbox run, no port contacted
  (HS-1, HS-2). `scripts/v2/sandbox.mjs` was invoked **once** with `--help`
  purely to confirm it is not silently runnable without a card; it printed usage
  and exited `2`. Nothing was launched.
- No network call of any kind (HS-6).
- No git mutation: no stage, commit, pull, merge, rebase, reset or force-push
  (HS-4). The dirty tree, including another writer's untracked
  `docs/v2/state/dispatch/S2.6-ir.md`, was read and left alone.
- No new `prototype/` reference (HS-9) and no file outside this one was
  created or edited. The prototypes' synthetic data remains the only sample
  data named anywhere in this document (HS-8) — in fact no patient name appears
  in it at all.
- No question was put to the owner. Where this document says "propose", the
  decision belongs to the UI owner under the owner's instruction.

---

## Appendix A — Commands run, with exit codes

Reads, `rg`, `git log` / `git status` / `git branch`, and two harmless probes.
No build, no test, no lint, no `tsc`, no server, no database.

| Command | Exit | Note |
| --- | --- | --- |
| `node --version` | `0` | `v26.8.2` (default) |
| `/home/villenull/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node --version` | `0` | `v24.19.0` (the owner's alternate) |
| `node scripts/check-ui-strings.mjs --report web/src/components/PatientsColumn.tsx web/src/lib/patientPins.ts` | `0` | `TOTAL 0` — the two files named in this review carry no literal UI text today, so every string a new menu adds is a catalogue obligation |
| `node scripts/v2/sandbox.mjs --help` | `2` | usage error; nothing launched |
| `git log -1` / `git branch --show-current` / `git status --porcelain` | `0` | base `e9e8c8b`, branch `feature/v2`, tree dirty with coordinator files and one other writer's untracked dispatch |
| `rg` sweeps for `unread` / `is_read` / `last_read` / `patient_state` / `customGroups` / `group_id` over `shared/src`, `server/src`, `web/src`, `server/migrations` | `1` (no matches) for the four absent concepts; `0` for the ones that exist | §2.2's absences are grep-confirmed, not inferred from reading |

## Appendix B — Files read, for the UI owner's own re-derivation

Read-only, at base `e9e8c8b`:
`CLAUDE.md`; `docs/v2/HARD-STOPS.md`; `docs/v2/DECISIONS.md:28` (D15);
`docs/v2/state/AMENDMENTS.md:55-58` (AM-051…AM-054);
`docs/v2/cards/S2.6.md`; `docs/v2/CONTRACTS.md:281-293` (C-LANG@1);
`docs/v2/state/cards/P0.3.json`; `docs/v2/state/dispatch/S2.6-ir.md` (read only);
`web/src/components/PatientsColumn.tsx` (whole);
`web/src/components/PatientsColumn.test.tsx:1-60`;
`web/src/components/PatientMenu.tsx` (structure);
`web/src/components/PatientDirectory.tsx:95-130`;
`web/src/components/SidebarRail.tsx:37-75`;
`web/src/lib/patientOrder.ts` (whole); `web/src/lib/patientPins.ts` (whole);
`web/src/hooks/usePatientRecency.ts` (whole);
`web/src/routes/Workspace.tsx:80-130,150-270,390-480`;
`web/src/api/patients.ts`; `web/src/App.tsx:104-123`;
`web/src/styles/app.css:2540-2650,3850-3880`; `web/src/styles/tokens.css:119,146-147,206-325,365-384`;
`shared/src/patient.ts` (whole); `shared/src/settings.ts:1-80`;
`shared/src/errors.ts:1-45`; `shared/src/i18n/en.ts:1505-1560`;
`shared/src/i18n/es-MX.ts:1128-1141`; `shared/src/i18n/t.test.ts:181-300`;
`server/src/db/patients.ts:39-80`; `server/src/db/migrate.ts:7-90`;
`server/src/routes/patients.ts:1-60`; `server/src/app.ts:26,129`;
`server/src/backup/dump.ts:25-47`; `server/src/backup/index.ts:196-244`;
`server/src/backup/readable.ts:6`; `server/src/backup/restore-txt.ts:35-51`;
`server/migrations/001_init.sql:9-76`; `004_import_batches.sql:35`;
`006_halaxy_batch_source.sql:3-5`; `008_locale.sql` (whole);
`scripts/check-ui-strings.mjs:1-45`; `scripts/check-ui-strings.allow.json` (path);
`e2e/support/no-english.ts` (path); `e2e/tests/` (listing).

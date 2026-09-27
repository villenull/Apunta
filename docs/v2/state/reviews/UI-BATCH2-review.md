# Independent review: UI batch 2 (owner-approved direct UI changes, 2026-09-27)

**Role: INDEPENDENT REVIEW ONLY.** No implementation, no code change, no test
change, no commit, no stage. The only file this session wrote is this one.
Source was read and left untouched; the author has confirmed the tree is frozen
and the writer lock released, and this review does not use that as licence to
edit.

**Base, confirmed rather than assumed.** `feature/v2` at `e97d307`
("Record freeze review and final bounded screening repair").
`git merge-base HEAD c1d897f` = `c1d897f` and `c1d897f` ("Integrate the
owner-approved UI batch") is an ancestor, so the coordinator's framing is right:
`git diff --name-only c1d897f..HEAD | grep -v '^docs/'` returns **zero** files.
Every commit from `c1d897f` to `e97d307` is docs-only. The reviewed artifact is
therefore the **uncommitted working-tree delta against `e97d307`**:

| Fingerprint | Value |
| --- | --- |
| Branch / HEAD | `feature/v2` @ `e97d307` |
| Tracked non-docs files changed | 39 (`+4483 / −379`) |
| Untracked non-docs files | 13 (3 migrations, 5 server/shared, 5 web) |
| `git diff HEAD -- . ':!docs' \| sha256sum` | `1363194a65ed063421ff50b9a091f26ef53b1aac77575d0d8a2e2e1adf5df227` |
| sha256 over the 13 untracked files' contents | `dd6ca47116e3ed786a0d8db2aea3208bee8ecec569e471a39f71235bb897037b` |
| Evidence PNGs also dirty | 4 (in `docs/v2/evidence/P2.2/screenshots/`, see F10) |

The brief's "~43 modified" is 39 source/test + those 4 PNGs. The 14th untracked
path, `docs/v2/state/reviews/P3.1-AM058-ir.md`, is an unrelated coordinator
document and was not read.

**Hard stops observed.** No server started, no app database opened, no port
contacted, no browser, no sandbox run, no network, no downloads, no inference
(HS-1, HS-2, HS-3, HS-6). Nothing on **7717** and nothing on the owner's
preview **7807** was touched; the e2e servers in the author's log are not mine
and the four other preview ports in `/tmp` were left alone. The model study's
files and every other agent's in-flight files were not read. No git mutation
(HS-4). `prototype/` not read for content (HS-9).

**Owner decisions taken as given, not re-derived.** Groups are one-per-patient
(so `patients.group_id`, not a join table — this deliberately overrules
`UI-SORT-ir.md` P-7, which proposed many-to-many); named lists created from the
submenu and shown as sidebar headings; no-group leaves a patient untouched.
Those were read from the code's own owner-dated comments and are not re-litigated
here. S2.6 / AM-059 attestation is out of scope and untouched.

---

## 1. What I actually ran

All under the pinned Node, `v24.19.0`
(`/home/villenull/.local/share/apunta-node/node-v24.19.0-linux-x64/bin`), with
`APUNTA_FAKE_AI=1`. Unit tests open only temporary databases created by
`server/src/test/harness.ts` (RUN-CONFIG §3 / AM-025), never the platform data
folder and never the live instance.

| Command | Exit | Result |
| --- | --- | --- |
| `npm test` (`APUNTA_FAKE_AI=1`) | **0** | 152 files, **2054 passed** |
| `TZ=UTC npx vitest run` | **0** | 152 files, 2054 passed |
| `TZ=America/Los_Angeles npx vitest run` | **0** | 152 files, 2054 passed |
| `TZ=Australia/Sydney npx vitest run` | **0** | 152 files, 2054 passed |
| `TZ=America/Mexico_City npx vitest run` | **0** | 152 files, 2054 passed |
| `npm run lint` | **0** | eslint, prettier, `check-no-external-urls`, licences (111 packages), `check-ui-strings` **TOTAL 0** |
| `npm run typecheck` | **0** | all five workspaces |
| `npx vitest run web/src/lib/accent.test.ts shared/src/i18n/t.test.ts server/src/routes/patientGroups.test.ts` | **0** | 39 passed |
| `npx vitest run server/src/db/migrate.test.ts server/src/seed.test.ts` | **0** | 22 passed |
| `npx vitest run web/src/components/PatientsColumn.test.tsx web/src/components/PatientMenu.test.tsx` | **0** | 58 passed |
| `node scripts/check-ui-strings.mjs --report <5 changed components>` | **0** | `TOTAL 0` |

**One author claim is stale, and it matters only as arithmetic:** the author
reported **2052** unit tests; the tree now holds and passes **2054** in every one
of the four zones. The suite is green; the count in the report is two behind the
tree. No test is failing and none was removed to reach either number.

`npm run build` was not re-run by me — the author's log `/tmp/e2e-final.log`
opens with a successful `npm run build` of all four projects (exit implied 0 by
the Playwright webServer completing), and `npm run typecheck` compiles the same
`tsconfig`s, so I have no contrary evidence and did not spend a second build.

---

## 2. The e2e log, classified failure by failure

`/tmp/e2e-final.log` is the authoritative artifact. Its own tail reads:

```
  16 failed
  4 skipped
  86 passed (6.2m)
```

`Running 106 tests using 1 worker`, sandbox `dataDir` under
`/tmp/apunta-v2/2026-09-27T21-12-40-060Z-9959815c/`, server on
`http://127.0.0.1:7887`, `fakeAi: true`. **The author's earlier "12 failed" is
superseded; 16 is the number.** I did not take the prose count.

**Every one of the 16 carries the `[es-MX]` project prefix** — verified by
filtering the failure list for lines without it, which returns nothing. There is
no Chromium failure in the log. I classified them by evidence rather than by
accepting "pre-existing":

| # | Spec:line | Failing assertion | Class |
| --- | --- | --- | --- |
| 1 | `formats.spec.ts:34` | `getByRole('heading', {name:'Add patient'})` | English literal, es-MX |
| 2–4 | `formats.spec.ts:66,124,139` | `getByText('Upload a blank template' / 'Upload a few example notes')` | English literal, es-MX |
| 5–6 | `formats.spec.ts:160,196` | English literals in the format editor | English literal, es-MX |
| 7 | `plan.spec.ts:45` | `expectNoEnglishUi` leak on `chat.change.summary` | catalogue gap, not a UI regression |
| 8 | `workspace.spec.ts:41` | `getByText('Describe it myself')` | English literal, es-MX |
| 9 | `workspace.spec.ts:138` | `getByLabel('Search patients')` | English literal, es-MX |
| 10 | `workspace.spec.ts:185` | `toContainText('Ask a question about this note…')` — got the Spanish | English literal, es-MX |
| 11 | `workspace.spec.ts:302` | `toHaveText('Nothing recorded in Objective — add or leave blank.')` | English literal, es-MX |
| 12 | `workspace.spec.ts:396` | `toContainText("Apunta can't reach the local AI — see Setup")` | English literal, es-MX |
| 13 | `workspace.spec.ts:427` | `getByRole('heading',{name:'Add your note format'})` | English literal, es-MX |
| 14 | `workspace.spec.ts:443` | `toContainText('Recommended')` — got `Recomendado` | English literal, es-MX |
| 15 | `workspace.spec.ts:464` | `getByRole('heading',{name:'Edit note format'})` | English literal, es-MX |
| 16 | `workspace.spec.ts:489` | `toHaveText('Saved')` — got `Guardada` | English literal, es-MX |

The evidence for "not caused by this batch" is threefold and checkable:

1. **7 of the 16 are in specs this batch never touched** — `formats.spec.ts` and
   `plan.spec.ts` are absent from the diff. #7's leak is `chat.change.summary`
   reached through `server/src/routes/chat.ts`, which is also absent from the
   diff.
2. **The one `workspace.spec.ts` test the batch *did* change is not among the 9
   failures.** The diff's entire workspace change is
   `opens on home, and finds a patient from its search`
   (`e2e/tests/workspace.spec.ts:157-180`), and it **passes in both projects** —
   it is the batch's own language-aware rewrite, using `tr('home.ask')` and
   clicking `home-action-draft` first. Nine failing tests, zero of them on a
   changed line.
3. **The failure *shape* is uniform and locale-only**: every one is a hardcoded
   English string asserted against a Spanish screen, and #10/#14/#16 show the
   app rendering the correct Spanish. A regression introduced by this batch would
   not produce sixteen failures of exactly one kind, all confined to one project.

**Classification: a pre-existing es-MX literal-text coverage gap, on sixteen
tests, of which this batch improved the direction of travel** (it converted the
one home-screen test to `tr()` and made `halaxy-import.spec.ts` section-name
data language-aware rather than the literal `'Session'`). The honest limit of
this classification is stated in §6: it is a static classification, not a
counterfactual run.

The author's Chromium claim (50 pass / 0 fail) and the three-pass
`es-MX-language` run are **consistent with this log** — no Chromium failure
appears anywhere in it, and the language-control project is the one project
`workspace.spec.ts:396` etc. do not run in. I did not re-run e2e (no browser,
no server, §6).

---

## 3. Findings

Ordered by severity. Each is a defect in the reviewed delta, with the file and
line, a reproduction, and what I checked to be sure.

### F1 — Choosing `Status: Archived` in the sidebar shows nothing until the tab is reloaded (real, user-visible)

`web/src/routes/Workspace.tsx:108-109`

```ts
const sidebarWantsArchived = useMemo(() => readSidebarView().status !== 'active', []);
const includeArchived = (atDirectory && directoryTab === 'archived') || sidebarWantsArchived;
```

`includeArchived` is the only thing that widens the fetch
(`Workspace.tsx:123-124` → `listPatients(signal, includeArchived)`), and
`patientList` is what the column is handed as `sidebarPatients`
(`Workspace.tsx:490`). The `useMemo` has an empty dependency list, so it is
evaluated **once, at mount**. The comment above it claims the opposite —

> *"Read once, at mount: changing it re-reads the same stored value, and the
> column re-renders its own list when she picks another."*

— and neither half is true: nothing re-reads `VIEW_KEY`, and the column's
re-render cannot widen a prop it does not own. `SidebarViewMenu.pick`
(`SidebarViewMenu.tsx:136-139`) calls `writeSidebarView` and `onChange`, and
`onChange` only reaches `setView` inside `PatientList` (`PatientsColumn.tsx:1031-1033`).
`PatientsColumn.tsx:625` then filters `sidebarPatients ?? ordered` — the same
active-only array.

**Repro.** Fresh load of `/` with at least one archived patient in the database
and the stored status at its default `active`. Open the view control beside the
first section heading → `Status` → `Archived`. The list renders
`patients.filteredOut` ("No patients match these filters.") with a *Clear
filters* button, because there is nothing to filter. Reload the tab: the same
choice is now in force at mount, `includeArchived` is true, and the archived
patients are there. `Status: All` has the same hole.

This is exactly the hazard `UI-SORT-ir.md` §8 O-5 predicted for
`Status: Archived`, and the mitigation it named — "the workspace list must fetch
them" — is the half that is missing.

**No test covers it.** `rg` over `web/src/**/*.test.tsx` finds no
`view-status-*` testid and no `includeArchived` assertion;
`web/src/routes/Workspace.test.tsx` changed by three comment lines only. The
group tests in `App.test.tsx` all run with jsdom's default `active`, so they
cannot see it.

### F2 — `Sort by → Date created` is not persisted; the menu and the list disagree after a reload

`web/src/lib/sidebarView.ts:82, 94, 77` with `web/src/lib/patientPins.ts:66-70`

```ts
// writeSidebarView
writeSidebarSort(view.sort === 'created' ? 'recent' : view.sort);
…
window.localStorage.setItem(VIEW_KEY,
  JSON.stringify({ status: view.status, activity: view.activity, groupBy: view.groupBy }));
// readSidebarView
sort: isOneOf(stored.sort, SORTS) ? stored.sort : sort,   // `sort` = readSidebarSort()
```

`VIEW_KEY` is written **without** `sort`, so `stored.sort` is always `undefined`
and the read always falls back to the legacy key — which only has two states
(`writeSidebarSort` stores `'name'` or removes the key). `'created'` is mapped to
`'recent'` on the way in and therefore has nowhere to live.

**Repro.** Pick `Sort by` → `Date created`. The list re-sorts
(`PatientsColumn.tsx:791-795`, newest-created first). Reload the tab: the list is
back in last-activity order and the menu's `Sort by` row reads "Last activity",
because `viewIsDefault` (`:672-676`) and the "Clear filters" copy both key off a
value that no longer matches what is on screen.

**No test covers it.** `PatientsColumn.test.tsx:96` is the persistence test and
it exercises `name` only (`view-sort-name`, then `cleanup()` + re-render).
`rg` finds no `view-sort-created` anywhere in the tree.

Note what *is* persisted and tested, since the brief asks specifically: **group
order is server-side and durable** — migration `011_patient_group_position.sql`,
`listPatientGroups`'s `ORDER BY position IS NULL, position ASC, created_at ASC`
(`server/src/db/patientGroups.ts:40`), and
`patientGroups.test.ts:216-…` ("lists a group she has never moved after the ones
she has") exists precisely to catch the SQLite nulls-first trap. A patient's
`group_position` is likewise persisted (`010`). F2 is the one persistence hole in
the batch, and it is the *view* preference, not the group data.

### F3 — `SidebarViewMenu` is not reachable by keyboard, and its own comment says it is

`web/src/components/SidebarViewMenu.tsx:295-299`

> *"A click opens it too, so the whole thing is reachable from the keyboard,
> where there is no hover at all."*

It is not. The panel is portalled to `document.body` (`:263-318`), which puts it
**after the app root** in DOM order, so sequential focus navigation from the
trigger continues into the rest of the application rather than into the panel.
`openAt()` (`:102-110`) sets state and renders; **it never calls `.focus()`**.
Nothing focuses a section row. The only keyboard affordance,
`onKeyDown` → `ArrowRight` (`:300-307`), is on a row that has to be focused
first. There is no roving arrow movement among the four rows, no `ArrowLeft` to
leave the second panel, and `Escape` (`:116-121`) closes both levels at once.

The sibling control gets this right: `PatientMenu` focuses into its submenu from
an effect (`PatientMenu.tsx:183-186`) and is not portalled. The two menus now
behave differently, and the portalled one is the weaker.

Also on this component, two smaller items:

- `renderSection` and the section rows emit `<div className="patient-menu-heading">`
  (`:144`) as a **direct child of `role="menu"`** (`:269`, `:324`). A `menu` may
  only contain `menuitem`/`menuitemradio`/`menuitemcheckbox`/`group`/`separator`;
  the heading needs `role="presentation"` or a `role="group"` wrapper.
- `setSectionAt({ left: panel.right + 2, … })` (`:90`) has no viewport clamp,
  though the parent is clamped (`:107`). Its sibling CSS rule has
  `max-height: min(60vh, 420px); overflow-y: auto` (`app.css:4180`); the row
  menu's equivalent, `.patient-submenu` (`app.css:2697`), has **neither** a
  max-height nor a flip, and is placed from the row rect with no clamp
  (`PatientMenu.tsx:173`). With a dozen groups and a row low in a scrolled list,
  the bottom of that panel is unreachable. **Static observation only** — I did
  not open a browser to measure it.

### F4 — `PatientMenu` documents `←` to leave the submenu; no such handler exists

`web/src/components/PatientMenu.tsx:79-80`

> *"Escape closes everything; → opens the panel and puts the keyboard in it, and
> ← brings it back out, as a menu that only opens on a click would not be one."*

`rg ArrowLeft web/src/components/` finds handlers only in
`routes/Settings.tsx:819` and `components/SidebarResizer.tsx:107`. The submenu's
own buttons (`PatientMenu.tsx:301-350`) carry no `onKeyDown` at all, and the
anchor binds `ArrowRight` only (`:457-463`). So `→` works and `←` does not. The
comment describes a behaviour a reviewer would otherwise take for granted.

### F5 — A failed group fetch tells her "No groups yet", and the flag that would have told the truth is never read

`web/src/hooks/usePatientGroups.ts:20, 37-39` exposes `failed`; `rg` shows **no
consumer** in any component or route. `PatientMenu.tsx:295-297` renders
`patients.noGroupsYet` whenever `groups` is defined and empty — which is
simultaneously (a) before the first fetch resolves, (b) a genuinely empty
practice, and (c) **a failed fetch**. The hook's own comment (`:34-36`) says the
failure "is not worth a toast: … the submenu says so by having nothing in it",
which is the opposite of true: it says *No groups yet*, a positive claim about
her data that is false in case (c). The whole point of the flag is lost.

### F6 — `--on-accent` changed rule; the amendment ledger still records the old one, and nothing pins the new one

`web/src/lib/accent.ts:53, 76`

```ts
const MIN_WHITE_ON_ACCENT = 3;
root.style.setProperty('--on-accent', whiteContrast >= MIN_WHITE_ON_ACCENT ? '#ffffff' : '#111111');
```

Previously: whichever of white / near-black scored higher. Now: white unless it
falls under 3:1. For the default teal `#2a9d8f` the two disagree — 3.32:1 in
white against 5.68:1 in near-black — so the shipped label colour flips from
`#111111` to `#ffffff`. `web/src/styles/tokens.css:266` was moved to `#ffffff`
to match, and the reasoning was written into both files.

Two observations, neither a product question:

- **The ledger is now stale.** `docs/v2/state/AMENDMENTS.md` **AM-055** still
  records the opposite: *"accepting automatic `#111111` primary-button labels and
  the disclosed light accent-text contrast tradeoff."* The code comment cites a
  direct owner instruction of 2026-09-27 reversing it, which is the kind of
  decision this batch was taken under — but the amendment row was not updated, so
  the record and the artifact disagree. That is a coordinator ledger amendment,
  not an owner gate.
- **The new rule has no test.** `web/src/lib/accent.test.ts:11` feeds `#ffff00`
  (1.07:1 in white), which lands on `#111111` under *both* rules, so the file
  passes without exercising the change. `rg --on-accent` across the tree finds no
  other assertion, and the four `brand.spec.ts` colour cases assert the **mark**
  and **wordmark**, not the label. So the invariant `tokens.css` now states as
  load-bearing — *"The two paths have to match, because this declaration is what
  a fresh install uses and the function is what she gets the moment she touches
  the colour picker"* — is asserted nowhere. A single case feeding `#2a9d8f` and
  expecting `#ffffff` would close it, and would also have caught the flip.

### F7 — Dead and near-dead surface added by this batch

Verified by `rg` over the whole tree excluding `docs/`:

| Item | Where | Note |
| --- | --- | --- |
| `ReorderPatientGroupRequestSchema` / `…Request` | `shared/src/patient.ts:112-115` | never imported, and **not re-exported** from `shared/src/index.ts` — the only schema in the file that is unreachable from the package's public surface |
| `countPatientGroups`, `countPatientsInGroup` | `server/src/db/patientGroups.ts:92, 98` | never called; the route uses neither |
| `failed` | `web/src/hooks/usePatientGroups.ts:20` | see F5 |
| `patients.creatingGroup` | `shared/src/i18n/en.ts:1574`, `es-MX.ts` | key in both catalogues, no call site; the create-group dialog has no busy state |
| `settings.importClaude`, `settings.importHalaxy` | `shared/src/i18n/en.ts:2357` and sibling | orphaned by the Settings section removal; `settings.import` is still used by the "More" row |
| `row.position ?? null` | `server/src/db/patientGroups.ts:43, 49, 57` | the column is already nullable; the mapping is a no-op |

The `ReorderPatientGroupRequestSchema` case is the one worth naming beyond
tidiness, because it disagrees with what shipped: it declares
`position: z.number().int().nonnegative()`, while the schema actually in force
is `z.number().int().nullable().optional()` (`shared/src/patient.ts:105`) and
`PatientGroupSchema.position` is `z.number().int().nullable()` (`:45`). So the
API **accepts a negative group position** while a patient's `group_position` is
`nonnegative` (`:23`, `:85`). A negative sorts first, which is harmless, but the
three declarations do not agree about what a position is.

### F8 — An orphaned JSDoc, and the function it was written for has none

`web/src/routes/Workspace.tsx:298-306` — the block *"A group and a filing in one
go… If the patient cannot be filed after the group exists, the group is still
there and the error names the move"* documents nothing: it is immediately
followed by a *second* JSDoc (`:307-311`, for `endOfGroup`) and then by the
`endOfGroup` const. `handleCreateGroup` (`:341`) — the function that comment was
written for, and the one that carries the deliberate "keep the group, report the
move" decision — is undocumented. A reviewer reading the diff sees the rationale
attached to the wrong function and may "fix" the wrong thing.

### F9 — `endOfGroup` can hand out a position that is already taken

`web/src/routes/Workspace.tsx:311-315` computes `Math.max(...positions) + 1`
over `patientList`, which is the *fetched* list. When `includeArchived` is false
(the default), a group's highest-positioned member who happens to be archived is
absent, so the computed end can collide with a live member's position. The
column's comparator (`:774-783`) returns `0` on a tie and falls through to
stable order, so the visible effect is that the dropped patient lands in an
arbitrary-but-stable spot rather than at the end. Sparse positions make this
harmless; renumbering would not have been. Low, and self-limiting.

### F10 — Four P2.2 evidence PNGs are dirty test output, and the spec that writes them is unchanged

`docs/v2/evidence/P2.2/screenshots/{dark,light}-{accent-7c3aed,default-accent}.png`
are modified in the working tree, and all four grew substantially:

```
dark-accent-7c3aed.png    24743 -> 43064 bytes
dark-default-accent.png  24781 -> 43804 bytes
light-accent-7c3aed.png  27967 -> 45860 bytes
light-default-accent.png 26226 -> 47734 bytes
```

All four hashes differ from `HEAD`. The writer is `e2e/tests/brand.spec.ts:151`,
`screenshotPath()`, which resolves into `docs/v2/evidence/P2.2/screenshots/` —
**and that line is byte-identical at `HEAD`** (verified with `git show`), so this
is not something the batch introduced. It is the batch's `npm run e2e` run
landing in the evidence directory.

This matters because **AM-056's recorded repair was exactly this**: *"Four
generated historical screenshots were restored to preserve P2.2 evidence."* They
have been overwritten again, and nothing stops the next `npm run e2e`. Unless a
rebaseline is intended and recorded with a reason, the resolution is
`git checkout -- docs/v2/evidence/P2.2/screenshots/` — which I have **not** run,
being read-only. The underlying hazard (a spec writing into a committed evidence
path) is worth a coordinator note of its own.

### F11 — The seed's 15 invented names depart from HS-8's letter

`server/src/seed.ts:158-176` adds `PRACTICE_FIRST_NAMES` / `PRACTICE_LAST_NAMES`
— fifteen invented people, deliberately **not** the prototype's sample names, with
the reasoning written out (`:143-153`) and pinned by a test
(`server/src/seed.test.ts`, "invents its own names, and never the prototype
three").

HS-8 as written says *"English uses the prototype's sample people; Spanish uses
only names in `e2e/fixtures/eval-es/NAMES.md`."* The privacy purpose is served
and there is direct precedent — `NAMES.md` itself argues that reusing the same
handful of names across corpora is the *less* hygienic choice — but the shipped
English dev seed now carries fifteen names that HS-8 does not name, and the
departure is recorded in a test rather than in the amendment ledger. Flagged as a
scope observation for the coordinator. No question is put to the owner.

### F12 — Two smaller things

- `server/migrations/010_patient_group_position.sql` and
  `011_patient_group_position.sql` share a file stem. Harmless —
  `loadMigrations` keys on the numeric prefix and explicitly rejects duplicate
  *versions* (`server/src/db/migrate.ts:40-46`) — but two files with one name in
  one directory is a trap for the next reader, and `migrate()` records `name`
  without ever comparing it, so a post-ship edit to either file's SQL would be
  silently ignored.
- `PRACTICE_SPAN_DAYS = 120`, but `daysAgo = 1 + round((noteIndex * 120) / noteCount) + index`
  reaches **123** for the last index, so the comment's "all inside the span"
  (`server/src/seed.ts:150-153`) is off by three days. No test depends on the
  bound, and `seed.test.ts` only asserts `> 60 days` and `< 14 days`.

---

## 4. Scope observations (no defect, recorded so they are not re-litigated)

1. **"Continue a draft" does not resume a draft.** `HomeLauncher.tsx:73-84`
   routes `draft` to `onSelect(patientId)` and nothing else — it lands on that
   patient's **notes list**. There is no most-recent-draft index anywhere in the
   tree, so no draft-resume feature exists and none is claimed here. What makes
   this acceptable rather than a defect is that it is stated in the code
   (`HomeLauncher.tsx:31-35`), pinned by a test whose title says what it really
   does (`HomeLauncher.test.tsx:253`, "'Continue a draft' opens that patient on
   their notes"), and the owner is named as the decider. The only thing to be
   careful about downstream is that the *label* promises more than the code does.
2. **The shared "New" row appears in all three flows**, including "Continue a
   draft", where choosing it creates a patient rather than continuing anything
   (`HomeLauncher.tsx:86-91`, `:197-215`). Documented as deliberate (`:37-39`).
3. **Groups cannot be deleted or renamed from the UI.** `patientGroups.ts:25-29`
   records this as a known gap and justifies the absent `DELETE`; the rename half
   of the PATCH is unreachable from any surface. A group, once made, is permanent
   in this build.
4. **Group names do not appear in the human-readable plain-text export.**
   `server/src/backup/readable.ts` enumerates notes and plans only and contains
   no `group` reference — the limitation `UI-SORT-ir.md` §8 O-6 predicted. The
   whole-database dump/restore carries `patient_groups` for free.
5. **Empty groups are rendered, on purpose**, with `patients.groupEmpty`
   (`PatientsColumn.tsx:752-759` explains the reversal of the earlier decision),
   and pinned in `App.test.tsx` ("leaves everyone she has not moved exactly where
   they were"). This is the "no-group unchanged" requirement, and it is tested
   from both sides: filed patients leave Recents, unfiled patients do not move.
6. **Leaving a group does not clear `group_position`.** `setPatientGroup` sends
   only `group_id` (`web/src/api/patients.ts:56-62`) and `updatePatient` leaves
   `group_position` alone (`server/src/db/patients.ts:127-128`), so an ungrouped
   patient can carry a stale position — which contradicts `010`'s own comment
   ("`NULL` … is what an ungrouped patient always has") and means re-filing them
   restores the old slot. Harmless in the UI; a comment/code mismatch.
7. **`usePatientGroups.reload` returns a cleanup function that only `useEffect`
   uses** (`usePatientGroups.ts:27-46`). The direct calls from `Workspace` never
   abort, so two rapid reloads resolve in response order rather than call order.
8. **Test double vs server, name clash.** `web/src/test/fakeApi.ts:760-762`
   compares with `toLowerCase()`, the server with SQLite `COLLATE NOCASE`. These
   agree for ASCII and diverge for non-ASCII case pairs (`'Ärzt'`/`'ärzt'`: the
   fake refuses, the server accepts). Using `toLowerCase` rather than
   `toLocaleLowerCase` was the right call; the divergence is in the folding
   algorithm, not the locale.

---

## 5. Checked and found sound — do not re-open these

Recorded because each is a place a reviewer would reasonably expect a problem,
and each took reading to settle rather than assuming.

- **Migrations 009/010/011 preserve data, and the proof is byte-for-byte.**
  All three columns are nullable with no default and no backfill, so no existing
  row is rewritten. `server/src/db/migrate.test.ts:306-413` builds a
  001–008 database, inserts an **archived** patient, snapshots the six original
  columns, migrates, and asserts the snapshot is identical, that both
  `group_id`s are `NULL`, that the foreign key actually fires, and that
  `ON DELETE SET NULL` un-files without failing. `PRAGMA foreign_keys = ON` is
  per-connection (`server/src/db/index.ts:49`), and the test enables it too
  (`:157`). The level assertion was **tightened**, 8 → 11 (`:107-111`), with a
  comment saying so. The `008` test's `applied` list was widened `[8]` →
  `[8,9,10,11]` (`:275-278`), which is what the added migrations require.
- **No guard or threshold was loosened anywhere in the diff.** I read every
  removed line across `web/`, `server/` and `e2e/`. The substantive ones:
  `App.test.tsx` **strengthened** the scrim guard — the old two-selector rule
  became a three-selector one covering Settings, add-patient and the language
  chooser, and a **new** assertion was added that
  `backdrop-filter: blur(var(--scrim-blur))` appears **exactly once** in
  `app.css`. `brand.spec.ts` did not drop its overlap guard, it **re-pointed**
  both assertions from the (now-absent) home search field to the first action
  card, keeping the "A mark is above it, not overlapping it" property. The
  Settings-section removal added three negative assertions
  (`settings-import`, `settings-import-halaxy`, `settings-tab-import` must be
  null) rather than just deleting the old ordering check. `language-control.spec.ts`
  changed by one comment word.
- **The pinned-filter exception works and is tested.** `PatientsColumn.tsx:660-669`
  applies the needle to `everyone` (`sidebarPatients ?? ordered`), not to the
  status/activity-filtered list, so a pin that the status filter removed is not
  dropped a second time from the other side — and
  `PatientsColumn.test.tsx:1058-1068` pins both halves: the archived pin survives
  *and* the unpinned archived patient is still gone.
- **Both import routes are reachable and e2e-covered.** `/api` routes registered
  in `app.ts:131`; `/import` and `/import/halaxy` are real routes
  (`web/src/App.tsx:115-116`). The "More" row navigates to `/import`
  (`Workspace.tsx:524-530`), each screen links to the other
  (`Import.tsx:328-334`, `HalaxyImport.tsx:236-242`), and both
  `e2e/tests/import.spec.ts` and `e2e/tests/halaxy-import.spec.ts` were rewritten
  to reach Halaxy the way a user now must: `/` → More → Import → the switch link.
- **The es-MX language dialog will not trip the English guard.** I expected it to
  and checked: `e2e/support/no-english.ts:16-18` treats a key as a leak only when
  its Spanish value **differs** from its English one, and the author arranged the
  four language keys accordingly — `language.{en,es-MX}.endonym` are identical in
  both catalogues, `language.es-MX.english` is `'Spanish (Mexico)'` in both, and
  `language.en.english` is the only translated one, which therefore cannot match
  the English catalogue on a Spanish screen. The component also suppresses the
  duplicate line when the two agree (`LanguageDialog.tsx:95`). This is a
  deliberate use of the guard's own rule, not a hole in it.
- **The new CSS transitions are covered by reduced motion.** `.home-action` and
  `.sidebar-section-chevron` add `transition:` using `var(--motion-fast)`, and
  the `@media (prefers-reduced-motion: reduce)` blocks in `motion.css` are
  selector-based rather than token-based — but `web/src/lib/appearance.ts:46-49`
  reads the system preference and applies `NO_MOTION_CLASS`, and
  `motion.css:221-225` kills `transition` with `!important` under
  `:root.no-motion *`. So both are neutralised. No finding.
- **No hardcoded colour in the new CSS.** Every added declaration in the 484-line
  `app.css` hunk uses `var(--…)`; `rg` for `#hex`/`rgb(`/`hsl(` over added
  lines returns nothing.
- **Dates and timezones are clean.** The new date arithmetic is
  `b.created_at.localeCompare(a.created_at)` on ISO-8601 UTC strings (correct
  lexicographically), `Date.now() - new Date(last).getTime()` against
  `DAYS * 86_400_000` (timezone-independent), and the seeder's
  `now.getTime() - daysAgo * 86_400_000` (millisecond arithmetic, so DST cannot
  shift it). No `new Date(localString)`, no `strftime('now')` backfill, and no
  `toLocaleDateString` in new code. The four-zone run in §1 is consistent with
  that. Note the seeder needed **no** backfill stamp at all, which is the direct
  benefit of the nullable-column choice over `UI-SORT-ir.md` §5.2's `last_opened_at`
  proposal.
- **`PatientSchema`'s new required fields are always present on the wire.**
  `COLUMNS` in `server/src/db/patients.ts:28` includes both, `createPatient`
  (`:76-79`) and `updatePatient` (`:124-128`) set them, so the strict
  `PatientSchema` parse in the client cannot fail on a shape the server omits.
- **`--reset` really does leave an empty database.** `wipe()`
  (`server/src/seed.ts:272-282`) now deletes `patient_groups`, and
  `seed.test.ts` seeds, hand-creates a group, files a patient into it, resets,
  and asserts both the group list is empty and every patient has
  `group_id === null`. The author found this by hitting it in a preview and wrote
  the test around the consequence, not the mechanism.
- **`wipe()`'s delete order is safe.** `DELETE FROM patients` precedes
  `DELETE FROM patient_groups`, and the FK is `ON DELETE SET NULL`, so either
  order terminates — as the comment says.

---

## 6. Limitations of this review

1. **No e2e of my own.** I launched no server, no browser, no Playwright project
   (HS-2, and the brief's constraint). The e2e verdict in §2 is a **static
   classification of the author's log**, not a counterfactual run: I did not
   execute the es-MX project against `e97d307` to demonstrate that the same 16
   fail there. The evidence in §2 is strong but it is evidence of kind, not a
   controlled comparison. If the coordinator wants that closed, it is one
   `git stash`-free route: run the es-MX project from a scratch worktree at
   `e97d307`.
2. **F3's clipping and F9's collision are static findings.** Both depend on
   layout at runtime; I read the CSS and the arithmetic and did not measure.
3. **F6's contrast judgement is not mine to make.** I report that the ledger and
   the artifact disagree and that the new rule is untested. Whether 3.32:1 white
   on the teal is the right tradeoff is the owner's recorded call, and the code
   comment says a later instruction reversed an earlier one. I have not treated
   it as a defect.
4. **I did not read** the model study, `docs/v2/state/reviews/P3.1-AM058-ir.md`,
   any other agent's in-flight files, or `prototype/` content.
5. **I ran no writes of any kind** to application state: no seed against a real
   data dir, no `sandbox.mjs` invocation, no `--reset`. `shared/dist/` is
   gitignored build output that already existed; `npm test` and
   `npm run typecheck` refresh it and write nothing tracked.
6. **The e2e log's Chromium sub-claim is inferred, not verified.** "No Chromium
   failure appears in `/tmp/e2e-final.log`" is a fact about the log; "50 passed"
   is the author's count and I did not re-run it to confirm the 50.

---

## Appendix A — commands, with exit codes

| Command | Exit |
| --- | --- |
| `git log --oneline -60`, `git status --porcelain`, `git branch -vv` | 0 |
| `git merge-base HEAD c1d897f` | 0 (→ `c1d897f`) |
| `git diff --name-only c1d897f..HEAD \| grep -vE '^\^docs/' \| wc -l` | 0 (**0** non-docs files) |
| `git diff HEAD -- . ':!docs' \| sha256sum` | 0 |
| `sha256sum` over the 13 untracked non-docs files, piped to `sha256sum` | 0 |
| `sha256sum` of each of the 4 evidence PNGs, working tree vs `git show HEAD:` | 0 (all 4 differ) |
| `…/node-v24.19.0-linux-x64/bin/node --version` | 0 (`v24.19.0`) |
| `APUNTA_FAKE_AI=1 npm test` | **0** — 152 files / 2054 tests |
| `APUNTA_FAKE_AI=1 TZ={UTC,America/Los_Angeles,Australia/Sydney,America/Mexico_City} npx vitest run` | **0** ×4 — 2054 each |
| `npm run lint` | **0** — `TOTAL 0`, 111 packages |
| `npm run typecheck` | **0** |
| `npx vitest run web/src/lib/accent.test.ts shared/src/i18n/t.test.ts server/src/routes/patientGroups.test.ts` | **0** — 39 |
| `npx vitest run server/src/db/migrate.test.ts server/src/seed.test.ts` | **0** — 22 |
| `npx vitest run web/src/components/PatientsColumn.test.tsx web/src/components/PatientMenu.test.tsx` | **0** — 58 |
| `node scripts/check-ui-strings.mjs --report <5 changed components>` | **0** — `TOTAL 0` |
| `rg` sweeps: `ArrowLeft`, `countPatientGroups`, `countPatientsInGroup`, `ReorderPatientGroup`, `patients.creatingGroup`, `settings.importClaude`, `view-sort-created`, `view-status-`, `on-accent`, `groups.failed`, `foreign_keys` | 0 / 1 (1 = the deliberate no-match sweeps behind F7 and F2) |

## Appendix B — files read, for re-derivation

`CLAUDE.md`; `docs/v2/HARD-STOPS.md`; `docs/v2/state/AMENDMENTS.md` (AM-045…AM-061,
D10, AM-053/054/055/056); `docs/v2/ORCHESTRATION-LOG.md` (tail);
`docs/v2/state/reviews/UI-SORT-ir.md` (whole — the advisory handoff whose P-7 this
batch's schema deliberately overrules, and whose O-5/O-6 §2 hazards both landed);
`docs/v2/state/reviews/UI-BATCH-impl.md` and `UI-TEAL-ir.md` (prior batch, for
the review shape and the AM-056 evidence precedent).

Source, whole or in the ranges cited: `server/migrations/00{8,9}_*.sql`,
`010_*`, `011_*`; `server/src/db/migrate.ts`, `db/index.ts:36-49`, `db/patients.ts`,
`db/patientGroups.ts`; `server/src/routes/patients.ts`, `routes/patientGroups.ts`,
`routes/patientGroups.test.ts`, `app.ts:23-131`; `server/src/seed.ts`,
`seed-cli.ts`, `seed.test.ts`; `server/src/db/migrate.test.ts`; `server/src/backup/readable.ts:1-40`;
`shared/src/patient.ts`, `index.ts:65-90`, `i18n/en.ts` (diffs + the group and
home keys), `i18n/es-MX.ts` (same); `web/src/lib/sidebarView.ts`,
`sidebarSections.ts`, `patientPins.ts:40-110`, `accent.ts`, `appearance.ts:25-49`,
`format.ts` (via call sites); `web/src/hooks/usePatientGroups.ts`,
`usePatientRecency.ts` (type only), `useLoader.ts` (via call sites);
`web/src/api/index.ts`, `patients.ts`, `patientGroups.ts`, `client.test.ts:1-30`;
`web/src/components/PatientsColumn.tsx` (whole, 1190 lines), `PatientMenu.tsx`
(whole), `SidebarViewMenu.tsx` (whole), `HomeLauncher.tsx` (whole),
`LanguageDialog.tsx` (whole), `PatientDirectory.tsx:1-70,230-250`,
`SidebarRail.tsx` (via `App.test.tsx` rail assertions), `icons.tsx` (diffs);
`web/src/routes/Workspace.tsx:60-145,278-350,480-680`, `Settings.tsx:37-300`,
`Import.tsx:320-340`, `HalaxyImport.tsx:1-250`; `web/src/App.tsx:15-120`;
`web/src/test/fakeApi.ts:480-920`; `web/src/styles/app.css` (484-line hunk, plus
`:2656-2710`, `:4163-4200`, `:4990-5120`), `tokens.css:140-270`, `motion.css`
(whole); `web/src/components/PatientsColumn.test.tsx:79-160, 490-520, 730-1010,
1045-1095`, `PatientMenu.test.tsx` (diffs), `HomeLauncher.test.tsx:170-275`,
`LanguageDialog.test.tsx` (diffs), `App.test.tsx:95-300, 840-870, 1300-1620`,
`Workspace.test.tsx:55-90`, `Import.test.tsx` (diffs), `web/src/lib/accent.test.ts`
(whole), `server/src/seed.test.ts:120-250`;
`e2e/tests/brand.spec.ts:1-40, 140-160, 384-470`, `workspace.spec.ts:150-185`,
`import.spec.ts`, `halaxy-import.spec.ts`, `language-control.spec.ts:45-60`,
`e2e/support/no-english.ts` (whole), `/tmp/e2e-final.log` (whole, 6610 lines).

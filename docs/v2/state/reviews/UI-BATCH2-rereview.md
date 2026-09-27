# Independent re-review: UI batch 2 repair pass (2026-09-27)

**Role: INDEPENDENT RE-REVIEW ONLY**, distinct from the batch author and from
`UI-BATCH2-review.md`. The only file this session wrote is this one — no
production, test or doc edit; no server, port, browser, sandbox, network,
download, inference, git mutation or staging (HS-1…HS-6).

## Base and fingerprint

The author committed and pushed mid-review, so the artifact is a commit now.

| Fingerprint | Value |
| --- | --- |
| Branch / HEAD | `feature/v2` @ `58247c8` "Give the sidebar patient groups, a real view control, and drag-and-drop" |
| Pushed | yes — `origin/feature/v2` == `58247c8`; `rev-list --count origin/feature/v2..HEAD` = **0** |
| Working tree | clean; only untracked paths are other agents' (`P3.1-AM058-ir.md`, `S2.6-postUI-ir.md`), not read |
| Base | `2f5fa7f` "Freeze independently reviewed bilingual model study corpus" |
| `git diff --name-only e97d307..2f5fa7f \| grep -vc '^docs/'` | **0** — every commit since the prior review's base is docs-only, so the 55-file set is the artifact it fingerprinted |
| Non-docs files in `2f5fa7f..58247c8` | **55** (56 total, +1 docs: `evidence/UI-BATCH2/handoff.md`); `+6882 / −390` |
| `git diff 2f5fa7f..58247c8 -- . ':!docs' \| sha256sum` | `6ca768ce67b73c342799e1799de56c667a349834e6db430ed59559ff9ce8538e` |

**The two hashes are not comparable and must not be diffed.** The prior
review's `1363194a65ed…` was a *working-tree* delta vs `e97d307`; this is a
*commit* delta vs `2f5fa7f`. The only like-for-like comparison is the file count
(39 modified + 13 untracked + 4 PNGs then; 55 now, PNGs gone), and it agrees.

## What I ran

Pinned Node `v24.19.0`, `APUNTA_FAKE_AI=1` throughout. Unit tests open only temp
databases from `server/src/test/harness.ts`; nothing on 7717, nothing on the
owner's preview, no live data dir.

| Command | Exit | Result |
| --- | --- | --- |
| `npx vitest run` ×5 repaired files (accent, SidebarViewMenu, Workspace.sidebarStatus, PatientMenu, PatientsColumn) | **0** | **82 passed** — reproduces the coordinator's 82 |
| `TZ=UTC APUNTA_FAKE_AI=1 npx vitest run` | **0** | 154 files, **2075 passed** |
| `npm run lint` | **0** | eslint, prettier, `check-no-external-urls`, licences (111), `check-ui-strings` **TOTAL 0** |
| `npm run typecheck` | **0** | all five workspaces |
| `npm run e2e` | not run | no server, no browser (HS-2) |

2075 confirms the author's number and is **+21 on the pre-repair 2054** — the
count grew; nothing was deleted to reach it. **Also not run:** `npm run build`,
the other three timezones. The handoff claims 2075 ×4 zones including
**America/Denver**, a zone neither review ran; I verified **UTC only** and did
not repeat the full multi-TZ suites per the CPU constraint.

| e2e log | Tests | Failed | Skipped | Passed |
| --- | --- | --- | --- | --- |
| `/tmp/e2e-final.log` (pre-repair) | 106 | 16 | 4 | 86 |
| `/tmp/e2e-rp1-full.log` (post-repair) | 106 | **16** | 4 | **86** |
| `/tmp/e2e-rp1-chromium.log` | 53 | **0** | 3 | **50** |

`diff` of the two sorted 16-line failure lists: **IDENTICAL SETS**. The repair
moved nothing in e2e — no regression, no gain. Every failure in both carries the
`[es-MX]` prefix, the split reconciles exactly (53 chromium 50+3; 53 es-MX
36+1+16), and the 16 span `formats.spec.ts` (6), `plan.spec.ts` (1) and
`workspace.spec.ts` (9) — two files this batch never touched. The batch's
**only** changed e2e test, `workspace.spec.ts:157`, is **not** among the 16; it is
the language-aware rewrite and now asserts two things more on a `tr()` string.

**The Spanish gate is not green and must not be called green.** 16 before, the
same 16 after, in a log I did not produce. One (`plan.spec.ts:45`,
`chat.change.summary`) is the known S2.6 / AM-059 debt, coordinator-owned and not
a reason to hold this batch; the other 15 are the es-MX literal-text coverage
gap and are still unowned.

## Findings

**No blocking defect and no serious concrete issue.** All six are repaired in
behaviour, not in comment, each pinned by a test that fails on reversion.

- **F1** `useMemo(…, [])` → `useState` (`Workspace.tsx:117-120`); the column
  reports via a new `onStatusChange` (`PatientsColumn.tsx:79`, and `:746` on
  clear-filters), flipping `includeArchived`, changing the `loadPatients`
  callback identity, which `useLoader` depends on — so the refetch is real and
  the stale request is aborted. Tested **both directions** in the new
  `Workspace.sidebarStatus.test.tsx` against the real workspace and real fetch,
  including that the archived patient goes back *off* the wire. Discriminating:
  the fake honours `include_archived=1` (`fakeApi.ts:807`).
- **F2** `sort` is written into `VIEW_KEY` and read first (`sidebarView.ts:84-97,
  118-124`); the lossy legacy mirror is kept deliberately for downgrades and a
  test asserts `'created'` maps down. Two tests, one a real `cleanup()` +
  re-render re-reading the row's own `aria-checked`.
- **F3** Focus enters the portalled panel from an effect
  (`SidebarViewMenu.tsx:194-197`); roving `ArrowUp`/`ArrowDown` with wrap, `→`
  opens a section and walks in, `←` walks back onto the row, Escape is
  level-aware and hands focus to the control on the last step, headings are
  `role="presentation"`, the second panel is clamped and flipped (`:110-121`)
  with `max-height`/`overflow-y` in CSS. Seven tests, including that a
  **hover**-opened panel does not steal focus.
- **F4** Implemented at `PatientMenu.tsx:556-561` with `stopPropagation`,
  returning focus to the anchor row; the wrapper is `role="none"` (`:504`) so
  the menu's structure stays valid. Tested at `PatientMenu.test.tsx:295-310`.
- **F5** `failed: boolean` → a three-value `PatientGroupsState`; three distinct
  bilingual sentences and a working retry; the hook comment that asserted the
  opposite is rewritten. Six tests including *reaching* the submenu in an error
  and recovering (`PatientMenu.test.tsx:641`), driven by a new `groupsError`
  fake.
- **F6** I recomputed the math rather than trusting the comment: `#2a9d8f` has
  L = 0.26584 → **3.324:1** in white, `#111111` L = 0.005605 → **5.679:1**. The
  test's figures are right and its `inWhite > 3 ∧ inWhite < inNearBlack`
  precondition is the discriminating condition. It also pins `tokens.css`'s
  declared `#ffffff` against the function's output — the invariant prior review
  said nothing asserted. (The old `tokens.css` "6.32:1" was wrong, now fixed.)

**F7's dead surface is also gone** — `ReorderPatientGroupRequestSchema`,
`countPatientGroups`, `countPatientsInGroup`, `patients.creatingGroup` and
`settings.importClaude` have no occurrences left, so the three-way disagreement
about what a `position` is no longer exists. **F8** fixed: `handleCreateGroup`
now carries the JSDoc that was orphaned in front of `endOfGroup`. **F10** fixed:
the four P2.2 evidence PNGs are byte-identical to `HEAD` and not in the commit.
Two further real defects the author found, both verified: `ViewMenuSlot` is a
module-level function (`PatientsColumn.tsx:63`) rather than a per-render
component (React was remounting the open menu), and Recents no longer sorts
note-less patients last, past the row cap.

### Remaining concrete defects

1. **Four comment blocks in the repaired files now say the opposite of the
   code** — the failure mode prior-review F8 flagged. `sidebarView.ts:12-16` says
   "`sort` is deliberately absent" and names **`sortFromSidebarView` and
   `sortToSidebarView` as "the bridge" — neither exists anywhere in the tree**
   (`rg` returns only that comment), and F2 put `sort` in the key.
   `sidebarView.ts:57-58` says the legacy sort "wins over anything in the new
   key" — F2 inverted that precedence. `Workspace.tsx:103-107` says "Read once,
   at mount … the column re-renders its own list" — both halves false, now
   stacked directly above the new F1 comment that says the opposite. This is the
   most misleading thing in the delta, because it is the comment that made F1
   look correct. No test fails on them; cheap documentation debt.
2. **Tab out of either portalled panel leaves the menu open (nit).** No
   `focusout` handling; `Escape` and outside-`pointerdown` cover the realistic
   exits. `.sidebar-view-menu`'s `top` is also unclamped (`app.css:4171-4175`;
   only `left` is), which is low risk at four rows.
3. **Unchanged nits, not blocking:** `endOfGroup` still computes
   `max(positions)+1` over the *fetched* list (F9), so an archived member is
   invisible to it; `010_`/`011_patient_group_position.sql` share a file stem
   (F12); `PRACTICE_SPAN_DAYS = 120` but the arithmetic reaches 123 (F12).
4. **Scope note, not a defect.** The owner's words were about *one label*.
   `Add patient` (`patients.add`) appears in exactly two places — the dialog
   title and its submit button; the sidebar row is "New patient". The title
   inherits `--text-primary` and was never grey; the submit button is `disabled`
   while the name is empty and paints `--on-accent` on `--accent` — the one that
   *was* grey. So the referent is almost certainly the disabled submit label, and
   the repair (`--on-accent: #ffffff` plus global disabled `opacity` 0.55 → 0.7,
   reason written into `app.css`) is coherent with it. Two things the owner did
   **not** say and the author chose: the rule is now **global** ("white unless
   under 3:1") rather than scoped to that button, and the opacity change hits
   every disabled control in the app. Both are recorded and defensible; neither
   needs the owner to restate anything. This is **not** an owner instruction to
   move a global 3:1 threshold, and the picker's warning threshold was not
   touched. One look at the refreshed preview would settle whether "really
   white" against teal at 0.7 opacity reads right — a judgement only a person
   can make.

## Gate weakening: none found

Every removed `-` line across `web/ server/ e2e/ shared/` that touches an
assertion is re-pointed at a renamed surface or **replaced by a stronger one**:
the scrim guard is intact and **gains** an assertion that
`backdrop-filter: blur(var(--scrim-blur))` appears **exactly once** in `app.css`
(`App.test.tsx:849-860`); the migration level was **tightened** 8 → 11 (three
sites) with the `008` test's `applied` widened to `[8,9,10,11]`; the
Settings-section removal added three **negative** assertions
(`App.test.tsx:1327-1329`) rather than only deleting the ordering check. No
`.skip`, `.only`, `.todo` or xfail was introduced; no threshold, no
`MIN_WHITE_ON_ACCENT` constant, no `check-no-external-urls` allow-list and no
`check-ui-strings` exclusion was widened. No destructive migration: 009/010/011
remain nullable columns with no default and no backfill, and `migrate.test.ts`
still builds a 001–008 database, inserts an archived patient, and asserts the
original six columns are byte-identical after migrating.

## Integration recommendation

**Integrate.** All six findings are repaired in behaviour and pinned by
discriminating tests; the repair added 21 unit tests and removed none. Lint,
typecheck and the full UTC unit suite are green on the exact commit `58247c8`,
which is pushed. Nothing serious is outstanding — four stale comments and three
nits remain. Two qualifications to carry forward verbatim:

1. **The Spanish gate is not green.** 16 es-MX failures, identical before and
   after, in a log I did not produce. Nothing here caused them and nothing here
   fixed them. Do not describe this batch as all-green. One is S2.6 / AM-059
   (coordinator); the other 15 are the es-MX literal-text gap, still unowned.
2. **No e2e of my own.** No server, no browser. The e2e verdict is a
   set-comparison of the author's two logs plus static reading of the changed
   spec — not a counterfactual run proving the 16 also fail at `2f5fa7f`. The
   set-identity result does establish that the repair neither added nor removed
   an e2e failure, which was the open question.

Before merge: delete the four false comment blocks (defect 1) and name an owner
for the 15 es-MX literal-text failures. Neither is a gate.

## Appendix

Every command exited 0 except where marked above. Also: `git diff --stat --
docs/v2/evidence/` → clean (F10 restored); `node --version` → `v24.19.0`
(pinned); `rg` sweeps (`on-accent`, `onStatusChange`, `sortFromSidebarView`,
`ReorderPatientGroup`, `countPatientGroups`, `creatingGroup`,
`settings.importClaude`, `include_archived`, `patient-submenu`) → the only
non-zero is the deliberate no-match behind defect 1 and F7. Source read:
`web/src/routes/{Workspace.tsx,Workspace.sidebarStatus.test.tsx,
Workspace.test.tsx,AddPatient.tsx}`, `web/src/lib/{sidebarView,patientPins,
accent,accent.test}.ts`, `web/src/hooks/{usePatientGroups,useLoader}.ts`,
`web/src/components/{SidebarViewMenu,PatientMenu,PatientsColumn}` and their
tests, `web/src/test/fakeApi.ts`, `web/src/styles/{app.css,tokens.css}`,
`shared/src/patient.ts`, `server/migrations/009-011`,
`server/src/db/migrate.test.ts`, `e2e/tests/workspace.spec.ts`,
`docs/v2/state/reviews/UI-BATCH2-review.md` and
`docs/v2/evidence/UI-BATCH2/handoff.md`. Not read: the model study, other
agents' in-flight files, `prototype/` content.

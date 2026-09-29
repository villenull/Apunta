# Latest handoff — 2026-09-29, two agents in flight

Supersedes everything below. Owner is continuing in a new chat instance.

## Where the tree is

`main` is level with `origin/main`. Nothing is uncommitted except the four P2.2
screenshots if a Playwright run has touched them — **revert, never commit** (see
"Do not"). All work is on `main`; `feature/v2` was retired under AM-068.

**P3.1 is APPROVED** (36 cards approved). Reviewed independently, all four rows
re-run cold, `whisper-cli` byte-identical to the implementer's, 8 findings none
blocking. One MAJOR carried forward as **P3.7**, not closed by P3.1's green.

**S2.6 is CHANGES REQUESTED** (attempt 3 of 3, the last). The review FAILED it
on V1/V3 and, in finding 3, found the more serious thing: the no-English guard
has no requirement that it read any strings, so on a screen reached by
navigation it reads 0, finds 0 English, and passes vacuously. AM-073 pins the
fix. Both fixes go in attempt 3 together — the owner's decision, because fixing
only `goBack()` would let V1 go green while the guard still proves nothing.

## Two agents are running right now

Both on `opencode-go/space-bunny-free` at high thinking, in this workspace, with
disjoint files. Expect notifications; do not re-dispatch and do not poll.

- **S2.6 implementer, attempt 3 (last)** — agent
  `3b791b39-8997-41ec-8267-931de7f74353`. Dispatch
  `docs/v2/state/dispatch/S2.6.md`, base `413445c`, port 7847. Fixes the
  `goBack()` defect (AM-072) and the vacuous guard (AM-073). Must account for all
  33 es-MX `checkScreen` calls: how many read 0 strings, how many non-zero, which
  screens are reached by navigation.
- **P3.7 card author** — agent `007e62cf-0f82-43c1-bb8c-0f52c7a0270b`. Writes
  the new card for P3.1's finding 1 plus its dependency plumbing, and runs
  `check-plan.mjs`. Docs only; it may not touch any code.

Both were told about each other, because `npm run lint` runs prettier repo-wide
and one agent's in-flight files can make the other's check fail spuriously. Both
were told to report such a failure rather than edit the other agent's files.

## A dispatch error, and the evidence it did no harm

Both reviews were dispatched **in parallel, which was a mistake**: P3.1's V1 runs
`npm run build:shared` and `npm run build` (card line 135-136), and the S2.6
reviewer temporarily reverts `shared/src/i18n/es-MX.ts` and rebuilds it. Two
agents writing the same build outputs breaks the one-writer rule, and P3.1's row
is a byte-exact, reproducible bundle that must not be built from a moving source
tree. Checked rather than assumed, and it came out clean: P3.1's bundle holds
**0** occurrences of the reverted catalogue's accented form and **4** of the
correct one, so it was built from the fixed tree; all four P2.2 PNGs verified
chunk by chunk. Neither agent was cancelled, because both were past the
dangerous phase. **Do not run two build-touching agents in parallel again** — that
was luck, not design.

## Do not

- Do not commit `docs/v2/evidence/P2.2/screenshots/*.png`. Any Playwright run
  rewrites them at sizes that contradict `evidence/P2.2/v1-e2e.md:184-187`.
  `git checkout -- docs/v2/evidence/P2.2/screenshots/` when the agents finish.
- Do not approve S2.6 on attempt 3's word, or on its review's word, without
  reading the findings and the evidence paths. Attempt 3 is the last of three: if
  it fails, the card needs an owner-authorised exception on the AM-049/AM-064
  precedent, and a fourth attempt is not available otherwise.
- Do not narrow `checkVisibility({ checkOpacity: true })` in
  `e2e/support/no-english.ts`. That is the tempting wrong fix and it would
  re-admit exactly the leak S2.6 exists to catch. Waiting out the transition is
  the sanctioned one.
- Do not widen a May-edit list, threshold, guard or acceptance row. §6 reserves
  new cards and May-edit changes to the owner; AM-072 and AM-073 are already the
  narrow authorisations she gave.
- Do not touch port 7717 or the live instance's data.
- Do not reap the two orphaned sandbox servers on **7861** (2026-09-26) and
  **7807** (2026-09-27). The owner's decision was to leave them. Reaping another
  session's state is exactly what caused P3.1's implementer to destroy five live
  sandboxes' data directories. Port 7717 is not listening, so the live instance
  is unaffected.

## When the agents return

1. **S2.6 attempt 3:** check the return against the 33-call accounting and the
   evidence paths. If every row is PASS, send it to an independent implementation
   review (a NEW sub-session, `--review --head <commit>`) before approving. If any
   row FAILs, it is blocked pending an owner exception.
2. **P3.7:** verify `check-plan.mjs` exits 0, read the card against P3.1's
   structure to confirm it was not quietly widened, then give it an instruction
   review (`--ir`) before any implementer sees it. Its V-row negative control
   must expect exit **1**.
3. Revert the P2.2 screenshots, commit findings/evidence/state with explicit
   paths, push `main`.

## Still open, and not in the plan

- Adding the Atkinson Hyperlegible font needs an amendment; it is not on the
  approved downloads list. Deferred by the owner's choice.
- `PROGRESS.json` has no status for a card awaiting review. Resolved: the plan's
  own `RUN-CONFIG.md` vocabulary already had `SUBMITTED` for that, so no new
  value was invented. Do not add a fourth one.

---

# Previous handoff — 2026-09-29, two implementation reviews in flight (superseded)

## Where the tree is

`main` is level with `origin/main` at `4703b3c`. Nothing is uncommitted except
the four P2.2 screenshots, which are **dirty on purpose and must be reverted,
never committed** — see "Do not" below. Branch: all work is on `main`
(`feature/v2` was retired under AM-068; do not recreate it).

Five commits landed this session, in this order:

| Commit | What it is |
| --- | --- |
| `c4a364f` | P3.1's Linux runtime bundle. Committed and pushed **by its own implementer**, which is off-protocol; already public, so the review runs against that head. |
| `9107639` | S2.6's language-name repair (AM-063) plus why the card cannot close. |
| `e96d6c0` | The P4.5 card. |
| `63b20fc` | What the coordinator actually verified, and what it did not. |
| `bdbbced` | AM-072, the narrow May-edit line for S2.6's navigation defect. |
| `4703b3c` | `SUBMITTED` status adopted; P2.2 mismatch logged. |

## Two agents are running right now

Both are **implementation reviews**, both on `opencode-go/space-bunny-free` at
high thinking, both in this workspace. Neither wrote the code it is reviewing.
Expect their completion notifications; do not re-dispatch and do not poll.

- **P3.1 implementation review** — agent `2eae2b70-4844-4d00-8626-c1b6429c3a81`.
  Dispatch `docs/v2/state/dispatch/P3.1-review.md`, base `85c3fd2`, head
  `c4a364f`, port 7845. Writes `state/reviews/P3.1-impl.md` and
  `evidence/P3.1/`. **V1, V2, V3 and V4 have already been re-run and all four
  exit 0**; it is in the write-up phase. Its outstanding job is to check three
  claims it was told to press on: that every symlink target really is listed
  with its own hash, that V2's negative case genuinely discriminates, and that
  the bundle's need for a **host Vulkan driver** is stated as a deployment
  consequence rather than buried.
- **S2.6 implementation review** — agent `6cf55a4a-de85-4775-92ab-b3d1b3da6bbf`.
  Dispatch `docs/v2/state/dispatch/S2.6-review.md`, base `c4a364f`, head
  `9107639`, port 7841 (+7842 for es-MX). Writes `state/reviews/S2.6-impl.md`
  and `evidence/S2.6/`. **It has already independently reproduced V1's single
  failure** — `about:blank` at `language-control.spec.ts:426`, exit 1 — which
  confirms the implementer's attribution rather than taking it on trust. It is
  now running the es-MX project with `--no-deps` and then the control.

## A dispatch error, and the evidence it did no harm

Both reviews were dispatched **in parallel, which was a mistake**: P3.1's V1
runs `npm run build:shared` and `npm run build` (card line 135-136), and the
S2.6 reviewer temporarily reverts `shared/src/i18n/es-MX.ts` and rebuilds it.
Two agents writing the same build outputs breaks the one-writer rule, and
P3.1's row is a byte-exact, reproducible bundle that must not be built from a
moving source tree.

Checked rather than assumed, and it came out clean:

- P3.1's bundle contains **0** occurrences of the reverted catalogue's accented
  `Inglés (Estados Unidos)` and **4** of the correct `English (United States)`,
  so it was built from the fixed tree. No contamination.
- All four P2.2 PNGs verify: correct signature, every chunk CRC valid, zero
  trailing bytes. Two concurrent Playwright runs did not corrupt them.

Neither agent was cancelled, because both are past the dangerous phase and
cancelling would have destroyed real work for a risk that had already
evaporated. **Do not run two build-touching agents in parallel again** — this
was luck, not design.

## Do not

- Do not commit `docs/v2/evidence/P2.2/screenshots/*.png`. Any Playwright run
  rewrites them at sizes that contradict `evidence/P2.2/v1-e2e.md:184-187`.
  `git checkout -- docs/v2/evidence/P2.2/screenshots/` when the reviews finish.
- Do not approve P3.1 or S2.6 on the implementer's word, or on the reviews' word
  without reading the findings and the evidence paths yourself.
- Do not widen a May-edit list, threshold, guard or acceptance row. §6 reserves
  new cards and May-edit changes to the owner, and AM-072 is already the narrow
  amendment she authorised for S2.6.
- Do not touch port 7717 or the live instance's data.

## What to do when the reviews return

1. **P3.1:** if the review is all-PASS with no blocking finding, set
   `PROGRESS.json` `P3.1` to `APPROVED` and commit with explicit paths. Its
   install-guide consequence — the bundle needs a host Vulkan driver — belongs
   in the docs before release, so check whether P6.1's card already carries it.
2. **S2.6:** the review is expected to confirm the V1/V3 defect. When it does,
   rebuild the implementation dispatch at **attempt 3** so AM-072's line is in
   force, and dispatch a fresh implementer. The fix is one test case's
   navigation sequence; the other assertion in that file is fenced off and the
   case count must not fall. Attempt 3 of 3 — there is no fourth without an
   owner-authorised exception on the AM-049/AM-064 precedent.
3. Revert the P2.2 screenshots, then commit the state files, the findings and
   the evidence, and push `main`.
4. **P4.5** is the next card needing work: the card is authored and committed
   but has had no instruction review yet. It needs `--ir` dispatch, a separate
   reviewer, then an implementer. Its May-edit is two files and its V3 is a
   negative control whose expected result is exit **1**.

## Still open, and not in the plan

- Adding the Atkinson Hyperlegible font needs an amendment; it is not on the
  approved downloads list. Deferred by the owner's choice.
- `PROGRESS.json` has no status for a card that is implemented and awaiting
  review. Resolved: the plan's own `RUN-CONFIG.md` vocabulary already had
  `SUBMITTED` for exactly that, so no new value was invented. Do not add a
  fourth one.

---

# Previous handoff — S2.6 partial integration (superseded)

Supersedes S2.6 and UI-review status below. UI rereview accepted and archived.
AM059 implementation independently accepted; coordinator 55 tests passed.
S2.6 remains BLOCKED, V1 FAIL on one English-name catalogue inconsistency.
Evidence correction worker archived after comments/docs verification. No guards
or assertions changed. Endonym key and LanguageDialog.test.tsx need a bounded
May-edit amendment; see S2.6-AM059-implementation.md. Model runner remains active.
Preview remains http://127.0.0.1:7867/ on the committed UI build.

# Current continuation — 2026-09-27, owner away about one day

This section supersedes the historical continuation below.

- Owner authorizes autonomous verified commits and normal pushes to feature/v2;
  stop only genuinely owner-blocked portions, continue independent work.
- UI batch committed/pushed58247c8 by UI owner at explicit owner request.
  Preview http://127.0.0.1:7867/ verified HTTP200/health ok, fakeAI, synthetic,
  migration11, runId2026-09-27T22-10-53-535Z-68445ebb, pid1693890.
  Retain UI agent f0bd1c61-253b-46ce-b59b-080334f6cb07, writer released.
- UI independent rereview a7c2f04e-8029-470a-8798-6229b00f7583 active.
  Gates:2075unit author-reported; coordinator82focused passed. Chromium50pass;
  full86pass4skip16Spanishfail. No clean-base causation claim. Four historical
  PNGs restored by author. Accent default-white owner wording recovered from
  UI history; corrected test contrast math committed. Ledger reconciliation due.
- S2.6 AM059 already owner-approved; prior instruction review CLEAR. Current
  post-UI drift reviewer d7923020-3e60-46ed-b79c-c8c5f5fa57c3; attempt2/3.
  Next implement forward-only localized attestation and in-scope language-aware
  browser assertions after that targeted review. No new clinical-release grant.
- Model corpus independently accepted and externally frozen in
  evidence/MODEL-STUDY/corpus-freeze.json; bytes retain internal DRAFT labels.
  Two corpus repair attempts spent. No more repair loop; material new defects
  make affected comparisons inconclusive. All corpus workers archived.
- Sole model executor490ebfe8-0a4a-4bf5-9020-26a3b38b4b92 runs Track1 then
  bilingual Track2 serially under GPU lease. All5model artifacts downloaded;
  coordinator verified QwenGGUF hashes. Scratch ~/.cache/apunta-model-study/
  2026-09-27; source snapshot05d9b10. Track2 now authorized. Need independent
  results/factual review and fresh blind style reviewer before conclusions.
- Monitoring heartbeat4ce8f0b5 every2min expires2026-09-29T10:11Z. Check actual
  pendingPermissions, not requiresAttention. Archive processed agents except
  retained UI. No busy polling outside owner-requested heartbeat/notifications.
- P4.1 AM057 approved, final attempt3 available; instruction textual fixes done.
  P3.1 AM058 approved but residual metadata/lint/ownership-proof findings need
  coordinator processing (untracked P3.1-AM058-ir.md). P5.2 readiness CLEAR.
- Never7717/live data, explicit staged paths, one source writer, no forcepush.

---

## Historical continuation (superseded where inconsistent)

# Orchestrator handoff — 2026-09-27

Owner requested an audit of the idle Paseo agents, archival, a current preview,
and recommended next work. This was an audit, not a card acceptance round.

## Latest: UI batch integrated

Owner ended UI iteration for tonight; keep agent `f0bd1c61-253b-46ce-b59b-080334f6cb07` available for tomorrow. Its reviewed batch includes lighter teal #2a9d8f, Add patient modal, rail hover swap and sidebar animation with immediate drag resizing. Coordinator checks: lint/typecheck/build exit 0, full unit/integration 1,967 passed, final targeted Chromium 23 passed. One earlier intermittent cold-load spelling failure is retained in `evidence/UI-BATCH/integration.md`; no claimed fix. Preview remains http://127.0.0.1:7811/. Writer lock released, no further UI batch started. S2.6/P4.1 remain blocked independently; unread/groups/sort-menu implementation has not started.

## Continuation after the audit

Owner continued with Space Bunny Free agents and supplied the Claude menu references, then requested unread tracking and custom groups too. Dedicated direct UI owner: `f0bd1c61-253b-46ce-b59b-080334f6cb07`; keep this owner-facing agent available. Its first reserved five-file batch changes the default teal to `#2a9d8f` (AM-055); the owner subsequently removed the per-tweak IR hold. The UI agent iterates freely with the owner in its sandbox and submits one finished batch for independent review and coordinator integration. Other implementation workers must wait for release of its lock. Menu data-design report is advisory: `state/reviews/UI-SORT-ir.md`, not approved product decisions.

S2.6 and P4.1 are now explicitly BLOCKED on instruction/scope decisions; see their updated checkpoints. S2.6 baseline: 8 pass, 1 skip, 1 fail (Spanish stored attestation). P4.1 proposal awaits owner approval; all size and checksum checks stay strict. The three completed instruction reviewers have been archived. This continuation supersedes stale holds/status recommendations in the original audit below.

## Agent cleanup

Reviewed recent Paseo activity for the S2.6 worker, UI worker, and previous
coordinator. All three were idle and all three archive calls returned success.
Their changes were already committed; the working tree was clean at `ce24912`.
No agent needed to be restarted and no code needed to be recovered or merged.

- S2.6: attempt 2 stopped at a provider session limit. Commit `9301354` contains
  the last e2e conversions and matcher changes. The worker's final finding was
  English plan attestation stored in Spanish mode. Independently confirmed:
  `server/src/routes/plans.ts` stores the constant `ATTESTATION_TEXT` from
  `shared/src/plan.ts`, whose value is English. Treat this as a scope/contract
  finding; do not silently edit those files under S2.6 or suppress the check.
- UI: work is committed, including the row-menu stacking fix. Its final report
  predates S2.6's low-contrast warning implementation; do not mistake that old
  report for current status. Exact Claude sort-menu matching still awaits the
  owner's reference; it does not block the language or desktop work.
- Previous coordinator: the last preview refresh/teal restoration was unfinished.
  This audit supplied a fresh sandbox preview with the approved default teal.

## Current preview and verification

Preview: <http://127.0.0.1:7811/>. Built from `ce24912`, fabricated seed data,
fake AI, separate sandbox data, default English; Spanish release gating remains.
The browser confirmed `Patients · Apunta`, Recents, the synthetic sample people,
and computed `--accent: #218677`. Health confirmed a sandbox run ID, a database
under the sandbox root, and fake AI. No live-instance port or data was accessed.

Coordinator checks, all on 2026-09-27, repository root, pinned Node 24.19.0:

| Check | Result |
| --- | --- |
| `npm run build` | Exit 0 |
| `npx vitest run --project shared --project web --project installer` | Exit 0; 74 files, 795 tests passed |
| Chromium headless navigation and computed-accent check at port 7811 | Exit 0; page rendered, teal verified |

Raw build/test/preview logs are temporary files under `/tmp`, not committed.
These checks do not replace card gates or bilingual e2e acceptance.

Preview startup correction: seeding inside `sandbox.mjs run` failed with
`SQLITE_BUSY` (exit 1), because that mode had already started the server.
Used `sandbox.mjs env --port 7811`, then seeded its fresh database before
starting the server with that environment. The resulting preview passed the
health and browser checks. Earlier preview instances were left untouched.

## Recommended order

1. Resume S2.6 attempt 2 from its checkpoint after a fresh instruction review.
   Resolve the attestation scope finding through the owner/plan editor if a
   contract or May-edit change is required. Finish bilingual flow execution,
   obtain an independent implementation review, then coordinator verification.
   Continue S2.7 copy review, S2.8 fixes, and S2.R acceptance. Include the recorded
   singular/plural Halaxy copy defect in the appropriate copy-review scope.
2. Resolve P4.1's outstanding review findings before acceptance. Its checkpoint
   is stale: implementation and independent review are committed, although
   PROGRESS still says IN PROGRESS. The reviewer reported PASS with conditions.
   Independently confirmed the probe still prints raw Location in its
   unparseable branch. Do not run that network probe until redaction is repaired.
   The card/contract conflicts about query allowances and receipt writes need
   owner/plan-editor resolution; verify the model size pin before acquisition.
   Keep the card unapproved meanwhile; repair the checkpoint when work resumes.
3. P3.1 Linux runtime packaging is ready for a regenerated dispatch; cmake was
   previously unblocked. P5.2 safe startup migrations is another available lane:
   its recorded hold on S2.5 is obsolete because S2.5 is approved. Preserve one
   writer per tree and serialize commits; do not infer concurrency safety from
   stale holds. P4.1 acceptance unlocks Spanish speech benchmarking.

No card status, attempt counter, scope, contract, threshold, or approval was
changed by this audit. Owner clinical review, release/merge/signing actions,
and live v1 handover remain owner-only.

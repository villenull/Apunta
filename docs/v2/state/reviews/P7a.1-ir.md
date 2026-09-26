# Instruction review: P7a.1 Sanitized public-repository audit

Role: **INSTRUCTION REVIEW ONLY.** Round **2 (final)**. Base commit: `3855a73`
(HEAD is `3855a73` on `feature/v2`, confirmed with `git log -1`; no pull, merge,
rebase or reset, and no other git mutating command).

Inputs supplied: the dispatch file `docs/v2/state/dispatch/P7a.1-ir.md` (card
text, hard stops HS-v1, contract excerpts, run configuration); the card text
`docs/v2/cards/P7a.1.md` as amended by **AM-016**; and
`docs/v2/state/PROGRESS.json` read-only per **AM-013** (dependency approval
state for IR-02). **AM-014** is applied as the owner decision on L0 markdown
prettier V-rows. Round-1 findings for this card are in this file's history
(base `46216fe`); the three round-1 defects (IR-03, IR-05, IR-08) were
re-checked against the amended card text and are dispositioned below.

Existence checks only, all read-only; no implementation command run, no card
output created, and no file edited except this one: root `package.json`,
`.prettierignore`, `node_modules/.bin/prettier`, `docs/feedback/`,
`docs/note-instructions/`, `.claude/`, `docs/v2/evidence/`, `server/src/config.ts`
(data-dir resolution only), the P7a.1 and C0.1 checkpoints, plus two
**names-only** git queries used to test whether the read scope can surface a
data file. No file content, no discovered value, no live data folder and no
port 7717 was touched; no decision was changed. The tree is dirty with another
session's in-flight work (`docs/v2/state/AMENDMENTS.md`, two dispatch files);
per CLAUDE.md it was left alone and not staged.

## Disposition of round-1 defects

| Round-1 ID | Fix applied | Result |
| --- | --- | --- |
| IR-03 | AM-016: "Report shape" adds `<home-1>` to the redaction vocabulary and states "home paths must use a placeholder, never the literal path" (`docs/v2/cards/P7a.1.md:48-51`) | resolved → CLEAR |
| IR-05 | AM-014: `.prettierignore` contains `*.md` (verified at this base), so a markdown `prettier --check` V-row is **NON-BINDING** by owner decision; file existence + well-formedness satisfy it | resolved → CLEAR |
| IR-08 | AM-016: all four "Read" commands now redirect into the mode-`700` folder, "never printed to the console or into a repo file", "Grep the saved files, never history on stdout"; "Method" step 1 adds "never by re-running history to stdout" (`docs/v2/cards/P7a.1.md:18-26`, `:37-39`) | resolved → CLEAR |

## Final answers

| ID | Question | Answer | Reference |
| --- | --- | --- | --- |
| IR-01 | Is the objective one bounded behaviour with exact read and write scope? | CLEAR | Objective is one bounded behaviour ("current tree **and full history**"); "Read" is four named git commands "via git only" and now states exactly where their output goes; write scope is exact — one new Markdown file (`May edit`) plus the mode-`700` folder, "Must not edit: Anything else". Every Method pointer resolves: `docs/feedback/` (5 tracked files), `docs/note-instructions/` (5), `.claude/settings.json`, `.claude/hooks/apply-stop-hook-grace.sh` (12 tracked in those three paths). A names-only history query shows no `.env`, `data/`, `*.db` or `*.sqlite*` was ever added on any ref, so the read scope cannot surface the live data folder (HS-1) |
| IR-02 | Does every prerequisite artifact exist and is it `APPROVED` in `state/PROGRESS.json`? | CLEAR | Depends `C0.1` only. `docs/v2/state/PROGRESS.json` (read-only, AM-013) reads `"C0.1": "APPROVED"`; checkpoint `docs/v2/state/cards/C0.1.json` is `APPROVED` and its artifacts exist (`CLAUDE.md`, `.prettierignore`, `docs/v2/`). No other card's output is consumed, so no further prerequisite. `P7a.1` itself reads `NOT STARTED`, correct at IR time |
| IR-03 | Are the chosen behaviour, data shape, errors and legacy rules explicit? | CLEAR | As amended, the report shape, the `keep / fix in tree / owner history decision` enum, the **OWNER ONLY** cleanup plan and "Contracts: none" are explicit, and the redaction vocabulary now covers every class Method step 2 requires: `<user-1>`, `<home-1>`, `<host-1>`, `<email-1>`, with the explicit sentence "home paths must use a placeholder, never the literal path". A quoted location may be a repo path, a short commit, or a home path rendered as `<home-1>`, so no Method step obliges a literal private path. Round 1's DEFECT is closed (see disposition table) |
| IR-04 | Are the happy path and at least one failure outcome testable without guessing? | CLEAR | Happy path: all four V-rows have a stated expected result with cwd repo root named in the Verification header. Failure outcomes that can fail: V2 fails on any email match in the report, V3 fails on any mode other than `700`, V4 fails unless all 7 method steps are reported with "nothing found" counting as a report. V1 is non-binding under AM-014 and is not relied on; the other three are enough to make a defective report distinguishable from a clean one, plus V4's reviewer read |
| IR-05 | Does every command name its working directory and exist in `package.json` or the repo, or is it marked as created by a named earlier card? | CLEAR | Working directory is named once for the whole table ("cwd: repo root"). Every command resolves locally: `prettier ^3.9.6` is a root devDependency and `node_modules/.bin/prettier` exists, so `npx prettier` runs from the local install with no network fetch; `git`, `grep` and `stat` are on this machine; the four "Read" commands are `git` subcommands. No command depends on a file a named earlier card must create. V1's inertness against a `*.md`-ignored target is **NON-BINDING per owner decision AM-014** (verified: `.prettierignore` contains `*.md`), so it is not a defect on this card |
| IR-06 | Are tools to be created clearly distinguished from tools that already exist? | CLEAR | No tool is created, modified or claimed: the deliverables are one Markdown report and one raw-results folder; the only tooling is existing `git`, `npx prettier`, `grep`, `stat`. The `git filter-repo` mention is prose inside the **OWNER ONLY** plan, explicitly the owner's action, and is not presented as installed or as an agent step |
| IR-07 | Can every test, restart and cleanup stay inside the sandbox (C-ISO)? | CLEAR | L0, "No sandbox port assigned" is consistent: read-only git queries redirected to a file outside the repo, one Markdown write, no server, no database, no app launch, nothing to restart and nothing to clean up, so HS-2's pre-P0.3 clause is satisfied. The mode-`700` folder is a plain directory, not a launch. The history rewrite is OWNER ONLY and outside the agent (HS-4 also bars the agent from force-pushing) |
| IR-08 | Is every relevant hard stop preserved, with a concrete stop response? | CLEAR | All ten hard stops are quoted in full with the concrete response ("stop the step, write what was needed in your return file with status `BLOCKED`"), and the card preserves HS-3/4/8/9/10. As amended, the card no longer contradicts HS-5 or its own printing ban: "every raw result is written into `~/.local/state/apunta-v2-audit/` (create with mode `700`) and **never printed to the console or into a repo file**", "Grep the saved files, never history on stdout", "If a secret-like value is found, do not echo it; record only 'secret-like value in <path> at <short commit>'", and Method step 1 repeats "never by re-running history to stdout". `~/.local/state/apunta-v2-audit/` is not the live data folder (`server/src/config.ts:147` resolves the Linux data dir to `~/.local/share/apunta`), so HS-1 holds, and raw values never reach stdout, a repo file or evidence (§4 bullet 2). Every stop now has a compliant path. Round 1's DEFECT is closed (see disposition table) |
| IR-09 | Can a fresh session resume from the checkpoint without repeating side effects? | CLEAR | Checkpoint `docs/v2/state/cards/P7a.1.json`: attempt 1 of 3, `sideEffectsDone: []`, `changedFiles: []`, V1-V4 `NOT RUN`, `nextAllowedAction` "check instruction review return". Nothing has run, so a fresh session repeats no side effect: the git reads are read-only, `docs/v2/PUBLIC-REPO-AUDIT.md` does not exist yet, and re-creating the mode-`700` folder is a `mkdir -p` a second time reuses. A resume re-reads this verdict rather than re-running the audit |
| IR-10 | Is the required evidence obtainable, or honestly marked missing? | CLEAR | §4 evidence is obtainable: V2 and V3 yield exit codes and short output, V4 is a reviewer read, and the per-card evidence path convention (`docs/v2/evidence/<card-id>/evidence.md`, present for P0.1-P0.4 and S1.1-S1.4) is in force. Nothing is marked missing. Raw patch output must never be committed as evidence (§4 bullet 2) — the card already forbids it twice |

## Notes (non-blocking, no answer changed)

- V2 still matches emails only; the home-path sanitisation added by AM-016 is
  carried by the "Report shape" rule and by V4's reviewer read, not by an
  automated grep. Adding `/home/|/Users/` to V2 would close that loop, but it
  was a round-1 recommendation rather than a requirement, and it is the
  coordinator's to add, not a gap in the instructions as written.
- §4 bullet 2 says raw logs stay "in the sandbox run folder", while this card
  sends raw history to `~/.local/state/apunta-v2-audit/`. The card names that
  folder in "May edit", the folder is mode `700` and outside the repository, and
  the governing rule (never committed) is honoured, so this is a wording
  difference, not a conflict.
- The L0 gate in RUN-CONFIG §2 also runs `node scripts/check-no-external-urls.mjs`,
  which exists; the implementing agent runs it from the authoritative run
  configuration, so no card change is needed.
- `stat -c %a` in V3 is GNU-specific (macOS needs `stat -f %Lp`). Not a defect
  for an L0 card executed on this Linux PC.
- The card's "May edit" list omits `docs/v2/evidence/P7a.1/`, which §4 requires.
  This matches the established convention (S1.1 and S1.4 omit it too, and their
  evidence directories exist), so the run configuration governs; worth
  normalising across cards at some point.
- The checkpoint's `baseCommit` still reads `46216fe` while the dispatch base is
  `3855a73`. The dispatch is authoritative, `sideEffectsDone` is empty, so
  nothing is ambiguous for a resume; it is coordinator bookkeeping.
- `docs/v2/DEPENDENCIES.md` has no `P7a.R` parent-review row (P7b.1 depends on
  `P7a.1` directly), although the card's Parent field says `P7a`. A plan-level
  observation for the coordinator; no instruction inside P7a.1 depends on it.

Summary: **CLEAR on all ten.**

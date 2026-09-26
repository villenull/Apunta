# Instruction review: P7a.1 Sanitized public-repository audit

Role: **INSTRUCTION REVIEW ONLY.** Base commit: 46216fe (HEAD is `46216fe` on
`feature/v2`, confirmed with `git log -1`; no pull, merge, rebase or reset).

Inputs supplied: the dispatch file `docs/v2/state/dispatch/P7a.1-ir.md` (card
text, hard stops HS-v1, contract excerpts, run configuration), and
`docs/v2/state/PROGRESS.json` read-only per amendment **AM-013** (dependency
approval state for IR-02). Note: the template's `docs/v2/state/dispatch/P7a.1.md`
does not exist at this base (only the `-ir.md` dispatch is built yet); the
`-ir.md` carries the complete card text and it is identical to
`docs/v2/cards/P7a.1.md`, so no input was actually missing.

Existence checks only, all read-only, no implementation command run and no file
edited except this one: root `package.json` (scripts and devDependencies),
`.prettierignore`, `docs/feedback/`, `docs/note-instructions/`, `.claude/`,
`docs/v2/CONTRACTS.md` (C-ISO@1), `scripts/v2/sandbox.mjs`, `docs/v2/evidence/`,
the checkpoint, plus two **names-only** git queries (`git log --all
--diff-filter=A --name-only`, `git grep -l`) used to test whether the card's read
scope would surface data files or home paths. No file content, no discovered
value, no live data folder and no port 7717 was touched; no decision was
changed.

| ID | Question | Answer | Reference |
| --- | --- | --- | --- |
| IR-01 | Is the objective one bounded behaviour with exact read and write scope? | CLEAR | Objective is one bounded behaviour ("current tree **and full history**"); Read is four named git commands "via git only"; write scope is exact: one new Markdown file plus one mode-`700` folder outside the repo, "Must not edit: Anything else". Every Method pointer resolves (no AM-006-style dead pointer): `docs/feedback/` (5 tracked files), `docs/note-instructions/` (5), `.claude/hooks/apply-stop-hook-grace.sh` and `.claude/settings.json`. A names-only history query shows no `.env`, `data/`, `*.db` or `*.sqlite*` was ever added on any ref, so the read scope cannot surface the live data folder (HS-1) |
| IR-02 | Does every prerequisite artifact exist and is it `APPROVED` in `state/PROGRESS.json`? | CLEAR | Depends `C0.1` only; `docs/v2/state/PROGRESS.json` (read-only, AM-013) reads `"C0.1": "APPROVED"`, checkpoint `docs/v2/state/cards/C0.1.json` status `APPROVED`, and its artifacts exist (`docs/v2/**`, the CLAUDE.md paragraph, `.prettierignore` lines). No other card's output is consumed, so no further prerequisite. `P7a.1` itself reads `NOT STARTED`, correct at IR time |
| IR-03 | Are the chosen behaviour, data shape, errors and legacy rules explicit? | DEFECT | Report shape, the `keep / fix in tree / owner history decision` enum, the OWNER ONLY cleanup plan and "Contracts: none" are explicit, but the redaction vocabulary does not cover a category Method step 2 requires — see detail |
| IR-04 | Are the happy path and at least one failure outcome testable without guessing? | CLEAR | V2 fails on any email match in the report, V3 fails on any mode other than `700`, V4 fails unless all 7 method steps are reported with "nothing found" counting as a report; all four name cwd repo root via the Verification header. V1's failure outcome is unreachable — filed under IR-05, it does not remove the other three |
| IR-05 | Does every command name its working directory and exist in `package.json` or the repo, or is it marked as created by a named earlier card? | DEFECT | `grep`, `stat` and `git` exist and `prettier ^3.9.6` is in root devDependencies, but V1 is inert against this repository — see detail |
| IR-06 | Are tools to be created clearly distinguished from tools that already exist? | CLEAR | No tool is created, modified or claimed: deliverables are one Markdown report and one raw folder; the only tooling is existing `git`, `npx prettier`, `grep`, `stat`. The `git filter-repo` mention is prose inside the OWNER ONLY plan, explicitly the owner's action, and is not presented as installed or as an agent step |
| IR-07 | Can every test, restart and cleanup stay inside the sandbox (C-ISO)? | CLEAR | L0, "No sandbox port assigned" is consistent: read-only git queries, one Markdown write, no server, no database, no app launch, nothing to restart or clean up, so HS-2's pre-P0.3 clause is satisfied. `scripts/v2/sandbox.mjs` and C-ISO@1 exist for reference. The history rewrite is OWNER ONLY and outside the agent (HS-4 also bars the agent from force-pushing) |
| IR-08 | Is every relevant hard stop preserved, with a concrete stop response? | DEFECT | All ten hard stops are quoted in full with the concrete response ("stop the step, write what was needed in your return file with status `BLOCKED`"), and the card preserves HS-3/4/8/9/10. But the mandated Read command contradicts HS-5 and the card's own printing ban, with no compliant path — see detail |
| IR-09 | Can a fresh session resume from the checkpoint without repeating side effects? | CLEAR | Checkpoint `docs/v2/state/cards/P7a.1.json`: attempt 1 of 3, `sideEffectsDone: []`, `changedFiles: []`, V1-V4 `NOT RUN`, `nextAllowedAction` "check instruction review return". Nothing has run, so a fresh session repeats no side effect: the git reads are read-only, `docs/v2/PUBLIC-REPO-AUDIT.md` does not exist yet, and re-creating the mode-`700` folder is a `mkdir -p` a second time reuses |
| IR-10 | Is the required evidence obtainable, or honestly marked missing? | CLEAR | §4 evidence is obtainable: V1-V3 yield exit codes and short output, V4 is a reviewer read, and the per-card evidence path convention (`docs/v2/evidence/<card-id>/evidence.md`, present for P0.1-P0.4 and S1.1-S1.4) is in force. Nothing is marked missing. Raw patch output must never be committed as evidence (§4 bullet 2) |

## DEFECT details

### IR-03

- **ID and location (file and heading):** IR-03 — `# P7a.1 Sanitized public-repository
  audit`, "Method" step 2 read against "Report shape"
  (`docs/v2/cards/P7a.1.md:33` and `:38-44`; dispatch lines 84 and 89-95).
- **The text that conflicts, or exactly what is missing:** Method step 2 requires
  reporting "Personal identifiers: usernames, hostnames, **home paths**, emails
  including commit author and committer emails", but "Report shape" offers only
  `<user-1>`, `<host-1>`, `<email-1>` as redactions and the `location (path, short
  commit)` column carries no rule that a quoted path must be repo-relative. The
  report is a committed file (May edit) and the objective is to know what would
  become public "without writing any private detail into the repository"; V2
  checks emails only. No placeholder or rule exists for a home path.
- **One concrete failure scenario:** 19 tracked files in the current tree already
  contain an absolute `/home/<user>/...` path (`docs/HANDOFF.md`,
  `docs/eval-reports/2026-09-22-claude-export-probe.md`,
  `docs/research/data-at-rest-2026-08.md`, and 16 more; 6 further files carry
  `/Users/...`). Method steps 2 and 4 oblige the agent to report those, and the
  only sanctioned redactions do not cover them, so the agent must choose between
  committing the owner's home path and username into a report destined for a
  public repository, and silently dropping a required finding. The card
  authorises neither reading.
- **One specific correction or named prerequisite:** in "Report shape", add a
  placeholder for this class (for example `<home-1>`) plus one sentence: every
  path quoted in the committed report is repo-relative, and a home or other
  absolute path appears only as `<home-1>/...`. Recommended in the same edit:
  widen V2 to also match `/home/|/Users/` so the sanitisation becomes testable
  rather than reviewer-only.

### IR-05

- **ID and location (file and heading):** IR-05 — "Verification", row V1
  (`docs/v2/cards/P7a.1.md:49`; dispatch line 100).
- **The text that conflicts, or exactly what is missing:** V1 expects
  `npx prettier --check docs/v2/PUBLIC-REPO-AUDIT.md` to "exit 0", and it is the
  card's only automated formatting gate. This repository's `.prettierignore`
  contains `*.md` (added in `ff9726f`, before v2; C0.1 added only
  `docs/v2/state/` and `docs/v2/evidence/`), so the target is ignored:
  `npx prettier --file-info docs/v2/PUBLIC-REPO-AUDIT.md` returns
  `{"ignored": true, "inferredParser": null}`, and `--check` on an ignored
  Markdown file prints "All matched files use Prettier code style!" and exits 0.
  The command exists, so nothing is missing from the card textually, but the
  check it names cannot fail. The same is true of the L0 gate in RUN-CONFIG §2
  for every Markdown-only card; that part is systemic and belongs to the
  coordinator, not to P7a.1 alone.
- **One concrete failure scenario:** the implementing agent writes a report with
  broken table formatting or a malformed heading; V1 still reports exit 0, V2-V4
  say nothing about formatting, and the checkpoint records V1 `PASS`, so a
  defective report and a clean one are indistinguishable at review.
- **One specific correction or named prerequisite:** make V1 able to fail, e.g.
  `npx prettier --check --ignore-path /dev/null docs/v2/PUBLIC-REPO-AUDIT.md`
  (one added flag, no new file, no new tool), or, if the repo-wide `*.md` ignore
  is intended, add `.prettierignore` to "Read", say in the card that Markdown is
  prettier-ignored, and replace V1 with a reviewer-read formatting check whose
  expected column states a condition that can fail.

### IR-08

- **ID and location (file and heading):** IR-08 — "Read"
  (`docs/v2/cards/P7a.1.md:17-19`) read against "Must not edit"
  (`:25-27`), with HS-5 in the dispatch "Hard stops (HS-v1)" (line 33) and §4
  "Evidence" (line 162).
- **The text that conflicts, or exactly what is missing:** "Read" mandates
  `git log -p --all`; "Must not edit" says "Never print a discovered secret to
  the console or into any file; record only 'secret-like value in <path> at
  <short commit>'"; HS-5 says "Never create, print, copy or commit a production
  signing key or password". `git log -p --all` writes every patch of every ref
  to stdout. The card never instructs the agent to redirect that output into
  `~/.local/state/apunta-v2-audit/` — "Raw findings go only to" implies it but
  states no command — and it offers no non-printing search, so following the
  Read list literally breaks HS-5 and the card's own rule in precisely the case
  the card exists to detect. There is no compliant path and therefore no stop
  response to give.
- **One concrete failure scenario:** an old commit contains a token; the agent
  runs the Read command as written; the token, with any home path, hostname or
  note text beside it, reaches the terminal and the session transcript — outside
  the mode-`700` folder, which is the one place raw values are allowed to exist —
  so the audit itself becomes the leak it was written to prevent.
- **One specific correction or named prerequisite:** add one sentence to "Read"
  or "Method": no raw history output ever reaches stdout — write
  `git log -p --all > ~/.local/state/apunta-v2-audit/history.patch` inside the
  mode-`700` folder and search that file with counting or `-l`/`-o` forms only,
  reporting just path and short commit; the same rule covers
  `git log --format='%an %ae %cn %ce'`. One sentence resolves the conflict.

## Notes (non-blocking, no answer changed)

- The card's Verification table lists only `prettier`; the L0 gate in
  RUN-CONFIG §2 also runs `node scripts/check-no-external-urls.mjs`, which
  exists. The implementing agent runs it from the authoritative run
  configuration; no card change needed.
- `stat -c %a` in V3 is GNU-specific (macOS needs `stat -f %Lp`). Not a defect
  for an L0 card executed on this Linux PC.
- The card's "May edit" list omits `docs/v2/evidence/P7a.1/`, which §4 requires.
  This matches the established convention (S1.1 and S1.4 May-edit lists omit it
  too, and their evidence directories exist), so the run configuration governs;
  worth normalising across cards at some point.
- `docs/v2/DEPENDENCIES.md` has no `P7a.R` parent-review row (P7b.1 depends on
  `P7a.1` directly), although the card's Parent field says `P7a`. A plan-level
  observation for the coordinator; no instruction inside P7a.1 depends on it.
- The checkpoint schema has no line for the mode-`700` raw folder, so a later
  attempt could not tell from the checkpoint alone whether raw findings already
  exist there. Harmless at attempt 1, where nothing has run.

Summary: not CLEAR on IR-03, IR-05, IR-08.

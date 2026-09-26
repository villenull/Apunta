# P7a.1 Sanitized public-repository audit

| Field | Value |
| --- | --- |
| Parent | P7a |
| Role | RESEARCH |
| Level | L0 |
| Contracts | none |
| Depends | C0.1 |
| Findings | R18 |
| Confidence | n/a |

## Objective
Know what would become public (current tree **and full history**) without
writing any private detail into the repository.

## Read
The repository via git only: `git log -p --all`, `git log --format='%an %ae %cn %ce'`,
`git rev-list --objects --all`, `git ls-files`.

## May edit
`docs/v2/PUBLIC-REPO-AUDIT.md` (new, sanitized). Raw findings go only to
`~/.local/state/apunta-v2-audit/` (create with mode `700`), never in the repo.

## Must not edit
Anything else. Never print a discovered secret to the console or into any
file; record only "secret-like value in <path> at <short commit>".

## Method
1. Secrets and credentials across history (keys, tokens, passwords, `.env`,
   auth headers). 2. Personal identifiers: usernames, hostnames, home paths,
   emails including commit author and committer emails. 3. Owner-authored
   material (`docs/feedback/`, `docs/note-instructions/`). 4. Anything
   possibly patient-derived (fixtures, reports, images in history, eval and
   probe outputs). 5. Agent traces (`.claude/`, hooks). 6. Large binaries in
   history. 7. Licence position (`UNLICENSED`, no LICENSE file).

## Report shape
A table: `finding ID | category | location (path, short commit) | risk |
recommendation (keep / fix in tree / owner history decision)`, using
redacted identifiers (`<user-1>`, `<host-1>`, `<email-1>`). Then a history
cleanup plan marked **OWNER ONLY** (for example `git filter-repo` on a fresh
clone; every hash changes; needs a force-push only the owner may do; any
secret found must be revoked or rotated, not just removed).

## Verification
| ID | Command (cwd: repo root) | Expected |
| --- | --- | --- |
| V1 | `npx prettier --check docs/v2/PUBLIC-REPO-AUDIT.md` | exit 0 |
| V2 | `grep -nE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}' docs/v2/PUBLIC-REPO-AUDIT.md` | no matches |
| V3 | `stat -c %a ~/.local/state/apunta-v2-audit` | `700` |
| V4 | reviewer reads | all 7 method steps reported, including "nothing found" |

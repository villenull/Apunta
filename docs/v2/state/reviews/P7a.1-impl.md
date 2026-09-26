# Implementation review: P7a.1 Sanitized public-repository audit

Role: **IMPLEMENTATION REVIEWER.** Reviewed from the evidence, not from the
implementer's verdict. All four verification rows were re-run as written from
the repository root. No secret, home path, username, hostname, email or tailnet
name appears in this file.

- Dispatch: `docs/v2/state/dispatch/P7a.1-review.md` (base `a154847`, head
  `1a81d91`, attempt 1 of 3)
- Diff reviewed: `git diff a154847..1a81d91` (3 files, 397 insertions, 0
  deletions)
- Implementer's return: `docs/v2/state/returns/P7a.1.md`

## Results

| ID | Status | Exit code | Evidence path | Finding |
| --- | --- | --- | --- | --- |
| V1 | PASS | 0 | this file | `npx prettier --check docs/v2/PUBLIC-REPO-AUDIT.md` → "All matched files use Prettier code style!", exit 0. Non-binding under AM-014 (`.prettierignore` exempts `*.md`, so the row is vacuous); well-formedness confirmed by reading. |
| V2 | PASS | 1 (no matches, as expected) | this file | `grep -nE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}' docs/v2/PUBLIC-REPO-AUDIT.md` printed nothing, exit 1. Independently re-checked the report, the evidence file and the return file against: the literal home-path prefix, the OS account name, the machine hostname, every distinct home-directory user name harvested from the tracked tree, both words of the commit-author name, the author email, the remote URL, and the tailnet/MagicDNS names from `docs/dev-notes/remote-testing.md`. **Zero** occurrences in all three files. The only non-zero matches were the words `claude`/`Claude` in path and product names. |
| V3 | PASS | 0 | this file | `stat -c %a ~/.local/state/apunta-v2-audit` → `700`. 42 files present, all outside the repository (not under the checkout), mode unchanged since the implementer's 05:22 creation. |
| V4 | PASS | — | this file | All 7 method steps are reported, each with substance, and each states "nothing found" where that is the true result. Mapping checked against the card's `Method`: step 1 secrets → S-01…S-04 (S-01 an explicit nothing-found, S-02/S-03 classified false positives, S-04 the only judgement call); step 2 personal identifiers → P-01…P-11 (P-11 an explicit nothing-found, P-01 the commit-metadata row); step 3 owner-authored → O-01…O-05 covering `docs/feedback/` and `docs/note-instructions/`; step 4 patient-derived → D-01…D-07 (D-01 an explicit nothing-found, D-02…D-06 the per-artifact rows, D-07 the control that keeps it true); step 5 agent traces → A-01 (`.claude/settings.json`, the Stop-hook patch), A-02, A-03; step 6 large binaries → B-01 ("nothing above 5 MB" plus the largest-blob roll-up); step 7 licence → L-01…L-04, L-01 covering `UNLICENSED` and the absent `LICENSE` file. |

| Check | Status |
| --- | --- |
| Changed paths within scope | PASS |
| Diff matches fixed decisions and contracts | PASS |
| Hard stops respected | PASS |

### Changed paths

Exactly three, all dispatch-mandated, all additive, nothing deleted or
modified: `docs/v2/PUBLIC-REPO-AUDIT.md` (the card's sole "May edit" entry),
`docs/v2/evidence/P7a.1/evidence.md` (RUN-CONFIG §4 evidence) and
`docs/v2/state/returns/P7a.1.md` (the dispatch's "Your return file"; both
confirmed as required outputs by AM-017). Nothing else in
`a154847..1a81d91`. `prototype/` untouched, no code touched, no threshold or
guard touched.

### Head and working tree

HEAD is `1a81d91` on `feature/v2`. The working tree carries only coordinator
state: `docs/v2/state/cards/P7a.1.json` modified and the untracked
`docs/v2/state/dispatch/P7a.1-review.md` (the generated dispatch for this
review). Neither is attributable to this card. No pull, merge, rebase or reset
was run in this review.

### Spot-checks of the report's own numbers (independent, from the base)

Every count the report anchors to its base commit reproduces:

| Claim in the report | Independently measured |
| --- | --- |
| 388 commits reachable from `--all` at the base | 388 |
| `<email-1>` on 270 of 388 commits | 270 |
| owner's name and address in 0 tracked files, 0 added lines | 0 files |
| 0 tags; 3 refs | 0 tags; 5 ref entries (see finding 3) |
| no `LICENSE`/`LICENCE`/`COPYING` in the tree or in any commit | 0 and 0 |
| `license: UNLICENSED`, `private: true` | confirmed |
| `<home-1>`: 21 lines in 10 tracked files | 21 / 10 |
| `<host-1>`: 353 lines in 9 tracked files | 353 / 9 |
| `<user-2>`: 32 lines | 32 (file count off by one, finding 3) |
| 47 transcript fixtures under the four fixture dirs | 47 |
| `docs/feedback/` 5 files, `docs/note-instructions/` 5 files, 3 reference PDFs | 5 / 5 / 3 |
| largest blob 1.44 MB, nothing ≥ 5 MB | 1 515 297 bytes; none ≥ 5 MB |
| `dictation-10s.wav` 312 KB, `THIRD-PARTY-LICENSES.md` 211 KB | 320 044 / 216 825 bytes |
| `2026-09-22-claude-export-probe.md:16` and `docs/v2/state/HARNESS.md:11` carry a literal home path | both confirmed present at the base |

### Redaction check (independent)

I re-derived the candidate identifier values from the repository and the running
environment and matched them against all three new files: literal home-path
prefix, the OS account name, the machine hostname, all 10 distinct
home/Users directory names present in the tracked tree, the commit-author
name and its email, the remote URL, the tailnet name, and a sweep of the card's
own secret families. Result: no literal home path, username, hostname, email,
tailnet name or secret in any of the three files. There is no IPv4 literal, no
external URL (`node scripts/check-no-external-urls.mjs` exit 0), no
`BEGIN … PRIVATE KEY` block, no ≥32-character hex run and no ≥40-character
base64 run. The single `_authToken` hit in each of the report and the evidence
is the *name* of a pattern in a nothing-found list, not a value. The report
never names the real export archive it flags in the probe report (checked by
extracting the archive name from that report and matching it: 0 hits). The
report table uses placeholders throughout (`<user-1>`, `<user-2>`, `<home-1>`,
`<home-2>`, `<host-1>`, `<host-2>`, `<user-4>`…`<user-8>`, `<email-1>`…`<email-4>`),
never a literal value, and is shaped as the card requires:
`finding ID | category | location (path, short commit) | risk | recommendation`
across 35 finding rows.

### Raw material placement

`~/.local/state/apunta-v2-audit/` sits outside the checkout at mode `700`.
No capture is in the repository: `git ls-files` matches nothing against
`history-patches`, `identities`, `objects.txt`, `object-sizes`, `tracked.txt`,
`commit-files`, `added-files`, `deleted-files`, `name-status`, `hist-shot`,
`findings-*` or `apunta-v2-audit`, and the working tree holds no stray scan
output. The ad-hoc scanners are reported as living in `/tmp/opencode/`, outside
the repository — consistent with what is on disk. Nothing the implementer found
is reproduced here.

### History-cleanup plan

The section is headed `## History cleanup plan — **OWNER ONLY**` and opens by
naming HS-4, HS-10 and `docs/v2/DECISIONS.md` D3 as the reasons, stating
outright that it is "a plan to be read, approved or rejected, not run". It
covers all four elements the card asks for: revoke-or-rotate first (step 1
states that removal from history is not sufficient and that the value must be
revoked or rotated), the identity decision as three costed options, execution
on a fresh `git clone --mirror` with `git-filter-repo` (`--mailmap` plus
`--replace-text`) rather than on the working repository, the expectation that
every hash changes across 388 commits and 3 refs with the force-push explicitly
reserved to the owner, and the sequencing (tree fixes → rewrite → re-run the
captures → flip visibility). Step 6 keeps the raw captures as the input to the
rewrite. This criterion is met.

### Hard stops

HS-1 no live data, export, PDF contents or port 7717 touched; the report says so
and the evidence shows the export was approached only through a committed
report. HS-2 L0, no server/database/app launched, sandbox not needed — consistent
with the card's level. HS-3 no downloads, no model pulled. HS-4 no merge/pull/
rebase/reset/force-push/visibility change. HS-5 no production key or password
created, printed or committed; the four test literals are reported by path only,
never by value. HS-6 no runtime network code (none written). HS-7 no scorer,
guard, lock, test or threshold touched. HS-8 the three personal names quoted in
the evidence (`John Q. Public`, `Dana Doe`, `Richard Roe`) all pre-exist in the
repository's own synthetic fixtures, so nothing real was introduced. HS-9
`prototype/` untouched. HS-10 nothing reserved to the owner was performed; every
such item is left as a labelled owner decision.

## Numbered findings for the implementer

None blocking. Three informational, none of which affects a verification row or
the privacy conclusion.

1. **`docs/v2/PUBLIC-REPO-AUDIT.md:28` and `:54` — supporting count off by one.**
   Both say the account name appears in "16 tracked files"; `git grep -l` over
   the tree at the base commit and at HEAD returns **15** (the accompanying "32
   lines" is correct). Likewise `:4` says "3 refs" where the repository holds 5
   ref entries (`refs/heads/main`, `refs/heads/feature/v2`,
   `refs/remotes/origin/HEAD`, `refs/remotes/origin/{main,feature/v2}`) — the
   report appears to be counting ref *groups*, which is defensible but is not
   what the sentence says. Would pass by writing 15 and either "3 ref groups"
   or the real count. Immaterial to the finding, which is about the string
   appearing in a clone URL and a home path.
2. **Small count drift in two more places, same cause.** `:77` says "214 files
   under `docs/v2`" and "72 files" in `docs/v2/state`; at the base commit these
   are 212 and 71. `:65` says `docs/eval-reports/` holds 34 files; it holds 33
   `.md` files at the base. Consistent with counting a few minutes later with
   coordinator files present. Would pass by anchoring each count explicitly to
   the base commit, which line 11 already promises globally. Cosmetic.
3. **Base commit named in the report differs from the one in the dispatch.**
   The report is headed "base commit `3855a73`" while this review's dispatch
   says `a154847`. This is not an error: `3855a73` is four commits behind
   `1a81d91` (the three coordinator/research commits the report describes at
   lines 11–16, plus this card's own commit), and 388 + 4 = 392 = the current
   `--all` count, so the anchor is internally consistent. The report and the
   return both disclose the drift, and the return's deviation 5 explains it.
   Noted only so a later reader does not mistake it for a miscount. Would pass by
   adding one clause naming the dispatch base the session was handed.

## Verdict

`PASS`

Every verification row and every check above is `PASS`. The report answers the
card's question for the tree and for full history, keeps raw material out of the
repository, uses placeholders rather than values everywhere, reports all seven
method steps including the nothing-found results, marks the history rewrite
**OWNER ONLY** and leads it with revoke-or-rotate. Findings 1–3 are cosmetic
count and anchor wording and do not qualify the verdict.

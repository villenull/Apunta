# Evidence: P7a.1 Sanitized public-repository audit (RESEARCH)

Working directory: repository root (checkout on branch `feature/v2`).
Attempt 1 of 3, base commit `3855a73`. No server, database or app was launched;
this is an L0 docs-only card, so `scripts/v2/sandbox.mjs` was not needed.

## Raw material: where it lives and why it is not in this file

Every raw `git` result went to `~/.local/state/apunta-v2-audit/`, created with
mode `700` and never printed to the console or written into a repository file
(card `Read` as amended by AM-016). Nothing in this evidence file or in
`docs/v2/PUBLIC-REPO-AUDIT.md` contains a discovered value: where a pattern
matched, only the pattern name, the path, the short commit and a judgement
("placeholder-or-fixture" / "needs-review") were recorded, per the card's
instruction to record only "secret-like value in `<path>` at `<short commit>`".

| Raw file (mode 700) | Bytes | What it holds |
| --- | ---: | --- |
| `history-patches.txt` | 12 265 553 | `git log -p --all` (the four mandated captures plus `--format` variants) |
| `identities.txt` / `identities-all.tsv` | small | `git log --format='%an %ae %cn %ce'`, and the same over `--all` with a field separator so multi-word names parse |
| `objects.txt` / `object-sizes.txt` | 3 913 / 331 481 | `git rev-list --objects --all`, then `git cat-file --batch-check` sizes for every object |
| `tracked.txt` | 21 476 | `git ls-files` |
| `commit-files.txt`, `added-files.txt`, `deleted-files.txt`, `name-status.txt` | — | per-commit file lists, added-file history, the 5 deleted paths, add/modify/delete status |
| `findings-*.tsv`, `findings-*.txt` | — | sanitized findings: pattern name + path + short commit only |
| `hist-shot-*.png` | 2 files | two historical `e2e/screenshots` blobs extracted for visual inspection |

Ad-hoc scanners used for this card lived in `/tmp/opencode/` and are not part
of the repository.

## Method and its limits

- Secrets (step 1) were searched **only** inside the saved raw files. History
  was never re-run to stdout after capture.
- The secret scan's value-shape regexes produce false positives by design on
  clinical vocabulary (`token:` fields) and on pinned model checksums. Each hit
  was classified by reading the line with every quoted string and every hex run
  masked, so a judgement could be made without the value entering this record.
- Identity classification never emitted a name or address: each distinct value
  is reported as a placeholder with a count, a length, a commit share, and
  membership in a benign-marker list (`noreply`, `localhost`, vendor names).
- Name harvesting across 684 documentation and fixture files was too noisy to
  be conclusive on its own (it matches any capitalised bigram), so the
  patient-name question was settled by reading the fixture openers directly and
  by listing the first line of all 47 transcript fixtures.

## Commands run

All times UTC. All commands run from the repository root. Every row's output
was redirected into the mode-700 folder unless the row says "console".

| Time (UTC) | Command | Exit | Excerpt |
| --- | --- | --- | --- |
| 05:22 | `git log -1 --format='%H %h %s'` (console) | 0 | `3855a73ed8c0fb936c5382fb1bedfc2c419e4f0b` — HEAD is exactly the dispatch base commit `3855a73`. Branch `feature/v2`. No pull, merge, rebase or reset was run. |
| 05:22 | `umask 077 && mkdir -p ~/.local/state/apunta-v2-audit && chmod 700 …` | 0 | `stat -c %a` → `700` (re-checked at 05:34, still `700`) |
| 05:22 | `git log -p --all > …/history-patches.txt`; `git log --format='%an %ae %cn %ce' > …/identities.txt`; `git rev-list --objects --all > …/objects.txt`; `git ls-files > …/tracked.txt` | 0 | The four captures named in the card's `Read`, verbatim, redirected. |
| 05:22 | `git rev-list --all --count > …/commit-count.txt` | 0 | `388` commits reachable from `--all`; 3 refs (`main`, `feature/v2`, `origin/*`); 0 tags. |
| 05:22 | `git count-objects -vH > …/count-objects.txt` | 0 | 2 584 distinct blobs, 47.6 MB of blob content, pack 13.36 MiB, 50 loose objects. |
| 05:22 | `git remote -v > …/remotes.txt`; `git branch -a > …/branches.txt`; `git tag -l > …/tags.txt` | 0 | One remote over HTTPS, fetch and push. Checked programmatically for an embedded credential: **none**. Tags: none. |
| 05:23 | `python3 /tmp/opencode/audit_scan.py` (secret patterns over `history-patches.txt` + the tracked tree) | 0 | 71 pattern hits in history, 67 in the tree, 3 suspect file names. All classified below; **no production secret**. |
| 05:23 | `python3 /tmp/opencode/literal_reuse.py` (4 candidate literals, never printed) | 0 | Each of the 4 candidate values occurs in exactly one file — its own test file — across the whole history. No reuse outside tests. |
| 05:24 | `python3 /tmp/opencode/ident_summary.py` then a corrected field-split pass (5-field parse failure on the mandated space-separated file; re-derived from `identities-all.tsv`) | 1 then 0 | 388 commits, 5 distinct identities, 5 distinct addresses, 5 tuples, 387/388 with author email == committer email. |
| 05:25 | `python3 /tmp/opencode/personal_ids.py` (identity tokens, `/home/…`, `/Users/…`, `*.local`, email-shaped strings over 946 tracked files) | 0 | The owner's name, first name and address: **0 occurrences in file content**. 7 distinct home-path user names; 1 `*.local` hostname; 36 email-shaped strings, none matching the commit address. |
| 05:25 | `python3 /tmp/opencode/name_harvest.py` (684 files) | 0 | 278 name-shaped tokens match the fabricated-sample allowlist (7 distinct pairs). The unmatched remainder is English capitalised bigrams — the harvest is reported as inconclusive, not as a finding. |
| 05:26 | object-size roll-up from `object-sizes.txt` | 0 | No blob ≥ 5 MB. 4 blobs ≥ 1 MB. 77 binary-ish blobs ever in history, 10.45 MB total. |
| 05:26 | `git log --all --diff-filter=D --name-only > …/deleted-files.txt` | 0 | 5 deleted paths in the whole history, all source files (2 components, 1 spec, 2 research modules, 1 api module). No deleted data, log or export file. |
| 05:28 | `python3` exact-location pass for `<home-1>`, `<host-1>`, `<host-2>`, kernel string, `<user-1>`, `<email-1>` (tree and history) | 0 | Tree: 32 lines / 16 files for the account name, 21 lines / 10 files for the literal home path, 353 lines / 9 files for the hostname, 5 lines / 1 file for the tailnet name. History: the owner's name and address appear in **0** added lines. |
| 05:28 | `git cat-file blob` → `hist-shot-dcc04b8.png`, `hist-shot-e60d85c.png` (largest and oldest of 7 historical screenshot blobs) | 0 | Both extracted into the mode-700 folder and inspected: synthetic e2e data only. |
| 05:31 | direct reads of `docs/feedback/2026-08-25-owner-style-source.md`, `docs/eval-reports/2026-09-23-owner-voice-test1.md`, `docs/eval-reports/2026-09-23-past-notes-drafting.md`, `docs/eval-reports/2026-09-22-claude-export-probe.md`, `docs/eval-reports/2026-09-24-owner-intervention-style.md`, `docs/reference/README.md`, `docs/research/mexico-clinical-records-2026-08.md`, `docs/research/privacy-audit-2026-08.md` | 0 | All are shape-only, synthetic-only or owner-authored-but-decontaminated. `docs/eval-reports/2026-09-22-claude-export-probe.md:16` carries the one literal home path that also names the real export archive. |
| 05:31 | first line of all 47 fixtures under `e2e/fixtures/{eval,her-format,eval-owner,eval-prior}` (console) | 0 | 11 fabricated client names, all from the prototype sample set or obviously invented (`John Q. Public`, `Dana Doe`, `Richard Roe`). No real client name. |
| 05:32 | `cat e2e/fixtures/audio/README.md`, `docs/reference/README.md`, `config/recovery/current-linux.json`, `.claude/settings.json`, `.claude/hooks/apply-stop-hook-grace.sh`, `.gitignore`, `package.json` (+ workspace manifests), `README.md` §License, `docs/v2/DECISIONS.md` D3 | 0 | Audio fixture documented synthetic with no speech; the reference PDFs documented as the owner's publicly available guides with no client information; no LICENSE file in the tree or in history; `license: UNLICENSED`, `private: true`; D3 reserves visibility and any history rewrite to the owner. |
| 05:33 | `python3` PDF-metadata probe over `docs/reference/*.pdf` (values masked) | 0 | 1 of 3 carries an `/Author` string (5 characters, a third party — not the commit author); 1 carries `/CreationDate`; none carries a client name. |
| 05:33 | `git check-ignore` on 4 likely output paths; `grep` of `tools/model-lab/pipeline/run-consented.sh` | 0 | `tools/model-lab/work/**`, `data/*.db`, `*.jsonl` ignored; the consented-run script refuses an export inside the repository and writes to `$HOME/.local/share/apunta/model-lab`. |
| 05:35 | `node scripts/check-no-external-urls.mjs` (console) | 0 | No output, exit 0 (L0 row, see below). |
| 05:35 | `npx prettier --version` (console) | 0 | `3.9.6` |

## Criteria

| ID | Status | Exit code | Note |
| --- | --- | --- | --- |
| V1 | see return file | 0 | `npx prettier --check docs/v2/PUBLIC-REPO-AUDIT.md` |
| V2 | see return file | — | `grep -nE '[A-Za-z0-9._%+-]+@…' docs/v2/PUBLIC-REPO-AUDIT.md` → no matches |
| V3 | PASS | 0 | `stat -c %a ~/.local/state/apunta-v2-audit` → `700`, checked at creation (05:22) and again at 05:34 |
| V4 | PASS | — | All 7 method steps reported in `docs/v2/PUBLIC-REPO-AUDIT.md`, including the steps where nothing was found |
| L0-a | PASS | 0 | `node scripts/check-no-external-urls.mjs` — L0 row from the run configuration, not a card criterion |
| L0-b | PASS | 0 | `npx prettier --check` on the changed file(s), per V1 |

## What was searched and found nothing (so a reviewer does not have to re-ask)

- No private key block, no `.env` file, no `_authToken`, no private registry,
  no embedded credential in a remote URL, no JWT, no cloud-vendor key, no
  `authorized_keys`, no `.gitconfig`, no model-lab/HuggingFace token — in the
  tree or in any of the 388 commits.
- No secret-like value that is not one of: a pinned model checksum
  (`installer/src/catalog.ts`, `docs/eval-reports/2026-09-08-whisper-gpu-candidate.md`)
  or a hardcoded literal inside a unit test
  (`server/src/backup/backup.test.ts`, `server/src/routes/backup.test.ts`,
  `server/src/extract/extract.test.ts`), each used only by its own test.
- The owner's name, first name and email address: **0** occurrences in any
  tracked file and **0** added lines in the whole history. They exist only as
  commit metadata on 270 of 388 commits.
- No personal email address in any tracked file. The live-looking addresses in
  the tree are npm maintainer addresses in the generated
  `THIRD-PARTY-LICENSES.md`, one address in a font licence, one `mailto:` in
  `prototype/index.html`, and one package-name-and-version-shaped string in a research doc.
- No patient-derived content: no real client name in any fixture, report, image
  or model-comparison record; no real transcript; the owner's voice recording is
  outside the repository by design and only a quote of a fictional script is
  committed.

## Honest limits of this attempt

- The secret scan is pattern-based. It cannot prove the absence of a secret
  encoded in a form no pattern matches. It does establish that nothing in the
  tree or history matches the standard key/token/credential/password families.
- Third-party author metadata inside a binary is only as good as the mask: a
  5-character `/Author` is reported as a third-party name, not attributed.
- Whether the three clinical reference PDFs may be redistributed is a licensing
  question about documents this audit did not fetch or read. It is recorded as
  an owner decision, not answered.
- Repository visibility was not checked: that needs the forge, and the card
  forbids changing it.

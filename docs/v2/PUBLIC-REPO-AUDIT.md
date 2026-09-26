# Public-repository audit — what would become public

**Card P7a.1 (RESEARCH), base commit `3855a73`, branch `feature/v2`.**
Scope: the current tree **and** all 388 commits reachable from `--all`, across
`main`, `feature/v2` and both remotes. Every raw `git` result was captured into
`~/.local/state/apunta-v2-audit/` (mode `700`) and inspected there; no raw
result was printed to the console or written into a repository file, and no
discovered value appears below. Method, commands and limits:
`docs/v2/evidence/P7a.1/evidence.md`.

Every count below is as of the base commit, which is what the card mandates.
Three further commits landed on `feature/v2` while this audit was running
(coordination state under `docs/v2/state/`, plus one new research document);
all eleven files they added or changed were checked against every identifier
pattern in this report and none matched, so no finding moves. Re-run before
publishing regardless — see unresolved item 6 in the return file.

This report answers one question — *what is in here* — and makes no
recommendation about whether to publish. Flipping visibility and rewriting
history are the owner's alone (`docs/v2/DECISIONS.md` D3).

## Redaction vocabulary

| Placeholder | What it stands for | Where it exists |
| --- | --- | --- |
| `<user-1>` | the practice owner's commit-author name (two words) | commit metadata, 270 of 388 commits |
| `<email-1>` | the owner's personal mailbox address (third-party provider) | commit metadata, 270 of 388 commits |
| `<user-2>` | the OS account name, which is also the account name in the clone URL | 32 lines in 16 tracked files; every home path |
| `<user-3>` | a second home-directory name, one whole word of `<user-1>` | 7 lines in 5 tracked files |
| `<home-1>` | the literal home-path prefix built from `<user-2>` | 21 lines in 10 tracked files |
| `<home-2>` | the literal home-path prefix built from `<user-3>` | 7 lines in 5 tracked files |
| `<host-1>` | the machine hostname | 353 lines in 9 tracked files |
| `<host-2>` | a Tailscale MagicDNS name, including the tailnet identifier | 5 lines in 1 tracked file |
| `<user-4>`, `<email-2>` | the coding agent's commit name and its `noreply` address | commit metadata, 106 commits |
| `<user-5>`, `<email-3>` | a one-off local commit identity (placeholder domain) | commit metadata, 10 commits |
| `<user-6>`, `<email-4>` | a synthetic single-commit identity (local domain) | commit metadata, 1 commit |
| `<user-7>` | a second synthetic single-commit identity, author ≠ committer | commit metadata, 1 commit |
| `<user-8>` | a third-party author name inside a reference PDF's metadata | 1 committed binary |

## Findings

Risk is about publishing, not about severity inside a private repo: **high** =
would disclose a credential or clinical material; **medium** = identifies the
owner or her machine/network; **low** = professional or operational detail;
**none** = nothing private.

| ID | Category | Location (path, short commit) | Risk | Recommendation |
| --- | --- | --- | --- | --- |
| S-01 | secrets | nothing found: no private key, `.env`, token, password, auth header, JWT, cloud key, `_authToken`, private registry, or remote-URL credential in the tree or in 388 commits | none | keep |
| S-02 | secrets | `server/src/ai/clinical-phrases.ts` (58 hits, first at `ff6dc43`) — the `token:` field of clinical assertion records, not a credential | none | keep (false positive) |
| S-03 | secrets | `installer/src/catalog.ts:118,119,141,142` (first at `92ed824`); `docs/eval-reports/2026-09-08-whisper-gpu-candidate.md:37` — pinned model SHA-1/SHA-256 checksums, public by design under hard rule 1's acquisition exception | none | keep (recorded in `docs/decisions.md`) |
| S-04 | secrets | test literals in `server/src/backup/backup.test.ts:298,435`, `server/src/routes/backup.test.ts:153` (`9493924`), `server/src/extract/extract.test.ts:143` (`49bc2c3`) — each occurs **only** in its own test file across all history | low | owner decision: keep, or have the backup tests generate the passphrase at run time. HS-5 governs production keys, and these are unit-test fixtures, but the wording is stricter than the code |
| P-01 | personal identifier | commit metadata: `<user-1>` / `<email-1>` on 270 of 388 commits (70%); `<user-4>` / `<email-2>` on 106; `<user-5>` on 10; `<user-6>` and `<user-7>` on one commit each. **Zero** occurrences of the owner's name, first name or address in any file, in the tree or in any added line in history | medium | **owner history decision** (D3). Publishing exposes every author address; nothing in the files needs changing to achieve that |
| P-02 | personal identifier | `<user-2>` in `README.md:13,158`, `docs/HANDOFF.md:612,735,737,740,743,756,757,762,768`, `docs/RECOVERY.md:21,22,148`, `docs/dev-notes/remote-testing.md:14`, `docs/research/ci-audit-2026-08.md:3,456`, `docs/v2/cards/P5.4.md:33`, plus 7 more files (32 lines, 16 files) | medium | fix in tree: replace home paths with `~`; the clone URL itself must stay public, so `<user-2>` cannot be removed from it — see the note below the table |
| P-03 | personal identifier | `<home-1>` literal home paths, 21 lines in 10 files: `docs/eval-reports/2026-09-22-claude-export-probe.md:16` (`0b0c047`), `docs/HANDOFF.md` ×8 (`367350c`), `docs/eval-reports/2026-09-22-gpu-acceleration.md:6,15,17,51` (`f4d5210`), `docs/eval-reports/2026-09-22-whisper-silence.md:5,127` (`92ed824`), `docs/eval-reports/2026-09-22-synthetic-acceptance.md:27` (`92ed824`), `docs/eval-reports/2026-09-23-faster-lighter.md:415` (`8128913`), `docs/eval-reports/2026-09-23-owner-tests-2-3.md:102` (`d770043`), `docs/v2/evidence/P0.4/environment-probe.md:4` (`08e4376`), `docs/v2/state/HARNESS.md:11` (`69f8cda`), `scripts/model-comparison/results/summary.json:3` (`92ed824`). The probe report also names the real export archive and its folder | medium | fix in tree **and** owner history decision. Highest-priority line in the whole audit: it discloses the migration folder and the export file name |
| P-04 | personal identifier | `<home-2>` — a home-directory name equal to one word of `<user-1>` — in `docs/HANDOFF.md`, `docs/eval-reports/2026-09-08-second-wave-release.md` ×3, `2026-09-08-inference-efficiency.md`, `2026-09-08-whisper-gpu-candidate.md`, `2026-09-20-tiny-en-clinical-vocabulary.md` (7 lines, 5 files) | medium | fix in tree, with P-03 |
| P-05 | machine identifier | `<host-1>` on 353 lines in 9 files: `scripts/model-comparison/results/{records,perf-final,perf-bonsai4-final,perf-bonsai8-final,perf-qwen2-final,perf-qwen4-final,near-budget,smoke}.jsonl` (every line, first at `92ed824`) and `docs/eval-reports/2026-09-20-tiny-en-clinical-vocabulary.md:4` (`e755aae`) | medium | fix in tree (have the runner write a placeholder into `environment.host`) **and** owner history decision |
| P-06 | network identifier | `<host-2>` in `docs/dev-notes/remote-testing.md:14,18,34,43,81` (`d606a8b`) — a MagicDNS name carrying the tailnet identifier | medium | fix in tree and owner history decision. A tailnet name is a targeting aid, not a secret, and it should not outlive the need for it |
| P-07 | machine fingerprint | OS and kernel string in the same 9 files as P-05 | low | fix in tree, with P-05 |
| P-08 | machine fingerprint | GPU model in 11 files (`docs/HANDOFF.md`, 6 eval reports, `docs/research/local-ai-efficiency-2026-09-22.md`, `docs/eval-reports/2026-09-23-train-*.md`) and CPU model in 6 files | low | owner decision: keep (needed to reproduce the measurements) or generalise to "the reference machine" |
| P-09 | machine fingerprint | `config/recovery/current-linux.json` — Ollama and whisper **binary** SHA-256, weights-blob hash, Ollama list id, model tag, port. The file says so itself: the observed executable hashes identify this machine | low | owner decision: keep for recovery fidelity, or trim the executable hashes before publishing and note the loss |
| P-10 | third-party identifier | `docs/reference/MSE examples.pdf` — an `/Author` value (5 characters, a third party; not the commit author) and a 2023 creation date in the PDF metadata | low | owner decision: keep, or strip the metadata when the file is next replaced (the README already pins a SHA-256 per file) |
| P-11 | personal identifier | nothing found: no personal email address in any tracked file. Live-looking addresses in the tree are npm maintainer addresses in the generated `THIRD-PARTY-LICENSES.md`, one in a font licence, a `mailto:` link in `prototype/index.html`, and one package-name-and-version-shaped string in a research doc | none | keep |
| O-01 | owner-authored | `docs/feedback/` — 4 owner answer files and one HTML (35 KB), including `2026-08-25-owner-style-source.md`: a distillation of the owner's own clinical writing style and skill, explicitly decontaminated (her name stripped, a fictional client used throughout) | low | owner decision. Defensible to keep — it is style, not patient data — but it is the most sensitive non-patient document here |
| O-02 | owner-authored | `docs/note-instructions/` — 5 files, the instruction text the app ships, the same decontaminated distillation; plus 3 proposed decontaminated texts in `docs/eval-reports/2026-09-22-decontam/` | low | keep |
| O-03 | owner-authored | `docs/eval-reports/` — 34 files of owner-run measurements. `2026-09-23-owner-voice-test1.md` states the retained fixture is her own voice (kept outside the repository) and quotes what she said while reading a fictional script | low | owner decision. Biometric-adjacent and a direct quote, but of a fictional script; no audio is committed |
| O-04 | owner-authored | `docs/eval-reports/2026-09-22-claude-export-probe.md` — verified shape-only: keys, counts, roles, length statistics, date ranges. No conversation title, name, message text or attachment name. It is the one document that touches the real export, and it says what it ran | low | keep the content; fix line 16 with P-03 |
| O-05 | owner-authored | `docs/research/mexico-clinical-records-2026-08.md`, `docs/research/es-mx-*` — jurisdiction research that states its own provenance and asserts no patient material | none | keep |
| D-01 | patient-derived | nothing found. All 47 transcript fixtures under `e2e/fixtures/{eval,eval-owner,eval-prior,her-format}` open with fabricated names (11 distinct, from the prototype sample set or plainly invented); `e2e/fixtures/claude-export/` and `e2e/fixtures/halaxy/` are synthetic; no real client name, transcript, or note text anywhere | none | keep |
| D-02 | patient-derived | `e2e/fixtures/audio/dictation-10s.wav` (312 KB, `c9435af`) — a tone sequence with no speech; its README documents the provenance, and the fake STT provider never reads it | none | keep |
| D-03 | patient-derived | `e2e/screenshots/workspace-1280x800.png` — 7 versions in history. The current file, the largest and the oldest were extracted and inspected: synthetic e2e data only | none | keep |
| D-04 | patient-derived | `docs/assets/readme/` — 20 GIFs and 42 PNGs across history; `hero.png` inspected: the prototype's sample practice | none | keep |
| D-05 | patient-derived | `scripts/model-comparison/results/*.jsonl` — 240 records in `records.jsonl` over the 20 synthetic eval fixtures, outputs are synthetic drafts; see P-05 for the host metadata in the same files | none (content) | keep |
| D-06 | patient-derived | `docs/reference/` — 3 clinical reference PDFs (0.55 MB) that the repository README describes as the owner's publicly available guides, with no client information and hashes recorded per file | low | owner decision: confirm the right to redistribute before publishing (see L-03) |
| D-07 | patient-derived | the control that keeps this true: `.gitignore` excludes `.env`, `data/`, `*.db`, `*.sqlite*`, `apunta-backup-*.zip`, `eval-report.md`, `*.jsonl`, `*.gguf`, `*.safetensors` and `tools/model-lab/**`; `tools/model-lab/pipeline/run-consented.sh` refuses to read an export inside the repository and writes outside it | none | keep — re-check it stays in place at the moment of publishing |
| A-01 | agent trace | `.claude/settings.json` and `.claude/hooks/apply-stop-hook-grace.sh` — a Stop-hook patch that references `$HOME` only; no secrets, no machine identity | none | keep or drop; it is tooling trivia either way |
| A-02 | agent trace | the coordination trail: `CLAUDE.md`, `docs/agents/` (13 packets), `docs/dev-notes/`, `docs/v2/state/` (72 files: cards, dispatch, reviews, checkpoints, `HARNESS.md`), `docs/v2/evidence/` — 214 files under `docs/v2` in all. It reveals the working method, the owner's preferences and her clinical judgement criteria | low | keep the method; fix the three identifier lines inside it (`HARNESS.md:11`, `evidence/P0.4/environment-probe.md:4`, `cards/P5.4.md:33`) |
| A-03 | agent trace | `<user-4>` / `<email-2>` — the coding agent authored 106 commits under its own identity | low | keep, or fold into the P-01 rewrite |
| B-01 | large binary | nothing above 5 MB. Largest distinct blobs: `scripts/model-comparison/results/records.jsonl` 1.44 MB, `docs/assets/readme/feature-01-mobile.gif` 1.18 MB, `feature-03-mobile.gif` 0.98 and 0.99 MB, `feature-05.gif` 0.54 MB, `docs/v2/assets/Kalam-Regular.ttf` 0.42 MB, `e2e/fixtures/audio/dictation-10s.wav` 0.31 MB, `docs/reference/*.pdf` 0.09–0.23 MB each | none | keep. 2 584 distinct blobs, 47.6 MB of content, 13.36 MiB packed — a public clone is a few tens of megabytes, which is unremarkable |
| L-01 | licence | `package.json`: `license: UNLICENSED`, `private: true`. No `LICENSE`, `LICENCE` or `COPYING` file in the tree **or in any of the 388 commits**. `README.md` §License and status: pre-release, private, no permission to redistribute | — | **owner decision, and the gating one.** `UNLICENSED` with no licence file means all rights reserved: a valid choice for source-available code, but it should be a decision taken for the public state, not inherited from the private one |
| L-02 | licence | `THIRD-PARTY-LICENSES.md` (211 KB, generated, `npm run licenses`; `npm run lint` fails when stale or on a copyleft dependency) and `docs/v2/DEPENDENCIES.md` | low | keep. Confirm the bundled-app position, not just the repository's |
| L-03 | licence | third-party material redistributed rather than depended on: the 3 reference PDFs (D-06) and `docs/v2/assets/Kalam-OFL.txt` + `web/public/fonts/inter-*.woff2` (SIL OFL, licence text present) | low | owner decision on the PDFs; the fonts are correctly attributed |
| L-04 | licence | model weights are **not** in the repository: the installer fetches them at setup from the pinned host allow-list with checksum enforcement (`installer/src/catalog.ts`, `config/recovery/current-linux.json` → `acquisition`, `docs/decisions.md`) | none | keep. This is the reason no multi-gigabyte blob appears in B-01 |

## The one thing that cannot be fixed in the tree

`<user-2>` is the account name in the clone URL (`README.md:158`,
`docs/RECOVERY.md:21,22`, `docs/v2/cards/P5.4.md:33`) **and** the user component
of every home path. Making the repository public necessarily publishes the
account name. That is fine on its own; the exposure is the *linkage* — the same
string identifies the GitHub account, the Linux account, and the directories the
work happened in. Removing the home paths (P-02, P-03, P-04) is therefore worth
doing on its own merits, and it is what breaks the linkage, not the URL.

Everything else in the table with an identifier in it is a line edit in a
Markdown or JSON file, except the eight `*.jsonl` result files, where the fix
belongs in `scripts/model-comparison/runner.ts` (write a placeholder host) so
the next run does not reintroduce it.

## History cleanup plan — **OWNER ONLY**

Nothing in this section may be executed by an agent. HS-4 forbids history
rewrites and force-pushes, HS-10 reserves visibility changes for the owner, and
`docs/v2/DECISIONS.md` D3 assigns the rewrite decision to the owner. This is a
plan to be read, approved or rejected, not run.

1. **Revoke first, rewrite second.** No credential was found (S-01), so there is
   nothing to rotate. If the owner's own review finds one this audit's patterns
   missed, removal from history is not sufficient — the value must be revoked or
   rotated, and only then removed.
2. **Decide what the public history should say about identity.** Three options,
   in increasing order of work: (a) publish as-is and accept that
   `<user-1>`/`<email-1>` are public on 270 commits; (b) rewrite author and
   committer to a single pseudonym, keeping messages, dates and content;
   (c) squash to a small number of clean commits. (a) is a legitimate choice
   for a solo project; (b) and (c) cost every hash in the repository.
3. **If a rewrite is chosen, do it on a fresh clone**, never on the working
   repository: `git clone --mirror`, install `git-filter-repo`, then
   `--mailmap` for the identity decision and `--replace-text` for the literal
   strings in P-02 through P-06, then verify with a re-run of this card's
   captures before publishing anything.
4. **Expect every hash to change.** 388 commits, 3 refs. Anyone with a clone
   must re-clone; open PRs and issue references to commits break; tags would
   need re-creating (there are none today). A force-push is required and only
   the owner may do it.
5. **Sequence:** finish the tree fixes (P-02 to P-07) and land them first, so the
   rewrite has less to strip; then rewrite; then re-run P7a.1's captures against
   the rewritten clone; then flip visibility.
6. **Keep the raw captures.** `~/.local/state/apunta-v2-audit/` is the evidence
   for this report and the input to step 3. It stays mode `700` and outside the
   repository. If the machine is reimaged, the report is still valid but the
   rewrite recipe needs the file list re-derived.

## What this audit did not do

- Did not change repository visibility, add a remote, or contact the forge.
- Did not open the live data directory, the owner's Claude export, or any
  Halaxy PDF (HS-1). The one document that describes the export was read
  because it is a committed report; the export itself was never touched.
- Did not fetch or read the three reference PDFs' contents — only their
  metadata, masked.
- Did not run a server, database or app; no port was contacted.
- Did not read the three clinical reference PDFs' clinical content, so D-06
  rests on the repository's own statement about them, not on this audit's
  inspection.

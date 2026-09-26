# Return: P7a.1 Sanitized public-repository audit

- Attempt: 1 of 3
- Base commit: 3855a73
- Final commit: **NOT RECORDED — nothing committed.** All of this attempt's
  work is uncommitted in the working tree for review, as the dispatch requires.
  The base check passed at the start of the session (`3855a73` on
  `feature/v2`); `feature/v2` then advanced by three background-agent commits
  during the run, which this card did not touch (deviation 5). No audit number
  depends on them.
- Sandbox run IDs used: none (L0 docs-only card; no server, database or app was
  launched and no port was contacted, so `scripts/v2/sandbox.mjs` was not
  needed)
- Session tools available (shell, file edit, network): shell yes, file edit yes
  (restricted to `docs/v2/PUBLIC-REPO-AUDIT.md` plus the dispatch-mandated
  evidence and return files), network not used — no page was fetched, and the
  repository was read through `git` and the filesystem only

## Changed paths

This attempt is **uncommitted**, so `git diff --name-only 3855a73..HEAD` is
empty. Working-tree changes relative to `3855a73` that are this card's:

- `docs/v2/PUBLIC-REPO-AUDIT.md` (new) — the sanitized report: redaction
  vocabulary, the findings table, the "cannot be fixed in the tree" note, the
  **OWNER ONLY** history-cleanup plan, and what the audit did not do
- `docs/v2/evidence/P7a.1/evidence.md` (new) — command log, method and its
  limits, the raw-capture inventory, and an explicit list of what was searched
  and found nothing
- `docs/v2/state/returns/P7a.1.md` (this file)

The raw `git` captures and the sanitized findings derived from them live in
`~/.local/state/apunta-v2-audit/` (mode `700`), outside the repository. No raw
result was printed to the console or written into a repository file, and no
discovered value appears in either file above.

Also modified in the working tree, **not** by this card and left alone
(coordinator state, plus the sibling card in flight):
`docs/v2/state/AMENDMENTS.md`, `docs/v2/state/dispatch/P7a.1-ir.md`,
`docs/v2/state/dispatch/S1.5-ir.md`, `docs/v2/state/reviews/P7a.1-ir.md`,
`docs/v2/state/reviews/S1.5-ir.md`, and untracked
`docs/v2/state/dispatch/P7a.1.md`, `docs/v2/state/dispatch/S1.5.md`.

## Criteria

| ID | Status | Exit code | Evidence path | Note |
| --- | --- | --- | --- | --- |
| V1 | PASS | 0 | `docs/v2/evidence/P7a.1/evidence.md` | `npx prettier --check docs/v2/PUBLIC-REPO-AUDIT.md` → "All matched files use Prettier code style!" |
| V2 | PASS | 1 (no matches, as expected) | `docs/v2/evidence/P7a.1/evidence.md` | `grep -nE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}' docs/v2/PUBLIC-REPO-AUDIT.md` printed nothing. Re-checked independently for the literal home path, the bare account name, the machine hostname, the tailnet name, the owner's name and the owner's address: **none present** in the report or the evidence file |
| V3 | PASS | 0 | `docs/v2/evidence/P7a.1/evidence.md` | `stat -c %a ~/.local/state/apunta-v2-audit` → `700`, at creation and again after the last capture |
| V4 | PASS | — | `docs/v2/PUBLIC-REPO-AUDIT.md` | All 7 method steps reported, each with a finding or an explicit "nothing found": secrets S-01…S-04, personal identifiers P-01…P-11, owner-authored material O-01…O-05, patient-derived D-01…D-07, agent traces A-01…A-03, large binaries B-01, licence L-01…L-04 |
| L0-a | PASS | 0 | `docs/v2/evidence/P7a.1/evidence.md` | `node scripts/check-no-external-urls.mjs` — the L0 row from the run configuration, not a card criterion |
| L0-b | PASS | 0 | — | `npx prettier --check` on the card's changed file, per V1 |

## Headline result

- **No secret of any kind** — no key, token, password, `.env`, private key,
  auth header, cloud credential or remote-URL credential — in the tree or in any
  of the 388 commits. The only secret-shaped values are pinned model checksums
  (public by design) and four hardcoded literals inside unit tests, each used
  only by its own test.
- **No patient-derived content.** All 47 transcript fixtures use fabricated
  names; the audio fixture contains no speech; the committed screenshots and
  README images show sample data; the model-comparison records are outputs over
  synthetic fixtures. `.gitignore` and `run-consented.sh` are the controls that
  keep it that way.
- **The real exposure is identity, not data**: the owner's name and personal
  mailbox on 270 of 388 commits as commit metadata (zero occurrences in any
  file), plus a literal home path in 10 files, the machine hostname in 9, the
  account name in 16, and one Tailscale tailnet name in 1. Every one of those
  is a line edit except the commit metadata.
- **The gating question is not privacy but licence**: `UNLICENSED` with no
  `LICENSE` file in the tree or in any commit. That is the owner's decision
  (D3), and it should be taken for the public state rather than inherited.

## Acquisitions

none — nothing was downloaded, and no model, tool or dependency was added.

## Deviations

1. **Additional captures beyond the four named in `Read`.** The card names four
   commands; the same audit needs the object sizes, the per-commit file lists,
   the deleted-file list and the branch/tag/remote state, so those were also
   redirected into the same mode-700 folder on the same terms. No raw result
   left it.
2. **A field-separated second copy of the identity capture.** The mandated
   `git log --format='%an %ae %cn %ce'` uses spaces, which cannot be parsed when
   a name contains a space (5 of 388 lines have 5 or 6 fields). The mandated
   file was still written exactly as specified; a second capture with a
   separator was added alongside it and is what the identity analysis used.
3. **Scripts kept outside the repository**, in `/tmp/opencode/`, rather than
   committed under `docs/`. The card's May-edit list does not include a
   directory for them, and a reviewer can re-run the captures without them.
4. **The first identity summary run failed** (a 5-field parse) and was re-run
   correctly; the failure and the correction are both in the evidence log.
5. **HEAD advanced mid-session, by a background agent, not by this card.** The
   base check passed at the start (`3855a73`, branch `feature/v2`). While the
   audit ran, three more commits landed on `feature/v2`
   (`Record card S1.5 APPROVED`, `Record S1.4 APPROVED…`, and the S1.5 research
   commit). Every one of the eleven files they touched was checked against every
   identifier pattern in this audit and none matched, so no finding moves. Per
   the background-agent rule in `CLAUDE.md` those commits were left alone, not
   re-audited into a moving target, and nothing of theirs was modified or
   committed. All counts in the report are anchored to the base commit: 388
   commits reachable from `3855a73`, of which 270 are the owner's.

None of these changes what the app does; no behaviour is affected, so no status
is BLOCKED.

## Unresolved items

1. **Owner decision (blocking for D3):** publish with the current commit
   identity, rewrite author/committer to a pseudonym, or squash. The plan is in
   the report's **OWNER ONLY** section; nothing in it may be run by an agent.
2. **Owner decision:** whether the three clinical reference PDFs may be
   redistributed. This audit read only their (masked) metadata and relies on
   `docs/reference/README.md` for the "no client information" claim — it did not
   read their clinical content.
3. **Owner decision:** whether to strip the machine-identifying executable
   hashes from `config/recovery/current-linux.json` before publishing, at the
   cost of exact recovery verification.
4. **Owner decision:** the four hardcoded test literals in the backup and
   extract tests. HS-5's wording ("test keys live only inside a sandbox run
   folder") is stricter than the code, which keeps them in committed unit tests.
5. **Not answerable by this card:** whether the owner's real per-machine home
   directories, GPU/CPU strings and tailnet name are acceptable to keep. They
   are reported with locations, not judged.
6. **Refresh needed after v2 lands** (`docs/v2/TRACEABILITY.md` R18): this audit
   describes commit `3855a73`. Re-run the captures after the v2 work merges and
   before visibility is flipped.

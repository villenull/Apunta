# P4.5 — evidence

Probe evidence integrity: the write precondition and complete redaction.
Implementation attempt 1, base `6bfdcac`. Every row below ran on this box with
`node v24.19.0` (the export the row itself carries; the box default is outside
the repository's `engines` range).

**The probe was run zero times.** No row in this directory issued a network
request, contacted port 7717, opened a database, or started a server. All
fixtures are fabricated (HS-8) and every URL in the suite is derived from the
catalogue's own pinned address at run time, or is a relative reference no URL
parser accepts.

| File | What it records | Exit |
| --- | --- | --- |
| `step1-tests-first.md` | the eleven new cases against the **unmodified** probe, which is the card's Step 1 | 1 (expected) |
| `v1-suite.md` | V1, the 29-case offline suite with its two builds | 0 |
| `v2-lint-typecheck.md` | V2, `npm run lint` and `npm run typecheck` | 0 |
| `v3-negative-control.md` | V3, the negative control: the unfixed probe with DEF-2's own one-character mutation | 1 (this row's pass) |
| `residual-path-not-redacted.md` | the residual Fixed decision 6 accepts, and the plan-editor action it would need | n/a |

`docs/v2/evidence/P4.1/redirects.md` was **inspected read-only and is
unmodified**: `git status --porcelain docs/v2/evidence/P4.1/` is empty and its
SHA-256 is `569ddd99…114`, byte-identical to the committed blob at `6bfdcac`. V3
is the only row that wrote it, transiently, and restored it inside the same
command with a `sha256sum -c` that printed `OK` for both files.

**Not answered here.** This card does not answer the open RUN-CONFIG §4
question of whether the hostname bar covers public vendor CDN names. It does not
widen §4, does not need it, and no evidence here should be read as a ruling. The
one place it mattered is recorded in `v3-negative-control.md`: V3's raw output
carries the catalogue host on seven `HEAD` lines, so the evidence quotes the
per-case pass/fail lines and the counts rather than the assertion diffs.

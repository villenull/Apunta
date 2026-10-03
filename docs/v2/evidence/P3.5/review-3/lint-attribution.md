# Repo-wide lint — attributed, not waived (review-3)

Measured on the committed tree at HEAD `39c6723` (the commit that carries the
candidate source `7e16513` unchanged) by exporting `git archive HEAD` and running
`npx eslint . -f json` there. Exit 1, **16 errors**:

| File | `no-console` | `@typescript-eslint/no-unused-vars` |
| --- | --- | --- |
| `docs/v2/evidence/P3.4/proposal-v5-repair/ir5-counterexamples.mjs` | 0 | 1 |
| `docs/v2/evidence/P3.5/review-1/source-outputs-mapping.mjs` | 9 | 1 |
| `docs/v2/evidence/P3.5/review-1/stale-rectangle.mjs` | 5 | 0 |
| **Total** | **14** | **2** |

Every one is in a file the candidate `7e16513` did **not** change. The
candidate's own paths are clean: scoped `npx eslint` on the harness, the
attempt-3 verify script and the review-3 scripts exits 0.

This is the "remaining 16" that `39c6723` (*Preserve proof output while fixing
evidence console lint*) left for a separate repair. It is **root-level evidence
cleanup, outside this card's grant and outside this review's writes**: attributed
here, not waived, and not repaired. The repo-wide definition of done is therefore
not green on this card's own account.

## What this review deliberately did not do

- It did not run `npx eslint .` on the live working tree. At review time that
  tree carried another agent's in-flight output-lint repair
  (`docs/v2/evidence/output-lint-completion/` untracked; modified
  `docs/v2/evidence/P3.4/proposal-v5-repair/ir5-counterexamples.mjs` and
  `docs/v2/evidence/P3.5/review-1/{source-outputs-mapping,stale-rectangle}.mjs`)
  plus a scratch tree `docs/build/evidence-lint-completion/…`; a live run showed
  10 errors all in that scratch, which is that agent's half-written state, not
  the committed tree. Nothing in that tree was touched.
- It did not require any old proof hash to be current. The candidate's own
  durable outputs were reproduced byte-for-byte (`reproduce-outputs.md`); the
  historical proof files are records, not moving targets, and are left as they
  are (the separate repair is rewriting their output formatting, not their
  findings).

# P3.5 review-3 — commands, exits, and what each proves

Candidate `7e16513` (*Reject missing coordinates in final P3.5 parser repair*),
baseline `9e6094b`. Reviewer: fresh independent implementation reviewer,
review-3. Pinned Node is
`~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node` (prints
`v24.19.0`). Working tree HEAD at review time `39c6723`.

No app, server, database, build, LLM, model, audio, microphone, display, input,
`pactl` mutation, network, acquisition, install, live folder or port 7717 was
used. The only reads are repository files and the two committed git objects
`9e6094b` and `7e16513`; scratch is git-ignored `build/p3.5-review3/`.

| # | Command (cwd: repo root) | Exit | Proves |
| --- | --- | --- | --- |
| 1 | `$NODE --version` | 0 | `v24.19.0`, the pinned interpreter |
| 2 | `$NODE --check scripts/v2/tauri-audio.test.mjs` | 0 | the candidate source parses under the pinned Node |
| 3 | `git diff --name-only 9e6094b..7e16513 \| grep -v '^docs/'` | 0 | only `scripts/v2/tauri-audio.test.mjs` is non-doc in the range |
| 4 | `git diff --name-only 9e6094b..7e16513 -- web/ src-tauri/ shared/ server/` | 0, empty | the three feature paths and `server/`/`shared/` are untouched |
| 5 | `$NODE docs/v2/evidence/P3.5/review-3/scope-check.mjs scripts/v2/tauri-audio.test.mjs build/p3.5-review3/old-harness.mjs` | 1 (diff found) | exactly one of 54 top-level function bodies changed: `tidsFromNewestMarker` |
| 6 | `$NODE docs/v2/evidence/P3.5/attempt-3/repair-verify.mjs` | 0 | **67/67**, the candidate's own pure suite against the current source |
| 7 | `$NODE build/p3.5-review3/prefix-check/repair-verify.mjs` (harness = `git show 9e6094b:`) | 1 | **58/67**, the same suite against the pre-fix source |
| 8 | `$NODE docs/v2/evidence/P3.5/review-3/independent-probes.mjs` | 0 | **86/86** independent adversarial probes against the current source |
| 9 | `$NODE build/p3.5-review3/prefix-check/independent-probes.mjs` (harness = `git show 9e6094b:`) | 1 | **65/86**, 21 failures, all in the missing/empty/whitespace/null/fallback shapes |
| 10 | `$NODE docs/v2/evidence/P3.5/review-2/d2-current-rectangles.mjs` | 1 | **20/22**, exactly the two bug-asserting ADVERSARIAL probes fail |
| 11 | `REVIEW_SOURCE=build/p3.5-review3/prefix-check/scripts/v2/tauri-audio.test.mjs $NODE docs/v2/evidence/P3.5/review-2/d2-current-rectangles.mjs` | 0 | **22/22** against the pre-fix source — the regression witness |
| 12 | `diff` of each regenerated output against the attempt-3 durable copy | 0 | all four are **byte-identical** (`reproduce-outputs.md`) |
| 13 | `npx eslint scripts/v2/tauri-audio.test.mjs docs/v2/evidence/P3.5/attempt-3/repair-verify.mjs docs/v2/evidence/P3.5/review-2/d2-current-rectangles.mjs docs/v2/evidence/P3.5/review-2/extract.mjs docs/v2/evidence/P3.5/review-3/independent-probes.mjs docs/v2/evidence/P3.5/review-3/scope-check.mjs` | 0 | candidate-changed and review-3 source is lint-clean |
| 14 | `npx prettier --check` on the candidate-changed files | 0 | formatting clean |
| 15 | `npm run typecheck` | 0 | all workspaces typecheck (no TypeScript changed; run to confirm) |
| 16 | `git diff --check 9e6094b..7e16513 -- scripts/v2/tauri-audio.test.mjs` | 0 | the source diff has no whitespace faults |
| 17 | `git show 7e16513 --check` | 2 | one cosmetic `new blank line at EOF` in appended evidence text (observation, not source) |
| 18 | `git archive HEAD \| tar -x -C /tmp/opencode/p35-committed && (cd … && npx eslint . -f json)` | 1 | committed HEAD `39c6723` global lint = **16 errors**, all in P3.4 proposal-v5-repair and P3.5 review-1 old proofs |

The regenerated `build/p3.5-review3/*.txt` are scratch; the durable byte-identity
record is `reproduce-outputs.md`.

## Why `npx eslint .` was measured on an archive, not the live tree

At review time the live working tree was dirty from a **different** agent's
in-flight repair of the old proof output (`docs/v2/evidence/output-lint-completion/`
untracked, plus modified `docs/v2/evidence/P3.4/proposal-v5-repair/ir5-counterexamples.mjs`
and `docs/v2/evidence/P3.5/review-1/*.mjs`), and a scratch tree
`docs/build/evidence-lint-completion/…` was present. Measuring the live tree would
have described that agent's half-written state. Instead the committed tree was
exported with `git archive HEAD` to `/tmp/opencode/p35-committed` (root
`node_modules` symlinked) and linted there, so the count is a measurement of
`39c6723` itself. The live tree was not touched, staged, stashed or committed.

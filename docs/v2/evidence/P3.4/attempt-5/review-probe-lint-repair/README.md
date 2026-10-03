# review-probe-lint-repair — bounded evidence-format cleanup of the attempt-5 review probe

Nothing here is an acceptance row and nothing here is authority. This is a separate,
reversible evidence-format cleanup performed so future P3.5 work starts from a
lint-clean probe. It is **not** a source correction and **not** a waiver: no source
file was edited, no assertion, fixture, budget, control flow, verdict or status was
changed, and the P3.4 final runtime V4 result (FAIL, once, on the old review-probe
lint) is left exactly as it stands — **not rerun, no attempt 6**.

Scope of writes (exclusive):

- `docs/v2/evidence/P3.4/attempt-5/review/03-independent-integration-probe.mjs` (edited in place)
- `docs/v2/evidence/P3.4/attempt-5/review-probe-lint-repair/**` (this report)
- `scratchbuild/p34-review-probe-lint/` (untracked scratch: BEFORE snapshot, run captures, scratch copy)

No app, build, server, database, model, audio, microphone, input, display, pactl,
download, install or network was used; port 7717 was never contacted. Everything ran
on pinned Node v24.19.0 (`/home/villenull/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node`).
The only child process was the probe's own synthetic `node -e` spawner. Nothing was
staged, committed or pushed. The original review reports and historical hashes were
not modified; the root P3.4 worker's concurrent finishing evidence
(`docs/v2/state/returns/P3.4.md`, untracked `runtime/`) was left untouched — no file
conflict, different scope.

## What was wrong

The durable probe carried the 4 eslint errors that the P3.4 final runtime V4 failed
on: unused imported specifier `frameFrom` (line 10), unused pure arrow `factLine`
(line 42), and two `console.log` calls (lines 22, 165) under the repo's `no-console`
rule (`console.warn`/`error` only).

## What was done (one cleanup pass)

1. Snapshotted the probe byte-preserved; recorded probe + harness hashes.
2. Proved `frameFrom` and `factLine` have zero references outside their own
   import/definition, and that the harness still exports `frameFrom`
   (scripts/v2/tauri-security.test.mjs:2450) so removing the specifier is safe.
3. Ran the probe BEFORE the edit, in place, on the same shipping source.
4. Removed only: the dead `frameFrom` import specifier and the dead `factLine`
   function definition. Replaced the two `console.log` output calls with
   `process.stdout.write(format('%s', …) + '\n')` (`node:util`), preserving args,
   format, control flow, verdict and status. Corrected the header comment's
   inaccurate "(scratch, ignored)" wording (the file is durable evidence).
5. Built the scratch copy: identical to the cleaned durable file except the import
   path, repointed to the actual shipped harness (sha256 `865ccab3…`) so it
   resolves from `scratchbuild/p34-review-probe-lint/`.
6. Ran AFTER (durable, in place) and the scratch copy: statuses and outputs
   byte-exact against BEFORE (sha256 `bbc286f9…`), exit 0, empty stderr.
7. Scoped eslint + `node --check` on both copies: exit 0. Prettier: repo config is
   non-vacuous and tracked; the probe's pre-existing format issues are recorded,
   **not reformatted** (whole-source proof reformat avoided by instruction).

## Files

| File | What it shows |
| --- | --- |
| `00-scope-and-authority.txt` | role, grant, write list, constraints honored |
| `01-before-snapshot-and-hashes.txt` | BEFORE snapshot `e41e73aa…`; harness `865ccab3…`; HEAD preservation proof |
| `02-dead-code-zero-ref-proof.txt` | `frameFrom`/`factLine` 0-ref proof; harness export proof |
| `03-cleanup-edit-diff.txt` | the exact applied diff; what was NOT touched |
| `04-before-after-output-fidelity.txt` | commands, exits, wall times, byte-exact output hashes |
| `05-scratch-copy-import-repoint.txt` | scratch copy identity; only-path diff; resolution proof |
| `06-lint-syntax-format.txt` | eslint / `node --check` exits; prettier vacuity analysis + non-vacuity controls; recorded format issues |
| `07-proof-preservation.txt` | review reports + historical hashes untouched; git scope; concurrent worker write noted |

## Reproduce

```bash
export PATH=/home/villenull/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH
cd /home/villenull/Projects/Apunta

# BEFORE snapshot is byte-preserved; the committed original is in git history
git show HEAD:docs/v2/evidence/P3.4/attempt-5/review/03-independent-integration-probe.mjs | sha256sum
#   e41e73aaaf53658a4959d448898a2907fe9d441716539266b03cbb9841bd4329

# AFTER run (durable, in place) — byte-exact vs BEFORE capture
node docs/v2/evidence/P3.4/attempt-5/review/03-independent-integration-probe.mjs

# scratch copy run — byte-exact vs BEFORE capture, repointed import resolves
cd scratchbuild/p34-review-probe-lint && node 03-independent-integration-probe.scratch.mjs && cd ../..

# scoped lint + syntax (both copies)
npx eslint docs/v2/evidence/P3.4/attempt-5/review/03-independent-integration-probe.mjs \
            scratchbuild/p34-review-probe-lint/03-independent-integration-probe.scratch.mjs
node --check docs/v2/evidence/P3.4/attempt-5/review/03-independent-integration-probe.mjs
node --check scratchbuild/p34-review-probe-lint/03-independent-integration-probe.scratch.mjs
```

# P3.5 client-sentinel proposal — package repair

Artifact-only repair of the author's package, against
`docs/v2/state/reviews/P3.5-client-sentinel-proposal-ir.md` (IR-1, IR-2, IR-3, and
minor IR-4), plus root's later bounded grant for the IR proof's output calls.
**No runtime, no source edit, no attempt 4.** The shipping source
`scripts/v2/tauri-audio.test.mjs` is unchanged at
`b886f8bbc7006765a50911874f3188a79e4235a26863c419b41a24adb8931cdb`.

## What was written

| file | what it records |
| --- | --- |
| `ir1-candidate-patch.txt` | `candidate.patch` is byte-identical to the reviewer's `actual-source.patch`; headers/hunk now name the shipping file |
| `ir1-replay-and-lint.txt` | replay onto a fresh shipping copy: `85fbb13d…`, `node --check` 0, `prettier` 0, `eslint` 0 with the real filepath, one function, one hunk, source still `b886f8bb…` |
| `ir2-lint-fixes.txt` | the three bounded lint remedies and the full diff of the proof |
| `proof-rerun-75.txt` | the 75 cases re-run; stdout byte-identical to the committed `sentinel-proof-output.txt` |
| `proof-before-after.txt` | BEFORE (`29d36ac`) vs AFTER: stdout, stderr and exit compared exactly |
| `adversarial-output-repair.txt` | the IR proof's 6 `no-console` calls repaired; 19/19 both sides, byte-identical stdout/stderr, exit 0 |
| `ir3-anchors-and-ir4-offsets.txt` | exactly three attempt-4 anchors; the swapped source index/name offsets |
| `final-lint.txt` | eslint / prettier / `node --check` on the changed files, with the scope caveat |
| `source-unchanged.txt` | the shipping source hash, and the full change list |
| `README.md` | this file |

Also changed, outside this directory: the author's family under
`client-sentinel-proposal/` and the proposal itself. The reviewer report and every
other artefact under `client-sentinel-proposal-ir/` are untouched except
`adversarial-checks.mjs`, and only in its six output calls.

## Lint accounting — read this, do not read "green" as global

The review's 13 errors were **all in the author's family**: 1 unused function
(`candidate-after.mjs`), 9 `no-console`, 3 unused destructured bindings. Root's
qualifier separately found **6 more, all `no-console`, in the IR's
`adversarial-checks.mjs`** — a different file, in the reviewer's directory, not
the author's. So 19 errors across two files in two directories, not 13.

After this repair:

- `eslint docs/v2/evidence/P3.5/client-sentinel-proposal/` → exit 0
- `eslint docs/v2/evidence/P3.5/client-sentinel-proposal-ir/adversarial-checks.mjs`
  → exit 0
- `prettier --check` and `node --check` on both runnable `.mjs` files → exit 0

**No claim is made about `eslint .` over the whole repository.** Other files were
not examined; this repair makes no statement about them. The 19 errors above are
the only ones this repair addresses, and root integrated the qualifier's finding
separately.

## Limits — stated, not papered over

1. `candidate-after.mjs.txt` is a **text witness**, renamed from
   `candidate-after.mjs` with byte-identical content (`e0a01c00…`). The proof
   reads it as text and evaluates it with `new Function`; that is why the
   extension changed and the bytes did not.
2. The IR's `adversarial-checks.mjs` still **reads the old baseline name**
   `docs/v2/evidence/P3.5/client-sentinel-proposal/candidate-after.mjs` and the
   reviewer's scratch replay path. That was deliberate — root's option to preserve
   the original IR artefact referring the old baseline — so its run is reproduced
   against a snapshot of the `29d36ac` bytes in ignored scratch. It will not run
   from the repository root now that the file is renamed. Its checks were not
   loosened; nothing was made to pass that was not passing.
3. Whether `8035` (V3) and `8114` (V4) are present in a live
   `pactl list short sources` on a capture row is still **unverified**. That needs
   a live read this package may not take. If either is absent, the patched
   function stops at the existing unknown-source guard: still fail-closed.
4. No tone, silence, ASR or word-level claim is made or approved. V4's silence arm
   and all word-level work remain deferred.
5. **No attempt 4 is authorised.** AM-190's no-attempt-4 boundary stands. The root
   has not asked the owner and has not been granted anything; §6 option A is a
   proposal for the owner to decide, and option B is to park.

## Commands, all local and offline

```
patch -p1                      # replay, in ignored scratch only
node --check <file>
npx prettier --check --stdin-filepath scripts/v2/tauri-audio.test.mjs < <replay>
npx eslint --stdin --stdin-filename scripts/v2/tauri-audio.test.mjs < <replay>
npx eslint <evidence dir or file>
npx prettier --check <file>
node <proof>                   # synthetic, no harness edit, no runtime
sha256sum, cmp, diff, git show, git check-ignore, git status
```

Scratch: `build/p35-client-package-repair/`, git-ignored
(`git check-ignore -v` → `.gitignore:55:build/`). No app, build, model, database,
audio, microphone, input, display, live `pactl`, network, install or port 7717 was
used at any point.
# P3.5 client-sentinel proposal — IR-2 evidence

Independent, read-only re-verification of the repaired package at `ce293ed`
(shipping source `scripts/v2/tauri-audio.test.mjs` still
`b886f8bbc7006765a50911874f3188a79e4235a26863c419b41a24adb8931cdb`, candidate
`7e16513`). Companion to `docs/v2/state/reviews/P3.5-client-sentinel-proposal-ir2.md`.

No author artefact, source, card, checkpoint, contract, tool, config, manifest or
Expected cell was edited. Nothing was staged or committed. Scratch is the
git-ignored `build/p35-client-proposal-ir2/`
(`git check-ignore -v` → `.gitignore:55:build/`). No app, server, build, database,
model, audio, microphone, input, display, live `pactl`, network, install or port
7717 was used.

## Files

| file | what it records |
| --- | --- |
| `source-and-patch.txt` | shipping hash; `candidate.patch` byte-identical to the reviewed `actual-source.patch` (both `4350f5ec…`); headers `a/`/`b/scripts/v2/tauri-audio.test.mjs`, one hunk `@@ -306,8 +306,13 @@` |
| `replay-and-lint.txt` | fresh baseline `b886f8bb…`; `patch -p1` applies (exit 0); replay `85fbb13d…`; `node --check` 0; `prettier` real-filepath 0; `eslint` real-filepath 0; one hunk, 2 removed / 7 added; source still `b886f8bb…` |
| `independent-adversarial.mjs` + `independent-adversarial-output.txt` | reviewer's own extraction-based checker (not the author's, not the IR's): 35/35 pass, exit 0 |
| `proof-rerun-stdout.txt` | the author's 75-case proof re-run, exit 0, byte-identical to the committed `sentinel-proof-output.txt` (`d7473bc9…`) |
| `author-before-after-and-75-rerun.txt` | 29d36ac BEFORE vs ce293ed AFTER: stdout/stderr byte-identical, both exit 0, both `d7473bc9…` |
| `ir-snapshot-before-after.txt` | preserved 19-case IR proof in its documented snapshot: BEFORE vs AFTER stdout/stderr byte-identical, both exit 0, both `4a363533…`, 19/19 |
| `ir-snapshot-before-stdout.txt` / `ir-snapshot-after-stdout.txt` | the two 19-case runs, verbatim |
| `author-before-stdout.txt` / `author-after-stdout.txt` | the two 75-case runs, verbatim |
| `lint-before-after.txt` | pre-repair 12 + 1 + 6 errors; post-repair eslint/prettier/node `--check` all 0; root `npx eslint .` exit 0, empty output |
| `proposal-criteria.txt` | proposal line count (161 logical lines vs the 160 cap), two options, three anchors, V5 read-only, no fifth/reset/retry/Expected relaxation, the `B. Spark` prose typo |
| `scope-and-qualification.txt` | IR script root-run stop (documented); raw-witness rename byte-identical; audit qualification retained and untouched |

## Key hashes as reviewed

```
b886f8bbc7006765a50911874f3188a79e4235a26863c419b41a24adb8931cdb  scripts/v2/tauri-audio.test.mjs
4350f5eca8764d7fc0f26eedf9fc6a814f19a05fea3a9813bf067203503ac198  client-sentinel-proposal/candidate.patch
4350f5eca8764d7fc0f26eedf9fc6a814f19a05fea3a9813bf067203503ac198  client-sentinel-proposal-ir/actual-source.patch
e0a01c008ea784afc3ea03609cd4e07f24c69b90615f78da0d422b558d9224e1  client-sentinel-proposal/candidate-after.mjs.txt (= 29d36ac .mjs, rename only)
d5f257cab032b625bb45a4f96636c0e4024a346b25f2c9f3956ea3b11037efa7  client-sentinel-proposal/sentinel-proof.mjs
026fea283ded988e6c452c2a1ce8463f81cd282fe89d52a82eb50ae3455bab25  client-sentinel-proposal-ir/adversarial-checks.mjs
d7473bc93483d50fe42cb4dcea8cef1ea42c6e2019f500d005f5b23d1fca0df8  client-sentinel-proposal/sentinel-proof-output.txt
798c92dd7cfa3e21b796614ba364fba6ca28a486c08bee4c6250a48e7cd4db16  client-sentinel-proposal-ir/adversarial-output.txt
cdd3a0e4738480efe96b95a5ed6350e8aea121d109fca8b03263004a11b2d31c  state/P3.5-CLIENT-SENTINEL-PROPOSAL.md
c88a9a92c00b9f541fbb193a93210c297495f18ea5c0eca0964aa8fda39ca709  state/reviews/P3.5-client-sentinel-proposal-ir.md
```

## Commands (all local and offline)

```
sha256sum, cmp, patch -p1, diff -U0
node --check, node <proof>
npx prettier --check [--stdin-filepath scripts/v2/tauri-audio.test.mjs]
npx eslint [--stdin --stdin-filename scripts/v2/tauri-audio.test.mjs] / npx eslint .
git show, git diff, git check-ignore, wc -l, awk 'END{print NR}'
```

`build/**` is eslint-ignored (`eslint.config.js:84`), so the scratch tree is not
linted by the root run.

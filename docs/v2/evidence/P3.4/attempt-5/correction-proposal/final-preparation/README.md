# final-preparation — mechanical cleanup and evidence for the P3.4 correction

**Nothing here is an acceptance row, and nothing here is authority.** No app, build,
server, database, model runtime, audio, input, display, download, install or network was
used; port 7717 was never contacted and the live data folder was never opened. Everything
ran on pinned Node **v24.19.0**. The only child processes were the probe's own local
`node -e` sleepers. **No acceptance row ran, no source file was edited, `02-patch.diff`
was not applied, nothing was staged, committed or pushed.** `b19e59f` and
`scripts/v2/tauri-security.test.mjs` (`fac8225f…`) are untouched.

This pass had **no source-repair authority**. The one owner decision in
`docs/v2/state/P3.4-PRE-RUNTIME-CORRECTION.md` §5 is untouched and **still open**.

## What was done

1. **The state document's prose** — four factual corrections, including the flatly false
   "Nothing was executed", and a wrong statement about which cards a decline blocks.
   Detail and verbatim before/after in `03-state-document-edits.md`.
2. **`review/probe.mjs`** — the durable reviewer probe failed the repo's own eslint with
   **11 errors** (10 × `no-console`, 1 × unused `tagForLabel`), because `docs/` is not in
   eslint's ignore list. Output now goes through `util.format` + `stdout.write` and the
   unused binding is gone. eslint **1 → 0**. Fidelity proof in `01-probe-fidelity.txt`.
3. **This directory** — the evidence for both.

`02-patch.diff`, every `review/*.txt` and `state/reviews/P3.4-correction.md` are
**historical bytes and were not edited**. The reviewer's verdict remains **CHANGES
REQUESTED**; nothing here rewrites it, and no review of the final text has run yet.

## Files

| File | What it shows |
| --- | --- |
| `00-baseline.txt` | git state, source hash vs `b19e59f`, proof-module hashes, the exact write list |
| `01-probe-fidelity.txt` | BEFORE/AFTER replay: exits, raw diff, normalisation rule and its exact limit, historical-output reproduction |
| `02-lint-format-syntax.txt` | eslint before/after, `node --check`, and all four prettier modes with exits |
| `03-state-document-edits.md` | the four prose corrections, verbatim before/after, and what was left alone |
| `04-scope-authority-and-limits.md` | authority, write scope, untouched files, known items, what the root does next |

## Reproduce

The two probes both read their proof modules **relative to the cwd**, so **the cwd must be
the directory holding those modules**. The historical `../README.md` repro block runs
`node build/p34-final-correction/probe.mjs` from the **repo root** and therefore cannot
work — demonstrated, not assumed:

```
$ cd /home/villenull/Projects/Apunta
$ node build/p34-final-correction/probe.mjs      # the shape ../README.md prints
Error: ENOENT: no such file or directory, open 'harness-original.mjs'
exit: 1                                            <- claims "ALL PASS, exit 0"
```

That block was **not** corrected on disk — historical bytes are retained. Here is the
working form, verified:

```bash
export PATH=~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH
cd /home/villenull/Projects/Apunta

# the AUTHOR's probe: cwd = its own scratch dir
( cd build/p34-final-correction && node probe.mjs )        # ALL PASS, exit 0

# the REVIEWER's durable probe: copy it next to the proof modules, then use THAT as cwd
mkdir -p build/p34-replay && cd build/p34-replay
cp ../../docs/v2/evidence/P3.4/attempt-5/correction-proposal/review/probe.mjs ./probe.mjs
cp ../p34-correction-ir/shipped-proof.mjs ../p34-correction-ir/patched-proof.mjs .
node probe.mjs                                            # ALL PASS, exit 0
```

The two proof modules must be the reviewer's own scratch copies —
`build/p34-correction-ir/shipped-proof.mjs` (`5a5272c5…`) and `patched-proof.mjs`
(`145484f1…`) — byte-identical to what `review/07-probe-output.txt` was produced against.
Do not rebuild them: `patched-proof.mjs` is `b19e59f` plus `02-patch.diff` plus a
proof-only export footer.

Scoped checks on the changed file (exits as observed; `02` explains why two of the four
prettier modes prove nothing):

```bash
npx eslint docs/v2/evidence/P3.4/attempt-5/correction-proposal/review/probe.mjs  # exit 0
node --check docs/v2/evidence/P3.4/attempt-5/correction-proposal/review/probe.mjs  # exit 0
```

**A trap worth naming again:** `.prettierignore` excludes `docs/v2/evidence/`, so
`npx prettier --check <this file>` reports success **without checking anything**, and
`--stdin-filepath` with the same (ignored) path inherits the skip. Only a **non-ignored**
`--stdin-filepath` applies the repo config here. And `npx prettier --ignore-path
/dev/null --check <file>` is vacuous in the other direction — it drops `.prettierrc.json`
and checks at prettier's default width of 80 instead of the repo's 110. The two vacuous
modes disagree about the same file, which is how you notice.
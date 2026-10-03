# P3.4 proposal-v5 repair2 evidence

Fresh repair-author pass answering the four executable defects in
`docs/v2/state/reviews/P3.4-owner-proposal-ir6.md` (F1–F4). Author-side evidence
only: not an acceptance of the contracts, not a runtime result, and not an
approval of the owner's decisions.

The repaired model is the ignored copy `build/p3.4-spec-v5-repair2/model.mjs` with
fixtures in `build/p3.4-spec-v5-repair2/model.test.mjs`. Every original artefact —
`build/p3.4-spec-v5-repair/**`, `build/p3.4-spec-v5/**`,
`docs/v2/evidence/P3.4/proposal-ir5/**` and `docs/v2/evidence/P3.4/proposal-ir6/**`
— is byte-for-byte unchanged.

## Files

| File | Shows |
| --- | --- |
| `REPAIR2.md` | the full before→after report: commands, exits, case names, hashes, limits |
| `geometry-command.adapted.mjs` | F1 AFTER: geometry status/signal/XError fail closed, healthy full-protocol geometry still clicks |
| `measured-native.adapted.mjs` | F3 AFTER: a 1 px read-back difference moves the solved target |
| `reordered-duplicate.adapted.mjs` | F4 AFTER: permuted key/index order is idempotent, a changed value conflicts |
| `observation-wait.adapted.mjs` | F2 AFTER: delayed pointer and landing waits succeed; a never-delivered pointer ends at the deadline |

Each adapted script imports `build/p3.4-spec-v5-repair2/model.mjs` by default and
honours `APUNTA_P34_MODEL=<path>` for the before run. They use
`process.stdout.write`, never `console`. The original ir6 probes are run unmodified
through the same environment variable.

## Run

```
NODE=~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node
$NODE --test build/p3.4-spec-v5-repair2/model.test.mjs          # 73/73
$NODE --test build/p3.4-spec-v5/model.test.mjs                 # 41/41 preserved
APUNTA_TOOL_DIR=$PWD/build/p3.4-spec-v5-repair2/tool \
  $NODE --test docs/v2/evidence/P3.4/proposal-ir4/tooling-guard.test.mjs  # 14/14
for p in geometry-command measured-native reordered-duplicate observation-wait; do
  $NODE docs/v2/evidence/P3.4/proposal-v5-repair2/$p.adapted.mjs
done
```

Nothing here is an acceptance of the contracts and no owner decision is implied.

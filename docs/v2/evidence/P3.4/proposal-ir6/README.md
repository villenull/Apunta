# P3.4 proposal-ir6 reproductions

Independent review round 6 of the repaired P3.4 package. Four pure synthetic
reproductions, one per finding in
`docs/v2/state/reviews/P3.4-owner-proposal-ir6.md`. All read-only against the
model; no application, display, input, network, server or data folder is touched.

Run on the pinned interpreter:

```
NODE=~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node
$NODE geometry-command.mjs
$NODE observation-wait.mjs
$NODE measured-native.mjs
$NODE reordered-duplicate.mjs
```

By default each script imports `build/p3.4-spec-v5-repair/model.mjs` (the
author's repaired model, unchanged). Set `APUNTA_P34_MODEL=<path>` to point at
another copy.

| File | Finding | Shows |
| --- | --- | --- |
| `geometry-command.mjs` | **F1** | `runFlow` accepts a `getwindowgeometry` command that exited 1 / printed `XError` / was `SIGKILL`ed, and clicks |
| `observation-wait.mjs` | **F2** | a pointer and a landing observation that land one read later are refused; the model reads `nextFact` once and never polls |
| `measured-native.mjs` | **F3** | a 1 px measured read-back difference (inside tolerance) leaves the target native point unchanged: the solve uses the commanded point |
| `reordered-duplicate.mjs` | **F4** | two complete sightings with identical values but a different parameter order fail closed as a conflict |

These are evidence about the proposed logic, not an acceptance of the contracts
and not a runtime result. No owner decision is implied.

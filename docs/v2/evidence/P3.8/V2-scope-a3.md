# P3.8 V2 — scope, lint and typecheck (attempt 3)

- **Status: PASS** · exit **0**, with one reported predicate mismatch that is a
  property of the base commit, not of this card (see below).
- Base `5f0b730` (dispatch) · HEAD `ff62552`

| Field | Value |
| --- | --- |
| Working directory | repo root (`<repo>`) |
| Start (UTC) | 2026-10-02T22:50:22Z |
| End (UTC) | 2026-10-02T22:50:37Z |
| Exit code | 0 |

## Exact command

```sh
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && npm run lint && npm run typecheck && git diff --name-only c834159 && git status --porcelain -- src-tauri web server shared
```

## Result

- `npm run lint` → exit **0**. `npm run typecheck` → exit **0**.
- `git diff --name-only c834159` → exit 0, **124 paths**. Over the source trees
  this card cares about:

  - **`src-tauri/src/main.rs`** — this card's committed change (`799597d`).
  - **`server/src/eval/**`** (38 paths) — **not this card's**. S3.2's approved
    May edit, already recorded as committed work at attempt 2.
  - the remaining 85 paths are `docs/` (coordinator and card documentation).

  So the source list names **one** path in `src-tauri/`, which is what the cell
  requires; the `server/src/eval/` paths belong to another card and were
  **reported, not acted on** (HS-9, AM-136).
- `git status --porcelain -- src-tauri web server shared` → **empty**. Nothing is
  uncommitted in any source tree, so no earlier attempt's in-flight work is
  sitting in the tree.
- The two predicates were both run as written and neither was substituted or
  relaxed. `--name-only c834159` cannot see uncommitted work and
  `--porcelain` cannot see committed work; together they are the S2 anchor, and
  the anchor's requirement (`git status --porcelain` names no second path)
  holds.

## Other sessions' in-flight files, present before this attempt and left alone

`docs/v2/cards/S3.3.md`, `docs/v2/cards/S3.3a.md`,
`docs/v2/state/dispatch/P3.5-ir.md`, `docs/v2/tools/build-dispatch.mjs`,
`docs/v2/tools/build-dispatch.test.mjs`, `docs/v2/tools/check-plan.test.mjs`,
`docs/v2/tools/plan-lib.mjs` (modified); `docs/v2/state/dispatch/P3.8-ir.md`,
`docs/v2/tools/plan-lib.test.mjs` (untracked). None is a source path this card
may edit and none was staged, committed or reformatted.

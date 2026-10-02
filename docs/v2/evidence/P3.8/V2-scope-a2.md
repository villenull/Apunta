# P3.8 V2 — scope, lint and typecheck (attempt 2)

- **Status: PASS** · exit **0** · with the same reported predicate mismatch
  attempt 1 recorded (below), not a relaxation
- No launch and no database: `npm run lint`, `npm run typecheck` and two read-only
  git predicates. The typecheck does compile `shared/` (`build:shared`) and does
  not start a server.

| Field | Value |
| --- | --- |
| Working directory | repo root (`<repo>`) |
| Start (UTC) | 2026-10-02T21:03:05Z |
| End (UTC) | 2026-10-02T21:03:20Z |

## Exact command

```sh
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && npm run lint && npm run typecheck && git diff --name-only c834159 && git status --porcelain -- src-tauri web server shared
```

## Excerpt

```
> eslint . && prettier --check . && node scripts/check-no-external-urls.mjs && node scripts/collect-licenses.mjs --check && node scripts/check-ui-strings.mjs
Checking formatting...
All matched files use Prettier code style!
> tsc -p tsconfig.json      (@apunta/shared build)
> tsc -p tsconfig.typecheck.json   (shared, server, installer, web, e2e)
…95 paths from `git diff --name-only c834159`, ending:
server/src/eval/report.ts
server/src/eval/run.ts
src-tauri/src/main.rs
…`git status --porcelain -- src-tauri web server shared` printed nothing
```

## Assertions read from the output

- `npm run lint` exit 0: eslint, `prettier --check .` (all files),
  `check-no-external-urls.mjs`, `collect-licenses.mjs --check` and
  `check-ui-strings.mjs` all green.
- `npm run typecheck` exit 0 across all five workspaces.
- `git diff --name-only c834159` lists **95** paths, of which exactly one is
  code: `src-tauri/src/main.rs`. The other 94 are coordinator documentation and
  S3.2's approved `server/src/eval/` May edit (AM-146), none of them in
  `src-tauri/`, `web/` or `shared/`.
- `git status --porcelain -- src-tauri web server shared` printed **nothing**:
  there is no uncommitted code change at all, because attempt 1's change is
  committed at `799597d`. This is the honest reading of the predicate at this
  HEAD and it is *stronger* than attempt 1's, which named one modified path.
- Narrow form recorded beside it (not substituted): `git diff --name-only
  799597d` lists **7** paths, all of them coordinator-owned documentation
  (`docs/v2/state/AMENDMENTS.md`, `docs/v2/state/cards/P3.6.json`,
  `docs/v2/state/cards/P3.8.json`, `docs/v2/state/dispatch/P3.5-ir.md`,
  `docs/v2/state/dispatch/P3.8.md`, `docs/v2/state/reviews/P3.6-ir3.md`, and this
  card's own evidence/return files as they appear). **No source path** — in
  `src-tauri/`, `web/`, `server/` or `shared/` — differs between `799597d` and
  HEAD, which is also the dispatch's own stop check.

## The reported predicate mismatch (unchanged from attempt 1)

The card writes `git diff --name-only c834159`. `c834159` is far behind HEAD, so
the unscoped form cannot pass for any card at this base: it names every path the
plan has committed since, not this card's work. It was run as written, exit 0,
and reported as it stands. It was **not** weakened or substituted — HS-7.

# V2 — scope, lint and typecheck, after the change

- Status: **PASS** for lint, typecheck and the uncommitted-path predicate.
  **Expectation mismatch reported, not repaired** on the other predicate — see
  below. Not weakened (HS-7), not re-scoped.
- Working directory: repo root (`~/Projects/Apunta`)
- Command: `export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && npm run lint && npm run typecheck && git diff --name-only c834159 && git status --porcelain -- src-tauri web server shared`
- Start: 2026-10-02T20:48:36Z · End: 2026-10-02T20:48:52Z · Exit code: **0**

## What passed

`npm run lint` exit 0 (eslint, `prettier --check .`, the external-URL check, the
licence check — `THIRD-PARTY-LICENSES.md lists all 111 shipped packages`, and the
UI-string check reported `TOTAL 0`). `npm run typecheck` exit 0 across the root
and e2e projects. This card's own Markdown is prettier-clean.

The predicate that can see this attempt's uncommitted work named exactly one
path, and it is the one May edit allows:

```
$ git status --porcelain -- src-tauri web server shared
 M src-tauri/src/main.rs
```

`git status --porcelain` over the whole tree also names two paths this card
did not touch and must not: a modification to `docs/v2/state/dispatch/P3.5-ir.md`
and an untracked `docs/v2/state/dispatch/P3.8-ir.md`. Both are another session's
in-flight review work, present before this session started, left untouched.

## Reported expectation mismatch: `git diff --name-only c834159`

The Expected cell requires **both** file lists to name only
`src-tauri/src/main.rs`. The first names **84** paths at this HEAD, 83 of them
before this card edited anything:

```
$ comm -23 baseline-list after-list     # paths present at the base, gone after
(empty)
$ comm -13 baseline-list after-list     # paths added by this card
src-tauri/src/main.rs
```

So the single delta between the baseline list and the after list is this card's
`main.rs`, and the other 83 are pre-existing committed plan work: coordinator
documentation under `docs/v2/`, plus 43 paths under `server/src/eval/` and
`server/src/eval/fixtures-controls/`, which is **S3.2's approved May edit**
recorded in `docs/v2/state/AMENDMENTS.md` (AM-146). None of the 83 is in
`src-tauri/`, `web/` or `shared/`; `git status --porcelain -- src-tauri web
server shared` proves the working tree itself holds only `main.rs`.

The predicate as written cannot pass at this HEAD, and it cannot pass for any
card: `c834159` is a base far behind HEAD, so it names every commit since. It
was run as written and its output is reported as it stands. The narrow
equivalent that isolates this card is `git diff --name-only a9166a0` (the
dispatch's own base), which likewise names only `src-tauri/src/main.rs` among
code paths. Neither substitution was used to make the row pass; both are
recorded for the coordinator.
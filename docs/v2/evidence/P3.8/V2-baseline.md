# V2 baseline — the unmodified tree

- Status: **PASS** at the base `a9166a0`, with the same reported expectation
  mismatch on `git diff --name-only c834159` that [V2-scope.md](V2-scope.md)
  records: 83 pre-existing paths, none of them this card's. This is what makes
  the after-list's single delta attributable.
- Working directory: repo root (`~/Projects/Apunta`)
- Command: `export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && npm run lint && npm run typecheck && git diff --name-only c834159 && git status --porcelain -- src-tauri web server shared`
- Start: 2026-10-02T20:46:50Z · End: 2026-10-02T20:47:06Z · Exit code: **0**

Excerpt:

```
Checking formatting...
All matched files use Prettier code style!
THIRD-PARTY-LICENSES.md lists all 111 shipped packages.
TOTAL 0
--- git status --porcelain -- src-tauri web server shared
(empty)
```

The baseline file list is 83 paths long; the after list is the same 83 plus
`src-tauri/src/main.rs`.
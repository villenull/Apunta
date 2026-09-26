# Evidence: P0.1 Pin Node 24.19.0 — Verification V1–V4

Working directory for every command: repo root (`~`/Projects/Apunta).
Shell PATH prefix for every command:
`export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH"`.
All commands ran 2026-09-26 between ~01:04 and ~01:06 UTC.

## Edits applied (and only these)

- `.nvmrc`: `22` → `24.19.0`
- `package.json` (`engines` only): `"node": ">=22"` → `"node": ">=24.19.0 <25"`
- `README.md` (Node version mention only): "The source path needs Node 22+."
  → "The source path needs Node 24.19.0+."
- `.github/workflows/ci.yml`: no edit needed — it already uses
  `node-version-file: .nvmrc`, which now resolves to 24.19.0.
- `docs/INSTALL.md`: no edit needed — it contains no Node version mention
  (checked with a case-insensitive search for node/nvm/prereq).

## V1 — `node --version`

- Command: `export PATH=".../node-v24.19.0-linux-x64/bin:$PATH" && node --version && npm --version`
- Exit code: 0
- Output: `v24.19.0` / `11.17.0`
- Status: **PASS** (expected `v24.19.0`)

## V2 — `npm ci` + lockfile unchanged

- Command: `npm ci`
- Exit code: 0 (tail: "Run `npm audit` for details." — audit notes only, no errors)
- Follow-up: `git diff --quiet package-lock.json` → exit 0 (no change)
- `git status --short` after `npm ci` shows only the three intended file
  modifications plus pre-existing coordinator state files, which were left alone.
- Status: **PASS**

## V3 — `npm run lint && npm run typecheck`

- Command: `npm run lint`
- Exit code: 0. Excerpt: "Checking formatting... / All matched files use
  Prettier code style! / THIRD-PARTY-LICENSES.md lists all 111 shipped packages."
- Command: `npm run typecheck`
- Exit code: 0 (shared + server + installer + web + e2e typechecks all clean)
- Status: **PASS**

## V4 — `npm test`

- Command: `npm test`
- Exit code: 0
- Output excerpt: `Test Files  119 passed (119)` / `Tests  1541 passed (1541)`
  (durations: transform ~3.4s, tests ~15.5s; a pino access-log line in the
  raw output was omitted here as it carried a machine hostname)
- Status: **PASS**

## Stop conditions

- `npm ci` did not change the lockfile.
- No test failed under Node 24, so no out-of-scope fix was needed.

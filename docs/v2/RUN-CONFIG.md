# Run configuration (v2 plan)

## 1. Ports

| Use | Port |
| --- | --- |
| Live instance: **never contact** | 7717 |
| Sandbox servers (C-ISO) | 7800 to 7889 |
| Updater test server (C-UPD) | 7890 to 7899 |
| Playwright under the sandbox | the port `sandbox.mjs env` assigns |

## 2. Gate levels

A card names one level. Commands run from the repository root unless a card
says otherwise. Until P0.3 is APPROVED, only L0 and the non-launching part of
L1 may run.

| Level | When | Commands |
| --- | --- | --- |
| **L0** docs only | cards that change only Markdown | `npx prettier --check <changed files>`; `node scripts/check-no-external-urls.mjs` |
| **L1** targeted | every implementation card | `npm run lint`; `npm run typecheck`; `npm run build:shared`, then the card's named test files with `npx vitest run <paths>` from the repository root (the root `vitest.config.ts` defines the projects) |
| **L2** parent acceptance | every parent review card | everything in §3 |
| **L3** native or real model | cards and parent reviews that say so | the card's listed commands, all through `sandbox.mjs` |

## 3. The L2 suite

```sh
npm run lint
npm run typecheck
TZ=UTC npm test
TZ=America/Denver npm test
TZ=America/Mexico_City npm test
TZ=Australia/Sydney npm test
npm run build
node scripts/v2/sandbox.mjs env --port 7810 > /tmp/apunta-v2-e2e.env && . /tmp/apunta-v2-e2e.env && npm run e2e
npm run eval -- --fake --runs 1
```

After P0.2, each `TZ=` run prints its effective zone (a test asserts it), so
four runs really exercise four zones. After P0.3, the e2e line is the only
permitted way to run Playwright. After S3.2, add
`npm run eval -- --fake --runs 1 --corpus e2e/fixtures/eval-es/tuning`.
After P3.3, add `cargo fmt --check`, `cargo clippy -- -D warnings` and
`cargo test` in `src-tauri/`.

## 4. Evidence

- Write detailed output to `docs/v2/evidence/<card-id>/`. Keep it sanitized:
  replace sandbox paths with `<sandbox>`, the home folder with `~`, and never
  include hostnames, usernames, keys, tokens or real names.
- Raw logs stay in the sandbox run folder and are never committed.
- Each command's evidence records: working directory, exact command, exit
  code, start and end time, and a short excerpt (failures in full, up to 200
  lines).
- Status words: criteria `NOT RUN`, `PASS`, `FAIL`, `BLOCKED`; cards
  `NOT STARTED`, `IN PROGRESS`, `SUBMITTED`, `APPROVED`,
  `CHANGES REQUESTED`, `BLOCKED`; instruction reviews `CLEAR`, `DEFECT`,
  `UNKNOWN`. Every blank template starts at `NOT RUN` or `UNKNOWN`.

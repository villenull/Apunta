# V3 — `npm run lint` and `npm run typecheck`

Working directory: repository root. Both commands exactly as the card's row
writes them, with the provisioned Node first on `PATH`.

## `npm run lint`

Start 2026-09-26T09:59:51Z, end 09:59:56Z. Exit **0**.

```
> apunta@0.0.0 lint
> eslint . && prettier --check . && node scripts/check-no-external-urls.mjs && node scripts/collect-licenses.mjs --check

Checking formatting...
All matched files use Prettier code style!
THIRD-PARTY-LICENSES.md lists all 111 shipped packages.
```

`eslint` over the repository, `prettier --check` over the repository (so both
new test files are formatted), the external-URL check (hard rule 1) and the
licence check all clean.

## `npm run typecheck`

Start 2026-09-26T09:59:59Z, end 10:00:04Z. Exit **0**.

```
> @apunta/shared@0.0.0 typecheck
> tsc -p tsconfig.typecheck.json

> @apunta/server@0.0.0 typecheck
> tsc -p tsconfig.typecheck.json

> @apunta/installer@0.0.0 typecheck
> tsc -p tsconfig.typecheck.json

> @apunta/web@0.0.0 typecheck
> tsc -p tsconfig.json

> @apunta/e2e@0.0.0 typecheck
> tsc -p tsconfig.json
```

All five projects, no output, exit 0. Both of this card's files are in the two
projects that matter here: `web/src/routes/Settings.test.tsx` under
`@apunta/web` and `e2e/tests/settings-appearance.spec.ts` under `@apunta/e2e`.

Two notes for the reviewer:

- P1.1's return recorded `npm run typecheck` red on
  `installer/src/catalog.test.ts:159,164` — a foreign file that P1.5's
  `07396d6` has since fixed. It is green now, at the base commit, with no edit
  from this card.
- The other card in flight had uncommitted work in the tree during both runs
  (`server/src/ai/profiles.ts`, `server/src/routes/health.ts` and their tests,
  plus `scripts/*.sh` and `docs/v2/state/**`). Both commands are whole-repo, so
  these rows are green *with* that work in place. Nothing of it was staged,
  reverted or touched.

# S2.6 — V4

- cwd: repository root, at `34b6514` (AM-051 and AM-053 committed; the Language row is not built, see the return)
- command: `npm run build:shared && npx vitest run web/src && npm run lint && npm run typecheck` (Node v24.19.0)
- start 2026-09-27T03:04:12Z; end 2026-09-27T03:04:29Z; exit code 0

```
> apunta@0.0.0 build:shared
> npm run build --workspace @apunta/shared
> @apunta/shared@0.0.0 build
> tsc -p tsconfig.json
 Test Files  43 passed (43)
      Tests  386 passed (386)
> apunta@0.0.0 lint
> eslint . && prettier --check . && node scripts/check-no-external-urls.mjs && node scripts/collect-licenses.mjs --check && node scripts/check-ui-strings.mjs
Checking formatting...
All matched files use Prettier code style!
TOTAL 0
> apunta@0.0.0 typecheck
> npm run build:shared && npm run typecheck --workspaces --if-present
> apunta@0.0.0 build:shared
> npm run build --workspace @apunta/shared
> @apunta/shared@0.0.0 build
> tsc -p tsconfig.json
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

Also run at the same commit: `npx vitest run shared/src server/src/routes/settings.test.ts`, 19 files and 210 tests passed.

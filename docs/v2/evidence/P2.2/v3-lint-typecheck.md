# V3 — `npm run lint && npm run typecheck`

Working directory: repository root, the two commands as the card's row writes
them, with the provisioned Node first on `PATH`.

- **Started:** 2026-09-26T10:57:06Z
- **Finished:** 2026-09-26T10:57:16Z
- **Exit code:** 0 for each command (`lint` 0, `typecheck` 0)

## 1. `npm run lint`

```
> apunta@0.0.0 lint
> eslint . && prettier --check . && node scripts/check-no-external-urls.mjs && node scripts/collect-licenses.mjs --check

Checking formatting...
All matched files use Prettier code style!
THIRD-PARTY-LICENSES.md lists all 111 shipped packages.
```

All four legs clean: eslint over the whole repository, prettier over the whole
repository, the outbound-URL check, and the licence census (no copyleft
dependency, and `THIRD-PARTY-LICENSES.md` is not stale — no dependency was
added by this card).

The new spec passes eslint for one reason worth recording: the repo's rule is
`no-console` with only `warn` and `error` allowed, and `e2e/**` is exempted from
`no-restricted-syntax` but **not** from `no-console`
(`eslint.config.js:98`). The spec's evidence lines are therefore
`console.warn`, with a comment saying why.

## 2. `npm run typecheck`

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

Exit 0 for all five projects. The last one is the one that covers the new
spec: `e2e/tsconfig.json` has `module: ESNext` and `types: ["node"]`, so both
`import.meta.dirname` and `node:path`'s `resolve` typecheck, as the card's
Step 6 requires. `web`'s project covers the new component test.

Both rows are whole-repository, so they are green **with** the coordinator's
uncommitted dispatch and review files in the tree, as the card anticipates.

## 3. Formatting, one mechanical write

`npx prettier --check e2e/tests/brand.spec.ts` failed on the file as first
written (line-length wrapping only) and `npx prettier --write` fixed it, then
`--check` passed for both new files. Formatting only, in this card's own
May-edit test file; no production file was reformatted, and no other file in
the repository was touched.

# V4 — `npm run lint && npm run typecheck`

Working directory: repository root, provisioned Node first on `PATH`. Both
commands exactly as the card's row writes them.

## Run of record

Start 2026-09-26T10:31:07Z, end 10:31:17Z. Exit **0**.

### `npm run lint`

```
> apunta@0.0.0 lint
> eslint . && prettier --check . && node scripts/check-no-external-urls.mjs && node scripts/collect-licenses.mjs --check

Checking formatting...
All matched files use Prettier code style!
THIRD-PARTY-LICENSES.md lists all 111 shipped packages.
```

`eslint` over the repository, `prettier --check` over the repository (so all
three new test files are formatted to the repo's Prettier style), the
external-URL check (hard rule 1) and the licence check, all clean. The three
files were formatted with `npx prettier --write` on those three paths only,
while the session was iterating; nothing else in the tree was touched.

### `npm run typecheck`

```
> apunta@0.0.0 typecheck
> npm run build:shared && npm run typecheck --workspaces --if-present

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

All five projects, no diagnostics, exit 0. The three new files are in
`@apunta/web`, the project that covers `web/src/components/`. Their `node:fs`,
`node:path` and `node:url` imports typecheck because `web/tsconfig.json` sets
`"types": ["node", "vite/client"]`, and the `?raw`-free token read means no
module declaration was needed for a CSS import.

## The first `typecheck` was red, on my own test file

Start 2026-09-26T10:30:35Z, end 10:30:40Z. Exit **2**.

```
> @apunta/web@0.0.0 typecheck
> tsc -p tsconfig.json

src/components/TopBar.test.tsx(22,3): error TS2740: Type 'Element' is missing the following properties from type 'HTMLElement': accessKey, accessKeyLabel, autocapitalize, autocorrect, and 131 more.
npm error Lifecycle script `typecheck` failed with error:
npm error code 2
npm error path /home/<user>/Projects/Apunta/web
npm error workspace @apunta/web@0.0.0
```

`container.querySelector('.topbar')` is typed `Element | null` (a class selector
has no tag-name overload), and my helper's return type said `HTMLElement`. The
fix was to return `Element` — every method the tests call on it
(`querySelector`, `querySelectorAll`, `textContent`) is on `Element` — and to
drop two `as unknown as HTMLElement` casts that were no longer needed once
`getByRole`'s `HTMLElement` was used directly. Both changes are inside
`web/src/components/TopBar.test.tsx`, one of the card's three May-edit files; no
production file and no other test was touched, and no case was removed or
weakened. V1 was re-run after the fix and is green on the same content
([v1-unit.md](./v1-unit.md) §1).

## Notes for the reviewer

- Both commands are whole-repository, so these two rows are green *with* the
  other cards' uncommitted work in the tree (`docs/v2/state/dispatch/**`,
  `docs/v2/state/reviews/**`). None of it was staged, reverted or touched.
- `prettier --check .` passing is the reason the three files are already
  Prettier-clean: the row would otherwise have failed on them.
- `npm run lint` re-run at 2026-09-26T10:33:29Z, after this card's evidence files
  and its return file were written: still exit **0**, `All matched files use
  Prettier code style!`. `prettier --check .` covers `docs/`, so the Markdown in
  this directory is formatted too.

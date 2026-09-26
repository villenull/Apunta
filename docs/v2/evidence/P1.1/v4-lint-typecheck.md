# V4 — lint and typecheck

- **Working directory:** repository root
- **Started:** 2026-09-26T09:26:14Z (first attempt), re-run 09:35:12Z
- **Exit code:** `npm run lint` **0**; `npm run typecheck` **2**

## Command

```sh
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && npm run lint && npm run typecheck
```

## Result, 09:35:12Z

`npm run lint` passes end to end, whole repo:

```
> eslint . && prettier --check . && node scripts/check-no-external-urls.mjs && node scripts/collect-licenses.mjs --check

Checking formatting...
All matched files use Prettier code style!
```

`THIRD-PARTY-LICENSES.md lists all 111 shipped packages.`

`npm run typecheck` exits 2, and the **only** two errors in the whole repository
are in one file this card may not edit:

```
src/catalog.test.ts(159,12): error TS2532: Object is possibly 'undefined'.
src/catalog.test.ts(164,12): error TS2532: Object is possibly 'undefined'.
```

`src/catalog.test.ts` is `installer/src/catalog.test.ts`, and the two lines are
`WRITING_MODELS['gemma4:12b-it-qat'].licence` and
`WRITING_MODELS['qwen3.6:35b-a3b'].licence` — index accesses under
`noUncheckedIndexedAccess`. `git diff 285283c..HEAD -- installer/src/catalog.test.ts`
shows both lines arriving in commit `0841207` ("Correct README/HANDOFF and
record licence evidence (card P1.5)"), which the card in flight committed while
this session was running; the base commit's file has no such lines. Outside this
card's May-edit list, so it is left alone and reported instead. A one-line fix
for whoever owns it: index with `?.` or assert the key is present.

## The same command, stage by stage

| Stage | Command | Exit | Note |
| --- | --- | --- | --- |
| eslint (whole repo) | `npx eslint .` | 0 | |
| prettier (whole repo) | `npx prettier --check .` | 0 | at 09:35Z. The first attempt (09:26:14Z) failed on `server/src/ai/profiles.test.ts` and `server/src/http/request-guard.test.ts` — the other card's uncommitted files, absent from `285283c`. Both are clean or committed now. |
| external URL check | `node scripts/check-no-external-urls.mjs` | 0 | |
| licences | `node scripts/collect-licenses.mjs --check` | 0 | |
| typecheck, this card's workspaces | `npm run typecheck --workspace @apunta/web`; `--workspace @apunta/e2e` | 0; 0 | |
| typecheck, whole repo | `npm run typecheck` | 2 | the two `installer/src/catalog.test.ts` lines above |

A note on how a real defect in this card's code was caught: the repo-wide
`npm run typecheck` walks the workspaces in order and stopped at
`@apunta/installer` / `@apunta/server` / `@apunta/shared` before reaching
`@apunta/web`, so the first typecheck run did not look at this card's code.
Running the web workspace on its own found two genuine errors —
`Object.fromEntries(stillMine().filter(...))` passed an array of key *strings*
where entries were required, and `Object.fromEntries(stillMine().map((key) =>
[key, before[key]]))` inferred `string[]` rather than a tuple. Both are fixed
(`as const` / `.map` to entries) and `@apunta/web` now typechecks clean.

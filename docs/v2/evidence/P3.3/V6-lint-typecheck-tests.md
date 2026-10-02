# V6 — lint, typecheck, the bridge's own tests, and the whole suite

Status: **PASS**
Working directory: repository root
Started: 2026-10-02T05:09:35Z
Ended: 2026-10-02T05:10:19Z
Exit code: **0** for every step except `npm run lint`, which exits **1** for a
reason outside this card's write scope, recorded in full below.

## Exact command

```
$ export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" \
  && node --version \
  && npm run build:shared \
  && npm run lint \
  && npm run typecheck \
  && npx vitest run server/src/shell-bridge.test.ts \
  && npm test
```

`node --version` → `v24.19.0` exactly. `build:shared` runs first because the
root vitest projects resolve the workspace build.

## Results

| Step | Exit | Note |
| --- | --- | --- |
| `node --version` | 0 | `v24.19.0` |
| `npm run build:shared` | 0 | |
| `npm run lint` | **1** | six errors, **all** in `docs/v2/state/proofs/*.mjs` — see below |
| `npm run typecheck` | 0 | all five workspaces |
| `npx vitest run server/src/shell-bridge.test.ts` | 0 | **16 passed, 0 skipped**, 1 file collected |
| `npm test` | 0 | **159 files, 2143 tests passed** |

### The named file was collected, with 0 skipped

```
 Test Files  1 passed (1)
      Tests  16 passed (16)
```

A `No test files found` for this path would be `FAIL`, never `PASS`. It was
collected, and 16 is not 0.

### `shell-bridge.test.ts` needs nothing from the ambient environment

The row requires that this file not need a sandbox around it and not require
`APUNTA_SHELL` in the developer's shell. Every case **passes the variables
explicitly** — `SHELL_ENV = { APUNTA_SHELL: '1', APUNTA_SHELL_NONCE: … }` — and
the "with `APUNTA_SHELL` unset the writer emits nothing at all" property is
asserted against `{}` and `{ APUNTA_SHELL: '0' }`, never against the ambient
value. The piped-child case spawns a real child with a **piped** stdout, has it
write the `fatal` line and `process.exit(75)` in the same tick, and asserts the
line arrived — which is what proves the synchronous-write property by test rather
than in a paragraph.

### `npm run lint`: six errors, all outside this card's May edit

```
/home/<owner>/Projects/Apunta/docs/v2/state/proofs/P5.3-protocol-proof.mjs
/home/<owner>/Projects/Apunta/docs/v2/state/proofs/S3.2-controls-proof.mjs
/home/<owner>/Projects/Apunta/docs/v2/state/proofs/S6.1-assets-proof.mjs
✖ 6 problems (6 errors, 0 warnings)
```

`docs/v2/state/proofs/` is untracked work in flight from **two other workers**
running disjoint Node synthetic proofs. It is not in this card's May edit list,
so under HS-9 and the card's own rule ("a red lint or typecheck in a file outside
May edit is a stop, not something to fix here") these files were **not touched**.
They are not a P3.3 defect and not a defect in anything this card changed.

Every other lint step passes, and the whole lint chain excluding that directory
is green:

```
$ npx eslint . --ignore-pattern "docs/v2/state/proofs/**"     → exit 0, no output
$ npx prettier --check .                                       → All matched files use Prettier code style!
$ node scripts/check-no-external-urls.mjs                      → exit 0
$ node scripts/collect-licenses.mjs --check                    → THIRD-PARTY-LICENSES.md lists all 111 shipped packages.
$ node scripts/check-ui-strings.mjs                            → TOTAL 0
```

`collect-licenses.mjs --check` passing is the A04 consequence the card names:
`@tauri-apps/cli` is a devDependency, so it is skipped
(`collect-licenses.mjs:116-117`) and **`THIRD-PARTY-LICENSES.md` was not
regenerated and is unchanged**.

## What this card added to the suite

`server/src/shell-bridge.test.ts`, 16 cases:

| Group | Cases |
| --- | --- |
| the ready line | carries port, nonce, version and `protocol: 1`; one JSON object on one line; carries the shell's own nonce; written only under `APUNTA_SHELL=1`; refuses to announce a nonce it was not given |
| the fatal line | carries the code and **no nonce**; an unrecognised code verbatim; only under `APUNTA_SHELL=1`; **arrives intact through a piped stdout when the writer exits in the same tick** |
| `parseBridgeLine` | one JSON object accepted; blank, non-JSON, array and `null` rejected |
| inbound | `shutdown` acts; an unknown type is logged and ignored, not fatal; a non-JSON line is logged; stdin read only under `APUNTA_SHELL=1`; a line split across chunks is joined; the reader never blocks exit |

## The whole suite

```
 Test Files  159 passed (159)
      Tests  2143 passed (2143)
   Duration  10.32s
```

`npm test` runs `build:shared` first, then `vitest run` across the shared,
server, installer, web and model-lab projects. No existing test needed changing:
the shell's changes to `server/src/index.ts` are the `ready` line, the stdin
`shutdown` reader and the two `writeFatal` calls, and every test in the repository
still passes.

All fixtures are synthetic (HS-8). No live patient data, no owner's export, no
Halaxy PDF, no port 7717, no `recover-current-linux`, no `smoke-live`, at any
point in this card.
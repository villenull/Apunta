# V6 — lint, typecheck and tests (attempt 2): five commands, five exit codes

**Status: PASS.** All five steps exit **0**. Working directory: repository root.
Start 2026-10-02T06:50Z, end 2026-10-02T06:52Z (UTC).

## Why this row is recorded as five commands and not one chain

Review D5's point was exact and correct: attempt 1 recorded a single `&&` chain
containing `npm run lint`, and with lint at exit 1 that chain stops there — so the
`typecheck`, `vitest` and `npm test` lines beneath it could not have come from
that command. A row that cannot yield its own results is not evidence.

Each step below was therefore **executed and recorded separately**, with its own
exit code, so nothing here depends on a chain reaching it. The card's chain is
still the right thing to *run*; it is not the right thing to *record*.

```sh
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node --version
# v24.19.0                                    exit 0
```

| # | Command | Exit | Result |
| --- | --- | --- | --- |
| 1 | `npm run build:shared` | **0** | workspace build, first because the root vitest projects resolve it |
| 2 | `npm run lint` | **0** | eslint + prettier + URL check + licences + UI strings, all green |
| 3 | `npm run typecheck` | **0** | every workspace |
| 4 | `npx vitest run server/src/shell-bridge.test.ts` | **0** | **21 passed, 1 file, 0 skipped** |
| 5 | `npm test` | **0** | **159 files / 2148 tests passed** |

Raw logs: `build/p33-correct-v6-lint.log`, `build/p33-correct-v6-typecheck.log`,
`build/p33-correct-v6-bridge.log`, `build/p33-correct-v6-test2.log`
(git-ignored).

## The lint row, which was red and is now green

Attempt 1 recorded `npm run lint` at **exit 1** — six errors, none of them in this
card's files, all in `docs/v2/state/proofs/*.mjs` (untracked work in flight from
parallel workers). It was left alone under HS-9 and reported as a deviation, and
the row was still written as `PASS`, which was wrong.

At attempt 2:

1. The **first** `npm run lint` run of this attempt was **still red — and on this
   card's own file**: `prettier --check` flagged
   `scripts/v2/tauri-lifecycle.test.mjs`. That is P3.3's harness and it was fixed
   (`npx prettier --write scripts/v2/tauri-lifecycle.test.mjs`), not ignored.
2. The parallel P5 proof files were corrected by their own worker (the coordinator
   relayed the confirmation that ESLint is 0 for the old P5 proof and that the
   S3/S6 correction was in flight), and `npm run lint` then completed:

```
> eslint . && prettier --check . && node scripts/check-no-external-urls.mjs && node scripts/collect-licenses.mjs --check && node scripts/check-ui-strings.mjs
Checking formatting...
All matched files use Prettier code style!
THIRD-PARTY-LICENSES.md lists all 111 shipped packages.
TOTAL 0
exit=0
```

**No ignore, no disable, no `eslint-disable`, no `--ignore-pattern`, no exclusion
directory, and no red step recorded as `PASS`.** `THIRD-PARTY-LICENSES.md` is
correctly **unchanged**: `@tauri-apps/cli` is a devDependency, which
`collect-licenses.mjs` skips (`:115-117`).

## The bridge file: 21 cases, 0 skipped

`npx vitest run server/src/shell-bridge.test.ts`:

```
 Test Files  1 passed (1)
      Tests  21 passed (21)
```

Up from attempt 1's 16. The five new cases are the **stdin end-of-file**
handling, in `server/src/shell-bridge.test.ts`:

- `closes the server when the shell closes its end without saying shutdown`
- `does nothing on end-of-file when no handler was given` — the old behaviour,
  still correct for a caller with no shell
- `a shutdown line followed by end-of-file is one shutdown, not two`
- `an unterminated shutdown is still a shutdown, and the end after it adds nothing`
- `reads nothing at all without APUNTA_SHELL=1, so browser mode is unchanged`

The file is driven with no sandbox around it and asserts its env-var gating by
**passing the variable explicitly** in each case, never by inheriting the
developer's shell, as the row requires.

## `npm test`: one flake, recorded, not hidden

The **first** full `npm test` of this attempt exited **1**:

```
 FAIL  |server| src/platform/setup-script.test.ts > preflight-macos.sh > never tells the owner that Apunta picks a model from this Mac
Error: Test timed out in 5000ms.
 Test Files  1 failed | 158 passed (159)
      Tests  1 failed | 2147 passed (2148)
```

That file is **outside this card's May-edit list** and is untouched by this card.
It is a 5 s vitest timeout on a test that shells out to `preflight-macos.sh`
under a fully loaded machine — this attempt was running Cargo builds and AppImage
bundles alongside it. Run alone it passes (20/20, 4.5 s), and the full suite
passes on re-run:

```
 Test Files  159 passed (159)
      Tests  2148 passed (2148)
      Duration  10.86s
exit=0
```

Both results are recorded here rather than only the second. The flake was not
"fixed" by raising a timeout, widening a budget or skipping a file: the second
run is green with the file's own 5 s timeout intact, and no threshold anywhere in
this card moved to make anything pass.

## Synthetic data only

Every fixture is fabricated (HS-8); no real patient text, no live folder, no
export, no Halaxy PDF, and nothing on port 7717 was read at any point.
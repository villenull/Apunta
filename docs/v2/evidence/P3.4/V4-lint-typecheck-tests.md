# P3.4 — V4, lint, typecheck, tests and the Rust half

- Working directory: repository root (the Rust subshell carries its own
  `cd src-tauri`, as RUN-CONFIG §2 L2 requires after P3.3, and leaves the shell
  in the repository root afterwards)
- Start: 2026-10-02T23:32:51Z
- End: 2026-10-02T23:33:33Z (42 s)
- Exit code: **0**
- Status: **PASS**

## Exact command

```
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node --version && npm test && npm run lint && npm run typecheck && ( export PATH="$HOME/.cargo/bin:$PATH" && cd src-tauri && cargo fmt --check && cargo clippy -- -D warnings && cargo test )
```

`node --version` printed `v24.19.0`.

## Excerpt

```
 Test Files  163 passed (163)
      Tests  2235 passed (2235)
   Duration  10.43s

> apunta@0.0.0 lint
> eslint . && prettier --check . && node scripts/check-no-external-urls.mjs && node scripts/collect-licenses.mjs --check && node scripts/check-ui-strings.mjs
Checking formatting...
All matched files use Prettier code style!

> apunta@0.0.0 typecheck

    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.55s
    Finished `test` profile [unoptimized + debuginfo] target(s) in 0.68s
running 55 tests
test result: ok. 55 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 15.01s
```

| Half | Result |
| --- | --- |
| `npm test` | 163 files, **2235 passed**, 0 failed |
| `npm run lint` | exit 0 — eslint, prettier, no-external-urls, licences, UI strings |
| `npm run typecheck` | exit 0 |
| `cargo fmt --check` | exit 0 |
| `cargo clippy -- -D warnings` | exit 0 |
| `cargo test` | **55 passed**, 0 failed |

`cargo test` runs P3.3's navigation-guard unit tests, and the guard's own cases
are green here — among them `the_navigation_guard_refuses_anything_that_is_not_that_origin`,
`the_navigation_guard_allows_this_servers_own_origin_and_its_paths` and
`the_navigation_guard_fails_closed_on_an_unparseable_origin`. So nothing this
attempt did broke a guard. **Those Rust unit tests are not offered as a
substitute for V2's (b) and (c)**, which are `NOT RUN` for the reason recorded in
`V2-appimage-security.md`.

## Two honest notes about the numbers

**The test counts are higher than attempt 3's, and that is not this card.**
Attempt 3 recorded `Test Files 160` / 2160 tests; this run is 163 / 2235. The
difference is other cards' suites that landed in the tree since — `server/src/eval/controls.test.ts`
and the eval control fixtures are visible in `git diff d35c4b6..HEAD` and are not
in this card's May edit. **No expectation was changed to fit a count and no test
was touched**; the count is simply what the tree holds today.

**The row failed once before it passed, and the cause is recorded.** The first
V4 attempt exited 1 at `npm run lint`:

```
Checking formatting...
[warn] scripts/v2/tauri-security.test.mjs
[warn] Code style issues found in the above file. Run Prettier with --write to fix.
```

That was this attempt's own edit to the one file it is allowed to edit. Fixed
with `npx prettier --write` on that file alone, then V4 re-run in full from the
top — not resumed from lint. The recorded run above is the complete one.

No file outside May edit was edited to reach a green row. A red `lint` or
`typecheck` in a file outside May edit would have been a stop and a report, not
something fixed here (HS-9).
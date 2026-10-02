# V4 — lint, typecheck, unit/integration and the Rust half

**Status: PASS.**

- Working directory: the repository root. The subshell carries the Rust half, so
  `cd src-tauri` has the cwd `RUN-CONFIG.md` §2 L2 requires, and the shell is
  left in the repository root afterwards.
- Command:

  ```sh
  export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node --version && npm test && npm run lint && npm run typecheck && ( export PATH="$HOME/.cargo/bin:$PATH" && cd src-tauri && cargo fmt --check && cargo clippy -- -D warnings && cargo test )
  ```

- Exit code: **0**.
- Start / end time: 2026-10-02T17:06:31Z / 2026-10-02T17:07:13Z.

```
v24.19.0
 Test Files  160 passed (160)
      Tests  2160 passed (2160)
running 55 tests
test result: ok. 55 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 15.01s
```

Every stage passed on the first execution of the row: `npm test`, `npm run lint`
(eslint, prettier, the no-external-URLs check, the licence check, the UI-strings
check), `npm run typecheck`, `cargo fmt --check`, `cargo clippy -- -D warnings`
and `cargo test`.

`cargo test` runs P3.3's navigation-guard unit tests, so a guard broken by this
card would fail here as well as in V2.

## One earlier attempt at this row, recorded because it happened

V4 was first run at 2026-10-02T17:05:48Z and exited **2**, at `typecheck`:

```
src/http/csp.ts(118,47): error TS6133: 'request' is declared but its value is never read.
```

The `onSend` hook's first parameter is part of Fastify's signature and the hook
does not read it. It was renamed `_request`, which is this repository's
convention for an unused parameter, and the row was re-run in full. The fix
changed no behaviour: no assertion, threshold or guard was touched.

## The freshness walk this row perturbed, deliberately not

This row refreshes two build-output directories under `src-tauri/`: `target/` by
every build, and `gen/schemas` by `tauri-build` on every build-script run, which
is exactly what `cargo clippy` and `cargo test` do. Both are excluded from V2's
freshness walk by the card's clause, and both are gitignored and untracked, so the
`git diff` predicate can never name them. V2's freshness check ran at 17:04:5x,
**before** this row, so this row is not evidence about the walk either way — it is
recorded here because it is the reason the exclusion is mandatory rather than
cosmetic.

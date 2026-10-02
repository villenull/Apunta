# P3.4 — V4, lint, typecheck, tests and the Rust half

Status: **PASS** (exit 0).

- Working directory: `/home/villenull/Projects/Apunta` (repository root); the
  Rust half runs in a subshell whose cwd is `src-tauri/` (RUN-CONFIG §2 L2
  after P3.3) and leaves the shell in the repository root
- Start: 2026-10-02T19:14:51Z
- End: 2026-10-02T19:16:11Z
- Exit code: 0

## Exact command

```sh
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node --version && npm test && npm run lint && npm run typecheck && ( export PATH="$HOME/.cargo/bin:$PATH" && cd src-tauri && cargo fmt --check && cargo clippy -- -D warnings && cargo test )
```

`node --version` printed exactly `v24.19.0`.

## Excerpt

```
 Test Files  160 passed (160)
      Tests  2160 passed (2160)
…
test result: ok. 55 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 15.01s
V4_EXIT=0
```

Every stage ran: the 160 test files and 2,160 tests, `eslint`, `prettier`,
`check-no-external-urls`, the licence check, the UI-string check, `typecheck`
across five workspaces, then `cargo fmt --check`, `cargo clippy -- -D warnings`
and 55 cargo tests — including P3.3's four navigation-guard cases
(`the_navigation_guard_refuses_anything_that_is_not_that_origin` and its
neighbours), so a guard broken by this card would fail here too.

**The one line this attempt changed that lint sees** is in `web/src/main.tsx`:
the permitted `https://example.invalid/` literal with its single line-scoped
`// eslint-disable-next-line no-restricted-syntax`. Lint is green with the
literal in place, which is the card's requirement — and it is green because the
rule was satisfied by the one suppression it authorises, not because the URL
was decomposed to dodge it. `eslint.config.js` was not edited (it is not in May
edit) and no file outside May edit was touched, so no red stage here needed a
stop.

Nothing was weakened to reach green: no test was skipped, no threshold moved,
no lint rule disabled beyond that single line-scoped suppression, which is the
one the card's Fixed decisions permit by name.
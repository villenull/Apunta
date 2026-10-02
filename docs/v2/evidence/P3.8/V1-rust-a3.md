# P3.8 V1 — Rust rows (attempt 3)

- **Status: PASS** · exit **0**
- Run on the changed tree. No test was deleted, renamed, `#[ignore]`d or
  loosened; no guard was relaxed (HS-7).

| Field | Value |
| --- | --- |
| Working directory | `src-tauri/` |
| Start (UTC) | 2026-10-02T22:50:02Z |
| End (UTC) | 2026-10-02T22:50:19Z |
| Exit code | 0 |

## Exact command

```sh
export PATH="$HOME/.cargo/bin:$PATH" && cargo fmt --check && cargo clippy -- -D warnings && cargo test
```

## Excerpt

```
cargo 1.99.0 (5f94df478 2026-08-27)
cargo fmt --check      -> no output, exit 0
cargo clippy -- -D warnings -> "Finished `dev` profile ...", no warning
test result: ok. 55 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 15.01s
```

- `cargo fmt --check`: silent. In particular it did **not** name
  `src-tauri/src/bridge.rs`, so Stop condition 7 was not reached.
- `cargo clippy -- -D warnings`: clean.
- **`cargo test`: 55 passed / 0 failed.** The card's cell says "13 passed,
  0 failed"; 13 is `main.rs`'s own `mod tests` (`grep -c '#\[test\]'
  src-tauri/src/main.rs` → **13**, unchanged) and the crate has 55 in total.
  Fixed decision 8 directs the *expectation* to be corrected to the file and
  reported, never the tests — the tally recorded here is the file's, and no test
  was touched.

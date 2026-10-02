# V1 baseline — the unmodified tree, so a later red is attributable

- Status: **PASS** at the base `a9166a0`
- Working directory: `~/Projects/Apunta/src-tauri`
- Command: `export PATH="$HOME/.cargo/bin:$PATH" && cargo fmt --check && cargo clippy -- -D warnings && cargo test`
- Start: 2026-10-02T20:45:58Z · End: 2026-10-02T20:46:15Z · Exit code: **0**

Excerpt:

```
test result: ok. 55 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 15.01s
```

`cargo fmt --check` and `cargo clippy -- -D warnings` were both silent. The
thirteen `mod tests` cases in `main.rs` all pass at the base. The tally and the
expectation correction are recorded in [V1-rust.md](V1-rust.md).
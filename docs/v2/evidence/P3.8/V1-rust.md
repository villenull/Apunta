# V1 — Rust rows, before and after the change (PASS both)

- Status: **PASS** at the base and **PASS** after the change. No test was
  deleted, renamed, `#[ignore]`d or loosened; no guard was weakened (HS-7).
- Working directory: `~/Projects/Apunta/src-tauri`
- Command: `export PATH="$HOME/.cargo/bin:$PATH" && cargo fmt --check && cargo clippy -- -D warnings && cargo test`

| Run | Tree | Start | End | Exit |
| --- | --- | --- | --- | --- |
| baseline (S1) | unmodified `a9166a0` | 2026-10-02T20:45:58Z | 2026-10-02T20:46:15Z | 0 |
| after (S3) | this card's `main.rs` | 2026-10-02T20:48:15Z | 2026-10-02T20:48:32Z | 0 |

Excerpt, both runs identical on the tally:

```
test result: ok. 55 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 15.02s
```

## Expectation correction, reported not applied (Fixed decision 8)

The card's Expected cell asks for "13 passed, 0 failed". `cargo test` at this
base reports **55 passed, 0 failed** for the whole crate. The thirteen are the
`#[test]` attributes of `mod tests` in `src-tauri/src/main.rs`, and all
thirteen are present and passing, before and after:

```
$ rg -c '^\s*#\[test\]' src/main.rs
13
$ rg -c '^test tests::.* \.\.\. ok' <cargo test output>
13
```

The crate's other 42 cases live in `bridge.rs` (16), `launch.rs` (13),
`lifecycle.rs` (5), `quit.rs` (5) and `signals.rs` (3). So the count is
corrected to the file, as Fixed decision 8 directs, and the thirteen are
reported individually by name in `V1-rust.md`. No test was touched.

## The one intermediate red, and why it happened

Between part (i) and the rest of the change the crate did not compile, and the
compiler is the reason the final diff contains one more line than the two parts
name on their face:

```
error: value assigned to `settled` is never read
   --> src/main.rs:297:21
    |
297 |                     settled = true;
    |                     ^^^^^^^^^^^^^^ this value is reassigned later and never used
...
303 |                 settled = true;
    |                 -------------- `settled` is overwritten here before the previous value is read
    = note: `-D unused-assignments` implied by `-D warnings`
```

The cause is in the card's own cited code: at the base the
window-would-not-open path is **not** in an `else`, it is straight-line code at
`:299-304` that only the success `break` at `:298` skipped over. Removing that
`break` alone therefore routes a successful launch straight into
`show_error("the_window_would_not_open")`. The `else` added in the final diff is
what makes Fixed decision 1(i)'s stated post-condition true — "the `ready` arm
falls through to the next event like every other arm" — and it is discussed in
the return file as the one deviation from a literal two-line change.
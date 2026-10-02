# P3.8 V1 — the Rust rows (attempt 2)

- **Status: PASS** · exit **0**
- No launch, no database, no network: `cargo` only. Nothing was started, so
  `scripts/v2/sandbox.mjs` was not required (HS-2 permits non-launching tests).

| Field | Value |
| --- | --- |
| Working directory | `src-tauri` |
| Start (UTC) | 2026-10-02T21:02:43Z |
| End (UTC) | 2026-10-02T21:03:01Z |

## Exact command

```sh
export PATH="$HOME/.cargo/bin:$PATH" && cargo fmt --check && cargo clippy -- -D warnings && cargo test
```

## Excerpt

```
    Finished `release` profile ... (fmt --check: no output)
    Finished (clippy: no warnings, no output)
running 55 tests
...
test tests::the_navigation_guard_allows_this_servers_own_origin_and_its_paths ... ok
test tests::the_navigation_guard_refuses_anything_that_is_not_that_origin ... ok
test tests::the_nonce_differs_between_calls_and_is_path_safe ... ok
test tests::the_origin_the_guard_allows_is_the_one_the_ready_line_produced ... ok
test tests::the_splash_and_error_urls_are_the_shells_own_assets ... ok
test tests::the_two_codes_are_named_and_never_interchanged ... ok
test tests::an_early_exit_is_never_reported_as_one_of_the_two_fixed_codes ... ok
test tests::an_exit_75_without_a_fatal_line_still_gets_its_own_word ... ok
test tests::the_guard_treats_the_effective_port_as_the_port ... ok
test tests::the_group_id_is_handed_out_exactly_once ... ok
test tests::an_incomplete_bundle_is_refused_rather_than_half_resolved ... ok
test result: ok. 55 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 15.03s
```

## Assertions read from the output

- `cargo fmt --check` silent — the change stayed inside `fn drive`; nothing named
  `src-tauri/src/bridge.rs` (Stop condition 7 not reached).
- `cargo clippy -- -D warnings` silent. The `unused_assignments` warning attempt 1
  reported for a literal one-line removal of the success `break` is absent
  because the coordinator-authorised `} else {` (AM-148) gives the success path
  its own block.
- `cargo test` → **`55 passed; 0 failed`**, of which exactly **13** are
  `main.rs`'s own `mod tests` (`test tests::…`).

### The tally, and the corrected expectation

The card's Expected cell asks for "13 passed, 0 failed". As attempt 1 reported
and as Fixed decision 8 directs, the *expectation* is corrected to the file and
the tests are untouched: 13 `#[test]` attributes exist in `main.rs` at this base
(counted in the file, and confirmed by the 13 `test tests::…` lines), and the
crate's total is 55 because `bridge.rs` (16), `launch.rs` (13), `lifecycle.rs`
(5), `quit.rs` (5) and `signals.rs` (3) hold the other 42. No test was deleted,
renamed, `#[ignore]`d or loosened — the diff touches no test.

# V1 — Rust fmt, clippy and test

Status: **PASS**
Working directory: `src-tauri` (the row's own `cd`)
Started: 2026-10-02T05:10:22Z
Ended: 2026-10-02T05:10:23Z
Exit code: **0**

## Exact command

```
$ export PATH="$HOME/.cargo/bin:$PATH" && cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

The `export` is not optional and its reason is in `V0-preflight.md`: A02 installs
`rustup` into `$HOME`, which is on `PATH` only for a session that exports it by
hand.

`--all-targets` is added to the row's `cargo clippy` so the test code is linted
too; it can only add findings, never remove them, and the row's three checks
all still ran.

## Versions in this shell

```
cargo 1.99.0 (5f94df478 2026-08-27)
rustc 1.99.0 (b940084d7 2026-09-28)
rustfmt 1.10.0-stable (b940084d7e 2026-09-28)
clippy 0.1.99 (b940084d7e 2026-09-28)
```

## Output

```
fmt=0
   Compiling apunta v0.0.0 (/home/<owner>/Projects/Apunta/src-tauri)
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.32s
clippy=0

test result: ok. 39 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.05s
```

`cargo fmt --check` printed nothing and exited 0. `cargo clippy --all-targets
-- -D warnings` printed no diagnostics and exited 0. `cargo test`: **39 passed, 0
failed**.

## What the 39 cover, by module

| Module | Cases | What they pin |
| --- | --- | --- |
| `bridge` (15) | the `ready` line C-BRIDGE@1 rule 1 fixes verbatim; field order; a wrong nonce; a missing nonce; another `protocol`; a port outside `1..=65535`; both fixed codes; an unrecognised code carried verbatim; `fatal` needs no nonce; a `fatal` without a code; an unknown outbound type reported rather than fatal; unreadable lines unreadable not fatal; a field name inside another field's value is not a field; escaped characters; the two codes never interchanged; the `shutdown` line's exact shape | the wire format, and the rule that a code travels **only** as its own line |
| `launch` (9) | a test build without `APUNTA_PORT`; without `APUNTA_DATA_DIR`; with an empty `APUNTA_PORT`; on port 7717; with both variables; production defaults to 7717 and the platform default folder; `XDG_DATA_HOME` honoured; a missing bundle refused; the four P3.1 overrides all inside the bundle; an incomplete bundle refused; identity and feature must agree; the two identities are distinct strings | E5, E10, C-ISO@1 rule 3, P3.1's launch contract |
| `lifecycle` (5) | shutdown → 10 s → SIGTERM → 5 s → SIGKILL; a child that exits at any point ends the ladder; SIGTERM is sent once, not on every poll; only two steps send a signal; the budgets are the card's values | the quit ladder, as a decision function with no child |
| `signals` (4) | SIGTERM 15 and SIGKILL 9 and they differ; SIGINT 2; the terminate handlers start clear; a **real** `sleep 30` spawned with `process_group(0)` is reachable by `kill(-pgid, …)`, stops on SIGTERM, and its group is gone afterwards | that the ladder's signals reach the child's group and nothing else |
| `main` (5) | an early exit is never reported as one of the two fixed codes; an exit 75 without a line still gets its own word; the two codes are named and never interchanged; the nonce differs per call and is path-safe; the splash and error URLs are the shell's own relative assets | that the shell never guesses a condition |

The `signals` case is a real process, not a description: it spawns `sleep 30`
with the same `process_group(0)` call `spawn` makes, probes the group with
`kill(-pgid, 0)` (signal 0 — checks permissions, sends nothing), sends SIGTERM
to the **group**, waits for the child to stop, and then asserts the group is
gone so the ladder would stop there rather than escalate to SIGKILL.

## One thing V1 could not do, and why it does not matter here

`tauri-build` refuses to compile when a path named in `tauri.conf.json`'s
`bundle.resources` does not exist, and that mapping points at
`build/linux-resources`, which is generated and never committed. With the
folder moved aside, `cargo clippy` exits 101 with
`resource path '../build/linux-resources' doesn't exist`. The CI Rust job
therefore has one `mkdir -p ../build/linux-resources` step before its three
checks (`.github/workflows/ci.yml`); nothing in the job reads it. Locally the
folder exists, so this row is unaffected.
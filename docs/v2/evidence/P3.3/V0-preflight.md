# V0 — pre-flight (toolchain and A03's packages)

Status: **PASS**
Working directory: repository root
Started: 2026-10-02T03:52:56Z (first probe, before A02)
Ended: 2026-10-02T05:10:23Z (re-probed with the toolchain in place, for V1)

## The exact command, and its exact output

```
$ { command -v cargo rustc rustup; rustc --version; command -v Xvfb xvfb-run xdotool; pkg-config --modversion webkit2gtk-4.1; }
```

**First run, 2026-10-02T03:52:56Z — `cargo` absent, exit 0 for the compound
command but with the toolchain missing.** This is the state the card predicted,
and it is why A02 is this card's own agent-run work:

```
/usr/bin/bash: line 1: rustc: command not found
/usr/bin/Xvfb
/usr/bin/xvfb-run
/usr/bin/xdotool
2.52.6
```

`ls ~/.cargo` → `No such file or directory`, so neither `cargo`, `rustc` nor
`rustup` existed, in `$PATH` or anywhere else in `$HOME`.

**After A02 was installed (see `acquisition-A02-A04-A05.md`), the same command:**

```
$ { command -v cargo rustc rustup; rustc --version; command -v Xvfb xvfb-run xdotool; pkg-config --modversion webkit2gtk-4.1; }
/home/<owner>/.cargo/bin/cargo
/home/<owner>/.cargo/bin/rustc
/home/<owner>/.cargo/bin/rustup
rustc 1.99.0 (b940084d7 2026-09-28)
/usr/bin/Xvfb
/usr/bin/xvfb-run
/usr/bin/xdotool
2.52.6
```

Exit code: **0**.

- `cargo` / `rustc` / `rustup` — A02, agent-run, `rustc 1.99.0`, `cargo 1.99.0
  (5f94df478 2026-08-27)`, `rustup 1.29.1 (d95a37b6a 2026-08-13)`, installed into
  `~` by `sh.rustup.rs`, no sudo, no system package.
- `rustfmt 1.10.0-stable` and `clippy 0.1.99` were added afterwards with
  `rustup component add rustfmt clippy`, because V1's three commands need them
  and the `--profile minimal` install omits both.
- `Xvfb`, `xvfb-run`, `xdotool` — the owner-run A03 action, already **RESOLVED**
  in `docs/v2/state/OWNER-ACTIONS.md` before this dispatch:
  `xorg-server-xvfb 21.1.24-1` and `xdotool 4.20260303.1-1`. Nothing was
  installed by this session; `command -v` finds all three at `/usr/bin/`.
- `pkg-config --modversion webkit2gtk-4.1` → `2.52.6`, matching the
  `webkit2gtk-4.1 2.52.6-1` the coordinator recorded as installed.

So V0 is green on every item, and the two halves were obtained the two ways
ACQUISITION prescribes: A02 agent-run into `$HOME`, A03 owner-run through the
graphical prompt.

## The `export` V1 and V2 need

`rustup` lands in `$HOME/.cargo/bin`, which is on `PATH` only for a shell that
sources `$HOME/.cargo/env`. A re-dispatched session starts with the host's
`PATH` and would exit 127. Every Rust command in this card's evidence therefore
begins with:

```
export PATH="$HOME/.cargo/bin:$PATH"
```
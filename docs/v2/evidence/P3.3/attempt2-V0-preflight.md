# V0 — pre-flight (attempt 2)

**Status: PASS. Exit 0.** Working directory: repository root.
Start 2026-10-02T06:47Z, end 2026-10-02T06:47Z (both UTC).

Exact command (the card's V0 command, with `cargo --version` and
`rustup --version` added because A02's record has to name a toolchain):

```sh
export PATH="$HOME/.cargo/bin:$PATH" && { command -v cargo rustc rustup; rustc --version; command -v Xvfb xvfb-run xdotool; pkg-config --modversion webkit2gtk-4.1; cargo --version; rustup --version; }
```

Exact output, first, as the row requires:

```
~/.cargo/bin/cargo
~/.cargo/bin/rustc
~/.cargo/bin/rustup
rustc 1.99.0 (b940084d7 2026-09-28)
/usr/bin/Xvfb
/usr/bin/xvfb-run
/usr/bin/xdotool
2.52.6
cargo 1.99.0 (5f94df478 2026-08-27)
rustup 1.29.1 (d95a37b6a 2026-08-13)
info: This is the version for the rustup toolchain manager, not the rustc compiler.
info: the currently active `rustc` version is `rustc 1.99.0 (b940084d7 2026-09-28)`
```

The untouched output, with the command echoed, is `build/p33-correct-v0.log`
(git-ignored scratch).

All five probes the row names are present: `cargo`, `rustc`, `rustup`, `Xvfb`,
`xvfb-run`, `xdotool`, and WebKitGTK 2.52.6.

## No A02 and no A03 in this attempt

- **A02 (the Rust toolchain) was already installed** when this attempt opened:
  `~/.cargo/bin` exists with `cargo 1.99.0`, `rustc 1.99.0`, `rustup 1.29.1`.
  Attempt 1 acquired it and recorded it in `acquisition-A02-A04-A05.md`; this
  attempt **downloaded nothing**. Nothing was installed, acquired or resolved in
  attempt 2.
- **A03 was already RESOLVED** before this attempt (`docs/v2/state/cards/P3.3.json`
  carries the `→ **RESOLVED**` line), and the three package probes above confirm
  the WebKitGTK development library is still present. No `apt`, no `sudo`, no
  substituted package source, at any point (HS-3).

## The one thing this attempt could not run here, and why it is not V0's problem

V0's own tools are all present. The **window manager** is not, and that is not
one of V0's probes — it is what makes V3's cooperative-close criterion
`NOT RUN`, recorded in `attempt2-V3-launch.md` with the measurement behind it.
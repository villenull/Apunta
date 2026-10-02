# Acquisitions: A02, A04, A05

Everything acquired by this card, with the exact version, the URL, the size, the
SHA-256 (or the package manager's own integrity string), the licence evidence and
the date — ACQUISITION §1's requirements. Nothing outside `docs/v2/ACQUISITION.md`
was downloaded (HS-3), no package source was substituted, and `sudo` was never
used and no password was typed, stored, passed to a command or written anywhere.

**A03 was not acquired by this card.** It is owner-run and was already
`→ **RESOLVED**` in `docs/v2/state/OWNER-ACTIONS.md` before this dispatch
(`webkit2gtk-4.1 2.52.6-1`, `xdo 0.5.7-3`, `libayatana-appindicator 0.6.0-2`,
`xorg-server-xvfb 21.1.24-1`, `xdotool 4.20260303.1-1`). Recorded in
`V0-preflight.md`.

---

## A02 — Rust stable toolchain via `rustup` (agent-run, into `$HOME`)

A02's row: *"Rust stable toolchain via `rustup`, only if `cargo` is missing"*,
sources `static.rust-lang.org` and `sh.rustup.rs`, no query keys, not shipped,
card P3.3.

`cargo` **was** missing (`ls ~/.cargo` → `No such file or directory`), so this
row's condition held and the install was authorised.

| Field | Value |
| --- | --- |
| Item | A02, Rust stable toolchain |
| Date | 2026-10-02 (installer fetched 2026-10-02T03:52Z) |
| Installer URL | `https://sh.rustup.rs` |
| Installer size | 29 915 bytes |
| Installer SHA-256 | `7d0ea0f8eba7fa1ebfe998091cd7ec4501e33ec5ca6b884eb4d894d7da5170af` |
| Redirect / component hosts | `static.rust-lang.org` (the row's second admitted host; observed serving the channel manifest and components) |
| Query keys | none — the installer was fetched with `curl -sSf --proto '=https' --tlsv1.2` and no query string |
| Installed version | `rustc 1.99.0 (b940084d7 2026-09-28)`, `cargo 1.99.0 (5f94df478 2026-08-27)`, `rustup 1.29.1 (d95a37b6a 2026-08-13)` |
| Profile | `minimal`, `--no-modify-path` |
| Components added after | `rustfmt 1.10.0-stable (b940084d7e 2026-09-28)`, `clippy 0.1.99 (b940084d7e 2026-09-28)` — V1 runs both |
| Toolchain archive | `https://static.rust-lang.org/dist/2026-10-01/rust-1.99.0-x86_64-unknown-linux-gnu.tar.xz` (implied by the channel manifest; `rustup-init` verifies it) |
| On-disk size | `~/.cargo` 826 MB, `~/.rustup` 617 MB |
| Licence evidence | Rust is dual **MIT OR Apache-2.0** (`rust-lang/rust` `LICENSE-MIT`, `LICENSE-APACHE`); rustup is dual **MIT OR Apache-2.0**. Not shipped: it is a development tool, which L-POLICY@1's second row permits under any OSI licence |
| Shipped in the app? | **No** — a build-time tool, like `cmake` |

Command, verbatim, and its exit code (0):

```
$ curl -sSf --proto '=https' --tlsv1.2 https://sh.rustup.rs -o rustup-init.sh
$ sh rustup-init.sh -y --no-modify-path --profile minimal --default-toolchain stable
   stable-x86_64-unknown-linux-gnu installed - rustc 1.99.0 (b940084d7 2026-09-28)
$ rustup component add rustfmt clippy
```

No `sudo`, no password, no system package, no distribution package
(`rustup` installs into `$HOME/.cargo` and `$HOME/.rustup` only).
`--no-modify-path` means no shell rc file was edited, so a fresh session needs
the `export PATH="$HOME/.cargo/bin:$PATH"` that V1 and V2 carry.

---

## A04 — `@tauri-apps/cli`, one `npm install --save-dev`

A04's row: *"`@tauri-apps/cli`, same minor as the `tauri` crate`"*, npm registry,
not shipped, card P3.3. Same minor as A05's `tauri` **2.12.1** → CLI **2.12.1**.

| Field | Value |
| --- | --- |
| Item | A04 |
| Version | `2.12.1` |
| Date | 2026-10-02 |
| URL | `https://registry.npmjs.org/@tauri-apps/cli/-/cli-2.12.1.tgz` |
| Integrity (npm) | `sha512-kEDEiGzG+yAc5FeLxtXpES/VN+F2C8H0r4gDVtfRLKxT9np9101d9REG/Kgo2lr0hKi0IpDsODiHnU3+naOmLg==` |
| Recorded in | `package.json` devDependencies `"@tauri-apps/cli": "^2.12.1"` and `package-lock.json` (12 entries, all `dev: true`) |
| Licence evidence | **MIT OR Apache-2.0** (`tauri-apps/tauri` `LICENSE`) |
| Shipped in the app? | **No** — a devDependency, and the only thing that makes it a non-shipped one is the `dev` flag |

Command and exit code (0):

```
$ npm install --save-dev @tauri-apps/cli@2.12.1
```

The npm registry's `dist-tags.latest` was `2.12.1` on the acquisition day, so the
"same minor as the `tauri` crate" rule and the newest published CLI agree.

**`THIRD-PARTY-LICENSES.md` is unchanged**, as the card's Fixed decision
requires: `scripts/collect-licenses.mjs:116-117` skips devDependencies and
`entry.link === true`, and `npm run lint`'s `collect-licenses.mjs --check` passes
("lists all 111 shipped packages"). The file was not regenerated.

---

## A05 — four crates, resolved once

A05's row: *"`tauri` (≥ 2.11.1, newest 2.x patch on acquisition day),
`tauri-build` (matching), `tauri-plugin-updater` (≥ 2.10.1, newest 2.x),
`tauri-plugin-single-instance` (newest 2.x), and their transitive
dependencies"*, crates.io, shipped.

**Selection rule applied, not replaced.** Each version below was read from
crates.io on the acquisition day and is the newest 2.x at that moment:

| Crate | Floor | Newest 2.x on 2026-10-02 | Taken | Licence |
| --- | --- | --- | --- | --- |
| `tauri` | ≥ 2.11.1 | **2.12.1** | 2.12.1 | `Apache-2.0 OR MIT` |
| `tauri-build` | matching | **2.7.1** | 2.7.1 | `Apache-2.0 OR MIT` |
| `tauri-plugin-updater` | ≥ 2.10.1 | **2.13.1** | 2.13.1 | `Apache-2.0 OR MIT` |
| `tauri-plugin-single-instance` | newest 2.x | **2.5.2** | 2.5.2 | `Apache-2.0 OR MIT` |

All four satisfy L-POLICY@1's shipped row (MIT and Apache-2.0 are both allowed).

| Field | Value |
| --- | --- |
| Source | crates.io (`registry+https://github.com/rust-lang/crates.io-index`), the row's only admitted host |
| Query keys | none — cargo's registry protocol, no query string |
| Resolved exactly once | `src-tauri/Cargo.lock` was created by the first `cargo fetch`/`cargo build` and **not re-resolved**; `cargo update` was never run. `Cargo.toml` pins each of the four with `=` (e.g. `tauri = { version = "=2.12.1" }`), so a later resolution cannot move them |
| Transitive dependencies | **resolved, not added.** 493 `[[package]]` entries in `Cargo.lock`, 492 `.crate` files in `~/.cargo/registry/cache/`. No crate outside A05's four is a **direct** dependency in `Cargo.toml` |
| Date | 2026-10-02 |

### The four, with size and checksum

`checksum` is the value crates.io publishes and `Cargo.lock` pins — the SHA-256
of the `.crate` file, verified by cargo on extraction:

| Crate | Crate size (bytes) | SHA-256 (`Cargo.lock` `checksum`) |
| --- | --- | --- |
| `tauri` 2.12.1 | 324 974 | `ed99ee9694a2deb776d91cae48ac7411ddfc89ecae2f9b5041111d8c88f2ace9` |
| `tauri-build` 2.7.1 | 42 657 | `59563ca5b331fd97f27ee9672ec8d36d33bb3c9e2c9f6710a1a5687256052e45` |
| `tauri-plugin-updater` 2.13.1 | 73 751 | `3cb0b2ea3e85ca287990d3859a29cc5cb18024240fd78f62e027fb7963670f18` |
| `tauri-plugin-single-instance` 2.5.2 | 47 102 | `ee2c8fe2d6b75caed0153f91eda30ea1dea3bfb6710d5adb80456d2c035a569d` |

### The crates that genuinely ship inside the binary

A05's transitive closure is what ends up linked into the AppImage, and the card
says explicitly that **the manual licensing entry for these belongs to the final
report (P5.5), not to this card** — so nothing is added to
`THIRD-PARTY-LICENSES.md` here. The main direct chain, read out of `Cargo.lock`,
for whoever writes that report:

```
apunta → tauri 2.12.1 → tauri-runtime 2.12.1 → wry 0.57.0 → tao 0.37.1
                   → tauri-plugin 2.7.1 → tauri-plugin-updater 2.13.1 → minisign-verify 0.2.5
                   → tauri-plugin-single-instance 2.5.2
        tauri-build 2.7.1 (build-time only; not linked into the app)
```

`tauri-plugin-updater` is a declared dependency and is **not registered** by
this card: P5.4 owns the update code, and the shell registers no endpoint, no
public key and no capability for it.

Note also that an AppImage bundles the system WebKitGTK (LGPL) dynamically rather
than statically; L-POLICY@1's row for system libraries allows that for **test
builds** and requires owner review for public distribution. That is a P5.5 /
release matter and is named here only so it is not discovered late.

---

## What was **not** acquired

- No Ollama model, tag or digest (A08, A13–A15 untouched; `ollama` was only
  *queried* over loopback, to assert it was still running).
- No whisper.cpp source or model (A06, A07) — P3.1's existing build was reused
  by `package-linux-resources.sh`, which reuses the existing clone rather than
  fetching again.
- No `apt`, no `sudo`, no substituted package source, and no `pacman`
  invocation by this card: A03's packages were already installed by the owner.
- No Python, no Piper, no Spanish dictionary, no fonts.
- `patchelf` was **not** needed and was not installed; V2's AppImage built
  without it, which closes the instruction review's note 7.
- Tauri's own bundler tooling (`AppRun-x86_64`, `linuxdeploy-x86_64.AppImage`,
  `linuxdeploy-plugin-appimage-x86_64.AppImage`, all from `github.com`) was
  fetched by the A04 CLI while running `tauri build`. It is build tooling that
  enters neither the app nor the repository, and no ACQUISITION row covers it
  for that reason. Recorded here rather than omitted.
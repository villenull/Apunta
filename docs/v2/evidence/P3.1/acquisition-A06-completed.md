# A06 — whisper.cpp source and the built `whisper-cli`

This supersedes the "acquired, then blocked at the build step" record in
`acquisition-A06.md` from attempt 1. That file is left as the record of the
first attempt; this one records the acquisition as **completed**, with the
binary it produced.

## The item

| Field | Value |
| --- | --- |
| Item / revision | **A06**, `371b5a7561823ab2bb32142d2751e35e7534727b` (tagged `v1.9.3`) |
| URL | `https://github.com/ggml-org/whisper.cpp.git` — `github.com` only, no mirror |
| Redirect hosts used | none observed |
| Query keys sent | none |
| Source location | `/tmp/apunta-v2/whisper-src/whisper.cpp` |
| Source integrity | verified by pinned commit; `git rev-parse HEAD` equals the pin |
| Backend | `vulkan` (the card's fixed choice; `hip` needs the absent `hipcc`) |
| Licence evidence | `LICENSE` at the pinned revision: **MIT**, "Copyright (c) 2023-2026 The ggml authors" |
| Date | source acquired 2026-09-28; binary built 2026-09-29 |

## The binary

| Field | Value |
| --- | --- |
| Path in the bundle | `bin/whisper-cli` |
| Size | **1064648 bytes** |
| SHA-256 | **`3a9f516ded6dc6f619e96570ac326922c5718e5e6bca03a735e5d07bd60804de`** |
| Build type | `Release`, `-DGGML_VULKAN=ON`, `-DGGML_NATIVE=OFF` |
| Relocatability | `RUNPATH: $ORIGIN:` — no build-tree path is embedded |
| Verified by | `bin/whisper-cli --help` exits 0 **from the relocated bundle**, with `PATH=/usr/bin:/bin` |

### Shared libraries shipped beside it

15 entries copied with `cp -P` (SONAME symlink chains preserved), 5 real
objects totalling ~58 MB, the largest being `libggml-vulkan.so.0.20.2` at
55818488 bytes:

```
libwhisper.so      -> libwhisper.so.1     -> libwhisper.so.1.9.3      (638496)
libggml.so         -> libggml.so.0        -> libggml.so.0.20.2       (55208)
libggml-base.so    -> libggml-base.so.0   -> libggml-base.so.0.20.2  (952528)
libggml-cpu.so     -> libggml-cpu.so.0    -> libggml-cpu.so.0.20.2   (1052944)
libggml-vulkan.so  -> libggml-vulkan.so.0 -> libggml-vulkan.so.0.20.2 (55818488)
```

Not bundled, and resolved from the host: `libstdc++`, `libgcc_s`, `libgomp`,
`libc`, `libm`, and `libvulkan.so.1`. The Vulkan loader is the host's ICD loader
and must match the host's driver. See *Deviations* 3 in
`attempt1-verification.md`.

## Not an acquisition, and why

- **A01 was not re-acquired.** The Node 24.19.0 tree was **copied** from
  `~/.local/share/apunta-node/node-v24.19.0-linux-x64`, where P0.1 installed it,
  and verified by running the copy's `bin/node`. P0.1's recorded tarball
  SHA-256 `f625d97cd707df4ff96254916fbc5ff014f09c09effe5a1e0ca8f6d41a8789d4` is
  printed by the packaging script for traceability. No A01 download occurred.
- **The A06 clone was not re-cloned.** It already existed from attempt 1, and
  `scripts/build-whisper-candidate.sh` reuses an existing clone. The re-run is a
  redundant `git fetch --depth 1 origin <pinned-rev>` plus a rebuild.
- **`better-sqlite3` was not rebuilt.** Its NAPI prebuild was copied from
  `node_modules/`. `npm rebuild better-sqlite3` and the package's
  `deps/download.sh` (which fetches from sqlite.org, which no
  `ACQUISITION.md` row covers) were never run.

## Every network request made by this session

One, to `github.com`, inside the A06 step the card fixes:

1. `git fetch --depth 1 origin 371b5a7561823ab2bb32142d2751e35e7534727b`

No host other than `github.com` was contacted. No query string was sent, and no
user data, note content or machine identifier left this PC. `npx --yes esbuild`
resolved the already-installed hoisted `node_modules/.bin/esbuild` and contacted
no registry. `pacman -Ss spirv` read the local package database and downloaded
nothing.

## Tools installed

**None by this session** (HS-3). Two owner-installed packages unblocked the
build and are recorded because they changed what V1 could do:
`vulkan-headers 1:1.4.357.0-1` and `spirv-headers 1:1.4.357.0-1`, both members
of Arch's `vulkan-devel` group. `patchelf` remains absent and is no longer
needed. No Ollama model was pulled, removed or replaced.

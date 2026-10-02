# P3.4 — step S0, the A06 acquisition

Status: **PASS** (acquisition completed; the candidate is executable)

- Card: P3.4, attempt 3 of 3, step **S0**
- Working directory: `/home/villenull/Projects/Apunta` (repository root)
- Start: 2026-10-02T18:57:49Z
- End: 2026-10-02T19:00:13Z (2 min 24 s, most of it the CMake/ninja
  `whisper-cli` build)
- Exit code: 0

## Exact command

```sh
export APUNTA_WHISPER_WORK_DIR="$HOME/.cache/apunta-v2/whisper-src"
test -x "${APUNTA_WHISPER_WORK_DIR}/whisper.cpp/build-${APUNTA_WHISPER_BACKEND:-vulkan}/bin/whisper-cli"
# exit 1 -> the candidate is absent, so S0 runs (this is V0's own precondition test)
nohup env APUNTA_WHISPER_BACKEND=vulkan \
  APUNTA_WHISPER_WORK_DIR="$APUNTA_WHISPER_WORK_DIR" \
  APUNTA_BUILD_JOBS=4 \
  bash scripts/build-whisper-candidate.sh > <sandbox>/s0.log 2>&1
```

## What it acquired, and only that

| Field | Value |
| --- | --- |
| Item | **A06** — whisper.cpp source, to build `whisper-cli` |
| Pinned revision | `371b5a7561823ab2bb32142d2751e35e7534727b`, pinned by `scripts/build-whisper-candidate.sh:19`, applied as written |
| Revision verification | `git -C <work>/whisper.cpp rev-parse HEAD` = `371b5a7561823ab2bb32142d2751e35e7534727b`, equal to the pin. The builder's own `:79-82` check passed (it exits 2 otherwise) |
| URL | `https://github.com/ggml-org/whisper.cpp.git` (`scripts/build-whisper-candidate.sh:18`) |
| Allowed host used | `github.com` |
| Redirect host used | none observed (`codeload.github.com` is admitted by the row; it was not needed) |
| Query keys sent | **none** — the clone URL and the `git fetch` refspec carry no query string |
| Source location | `~/.cache/apunta-v2/whisper-src/whisper.cpp` (`APUNTA_WHISPER_WORK_DIR`, outside reclaimable `/tmp`) |
| Backend | `vulkan` (fixed by S0; `hip` needs the absent `hipcc`, `cpu` is not a substitute) |
| Candidate | `~/.cache/apunta-v2/whisper-src/whisper.cpp/build-vulkan/bin/whisper-cli` |
| Candidate size | 1,064,648 bytes |
| Candidate SHA-256 | `3a9f516ded6dc6f619e96570ac326922c5718e5e6bca03a735e5d07bd60804de` |
| Licence evidence | `LICENSE` at the pinned revision: **MIT License**, "Copyright (c) 2023-2026 The ggml authors" |
| Date | 2026-10-02 |

`sha256` above is the builder's own line, recorded verbatim from
`scripts/build-whisper-candidate.sh:111-113`:

```
source=~/.cache/apunta-v2/whisper-src/whisper.cpp
revision=371b5a7561823ab2bb32142d2751e35e7534727b
backend=vulkan
candidate=~/.cache/apunta-v2/whisper-src/whisper.cpp/build-vulkan/bin/whisper-cli
sha256=3a9f516ded6dc6f619e96570ac326922c5718e5e6bca03a735e5d07bd60804de
```

## Every network request the step made, named one by one

1. `GET https://github.com/ggml-org/whisper.cpp.git` — the single `git clone
   --filter=blob:none --no-checkout` (`scripts/build-whisper-candidate.sh:71`).
   Log line: `Cloning into '.../whisper.cpp'...`
2. `GET https://github.com/ggml-org/whisper.cpp` — the single pinned-revision
   `git fetch --depth 1 origin 371b5a75…` (`:77`). Log line:
   `From https://github.com/ggml-org/whisper.cpp` /
   `* branch  371b5a7561823ab2bb32142d2751e35e7534727b -> FETCH_HEAD`

Nothing else touched a network. No redirect was followed, no query string was
sent, no other host was contacted, and no model, toolchain, tarball or crate was
acquired (HS-3): A06 and nothing else.

## Not an acquisition

The build itself is local. `cmake` (`:107`) and `cmake --build … --target
whisper-cli` (`:108`) compile from the checked-out tree; `WHISPER_CURL=OFF`,
`WHISPER_BUILD_TESTS=OFF`, `WHISPER_BUILD_SERVER=OFF` and `GGML_CCACHE=OFF` mean
nothing was downloaded during configure or build. **No whisper model** (that is
A07), **no Node tarball** (A01), **no Rust toolchain** (A02), **no crate**
(A05), **nothing from any host outside the two A06 admits.**

## Reuse, and why a second run acquires nothing

`cmake`, `git`, `sha256sum` and `glslc` were already on the host and used as
found (`scripts/build-whisper-candidate.sh:45-59` checks and exits 2 if any is
missing; it did not). The resume anchor is V0's own test:

```sh
test -x "$APUNTA_WHISPER_WORK_DIR/whisper.cpp/build-vulkan/bin/whisper-cli"
```

It now exits 0, so **S0 is skipped on any later run** and V0 proceeds. Nothing
already pinned and verified is downloaded again. Note `:77` fetches the pinned
revision unconditionally on every run, clone or no clone — so the only way a
producer run touches no network at all is for the candidate to be already
executable, which is exactly what the anchor guarantees.

Nothing was substituted and nothing was fabricated: no other backend, no other
revision, no `whisper-cli` adopted from elsewhere on the machine (the pre-built
copy in `build/linux-resources/bin/` is an output Rule B names as never an
input), no install of a missing piece, and no hand-made
`build-vulkan/bin/whisper-cli`.

## Aftermath

- The tree lives under `~/.cache/apunta-v2/whisper-src` — 14 MB of `.git` and
  392 MB of `build-vulkan` — deliberately outside `/tmp`, because P3.1 lost one
  tree there and attempt 2 of this card was stopped by its absence.
- Raw log: 446 lines, in the scratch folder, deleted; this file is the record.
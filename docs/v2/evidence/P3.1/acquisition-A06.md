# A06 acquisition record — whisper.cpp source (P3.1)

Card P3.1, attempt 1. `ACQUISITION.md` row **A06**: whisper.cpp source at the
revision pinned in `scripts/build-whisper-candidate.sh`, to build
`whisper-cli`. Allowed host `github.com` (redirect host `codeload.github.com`),
no allowed query keys.

## Result: source acquired; `whisper-cli` NOT built — `vulkan` backend blocked

| Field | Value |
| --- | --- |
| Item | A06 |
| Repository | `https://github.com/ggml-org/whisper.cpp.git` |
| Revision (pinned, verified) | `371b5a7561823ab2bb32142d2751e35e7534727b` (whisper.cpp `v1.9.3`, tag comment from the checkout: `release : v1.9.3 (#4000)`) |
| Clone location (side effect) | `/tmp/apunta-v2/whisper-src/whisper.cpp` (`APUNTA_WHISPER_WORK_DIR=/tmp/apunta-v2/whisper-src`) |
| Remote verified | `git remote get-url origin` → `https://github.com/ggml-org/whisper.cpp.git` (exact, no mirror) |
| Licence evidence | MIT — `LICENSE` at the pinned revision, in the clone at `<work dir>/whisper.cpp/LICENSE` |
| Date | 2026-09-28 |
| Network requests | one `git clone` of the pinned repository from `github.com`; one `git fetch --depth 1 origin 371b5a75…`. No other host contacted, no query string sent. |

## Build attempt

Command, verbatim, with the backend the card fixes:

```
APUNTA_WHISPER_BACKEND=vulkan \
APUNTA_WHISPER_WORK_DIR=/tmp/apunta-v2/whisper-src \
APUNTA_BUILD_JOBS=4 \
bash scripts/build-whisper-candidate.sh
```

The script's own tool gate (`scripts/build-whisper-candidate.sh:45-59`) **passed**:
`cmake`, `git` and `sha256sum` are present, and for the `vulkan` backend it
requires `glslc`, which is present. The clone, the pinned-revision fetch, the
remote check and the revision verification all passed. CMake configuration then
failed:

```
CMake Error at /usr/share/cmake/Modules/FindPackageHandleStandardArgs.cmake:290 (message):
  Could NOT find Vulkan (missing: Vulkan_INCLUDE_DIR) (found version "")
Call Stack (most recent call first):
  /usr/share/cmake/Modules/FindPackageHandleStandardArgs.cmake:654 (_FPHSA_FAILURE_MESSAGE)
  /usr/share/cmake/Modules/FindVulkan.cmake:780 (find_package_handle_standard_args)
  ggml/src/ggml-vulkan/CMakeLists.txt:9 (find_package)

-- Configuring incomplete, errors occurred!
```

`whisper-cli` was not produced. `build-vulkan/` contains a `CMakeCache.txt`
only; `build-vulkan/bin/whisper-cli` does not exist.

## Why this is a stop condition, and which one

The card's first stop condition names "`cmake` **or the compiler the chosen
backend needs**" and the tool missing for `hip`. On this box the corrected text
is right that `cmake` 4.4.3 and `glslc` 2026.3 are present, and `hipcc` is the
one absent compiler — but the correction is incomplete, and the failure is not
the one the card predicted. The `vulkan` backend needs a Vulkan **SDK**
(`vulkan.h` and friends) in addition to the `glslc` compiler, and the SDK
headers are not installed.

Evidence that the SDK headers, not the compiler, are what is missing:

| Check | Result |
| --- | --- |
| `command -v glslc` | `/usr/bin/glslc`, `glslc --version` → `2026.3` (shaderc 1:1.4.357.0) |
| `command -v cmake` | `/usr/bin/cmake`, `--version` → `cmake version 4.4.3` |
| `command -v hipcc` | absent (the one absent compiler; the `hip` backend's tool) |
| `find /usr/include /usr/local/include -name 'vulkan*'` | only `/usr/include/gstreamer-1.0/gst/vulkan/` and `/usr/include/libplacebo/vulkan.h`; **no `vulkan/vulkan.h`** |
| `find / -xdev -name vulkan.h -o -name vulkan_core.h` | the same two, neither of which is the Khronos SDK |
| `ldconfig -p \| grep vulkan` | `libvulkan.so`, `libvulkan.so.1` present (the **loader**, from `vulkan-icd-loader` 1.4.357.0-1) |
| `pacman -Q glslang shaderc vulkan-icd-loader` | all three installed; the `vulkan-headers` package is **not** among them |
| minimal `find_package(Vulkan REQUIRED)` probe | reproduces the identical `Could NOT find Vulkan (missing: Vulkan_INCLUDE_DIR)` |

So the runtime loader and the shader compiler are installed and the **SDK
headers are not** — `Vulkan_INCLUDE_DIR` is the only missing component, and
`ggml-vulkan/CMakeLists.txt:9` requires it.

## The two things this stop condition forbids, and why neither was done

- **Installing the missing piece.** `vulkan-headers` is not an `ACQUISITION.md`
  row and `apt`/`pacman` needs the owner's password, so it is an owner action
  (HS-3, and the card's "Agents never install a tool"). No package was
  installed. The exact owner action is in the return file.
- **Substituting a different toolchain to get a green row.** `whisper.cpp`'s
  `cpu` backend would build with no Vulkan at all, and `hip` would need
  `hipcc`. The card fixes `vulkan` as the backend and says plainly: "Do not
  substitute a different toolchain to get a green row." Neither was used, and no
  `whisper-cli` from another build or from elsewhere on the machine was adopted
  (the card's second stop condition).

## Effect on the rows

`bin/whisper-cli` cannot exist, so per the card — "A missing `bin/whisper-cli`
is the Stop-condition path below (`BLOCKED` with the report), never a pass" —
**V1 is `BLOCKED`**. V2's `whisper-cli --help` check cannot pass either, so
**V2 is `BLOCKED`**. The `build/linux-resources/` folder is therefore never
written, and **V3 and V4 are `NOT RUN`**: they read `manifest.json` and
`server/server.mjs`, which do not exist, and the card is explicit that "a run
that cannot execute because the bundle is missing: that is `NOT RUN`, not a
pass."

## Re-run bound

`scripts/build-whisper-candidate.sh` **reuses an existing clone** (`:70-72`
skips `git clone` when `$SRC/.git` exists). A re-run after the owner installs
the Vulkan SDK headers is therefore a **redundant fetch of the same pinned
revision and a rebuild, not a second acquisition of A06** — the acquisition
recorded above stands.

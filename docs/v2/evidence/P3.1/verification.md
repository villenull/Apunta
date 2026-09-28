# P3.1 attempt 1 — verification rows (RUN-CONFIG §4)

Card: P3.1 Linux runtime resource layout. Attempt 1 of 3.
Base commit: **`d89c0ef`** ("Dispatch P3.1 attempt 1 implementation"),
branch `feature/v2`.

> **Base-commit discrepancy, disclosed.** The dispatch file's generated header
> and its return template both read `3610cda`; the session brief and HEAD both
> read `d89c0ef`. `d89c0ef` is the commit that *contains* the dispatch, and its
> parent is `3610cda`, so the dispatched content is identical either way. This
> is the same one-commit-behind shape the third instruction review recorded as
> `o-1` ("the base is an explicitly fillable runtime placeholder … it is the
> coordinator's to set at dispatch time"). The run used `d89c0ef` = actual HEAD,
> so the dispatch's "if HEAD is not the base commit, stop and report" check
> passes.

Every command below ran from the **repository root** with
`export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH"`
first, and `node --version` printed exactly `v24.19.0` (the box default is a
mise shim at v26.8.2, outside `engines: ">=24.19.0 <25"`).

## Result summary

| ID | Status | Exit code | Evidence |
| --- | --- | --- | --- |
| V1 | **BLOCKED** | `1` | this file, §V1 |
| V2 | **BLOCKED** | `1` | this file, §V2 |
| V3 | NOT RUN | `1` | this file, §V3 |
| V4 | NOT RUN | `1` | this file, §V4 |

The blocker is one thing and it is an owner action: the `vulkan` backend needs
the **Vulkan SDK headers** (`vulkan.h`), which are not installed on this PC.
`cmake` 4.4.3 and `glslc` 2026.3 are present and `hipcc` is absent, exactly as
AM-066 F2 records — but `glslc` alone does not make the `vulkan` backend
buildable, which is the card-text error this run found. See
`acquisition-A06.md` for the full evidence and the exact owner action.

V3 and V4 are `NOT RUN` rather than `FAIL`: they read `manifest.json` and
`server/server.mjs`, and `build/linux-resources/` does not exist, because V1
deletes the half-built folder on the stop condition rather than leave an
incomplete bundle that a later row could mistake for a finished one. The card
is explicit that "a run that cannot execute because the bundle is missing: that
is `NOT RUN`, not a pass."

---

## V1 — package (BLOCKED, exit 1)

- **Working directory:** `<repo>`
- **Exact command:**
  `export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node --version && bash scripts/v2/package-linux-resources.sh`
- **Start:** 2026-09-28T22:55:29Z **End:** 2026-09-28T22:55:34Z
- **Exit code:** `1`

Excerpt (full, 45 lines; the failure is at the end):

```
v24.19.0

== Recording the build environment

== Copying the pinned Node tree (A01)
copied ~/.local/share/apunta-node/node-v24.19.0-linux-x64 -> build/linux-resources/node (v24.19.0)
tarball sha256 recorded by P0.1: f625d97cd707df4ff96254916fbc5ff014f09c09effe5a1e0ca8f6d41a8789d4

== Building the server and the web app

== Bundling the server (server/server.mjs)

  build/linux-resources/server/server.mjs  6.8mb ⚠️

⚡ Done in 173ms
injected app version: 0.0.0

== Copying the migrations
== Copying the web build
== Copying better-sqlite3

== Building whisper-cli (A06)

STOP CONDITION — whisper-cli was not built (A06).

Backend: vulkan. Tail of the build output:
From https://github.com/ggml-org/whisper.cpp
 * branch              371b5a7561823ab2bb32142d2751e35e7534727b -> FETCH_HEAD
HEAD is now at 371b5a75 release : v1.9.3 (#4000)
...
-- whisper.cpp version: 1.9.3-dev
-- CMAKE_SYSTEM_PROCESSOR: x86
-- Including CPU backend
CMake Error at /usr/share/cmake/Modules/FindPackageHandleStandardArgs.cmake:290 (message):
  Could NOT find Vulkan (missing: Vulkan_INCLUDE_DIR) (found version "")
Call Stack (most recent call first):
  /usr/share/cmake/Modules/FindPackageHandleStandardArgs.cmake:654 (_FPHSA_FAILURE_MESSAGE)
  /usr/share/cmake/Modules/FindVulkan.cmake:780 (find_package_handle_standard_args)
  ggml/src/ggml-vulkan/CMakeLists.txt:9 (find_package)

-- Configuring incomplete, errors occurred!

The `vulkan` backend needs the Vulkan SDK (vulkan.h) in addition to the
`glslc` shader compiler this box has. Agents never install a tool (HS-3), and
the card forbids substituting a different toolchain to get a green row, so this
stops rather than building the `cpu` backend and calling it done.

`build/linux-resources/` has been removed rather than left half-built, so no
later step can mistake an incomplete bundle for a finished one.
package-linux-resources: A06: bin/whisper-cli is missing. Resolve the backend's missing tool, then re-run this script.
```

**What did succeed before the stop.** Every stage ahead of the whisper build
ran and reported success: the pinned Node tree was copied and its `bin/node`
reports `v24.19.0`; `npm run build:shared` and `npm run build` produced
`server/dist` and `web/dist`; esbuild produced a 6.8 MB `server/server.mjs` with
the app version injected; the migrations, `web/dist` and
`native/better_sqlite3.node` were copied. The card's own stop condition routes
a missing `bin/whisper-cli` to `BLOCKED` "with the report, never a pass", which
is what happened.

## V2 — end-to-end bundle test (BLOCKED, exit 1)

- **Working directory:** `<repo>`
- **Exact command:**
  `export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && bash scripts/v2/package-linux-resources.test.sh`
- **Start:** 2026-09-28T22:55:39Z **End:** 2026-09-28T22:55:39Z
- **Exit code:** `1`

Full output:

```
FAIL bundle-present: build/linux-resources/ is missing. Run: bash scripts/v2/package-linux-resources.sh
```

The test refuses at its first preflight check because V1 produced no bundle.
Its `whisper-cli --help` check could not pass either, so the row is `BLOCKED`,
not merely failing on a missing artefact.

## V3 — manifest shape (NOT RUN, exit 1)

- **Working directory:** `<repo>`
- **Exact command:**
  `export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node -e "const m=require('./build/linux-resources/manifest.json');process.exit(m.files.length>0?0:1)"`
- **Start:** 2026-09-28T22:55:39Z **End:** 2026-09-28T22:55:39Z
- **Exit code:** `1`

```
Error: Cannot find module './build/linux-resources/manifest.json'
  code: 'MODULE_NOT_FOUND',
```

`NOT RUN`, not `FAIL`: the manifest does not exist because V1 stopped. See
`diagnostic.md` §3 for the manifest measured against a bundle this pipeline
does produce, where the row's exact command exits `0`.

## V4 — version fingerprint (NOT RUN, exit 1)

- **Working directory:** `<repo>`
- **Exact command:**
  `export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node -e "const s=require('fs').readFileSync('build/linux-resources/server/server.mjs','utf8');process.exit((s.includes('__APUNTA_VERSION__')||s.includes('@apunta/server'))?1:0)"`
- **Start:** 2026-09-28T22:55:39Z **End:** 2026-09-28T22:55:39Z
- **Exit code:** `1`

```
Error: ENOENT: no such file or directory, open 'build/linux-resources/server/server.mjs'
  code: 'ENOENT',
```

`NOT RUN`, not `FAIL`, for the same reason. See `diagnostic.md` §4, where both
counts are `0` on a real bundle from this pipeline.

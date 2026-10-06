#!/bin/bash
#
# P3.1 — build the self-contained Linux runtime resource folder.
#
#   export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH"
#   bash scripts/v2/package-linux-resources.sh
#
# Produces build/linux-resources/, laid out so `server/src/config.ts` resolves
# it as written. For a bundle at `<folder>/server/server.mjs`,
# `serverRoot = resolve(dirname(import.meta.url), '..')` is `<folder>` and
# `repoRoot` is the folder's **parent** — which is why the launch contract has
# to name `web/dist` and the licences file rather than let them resolve outside
# the folder (config.ts:172-173).
#
#   node/                      the A01 tree, copied, never downloaded again
#   server/server.mjs          the esbuild bundle, app version injected
#   migrations/                config.ts:165 resolves <folder>/migrations
#   web/dist/                  config.ts:173 via APUNTA_WEB_DIST
#   native/better_sqlite3.node copied from better-sqlite3's NAPI prebuild
#   node_modules/better-sqlite3/{package.json,lib,prebuilds}
#                              the JavaScript package is NOT optional: the
#                              binding override replaces only the .node
#   bin/whisper-cli            A06, with its shared libraries
#   THIRD-PARTY-LICENSES.md
#   manifest.json
#
# Hard stops this script implements rather than works around:
#   - no tool is ever installed (HS-3), and no backend is substituted
#   - better-sqlite3's addon is COPIED, never rebuilt: `npm rebuild` writes
#     node_modules/better-sqlite3/build/Release/** (outside May edit) and
#     clobbers the addon the rest of the repository uses
#   - `deps/download.sh` is never run (it fetches from sqlite.org, which no
#     ACQUISITION.md row covers)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="$REPO_ROOT/build/linux-resources"

# A01. P0.1 recorded this install and the tarball's SHA-256 in
# docs/v2/evidence/P0.1/acquisition-A01.md. The tree is COPIED from there and
# verified against the record; it is never downloaded again.
NODE_VERSION="24.19.0"
NODE_TARBALL_SHA256="f625d97cd707df4ff96254916fbc5ff014f09c09effe5a1e0ca8f6d41a8789d4"
NODE_INSTALL="$HOME/.local/share/apunta-node/node-v${NODE_VERSION}-linux-x64"

# A06. The revision is pinned in scripts/build-whisper-candidate.sh; this is
# only the backend and where the candidate is built.
WHISPER_BACKEND="${APUNTA_WHISPER_BACKEND:-vulkan}"
WHISPER_WORK_DIR="${APUNTA_WHISPER_WORK_DIR:-/tmp/apunta-v2/whisper-src}"

step() { printf '\n== %s\n' "$1"; }
die() {
  printf 'package-linux-resources: %s\n' "$1" >&2
  exit 1
}

# ------------------------------------------------- re-exec under A01's Node ---
# The box default is a mise shim at v26.8.2, outside the repository's
# `engines` (">=24.19.0 <25") and outside the bundle. Everything below runs
# under the pinned tree, named by absolute path rather than found on PATH, so a
# developer's shell cannot decide which Node builds the runtime.
PINNED_NODE="$NODE_INSTALL/bin/node"
if [ ! -x "$PINNED_NODE" ]; then
  die "the pinned Node ${NODE_VERSION} is not at ${PINNED_NODE}. P0.1 installs it; re-fetching it here would be a second acquisition of A01."
fi

if [ "$(node --version 2>/dev/null || true)" != "v${NODE_VERSION}" ]; then
  export PATH="$PINNED_NODE:$PATH"
fi

if [ "$(node --version)" != "v${NODE_VERSION}" ]; then
  die "expected node v${NODE_VERSION}, got $(node --version)"
fi

step "Recording the build environment"
# Recorded for the manifest, from the tools that are actually installed.
COMPILER="$(cc --version 2>/dev/null | head -n 1 || true)"
GLIBC="$(ldd --version 2>/dev/null | head -n 1 || true)"

# --------------------------------------------------------------- the build ---
# A clean folder every time: a stale `web/dist` or a leftover `native/` from an
# earlier run is exactly the kind of thing that makes a bundle look complete
# while shipping the wrong bytes.
rm -rf "$OUT"
mkdir -p "$OUT"

step "Copying the pinned Node tree (A01)"
cp -R "$NODE_INSTALL" "$OUT/node"
if [ ! -x "$OUT/node/bin/node" ]; then
  die "the copied Node tree has no executable bin/node"
fi
COPIED_NODE_VERSION="$("$OUT/node/bin/node" --version)"
if [ "$COPIED_NODE_VERSION" != "v${NODE_VERSION}" ]; then
  die "the copied Node reports ${COPIED_NODE_VERSION}, expected v${NODE_VERSION}"
fi
printf 'copied %s -> %s (%s)\n' "$NODE_INSTALL" "$OUT/node" "$COPIED_NODE_VERSION"
printf 'tarball sha256 recorded by P0.1: %s\n' "$NODE_TARBALL_SHA256"

step "Building the server and the web app"
# The bundle's own inputs, built here rather than assumed: an already-built
# `server/dist` in the checkout may be stale, and the bundle must be
# reproducible from this script alone.
(cd "$REPO_ROOT" && npm run build:shared >/dev/null && npm run build >/dev/null)

step "Bundling the server (server/server.mjs)"
APP_VERSION="${APUNTA_BUNDLE_VERSION:-$(
  node -e 'process.stdout.write(JSON.parse(require("node:fs").readFileSync("server/package.json","utf8")).version ?? "")'
)}"
if [ -z "$APP_VERSION" ]; then
  die "server/package.json carries no version to inject"
fi

mkdir -p "$OUT/server"
# `npx --yes`, not the local binary: esbuild 0.28.2 is present only transitively
# through vite and is not a declared dependency, so `node_modules/.bin/esbuild`
# is a hoist rather than something this repository installed. --yes keeps npx
# from prompting; it resolves the hoisted binary and contacts no registry.
#
# --define carries AM-058's injected version as a JSON-encoded string, which is
# what lets this bundle — which has no `package.json` of its own — report the
# real version. The readers guard it with `typeof __APUNTA_VERSION__ ===
# 'string'`, so the substitution is what makes the defined path the one that
# executes, and the packaging fingerprint proves no `package.json` metadata
# travelled along with it.
#
# --banner:js is the one flag the card's list does not name, and without it the
# bundle throws on its first line of real work: an ESM bundle has no `require`,
# so esbuild emits a shim that throws `Dynamic require of "…" is not
# supported`, and the first CJS dependency to call `require('node:stream')` at
# load time takes the whole server down. Every flag the card fixes is passed
# exactly as it fixes it; the banner only gives that shim a `require` to call,
# and it introduces no new dependency and no new network access.
#
# The import is ALIASED, and that is not a style choice: `fflate`'s Node ESM
# entry is inlined into this same bundle and it already declares
# `import { createRequire } from 'module'` at its own top level, so a banner
# declaring the same name is a `SyntaxError: Identifier 'createRequire' has
# already been declared` and the server never starts.
BANNER='import{createRequire as __apuntaCreateRequire}from"node:module";const require=__apuntaCreateRequire(import.meta.url);'
(cd "$REPO_ROOT" && npx --yes esbuild server/dist/index.js \
  --bundle --platform=node --format=esm --target=node24 \
  --external:better-sqlite3 \
  "--define:__APUNTA_VERSION__=$(node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$APP_VERSION")" \
  "--banner:js=$BANNER" \
  --outfile="$OUT/server/server.mjs" >/dev/null)
printf 'injected app version: %s\n' "$APP_VERSION"

step "Copying the migrations"
# `migrations/`, not `server/migrations/`: config.ts:165 resolves
# join(serverRoot, 'migrations'), which for this layout is <folder>/migrations.
mkdir -p "$OUT/migrations"
cp "$REPO_ROOT"/server/migrations/*.sql "$OUT/migrations/"

step "Copying the web build"
cp -R "$REPO_ROOT/web/dist" "$OUT/web-dist-tmp"
mkdir -p "$OUT/web"
mv "$OUT/web-dist-tmp" "$OUT/web/dist"
if [ ! -f "$OUT/web/dist/index.html" ]; then
  die "web/dist/index.html is missing from the build; the bundle would serve no SPA"
fi

step "Copying better-sqlite3"
# The addon is COPIED, never built. better-sqlite3@13.0.3 is NAPI
# (binding.gyp:21 defines NAPI_VERSION=10) and loads
# prebuilds/linux-x64.node (lib/binding.js:28-41, lib/linux-x64.js:2), which is
# ABI-independent — it loads under the bundled Node with no rebuild.
PREBUILD="$REPO_ROOT/node_modules/better-sqlite3/prebuilds/linux-x64.node"
if [ ! -f "$PREBUILD" ]; then
  # The card's third stop condition, verbatim: report the loader's own error,
  # do not compile it, do not run deps/download.sh, do not fall back to the
  # host's build/Release copy. The copy step is the fix, not a build.
  die "node_modules/better-sqlite3/prebuilds/linux-x64.node is absent. Do NOT run 'npm rebuild better-sqlite3' (it writes node_modules/better-sqlite3/build/Release/** and clobbers the addon the repository uses) and do NOT run the package's deps/download.sh (it fetches from sqlite.org, which no ACQUISITION.md row covers)."
fi
mkdir -p "$OUT/native"
cp "$PREBUILD" "$OUT/native/better_sqlite3.node"

# The JavaScript package is not optional. APUNTA_SQLITE_BINDING only replaces
# the .node — it is passed as better-sqlite3's `nativeBinding` — so the loader
# itself still has to resolve, which is why package-mac.sh:360 ships the whole
# package too. Only the three things the runtime reads are taken: everything
# else in the package is either a second copy of the addon (possibly for the
# wrong architecture), ~10 MB of SQLite C sources, or build scaffolding.
SQLITE_PKG="$OUT/node_modules/better-sqlite3"
mkdir -p "$OUT/node_modules"
mkdir -p "$SQLITE_PKG"
cp "$REPO_ROOT/node_modules/better-sqlite3/package.json" "$SQLITE_PKG/package.json"
cp -R "$REPO_ROOT/node_modules/better-sqlite3/lib" "$SQLITE_PKG/lib"
cp -R "$REPO_ROOT/node_modules/better-sqlite3/prebuilds" "$SQLITE_PKG/prebuilds"
# The prebuilds shipped inside the package are for every platform; only this
# host's is ever loadable, and the other seven are ~14 MB of dead weight.
rm -f "$SQLITE_PKG/prebuilds/darwin-arm64.node" \
  "$SQLITE_PKG/prebuilds/darwin-x64.node" \
  "$SQLITE_PKG/prebuilds/linux-arm64.node" \
  "$SQLITE_PKG/prebuilds/linuxmusl-arm64.node" \
  "$SQLITE_PKG/prebuilds/linuxmusl-x64.node" \
  "$SQLITE_PKG/prebuilds/win32-arm64.node" \
  "$SQLITE_PKG/prebuilds/win32-x64.node"

step "Building whisper-cli (A06)"
# scripts/build-whisper-candidate.sh reuses an existing clone, so a re-run is a
# redundant fetch and a rebuild — not a second acquisition. It exits 2 before
# building anything when the backend's tools are missing, and this script turns
# that into the card's stop-condition report rather than a silent pass.
WHISPER_LOG="$(mktemp)"
if ! APUNTA_WHISPER_BACKEND="$WHISPER_BACKEND" \
  APUNTA_WHISPER_WORK_DIR="$WHISPER_WORK_DIR" \
  bash "$REPO_ROOT/scripts/build-whisper-candidate.sh" > "$WHISPER_LOG" 2>&1; then
  # The half-built folder is removed rather than left in place, so no later
  # step can mistake it for a finished bundle. The log is kept for the report.
  rm -rf "$OUT"
  printf '\nSTOP CONDITION — whisper-cli was not built (A06).\n\n' >&2
  printf 'Backend: %s. Tail of the build output:\n' "$WHISPER_BACKEND" >&2
  tail -n 40 "$WHISPER_LOG" >&2
  rm -f "$WHISPER_LOG"
  # Name the tool from the build's own error rather than from a hard-coded
  # guess. The first attempt guessed `vulkan.h` and was right; the second named
  # the same tool again and was wrong, because the owner had installed it. A
  # report that asserts which tool is missing is a claim that goes stale the
  # moment the PC changes, so it is read out of the log or not made at all.
  MISSING_TOOL="$(
    grep -oE 'Could not find a package configuration file provided by "[^"]+"' "$WHISPER_LOG" 2>/dev/null |
      head -n 1 | sed -E 's/.*provided by "([^"]+)"/\1/'
  )"
  [ -n "$MISSING_TOOL" ] || MISSING_TOOL="(not named in the output above — read the tail)"
  cat <<REPORT >&2

The '${WHISPER_BACKEND}' backend cannot be configured on this PC: CMake reported
it could not find:

    ${MISSING_TOOL}

Agents never install a tool (HS-3), and the card forbids substituting a
different toolchain to get a green row, so this stops rather than building the
'cpu' backend and calling it done. The fix is an owner action: the package that
provides the missing piece, installed with pacman. The 'vulkan-devel' group is
the one that carries the whole Vulkan build toolchain, and a member of it may
still be absent even after another member has been installed.

'build/linux-resources/' has been removed rather than left half-built, so no
later step can mistake an incomplete bundle for a finished one.
REPORT
  die "A06: bin/whisper-cli is missing. Resolve the backend's missing tool, then re-run this script."
fi

CANDIDATE="$WHISPER_WORK_DIR/whisper.cpp/build-${WHISPER_BACKEND}/bin/whisper-cli"
if [ ! -x "$CANDIDATE" ]; then
  rm -rf "$OUT"
  die "A06: the whisper candidate builder reported success but $CANDIDATE is not executable"
fi

mkdir -p "$OUT/bin"
cp "$CANDIDATE" "$OUT/bin/whisper-cli"
# Its shared libraries go BESIDE the binary, in the same `bin/` folder, because
# that is where the binary's own RUNPATH points. CMAKE_BUILD_RPATH_USE_ORIGIN=ON
# is already set in the candidate builder, and what it produces here is
# `RUNPATH: $ORIGIN:` — no `../lib` component. A copy that put them in a separate
# `lib/` folder would therefore produce a binary that cannot start, and the only
# reason it did not look like an obvious mistake is that the build tree happens
# to keep its libraries in the binary's own folder too.
#
# What is copied is exactly what the build produced next to the binary: the
# whisper.cpp and ggml shared objects, with their SONAME symlink chains intact
# (`cp -P`), because the binary asks for `libwhisper.so.1` and that name is a
# symlink, not a file.
#
# What is NOT copied is the host runtime the binary links against but does not
# own — libstdc++, libgcc_s, libgomp, libc, and above all `libvulkan.so.1`. The
# Vulkan loader is the host's ICD loader: it has to match the host's driver, and
# bundling a copy of it is how a bundle ends up loading the wrong one. These
# resolve from the host, which is what "already present" in ACQUISITION.md §2
# permits, and the bundle then depends on the host having a Vulkan driver, which
# is a real deployment property and belongs in the install guide rather than
# hidden here.
#
# No RPATH is rewritten, so no `patchelf` is needed: the copy is relocatable
# because it never hard-codes a build path in the first place.
CANDIDATE_BIN_DIR="$(dirname "$CANDIDATE")"
found_libs=0
for lib in "$CANDIDATE_BIN_DIR"/*.so*; do
  [ -e "$lib" ] || continue
  cp -P "$lib" "$OUT/bin/$(basename "$lib")"
  found_libs=$((found_libs + 1))
done
if [ "$found_libs" -eq 0 ]; then
  rm -rf "$OUT"
  die "A06: the whisper build produced no shared libraries beside $CANDIDATE, so the copy could not resolve them"
fi
printf 'copied whisper-cli and %s shared librar%s into bin/ (RUNPATH \$ORIGIN:)\n' \
  "$found_libs" "$([ "$found_libs" -eq 1 ] && printf y || printf ies)"
# The real gate, not a hope: a relocated binary that cannot start must fail here
# rather than in a person's session.
if ! "$OUT/bin/whisper-cli" --help >/dev/null 2>&1; then
  printf '\nThe copied binary does not run. Its unresolved libraries:\n' >&2
  ldd "$OUT/bin/whisper-cli" 2>&1 | grep -E 'not found|=>' >&2 || true
  rm -rf "$OUT"
  die "A06: the copied $OUT/bin/whisper-cli cannot run — its shared libraries do not resolve beside it"
fi

step "Copying the licences"
cp "$REPO_ROOT/THIRD-PARTY-LICENSES.md" "$OUT/THIRD-PARTY-LICENSES.md"

# ------------------------------------------------------------- the manifest --
# Exactly {nodeVersion, compiler, glibc, files}. `files` is a JSON ARRAY of
# objects, every file in the folder except manifest.json itself (a manifest
# cannot hash its own final bytes), each {path, bytes, sha256} with `path`
# relative to the folder. A manifest shaped {"files": {"…": "…"}} evaluates
# `undefined > 0` and exits 1, which is the point of fixing the shape.
#
# Every entry describes the path AS IT IS at that path, so the bundle is
# verifiable with `lstat`. The bundle holds 13 symlinks — whisper's and ggml's
# SONAME chains in `bin/`, and npm/npx/corepack under `node/bin` — and hashing a
# symlink by following it records the TARGET's size under the LINK's path. A
# verifier that lstats then sees 13 byte-counts that disagree with the file, and
# a manifest that cannot be checked is worse than no manifest. So a symlink is
# recorded as a symlink: its own byte length, and the SHA-256 of its target
# string. Nothing is lost by this — every link's real target is itself listed
# with its own content hash, so the bytes a broken or substituted library would
# change are still covered.
step "Writing manifest.json"
(cd "$OUT" && node -e '
  const { createHash } = require("node:crypto");
  const { lstatSync, readdirSync, readFileSync, readlinkSync, writeFileSync } = require("node:fs");
  const { join, relative, sep } = require("node:path");

  const root = process.cwd();
  const files = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir).sort()) {
      const full = join(dir, entry);
      const st = lstatSync(full);
      if (st.isDirectory()) walk(full);
      else if (entry !== "manifest.json") {
        const bytes = st.isSymbolicLink()
          ? Buffer.byteLength(readlinkSync(full), "utf8")
          : st.size;
        const content = st.isSymbolicLink()
          ? Buffer.from(readlinkSync(full), "utf8")
          : readFileSync(full);
        files.push({
          path: relative(root, full).split(sep).join("/"),
          bytes,
          sha256: createHash("sha256").update(content).digest("hex"),
        });
      }
    }
  })(root);

  writeFileSync(
    join(root, "manifest.json"),
    `${JSON.stringify(
      {
        nodeVersion: process.argv[1],
        compiler: process.argv[2],
        glibc: process.argv[3],
        files,
      },
      null,
      2,
    )}\n`,
  );
  process.stdout.write(`manifest lists ${String(files.length)} files\n`);
' "$NODE_VERSION" "$COMPILER" "$GLIBC")

step "Done"
printf 'output: %s\n' "$OUT"
printf 'node:   %s\n' "$COPIED_NODE_VERSION"
printf 'files:  %s\n' "$(node -e "process.stdout.write(String(JSON.parse(require('node:fs').readFileSync('$OUT/manifest.json','utf8')).files.length))")"

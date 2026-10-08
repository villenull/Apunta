#!/bin/bash
#
# P6.1 — build the self-contained macOS runtime resource folder.
#
#   bash scripts/v2/package-macos-resources.sh            # on an Apple-silicon Mac
#   bash scripts/v2/package-macos-resources.sh --dry-run  # prints the plan, anywhere
#
# The macOS counterpart of scripts/v2/package-linux-resources.sh, with the same
# layout under build/macos-resources/, which src-tauri/tauri.macos.conf.json maps
# to the app's `macos-resources/` and src-tauri/src/main.rs looks for:
#
#   node/                      the pinned Node tree (darwin-arm64), copied
#   server/server.mjs          the esbuild bundle, app version injected
#   installer/setup.mjs        first-run setup, run by the shell on her Start
#   migrations/
#   web/dist/
#   native/better_sqlite3.node copied from better-sqlite3's NAPI prebuild
#   node_modules/better-sqlite3/{package.json,lib,prebuilds}
#   bin/whisper-cli            whisper.cpp at the pinned revision, Metal, static
#   THIRD-PARTY-LICENSES.md
#   manifest.json
#
# Status: CONFIGURED, NOT RUNTIME-VERIFIED. Written on Linux; it has never run
# on a Mac. docs/v2/MAC-FIRST-RUN.md is the first run, step by step.
#
# Differences from the Linux script, each deliberate:
#   - whisper-cli is built here, not by scripts/build-whisper-candidate.sh
#     (Linux-only), from the SAME pinned revision, with Metal and the shaders
#     embedded, and linked statically (BUILD_SHARED_LIBS=OFF): one binary with
#     no @rpath to fix, so nothing is rewritten with install_name_tool.
#   - Ollama is NOT bundled, exactly as on Linux: the shell talks to the
#     installed Ollama (scripts/setup-macos.sh installs it with Homebrew). The
#     card asked for a bundled one; that would need the shell to start and stop
#     it, which nothing on Linux does and nothing here could test.
#   - No tool is ever installed and nothing is downloaded, except the whisper.cpp
#     source at its pinned revision (ACQUISITION.md A06). The Node tree must
#     already be at NODE_INSTALL, extracted from the tarball ACQUISITION.md A18
#     names and verified against its pinned SHA-256 (APUNTA_NODE_TARBALL lets
#     this script check the tarball itself).

set -euo pipefail

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    *)
      printf 'usage: %s [--dry-run]\n' "$0" >&2
      exit 2
      ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="$REPO_ROOT/build/macos-resources"

# A18. node-v24.19.0-darwin-arm64.tar.gz, from https://nodejs.org/dist/v24.19.0/,
# SHA-256 as published in that release's SHASUMS256.txt (the value the earlier
# Mac packaging pinned, scripts/package-mac.sh).
NODE_VERSION="24.19.0"
NODE_TARBALL_SHA256="8294b7aa9b03997481c06babf1e8b270c859358f27da57a11509afe537ac381d"
NODE_INSTALL="${APUNTA_NODE_INSTALL:-$HOME/.local/share/apunta-node/node-v${NODE_VERSION}-darwin-arm64}"

# A06, the revision Linux pins: read from the Linux builder, never restated.
WHISPER_COMMIT="$(sed -n 's/^WHISPER_COMMIT="\([0-9a-f]*\)"$/\1/p' "$REPO_ROOT/scripts/build-whisper-candidate.sh")"
WHISPER_REPO="https://github.com/ggml-org/whisper.cpp.git"
WHISPER_WORK_DIR="${APUNTA_WHISPER_WORK_DIR:-$HOME/.cache/apunta-v2/whisper-src-macos}"
MIN_MACOS="14.0"

step() { printf '\n== %s\n' "$1"; }
die() {
  printf 'package-macos-resources: %s\n' "$1" >&2
  exit 1
}
# In a dry run every command is printed, not run.
run() {
  if [ "$DRY_RUN" = 1 ]; then
    printf '  would run: %s\n' "$*"
  else
    "$@"
  fi
}

[ -n "$WHISPER_COMMIT" ] || die "could not read WHISPER_COMMIT from scripts/build-whisper-candidate.sh"

if [ "$DRY_RUN" = 0 ]; then
  [ "$(uname -s)" = Darwin ] || die "this builds the macOS bundle and runs only on a Mac (use --dry-run elsewhere)"
  [ "$(uname -m)" = arm64 ] || die "Apple silicon only (arm64); this Mac reports $(uname -m)"
  for tool in cmake git cc shasum; do
    command -v "$tool" >/dev/null 2>&1 || die "$tool is missing. Agents never install a tool (HS-3); install it (Xcode Command Line Tools, Homebrew cmake) and re-run."
  done
fi

step "Checking the pinned Node tree (A18)"
if [ -n "${APUNTA_NODE_TARBALL:-}" ]; then
  if [ "$DRY_RUN" = 0 ]; then
    actual="$(shasum -a 256 "$APUNTA_NODE_TARBALL" | cut -d' ' -f1)"
    [ "$actual" = "$NODE_TARBALL_SHA256" ] || die "the Node tarball's SHA-256 is $actual, expected $NODE_TARBALL_SHA256"
  fi
  printf 'tarball verified: %s\n' "$APUNTA_NODE_TARBALL"
fi
PINNED_NODE="$NODE_INSTALL/bin/node"
if [ "$DRY_RUN" = 0 ]; then
  [ -x "$PINNED_NODE" ] || die "the pinned Node ${NODE_VERSION} is not at ${PINNED_NODE}. Extract the A18 tarball there (docs/v2/MAC-FIRST-RUN.md)."
  [ "$("$PINNED_NODE" --version)" = "v${NODE_VERSION}" ] || die "$PINNED_NODE is not v${NODE_VERSION}"
  export PATH="$NODE_INSTALL/bin:$PATH"
fi
printf 'node: %s\n' "$PINNED_NODE"

step "Recording the build environment"
COMPILER="$(cc --version 2>/dev/null | head -n 1 || true)"
OS_VERSION="macOS $(sw_vers -productVersion 2>/dev/null || printf unknown)"

run rm -rf "$OUT"
run mkdir -p "$OUT"

step "Copying the pinned Node tree"
run cp -R "$NODE_INSTALL" "$OUT/node"

step "Building the server and the web app"
run bash -c "cd '$REPO_ROOT' && npm run build:shared >/dev/null && npm run build >/dev/null"

step "Bundling the server (server/server.mjs)"
# Identical to Linux, banner included: an ESM bundle has no `require`, and the
# first CommonJS dependency to call one at load time takes the server down.
# P6.1's follow-up asked whether the Mac needs it; it is the same bundle on the
# same Node, so it does, and the earlier Mac script's lack of it was the latent
# boot failure that follow-up describes.
APP_VERSION="${APUNTA_BUNDLE_VERSION:-$(
  node -e 'process.stdout.write(JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).version ?? "")' \
    "$REPO_ROOT/server/package.json"
)}"
[ -n "$APP_VERSION" ] || die "server/package.json carries no version to inject"
BANNER='import{createRequire as __apuntaCreateRequire}from"node:module";const require=__apuntaCreateRequire(import.meta.url);'
DEFINE="--define:__APUNTA_VERSION__=$(node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$APP_VERSION")"
run mkdir -p "$OUT/server"
run bash -c "cd '$REPO_ROOT' && npx --yes esbuild server/dist/index.js --bundle --platform=node --format=esm --target=node24 --external:better-sqlite3 '$DEFINE' '--banner:js=$BANNER' --outfile='$OUT/server/server.mjs' >/dev/null"
printf 'app version: %s\n' "$APP_VERSION"

step "Bundling first-run setup (installer/setup.mjs)"
# Identical to Linux: the model downloader the shell runs on her Start.
run mkdir -p "$OUT/installer"
run bash -c "cd '$REPO_ROOT' && npx --yes esbuild installer/dist/main.js --bundle --platform=node --format=esm --target=node24 '--banner:js=$BANNER' --outfile='$OUT/installer/setup.mjs' >/dev/null"

step "Copying the migrations and the web build"
run mkdir -p "$OUT/migrations" "$OUT/web"
run bash -c "cp '$REPO_ROOT'/server/migrations/*.sql '$OUT/migrations/'"
run cp -R "$REPO_ROOT/web/dist" "$OUT/web/dist"

step "Copying better-sqlite3 (darwin-arm64 prebuild, never rebuilt)"
PREBUILD="$REPO_ROOT/node_modules/better-sqlite3/prebuilds/darwin-arm64.node"
if [ "$DRY_RUN" = 0 ] && [ ! -f "$PREBUILD" ]; then
  die "node_modules/better-sqlite3/prebuilds/darwin-arm64.node is absent. Do NOT run 'npm rebuild better-sqlite3' or its deps/download.sh."
fi
SQLITE_PKG="$OUT/node_modules/better-sqlite3"
run mkdir -p "$OUT/native" "$SQLITE_PKG"
run cp "$PREBUILD" "$OUT/native/better_sqlite3.node"
run cp "$REPO_ROOT/node_modules/better-sqlite3/package.json" "$SQLITE_PKG/package.json"
run cp -R "$REPO_ROOT/node_modules/better-sqlite3/lib" "$SQLITE_PKG/lib"
run mkdir -p "$SQLITE_PKG/prebuilds"
run cp "$PREBUILD" "$SQLITE_PKG/prebuilds/darwin-arm64.node"

step "Building whisper-cli (A06, Metal, static)"
SRC="$WHISPER_WORK_DIR/whisper.cpp"
if [ "$DRY_RUN" = 1 ] || [ ! -d "$SRC/.git" ]; then
  run mkdir -p "$WHISPER_WORK_DIR"
  run git clone --no-checkout "$WHISPER_REPO" "$SRC"
fi
run git -C "$SRC" fetch --depth 1 origin "$WHISPER_COMMIT"
run git -C "$SRC" checkout --detach "$WHISPER_COMMIT"
# FFmpeg stays off (LGPL); the app records 16 kHz WAV that whisper-cli reads
# itself. The Metal shaders are compiled into the binary, so no loose .metal
# file has to travel beside it.
run cmake -S "$SRC" -B "$SRC/build-metal" \
  -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_SHARED_LIBS=OFF \
  -DWHISPER_BUILD_TESTS=OFF \
  -DWHISPER_BUILD_SERVER=OFF \
  -DWHISPER_BUILD_EXAMPLES=ON \
  -DWHISPER_COMMON_FFMPEG=OFF \
  -DGGML_METAL=ON \
  -DGGML_METAL_EMBED_LIBRARY=ON \
  -DCMAKE_OSX_ARCHITECTURES=arm64 \
  -DCMAKE_OSX_DEPLOYMENT_TARGET="$MIN_MACOS"
run cmake --build "$SRC/build-metal" --config Release -j
run mkdir -p "$OUT/bin"
run cp "$SRC/build-metal/bin/whisper-cli" "$OUT/bin/whisper-cli"
if [ "$DRY_RUN" = 0 ]; then
  # The real gate: a copied binary that cannot start fails here, not in a session.
  "$OUT/bin/whisper-cli" --help >/dev/null 2>&1 || die "the copied bin/whisper-cli does not run"
  if otool -L "$OUT/bin/whisper-cli" | grep -E '@rpath|libwhisper|libggml' >/dev/null; then
    die "bin/whisper-cli still links a whisper/ggml dylib; the static build did not take"
  fi
fi

step "Copying the licences"
run cp "$REPO_ROOT/THIRD-PARTY-LICENSES.md" "$OUT/THIRD-PARTY-LICENSES.md"

step "Writing manifest.json"
# The same shape as Linux ({nodeVersion, compiler, glibc, files}); on a Mac the
# `glibc` field records the macOS version, which is what that field is for.
if [ "$DRY_RUN" = 0 ]; then
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
          const link = st.isSymbolicLink();
          const content = link ? Buffer.from(readlinkSync(full), "utf8") : readFileSync(full);
          files.push({
            path: relative(root, full).split(sep).join("/"),
            bytes: link ? content.length : st.size,
            sha256: createHash("sha256").update(content).digest("hex"),
          });
        }
      }
    })(root);
    writeFileSync(join(root, "manifest.json"), `${JSON.stringify({ nodeVersion: process.argv[1], compiler: process.argv[2], glibc: process.argv[3], files }, null, 2)}\n`);
    process.stdout.write(`manifest lists ${String(files.length)} files\n`);
  ' "$NODE_VERSION" "$COMPILER" "$OS_VERSION")
else
  printf '  would write manifest.json\n'
fi

step "Done"
printf 'output: %s%s\n' "$OUT" "$([ "$DRY_RUN" = 1 ] && printf ' (dry run: nothing was written)')"

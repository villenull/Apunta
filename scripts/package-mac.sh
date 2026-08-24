#!/bin/bash
#
# Apunta — build Apunta.app and Apunta.dmg. macOS only.
#
#   npm run package:mac                  # build everything
#   npm run package:mac -- --dry-run     # print the plan, run none of it
#   npm run package:mac -- --help        # all options
#
# WHAT THIS PRODUCES
# ------------------
# `dist-mac/Apunta.app` and `dist-mac/Apunta.dmg`: an Apple Silicon app with
# the Node runtime, the AI runtime and the transcriber inside it, needing no
# Homebrew, no Node and no Ollama on the Mac it lands on. The AI *models* are
# not in it — the app downloads them once on first run, which is what keeps the
# installer small and keeps model weights out of anything we distribute.
#
# WHAT HAS AND HAS NOT BEEN RUN
# -----------------------------
# **No line below has ever executed.** It was written on Linux, where there is
# no macOS SDK, no `swiftc`, no `codesign` and no `hdiutil`. It is clean under
# `bash -n` and `shellcheck`, its `--dry-run` is exercised by the test suite,
# and every pin in it was verified against a primary source on 2026-08-24 —
# including reading the `ollama-darwin.tgz` tarball's contents and the
# `LC_BUILD_VERSION` of every Mach-O in it. What is *not* verified is that any
# of it works. Treat the first run as the verification; `--dry-run` prints
# every command without running one.
#
# Portability: /bin/bash on macOS is 3.2, so nothing below uses bash 4 syntax.

set -u
set -o pipefail

VERSION="1.0"

# ---------------------------------------------------------------------------
# Pins. Every one of these was read from its publisher on 2026-08-24.
# ---------------------------------------------------------------------------

# Node 24.19.0 is the current LTS line ("Krypton"). Stock binary, not a Node
# SEA: SEA is stability 1.1, and its native-addon path writes the .node to a
# temp file and dlopen()s it — which is exactly what macOS library validation
# exists to stop, and `better-sqlite3` is a native addon.
NODE_VERSION="24.19.0"
NODE_TARBALL="node-v${NODE_VERSION}-darwin-arm64.tar.gz"
NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_TARBALL}"
# From https://nodejs.org/dist/v24.19.0/SHASUMS256.txt
NODE_SHA256="8294b7aa9b03997481c06babf1e8b270c859358f27da57a11509afe537ac381d"

# The AI runtime. Apunta speaks Ollama's native API — /api/chat, /api/tags and
# /api/show — so this is the runtime the app actually talks to. Swapping to
# llama-server is a provider rewrite, not a packaging choice; see
# docs/research/m8-shell-and-runtime-2026-08.md §2.
OLLAMA_VERSION="v0.32.15"
OLLAMA_TARBALL="ollama-darwin.tgz"
OLLAMA_URL="https://github.com/ollama/ollama/releases/download/${OLLAMA_VERSION}/${OLLAMA_TARBALL}"
# From the release's own sha256sum.txt. 154,052,856 bytes.
OLLAMA_SHA256="9ab0ac4747946620a2464054f3c44a55aa146e9fccb5c366ee18e43fd1930b90"

# whisper.cpp publishes no prebuilt macOS binary — the release matrix is
# Ubuntu/Windows/CUDA/xcframework only — so packaging compiles it from a
# pinned tag.
WHISPER_TAG="v1.9.3"
WHISPER_REPO="https://github.com/ggml-org/whisper.cpp.git"

APP_NAME="Apunta"
BUNDLE_ID="com.apunta.app"
# Read out of the shipped binaries: every Mach-O in ollama-darwin.tgz carries
# LC_BUILD_VERSION minos 14.0.0.
MIN_MACOS="14.0"

# ---------------------------------------------------------------------------
# Options
# ---------------------------------------------------------------------------
DRY_RUN=0
SKIP_DMG=0
DROP_MLX=0
KEEP_WORK=0
USE_COLOR=auto

usage() {
  cat <<'USAGE'
Apunta macOS packaging — builds Apunta.app and Apunta.dmg.

  bash scripts/package-mac.sh [options]

  --dry-run       print every command it would run, and run none of them
  --skip-dmg      build the .app and stop
  --drop-mlx      leave Ollama's MLX runners out of the bundle (see below)
  --keep-work     do not delete the download/build scratch directory
  --no-color      plain text, no ANSI colour
  --help          this message

SIGNING, from the environment. All optional; each one that is missing is
skipped with a warning rather than failing the build:

  APUNTA_SIGN_IDENTITY     a "Developer ID Application: ..." identity. Without
                           it every Mach-O is still ad-hoc signed, which is not
                           optional: on Apple Silicon an unsigned arm64 helper
                           may refuse to execute at all, and the failure shape
                           is "the app opens and does nothing".
  APUNTA_NOTARY_PROFILE    a `notarytool store-credentials` profile name.
                           Requires APUNTA_SIGN_IDENTITY; notarizing an ad-hoc
                           signed app is rejected.

--drop-mlx: Ollama ships two MLX runners (~380 MB uncompressed) for models in
MLX format. Apunta refuses MLX-format models on purpose — Ollama's MLX engine
silently ignores the JSON-schema `format` parameter, which is the load-bearing
assumption of the whole drafting pipeline (ollama#16563) — so in principle they
are dead weight. Nobody has confirmed that Ollama starts happily without them,
so they are kept by default and this flag is the size experiment. Measure it
on a Mac before making it the default.

Exit status: 0 on success, non-zero with a reason otherwise.
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)   DRY_RUN=1 ;;
    --skip-dmg)  SKIP_DMG=1 ;;
    --drop-mlx)  DROP_MLX=1 ;;
    --keep-work) KEEP_WORK=1 ;;
    --no-color)  USE_COLOR=never ;;
    -h|--help)   usage; exit 0 ;;
    *) printf 'unknown option: %s\n\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

C_RESET=""; C_DIM=""; C_BOLD=""; C_GREEN=""; C_YELLOW=""; C_RED=""
if [ "$USE_COLOR" = auto ] && [ -t 1 ] && [ "${TERM:-dumb}" != dumb ]; then
  C_RESET=$(printf '\033[0m');  C_DIM=$(printf '\033[2m');   C_BOLD=$(printf '\033[1m')
  C_GREEN=$(printf '\033[32m'); C_YELLOW=$(printf '\033[33m'); C_RED=$(printf '\033[31m')
fi

STEP_N=0
step() { STEP_N=$(( STEP_N + 1 )); printf '\n%s[%d]%s %s\n' "$C_BOLD" "$STEP_N" "$C_RESET" "$1"; }
ok()   { printf '    %s✓%s %s\n' "$C_GREEN" "$C_RESET" "$1"; }
warn() { printf '    %s!%s %s\n' "$C_YELLOW" "$C_RESET" "$1"; }
note() { printf '      %s%s%s\n' "$C_DIM" "$1" "$C_RESET"; }
die()  { printf '\n%s✗ %s%s\n' "$C_RED$C_BOLD" "$1" "$C_RESET" >&2; exit 1; }

# Every mutating command goes through this, so --dry-run is complete by
# construction rather than by remembering to guard each call site.
run() {
  printf '    %s$ %s%s\n' "$C_DIM" "$*" "$C_RESET"
  [ "$DRY_RUN" = 1 ] && return 0
  "$@" || die "failed: $*"
}

# ===========================================================================
# The refusal. This is the first thing that happens.
# ===========================================================================
# A packaging script that half-runs on Linux produces an .app that looks like
# an .app and cannot execute — a broken artifact is worse than no artifact.
# APUNTA_PACKAGE_ALLOW_NON_MACOS=1 permits a *dry run* only, which is the only
# way any of this gets exercised before it meets a Mac.
UNAME="$(uname -s 2>/dev/null || echo unknown)"
if [ "$UNAME" != "Darwin" ]; then
  if [ "${APUNTA_PACKAGE_ALLOW_NON_MACOS:-0}" = "1" ] && [ "$DRY_RUN" = 1 ]; then
    printf '%sNot a Mac: dry run only. Nothing below can actually be built here.%s\n' \
      "$C_YELLOW" "$C_RESET"
  else
    printf '%sApunta.app can only be built on macOS.%s\n' "$C_RED$C_BOLD" "$C_RESET" >&2
    printf 'This machine reports "%s".\n\n' "$UNAME" >&2
    printf 'The build needs the macOS SDK, swiftc, codesign, lipo and hdiutil, none of\n' >&2
    printf 'which exist here. Nothing was created — a half-built .app that cannot run is\n' >&2
    printf 'worse than no .app at all.\n\n' >&2
    printf 'To see what it would do:  APUNTA_PACKAGE_ALLOW_NON_MACOS=1 bash %s --dry-run\n' "$0" >&2
    exit 2
  fi
fi

ARCH="$(uname -m 2>/dev/null || echo unknown)"
if [ "$UNAME" = "Darwin" ] && [ "$ARCH" != "arm64" ]; then
  die "Apunta ships Apple Silicon only, and this is $ARCH. Build it on an M-series Mac."
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$REPO_ROOT/dist-mac"
WORK_DIR="$OUT_DIR/work"
APP="$OUT_DIR/$APP_NAME.app"
DMG="$OUT_DIR/$APP_NAME.dmg"

printf '%sApunta packaging%s  v%s   %s\n' "$C_BOLD" "$C_RESET" "$VERSION" "$(date '+%Y-%m-%d %H:%M')"
if [ "$DRY_RUN" = 1 ]; then
  printf '%sDry run: every command is printed and none is executed.%s\n' "$C_YELLOW" "$C_RESET"
fi

# ===========================================================================
step "Tools"
# ===========================================================================
need() {
  if command -v "$1" >/dev/null 2>&1; then
    ok "$1"
  elif [ "$DRY_RUN" = 1 ]; then
    warn "$1 is not here (dry run — it would be needed)"
  else
    die "$1 is missing. $2"
  fi
}
CLT_HINT="Install the Xcode Command Line Tools: xcode-select --install"
need swiftc   "$CLT_HINT"
need codesign "$CLT_HINT"
need lipo     "$CLT_HINT"
need install_name_tool "$CLT_HINT"
need git      "$CLT_HINT"
need cmake    "whisper.cpp is compiled from source. Install cmake (brew install cmake)."
need curl     "It ships with macOS; something is very wrong."
need shasum   "It ships with macOS; something is very wrong."
need hdiutil  "It ships with macOS; something is very wrong."
need node     "The build itself runs on Node 22+. The *shipped* app carries its own."
need npm      "The build itself needs npm."
need plutil   "It ships with macOS; something is very wrong."

# ===========================================================================
step "Building Apunta itself"
# ===========================================================================
run npm --prefix "$REPO_ROOT" run build
run node "$REPO_ROOT/scripts/collect-licenses.mjs" --check

# esbuild bundles the server and the setup entry point to one file each, so the
# app carries two JavaScript files rather than a node_modules tree. The native
# addon is deliberately left out and placed as a real file: a Mach-O cannot be
# bundled into JavaScript, and it has to sit somewhere codesign will see it.
#
# `.mjs`, not `.js`. Both bundles are ES modules, and Node decides that from
# the extension or from the nearest `package.json` — of which there is none
# inside an app bundle. A `.js` file holding `import` statements is a syntax
# error at startup, which is the whole app failing to boot.
run npx --yes esbuild "$REPO_ROOT/server/dist/index.js" \
  --bundle --platform=node --format=esm --target=node24 \
  --external:better-sqlite3 \
  --outfile="$WORK_DIR/server/index.mjs"
run npx --yes esbuild "$REPO_ROOT/installer/dist/main.js" \
  --bundle --platform=node --format=esm --target=node24 \
  --outfile="$WORK_DIR/setup/setup.mjs"

# ===========================================================================
step "Fetching the runtimes"
# ===========================================================================
fetch_verified() {
  # $1 url  $2 destination  $3 expected sha256
  if [ "$DRY_RUN" = 0 ] && [ -f "$2" ] && [ "$(shasum -a 256 "$2" | cut -d' ' -f1)" = "$3" ]; then
    ok "$(basename "$2") is already here and its checksum matches"
    return 0
  fi
  run curl -fL --retry 3 --progress-bar -o "$2" "$1"
  if [ "$DRY_RUN" = 0 ]; then
    actual="$(shasum -a 256 "$2" | cut -d' ' -f1)"
    [ "$actual" = "$3" ] || die "checksum mismatch for $(basename "$2"): expected $3, got $actual"
    ok "checksum matches"
  fi
}

run mkdir -p "$WORK_DIR"
fetch_verified "$NODE_URL" "$WORK_DIR/$NODE_TARBALL" "$NODE_SHA256"
fetch_verified "$OLLAMA_URL" "$WORK_DIR/$OLLAMA_TARBALL" "$OLLAMA_SHA256"

run mkdir -p "$WORK_DIR/node" "$WORK_DIR/ollama"
run tar -xzf "$WORK_DIR/$NODE_TARBALL" -C "$WORK_DIR/node"
run tar -xzf "$WORK_DIR/$OLLAMA_TARBALL" -C "$WORK_DIR/ollama"

# ===========================================================================
step "Compiling whisper-cli"
# ===========================================================================
# WHISPER_COMMON_FFMPEG stays OFF, explicitly and forever. Turning it on links
# whisper.cpp against libav* and re-engages every LGPL obligation this project
# deleted rather than met. Nothing in Apunta has invoked ffmpeg since M5: the
# browser records 16 kHz mono WAV and whisper-cli decodes it through miniaudio.
# There is a test named `never mentions ffmpeg`. Do not turn this on for
# "better format support".
if [ ! -d "$WORK_DIR/whisper.cpp" ]; then
  run git clone --depth 1 --branch "$WHISPER_TAG" "$WHISPER_REPO" "$WORK_DIR/whisper.cpp"
fi
run cmake -S "$WORK_DIR/whisper.cpp" -B "$WORK_DIR/whisper.cpp/build" \
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
run cmake --build "$WORK_DIR/whisper.cpp/build" --config Release -j

# GGML_METAL_EMBED_LIBRARY compiles the Metal shaders into a section of the
# binary. Without it, loose .metal files land beside the executable and become
# unsigned resources that have to be sealed by hand.

# ===========================================================================
step "Assembling $APP_NAME.app"
# ===========================================================================
run rm -rf "$APP"
run mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Helpers" "$APP/Contents/Resources"

run cp "$REPO_ROOT/macos/Apunta/Info.plist" "$APP/Contents/Info.plist"
run plutil -lint "$APP/Contents/Info.plist"
# The identifier is what LaunchServices, the signature and the uninstall
# instructions all key off. One place to change it, checked rather than hoped.
if [ "$DRY_RUN" = 0 ]; then
  actual_id="$(plutil -extract CFBundleIdentifier raw "$APP/Contents/Info.plist")"
  [ "$actual_id" = "$BUNDLE_ID" ] || die "Info.plist says $actual_id, this script says $BUNDLE_ID"
  ok "bundle identifier is $BUNDLE_ID"
fi

# The shell. One swiftc invocation, no Xcode project: the sources are six
# files and a project file would be a second place for the deployment target
# to disagree with Info.plist.
run swiftc -O \
  -target "arm64-apple-macosx${MIN_MACOS}" \
  -framework AppKit \
  -o "$APP/Contents/MacOS/$APP_NAME" \
  "$REPO_ROOT/macos/Apunta/Paths.swift" \
  "$REPO_ROOT/macos/Apunta/ServerProcess.swift" \
  "$REPO_ROOT/macos/Apunta/SetupRunner.swift" \
  "$REPO_ROOT/macos/Apunta/SetupWindow.swift" \
  "$REPO_ROOT/macos/Apunta/AppDelegate.swift" \
  "$REPO_ROOT/macos/Apunta/main.swift"

# Node: `bin/node` and nothing else. The tarball also carries npm, corepack,
# headers and man pages, none of which a packaged app has any use for.
run cp "$WORK_DIR/node/node-v${NODE_VERSION}-darwin-arm64/bin/node" "$APP/Contents/MacOS/node"

# The AI runtime keeps upstream's own flat layout, in one directory. Its
# dylibs are built with @loader_path run paths, so they must sit beside the
# executable; splitting them into Contents/Frameworks/ would mean rewriting
# load commands with install_name_tool, and any modification after signing
# invalidates the signature.
run mkdir -p "$APP/Contents/Helpers/ollama" "$APP/Contents/Helpers/whisper"
run cp -R "$WORK_DIR/ollama/." "$APP/Contents/Helpers/ollama/"
run cp "$WORK_DIR/whisper.cpp/build/bin/whisper-cli" "$APP/Contents/Helpers/whisper/whisper-cli"

# `better-sqlite3` is the one dependency esbuild does not bundle, and it needs
# two things in two places.
#
#   1. Its JavaScript, as a real package. esbuild leaves `import
#      'better-sqlite3'` in the bundle, so Node has to be able to resolve it —
#      and it resolves by walking up from the importing file, which is why the
#      package lands in `Contents/Resources/node_modules/`. Bundling it instead
#      does not work: its loader calls `require()` with a computed path, which
#      an ESM bundle cannot honour.
#   2. Its compiled addon, as a Mach-O in `Contents/Helpers/`, because a
#      Mach-O in `Resources/` is the placement Apple's own guidance warns
#      produces signing problems that only surface at notarization.
#
# The two are joined by `APUNTA_SQLITE_BINDING`, which the server passes as
# better-sqlite3's `nativeBinding` option — so its loader takes the
# explicit-path branch and never searches `build/Release` at all.
BETTER_SQLITE3="$REPO_ROOT/node_modules/better-sqlite3/build/Release/better_sqlite3.node"
if [ "$DRY_RUN" = 0 ] && [ ! -f "$BETTER_SQLITE3" ]; then
  die "better_sqlite3.node is not built. Run: npm rebuild better-sqlite3"
fi
run cp "$BETTER_SQLITE3" "$APP/Contents/Helpers/better_sqlite3.node"

SQLITE_PKG="$APP/Contents/Resources/node_modules/better-sqlite3"
run mkdir -p "$APP/Contents/Resources/node_modules"
run cp -R "$REPO_ROOT/node_modules/better-sqlite3" "$SQLITE_PKG"
# Everything that is not the JavaScript: a second copy of the addon (possibly
# built for the wrong architecture), the prebuilt binaries it would search
# first, and ~10 MB of SQLite C sources nothing at runtime reads.
run rm -rf "$SQLITE_PKG/build" "$SQLITE_PKG/prebuilds" "$SQLITE_PKG/deps" "$SQLITE_PKG/src"

run cp -R "$WORK_DIR/server" "$APP/Contents/Resources/server"
run cp -R "$WORK_DIR/setup" "$APP/Contents/Resources/setup"
run cp -R "$REPO_ROOT/server/migrations" "$APP/Contents/Resources/server/migrations"
run cp -R "$REPO_ROOT/web/dist" "$APP/Contents/Resources/web"
run cp "$REPO_ROOT/THIRD-PARTY-LICENSES.md" "$APP/Contents/Resources/THIRD-PARTY-LICENSES.md"
# The upstream licence files, kept beside the binaries they belong to.
run mkdir -p "$APP/Contents/Resources/licenses"
[ -f "$WORK_DIR/whisper.cpp/LICENSE" ] && \
  run cp "$WORK_DIR/whisper.cpp/LICENSE" "$APP/Contents/Resources/licenses/whisper.cpp-LICENSE"
[ -f "$WORK_DIR/node/node-v${NODE_VERSION}-darwin-arm64/LICENSE" ] && \
  run cp "$WORK_DIR/node/node-v${NODE_VERSION}-darwin-arm64/LICENSE" \
    "$APP/Contents/Resources/licenses/node-LICENSE"

# ===========================================================================
step "Trimming to Apple Silicon"
# ===========================================================================
# Two mechanical reductions, both provable rather than hopeful:
#
#  * `lipo -thin arm64` on a universal binary. The x86_64 slice of `ollama`
#    alone is 35.9 MB.
#  * deleting Mach-Os that are x86_64-*only*. An arm64 process cannot load an
#    x86_64 dylib, so on this app they are not "probably unused", they are
#    unreachable. All 17 of Ollama's libggml-cpu-* backends are in this group.
thin_or_drop() {
  file="$1"
  archs="$(lipo -archs "$file" 2>/dev/null || echo '')"
  # Not a Mach-O at all — a script, a model file, a licence. Leave it alone.
  [ -z "$archs" ] && return 0
  case " $archs " in
    *" arm64 "*)
      case " $archs " in
        *" x86_64 "*)
          run lipo -thin arm64 "$file" -output "$file.arm64"
          run mv "$file.arm64" "$file"
          ;;
      esac
      ;;
    *) run rm -f "$file" ;;          # x86_64-only: unreachable from an arm64 app
  esac
}

if [ "$DRY_RUN" = 0 ]; then
  find "$APP/Contents" -type f ! -type l -print0 | while IFS= read -r -d '' candidate; do
    thin_or_drop "$candidate"
  done
  ok "thinned to arm64"
else
  note "would run lipo -thin arm64 over every fat Mach-O and delete x86_64-only ones"
fi

if [ "$DROP_MLX" = 1 ]; then
  run rm -rf "$APP/Contents/Helpers/ollama/mlx_metal_v3" "$APP/Contents/Helpers/ollama/mlx_metal_v4"
  warn "MLX runners dropped. Apunta never uses MLX models, but nobody has confirmed"
  note "that Ollama starts happily without them. Draft a note before shipping this."
fi

# ===========================================================================
step "Signing"
# ===========================================================================
# Ad-hoc signing is NOT optional, even though distribution signing is deferred.
# On Apple Silicon an unsigned arm64 Mach-O may refuse to execute at all, so
# `node`, the AI runtime and `whisper-cli` can fail at spawn *after* Gatekeeper
# has been cleared — the app opens and silently does nothing, which is the
# worst failure shape available. It costs nothing and it is the correct first
# step of the signed flow later.
#
# Inside-out: nested code before its container, because the container's
# signature seals over the already-signed nested code. `--deep` is fine for
# verifying and wrong for signing.
IDENTITY="${APUNTA_SIGN_IDENTITY:-}"
if [ -n "$IDENTITY" ]; then
  ok "signing with $IDENTITY"
  SIGN_ARGS="--options runtime --timestamp"
else
  warn "no APUNTA_SIGN_IDENTITY — ad-hoc signing only"
  note "The app will run, and macOS will show the unidentified-developer dialog."
  note "docs/INSTALL.md describes the System Settings path that clears it."
  IDENTITY="-"
  # An ad-hoc signature cannot carry a secure timestamp, and hardened runtime
  # without a real identity buys nothing.
  SIGN_ARGS=""
fi

# SIGN_ARGS is a deliberate word list, so it is unquoted on purpose.
# shellcheck disable=SC2086
sign_one() {
  run codesign --force --sign "$IDENTITY" $SIGN_ARGS "$1"
}

if [ "$DRY_RUN" = 0 ]; then
  # Dylibs and loadable bundles first.
  find "$APP/Contents" -type f ! -type l \
    \( -name '*.dylib' -o -name '*.so' -o -name '*.node' \) -print0 |
    while IFS= read -r -d '' library; do sign_one "$library"; done
  # Then the executables.
  for helper in \
    "$APP/Contents/MacOS/node" \
    "$APP/Contents/Helpers/whisper/whisper-cli"; do
    [ -f "$helper" ] && sign_one "$helper"
  done
  find "$APP/Contents/Helpers/ollama" -type f ! -type l -perm -u+x -print0 |
    while IFS= read -r -d '' helper; do sign_one "$helper"; done
  # The app itself last, sealing everything above it.
  run codesign --force --sign "$IDENTITY" ${SIGN_ARGS:+$SIGN_ARGS} \
    --entitlements "$REPO_ROOT/macos/Apunta/Apunta.entitlements" "$APP"
else
  note "would sign every dylib, then every helper, then the .app, in that order"
fi

# ===========================================================================
step "Verifying the bundle"
# ===========================================================================
# Build steps, not manual checks. A signature problem fails late and its error
# messages are unhelpful if you do not know to look at nested code.
if [ "$DRY_RUN" = 0 ]; then
  run codesign --verify --deep --strict --verbose=2 "$APP"
  ok "every nested binary is signed"
  if [ -n "${APUNTA_SIGN_IDENTITY:-}" ]; then
    spctl --assess --type exec -vv "$APP" || warn "spctl is not satisfied — expected until notarization"
  else
    note "spctl will refuse an ad-hoc signed app. That is what the dialog in INSTALL.md is."
  fi
  # Nothing in the shipped resources may name a host that is not loopback,
  # except the download allow-list the installer carries.
  run node "$REPO_ROOT/scripts/check-no-external-urls.mjs"
fi

# ===========================================================================
step "Notarizing"
# ===========================================================================
NOTARY_PROFILE="${APUNTA_NOTARY_PROFILE:-}"
if [ -z "$NOTARY_PROFILE" ]; then
  warn "no APUNTA_NOTARY_PROFILE — skipping notarization"
  note "Notarization needs an Apple Developer Program membership (99 USD/year),"
  note "which is a deliberate deferral (owner decision, 2026-08-24)."
elif [ -z "${APUNTA_SIGN_IDENTITY:-}" ]; then
  warn "APUNTA_NOTARY_PROFILE is set but APUNTA_SIGN_IDENTITY is not"
  note "The notary service rejects ad-hoc signed apps. Skipping."
else
  # Apple: "you can't upload the .app bundle directly."
  run ditto -c -k --keepParent "$APP" "$WORK_DIR/$APP_NAME.zip"
  run xcrun notarytool submit "$WORK_DIR/$APP_NAME.zip" \
    --keychain-profile "$NOTARY_PROFILE" --wait
  run xcrun stapler staple "$APP"
  ok "notarized and stapled"
fi

# ===========================================================================
step "Building the disk image"
# ===========================================================================
if [ "$SKIP_DMG" = 1 ]; then
  warn "skipped (--skip-dmg)"
else
  STAGE="$WORK_DIR/dmg"
  run rm -rf "$STAGE" "$DMG"
  run mkdir -p "$STAGE"
  run cp -R "$APP" "$STAGE/$APP_NAME.app"
  # The drag-to-install gesture, with no explaining required.
  run ln -s /Applications "$STAGE/Applications"
  run hdiutil create -volname "$APP_NAME" -srcfolder "$STAGE" -ov -format UDZO "$DMG"

  if [ -n "${APUNTA_SIGN_IDENTITY:-}" ]; then
    run codesign --force --sign "$APUNTA_SIGN_IDENTITY" --timestamp "$DMG"
    if [ -n "$NOTARY_PROFILE" ]; then
      run xcrun notarytool submit "$DMG" --keychain-profile "$NOTARY_PROFILE" --wait
      run xcrun stapler staple "$DMG"
    fi
  fi
fi

# ===========================================================================
if [ "$KEEP_WORK" = 0 ] && [ "$DRY_RUN" = 0 ]; then
  # The downloads are kept — they are checksummed and re-fetching 150 MB on
  # every build is rude — but the extracted trees are not.
  rm -rf "$WORK_DIR/node" "$WORK_DIR/ollama" "$WORK_DIR/dmg" "$WORK_DIR/server" "$WORK_DIR/setup"
fi

printf '\n%s────────────────────────────────────────────────────────────%s\n' "$C_BOLD" "$C_RESET"
if [ "$DRY_RUN" = 1 ]; then
  printf '%sDry run finished. Nothing was built.%s\n' "$C_YELLOW$C_BOLD" "$C_RESET"
  exit 0
fi
printf '%sBuilt.%s\n\n' "$C_GREEN$C_BOLD" "$C_RESET"
printf '    %s\n' "$APP"
[ "$SKIP_DMG" = 0 ] && printf '    %s   %s\n' "$DMG" "$(du -h "$DMG" 2>/dev/null | cut -f1)"
printf '\nBefore giving it to anyone, work through the M8 section of\n'
printf 'docs/MANUAL-VERIFICATION.md. None of this has ever run before today.\n'
exit 0

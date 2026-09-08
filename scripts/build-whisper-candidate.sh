#!/bin/bash
#
# Build a private Linux whisper.cpp candidate without touching the installed
# runtime or downloading model weights. This is a development/benchmark tool;
# macOS packaging keeps its existing Metal build in scripts/package-mac.sh.
#
#   bash scripts/build-whisper-candidate.sh
#   APUNTA_WHISPER_BACKEND=vulkan bash scripts/build-whisper-candidate.sh
#   APUNTA_WHISPER_WORK_DIR=/tmp/apunta-whisper-build bash scripts/build-whisper-candidate.sh
#
# The source revision is pinned by commit, not by a movable branch or tag.
# Backend choices are deliberately explicit so a CPU fallback cannot be
# mistaken for a GPU candidate.

set -eu
set -o pipefail

WHISPER_REPO="https://github.com/ggml-org/whisper.cpp.git"
WHISPER_COMMIT="371b5a7561823ab2bb32142d2751e35e7534727b"
BACKEND="${APUNTA_WHISPER_BACKEND:-hip}"
TARGETS="${APUNTA_AMDGPU_TARGETS:-gfx1201}"
JOBS="${APUNTA_BUILD_JOBS:-2}"

if [ "$(uname -s)" != "Linux" ]; then
  printf '%s\n' "This candidate builder is Linux-only; macOS retains its Metal path." >&2
  exit 2
fi

case "$BACKEND" in
  hip|vulkan|cpu) ;;
  *)
    printf 'Unsupported APUNTA_WHISPER_BACKEND=%s (use hip, vulkan, or cpu).\n' "$BACKEND" >&2
    exit 2
    ;;
esac

case "$JOBS" in
  ''|*[!0-9]*) printf '%s\n' 'APUNTA_BUILD_JOBS must be a positive integer.' >&2; exit 2 ;;
esac
if [ "$JOBS" -lt 1 ] || [ "$JOBS" -gt 4 ]; then
  printf '%s\n' 'APUNTA_BUILD_JOBS must be between 1 and 4.' >&2
  exit 2
fi

for tool in cmake git sha256sum; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    printf 'Required development tool is missing: %s\n' "$tool" >&2
    exit 2
  fi
done

if [ "$BACKEND" = hip ] && ! command -v hipcc >/dev/null 2>&1; then
  printf '%s\n' 'HIP backend selected, but hipcc is not on PATH.' >&2
  exit 2
fi
if [ "$BACKEND" = vulkan ] && ! command -v glslc >/dev/null 2>&1; then
  printf '%s\n' 'Vulkan backend selected, but glslc is not on PATH.' >&2
  exit 2
fi

if [ -n "${APUNTA_WHISPER_WORK_DIR:-}" ]; then
  WORK_DIR="$APUNTA_WHISPER_WORK_DIR"
else
  WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/apunta-whisper-build.XXXXXX")"
fi
mkdir -p "$WORK_DIR"
SRC="$WORK_DIR/whisper.cpp"
BUILD="$SRC/build-$BACKEND"

if [ ! -d "$SRC/.git" ]; then
  git clone --filter=blob:none --no-checkout "$WHISPER_REPO" "$SRC"
fi
if [ "$(git -C "$SRC" remote get-url origin)" != "$WHISPER_REPO" ]; then
  printf '%s\n' "Refusing unexpected source remote in $SRC." >&2
  exit 2
fi
git -C "$SRC" fetch --depth 1 origin "$WHISPER_COMMIT"
git -C "$SRC" checkout --detach "$WHISPER_COMMIT" >/dev/null
if [ "$(git -C "$SRC" rev-parse HEAD)" != "$WHISPER_COMMIT" ]; then
  printf '%s\n' 'Source revision verification failed.' >&2
  exit 2
fi

cmake_args=(
  -S "$SRC"
  -B "$BUILD"
  -DCMAKE_BUILD_TYPE=Release
  -DWHISPER_BUILD_TESTS=OFF
  -DWHISPER_BUILD_SERVER=OFF
  -DWHISPER_BUILD_EXAMPLES=ON
  -DWHISPER_CURL=OFF
  -DWHISPER_SDL2=OFF
  -DGGML_CCACHE=OFF
  -DGGML_NATIVE=OFF
  -DGGML_HIP=OFF
  -DGGML_VULKAN=OFF
)
case "$BACKEND" in
  hip) cmake_args+=("-DGGML_HIP=ON" "-DAMDGPU_TARGETS=$TARGETS") ;;
  vulkan) cmake_args+=("-DGGML_VULKAN=ON") ;;
esac

cmake "${cmake_args[@]}"
cmake --build "$BUILD" --target whisper-cli --config Release -j "$JOBS"

CANDIDATE="$BUILD/bin/whisper-cli"
printf 'source=%s\nrevision=%s\nbackend=%s\ncandidate=%s\nsha256=%s\n' \
  "$SRC" "$WHISPER_COMMIT" "$BACKEND" "$CANDIDATE" \
  "$(sha256sum "$CANDIDATE" | awk '{print $1}')"

#!/bin/bash
#
# Apunta — macOS setup. The mutating counterpart to preflight-macos.sh.
#
#   bash scripts/setup-macos.sh              # install what is missing
#   bash scripts/setup-macos.sh --dry-run    # print every command, run none
#   bash scripts/setup-macos.sh --help       # all options
#
# WHAT THIS IS
# ------------
# preflight-macos.sh reads; this one writes. It installs the two local AI
# tools through Homebrew, starts Ollama, picks the writing model from this
# Mac's RAM, pulls it, downloads the speech model into Apunta's data folder
# and verifies its checksum, and records the model choice. Then it stops and
# tells you to run `npm start`.
#
# It is safe to re-run. Everything it does is guarded: `brew install` on an
# installed formula exits 0, `ollama pull` on a present model is a fast no-op,
# and the speech model is only downloaded when the file is absent or its
# checksum does not match.
#
# WHAT IT DELIBERATELY DOES NOT DO
# --------------------------------
#   * It does not install ffmpeg. Nothing in Apunta invokes ffmpeg or ffprobe:
#     the browser records 16 kHz mono WAV and whisper-cli decodes it directly.
#     Installing a GPL-3.0 tool the app never calls is noise that M8 would have
#     to undo (docs/research/m8-bundling-2026-08.md §11, m8-shell-and-runtime
#     §4).
#   * It does not check FileVault, iCloud sync, or Time Machine. Those are
#     preflight-macos.sh's job and it does them better; this script prints a
#     reminder to run it.
#   * It does not touch the database beyond one settings row, and never
#     while the app is running.
#   * It never sets OLLAMA_DEBUG. With it on, Ollama writes the full text of
#     every prompt — which is patient material — into a log file that stays on
#     disk (docs/research/data-at-rest-2026-08.md §2.4).
#
# WHAT WE COULD AND COULD NOT VERIFY WHILE WRITING THIS
# -----------------------------------------------------
# Written on Linux. **No line below has ever been executed on macOS.** It has
# been checked with `bash -n` and `shellcheck`, and every fact it depends on
# comes from a primary source recorded in docs/research/macos-setup-
# verification.md — the Homebrew formula sources for `ollama` and
# `whisper-cpp`, and whisper.cpp's own download script for the model URL and
# its SHA-1. What is *not* verified is that those still hold today and that the
# whole sequence works end to end. Treat the first run as the verification:
# `--dry-run` prints every command without running one.
#
# Portability: /bin/bash on macOS is 3.2, so nothing below uses bash 4 syntax.

set -u

VERSION="1.0"

# --- constants, kept identical to scripts/preflight-macos.sh ----------------
LARGE_TAG="qwen3.6:35b-a3b"
DEFAULT_TAG="gemma4:12b-it-qat"
SMALL_TAG="qwen3.5:4b-q4_K_M"
LARGE_TIER_GIB=36
DEFAULT_TIER_GIB=16

WHISPER_MODEL="ggml-large-v3-turbo-q5_0.bin"
# From whisper.cpp's own models/download-ggml-model.sh: src is the ggerganov
# HF repo (NOT ggml-org — the GitHub org was renamed, the model repo was not),
# and the path is resolve/main/ggml-<model>.bin. -L is required: the resolve
# path redirects to a CDN.
WHISPER_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${WHISPER_MODEL}"
# Published in whisper.cpp's models/README.md. There is no published SHA-256,
# so this is shasum -a 1, not -a 256.
WHISPER_SHA1="e050f7970618a659205450ad97eb95a18d69c9ee"
WHISPER_MIB=547

# Overridable for the same reason the server honours it (M2): tests probe a
# port that is guaranteed dead, so a live Ollama on the machine running the
# suite cannot flip the dry run onto its "already answering" branch.
OLLAMA_URL="${APUNTA_OLLAMA_URL:-http://127.0.0.1:11434}"
NODE_MIN_MAJOR=22

# --- options ----------------------------------------------------------------
DRY_RUN=0
ASSUME_YES=0
MODEL_OVERRIDE=""
SKIP_OLLAMA=0
SKIP_MODELS=0
DATA_DIR_OVERRIDE=""
USE_COLOR=auto

usage() {
  cat <<'USAGE'
Apunta macOS setup — installs the local AI stack and downloads the models.

  bash scripts/setup-macos.sh [options]

  --dry-run          print every command it would run, and run none of them
  --yes              do not ask before a large download (for scripts and CI)
  --model TAG        use this Ollama tag instead of the one this Mac's RAM picks
  --skip-ollama      leave Ollama alone (already installed as the desktop app,
                     or managed some other way)
  --skip-models      install the tools but download nothing
  --data-dir PATH    Apunta's data folder (same meaning as APUNTA_DATA_DIR)
  --no-color         plain text, no ANSI colour
  --help             this message

Exit status: 0 when the stack is ready, 1 when something needs your attention.
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)      DRY_RUN=1 ;;
    --yes|-y)       ASSUME_YES=1 ;;
    --model)        shift; MODEL_OVERRIDE="${1:-}" ;;
    --skip-ollama)  SKIP_OLLAMA=1 ;;
    --skip-models)  SKIP_MODELS=1 ;;
    --data-dir)     shift; DATA_DIR_OVERRIDE="${1:-}" ;;
    --no-color)     USE_COLOR=never ;;
    -h|--help)      usage; exit 0 ;;
    *) printf 'unknown option: %s\n\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

# --- colour -----------------------------------------------------------------
C_RESET=""; C_DIM=""; C_BOLD=""; C_GREEN=""; C_YELLOW=""; C_RED=""
if [ "$USE_COLOR" = auto ] && [ -t 1 ] && [ "${TERM:-dumb}" != dumb ]; then
  C_RESET=$(printf '\033[0m');  C_DIM=$(printf '\033[2m');   C_BOLD=$(printf '\033[1m')
  C_GREEN=$(printf '\033[32m'); C_YELLOW=$(printf '\033[33m'); C_RED=$(printf '\033[31m')
fi

STEP_N=0
step()  { STEP_N=$(( STEP_N + 1 )); printf '\n%s[%d]%s %s\n' "$C_BOLD" "$STEP_N" "$C_RESET" "$1"; }
ok()    { printf '    %s✓%s %s\n' "$C_GREEN" "$C_RESET" "$1"; }
warn()  { printf '    %s!%s %s\n' "$C_YELLOW" "$C_RESET" "$1"; }
fail()  { printf '    %s✗%s %s\n' "$C_RED" "$C_RESET" "$1"; }
note()  { printf '      %s%s%s\n' "$C_DIM" "$1" "$C_RESET"; }
have()  { command -v "$1" >/dev/null 2>&1; }

# Every mutating command goes through this, so --dry-run is complete by
# construction rather than by remembering to guard each call site.
run() {
  if [ "$DRY_RUN" = 1 ]; then
    printf '    %s$ %s%s\n' "$C_DIM" "$*" "$C_RESET"
    return 0
  fi
  printf '    %s$ %s%s\n' "$C_DIM" "$*" "$C_RESET"
  "$@"
}

confirm() {
  [ "$ASSUME_YES" = 1 ] && return 0
  [ "$DRY_RUN" = 1 ] && return 0
  printf '    %s [y/N] ' "$1"
  read -r reply
  case "$reply" in y|Y|yes|YES) return 0 ;; *) return 1 ;; esac
}

PROBLEMS=0
problem() { PROBLEMS=$(( PROBLEMS + 1 )); fail "$1"; }

# ---------------------------------------------------------------------------
# Preconditions
# ---------------------------------------------------------------------------
# APUNTA_SETUP_ALLOW_NON_MACOS=1 exists so `--dry-run` can be exercised off a
# Mac — which is the only way any of this gets checked before it meets one.
# It is honoured for a dry run only: nothing here should ever *run* on Linux.
if [ "$(uname -s 2>/dev/null || echo unknown)" != "Darwin" ]; then
  if [ "${APUNTA_SETUP_ALLOW_NON_MACOS:-0}" != "1" ] || [ "$DRY_RUN" != 1 ]; then
    printf 'This installs the macOS stack and this machine is not a Mac. Nothing was changed.\n' >&2
    exit 2
  fi
  printf '%sNot a Mac: dry run only, and some branches below cannot be evaluated here.%s\n' \
    "$C_YELLOW" "$C_RESET"
fi

if [ "$(id -u)" = "0" ]; then
  printf '%sDo not run this with sudo.%s Homebrew refuses to run as root, and the model\n' "$C_RED" "$C_RESET"
  printf 'files would land in root'"'"'s home instead of yours.\n'
  # A dry run executes nothing, so being root is only a warning there.
  [ "$DRY_RUN" = 1 ] || exit 2
fi

printf '%sApunta setup%s  v%s   %s\n' "$C_BOLD" "$C_RESET" "$VERSION" "$(date '+%Y-%m-%d %H:%M')"
if [ "$DRY_RUN" = 1 ]; then
  printf '%sDry run: every command is printed and none is executed.%s\n' "$C_YELLOW" "$C_RESET"
fi

DATA_DIR="${DATA_DIR_OVERRIDE:-${APUNTA_DATA_DIR:-$HOME/Library/Application Support/Apunta}}"
MODELS_DIR="$DATA_DIR/models"
MODEL_FILE="$MODELS_DIR/$WHISPER_MODEL"

# ===========================================================================
step "Homebrew"
# ===========================================================================
if have brew; then
  ok "$(brew --version 2>/dev/null | head -n 1)"
else
  problem "Homebrew is not installed."
  note "Install it from https://brew.sh, then run this again."
  note "It is the only prerequisite; everything else is installed below."
  # A dry run keeps going so the whole plan is visible; a real run stops,
  # because every remaining step needs brew.
  [ "$DRY_RUN" = 1 ] || exit 1
fi

# ===========================================================================
step "Ollama — the program that runs the writing model"
# ===========================================================================
if [ "$SKIP_OLLAMA" = 1 ]; then
  warn "skipped (--skip-ollama)"
elif [ -d /Applications/Ollama.app ]; then
  # The formula and the cask conflict; brew will fight this and lose loudly.
  problem "Ollama.app is installed, and it conflicts with the 'ollama' formula."
  note "Either remove Ollama.app and re-run this, or keep the app, start it"
  note "yourself, and re-run with --skip-ollama."
elif brew list --formula ollama >/dev/null 2>&1; then
  ok "ollama is already installed"
else
  # The formula, not the cask: CLI and server only, no GUI, no onboarding, no
  # account — and it carries a launchd service block, which the cask does not.
  run brew install ollama || problem "brew install ollama failed"
fi

# ===========================================================================
step "whisper.cpp — the program that reads recordings"
# ===========================================================================
if brew list --formula whisper-cpp >/dev/null 2>&1; then
  ok "whisper-cpp is already installed"
else
  run brew install whisper-cpp || problem "brew install whisper-cpp failed"
fi

if have whisper-cli || [ "$DRY_RUN" = 1 ]; then
  ok "whisper-cli is on the PATH"
else
  warn "whisper-cli is not on the PATH yet — open a new Terminal window"
fi

# ===========================================================================
step "Node — what Apunta itself runs on"
# ===========================================================================
NODE_MAJOR=0
if have node; then
  NODE_MAJOR=$(node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1)
  case "$NODE_MAJOR" in ''|*[!0-9]*) NODE_MAJOR=0 ;; esac
fi

if [ "$NODE_MAJOR" -ge "$NODE_MIN_MAJOR" ]; then
  ok "node $(node -v)"
elif [ "$NODE_MAJOR" = 0 ]; then
  run brew install node@22 || problem "brew install node@22 failed"
  note "node@22 is keg-only: if 'node -v' still finds nothing, add it to your PATH"
  note "with the line 'brew info node@22' prints."
else
  warn "node v$NODE_MAJOR is older than v$NODE_MIN_MAJOR, which Apunta needs"
  run brew install node@22 || problem "brew install node@22 failed"
fi

# ===========================================================================
step "Starting Ollama, and keeping it started"
# ===========================================================================
ollama_up() { curl -fsS --max-time 3 "$OLLAMA_URL/" 2>/dev/null | grep -q "Ollama is running"; }

if [ "$SKIP_OLLAMA" = 1 ]; then
  warn "skipped (--skip-ollama)"
elif ollama_up; then
  ok "already answering at $OLLAMA_URL"
else
  # `brew services start` runs it now and at login. The formula's service block
  # sets OLLAMA_FLASH_ATTENTION=1 and OLLAMA_KV_CACHE_TYPE=q8_0 for us; the
  # second is what makes a 16K context affordable on a 16 GB Mac. Do not undo
  # them (docs/research/macos-setup-verification.md §1.3).
  run brew services start ollama || problem "brew services start ollama failed"

  if [ "$DRY_RUN" = 0 ]; then
    printf '    waiting for Ollama'
    i=0
    while [ "$i" -lt 30 ]; do
      if ollama_up; then break; fi
      printf '.'
      sleep 1
      i=$(( i + 1 ))
    done
    printf '\n'
    if ollama_up; then
      ok "answering at $OLLAMA_URL"
    else
      problem "Ollama did not start within 30s"
      note "Look at $(brew --prefix)/var/log/ollama.log"
    fi
  fi
fi

# ===========================================================================
step "Choosing the writing model for this Mac"
# ===========================================================================
# hw.memsize is total physical RAM in bytes. Not hw.physmem, which saturates
# at 4 GB and is wrong on every modern Mac.
RAM_BYTES=$(sysctl -n hw.memsize 2>/dev/null || echo 0)
case "$RAM_BYTES" in ''|*[!0-9]*) RAM_BYTES=0 ;; esac
RAM_GIB=$(( RAM_BYTES / 1073741824 ))

if [ -n "$MODEL_OVERRIDE" ]; then
  MODEL="$MODEL_OVERRIDE"
  ok "using $MODEL (--model)"
elif [ "$RAM_GIB" -ge "$LARGE_TIER_GIB" ]; then
  MODEL="$LARGE_TAG"
  ok "${RAM_GIB} GB of memory → $MODEL"
elif [ "$RAM_GIB" -ge "$DEFAULT_TIER_GIB" ]; then
  MODEL="$DEFAULT_TAG"
  ok "${RAM_GIB} GB of memory → $MODEL"
else
  MODEL="$SMALL_TAG"
  ok "${RAM_GIB} GB of memory → $MODEL"
  note "This is the small-model tier. It works; the notes will be rougher."
fi

# An MLX or safetensors flavour routes to Ollama's MLX engine, which silently
# ignores the JSON-schema `format` parameter — so the note's structure is not
# enforced at all, with no error (ollama#16563). Refuse the tag rather than
# discover it in a note.
case "$MODEL" in
  *-mlx|*-mlx:*|*-nvfp4*|*-mxfp8*|*-bf16*)
    problem "$MODEL names a non-GGUF weight format."
    note "Ollama routes those to its MLX engine, which ignores the JSON schema"
    note "that keeps a note in its sections — silently, with no error."
    note "Use a GGUF tag: $DEFAULT_TAG"
    MODEL=""
    ;;
esac

# ===========================================================================
step "Downloading the writing model"
# ===========================================================================
if [ "$SKIP_MODELS" = 1 ] || [ -z "$MODEL" ]; then
  warn "skipped"
elif [ "$SKIP_OLLAMA" = 0 ] && ! ollama_up && [ "$DRY_RUN" = 0 ]; then
  warn "skipped — Ollama is not answering"
elif [ "$DRY_RUN" = 0 ] && ollama list 2>/dev/null | grep -q "^${MODEL}[[:space:]]"; then
  ok "$MODEL is already downloaded"
else
  note "This is a large download — several gigabytes."
  if confirm "Pull $MODEL now?"; then
    run ollama pull "$MODEL" || problem "ollama pull $MODEL failed"
  else
    warn "skipped. Run 'ollama pull $MODEL' when you are ready."
  fi
fi

# ===========================================================================
step "Downloading the speech model"
# ===========================================================================
model_ok() {
  [ -f "$MODEL_FILE" ] || return 1
  actual=$(shasum -a 1 "$MODEL_FILE" 2>/dev/null | cut -d' ' -f1)
  [ "$actual" = "$WHISPER_SHA1" ]
}

if [ "$SKIP_MODELS" = 1 ]; then
  warn "skipped (--skip-models)"
elif [ "$DRY_RUN" = 0 ] && model_ok; then
  ok "$WHISPER_MODEL is already there and its checksum matches"
else
  note "$WHISPER_MODEL — about ${WHISPER_MIB} MB, into"
  note "$MODELS_DIR"
  if confirm "Download it now?"; then
    # 0700: the data folder holds clinical notes, and Node's default 0755 is
    # wrong the moment APUNTA_DATA_DIR points somewhere shared
    # (docs/research/data-at-rest-2026-08.md §2.2).
    run mkdir -p "$MODELS_DIR"
    run chmod 700 "$DATA_DIR" "$MODELS_DIR"
    # To .part first, then verify, then rename: a half-downloaded file that
    # already has the real name is a file whisper will fail on confusingly.
    run curl -fL --retry 3 --progress-bar -o "$MODEL_FILE.part" "$WHISPER_URL" \
      || problem "downloading the speech model failed"

    if [ "$DRY_RUN" = 0 ] && [ -f "$MODEL_FILE.part" ]; then
      actual=$(shasum -a 1 "$MODEL_FILE.part" | cut -d' ' -f1)
      if [ "$actual" = "$WHISPER_SHA1" ]; then
        run mv "$MODEL_FILE.part" "$MODEL_FILE"
        ok "downloaded and verified"
      else
        rm -f "$MODEL_FILE.part"
        problem "checksum mismatch — expected $WHISPER_SHA1, got $actual"
        note "The download was discarded. Try again; if it keeps failing, the"
        note "published file may have changed and this script needs updating."
      fi
    fi
  else
    warn "skipped. Recording will not work until this file exists."
  fi
fi

# ===========================================================================
step "Recording the model choice"
# ===========================================================================
# Belt and braces: Apunta picks the same model from this Mac's RAM at runtime
# using the same table, so an unwritten setting is not a broken install. This
# only pins the choice so a later RAM change or a --model override sticks.
DB_FILE="$DATA_DIR/apunta.db"

if [ -z "$MODEL" ]; then
  warn "no model chosen, nothing to record"
elif curl -fsS --max-time 3 "http://127.0.0.1:7717/api/health" >/dev/null 2>&1; then
  # Apunta is running: go through its own API rather than writing to a
  # database it has open.
  run curl -fsS -X PUT "http://127.0.0.1:7717/api/settings" \
    -H 'content-type: application/json' \
    -d "{\"llm_model\":\"$MODEL\"}" >/dev/null \
    && ok "recorded through the running app"
elif [ -f "$DB_FILE" ] && have sqlite3; then
  # Values in `settings` are JSON-encoded, hence the inner quotes.
  run sqlite3 "$DB_FILE" \
    "INSERT INTO settings (key, value) VALUES ('llm_model', '\"$MODEL\"')
       ON CONFLICT(key) DO UPDATE SET value = excluded.value;" \
    && ok "recorded in $DB_FILE"
else
  ok "nothing to record yet — Apunta picks $MODEL from this Mac's memory on its own"
fi

# ===========================================================================
printf '\n%s────────────────────────────────────────────────────────────%s\n' "$C_BOLD" "$C_RESET"
if [ "$PROBLEMS" -eq 0 ]; then
  printf '%sReady.%s\n\n' "$C_GREEN$C_BOLD" "$C_RESET"
  printf 'Start Apunta:\n\n'
  printf '    %snpm start%s\n\n' "$C_BOLD" "$C_RESET"
  printf 'It opens http://127.0.0.1:7717 in your browser.\n\n'
  printf 'Two things worth doing next, in this order:\n\n'
  printf '  1. %sbash scripts/preflight-macos.sh%s\n' "$C_BOLD" "$C_RESET"
  printf '     Read-only. It checks the things this script does not: whether the\n'
  printf '     disk is encrypted, whether iCloud is syncing the folders you would\n'
  printf '     naturally save a backup into, and whether you have a Time Machine\n'
  printf '     backup at all. See docs/PREFLIGHT.md.\n\n'
  printf '  2. %snpm run smoke:live -- --runs 5%s\n' "$C_BOLD" "$C_RESET"
  printf '     Puts a real dictation through the real model five times and checks\n'
  printf '     what comes back. Everything automated in this project runs against a\n'
  printf '     fake AI, so this is the first evidence the model itself works.\n'
  printf '     The %s--%s is not optional.\n\n' "$C_BOLD" "$C_RESET"
  exit 0
fi

printf '%s%d thing(s) need your attention.%s\n' "$C_RED$C_BOLD" "$PROBLEMS" "$C_RESET"
printf 'Nothing above is destructive, so fixing them and re-running is safe.\n'
exit 1

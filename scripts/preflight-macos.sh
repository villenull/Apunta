#!/bin/bash
#
# Apunta — macOS pre-flight check.
#
#   ./preflight-macos.sh              # run every check, print a report
#   ./preflight-macos.sh --help       # options
#
# WHAT THIS IS
# ------------
# Apunta was built entirely inside a Linux container. A number of load-bearing
# facts about the Mac it is actually for have never been checked on a Mac. They
# are scattered across docs/research/ with a "verify this on a real Mac" note
# attached to each, which in practice means nobody does. This script gathers
# them into one command.
#
# WHAT THIS IS NOT
# ----------------
# It does not install anything, download anything, change any setting, or write
# any file outside one temporary directory that it deletes on exit. Everything
# that would require a change is printed as a recommendation with the exact
# command, and left for a human to run deliberately. Run it as many times as
# you like; it cannot break the machine.
#
# It also never prints your Mac's serial number, hardware UUID, or the names on
# your code-signing certificates, so the output is safe to paste into a message.
# It does print paths that contain your macOS user name.
#
# WHAT WE COULD AND COULD NOT VERIFY WHILE WRITING THIS
# -----------------------------------------------------
# Written on Linux, so no command below was ever executed on macOS. Syntax was
# checked against primary or near-primary sources rather than recalled, and the
# few places where that failed are marked inline with "UNVERIFIED SYNTAX" and
# are written so that a wrong guess degrades to "could not determine" instead of
# to a false statement. Specifically:
#
#   verified from sources   fdesetup status (non-root, "FileVault is On/Off",
#                           deferred-enablement wording); tmutil isexcluded
#                           ([Excluded]/[Included]) and listlocalsnapshots;
#                           tmutil destinationinfo field names AND the fact
#                           that it does NOT report encryption; sysctl keys
#                           hw.memsize / machdep.cpu.brand_string /
#                           hw.perflevel0.physicalcpu / hw.perflevel1.physicalcpu;
#                           mdutil -s semantics and its sudo caveat; Ollama
#                           GET /api/tags -> models[].details.format and
#                           POST /api/show -> model_info["<arch>.context_length"]
#                           (read from ollama/ollama docs/api.md).
#   UNVERIFIED SYNTAX       the `defaults` key for iCloud "Optimize Mac Storage"
#                           (com.apple.bird optimize-storage) — treated as a
#                           hint only, with an independent evidence-based check
#                           (dataless files) alongside it; the exact wording of
#                           diskutil's encryption lines; whether ~/Desktop is a
#                           symlink when Desktop & Documents sync is on (so the
#                           sync test used is the one docs/research says to use:
#                           does ~/Library/Mobile Documents/com~apple~CloudDocs/
#                           Desktop exist).
#
# DELIBERATE OMISSIONS
#   * Nothing here runs `python3`, `git`, or `cc` unless the Xcode Command Line
#     Tools are already installed. On a Mac without them, running any of those
#     pops a GUI installer prompt — a read-only script must not do that.
#   * Homebrew is not assumed. It is reported if present and never required.
#   * The two probes that need a file to be written (does Spotlight index the
#     text inside a .md file, and does a full run of the model behave) are NOT
#     performed here. They are in PREFLIGHT.md as manual steps.
#
# Portability: /bin/bash on macOS is 3.2, so nothing below uses bash 4 syntax.

set -u

VERSION="1.0"

# ---------------------------------------------------------------------------
# Facts this script is testing, quoted from the project's own research so a
# surprising result is legible rather than just a line of output.
# ---------------------------------------------------------------------------
# data-at-rest-2026-08.md  §7 items 1-9 (the nine [I] claims)
# m3-preflight-2026-08.md  §1.1 tags, §1.3 details.format, §3.G repetition loop
# m8-bundling-2026-08.md   §5 whisper-cli has no prebuilt macOS binary, §7 signing
# PLAN.md                  §2 RAM -> model tier table

# --- constants from the project ---------------------------------------------
LARGE_TAG="qwen3.6:35b-a3b";     LARGE_GB="24"
DEFAULT_TAG="gemma4:12b-it-qat"; DEFAULT_GB="7.2"
SMALL_TAG="qwen3.5:4b-q4_K_M";   SMALL_GB="3.4"
LARGE_TIER_GIB=36
DEFAULT_TIER_GIB=16
WHISPER_MODEL="ggml-tiny.en.bin"
WHISPER_SHA1="c78c86eb1a8faa21b369bcd33207cc90d64ae9df"
WHISPER_MIB=75
OLLAMA_DEFAULT_URL="http://127.0.0.1:11434"
MIN_MACOS_MAJOR=13   # llama.cpp release binaries target macOS 13.3
NODE_MIN_MAJOR=22    # package.json "engines"

# --- options ----------------------------------------------------------------
USE_COLOR=auto
DO_CHECKSUM=0
VERBOSE=0
DATA_DIR_OVERRIDE=""

usage() {
  cat <<'USAGE'
Apunta macOS pre-flight — read-only. Changes nothing, installs nothing.

  ./preflight-macos.sh [options]

  --data-dir PATH   check this data directory instead of the default
                    (same meaning as the APUNTA_DATA_DIR environment variable)
  --checksum        also SHA-1 the whisper model file (adds a moment for 75 MB)
  --no-color        plain text, no ANSI colour
  --verbose         show the raw output of commands that failed
  --help            this message

Exit status: 0 if nothing is blocking, 1 if the verdict lists an action.
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --no-color) USE_COLOR=never ;;
    --color)    USE_COLOR=always ;;
    --checksum) DO_CHECKSUM=1 ;;
    --verbose)  VERBOSE=1 ;;
    --data-dir) shift; DATA_DIR_OVERRIDE="${1:-}" ;;
    -h|--help)  usage; exit 0 ;;
    *) printf 'unknown option: %s\n\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

# --- colour -----------------------------------------------------------------
C_RESET=""; C_DIM=""; C_BOLD=""; C_GREEN=""; C_YELLOW=""; C_RED=""; C_BLUE=""
if [ "$USE_COLOR" = always ] || { [ "$USE_COLOR" = auto ] && [ -t 1 ] && [ "${TERM:-dumb}" != dumb ]; }; then
  C_RESET=$(printf '\033[0m');  C_DIM=$(printf '\033[2m');   C_BOLD=$(printf '\033[1m')
  C_GREEN=$(printf '\033[32m'); C_YELLOW=$(printf '\033[33m')
  C_RED=$(printf '\033[31m');   C_BLUE=$(printf '\033[36m')
fi

# --- scratch space (the only thing this script writes) ----------------------
TMPD=""
cleanup() { [ -n "$TMPD" ] && [ -d "$TMPD" ] && rm -rf "$TMPD"; }
trap cleanup EXIT HUP INT TERM
TMPD=$(mktemp -d "${TMPDIR:-/tmp}/apunta-preflight.XXXXXX" 2>/dev/null) || {
  printf 'could not create a temporary directory; aborting\n' >&2; exit 2; }
RT_OUT="$TMPD/out"; RT_ERR="$TMPD/err"
: >"$RT_OUT"; : >"$RT_ERR"

# --- tallies ----------------------------------------------------------------
CHECK_N=0
N_OK=0; N_WARN=0; N_ACT=0; N_UNK=0; N_INFO=0
ACT_FILE="$TMPD/actions"; WARN_FILE="$TMPD/warns"; : >"$ACT_FILE"; : >"$WARN_FILE"
# actions are kept in files, not arrays: macOS ships bash 3.2, where an empty
# array under `set -u` is an "unbound variable" error.
# record format: "priority|headline|command"

have() { command -v "$1" >/dev/null 2>&1; }

# BSD sleep takes fractional seconds; probe once rather than assume it.
if sleep 0.2 >/dev/null 2>&1; then SLEEP_TICK="0.2"; TICKS_PER_SEC=5
else                               SLEEP_TICK="1";   TICKS_PER_SEC=1; fi

# run_t SECONDS cmd args...
#   Runs a command with a wall-clock limit. Sets RT_RC and RT_TIMEOUT; output
#   lands in $RT_OUT / $RT_ERR. macOS has no timeout(1) and no coreutils, so
#   this polls instead. Deliberately not a command substitution, because the
#   globals would be lost in the subshell. Nothing here is ever a command that
#   changes state, so a kill can only ever abandon a read.
run_t() {
  local secs="$1"; shift
  RT_RC=127; RT_TIMEOUT=0
  : >"$RT_OUT"; : >"$RT_ERR"
  have "$1" || { RT_RC=127; return 127; }
  "$@" >"$RT_OUT" 2>"$RT_ERR" &
  local pid=$! i=0 ticks
  ticks=$(( secs * TICKS_PER_SEC ))
  while [ "$i" -lt "$ticks" ]; do
    kill -0 "$pid" 2>/dev/null || break
    sleep "$SLEEP_TICK"
    i=$(( i + 1 ))
  done
  if kill -0 "$pid" 2>/dev/null; then
    RT_TIMEOUT=1
    kill -TERM "$pid" 2>/dev/null
    sleep "$SLEEP_TICK"
    kill -KILL "$pid" 2>/dev/null
  fi
  wait "$pid" 2>/dev/null
  RT_RC=$?
  return "$RT_RC"
}
rt() { cat "$RT_OUT" 2>/dev/null; }

# --- report primitives ------------------------------------------------------
hdr() {
  printf '\n%s%s%s\n' "$C_BOLD" "────────────────────────────────────────────────────────────────────" "$C_RESET"
  printf '%s %s%s\n' "$C_BOLD" "$1" "$C_RESET"
  printf '%s%s%s\n\n' "$C_BOLD" "────────────────────────────────────────────────────────────────────" "$C_RESET"
}
check() {                       # check "label"
  CHECK_N=$(( CHECK_N + 1 ))
  printf '%s[%2d]%s %s\n' "$C_DIM" "$CHECK_N" "$C_RESET" "$1"
}
claim() {                       # claim "source" "the finding under test"
  printf '      %stesting: %s — %s%s\n' "$C_DIM" "$1" "$2" "$C_RESET"
}
res() {                         # res STATUS "detail..."
  local s="$1"; shift
  local colour="$C_RESET" label="$s"
  case "$s" in
    OK)      colour="$C_GREEN";  N_OK=$((N_OK+1)) ;;
    WARN)    colour="$C_YELLOW"; N_WARN=$((N_WARN+1)) ;;
    ACTION)  colour="$C_RED";    N_ACT=$((N_ACT+1)) ;;
    UNKNOWN) colour="$C_BLUE";   N_UNK=$((N_UNK+1)) ;;
    INFO)    colour="$C_BLUE";   N_INFO=$((N_INFO+1)) ;;
    SKIP)    colour="$C_DIM";    N_INFO=$((N_INFO+1)) ;;
  esac
  printf '      %s%-7s%s %s\n' "$colour" "$label" "$C_RESET" "${1:-}"
  [ $# -gt 0 ] && shift
  while [ $# -gt 0 ]; do printf '              %s\n' "$1"; shift; done
  return 0
}
note() { printf '              %s%s%s\n' "$C_DIM" "$1" "$C_RESET"; }
# priority (01..99) | headline | command — one record per line, sorted at the end
act()  { printf '%s|%s|%s\n' "$1" "$2" "$3" >>"$ACT_FILE"; }
warned() { printf '%s\n' "$1" >>"$WARN_FILE"; }
verbose_err() {
  [ "$VERBOSE" = 1 ] || return 0
  [ -s "$RT_ERR" ] || return 0
  sed 's/^/              | /' "$RT_ERR"
}

# ---------------------------------------------------------------------------
# Preconditions
# ---------------------------------------------------------------------------
OS_NAME=$(uname -s 2>/dev/null || echo unknown)
if [ "$OS_NAME" != "Darwin" ] && [ "${APUNTA_PREFLIGHT_ALLOW_NON_MACOS:-0}" != "1" ]; then
  printf '%s\n' "This is a macOS check and this machine reports '$OS_NAME'."
  printf '%s\n' "Run it on the Mac that will hold the notes. Nothing was changed."
  exit 2
fi
if [ "$(id -u)" = "0" ]; then
  printf '%s%s%s\n\n' "$C_YELLOW" \
    "Note: running as root. Home-directory paths below will be root's, not yours — re-run without sudo for a meaningful report." "$C_RESET"
fi

printf '%sApunta pre-flight%s  v%s   %s\n' "$C_BOLD" "$C_RESET" "$VERSION" "$(date '+%Y-%m-%d %H:%M')"
printf '%s\n' "Read-only: nothing is installed, downloaded, or changed."

# ===========================================================================
hdr "1. THIS MACHINE, AND THE MODEL TIER PLAN §2 PUTS IT IN"
# ===========================================================================

check "macOS version"
MACOS_VER=$(sw_vers -productVersion 2>/dev/null)
MACOS_BUILD=$(sw_vers -buildVersion 2>/dev/null)
MACOS_MAJOR=$(printf '%s' "${MACOS_VER:-0}" | cut -d. -f1)
case "$MACOS_MAJOR" in ''|*[!0-9]*) MACOS_MAJOR=0 ;; esac
if [ "$MACOS_MAJOR" -eq 0 ]; then
  res UNKNOWN "could not read the macOS version (sw_vers)"
elif [ "$MACOS_MAJOR" -ge "$MIN_MACOS_MAJOR" ]; then
  res OK "macOS $MACOS_VER (build $MACOS_BUILD)"
else
  res ACTION "macOS $MACOS_VER — below the 13.3 floor the bundled AI binaries are built for"
  act 10 "macOS $MACOS_VER is older than 13.3; llama.cpp/whisper.cpp release binaries will not launch" \
      "System Settings → General → Software Update"
fi

check "Processor and architecture"
ARCH=$(uname -m 2>/dev/null)
CHIP=$(sysctl -n machdep.cpu.brand_string 2>/dev/null)
HWMODEL=$(sysctl -n hw.model 2>/dev/null)
TRANSLATED=$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)
if [ "$ARCH" = "arm64" ]; then
  res OK "${CHIP:-Apple silicon} — $ARCH${HWMODEL:+ ($HWMODEL)}"
elif [ "$TRANSLATED" = "1" ]; then
  res WARN "running under Rosetta (x86_64 shell on Apple silicon)" \
           "Numbers below may be wrong. Open a native Terminal and re-run."
  warned "this shell is running under Rosetta; re-run in a native Terminal"
else
  res WARN "${CHIP:-unknown CPU} — $ARCH (Apunta targets Apple silicon)"
  warned "this Mac is not Apple silicon; the model tiers in PLAN §2 assume Metal on Apple silicon"
fi

check "Core counts"
CPU_P=$(sysctl -n hw.perflevel0.physicalcpu 2>/dev/null)
CPU_E=$(sysctl -n hw.perflevel1.physicalcpu 2>/dev/null)
CPU_TOT=$(sysctl -n hw.physicalcpu 2>/dev/null)
if [ -n "$CPU_TOT" ]; then
  if [ -n "$CPU_P" ] && [ -n "$CPU_E" ]; then
    res OK "$CPU_TOT physical cores — $CPU_P performance, $CPU_E efficiency"
    note "whisper-cli should be given -t $CPU_P (performance cores only)"
  else
    res OK "$CPU_TOT physical cores"
  fi
else
  res UNKNOWN "could not read core counts (sysctl hw.physicalcpu)"
fi

check "Installed memory"
MEM_BYTES=$(sysctl -n hw.memsize 2>/dev/null)
case "${MEM_BYTES:-x}" in ''|*[!0-9]*) MEM_BYTES="" ;; esac
if [ -n "$MEM_BYTES" ]; then
  MEM_GIB=$(( MEM_BYTES / 1073741824 ))
  res OK "$MEM_GIB GiB ($MEM_BYTES bytes)"
else
  MEM_GIB=0
  res UNKNOWN "could not read hw.memsize" \
      "Apunta falls back to the smallest model when it cannot read this."
fi

MODEL_GB_INT=4; METAL_BUDGET=0; HEADROOM=0   # safe defaults; set for real below
check "Model tier — PLAN §2's table, applied to the numbers above"
claim "PLAN §2" "the RAM→model table, and its assumption that Metal can only use ~75% of unified RAM"
if [ "$MEM_GIB" -eq 0 ]; then
  TIER_TAG="$SMALL_TAG"; TIER_GB="$SMALL_GB"; TIER_NAME="fallback"
  res UNKNOWN "memory unreadable, so Apunta would pick the fallback model: $SMALL_TAG"
else
  if   [ "$MEM_GIB" -ge "$LARGE_TIER_GIB" ];   then TIER_TAG="$LARGE_TAG";   TIER_GB="$LARGE_GB";   TIER_NAME="large (>= ${LARGE_TIER_GIB}GB)"
  elif [ "$MEM_GIB" -ge "$DEFAULT_TIER_GIB" ]; then TIER_TAG="$DEFAULT_TAG"; TIER_GB="$DEFAULT_GB"; TIER_NAME="default (${DEFAULT_TIER_GIB}-$((LARGE_TIER_GIB-1))GB)"
  else                                              TIER_TAG="$SMALL_TAG";   TIER_GB="$SMALL_GB";   TIER_NAME="small (< ${DEFAULT_TIER_GIB}GB)"
  fi
  METAL_BUDGET=$(( MEM_GIB * 3 / 4 ))
  # integer maths only: compare whole GiB, rounding the model size up
  MODEL_GB_INT=$(printf '%s' "$TIER_GB" | cut -d. -f1)
  case "${MODEL_GB_INT:-x}" in ''|*[!0-9]*) MODEL_GB_INT=0 ;; esac
  MODEL_GB_INT=$(( MODEL_GB_INT + 1 ))
  HEADROOM=$(( METAL_BUDGET - MODEL_GB_INT ))
  res OK "tier: $TIER_NAME  →  $TIER_TAG  (~${TIER_GB} GB of weights)"
  note "Metal's usable share of $MEM_GIB GiB is roughly ${METAL_BUDGET} GiB (the ~75% rule PLAN §2 relies on)"
  note "that leaves about ${HEADROOM} GiB for the KV cache, macOS and a browser"
  if [ "$HEADROOM" -lt 4 ]; then
    res WARN "headroom is thin — expect CPU offload or a load failure on this tier"
    warned "the PLAN §2 tier for this machine leaves under 4 GiB of Metal headroom; verify with a real draft before trusting it"
  fi
  note "PLAN §2 says the target Mac lands on $DEFAULT_TAG — this machine lands on $TIER_TAG"
fi

# ===========================================================================
hdr "2. FILEVAULT — the only thing between a stolen laptop and the records"
# ===========================================================================

check "FileVault status"
claim "data-at-rest §7.1 [inference]" "\"FileVault is on\" is assumed everywhere and has never been checked; recent Apple silicon may not prompt for it at setup"
FV_STATE="unknown"
if have fdesetup; then
  run_t 15 fdesetup status
  FV_OUT=$(rt)
  if [ "$RT_TIMEOUT" = "1" ]; then
    res UNKNOWN "fdesetup status did not return within 15s"
  elif [ -z "$FV_OUT" ]; then
    res UNKNOWN "fdesetup status returned nothing (rc=$RT_RC)"
    verbose_err
  else
    case "$FV_OUT" in
      *"FileVault is On"*)
        FV_STATE="on"
        res OK "$(printf '%s' "$FV_OUT" | head -n 1)"
        case "$FV_OUT" in
          *"Encryption in progress"*|*"Percent completed"*)
            res INFO "encryption is still running — it is not fully protected until this finishes"
            printf '%s\n' "$FV_OUT" | sed 's/^/              /' ;;
        esac
        ;;
      *"Deferred enablement"*)
        FV_STATE="deferred"
        res ACTION "FileVault is OFF, with enablement deferred to the next login"
        printf '%s\n' "$FV_OUT" | sed 's/^/              /'
        act 01 "FileVault is not yet on — log out and back in to finish enabling it" \
            "System Settings → Privacy & Security → FileVault (or just log out and in)"
        ;;
      *"FileVault is Off"*)
        FV_STATE="off"
        res ACTION "FileVault is OFF — the disk is not encrypted"
        note "Every note, transcript and draft on this Mac is readable by anyone who"
        note "takes the machine. Nothing else in Apunta compensates for this."
        act 01 "Turn on FileVault before any real patient information is entered" \
            "System Settings → Privacy & Security → FileVault → Turn On"
        ;;
      *)
        res UNKNOWN "unrecognised fdesetup output:"
        printf '%s\n' "$FV_OUT" | sed 's/^/              /' ;;
    esac
  fi
else
  res UNKNOWN "fdesetup not found (expected at /usr/bin/fdesetup)"
fi

check "Boot volume encryption — independent cross-check"
if have diskutil; then
  run_t 20 diskutil apfs list
  if [ "$RT_TIMEOUT" = "1" ]; then
    res SKIP "diskutil apfs list did not return within 20s"
  elif [ "$RT_RC" != "0" ]; then
    res SKIP "diskutil apfs list unavailable (rc=$RT_RC)"
    verbose_err
  else
    # UNVERIFIED SYNTAX: the exact wording of these lines varies by macOS
    # release, so this only ever reports what it saw and never contradicts
    # fdesetup, which is the authority.
    FV_LINES=$(rt | grep -i -E 'FileVault|Encrypted' | sed 's/^[[:space:]]*//' | sort -u | head -n 6)
    if [ -n "$FV_LINES" ]; then
      res INFO "diskutil reports:"
      printf '%s\n' "$FV_LINES" | sed 's/^/              /'
    else
      res INFO "diskutil printed no encryption lines; treat fdesetup above as the answer"
    fi
  fi
else
  res SKIP "diskutil not found"
fi

check "What FileVault does NOT cover — screen lock and auto-login"
claim "data-at-rest §8 risk 3" "the highest-probability confidentiality risk is someone reading the notes on the unlocked, logged-in Mac; FileVault contributes nothing there"
SL_ASK=$(defaults read com.apple.screensaver askForPassword 2>/dev/null)
SL_DELAY=$(defaults read com.apple.screensaver askForPasswordDelay 2>/dev/null)
AUTOLOGIN=$(defaults read /Library/Preferences/com.apple.loginwindow autoLoginUser 2>/dev/null)
SL_SAID=0
if [ -n "$AUTOLOGIN" ]; then
  res ACTION "automatic login is enabled for '$AUTOLOGIN' — the Mac boots straight into the account"
  act 03 "Turn off automatic login so a restart does not unlock the records" \
      "System Settings → Users & Groups → Automatically log in as → Off"
  SL_SAID=1
fi
if [ -n "$SL_ASK" ]; then
  if [ "$SL_ASK" = "1" ]; then
    res OK "a password is required after the screen saver / sleep${SL_DELAY:+ (delay: ${SL_DELAY}s)}"
  else
    res WARN "no password required when the screen wakes"
    warned "the screen unlocks without a password — see PREFLIGHT.md"
  fi
  SL_SAID=1
fi
if [ "$SL_SAID" = "0" ]; then
  res UNKNOWN "could not read the lock-screen settings from the command line" \
      "Recent macOS moved these; check System Settings → Lock Screen by hand."
fi

# ===========================================================================
hdr "3. WHERE THE DATA WOULD LIVE"
# ===========================================================================

if [ -n "$DATA_DIR_OVERRIDE" ]; then
  DATA_DIR="$DATA_DIR_OVERRIDE"; DATA_SRC="--data-dir"
elif [ -n "${APUNTA_DATA_DIR:-}" ]; then
  DATA_DIR="$APUNTA_DATA_DIR"; DATA_SRC="APUNTA_DATA_DIR"
else
  DATA_DIR="$HOME/Library/Application Support/Apunta"; DATA_SRC="default"
fi

check "Data directory"
res INFO "$DATA_DIR" "resolved from: $DATA_SRC"
if [ -d "$DATA_DIR" ]; then
  DB_FILE="$DATA_DIR/apunta.db"
  if [ -f "$DB_FILE" ]; then
    DB_SIZE=$(du -h "$DB_FILE" 2>/dev/null | awk '{print $1}')
    res OK "exists, and already contains a database (apunta.db, ${DB_SIZE:-?})"
  else
    res OK "exists, no database in it yet"
  fi
else
  res INFO "does not exist yet — Apunta creates it on first run"
fi

check "Permissions on the data directory and its files"
claim "data-at-rest §2.2 [verified on Linux, unverified on macOS]" "Node and SQLite defaults give 0755 on the directory and 0644 on the database; the fix is 0700/0600"
# `stat -f FMT` is BSD syntax (macOS). GNU stat spells -f differently and would
# print filesystem information instead, so the result is validated as a plain
# octal mode before it is believed. A wrong answer here is worse than none.
mode_of() {
  local m
  m=$(stat -f '%Lp' "$1" 2>/dev/null)
  case "${m:-x}" in
    [0-7][0-7][0-7]|[0-7][0-7][0-7][0-7]) printf '%s' "$m" ;;
    *) printf '' ;;
  esac
}
if have stat && [ -d "$DATA_DIR" ]; then
  PERM_BAD=0
  DIR_MODE=$(mode_of "$DATA_DIR")
  if [ -n "$DIR_MODE" ]; then
    if [ "$DIR_MODE" = "700" ]; then
      res OK "directory mode $DIR_MODE"
    else
      res WARN "directory mode $DIR_MODE (want 700)"
      PERM_BAD=1
    fi
    for f in apunta.db apunta.db-wal apunta.db-shm; do
      [ -e "$DATA_DIR/$f" ] || continue
      M=$(mode_of "$DATA_DIR/$f")
      if [ -z "$M" ]; then res UNKNOWN "$f mode unreadable"
      elif [ "$M" = "600" ]; then res OK "$f mode $M"
      else res WARN "$f mode $M (want 600)"; PERM_BAD=1; fi
    done
    if [ -d "$DATA_DIR/audio" ]; then
      M=$(mode_of "$DATA_DIR/audio")
      if [ -z "$M" ]; then res UNKNOWN "audio/ mode unreadable"
      elif [ "$M" = "700" ]; then res OK "audio/ mode $M"
      else res WARN "audio/ mode $M (want 700)"; PERM_BAD=1; fi
    fi
    if [ "$PERM_BAD" = "1" ]; then
      note "Harmless while the folder sits inside ~/Library (which is 0700 itself),"
      note "and wrong the moment APUNTA_DATA_DIR points anywhere shared."
      act 40 "Tighten permissions on the data directory" \
          "chmod 700 \"$DATA_DIR\" && chmod 600 \"$DATA_DIR\"/apunta.db* 2>/dev/null"
    fi
  else
    res UNKNOWN "could not read a file mode here (stat -f is BSD/macOS syntax)"
  fi
elif [ ! -d "$DATA_DIR" ]; then
  res SKIP "directory does not exist yet"
else
  res UNKNOWN "stat not available"
fi

check "Is the data directory inside a cloud-synced folder?"
claim "data-at-rest §2.5" "a SQLite database inside a sync-daemon-managed folder is a corruption risk, and the note text would leave the machine"
SYNC_HIT=""
for root in \
  "$HOME/Library/Mobile Documents" \
  "$HOME/Library/CloudStorage" \
  "$HOME/Dropbox" \
  "$HOME/Google Drive" \
  "$HOME/OneDrive" \
  "$HOME/Desktop" \
  "$HOME/Documents"
do
  case "$DATA_DIR/" in
    "$root"/*) SYNC_HIT="$root" ;;
  esac
done
if [ -n "$SYNC_HIT" ]; then
  res ACTION "the data directory is under '$SYNC_HIT', which a sync service manages"
  act 05 "Move the data directory out of the synced folder" \
      "unset APUNTA_DATA_DIR   (the default is ~/Library/Application Support/Apunta)"
else
  res OK "not inside iCloud Drive, Dropbox, Google Drive, OneDrive, Desktop or Documents"
fi

check "Spotlight: does it index the data directory?"
claim "data-at-rest §2.6 + §7.5 [inference]" "~/Library is indexed but filtered out of the Spotlight window; the database itself has no importer so its text should be invisible. macOS 26 reworked Spotlight and this may have changed"
if have mdutil; then
  run_t 15 mdutil -s /
  MDU=$(rt | tr -d '\r')
  if [ -n "$MDU" ] && printf '%s' "$MDU" | grep -qi 'Indexing enabled'; then
    res INFO "the boot volume is being indexed (mdutil -s /)"
  elif [ -n "$MDU" ] && printf '%s' "$MDU" | grep -qi 'Indexing disabled'; then
    res INFO "indexing is disabled on the boot volume"
  else
    res UNKNOWN "mdutil -s / could not be read (it often needs sudo or Full Disk Access)"
    verbose_err
  fi
else
  res SKIP "mdutil not found"
fi
if have mdfind && [ -d "$DATA_DIR" ]; then
  run_t 20 mdfind -onlyin "$DATA_DIR" -count "kMDItemFSName == '*'"
  MDC=$(rt | tr -d ' \n\r')
  case "${MDC:-x}" in
    ''|*[!0-9]*) res UNKNOWN "mdfind gave no usable count for the data directory" ; verbose_err ;;
    0)  res OK "Spotlight has 0 indexed items inside the data directory" ;;
    *)  res WARN "Spotlight has $MDC indexed item(s) inside the data directory"
        note "Filenames and file metadata, almost certainly not note text — but this is"
        note "exactly the claim that had never been checked. See PREFLIGHT.md for the"
        note "one manual probe that settles whether note text itself is searchable."
        warned "Spotlight has $MDC indexed item(s) under the data directory" ;;
  esac
elif [ ! -d "$DATA_DIR" ]; then
  res SKIP "nothing to index yet — the data directory does not exist"
else
  res SKIP "mdfind not found"
fi

check "Spotlight: is Markdown content-indexed on this Mac?"
claim "data-at-rest §7.6 [inference]" "'.md' historically had no Spotlight importer, but many people install one — assume loose .md exports in an indexed folder are content-searchable"
MD_IMPORTER=""
if have mdimport; then
  run_t 20 mdimport -L
  MD_IMPORTER=$(rt | grep -i -E 'markdown|marked|obsidian' | head -n 3)
fi
if [ -n "$MD_IMPORTER" ]; then
  res WARN "a Markdown-aware Spotlight importer is installed:"
  printf '%s\n' "$MD_IMPORTER" | sed 's/^/              /'
  note "Exported .md notes saved anywhere indexed will be full-text searchable."
  warned "a Markdown Spotlight importer is installed — exported .md notes would be full-text searchable"
elif have mdimport; then
  res OK "no third-party Markdown importer found in mdimport -L"
  note "Not proof: the definitive probe writes a file, so it is a manual step in PREFLIGHT.md."
else
  res SKIP "mdimport not found"
fi

check "TMPDIR — where a stray second copy of the database could land"
claim "data-at-rest §2.3 + §7.8 [inference]" "SQLite's temp files (including a bare VACUUM's full copy of the database) follow TMPDIR; if it is unset the chain falls through to /var/tmp or /tmp, which are world-traversable"
if [ -z "${TMPDIR:-}" ]; then
  res WARN "TMPDIR is not set in this shell — SQLite would fall through to /var/tmp or /tmp"
  warned "TMPDIR was unset in this shell; check it again under whatever launches Apunta"
else
  case "$TMPDIR" in
    /var/folders/*)
      res OK "TMPDIR is the per-user directory: $TMPDIR"
      note "Same volume, same FileVault boundary — the good case." ;;
    /tmp|/tmp/*|/var/tmp|/var/tmp/*)
      res WARN "TMPDIR is a shared directory: $TMPDIR"
      warned "TMPDIR points at a world-traversable directory ($TMPDIR)" ;;
    *)
      res INFO "TMPDIR = $TMPDIR" ;;
  esac
fi
note "This shell's value is not necessarily what a LaunchAgent or a packaged app sees."

check "Free space on the data volume"
DF_TARGET="$DATA_DIR"; [ -d "$DF_TARGET" ] || DF_TARGET="$HOME"
FREE_H=$(df -h "$DF_TARGET" 2>/dev/null | awk 'NR==2 {print $4}')
FREE_K=$(df -k "$DF_TARGET" 2>/dev/null | awk 'NR==2 {print $4}')
case "${FREE_K:-x}" in ''|*[!0-9]*) FREE_K=0 ;; esac
FREE_GIB=$(( FREE_K / 1048576 ))
NEED_GIB=$(( MODEL_GB_INT + 2 ))
if [ "$FREE_K" -eq 0 ]; then
  res UNKNOWN "could not read free space"
elif [ "$FREE_GIB" -ge "$NEED_GIB" ]; then
  res OK "${FREE_H:-$FREE_GIB GiB} free — enough for the $TIER_TAG weights plus the whisper model"
else
  res ACTION "${FREE_H:-$FREE_GIB GiB} free — the model tier for this machine needs about ${NEED_GIB} GiB"
  act 20 "Free up disk space before pulling the model (~${TIER_GB} GB) and the whisper model (~${WHISPER_MIB} MiB)" \
      "About This Mac → More Info → Storage"
fi

check "Desktop and Documents — the natural place to save an export"
claim "data-at-rest §7.2 + §2.5" "Desktop and Documents are the two folders iCloud syncs by default, so an export saved there uploads a zip of clinical records to Apple"
CLOUDDOCS="$HOME/Library/Mobile Documents/com~apple~CloudDocs"
ICLOUD_DD=0
if [ -d "$CLOUDDOCS" ]; then
  res INFO "iCloud Drive is on for this account"
  if [ -d "$CLOUDDOCS/Desktop" ] || [ -d "$CLOUDDOCS/Documents" ]; then
    ICLOUD_DD=1
    res ACTION "Desktop & Documents Folders sync is ON"
    note "Anything saved to ~/Desktop or ~/Documents is uploaded to iCloud."
    note "Apunta's exports and backups must not be saved there."
    act 06 "Do not save Apunta exports or backups to Desktop or Documents while iCloud syncs them" \
        "System Settings → [your name] → iCloud → Drive → Desktop & Documents Folders"
  else
    res OK "Desktop & Documents Folders sync appears to be OFF"
  fi
else
  res OK "iCloud Drive does not appear to be set up for this account"
fi
for d in "$HOME/Desktop" "$HOME/Documents"; do
  if [ -L "$d" ]; then
    res INFO "$d is a symlink → $(readlink "$d" 2>/dev/null)"
  fi
done

check "'Optimize Mac Storage' — can turn a backup into a 0-byte stub"
claim "data-at-rest §7.3 + §2.5" "with Optimize Mac Storage on, macOS evicts rarely-opened files to placeholders — and a backup you never open is exactly what it evicts first"
# UNVERIFIED SYNTAX: this defaults key is not documented by Apple. It is read
# as a hint only; the dataless-file scan below is the evidence-based check.
OPT_HINT=$(defaults read com.apple.bird optimize-storage 2>/dev/null)
if [ -n "$OPT_HINT" ]; then
  if [ "$OPT_HINT" = "1" ]; then
    res WARN "the (undocumented) com.apple.bird optimize-storage preference reads 1 — likely ON"
  else
    res INFO "the (undocumented) com.apple.bird optimize-storage preference reads $OPT_HINT"
  fi
else
  res UNKNOWN "could not read the preference — check System Settings → [your name] → iCloud → Optimize Mac Storage"
fi
# Evidence-based: an evicted iCloud file carries the BSD 'dataless' flag.
DATALESS_N=0
if [ "$ICLOUD_DD" = "1" ] && have ls; then
  for d in "$HOME/Desktop" "$HOME/Documents"; do
    [ -d "$d" ] || continue
    run_t 15 ls -lO "$d"
    N=$(rt | grep -c 'dataless' 2>/dev/null)
    case "${N:-0}" in ''|*[!0-9]*) N=0 ;; esac
    DATALESS_N=$(( DATALESS_N + N ))
  done
  if [ "$DATALESS_N" -gt 0 ]; then
    res ACTION "$DATALESS_N file(s) at the top of Desktop/Documents are already evicted (BSD 'dataless' flag)"
    note "Proof that eviction is happening on this Mac. A backup stored there could"
    note "be backed up by Time Machine as an empty placeholder."
    act 07 "Keep Apunta backups off Desktop and Documents, or turn off Optimize Mac Storage" \
        "System Settings → [your name] → iCloud → uncheck Optimize Mac Storage"
  else
    res OK "no evicted (dataless) files at the top level of Desktop or Documents"
  fi
else
  res SKIP "Desktop & Documents are not iCloud-synced, so eviction does not apply to them"
fi

# ===========================================================================
hdr "4. TIME MACHINE"
# ===========================================================================

check "Is a backup destination configured?"
TM_CONFIGURED=0
TM_MOUNT=""
if have tmutil; then
  run_t 20 tmutil destinationinfo
  TM_OUT=$(rt)
  if [ "$RT_TIMEOUT" = "1" ]; then
    res UNKNOWN "tmutil destinationinfo did not return within 20s"
  elif printf '%s' "$TM_OUT" | grep -qi 'no destinations'; then
    res ACTION "no Time Machine destination is configured — this Mac has no backup"
    note "data-at-rest §8 ranks 'the backup does not exist' as the single most likely"
    note "way this data is lost, ahead of every confidentiality risk."
    act 02 "Set up a Time Machine backup, and choose 'Encrypt Backup Disk' when you first add the disk" \
        "System Settings → General → Time Machine → Add Backup Disk"
  elif [ -n "$TM_OUT" ]; then
    TM_CONFIGURED=1
    res OK "a destination is configured:"
    printf '%s\n' "$TM_OUT" | sed 's/^[[:space:]]*/              /'
    TM_MOUNT=$(printf '%s' "$TM_OUT" | awk -F': *' '/Mount Point/ {sub(/^[[:space:]]+/,"",$2); print $2; exit}')
  else
    res UNKNOWN "tmutil destinationinfo returned nothing (rc=$RT_RC)" \
        "It may need Terminal to have Full Disk Access."
    verbose_err
  fi
else
  res SKIP "tmutil not found"
fi

check "Is the backup destination encrypted?"
claim "data-at-rest §7.4" "the encryption choice can only be made when the destination is first set up — there is no 'encrypt it later' — so this may already be settled wrongly"
note "tmutil destinationinfo does not report encryption, so this reads the volume instead."
if [ "$TM_CONFIGURED" = "0" ]; then
  res SKIP "no destination configured"
elif [ -z "$TM_MOUNT" ]; then
  res UNKNOWN "the destination is not mounted right now, so its encryption cannot be read" \
      "Plug the backup disk in and re-run, or check Disk Utility."
elif have diskutil; then
  run_t 20 diskutil info "$TM_MOUNT"
  DI=$(rt)
  # UNVERIFIED SYNTAX: line wording differs between APFS and HFS+ and between
  # macOS releases, so both spellings are matched and the raw line is printed.
  ENC_LINE=$(printf '%s' "$DI" | grep -i -E '^[[:space:]]*(FileVault|Encrypted)' | sed 's/^[[:space:]]*//' | head -n 3)
  if [ -z "$ENC_LINE" ]; then
    res UNKNOWN "diskutil printed no encryption line for $TM_MOUNT"
    verbose_err
  elif printf '%s' "$ENC_LINE" | grep -qi 'yes'; then
    res OK "$ENC_LINE"
  else
    res ACTION "the backup disk is NOT encrypted — $ENC_LINE"
    note "Anyone who picks up that disk can read every note on it."
    note "This cannot be switched on for an existing backup: the disk has to be"
    note "erased and re-added with 'Encrypt Backup Disk' ticked."
    act 04 "Erase and re-add the backup disk with encryption turned on" \
        "System Settings → General → Time Machine → remove the disk, then Add Backup Disk → Encrypt Backup Disk"
  fi
else
  res SKIP "diskutil not found"
fi

check "Is the data directory excluded from Time Machine?"
claim "data-at-rest §2.7" "~/Library/Application Support is backed up by Time Machine and is NOT in the standard exclusion list"
if have tmutil && [ -e "$DATA_DIR" ]; then
  run_t 20 tmutil isexcluded "$DATA_DIR"
  EX=$(rt)
  if printf '%s' "$EX" | grep -q '\[Excluded\]'; then
    res ACTION "the data directory is EXCLUDED from Time Machine — it would not be backed up"
    act 08 "Remove the exclusion, or accept that Apunta's own backups are the only copy" \
        "System Settings → General → Time Machine → Options → remove \"$DATA_DIR\""
  elif printf '%s' "$EX" | grep -q '\[Included\]'; then
    res OK "included in Time Machine backups"
  else
    res UNKNOWN "tmutil isexcluded gave no clear answer${EX:+: $EX}" \
        "It may need Terminal to have Full Disk Access."
    verbose_err
  fi
elif [ ! -e "$DATA_DIR" ]; then
  res SKIP "the data directory does not exist yet"
else
  res SKIP "tmutil not found"
fi

check "Local (on-disk) snapshots"
claim "data-at-rest §3.3" "hourly APFS snapshots keep deleted notes on the internal disk for up to 24 hours after the app forgets them"
if have tmutil; then
  run_t 20 tmutil listlocalsnapshots /
  SNAPS=$(rt | grep -c 'com.apple.TimeMachine' 2>/dev/null)
  case "${SNAPS:-0}" in ''|*[!0-9]*) SNAPS=0 ;; esac
  if [ "$SNAPS" -gt 0 ]; then
    res INFO "$SNAPS local snapshot(s) on the boot volume"
    note "Expected and useful. Worth knowing: a note deleted in Apunta still exists"
    note "inside these until they age out (about 24 hours)."
  else
    res INFO "no local snapshots on the boot volume"
  fi
else
  res SKIP "tmutil not found"
fi

# ===========================================================================
hdr "5. THE LOCAL AI STACK"
# ===========================================================================

OLLAMA_URL="${APUNTA_OLLAMA_URL:-$OLLAMA_DEFAULT_URL}"
OLLAMA_UP=0

# The reachability test comes first on purpose: Apunta talks to Ollama over
# HTTP and never shells out to it for inference, so a running server with no
# `ollama` command on PATH is a working setup, not a broken one.
check "Is Ollama running and reachable on loopback?"
if have curl; then
  VER_JSON=$(curl -fsS --connect-timeout 2 --max-time 6 "$OLLAMA_URL/api/version" 2>/dev/null)
  if [ -n "$VER_JSON" ]; then
    OLLAMA_UP=1
    OV2=$(printf '%s' "$VER_JSON" | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
    res OK "serving at $OLLAMA_URL (version ${OV2:-unknown})"
    case "${OV2:-}" in
      0.33.*) res WARN "0.33.x was still flagged pre-release as of the M3 research — 0.32.15 is the stable line"
              warned "Ollama ${OV2} is on the pre-release line" ;;
    esac
  else
    res ACTION "nothing is answering at $OLLAMA_URL"
    if have ollama; then
      act 12 "Start Ollama, then re-run this script" "open -a Ollama    (or: ollama serve)"
    else
      act 11 "Install Ollama — the local model runtime that drafts the notes" \
          "download the macOS app from ollama.com, or: brew install ollama"
    fi
  fi
else
  res UNKNOWN "curl not found, so the runtime could not be contacted"
fi

check "The 'ollama' command"
if have ollama; then
  OLLAMA_BIN=$(command -v ollama)
  run_t 15 ollama --version
  OV=$(rt | head -n 1)
  res OK "${OV:-installed} — $OLLAMA_BIN"
elif [ "$OLLAMA_UP" = "1" ]; then
  res WARN "not on PATH, though the runtime is answering"
  note "Apunta only ever speaks HTTP to Ollama, so this is not a problem for the app."
  note "You need the command only to pull models (ollama pull ...)."
  warned "the 'ollama' command is not on PATH; you will need it to pull models"
else
  res INFO "not installed (see the action above)"
fi

check "Is Ollama listening only on this Mac?"
claim "PLAN §2 egress guard" "no part of the runtime stack may be reachable from the network"
if have lsof; then
  run_t 15 lsof -nP -iTCP:11434 -sTCP:LISTEN
  L=$(rt | awk 'NR>1 {print $9}' | sort -u)
  if [ -z "$L" ]; then
    res SKIP "nothing listening on port 11434 right now"
  elif printf '%s' "$L" | grep -q -E '(^|[^0-9.])(\*|0\.0\.0\.0|\[::\]):11434'; then
    res ACTION "Ollama is listening on all network interfaces: $L"
    act 13 "Bind Ollama to loopback only" \
        "launchctl setenv OLLAMA_HOST 127.0.0.1   (and restart Ollama)"
  else
    res OK "loopback only — $L"
  fi
else
  res SKIP "lsof not found"
fi

check "Environment variables that could leak note text into logs"
claim "data-at-rest §2.4" "OLLAMA_DEBUG=1 writes prompts and responses to ~/.ollama/logs/server.log, and the prompts contain the patient's words"
LEAKY=""
[ -n "${OLLAMA_DEBUG:-}" ] && LEAKY="$LEAKY OLLAMA_DEBUG=${OLLAMA_DEBUG}"
GLOBAL_DEBUG=$(launchctl getenv OLLAMA_DEBUG 2>/dev/null)
[ -n "$GLOBAL_DEBUG" ] && LEAKY="$LEAKY launchctl:OLLAMA_DEBUG=$GLOBAL_DEBUG"
OH=$(launchctl getenv OLLAMA_HOST 2>/dev/null)
if [ -n "$LEAKY" ]; then
  res ACTION "debug logging of prompts is switched on:$LEAKY"
  act 14 "Turn off Ollama debug logging — it records the note text" \
      "launchctl unsetenv OLLAMA_DEBUG   (and remove it from your shell profile)"
else
  res OK "OLLAMA_DEBUG is not set"
fi
[ -n "$OH" ] && res INFO "OLLAMA_HOST is set globally to '$OH'"

check "Which models are pulled, and do they enforce a schema?"
claim "m3-preflight §1.3 [inference]" "only details.format == \"gguf\" routes to llama.cpp, where the JSON schema is actually enforced; MLX/safetensors weights silently ignore it (ollama#16563, still open)"
TIER_PRESENT=0
if [ "$OLLAMA_UP" = "1" ] && have curl; then
  TAGS="$TMPD/tags.json"
  curl -fsS --max-time 15 "$OLLAMA_URL/api/tags" -o "$TAGS" 2>/dev/null
  if [ ! -s "$TAGS" ]; then
    res UNKNOWN "GET /api/tags returned nothing"
  else
    # Parse without assuming jq exists (macOS does not ship it). node is used
    # if present; otherwise a line-per-record fallback for Ollama's compact JSON.
    PARSED="$TMPD/models.tsv"
    : >"$PARSED"
    if have jq; then
      jq -r '.models[] | [.name, (.size|tostring), (.details.format // "?"), (.details.parameter_size // "?"), (.details.quantization_level // "?")] | @tsv' \
        <"$TAGS" >"$PARSED" 2>/dev/null
    fi
    if [ ! -s "$PARSED" ] && have node; then
      node -e '
        const fs=require("fs");
        try{
          const d=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
          for(const m of (d.models||[])){
            const x=m.details||{};
            process.stdout.write([m.name,String(m.size||0),x.format||"?",x.parameter_size||"?",x.quantization_level||"?"].join("\t")+"\n");
          }
        }catch(e){process.exit(1);}
      ' "$TAGS" >"$PARSED" 2>/dev/null
    fi
    if [ ! -s "$PARSED" ]; then
      tr -d '\n' <"$TAGS" | sed 's/{"name"/\
{"name"/g' | grep '"name"' | while IFS= read -r line; do
        n=$(printf '%s' "$line" | sed -n 's/.*"name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
        s=$(printf '%s' "$line" | sed -n 's/.*"size"[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/p')
        f=$(printf '%s' "$line" | sed -n 's/.*"format"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
        p=$(printf '%s' "$line" | sed -n 's/.*"parameter_size"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
        q=$(printf '%s' "$line" | sed -n 's/.*"quantization_level"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
        [ -n "$n" ] && printf '%s\t%s\t%s\t%s\t%s\n' "$n" "${s:-0}" "${f:-?}" "${p:-?}" "${q:-?}"
      done >"$PARSED"
    fi

    if [ ! -s "$PARSED" ]; then
      res UNKNOWN "could not parse /api/tags (no jq and no node)" \
          "Run this by hand: curl -s $OLLAMA_URL/api/tags"
    else
      NMODELS=$(wc -l <"$PARSED" | tr -d ' ')
      res INFO "$NMODELS model(s) pulled:"
      while IFS="$(printf '\t')" read -r name size fmt psize quant; do
        [ -n "$name" ] || continue
        gb=$(( ${size:-0} / 1000000000 ))
        flag=""
        case "$fmt" in
          gguf) ;;
          *) flag=" <-- NOT gguf: the JSON schema would NOT be enforced" ;;
        esac
        printf '              %-30s %5s GB  format=%-12s %s %s%s\n' "$name" "$gb" "$fmt" "${psize}" "${quant}" "$flag"
        case "$name" in
          "$TIER_TAG"|"$TIER_TAG":*) TIER_PRESENT=1 ;;
        esac
        if [ "$fmt" != "gguf" ]; then
          act 15 "Model '$name' does not report format=gguf — Apunta will refuse it, and it would silently ignore the schema" \
              "ollama rm $name   (and pull a GGUF-tagged model instead)"
        fi
        case "$name" in
          *-mlx|*-mlx:*|*-nvfp4*|*-mxfp8*|*-bf16*)
            res WARN "'$name' has a non-GGUF weight flavour in its tag name"
            warned "model tag '$name' names a non-GGUF weight format" ;;
        esac
      done <"$PARSED"
      # Grouped verdict on the tier model
      if [ "$TIER_PRESENT" = "1" ]; then
        res OK "the tier model for this Mac ($TIER_TAG) is pulled"
      else
        res ACTION "the tier model for this Mac ($TIER_TAG) is not pulled"
        act 16 "Pull the model PLAN §2 assigns to this machine (~${TIER_GB} GB download)" \
            "ollama pull $TIER_TAG"
      fi
    fi
  fi
else
  res SKIP "Ollama is not reachable"
fi

check "Context length and capabilities of the tier model"
claim "m3-preflight §1.1 [search-snippet only]" "the tag, its size and its 256K context could never be confirmed — ollama.com and registry.ollama.ai were unreachable from the build container"
if [ "$OLLAMA_UP" = "1" ] && [ "$TIER_PRESENT" = "1" ] && have curl; then
  SHOW="$TMPD/show.json"
  curl -fsS --max-time 20 "$OLLAMA_URL/api/show" -d "{\"model\":\"$TIER_TAG\"}" -o "$SHOW" 2>/dev/null
  if [ -s "$SHOW" ]; then
    CTX=""
    if have jq; then
      CTX=$(jq -r '.model_info | to_entries[] | select(.key|endswith(".context_length")) | .value' <"$SHOW" 2>/dev/null | head -n 1)
      CAPS=$(jq -r '(.capabilities // []) | join(", ")' <"$SHOW" 2>/dev/null)
      SFMT=$(jq -r '.details.format // "?"' <"$SHOW" 2>/dev/null)
    fi
    if [ -z "$CTX" ]; then
      CTX=$(tr -d '\n' <"$SHOW" | sed -n 's/.*"[a-z0-9_.]*\.context_length"[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/p' | head -n 1)
    fi
    [ -n "${CAPS:-}" ] || CAPS=$(tr -d '\n' <"$SHOW" | sed -n 's/.*"capabilities"[[:space:]]*:[[:space:]]*\[\([^]]*\)\].*/\1/p' | tr -d '"')
    [ -n "${SFMT:-}" ] || SFMT=$(tr -d '\n' <"$SHOW" | sed -n 's/.*"format"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)
    if [ -n "$CTX" ]; then
      res OK "$TIER_TAG reports a context length of $CTX tokens (Apunta asks for 16384)"
      if [ "$CTX" -lt 16384 ] 2>/dev/null; then
        res ACTION "that is smaller than the 16K context Apunta requires"
        act 17 "This model cannot hold Apunta's prompt; pick another tag" \
            "ollama pull $DEFAULT_TAG"
      fi
    else
      res UNKNOWN "could not read a context_length from /api/show"
    fi
    [ -n "$CAPS" ] && res INFO "capabilities: $CAPS"
    if [ -n "$SFMT" ] && [ "$SFMT" != "gguf" ]; then
      res ACTION "details.format = '$SFMT' — the JSON schema would not be enforced"
    elif [ -n "$SFMT" ]; then
      res OK "details.format = gguf — schema-constrained sampling is available"
    fi
  else
    res UNKNOWN "POST /api/show returned nothing"
  fi
else
  res SKIP "needs a running Ollama with $TIER_TAG pulled"
fi

check "Ollama model storage"
OLL_MODELS="${OLLAMA_MODELS:-$HOME/.ollama/models}"
if [ -d "$OLL_MODELS" ]; then
  run_t 30 du -sh "$OLL_MODELS"
  SZ=$(rt | awk '{print $1}')
  res INFO "$OLL_MODELS (${SZ:-size unknown})"
  note "No patient data here — model weights only."
else
  res INFO "no model store at $OLL_MODELS yet"
fi

check "whisper.cpp (speech to text)"
claim "m8-bundling §5" "whisper.cpp publishes no prebuilt macOS binary at all — the only macOS release asset is an xcframework, so whisper-cli has to come from Homebrew or a source build"
if have whisper-cli; then
  res OK "whisper-cli found at $(command -v whisper-cli)"
elif have whisper-cpp; then
  res WARN "found 'whisper-cpp' but not 'whisper-cli' — Apunta calls whisper-cli"
  warned "whisper-cli not on PATH (whisper-cpp is)"
else
  res ACTION "whisper-cli is not installed — recording and transcription will not work"
  note "M5 (audio) is the packet that needs it; typed notes work without it."
  act 30 "Install whisper.cpp" "brew install whisper-cpp"
fi

check "The whisper model file"
WH_FOUND=""
for c in "$DATA_DIR/models/$WHISPER_MODEL" "$HOME/Library/Application Support/Apunta/models/$WHISPER_MODEL" "$HOME/.cache/whisper/$WHISPER_MODEL"; do
  [ -f "$c" ] && { WH_FOUND="$c"; break; }
done
if [ -n "$WH_FOUND" ]; then
  # wc -c is portable; stat's byte-size flag is not.
  WH_BYTES=$(wc -c <"$WH_FOUND" 2>/dev/null | tr -d ' ')
  case "${WH_BYTES:-x}" in ''|*[!0-9]*) WH_BYTES=0 ;; esac
  WH_MIB=$(( WH_BYTES / 1048576 ))
  if [ "$WH_MIB" -ge $(( WHISPER_MIB - 5 )) ] && [ "$WH_MIB" -le $(( WHISPER_MIB + 5 )) ]; then
    res OK "$WH_FOUND (${WH_MIB} MiB — expected ~${WHISPER_MIB} MiB)"
  else
    res WARN "$WH_FOUND is ${WH_MIB} MiB; expected about ${WHISPER_MIB} MiB — possibly a partial download"
    warned "the whisper model file is ${WH_MIB} MiB, not the expected ~${WHISPER_MIB} MiB"
  fi
  if [ "$DO_CHECKSUM" = "1" ]; then
    SUM=""
    if have shasum; then SUM=$(shasum -a 1 "$WH_FOUND" 2>/dev/null | awk '{print $1}')
    elif have openssl; then SUM=$(openssl dgst -sha1 "$WH_FOUND" 2>/dev/null | awk '{print $NF}'); fi
    if [ -z "$SUM" ]; then res UNKNOWN "no shasum or openssl available to check the SHA-1"
    elif [ "$SUM" = "$WHISPER_SHA1" ]; then res OK "SHA-1 matches upstream ($WHISPER_SHA1)"
    else res ACTION "SHA-1 mismatch — got $SUM, expected $WHISPER_SHA1"
         act 31 "The whisper model file does not match upstream; delete and re-download it" \
             "rm \"$WH_FOUND\"" ; fi
  else
    note "Re-run with --checksum to verify the SHA-1 (upstream publishes SHA-1 only)."
  fi
else
  res INFO "not downloaded yet — expected at $DATA_DIR/models/$WHISPER_MODEL"
  note "Only needed once audio recording (M5) is in use."
fi

check "ffmpeg (not required — reported for information only)"
if have ffmpeg; then
  run_t 15 ffmpeg -version
  res INFO "$(rt | head -n 1)"
else
  res INFO "not installed — and not needed: Apunta records 16 kHz WAV in the browser and never transcodes"
fi

# ===========================================================================
hdr "6. NODE AND THE TOOLCHAIN"
# ===========================================================================

check "Node.js"
if have node; then
  NODE_V=$(node --version 2>/dev/null)
  NODE_MAJ=$(printf '%s' "$NODE_V" | sed 's/^v//' | cut -d. -f1)
  case "${NODE_MAJ:-x}" in ''|*[!0-9]*) NODE_MAJ=0 ;; esac
  if [ "$NODE_MAJ" -ge "$NODE_MIN_MAJOR" ]; then
    res OK "$NODE_V (repo requires >= $NODE_MIN_MAJOR)"
  else
    res ACTION "$NODE_V — the repo requires Node $NODE_MIN_MAJOR or newer"
    act 21 "Install Node $NODE_MIN_MAJOR+" "download from nodejs.org, or: brew install node@$NODE_MIN_MAJOR"
  fi
else
  res ACTION "node is not installed — Apunta cannot run"
  act 20 "Install Node $NODE_MIN_MAJOR or newer" "download from nodejs.org, or: brew install node"
fi

check "npm"
if have npm; then res OK "npm $(npm --version 2>/dev/null)"
else res WARN "npm not found (it normally ships with Node)"; warned "npm not found"; fi

check "Xcode Command Line Tools"
CLT=0
if have xcode-select; then
  CLT_PATH=$(xcode-select -p 2>/dev/null)
  if [ -n "$CLT_PATH" ]; then
    CLT=1
    res OK "installed at $CLT_PATH"
  else
    res WARN "not installed"
    note "Needed for: git, and for building whisper-cli from source (M8 option A)."
    note "Nothing else in this script touches git or a compiler while they are missing,"
    note "because doing so pops a GUI installer."
    warned "Xcode Command Line Tools are not installed"
  fi
else
  res UNKNOWN "xcode-select not found"
fi

check "git and cmake"
if [ "$CLT" = "1" ] && have git; then
  res OK "git $(git --version 2>/dev/null | awk '{print $3}')"
elif [ "$CLT" = "1" ]; then
  res WARN "git not on PATH"
else
  res SKIP "not checked — the Command Line Tools are missing and running git would trigger their installer"
fi
if have cmake; then
  res OK "cmake $(cmake --version 2>/dev/null | head -n 1 | awk '{print $3}')"
else
  res INFO "cmake not installed — only needed to build whisper-cli from source for packaging (M8)"
fi

check "Homebrew (not required)"
if have brew; then res INFO "brew at $(command -v brew)"
else res INFO "not installed — Apunta does not require it"; fi

check "Apunta checkout"
REPO=""
case "$0" in */*) SELF_DIR="${0%/*}" ;; *) SELF_DIR="." ;; esac   # dirname-free
SELF_DIR=$(cd "$SELF_DIR" 2>/dev/null && pwd); [ -n "$SELF_DIR" ] || SELF_DIR="."
for c in "$SELF_DIR" "$SELF_DIR/.." "$PWD" "$PWD/.." "$HOME/Apunta" "$HOME/Patience"; do
  [ -f "$c/package.json" ] && grep -q '"name": "apunta"' "$c/package.json" 2>/dev/null && { REPO="$c"; break; }
done
if [ -n "$REPO" ]; then
  res OK "found at $REPO"
  [ -d "$REPO/node_modules" ] && res OK "dependencies installed (node_modules present)" \
    || { res ACTION "dependencies not installed"; act 22 "Install the project's dependencies" "cd \"$REPO\" && npm install"; }
  if [ -d "$REPO/server/dist/ai" ]; then
    res OK "the server is built — npm run smoke:live can run"
  else
    res ACTION "the server is not built; smoke:live drives the built server"
    act 23 "Build the project" "cd \"$REPO\" && npm run build"
  fi
else
  res INFO "no Apunta checkout found near this script — that is fine if you only wanted the machine report"
fi

check "Code-signing identities (only relevant to packaging, M8)"
claim "m8-bundling §7" "notarization needs a Developer ID Application certificate; a free Apple account cannot get one"
if have security; then
  run_t 20 security find-identity -v -p codesigning
  IDS=$(rt)
  DEVID=$(printf '%s' "$IDS" | grep -c 'Developer ID Application' 2>/dev/null)
  case "${DEVID:-0}" in ''|*[!0-9]*) DEVID=0 ;; esac
  TOTAL=$(printf '%s' "$IDS" | grep -c '^ *[0-9]*)' 2>/dev/null)
  case "${TOTAL:-0}" in ''|*[!0-9]*) TOTAL=0 ;; esac
  if [ "$DEVID" -gt 0 ]; then
    res OK "$DEVID 'Developer ID Application' identity/identities available"
  else
    res INFO "no Developer ID Application certificate (${TOTAL} code-signing identity/identities total)"
    note "Only needed when Apunta is packaged as a double-clickable app. Names withheld."
  fi
else
  res SKIP "security command not found"
fi

check "Gatekeeper"
if have spctl; then
  run_t 15 spctl --status
  res INFO "$(rt | head -n 1)"
else
  res SKIP "spctl not found"
fi

# ===========================================================================
hdr "VERDICT"
# ===========================================================================

printf '%s%d checks run%s — findings: %s%d ok%s, %s%d to look at%s, %s%d needing action%s, %d could not be determined.\n\n' \
  "$C_BOLD" "$CHECK_N" "$C_RESET" \
  "$C_GREEN" "$N_OK" "$C_RESET" \
  "$C_YELLOW" "$N_WARN" "$C_RESET" \
  "$C_RED" "$N_ACT" "$C_RESET" \
  "$N_UNK"

if [ ! -s "$ACT_FILE" ]; then
  printf '%sNothing is blocking.%s\n\n' "$C_GREEN" "$C_RESET"
else
  printf '%sDo these in order — each one is listed before anything that depends on it.%s\n\n' "$C_BOLD" "$C_RESET"
  sort -t'|' -k1,1n "$ACT_FILE" | { i=1; while IFS='|' read -r prio head cmd; do
    [ -n "${head:-}" ] || continue
    printf '  %s%d.%s %s\n' "$C_BOLD" "$i" "$C_RESET" "$head"
    printf '     %s%s%s\n\n' "$C_DIM" "$cmd" "$C_RESET"
    i=$(( i + 1 ))
  done; }
fi

if [ -s "$WARN_FILE" ]; then
  printf '%sWorth knowing, not blocking:%s\n' "$C_BOLD" "$C_RESET"
  sed 's/^/  - /' "$WARN_FILE"
  printf '\n'
fi

cat <<'TAIL'
Two things this script deliberately cannot do for you, both in PREFLIGHT.md:

  1. Put a real dictation through the real model:
       npm run build && npm run smoke:live -- --runs 5
     The "--" is not optional: without it npm swallows the flag and you get a
     single run while believing you asked for five. One clean run proves very
     little — the repetition-loop failure this is looking for is intermittent.

  2. Settle whether Spotlight indexes the *text inside* an exported note.
     That probe has to write a file, and this script writes nothing.

TAIL

printf '%sThis report contains no patient data, no serial number and no certificate names.%s\n' "$C_DIM" "$C_RESET"

[ "$N_ACT" -gt 0 ] && exit 1
exit 0

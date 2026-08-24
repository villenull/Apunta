#!/bin/bash
#
# Apunta — complete removal. macOS only.
#
#   bash scripts/uninstall-macos.sh              # remove the app, keep the notes
#   bash scripts/uninstall-macos.sh --everything # remove the notes as well
#   bash scripts/uninstall-macos.sh --dry-run    # print what it would do
#
# WHY THIS IS A SCRIPT AND NOT JUST INSTRUCTIONS
# ----------------------------------------------
# Dragging Apunta.app to the Trash removes the app and leaves behind several
# gigabytes of AI models, a database of clinical notes, and — if it was ever
# installed — a LaunchAgent that keeps trying to start a program that is no
# longer there. `docs/INSTALL.md` describes the manual path for anyone who
# would rather do it by hand; this does the same thing without mistakes.
#
# WHAT IT WILL NOT DO
# -------------------
# It will not delete your notes unless you ask twice. The default removes the
# app and the models and leaves the data folder exactly where it is, because
# "uninstall" and "destroy five years of clinical records" are different
# intentions and only one of them is reversible.
#
# Written on Linux and never run on macOS. Clean under `bash -n` and
# `shellcheck`. `--dry-run` prints every command and runs none.

set -u

APP="/Applications/Apunta.app"
LAUNCH_AGENT="$HOME/Library/LaunchAgents/com.apunta.server.plist"
LAUNCH_LABEL="com.apunta.server"
DATA_DIR="${APUNTA_DATA_DIR:-$HOME/Library/Application Support/Apunta}"

DRY_RUN=0
EVERYTHING=0
ASSUME_YES=0

usage() {
  cat <<'USAGE'
Apunta uninstall — removes the app, the AI models and the background helper.

  bash scripts/uninstall-macos.sh [options]

  --everything   also delete the notes folder. This destroys every patient,
                 note, transcript and treatment plan Apunta holds, and it
                 cannot be undone. Back up first: open Apunta, go to
                 Settings, and choose "Back up now".
  --dry-run      print every command it would run, and run none of them
  --yes          do not ask (for scripts; --everything still asks twice)
  --help         this message
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --everything) EVERYTHING=1 ;;
    --dry-run)    DRY_RUN=1 ;;
    --yes|-y)     ASSUME_YES=1 ;;
    -h|--help)    usage; exit 0 ;;
    *) printf 'unknown option: %s\n\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

if [ "$(uname -s 2>/dev/null || echo unknown)" != "Darwin" ] && [ "$DRY_RUN" != 1 ]; then
  printf 'This removes a macOS installation and this machine is not a Mac.\n' >&2
  exit 2
fi

run() {
  printf '  $ %s\n' "$*"
  [ "$DRY_RUN" = 1 ] && return 0
  "$@" || printf '    (that one did not work; carrying on)\n'
}

confirm() {
  [ "$ASSUME_YES" = 1 ] && return 0
  [ "$DRY_RUN" = 1 ] && return 0
  printf '%s [y/N] ' "$1"
  read -r reply
  case "$reply" in y|Y|yes|YES) return 0 ;; *) return 1 ;; esac
}

printf 'Apunta uninstall\n\n'
[ "$DRY_RUN" = 1 ] && printf 'Dry run: nothing will actually be removed.\n\n'

# ---------------------------------------------------------------------------
printf '1. The background helper\n'
# ---------------------------------------------------------------------------
# M7's LaunchAgent starts Apunta at login. Left behind, it retries a program
# that is not there any more, for ever, silently.
if [ -f "$LAUNCH_AGENT" ] || [ "$DRY_RUN" = 1 ]; then
  run launchctl bootout "gui/$(id -u)/$LAUNCH_LABEL"
  run rm -f "$LAUNCH_AGENT"
else
  printf '  not installed\n'
fi

# ---------------------------------------------------------------------------
printf '\n2. Anything still running\n'
# ---------------------------------------------------------------------------
# The app owns `node`, and `node` owns the AI runtime. Quitting Apunta from its
# menu-bar icon is the clean way; this is the belt.
run pkill -f "Apunta.app/Contents/MacOS/Apunta"
run pkill -f "Apunta.app/Contents/Helpers/ollama/ollama"

# ---------------------------------------------------------------------------
printf '\n3. The app\n'
# ---------------------------------------------------------------------------
if [ -d "$APP" ] || [ "$DRY_RUN" = 1 ]; then
  run rm -rf "$APP"
else
  printf '  not in /Applications — if you keep it somewhere else, drag it to the Trash\n'
fi

# ---------------------------------------------------------------------------
printf '\n4. The AI models\n'
# ---------------------------------------------------------------------------
# Several gigabytes, inside the data folder. They are downloadable again at
# any time, so they go even when the notes stay.
printf '  %s\n' "$DATA_DIR/models"
printf '  %s\n' "$DATA_DIR/ollama"
if confirm "  Delete the downloaded AI models?"; then
  run rm -rf "$DATA_DIR/models" "$DATA_DIR/ollama"
else
  printf '  kept\n'
fi

# ---------------------------------------------------------------------------
printf '\n5. Your notes\n'
# ---------------------------------------------------------------------------
printf '  %s\n' "$DATA_DIR"
if [ "$EVERYTHING" = 0 ]; then
  printf '\n  KEPT. This folder holds every patient, note, transcript and\n'
  printf '  treatment plan Apunta has. Re-installing Apunta picks it up again\n'
  printf '  exactly as it was.\n\n'
  printf '  To delete it too, run this again with --everything.\n'
else
  printf '\n  This folder holds every patient, note, transcript and treatment plan\n'
  printf '  Apunta has. Deleting it cannot be undone, and Time Machine will only\n'
  printf '  help if it happened to run since your last session.\n\n'
  printf '  If you have not made a backup, stop now: open Apunta, go to Settings,\n'
  printf '  and choose "Back up now". The backup is readable without Apunta.\n\n'
  if confirm "  Delete every note Apunta holds?"; then
    if confirm "  Really? This cannot be undone."; then
      run rm -rf "$DATA_DIR"
    else
      printf '  kept\n'
    fi
  else
    printf '  kept\n'
  fi
fi

printf '\nDone.\n'
printf '\nOne thing this cannot reach: anything you pasted into your records\n'
printf 'system, or exported and saved elsewhere. Those are yours to find.\n'
exit 0

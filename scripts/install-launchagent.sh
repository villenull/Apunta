#!/bin/bash
#
# Apunta — start the server at login (optional).
#
#   bash scripts/install-launchagent.sh            # install and start
#   bash scripts/install-launchagent.sh --uninstall
#   bash scripts/install-launchagent.sh --dry-run
#
# WHAT THIS IS FOR
# ----------------
# Without it, Apunta runs while a Terminal window is open and stops when that
# window closes. This installs a LaunchAgent so the server starts when you log
# in and stays running, and the app is simply there at
# http://127.0.0.1:7717 whenever you want it.
#
# It is optional and reversible. `--uninstall` removes it completely and the
# uninstall is printed at the end of the install, so it is never a thing you
# have to come back and look up.
#
# THREE THINGS IN HERE ARE DELIBERATE
# -----------------------------------
#   1. **No permanent log file.** StandardOutPath and StandardErrorPath go to
#      /dev/null. Fastify's logger is careful not to receive note text, but a
#      permanent log file next to a clinical database is a category of accident
#      worth removing rather than auditing — and the research ranks note text
#      escaping into logs as a real, cumulative risk
#      (docs/research/data-at-rest-2026-08.md §2.4, ranked risk 8). Run the
#      server in a Terminal when you need to see what it says.
#   2. **APUNTA_NO_OPEN=1.** `npm start` opens a browser tab; a LaunchAgent
#      doing that at every login would be a browser tab you did not ask for.
#   3. **TMPDIR is passed through explicitly.** Under launchd it is not the
#      same as in a Terminal, and SQLite's temp-file resolution falls through
#      to /var/tmp when it is unset — which is world-traversable (§2.3). The
#      database also sets `temp_store = MEMORY`, so this is the second of two
#      guards rather than the only one. **UNVERIFIED:** what TMPDIR actually
#      is under launchd on her Mac is open item 8 in that document; the
#      manual pass settles it.
#
# WHAT WE COULD AND COULD NOT VERIFY
# ----------------------------------
# Written on Linux. No line of this has run on macOS, and `launchctl` does not
# exist here. The plist keys are the documented ones, `bootstrap`/`bootout`
# are the modern subcommands (`load`/`unload` are deprecated), and the file
# location `~/Library/LaunchAgents/<label>.plist` is standard — but the whole
# thing is unverified in practice. `--dry-run` prints the plist and every
# command without running any of them.

set -u

LABEL="com.apunta.server"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

DRY_RUN=0
UNINSTALL=0

usage() {
  cat <<'USAGE'
Apunta — start the server at login.

  bash scripts/install-launchagent.sh [options]

  --uninstall   remove the LaunchAgent and stop the server
  --dry-run     print the plist and every command, run none of them
  --help        this message

The server it starts serves only 127.0.0.1 and writes no log file.
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --uninstall) UNINSTALL=1 ;;
    --dry-run)   DRY_RUN=1 ;;
    -h|--help)   usage; exit 0 ;;
    *) printf 'unknown option: %s\n\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

run() {
  printf '$ %s\n' "$*"
  [ "$DRY_RUN" = 1 ] && return 0
  "$@"
}

if [ "$(uname -s 2>/dev/null || echo unknown)" != "Darwin" ] && [ "$DRY_RUN" != 1 ]; then
  printf 'LaunchAgents are a macOS thing and this machine is not a Mac.\n' >&2
  exit 2
fi

UID_NUM="$(id -u)"

# ---------------------------------------------------------------------------
if [ "$UNINSTALL" = 1 ]; then
  printf 'Removing the Apunta LaunchAgent.\n\n'
  # `bootout` on something not loaded returns non-zero; that is not a failure
  # here, it is the state we are trying to reach.
  run launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null || true
  run rm -f "$PLIST"
  printf '\nDone. Apunta will not start at login any more.\n'
  printf 'Your notes are untouched — this only removed the thing that started the server.\n'
  exit 0
fi

# ---------------------------------------------------------------------------
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ ! -f "$REPO_ROOT/server/dist/index.js" ] && [ "$DRY_RUN" != 1 ]; then
  printf 'Build Apunta first:\n\n    npm run build\n\n'
  printf 'The LaunchAgent runs the built server directly, not through npm.\n' >&2
  exit 1
fi

NODE_BIN="$(command -v node || echo /opt/homebrew/bin/node)"

printf 'Installing the Apunta LaunchAgent.\n\n'
printf '  label      %s\n' "$LABEL"
printf '  plist      %s\n' "$PLIST"
printf '  node       %s\n' "$NODE_BIN"
printf '  server     %s/server/dist/index.js\n\n' "$REPO_ROOT"

PLIST_BODY=$(cat <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>

  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$REPO_ROOT/server/dist/index.js</string>
  </array>

  <key>WorkingDirectory</key>
  <string>$REPO_ROOT</string>

  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>

  <key>EnvironmentVariables</key>
  <dict>
    <!-- A LaunchAgent opening a browser tab at every login is not a feature. -->
    <key>APUNTA_NO_OPEN</key>
    <string>1</string>
    <!-- SQLite falls through to /var/tmp when TMPDIR is unset, and /var/tmp is
         world-traversable. See the header of this script. -->
    <key>TMPDIR</key>
    <string>${TMPDIR:-/private/tmp}</string>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>

  <!-- No log file. Note text must never accumulate somewhere nobody reads. -->
  <key>StandardOutPath</key>
  <string>/dev/null</string>
  <key>StandardErrorPath</key>
  <string>/dev/null</string>
</dict>
</plist>
PLIST_EOF
)

if [ "$DRY_RUN" = 1 ]; then
  printf -- '--- %s ---\n%s\n--- end ---\n\n' "$PLIST" "$PLIST_BODY"
else
  mkdir -p "$(dirname "$PLIST")"
  printf '%s\n' "$PLIST_BODY" > "$PLIST"
  printf 'wrote %s\n' "$PLIST"
fi

# Replacing an existing agent: bootout first, then bootstrap. `load`/`unload`
# are the deprecated spellings.
run launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null || true
run launchctl bootstrap "gui/$UID_NUM" "$PLIST" || {
  printf '\nlaunchctl bootstrap failed. The plist is written; nothing is running.\n' >&2
  exit 1
}

if [ "$DRY_RUN" = 1 ]; then
  printf '\nDry run: nothing was written and nothing was started.\n'
else
  printf '\nDone. Apunta starts at login and is running now:\n\n'
  printf '    http://127.0.0.1:7717\n\n'
fi

printf 'To check on it:      launchctl print gui/%s/%s\n' "$UID_NUM" "$LABEL"
printf 'To stop it for now:  launchctl bootout gui/%s/%s\n' "$UID_NUM" "$LABEL"
printf 'To remove it:        bash scripts/install-launchagent.sh --uninstall\n\n'
printf 'It writes no log file. If something is wrong, stop it and run the server in a\n'
printf 'Terminal with "npm start", where you can see what it says.\n'

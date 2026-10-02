#!/usr/bin/env bash
# Verification-only runner for the P3.3 final native-close evidence.
#
# Launches the already-rebuilt test AppImage once on a private Xvfb display of
# this reviewer's choosing and closes it with a direct ICCCM
# WM_DELETE_WINDOW. No application code, harness, card, contract or threshold is
# touched; nothing is installed or downloaded; no window manager is used.
#
# Every launch is preceded by the isolation preflight below, and the launched
# process's own /proc/<pid>/environ is read back afterwards as proof rather than
# as intention. There is no fallback to the owner's display: if the preflight
# fails the script exits before starting anything.
#
# Usage:
#   eval "$(node scripts/v2/sandbox.mjs env --port 7831)"
#   final-native-close-run.sh <appimage> <tag> <display-number> <scratch-dir>
# Writes <tag>.log, <tag>.app.log, <tag>.send.log and <tag>.home.png into the
# scratch directory (git-ignored). Exits 0 only when every assertion held.
set -u

APP="$1"
TAG="$2"
D="$3"
SCRATCH="$4"
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$SCRATCH"
OUT="$SCRATCH/$TAG.log"
HELPER="$HERE/final-native-close-send-delete.py"
: > "$OUT"

say() { echo "$*" | tee -a "$OUT"; }
fail() { echo "ASSERTION FAILED: $*" | tee -a "$OUT"; exit 1; }

# ---------------------------------------------------------------- preflight --
# Isolation: no Wayland inheritance, X11 only, on a display this review owns.
assert_isolation_preflight() {
  local ok=yes
  if [ -n "${WAYLAND_DISPLAY:-}" ]; then ok=no; say "preflight: WAYLAND_DISPLAY is set (${WAYLAND_DISPLAY})"; fi
  if [ "${XDG_BACKEND:-}" != "x11" ]; then ok=no; say "preflight: XDG_BACKEND=${XDG_BACKEND:-unset}"; fi
  if [ "${GDK_BACKEND:-}" != "x11" ]; then ok=no; say "preflight: GDK_BACKEND=${GDK_BACKEND:-unset}"; fi
  if [ "${DISPLAY:-}" != ":$D" ]; then ok=no; say "preflight: DISPLAY=${DISPLAY:-unset}, expected :$D"; fi
  if [ "$D" = "0" ] || [ -z "$D" ]; then ok=no; say "preflight: refusing to use the owner's display :$D"; fi
  # the display must be this reviewer's own Xvfb, started by this session
  if ! ls "/tmp/.X11-unix/X$D" >/dev/null 2>&1; then ok=no; say "preflight: no socket /tmp/.X11-unix/X$D"; fi
  local xvfb_owns=no p
  for p in $(ls /proc | grep -E '^[0-9]+$'); do
    if tr '\0' ' ' 2>/dev/null < "/proc/$p/cmdline" | grep -q "Xvfb :$D "; then xvfb_owns=yes; fi
  done
  if [ "$xvfb_owns" != yes ]; then ok=no; say "preflight: no Xvfb process serving :$D"; fi
  if [ -z "${APUNTA_DATA_DIR:-}" ] || [ "${APUNTA_PORT:-}" != "7831" ] || [ -z "${APUNTA_TEST_RUN_ID:-}" ]; then
    ok=no; say "preflight: not under the test sandbox (port ${APUNTA_PORT:-unset}, data ${APUNTA_DATA_DIR:-unset})"
  fi
  if [ "$APUNTA_PORT" = 7717 ]; then ok=no; say "preflight: refusing to run against the live port"; fi
  if [ "$ok" = yes ]; then say "preflight: OK — WAYLAND_DISPLAY absent, XDG_BACKEND=x11, GDK_BACKEND=x11, DISPLAY=:$D is this review's own Xvfb, sandbox port 7831, test identity"; else fail "isolation preflight"; fi
}

count_servers() {
  local n=0 p
  for p in $(ls /proc | grep -E '^[0-9]+$'); do
    if tr '\0' '\n' 2>/dev/null < "/proc/$p/cmdline" | grep -q 'server/server.mjs' \
       && tr '\0' '\n' 2>/dev/null < "/proc/$p/environ" | grep -qxF "APUNTA_DATA_DIR=$APUNTA_DATA_DIR"; then
      n=$((n + 1))
    fi
  done
  echo "$n"
}
port_free() { ! (exec 3<>"/dev/tcp/127.0.0.1/$APUNTA_PORT") 2>/dev/null; }
alive() { kill -0 "$1" 2>/dev/null; }

# ------------------------------------------------------------------ launch ---
# Unset for the child exactly as the harness does, then assert again.
unset WAYLAND_DISPLAY
export XDG_BACKEND=x11 GDK_BACKEND=x11 DISPLAY=":$D"
assert_isolation_preflight

# An unrelated process of my own, so containment is measured the way the card's
# row measures it. Started by this run and stopped by this run.
setsid sleep 900 >/dev/null 2>&1 &
DUMMY=$!
say "run tag $TAG; DISPLAY=:$D; APUNTA_PORT=$APUNTA_PORT; sandbox data dir <sandbox>/data; dummy pid <pid ${DUMMY}>"
say "ollama before: $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:11434/api/version)"

export XDG_CACHE_HOME="$APUNTA_DATA_DIR/../cache" XDG_CONFIG_HOME="$APUNTA_DATA_DIR/../config"
export XDG_DATA_HOME="$APUNTA_DATA_DIR/../xdg" HOME="$APUNTA_DATA_DIR/../home"
( cd / && exec setsid "$APP" ) > "$SCRATCH/$TAG.app.log" 2>&1 &
SHELL_PID=$!
# On any failure, stop only what this run started: the app's own process group
# (setsid makes the shell its leader, so the real binary inside the AppImage is
# in the same group) and the dummy. Nothing else is ever signalled.
cleanup_on_failure() {
  local rc=$?
  if [ "$rc" != 0 ] && [ -n "${SHELL_PID:-}" ]; then
    kill -TERM -- "-$SHELL_PID" 2>/dev/null
    sleep 2
    kill -KILL -- "-$SHELL_PID" 2>/dev/null
  fi
  if [ -n "${DUMMY:-}" ]; then kill "$DUMMY" 2>/dev/null; fi
}
trap cleanup_on_failure EXIT
say "shell pid <pid ${SHELL_PID}> (own process group; cwd /)"

# The launched process's own environment, read back from /proc — proof, not intent.
CHILD_ENV=$(tr '\0' '\n' 2>/dev/null < "/proc/$SHELL_PID/environ")
say "child environ read back from /proc: DISPLAY=:$D occurrences $(echo "$CHILD_ENV" | grep -cx "DISPLAY=:$D"), WAYLAND_DISPLAY occurrences $(echo "$CHILD_ENV" | grep -c '^WAYLAND_DISPLAY='), $(echo "$CHILD_ENV" | grep -x 'XDG_BACKEND=.*'), $(echo "$CHILD_ENV" | grep -x 'GDK_BACKEND=.*')"
echo "$CHILD_ENV" | grep -qx "DISPLAY=:$D" || fail "the launched process is not on this review's display"
echo "$CHILD_ENV" | grep -q '^WAYLAND_DISPLAY=' && fail "the launched process inherited WAYLAND_DISPLAY"

WIN=""
for i in $(seq 1 120); do
  for id in $(xdotool search --name 'Apunta' 2>/dev/null); do
    if [ "$(xdotool getwindowname "$id" 2>/dev/null)" = "Apunta" ] \
       && [ "$(xdotool getwindowpid "$id" 2>/dev/null)" = "$SHELL_PID" ]; then WIN="$id"; break; fi
  done
  [ -n "$WIN" ] && break
  alive "$SHELL_PID" || break
  sleep 1
done
[ -n "$WIN" ] || { say "no matching window"; kill -9 "$SHELL_PID" 2>/dev/null; fail "window never appeared"; }
say "window <id ${WIN}> $(xdotool getwindowgeometry "$WIN" | tr '\n' ' ') on display $(xdotool getdisplaygeometry | tr '\n' ' ')"

# The server of this run must be up and owned by this run, before any close.
READY=""
for i in $(seq 1 60); do
  READY=$(curl -s "http://127.0.0.1:$APUNTA_PORT/api/health" || true)
  case "$READY" in *"\"testRunId\":\"$APUNTA_TEST_RUN_ID\""*) break;; esac
  sleep 1
done
case "$READY" in
  *"\"testRunId\":\"$APUNTA_TEST_RUN_ID\""*) say "server answers with this run id (health OK)";;
  *) fail "the run's own server never answered with its run id";;
esac
[ "$(count_servers)" = 1 ] || fail "expected exactly one server process before the close, found $(count_servers)"
say "server processes before: $(count_servers)"

# Settle, then look at the pixels: a real rendered home screen, not a splash.
sleep 8
import -window root "$SCRATCH/$TAG.home.png" 2>/dev/null
say "screenshot distinct colours: $(convert "$SCRATCH/$TAG.home.png" -format %k info: 2>/dev/null)"
say "served document bytes at the window origin: $(curl -s "http://127.0.0.1:$APUNTA_PORT/" | wc -c)"

# ------------------------------------------------------- the native close -----
python3 "$HELPER" "$WIN" "$SHELL_PID" "Apunta" > "$SCRATCH/$TAG.send.log" 2>&1
SEND_RC=$?
sed 's/^/  send: /' "$SCRATCH/$TAG.send.log" | tee -a "$OUT"
say "helper exit: $SEND_RC"
[ "$SEND_RC" = 0 ] || fail "the helper refused to send (exit $SEND_RC)"

# No signal of any kind is sent by this script from here on. The card's own
# bounds: the shell must be gone inside SHUTDOWN_GRACE_MS (10 s).
START=$(date +%s%N)
GONE=no
for i in $(seq 1 100); do alive "$SHELL_PID" || { GONE=yes; break; }; sleep 0.1; done
END=$(date +%s%N)
MS=$(( (END - START) / 1000000 ))
say "shell exited on its own: $GONE after ${MS}ms (no SIGTERM and no SIGKILL sent by this script)"
[ "$GONE" = yes ] || fail "the shell did not exit inside the card's 10s shutdown budget"
[ "$MS" -lt 10000 ] || fail "the shell exited outside the card's 10s shutdown budget (${MS}ms)"

sleep 2
if port_free; then say "port 7831 free: yes"; else fail "port 7831 still in use"; fi
AFTER=$(count_servers)
say "server processes after: $AFTER"
[ "$AFTER" = 0 ] || fail "a server process from this run survived"
if [ -e "$APUNTA_DATA_DIR/apunta.lock" ]; then fail "apunta.lock still present"; else say "lock file: absent"; fi
alive "$DUMMY" || fail "the unrelated dummy of this run was killed"
say "unrelated dummy alive: yes"
say "ollama after: $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:11434/api/version)"
say "appImage FUSE mounts left: $(ls -d /tmp/.mount_Apunta* 2>/dev/null | wc -l)"
say "--- the app's own words (the real CloseRequested door) ---"
grep -E 'apunta: (the main window|the window close|a termination signal)' "$SCRATCH/$TAG.app.log" | sed 's/^/  /' | tee -a "$OUT"
grep -q 'the window close is closing the app; starting the quit ladder' "$SCRATCH/$TAG.app.log" \
  || fail "the app never logged the window-close quit ladder"
kill "$DUMMY" 2>/dev/null
say "RESULT: PASS"
exit 0
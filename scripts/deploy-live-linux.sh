#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -ne 1 ]]; then
  printf 'usage: %s <revision>\n' "$0" >&2
  exit 2
fi

REV=$1
LIVE_DIR=${HOME}/apunta-live
LIVE_LOG=${HOME}/.local/var/log/apunta-live.log
OLD_LOG=${HOME}/.omp/run/daemons/66cf25293f8d276e/daemons/apunta-live/output.log

live_pid() {
  ss -H -ltnp 'sport = :7717' 2>/dev/null |
    sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' |
    sed -n '1p'
}

wait_port_free() {
  for _ in $(seq 1 60); do
    [[ -z "$(live_pid)" ]] && return 0
    sleep 0.5
  done
  return 1
}

wait_health() {
  local body
  for _ in $(seq 1 60); do
    if body=$(curl -fsS http://127.0.0.1:7717/api/health 2>/dev/null) &&
      node -e 'const h=JSON.parse(process.argv[1]); process.exit(h.ok === true ? 0 : 1)' "$body"; then
      return 0
    fi
    sleep 0.5
  done
  return 1
}

old_pid=$(live_pid)
if [[ -z "$old_pid" ]]; then
  printf 'no Apunta process is listening on 127.0.0.1:7717\n' >&2
  exit 1
fi
if pgrep -P "$old_pid" -af 'whisper-cli' >/dev/null; then
  printf 'refusing deployment: whisper-cli is a child of live PID %s\n' "$old_pid" >&2
  exit 1
fi

curl -fsS -X POST http://127.0.0.1:7717/api/backup \
  -H 'content-type: application/json' -d '{}' >/dev/null
printf 'backup completed via /api/backup\n'

# Build before stopping the live process; npm is explicitly offline so the only
# network operation this deployment performs is the local-repository git fetch.
git -C "$LIVE_DIR" fetch
git -C "$LIVE_DIR" checkout --detach "$REV"
(
  cd "$LIVE_DIR"
  npm ci --offline
  npm run build
)

old_cwd=$(readlink "/proc/$old_pid/cwd")
rollback() {
  local status=$?
  trap - ERR
  local current
  current=$(live_pid || true)
  if [[ -n "$current" && "$current" != "$old_pid" ]]; then
    kill -TERM "$current" 2>/dev/null || true
    wait_port_free || true
  fi
  if ! kill -0 "$old_pid" 2>/dev/null; then
    mkdir -p "$(dirname -- "$OLD_LOG")"
    (cd "$old_cwd" && setsid nohup env NODE_ENV=production APUNTA_NO_OPEN=1 \
      node server/dist/index.js >> "$OLD_LOG" 2>&1 </dev/null &)
    wait_health || true
  fi
  exit "$status"
}
trap rollback ERR
kill -TERM "$old_pid"
wait_port_free
mkdir -p "$(dirname -- "$LIVE_LOG")"
(
  cd "$LIVE_DIR"
  setsid nohup env NODE_ENV=production APUNTA_NO_OPEN=1 node server/dist/index.js \
    >> "$LIVE_LOG" 2>&1 </dev/null &
)
wait_health
trap - ERR
printf 'live deployment ready at revision %s\n' "$REV"

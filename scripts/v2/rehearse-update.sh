#!/bin/bash
#
# P6.2 — rehearse a real update on this PC before publishing a release.
#
#   bash scripts/v2/rehearse-update.sh
#   bash scripts/v2/rehearse-update.sh --from old-test-updater.AppImage
#
# With `--from`, the installed app is that AppImage (a test-updater build of an
# older commit, such as the one the owner has installed) and the update is this
# checkout's own version; the older build's own updater code does the install.
# Make one with `git checkout <commit>`, package-linux-resources.sh and
# `npm run tauri:build:updater-test`, then `git checkout main`.
#
# Builds two test-updater AppImages from this checkout, the current version
# and the next patch version, signs the newer one with a throwaway key using
# the same `tauri signer sign` the release uses, and serves it on loopback
# (127.0.0.1:7891, the only kind of endpoint a test-updater build accepts).
# Then, in a sandbox and on a private virtual display:
#
#   1. the older app checks, downloads, verifies, installs and restarts, and
#      must come back reporting the newer version with the previous AppImage
#      kept beside it;
#   2. the same update signed with a different key must be refused, with
#      nothing replaced.
#
# Nothing touches the network, the live port or the live data folder, and the
# real signing key is never used. About ten minutes, most of it the two builds.

set -euo pipefail

FROM=""
while [ $# -gt 0 ]; do
  case "$1" in
    --from)
      FROM="$(realpath "${2:?--from needs an AppImage}")"
      shift
      ;;
    *)
      echo "usage: $0 [--from old-test-updater.AppImage]" >&2
      exit 2
      ;;
  esac
  shift
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"
NODE_BIN="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin"
[ -x "$NODE_BIN/node" ] || { echo "the pinned Node 24.19.0 is not at $NODE_BIN" >&2; exit 1; }
export PATH="$NODE_BIN:$PATH"
for tool in Xvfb curl; do
  command -v "$tool" >/dev/null || { echo "$tool is missing" >&2; exit 1; }
done

PORT=7875
SERVE_PORT=7891
DISPLAY_NUMBER=:97
WORK="$(mktemp -d /tmp/apunta-rehearse-XXXXXX)"
PIDS=()
# Only this rehearsal's shells: an `apunta` whose environment carries this
# sandbox's port. The owner's own installed app is never signalled.
ours() {
  for pid in $(pgrep -x apunta || true); do
    tr '\0' '\n' <"/proc/$pid/environ" 2>/dev/null | grep -qx "APUNTA_PORT=$PORT" && echo "$pid"
  done
  return 0
}
# Each AppImage run with APPIMAGE_EXTRACT_AND_RUN unpacks ~775 MB into /tmp and
# leaves it; a few runs fill a tmpfs. Only the copies made after this marker go.
MARKER="$WORK/started"
touch "$MARKER"
cleanup() {
  for pid in "${PIDS[@]}" $(ours); do kill "$pid" 2>/dev/null || true; done
  sleep 2
  find /tmp -maxdepth 1 -name 'appimage_extracted_*' -newer "$MARKER" -exec rm -rf {} + 2>/dev/null || true
  rm -f "$WORK"/*.AppImage "$WORK"/serve/*.AppImage
}
trap cleanup EXIT

step() { printf '\n== %s\n' "$1"; }
fail() {
  printf '\nrehearse-update: FAIL: %s\n' "$1" >&2
  exit 1
}

CHECKOUT="$(node -p 'JSON.parse(require("fs").readFileSync("src-tauri/tauri.conf.json","utf8")).version')"
if [ -n "$FROM" ]; then
  [ -f "$FROM" ] || { echo "no AppImage at $FROM" >&2; exit 1; }
  cp "$FROM" "$WORK/old.AppImage"
  CURRENT="$(basename "$FROM" | sed -n 's/.*_\([0-9]*\.[0-9]*\.[0-9]*\)_amd64\.AppImage$/\1/p')"
  [ -n "$CURRENT" ] || CURRENT="(from $(basename "$FROM"))"
  NEXT="$CHECKOUT"
else
  CURRENT="$CHECKOUT"
  NEXT="$(node -p "const [a,b,c]='$CURRENT'.split('.').map(Number); [a,b,c+1].join('.')")"
fi
printf 'rehearsing %s -> %s in %s\n' "$CURRENT" "$NEXT" "$WORK"

if [ -z "$FROM" ]; then
  step "Building $CURRENT (the installed app)"
  bash scripts/v2/package-linux-resources.sh >"$WORK/build-old.log" 2>&1
  npm run tauri:build:updater-test >>"$WORK/build-old.log" 2>&1
  cp "src-tauri/target/release/bundle/appimage/Apunta (test)_${CURRENT}_amd64.AppImage" "$WORK/old.AppImage"
fi

step "Building $NEXT (the update)"
APUNTA_BUNDLE_VERSION="$NEXT" bash scripts/v2/package-linux-resources.sh >"$WORK/build-new.log" 2>&1
npx tauri build --features test-updater --config src-tauri/tauri.test.conf.json \
  --config "{\"version\":\"$NEXT\"}" >>"$WORK/build-new.log" 2>&1
UPDATE="Apunta_${NEXT}_amd64.AppImage"
mkdir -p "$WORK/serve"
cp "src-tauri/target/release/bundle/appimage/Apunta (test)_${NEXT}_amd64.AppImage" "$WORK/serve/$UPDATE"

step "Signing it with throwaway keys"
npx tauri signer generate --ci -p rehearsal -w "$WORK/good.key" -f >/dev/null 2>&1
npx tauri signer generate --ci -p rehearsal -w "$WORK/other.key" -f >/dev/null 2>&1
sign() {
  rm -f "$WORK/serve/$UPDATE.sig"
  TAURI_SIGNING_PRIVATE_KEY="$(cat "$1")" TAURI_SIGNING_PRIVATE_KEY_PASSWORD=rehearsal \
    npx tauri signer sign "$WORK/serve/$UPDATE" >/dev/null 2>&1
  node -e '
    const fs = require("node:fs");
    const [dir, name, version, port] = process.argv.slice(1);
    fs.writeFileSync(`${dir}/latest.json`, JSON.stringify({
      version,
      notes: "rehearsal",
      pub_date: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      platforms: { "linux-x86_64": {
        signature: fs.readFileSync(`${dir}/${name}.sig`, "utf8").trim(),
        url: `http://127.0.0.1:${port}/${name}`,
      } },
    }));
  ' "$WORK/serve" "$UPDATE" "$NEXT" "$SERVE_PORT"
}
sign "$WORK/good.key"

node -e '
  const http = require("node:http"), fs = require("node:fs"), path = require("node:path");
  const [dir, port] = process.argv.slice(1);
  http.createServer((req, res) => {
    const file = path.join(dir, path.basename(req.url));
    if (!fs.existsSync(file)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "content-length": fs.statSync(file).size });
    fs.createReadStream(file).pipe(res);
  }).listen(Number(port), "127.0.0.1");
' "$WORK/serve" "$SERVE_PORT" &
PIDS+=($!)
Xvfb "$DISPLAY_NUMBER" -screen 0 1400x1000x24 -nolisten tcp >/dev/null 2>&1 &
PIDS+=($!)

node scripts/v2/sandbox.mjs env --port "$PORT" >"$WORK/sandbox.env"
# shellcheck disable=SC1091
. "$WORK/sandbox.env"
BASE="$(dirname "$APUNTA_DATA_DIR")"
mkdir -p "$APUNTA_DATA_DIR" "$BASE/apps" "$BASE/home" "$BASE/cache" "$BASE/config" "$BASE/xdg"
API="http://127.0.0.1:$PORT/api"

launch() {
  cp "$WORK/old.AppImage" "$BASE/apps/Apunta.AppImage"
  rm -f "$BASE/apps/Apunta.previous.AppImage"
  (
    cd /
    env APPIMAGE_EXTRACT_AND_RUN=1 WAYLAND_DISPLAY= GDK_BACKEND=x11 DISPLAY="$DISPLAY_NUMBER" \
      APUNTA_FAKE_AI=1 HOME="$BASE/home" XDG_CACHE_HOME="$BASE/cache" \
      XDG_CONFIG_HOME="$BASE/config" XDG_DATA_HOME="$BASE/xdg" \
      APUNTA_UPDATER_TEST_ENDPOINT="http://127.0.0.1:$SERVE_PORT/latest.json" \
      APUNTA_UPDATER_TEST_PUBKEY="$(cat "$WORK/good.key.pub")" \
      "$BASE/apps/Apunta.AppImage" >>"$WORK/app.log" 2>&1 &
  )
  for _ in $(seq 1 60); do curl -sf "$API/health" >/dev/null && return 0; sleep 1; done
  fail "the app did not start (see $WORK/app.log)"
}
version() { curl -s "$API/health" | node -p 'JSON.parse(require("fs").readFileSync(0)).version'; }
state() { curl -s -m 2 "$API/app/update" 2>/dev/null | node -p 'const d = JSON.parse(require("fs").readFileSync(0)); d.state + (d.code ? ":" + d.code : "")' 2>/dev/null || echo none; }
wait_state() {
  for _ in $(seq 1 120); do
    [[ "$(state)" =~ $1 ]] && return 0
    sleep 1
  done
  fail "the updater never reached $1 (last: $(state))"
}
quit() {
  for pid in $(ours); do kill -TERM "$pid" 2>/dev/null || true; done
  # 30 s: builds before 2026-10-08 need the quit ladder's full SIGKILL path.
  for _ in $(seq 1 60); do [ -z "$(ours)" ] && return 0; sleep 0.5; done
  fail "the app did not quit"
}

step "1. A correctly signed update installs and restarts"
launch
OLD_REPORTS="$(version)"
[ -n "$FROM" ] || [ "$OLD_REPORTS" = "$CURRENT" ] || fail "the installed app is not $CURRENT"
curl -s -X POST "$API/app/update/check" >/dev/null
wait_state "^available"
curl -s -X POST "$API/app/update/download" >/dev/null
wait_state "^verified"
curl -s -X POST "$API/app/update/install" >/dev/null
wait_state "^done"
[ "$(version)" = "$NEXT" ] || fail "after the update the app reports $(version), not $NEXT"
[ -f "$BASE/apps/Apunta.previous.AppImage" ] || fail "the previous AppImage was not kept"
cmp -s "$BASE/apps/Apunta.AppImage" "$WORK/serve/$UPDATE" || fail "the installed file is not the update"
printf 'PASS: %s -> %s, previous kept\n' "$CURRENT" "$NEXT"
quit

step "2. An update signed with another key is refused"
sign "$WORK/other.key"
launch
curl -s -X POST "$API/app/update/check" >/dev/null
wait_state "^available"
curl -s -X POST "$API/app/update/download" >/dev/null
wait_state ":rejected$"
cmp -s "$BASE/apps/Apunta.AppImage" "$WORK/old.AppImage" || fail "a refused update still replaced the app"
[ "$(version)" = "$OLD_REPORTS" ] || fail "a refused update changed the running version"
printf 'PASS: refused, nothing replaced\n'
quit

step "Done"
printf 'Both rehearsals passed. Logs: %s\n' "$WORK"

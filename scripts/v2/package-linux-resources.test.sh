#!/bin/bash
#
# P3.1 — the Linux runtime resource bundle, tested end to end from a relocated
# copy, on the bundled Node, with no host Node on PATH.
#
#   bash scripts/v2/package-linux-resources.test.sh
#
# Run from the repository root, after scripts/v2/package-linux-resources.sh has
# produced build/linux-resources/ (V1).
#
# WHY `sandbox.mjs env` AND NOT `run`
#
# `run` spawns `join(repoRoot, 'server', 'dist', 'index.js')` with
# `process.execPath` and `cwd: repoRoot` (sandbox.mjs:50, 258-268) and refuses
# outright when that entry is missing. So `run` would start the **repository's**
# server under whatever Node ran the wrapper — never the bundled one — and every
# check below would pass while proving nothing this card exists to prove. `env`
# creates the run folder and prints the seven `export` lines (sandbox.mjs:353-361)
# and performs no poll, so the rule-5 ownership check is this script's own.
#
# The wrapper is a Node script inside the checkout, so it is named by absolute
# path and run with the **bundled** Node. The port comes from this card's
# dispatch (7834); it is never the live instance's 7717.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PORT="${APUNTA_P31_PORT:-7834}"
SOURCE_FOLDER="$REPO_ROOT/build/linux-resources"
BUNDLE_NODE="$SOURCE_FOLDER/node/bin/node"
EXPECTED_NODE_VERSION="v24.19.0"

# PASS/FAIL bookkeeping. The script exits non-zero on the first failure.
FAILURES=0
SERVER_PID=""

pass() {
  printf 'PASS %s\n' "$1"
}

fail() {
  printf 'FAIL %s: %s\n' "$1" "$2"
  exit 1
}

# ---------------------------------------------------------------- preflight --

if [ ! -d "$SOURCE_FOLDER" ]; then
  fail "bundle-present" "build/linux-resources/ is missing. Run: bash scripts/v2/package-linux-resources.sh"
fi
if [ ! -x "$BUNDLE_NODE" ]; then
  fail "bundled-node" "$BUNDLE_NODE is missing or not executable"
fi
if [ ! -f "$SOURCE_FOLDER/manifest.json" ]; then
  fail "bundle-manifest" "build/linux-resources/manifest.json is missing"
fi
if [ ! -f "$SOURCE_FOLDER/bin/whisper-cli" ]; then
  # The card is explicit: a missing whisper-cli is the stop-condition path, and
  # V2's own check below would fail on it anyway. Say so rather than pretend.
  fail "bundle-whisper" "build/linux-resources/bin/whisper-cli is missing; see the packaging script's stop-condition report"
fi

# The version the bundle must report, read from the source of truth itself
# rather than hard-coded, so the assertion cannot drift from the repository.
EXPECTED_VERSION="$(
  "$BUNDLE_NODE" -e 'process.stdout.write(JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).version ?? "")' \
    "$REPO_ROOT/server/package.json"
)"

# ------------------------------------------------------------ sandbox env ----

# `env` mode: create the run folder, print the seven export lines, poll nothing.
# Run with the bundled Node, by absolute path, for the reason in the header.
SANDBOX_ENV="$(mktemp)"
if ! "$BUNDLE_NODE" "$REPO_ROOT/scripts/v2/sandbox.mjs" env --port "$PORT" > "$SANDBOX_ENV"; then
  fail "sandbox-env" "sandbox.mjs env --port $PORT refused; see the message above"
fi
# shellcheck disable=SC1090
. "$SANDBOX_ENV"
rm -f "$SANDBOX_ENV"

: "${APUNTA_DATA_DIR:?sandbox.mjs env did not print APUNTA_DATA_DIR}"
: "${APUNTA_TEST_RUN_ID:?sandbox.mjs env did not print APUNTA_TEST_RUN_ID}"
: "${APUNTA_PORT:?sandbox.mjs env did not print APUNTA_PORT}"

if [ "$APUNTA_PORT" != "$PORT" ]; then
  fail "sandbox-port" "wrapper assigned port $APUNTA_PORT, expected $PORT"
fi

# ------------------------------------------------- relocate and launch -------

# Copy the WHOLE output folder, so the run proves the bundle is self-contained:
# a dependency left behind in the source folder shows up as a failure here
# rather than working by accident in the build tree.
BUNDLE_PARENT="/tmp/apunta-v2/${APUNTA_TEST_RUN_ID}/bundle"
mkdir -p "$BUNDLE_PARENT"
cp -R "$SOURCE_FOLDER" "$BUNDLE_PARENT/linux-resources"
FOLDER="$BUNDLE_PARENT/linux-resources"

SERVER_LOG="/tmp/apunta-v2/${APUNTA_TEST_RUN_ID}/logs/bundled-server.log"

# `/bin/sh` and nothing else: the box's default `node` is a mise shim at
# v26.8.2, which is outside `engines` ("node": ">=24.19.0 <25") and outside the
# bundle. /usr/bin:/bin holds no host Node at all.
CLEAN_PATH="/usr/bin:/bin"

# The launch contract, each override pointing into the folder — the same three
# `macos/Apunta/Paths.swift:99-101` sets for the Mac build, plus the whisper
# binary, so it is named rather than found on PATH:
#   APUNTA_SQLITE_BINDING   config.ts:171, passed as better-sqlite3's nativeBinding
#   APUNTA_LICENSES_FILE    config.ts:172
#   APUNTA_WEB_DIST         config.ts:173, else it resolves <folder>/../web/dist
#   APUNTA_WHISPER_BIN      config.ts:170
#
# `env -i` and no inherited variables beyond the eight named here, so nothing
# from the caller's shell can make the bundle work that it cannot do alone.
# Start from `/`, so nothing about the checkout's working directory can either.
#
# `exec` is load-bearing, not tidiness: without it `$!` is the *subshell's* pid
# and the server runs as its child, so every ownership assertion below would be
# comparing the wrong pid — and would fail, correctly, rather than pass by
# accident. With it the subshell is replaced by the server and `$!` is the pid
# that writes the lock and holds the listening socket.
start_bundled_server() {
  (
    cd / || exit 1
    exec env -i PATH="$CLEAN_PATH" HOME="$HOME" \
      APUNTA_DATA_DIR="$APUNTA_DATA_DIR" \
      APUNTA_PORT="$APUNTA_PORT" \
      APUNTA_NO_OPEN=1 \
      APUNTA_TEST_RUN_ID="$APUNTA_TEST_RUN_ID" \
      APUNTA_V2=1 \
      APUNTA_FAKE_AI=1 \
      APUNTA_SQLITE_BINDING="$FOLDER/native/better_sqlite3.node" \
      APUNTA_LICENSES_FILE="$FOLDER/THIRD-PARTY-LICENSES.md" \
      APUNTA_WEB_DIST="$FOLDER/web/dist" \
      APUNTA_WHISPER_BIN="$FOLDER/bin/whisper-cli" \
      "$FOLDER/node/bin/node" "$FOLDER/server/server.mjs" >> "$SERVER_LOG" 2>&1
  ) &
  SERVER_PID=$!
}

# Stops only the PID this script started. Never pkill (C-ISO@1 rule 7).
stop_bundled_server() {
  local pid="$1"
  [ -n "$pid" ] || return 0
  kill -0 "$pid" 2>/dev/null || return 0
  kill -TERM "$pid" 2>/dev/null || true
  local waited=0
  while kill -0 "$pid" 2>/dev/null && [ "$waited" -lt 50 ]; do
    sleep 0.1
    waited=$((waited + 1))
  done
  kill -0 "$pid" 2>/dev/null && kill -KILL "$pid" 2>/dev/null
  return 0
}

# Nothing may be left listening on the port when the script ends.
assert_port_released() {
  local phase="$1"
  if ss -ltnH "sport = :$PORT" 2>/dev/null | grep -q .; then
    printf 'FAIL port-released: something is still listening on %s after %s\n' "$PORT" "$phase"
    exit 1
  fi
}

# The port must be free, checked by binding then released immediately before the
# launch — C-ISO@1 rule 2, and the first of the broken-copy ownership facts.
assert_port_bindable() {
  "$BUNDLE_NODE" -e '
    const { createServer } = require("node:net");
    const probe = createServer();
    probe.once("error", (e) => { process.stderr.write(String(e.code) + "\n"); process.exit(1); });
    probe.listen(Number(process.argv[1]), "127.0.0.1", () => probe.close(() => process.exit(0)));
  ' "$PORT" || fail "port-free" "port $PORT could not be bound and released before launch"
}

# --------------------------------------------------------------- helpers -----

http_status() {
  curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$1" 2>/dev/null || printf '000'
}

http_get() {
  curl -s --max-time 20 "$1" 2>/dev/null || true
}

http_post() {
  # $1 url, $2 json body. Prints the body; the status is read separately.
  curl -s --max-time 20 -X POST -H 'content-type: application/json' -d "$2" "$1" 2>/dev/null || true
}

# Re-serialise a JSON document compactly, so a `case` pattern written against
# `"key":"value"` matches whether the server pretty-printed it. The lock file is
# written with `JSON.stringify(contents, null, 2)` and the health body is not,
# and a check that silently stops matching one of them is worse than no check.
compact_json() {
  "$BUNDLE_NODE" -e '
    try { process.stdout.write(JSON.stringify(JSON.parse(process.argv[1]))); }
    catch { process.stdout.write(""); }
  ' "$1"
}

# The listening socket on the port, and whether the given pid owns it.
#
# `/proc/net/tcp` lists every socket with state 0A (TCP_LISTEN) and its inode in
# the last column; `/proc/<pid>/fd/*` symlinks read `socket:[<inode>]`. Joining
# the two is the standard Linux answer to "who is listening", needs no
# capability, and works for a process this script spawned as the same user.
socket_owner_pid() {
  local port="$1"
  awk -v want="$(printf '%04X' "$port")" '
    NR > 1 && $4 == "0A" {
      split($2, a, ":")
      if (toupper(a[2]) == want) { print $10; found = 1; exit }
    }
    END { if (!found) exit 1 }
  ' /proc/net/tcp 2>/dev/null
}

pid_owns_inode() {
  local pid="$1" inode="$2" fd
  for fd in /proc/"$pid"/fd/*; do
    [ -e "$fd" ] || continue
    if [ "$(readlink "$fd" 2>/dev/null)" = "socket:[$inode]" ]; then
      return 0
    fi
  done
  return 1
}

# Field 22 of /proc/<pid>/stat — the kernel start time in clock ticks, counted
# from after the parenthesised `comm`, exactly as data-lock.ts:108-123 does it.
proc_process_start() {
  local pid="$1"
  "$BUNDLE_NODE" -e '
    const fs = require("node:fs");
    const raw = fs.readFileSync(`/proc/${process.argv[1]}/stat`, "utf8");
    const fields = raw.slice(raw.lastIndexOf(")") + 1).trim().split(/\s+/);
    const value = fields[19];
    process.stdout.write(/^\d+$/.test(value) ? value : "");
  ' "$pid" 2>/dev/null
}

# C-ISO@1 rule 5's poll, which `env` mode does not do. Proceeds only when
# testRunId equals this run's; silence, a missing id or a foreign id fails.
await_ownership() {
  local pid="$1" deadline=$((SECONDS + 30)) body
  while [ "$SECONDS" -lt "$deadline" ]; do
    if ! kill -0 "$pid" 2>/dev/null; then
      return 1
    fi
    body="$(http_get "http://127.0.0.1:${PORT}/api/health")"
    case "$body" in
      *"\"testRunId\":\"${APUNTA_TEST_RUN_ID}\""*) return 0 ;;
    esac
    sleep 0.25
  done
  return 1
}

cleanup() {
  stop_bundled_server "$SERVER_PID"
  SERVER_PID=""
}
trap cleanup EXIT INT TERM

# ============================================================== the checks ===

# 1. health -------------------------------------------------------------------
start_bundled_server
FIRST_PID="$SERVER_PID"
FIRST_LOG="$SERVER_LOG"

if ! await_ownership "$FIRST_PID"; then
  printf 'FAIL ownership: /api/health never answered with this run'"'"'s testRunId within 30s\n'
  printf '%s\n' "--- $FIRST_LOG ---"
  tail -n 40 "$FIRST_LOG" 2>/dev/null
  exit 1
fi
pass "ownership-poll"

HEALTH="$(compact_json "$(http_get "http://127.0.0.1:${PORT}/api/health")")"

case "$HEALTH" in
  *'"ok":true'*) pass "health-ok" ;;
  *) fail "health-ok" "health body did not carry ok:true — $HEALTH" ;;
esac

# The version travels as metadata injected at build time (AM-058), and this is
# the first of the two places it is read back — after relocation, so the value
# cannot have come from a `package.json` sitting next to the source.
if [ "$EXPECTED_VERSION" = "" ]; then
  fail "health-version" "server/package.json carries no version to compare against"
fi
case "$HEALTH" in
  *"\"version\":\"${EXPECTED_VERSION}\""*) pass "health-version" ;;
  *) fail "health-version" "expected version ${EXPECTED_VERSION} in health, got: $HEALTH" ;;
esac

# The second of the two: the data-folder lock the process itself wrote. Read
# while the process is ALIVE — a clean release unlinks the file, so a
# post-mortem read would prove nothing.
LOCK_FILE="$APUNTA_DATA_DIR/apunta.lock"
if [ ! -f "$LOCK_FILE" ]; then
  fail "lock-present" "$LOCK_FILE does not exist while the server is running"
fi
LOCK="$(compact_json "$(cat "$LOCK_FILE")")"

LOCK_PID="$(
  "$BUNDLE_NODE" -e 'try{process.stdout.write(String(JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).pid))}catch{process.stdout.write("")}' "$LOCK_FILE"
)"
if [ "$LOCK_PID" = "$FIRST_PID" ]; then
  pass "lock-pid"
else
  fail "lock-pid" "lock pid ${LOCK_PID} is not the spawned pid ${FIRST_PID}"
fi

LOCK_START="$(
  "$BUNDLE_NODE" -e 'try{process.stdout.write(String(JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).processStart))}catch{process.stdout.write("")}' "$LOCK_FILE"
)"
LIVE_START="$(proc_process_start "$FIRST_PID")"
if [ -n "$LIVE_START" ] && [ "$LOCK_START" = "$LIVE_START" ]; then
  pass "lock-process-start"
else
  fail "lock-process-start" "lock processStart '${LOCK_START}' is not field 22 of /proc/${FIRST_PID}/stat ('${LIVE_START}')"
fi

if kill -0 "$FIRST_PID" 2>/dev/null; then
  pass "lock-pid-alive"
else
  fail "lock-pid-alive" "pid ${FIRST_PID} is not alive"
fi

case "$LOCK" in
  *"\"appVersion\":\"${EXPECTED_VERSION}\""*) pass "lock-app-version" ;;
  *) fail "lock-app-version" "expected appVersion ${EXPECTED_VERSION} in the lock, got: $LOCK" ;;
esac

# The listening socket on the port must be owned by the pid we spawned. The
# lock above proves our process holds the data folder; it does not by itself
# prove the process answering HTTP is that same process.
LISTEN_INODE="$(socket_owner_pid "$PORT")"
if [ -z "$LISTEN_INODE" ]; then
  fail "socket-owner" "no TCP_LISTEN socket found on port ${PORT} in /proc/net/tcp"
fi
if pid_owns_inode "$FIRST_PID" "$LISTEN_INODE"; then
  pass "socket-owner"
else
  fail "socket-owner" "the listening socket ${LISTEN_INODE} on port ${PORT} is not in /proc/${FIRST_PID}/fd; another process is answering"
fi

# 2. migration on a fresh database --------------------------------------------
DB_PATH="$(
  "$BUNDLE_NODE" -e 'try{process.stdout.write(String(JSON.parse(process.argv[1]).db.path))}catch{process.stdout.write("")}' "$HEALTH"
)"
case "$DB_PATH" in
  "$APUNTA_DATA_DIR"/*) pass "db-path" ;;
  *) fail "db-path" "db.path '${DB_PATH}' is not under APUNTA_DATA_DIR ${APUNTA_DATA_DIR}" ;;
esac

# The highest-numbered .sql in the BUNDLED migrations dir, not the repository's:
# a bundle shipping a stale migration set must fail here.
LATEST_SQL="$(
  ls "$FOLDER/migrations" 2>/dev/null | grep -E '^[0-9]+_.*\.sql$' | sed -E 's/^0*([0-9]+)_.*/\1/' | sort -n | tail -n 1
)"
if [ -z "$LATEST_SQL" ]; then
  fail "migrations-bundled" "no numbered .sql files in $FOLDER/migrations"
fi
MIGRATION_LEVEL="$(
  "$BUNDLE_NODE" -e 'try{process.stdout.write(String(JSON.parse(process.argv[1]).db.migrationLevel))}catch{process.stdout.write("")}' "$HEALTH"
)"
if [ "$MIGRATION_LEVEL" = "$LATEST_SQL" ]; then
  pass "migration-level"
else
  fail "migration-level" "migrationLevel ${MIGRATION_LEVEL} is not the highest bundled migration ${LATEST_SQL}"
fi

# 3. note creation: patient, then format, then note ---------------------------
# A fresh database has zero formats, so GET /api/formats is empty and
# POST /api/notes cannot be made at all without creating one.
FORMATS="$(http_get "http://127.0.0.1:${PORT}/api/formats")"
case "$FORMATS" in
  *'"formats":[]'*) pass "formats-empty-on-fresh-db" ;;
  *) fail "formats-empty-on-fresh-db" "expected an empty format list on a fresh database, got: $FORMATS" ;;
esac

PATIENT_JSON="$(http_post "http://127.0.0.1:${PORT}/api/patients" '{"name":"John Smith"}')"
PATIENT_ID="$(
  "$BUNDLE_NODE" -e 'try{process.stdout.write(String(JSON.parse(process.argv[1]).id))}catch{process.stdout.write("")}' "$PATIENT_JSON"
)"
if [ -n "$PATIENT_ID" ]; then
  pass "post-patient"
else
  fail "post-patient" "POST /api/patients returned no id — $PATIENT_JSON"
fi

FORMAT_JSON="$(http_post "http://127.0.0.1:${PORT}/api/formats" '{"name":"Progress note","sections":["Subjective","Objective"]}')"
FORMAT_ID="$(
  "$BUNDLE_NODE" -e 'try{process.stdout.write(String(JSON.parse(process.argv[1]).id))}catch{process.stdout.write("")}' "$FORMAT_JSON"
)"
if [ -n "$FORMAT_ID" ]; then
  pass "post-format"
else
  fail "post-format" "POST /api/formats returned no id — $FORMAT_JSON"
fi

NOTE_JSON="$(http_post "http://127.0.0.1:${PORT}/api/notes" "{\"patient_id\":\"${PATIENT_ID}\",\"format_id\":\"${FORMAT_ID}\",\"title\":\"Bundle check\"}")"
NOTE_ID="$(
  "$BUNDLE_NODE" -e 'try{process.stdout.write(String(JSON.parse(process.argv[1]).id))}catch{process.stdout.write("")}' "$NOTE_JSON"
)"
if [ -n "$NOTE_ID" ]; then
  pass "post-note"
else
  fail "post-note" "POST /api/notes returned no id — $NOTE_JSON"
fi

FETCHED_NOTE="$(http_get "http://127.0.0.1:${PORT}/api/notes/${NOTE_ID}")"
FETCHED_ID="$(
  "$BUNDLE_NODE" -e 'try{process.stdout.write(String(JSON.parse(process.argv[1]).id))}catch{process.stdout.write("")}' "$FETCHED_NOTE"
)"
if [ "$FETCHED_ID" = "$NOTE_ID" ]; then
  pass "get-note"
else
  fail "get-note" "GET /api/notes/${NOTE_ID} returned id '${FETCHED_ID}'"
fi

# 4. the shipped SPA ----------------------------------------------------------
ROOT_HEADERS="$(curl -s -o "$APUNTA_DATA_DIR/../tmp/root.html" -D - --max-time 20 "http://127.0.0.1:${PORT}/" 2>/dev/null || true)"
ROOT_BODY="$(cat "$APUNTA_DATA_DIR/../tmp/root.html" 2>/dev/null || true)"

if [ "$(http_status "http://127.0.0.1:${PORT}/")" = "200" ]; then
  pass "spa-status"
else
  fail "spa-status" "GET / did not answer 200"
fi

case "$ROOT_HEADERS" in
  *[Tt]ext/html*) pass "spa-content-type" ;;
  *) fail "spa-content-type" "GET / did not answer text/html — $ROOT_HEADERS" ;;
esac

# Non-empty, and carrying the built app's own document rather than a stub.
if [ -n "$ROOT_BODY" ] && [ "${#ROOT_BODY}" -gt 200 ]; then
  pass "spa-body"
else
  fail "spa-body" "GET / returned a body of ${#ROOT_BODY} bytes; an empty or truncated web/dist must fail here"
fi

# P3.7 — the one hashed script the SERVED shell names, fetched and measured.
#
# The three checks above inspect GET / only, and index.html survives
# `rm -rf web/dist/assets` intact, so all three pass on a bundle with no
# JavaScript in it. What separates a truncated bundle from a good one is the
# asset the shell itself names: the SPA fallback answers a missing one
# `200 text/html` (the boot page, which is why /patients resolves on a fresh
# load) and a real one `200 application/javascript` with the length the
# bundle's own manifest records for that path.
#
# The path comes out of the SERVED body — $ROOT_BODY, captured above — never off
# disk, so a shell that references a script the bundle does not carry fails here
# rather than in a person's browser. Zero or several `src="` is a failure with
# the count in the detail, never a skip and never a pass: a check that quietly
# finds nothing is the defect this card exists to remove. There is no
# modulepreload fallback, no glob, no hard-coded asset name, no file read from
# disk, and no hard-coded size floor — the expected length is the `bytes`
# manifest.json records, read from the copy under test with the bundled Node, so
# this invents no threshold of its own.
SPASSET_SITE_COUNT="$(printf '%s' "$ROOT_BODY" | grep -o 'src="' | wc -l | tr -d ' ' || true)"
if [ "$SPASSET_SITE_COUNT" != "1" ]; then
  fail "spa-asset" "the served GET / body carries ${SPASSET_SITE_COUNT} src=\" references, expected exactly 1; this check asserts the shell and the server agree about one hashed script and does not guess which"
fi

SPASSET_PATH="$(printf '%s' "$ROOT_BODY" | grep -o 'src="[^"]*"' | sed -E 's/^src="([^"]*)"$/\1/' || true)"
if [ "${SPASSET_PATH#/}" = "$SPASSET_PATH" ]; then
  fail "spa-asset" "the served shell names '${SPASSET_PATH}', which is not a site-absolute path; resolving one against / would be a guess, not an assertion"
fi

SPASSET_MANIFEST_KEY="web/dist${SPASSET_PATH}"
SPASSET_EXPECTED="$(
  "$BUNDLE_NODE" -e '
    const fs = require("node:fs");
    try {
      const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      const entry = (manifest.files ?? []).find((f) => f.path === process.argv[2]);
      if (entry && Number.isInteger(entry.bytes)) process.stdout.write(String(entry.bytes));
    } catch {}
  ' "$FOLDER/manifest.json" "$SPASSET_MANIFEST_KEY"
)"
if [ -z "$SPASSET_EXPECTED" ]; then
  fail "spa-asset" "manifest.json records no byte length for ${SPASSET_MANIFEST_KEY}; the bundle does not carry the script its own shell names"
fi

SPASSET_FILE="$APUNTA_DATA_DIR/../tmp/spa-asset.bin"
SPASSET_HEADERS="$APUNTA_DATA_DIR/../tmp/spa-asset.headers"
SPASSET_STATUS="$(curl -s -o "$SPASSET_FILE" -D "$SPASSET_HEADERS" -w '%{http_code}' --max-time 20 "http://127.0.0.1:${PORT}${SPASSET_PATH}" 2>/dev/null || printf '000')"
SPASSET_TYPE="$(grep -i '^content-type:' "$SPASSET_HEADERS" 2>/dev/null | tail -n 1 | tr -d '\r' | cut -d' ' -f2- | cut -d';' -f1 | sed -E 's/[[:space:]]+$//' || true)"
# Bytes as the server sent them, counted on the downloaded body. Never
# ${#VAR}: under the run's UTF-8 locale that counts characters, and the shell
# and the asset disagree by enough to fail a perfect bundle.
SPASSET_ACTUAL="$(wc -c < "$SPASSET_FILE" 2>/dev/null | tr -d ' ' || true)"
[ -n "$SPASSET_ACTUAL" ] || SPASSET_ACTUAL=0

if [ "$SPASSET_STATUS" != "200" ]; then
  fail "spa-asset" "GET ${SPASSET_PATH} answered ${SPASSET_STATUS}, not 200; content-type '${SPASSET_TYPE}', ${SPASSET_ACTUAL} bytes served against the ${SPASSET_EXPECTED} manifest.json records"
fi
case "$SPASSET_TYPE" in
  *[Jj]ava[Ss]cript*) ;;
  *)
    fail "spa-asset" "GET ${SPASSET_PATH} answered ${SPASSET_STATUS} with content-type '${SPASSET_TYPE}', which does not contain javascript; a missing asset is answered 200 text/html by the SPA fallback, not 404, so the content type is what caught this; ${SPASSET_ACTUAL} bytes served against the ${SPASSET_EXPECTED} manifest.json records"
    ;;
esac
if [ "$SPASSET_ACTUAL" != "$SPASSET_EXPECTED" ]; then
  fail "spa-asset" "GET ${SPASSET_PATH} answered ${SPASSET_STATUS} as '${SPASSET_TYPE}' but served ${SPASSET_ACTUAL} bytes, not the ${SPASSET_EXPECTED} manifest.json records"
fi

# One informational line, not a PASS: pass() prints the name alone, and the
# four values below are what the row's acceptance and the return file quote.
printf 'spa-asset %s %s %s %s\n' "$SPASSET_PATH" "$SPASSET_STATUS" "$SPASSET_TYPE" "$SPASSET_ACTUAL"
pass "spa-asset"

# 5. the whisper binary -------------------------------------------------------
if "$FOLDER/bin/whisper-cli" --help > /dev/null 2>&1; then
  pass "whisper-help"
else
  fail "whisper-help" "$FOLDER/bin/whisper-cli --help did not exit 0; the copied shared libraries do not resolve"
fi

# Stop the healthy server before the negative case, and prove the port is free.
stop_bundled_server "$FIRST_PID"
SERVER_PID=""
sleep 0.5
assert_port_released "the healthy server was stopped"

# 6. the failure case: a bundle that cannot open its database -----------------
# C-OWN@1 rule 1's order means the lock is already written by the time
# /api/health answers, so the same ownership proof applies to this launch.
mv "$FOLDER/native/better_sqlite3.node" "$FOLDER/native/better_sqlite3.node.missing"

assert_port_bindable

BROKEN_LOG="/tmp/apunta-v2/${APUNTA_TEST_RUN_ID}/logs/bundled-server-broken.log"
  (
    cd / || exit 1
    exec env -i PATH="$CLEAN_PATH" HOME="$HOME" \
      APUNTA_DATA_DIR="$APUNTA_DATA_DIR" \
    APUNTA_PORT="$APUNTA_PORT" \
    APUNTA_NO_OPEN=1 \
    APUNTA_TEST_RUN_ID="$APUNTA_TEST_RUN_ID" \
    APUNTA_V2=1 \
    APUNTA_FAKE_AI=1 \
    APUNTA_SQLITE_BINDING="$FOLDER/native/better_sqlite3.node" \
    APUNTA_LICENSES_FILE="$FOLDER/THIRD-PARTY-LICENSES.md" \
    APUNTA_WEB_DIST="$FOLDER/web/dist" \
    APUNTA_WHISPER_BIN="$FOLDER/bin/whisper-cli" \
    "$FOLDER/node/bin/node" "$FOLDER/server/server.mjs" >> "$BROKEN_LOG" 2>&1
) &
BROKEN_PID=$!
SERVER_PID="$BROKEN_PID"

# The boot-error app hard-codes its health response and cannot carry testRunId,
# so ownership is proved from the lock the process itself writes. All four
# facts, read while the process is alive: the port was bound and released free
# immediately before launch (assert_port_bindable), the lock's pid is ours, its
# processStart is field 22 of that same live pid's /proc entry, and the pid is
# alive. The folder is the wrapper's own 0700 run directory, so no foreign
# process could have written our kernel start time into it.
BROKEN_DEADLINE=$((SECONDS + 30))
BROKEN_READY=0
while [ "$SECONDS" -lt "$BROKEN_DEADLINE" ]; do
  if ! kill -0 "$BROKEN_PID" 2>/dev/null; then
    break
  fi
  if [ -f "$LOCK_FILE" ]; then
    BROKEN_LOCK_PID="$(
      "$BUNDLE_NODE" -e 'try{process.stdout.write(String(JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).pid))}catch{process.stdout.write("")}' "$LOCK_FILE"
    )"
    if [ "$BROKEN_LOCK_PID" = "$BROKEN_PID" ]; then
      BROKEN_READY=1
      break
    fi
  fi
  sleep 0.25
done

if [ "$BROKEN_READY" != 1 ]; then
  printf 'FAIL broken-lock-pid: the broken copy never wrote a lock owned by pid %s\n' "$BROKEN_PID"
  printf '%s\n' "--- $BROKEN_LOG ---"
  tail -n 40 "$BROKEN_LOG" 2>/dev/null
  exit 1
fi
pass "broken-lock-pid"

BROKEN_START="$(
  "$BUNDLE_NODE" -e 'try{process.stdout.write(String(JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).processStart))}catch{process.stdout.write("")}' "$LOCK_FILE"
)"
BROKEN_LIVE_START="$(proc_process_start "$BROKEN_PID")"
if [ -n "$BROKEN_LIVE_START" ] && [ "$BROKEN_START" = "$BROKEN_LIVE_START" ]; then
  pass "broken-lock-process-start"
else
  fail "broken-lock-process-start" "lock processStart '${BROKEN_START}' is not field 22 of /proc/${BROKEN_PID}/stat ('${BROKEN_LIVE_START}')"
fi

if kill -0 "$BROKEN_PID" 2>/dev/null; then
  pass "broken-lock-pid-alive"
else
  fail "broken-lock-pid-alive" "pid ${BROKEN_PID} is not alive; the boot-error path must keep the port bound"
fi

# The same second half for this launch: the lock proves our process owns the
# data folder, and this proves the process answering HTTP is that process.
BROKEN_INODE="$(socket_owner_pid "$PORT")"
if [ -z "$BROKEN_INODE" ]; then
  fail "broken-socket-owner" "no TCP_LISTEN socket found on port ${PORT} after the broken copy started"
fi
if pid_owns_inode "$BROKEN_PID" "$BROKEN_INODE"; then
  pass "broken-socket-owner"
else
  fail "broken-socket-owner" "the listening socket ${BROKEN_INODE} on port ${PORT} is not in /proc/${BROKEN_PID}/fd"
fi

# The missing-SQLite assertions, kept.
BROKEN_HEALTH_STATUS="$(http_status "http://127.0.0.1:${PORT}/api/health")"
if [ "$BROKEN_HEALTH_STATUS" = "503" ]; then
  pass "broken-health-503"
else
  fail "broken-health-503" "GET /api/health answered ${BROKEN_HEALTH_STATUS}, expected 503 from the boot-error app (a healthy 200 means the bundle opened a database it should not have)"
fi

BROKEN_HEALTH="$(compact_json "$(http_get "http://127.0.0.1:${PORT}/api/health")")"
case "$BROKEN_HEALTH" in
  *'"error":"storage_error"'*) pass "broken-health-storage-error" ;;
  *) fail "broken-health-storage-error" "expected storage_error, got: $BROKEN_HEALTH" ;;
esac

BROKEN_ROOT_HEADERS="$(curl -s -o "$APUNTA_DATA_DIR/../tmp/broken-root.html" -D - --max-time 20 "http://127.0.0.1:${PORT}/" 2>/dev/null || true)"
BROKEN_ROOT_BODY="$(cat "$APUNTA_DATA_DIR/../tmp/broken-root.html" 2>/dev/null || true)"
case "$BROKEN_ROOT_HEADERS" in
  *[Tt]ext/html*) pass "broken-root-html" ;;
  *) fail "broken-root-html" "GET / on the broken copy did not answer text/html — $BROKEN_ROOT_HEADERS" ;;
esac
if [ -n "$BROKEN_ROOT_BODY" ] && [ "${#BROKEN_ROOT_BODY}" -gt 200 ]; then
  pass "broken-root-boot-page"
else
  fail "broken-root-boot-page" "GET / on the broken copy returned ${#BROKEN_ROOT_BODY} bytes, not the boot-error page"
fi

# Stop only the PID this script started, then prove nothing is listening.
stop_bundled_server "$BROKEN_PID"
SERVER_PID=""
sleep 0.5
assert_port_released "the broken copy was stopped"

# The whole run's exit code stays 0: the broken copy really did fail to open
# its database, which is the behaviour under test.
if [ "$FAILURES" -eq 0 ]; then
  pass "bundle-end-to-end"
  exit 0
fi
exit 1

#!/usr/bin/env bash
# One measurement arm for the 2026-09-23 smarter-model scout.
#
#   run-arm.sh <label> <model> <corpus-dir> <invocations> <runs> [instructions-file]
#
# Every arm runs under `flock /tmp/apunta-gpu.lock` so the three agents on this
# one GPU never overlap, and every arm's /api/ps residency is captured beside
# its report. Ollama is the scout's own disposable service (11438), never the
# live 11434.
#
# Residency protocol (learned the hard way — see the report):
#   * `flock` serialises commands, not residency: Ollama keeps a model loaded
#     after the request ends, and three independent servers share one GPU. A
#     4B arm can therefore come back 90% CPU because a peer's model still owns
#     VRAM. So inside the lock this script (1) unloads its own model, (2) waits
#     for every agent's server to report no resident model, (3) warms up at the
#     production context, (4) refuses to measure unless /api/ps says
#     size_vram == size, and (5) unloads again before releasing the lock.
set -euo pipefail

LABEL="$1"
MODEL="$2"
CORPUS="$3"
INVOCATIONS="$4"
RUNS="$5"
INSTRUCTIONS="${6:-}"

URL="${APUNTA_SCOUT_OLLAMA:-http://127.0.0.1:11438}"
# Every other server that shares this one GPU, read-only and never evicted:
# the two peer disposable servers and the therapist's live 11434 (if her 4B is
# resident there that is real use, so wait rather than unload it).
PEER_URLS="${APUNTA_PEER_URLS:-http://127.0.0.1:11436 http://127.0.0.1:11437 http://127.0.0.1:11434}"
OUT="/tmp/smarter-scout"
REPO="/tmp/apunta-smarter-scout"
mkdir -p "$OUT"

CORPUS_TAG="$(basename "$CORPUS")"
EXTRA=()
if [ -n "$INSTRUCTIONS" ]; then
  EXTRA=(--instructions "$INSTRUCTIONS" --instructions "intake=$INSTRUCTIONS")
fi

for i in $(seq 1 "$INVOCATIONS"); do
  REPORT="$OUT/arm-${LABEL}-${CORPUS_TAG}-i${i}.md"
  RESIDENCY="$OUT/ps-${LABEL}-${CORPUS_TAG}-i${i}.json"
  echo "=== $LABEL $CORPUS_TAG invocation $i/$INVOCATIONS $(date +%H:%M:%S)"

  set +e
  flock /tmp/apunta-gpu.lock bash -c '
    set -uo pipefail
    URL="'"$URL"'"; MODEL="'"$MODEL"'"; PEER_URLS="'"$PEER_URLS"'"
    REPORT="'"$REPORT"'"; RESIDENCY="'"$RESIDENCY"'"
    REPO="'"$REPO"'"; OUT="'"$OUT"'"
    LABEL="'"$LABEL"'"; CORPUS_TAG="'"$CORPUS_TAG"'"
    CORPUS="'"$CORPUS"'"; RUNS="'"$RUNS"'"; I="'"$i"'"
    EXTRA=('"${EXTRA[*]:-}"')

    unload() { curl -s "$URL/api/generate" -d "{\"model\":\"$MODEL\",\"keep_alive\":0}" >/dev/null 2>&1 || true; }
    resident() { curl -s "$1/api/ps" 2>/dev/null | jq -r "[.models[]?|select(.size_vram>0)|.name]|join(\",\")" 2>/dev/null || true; }
    # Whatever happens — abort, error, or a clean finish — this server holds no
    # VRAM when the lock is released.
    trap unload EXIT

    unload
    # Wait for peers to release VRAM (they unload at the end of their own arm;
    # this covers a server that has not adopted the protocol yet).
    for attempt in $(seq 1 36); do
      busy=""
      for u in $PEER_URLS; do r="$(resident "$u")"; [ -n "$r" ] && busy="$busy $u:$r"; done
      [ -z "$busy" ] && break
      [ "$attempt" = 1 ] && echo "    waiting for foreign residency:$busy"
      sleep 5
    done
    [ -n "$busy" ] && echo "    WARNING: still resident after 180s:$busy"

    # Warm-up at the production context, so the first draft does not pay the
    # load. A 10-minute keep-alive holds it for the arm; the EXIT trap unloads.
    curl -s "$URL/api/generate" -d "{\"model\":\"$MODEL\",\"prompt\":\"ok\",\"stream\":false,\"options\":{\"num_ctx\":16384},\"keep_alive\":\"10m\"}" >/dev/null 2>&1 || true
    sleep 1
    curl -s "$URL/api/ps" > "$RESIDENCY"
    vram=$(jq -r ".models[]?|select(.name==\"$MODEL\")|.size_vram" "$RESIDENCY" 2>/dev/null || echo "")
    size=$(jq -r ".models[]?|select(.name==\"$MODEL\")|.size" "$RESIDENCY" 2>/dev/null || echo "")
    if [ -z "$vram" ] || [ "$vram" != "$size" ]; then
      if [ "${ALLOW_PARTIAL:-0}" = "1" ]; then
        echo "    PARTIAL OFFLOAD (size=$size size_vram=$vram) — measuring quality anyway, timing is not comparable"
        echo "partial" > "$OUT/partial-${LABEL}-${CORPUS_TAG}-i${I}.flag"
      else
        echo "    ABORT: $MODEL is not 100% in VRAM (size=$size size_vram=$vram). Not measuring."
        unload
        exit 3
      fi
    else
      echo "    residency OK: size=$size size_vram=$vram (100% GPU)"
    fi

    cd "$REPO"
    npm run eval -- --models "$MODEL" --runs "$RUNS" --corpus "$CORPUS" \
      --ollama-url "$URL" --out "$REPORT" ${EXTRA[*]:-} >"$OUT/arm-${LABEL}-${CORPUS_TAG}-i${I}.log" 2>&1
    status=$?
    curl -s "$URL/api/ps" > "$RESIDENCY"
    unload
    echo "    eval exit=$status"
    exit $status
  '
  rc=$?
  set -e
  if [ "$rc" = 3 ]; then echo "    aborted: model not fully offloaded; retry later"; continue; fi
  echo "--- headline:"
  grep -m1 -E "^\| $MODEL " "$REPORT" 2>/dev/null || echo "(no report row)"
done
echo "=== $LABEL $CORPUS_TAG done $(date +%H:%M:%S)"

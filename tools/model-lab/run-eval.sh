#!/usr/bin/env bash
# One eval arm, under the shared-GPU protocol.
#
# `npm run eval` takes a model name and talks to whatever Ollama it is pointed
# at. This wrapper adds the four things an honest arm needs on a card three
# agents share:
#
#   1. the GPU lock, so no two heavy jobs overlap;
#   2. `gpu-free.sh`, so the arm does not start while a sibling's model is
#      still resident (a CPU-offloaded arm measures contention, not the model);
#   3. a residency sampler for the whole arm, because a number is only usable
#      if the model was actually on the GPU while it was produced;
#   4. an explicit unload (`keep_alive: 0`) before the lock is released, so the
#      next agent starts from an idle card.
#
# The report's exit status is 1 when any fixture gated, which is the finding
# rather than an error, so this wrapper does not treat it as failure.
#
# Usage:
#   run-eval.sh --model <tag> --out <report.md> [--runs 3] [--corpus <dir>] [--label <text>]
set -euo pipefail

MODEL=""
OUT=""
RUNS=3
CORPUS=""
LABEL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --model) MODEL=$2; shift 2 ;;
    --out) OUT=$2; shift 2 ;;
    --runs) RUNS=$2; shift 2 ;;
    --corpus) CORPUS=$2; shift 2 ;;
    --label) LABEL=$2; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
[ -n "$MODEL" ] && [ -n "$OUT" ] || { echo "usage: run-eval.sh --model <tag> --out <report.md> [--runs 3] [--corpus dir]" >&2; exit 2; }

REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
LAB=${APUNTA_LAB_DIR:-$HOME/.local/share/apunta/model-lab}
OLLAMA_URL=${OLLAMA_URL:-http://127.0.0.1:11437}
mkdir -p "$LAB/eval"

flock /tmp/apunta-gpu.lock bash -euo pipefail -c '
MODEL="'"$MODEL"'"; OUT="'"$OUT"'"; RUNS="'"$RUNS"'"; CORPUS="'"$CORPUS"'"; LABEL="'"$LABEL"'"
REPO="'"$REPO"'"; LAB="'"$LAB"'"; OLLAMA_URL="'"$OLLAMA_URL"'"
cd "$REPO"
"$REPO/tools/model-lab/gpu-free.sh" 1800

SAMPLES="$LAB/eval/residency-$(date +%Y%m%d-%H%M%S).log"
(
  while :; do
    curl -s --max-time 2 "$OLLAMA_URL/api/ps" | jq -c --arg t "$(date +%s)" \
      "[.models[]? | {t: \$t, name: .name, size: .size, size_vram: .size_vram}]" >>"$SAMPLES" 2>/dev/null || true
    sleep 3
  done
) &
SAMPLER=$!
trap "kill $SAMPLER 2>/dev/null || true" EXIT

set +e
npm run eval -- --ollama-url "$OLLAMA_URL" --models "$MODEL" --runs "$RUNS" \
  ${CORPUS:+--corpus "$CORPUS"} --out "$OUT" >"$OUT.stdout" 2>"$OUT.stderr"
STATUS=$?
set -e

kill $SAMPLER 2>/dev/null || true
wait $SAMPLER 2>/dev/null || true

# Unload before releasing the lock.
curl -s "$OLLAMA_URL/api/generate" -d "{\"model\":\"$MODEL\",\"keep_alive\":0}" >/dev/null 2>&1 || true

echo "--- $LABEL $MODEL ($RUNS runs${CORPUS:+ on $CORPUS}) exit $STATUS"
python3 - "$SAMPLES" <<PY
import json, sys
rows = []
for line in open(sys.argv[1]):
    try:
        rows.extend(json.loads(line))
    except Exception:
        pass
rows = [r for r in rows if r.get("size")]
if not rows:
    print("residency: no samples with a resident model")
else:
    full = [r for r in rows if r["size_vram"] == r["size"]]
    print(f"residency: {len(full)}/{len(rows)} samples fully in VRAM "
          f"(min vram/size {min(r[\"size_vram\"]/r[\"size\"] for r in rows):.2f}, "
          f"max {max(r[\"size_vram\"]/r[\"size\"] for r in rows):.2f})")
PY
exit 0
'

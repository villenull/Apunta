#!/usr/bin/env bash
# The consented run, end to end: export → pairs → filter → train → merge →
# import → held-out metrics.
#
# This is the script that would run on the therapist's own material, and it is
# the only place in the lab that touches it. It is written so that the person
# running it — and the agent that wrote it — reads numbers and never notes:
#
#   * every stage prints counts, rates, times and reasons, never text;
#   * the dataset, the adapter and the merged weights are written under
#     `~/.local/share/apunta/model-lab/` (mode 0600 for the dataset), never in
#     the repository and never anywhere else;
#   * nothing is uploaded, and nothing leaves the machine;
#   * `--i-have-consent` is required, and the pair builder re-checks it.
#
# Usage:
#   tools/model-lab/pipeline/run-consented.sh \
#     --export ~/apunta-migration/<export.zip|folder> --i-have-consent
set -euo pipefail

EXPORT=""
CONSENT=""
EPOCHS=2
while [ $# -gt 0 ]; do
  case "$1" in
    --export) EXPORT=$2; shift 2 ;;
    --epochs) EPOCHS=$2; shift 2 ;;
    --i-have-consent) CONSENT=--i-have-consent; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
LAB=${APUNTA_LAB_DIR:-$HOME/.local/share/apunta/model-lab}
OLLAMA_URL=${OLLAMA_URL:-http://127.0.0.1:11437}
TAG=${TAG:-apunta-lab-real-lora}

if [ -z "$CONSENT" ]; then
  echo "refusing to run: this reads the therapist's own export. Pass --i-have-consent," >&2
  echo "and only when this run is the one her recorded agreement covers (docs/decisions.md)." >&2
  exit 3
fi
[ -n "$EXPORT" ] || { echo "--export is required" >&2; exit 2; }

# Defence in depth: the pair builder checks this too, but nothing downstream
# should even start if the export path is inside the repository.
case "$(readlink -f "$EXPORT")" in
  "$REPO"|"$REPO"/*) echo "refusing to read an export inside the repository: $EXPORT" >&2; exit 3 ;;
esac

mkdir -p "$LAB/datasets" "$LAB/adapters" "$LAB/merged" "$LAB/eval"
STAMP=$(date +%Y%m%d-%H%M%S)
DATASET="$LAB/datasets/real-$STAMP.jsonl"
ADAPTER="$LAB/adapters/real-$STAMP"
MERGED="$LAB/merged/real-$STAMP"
METRICS="$LAB/eval/heldout-$STAMP.json"

echo "== 1/5 build pairs (metrics only)"
npx tsx "$REPO/tools/model-lab/pipeline/build-pairs.ts" \
  --export "$EXPORT" --out "$DATASET" "$CONSENT"

echo "== 2/5 train LoRA on the shared GPU"
flock /tmp/apunta-gpu.lock bash -euo pipefail -c '
  "$0/tools/model-lab/gpu-free.sh" 1800
  "$0/tools/model-lab/.venv/bin/python" "$0/tools/model-lab/train_lora.py" \
    --data "'"$DATASET"'" --out "'"$ADAPTER"'" --epochs '"$EPOCHS"'
' "$REPO"

echo "== 3/5 merge the adapter into the base weights"
"$REPO/tools/model-lab/.venv/bin/python" "$REPO/tools/model-lab/merge_adapter.py" \
  --adapter "$ADAPTER" --out "$MERGED"

echo "== 4/5 import into the lab's Ollama"
"$REPO/tools/model-lab/import-ollama.sh" "$MERGED" "$TAG"

echo "== 5/5 held-out metrics (no text printed)"
npx tsx "$REPO/tools/model-lab/pipeline/evaluate-heldout.ts" \
  --data "$DATASET" --model "$TAG" --ollama-url "$OLLAMA_URL" --out "$METRICS"

echo
echo "artifacts (never committed, never uploaded):"
echo "  dataset  $DATASET (0600)"
echo "  adapter  $ADAPTER"
echo "  merged   $MERGED"
echo "  metrics  $METRICS"
echo "report these numbers to the therapist; the text stays on this machine."

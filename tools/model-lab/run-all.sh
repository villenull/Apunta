#!/usr/bin/env bash
# Run the scout's whole arm list sequentially, one arm at a time, each under
# the residency protocol in run-arm.sh. Safe to re-run: an arm whose report
# already exists for every invocation is skipped.
#
#   bash tools/model-lab/run-all.sh [--soap-only|--owner-only] [--neutral]
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="/tmp/apunta-smarter-scout"
OUT="/tmp/smarter-scout"
cd "$REPO"

MODE="${1:-both}"
CONTROL="qwen3.5:4b-q4_K_M"

# label:model — most promising first, so a GPU-time shortfall hits the weakest
# candidate rather than the strongest. gpt-oss:20b is deliberately absent: it
# cannot produce a note through the shipped provider (report §5), so there is
# nothing to measure.
CANDIDATES=(
  "gemma4-12b:gemma4:12b"
  "granite42-8b:granite4.2:8b"
  "lfm25-8b:lfm2.5:8b"
  "qwen35-9b:qwen3.5:9b"
  "granite41-8b:granite4.1:8b"
  "medgemma-4b:medgemma:4b"
)

run_one() { # label model corpus invocations runs [instructions] [allow_partial]
  local label="$1" model="$2" corpus="$3" inv="$4" runs="$5" instr="${6:-}" partial="${7:-0}"
  local tag; tag="$(basename "$corpus")"
  local missing=0
  for i in $(seq 1 "$inv"); do
    [ -f "$OUT/arm-${label}-${tag}-i${i}.md" ] || missing=1
  done
  if [ "$missing" = 0 ]; then echo "### skip $label $tag (complete)"; return 0; fi
  echo "### $label $tag $(date +%H:%M:%S)"
  ALLOW_PARTIAL="$partial" bash "$HERE/run-arm.sh" "$label" "$model" "$corpus" "$inv" "$runs" "$instr"
}

if [ "$MODE" = "--neutral" ]; then
  NEUTRAL="$HERE/neutral-instructions.txt"
  for spec in "gptoss20b:$CONTROL" "gemma4-12b:$CONTROL"; do :; done
  # Neutral arms are launched explicitly by the report's top-2 decision, not here.
  echo "neutral mode is driven manually; see the report"; exit 0
fi

if [ "$MODE" != "--owner-only" ]; then
  run_one 4b-control "$CONTROL" e2e/fixtures/eval 3 3
  for spec in "${CANDIDATES[@]}"; do
    label="${spec%%:*}"; model="${spec#*:}"
    run_one "$label" "$model" e2e/fixtures/eval 3 3
  done
fi

if [ "$MODE" != "--soap-only" ]; then
  run_one 4b-control "$CONTROL" e2e/fixtures/eval-owner 3 5
  for spec in "${CANDIDATES[@]}"; do
    label="${spec%%:*}"; model="${spec#*:}"
    run_one "$label" "$model" e2e/fixtures/eval-owner 3 5
  done
fi

echo "### all arms done $(date +%H:%M:%S)"

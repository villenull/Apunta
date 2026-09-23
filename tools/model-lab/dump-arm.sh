#!/usr/bin/env bash
# Dump the generated notes for a hand audit, through the same generation path
# `npm run eval` uses. Inside the GPU lock, with the same residency protocol as
# run-arm.sh, because a note generated while another model holds VRAM is still
# a valid note — but a note generated while *this* model is partly on CPU is
# the same weights, so it is fine; the lock is kept only so the timing-free
# dump cannot perturb a peer's timing arm.
#
#   dump-arm.sh <label> <model> <corpus> <fixture-substring> [more...]
set -uo pipefail

LABEL="$1"; MODEL="$2"; CORPUS="$3"; shift 3
URL="${APUNTA_SCOUT_OLLAMA:-http://127.0.0.1:11438}"
OUT="/tmp/smarter-scout"
REPO="/tmp/apunta-smarter-scout"
mkdir -p "$OUT/notes"

for fixture in "$@"; do
  echo "=== $LABEL $fixture $(date +%H:%M:%S)"
  flock /tmp/apunta-gpu.lock bash -c "
    set -uo pipefail
    curl -s '$URL/api/generate' -d '{\"model\":\"$MODEL\",\"prompt\":\"ok\",\"stream\":false,\"options\":{\"num_ctx\":16384},\"keep_alive\":\"10m\"}' >/dev/null 2>&1
    cd '$REPO'
    npx tsx tools/model-lab/dump-note.mts --model '$MODEL' --corpus '$CORPUS' --fixture '$fixture' --url '$URL' \
      > '$OUT/notes/${LABEL}-${fixture}.json' 2>'$OUT/notes/${LABEL}-${fixture}.err'
    curl -s '$URL/api/generate' -d '{\"model\":\"$MODEL\",\"keep_alive\":0}' >/dev/null 2>&1
  "
done
echo "=== $LABEL dump done $(date +%H:%M:%S)"

#!/usr/bin/env bash
# Wait until the shared GPU is actually idle before an arm starts.
#
# `flock` serializes commands, not residency: a sibling's model stays in VRAM
# after its command exits (Ollama's keep_alive), and an arm that loads while it
# is there gets a CPU-offloaded model and a meaningless number. So every arm in
# this lab waits here first, inside its lock hold.
#
# Port 11434 is the therapist's own Ollama: a model resident there is her real
# use, so this waits for it too and never evicts it.
#
# Usage: gpu-free.sh [timeout-seconds]
set -euo pipefail

TIMEOUT=${1:-900}
started=$SECONDS
while :; do
  busy=""
  for port in ${APUNTA_GPU_PORTS:-11434 11440 11441 11442 11443}; do
    names=$(curl -s --max-time 2 "http://127.0.0.1:$port/api/ps" 2>/dev/null | jq -r '.models[]?.name' 2>/dev/null | paste -sd, - || true)
    if [ -n "${names:-}" ]; then busy="$busy ${port}:${names}"; fi
  done
  if [ -z "$busy" ]; then
    echo "gpu-free: idle after $((SECONDS - started))s"
    exit 0
  fi
  if [ $((SECONDS - started)) -ge "$TIMEOUT" ]; then
    echo "gpu-free: still busy after ${TIMEOUT}s:${busy}" >&2
    exit 1
  fi
  sleep 10
done

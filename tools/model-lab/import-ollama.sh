#!/usr/bin/env bash
# Import a merged HF model into the lab's own Ollama as a GGUF, with the
# production model's own renderer, parser and parameters.
#
# Why this and not llama.cpp: `llama.cpp`'s `convert_hf_to_gguf.py` has no
# Qwen3.5 converter (checked at HEAD, 2026-09-23 — zero mentions of the
# architecture), while the Ollama binary in use ships the model, its renderer
# and its parser, and can build a GGUF from safetensors itself with
# `ollama create -q q4_K_M`. Using it also means the quantizer, the template
# and the sampling parameters are the same ones the shipped model was made
# with, so a difference in the eval is a difference in weights.
#
# Usage: import-ollama.sh <merged-dir> <tag> [renderer] [parser] [quantize]
set -euo pipefail

MERGED=${1:?usage: import-ollama.sh <merged-dir> <tag> [renderer] [parser] [quantize]}
TAG=${2:?usage: import-ollama.sh <merged-dir> <tag> [renderer] [parser] [quantize]}
RENDERER=${3:-qwen3.5}
PARSER=${4:-$RENDERER}
QUANTIZE=${5:-q4_K_M}
LAB=${APUNTA_LAB_DIR:-$HOME/.local/share/apunta/model-lab}
OLLAMA_URL=${OLLAMA_URL:-http://127.0.0.1:11437}

if [ ! -f "$MERGED/config.json" ]; then
  echo "no config.json in $MERGED" >&2
  exit 1
fi

MODELFILE=$(mktemp "$LAB/work/modelfile-XXXXXX")
trap 'rm -f "$MODELFILE"' EXIT
cat >"$MODELFILE" <<EOF
FROM $MERGED
TEMPLATE {{ .Prompt }}
RENDERER $RENDERER
PARSER $PARSER
PARAMETER presence_penalty 1.5
PARAMETER temperature 1
PARAMETER top_k 20
PARAMETER top_p 0.95
EOF

# The conversion and quantization both run on the GPU, and the shared card is
# the reason every heavy step in this lab is serialized. Keep the model fully
# resident for conversion, then unload it before releasing the lock.
flock /tmp/apunta-gpu.lock bash -euo pipefail -c '
  export APUNTA_GPU_PORTS="${APUNTA_GPU_PORTS:-11434 11440 11441 11442 11443}"
  OLLAMA_HOST="'"$OLLAMA_URL"'" ollama create "'"$TAG"'" --force -q "'"$QUANTIZE"'" -f "'"$MODELFILE"'"
  OLLAMA_HOST="'"$OLLAMA_URL"'" ollama show "'"$TAG"'" | sed -n "1,20p"
  curl -sS "'"$OLLAMA_URL"'/api/generate" -d "{\"model\":\"'"$TAG"'\",\"keep_alive\":0}" >/dev/null
'

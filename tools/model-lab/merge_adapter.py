#!/usr/bin/env python3
"""Merge a LoRA adapter into its base weights, ready for GGUF conversion.

The app runs GGUF through Ollama, so an adapter that only exists as a PEFT
directory is not a candidate — it has to become a model the app can load. This
is the first half of that: base + adapter → one set of safetensors in bf16,
which `ollama create -q q4_K_M` then converts and quantizes exactly the way
the shipped model was made.

Usage:
    .venv/bin/python tools/model-lab/merge_adapter.py \
        --base Qwen/Qwen3.5-4B \
        --adapter ~/.local/share/apunta/model-lab/adapters/synth-lora \
        --out ~/.local/share/apunta/model-lab/merged/synth-lora
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch
from peft import PeftModel
from transformers import AutoModelForImageTextToText, AutoTokenizer


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="Qwen/Qwen3.5-4B")
    parser.add_argument("--adapter", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    model = AutoModelForImageTextToText.from_pretrained(args.base, dtype=torch.bfloat16)
    model = PeftModel.from_pretrained(model, args.adapter)
    model = model.merge_and_unload()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(out, safe_serialization=True)
    AutoTokenizer.from_pretrained(args.base).save_pretrained(out)
    total = sum(parameter.numel() for parameter in model.parameters())
    (out / "merge.json").write_text(
        json.dumps({"base": args.base, "adapter": args.adapter, "parameters": total}, indent=2),
        encoding="utf-8",
    )
    print(f"merged {total / 1e9:.2f}B parameters into {out}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Where does the NaN come from? One GPU session, no training.

The first training probe came back with `holdout_loss: NaN`, and the batched
loss is NaN too, so this walks the forward pass and prints where the first
non-finite value appears. It also exercises the model's own linear-attention
fallback (`torch_chunk_gated_delta_rule`) directly, because that path does a
triangular solve in the model's dtype and a bf16 solve is the obvious suspect
on a backend nobody has tuned.

Usage: .venv/bin/python tools/model-lab/diagnose_nan.py --data <jsonl>
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")

import torch  # noqa: E402
import torch.nn.functional as F  # noqa: E402
from transformers import AutoModelForImageTextToText, AutoTokenizer  # noqa: E402
from transformers.models.qwen3_5 import modeling_qwen3_5  # noqa: E402


def finite(name: str, tensor: torch.Tensor) -> bool:
    bad = int((~torch.isfinite(tensor)).sum())
    print(f"  {name}: shape {tuple(tensor.shape)} dtype {tensor.dtype} non-finite {bad}", flush=True)
    return bad == 0


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", required=True)
    parser.add_argument("--base", default="Qwen/Qwen3.5-4B")
    args = parser.parse_args()

    device = torch.device("cuda:0")
    tokenizer = AutoTokenizer.from_pretrained(args.base)
    rows = [
        json.loads(line)
        for line in Path(args.data).read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    row = rows[0]
    prompt_text = tokenizer.apply_chat_template(
        [
            {"role": "system", "content": row["system"]},
            {"role": "user", "content": row["user"]},
        ],
        tokenize=False,
        add_generation_prompt=True,
        enable_thinking=False,
    )
    prompt_ids = tokenizer(prompt_text, add_special_tokens=False)["input_ids"]
    target_ids = tokenizer(row["target"], add_special_tokens=False)["input_ids"]
    print(f"prompt {len(prompt_ids)} tokens, target {len(target_ids)} tokens", flush=True)

    model = AutoModelForImageTextToText.from_pretrained(args.base, dtype=torch.bfloat16)
    model.eval()
    model.to(device)

    def probe(label: str, prompt: list[int], target: list[int]) -> None:
        ids = torch.tensor([[*prompt, *target]], dtype=torch.long, device=device)
        print(f"{label}: total {ids.shape[1]} tokens", flush=True)
        with torch.no_grad():
            embeddings = model.get_input_embeddings()(ids)
            finite("embeddings", embeddings)
            outputs = model(input_ids=ids, logits_to_keep=len(target) + 1)
            finite("logits", outputs.logits)
            logits = outputs.logits[:, :-1, :].float()
            wanted = torch.tensor([target], dtype=torch.long, device=device)
            loss = F.cross_entropy(logits.reshape(-1, logits.shape[-1]), wanted.reshape(-1))
            print(f"  loss {float(loss)}", flush=True)

    probe("full example", prompt_ids, target_ids)
    probe("short prefix", prompt_ids[:200], target_ids[:20])

    print("chunk_gated_delta_rule fallback, synthetic inputs", flush=True)
    for dtype in (torch.float32, torch.bfloat16):
        torch.manual_seed(0)
        batch, heads, length, key_dim, value_dim = 1, 32, 512, 128, 128
        query = torch.randn(batch, heads, length, key_dim, dtype=dtype, device=device)
        key = torch.randn(batch, heads, length, key_dim, dtype=dtype, device=device)
        value = torch.randn(batch, heads, length, value_dim, dtype=dtype, device=device)
        g = -torch.rand(batch, heads, length, dtype=dtype, device=device)
        beta = torch.rand(batch, heads, length, dtype=dtype, device=device)
        try:
            out, _ = modeling_qwen3_5.torch_chunk_gated_delta_rule(
                query, key, value, g=g, beta=beta, use_qk_l2norm_in_kernel=True
            )
            finite(f"delta rule out ({dtype})", out)
        except Exception as error:  # noqa: BLE001
            print(f"  delta rule ({dtype}) raised: {type(error).__name__}: {error}", flush=True)


if __name__ == "__main__":
    main()

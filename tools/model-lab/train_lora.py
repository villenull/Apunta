#!/usr/bin/env python3
"""LoRA-train a note-drafting model on (prompt → note) pairs, on this GPU.

Deliberately small and explicit rather than a framework call: the point of the
exercise is to know exactly what was trained, on what text, for how long, and
what it cost. `trl`'s SFTTrainer would hide all four.

What it trains on: a JSONL of `{system, user, target}` — the production prompt
(assembled by the app's own builder) and the note that should come back. The
loss is computed on the assistant turn only; the prompt tokens are masked, so
the adapter learns to write the note and not to reproduce the instructions.

Two things about this hardware shaped the implementation, both measured on the
RX 9070 XT on 2026-09-23:

* **The LM head is applied to the target tokens only.** Handing `labels` to the
  model asks for a logits tensor over every position — 3.7k positions times a
  151k vocabulary is a 3 GB allocation on a 16 GB card, and it OOMs. The
  sequence is prompt-then-answer, so the answer is a suffix: `logits_to_keep`
  projects the head over exactly those positions.
* **Examples are batched by length.** Qwen3.5 is a hybrid: three of every four
  layers are linear attention, and transformers' fallback implementation runs a
  *sequential Python loop over 64-token chunks* (`torch_chunk_gated_delta_rule`,
  ~56 iterations per layer, ~1,340 kernel launches per forward at a 3.6k-token
  sequence). That is latency-bound, so batch-1 training wastes the card: at
  batch 4 the same launches do four examples' work. Batches are formed from
  examples of similar length so the padding is small, prompts are left-padded
  and targets right-padded with an attention mask, and the mask is numerically
  equivalent here because the model's own causal convolution zero-pads its left
  edge anyway (`causal_conv1d_fn`).

Usage:
    .venv/bin/python tools/model-lab/train_lora.py \
        --data ~/.local/share/apunta/model-lab/datasets/synth-400.jsonl \
        --base Qwen/Qwen3.5-4B \
        --out ~/.local/share/apunta/model-lab/adapters/synth-lora \
        --epochs 2 --rank 16 --lr 1e-4

`--max-steps N` stops after N optimizer steps: that is the timing probe used to
size a real run against the shared GPU's ~30-minute lock window.
`--verify-batching` checks the batched loss against the single-example loss
before training starts, and refuses to continue if they disagree.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import time
from pathlib import Path

os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
os.environ.setdefault("HF_HUB_DISABLE_IMPLICIT_TOKEN", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

import torch  # noqa: E402
import torch.nn.functional as F  # noqa: E402
from peft import LoraConfig, get_peft_model  # noqa: E402
from transformers import AutoModelForImageTextToText, AutoTokenizer  # noqa: E402

PAD = -100


def read_pairs(path: Path) -> list[dict]:
    rows = []
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                rows.append(json.loads(line))
    return rows


def holdout_index(identifier: str, percent: int) -> bool:
    digest = hashlib.sha256(identifier.encode("utf-8")).digest()
    return digest[0] % 100 < percent


def encode(tokenizer, row: dict, max_length: int) -> dict | None:
    """Prompt ids and target ids, separately. None when the pair does not fit."""
    prompt_text = tokenizer.apply_chat_template(
        [
            {"role": "system", "content": row["system"]},
            {"role": "user", "content": row["user"]},
        ],
        tokenize=False,
        add_generation_prompt=True,
        # Production sends `think: false` to a thinking-capable model, which
        # renders the empty think block before the answer. Training on a prompt
        # without it would train a different prompt than the app sends.
        enable_thinking=False,
    )
    prompt_ids = tokenizer(prompt_text, add_special_tokens=False)["input_ids"]
    target_ids = tokenizer(row["target"], add_special_tokens=False)["input_ids"]
    if tokenizer.eos_token_id is not None:
        target_ids = [*target_ids, tokenizer.eos_token_id]
    if len(prompt_ids) + len(target_ids) > max_length:
        return None
    return {"prompt": prompt_ids, "target": target_ids}


def make_batches(encoded: list[dict], batch_size: int, batch_tokens: int) -> list[list[dict]]:
    """Batches of similar length: sort by prompt length, then fill greedily.

    Sorting is the whole trick — a batch pays for its longest prompt, so
    grouping by length keeps the padding a few percent instead of a few
    hundred.
    """
    ordered = sorted(encoded, key=lambda item: len(item["prompt"]))
    batches: list[list[dict]] = []
    current: list[dict] = []
    for item in ordered:
        candidate = [*current, item]
        longest = max(len(entry["prompt"]) for entry in candidate)
        longest_target = max(len(entry["target"]) for entry in candidate)
        cost = len(candidate) * (longest + longest_target)
        if current and (len(candidate) > batch_size or cost > batch_tokens):
            batches.append(current)
            current = [item]
        else:
            current = candidate
    if current:
        batches.append(current)
    return batches


def collate(batch: list[dict], pad_token_id: int) -> dict:
    """Left-pad prompts, right-pad targets, mask everything that is padding."""
    prompt_len = max(len(item["prompt"]) for item in batch)
    target_len = max(len(item["target"]) for item in batch)
    input_ids, labels, attention = [], [], []
    for item in batch:
        left = prompt_len - len(item["prompt"])
        right = target_len - len(item["target"])
        input_ids.append([pad_token_id] * left + item["prompt"] + item["target"] + [pad_token_id] * right)
        labels.append([PAD] * prompt_len + item["target"] + [PAD] * right)
        attention.append([0] * left + [1] * (prompt_len - left) + [1] * len(item["target"]) + [0] * right)
    return {
        "input_ids": torch.tensor(input_ids, dtype=torch.long),
        "labels": torch.tensor(labels, dtype=torch.long),
        "attention_mask": torch.tensor(attention, dtype=torch.long),
        "prompt_len": prompt_len,
        "target_len": target_len,
    }


def batch_loss(model, batch: dict, device: torch.device) -> torch.Tensor:
    """Cross-entropy on the answer only, with the LM head over the answer only."""
    prompt_len = batch["prompt_len"]
    target_len = batch["target_len"]
    outputs = model(
        input_ids=batch["input_ids"].to(device),
        attention_mask=batch["attention_mask"].to(device),
        logits_to_keep=target_len + 1,
    )
    # logits_to_keep keeps the last target_len + 1 positions: the one before the
    # answer, then the answer. Dropping the last gives the predictions for every
    # answer token, which is the same shift the model's own loss would do.
    logits = outputs.logits[:, :-1, :]
    wanted = batch["labels"][:, prompt_len:].to(device)
    return F.cross_entropy(logits.reshape(-1, logits.shape[-1]).float(), wanted.reshape(-1), ignore_index=PAD)


def apply_numerics_workaround(mode: str) -> None:
    """Keep the hybrid model's linear attention finite in bf16 on ROCm.

    Measured 2026-09-23: the first forward pass on this card came back with
    `logits` containing non-finite values, which makes the loss NaN and the
    adapter garbage. The suspect is the fallback linear-attention path
    (`torch_chunk_gated_delta_rule`), which solves a 64x64 triangular system in
    the model's own dtype; a bf16 triangular solve is exactly the kind of kernel
    a backend nobody has tuned for this architecture gets wrong. `solve` upcasts
    only those small matrices, so it costs almost nothing. `rule` upcasts the
    whole delta-rule computation, which is the heavier fallback if the first is
    not enough. `none` leaves the model as shipped.
    """
    if mode == "none":
        return
    import transformers.models.qwen3_5.modeling_qwen3_5 as qwen

    original_solve = torch.linalg.solve_triangular

    def solve_in_float32(matrix: torch.Tensor, rhs: torch.Tensor, **kwargs: object) -> torch.Tensor:
        if matrix.dtype in (torch.bfloat16, torch.float16):
            return original_solve(matrix.float(), rhs.float(), **kwargs).to(matrix.dtype)
        return original_solve(matrix, rhs, **kwargs)

    torch.linalg.solve_triangular = solve_in_float32
    print(f"numerics workaround: triangular solve upcast to float32 (mode {mode})", flush=True)

    if mode != "rule":
        return
    original_rule = qwen.torch_chunk_gated_delta_rule

    def rule_in_float32(*args: object, **kwargs: object) -> object:
        cast = [a.float() if torch.is_tensor(a) and a.is_floating_point() else a for a in args]
        out, state = original_rule(*cast, **kwargs)
        dtype = args[0].dtype if torch.is_tensor(args[0]) else torch.bfloat16
        return out.to(dtype), state

    qwen.torch_chunk_gated_delta_rule = rule_in_float32
    print("numerics workaround: whole delta rule upcast to float32", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", required=True)
    parser.add_argument("--base", default="Qwen/Qwen3.5-4B")
    parser.add_argument("--out", required=True)
    parser.add_argument("--epochs", type=float, default=2.0)
    parser.add_argument("--rank", type=int, default=16)
    parser.add_argument("--alpha", type=int, default=32)
    parser.add_argument("--dropout", type=float, default=0.05)
    parser.add_argument("--lr", type=float, default=1e-4)
    parser.add_argument("--warmup", type=int, default=10)
    parser.add_argument("--grad-accum", type=int, default=2)
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--batch-tokens", type=int, default=14_000)
    parser.add_argument("--max-length", type=int, default=6144)
    parser.add_argument("--holdout-percent", type=int, default=10)
    parser.add_argument("--max-steps", type=int, default=0, help="0 = the whole schedule")
    parser.add_argument("--seed", type=int, default=17)
    parser.add_argument("--log-every", type=int, default=5)
    parser.add_argument("--verify-batching", action="store_true")
    parser.add_argument("--check-grads", action="store_true", help="report non-finite gradients once")
    parser.add_argument(
        "--numerics",
        choices=["solve", "rule", "none"],
        default="solve",
        help="how far to upcast the linear-attention fallback (see apply_numerics_workaround)",
    )
    args = parser.parse_args()
    apply_numerics_workaround(args.numerics)

    torch.manual_seed(args.seed)
    if not torch.cuda.is_available():
        raise SystemExit("no GPU visible to torch: refusing to train on the CPU")
    device = torch.device("cuda:0")
    free, total = torch.cuda.mem_get_info()
    print(
        f"device: {torch.cuda.get_device_name(0)} torch {torch.__version__} "
        f"free {free / 1024**3:.1f} of {total / 1024**3:.1f} GiB",
        flush=True,
    )

    tokenizer = AutoTokenizer.from_pretrained(args.base)
    model = AutoModelForImageTextToText.from_pretrained(args.base, dtype=torch.bfloat16)
    # The vision tower is dead weight for a text-only job and costs VRAM.
    for holder in (model, getattr(model, "model", None)):
        visual = getattr(holder, "visual", None) if holder is not None else None
        if visual is not None:
            setattr(holder, "visual", None)
            del visual
    model.config.use_cache = False
    model.gradient_checkpointing_enable(gradient_checkpointing_kwargs={"use_reentrant": False})
    model.to(device)

    lora = LoraConfig(
        r=args.rank,
        lora_alpha=args.alpha,
        lora_dropout=args.dropout,
        bias="none",
        task_type="CAUSAL_LM",
        target_modules="all-linear",
    )
    model = get_peft_model(model, lora)
    model.print_trainable_parameters()

    rows = read_pairs(Path(args.data))
    train_rows = [row for row in rows if not holdout_index(row["id"], args.holdout_percent)]
    holdout_rows = [row for row in rows if holdout_index(row["id"], args.holdout_percent)]

    def encode_all(source: list[dict]) -> list[dict]:
        encoded = []
        skipped = 0
        for row in source:
            item = encode(tokenizer, row, args.max_length)
            if item is None:
                skipped += 1
                continue
            encoded.append(item)
        if skipped:
            print(f"skipped {skipped} examples over {args.max_length} tokens", flush=True)
        return encoded

    train = encode_all(train_rows)
    holdout = encode_all(holdout_rows)
    prompts = [len(item["prompt"]) for item in train]
    pad_token_id = tokenizer.pad_token_id if tokenizer.pad_token_id is not None else 0
    print(
        f"pairs: {len(train)} train / {len(holdout)} held out; "
        f"prompt tokens mean {sum(prompts) // max(1, len(prompts))} max {max(prompts, default=0)}; "
        f"pad token {pad_token_id}",
        flush=True,
    )

    batches = make_batches(train, args.batch_size, args.batch_tokens)
    examples_per_step = args.batch_size * args.grad_accum
    steps_per_epoch = max(1, math.ceil(len(train) / examples_per_step))
    total_steps = max(1, int(steps_per_epoch * args.epochs))
    if args.max_steps:
        total_steps = min(total_steps, args.max_steps)
    print(
        f"batches: {len(batches)} (batch size {args.batch_size}, {args.batch_tokens} token cap); "
        f"{examples_per_step} examples/step; {total_steps} steps",
        flush=True,
    )

    if args.verify_batching:
        checks = []
        for item in train[:4]:
            single = collate([item], pad_token_id)
            model.eval()
            with torch.no_grad():
                alone = float(batch_loss(model, single, device))
            checks.append(alone)
        group = collate(train[:4], pad_token_id)
        model.eval()
        with torch.no_grad():
            together = float(batch_loss(model, group, device))
        mean_alone = sum(checks) / len(checks)
        relative = abs(together - mean_alone) / mean_alone
        print(
            f"verify batching: single-example mean loss {mean_alone:.5f}, batched {together:.5f}, "
            f"relative difference {relative:.5f}",
            flush=True,
        )
        if relative > 0.05:
            raise SystemExit("batched loss disagrees with the single-example loss; refusing to train")
        del group, single

    params = [p for p in model.parameters() if p.requires_grad]
    optimizer = torch.optim.AdamW(params, lr=args.lr, betas=(0.9, 0.999), weight_decay=0.0)

    def lr_at(step: int) -> float:
        if step < args.warmup:
            return args.lr * (step + 1) / args.warmup
        progress = (step - args.warmup) / max(1, total_steps - args.warmup)
        return args.lr * 0.5 * (1.0 + math.cos(math.pi * min(1.0, progress)))

    model.train()
    history: list[dict] = []
    started = time.time()
    torch.cuda.reset_peak_memory_stats()
    step = 0
    micro = 0
    running = 0.0
    running_count = 0
    epoch = 0.0
    while step < total_steps:
        epoch += 1.0 / steps_per_epoch
        for group_items in batches:
            loss = batch_loss(model, collate(group_items, pad_token_id), device) / args.grad_accum
            loss.backward()
            running += float(loss.detach()) * args.grad_accum
            running_count += 1
            micro += 1
            if args.check_grads and micro == 1:
                bad = [
                    name
                    for name, parameter in model.named_parameters()
                    if parameter.requires_grad
                    and parameter.grad is not None
                    and not bool(torch.isfinite(parameter.grad).all())
                ]
                print(
                    f"  gradient check at micro-batch 1: loss finite {bool(torch.isfinite(loss).all())}, "
                    f"non-finite gradient tensors {len(bad)} {bad[:3]}",
                    flush=True,
                )
            if micro % args.grad_accum != 0:
                continue
            for group in optimizer.param_groups:
                group["lr"] = lr_at(step)
            optimizer.step()
            optimizer.zero_grad(set_to_none=True)
            step += 1
            if step % args.log_every == 0 or step == total_steps:
                elapsed = time.time() - started
                record = {
                    "step": step,
                    "epoch": round(epoch, 3),
                    "loss": round(running / max(1, running_count), 5),
                    "lr": round(lr_at(step), 8),
                    "elapsed_s": round(elapsed, 1),
                    "seconds_per_step": round(elapsed / step, 2),
                    "peak_vram_gb": round(torch.cuda.max_memory_allocated() / 1024**3, 2),
                }
                history.append(record)
                print(
                    f"step {step}/{total_steps} epoch {record['epoch']} loss {record['loss']} "
                    f"lr {record['lr']:.2e} {record['elapsed_s']}s "
                    f"({record['seconds_per_step']}s/step) vram {record['peak_vram_gb']}GB",
                    flush=True,
                )
                running = 0.0
                running_count = 0
            if step >= total_steps:
                break

    train_seconds = time.time() - started

    model.eval()
    holdout_loss = None
    if holdout:
        with torch.no_grad():
            total = 0.0
            holdout_batches = make_batches(holdout, args.batch_size, args.batch_tokens)
            for group_items in holdout_batches:
                total += float(batch_loss(model, collate(group_items, pad_token_id), device))
            holdout_loss = total / max(1, len(holdout_batches))
        print(f"held-out loss: {holdout_loss:.5f}", flush=True)
        if not math.isfinite(holdout_loss):
            # A non-finite held-out loss means the weights did not survive
            # training; there is no adapter worth merging.
            raise SystemExit(2)

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(out)
    tokenizer.save_pretrained(out)
    metrics = {
        "base": args.base,
        "data": args.data,
        "pairs_train": len(train),
        "pairs_holdout": len(holdout),
        "epochs": args.epochs,
        "total_steps": total_steps,
        "batch_size": args.batch_size,
        "batch_tokens": args.batch_tokens,
        "grad_accum": args.grad_accum,
        "examples_per_step": examples_per_step,
        "rank": args.rank,
        "alpha": args.alpha,
        "lr": args.lr,
        "max_length": args.max_length,
        "max_steps_cap": args.max_steps,
        "train_seconds": round(train_seconds, 1),
        "seconds_per_step": round(train_seconds / max(1, total_steps), 3),
        "examples_seen": min(len(train) * int(math.ceil(args.epochs)), total_steps * examples_per_step),
        "peak_vram_gb": round(torch.cuda.max_memory_allocated() / 1024**3, 2),
        "device": torch.cuda.get_device_name(0),
        "torch": torch.__version__,
        "numerics": args.numerics,
        "holdout_loss": None if holdout_loss is None else round(holdout_loss, 5),
        "history": history,
    }
    (out / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(json.dumps({key: value for key, value in metrics.items() if key != "history"}, indent=2), flush=True)


if __name__ == "__main__":
    main()

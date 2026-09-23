#!/usr/bin/env python3
"""Check the batching and loss arithmetic without a GPU.

The training loss is computed by hand (the model's own loss asks for a logits
tensor over every position, which does not fit on this card), so the shift, the
padding and the `logits_to_keep` slice are all mine to get wrong — and getting
them wrong would show up only as a quietly bad adapter. This pins them against
a stub model whose logits are a known function of its input, so the correct loss
is computable by hand:

* a batch of examples must give the mean of the per-example losses (padding is
  masked, so batching must not change the answer);
* the loss of a perfectly predicted target must be zero;
* the loss of a target shifted by one token must be large.

Run: .venv/bin/python tools/model-lab/tests/test_batching.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch
import torch.nn.functional as F

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from train_lora import PAD, batch_loss, collate  # noqa: E402

VOCAB = 64


class StubOutput:
    def __init__(self, logits: torch.Tensor) -> None:
        self.logits = logits


class NextTokenOracle:
    """Logits at position `t` name the token at `t + 1`, whatever it is.

    Any target is therefore predicted perfectly (it is in the sequence), which
    is what makes it the right stub for the batching questions: left-padding
    shifts positions, and this stub must not care, exactly as a real model's
    prediction of the next token does not depend on where the sequence starts.
    """

    def __init__(self) -> None:
        self.seen: list[torch.Tensor] = []

    def __call__(self, *, input_ids: torch.Tensor, attention_mask: torch.Tensor, logits_to_keep: int):
        self.seen.append(input_ids.clone())
        lookahead = torch.cat([input_ids[:, 1:], input_ids[:, -1:]], dim=1)
        logits = F.one_hot(lookahead.clamp(min=0), num_classes=VOCAB).to(torch.float32) * 8.0
        return StubOutput(logits[:, -logits_to_keep:, :])


class PositionOracle:
    """Logits at position `t` name `t + 1` as a value, not as a token.

    With this one the correct target for a prompt of length `p` is exactly
    `[p, p + 1, ...]`, so a wrong shift, a wrong slice or a wrong label offset
    turns a ~0 loss into a large one.
    """

    def __call__(self, *, input_ids: torch.Tensor, attention_mask: torch.Tensor, logits_to_keep: int):
        length = input_ids.shape[1]
        positions = (torch.arange(length, device=input_ids.device) + 1) % VOCAB
        logits = F.one_hot(positions, num_classes=VOCAB).to(torch.float32) * 8.0
        return StubOutput(logits.unsqueeze(0)[:, -logits_to_keep:, :])


def example(prompt: list[int], target: list[int]) -> dict:
    return {"prompt": prompt, "target": target}


def check(label: str, condition: bool, detail: str = "") -> None:
    print(f"{'ok  ' if condition else 'FAIL'} {label}{'' if detail == '' else f' — {detail}'}")
    if not condition:
        raise SystemExit(1)


def main() -> None:
    device = torch.device("cpu")
    model = NextTokenOracle()

    # Two examples of different lengths, so padding is exercised on both sides.
    a = example([1, 2, 3, 4, 5], [10, 11, 12])
    b = example([1, 2], [20, 21, 22, 23])

    alone_a = float(batch_loss(model, collate([a], 0), device))
    alone_b = float(batch_loss(model, collate([b], 0), device))
    together = float(batch_loss(model, collate([a, b], 0), device))
    expected = (alone_a + alone_b) / 2
    check(
        "a batch equals the mean of its examples",
        abs(together - expected) < 1e-5,
        f"batched {together:.6f} vs mean {expected:.6f}",
    )

    positions = PositionOracle()
    perfect = collate([example([1, 2, 3], [3, 4, 5])], 0)
    # The stub's logit gap is 8, so a perfect prediction still costs the
    # softmax floor: log(1 + 63 * e^-8) = 0.0211. Anything above that is a
    # misaligned shift, and the check below shows what that looks like.
    perfect_loss = float(batch_loss(positions, perfect, device))
    check(
        "a perfectly predicted target scores the softmax floor",
        perfect_loss < 0.05,
        f"loss {perfect_loss:.6f}",
    )

    shifted = collate([example([1, 2, 3], [5, 4, 3])], 0)
    shifted_loss = float(batch_loss(positions, shifted, device))
    check("a shifted target scores high", shifted_loss > 1.0, f"loss {shifted_loss:.4f}")

    # Two prompts of different length: the shorter one is left-padded, and both
    # answers must still start at the batch's prompt boundary.
    padded_pair = collate([example([1, 2, 3, 9, 9], [5, 6, 7]), example([1, 2, 3], [3, 4, 5])], 0)
    labels = padded_pair["labels"]
    prompt_len = padded_pair["prompt_len"]
    check(
        "a left-padded batch masks every prompt position",
        int((labels[:, :prompt_len] == PAD).sum()) == 2 * prompt_len,
        f"{int((labels[:, :prompt_len] == PAD).sum())} masked",
    )
    check(
        "each example's answer sits at the batch's prompt boundary",
        labels[1, prompt_len:].tolist() == [3, 4, 5] and labels[0, prompt_len:].tolist() == [5, 6, 7],
        f"row 0 {labels[0, prompt_len:].tolist()}, row 1 {labels[1, prompt_len:].tolist()}",
    )
    check(
        "the left-padded example still carries its own tokens",
        padded_pair["input_ids"][1].tolist()[:2] == [0, 0]
        and padded_pair["input_ids"][1].tolist()[2:5] == [1, 2, 3],
        f"row 1 {padded_pair['input_ids'][1].tolist()}",
    )

    padded = collate([a, b], 0)
    check(
        "padding is masked out of the loss",
        int((padded["labels"] == PAD).sum()) > 0,
        f"{int((padded['labels'] == PAD).sum())} masked positions",
    )
    check(
        "prompts are left-padded and targets right-padded",
        padded["input_ids"].shape[1] == padded["prompt_len"] + padded["target_len"],
        f"shape {tuple(padded['input_ids'].shape)}",
    )
    check(
        "the attention mask marks exactly the real tokens",
        int(padded["attention_mask"].sum()) == sum(len(item["prompt"]) + len(item["target"]) for item in (a, b)),
        f"{int(padded['attention_mask'].sum())} attended",
    )

    print("\nall batching checks passed")


if __name__ == "__main__":
    main()

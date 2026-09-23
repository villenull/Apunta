#!/usr/bin/env python3
"""Small loopback Ollama-compatible shim for HF model comparisons.

This is deliberately an evaluation instrument, not a production provider. It
implements the health endpoints and streamed /api/chat response shape consumed
by OllamaProvider, while loading one local Transformers checkpoint on the GPU.
"""
from __future__ import annotations

import argparse
import json
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import torch
from transformers import AutoConfig, AutoModelForCausalLM, AutoModelForImageTextToText, AutoTokenizer


class Shim:
    def __init__(self, model_path: str):
        self.path = model_path
        config = AutoConfig.from_pretrained(model_path)
        model_class = AutoModelForCausalLM if config.model_type == "qwen3" else AutoModelForImageTextToText
        self.tokenizer = AutoTokenizer.from_pretrained(model_path)
        self.model = model_class.from_pretrained(model_path, dtype=torch.bfloat16).eval().to("cuda:0")
        self.model.config.use_cache = True

    @torch.inference_mode()
    def generate(self, messages: list[dict], schema: dict | None, max_new_tokens: int) -> tuple[str, int, int]:
        system = messages[0].get("content", "") if messages and messages[0].get("role") == "system" else ""
        if schema is not None:
            system += "\nReturn only one valid JSON object matching this schema; do not use Markdown fences.\n" + json.dumps(schema)
        prompt_messages = [{"role": m["role"], "content": m.get("content", "")} for m in messages]
        prompt = self.tokenizer.apply_chat_template(
            prompt_messages,
            tokenize=False,
            add_generation_prompt=True,
            enable_thinking=False,
        )
        if system and prompt_messages and prompt_messages[0]["role"] == "system":
            prompt_messages[0]["content"] = system
            prompt = self.tokenizer.apply_chat_template(
                prompt_messages,
                tokenize=False,
                add_generation_prompt=True,
                enable_thinking=False,
            )
        encoded = self.tokenizer(prompt, return_tensors="pt", add_special_tokens=False).to("cuda:0")
        started = time.perf_counter()
        output = self.model.generate(
            **encoded,
            max_new_tokens=min(max_new_tokens, 3072),
            do_sample=False,
            temperature=0.0,
            pad_token_id=self.tokenizer.eos_token_id,
        )
        elapsed = max(time.perf_counter() - started, 1e-6)
        text = self.tokenizer.decode(output[0, encoded.input_ids.shape[1] :], skip_special_tokens=True).strip()
        return text, int(encoded.input_ids.shape[1]), int(output.shape[1] - encoded.input_ids.shape[1])


class Handler(BaseHTTPRequestHandler):
    shim: Shim
    tag: str

    def log_message(self, *_args: object) -> None:
        return

    def send_json(self, body: dict, status: int = 200) -> None:
        raw = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/api/tags":
            self.send_json({"models": [{"name": self.tag, "model": self.tag, "details": {"format": "gguf"}}]})
        else:
            self.send_json({"error": "not found"}, 404)

    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("content-length", "0"))
        body = json.loads(self.rfile.read(length) or b"{}")
        if self.path == "/api/show":
            self.send_json({"capabilities": []})
            return
        if self.path != "/api/chat":
            self.send_json({"error": "not found"}, 404)
            return
        messages = body.get("messages", [])
        options = body.get("options", {})
        text, prompt_tokens, output_tokens = self.shim.generate(
            messages,
            body.get("format") if isinstance(body.get("format"), dict) else None,
            int(options.get("num_predict", 3072)),
        )
        done = {
            "model": self.tag,
            "created_at": "2026-09-23T00:00:00Z",
            "message": {"role": "assistant", "content": text},
            "done": True,
            "done_reason": "stop",
            "prompt_eval_count": prompt_tokens,
            "eval_count": output_tokens,
            "eval_duration": 1,
            "prompt_eval_duration": 1,
            "total_duration": 1,
        }
        self.send_response(200)
        self.send_header("content-type", "application/x-ndjson")
        payload = (json.dumps(done) + "\n").encode()
        self.send_header("content-length", str(len(payload)))
        self.end_headers()
        # OllamaProvider only needs the final frame; one frame keeps this shim deterministic.
        self.wfile.write(payload)
        self.wfile.flush()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-path", required=True)
    parser.add_argument("--tag", required=True)
    parser.add_argument("--port", type=int, default=11442)
    args = parser.parse_args()
    Handler.shim = Shim(args.model_path)
    Handler.tag = args.tag
    ThreadingHTTPServer(("127.0.0.1", args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()

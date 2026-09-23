# Synthetic LoRA training unblock — 2026-09-23

## Result

The fused linear-attention path is now selected. Installing `flash-linear-attention==0.5.2` (plus `fla-core==0.5.2` and `einops`) made Transformers resolve `chunk_gated_delta_rule` to `fla.ops.gated_delta_rule.chunk.chunk_gated_delta_rule`; the FLA fallback warning disappeared. `causal-conv1d` could not be installed: its ROCm build requires `hipcc`, and this machine has no system ROCm (`hipcc` is absent). The remaining Transformers warning is only the causal-convolution fallback.

The hybrid Qwen3.5-4B backward path is finite with FLA, but the complete two-epoch run does not fit this 16-GiB card under the current training implementation. A batch-4/all-linear probe reached step 35 with finite gradients and then OOMed (13.7 GiB allocated). A standard-attention Qwen3-4B fallback reached the same step before OOM (12.8 GiB peak). The step-35 batch was not unusually long: sorted Qwen3.5 sequences had first-35 maximum 2,178 tokens, median 3,264 and maximum 3,561.

A memory-reduced projection-only hybrid run completed 30 optimizer steps (120 examples, 0.011 epoch) without non-finite gradients:

| setting | value |
| --- | --- |
| base | `Qwen/Qwen3.5-4B` |
| pairs | 360 train / 40 held out |
| LoRA | rank 16, attention/MLP projections only |
| batch / accumulation | 4 / 1 |
| max length | 3,584 |
| steps / examples | 30 / 120 |
| training time | 238.4 s |
| peak VRAM | 12.99 GiB |
| train loss at step 30 | 0.45145 |
| held-out loss | 0.48648 |
| device | AMD Radeon Graphics, `gfx1201`, `torch 2.13.0+rocm7.1` |

The requested batch-1/gradient-accumulation full run was attempted after the bounded run. Its first attempt aborted in ROCm while `/tmp` was full of a 6.8-GiB GPU core dump; the core was removed and the bounded run then succeeded. The full run was stopped before another attempt because the local HF evaluation shim was needed to measure the adapter before spending another GPU window. No claim of a full two-epoch training run is made.

## Measurement

Ollama's current Linux binary cannot convert this Qwen3.5 safetensors model: `q4_K_M` is not an accepted quantizer (`int4`, `int8`, `nvfp4`, `mxfp4`, and `mxfp8` are listed), and forced `int4` fails because this Linux binary has no MLX runtime. Therefore the adapter was measured through the loopback-only `tools/model-lab/hf-ollama-shim.py`, which loads local Transformers weights and implements the subset of `/api/tags`, `/api/show`, and streamed `/api/chat` used by the eval. Base and adapter used the same shim, generation settings, and GPU. These numbers are evidence about the synthetic training direction, not production GGUF numbers.

Owner-format corpus, 4 fixtures × 3 invocations:

| model | fabrication | safety facts | salient facts | blank preserved | gated runs |
| --- | ---: | ---: | ---: | ---: | ---: |
| HF Qwen3.5-4B base | 0/12 (0.0%) | 12/12 (100%) | 95.0% | 100.0% | 0/12 |
| 30-step LoRA merge | 0/12 (0.0%) | 12/12 (100%) | 80.0% | 0.0% | 0/12 |

The adapter filled all nine blank-section opportunities (9/84 unwarranted fills) while preserving safety, and did not improve the owner corpus. The raw reports are under `~/.local/share/apunta/model-lab/eval/hf-base-owner.md` and `hf-lora-owner.md`.

For the SOAP/intake corpus, the HF base control was run 20 fixtures × 3 invocations: fabrication 15.0% (9/60), safety facts 85.0%, salient facts 85.5%. The adapter SOAP arm was not completed within this GPU window; there is consequently no honest before/after claim for that corpus. The base report is `~/.local/share/apunta/model-lab/eval/hf-base-soap.md`.

## Verdict

Synthetic training did **not** move the measured owner-format quality in a useful direction: fabrication and safety were unchanged, while salient-fact capture fell 15 points and blank preservation fell to zero. This bounded run is only 120 examples, so it is not evidence that a complete, stable adapter could never help; it is evidence that asking for real-data training now would be premature. Retrieval and prompt improvements remain the lower-risk next experiment. No adapter was installed into the live app, and no Ollama model was left in the shared store.

All GPU commands used `/tmp/apunta-gpu.lock`; residency checks included live 11434 and disposable 11440–11443. The live app, live Ollama and live data directory were not touched. The only training/eval text was the checked-in synthetic corpus.

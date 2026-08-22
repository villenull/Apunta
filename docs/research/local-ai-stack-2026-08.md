# Local AI stack research — August 2026

Verified web research (Aug 22, 2026) backing the architecture plan. Four
questions: can the app be 100% in-browser, which local runtime/models to use,
how to transcribe audio fully locally, and how to port a Claude skill to an
open-weight model.

## 1. In-browser LLM inference (WebGPU)

**Verdict: viable but capacity-limited — use as fallback, not primary.**

- WebGPU is default-on in Chrome/Edge/Firefox/Safari (W3C Candidate
  Recommendation, March 2026); 90%+ desktop support. Linux Chrome still
  rolling out (Chrome 144 beta).
- WebLLM 0.2.84 and transformers.js v4 both run quantized models entirely in
  a tab, with OpenAI-compatible streaming + JSON mode.
- Practical in-browser ceiling on a 16GB-RAM / integrated-GPU machine is a
  **3–4B q4 model** (~2.3–3.4GB GPU memory, ~1.7–2.5GB one-time cached
  download, ~5–20 tok/s). 8B-class needs ~5–6.4GB GPU memory and collides
  with Chrome's ~4GB per-tab GPU buffer norms — only comfortable on discrete
  GPUs / Apple Silicon.
- 2026 clinical-note literature (JMIR Med Inform e82545; arXiv 2605.24902):
  7–8B models produce clinically coherent SOAP notes; 3B-class measurably
  degrades. So fully-in-browser = bottom of the acceptable-quality band.
- Chrome's built-in Gemini Nano Prompt API: autocomplete-tier quality, not
  web-stable until ~Chrome 145–150. Not adequate as the drafter.
- A local server on the *same* hardware runs 8B at 8–14 tok/s CPU-only
  (35–50 tok/s with a mid GPU) and unlocks the 12–14B tier browsers can't
  reach — a full quality tier higher, 3–5x faster, always-warm.

## 2. Local runtime and models

**Verdict: build against the OpenAI-compatible HTTP API; default runtime
Ollama (easy install) with llama.cpp llama-server as the fully-open
alternative — same API shape, so the app doesn't care.**

- llama.cpp llama-server: MIT, JSON-schema/GBNF grammar-enforced structured
  output, April 2026 CUDA engine rewrite. Also exposes an Anthropic-style
  `/v1/messages` endpoint now.
- Ollama v0.32.x: MIT core (GUI closed-source), MLX backend on Apple Silicon
  with multi-token prediction (Gemma 4 ~50 → ~95 tok/s on M-series).
  **Never use its cloud tier** — local serving only. Structured outputs
  (`format` = JSON schema) since v0.5; compiles to a llama.cpp grammar.
- Spring 2026 reset the open-model picture — all Apache 2.0:
  - **Gemma 4** (Apr 2026): E2B/E4B/12B/26B-A4B-MoE/31B, 128–256K ctx.
  - **Qwen3.6** (Apr 2026): 27B dense, 35B-A3B MoE, 262K ctx; Qwen3.5-4B
    (Mar 2026) is the consensus best CPU-only small model.
  - **Mistral**: Ministral 3 (3B/8B/14B), Mistral Small 4.
  - **gpt-oss-20b** (Aug 2025): MXFP4 ~13GB — still the best exactly-16GB-GPU fit.
  - Meta released **Muse Glimmer 30B** (Aug 2026, Apache 2.0); no open Llama 4.
- Recommended defaults per hardware tier:
  | Tier | Model | Footprint | Speed |
  | --- | --- | --- | --- |
  | NVIDIA 8–16GB VRAM | Gemma 4 12B QAT Q4_K_M (16GB cards: gpt-oss-20b) | ~7–8GB | ~21 tok/s (RTX 4060) to 140 tok/s |
  | Apple Silicon 16GB+ | Gemma 4 12B 4-bit MLX; 24–32GB: Qwen3.6-35B-A3B | ~8GB / ~20GB | 30–95 tok/s |
  | CPU-only 16GB RAM | Qwen3.5-4B Q4_K_M (alt: Gemma 4 E4B, Ministral 3 8B) | ~3–6GB | 8–20 tok/s |
- Skip medical fine-tunes (MedGemma is under restrictive Health AI terms, not
  Apache). General instruct models + schema-enforced JSON is the proven 2026
  approach (Healthcare 14:2150).
- Keep transcript+note within a 16K context request; raise Ollama's
  `num_ctx` — its default is 4096 and silently truncates.

## 3. Local speech-to-text

**Verdict: transcribe in the local sidecar server, not the browser.**

- **Chrome's Web Speech API default mode sends recorded audio to Google's
  servers** — disqualified. (Chrome 139+ has an opt-in `processLocally:true`
  on-device mode, but it uses lower-accuracy SODA models with no vocabulary
  biasing; treat as inferior, optional.)
- No official Whisper successor as of Aug 2026. Production open checkpoints:
  - **whisper-large-v3-turbo** (809M): faster-whisper 1.2.1 int8 ≈ 1.5–2.5GB
    VRAM — a 20-min dictation in well under a minute on a mid NVIDIA GPU;
    whisper.cpp v1.8.4 Q5_0 (~574MB, ~2GB RAM) ≈ ~1x real-time on fast CPU.
  - **NVIDIA Parakeet TDT 0.6B v3** (CC-BY-4.0): 6.34% avg WER, native
    punctuation/caps/timestamps, int8 via sherpa-onnx ~670MB / ~2GB RAM,
    several-times faster than real-time **CPU-only** — best CPU default.
  - Moonshine (26–58MB) for very weak hardware; Canary-Qwen-2.5B tops the
    leaderboard but needs NeMo + ~5GB VRAM.
- In-browser Whisper (transformers.js v3/v4 WebGPU, whisper-large-v3-turbo)
  is real and fully private — usable for a zero-install mode, less robust on
  20-minute files.
- Known weak spot: psychiatric medication names (Vraylar, Latuda,
  lamotrigine…). Mitigate with Whisper `initial_prompt` vocabulary biasing
  (~224-token budget) + LLM post-correction during structuring. Parakeet has
  no biasing knob — an argument for Whisper-family when vocabulary matters.
- Single speaker dictation → no diarization needed (skip whisperX/pyannote).

## 4. Porting a Claude skill to a local model

**Verdict: don't port the skills runtime — flatten the skill into a fixed
system prompt at build time.**

- A skill is a folder: `SKILL.md` (YAML frontmatter + markdown body) plus
  optional `references/`, `scripts/`, `assets/`. Now an open standard
  (agentskills.io, Dec 2025; ~40 products support it).
- Ports cleanly: instruction body, section/output-format specs, terminology,
  examples, inlined reference content.
- Does not port: trigger/discovery frontmatter, `allowed-tools`/hooks, any
  body text assuming filesystem/bash ("read FORMS.md", "run scripts/x.py") —
  strip or reimplement as app code.
- Recipe: strip frontmatter → inline needed references → delete file/tool
  references → append 1–2 gold dictation→note few-shot pairs → keep under
  ~4–5K tokens (small models drift on longer instruction blocks).
- Enforce note structure with a JSON schema via Ollama `format` /
  `response_format: json_schema` (guaranteed-valid sampling), **and restate
  the schema in the prompt** — the schema parameter is never shown to the
  model. Temperature 0. Render markdown from the JSON app-side so the model
  only has to get content right, never formatting.
- Stateless per-request prompting (full system prompt every call) avoids
  known instruction-drift in long chats.

## Sources

Representative primary sources (full lists in the research transcripts):
github.com/mlc-ai/web-llm (model config), huggingface.co/blog/transformersjs-v4,
developer.chrome.com/docs/ai/prompt-api, medinform.jmir.org/2026/1/e82545,
ollama.com/blog/structured-outputs, github.com/ggml-org/llama.cpp
(grammars/README.md), github.com/SYSTRAN/faster-whisper,
huggingface.co/nvidia/parakeet-tdt-0.6b-v3, MDN SpeechRecognition.available,
github.com/anthropics/skills, platform.claude.com skills docs.

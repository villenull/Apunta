# Owner actions

Each entry: date, card, exact steps, why it is needed, cards waiting on it.

(none yet)
2026-09-26 | P0.4 | Provide Ollama with the `qwen3.5:4b-q4_K_M` tag on the machine that runs this card (install Ollama and/or make the model available out-of-band; agents may neither install Ollama — not in ACQUISITION.md, HS-3 — nor pull the model if absent — card fixed decisions). Verify with `ollama list` showing `qwen3.5:4b-q4_K_M` and `curl -fsS http://127.0.0.1:11434/api/tags`. | This machine has no `ollama` binary and nothing listens on 127.0.0.1:11434 (coordinator independently confirmed), so the 8 real-model baseline invocations cannot start. | P0.4 (BLOCKED), and through it P0.R.
  → **RESOLVED 2026-09-26** (owner-authorised HS-3 exception): owner installed `ollama` 0.33.3-1 + `ollama-rocm` + `hipblas` (`/opt/rocm` present); a subagent started the daemon and pulled `qwen3.5:4b-q4_K_M` (digest 2a654d98e6fb, 3.4 GB, 100% GPU on the RX 9070 XT). Remaining owner action for persistence: `sudo systemctl enable --now ollama` (service is installed but disabled; daemon currently runs as a manual `ollama serve`, PID 294100, log `/tmp/ollama-serve.log`; stop the manual one first if the service errors).

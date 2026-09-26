# Owner actions

Each entry: date, card, exact steps, why it is needed, cards waiting on it.

(none yet)
2026-09-26 | P0.4 | Provide Ollama with the `qwen3.5:4b-q4_K_M` tag on the machine that runs this card (install Ollama and/or make the model available out-of-band; agents may neither install Ollama — not in ACQUISITION.md, HS-3 — nor pull the model if absent — card fixed decisions). Verify with `ollama list` showing `qwen3.5:4b-q4_K_M` and `curl -fsS http://127.0.0.1:11434/api/tags`. | This machine has no `ollama` binary and nothing listens on 127.0.0.1:11434 (coordinator independently confirmed), so the 8 real-model baseline invocations cannot start. | P0.4 (BLOCKED), and through it P0.R.

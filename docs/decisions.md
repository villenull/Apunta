# Decisions log

Append-only. Agents add a row when they make or change a notable technical
decision (including deviations from a work packet).

| Date | Decision | Why | Where |
| --- | --- | --- | --- |
| 2026-08-22 | Local server + browser UI; in-browser WebGPU inference rejected as primary | On target hardware, a server runs 12B-class models (full quality tier above the ~4B in-browser ceiling), 3–5x faster, always warm; UI stays a Chrome tab either way | research §1 |
| 2026-08-22 | Ollama default runtime, llama.cpp-compatible via OpenAI-style API | Easiest install; MLX speedups on Apple Silicon; structured outputs; never use its cloud tier | research §2 |
| 2026-08-22 | STT server-side via whisper.cpp (large-v3-turbo Q5); browser Web Speech API banned | Web Speech default mode ships audio to Google — privacy violation; whisper.cpp is fast on Metal with vocabulary biasing | research §3 |
| 2026-08-22 | Claude skill flattened into per-format `instructions`, no skills runtime | Ports cleanly to a system prompt; runtime machinery doesn't; stateless prompting avoids drift | docs/skill-porting.md |
| 2026-08-22 | No login in v1; single-tenant SQLite; UUID keys + clean HTTP API kept product-ready | Owner decision (2026-08-22 Q&A); "possible product someday" | PLAN §1 |
| 2026-08-22 | Note editor is a textarea, not contenteditable | Selection offsets needed for highlight-refs; simpler, safer | M2/M4 packets |
| 2026-08-22 | TypeScript monorepo (Fastify + React + shared zod), tests Vitest + Playwright, fakes as first-class providers | One language for all agents; fakes keep CI hermetic and the app demoable anywhere | PLAN §2/§5/§6 |
| 2026-08-22 | Single shared branch for all packets; no feature branches, no inter-packet PRs; packets run one at a time | Owner decision — solo project, no review gate to serve; removes merge friction. Cost: M4/M5/M6 lose potential parallelism | docs/agents/README.md |

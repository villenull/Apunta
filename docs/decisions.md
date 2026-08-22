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
| 2026-08-22 | Pin TypeScript 6.0.3, not the newer 7.0.2 | `typescript-eslint` 8.67 (current) declares `typescript >=4.8.4 <6.1.0`; TS 7 would break linting. Revisit when typescript-eslint ships TS 7 support | M0, root package.json |
| 2026-08-22 | Design tokens ported from the prototype **without** its Google Fonts `@import`; Inter/Lora kept as the first entry of `--font-sans`/`--font-serif` stacks | Hard rule 1 bans CDN assets and external fonts at runtime. Bundling the actual font files is packaging work (M7); until then the system fallbacks render | web/src/styles/tokens.css |
| 2026-08-22 | `shared` is compiled to `dist/` and every root script that needs it runs `build:shared` first | Keeps one resolution story for tsc, tsx, Vite, Vitest and the built server — a src-pointing `exports` field would break the production `node server/dist/index.js` run | M0, root package.json |
| 2026-08-22 | Privacy hard rules enforced by ESLint: no non-loopback `http(s)://` literals in source, no `SpeechRecognition` globals | Review is not a reliable guard against a stray URL or a convenient browser API; lint fails the build instead | eslint.config.js |
| 2026-08-22 | Playwright browser is resolved from `PLAYWRIGHT_CHROMIUM_EXECUTABLE` when that env var is set | Sandboxes/CI images that pre-install Chromium must not be forced through `playwright install`; unset, Playwright behaves normally (what GitHub Actions does) | e2e/playwright.config.ts |
| 2026-08-22 | Non-technical installer split out as M8 rather than expanded inside M7 | Owner needs the therapist to install it herself. Bundled runtimes + signing + first-run download UI is a packet's worth of work; folding it into M7 would have made M7 unshippable | docs/agents/M8-installer.md |
| 2026-08-22 | Packaged app bundles `llama-server` (llama.cpp, MIT) instead of requiring Ollama | A double-clickable install cannot ask a non-technical user to install Homebrew and Ollama first; the app only ever speaks the OpenAI-compatible API, so the runtime is swappable. Ollama stays the developer-setup default | M8 |
| 2026-08-22 | No auto-updater and no telemetry in the packaged app | Hard rule 1 has no exception for update checks — a background version ping is still an outbound call. Updates are user-initiated only | M8 |
| 2026-08-22 | E2E server runs on port 7788, not 7717 | Lets the suite run while a dev server is up, and keeps the temp `PATIENCE_DATA_DIR` well away from real data | e2e/playwright.config.ts |

# Practice Notes — agent guide

Local-first therapy-notes app: React SPA in a browser tab, Fastify server on
127.0.0.1, SQLite storage, all AI local (Ollama LLM + whisper.cpp STT).
Master plan: `docs/PLAN.md`. Design reference: `prototype/` (do not modify).
Work packets: `docs/agents/`.

## Hard rules

1. **Privacy is the product.** No outbound network calls at runtime, ever —
   only `127.0.0.1`/`localhost`. Never use the browser SpeechRecognition /
   Web Speech API (it can send audio to Google). No telemetry, no CDN assets
   at runtime (bundle everything), no external fonts.
2. Real patient text never goes in fixtures, tests, or commits. Use the
   prototype's sample data (John Smith etc.).
3. `PATIENCE_FAKE_AI=1` must always keep the entire app runnable and
   demoable with zero AI tooling installed. CI runs everything in fake mode.
4. Server logic stays OS-portable; only `scripts/` may assume macOS/Homebrew.
5. Don't widen scope beyond your packet. Deferred list: `docs/PLAN.md` §8.

## Commands

- `npm install` — workspace install (Node 22+)
- `npm run dev` — server (:7717, tsx watch) + Vite (:5173, proxies /api)
- `npm run dev:fake` — same with `PATIENCE_FAKE_AI=1`
- `npm start` — production: build web, serve app at http://127.0.0.1:7717
- `npm run lint` / `npm run typecheck` / `npm test` — must all pass
- `npm run e2e` — Playwright (builds first, runs server in fake mode)
- `npm run smoke:live` — manual, needs real Ollama + whisper installed

## Conventions

- TypeScript strict everywhere; zod schemas in `shared/` are the single
  source of truth for API and LLM-output shapes.
- UUIDv7 ids; UTC ISO-8601 timestamps; SQLite via better-sqlite3 with
  numbered migrations in `server/migrations/`.
- Streaming responses are SSE (`text/event-stream`), event names documented
  in `shared/` types.
- UI matches `prototype/style.css` design tokens (port them once into
  `web/src/styles/`); keep the prototype's copy/text verbatim where a screen
  exists in the prototype.
- Tests colocated as `*.test.ts`; e2e in `e2e/`. New behavior lands with
  tests in the same commit.
- Commits: imperative subject, body says why. Branch per packet
  (`feat/m3-ai-providers`).

## Definition of done (every packet)

lint + typecheck + unit/integration + build + e2e all green locally and in
CI; acceptance criteria in the packet checked off; no leftover TODOs without
an issue; docs updated when behavior or commands changed.

# Apunta — agent guide

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
3. `APUNTA_FAKE_AI=1` must always keep the entire app runnable and
   demoable with zero AI tooling installed. CI runs everything in fake mode.
4. Server logic stays OS-portable; only `scripts/` may assume macOS/Homebrew.
5. Don't widen scope beyond your packet. Deferred list: `docs/PLAN.md` §8.

## Commands

- `npm install` — workspace install (Node 22+)
- `npm run dev` — server (:7717, tsx watch) + Vite (:5173, proxies /api)
- `npm run dev:fake` — same with `APUNTA_FAKE_AI=1`
- `npm start` — production: build web, serve app at http://127.0.0.1:7717
- `npm run seed` — dev only: load the prototype's sample practice into the
  database (`npm run seed -- --reset` replaces existing content)
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
- Commits: imperative subject, body says why.
- **One branch for everything** (`claude/local-browser-app-planning-0likfi`):
  no feature branches, no inter-packet PRs, one packet in flight at a time.
  Stage explicit paths, never `git add -A`; on a rejected push,
  `git pull --rebase` and retry — never force-push.

## Working alongside background agents

A Stop hook complains whenever the git tree is dirty. While a background agent
is mid-build that is a **false alarm**, and acting on it does real damage —
committing another agent's half-written files fragments its history and can
capture a broken intermediate state. Background: `docs/dev-notes/README.md`.

- Never commit a background agent's in-flight work. Leave the dirty tree alone.
- If a large body of work is sitting uncommitted, **message the agent and ask
  it to commit and push.** It knows what is finished; you do not.
- Push whenever you like — pushing never touches the working tree, so it is
  always safe mid-build.
- As an agent: commit each coherent piece as it lands, so a large delta never
  sits exposed. The container can be reclaimed without warning.

## Definition of done (every packet)

lint + typecheck + unit/integration + build + e2e all green locally and in
CI; acceptance criteria in the packet checked off; no leftover TODOs without
an issue; docs updated when behavior or commands changed.

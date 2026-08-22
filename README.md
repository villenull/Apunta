# Apunta

A local-first app for a solo practice that turns dictated or typed session
summaries into structured clinical notes. The UI runs in a browser tab; all
AI processing (transcription and note drafting) runs on the local PC with
free, open-weight models — nothing leaves the machine.

**Status: data layer and API (M1) in place — SQLite storage and the full
non-AI JSON API; the browser UI is still the M0 placeholder.**
Start at
[`docs/PLAN.md`](docs/PLAN.md); coding agents pick up work packets from
[`docs/agents/`](docs/agents/README.md) in order M0 → M8.

## Picking this up on another machine

> **Read [`docs/dev-notes/README.md`](docs/dev-notes/README.md) first.** It
> explains a Stop-hook false alarm that fires constantly while background
> coding agents are working, why acting on it damages commit history, and the
> no-cost protocol that avoids it. Two minutes there saves an hour of
> confusion.


Everything lives on one branch, which is also this repository's default
branch — a plain clone gets all of it:

```sh
git clone https://github.com/villenull/Apunta.git
cd Apunta
npm install          # Node 22+; better-sqlite3 needs a prebuilt binary or a compiler
npm test             # 115 tests — confirms the checkout is sound
```

### Where the project stands

| Packet | State |
| --- | --- |
| M0 scaffold | done — monorepo, toolchain, CI, egress guard, placeholder SPA |
| M1 data + API | done — migrations, SQLite, every non-AI endpoint, seed script |
| M2 web shell | **next** — port `prototype/` to React against the real API |
| M3–M8 | planned; packets written in `docs/agents/` |

Ready and waiting for the packets that need them: the evaluation corpus in
`e2e/fixtures/eval/` (M7) and drafted note-drafting instructions in
`docs/note-instructions/` (M3).

### To continue with a coding agent

Open a session on this repo and give it:

> Read docs/PLAN.md, CLAUDE.md, and docs/agents/M2-web-shell.md, then
> implement that packet exactly. All work stays on the current branch — do
> not create a feature branch or open a PR. Keep commits small and stop when
> every acceptance criterion passes locally (lint, typecheck, tests, build,
> e2e), then push.

One environment note worth carrying over: in a sandbox that pre-installs
Chromium, Playwright needs `PLAYWRIGHT_CHROMIUM_EXECUTABLE` pointed at it
(on a normal machine, and in CI, leave it unset).

CI is green and has been running all along — see
[`docs/research/ci-audit-2026-08.md`](docs/research/ci-audit-2026-08.md) for a
full audit of the workflow against its real run logs, including the two config
items with an externally-set deadline.

## Development

Node 22+ (`.nvmrc` pins the major). `npm install` once at the repo root — this
is an npm-workspaces monorepo, so the four packages install together. Day to
day: `npm run dev` starts the API on <http://127.0.0.1:7717> (tsx watch) plus
Vite on <http://127.0.0.1:5173> with `/api` proxied to it, and `npm run
dev:fake` is the same with `APUNTA_FAKE_AI=1` so no local AI tooling is
needed. `npm start` builds everything and serves the whole app from
<http://127.0.0.1:7717>. Before committing, run `npm run lint` (ESLint +
Prettier), `npm run typecheck`, `npm test` (Vitest, all workspaces) and `npm
run e2e` (Playwright/Chromium — it builds first and boots the server in fake-AI
mode on port 7788 with a temp data dir); `npm run format` fixes formatting and
`npm run smoke:live` is the manual real-model check, stubbed until M3/M5.
`npm run seed` fills the database with the prototype's sample practice (John
Smith and friends) so there is something to click through; it leaves a
database that already has data alone unless you pass `-- --reset`.
Useful env: `APUNTA_PORT`, `APUNTA_DATA_DIR`, `APUNTA_FAKE_AI=1`, and
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` when the sandbox already has a browser that
`playwright install` should not replace.

## Repository layout

| Path | What it is |
| --- | --- |
| `shared/` | zod schemas and types shared by server and web (built to `dist/` before the other packages build) |
| `server/` | Fastify API on `127.0.0.1:7717`; serves `web/dist` in production |
| `web/` | React + Vite SPA |
| `e2e/` | Playwright specs |
| `docs/PLAN.md` | Master plan: architecture, data model, API, AI pipeline, testing strategy, milestones |
| `docs/agents/` | Self-contained work packets (M0–M8) for coding agents, with acceptance criteria |
| `docs/research/` | Verified Aug-2026 research behind the stack choices |
| `docs/skill-porting.md` | How the owner's Claude skill becomes the local model's drafting instructions |
| `docs/decisions.md` | Append-only decisions log |
| `CLAUDE.md` | Conventions, commands, and hard rules for agents working here |
| `prototype/` | Click-through HTML/CSS prototype used as the design reference. Open `prototype/index.html` in a browser to walk it. No build step, no real data — every interaction is mocked. |

## Architecture in one paragraph

A TypeScript monorepo: a Fastify server bound to `127.0.0.1` serves a React
SPA and a JSON/SSE API backed by SQLite, and talks only to local AI — Ollama
for drafting/refining notes (schema-enforced structured output) and
whisper.cpp for transcribing recordings (ffmpeg-converted, vocabulary-biased).
Fake AI providers make the whole app runnable and CI-testable with nothing
installed; a macOS setup script installs the real stack and picks a model
sized to the machine's RAM.

## The prototype flow

1. `index.html` — login / create account
2. `onboarding-format.html` → `onboarding-preview.html` — define a note format (upload a blank template, upload example notes, or describe sections) and confirm the detected sections
3. `add-patient.html` — minimal patient record (name + optional identifier)
4. `patients.html` — the main three-column workspace: patients list, notes list, and a note editor with an AI "Refine" chat (highlight-to-reference, quick actions, publish/copy)
5. `capture.html` — new note capture: record audio or type a summary
6. `settings.html` — manage note formats

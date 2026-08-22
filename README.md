# Patience — Practice Notes

A local-first app for a solo practice that turns dictated or typed session
summaries into structured clinical notes. The UI runs in a browser tab; all
AI processing (transcription and note drafting) runs on the local PC with
free, open-weight models — nothing leaves the machine.

**Status: planned, ready for implementation.** Start at
[`docs/PLAN.md`](docs/PLAN.md); coding agents pick up work packets from
[`docs/agents/`](docs/agents/README.md) in order M0 → M7.

## Repository layout

| Path | What it is |
| --- | --- |
| `docs/PLAN.md` | Master plan: architecture, data model, API, AI pipeline, testing strategy, milestones |
| `docs/agents/` | Self-contained work packets (M0–M7) for coding agents, with acceptance criteria |
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

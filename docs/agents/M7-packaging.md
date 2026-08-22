# M7 — Setup, polish, packaging, eval

**Depends on:** M4 + M5 + M6

## Goal

Make it real on the owner's MacBook: guided setup, model auto-pick,
first-run wizard, export/backup, rough edges sanded, and a model-quality
eval harness.

## Deliverables

1. `scripts/setup-macos.sh` (idempotent, re-runnable, loud about what it
   does): checks Homebrew → installs `ollama`, `whisper-cpp`, `ffmpeg`,
   Node 22 if missing → starts/enables Ollama → picks the LLM per the RAM
   table in PLAN §2 (verify current Ollama tags at implementation time) →
   `ollama pull` it → downloads `ggml-large-v3-turbo-q5_0.bin` into the data
   dir models folder (curl from the official whisper.cpp HF repo; verify
   checksum) → writes chosen model into settings → prints "run `npm start`".
2. First-run/setup wizard in the app: when `/api/health` reports anything
   missing, `/setup` shows a checklist (Ollama running / model present /
   whisper binary / whisper model / ffmpeg) with the exact command to fix
   each, a "re-check" button, and a copyable one-liner for the setup script.
   The M3 banner links here. When all green: "You're fully local — nothing
   leaves this Mac."
3. `npm start` opens the browser (`open http://127.0.0.1:7717` on darwin)
   after listening. Optional `scripts/install-launchagent.sh` creating a
   LaunchAgent so the server starts at login (document uninstall).
4. Export & backup: `GET /api/export` streams a zip of all notes as
   markdown (`Patient/2026-08-22 Progress note.md`) + a `data.json` dump;
   Settings gains an Export button and shows the db file path with a "your
   backup is this file" note.
5. Polish pass (small, bounded): keyboard focus states, Escape closes
   confirms, patient archive UI (hide archived with a toggle), note list
   relative dates ("Today", "Aug 8, 2026" per prototype), error toasts for
   failed fetches, favicon + `<title>`s, and an in-app About/privacy page
   stating the local-only guarantee in plain language.
6. `npm run eval`: script running every `e2e/fixtures/eval/*.txt` transcript
   through the **real** model for each format, N=3 runs each, reporting per
   model: schema-validity rate, all-sections-nonempty rate, mean tokens/sec,
   and flagged hallucination heuristics (quoted phrases in output absent
   from transcript). Markdown report to stdout. Add 5+ fabricated fixture
   transcripts of varying length/messiness (no real patient data). Document
   how to compare two models (`PATIENCE_EVAL_MODELS=a,b`).
7. README rewritten for an end user: what it is, privacy model, setup on a
   Mac (3 steps), daily use, backup, troubleshooting table, then a
   development section.

## Acceptance criteria

- On a clean macOS machine (or documented best-effort: script's brew/pull
  steps behind flags so CI can lint/dry-run it), `setup-macos.sh` then
  `npm start` yields a working app — record a manual verification checklist
  result in the PR description.
- Wizard e2e (fake mode with health forced unhealthy via env) shows the
  checklist and recovers on re-check when health flips.
- Export integration test: zip contains expected files for seeded data.
- Eval script runs against fakes in CI (structure only, `--fake` flag);
  real-model run documented as manual.
- Baseline suite green; no `coming soon`/disabled placeholders remain
  anywhere in the UI.

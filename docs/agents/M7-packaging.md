# M7 — Setup, polish, packaging, eval

**Depends on:** M4 + M5 + M6

## Goal

Make it real on the owner's MacBook: guided setup, model auto-pick,
first-run wizard, export/backup, rough edges sanded, and a model-quality
eval harness.

**Scope boundary:** M7 targets a developer's Mac and may assume a terminal,
Homebrew, and a git clone. Making the app installable by a non-technical
user — a signed `.dmg`, bundled runtimes, no Homebrew, no terminal — is
M8 (`M8-installer.md`). Do not start building an app bundle here; keep the
setup-script path clean and well-documented, because M8 builds on it.

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
   whisper binary / whisper model) with the exact command to fix each, a
   "re-check" button, and a copyable one-liner for the setup script. Drop
   `ffmpeg` from this list — M5 no longer uses it.

   **Add a FileVault check** (`fdesetup status`). It is the only thing standing
   between a stolen laptop and every clinical record on it, recent Apple
   silicon Setup Assistant may not prompt for it, and without it the volume key
   is protected only by the hardware UID — by nothing she knows. Verify it
   rather than assuming it; say plainly what it means if it is off.
   The M3 banner links here. When all green: "You're fully local — nothing
   leaves this Mac."
3. `npm start` opens the browser (`open http://127.0.0.1:7717` on darwin)
   after listening. Optional `scripts/install-launchagent.sh` creating a
   LaunchAgent so the server starts at login (document uninstall).
4. Export & backup — **rewritten; see `docs/research/data-at-rest-2026-08.md`.**
   The owner keeps every note forever and the records system holds the
   authoritative copy, so this laptop carries a second complete set of clinical
   records with no institutional backup behind it. The research names the
   biggest real risk to her as *the backup not existing, or existing and not
   being restorable* — it outranks every confidentiality scenario because the
   harm is certain rather than conditional.

   As originally specified (markdown + `data.json`, no `.db`, no manifest, no
   restore instructions) this produces something you can read but cannot
   restore. Fix that:

   - The zip carries **the `.db` itself**, not only a rendering of it, plus a
     manifest (schema version, app version, note/patient counts, timestamp)
     and a plain-language RESTORE.txt written for someone who no longer has
     Apunta installed. Keep the markdown too — it is the human-readable
     fallback — but it is not the backup.
   - **Warn about the destination.** Desktop and Documents are exactly the two
     folders "Desktop & Documents Folders" syncs to iCloud, so the obvious save
     location uploads clinical records to Apple. Worse, with Optimize Mac
     Storage on, macOS evicts unopened files to 0-byte placeholders and Time
     Machine then backs up the stub — a backup that appears to exist and is
     empty when needed.
   - **Encrypt any backup that leaves the machine**, since it no longer has
     FileVault under it.
   - Restore instructions must say: restore the `.db` alone and **delete any
     stale `-wal`/`-shm` beside it**. Missing that step is what actually
     causes damage. (Modern Time Machine snapshots APFS, so the trio is
     captured atomically — the restore is crash-consistent and SQLite replays
     the WAL.)
   - Do **not** run a bare `VACUUM` on the live database: it writes a full
     plaintext copy of every note into `TMPDIR`, falling through to `/var/tmp`
     or `/tmp` when unset.
5. Polish pass (small, bounded): keyboard focus states, Escape closes
   confirms, patient archive UI (hide archived with a toggle), note list
   relative dates ("Today", "Aug 8, 2026" per prototype), error toasts for
   failed fetches, favicon + `<title>`s, and an in-app About/privacy page
   stating the local-only guarantee in plain language.
6. `npm run eval`: script running every `e2e/fixtures/eval/*.txt` transcript
   through the **real** model for each format, N=3 runs each. Markdown report
   to stdout; document model comparison (`APUNTA_EVAL_MODELS=a,b`).
   - **The corpus already exists** — 10 transcripts plus `expectations.md`,
     `rubric.md` and `README.md` are in `e2e/fixtures/eval/`. Do not write new
     fixtures; implement against the rubric that is there.
   - **Lead the report with fabrication rate**, not completeness or
     schema-validity. An omission is recoverable in the refine chat; a
     fabrication looks finished and gets published. Faithfulness is the
     gating metric — a banned-string hit zeroes that fixture, as does a
     structural failure.
   - Implement the mechanical core from the rubric's per-fixture
     `mustNotContain` lists (§7 of `rubric.md` specifies the JSON sidecar
     schema with a worked example). §9 lists what a script cannot check and
     which fixtures warrant a human read.
7. README rewritten for an end user: what it is, privacy model, setup on a
   Mac (3 steps), daily use, backup, troubleshooting table, then a
   development section.

## Before you start

`docs/research/data-at-rest-2026-08.md` §7 lists nine claims the research could
not verify from primary sources (this container's egress policy blocked
`sqlite.org`, `support.apple.com` and `eclecticlight.co`), each with the exact
command to settle it on a real Mac. Run those during the manual verification
pass. **None of them may reach user-facing documentation unverified** — wrong
guidance about where a backup lives is worse than none.

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

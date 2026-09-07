# Apunta — agent guide

**Picking up where the last session left off? Read `docs/HANDOFF.md` first** —
what is built, what is open and who it waits on, and how to run the live
instance. Keep it current in the same commit as the change.

Local-first therapy-notes app: React SPA in a browser tab, Fastify server on
127.0.0.1, SQLite storage, all AI local (Ollama LLM + whisper.cpp STT).
Master plan: `docs/PLAN.md`. Design reference: `prototype/` (do not modify).
Work packets: `docs/agents/` — **all packets (M0–M10) are complete.** M10
ran on a live Linux machine on 2026-08-27
(`docs/eval-reports/2026-08-M10-report.md`), and the owner's answers landed
2026-08-28 (`docs/feedback/2026-08-28-owner-answers.md` — applied and
re-measured). What remains needs a Mac (`docs/MANUAL-VERIFICATION.md`), her
transcription vocabulary list (promised, not yet sent), or a new packet:
the intake-side instruction distillation, per the M10 report. **M11**
(importing her Claude conversations) is built — `Settings → Import from
Claude`, proposals only, nothing written unreviewed — against an *inferred*
export schema. Running it on her real export stays gated on the
confidentiality decision; run `npm run probe:claude` on the real export
first to check the schema.
**Spoken retractions** ("four hours, scratch that, six") are cut out of a
transcript before drafting by the server, on a quote the model supplies and
only where the transcript bears it out (`server/src/ai/retractions.ts`,
`docs/eval-reports/2026-09-06-retraction-pass.md`); what was cut is listed
under the first-pass message in the note's chat.

## Hard rules

1. **Privacy is the product.** No outbound network calls at runtime, ever —
   only `127.0.0.1`/`localhost`. Never use the browser SpeechRecognition /
   Web Speech API (it can send audio to Google). No telemetry, no crash
   reporting, no update check, no CDN assets at runtime (bundle everything),
   no external fonts.

   **One exception, and it is the only one: model acquisition.** The installer
   / first-run component — never the server, never the browser tab — may
   download model weights, provided it (a) runs only when the user explicitly
   starts it, (b) contacts only hosts on the pinned allow-list in
   `installer/src/catalog.ts` (recorded in `docs/decisions.md`), (c) sends no
   user data, no note content, no machine identifier and no query string
   beyond the file path, (d) verifies every download against a pinned
   checksum, and (e) does not run again once the models are there. The
   server's egress guard is not relaxed for this and never should be: the
   downloader is a separate short-lived process, and a test asserts that
   nothing in `server/`, `web/` or `shared/` imports it. Anything else that
   wants the network is forbidden, including "check for updates".
2. Real patient text never goes in fixtures, tests, or commits. Use the
   prototype's sample data (John Smith etc.).
3. `APUNTA_FAKE_AI=1` must always keep the entire app runnable and
   demoable with zero AI tooling installed. CI runs everything in fake mode.
4. Server logic stays OS-portable; only `scripts/` and `macos/` (the app
   shell) may assume macOS/Homebrew.
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
- `npm run eval` — model-quality harness over `e2e/fixtures/eval/`; the report
  leads with fabrication rate. `-- --fake` is the CI self-check (it passes when
  the scorer *deflects* on the canned notes, not when everything is clean)
- `npm run check:format` — manual, needs a running Apunta on a real model:
  drafts `e2e/fixtures/her-format/` through whatever format that Apunta has
  and flags routing failures (reported speech in the observation section, a
  risk review flattened to "None.", a dropped cadence decision). Not an eval —
  no rubric, no score; `npm run eval` remains the faithfulness instrument.
  `APUNTA_CHECK_URL=http://127.0.0.1:7720` points it at another instance
- `npm run check:refine` — manual, needs a running Apunta on a real model:
  sends adversarial requests through the refine chat (tone, expand, move,
  question-after-edits) and flags invented content, lost facts, a question
  that rewrote the note, and a move that only copied. Reports separately when
  the server's boilerplate lock had to catch the model
- `npm run probe:claude -- <export.zip|folder>` — manual: reports the *shape*
  of a Claude data export (file names, keys, roles, counts, date range) and
  deliberately none of its content, so M11's inferred schema can be checked
  against a real one. See `docs/agents/M11-claude-import.md`
- `npm run smoke:live` — manual, needs real Ollama + whisper installed
- `bash scripts/setup-macos.sh` — installs the local AI stack (macOS only,
  `--dry-run` works anywhere); `scripts/preflight-macos.sh` is its read-only
  counterpart. Neither has ever run on a Mac —
  see `docs/MANUAL-VERIFICATION.md`
- `npm run package:mac` — builds `Apunta.app` and `Apunta.dmg` (macOS only; it
  refuses elsewhere, and `APUNTA_PACKAGE_ALLOW_NON_MACOS=1 ... -- --dry-run`
  prints the plan). `scripts/uninstall-macos.sh` is the reverse.
  `docs/INSTALL.md` is the non-technical guide; none of it has run on a Mac
- `npm run licenses` — regenerates the npm half of `THIRD-PARTY-LICENSES.md`;
  `npm run lint` fails when it is stale, or on a copyleft dependency

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

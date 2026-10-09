# Apunta — agent guide

**Picking up where the last session left off? Read `docs/HANDOFF.md` first** —
what is built, what is open and who it waits on, and how to run the live
instance. Keep it current in the same commit as the change.

**Setting Apunta up on a freshly installed PC?** Follow `docs/RECOVERY.md`
"Rebuild this Linux PC from zero" end to end.

Local-first therapy-notes app: React SPA in a browser tab, Fastify server on
127.0.0.1, SQLite storage, all AI local (Ollama LLM + whisper.cpp STT).
Master plan: `docs/PLAN.md`. Design reference: `prototype/` (do not modify).
Work packets in `docs/agents/` now run through **M13**. M11 (Claude
conversation import), M12 (Brainstorm), and M13 (Halaxy PDF import) are
built. The owner has approved her Claude export: its shape-only probe is
**GO with preview**, so she may use the Settings preview, untick anything
wrong, merge duplicates, and check draft counts before importing. Agents
must never open or run anything against the real export; synthetic fixtures
only. Mac work is paused for the coming months; the Linux PC remains the
machine running the local AI server. The decontaminated instruction files are
now adopted as the shipped defaults; the owner will be told afterwards.
**Spoken retractions** ("four hours, scratch that, six") are cut out of a
transcript before drafting by the server, on a quote the model supplies and
only where the transcript bears it out (`server/src/ai/retractions.ts`,
`docs/eval-reports/2026-09-06-retraction-pass.md`); what was cut is listed
under the first-pass message in the note's chat.
A **risk review the draft lost entirely** is put back in her own words: the
model points at quotes, the server widens each to her whole sentences and
inserts them labelled "as dictated" (`server/src/ai/risk-review.ts`,
`docs/eval-reports/2026-10-06-risk-review-repair.md`).

## Hard rules

1. **Privacy is the product.** No outbound network calls at runtime, ever —
   only `127.0.0.1`/`localhost`. Never use the browser SpeechRecognition /
   Web Speech API (it can send audio to Google). No telemetry, no crash
   reporting, no CDN assets at runtime (bundle everything), no external fonts.
   A link the user chooses to click is not an outbound call by the app:
   Settings › About names the public repository and opens it in the user's
   browser.

   **The first exception: model acquisition.** The installer
   / first-run component — never the server, never the browser tab — may
   download model weights, provided it (a) runs only when the user explicitly
   starts it, (b) contacts only hosts on the pinned allow-list in
   `installer/src/catalog.ts` (recorded in `docs/decisions.md`), (c) sends no
   user data, no note content, no machine identifier and no query string
   beyond the file path, (d) verifies every download against a pinned
   checksum, and (e) does not run again once the models are there. The
   server's egress guard is not relaxed for this and never should be: the
   downloader is a separate short-lived process, and a test asserts that
   nothing in `server/`, `web/` or `shared/` imports it.

   **The second exception: the desktop updater.** The Tauri shell — never the
   server, never the browser tab — may check for and download a signed update
   (P5.4, C-UPD@1), provided it (a) contacts only the pinned release endpoint
   and the redirect hosts on its allow-list in `src-tauri/` (`github.com`,
   `release-assets.githubusercontent.com`),
   (b) sends no note content, no patient data and no app-generated identifier
   beyond the request metadata any HTTPS request carries, (c) verifies the
   signature against the production public key before keeping a byte, (d)
   can be turned off by the user and is silent when offline, and (e) is inert
   without a configured key. The server's egress guard stays unchanged: no
   route, page or shared module may make an outbound call, and the guard's
   tests hold that. Anything else that wants the network is forbidden.
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
  database. It exits 1 on a database with patients; `npm run seed -- --reset`
  deletes everything and replaces it. Never against the live data dir
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
- `bash scripts/v2/release-linux.sh` — the owner runs this, in their own
  terminal: builds the Linux AppImage on this PC and signs it with
  `tauri signer sign` (it asks for the
  updater key's password), writes and checks `latest.json`
  (`scripts/v2/check-manifest.mjs`), tags `v<version>` and creates a **draft**
  GitHub release with the release notes from `docs/releases/v<version>.md`.
  Installed apps see it only once the owner publishes the draft. Bump every
  version field first; `--no-upload` stops before anything leaves the PC
- `npm run licenses` — regenerates the npm half of `THIRD-PARTY-LICENSES.md`;
  `npm run lint` fails when it is stale, or on a copyleft dependency

## Conventions

v2: the owner merged `feature/v2` into `main` on 2026-09-29 and retired the branch (AM-068); v2 work continues on `main` like everything else. See `docs/v2/`.

- TypeScript strict everywhere; zod schemas in `shared/` are the single
  source of truth for API and LLM-output shapes.
- UUIDv7 ids; UTC ISO-8601 timestamps; SQLite via better-sqlite3 with
  numbered migrations in `server/migrations/`.
- Streaming responses are SSE (`text/event-stream`), event names documented
  in `shared/` types.
- The prototype is historical reference only, and since D15 (2026-09-27) it is
  **superseded as a design source for v2**: the Claude-like UI the owner built
  with a dedicated agent is the interface, not a drift from one. Its tokens and
  copy are still good source material, but **a prototype value is not a
  default** — if a card, token or test names one, re-derive it from `web/` as it
  now stands. Reintroducing a prototype value is a regression, not fidelity.
  (Cards still legitimately use the prototype for one thing: the synthetic
  sample data, John Smith and co, per HS-8.)
- Tests colocated as `*.test.ts`; e2e in `e2e/`. New behavior lands with
  tests in the same commit.
- Commits: imperative subject, body says why.
- **`main` is the one authoritative branch.** No feature branches, no
  inter-packet PRs, one packet in flight at a time. Stage explicit paths,
  never `git add -A`; on a rejected push, `git pull --rebase` and retry —
  never force-push.

## How the owner wants to be worked with

Four standing preferences, recorded here so they survive a cleared session.

- **Lean process (owner decision 2026-10-06).** Implement, run real tests and
  one independent review, then commit. No per-check evidence files, attempt
  counters, dispatch documents or amendment records for routine decisions, and
  no repeated review rounds over small text changes. A small change (a notice, a
  copy edit, a config value) is written directly and checked once. The hard
  rules above (privacy, no real patient text, fake-AI runnable) stay absolute.
  The updater (P5.4) has its production key (2026-10-07,
  `src-tauri/updater.pub`; the private half stays with the owner) but cannot
  download until the repository is public (D3); user-facing work comes first.

- **CI runs on demand, not on every push** (owner decision 2026-10-07: the
  private repo's 2,000 free monthly minutes ran out in six days at ~16 minutes a
  run, and the owner will not pay for more). When a piece of work is finished
  and pushed, start one run with `gh workflow run CI --ref main`, then wait for
  it (`gh run list --limit 3`) before building on it. Never start one for a
  docs-only commit. A red run is a blocking finding for the commit that caused
  it; report it plainly.
- **Every question goes through the multiple-choice tool**, never as free text
  in chat. 2–4 concrete options, **exactly one marked "(Recommended)" and
  listed first**, with a short reason. Batch related questions into one
  interview. Do not ask about anything the repository, an existing decision, or
  this file already answers — resolve that yourself.
- **Claude subagents run only on Sonnet 5.5, never Sonnet 5** (owner decision
  2026-10-06). The Agent tool's `sonnet` alias resolves to Sonnet 5 and cannot
  select 5.5, so do not launch a Sonnet subagent until 5.5 can be chosen
  explicitly; ask the owner instead.
- **Every spawned subagent runs on a free model, chosen per task** (owner
  decision 2026-09-29, replacing the earlier Space-Bunny-only rule). Allowed:
  every `opencode-go/` model with "free" in its id, confirmed $0 on
  opencode.ai/docs/go and models.dev, plus `opencode/big-pickle`. The lineup
  changes weekly, so re-check it each session. Never Claude, GPT or Codex, and
  no other `opencode/` (OpenCode Zen) model, even one marked free. The
  coordinator picks the strongest allowed model at higher effort for hard work,
  and a lighter one for mechanical or review work; if a Go model hits a usage
  limit, it falls back to Big Pickle and tells the owner. Creation details: the
  provider id is `opencode` and the model id keeps its prefix, e.g.
  `opencode/opencode-go/space-bunny-free` (`opencode-go/...` alone is
  **rejected** as "Provider opencode-go is not configured"). `opencode/space-bunny-free`
  is a *different* Zen model, not the Go one. Pass `modeId: "build"`
  explicitly, because an opencode agent cannot inherit a Claude mode.

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

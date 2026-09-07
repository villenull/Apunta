# Where Apunta is — the handoff

**Updated 2026-09-07.** This is the one document to point a fresh session at.
It says what is built, what is open, who each open item waits on, and how to
run things on the machine the live testing happens on. Keep it current: when
you close or open an item, edit it here, in the same commit.

Start a new session with:

> Read CLAUDE.md and docs/HANDOFF.md, then continue from "What is open".
> All work stays on the branch `claude/local-browser-app-planning-0likfi`:
> no feature branches, no PRs, stage explicit paths, never force-push, and
> push when lint, typecheck, tests, build and e2e are green.

Read next, in this order, only as needed: `docs/PLAN.md` §7–8 (milestones,
deferred), `docs/decisions.md` (the tail is the recent history), the newest
report in `docs/eval-reports/`, `docs/MANUAL-VERIFICATION.md` (everything
that needs a Mac). The Claude Code memory directory on the partner's PC
holds session notes too, but it lives outside the repo; a session on another
machine has only this file.

## Who is who

- **The owner** — a therapist, the sole user. Her instructions, her format,
  her answers are in `docs/note-instructions/` and `docs/feedback/`. She has
  not yet used the app herself.
- **The owner's proxy** — her partner, who runs this repo and tests on his
  Linux PC (`fbi-pc`) before anything reaches her Mac. He dictates test
  scripts in his own voice; every request for a recording comes with the full
  script in the message, every time.

## What is built (all packets M0–M11)

Local-first therapy-notes app: React SPA, Fastify on 127.0.0.1:7717, SQLite,
all AI local (Ollama `qwen3.5:4b-q4_K_M` for drafting, whisper.cpp for
speech). CI is green on every push (GitHub Actions, fake AI mode).

Beyond the packets, the live-testing weeks (2026-08-27 → 09-07) added:

- **Three server-side locks on the refine chat**, because the 4B ignores
  prompt rules under a direct command and lies about provenance: the
  published lock, the boilerplate lock (`server/src/ai/refine-guard.ts`) and
  the fact lock (`server/src/ai/fact-guard.ts`). Each appends a sentence to
  the reply; those sentences are stripped from the history the model sees.
- **The retraction pass** (`server/src/ai/retractions.ts`,
  `docs/eval-reports/2026-09-06-retraction-pass.md`): "four hours, scratch
  that, six" is cut out of the transcript before drafting, by the server, on
  a quote the model supplies. Fixture 04 clean; five live takes clean.
- **Live dictation preview** as a growing block (commit-at-pause, small
  whisper model, fitted audio context, greedy, no fallback) and the record
  dot as a presence meter. `--no-timestamps` was found to drop speech; the
  transcript path keeps timestamps and a punctuated lead-in prompt.
- **Her seven-section format measured** (`npm run check:format`) and the
  refine chat measured adversarially (`npm run check:refine`).
- **Dictating into the refine chat** (2026-09-07): a microphone in the
  composer; `POST /api/transcribe/dictation` runs the note model with the
  context fitted to the clip and hands the words back for her to edit. The
  send arrow is now full accent with a white glyph.
- **Import from Claude** (M11): built against an inferred export schema;
  `npm run probe:claude` reports a real export's shape without its content.
- **Remote testing bridge**: Tailscale Serve on the partner's PC, so she can
  try the app from her MacBook before anything is installed on it
  (`docs/dev-notes/remote-testing.md`). Not a change to the app.

Eval, current: corpus fabrication 30.0% (18/60) on the owner's instructions
with the retraction pass; the true baseline before it was 35.0%
(`docs/eval-reports/2026-09-05-retraction-user-turn.md` explains why the
older 40.0% is not comparable). The eval takes 1–2 h of CPU; never run it
while someone is testing on the same machine.

## What is open

Grouped by what each item waits on.

### Waits on the owner

- **The confidentiality decision** on her Claude export (M11 reads her whole
  account). Then `npm run probe:claude -- <export.zip>` to check the schema,
  then `Settings → Import from Claude` on the real export. Nothing about
  this can be done by a session; do not start it.
- **Her transcription vocabulary list** (names, medications, terms). When it
  arrives: `PUT /api/settings` `stt_vocabulary` on the live instance and on
  the config pack (`~/Apunta-config-pack/`, see `docs/MANUAL-VERIFICATION.md`
  §9), then re-cut the pack.
- **Her first real dictations**, which are the only source allowed to grow
  the retraction-marker list (`RETRACTION_MARKER_SOURCE`) and the vocabulary.
- **Her Tailscale invite**, so she can test from her laptop.

### Waits on a Mac

Nothing in `scripts/` or `macos/` or `installer/` has run on a Mac. Work
down `docs/MANUAL-VERIFICATION.md` §1–§9 (preflight, setup script, the app,
backup/restore, LaunchAgent, eval, the installer and `.dmg`, uninstall, the
config pack). `docs/INSTALL.md` is her guide; also unrun. The preview model
(`ggml-small.bin`) is in the installer catalogue and the setup script.

### Model-quality work, packet-sized (measure before and after; report in `docs/eval-reports/`)

- **Intake-side instruction distillation**: fixtures 09/10/16/19 fail on the
  default intake instructions. The M10 report calls it the obvious next job.
- **The worked example leaks into "Note for next session"**: her
  instructions' example ends *"Dana will say if her usual session time stops
  working"*, and a dictation with a cadence decision drafts *"John will say
  if weekly sessions stop working"* (seen 2026-09-05 through 09-07). Fixing
  it means changing her example, which changes every prompt — a full eval,
  overnight.
- **The aside leaks**: "He asked about my holiday, not clinically relevant"
  lands in Discussion on most takes despite the instructions.
- **Restated history invites inference**: "four was back in February"
  drafts as *"down from four in February"* (wrong way round). Drafting-model
  behaviour; see the 09-06 report's costs section.
- **Safety facts** slipped 75% → 70% in the 08-31 instruction revision;
  flagged for the next one.
- **Section-at-a-time drafting**, justified in the M10 report for fixtures
  04/07; the retraction pass took 04's most common failure away, so re-check
  the justification before building it.

### Small things seen live, unfixed

- Whisper appends **"Thank you."** on the silence at the end of a recording
  (2026-09-07). Harmless so far; a trailing-segment strip would fix it, but
  only cut it if her recordings show it too.
- The two-tab test: two recordings at once starve each other's previews
  (CPU). Not a bug to fix; a thing to know.

### The testing docket for the owner's proxy (his PC, no Mac needed)

Every item comes with a full script when it needs his voice.

1. **Dictate into the chat**: open any draft, press the microphone in the
   composer, say a change ("add that he is on sertraline, twenty milligrams"),
   press it again; the words land in the box, then send.
2. **Backup and restore round trip** from Settings, including the wrong
   passphrase.
3. **Import dry run** with `e2e/fixtures/claude-export/sample-export.zip`.
4. **A long recording** (10+ minutes) for the preview's slow-gap mode after
   four minutes, and the final transcription time.
5. Paste-into-Halaxy — human-only, whenever he has Halaxy open.

## Running things on the partner's PC

The live instance is a production build on `127.0.0.1:7717`, data in
`~/.local/share/apunta` (`apunta.db`, `audio/`, `models/`, `bin/whisper-cli`),
log at `/tmp/claude-1000/apunta-live.log` (shape-only by design: bytes,
seconds, token counts, never words). Both the app and Ollama die with the
session that started them.

```sh
# Ollama (the systemd unit needs an interactive polkit prompt; run it as the user)
OLLAMA_MODELS=/var/lib/ollama OLLAMA_HOST=127.0.0.1:11434 setsid nohup ollama serve > /tmp/claude-1000/ollama.log 2>&1 &

# The app — web-only changes need `npm run build --workspace @apunta/web` and a reload;
# server changes need the build and a restart (kill the pid from `ss -ltnp | grep 7717`)
cd ~ && APUNTA_NO_OPEN=1 NODE_USE_SYSTEM_CA=1 setsid nohup node ~/Projects/Apunta/server/dist/index.js >> /tmp/claude-1000/apunta-live.log 2>&1 &

# The gate, in this order; verify by exit code, never by reading piped output
npm run build:shared && npm run typecheck && npm run lint && npm test && npm run build && npm run e2e
```

Never restart the server while a recording is in flight (the log's last line
tells you), and never run the gate or the eval while he is testing: whisper
on a busy CPU makes the preview crawl and the numbers meaningless.

Measurement corpus for the retraction pass: the `transcripts` rows with a
spoken marker in his live database (seven as of 2026-09-06, all fabricated
content read from scripts). The scratch scripts that measured it are in the
session scratchpad, not the repo; the report says what they did.

His runbook for the morning she first tries it: `~/APUNTA-MORNING.md`. The
config pack: `~/Apunta-config-pack/apunta-config-pack.zip`.

## Rules that were learned the hard way (beyond CLAUDE.md)

- On this 4B, a rule in the system prompt loses to the source under it; the
  same rule beside the source in the user turn can win; and any sentence
  added to *every* prompt moves some other fixture. Add a sentence only where
  the source earns it, and measure the whole corpus when you cannot.
- Prompt changes are measured through the provider's own decoding
  (temperature 0, seed 0, `repeat_penalty` 1, `think` off), never through a
  scratch call with other settings — the 4B flips on decoding alone.
- Anything the model must not do is enforced server-side, as a diff the
  model cannot talk past. Never quote a phrase to forbid it.
- Real patient text never enters fixtures, tests, logs or commits. The live
  log is shape-only; keep it that way.
- One recording at a time on one machine. Two starve each other.

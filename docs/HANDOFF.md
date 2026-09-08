# Where Apunta is — the handoff

**Updated 2026-09-08 (source clarification), after the inference-efficiency
and output-truncation reviews.**
This is the one document to point a fresh session at.
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
  composer. While it listens the chat shows the capture screen's own
  recording panel — the dot that breathes with her voice, the timer, the
  provisional words growing as a block — because both now render
  `components/LiveRecording.tsx` on top of `hooks/useLiveRecording.ts`,
  which owns the recorder and the preview loop for both screens. On stop,
  `POST /api/transcribe/dictation` runs the note model with the context
  fitted to the clip and hands the words back into the box for her to edit;
  nothing is sent until she presses the arrow. The send arrow is full accent
  with a white glyph.
- **Spell check in the tab** (2026-09-07): the note body and the capture
  screen's typed-notes box mark misspelt words with a wavy line and offer
  suggestions on a click, from the maintained, permissively licensed,
  bundled American-English Hunspell dictionary `dictionary-en` read by
  `nspell` in the tab (`web/src/lib/speller.ts`). The browser's own checker
  is off on those fields — Chrome's "enhanced" mode would send the text to
  Google. The patient's name, her transcription vocabulary and her "Add to
  dictionary" words (`spelling_words` setting) are never flagged. Unit and
  end-to-end regression coverage uses synthetic text, including American
  spellings (`criticized`, `behavior`, `organize`, `center`) and the expected
  rejection of `criticised`. Not yet covered: the chat box and other short
  fields.
- **Refine safety integration** (2026-09-07): a question (including the
  "What's missing?" quick action) never applies a model-attached rewrite;
  the editor flushes its pending debounce before chat snapshots the note; and
  a rewrite that finishes after a concurrent publish is discarded by a
  draft-only database update. The server-side locks also preserve numbers,
  dates, explicit risk findings, medications and high-confidence names while
  blocking ungrounded clinical boilerplate. Fake mode's Expand plan path
  exercises the same preservation invariant.
- **Clinical-knowledge integration gate** (2026-09-07): local, versioned
  Presentation/MSE and intervention vocabulary is rendered only for authored
  section aliases and never supplies a finding or treatment. Discussion is
  grouped by deterministic neutral themes only when a named Discussion section
  exists; every supplied fact is retained exactly once, and headings are the
  only generated content. No model training, retrieval, raw reference PDF,
  outbound call, or database change is involved. Synthetic acceptance cases
  live in `e2e/fixtures/clinical-knowledge/`.
- **Inference lifecycle and efficiency pass** (2026-09-08): the configured
  absolute live `whisper-cli` path was reconciled with the PATH-only audit;
  preview/fitted dictation now use half-core Whisper contention limits, final
  transcription keeps the full-core authoritative path, and stale preview or
  dictation requests abort through to their child process. Small JSON Ollama
  helpers have bounded output ceilings while note/refine retain 3,072 and
  every helper rejects `done_reason=length`. Linux synthetic evidence and its
  quality limits are in `docs/eval-reports/2026-09-08-inference-efficiency.md`;
  these timings are not Mac claims. The release review also corrected the
  non-streaming detector and retraction-quote paths so a truncated JSON
  response cannot be accepted as a valid result.
- **Independent GPU/release review** (2026-09-08): the Linux ROCm candidate
  was rebuilt with `$ORIGIN` runpaths and installed, without replacing the
  CPU binary, at
  `~/.local/share/apunta/bin/whisper-rocm-371b5a7561823ab2-hip/whisper-cli`.
  Its ggml/whisper shared libraries are beside it; `ldd` resolves those local
  copies and ROCm's system libraries under `/opt/rocm/lib`, with no `/tmp`
  dependency. The candidate is whisper.cpp commit
  `371b5a7561823ab2bb32142d2751e35e7534727b` and SHA-256
  `edb46abf800e5b93d0c1dc1410299d25b33705c7b2e79513fe65a4ca62174e3f`.
  The final detached app now points its `whisper_binary` setting at this
  candidate; the CPU binary remains intact at its original path for rollback.
  Three sequential preview and three final runs per binary on the checked-in
  public 11-second JFK WAV matched the expected transcript after timestamp
  stripping; CPU/GPU preview wall ranges were 700–709/357–443 ms and final
  ranges were 4,827–5,523/424–456 ms. This is one public fixture, not clinical
  equivalence or a global 11× claim; no local synthetic speech generator was
  available, and the fixture contains no clinical terms or numeric token.
  Temporary-port (`17717`) app smoke with a fresh DB passed real Whisper
  preview/dictation and one real Whisper→Ollama draft; SQLite integrity was
  `ok`, and no tested content appeared in the shape-only log. The original
  CPU binary remains at `~/.local/share/apunta/bin/whisper-cli`; rollback is
  `curl -fsS -X PUT http://127.0.0.1:7717/api/settings -H
  'content-type: application/json' --data '{"whisper_binary":"/home/huyke/.local/share/apunta/bin/whisper-cli"}'`.
- **Move-only refine safety review** (2026-09-08): the deterministic shortcut
  now accepts only a complete standalone sentence (or the complete section
  body), so a word or clause cannot be detached from a negation or qualifier;
  dangerous examples such as moving `suicidal` from `not suicidal` fall back
  to the model path. The focused parser/route suite covers 60 cases, including
  clinical-context cuts, exact span conservation and standalone-sentence
  moves.
- **Import from Claude** (M11): built against an inferred export schema;
  `npm run probe:claude` reports a real export's shape without its content.
  The owner clarified that her existing notes span Claude chats **and
  Halaxy**. Her Halaxy account is a **practitioner account, not an admin**;
  do not infer that she can use a practice export. See the wife-facing
  [existing-notes migration guide](import-existing-notes.md) for the current
  source checklists and public-doc research (accessed 2026-09-08).
- **Remote testing bridge**: Tailscale Serve on the partner's PC, so she can
  try the app from her MacBook before anything is installed on it
  (`docs/dev-notes/remote-testing.md`). Not a change to the app.

Eval, current evidence: the fully measured tuned 4B corpus is 35.0% (21/60).
The retraction report's fixture-04 conditional arm moves its three runs from
gated to clean and therefore projects 30.0% (18/60) for the corpus; it was not
a fresh full-corpus rerun. Keep that distinction in release notes and do not
call 30.0% a new end-to-end measurement. The eval takes 1–2 h of CPU; never
run it while someone is testing on the same machine.

Release gate, 2026-09-08 (Linux, fabricated fixtures only): `build:shared`,
all workspace typechecks, lint/format/URL/license checks, 1,173 unit tests,
production build, and 38 Playwright tests passed. (The first parallel e2e
attempt had one timing flake; the repeat completed all 38.) Real local stack smoke was
2/2 schema-valid on `qwen3.5:4b-q4_K_M` (prompt 2,840, output 359, one attempt,
`done_reason=stop`); the checked-in 10-second tone WAV produced “Thank you.”
in 5.5 seconds, which is process/model overhead rather than speech quality.
`check:format` had one known cadence flag; `check:refine` had 0 problems across
8 scenarios (locks fired 3 times as intended). The before/after interpretation
is deliberately narrow: Ollama smoke was 6.4/3.6/3.6 seconds before versus
4.0/3.5 seconds after, so no speedup is claimed; the isolated 8-thread preview
was 0.49 seconds warm versus 0.54 seconds for the selected 4-thread policy,
which is a contention tradeoff, not a faster-preview claim. See the full table
in `docs/eval-reports/2026-09-08-inference-efficiency.md`.

The clinical-knowledge gate has hermetic unit and route coverage under
`server/src/ai/clinical-knowledge/`; it was not treated as a real-model eval.
Run the standard fake-AI gates before any manual model measurement, and never
start the long real eval while live testing is active.

## What is open

Grouped by what each item waits on.

### Waits on the owner

- **The confidentiality decision** on her Claude export (M11 reads her whole
  account). Then `npm run probe:claude -- <export.zip>` to check the schema,
  then `Settings → Import from Claude` on the real export. Nothing about
  this can be done by a session; do not start it.
- **Halaxy source authorization and shape**: public Halaxy documentation
  describes a per-patient clinical-record zip in the UK guide and a full
  practice-data zip that is account-owner/permission-gated in the AU guide.
  It does not establish what this practitioner account can export, what the
  configured practice includes, or the zip's clinical-note/attachment field
  mapping. The practice admin must confirm authorized scope, role permission,
  exact format, dates/client identifiers, versions/drafts/archived records,
  and attachment preservation. Apunta has no Halaxy importer; do not build a
  guessed parser or silently drop PDFs/attachments. Use synthetic fixtures
  only after the real format shape is clarified.
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

- The spell check covers the note body and the typed-notes box; the chat
  composer and the patient-name field still rely on the browser's checker.
  A Settings list for the "Add to dictionary" words does not exist yet; the
  setting is a plain JSON array (`spelling_words`).

- Whisper appends **"Thank you."** on the silence at the end of a recording
  (2026-09-07). Harmless so far; a trailing-segment strip would fix it, but
  only cut it if her recordings show it too.
- The two-tab test: two recordings at once starve each other's previews
  (CPU). Not a bug to fix; a thing to know.
- Refine safety guards are intentionally high-precision heuristics. They can
  miss an unfamiliar medication or an unanchored name, and can hold back a
  shortening when an existing risk, medication or anchored name is removed
  without an explicit request. Review the displayed notice and the full note
  before publishing; the guards are a second line, not a clinical validator.
- The editor flush-before-chat path prevents stale-note rewrites, but a
  failed local save still leaves the chat request available against the last
  server copy; verify the save error before relying on that reply.

### The testing docket for the owner's proxy (his PC, no Mac needed)

Every item comes with a full script when it needs his voice.

1. **Dictate into the chat**: open any draft, press the microphone in the
   composer, say a change ("add that he is on sertraline, twenty milligrams");
   the panel should look exactly like recording a note, words and all; press
   "Stop dictating"; the words land in the box, then send.
2. **The spell check on a real note**: type a typo into a draft
   ("recieved", "definately"), check the wavy mark, click it, take a
   suggestion. "Add to dictionary" on a name or a medication should stop it
   being flagged in every note from then on. It has been checked in a browser
   and by an end-to-end test, never by her or by him on a note he cares about.
3. **Backup and restore round trip** from Settings, including the wrong
   passphrase.
4. **Import dry run** with `e2e/fixtures/claude-export/sample-export.zip`.
5. **A long recording** (10+ minutes) for the preview's slow-gap mode after
   four minutes, and the final transcription time.
6. Paste-into-Halaxy — human-only, whenever he has Halaxy open.

## Running things on the partner's PC

The live instance is a detached production build on `127.0.0.1:7717`, data in
`~/.local/share/apunta` (`apunta.db`, `audio/`, `models/`, `bin/whisper-cli`),
log at `/tmp/claude-1000/apunta-live.log` (shape-only by design: bytes,
seconds, token counts, never words). The Linux release process is detached
from the agent terminal under the user systemd session; the Mac LaunchAgent
still awaits the checklist below.

```sh
# Ollama (the systemd unit needs an interactive polkit prompt; run it as the user)
OLLAMA_MODELS=/var/lib/ollama OLLAMA_HOST=127.0.0.1:11434 setsid nohup ollama serve > /tmp/claude-1000/ollama.log 2>&1 &

# The app — web-only changes need `npm run build --workspace @apunta/web` and a reload;
# server changes need the build and a restart only while no recording is active.
cd /home/huyke/orca/workspaces/Apunta/Apunta
npm run build
# Confirm no whisper child is active, then TERM the pid from `ss -ltnp | grep 7717`.
APUNTA_NO_OPEN=1 NODE_ENV=production setsid nohup node server/dist/index.js >> /tmp/claude-1000/apunta-live.log 2>&1 </dev/null &
curl -fsS http://127.0.0.1:7717/api/health

# The gate, in this order; verify by exit code, never by reading piped output
npm run build:shared && npm run typecheck && npm run lint && npm test && npm run build && npm run e2e
```

The 2026-09-08 deployment preserved the existing database, audio directory,
settings and model paths; health returned fake AI off, migration level 3,
Ollama reachable/model present, Whisper binary/model present, and SQLite
integrity `ok`. It is reachable at `http://127.0.0.1:7717`. This is Linux
evidence only: no Mac shell, Metal, FileVault, LaunchAgent, installer,
standalone decrypt script, or `.dmg` run is claimed; complete
`docs/MANUAL-VERIFICATION.md` §1–§9 before real notes reach the Mac.

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

# Where Apunta is — the handoff

**Updated 2026-09-22, after the drafting model took over deciding whether
Discussion has genuinely distinct subtopics: grounded model-written labels
are normalized to short lowercase label lines, while a single topic remains
plain prose. The owner's own progress note is the app default: first-run
onboarding offers it first, `npm run seed` creates it, and her seven-section
format drafts with her instructions (`docs/decisions.md`, 2026-09-22).
Before that, 2026-09-21: the refine chat lost its quick actions and gained
the patient's other notes as read-only background, and Brainstorm began
reading every note that fits.**
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

## What is built (all packets M0–M12)

Local-first therapy-notes app: React SPA, Fastify on 127.0.0.1:7717, SQLite,
all AI local (Ollama `qwen3.5:4b-q4_K_M` for drafting, whisper.cpp for
speech). CI is green on every push (GitHub Actions, fake AI mode).

Beyond the packets, the live-testing weeks (2026-08-27 → 09-07) added:

- **Four server-side locks on the refine chat**, because the 4B ignores
  prompt rules under a direct command and lies about provenance: the
  published lock, the boilerplate lock (`server/src/ai/refine-guard.ts`),
  the fact lock (`server/src/ai/fact-guard.ts`) and, since 2026-09-21, the
  prior-note lock (`server/src/ai/prior-note-guard.ts`). Each appends a
  sentence to the reply; those sentences are stripped from the history the
  model sees.
- **The refine chat reads her other notes** (2026-09-21, owner): the
  patient's other notes, newest first, go in as fenced READ-ONLY background
  (before the note, so Ollama can reuse the prefix; at most 4,096 estimated
  tokens, and only what the note, the thread and her message leave of the
  refine budget — fitted by Brainstorm's `ai/prior-notes.ts`). The rule is in
  the system block and restated beside her message. The prior-note lock
  holds back any revised section that gains a fact or a five-word run only
  another note contains, unless her message asks to bring something over
  from another session ("bring … from last session"). Measured on the real
  4B: `docs/eval-reports/2026-09-21-refine-background.md`.
- **Her progress note is the default** (2026-09-22, owner): `Progress note`
  with Location, Client presentation, Risk review, Discussion, Intervention,
  Out of session actions, Note for next session, and the drafting
  instructions of `docs/note-instructions/owner-progress-instructions.md`,
  bundled as `OWNER_PROGRESS_INSTRUCTIONS` in
  `server/src/ai/default-instructions.ts` (a test fails if the two differ;
  the sections are `STANDARD_PROGRESS_FORMAT` in `shared/`). First-run
  onboarding offers it first and preselected (`POST /api/formats/standard`
  writes her instructions onto the format); the template, examples and
  describe paths remain. The generic SOAP instructions stay for a format
  whose sections are exactly SOAP; a "Progress note" with any other sections
  now defaults to hers. Fake mode drafts her sections from canned prototype
  notes. `npm run seed` builds this format too and **refuses, exit 1, a
  database that has patients** unless `--reset` is given: on 2026-09-21
  seeding over her live database replaced her format with SOAP.
- **The retraction pass** (`server/src/ai/retractions.ts`,
  `docs/eval-reports/2026-09-06-retraction-pass.md`): "four hours, scratch
  that, six" is cut out of the transcript before drafting, by the server, on
  a quote the model supplies. Fixture 04 clean; five live takes clean.
- **Live dictation preview** as a growing block (commit-at-pause, fitted
  audio context, greedy, no fallback) and the record dot as a presence meter.
  Since 2026-09-20 the preview and the note's transcript run on one
  English-only file, `ggml-tiny.en.bin` (~75 MB): dictation here is English
  only, and the preview is not the record, so first run downloads one whisper
  model instead of two (`docs/decisions.md`, 2026-09-20). It was measured on
  real whisper the same day: weak on drug names, kept knowingly. See "What is
  open".
  `--no-timestamps` was found to drop speech; the transcript path keeps
  timestamps and a punctuated lead-in prompt.
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
- **Settings, reordered then redesigned labels-only** (2026-09-21, owner):
  Appearance (Colour, Font size, Animations switch — no hint text, the label
  alone suffices), then Note formats (with "Add another format" as the
  card's last row), then a one-line Backup card ("Last backup: … · Back up
  now · Restore", speaking up only when stale or failing), then Import from
  Claude as a link row, then a folded-shut Advanced disclosure holding the
  backup folder/passphrase/archives/restore-tested/retention and
  Setup/About/Licences. Text appears only where omitting it risks her data.
  Appearance has the accent colour, **text size** (Small / Default / Large / Extra
  large: one `--font-scale` token multiplies every `font-size` in the
  stylesheets) and **animations** on/off (a `no-motion` root class; unset
  follows the system's reduced-motion). All three are server settings
  applied at startup like the colour, so a brief flash of the default
  colour and size on load remains; the system's reduced-motion applies
  before the first frame.
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
- **Refine safety integration** (2026-09-07): a question never applies a
  model-attached rewrite;
  the editor flushes its pending debounce before chat snapshots the note; and
  a rewrite that finishes after a concurrent publish is discarded by a
  draft-only database update. The server-side locks also preserve numbers,
  dates, explicit risk findings, medications and high-confidence names while
  blocking ungrounded clinical boilerplate. Fake mode's "expand the plan"
  path exercises the same preservation invariant.
- **The refine chat is just a chat** (2026-09-21, owner): the four
  quick-action buttons (Shorter / More clinical / Expand plan / What's
  missing?) are gone; she types or dictates. Deviates from the prototype
  (`docs/decisions.md`, 2026-09-21).
- **Clinical-knowledge integration gate** (2026-09-07): local, versioned
  Presentation/MSE and intervention vocabulary is rendered only for authored
  section aliases and never supplies a finding or treatment. Since 2026-09-22
  the model decides from her typed notes and retraction-cleaned transcript
  whether Discussion contains genuinely distinct topics. With two or more,
  it writes short topic labels that the server grounds in her source,
  normalizes to lowercase `label:` lines, and streams exactly as persisted.
  With one topic it writes one unheaded prose block. A lone, duplicate,
  reserved-section, generic, or ungrounded label is removed without dropping
  the model's sentences; refine-chat labels are grounded only in current note
  bodies, the current message, and an exact current-note quote, never format
  headers or raw transcripts. The retired deterministic generic-theme
  grouper and `Other discussion` catch-all are gone (`docs/decisions.md`,
  2026-09-22). No model training, retrieval, raw reference PDF, outbound call,
  or database change is involved. Synthetic acceptance cases live in
  `e2e/fixtures/clinical-knowledge/`.
- **GitHub README presentation (2026-09-22):** `README.md` now has the
  centered existing mark/title, factual pre-release/platform/local-AI badges,
  concise privacy/setup/status copy, a hero, and five synthetic-only feature
  rows. Media is in asset-only commit `b935789`; feature 1 is a recording-panel
  illustration with no real audio/transcript, and feature 3's fake refine run
  returned no edits. GitHub-flavoured Markdown was rendered at 1440 px and
  390 px with all local assets loading and no horizontal overflow.
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
  ranges were 4,827–5,523/424–456 ms, on the models current that day
  (`large-v3-turbo` for the note, `ggml-small` for the preview); nothing has
  been re-timed since the 2026-09-20 switch to `tiny.en`, so do not read those
  numbers as today's. This is one public fixture, not clinical equivalence or
  a global 11× claim; no local synthetic speech generator was available, and
  the fixture contains no clinical terms or numeric token.
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
- **Brainstorm** (M12, 2026-09-21): a per-patient chat with the local model,
  opened from "Brainstorm" above "Treatment plan" into `?view=brainstorm`.
  Open discussion with **all** of the patient's notes eligible as context
  (owner, 2026-09-21; no lookback cap) — newest first, as many as fit a
  13,824-token prompt budget (`brainstormPromptTokens`; oldest turns go
  first, then oldest notes, whole notes only; a note too long to fit alone
  is skipped). A collapsible Context line says which notes the model was
  given and, when some did not fit, says so ("Using the 12 most recent of 30
  notes"); the model is told too, so "not in the notes" is not read as "never
  happened". Not measured on a Mac: a full prompt is ~12k real tokens, so
  the first reply on a long history waits on prompt evaluation. Its composer
  wears the refine chat's microphone and send arrow (owner, 2026-09-22; one
  shared `ComposerButtons` + `useDictation`): local-whisper dictation into
  the box, and the arrow becomes a Stop square while a reply streams. One saved conversation per
  patient (SQLite, cascades on delete, kept on archive, keeps an import
  patient on undo), "New conversation" behind a confirm. Nothing from it is
  ever written into a note, plan, briefing or patient — the endpoint has no
  write path to any of them, asserted against the database — and the prompt
  tells the model to keep the notes apart from general ideas and to say when
  something is not in the notes rather than guess. Replies render as Markdown
  through an in-house renderer that builds React text nodes only, so no reply
  can smuggle in an element. Enter sends, Shift+Enter breaks the line, Stop
  abandons the reply; fake mode streams a canned thought.
- **Import from Claude** (M11): **automatic** since 2026-09-21, by the
  owner's choice. Imports every patient with a session since a cutoff
  (default 2026-07-01) with their whole history, one draft per session
  (6-hour gap), Claude's last reply as the body by default. A conversation
  must have 2+ sessions, note-shaped replies and a confident name (optional
  list, else the title); anything else is skipped and reported by reason,
  date and count only. Every run is an undoable batch, re-runs skip what
  is already imported. Title-guessed names are still flagged in the database
  (`patients.name_guessed`) but, at the owner's request (2026-09-21), the
  list no longer shows a badge; any patient can be renamed from the row's
  hover **Rename** action, which also clears the flag. The real export's shape was probed (one
  `conversations.json`, 508 conversations, the inferred schema holds);
  `npm run probe:claude` now also reports per-conversation size, attachment
  use, branch points and how the 6-hour gap and the cutoff cut the export —
  read that on the real file before the first real run, since every
  threshold was set on synthetic fixtures.
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

## Latest integrated round — verification and limits

The 2026-09-22 integration is on
`claude/local-browser-app-planning-0likfi` through commit `7141504`
(`b935789` README media, `e346946` grounded Discussion subtopics,
`3aa09d5` stale dictation-preview reconciliation, `f30c14f` README,
`7141504` local-AI efficiency research). Local lint, typecheck, unit and
integration tests, production build, and Playwright all passed; Playwright
was **39/39** after installing the pinned browser. GitHub Actions run
[`35749958171`](https://github.com/villenull/Apunta/actions/runs/35749958171)
also passed lint, typecheck, unit/integration, build, the fake eval
self-check, and end-to-end tests.

That evidence is automated and synthetic. It does **not** establish a real
microphone transition, the owner's speaking patterns, topic boundaries on
her sessions, Metal/RAM/thermal behavior on the target Mac, or the quality,
latency, memory use, schema behavior, license compatibility, or endpoint
compatibility of any candidate model in
`docs/research/local-ai-efficiency-2026-09-22.md`. No candidate was
downloaded, run, or made the default.

## Next session — do these in order

### A. Hands-on acceptance of the integrated product changes

Use only invented scripts and the prototype's John Smith/Maria Ruiz/Ana
Torres samples. Never dictate real patient material into a test, screenshot,
log, or issue.

1. **Real dictation transition:** in New note, speak one invented sentence
   once, pause through at least one provisional preview, then stop. Confirm
   the provisional text is replaced by the final text without duplication.
   Repeat with a sentence that deliberately says the same phrase twice;
   both intentional repetitions must remain. Repeat start → stop → start and
   cancel → start transitions; words from the earlier recording must not
   return. Do the same once with the refine-chat microphone. The regression
   test covers a stale response after the cursor advances, but no live
   microphone was exercised in the integrated round.
2. **Grounded Discussion:** create one invented single-topic note and one
   invented note with two clearly separate topics. The first must be one
   prose block under Discussion; the second should use short lowercase
   `label:` lines named from the narration. Try a retraction ("work stress —
   scratch that") and confirm the withdrawn phrase cannot become a label.
   In refine chat, ask for a second subtopic whose name appears only in a
   section header or older raw wording; it must not survive. Read the whole
   note to confirm no sentence disappeared when a label was removed.
3. **GitHub presentation:** open the pushed README on GitHub at desktop and
   narrow/mobile width. Confirm one centered title, the hero, all five GIF
   rows and PNG fallbacks, working documentation links, no horizontal
   overflow, and only synthetic names. The local GitHub-Markdown render
   already passed at 1440 px and 390 px; this is the hosted-page acceptance.
4. Record outcomes here. A failure in these manual checks is a product bug
   even though the automated gates above are green.

### B. Controlled local-AI experiments — only after A

Read `docs/research/local-ai-efficiency-2026-09-22.md` first; its evidence
labels, candidate table, isolation rules, acceptance metrics, source
register, and endpoint traps are part of the procedure.

1. Freeze the current `qwen3.5:4b-q4_K_M`/`ggml-tiny.en.bin` control,
   runtime version, model digest, instructions, synthetic corpus, machine
   state, cold/warm condition, latency, peak memory, retries, and output.
   `npm run smoke:live -- --model qwen3.5:4b-q4_K_M --runs 5` is the
   provider/schema smoke, not the clinical-quality result.
2. Run the **no-download vocabulary experiment first** on invented audio:
   unchanged `tiny.en` and decoding, paired runs without a vocabulary, with
   a short relevant vocabulary, and with plausible unspoken distractors.
   Score WER, exact clinical entities, numbers/units, negation, additions,
   preview stability, stop-to-final latency, and peak memory. Do not put a
   real vocabulary into the live settings until the owner supplies and
   approves it.
3. Only with explicit model-acquisition authorization, compare the exact
   official `qwen3.5:2b-q4_K_M` artifact against the frozen 4B control.
   Bonsai follows only as `prism-ml/Bonsai-8B-gguf` /
   `Bonsai-8B-Q1_0.gguf`; the optional smaller arm is
   `prism-ml/Bonsai-4B-gguf` / `Bonsai-4B-Q1_0.gguf`. Before either, verify
   the exact file and digest, Apache-2.0 license, prompt template, stop
   tokens, JSON-schema output, context/KV behavior, and Q1_0 runtime
   backend. A llama.cpp OpenAI-compatible endpoint is **not** a drop-in
   replacement for Apunta's Ollama-native `/api/chat`; do not route a
   standard run to it by assumption.
4. For every compatible LLM arm, run the existing synthetic gates (replace
   `<exact-tag>` only with the tag actually served by the compatible
   runtime):
+
   ```sh
   npm run smoke:live -- --model <exact-tag> --runs 5
   npm run eval -- --models <exact-tag> --runs 3 --instructions docs/note-instructions/owner-progress-instructions.md
   npm run check:format
   npm run check:refine
   ```
   Then add hand review, latency and peak-memory capture. Set
   `APUNTA_CHECK_URL` for the two check
   scripts to a disposable instance with a fresh data directory. The eval
   CLI does **not** honor `APUNTA_OLLAMA_URL`; use the default service only
   in an explicitly coordinated exclusive window, or first build a
   throwaway runner around `runEval({ ollamaUrl: ... })`.
5. Reject a candidate for any fabrication increase, lost or added clinical
   fact, worse risk/negation/number retention, schema/retry regression,
   unacceptable latency/memory, incompatible license/runtime, or failure on
   the target Mac. Do not switch the default from measured speed or download
   size alone. A Linux pass is screening evidence, never Mac acceptance.

The next agent can immediately execute A with synthetic scripts and prepare
the vocabulary A/B harness. Model downloads, model-server changes and any
default switch remain gated on explicit authorization; target-Mac checks
remain under `docs/MANUAL-VERIFICATION.md`.

## What is open

Grouped by what each item waits on.

### Waits on the owner

- **Discussion subtopics in her live notes.** The 2026-09-22 implementation
  now has the model infer genuinely distinct topics from her narration and
  writes short lowercase `label:` lines only when there are at least two.
  The server grounds every label in her current-session material and removes
  a lone or unsupported label without dropping the prose. Automated synthetic
  coverage is green; her first live draft remains the human check that the 4B
  finds the boundaries she expects and does not over-split.

- **The confidentiality decision** on her Claude export (M11 reads her whole
  account). Then the orchestrator runs `npm run probe:claude -- <export.zip>`
  and checks the new per-conversation section (sessions per conversation,
  "active since 2026-07-01 … with 2+ sessions" should be near her ~25
  patients), then she follows `docs/import-existing-notes.md` step 2. No
  session may open, list or run anything against the real export
  (`~/apunta-migration/`); build and test on synthetic fixtures only.
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
- **Her transcription vocabulary list** (names, medications, terms):
  promised, not yet sent, and **now the cheapest mitigation measured** for
  `tiny.en`, not a nice-to-have. On the 2026-09-20 synthetic test, six prompted
  terms took exact drug/clinical recall from 1/7 to 3/7 and more than halved
  WER (14.1% → 6.5%), with no new model and no download
  (`docs/eval-reports/2026-09-20-tiny-en-clinical-vocabulary.md`). Its limit:
  the hint is a closed set. `akathisia` was not listed and failed in every
  arm at every model size, so a term she does not think to list stays wrong.
  Ask her for the terms she actually says, jargon as well as drug names. When
  it arrives: `PUT /api/settings` `stt_vocabulary` on the live instance and on
  the config pack (`~/Apunta-config-pack/`, see `docs/MANUAL-VERIFICATION.md`
  §9), then re-cut the pack.
  **There is no UI way to act on it any more:** Settings → Recording (the
  *Words to listen for* list and *Keep the recording after transcribing*)
  and Settings → Your details were removed from the screen on 2026-09-21 at
  the owner's request (`docs/decisions.md`). Only the UI went; the settings,
  the API and any stored values are untouched, so a vocabulary already saved
  still reaches whisper and the rest fall back to their defaults (keep audio
  off, plan review every 90 days, 5 notes read for a briefing). Putting the
  list in is `PUT /api/settings` only, or reverting that commit's web half.
- **Her first real dictations**, which are the only source allowed to grow
  the retraction-marker list (`RETRACTION_MARKER_SOURCE`) and the vocabulary.
- **Her Tailscale invite**, so she can test from her laptop.

### Waits on a Mac

Nothing in `scripts/` or `macos/` or `installer/` has run on a Mac. Work
down `docs/MANUAL-VERIFICATION.md` §1–§9 (preflight, setup script, the app,
backup/restore, LaunchAgent, eval, the installer and `.dmg`, uninstall, the
config pack). `docs/INSTALL.md` is her guide; also unrun. The speech model in
the installer catalogue and the setup script is now a single English-only
`ggml-tiny.en.bin` (~75 MB, 77,704,715 bytes) serving **both** the live preview
and the note's transcript; `installer/src/plan.ts` marks the preview step not
needed when the filenames match, so §7.3's first-run window should list two
downloads, not three, and count the whisper file once.

**That switch has now run on the Linux test PC (2026-09-20), never on her
Mac.** The pin is verified: the published SHA-1 and Apunta's SHA-256 match a
real 77,704,715-byte copy. The first real `tiny.en` transcripts were measured
on synthetic TTS audio
(`docs/eval-reports/2026-09-20-tiny-en-clinical-vocabulary.md`): prose,
doses and the risk negation came through, but **1 of 7 drug/clinical terms**
was exact on today's configuration, and the misses are fluent ("Thus, Byron
15 milligrams" for buspirone). The owner **kept `tiny.en` knowingly**
(`docs/decisions.md`, 2026-09-20): she is a psychotherapist, not a
prescriber, and drug names are rare in her notes. Do not "fix" this without
new evidence from her real dictations. That audio was a clean synthetic
floor, so her real dictations decide whether the call holds. If it does not,
the revert path is in the report: `WHISPER_MODEL_FILENAME` in
`shared/src/transcribe.ts`, the `catalog.ts` entry and its hashes, and the
setup/preflight scripts.

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
4. **Import dry run** with `e2e/fixtures/claude-export/patient-chats.json`:
   expect 7 notes for John, Maria (1) and Maria (2), four skipped; untick
   one, import, rename a guessed patient from the row's **Rename**, then undo.
   The Playwright coverage now passes locally and in CI; the proxy's
   hands-on dry run remains pending.
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

Both Paseo workspace records currently point to this same local checkout;
there is no second worktree to recover. Removing the Paseo workspace records
must not be mistaken for backing up or deleting Apunta's data. The live
SQLite database, WAL/SHM files, audio, encrypted backups and whisper model
are outside Git under `~/.local/share/apunta/`; the real Claude export, local
runbook/config pack, Ollama models and agent/session history also live
outside this checkout. Do not delete those paths during Paseo cleanup, and
never open the real export for verification. GitHub contains none of that
state.

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
- Never run `npm run seed` (least of all `--reset`) against the live data
  dir: it deletes every patient, note and setting. On 2026-09-21 it
  replaced her format with SOAP. Use a throwaway `APUNTA_DATA_DIR` in
  `/tmp`; seed now exits 1 on any database with patients.

# Where Apunta is — the handoff

**Updated 2026-09-22.** Git now contains the sanitized machine-readable
reference configuration and executable Linux recovery path needed to
recreate the current app after a reset (`docs/RECOVERY.md`,
`config/recovery/current-linux.json`). It records the exact current writing
and speech weights, observed runtime versions and hashes, provider limits,
effective settings and note instructions without patient content. Before
that, the drafting model took over deciding whether Discussion has genuinely
distinct subtopics: grounded model-written labels are normalized to short
lowercase label lines, while a single topic remains plain prose.
This is the one document to point a fresh session at.
It says what is built, what is open, who each open item waits on, and how to
run things on the machine the live testing happens on. Keep it current: when
you close or open an item, edit it here, in the same commit.

Start a new session with:

> Read CLAUDE.md, docs/RECOVERY.md and docs/HANDOFF.md. First establish
> recovery readiness without opening patient data or downloading models
> without explicit authorization. Then continue the ordered acceptance and
> research work under "Next session". All work stays on `main`: no feature
> branches, no PRs,
> stage explicit paths, never force-push, and push only after the relevant
> gates are green.

Read next, in this order, only as needed: `docs/PLAN.md` §7–8 (milestones,
deferred), `docs/decisions.md` (the tail is the recent history), the newest
report in `docs/eval-reports/`, `docs/MANUAL-VERIFICATION.md` (everything
that needs a Mac). Essential recovery state is committed; Paseo or Claude
agent history is not a prerequisite.

## The two priorities

1. **Recreate today's sanitized app on a fresh PC.** Start with
   `docs/RECOVERY.md` and `config/recovery/current-linux.json`. Git contains
   the exact current progress-note sections and stored instructions, the
   other non-patient configuration, runtime/model identities and checksums,
   and an executable clean-database recovery tool. It deliberately contains
   no confidential patients, notes, transcripts, chats, recordings, Claude
   export, backup paths, secrets, or patient-derived vocabulary. Never copy,
   reset, inspect or export the patient-loaded database to prove recovery.
2. **Then measure the local AI without changing defaults prematurely.**
   Preserve the grounded Discussion/refine/retraction acceptance gate first.
   The current round authorizes a four-arm local LLM comparison only:
   `qwen3.5:4b-q4_K_M` control, `qwen3.5:2b-q4_K_M`,
   `prism-ml/Bonsai-8B-gguf` (`Bonsai-8B-Q1_0.gguf`), and
   `prism-ml/Bonsai-4B-gguf` (`Bonsai-4B-Q1_0.gguf`). Clinical safety remains
   the gate: retain negation, quantities, supplied facts and ordinary-language
   fidelity. Synthetic acceptance is sufficient for this round; physical
   microphone acceptance is waived. No candidate is the current default, and
   no work-in-progress result is a pass claim.

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
- **README presentation supersession (2026-09-22):** The feature demos now use
  the requested 35/65 side-by-side table, focused synthetic GIF/PNG crops,
  reduced-motion fallbacks and **Finish & copy** wording; the brief stacked
  layout described above is superseded. Headless GitHub-Markdown renders at
  1440 px and 390 px verified five GIF/PNG loads, no feature-title anchors and
  no horizontal overflow. On phones, the table necessarily makes the media
  smaller than the desktop presentation.
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
- **Remote testing is not an active path.** The former Tailscale bridge and
  pending invite are retained only as historical context in
  `docs/dev-notes/remote-testing.md`; no invite or remote-testing setup is
  pending, and no remote service is changed here.

The prior 2026-09-08 tuned-4B configuration measured 35.0% (21/60) on
its own corpus. The 2026-09-22 retraction report's fixture-04 conditional
arm projects 30.0% (18/60) under a different setup; it was not a fresh
full-corpus rerun and is not an improvement claim. Keep the configurations
and artifact scopes distinct in release notes. The eval takes 1–2 h of CPU;
never run it while someone is testing on the same machine.

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

The 2026-09-22 acceptance and comparison round is recorded in:

- `docs/eval-reports/2026-09-22-synthetic-acceptance.md`
- `docs/eval-reports/2026-09-22-four-model-comparison.md`
- `docs/eval-reports/2026-09-22-whisper-silence.md`

Linux-only disposable evidence now includes real Chromium `MediaRecorder`
capture through synthetic microphone input, local Whisper, and the current
4B model, including the refine-chat microphone. Physical microphone, room,
owner-speaking-pattern and Mac acceptance remain waived/unrun. The final
bounded browser run stopped at 20,509 ms and received one 20.22-second
recording with no fake-device loop. Whisper rendered `scratched that`, while
the narrow marker recognizer matches `scratch that`; no retraction extraction
ran. The subsequent 4B draft reversed the spoken correction (six → four)
and retained withdrawn morning-meeting wording. This is a strict
retraction/number blocker, not a pass.
The strict-failure follow-up is now fixed in the retraction pass:
`server/src/ai/retractions.ts` shares marker discovery between detection and
application and recognizes Whisper's observed `scratched that` inflection
without changing `RETRACTION_MARKER_SOURCE` or weakening verbatim/proximity
checks. The focused synthetic suite is **16/16**; raw acceptance/model
artifacts remain unchanged. See
`docs/eval-reports/2026-09-22-retraction-strict-fix.md`. Re-run the focused
acceptance on a disposable port before treating the end-to-end blocker as
closed.

The current-control Discussion matrix is **3 pass / 1 fail**: the two-topic
case emitted zero required lowercase source-grounded label lines. The
four-arm comparison completed for the exact authorized candidates and valid
runtime aliases. Its corpus favours the current `qwen3.5:4b-q4_K_M` control
(18/60 fabrication flags, 42/60 gated runs, 42/60 safety facts, 54/60
retraction/negation) over qwen2, Bonsai 8B Q1_0 and Bonsai 4B Q1_0. All four
passed transport/schema smoke. Valid app checks were control 0/6 format flags
and 1/13 refine problems, qwen2 5/6 and 8/13, Bonsai 8B 6/6 and 5/13, and
Bonsai 4B 2/6 and 10/13; these are inspection prompts, not quality scores.
All four still failed the strict same-transcript retraction gate. The control's
refine checks preserved facts under the label-only/header request without
applying the requested header formatting; the explicit old-wording
reintroduction was an authorized control, and the separate neutral request
passed without resurrecting the withdrawn morning topic. Keep the control with
**no automatic model switch**.
Synthetic Discussion follow-up is complete. The server now normalizes
lowercase inline labels such as `sleep: …` into standalone short lowercase
`label:` lines, grounds them in current-session material, and removes lone,
unsupported, reserved or inflectionally duplicate labels without dropping
prose. A synthetic two-topic unlabeled response remains prose because the
server cannot safely infer a split. An extra prompt sentence asking the 4B not
to flatten genuinely distinct topics was tried on disposable ports 7794/7795
and reverted: both runs had 0 format flags, single-topic fixtures did not
over-split, and the 4B still emitted zero labels for a direct two-topic
synthetic request. The 4B therefore does not split topics on its own; retain
the human live-note check. Evidence:
`docs/eval-reports/2026-09-22-discussion-subtopics-fix.md`.

Whisper's narrow mitigation trims only exact digital-zero tails and rejects
all-zero input; the focused suite is 44/44 and genuine quiet speech,
repetitions and “Thank you.” remain. It is not universal VAD: nonzero-tail
hallucination remains unclosed and needs a current-stack non-silent
reproducer plus matched quiet control before any filter is considered.

The README was rendered through authenticated GitHub Markdown API at desktop
and narrow widths with all five focused synthetic media assets, reduced-motion
PNG fallbacks and no overflow. Direct hosted-page verification was **not
possible** because this repository is private and unauthenticated/browser
page access returned GitHub 404; the authenticated API render is the
reproducible substitute, not a hosted-page pass. The latest web bundle was
built, but the live backend on 7717 was not restarted; no live settings,
database, model or patient data changed.

The saved-note UI proof covered aligned desktop headers, narrow refine sheet,
delayed A → undo X persistence, Finish & copy, PATCH failure/retry, and native
clipboard recovery. In a hidden Chromium context, granting all three
clipboard permissions (`clipboard-read`, `clipboard-write`, and
`clipboard-sanitized-write`) on `http://127.0.0.1:7797` allowed an initial
sentinel write/read. A synthetic failed PATCH then left the UI at
“Couldn’t save”, the disposable database unchanged, and the sentinel still on
the native clipboard. After retrying the same changed body, the UI and
database both showed `Saved`; clicking the real **Finish & copy** action
published and locked the note, and a read-only native clipboard read exactly
matched the current editor body and persisted database content. No direct
clipboard write was used after the initial sentinel.

Previous fake-AI/automated evidence remains historical; it does not override
these real-model failures. No candidate is clinically cleared.

## Next session — do these in order

1. Keep `qwen3.5:4b-q4_K_M` as the default. Do not switch models or add
   vocabulary work from the comparison alone.
2. Review the strict retraction failure and the two-topic/header-formatting
   Discussion findings with synthetic fixtures before any production change.
   The retraction strict-fix now recognizes the observed ASR inflection;
   preserve the raw artifacts and rerun focused acceptance on disposable
   ports before treating either finding as closed.
3. The owner has approved confidentiality for her Claude export. The
   shape-only probe verdict is **GO with an instruction**; read
   `docs/eval-reports/2026-09-22-claude-export-probe.md`. She can proceed to
   step 2 of `docs/import-existing-notes.md`, but must review the Settings
   preview, untick anything that is not a patient, merge duplicate patients,
   and check the draft counts before importing. Agents must never open, list,
   read or import the real export.
4. Continue M13, the Halaxy PDF importer, against the authored synthetic
   text-based PDF fixture only. Do not wait for or request a real Halaxy
   export.
5. Leave the exact-zero Whisper mitigation narrow. Do not add VAD/noise
   suppression without the missing non-silent reproducer and quiet control.
6. Mac work is paused for the coming months by the owner's decision. Keep the
   Linux PC as the machine running the local AI server; resume the Mac-only
   checklist only when she reopens that work.
7. The hosted README still needs a real authenticated browser page check if
   repository visibility/access changes; the API-render substitute above must
   not be relabeled as hosted acceptance.


## What is open

Grouped by what each item waits on.
**Explicitly removed from the active backlog (owner decision 2026-09-22):**
complex-medical-vocabulary acquisition/experiments/optimization, a Settings
UI for managing added dictionary words, and the Tailscale invite/remote-testing
setup. Existing `stt_vocabulary` and `spelling_words` settings, the inline
spell-check "Add to dictionary" behavior, the clinical-knowledge safety
checks, and the historical measurements remain retained; none is a pending
task.

### In progress

- **Halaxy PDF importer (M13).** HalaxyServer and HalaxyWeb are implementing
  the local, text-based PDF flow against a synthetic John Smith fixture:
  preview first, allow patient-name edits and note unticking, then import
  selected notes as published history in one undoable batch. Scanned or
  imageless PDFs are rejected clearly; attachments, letters and images are
  text-only non-goals. No real Halaxy export is needed or permitted.
The Halaxy server/shared slice is now ready: `shared/src/halaxy.ts` defines
the preview/request/response schemas and size limits; the local parser handles
AU/UK date headings, repeated page furniture and page numbers, page-break
notes, and missing patient/session text. It keeps PDFs in memory, writes
published notes in one `source=halaxy` undo batch, and the existing undo route
removes those published rows. The generated synthetic
`e2e/fixtures/halaxy/john-smith.pdf` has three pages, three sessions and a
split note; the focused server/shared suite is 26 tests. Web preview/import
work remains in progress. No real Halaxy export was opened.

### Approved, next action
- **Claude export confidentiality is approved.** ClaudeProbe's shape-only
  report is **GO with an instruction**: its focused synthetic proof is 37/37,
  including three fabricated plans and seven drafts after decoys. The real
  shape has 45 conversations with 2+ sessions, only an upper bound versus the
  owner's ~25 patients. Shape-only data cannot distinguish non-patient/
  general/instruction chats, several conversations for one patient, or
  over-counting from branched chats. The owner must use the Settings preview
  to untick extras, merge duplicate patients, and check draft counts before
  importing. Agents never open, list, read or import the real export;
  synthetic fixtures remain the only implementation/test input.

### Waits on the owner

- **Discussion subtopics in her live notes.** The 2026-09-22 implementation
  now has the model infer genuinely distinct topics from her narration and
  writes short lowercase `label:` lines only when there are at least two.
  The server grounds every label in her current-session material and removes
  a lone or unsupported label without dropping the prose. Automated synthetic
  coverage is green; her first live draft remains the human check that the 4B
  finds the boundaries she expects and does not over-split.
- **Her first real dictations**, which are the only source allowed to grow
  the retraction-marker list (`RETRACTION_MARKER_SOURCE`).

### Paused — Mac work (owner decision 2026-09-22)

Mac acceptance is paused for the coming months, not the next step. Nothing in
`scripts/`, `macos/` or `installer/` has run on a Mac; the checklist in
`docs/MANUAL-VERIFICATION.md` §1–§9 and `docs/INSTALL.md` remain historical
work to resume when the owner reopens it. The Linux PC remains the machine
running the local AI server. The speech model in the installer catalogue and
the setup script is now a single English-only
`ggml-tiny.en.bin` (~75 MB, 77,704,715 bytes) serving **both** the live
preview and the note's transcript; `installer/src/plan.ts` marks the preview
step not needed when the filenames match, so §7.3's first-run window should
list two downloads, not three, and count the whisper file once.


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

- **Intake-side instruction distillation**, including the safety-facts
  regression (75% → 70%): fixtures 09/10/16/19 fail on the default intake
  instructions. The M10 report calls it the obvious next job; fold the safety
  regression into that next whole-instruction revision and measure it with the
  other failures, not as a standalone patch.
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
- **Section-at-a-time drafting**, justified in the M10 report for fixtures
  04/07; the retraction pass took 04's most common failure away, so re-check
  the justification before building it.

### Small things seen live / known limits

- The spell check covers the note body and the typed-notes box; the chat
  composer and the patient-name field still rely on the browser's checker.
  Inline "Add to dictionary" remains implemented; no Settings management UI
  for those words is planned.

- **Whisper trailing silence is now bounded** (2026-09-22):
  `docs/eval-reports/2026-09-22-whisper-silence.md` records the focused 44/44
  test suite and real synthetic Piper trials. Exact digital-zero tails are
  bounded conservatively; genuine spoken “Thank you.”, quiet speech and
  intentional repetitions remain; nonzero room noise is not stripped.
  This is not universal VAD, and it does not establish that arbitrary
  nonzero-tail hallucinations are fixed.
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
from the agent terminal under the user systemd session; Mac work is paused for
the coming months and its LaunchAgent checklist is not a next step.

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
`docs/MANUAL-VERIFICATION.md` §1–§9 before real notes reach the Mac when the
owner resumes the paused Mac work.

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

# First-run setup — 2026-10-08

- **The desktop app now sets itself up.** On a launch with a model missing, a
  setup window opens over whatever comes first (onboarding included). It lists
  each missing model with its size and source, and says nothing about her or
  her notes is sent. Nothing downloads until she presses **Download**. Stop,
  Try again (resuming the partial file) and a finished state follow. The
  window is worded in the app's language from codes and byte counts.
- **How it runs.** The page asks through shell-only routes
  (`server/src/routes/app-setup.ts`). The server relays `setup_request` to the
  shell, which runs the bundled installer (`installer/setup.mjs`, from both
  packagers) as its own process in the server's process group
  (`src-tauri/src/setup.rs`). The server mirrors the validated
  `setup_event` lines back. The server itself downloads nothing; the event
  schemas moved to `shared/src/setup.ts` so it never imports the installer.
- **Proven on the test AppImage**, with an empty data folder: the window
  opened by itself, downloaded and verified the speech model, stopped on Stop
  and resumed from its partial file.
- **Mac: Ollama 0.33.3 is bundled** (A19, owner-approved 2026-10-08, the
  version every eval ran on). The packager verifies and unpacks it to
  `macos-resources/ollama/`. The shell gives the server its path and port
  11435, and the server's `OllamaProcess` runs it with its weights in the data
  folder. Not run on a Mac; `docs/v2/MAC-FIRST-RUN.md` covers the download and
  what to check. Linux keeps the system Ollama.
- **Stale messages fixed.** The missing-model errors no longer point at
  Settings controls that do not exist.
- **Quitting is clean again.** Every open window holds a quiesce wait, and
  `app.close()` waited for it, so quitting always ended in the ladder's
  SIGKILL (the production AppImage did too). Held waits are now answered on
  close; quitting the test AppImage takes about 0.2 s instead of 16 s. A
  download in progress is stopped first, and keeps its partial file.
- **Reviewed by the coordinator** (owner's call, 2026-10-08, since a Sonnet
  5.5 subagent cannot be selected). It found two shell races, both fixed: a
  Download pressed while the plan's process was still exiting was refused
  with no answer, leaving the window on "running"; and quitting mid-download
  waited 10 s for the ladder.

# Public repository — 2026-10-08

- **The repository is public** (owner decision). Before the switch, the README
  images were regenerated from the current app (`scripts/readme-media.mjs`),
  the README text was updated, and the audit's tailnet name, hostname and PDF
  author were scrubbed from the current files. History was kept, per the
  owner's choice, so older commits still carry those values and the author
  email.
- **CI is free on a public repository.** It stays on demand by the standing
  rule until the owner says otherwise.
- **The owner has backed up the updater's private key and password** off
  this PC.
- **Fixed while making the screenshots:** the chat box was cut off when it
  opened empty (`9150185`).

# Spanish checks, corrected figures, Mac prep — 2026-10-07 evening

- **The draft checks now run on Spanish notes too.** These are the lost risk
  review, ungathered background and diagnostic words. Each check now keys off
  the note's own language (`noteLocale`, the format's), not the interface's.
  Held-out Spanish safety facts went 72.7% → 90.9% (SOAP/intake) and 90.9% →
  95.5% (owner format), with fabrication unchanged.
- **Corrected figures** (`server/src/ai/superseded.ts`, owner decision: keep
  only the revised one). A clause restating the old figure is removed from a
  sentence that also has the new one; an old figure standing alone is
  reported in the chat, not rewritten. English fabrication 5% → **0%**.
  Evidence: `docs/eval-reports/2026-10-07-spanish-checks-and-corrected-figures.md`.
- **Mac (P6.1), configured and not run:** `ee4c3ae`, and
  `docs/v2/MAC-FIRST-RUN.md` is the first run. The Node download (A18) needs
  owner approval.

# Desktop flow harness green — 2026-10-07

`node scripts/v2/tauri-e2e-smoke.test.mjs smoke` (P3.6 V3) now passes, with
all eleven native flows and **64/64 assertions, exit 0**, in two consecutive
runs on a fresh test AppImage. The runs used a virtual screen (`xvfb-run` is
installed since the PC rebuild), so they no longer touch the owner's display.
Everything that kept the flows `NOT RUN` was in the harness, not the app; the
details are in commit `1698142` and the one after it:

- the accent mask was read inverted, so every colour-grounded click hit the
  middle of the window;
- `xdotool windowfocus` was given a name it ignores, so no key ever reached
  the page;
- OCR missed small and teal labels;
- several steps assumed the layout from before the UI batch.

The fake AI gained one tone edit that works on any format.

# Updater key and on-demand CI — 2026-10-07

- **The server's draft changes are now told to her.** When it puts back her
  risk review, replaces an invented "no family history" with "Background not
  yet gathered.", or rewords out a diagnostic word, the note's opening chat
  turn says so in one paragraph ("Apunta checked the draft against your
  notes: …", `server/src/ai/repair-notice.ts`). The chat strips that paragraph
  from what the model sees, like the other server notices. Not yet seen in the
  running app, because the fake AI never triggers a repair.

- **The production updater key exists.** The owner generated the pair. The
  public half is committed as `src-tauri/updater.pub`, and
  `npm run tauri:build` compiles it in via `APUNTA_UPDATER_PUBKEY`. The
  private key and its password stay in `~/.apunta-signing/` and with the
  owner, never in the repo; `docs/RECOVERY.md` lists them for backup.
  `npm run check:release` passes on a production build. Its insecure-transport
  test was a false alarm, because the bare setting name is in every Tauri
  binary; the check now looks for the setting switched on, and a test-updater
  build still fails it on all five counts.
- **Still not live.** Updates come from GitHub Releases of a private
  repository, so nothing can download until the owner makes it public (D3).
  No signed release or release workflow exists yet.
- **CI is on demand** (`.github/workflows/ci.yml`, `workflow_dispatch` only).
  The owner will not pay for Actions, and the 2,000 free monthly minutes ran
  out in six days at about 16 minutes a run. Start one run per finished piece
  of work with `gh workflow run CI --ref main`, never for docs-only commits.
  This month's allowance is spent until the billing date resets it.

# Fabrication runs — 2026-10-06 night

Eval fabrication on the 4B went from 15% to **5%** in two server-side steps,
both in `OllamaProvider.generateNote` for English notes:

- **`server/src/ai/not-obtained.ts`.** "I don't have family history"
  (ungathered) written up as "reported no family history" is replaced by
  "Background not yet gathered." (fixture `09`).
- **`server/src/ai/diagnostic-words.ts`.** A diagnostic word she never used
  ("compulsions") is rewritten out of its section. The rewrite is kept only if
  every number, date, medication and risk statement survived (fixture `19`).

The remaining 5% is fixture `10` ("initially stated three years before
correcting herself"), which the owner chose to keep as a true record. Owner
corpus unchanged. No independent review: the owner now allows only Sonnet 5.5
subagents, and the Agent tool cannot select 5.5. Evidence:
`docs/eval-reports/2026-10-06-fabrication-runs.md`.

# Risk-review repair — 2026-10-06 late

The two genuine safety drops the 2026-09-23 round left open (`10`, `19`: a
four-section intake whose risk review vanished) now have the server-side step
that round called for. `server/src/ai/risk-review.ts`, called from
`OllamaProvider.generateNote`, makes one extra call only after an English draft
that names no risk at all, from a source that shows a review. The model only
points at quotes; the server widens each to her whole sentences and inserts
them labelled `Risk review, as dictated: "…"`. Results on the full corpus with
the 4B:

- safety facts 85% → 95%;
- fabrication unchanged at 15%, the same nine pre-existing runs;
- the owner corpus is identical before and after.

Model-written risk sentences were tried first and dropped. The independent
review broke their polarity check three rounds running, so the owner chose her
verbatim words. That review ran on a Sonnet 5 subagent: the owner asked for
5.5, but the Agent tool only offers "sonnet". Evidence:
`docs/eval-reports/2026-10-06-risk-review-repair.md`. Not built: a chat notice
for the inserted text, which would be a web change. CI is still blocked by
GitHub billing (a failed payment or a spending cap, not code), so local gates
are the only evidence.

# Rebuilding the PC from zero — 2026-10-06 night

The rebuild recipe for this Linux PC is `docs/RECOVERY.md` "Rebuild this Linux
PC from zero": system packages, the Ollama service drop-in, the pinned Node,
whisper's Vulkan build, the two models, the owner's formats and the AppImage.
`config/recovery/current-linux.json` was re-captured from this PC (Ollama
0.33.3, the Vulkan `whisper-cli`, the current lockfile) and `verify` passes
against it. At capture there was no Apunta database on this PC.

# P5.4 updater landed, verification incomplete — 2026-10-06 evening

**Built and pushed.** Ten commits on `main`, `450d59c` → `f19e3f7`:

| Commit | What |
| --- | --- |
| `dc81dbf` | Hard rule 1's second exception; `shared/src/update.ts`; catalogues |
| `b630daf` | Server: quiesce, journal, snapshot, recovery, mirror/relay |
| `d603496` | Native: state machine, verified install, recovery relaunch |
| `4634403` | Renderer: notice, Settings card, freeze, recovery view |
| `d3f134a` | `check-release-config.mjs`; `APUNTA_BUNDLE_VERSION` stamping |
| `ccc03d4`, `2a1bad0` | Handoff; the CI billing blocker |
| `8b6f6dc` | Native smoke: accent clusters on ImageMagick 7's bilevel output |
| `f19e3f7` | P5.4 in the ledger; P3.6 attempt-8 V3 result |

## Local gates (the only evidence — see CI below)

lint, typecheck, 180 test files / **2594 unit+integration tests**, build, the
full English/Spanish/quiescence e2e run (**117 passed**, 6 existing skips, no
retries), `cargo test` (**99**, then **101** with `--features test-updater`),
`cargo clippy --all-targets --features test-updater -- -D warnings`, and the
native smoke harness at **42/43 containment assertions** (shutdown, lock inode
identity, port release, no orphan, observation channel gone, ollama still up).

Browser mode was also verified against a live sandbox instance: the quiesce
status route answers `x-apunta-mode: browser`, the updater route 404s there, and
the console is clean.

## Three defects, all found by running things

**1. The quiescence registration race** (`b630daf`). The bootstrap
`status?tab&doc` read carries the same tab **and** the same `doc` nonce as the
window's own parked `wait`. That is one document registering twice — but
`registerWindow` treated any live-wait holder with the same tab id as Chromium's
*Duplicate Tab* and minted a second record, which nothing ever answered, forcing
a false `no_response`. *Duplicate Tab* copies the tab id but mints a new `doc`,
so same-tab-and-same-doc now reuses the parked record.

**2. The maintenance leak** (`b630daf`). A held browser-mode window was answered
with `settled{held:true}`, so the client slept `REARM_DELAY_MS` before re-arming
and held **no socket** when it left. Its departure is only ever observed through
that socket, so the clean word its `pagehide` beacon banked was never
discharged and maintenance stayed held forever. Browser mode releases on the
last unregistration (FD1), so a held window now keeps its wait parked; a failed
run and every shell-mode word are still delivered.

**3. The native smoke's cluster grounding** (`8b6f6dc`). `findClusters` masks
the screenshot to two colours and reads a coarse grid back as text, but required
an `(r,g,b)` triplet. ImageMagick 7.1.2-31 prints a bilevel image's pixel as a
single `gray(…)` component, so every grid line was skipped, no cluster was ever
found, and onboarding stopped at "no accent cluster was found in the
screenshot". The mask is now forced back to sRGB and the parse accepts both
forms. Same class as the decimal-confidence fix in `450d59c`: the harness
assumed a textual detail of its tools.

**How 1 and 2 were separated from noise:** the failing row was bisected against
a stashed baseline (`git stash push -u`, rebuild, run). The baseline passed
10/10 quiescence rows and the branch failed, so the regression was mine, not the
harness's. Both are covered by unit cases in `server/src/maintenance.test.ts`,
including a new one for the bootstrap re-registration.

Measured effect of fix 3: 39/40 assertions with onboarding `NOT RUN` before;
42/43 with the click issued and the flow advancing to the next screen after.

## Decisions taken with the owner this session

- **Independent review deferred.** Both review attempts hit a provider quota
  limit; the owner directed committing after verification with review deferred.
  P5.4 is recorded `CHANGES REQUESTED`, never APPROVED. Treat the updater as
  unapproved until it is reviewed.
- **The About source link is preserved.** P5.4's V4 demanded zero `github.com`
  strings in `server/`, `web/` and `shared/`, but `Settings.tsx` already has an
  explicitly approved, user-clicked link to the public repository. The owner
  clarified that the invariant is **no outbound application calls**, not the
  absence of the text: the link stays and V4 is satisfied by the server egress
  guard plus the native updater's host-confinement tests. A link the user
  chooses to click is not an outbound call by the app.
- **Subagents ran on `opencode-go/longcat-2.5-preview-free`**, per the owner's
  standing instruction to re-check the allowed free lineup each session.

## Open, and not claimed done

- **The production signing key is still absent** (AM-222).
  `check-release-config.mjs` reports `BLOCKED` and never substitutes a test key.
  No production updater release exists.
- **Independent review did not happen** (see above).
- **CI has not run since 2026-10-06 morning.** Every run from `8d2dfd8` onward
  fails in seconds with "the job was not started because recent account payments
  have failed or your spending limit needs to be increased" — a GitHub billing
  block, not a code failure. The local gates above are the only evidence for
  these commits until the owner clears it.
- **The eleven native flows are still `NOT RUN`** on further harness grounding
  (a layer beyond fix 3: the add-patient dialog's and the pane openers' OCR
  labels are not read). The Rule B freshness FAIL in that run is expected: the
  work was uncommitted when the AppImage was built. P3.6 is attempt 8, V3
  `FAIL` at 42/43, and no runtime acceptance is claimed.

## Two things a next session should know

- **A `git checkout -- <file>` destroyed `server/src/maintenance.ts` mid-session**
  (175 lines of P5.4 work). It was recovered in full from the dangling stash
  commit `7d3855f` (`git show 7d3855f:server/src/maintenance.ts`). That dangling
  commit still exists; prune it if you want the object gone. Prefer a file copy
  over `git checkout` on a file with uncommitted work.
- **The harness's `NOT RUN` exit is 4, not 0.** A `NOT RUN` row is a refusal,
  never a pass, and the smoke's own exit code follows that.

# Direction change — 2026-10-06 afternoon (current)

Owner: the release-blocker round was too slow and produced nothing user-facing.
Decisions (recorded in CLAUDE.md "How the owner wants to be worked with"):
**lean process** from now on, **user-facing work first**, the **updater (P5.4)
parked** until the owner supplies the production signing key (AM-222).

**Desktop app handed over.** The production AppImage built by today's native
review (V1) is at `~/Applications/Apunta.AppImage`, SHA-256 `39cc92a3…f1d0`,
194 MB; its licences and icons were verified inside the image (V4). It uses
the production identity: port 7717 and `~/.local/share/apunta`, real AI. Not
signed, no updater.

**Native flows (P3.6 V3).** The independent run passed V0, V1, V2, V4, V5 and
48/48 V3 assertions, but all eleven flows were `NOT RUN`: the harness dropped
every OCR word because tesseract 5.5.3 prints decimal confidence
(`scripts/v2/tauri-e2e-smoke.test.mjs`, now `Number.isFinite`). See the
result of the lean re-run below. Review: `docs/v2/state/reviews/P3.6-impl7.md`.

Done earlier today: P5.3 shutdown safety APPROVED (CI 37504266251); S6.1 Spanish
dictionary attribution APPROVED (`dc86b54`); P5.4's contracts reconciled
(`8d2dfd8`, AM-227) so the updater can resume from a settled design
(`docs/v2/state/reviews/P5.4-backend-design.md`).
Subagents this round ran on Sonnet 5.5 by owner instruction (AM-226).

# Owner UI feedback, second batch — 2026-10-06 (current)

All 16 requested changes are implemented. This section supersedes the first
batch's backup layout and composer spacing below.

- About uses the full home-screen wordmark, centered above the version/Github row.
- Backup defaults to `<installation location>/Apunta backups`, independent of
  FileVault. Checkout runs use the repository root; AppImage uses its containing
  directory; the Mac shell supplies the app's containing directory through
  `APUNTA_INSTALL_DIR`. Existing selected paths remain selected, and legacy
  data-directory archives remain available to restore.
- Backup shows only its heading, three small explanatory sentences, Last backup,
  Back up now/Restore, and the full current path as a button. That button opens a
  real local-filesystem folder navigator; selecting saves the location without
  creating an archive or changing the last-backup timestamp. Archive selection,
  encrypted-archive passphrases and pending-restore cancellation live inside
  Restore, not on the page. Warnings, archive lists, restore-tested nudges,
  retention statistics and the separate change-location control are gone.
- Settings' broad card styling no longer makes nested confirmations transparent.
- Refine and Brainstorm have gray user bubbles and unboxed AI replies. The send
  arrow itself inherits the teal button color after one typed character; actual
  sending still rejects whitespace-only input. Single- and multiline text,
  microphone and send controls share a vertical center, with halved vertical
  padding. The refine close control is a plain gray X with teal hover.
- Brainstorm/plan/prepare share a gray rounded box with white text/icons in both
  themes. The Prepare/Notes divider and the empty-section warning banner are
  removed; in-note empty/unclear markers remain.
- Capture's format dropdown matches Record audio's width with an inset arrow.
  Record audio is shorter; it and Type notes show only their icon and label.
  Typed-note entry remains available.

**Observed Chromium smoke:** full wordmark alignment; opaque backup and restore
dialogs; directory navigation, cancellation and selection without a backup;
default-installation archive creation (101862 bytes, synthetic data); exact
single/multiline composer centers; teal arrow SVG; gray-to-teal plain X; actual
refine and Brainstorm replies; shared tool styling; matched capture widths and
shortened icon/label buttons. Fake AI only, no real patient data. macOS launch
environment is updated but has not run on a Mac.

Three free-model workers handled chats, capture/tools and backup. The backup
worker's provider became unavailable after partial edits; the coordinator
completed that slice inline without substituting a paid model.

The no-retry end-to-end run exposed an existing Spanish spelling-helper race:
backdrop text updated before its debounced check, so four immediate clicks could
leave the previous word's menu open. The helper now polls the actual menu word
while clicking; assertions and production spelling behavior are unchanged.

**Live preview:** http://127.0.0.1:7831, fake AI, synthetic practice only.
Data: `/tmp/apunta-v2/2026-10-06T03-06-27-698Z-a13c784b/data`.
Installation: `/tmp/apunta-v2/2026-10-06T03-06-27-698Z-a13c784b/installation`.
Run with Node 24.19.0; the machine's default Node 26 is unsuitable for this
checkout's native SQLite module.

**Local gates:** lint, typecheck, build, 170 test files / 2459 unit/integration
tests passed on Node 24.19.0. Full English/Spanish/quiescence end-to-end run:
117 passed, 6 existing skips, one worker, no retries. Chromium also verified
white tool labels against the same gray group in light mode. CI is checked
against the pushed commit rather than inferred from local gates.

# Owner UI feedback batch — 2026-10-05 (superseded by second batch above)

**Gate status:** lint, typecheck, build and all 2469 unit/integration tests
passed on Node 24.19.0. Full English/Spanish/quiescence end-to-end run:
119 passed, 6 existing skips, one worker and no retries. A four-worker run
exposed a quiescence maintenance-release race; serial CI-equivalent verification
passed without changing updater behavior. Real Chromium smoke verified format
autosave and retained instructions, equal section/Add-section dimensions,
centered About and Github hover, backup directory/confirmations, note switching,
and teal chat arrows after one character. CI has not been checked in this session.

Backup, Settings and the note editor:
- Backup is one page, `Settings → Backup` (`BackupSection` in
  `BackupCard.tsx`); the Advanced tab is gone and the backup folder, the
  archives, the restore-tested nudge and the retention count live on it. The
  three guarding controls — **Back up now**, **Change backup location**,
  **Restore** — are a row of their own, and the first and third ask first
  (`ConfirmDialog`), because one writes minutes of work and one replaces what
  is here. Changing the location prefills the saved folder, so cancelling and
  reopening puts the saved one back. Restoring names the archive it is about to
  bring back.
- **A new backup takes no passphrase.** The field is gone from the page; the
  research prefers an encrypted disk the OS unlocks to a secret typed into a
  settings field, and a lost passphrase is a backup nobody can open. Archives
  encrypted *before* this change still restore: the passphrase is asked for in
  the restore dialog, where the only person who needs it is the one restoring,
  and the request carries one only when one is given. The server's daily
  automatic backup is untouched. `RESTORE.txt` now says
  `Settings > Backup > Restore`, and the cloud-folder warning says to put the
  archive on an encrypted disk instead.
- Advanced became **About**: the Fraunces `BrandMark`, `v0.1`, and one line
  where only the word **Github** is the link to
  https://github.com/villenull/Apunta (`target="_blank"`,
  `rel="noopener noreferrer"`). It supersedes the 2026-10-05 row that put the
  repository link at the foot of Advanced as a "Read more about Apunta" row.
  Only the word is the anchor because a whole underlined sentence reads as a
  button to a page she has not chosen, and the line also carries the version.
  It is still the only URL in the UI, still allow-listed in
  `scripts/check-no-external-urls.mjs`, and still not a runtime network call.
- Editing a note format **saves itself**: no Save and no Cancel, typing
  debounced 600 ms, a section added/renamed/moved/removed saved at once, and a
  **Saved** marker beside the pane's back arrow that appears only once the
  server holds exactly what is on screen and goes off the moment she types
  again. The name is the heading itself, an input rather than a labelled field.
  Settings navigation — pane back, tab switch, the pane's close button and the
  modal's Escape — asks `FormatDraftEditorHandle.flush()` first and leaves only
  when the write landed; a refusal (`false`) keeps her in the editor with the
  reason on screen. The close guard is shared through `settingsClose.ts`.
  The **create** flow keeps its button: a format not yet on the server
  has nothing to fall behind, and it asks her to check what was detected first.
- Format rows gain **Delete** beside Edit (`DELETE /api/formats/:id`): the row
  disappears because the list was read again, a refusal — a format a note still
  points at, or the server down — leaves it exactly where it was and says why,
  and the landed delete says "Deleted."
- The **Instructions panel is removed** from the format editor
  (`InstructionsPanel.tsx` deleted). Instructions already stored on a format
  are preserved: the autosave patch carries no `instructions` key, and
  `PUT /api/formats/:id` only writes a key that was sent
  (`server/src/routes/formats.ts`). `POST /api/formats/flatten-skill` is
  **kept on the server on purpose** — the web wrapper `flattenSkill()` is gone,
  the route, its schema and its tests stay.

Notes and chats:
- **A patient's notes list can no longer stand in for another's.** The notes
  on screen and the notes of the selected patient are two different things in
  the frame where the selection has already moved, so state cannot say which is
  which and the request now can: `notesPatientRef` records the patient an
  answer is for, `lastNotesRef` keeps the previous list **with the patient it
  belongs to**, and `patientHasNoNotes` / the note-is-in-this-list effect read
  only this patient's own list. Before, the patient she had just left stayed in
  the column for a whole request — live clickable rows under the new selection,
  and a deep-linked `?note=` of hers opened and then vanished.
- **`NoteView` is memoized on its props, with no comparator of its own**
  (`memo(NoteViewImpl)`). Switching between two notes of one patient renders
  the workspace twice — the click updates the query string, react-router
  commits the location on the pass after — and for that one frame every prop
  already held its identity (measured), so shallow equality says "nothing
  changed" and the whole editor does not re-render. A hand-written comparator
  would have to enumerate the props by hand and would own the risk of skipping
  one; `NoteView` reads no workspace state directly, so a shallow compare
  cannot miss a real change.
- **One character lights the send arrow in both chats** (refine and
  Brainstorm), spaces included: `hasText` is `value.length > 0`, counted on
  `value` only, so a recording's provisional tail does not light it. Send
  readiness is answered separately in `ComposerButtons`; send handlers still
  reject empty or whitespace-only input.
- Earlier in the same batch: Settings is modal-only, Import is a modal that
  reloads the sidebar, the notes column has its tools on top over a "Notes"
  heading and a New note row, font size scales the patients column, the refine
  chat lost its title bar and gained an inline mic, and the Chrome favicon is
  the current Fraunces outlined A.

Owner preview for this batch: http://127.0.0.1:7831/ — a fresh database, 15
fictional patients and 150 notes, fake AI. Synthetic data only; no real patient
data has been opened.

# Current orchestration — 2026-10-05

Main is authoritative. Owner preview http://127.0.0.1:7821/ now serves the latest
accepted UI: stable View all navigation, revised notes column with fixed tools
and blank-space deselection, new-note modal over the blurred patient view.
Independent review CLEAR;2450unit tests, typecheck/lint/build, scoped bilingual
e2e and real-Chromium verification pass. All workers archived.
19fabricatedpatients/115fabricatednotes, min1each, simulatedAI; leave it running.
Work order: docs/v2/state/UI-BATCH-2026-10-05.md; next state:
docs/v2/state/NEXT-SESSION.md. Favicon replacement is queued only.
P5.3 remains BLOCKED after failed independent review; source/evidence committed
for preservation, not acceptance. AM214 desktop rebuild held until P5.3 approval;
no further updater repair authorized. No live data access.
This header supersedes the older current-status sections below.

# Current English desktop acceptance — 2026-10-03 evening

P3.4 native security is APPROVED under AM-200 (20/20 native assertions,
independently CLEAR static checks, owner-accepted conditional rebuild skip with
old failures and binary provenance preserved). P3.5 microphone capture and
containment are APPROVED under AM-197, including tone and silence. Production
AppImage integration P3.6 is BLOCKED after its final attempt-3 source review:
UI-label grounding and backup containment checks still need correction. No
native V3 run or further repair attempt is authorized. The completed reviewed
candidate and rejected findings are preserved for safe closeout.
The existing English Whisper cache and qwen model have real component proof;
medication transcription and refinement fact-loss limitations remain recorded.
Full native speech-to-note/export/recovery completion has not been claimed.

Owner browser preview: http://127.0.0.1:7811/ — fresh isolated sample John Smith,
simulated AI, no real patient data. Leave it running while the owner uses it.
Live v1 migration/replacement remains owner-only; no live data has been opened.
Continue from docs/v2/state/NEXT-SESSION.md and current checkpoints, not the
historical sections below. Prior milestone evidence and failures remain history.

# Where Apunta is — the handoff

**Active v2 work (2026-09-27):** see `docs/v2/state/NEXT-SESSION.md` and
`docs/v2/state/PROGRESS.json` for current status on `feature/v2`. The latest
owner-reviewed UI batch includes the lighter teal, add-patient modal and sidebar
motion; synthetic preview is on port 7811. The live-v1 record below is unchanged.
**Sidebar batch (2026-09-28, owner-directed):** `docs/v2/owner/UI-BACKLOG.md`
#1–#4 — panel toggle at the column's right edge, Claude-style drag (lifted pill,
"Move to …", outlined target, live reorder preview, drop on Recents ungroups),
one ⇅ control whose sort covers every section plus "Manual" (dragged order saved
whole-group via `PUT/DELETE /api/patient-group-order`), drops applied locally
with a quiet refetch, the view menu's options panel accepting real pointer
presses, and a Claude-layout language dialog. Owner preview: port 7868.
**Follow-up batch (2026-09-28, backlog #5–#11):** row actions and drops update
the list in place (no "Loading" redraw); Pinned is a supergroup (drop onto it
pins; pinned patients show only there); the ⇅ menu follows Claude's layout and
labels, with no Manual order and no drag-reorder inside groups (the
`/api/patient-group-order` routes are gone again); the accent is fixed teal;
Settings has no Language or Color row, and gains a Font dropdown (Inter, System,
Serif). **Language is chosen only in More → Language.** English strings are
American spelling.
**Patient view (2026-09-28, backlog #13):** a patient with no notes has no notes
column; a single welcome offers "Write the first note". With notes, column 2 is
quiet rows (New note, the three tools, then "Notes"), and with none open column 3
shows four explained cards (`PatientWelcome.tsx`).

**Updated 2026-09-24.** Live runs `5573afb` (welcome-search home, patient-name notes header, 17% list columns) with the owner's revised
progress instructions (hash `23135cae…`, verified by
`scripts/recover-current-linux.mjs verify`). The owner is restoring this PC:
on a new machine, give the agent the prompt at the top of
`docs/RECOVERY.md`; a fresh-clone dry run of that path passed tonight.

**2026-09-23.** Git now contains the sanitized machine-readable
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

## What is built (all packets M0–M13)

Local-first therapy-notes app: React SPA, Fastify on 127.0.0.1:7717, SQLite,
all AI local (Ollama `qwen3.5:4b-q4_K_M` for drafting, whisper.cpp for
speech). CI is green on every push (GitHub Actions, fake AI mode).

Beyond the packets, the live-testing weeks (2026-08-27 → 09-07) added:

- **Four server-side locks on the refine chat, and a request-scope check
  above them**, because the 4B ignores
  prompt rules under a direct command and lies about provenance: the
  published lock, the boilerplate lock (`server/src/ai/refine-guard.ts`),
  the fact lock (`server/src/ai/fact-guard.ts`) and, since 2026-09-21, the
  prior-note lock (`server/src/ai/prior-note-guard.ts`). Each appends a
  sentence to the reply; those sentences are stripped from the history the
  model sees. Since 2026-09-23 the request itself is read first
  (`server/src/ai/refine-request.ts`): a revision is held to the sections her
  message named, an addition may not delete, the outcome and the reply are
  read off the diff rather than off the model's claim, and an edit turn's
  reply is written by the server. See
  `docs/eval-reports/2026-09-23-refine-fix.md`.
- **The refine chat reads her earlier notes** (2026-09-21, owner): the
  patient's notes from sessions *before* the one being refined, newest first,
  go in as fenced READ-ONLY background
  (before the note, so Ollama can reuse the prefix; at most 4,096 estimated
  tokens, and only what the note, the thread and her message leave of the
  refine budget — fitted by Brainstorm's `ai/prior-notes.ts`). The rule is in
  the system block and restated beside her message. The prior-note lock
  holds back any revised section that gains a fact or a five-word run only
  another note contains, unless her message asks to bring something over
  from another session ("bring … from last session"). Measured on the real
  4B: `docs/eval-reports/2026-09-21-refine-background.md`. **Earlier only
  since 2026-09-23**: a later session is never context for an earlier note
  (the owner's pass caught the model "correcting" an older note's Location
  from its *next* session), so `notesBeforeThisOne` does not offer them and
  the prompt says why they are absent.
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
- **Dictating into the refine chat** (2026-09-07; revised 2026-10-05, owner):
  a microphone in the composer. Pressing it starts recording there and then —
  no dialog, no panel — and the microphone itself carries the state (pressed,
  "Stop dictating", pulsing, with the timer). The provisional words land in the
  box itself, after anything she had typed, and are read-only until she stops;
  on stop the provisional tail is replaced by the final transcript. The hook
  behind it is still `hooks/useLiveRecording.ts`, which owns the recorder and
  the preview loop, but `components/LiveRecording.tsx` — the capture screen's
  panel — is now only the capture screen's. `POST
  /api/transcribe/dictation` runs the note model with the context fitted to the
  clip and hands the words back into the box for her to edit; nothing is sent
  until she presses the arrow. Errors (nothing heard, whisper down, microphone
  refused) surface on the composer's own error line, as they always did.
- **Settings, reordered then redesigned labels-only** (2026-09-21, owner):
  Appearance (Colour, Font size, Animations switch — no hint text, the label
  alone suffices), then Note formats (with "Add another format" as the
  card's last row), then a one-line Backup card ("Last backup: … · Back up
  now · Restore", speaking up only when stale or failing), then Import from
  Claude as a link row, then a folded-shut Advanced disclosure holding the
  backup folder/passphrase/archives/restore-tested/retention and one
  **Read more about Apunta** row linking to the repository (the Setup, About
  and Licenses screens were removed 2026-10-05). Text appears only where
  omitting it risks her data.
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
4B model, including the refine-chat microphone. Physical microphone,
room/owner-speaking-pattern and Mac acceptance remain waived/unrun. The
2026-09-22 retraction review is **done**: the strict follow-up recognizes the
observed `scratched that` ASR inflection without changing
`RETRACTION_MARKER_SOURCE` or weakening verbatim/proximity checks. Its focused
synthetic suite is **16/16**; raw acceptance/model artifacts remain unchanged.
See `docs/eval-reports/2026-09-22-retraction-strict-fix.md`.

The Discussion subtopic review is **done**. The pre-fix matrix and its
zero-label failure remain historical evidence; the capitalized-label parser,
case handling and gate are complete. Labels stay grounded in current-session
material and unsupported labels are removed. See
`docs/eval-reports/2026-09-22-discussion-subtopics-fix.md`.

The four-arm comparison completed for the exact authorized candidates and
valid runtime aliases. Its corpus favours the current
`qwen3.5:4b-q4_K_M` control (18/60 fabrication flags, 42/60 gated runs, 42/60
safety facts, 54/60 retraction/negation) over qwen2, Bonsai 8B Q1_0 and Bonsai
4B Q1_0. All four passed transport/schema smoke. These are synthetic
inspection results, not clinical clearance; keep the control with **no
automatic model switch**.
The Thorough-model selection gate is closed with **NONE**. In a same-campaign,
local-only ROCm eval on the RX 9070 XT (20 fixtures, one deterministic run per
fixture), the 4B control measured 35.0% fabrication (7/20), 70% safety facts
(14/20), and 2.3s mean draft wall time; `qwen3.5:9b` measured 45%/65%/3.1s,
`qwen3:8b` 50%/70%/2.9s, and `qwen3:14b` 50%/65%/4.7s. All candidates failed
the fabrication gate (and 9B/14B also safety); 14B exceeded the ~2× draft-time
warning. The local candidates were removed, leaving only
`qwen3.5:4b-q4_K_M` installed. See
`docs/eval-reports/2026-09-22-thorough-model-selection.md`; no Thorough option
ships.
The temporary Quick/Thorough profile experiment is not shipped: ModelEval
rejected every heavier candidate at the fabrication/safety gate, so the
Thorough profile and placeholder were removed. The sole Quick path preserves
the existing `llm_model` setting or machine default, rejects cloud-backed
tags, resolves once per local LLM operation, and leaves no dead Settings
control; `/api/health` reports the effective model. The current
`qwen3.5:4b-q4_K_M` control remains the default.
The final second pass confirms that no local model beats the shipped
`qwen3.5:4b-q4_K_M`; keep the 4B with no model change. The decontaminated
instruction files are now adopted as the shipped defaults (`0089c2c`, by
owner decision). On the adopted 4B eval, fabrication is 10% (6/60), safety
facts 65%, and schema 100%; the scorer fix is `e050eba`, so these numbers are
not comparable to the earlier runs. `check:format` remains at 0 flags. The
live Progress-format update was applied after a backup
(`apunta-backup-2026-09-22-4.zip`) and verified byte for byte; Intake inherits
the shipped default. GPU prefill is 18.7× faster than CPU. See
`docs/eval-reports/2026-09-22-model-second-pass.md`.
The live Progress-format update was applied after a backup
(`apunta-backup-2026-09-22-4.zip`) and verified byte for byte; Intake inherits
the shipped default. The Linux live app was then redeployed on 2026-09-23 at
`9eb0cdd`, applying migration 007 for note revisions, with
`apunta-backup-2026-09-23.zip` retained.

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
reproducible substitute, not a hosted-page pass. The latest web bundle and
the detached Linux live deployment are current; no live settings, database,
model or patient data was opened by this work.

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

1. Treat the 2026-09-22 retraction and Discussion reviews as **done**. Keep
   their focused synthetic gates and raw reports as regression evidence; do not
   reopen either review without a new owner-facing failure.
2. Keep `qwen3.5:4b-q4_K_M` as the default. The current model-quality round is
   synthetic and local-only; keep its measured paragraph and per-item verdict
   with the newest report when it lands. Do not switch models or add vocabulary
   work from comparison results alone.
3. The Linux live app was redeployed on 2026-09-24 at `d4eeacd` through
   `scripts/deploy-live-linux.sh` (backup via `/api/backup` first), and its
   Progress note instructions were updated through the formats API to the
   revised text. Confirm health and behavior only through disposable
   fixtures unless the owner is actively doing the hands-on checks below.
4. The owner imports her real Halaxy PDFs herself. Agents must never open, list,
   read or import real PDFs or Claude exports; synthetic fixtures remain the
   only implementation and test input. Her import check must include
   **Add to existing**.
5. Keep the exact-zero Whisper mitigation narrow. Do not add VAD/noise
   suppression without the missing non-silent reproducer and quiet control.
6. Linux disk encryption is **not checked**. Recommend an off-machine backup
   (encrypted, if it leaves the machine) rather than treating the local copy as
   the only recovery path.
7. Mac work is paused for the coming months by the owner's decision. Keep the
   Linux PC as the machine running the local AI server; resume the Mac-only
   checklist only when she reopens that work.
8. The hosted README still needs a real authenticated browser page check if
   repository visibility/access changes; the API-render substitute above must
   not be relabeled as hosted acceptance.
9. Speech: tiny.en stays (owner, 2026-10-04, AM-204). Drug-name accuracy is out of scope for the target use case; "scratch that" misrecognition is accepted until a real-use failure. No Whisper download is authorized.


## What is open

Grouped by what each item waits on.
**Explicitly removed from the active backlog (owner decision 2026-09-22):**

- Complex-medical-vocabulary acquisition, and a Settings UI for managing
  dictionary words. The existing `stt_vocabulary` and `spelling_words` settings,
  the inline spell-check add behaviour, the clinical safety checks and the
  historical measurements all stay.
- A/B experiments and optimization.
- The Tailscale invite and remote-testing setup.
- The Quick/Thorough model switch. No Thorough default ships: `qwen3.5:4b-q4_K_M`
  is retained as the sole/default Quick path with no model control shown, to be
  revisited only after prompt re-tuning and a new fabrication/safety gate.
- The wider local-model candidate set. Model comparison is limited to exactly
  four authorized LLM arms (4B control, Qwen 2B, Bonsai 8B, Bonsai 4B);
  `qwen3.5:9b`, `qwen3:8b` and `qwen3:14b` were rejected and no candidate or
  gate is presumed passed.
- Mac acceptance work, paused for the coming months. The Linux PC remains the
  machine running the local AI server; resume the Mac-only checklist only when
  the owner reopens that work.

### Recently completed

- **Halaxy PDF importer (M13) is built.** HalaxyServer and HalaxyWeb implement
  the local, text-based PDF flow against a synthetic John Smith fixture:
  preview first, allow patient-name edits and note unticking, then import
  selected notes as published history in one undoable batch. Scanned or
  image-only PDFs are rejected clearly; attachments, letters and images are
  text-only non-goals. The owner may import her real Halaxy PDFs herself;
  agents never open, list, read or import them.

The Halaxy server/shared slice is now ready: `shared/src/halaxy.ts` defines
the preview/request/response schemas and size limits; the local parser handles
AU/UK date headings, repeated page furniture and page numbers, page-break
notes, and missing patient/session text. It keeps PDFs in memory, writes
published notes in one `source=halaxy` undo batch, and the existing undo route
removes those published rows. The generated synthetic
`e2e/fixtures/halaxy/john-smith.pdf` has three pages, three sessions and a
split note; the focused server/shared suite is 26 tests. HalaxyWeb now offers
**Import from Halaxy** beside Claude in Settings: it accepts one or more
text-based practitioner PDFs, previews editable patient names and sessions
with per-note unticking and rejected-file reasons, then imports selected notes
as published history in one undoable batch. The John Smith fixture remains the
synthetic path; the owner, not agents, performs any real Halaxy-PDF import. No
agent opens, lists or reads those files.
Final synthetic Playwright evidence passed three repeated runs (**3 passed,
9.5s**) in an isolated fake-AI worktree on disposable port `7800`, covering
the normal `.name` click, published-history import and undo. The UI also
received a hover-only patient-action spacing/truncation fix; screenshots used
only synthetic patients.
The final server slice also adds migration 006: it preserves pre-existing
Claude batch links under foreign-key enforcement and rolls back
transactionally; focused coverage asserts that legacy undo still works.
Fixture extraction is egress-guarded, the bundled `unpdf` path has no worker or
CMap URLs configured, and the parser is a static server dependency.
The integrated full gate is green at `0142752`: build:shared, typecheck, lint,
test (114 files, 1,429 tests), production build, 41 e2e tests and
`eval --fake` all exited 0.

Packet follow-through now on main:

- **Save integrity (P1, migration 007):** note PATCH requires a monotonic
  revision and returns `stale_write` with the server note; the editor offers
  **Keep mine** / **Take theirs**, published notes require an explicit unlock,
  copy happens before save, pagehide/visibility flushes and visible refetches
  protect edits, and recorder/transcription cancellation preserves staged
  work. Focused route/database, browser two-context and cancellation coverage
  passed (`79d9106`).
- **Storage boot (P2):** data-folder/database failures produce a minimal static
  503 naming the folder, explaining disk/read-only/permission fixes, saying
  existing data is untouched and telling her to restart. Staged restore rolls
  back if the database cannot open; migration ceilings are dynamically
  detected. Local-calendar handling has America/Denver coverage
  (`73bb656`, `8913638`, `4d923b4`).
- **Bundle and design (P3/P4):** spell loading is lazy, Settings uses one
  long-lived provider, non-workspace screens are lazy while Workspace/Capture/
  AddPatient stay eager, and the final eager bundle is 479.49 kB raw /
  144.32 kB gzip versus the 542,935 B / 158.97 kB baseline. Cold seeded fake
  root LCP is 376 ms, patient-list readiness 49 ms and warm navigation about
  25 ms; `/` fetches no dictionary files. Inter is bundled with the design
  tokens and no prototype-parity work is required
  (`1a768cf`, `28914a2`, `5966067`, `0b3b6f1`).
- **Spell layer (P5):** the unified input/textarea/note layer uses
  segment-aware binary-search marks, memoized unchanged segments, the shared
  allowed-words tokeniser and a 32-character menu cap. The synthetic
  147,999-character case measured 0.733 ms/character and one 73 ms long task
  after the optimization; the normal-note 1.6 ms/character figure is the
  pre-change measurement and was not re-measured (`f0d784a`).
- **Shared streams and refine progress (P6):** shared SSE decoding powers the
  generation, chat, Brainstorm, plan, prep and transcription paths; refine
  emits additive **Rewriting N of M sections…** status as nested tokens arrive.
  Focused fake/JSON decoding was 42/42 and the real SSE fixture was 1/1
  (`4bfee91`, `9e68919`, `f1883a1`, `ad370e8`).
- **Accessible surfaces (P7):** Setup/About is OS-neutral and states local
  operation without gating that claim on disk encryption; accent reset,
  keyboard radio semantics, shared dialogs, editor focus, recording meter and
  long-name wrapping are covered (`8dc4b5c`, `5ecc409`).
- **Workspace/imports (P8):** active patient names match
  case/whitespace-insensitively with optional existing ids; undo removes only
  patients created by that batch. Note rows lead with session/created dates and
  Draft chips; the licences view supports index/filter/copy; Halaxy duplicate
  protection and import-preview polish are shipped (`ceeb7e4`, `352b04f`,
  `f9e4d35`, `f6ddf3d`, `4aa7cb3`).
- **Integration fixes:** the recorder's `acceptingFrames` regression is fixed
  (`96546de`); setup copy no longer depends on disk encryption, and the
  JSON-in-note screenshot was a fixture artefact, not app corruption. The
  remaining integration fixes are `fc0a05e`, `5fad0dd`, `fe3fee1`, `d96af22`,
  `4572e4c`, `5062de7`, `7fa015b`.

### Approved, next action
- **Claude export confidentiality is approved.** ClaudeProbe's shape-only
  report is **GO with preview**: its focused synthetic proof is 37/37,
  including three fabricated plans and seven drafts after decoys. The real
  shape has 45 conversations with 2+ sessions, only an upper bound versus the
  owner's ~25 patients. Shape-only data cannot distinguish non-patient/
  general/instruction chats, several conversations for one patient, or
  over-counting from branched chats. The owner must use the Settings preview
  to untick extras, merge duplicate patients, and check draft counts before
  importing. Agents never open, list, read or import the real export;
  synthetic fixtures remain the only implementation/test input.

### Waits on the owner

- **Capitalized Discussion subtopic labels are done.** Adopter's parser and
  gate are complete; labels display with a capitalized first letter while
  accepting either input case. Her live Progress format now includes the
  subtopic paragraph after backup `apunta-backup-2026-09-22-4.zip`, verified
  byte for byte. Intake is unchanged. Her first live draft remains the human
  check that the 4B finds the boundaries she expects and does not over-split.
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
The full evidence is `docs/eval-reports/2026-09-23-model-quality-round.md`.
The owner-approved live instruction edit was applied only after backup
`/home/villenull/.local/share/apunta/backups/apunta-backup-2026-09-22-5.zip`;
the archive passed unzip and extracted-database integrity checks.

**The five model-quality items are measured, and the instrument had to be built
first.** `npm run eval` could only measure SOAP — `instructionsFor` hard-coded
the SOAP and intake constants — so three of the five findings, which live in
the owner's own seven-section format, had no instrument at all. A second corpus
(`e2e/fixtures/eval-owner/`, four fabricated dictations, one trap each plus a
control), `--corpus`/`--ollama-url` on the eval CLI, and production's own
section-fingerprint instruction selection now make her format measurable; the
report's completeness section names which safety fact a run dropped instead of
only counting. Baseline on unmodified main, four invocations: fabrication
10–15%, safety facts 70%, salient facts 82–83% (runs inside one invocation are
byte-identical; one fixture moves between them). Her format at baseline: 50%
fabrication, 75% safety facts. Verdicts: **(1) the worked example leaking into
"Note for next session" — fixed**, 5/5 → 0/5, by rewriting the example's
forward-looking line; a prompt-only prohibition had already been tried on
2026-08-31 and failed. The bundled constant also stopped dropping the markdown
H1, which measured as load-bearing (0/20 fabricated with it, 5/20 in each of
six invocations without it); SOAP and intake still drop theirs, on purpose,
because they are the instrument's own prompt. **(2) the "not clinically
relevant" aside — not reproducible on the shipped instructions**, in three
reconstructions including both markers and the aside at the start and at the
end; the live sighting predates the 2026-09-22 decontamination. The fixture
stays as a tripwire. **(3) restated history inverted — fixed**, 5/5 → 0/5, by
a conditional user-turn reminder that fires only when the source gives a
quantity and a past marker and no direction word. **(4) safety facts at 65–70%
— half the failure was the instrument.** Five of six failing fixtures were
notes that recorded the fact and were scored as drops, because the patterns
accepted only `denied/denies <term>` adjacent; the patterns now name the forms
a note uses, and the mirror form was deliberately left out because it accepted
a sentence that omits the fact. A third conditional reminder, section-aware,
took her format's safety facts 75% → 100% and the corpus 70% → 90%. Two
genuine drops remain (`10`, `19`: risk content absent from a four-section
intake) and the reminder reaches both prompts without fixing them — the same
decoding-stage conclusion the M10 report reached. **(5) section-at-a-time
drafting — not justified any more, not built.** The two fixtures M10 named for
it (`04`, `18`) pass in all four baseline invocations, and `07` never failed;
the cost would be 7 calls for her format against 1. After: SOAP 15% fabrication
(top of the baseline range, same nine runs as the baseline's worst invocation)
/ 90% safety / 84.5% salient; her format 0% fabrication / 100% safety. Left
open: the two intake drops need a server-side step, not a prompt; item 1's fix
is prompt-layer and prompt-layer fixes on this model are fragile, so the leak
is not proven gone beyond the runs recorded. The owner-approved Example diff is
now applied to the live Progress format; the recovery snapshot and hash match
the live text.

### Small things seen live / known limits

- The unified SpellLayer covers the note body, typed-notes box, refine-chat
  composer and patient-name field with the same bundled spell checker;
  dictionary words and **Add to dictionary** apply in each, and the patient
  name is not flagged against itself.

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
- Clinical-knowledge's Discussion guide still says “accept either input case”,
  a parser-only phrase; this is a known leftover with no behavior impact.

### The testing docket for the owner's proxy (his PC, no Mac needed)

Every item comes with a full script when it needs his voice.

**Proxy recording / independent browser pass, 2026-09-23:** used a fresh
database on port 7741, real Qwen 4B and tiny.en; live patient data untouched.
The proxy read all three fictional John Smith prompts into one 143.913-second
recording. Preserved local-only evidence (original `john-first.wav` untouched;
derived cuts `note.wav`, `tuesday.wav`, `thursday.wav`, `waiting.wav` and
`tail.wav`, plus transcripts) is at
`~/.local/share/apunta-test-evidence/2026-09-23/` outside Git; only the
isolated scratch DB/server used `/tmp/apunta-spoken-acceptance-GHkrMn/`.
No raw voice is committed.

- **Speech fidelity, still limited (transcription, not capture):** on 2026-09-23 both whole-file and cropped transcription misheard "scratch that"; the generated note retained both four and six hours. Tuesday's "walked" became "walks". The note kept the August date, both risk denials, five-minute action and next-session review. Follow-up 2026-09-24: the direct spoken "four hours, scratch that, six hours" remains misrecognized by installed `ggml-tiny.en.bin`; the generated synthetic note kept both values. Only tiny.en is installed in the verified store; do not acquire/download a different model without explicit owner authorization. The sentence about an absent current count is now preserved server-side verbatim in Discussion (synthetic API smoke); not inferred from silence.
- **Silence evidence, narrowly:** the dictation endpoint returned empty text for the first-minute sample and the 8.912-second tail. A localized sneeze and a matched blank control both returned empty; narrow observation, not universal noise/VAD acceptance. Whole-file transcription on 2026-09-23 contained the three prompts without an extra unrelated sentence.
- **Refine synthetic browser checks passed:** shortening Discussion changed only that section; medication addition retained prior text and included 20 mg daily; a sleep question left the note unchanged; clearing Risk review preserved every other section. A no-op shortening was truthfully reported.
- **Two-window behavior (updated 2026-09-24):** on 2026-09-23 Keep mine and Take theirs each persisted the chosen body through reload, but the conflicting window showed only a truncated list preview. Follow-up: one Web Lock primary, secondary fullscreen blocker/inert/focus-trapped, decline keeps block; explicit transfer waits for an intercepted pending PATCH, old window becomes blocked before new window unlocks, new owner reloads latest saved note, and owner release allows old tab to reacquire. A handoff whose pending save fails or hits an unresolved conflict does not transfer: the old window stays primary and editable showing `Couldn’t save`, the requesting window stays blocked and its takeover request times out after ~8s back to the decision prompt. Covered by e2e `a failed flush keeps the old primary and leaves takeover blocked`. Minimal per-note remote-revision conflict fallback still provides Keep mine/Take theirs; no full comparison UI.
- **Focus bug fixed 2026-09-24:** on 2026-09-23 typing in the note body with Refine open moved focus to the chat composer after the first character (reproduced with two strings; a newline could then send the remainder as an unintended chat request; cause identified as the dialog focus effect rerunning on inline `onClose` churn). Follow-up: inline `onClose` churn was removed from the dialog focus effect; real browser check showed body typing/newline stay in the note and no chat text is sent.
- **Consecutive recorder cycles, capture fixed / transcription still fails:** on 2026-09-23 recorded-WAV replay exercised two recorder cycles without reload but produced unrelated text despite direct WAV uploads yielding the expected passages. Follow-up 2026-09-24: consecutive browser recorder cycles now yield two distinct nonempty previews without reload; lexical accuracy still fails: Tuesday text was `Add the John logs for 20 minutes on Tuesday.` and Thursday text was `Add that John, plans to repeat the lock on Thursday.` Neither was sent to refine. Capture/upload path success is distinct from transcription fidelity.
- **Q3 intervention approach (owner choice):** owner chose a named approach suggestion for confirmation and supplied the PDF. Intervention-only card uses exact evidence quote; Not now leaves note byte-identical; Add prefixes confirmed PDF heading and autosaves; the card vanishes. Matcher avoids generic/ambiguous/negated/quoted/unattributed inference. See `shared/src/clinical-guidance.ts`.
- **Q4 intervention style (owner choice "Tidy them into fuller sentences."):** both instruction copies are synchronized. New 4B rubric eval report and style comparison: `docs/eval-reports/2026-09-24-owner-intervention-style.md`; be candid that actor-absent passive wording is still not obeyed by this 4B sample.
- **Verified gates 2026-09-24 (full gate, exit 0):** build:shared, typecheck, lint, `npm test` 118 files / 1,531 tests, build, `npm run e2e` 42 passed, `eval --fake`; plus `npm run check:format` 0 flags across 6 synthetic fixtures on the real 4B. A post-gate review fixed the conflict banner lingering after Keep mine/Take theirs, drains keystrokes typed during a handoff flush, and removed an unused broadcast. Known, accepted: `preserveExplicitAbsences` can append the verbatim source sentence beside a model paraphrase of it (duplication, never loss).

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
   Also exercise **Add to existing** with a synthetic existing patient and
   confirm that no duplicate chart is created. The Playwright coverage now
   passes locally and in CI; the proxy's hands-on dry run remains pending.
5. **Two-window ownership handoff**: open one draft in two windows. Confirm exactly one window is primary and the second shows the fullscreen blocker (inert, focus-trapped); declining the transfer keeps the block. Request an explicit transfer: pending edits flush before handover (an intercepted pending PATCH completes), the old window becomes blocked before the new window unlocks, and the new owner reloads the latest saved note; then release ownership and confirm the old tab can reacquire. Separately, the minimal per-note remote-revision conflict fallback still offers Keep mine/Take theirs with no full comparison UI.
6. **Two recordings in a row**: record, stop and send one dictation, then
   immediately record and send a second without reloading. Confirm both
   previews/transcripts arrive in the correct composer or note.
7. **A long recording** (10+ minutes) for the preview's slow-gap mode after
   four minutes, and the final transcription time.
8. Paste-into-Halaxy — human-only, whenever he has Halaxy open.

## Running things on the partner's PC

The live instance is a detached production build on `127.0.0.1:7717` from
the plain clone `/home/villenull/apunta-live` (not a worktree). **RULE: the
live app never runs from the development repo
`/home/villenull/Projects/Apunta`.** Its data stays in
`~/.local/share/apunta` (`apunta.db`, `audio/`, `models/`, `bin/whisper-cli`),
and its shape-only log (bytes, seconds, token counts, never words) is
`/home/villenull/.local/var/log/apunta-live.log`.

The verified deployment backup from this move is
`/home/villenull/.local/share/apunta/backups/apunta-backup-2026-09-23-2.zip`
(`unzip -t` passed; extracted SQLite `PRAGMA integrity_check` returned
`ok`). The live SQLite database, WAL/SHM files, audio, encrypted backups and
whisper model are outside Git; the real Claude export, local runbook/config
pack, Ollama models and agent/session history also live outside this checkout.
Do not delete those paths during Paseo cleanup, and never open the real export
for verification. GitHub contains none of that state.

```sh
# Ollama (local-only; launch from the user's shell)
setsid nohup env OLLAMA_NO_CLOUD=1 ollama serve

# The app — launch only from the dedicated clone, and only while no recording is active.
cd /home/villenull/apunta-live
setsid nohup env NODE_ENV=production APUNTA_NO_OPEN=1 node server/dist/index.js >> /home/villenull/.local/var/log/apunta-live.log 2>&1 </dev/null &
curl -fsS http://127.0.0.1:7717/api/health

# Deploy a main revision from the development repo; it backs up first and
# refuses to stop the app while whisper-cli is a child of the live PID.
cd /home/villenull/Projects/Apunta
bash scripts/deploy-live-linux.sh 03f38a8

# The gate, in this order; verify by exit code, never by reading piped output
npm run build:shared && npm run typecheck && npm run lint && npm test && npm run build && npm run e2e && npm run eval -- --fake
```
On the Apunta agent's current Linux PC (`villenull`), `~/.local/bin/ollama`
is user-installed Ollama 0.34.2 with bundled ROCm; active models are in
`~/.ollama/models`. The log identifies ROCm0 Radeon RX 9070 XT (`gfx1201`),
15.9 GiB VRAM, and `qwen3.5:4b-q4_K_M` with 34/34 layers offloaded;
`ollama ps` reports 100% GPU. A fair warm synthetic check measured 108.29
generation tokens/s versus 107.11 tok/s baseline. This is separate from the
partner's `/var/lib/ollama` path above. Set `OLLAMA_NO_CLOUD=1` when launching
either local server as privacy hardening; it does not affect GPU selection.

The 2026-09-23 deployment checked out main revision `03f38a8` into the plain
live clone, preserved the existing database, audio directory, settings and
model paths, and retained
`apunta-backup-2026-09-23-2.zip`; health returned SQLite integrity `ok`. It is
reachable at `http://127.0.0.1:7717`. Linux disk encryption is not checked, so
keep an off-machine backup rather than relying on this disk as the only copy.
This is Linux evidence only: no Mac shell, Metal, FileVault, LaunchAgent,
installer, standalone decrypt script, or `.dmg` run is claimed; complete
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

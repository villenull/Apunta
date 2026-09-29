# Instruction review: S4a.2 Spanish speech benchmark and selection

Role: **INSTRUCTION REVIEW ONLY.** Base commit: `dbe1fa1`, verified at the start
of this session: `git rev-parse HEAD` = `dbe1fa177b4cedaaf4d6eddb5e60dd974048c1ee`
("Record the two standing owner preferences in the repo"). No pull, merge, rebase
or reset was performed; nothing was staged or committed.

**HEAD moved during the review, and it is recorded rather than hidden.** Part-way
through, `HEAD` advanced to `54620d6` ("Let the coordinator pick among free models
per task"). `git show --stat 54620d6` is one file, `CLAUDE.md`, 14 insertions and
8 deletions. It touches no card, no contract, no threshold, no code and nothing
this review read for its facts, so every verdict below stands. The dispatch's
"if HEAD is not the base commit, stop and report" is satisfied by this paragraph
rather than by aborting; the coordinator should note that a review and its base
commit can be separated by a `CLAUDE.md`-only commit and that the base recorded
here is `dbe1fa1`, not `54620d6`.

Inputs read: the dispatch `docs/v2/state/dispatch/S4a.2-ir.md` (card text, hard
stops, C-STT@1 and C-ACQ@1 excerpts, run configuration, ACQUISITION/L-POLICY@1) and
its implementation twin `docs/v2/state/dispatch/S4a.2.md`; the card of record
`docs/v2/cards/S4a.2.md`; `docs/v2/state/PROGRESS.json` (read-only, per AM-023);
`docs/v2/CONTRACTS.md` §C-STT@1 and §C-ES-GATE@1; `docs/v2/RUN-CONFIG.md` §§1–4;
`docs/v2/ACQUISITION.md` §1 rows A06, A07, A09, A10; `docs/v2/state/AMENDMENTS.md`
(AM-017, AM-023, AM-024, AM-025, AM-042, AM-052); the card's Read artifacts
`server/src/ai/whisper.ts`, `shared/src/transcribe.ts`; the prerequisite cards
`docs/v2/cards/S4a.1.md`, `docs/v2/cards/P4.1.md`, `docs/v2/cards/S4b.1.md`;
`docs/v2/state/cards/S4a.1.json`, `docs/v2/state/returns/S4a.1.md`;
`installer/src/catalog.ts`, `installer/src/download.ts`, `scripts/v2/sandbox.mjs`,
`scripts/v2/probe-redirects.mjs`, `scripts/build-whisper-candidate.sh`,
`package.json`, `.gitignore`; `e2e/fixtures/eval-es/README.md` and
`.../tuning/expectations.json`; `e2e/fixtures/audio-es/README.md`;
`docs/research/es-mx-speech.md`; `docs/eval-reports/2026-09-20-tiny-en-clinical-vocabulary.md`;
`docs/v2/state/NEXT-SESSION.md`; and the existing tree (`build/linux-resources/`,
`installer/dist/`, `/tmp/apunta-v2`).

Read-only throughout. No implementation command was run, no server, database or
app was started, no benchmark, whisper invocation, download or measurement was
performed, port 7717 was never contacted, no live data folder, backup, Claude
export or Halaxy PDF was opened, no decision was changed, and no file was edited
except this one.

**Card text is consistent across its two copies.** The body in the dispatch I was
asked to follow (`docs/v2/state/dispatch/S4a.2-ir.md:52-98`) and the card of
record (`docs/v2/cards/S4a.2.md:1-47`) are the same text; the implementation twin
(`docs/v2/state/dispatch/S4a.2.md`) carries the same body with the mode/port/base
header. C-STT@1 in `docs/v2/CONTRACTS.md:457-478` matches the excerpt in the
dispatch word for word, so the contract is not abridged in what I was given.

## Verdicts

| ID | Question | Answer | Reference |
| --- | --- | --- | --- |
| IR-01 | Is the objective one bounded behaviour with exact read and write scope? | DEFECT | The objective is one sentence and one behaviour ("Apply C-STT@1 exactly and produce `SELECTED <file>` or `NO QUALIFYING CANDIDATE`"), and the write scope is exact and single-valued: three targets, all marked "(new)" (`docs/v2/cards/S4a.2.md:21-23`), all three confirmed absent from the tree, with `docs/v2/state/STT-SELECTION.json` as the one artifact two later cards read. The read scope is not exact: two of its three entries are fine (`server/src/ai/whisper.ts` 634 lines, `shared/src/transcribe.ts` 235 lines, both present), but the third is "the audio from S4a.1" (`docs/v2/cards/S4a.2.md:19`) — a description, not a path, with no run id, no directory and no regeneration instruction. That corpus is a sandbox-only artifact by design: S4a.1's card says generated audio is "**never committed** (L-POLICY row 4)" and that `reference.json` and the voice checksums are "sandbox outputs transcribed into `docs/v2/evidence/S4a.1/`" (`docs/v2/cards/S4a.1.md:78-80`), and `e2e/fixtures/audio-es/` holds one README and no audio. See IR-01 below |
| IR-02 | Does every prerequisite artifact exist and is it `APPROVED` in `state/PROGRESS.json`? | DEFECT | `PROGRESS.json` reads `S4a.1: APPROVED` and `P4.1: APPROVED`, the card's two declared dependencies (`docs/v2/cards/S4a.2.md:9`), and also `P0.3`, `P3.1`, `P3.2`, `S3.1` as APPROVED, so `sandbox.mjs` and the whisper.cpp build are accounted for. Three artifacts the card needs are nevertheless absent or unpinned: the 295-clip Spanish corpus (its sandbox run folder `2026-09-26T15-48-47-652Z-d7afeb16` from `docs/v2/state/cards/S4a.1.json` no longer exists — `/tmp/apunta-v2` is not on this machine at all); the six candidates, which "are not catalogue entries yet" (`installer/src/catalog.ts:67-72`) and so have no pinned size and no pinned SHA-256 anywhere, which is exactly what C-STT@1's result ("`SELECTED <file>` with pinned size and SHA-256") and C-ACQ@1 rule 5 require; and `whisper-cli`, which exists only as a gitignored build output at `build/linux-resources/bin/whisper-cli` and is not on `PATH`, and which the card never names. See IR-02 below |
| IR-03 | Are the chosen behaviour, data shape, errors and legacy rules explicit? | DEFECT | The behaviour is pinned by the contract, but the inputs to it are not. "The Spanish lead-in prompt" (C-STT@1) does not exist in the repository: `STT_LEAD_IN` is English — `"Okay, notes from today's session."` (`server/src/ai/whisper.ts:286`) — and `docs/research/es-mx-speech.md`, the only file any card points at for a Spanish lead-in (`docs/v2/cards/S4b.1.md:34-35`), contains no occurrence of "prompt" at all. The metrics are named, not defined: no tokenizer or normalisation for "word error rate", no inventory of what counts as a negation for "negations retained 100%", no denominator for "numbers and doses exact at least 95%", no definition of "clinical-term exact rate", no sample set or chunking for "preview real-time factor p95", and no method for "peak memory at most 2 GiB". Two fields of the artefact are undefined: `preview` ("same shape or null" — of what, chosen by what rule) and `evidence`. See IR-03 below |
| IR-04 | Are the happy path and at least one failure outcome testable without guessing? | DEFECT | One failure outcome is well defined: the Stop conditions' "a candidate cannot be downloaded within the approved hosts: record it as unavailable (it does not qualify); do not substitute another file" (`docs/v2/cards/S4a.2.md:45-47`), which is concrete and matches P4.1's stop conditions 1 and 2 naming the same response. The happy path is not testable without guessing, because V1 is expected to produce "a per-candidate table" whose six qualifying columns have no pinned definition and whose prompt input does not exist, and because the corpus V1 reads is not on this machine (IR-01, IR-02). The same gap makes the `NO QUALIFYING CANDIDATE` arm — the result the whole Spanish chain waits on — unreproducible by V3. See IR-04 below |
| IR-05 | Does every command name its working directory and exist in `package.json` or the repo, or is it marked as created by a named earlier card? | DEFECT | The table header names cwd repo root for all three rows, `node` exists, and `scripts/v2/stt-benchmark.mjs` is correctly marked "(new)" in May edit; V2's `require('./docs/v2/state/STT-SELECTION.json')` is valid. Three things are missing. (1) The card is **L3**, and RUN-CONFIG §2's L3 row is "the card's listed commands, all through `sandbox.mjs`", while the dispatch header says "No sandbox port assigned" and both V1 and V2 are bare `node` with no wrapper. (2) V1 silently depends on a gitignored build output: the "hardened downloader from P4.1" is `installer/src/download.ts` (P4.1's Read at `docs/v2/cards/P4.1.md:24-27`), which a plain `node scripts/v2/*.mjs` can only reach as `installer/dist/download.js` — `installer/dist` is untracked (`git ls-files installer/dist` = 0 files) and is produced by `npm run build --workspace @apunta/installer`; P4.1's own V4 says so in as many words: "**The two builds are part of this row, not decoration:** the test resolves the catalogue from `installer/dist/`, which is gitignored and absent on a clean checkout, so without them the row dies on import and reports NOT RUN" (`docs/v2/cards/P4.1.md:525`). (3) The program V1 measures, `whisper-cli`, is named nowhere in the card — no flag, no env var, no path — and is not on `PATH`. See IR-05 below |
| IR-06 | Are tools to be created clearly distinguished from tools that already exist? | CLEAR | Every artefact the card creates is marked "(new)": `scripts/v2/stt-benchmark.mjs`, `docs/eval-reports/<date>-es-mx-whisper-benchmark.md` (the `<date>` token is the repository's own convention, matching `docs/eval-reports/2026-09-20-*.md`) and `docs/v2/state/STT-SELECTION.json`; all three are confirmed absent from the tree. Everything it consumes is named as an existing thing from a named earlier card or an existing file: "the hardened downloader from P4.1" (P4a.1 APPROVED, `installer/src/download.ts`), the C-STT candidates as fixed contract text, the two production files under Read. Nothing existing is claimed as new, and nothing existing is claimed for editing — `server/src/ai/whisper.ts` and `shared/src/transcribe.ts` are in Read and reinforced by "Must not edit: Production code (P4.3 wires the selection in)", which is also what keeps P4.3's and S4b.1's wiring out of this card |
| IR-07 | Can every test, restart and cleanup stay inside the sandbox (C-ISO)? | DEFECT | Nothing in the card contacts 7717, starts a server, opens a database or restarts anything, so the destructive half of HS-2 is satisfied; the fixture is fabricated (HS-8) and the models are dev-time artefacts (HS-3, A07 "Shipped? selected one only"). What is not established is where "inside the sandbox" *is*: `<sandbox>/audio-es` and `<sandbox>/models` (`docs/v2/cards/S4a.2.md:41`) are used three times and defined nowhere, no `sandbox.mjs` invocation appears, and the dispatch assigns no port. `sandbox.mjs` is the only thing that creates a run folder — `/tmp/apunta-v2/<runId>/` with `data/`, `logs/`, `tmp/`, mode 700 (`scripts/v2/sandbox.mjs:116-117`, usage at `:10-11`) — so a worker must invent both the token and the directory. S4a.1, the direct precedent, bound the same token by mechanism instead: `sandbox.mjs env --port 7807`, source the printed exports, write to `$(dirname "$APUNTA_DATA_DIR")/audio-es`, and "never write directly under `/tmp/apunta-v2`" (`docs/v2/cards/S4a.1.md:139-143`). `<sandbox>/models` is where ~2.3 GB of weights will land, which makes the omission more consequential, not less. See IR-07 below |
| IR-08 | Is every relevant hard stop preserved, with a concrete stop response? | DEFECT | HS-1 to HS-10 are quoted in full and the load-bearing ones are answered: HS-3 by the Stop conditions' unavailable-candidate response, which is the response P4.1's stop conditions 1 and 2 point at by name; HS-7 by "the selection uses only the contract's rule" plus the contract's own "No other candidate, threshold or benchmark may be added after seeing results"; HS-8 by S4a.1's fabricated corpus and `e2e/fixtures/eval-es/NAMES.md`; HS-9 by an exact three-file May-edit list; HS-10 by the card's inertness (it writes a JSON record, it does not enable anything). One relevant condition has no stop response at all. The coordinator's own handoff states the precondition: "**S4a.2** — Spanish speech benchmark, waiting on P4.1, which is APPROVED. It measures speed and accuracy, so it needs a quiet machine and must never run while the owner is testing live" (`docs/v2/state/NEXT-SESSION.md`). The card says nothing about machine load, and two of C-STT@1's six criteria are wall-clock thresholds (preview RTF p95 ≤ 0.5, final RTF p95 ≤ 1.0) measured "on this PC". See IR-08 below |
| IR-09 | Can a fresh session resume from the checkpoint without repeating side effects? | DEFECT | `docs/v2/state/cards/S4a.2.json`, the checkpoint the dispatch names, does not exist — which is normal for a card that has not started (no not-started card has one, and S4a.1's own implementer recorded that the checkpoint is coordinator-owned, `docs/v2/state/returns/S4a.1.md:182-187`) — so the resumability problem is not the file's absence but that the card never requires anything to be written into it. Unlike S4a.1, whose Output-location bullet requires the run id in `sandboxRuns` (`docs/v2/cards/S4a.1.md:142-143`), S4a.2's Fixed decisions say nothing about recording a run id, a per-candidate completion state, or the six downloads. The side effects are the largest in the plan so far and they are in `/tmp`: ~2.3 GB of weights and hours of `whisper-cli` runs, in a run folder that a container or a reboot can take. This is not hypothetical — the S4a.1 corpus is gone for exactly that reason (IR-02), and a resumed S4a.2 session cannot even locate its predecessor's work, because `<sandbox>` is undefined (IR-07). See IR-09 below |
| IR-10 | Is the required evidence obtainable, or honestly marked missing? | DEFECT | The shape of the evidence is fine and mostly required elsewhere: `docs/v2/state/reviews`-style return-file and `docs/v2/evidence/S4a.2/` obligations come from RUN-CONFIG §4 and AM-017 (a required output, not a May-edit violation), acquisition records come from ACQUISITION §1, and the May-edit list already includes the report. The content is not obtainable as the card specifies. RUN-CONFIG §4 requires each command's evidence to record "working directory, exact command, exit code, start and end time, and a short excerpt", and Fixed decision 2 requires SHA-256 and size per candidate — but the independent half of that pair, the publisher checksum, is not obtainable from anything the card names: whisper.cpp's checksum list (`models/download-ggml-model.sh`, SHA-1 only, per `installer/src/catalog.ts:152-153`) is not in the repository, no ACQUISITION row grants fetching it as a file in its own right, and the card's only instruction is "verify publisher checksums where published" with no source named and no response for the case where none can be had. The same row's environment record — core count, thread policy, the `whisper-cli` build, whether the machine was quiet — is what makes an RTF number mean anything, and is not mandated either. See IR-10 below |

## Details

### IR-01 — DEFECT

- **ID and location:** `docs/v2/cards/S4a.2.md:19` (§ Read), mirrored at
  `docs/v2/state/dispatch/S4a.2-ir.md:69-71`; interaction with
  `docs/v2/cards/S4a.1.md:78-80` and `:139-143`.
- **The text that conflicts, or exactly what is missing:** the third Read entry is
  "the audio from S4a.1" — no path, no run id, no directory, and no statement
  that the corpus must be regenerated because S4a.1's audio is never committed.
- **One concrete failure scenario:** an implementer reads "the audio from S4a.1",
  looks for it, finds `e2e/fixtures/audio-es/` containing one README and nothing
  else, and either reports `BLOCKED` on a missing prerequisite that
  `PROGRESS.json` says is `APPROVED`, or — worse, plausibly — regenerates it by
  hand from `scripts/v2/generate-es-audio.mjs` without the S4a.1 Piper contract
  (`PIPER_BIN`, `PIPER_MODEL`, `noise_scale 0`, `noise_w 0`, one thread), and
  benchmarks against a corpus that is not the one S4a.1 certified, defeating the
  determinism V1 of that card exists to protect.
- **One specific correction or named prerequisite:** either the coordinator
  re-runs S4a.1's V2 and names the run id in the dispatch (binding the token the
  way S4a.1 does: `node scripts/v2/sandbox.mjs env --port <p>` then
  `$(dirname "$APUNTA_DATA_DIR")/audio-es`), or the card's Read names
  `scripts/v2/generate-es-audio.mjs`, `scripts/v2/check-es-audio.mjs` and the
  S4a.1 Piper invocation contract as the way to (re)create the corpus before V1,
  and says the benchmark reads `reference.json` for each clip's reference text,
  `variant`, `source` and `category`.

### IR-02 — DEFECT

- **ID and location:** `docs/v2/cards/S4a.2.md:9` (Depends), `:19` (Read),
  `:29-31` (Fixed decision 1); `installer/src/catalog.ts:66-77`;
  `docs/v2/state/cards/S4a.1.json`; `.gitignore:55`.
- **The text that conflicts, or exactly what is missing:** two of the three
  dependencies' artefacts are missing. (a) S4a.1 is `APPROVED` but its corpus is a
  sandbox output: the run id in its checkpoint, `2026-09-26T15-48-47-652Z-d7afeb16`,
  is inside a `/tmp/apunta-v2` tree that no longer exists on this machine.
  (b) The six A07 candidates "are not catalogue entries yet, so nothing in this
  package uses this object" (`installer/src/catalog.ts:67-72`) — no `url`, no
  `sizeBytes`, no `sha1`, no `sha256` for any of the six exists in the repository,
  while the contract's result and C-ACQ@1 rule 5 both turn on a pinned size and
  SHA-256. (c) `whisper-cli`, the program every criterion measures, exists only as
  a gitignored build output (`build/`, `.gitignore:55`) and is not on `PATH`.
- **One concrete failure scenario:** the implementer finds no corpus and no pins,
  downloads the six files with `downloadWithResume` (which is happy with
  `checksum: null`), hashes whatever arrived, and writes those self-computed
  numbers into `STT-SELECTION.json` as "pinned size and SHA-256". A pin that the
  pinner computed from the same bytes it verified is not an independent pin, so
  C-ACQ@1 rule 5 — the rule that exists to catch a wrong artifact — is satisfied
  in letter and defeated in substance, and `SELECTED` is recorded against it.
- **One specific correction or named prerequisite:** state where each candidate's
  size and SHA-256 come from before the download, as P4.1's Fixed decision 5
  states what a pin is for the speech entry ("The pinned size is a pin… A
  **second** mismatch on the same artifact after a repair is stop condition 5,
  because re-downloading cannot fix a wrong pin"). In practice that means naming
  the publisher checksum source and what to do when it cannot be had, or naming a
  card that adds the six entries to the catalogue. Note that this is not a new
  observation: `docs/v2/state/AMENDMENTS.md:56` (AM-052) records P4.1's review
  finding 3 as "**a card defect, not an implementer error:** Fixed decision 2 as
  written is unimplementable, because the six C-STT candidates are not catalogue
  entries", carried and not closed — S4a.2's Fixed decision 1 inherits it
  verbatim.

### IR-03 — DEFECT

- **ID and location:** `docs/v2/cards/S4a.2.md:32-36` (Fixed decisions 2 and 3);
  `docs/v2/CONTRACTS.md:462-478` (C-STT@1); `server/src/ai/whisper.ts:286`;
  `shared/src/transcribe.ts:87-93`; `docs/v2/cards/S4b.1.md:34-35`.
- **The text that conflicts, or exactly what is missing:** three things.
  (1) "The Spanish lead-in prompt" (C-STT@1) is named but nowhere supplied:
  `STT_LEAD_IN` is `"Okay, notes from today's session."`
  (`server/src/ai/whisper.ts:286`), the vocabulary sentence is English too
  (`:298`), and the only card that points at a source for a Spanish one,
  S4b.1, points at `docs/research/es-mx-speech.md` — a file with no occurrence of
  "prompt" in it. This card may not create the string either: its May-edit list
  is three files and "Must not edit: Production code".
  (2) Six named metrics with no operational definitions: no tokenizer or
  normalisation for WER (the one precedent, `docs/eval-reports/2026-09-20-tiny-en-clinical-vocabulary.md`,
  says only in prose "normalized for number words ('one hundred' = '100') and
  casing"); no inventory of negations for "negations retained 100%" and
  "inserted negations 0"; no denominator for "numbers and doses exact at least
  95%" (all 295 clips? the 120 clinical sentences? the `dose-and-number` trap
  only? which variants — `clean` only, or `noise` and `fast` too?); no definition
  of "clinical-term exact rate" beyond the pick rule that consumes it; no sample
  set for the two RTF p95 values, and no statement of how the preview arm is fed
  — production previews are 5-second browser chunks at
  `PREVIEW_INTERVAL_MS = 5_000` with a fitted `--audio-ctx`
  (`shared/src/transcribe.ts:201`, `server/src/ai/whisper.ts:159`), which is a
  very different duration distribution from the corpus's dictation clips and a
  materially different RTF; no method for "peak memory at most 2 GiB".
  (3) Two undefined fields in the artefact: `preview` ("same shape or null" —
  of what, and chosen by what rule; C-STT@1's Pick rule selects exactly one file
  and never mentions a preview model, while production's preview model is a
  separate setting that today points at the same file,
  `shared/src/transcribe.ts:87-93`) and `evidence` (a path, an object, a table?).
- **One concrete failure scenario:** two implementers, same corpus, same models,
  different readings. One normalises numbers and case and scores the 40
  `clinical` sentences per class; the other compares raw tokens and scores all
  295 clips including the 5 silence and 5 tone clips. One passes the 95% and 100%
  bars and the other does not, so the same six files qualify differently, and V3
  — "reviewer recomputes the selection from the table" — cannot adjudicate,
  because the table is arithmetically correct in both readings. The card's own
  clause "the selection uses only the contract's rule" does not help: the
  contract names the metrics without defining them, and "No other candidate,
  threshold or benchmark may be added after seeing results" forbids fixing the
  definition once results exist.
- **One specific correction or named prerequisite:** pin, before any run, the
  reference `text` and the per-clip denominators for each of the six criteria
  (which `source`/`category` and which `variant`), the normalisation rules, the
  negation inventory, the preview arm's chunking, the p95 sample set, and the
  memory measurement method (`/usr/bin/time -v` maximum resident set, or whisper's
  own reported figures — it reports none); supply the Spanish lead-in text, or name
  the card that will; and define `preview` and `evidence` field by field, as
  S4a.1 defined `reference.json` field by field.

### IR-04 — DEFECT

- **ID and location:** `docs/v2/cards/S4a.2.md:38-47` (§ Verification, § Stop
  conditions), against `:32-36` and C-STT@1.
- **The text that conflicts, or exactly what is missing:** one failure outcome is
  properly specified (the unavailable candidate, recorded as not qualifying, with
  no substitution — the same response P4.1's stop conditions 1 and 2 name). The
  happy path is not testable without the guesses listed under IR-03, and the
  card's other terminal result is untested by construction: `NO QUALIFYING
  CANDIDATE` has no row, no fixture and no defined way to be produced
  deliberately, so the outcome that keeps Spanish held (C-ES-GATE) is a result the
  plan will only ever see by accident.
- **One concrete failure scenario:** V1 exits 0 and prints a table; V2 exits 0; a
  reviewer applies C-STT@1 to the table and gets the same file. Two sessions
  later the owner runs the same card again on a busier machine, the RTF p95 column
  crosses 1.0, and the card records `NO QUALIFYING CANDIDATE` — a result that
  cannot be revisited, because the contract forbids adding a benchmark after
  seeing results and the release gate treats the word as final.
- **One specific correction or named prerequisite:** add the negative arm the plan
  already uses elsewhere — a fixture or an injected metric set in which one
  candidate misses one bar, so the qualification filter and the `NO QUALIFYING
  CANDIDATE` path are exercised and their output shape is fixed by the card rather
  than discovered. And state, in the card, the machine conditions under which a
  run's RTF numbers may be recorded at all (IR-08).

### IR-05 — DEFECT

- **ID and location:** `docs/v2/cards/S4a.2.md:38-43` (§ Verification) and `:7`
  (Level L3); `docs/v2/RUN-CONFIG.md` §2 L3 row; `docs/v2/cards/P4.1.md:525`;
  `.gitignore:55`; `package.json` `build` script.
- **The text that conflicts, or exactly what is missing:** (1) The card declares
  itself L3; RUN-CONFIG §2's L3 row is "the card's listed commands, **all through
  `sandbox.mjs`**", and the dispatch header for this card says "No sandbox port
  assigned", while V1 and V2 invoke `node` directly. The plan has a named
  precedent for resolving this in the other direction — AM-025, where P0.5's rows
  "run bare rather than through `sandbox.mjs`" because nothing launches anything
  — but this card does place files under `<sandbox>` and so needs a run folder,
  which is precisely what `sandbox.mjs` creates. (2) "The hardened downloader
  from P4.1" is `installer/src/download.ts`; a plain `node scripts/v2/*.mjs`
  cannot import TypeScript, and the P4.1 precedent for reaching it from a `.mjs`
  script is the **built** output: `scripts/v2/probe-redirects.mjs` imports
  `../../installer/dist/catalog.js`, and P4.1's V4 states the consequence in bold
  ("absent on a clean checkout, so without them the row dies on import and reports
  NOT RUN"). No build step appears in V1. (3) `whisper-cli` — the thing being
  measured — is named in neither the card nor either verification row; production
  resolves it from a user setting defaulting to `whisper-cli` on `PATH`
  (`shared/src/transcribe.ts:64-65`), which is not where it is on this machine.
- **One concrete failure scenario:** the implementer writes
  `stt-benchmark.mjs` importing `installer/dist/download.js` (the only way to
  reuse P4.1's guard), runs V1 as written on a checkout where `npm run build` has
  not been run in this session, and the row dies at import. Reading "exit 0;
  per-candidate table" as a requirement, the tempting fixes are the two the plan
  forbids: a hand-rolled `fetch` inside the script — a second download path
  outside the hardened guard, which is HS-7's "loosen a guard" and P4.1's whole
  purpose — or editing `installer/` or `package.json`, both outside May edit.
- **One specific correction or named prerequisite:** add to V1 the builds the row
  needs, as P4.1's V4 does, plus a wrapper for the L3 obligation and a port; name
  the binary explicitly (a `--whisper <path>` flag, or the `build/linux-resources/bin/whisper-cli`
  default with `WHISPER_CLI` as the override), and say what the row does when
  `installer/dist/` is absent — the P4.1 wording, "V2 is `BLOCKED`; it is never a
  reason to add an exemption", transfers directly. Then, as a row of its own,
  `npm run lint` (which covers `eslint .`, `prettier --check .` and the licence
  check) — a new `.mjs` under `scripts/` is inside its globs and the card
  currently has no row that would notice.

### IR-07 — DEFECT

- **ID and location:** `docs/v2/cards/S4a.2.md:30` (`<sandbox>/models/`) and `:41`
  (V1); `docs/v2/state/dispatch/S4a.2-ir.md:7` (no port assigned);
  `docs/v2/RUN-CONFIG.md` §1 and §2; `scripts/v2/sandbox.mjs:10-11, 116-117`;
  `docs/v2/cards/S4a.1.md:139-143`.
- **The text that conflicts, or exactly what is missing:** `<sandbox>` is used as
  if it were a known path and is defined nowhere in the card, the dispatch, the
  run configuration or the contract. The only mechanism that produces a sandbox
  run folder is `sandbox.mjs run|env --port <p>`, and the dispatch declines to
  assign a port.
- **One concrete failure scenario:** the implementer reads `<sandbox>/models` and
  creates `/tmp/apunta-v2/models` — the sandbox's own root namespace, which
  `sandbox.mjs` reserves and `ensureRunDir` treats as its own, outside any run
  folder and therefore outside every run's cleanup and discovery. Six model files
  land there, no run id exists, and the next session has no way to tell which of
  them, if any, it already verified. The same slip one level up — writing into
  the real data folder — is the one HS-1 exists to prevent, and nothing in this
  card names the boundary the way S4a.1's did.
- **One specific correction or named prerequisite:** bind the token by mechanism
  exactly as S4a.1 does — give the card a port, require
  `node scripts/v2/sandbox.mjs env --port <p>` (or `run --port <p> -- …` to
  satisfy RUN-CONFIG §2's L3 row), source the printed exports, place the models
  at `$(dirname "$APUNTA_DATA_DIR")/models` and the audio at
  `$(dirname "$APUNTA_DATA_DIR")/audio-es`, forbid writes directly under
  `/tmp/apunta-v2`, and require the run id in the checkpoint (IR-09).

### IR-08 — DEFECT

- **ID and location:** `docs/v2/cards/S4a.2.md:45-47` (§ Stop conditions) and
  `:32-34` (Fixed decision 2), against C-STT@1's two wall-clock criteria and
  `docs/v2/state/NEXT-SESSION.md` ("It measures speed and accuracy, so it needs a
  quiet machine and must never run while the owner is testing live").
- **The text that conflicts, or exactly what is missing:** the card's only stop
  condition is about a download. Nothing states the machine-state precondition
  that governs two of the six qualifying criteria — "preview real-time factor
  p95 at most 0.5" and "final transcription real-time factor p95 at most 1.0 on
  this PC" — and nothing says what a run does if the machine was busy or the owner
  was testing during it. HS-7 forbids loosening a scorer or a threshold, and
  C-STT@1 forbids adding a benchmark after seeing results, so a contaminated run
  is not repairable inside this card.
- **One concrete failure scenario:** the owner is testing in the live instance
  while the benchmark runs; every candidate's RTF p95 roughly doubles; the card
  records `NO QUALIFYING CANDIDATE`; C-ES-GATE keeps Spanish held; and because
  no benchmark may be added or re-run after results are seen, the whole Spanish
  chain (S4b.1, S5.6, Q1.2) is now waiting on a number that was never a property
  of the models. The owner's own handoff already names this hazard; the card does
  not.
- **One specific correction or named prerequisite:** add a stop condition of the
  shape the plan already uses for the four-arm round (ACQUISITION §1, "The GPU is
  not shared" rule 3: "no arm runs while the owner is testing on the machine or a
  live instance is in use") — no run starts while the owner is testing, the
  machine state is recorded with the numbers, and a run whose recorded state does
  not meet the stated bar is reported as `BLOCKED` with its table rather than
  converted into a selection.

### IR-09 — DEFECT

- **ID and location:** `docs/v2/state/dispatch/S4a.2-ir.md:8` (checkpoint);
  `docs/v2/cards/S4a.2.md:28-36` (Fixed decisions, none of which record
  anything); compare `docs/v2/cards/S4a.1.md:142-143` and
  `docs/v2/state/returns/S4a.1.md:182-187`.
- **The text that conflicts, or exactly what is missing:** the card requires no
  checkpoint entry, no run id, no record of which candidates are downloaded and
  verified, and no per-arm completion state — while its side effects are the
  largest yet (six model files, ~2.3 GB, and thousands of `whisper-cli`
  invocations) and all of them land in `/tmp`.
- **One concrete failure scenario:** the session is reclaimed after four of six
  candidates are benchmarked. The next session reads a checkpoint that says
  `NOT STARTED` (or nothing at all, since the file does not exist yet), cannot
  locate the previous run folder because `<sandbox>` is undefined, and starts
  again from zero — re-downloading gigabytes and re-running hours of measurement.
  If it instead reuses a half-finished models directory it cannot tell which
  files were verified, because nothing recorded that either, and C-ACQ@1 rule 5
  is the only thing that could have.
- **One specific correction or named prerequisite:** require the checkpoint to
  carry the run id, the per-candidate state (`not fetched` / `fetched and
  verified` / `benchmarked`) with each file's SHA-256 and size, and the last
  completed arm — S4a.1's `sandboxRuns` requirement, which is what would have
  saved the corpus, and P4.1's receipt shape
  (`docs/v2/cards/P4.1.md:184-224`) is already the right instrument for the model
  files, so "the receipt is the record; a file with a matching receipt is not
  re-fetched" is one clause, not a new mechanism.

### IR-10 — DEFECT

- **ID and location:** `docs/v2/cards/S4a.2.md:29-31` (Fixed decision 1) and
  `:32-34` (Fixed decision 2); `docs/v2/RUN-CONFIG.md` §4; ACQUISITION §1.
- **The text that conflicts, or exactly what is missing:** "verify publisher
  checksums where published and record SHA-256 and size" names no source for the
  publisher checksums, and the repository has none: the only publication is
  whisper.cpp's SHA-1 list in `models/download-ggml-model.sh`
  (`installer/src/catalog.ts:152-153` records that this is all upstream
  publishes), that file is not in the repository, and no ACQUISITION row grants
  fetching it as an artefact in its own right — A06 covers the whisper.cpp source
  at a pinned revision for building `whisper-cli`. There is likewise no status
  word for "the checksum could not be verified", and the card's only stop
  condition (a download that fails within the approved hosts) does not cover it.
  Fixed decision 2's "Word error rate and clinical-term exact rate are reported
  for every candidate" gives no required columns beyond those two, so the table
  V1 must produce has no fixed minimum, and the environment record that gives an
  RTF number meaning — core count, thread policy, the `whisper-cli` build, machine
  state (IR-08) — is not mandated anywhere.
- **One concrete failure scenario:** the worker downloads, hashes and reports
  SHA-256 values that are self-computed, writes "publisher checksum: unavailable"
  nowhere, and files the report. RUN-CONFIG §4's evidence fields are all present,
  the ACQUISITION row is nominally satisfied, and the next reviewer cannot
  distinguish "verified against upstream" from "hashed what arrived" — which is
  the exact distinction C-ACQ@1 rule 5 exists to preserve, and the one AM-052
  already flagged for this artefact set.
- **One specific correction or named prerequisite:** name the checksum source and
  the response when it is unavailable (report the candidate with its own computed
  digest marked as such, or mark it unavailable and let it fail to qualify), and
  give the per-candidate table a fixed minimum set of columns — the six
  qualifying criteria with their raw numerators and denominators, WER, clinical-
  term exact rate, plus the environment block — so that the evidence is
  re-checkable by V3 and the report is comparable with the English precedent in
  `docs/eval-reports/`.

## Notes not counted against the ten IDs

- **The card of record, both dispatches and the contract are consistent.** No
  text drift to reconcile, and the "no other candidate, threshold or benchmark
  after seeing results" clause appears in all three copies of C-STT@1, so nothing
  below proposes touching a threshold — every correction proposed here is about
  naming an input the contract already assumes exists.
- **The six candidate filenames are named in four places** — C-STT@1,
  `ACQUISITION.md` A07, P4.1's Fixed decision 8 and `probe-redirects.mjs` — and
  all six lists agree, exactly. The P4.1 redirect evidence for them is at
  `docs/v2/evidence/P4.1/redirects.md`, and the query-key allow-list and
  allowance the download will run under are already in `installer/src/catalog.ts`
  (`C_STT_CANDIDATE_ALLOWANCE:74-77`, `A07_ALLOWED_QUERY_KEYS:121-132`). The
  acquisition side is in better shape than the pins: the card needs to inherit
  that mechanism by name rather than rediscover it.
- **The `preview` field is probably a leftover from a two-model design.**
  Production today points the preview setting at the same file as the note model
  (`shared/src/transcribe.ts:87-93`), C-STT@1 selects one file, and S4b.1's own
  V2 expects "the single-file download". If that is the intent, `preview` should
  be pinned to the same `{file, size, sha256}` as `file`; if a smaller preview
  model is intended, that is a second selection the contract does not authorise.
  Worth the coordinator's decision before the implementer guesses.
- **Disk.** Six candidates total roughly 2.3 GB (`base` 148 MB,
  `base-q5_1` ~60 MB, `small` 488 MB, `small-q5_1` ~190 MB,
  `large-v3-turbo-q5_0` ~574 MB, `large-v3-turbo-q8_0` ~874 MB), plus the corpus.
  `installer/src/disk.ts` already refuses a download on a full disk before it
  starts; the card says nothing, and the sandbox root is `/tmp`.
- **The 10 non-speech clips.** S4a.1's corpus includes 5 silence and 5 tone clips
  with `text: ""`. Whether they count toward the qualifying rates, are reported
  separately, or are excluded, is not stated — the same family of gap as IR-03's
  denominators, and cheap to fix in the same clause.
- **V3 is assigned to the reviewer, not to the implementer.** RUN-CONFIG §4 gives
  criteria the status words `NOT RUN`/`PASS`/`FAIL`/`BLOCKED`, so a row nobody in
  the implementation session can pass will be recorded as `NOT RUN` in the return
  file unless the card says so. S4a.1's return file handled a similar case
  explicitly, in prose, at §"Unresolved items". Worth one line.
- **`evidence` folder.** `docs/v2/evidence/S4a.2/` is not in the May-edit list;
  per AM-017 it is a required output, not a violation, exactly as for S4a.1.
- **AM-024/AM-025/AM-017/AM-023** need no application here beyond the two
  judgements recorded above (AM-025 for the bare-vs-sandboxed rows, AM-017 for the
  evidence folder).

Summary: **Not CLEAR on nine of ten — IR-06 only is CLEAR.** The card's spine
is sound: one bounded objective, an exact three-file write scope, an authoritative
contract that is quoted unaltered and consistently in all three copies, a
concrete stop response for an undownloadable candidate, and a clean separation of
new from existing tools. The failures are all inputs the contract assumes and the
card never supplies. (IR-01, IR-02, IR-04) The audio from S4a.1 does not exist on
this machine — its `/tmp/apunta-v2` run folder is gone, and because the corpus is
never committed, the card's read scope resolves to nothing and must either name
the run id or name the regeneration command; the same section shows the six
candidates have no pinned size and no pinned SHA-256 anywhere in the repository
(`installer/src/catalog.ts:67-72`), which is the defect AM-052 already carried
forward unclosed from P4.1, and `whisper-cli` exists only in a gitignored build
directory the card never names. (IR-03) "The Spanish lead-in prompt" exists
nowhere: `STT_LEAD_IN` is English and the file S4b.1 names as its source contains
no prompt text at all; the six qualifying metrics are named but have no tokenizer,
negation inventory, denominator, preview-chunking or memory-measurement
definition, so two correct implementations can qualify different files and V3
cannot adjudicate between them; and `preview` and `evidence` in
`STT-SELECTION.json` have no defined meaning. (IR-05, IR-07) Both verification
rows run bare `node` although the card is L3 and RUN-CONFIG §2 requires every L3
command through `sandbox.mjs`, the dispatch assigns no port, `<sandbox>` is used
three times and defined nowhere, and V1 depends on the gitignored
`installer/dist/` with no build step — the exact failure P4.1's V4 warns about in
bold. (IR-08, IR-09) The card has no stop response for a run made on a busy
machine or while the owner is testing, though two of the six criteria are
wall-clock thresholds whose only sanctioned result is irreversible, and it
requires nothing in the checkpoint, so the largest side effects in the plan —
2.3 GB of weights and thousands of whisper runs in `/tmp` — cannot be resumed
from, which is precisely how S4a.1's corpus was lost. Every defect is repairable
by naming what already exists — a run id or the regeneration command, a checksum
source, a token binding, a port, a `--whisper` path, a build step, a quiet-machine
stop, a checkpoint field, a table column set — and none of them asks for a
threshold, a candidate or a benchmark to change.

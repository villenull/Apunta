# Instruction review: S4a.1 Synthetic Spanish audio

Role: **INSTRUCTION REVIEW ONLY.** Base commit: `d9bfce5`, verified: `git log -1`
= `d9bfce520152fed43c765b9fc371449fb6c32740` ("Record card S3.1 APPROVED (v2
coordination state)") on branch `feature/v2`; no pull, merge, rebase or reset
performed. Attempt 1 of 3.

Inputs: dispatch file `docs/v2/state/dispatch/S4a.1-ir.md` (card text, HS-v1
hard stops, C-STT@1 excerpt, run configuration, ACQUISITION/L-POLICY@1 inlined)
and its implementation twin `docs/v2/state/dispatch/S4a.1.md`; the card of
record `docs/v2/cards/S4a.1.md` (byte-identical card body in both dispatch
copies); `docs/v2/state/cards/S4a.1.json` (checkpoint);
`docs/v2/state/PROGRESS.json` read-only per amendment AM-021; the card's Read
artifacts — `docs/research/es-mx-speech.md` (§§5.1–5.4, voices, samplerates,
L-POLICY row 4 verdict), `e2e/fixtures/eval-es/**` (tuning 33 + heldout 22
dictations, two `expectations.json` sidecars, `NAMES.md`, `README.md`),
`docs/research/es-mx-clinical-glossary.json` (parses; 399 entries);
`docs/v2/cards/S4a.2.md` (the consumer of this card's output);
`scripts/v2/sandbox.mjs` (run-folder layout, `SANDBOX_ROOT`);
`scripts/synthetic-acceptance/generate-audio.mjs` and
`e2e/fixtures/audio/README.md` (the existing English audio precedent);
`docs/v2/AMENDMENTS.md` for AM-014, AM-017, AM-021. No implementation command
was run, no server, database or app was touched, port 7717 was never
contacted, no decision was changed, and no file was edited except this one.

Coordinator-supplied decisions applied:

- **AM-021** — `docs/v2/state/PROGRESS.json` is a read-only IR input for IR-02.
- **AM-017** — the dispatch-mandated return file and `docs/v2/evidence/<id>/`
  are **required outputs**, not violations of a card's "May edit" /
  "Must not edit" list.
- **AM-014** — markdown prettier rows are non-binding. S4a.1 is level L1 and
  names no prettier row, so nothing here turns on it; recorded for
  completeness.

| ID | Question | Answer | Reference |
| --- | --- | --- | --- |
| IR-01 | Is the objective one bounded behaviour with exact read and write scope? | DEFECT | The objective is one sentence and the *generator* scope is exact (`docs/v2/cards/S4a.1.md:22`, `scripts/v2/generate-es-audio.mjs` (new), and neither file exists today). The write scope is not exact: "Fixed decisions" requires the output to carry `reference.json` **and the voice checksums** (`:37–38`), but "May edit" grants only `e2e/fixtures/audio-es/README.md` and `e2e/fixtures/audio-es/*.wav` under that directory (`:22–24`) and names no checksum file at all. The card also has two output locations (`<sandbox>/audio-es/` authoritative; `e2e/fixtures/audio-es/`) with no line saying which artefacts, if any, are copied between them. See defect IR-01-A |
| IR-02 | Does every prerequisite artifact exist and is it `APPROVED` in `state/PROGRESS.json`? | CLEAR | `PROGRESS.json` at `d9bfce5` (read-only, per AM-021) reads `"S3.1": "APPROVED"`, `"S1.R": "APPROVED"` — the two declared dependencies. Also relevant and approved: `S1.3` (the voice list the card's first Fixed decision cites), `P0.3` (`sandbox.mjs` exists, so C-ISO tooling is available), `C0.1`. All three Read artifacts exist and are usable: `es-mx-speech.md` §5.2–5.4 is exactly the "voices and redistribution position" the card promises; `e2e/fixtures/eval-es/` holds 33 tuning + 22 heldout dictations with per-split `expectations.json`, so "the Spanish tuning and held-out dictations" resolves uniquely to those 55 (the owner's separate `e2e/fixtures/eval-owner-es/` corpus is correctly *not* read); the glossary JSON parses (399 entries). Piper itself is **not** installed on this PC (`command -v piper` empty, no `piper` module), which is not a missing prerequisite: A09 assigns the acquisition to this card and `ACQUISITION.md` §2 covers the "already present" branch. HS-8's Spanish-names rule is satisfiable because `e2e/fixtures/eval-es/NAMES.md` exists (the 110 invented people, both corpora) |
| IR-03 | Are the chosen behaviour, data shape, errors and legacy rules explicit? | DEFECT | Six specifics are named but not specified: the 22,050 → 16,000 resample, the `1.15×` rate and 20 dB noise parameters, the `reference.json` shape and the checksum artefact, the voice→clip mapping, the source of the 40 clinical-term sentences, and the Piper invocation contract. Each has a concrete failure and correction below (IR-03-A … IR-03-F) |
| IR-04 | Are the happy path and at least one failure outcome testable without guessing? | DEFECT | V1's precondition is unestablished: byte-identical SHA-256 across two runs is demanded while only the *added* room noise is described as seeded, and no input states that Piper's own synthesis is byte-deterministic for fixed text/voice/version (A09's "newest release on acquisition day" leaves the version unpinned until acquisition). And the card has **no failure outcome at all**: no `V3`-style negative row, no "Stop conditions" section (contrast `docs/v2/cards/S4a.2.md`), and V2 states only "exit 0". See IR-04-A and IR-04-B |
| IR-05 | Does every command name its working directory and exist in `package.json` or the repo, or is it marked as created by a named earlier card? | DEFECT | V1 is a real command against a file this card creates (marked "(new)"), and the table header names cwd repo root. **V2 is prose, not a command**: the row reads "`node -e` check that every clip is 16 kHz mono and `reference.json` covers every clip" — no program, and no repo path the check could be written to. See IR-05-A |
| IR-06 | Are tools to be created clearly distinguished from tools that already exist? | CLEAR | Every artefact the card creates is marked "(new)": `scripts/v2/generate-es-audio.mjs` (`:22`, does not exist), `e2e/fixtures/audio-es/README.md` (`:22–23`, directory does not exist), `e2e/fixtures/audio-es/*.wav` (`:23`). No existing tool is claimed as new and nothing existing is claimed to be edited, so a worker cannot mistake one for the other. The commands the card leans on exist: `node` (A01, dev), `scripts/v2/sandbox.mjs` (P0.3, APPROVED). Non-blocking observation, not counted: the existing English precedent is absent from Read, so its conventions are not inherited — `scripts/synthetic-acceptance/generate-audio.mjs:19,30` takes the output path **positionally** (not `--out`), takes the voice as `PIPER_MODEL`, and writes a `.sha256` sidecar; `e2e/fixtures/audio/README.md` documents the repo's 16 kHz mono 16-bit convention. Adding that one file to Read would stop a second convention being invented |
| IR-07 | Can every test, restart and cleanup stay inside the sandbox (C-ISO)? | DEFECT | Containment is otherwise sound — no server, database or app launch, so HS-2 does not require `sandbox.mjs run`; Piper is a dev-only subprocess; nothing contacts 7717; nothing restarts. The gap is that `<sandbox>` is never defined. See IR-07-A |
| IR-08 | Is every relevant hard stop preserved, with a concrete stop response? | CLEAR | HS-1 through HS-10 are quoted in full with one concrete response each ("stop the step, write what was needed in your return file with status `BLOCKED`, and do nothing else for that step"), and nothing in the card crosses one. HS-3 is the load-bearing one and the manifest answers both branches for this card: **A09** (Piper TTS, `pypi.org`/`files.pythonhosted.org`, "only if not already installed", *not shipped*, dev-only GPL-3.0) is permitted by L-POLICY's "Development-only tools never shipped or linked: any OSI licence, including GPL (Piper)" row, and **A10** (`es_MX` voices from `huggingface.co`/rhasspy/piper-voices, at most 3, *not shipped*) is permitted as a dev-only model file; both name S4a.1 as an acquiring card, and the return file's Acquisitions section already requires version, URL, size, SHA-256 and licence evidence. The `<= 10 MB` May-edit allowance is **not** usable: the card's own Read file settles L-POLICY row 4 — `es-mx-speech.md:148–154` records that none of the five model cards read states any position on redistributing generated audio, that the repo-level MIT tag and the public-domain/Unlicense datasets are "not card permission", and the consequence "must be generated at test time into the sandbox and **never committed**". So the compliant action is: acquire A09/A10, write nothing under `e2e/fixtures/audio-es/*.wav`, and report the licence text found (`BLOCKED` per L-POLICY's closing line) if a voice is unobtainable. HS-8 is satisfiable (`NAMES.md` exists); HS-9's stop response is where the IR-01 defect would bite; HS-5, HS-6, HS-7, HS-10 are inert for a card that writes one script and no product code |
| IR-09 | Can a fresh session resume from the checkpoint without repeating side effects? | CLEAR | `docs/v2/state/cards/S4a.1.json` records attempt 1 of 3, `status: "IN PROGRESS"`, `baseCommit: "d9bfce5"` (matches the dispatch), `sideEffectsDone: []`, `changedFiles: []`, `sandboxRuns: []`, `nextAllowedAction: "check instruction review return"`, V1/V2 `NOT RUN`. The only cross-session side effects are the A09/A10 installs, and the manifest makes them idempotent ("only if not already installed"; record the digest/URL/SHA-256 once) while the return file's Acquisitions section is where a resumed session reads them back. Because nothing may be committed (IR-08), there is no stale committed corpus for a later session to trust: the audio is regenerated per run folder, which is also what lets S4a.2 run `--audio <sandbox>/audio-es` from its own run folder (`docs/v2/cards/S4a.2.md:41`) — at the cost that the generator's determinism must be real, which is the IR-04-A finding. Re-running V1 is otherwise idempotent |
| IR-10 | Is the required evidence obtainable, or honestly marked missing? | CLEAR | Under AM-017 the return file and `docs/v2/evidence/S4a.1/` are required outputs, so the evidence folder is not a May-edit violation (RUN-CONFIG §4 and the dispatch's "Your return file" section mandate it). The fields are specified: cwd, exact command, exit code, start and end time, excerpt (failures in full, ≤200 lines), with the sanitisation rules (`<sandbox>`, `~`, no hostnames/usernames/keys/real names) — which matter here because the evidence must quote a `<sandbox>/audio-es` path and a home-directory voice path. Acquisition evidence is obtainable and is required by ACQUISITION §1 plus the return template. Status words are defined for every case. Caveat carried from IR-05: until V2 becomes a real command, its evidence can only be an unrepeatable pasted one-liner, and until IR-04-A is fixed, V1's evidence must record the Piper version and every synthesis parameter or the criterion is unverifiable; both are honestly markable `NOT RUN`/`BLOCKED` meanwhile |

## Defects

### IR-01-A — two required outputs have no place in the write scope

- **ID and location:** IR-01; `docs/v2/cards/S4a.1.md`, "May edit" (lines
  21–24) against "Fixed decisions" (lines 37–38).
- **The text that conflicts, or exactly what is missing:** Fixed decisions
  require the output directory to hold `reference.json` (text per clip) "and the
  voice checksums". May edit grants, under `e2e/fixtures/audio-es/`, only
  `README.md` and `*.wav`. There is no May-edit entry for a `reference.json`,
  and no file name is given anywhere for the checksums.
- **One concrete failure scenario:** a worker copies the corpus into the repo
  (the `README.md` entry exists for exactly that) and writes
  `e2e/fixtures/audio-es/reference.json`; that path is outside May edit, so
  HS-9 stops the step and the card reports `BLOCKED` on its own primary
  artefact. The other reading is worse: the worker omits `reference.json`
  because it is not permitted, ships WAVs plus a README, and S4a.2 later runs
  `--audio` against a directory with no reference text to score WER against.
- **One specific correction or named prerequisite:** add
  `e2e/fixtures/audio-es/reference.json` and a named checksum artefact (e.g.
  `e2e/fixtures/audio-es/voices.sha256`) to May edit, **or** add one
  Fixed-decision line — "the repository copy holds only the WAVs and the
  README; `reference.json` and the voice checksums live in the sandbox output
  and are transcribed into `docs/v2/evidence/S4a.1/`" — so the two output
  locations cannot both be half-used. Under IR-08's resolution (nothing may be
  committed at all) the second form is the compliant one and the May-edit WAV
  entry simply stays unused.

### IR-03-A — 16 kHz is required but no resample is specified

- **ID and location:** IR-03; Objective (lines 14–15) and V2 (line 44) against
  "Fixed decisions" (lines 29–38).
- **The text that conflicts, or exactly what is missing:** the objective and V2
  both demand 16 kHz mono. Every voice the card's first Fixed decision names is
  **22,050 Hz** — `docs/research/es-mx-speech.md:133–135` (es_MX-claude high,
  es_MX-ald medium, es_MX-ald x_low), which is the card's own Read file — and
  Piper writes at the voice's rate. The card never says to resample, never
  names a resampler, and does not say that the 5 silence and 5 tone clips are
  generated at 16 kHz directly.
- **One concrete failure scenario:** the straightforward implementation emits
  22.05 kHz files and V2 fails on every single clip, so the worker must invent
  a resampler; two workers pick different ones, and the corpus that C-STT@1
  (S4a.2) then measures — the negation and dose accuracies the whole selection
  rule rests on — silently depends on an undocumented choice.
- **One specific correction or named prerequisite:** add a Fixed decision:
  "voices are 22,050 Hz; every clip is resampled to 16,000 Hz, mono, 16-bit PCM
  with <named method, stated once>; the 5 silence and 5 tone clips are
  generated directly at 16,000 Hz", and have V2 assert the bit depth and channel
  count as well as the rate.

### IR-03-B — variant parameters are named, not specified

- **ID and location:** IR-03; "Fixed decisions", line 32–33 ("Variants per
  dictation: clean; room noise at 20 dB SNR (generated noise, seeded); speech
  rate 1.15×").
- **The text that conflicts, or exactly what is missing:** Piper expresses rate
  as a length scale in which values **above 1 are slower**, so "speech rate
  1.15×" reads either as `--length-scale 0.87` (15% faster) or as
  `--length-scale 1.15` (15% slower) — a ~30% difference. Unstated as well:
  the noise colour (white/pink), the mixing method, whether 20 dB SNR is per
  clip, and the seed's value and where it comes from.
- **One concrete failure scenario:** two workers produce corpora whose speaking
  rates differ by a third; the held-out dictations then measure a different
  acoustic condition than the tuning set, and C-STT@1's "numbers and doses
  exact ≥ 95%" is reported against an artefact neither the card nor S4a.2
  describes.
- **One specific correction or named prerequisite:** pin all four in Fixed
  decisions: the exact length-scale for 1.15× faster, the noise type, the RNG
  and its fixed seed constant, and that SNR is computed per clip.

### IR-03-C — `reference.json` has no shape, and the checksum artefact has no name

- **ID and location:** IR-03; "Fixed decisions", lines 37–38.
- **The text that conflicts, or exactly what is missing:** "`reference.json`
  (text per clip) and the voice checksums" names no keys, no filename for the
  checksums, and no statement of whether the checksums live inside
  `reference.json` or beside it. V2 checks only that `reference.json` "covers
  every clip" — a coverage test passes for any shape at all.
- **One concrete failure scenario:** S4a.2 has to report a "clinical-term exact
  rate" per candidate (C-STT@1, dispatch lines 112–114) and must break it down
  by drug / dose / negation / number-as-words to be meaningful; with a
  clip→text-only file it cannot compute a per-category rate and has no
  denominator for the percentages it does report.
- **One specific correction or named prerequisite:** state the schema, e.g.
  `{"version":1,"voices":[{"name","sha256","bytes"}],"clips":[{"file","text","voice","variant","source","category"}]}`
  with `file` relative to the output directory and `category` drawn from the
  four named sentence classes, and extend V2 to assert the shape as well as the
  coverage. (The card's sibling S4a.2 does pin its own JSON shape at
  `docs/v2/cards/S4a.2.md:44`, so the house precedent is to state it.)

### IR-03-D — the voice→clip mapping is unstated, and it triples the corpus

- **ID and location:** IR-03; "Fixed decisions", lines 30–31.
- **The text that conflicts, or exactly what is missing:** "the `es_MX` voices
  S1.3 lists (A10), at most 3" restates A10's *cap* without saying how many
  voices actually render. S1.3's list is three files across two speakers
  (claude-high, ald-medium, ald-x_low — `es-mx-speech.md:133–135`), and its own
  recommendation for S4a is a **single** voice: "use es_MX-ald-medium … or
  claude-high" (`:161`).
- **One concrete failure scenario:** a worker reads "the voices S1.3 lists" as
  all three and renders every dictation three times (55 × 3 variants × 3 voices
  = 495 clips instead of 165), tripling S4a.2's six-candidate benchmark
  runtime, changing the clinical-term denominator mid-contract, and pulling in
  `ald-x_low` — the one variant whose dataset licence the same document records
  as "**no dataset licence stated**".
- **One specific correction or named prerequisite:** state the count and the
  mapping, e.g. "one voice for the whole corpus — es_MX-ald-medium, per
  `es-mx-speech.md` §5.4 — with the other `es_MX` voices as optional extras
  recorded in `reference.json`", or "all three, every clip, per voice".

### IR-03-E — the 40 clinical-term sentences have no source, split or home

- **ID and location:** IR-03; "Fixed decisions", lines 34–36.
- **The text that conflicts, or exactly what is missing:** "40 clinical-term
  sentences (drugs, doses with decimals and units, negated and
  inserted-negation risk statements, numbers as words)" names no file, no split
  across the four classes, no statement of whether the three variants apply to
  them (165 vs 285 clips), and no May-edit path for a sentence list.
- **One concrete failure scenario:** the worker invents the 40 sentences inline
  in the generator, which is permitted — but the corpus is then defined only by
  a literal array in a script, and a later session (S4a.2, or a second attempt)
  that regenerates the audio gets whatever that array holds at that commit. If
  the worker instead reaches for `e2e/fixtures/audio-es/sentences.txt` because a
  data file feels cleaner, that is an edit outside May edit and HS-9 stops it.
- **One specific correction or named prerequisite:** one line — "the 40
  sentences live as a literal array in `scripts/v2/generate-es-audio.mjs` (no
  new data file), 10 per named class, drug names drawn from
  `docs/research/es-mx-clinical-glossary.json`, person names only from
  `e2e/fixtures/eval-es/NAMES.md`; they are additional to the 55 corpus
  dictations and belong to neither split; the three variants apply to them too"
  (or state that they are clean-only).

### IR-03-F — no Piper invocation contract, and the version floats

- **ID and location:** IR-03; "Read" (lines 17–19) and "Fixed decisions"
  (lines 29–38), against ACQUISITION A09/A10.
- **The text that conflicts, or exactly what is missing:** the card never says
  how Piper is invoked (console script vs `python3 -m piper`), never says
  where the `.onnx` voice files are resolved from, and pins no version — while
  A09's rule is "newest release on acquisition day", i.e. whatever exists when
  the worker runs it, and Piper is not installed on this PC today. The one
  in-repo precedent, `scripts/synthetic-acceptance/generate-audio.mjs:19,30`,
  requires `PIPER_BIN` **and** `PIPER_MODEL` ("keep both outside the
  repository") and takes the output path positionally; it is not in Read.
- **One concrete failure scenario:** the worker installs Piper somewhere
  unspecified, the script's voice lookup diverges from the benchmark's, and
  because the audio is never committed (IR-08) nothing in the repository records
  which voice bytes produced the corpus — S4a.2 then measures a corpus it
  cannot reproduce or attribute.
- **One specific correction or named prerequisite:** name the invocation and
  the voice directory in the card (e.g. `PIPER_BIN`/`PIPER_MODEL` as in the
  precedent, or `python3 -m piper --model <path>`, with voices resolved from
  Piper's `~/.local/share/piper`), and add
  `scripts/synthetic-acceptance/generate-audio.mjs` to Read. The exact version
  and SHA-256 belong in the return file's Acquisitions section, which already
  requires them — see also IR-04-A.

### IR-04-A — V1's precondition (byte-determinism) is asserted, not established

- **ID and location:** IR-04; "Verification", line 43.
- **The text that conflicts, or exactly what is missing:** V1 demands
  "identical SHA-256 per file across the two runs", but the only seeding the
  card describes is for the *added* room noise. Nothing states that Piper's own
  synthesis is byte-deterministic for a fixed text, voice and version, and none
  of the card's Read inputs says so — `es-mx-speech.md` is a voices/licence
  document (§§5.1–5.3) with no determinism finding. The card also does not say
  whether the two runs write to one `--out` directory (hashing after each) or to
  two.
- **One concrete failure scenario:** V1 fails on a correct implementation,
  because the synthesiser's own output varies between runs; the worker then
  "fixes" it by post-processing the audio (normalising, trimming, re-encoding)
  in a way neither the card nor S4a.2 sanctioned, and the artefacts C-STT@1 is
  meant to measure are no longer the ones the voices produced. The
  single-directory reading is worse: run two overwrites run one before anything
  was hashed, and the criterion is unmeasurable as written.
- **One specific correction or named prerequisite:** state the determinism
  contract in the card — the exact Piper version to use, the seeding knob that
  version exposes (or an explicit note that the pinned version is deterministic
  for fixed input), and that the two runs are two `--out` directories compared
  by `sha256sum`; and have the generator write the Piper version and every
  synthesis parameter into `reference.json`, so V1 is checkable rather than
  hoped for.

### IR-04-B — there is no failure outcome anywhere in the card

- **ID and location:** IR-04; the whole "Verification" table (lines 42–44) and
  the absence of a "Stop conditions" section (contrast
  `docs/v2/cards/S4a.2.md`, which has one).
- **The text that conflicts, or exactly what is missing:** both rows describe
  the success path only; V2's failing behaviour is "exit 0" with no stated
  non-zero counterpart. Undefined: Piper missing (today's actual state), a
  voice `.onnx` absent or unreadable, a fixture that will not phonemise, a clip
  written at the wrong rate, and whether a half-written corpus may be left
  behind.
- **One concrete failure scenario:** the worker finds no Piper, installs it,
  and then hits a voice path that does not resolve; the run stops with a
  half-written output directory and an exit code nobody defined, and the return
  file cannot say whether the card is `BLOCKED` or partially done. A reviewer
  reading only V1/V2 cannot tell a clean pass from a lucky one.
- **One specific correction or named prerequisite:** add `V3` — "with the voice
  directory pointed at a missing file (on a copy outside the shipped tree), the
  script exits non-zero, names the missing file, and leaves no partial output"
  — and one Stop-conditions line: "Piper or a required voice cannot be obtained
  under A09/A10: report `BLOCKED` with the licence text found."

### IR-05-A — V2 is a description, not a command

- **ID and location:** IR-05; "Verification", line 44, with "May edit",
  lines 21–24.
- **The text that conflicts, or exactly what is missing:** the row reads "`node
  -e` check that every clip is 16 kHz mono and `reference.json` covers every
  clip" — no program, no path, and no repo location the check may be written
  to. The cwd is given by the table header, so that half is fine; the command
  itself does not exist.
- **One concrete failure scenario:** the worker writes a throwaway inline
  program, pastes it into the evidence, and it is unreviewable and unrepeatable
  — the card's only structural check is the one thing no later session or
  reviewer can re-run. The alternative is worse: the worker adds
  `scripts/v2/check-es-audio.mjs` to make the check repeatable, which is an edit
  outside May edit, so HS-9 stops the step.
- **One specific correction or named prerequisite:** give V2 a real command.
  The sibling card already shows the house style —
  `docs/v2/cards/S4a.2.md:42` is a complete inline program
  (`node -e "const s=require('./docs/v2/state/STT-SELECTION.json');process.exit(...)"`).
  Either write V2 the same way over the output directory, or add
  `scripts/v2/check-es-audio.mjs` (new) to May edit and make V2
  `node scripts/v2/check-es-audio.mjs --audio <sandbox>/audio-es`. While
  editing that row, state how `<sandbox>` is obtained (IR-07-A) and give V1 the
  two-directory form from IR-04-A.

### IR-07-A — `<sandbox>` is a redaction token, not a path

- **ID and location:** IR-07; "Fixed decisions", line 37, and "Verification",
  lines 43–44.
- **The text that conflicts, or exactly what is missing:** the card writes to
  and reads from `<sandbox>/audio-es/` without saying which directory that is.
  In RUN-CONFIG §4 `<sandbox>` is the **redaction token** for sandbox paths.
  The real layout is `SANDBOX_ROOT = '/tmp/apunta-v2'`
  (`scripts/v2/sandbox.mjs:45`), each run folder is `join(rootReal, runId)` with
  `dataDir = runDir/data` (`:154–156`), and the wrapper treats that root's
  directory listing as its own namespace (`readdirSync(SANDBOX_ROOT)` at `:390`
  and `:479`, with anything new reported as `leaked`).
- **One concrete failure scenario:** the worker reads `<sandbox>` as the sandbox
  root; the generator's `mkdirSync(recursive)` creates
  `/tmp/apunta-v2/audio-es` **beside** the run-id folders, and the next
  `sandbox.mjs selftest` sees a foreign entry in a namespace it owns — or the
  corpus ends up outside any run folder, where C-ISO does not cover it and the
  evidence's `<sandbox>` substitution has no referent.
- **One specific correction or named prerequisite:** one line in the card —
  "run `node scripts/v2/sandbox.mjs env --port 7807`, source the printed
  `export` lines, and use `$(dirname "$APUNTA_DATA_DIR")/audio-es`; never write
  directly under `/tmp/apunta-v2`" — and record the run id in the checkpoint's
  `sandboxRuns` (RUN-CONFIG §3's `env` pattern is at dispatch line 159). The
  `-ir` dispatch header says "No sandbox port assigned" because nothing runs in
  a review; the implement dispatch assigns 7807, and the worker still has to
  create the run folder, which nothing in the card currently asks for.

## Notes not counted against the ten IDs

- **The A09/A10 answer, stated once.** Acquiring Piper and the `es_MX` voices
  is permissible under ACQUISITION.md A09/A10 (both name S4a.1; both are
  "not shipped"; Piper is covered by L-POLICY's dev-only-tools row) and under
  L-POLICY row 4 for **any** committed audio the answer is **no** — not because
  of the 10 MB cap, but because no voice's model card permits redistribution of
  generated audio (`es-mx-speech.md:148–154`, and the same file warns that the
  repo-level MIT tag and the public-domain datasets are "not card permission").
  The May-edit WAV entry is therefore conditional on a condition that is false.
  Recommend the coordinator say so in "Fixed decisions" — it removes a trap in
  which a worker treats the MIT repo tag as permission and commits ~10 MB.
- **A sibling scope check that came out clean:** the card renders `eval-es`
  (55 dictations, tuning 33 + heldout 22) and pointedly does not read
  `e2e/fixtures/eval-owner-es/` (the owner's 55). That is the right side of the
  line, and it is why IR-02 is CLEAR.
- **Working tree.** The tree is dirty from a parallel, out-of-band `web/` UI
  redesign (13 modified files plus two new components), which the checkpoint's
  `lastCompletedStep` acknowledges. The implement session must stage explicit
  paths only (HS-4) and must not commit any of it; this review committed
  nothing and edited only this file.
- **`docs/v2/state/dispatch/S4a.1.md` exists** at attempt 1, so the
  return-file section's named input is present; no gap of the kind S1.5 round 1
  hit.
- AM-014 needed no application: this is a level L1 card with no markdown
  prettier row.

Summary: not CLEAR on **IR-01, IR-03, IR-04, IR-05, IR-07**. CLEAR on IR-02,
IR-06, IR-08, IR-09, IR-10. Nine corrections are proposed above, all inside the
card's own text (Fixed decisions, May edit, Verification); none changes a
contract, a threshold, a dependency or a licence decision.

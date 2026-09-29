# S4a.2 Spanish speech benchmark and selection

| Field | Value |
| --- | --- |
| Parent | S4a |
| Role | MEASUREMENT |
| Level | L3 |
| Contracts | C-STT@1, C-ACQ@1 |
| Depends | S4a.1, P4.1 |
| Findings | R01, R08, R20 |
| Confidence | n/a |

## Objective
Apply C-STT@1 exactly and produce `SELECTED <file>` or
`NO QUALIFYING CANDIDATE`.

## Read
- `server/src/ai/whisper.ts` (transcript and preview flags; `parseTranscript`
  at `:312-320`, `STT_LEAD_IN` at `:286`, `sttPrompt` at `:298`, the fitted
  audio-context constants at `:133-162`, the note-path arguments at `:120-128`
  and the preview arguments at `:438-444`).
- `shared/src/transcribe.ts` (`whisper_binary` at `:64-65`,
  `PREVIEW_INTERVAL_MS` at `:201`, `whisper_preview_model` at `:78-93`).
- `installer/src/catalog.ts` (`:66-77` — the six C-STT candidates are **not**
  catalogue entries today; `C_STT_CANDIDATE_ALLOWANCE` at `:74-77`,
  `A07_ALLOWED_QUERY_KEYS`, `ALLOWED_DOWNLOAD_HOSTS`, and
  `installer/src/catalog.ts:152-153`, which records the publisher checksum list
  as the only thing upstream publishes); `installer/src/download.ts`
  (`downloadWithResume`); `installer/src/catalog.test.ts` (the offline
  catalogue-derived fixtures that are this card's P4.1 precedent).
- `scripts/v2/generate-es-audio.mjs`, `scripts/v2/check-es-audio.mjs` and
  `e2e/fixtures/audio-es/README.md` § "Regenerating it" — **the way to
  (re)create the S4a.1 corpus.** S4a.1 is `APPROVED`, but its 295 clips are a
  sandbox-only artefact and are never committed (L-POLICY row 4), and its run
  folder `2026-09-26T15-48-47-652Z-d7afeb16` lived under `/tmp/apunta-v2`,
  which does not exist on this machine; `e2e/fixtures/audio-es/` holds one
  README and nothing else. "The audio from S4a.1" is a description, not a path.
- `docs/v2/evidence/S4a.1/reference.json` (275,244 bytes, SHA-256
  `aaaa64f29cdf844fd3c8e02a068278fe1cdc640d5c1176b5856a8bb14987284f`) and
  `docs/v2/evidence/S4a.1/determinism.md`.
- `docs/research/es-mx-clinical-glossary.json`;
  `e2e/fixtures/eval-es/NAMES.md`;
  `docs/eval-reports/2026-09-20-tiny-en-clinical-vocabulary.md` (the English
  precedent, whose build identity and "normalized for number words and casing"
  rule this card records beside its own).
- `docs/v2/ACQUISITION.md` §1 (row A07);
  `docs/v2/CONTRACTS.md` (C-STT@1, C-ACQ@1);
  `docs/v2/RUN-CONFIG.md` (§1 the 7800–7889 sandbox range, §2 the L3 row, §4 the
  evidence fields and the `NOT RUN`/`PASS`/`FAIL`/`BLOCKED` status words).

## May edit
- `scripts/v2/stt-benchmark.mjs` (new).
- `docs/eval-reports/<date>-es-mx-whisper-benchmark.md` (new);
  `docs/v2/state/STT-SELECTION.json` (new).
- `installer/src/catalog.ts` and `installer/src/catalog.test.ts` — **added by
  AM-082 (owner-approved 2026-09-29)**, for Fixed decision 1's pin step and
  nothing else.
- `.gitignore` — one line, `/.cache/v2-stt/`. **Added by AM-082.**
- `docs/research/es-mx-speech.md` — one line recording the Spanish lead-in
  sentence, so S4b.1's existing Fixed decision resolves. **Added by AM-082.**

## Must not edit
- Production code (P4.3 wires the selection in). That includes
  `server/src/ai/whisper.ts`: this card may not create the Spanish lead-in
  string in production code, and the one sentence it measures is the one S4b.1
  will ship. Two different Spanish sentences would make the measurement a
  measurement of nothing.
- `docs/v2/evidence/S4a.2/` is **not** May edit and does not need to be: a
  required output is not a May-edit violation (AM-017), exactly as for S4a.1. It
  is written by the script and read by the reviewer.
- `.cache/v2-stt/**` is git-ignored and generated, and
  `docs/v2/state/cards/S4a.2.json` is coordinator-owned: the card reads the
  checkpoint if it exists and never writes it.
- `installer/` outside the two files named in May edit, `package.json`,
  `eslint.config.js`, and every contract, acceptance row and manifest file. A
  hand-rolled `fetch` anywhere in this card is HS-7's "loosen a guard" and a
  stop, not a workaround.
- `scripts/v2/generate-es-audio.mjs` and `scripts/v2/check-es-audio.mjs` are
  S4a.1's, not this card's. In particular the generator's refusal of an `--out`
  inside the repository is a safety property in a file another card owns, and it
  is **not** widened here (AM-082).

## Fixed decisions
1. **The corpus is regenerated, and the regeneration is accepted only if
   `reference.json` comes back byte-identical.** Verbatim from
   `e2e/fixtures/audio-es/README.md` § "Regenerating it":

   ```sh
   PIPER_BIN=~/.local/share/apunta-piper/venv/bin/piper \
   PIPER_MODEL=~/.local/share/apunta-piper/voices/es_MX-ald-medium.onnx \
   node scripts/v2/generate-es-audio.mjs --out <dir> \
     && node scripts/v2/check-es-audio.mjs --audio <dir>
   ```

   The regenerated `reference.json` is compared against
   `docs/v2/evidence/S4a.1/reference.json`; a mismatch is stop condition 1, not
   a rerun with different flags. `check-es-audio.mjs` must exit 0, which it
   already fails if `noise_scale`, `noise_w` or `threads` is not the pinned
   value. **Determinism is claimed only to the extent the evidence supports
   it:** AM-038 and `docs/v2/evidence/S4a.1/determinism.md` ("Attempt 2: the
   repair") establish that with `--noise_scale 0 --noise_w 0` and
   `OMP_NUM_THREADS=1` two generator runs are byte-identical, 295 of 295,
   across two separate run directories, **on one machine with piper-tts 1.8.0
   and the voice `es_MX-ald-medium`** (voice SHA-256
   `019b3803293c93e34a206dd2e53a3889209a514e786fd7144f7b70196c579b63`, 63,201,294
   bytes). The per-clip hash lists that would prove byte-identity across
   sessions were raw logs and were not committed, so this card claims no
   cross-session per-clip comparison — it claims the one that is checkable,
   above. The voice is re-hashed at generation time by the generator itself and
   compared against the value in `reference.json` and in the evidence file, so a
   different voice on this machine is refused rather than silently benchmarked.
   **A worker may not hand-regenerate.** Using `generate-es-audio.mjs` with
   different Piper flags, a different voice, or a hand-written sentence list is
   not regeneration; it is a different corpus. The benchmark reads
   **`reference.json` from the regenerated corpus** for each clip's `file`,
   `text`, `variant`, `source` and `category`, never from the evidence copy,
   which is a record and not an input.
2. **The six candidates are pinned, from a named source, before any
   measurement.** They are not catalogue entries today, so no `url`, no
   `sizeBytes`, no `sha1` and no `sha256` exists for any of them; AM-052 records
   that as a card defect, not an implementer error, for P4.1, and it is
   inherited here verbatim. `installer/src/catalog.ts` gains

   ```ts
   const C_STT_CANDIDATES: readonly SpeechModelEntry[]
   ```

   holding **the same six filenames, in the same order, as C-STT@1, A07 and
   P4.1's Fixed decision 8 already name** — `ggml-base.bin`,
   `ggml-base-q5_1.bin`, `ggml-small.bin`, `ggml-small-q5_1.bin`,
   `ggml-large-v3-turbo-q5_0.bin`, `ggml-large-v3-turbo-q8_0.bin`. **The
   candidate list does not change.** Each entry's `url` is composed by the same
   expression the two existing speech entries use
   (`https://huggingface.co/ggerganov/whisper.cpp/resolve/main/<file>`), its
   `allowance` is the `C_STT_CANDIDATE_ALLOWANCE` object that already exists at
   `installer/src/catalog.ts:74-77` for precisely this purpose, and its
   `allowedQueryKeys` is `A07_ALLOWED_QUERY_KEYS` (the ten names AM-042
   observed, which A07's manifest cell enumerates): **no new host, no new query
   name, no wildcard.**

   - The publisher's checksum source is named, and it is already on this
     machine, so obtaining it costs nothing and touches no network: the pinned
     whisper.cpp source tree P3.1 already cloned to build `whisper-cli` —
     `APUNTA_WHISPER_WORK_DIR` (default `/tmp/apunta-v2/whisper-src`), revision
     `371b5a7561823ab2bb32142d2751e35e7534727b` as pinned in
     `scripts/build-whisper-candidate.sh` — whose
     `models/download-ggml-model.sh` carries the publisher's SHA-1 per model and
     whose `models/README.md` carries the sizes. This is the source
     `installer/src/catalog.ts:152-153` already records as the only thing
     upstream publishes, and reading a file inside a source tree A06 already
     authorised and already fetched is **not** a new acquisition: no new host,
     no new ACQUISITION row, no egress of any kind, and nothing added to hard
     rule 1.
   - Each entry's `sha1` is transcribed from `models/download-ggml-model.sh` in
     that pinned tree, with the file and revision recorded in the evidence;
     `sizeBytes` comes from `models/README.md` where it is published, and from
     the byte count the download actually reported where the README does not
     quote one — **the source of each number is named per entry.**
   - Each entry's `sha256` is computed **once**, after that entry's `sha1`
     matched, and pinned there — exactly the provenance `SPEECH_MODEL.sha256`
     already records ("Apunta's own SHA-256, computed after the SHA-1 above
     matched, and pinned here afterwards"). The download runs through the
     hardened `downloadWithResume` from `installer/src/download.ts` (P4.1) under
     `C_STT_CANDIDATE_ALLOWANCE`, which is hard rule 1's one carve-out: an
     explicit, user-initiated, checksum-verified model fetch, never the server
     and never the browser tab. `installer/dist/` being absent is a build
     problem (V1's first two commands), answered in the Verification section
     and in stop condition 5, never with an exemption.
   - **That provenance is mandatory, per entry, in the table and in
     `STT-SELECTION.json`:** whisper.cpp publishes no SHA-256 for any of the
     six, so every `sha256` can only ever come from this project's own hash of a
     file whose SHA-1 matched. Each entry records `publisherSha1Source` and
     `sha256Source: "apunta-computed after sha1 match"`, so a later reader can
     tell "verified against upstream" from "hashed what arrived".
   - `installer/src/catalog.test.ts` gains assertions that: the six filenames,
     in order; that each entry is `C_STT_CANDIDATE_ALLOWANCE` with
     `A07_ALLOWED_QUERY_KEYS`; that no `sha256` is `null`; and that every
     entry's `url` host is inside `ALLOWED_DOWNLOAD_HOSTS`. It is an existing
     catalogue-derived offline fixture — the P4.1 precedent — and it makes no
     network request.
   - **Why this is a separate step and not part of the measurement:** a pin
     computed from the same bytes the benchmark then verifies is not an
     independent pin, which is precisely the distinction C-ACQ@1 rule 5 exists
     to preserve. The pins are fixed and committed **before any `whisper-cli`
     run happens**, and the six candidates are then *benchmarked against pins
     that already existed*. The rows are ordered so this is structurally true:
     V0 (pins) can only write the catalogue and the evidence, and V1
     (measurement) reads the committed catalogue.
   - **A second mismatch on the same artefact after a repair is stop condition
     5**, carried verbatim from P4.1: re-downloading cannot fix a wrong pin.
3. **One persistent, git-ignored cache inside the project, not `/tmp`.** These
   are the largest side effects in the plan — ~2.3 GB of weights (base 148 MB,
   base-q5_1 ~60 MB, small 488 MB, small-q5_1 ~190 MB, large-v3-turbo-q5_0
   ~574 MB, large-v3-turbo-q8_0 ~874 MB), plus ~400 MB of regenerated audio and
   3 h 41 m of audio per candidate — and they would otherwise land in `/tmp`,
   which is how S4a.1's corpus was lost. The layout:

   ```
   .cache/v2-stt/
     audio-es/     295 WAVs + reference.json
     models/       the six candidates + <file>.receipt.json
     runs/         per-candidate transcripts and timing records
   ```

   `.cache/v2-stt/` is inside the repository, git-ignored, and never committed —
   which is exactly what L-POLICY row 4 requires (not committed is the
   compliant state) — and it is *not* inside the shipped tree: no `server/`,
   `web/` or `shared/` file reads it, and `installer/src/download.ts` is never
   imported by `server/`, `web/` or `shared/`. The boundary is stated in the
   words S4a.1 used: **nothing is written directly under `/tmp/apunta-v2`,
   nothing is written inside the live data folder, and a path the generator
   refuses (an `--out` inside the repository) is not bypassed.**

   The corpus is produced in a sandbox run folder and then placed in the cache,
   in one step, with no code change to an approved card. V0's step 1 runs the
   generator into `$(dirname "$APUNTA_DATA_DIR")/audio-es` — the S4a.1 location,
   the mode-700 run folder — checks it, and copies the tree (`*.wav` and
   `reference.json`, nothing else) into `.cache/v2-stt/audio-es/`, verified by
   `sha256sum` equality with the source before the copy is believed. A reviewer
   can see that no safety refusal was weakened, and the copy is byte-preserving
   by construction.

   **A disk pre-flight is mandatory and recorded:** `df -P .` must show at least
   4 GiB free before V0 (2.3 GB of models + 0.4 GB of audio + transcripts, with
   margin). Below that, V0 is `BLOCKED` with the `df` output.
   `installer/src/disk.ts` is the product's own guard and is not in this path, so
   this card carries its own.
4. **`whisper-cli` is named, and it is a read, not an edit.** Default path:
   `build/linux-resources/bin/whisper-cli`, the A06 artefact P3.1 built from the
   pinned revision and `scripts/v2/package-linux-resources.sh` copied in
   (`build/` is git-ignored, the last `.gitignore` entry). Override:
   `--whisper <path>`, with `WHISPER_CLI` as the environment equivalent; both
   are recorded in the evidence with the path sanitised to `<sandbox>`/`<build>`.
   The shared libraries need nothing: the packaged binary resolves them through
   `RUNPATH $ORIGIN` and the SONAME symlink chain is copied beside it
   (`scripts/v2/package-linux-resources.sh:263-297`), so no `LD_LIBRARY_PATH` is
   set and none may be invented. Pre-flight, before any measurement:
   `--whisper <path> --help` must exit 0, and the build identity is recorded —
   the binary's own version line, the pinned source revision `371b5a7…`, and
   the presence of `libwhisper.so.1.9.3` beside it. A build different from the
   English precedent's (`whisper.cpp` `whisper-cli` 1.9.3-dev, CPU build,
   `docs/eval-reports/2026-09-20-tiny-en-clinical-vocabulary.md`) is recorded,
   not forbidden; the number only means something next to the build that
   produced it. Nothing in this card rebuilds whisper.cpp, and re-running
   `scripts/build-whisper-candidate.sh` is not part of any row (A06 reuses its
   existing clone, so it would be a redundant fetch).
5. **The Spanish lead-in prompt: `Bueno, notas de la sesión de hoy.`** — one
   sentence, mirroring the English one's properties exactly (punctuation and
   capitalisation present, no clinical term, no name, no content), so it biases
   whisper's *style* and nothing else. **Owner decision 2026-09-29 (AM-082):
   this is the decided sentence, not a proposal.** It is passed to every
   `whisper-cli` invocation as `--prompt`, rendered by `sttPrompt([])`'s rule:
   the lead-in alone, with no vocabulary sentence, because C-STT@1 does not
   authorise a Spanish vocabulary bias and the English precedent's vocabulary arm
   was a separate, separately-reported experiment. The benchmark reports the
   exact `--prompt` string it used, byte for byte, in the table and in
   `STT-SELECTION.json`'s evidence, so S4b.1's wiring is verifiable against what
   was measured. Two consequences, both small: `docs/research/es-mx-speech.md`
   gains one line recording this sentence as the Spanish lead-in, so S4b.1's
   existing Fixed decision ("taken from `docs/research/es-mx-speech.md`,
   punctuated, no clinical vocabulary") becomes true rather than dangling; and
   the sentence is never chosen after results are seen.
6. **Metrics and thresholds exactly as C-STT@1** — negations retained 100%;
   inserted negations 0; numbers and doses exact ≥ 95%; preview RTF p95 ≤ 0.5;
   final RTF p95 ≤ 1.0 on this PC; peak memory ≤ 2 GiB; and the 2-point tie with
   the smaller-file tiebreak. **No threshold moves, and no other candidate,
   threshold or benchmark may be added after seeing results.** What this card
   supplies is what the contract assumed and never gave: the *definitions* —
   every number that looks new below is a **denominator, a sample set or a
   measurement method**, fixed before any run so that the thresholds themselves
   are never touched afterwards. See the **Measure definitions** section.
   Word error rate and clinical-term exact rate are reported for every
   candidate, neither qualifies anything, and the selection uses only the
   contract's pick rule — among candidates meeting all six, the highest
   clinical-term exact rate; if two are within 2 points, the smaller file.
   Nothing is added to that rule.
7. **`STT-SELECTION.json`**, resolved inside the allowance the card already has
   and with no contract change:

   ```json
   {
     "result": "SELECTED" | "NO QUALIFYING CANDIDATE",
     "file":    "<candidate filename>" | null,
     "size":    <pinned sizeBytes, integer> | null,
     "sha256":  "<64 hex chars>" | null,
     "preview": { "file", "size", "sha256" } | null,
     "evidence": { …as below… }
   }
   ```

   - **`preview` is the same `{file, size, sha256}` object as `file`, and is
     `null` if and only if `result` is `NO QUALIFYING CANDIDATE`.** The reason
     is recorded because it is the contract's, not this card's: C-STT@1's Pick
     rule selects **exactly one file**; production today points
     `whisper_preview_model` at the same file as the note model
     (`shared/src/transcribe.ts:78-93`); and S4b.1's V2 expects "the
     single-file download". A second, smaller preview model would be a **second
     selection the contract does not authorise**. If the owner ever wants one,
     that is a contract amendment with its own criterion, and it is not this
     card's.
   - **`evidence` is one object with these keys, all values repo-relative or
     sanitised — never an absolute path, never `<sandbox>` spelled out:**

     | Key | Contents |
     | --- | --- |
     | `report` | `docs/eval-reports/<date>-es-mx-whisper-benchmark.md` |
     | `table` | `docs/v2/evidence/S4a.2/table.md` — the per-candidate table, RUN-CONFIG §4 |
     | `corpus` | `{ referenceJsonSha256, clips: 295, piper, voiceName, voiceSha256, variants, generatedUtc }` |
     | `whisper` | `{ path, versionLine, sourceRevision, library }` |
     | `machine` | `{ cores, threadsFinal, threadsPreview, backend, loadavg1Before, loadavg1After, freeMemBytes, diskFreeBytes, quiet: true }` |
     | `candidates` | one entry per candidate: `{ file, sizeBytes, sha256, sha1, publisherSha1Source, sha256Source, receipt, state, qualifies, failedCriteria[], metrics: { …the six with their raw numerators and denominators… } }` |

     The exact `--prompt` string of Fixed decision 5 is reported in
     `evidence`, and the table's **minimum column set is fixed by this card**
     so V3 can recompute the selection from it and the report is comparable with
     the English precedent: per candidate — the six qualifying criteria each
     with its **raw numerator and denominator**, word error rate (total and per
     variant), clinical-term exact rate (40-sentence and 55-dictation), RTF p95
     for both arms with their sample counts, peak memory with its method, the
     publisher SHA-1 and its source, the SHA-256 and its source, the receipt
     path, `qualifies`, and `failedCriteria` — plus one environment block per
     run, not per candidate.
8. **Every L3 command runs through `sandbox.mjs`, on port 7812, in the `env`
   form.** 7812 is inside the 7800–7889 sandbox range (RUN-CONFIG §1) and is
   assigned to no other card's dispatch; 7717 is never contacted and never bound.
   The form is `env`, not `run`, and the reason is this card's own: nothing
   here starts an Apunta server, opens a database or launches the app, which is
   the AM-025 precedent for a bare row, but `sandbox.mjs env --port 7812` is
   still the mechanism that creates the run folder, so it is what makes
   `<sandbox>` resolvable and the run id recordable. Each row is:

   ```sh
   node scripts/v2/sandbox.mjs env --port 7812 > .cache/v2-stt/s4a2.env \
     && . .cache/v2-stt/s4a2.env \
     && <the row's command, using "$(dirname "$APUNTA_DATA_DIR")" where a path is needed>
   ```

   The `env` file is written **inside the cache**, not to `/tmp`. Nothing is
   ever written directly under `/tmp/apunta-v2`.
9. **Two of the six criteria are wall-clock thresholds measured "on this PC",
   and the contract's only sanctioned outcome is irreversible, so the machine
   state is a gate and not an afterthought.** The owner's own handoff names the
   hazard ("it measures speed and accuracy, so it needs a quiet machine and must
   never run while the owner is testing live",
   `docs/v2/state/NEXT-SESSION.md`); this is the plan's existing shape for that
   — ACQUISITION §1's four-arm rule 3, "no arm runs while the owner is testing
   on the machine or a live instance is in use" — applied to one card:

   1. **No run starts while the owner is testing.** The owner states in the
      return file, in one line, that the live instance is not in use and nothing
      else of hers is running. A worker cannot verify this and does not try;
      asking is cheaper than a contaminated number.
   2. **The machine state is recorded with the numbers** and travels with the
      evidence: `nproc`, the load average 1-minute value sampled immediately
      before the first invocation and immediately after the last, the thread
      counts used (all cores for the final arm, `⌊cores/2⌋` for the preview),
      the backend, and free memory. `loadavg1` before the run must be **≤ 0.5**,
      and it is sampled from `/proc/loadavg` — a local read, not a contact with
      7717.
   3. **Mid-run contamination check.** The run samples the 1-minute load average
      every 60 s. **Three consecutive samples above 2.0 end the run**, and the
      partial table is written and preserved.
   4. **The response is `BLOCKED`, with the table, not a selection** — see stop
      condition 3.
   5. **Nothing is added to fix a bad number.** No benchmark, no metric and no
      threshold may be added, removed or re-weighted after results are seen
      (C-STT@1, HS-7). A `NO QUALIFYING CANDIDATE` is a real result and Spanish
      stays held (C-ES-GATE@1); it is never converted into a `SELECTED` by
      re-measuring until a number appears.
10. **The checkpoint, so no download and no run is ever repeated.**
    `docs/v2/state/cards/S4a.2.json` does not exist yet, which is normal for a
    card that has not started, and it stays coordinator-owned: this card reads
    it if it exists and never writes it. What the card requires is that **the
    implementation session emit the exact checkpoint JSON in its return file**,
    for the coordinator to transcribe (S4a.1's checkpoint is coordinator-owned,
    `docs/v2/state/returns/S4a.1.md:182-187`):

    ```json
    {
      "card": "S4a.2", "attempt": <n>, "status": "IN PROGRESS",
      "sandboxRuns": ["<every run id>"],
      "cacheDir": ".cache/v2-stt",
      "corpus": { "referenceJsonSha256": "aaaa64f2…", "clips": 295, "voiceSha256": "019b3803…", "generatedUtc": "…" },
      "candidates": [
        { "file": "ggml-base.bin", "sizeBytes": 0, "sha256": "…", "sha1": "…",
          "receipt": ".cache/v2-stt/models/ggml-base.bin.receipt.json",
          "state": "fetched and verified" }
      ],
      "lastCompletedArm": "final:ggml-small-q5_1.bin"
    }
    ```

    with `state` ∈ `not fetched` | `fetched and verified` | `benchmarked`, and
    these four rules:

    - **A file with a matching receipt is not re-fetched.** C-ACQ@1 rule 5
      already says a fresh matching hash establishes readiness without a
      receipt and that a receipt is written only after verification; this adds
      only the consequence: *the receipt is the record, and a file with a
      matching receipt is not downloaded again.*
    - **A candidate already marked `benchmarked` is not re-benchmarked** when
      the recorded machine state (Fixed decision 9) is the same. If the machine
      state differs, that candidate's arm is re-run and the return says so
      explicitly. Arms carried over from an earlier session are printed from
      `docs/v2/evidence/S4a.2/table.md` and marked as carried, never
      re-measured silently and never silently reused.
    - **A partially-downloaded candidate is resumed, not restarted** — that is
      `downloadWithResume`'s existing behaviour, and the card only says not to
      delete the `.part`.
    - **The cache is never wiped to "start clean".** A stale corpus or a stale
      model is replaced by deleting that one directory and saying so in the
      return file.

## Measure definitions (AM-082)

Everything in this section is fixed **before any run**, which is what the
contract's "no other candidate, threshold or benchmark may be added after seeing
results" requires, and it exists because the review's failure scenario is exact:
two implementers, same corpus, same models, different readings, one passes the
95% and 100% bars and the other does not, so the same six files qualify
differently and V3 cannot adjudicate.

### Shared normalisation (N1–N6)

Applied to every reference and every hypothesis, in this order, as a literal
function in `stt-benchmark.mjs`:

1. **N1** Unicode NFC.
2. **N2** Strip whisper's furniture exactly as `parseTranscript` does
   (`server/src/ai/whisper.ts:312-320`): a leading `[hh:mm:ss.ss --> …]`
   timestamp prefix, and any whole line that is a bracketed or parenthesised
   non-speech annotation (`[BLANK_AUDIO]`, `(music)`, `[ Silence ]`).
3. **N3** Lowercase (`String.prototype.toLowerCase` on the NFC form). Accents
   are **kept** — Spanish orthography makes them load-bearing, and stripping
   them would merge words the corpus treats as distinct.
4. **N4** Delete every character in Unicode general category `P*` (punctuation)
   and `S*` (symbols), replacing each with a space. This is what removes `¿`,
   `¡`, `,`, `.`, `-` and the like without merging the words around them.
5. **N5** Split on runs of whitespace; drop empty tokens.
6. **N6** Number normalisation, from a **finite literal table in the script**
   rather than code, so a reviewer reads it: the Spanish number words the corpus
   uses map to digits (`cero`→`0`, `uno`→`1`, …, `veintidós`→`22`,
   `ochenta y dos`→`82`, `ciento …`), `coma`→`.` so `cero coma cinco`→`0.5`
   and `seis y media`→`6.5`, and `millón`/`millones`/`mil` are **not** expanded
   (no clip needs it, and a partial expander is worse than none). Any token not
   in the table is left alone.

### The six qualifying measures

| # | C-STT@1 wording | Pinned definition |
| --- | --- | --- |
| 1 | negations retained 100% | **Inventory** (literal array in the script, listed here): `no`, `nunca`, `jamás`, `ningún`, `ninguna`, `ninguno`, `nadie`, `nada`, `tampoco`. **`sin` is deliberately excluded** and the reason is written in the script: it is a preposition, and "sin falta", "sin metformina" and "sin drama" are not negations — including it would make the insertion measure count ordinary Spanish. **Population**, derived from `reference.json` and never hand-counted: clips whose `category` is `negation` or `lost-negation` **and** whose N5 reference tokens contain ≥1 inventory term. That is the corpus's own negation design — the 5-of-10 `negation` split S4a.1 documented and the `lost-negation` trap dictations — and it is **30 clips** (5 sentences + 5 dictations, × 3 variants); V1 prints the derived count and fails if it is not 30. **Score**, per clip: every inventory term present in the reference is present as a whole token in the N5 hypothesis. **Retained** = clips scoring 1. **Rate** = retained ÷ 30, and 100% means 30 of 30. **Owner decision 2026-09-29 (AM-082): the qualifying denominator is the 30 designed negation clips.** Reported beside it, **not qualifying**: the same rate over all **177** clips in the corpus whose reference contains a negator, measured from the committed `reference.json`; V1 prints the figure. |
| 2 | inserted negations 0 | **Population: all 295 clips**, including the 5 silence and 5 tone clips — a note invented from a tone is a fabrication and the corpus contains those clips precisely so it can be caught. **An insertion** is a clip whose N5 hypothesis contains ≥1 inventory term and whose N5 reference contains none. **Count** = such clips, summed. Threshold is 0. Per-clip detail (file, the term, the transcript line) goes in the evidence, because one inserted negation is a finding, not a number. |
| 3 | numbers and doses exact ≥ 95% | **Population, structural, no regex:** clips whose `category` is `doses`, `numbers` or `dose-and-number` — that is 10 + 10 + 5 tuning + 2 held-out = **27 base texts × 3 variants = 81 clips**. A hand-written number-word pattern is exactly the ambiguity this row exists to remove: one ad-hoc pattern tested against the committed `reference.json` matches 255 of 295 clips, because `pastilla`, `dosis`, `veces` and `horas` are in almost every dictation. V1 prints the derived count and fails if it is not 81. **Score**, per clip: after N6, the **multiset** of purely numeric tokens (matching `^-?\d+(\.\d+)?$`) in the hypothesis equals the multiset in the reference — order-insensitive, multiplicity-sensitive, so a dropped repeat is a miss and a swapped dose is a miss. **Exact** = clips scoring 1. **Rate** = exact ÷ 81, and 95% is stated as the integer **77 of 81** (`ceil(0.95 × 81)`), written into the table so no implementation can disagree about the rounding. |
| 4 | preview real-time factor p95 ≤ 0.5 | **Sample set:** the **`clean` variant of the 285 speech clips** (the 10 non-speech clips are excluded: production's preview never receives a buffer of pure silence or a tone — its commit logic only ever cuts at a speech pause). **Chunking, as production does it:** each clip is cut into windows of **5.000 s** (`PREVIEW_INTERVAL_MS`, `shared/src/transcribe.ts:201`) measured from the clip start, plus one trailing partial window; a window shorter than 1.0 s is dropped and the count is recorded. **One `whisper-cli` invocation per window**, arguments: `-m <model> -f <window> --print-progress --threads <⌊cores/2⌋> --language es --prompt <Spanish lead-in> --beam-size 1 --best-of 1 --no-fallback --audio-ctx <fitted>` — greedy and half the cores, exactly `server/src/ai/whisper.ts:438-444`. **`--audio-ctx` is the fitted value**, re-implemented in the script from the four pinned constants at `server/src/ai/whisper.ts:133-162` (`50` per second, `3` s margin, floor `384`, ceiling `1500`, rounded up to a multiple of `64`) and frozen by three asserted vectors: `f(1) = 384`, `f(5) = 448`, `f(30) = 1500`. **RTF** = wall-clock seconds of the invocation ÷ the window's audio duration. **p95** = nearest-rank on the ascending list of per-invocation RTFs, 1-based index `ceil(0.95 × n)`. n is printed. |
| 5 | final transcription RTF p95 ≤ 1.0 on this PC | **Sample set: all 295 clips**, one invocation each, uncropped — the whole benchmark, because any smaller set is a choice made by the implementer. **Arguments as the note path builds them** (`server/src/ai/whisper.ts:120-128`): `-m <model> -f <clip> --print-progress --threads <cores> --language es --prompt <Spanish lead-in>`, **timestamps kept** (no `--no-timestamps`), whisper's default beam search and fallback, **no `--audio-ctx`** — the note's transcript never goes through a fitted context. **RTF** and **p95** as in row 4. The environment block (Fixed decision 9) is what makes this number mean anything. |
| 6 | peak memory ≤ 2 GiB | **Method: `/usr/bin/time -v`, "Maximum resident set size",** wrapped around **each final-arm invocation**, converted to bytes (`kB × 1024`). whisper.cpp reports no memory figure of its own, so this is the measurement. The candidate's figure is the **maximum over all of its final-arm invocations** — the 30-second padded encoder window is the worst case, and the preview arm's fitted context is strictly smaller, which is why measuring the final arm is sufficient and is stated as the reason. **If `/usr/bin/time` is absent, the measurement is `NOT MEASURED`, the candidate is recorded with `memory: unavailable` and does not qualify** — the same shape as stop condition 2, because a criterion that was not measured cannot be passed. Free RAM at the start of the run is recorded beside it. |

### Two reported metrics, neither of which qualifies anything

- **Word error rate** (C-STT@1 requires it "for every candidate"): Levenshtein
  distance over N5 token sequences, summed over the corpus as
  `Σ edits ÷ Σ reference tokens`, plus the same figure per `variant` and per
  `source` (`tuning` / `heldout` / `clinical` / `silence` / `tone`), and per
  candidate. Normalisation is N1–N6 and nothing else. The English precedent's
  rule — "normalized for number words and casing" (§ Method,
  `docs/eval-reports/2026-09-20-tiny-en-clinical-vocabulary.md`) — is the rule
  N6 generalises; it is recorded here rather than left to be re-read.
- **Clinical-term exact rate** — the **pick** metric. **Population: the 40
  `clinical` sentences × 3 variants = 120 clips.** A clip's expected terms are
  the `docs/research/es-mx-clinical-glossary.json` entries in categories
  `medication` and `unit`, plus the person names in
  `e2e/fixtures/eval-es/NAMES.md`, whose `es_mx` form matches the clip's
  reference text as a whole-token sequence after N1–N5. **Exact** = a
  whole-token-sequence match in the hypothesis. **Rate** = exact term instances
  ÷ total term instances. The derived inventory is printed with a per-class
  count, and V1 fails if fewer than 30 term instances are found across the 40
  sentences — a matcher that silently matches nothing must not pass. **The
  55-dictation term rate is reported beside it** and does **not** feed the
  pick: S4a.1's card says `source`/`category` is what lets S4a.2 report the two
  separately, and the pick rule consumes exactly one number, so the card names
  which one.

### The ten non-speech clips

The 5 silence and 5 tone clips (`text: ""`) count toward the insertion measure
(row 2) and toward nothing else; they are reported separately in the table.

### Cost, stated plainly

The final arm is 3 h 41 m of audio per candidate and the preview arm ~24 min of
windowed audio, across six candidates — thousands of `whisper-cli`
invocations and several hours of wall clock on a quiet machine. That is why the
quiet-machine stop rule is not optional.

## Verification
| ID | Command (cwd: repo root) | Expected |
| --- | --- | --- |
| V0 | `node scripts/v2/sandbox.mjs env --port 7812 > .cache/v2-stt/s4a2.env && . .cache/v2-stt/s4a2.env && df -P . && npm run build:shared && npm run build --workspace @apunta/installer && node --test installer/src/catalog.test.ts` | exit 0; `df -P .` shows at least 4 GiB free on the line beginning `/` (otherwise `BLOCKED` with the `df` output — Fixed decision 3); `installer/src/catalog.test.ts` lists the six entries; the six `sha256` values and their sources are committed **before any measurement**; nothing else changed |
| V1 | `node scripts/v2/sandbox.mjs env --port 7812 > .cache/v2-stt/s4a2.env && . .cache/v2-stt/s4a2.env && npm run build:shared && npm run build --workspace @apunta/installer && node scripts/v2/stt-benchmark.mjs --audio .cache/v2-stt/audio-es --models .cache/v2-stt/models --whisper build/linux-resources/bin/whisper-cli --out docs/v2/evidence/S4a.2/table.md` | exit 0; the per-candidate table with the columns of Fixed decision 7, every numerator and denominator present, the environment block present, and the run ids in the return file. **Before the benchmark runs**, and inside the same `env` folder, V1 does Fixed decision 1's regeneration: `df -P .` pre-flight, then one `generate-es-audio.mjs` run into `$(dirname "$APUNTA_DATA_DIR")/audio-es`, one `check-es-audio.mjs` on it, `reference.json` byte-identity against `docs/v2/evidence/S4a.1/reference.json`, then the copy of `*.wav` and `reference.json` into `.cache/v2-stt/audio-es/` proved by `sha256sum` equality with the source. **The two builds are part of this row, not decoration:** the benchmark reuses P4.1's hardened downloader, which a plain `node scripts/v2/*.mjs` can only reach as `installer/dist/`, and `installer/dist/` is git-ignored and absent on a clean checkout. **If `installer/dist/` is absent when a row runs, that row is `BLOCKED`** — never a reason to add an exemption, to hand-roll a `fetch`, or to edit `installer/` or `package.json` outside May edit (HS-7, HS-9) |
| V2 | `node -e "const s=require('./docs/v2/state/STT-SELECTION.json');process.exit(['SELECTED','NO QUALIFYING CANDIDATE'].includes(s.result)?0:1)"` | exit 0 (unchanged) |
| V3 | reviewer recomputes the selection from the table using C-STT@1 and the Measure definitions section | same result. **This is the reviewer's row**, and the card says so: RUN-CONFIG §4's status words are `NOT RUN`/`PASS`/`FAIL`/`BLOCKED`, so a row no one in the implementation session can pass is recorded `NOT RUN` in the return file, never quietly `PASS` |
| V4 | `npm run lint && npm run typecheck` | exit 0. `npm run lint` covers `eslint .`, `prettier --check .` and the licence check; a new `.mjs` under `scripts/` and a new `.gitignore` line are both inside those globs, and without this row nothing in the card would notice either |
| V5 | `node scripts/v2/stt-benchmark.mjs --audio .cache/v2-stt/audio-es --models .cache/v2-stt/models --whisper build/linux-resources/bin/whisper-cli --inject-metrics <docs/v2/evidence/S4a.2/fixtures/none-qualify.json> --out <a temporary table outside the repo>` | exit non-zero, and `NO QUALIFYING CANDIDATE` is written. This is the **negative arm**, so the terminal result the whole Spanish chain waits on is a tested outcome rather than an undefined one. `--inject-metrics` is a **new flag on this card's own new script** and takes a file of per-candidate metric sets in the table's own shape; the fixture is one candidate that misses one bar by one unit (e.g. negations retained 29 of 30) and one that passes all six, and it is fabricated numbers about fabricated audio (HS-8) containing no real text. **The flag's meaning is fixed and bounded in the same sentence:** it replaces the measured metric block only, it prints `INJECTED` on the table's header, it may write a `STT-SELECTION.json` **only** when `--out` is outside the repository, and it may never write to `docs/v2/state/STT-SELECTION.json`, `docs/eval-reports/` or `docs/v2/evidence/` — so the real selection cannot be produced by a fixture, and a reviewer can tell an injected table from a measured one at a glance. Expected, in order: exit non-zero; `NO QUALIFYING CANDIDATE` written; the passing candidate named as the qualifier in the table but **not** selected, because the pick is the *script's* and the injected metrics still go through the same filter and the same pick rule |

## Stop conditions
1. The regenerated `reference.json` is not byte-identical to
   `docs/v2/evidence/S4a.1/reference.json`, or `check-es-audio.mjs` exits
   non-zero, or the voice's hash does not match the value recorded in
   `reference.json`. Report `BLOCKED` with the two digests and the
   `synthesis` block. Never re-run with different Piper flags, a different
   voice or a hand-written sentence list to make it match, and never
   hand-regenerate: that is a different corpus, not a regeneration.
2. A candidate cannot be downloaded within the approved hosts: record it as
   unavailable (it does not qualify); do not substitute another file. If
   `/usr/bin/time` is absent, the same shape applies to the memory criterion:
   `NOT MEASURED`, recorded as unavailable, and the candidate does not qualify.
3. The machine is not quiet, before or during the run: `loadavg1` before the
   run is above 0.5, or three consecutive 60 s samples above 2.0 end it. Report
   `BLOCKED` with the table, the numbers, the environment block and the load
   samples, and **do not write `STT-SELECTION.json`**. Re-run when the machine
   is quiet, from the checkpoint (Fixed decision 10) — not re-interpreted. A
   blocked run is never repaired by adding, removing or re-weighting a metric
   (HS-7).
4. `df -P .` shows less than 4 GiB free before V0: `BLOCKED` with the `df`
   output. Never free space by deleting a cached artefact the checkpoint says is
   already verified.
5. A second checksum or size mismatch on the same artefact after a repair: the
   pin is wrong, not the file. Report `BLOCKED` with both values, per P4.1's
   stop condition 5. Re-downloading cannot fix a wrong pin.
6. A verified candidate appears only for one SHA-1 provenance case — a file
   whose `sha256` could not be computed after its `sha1` matched. Report
   `BLOCKED` naming the entry; the six candidates are benchmarked against pins
   that already existed, and a pin invented from the bytes under test is not a
   pin (C-ACQ@1 rule 5).

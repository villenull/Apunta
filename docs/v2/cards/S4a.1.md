# S4a.1 Synthetic Spanish audio

| Field | Value |
| --- | --- |
| Parent | S4a |
| Role | IMPLEMENTATION |
| Level | L1 |
| Contracts | C-STT@1 |
| Depends | S3.1, S1.R |
| Findings | R08, R17 |
| Confidence | n/a |

## Objective
A reproducible script renders the Spanish tuning and held-out dictations,
plus clinical-term sentences, as 16 kHz mono speech with reference text.

## Read
`docs/research/es-mx-speech.md` (voices, samplerates and redistribution
position, §§5.1–5.4); `e2e/fixtures/eval-es/**`;
`docs/research/es-mx-clinical-glossary.json`;
`scripts/synthetic-acceptance/generate-audio.mjs` and
`e2e/fixtures/audio/README.md` (the existing English audio precedent and its
16 kHz mono 16-bit convention).

## May edit
`scripts/v2/generate-es-audio.mjs` (new); `scripts/v2/check-es-audio.mjs` (new);
`e2e/fixtures/audio-es/README.md` (new). Generated audio is **never committed**
(L-POLICY row 4); `reference.json` and the voice checksums are sandbox outputs
transcribed into `docs/v2/evidence/S4a.1/`, not repository files.

## Must not edit
Anything else. Never write generated audio into the repository.

## Fixed decisions
- **Voices: one voice for the whole corpus — `es_MX`-ald-medium, per
  `es-mx-speech.md` §5.4.** The other `es_MX` voices are optional extras only
  if a later card asks; `es_ES` only if no `es_MX` voice exists, noted as a
  limitation. The voice count and per-clip mapping are recorded in
  `reference.json`.
- **Sample rate:** every voice is 22,050 Hz; every clip is resampled to
  **16,000 Hz mono 16-bit PCM** using `ffmpeg` (present on this PC; used as
  found under ACQUISITION §2, version recorded in Acquisitions). The 5 silence
  and 5 tone clips are generated directly at 16,000 Hz.
- **Variants per dictation:** clean; room noise at 20 dB SNR (white noise,
  seeded, per clip); speech rate 1.15× faster, i.e. Piper `length_scale`
  `1/1.15 ≈ 0.8696`. The generator writes the RNG seed constant, the noise
  colour, the `length_scale` and the Piper version into `reference.json`.
- **`reference.json` shape** (one file per output directory):
  `{"version":1,"piper":"<version>","voices":[{"name","sha256","bytes"}],"clips":[{"file","text","voice","variant","source","category"}]}`,
  where:
  - `file` is relative to the output directory;
  - `variant` is `clean|noise|fast` for every speech clip; the 10 non-speech
    clips exist in the `clean` variant only;
  - `voice` is the voice name, or `"none"` for the 10 non-speech clips;
  - `text` is the reference text, or `""` for the 10 non-speech clips;
  - `source` is one of `tuning | heldout | clinical | silence | tone`;
  - `category` is: for `source: tuning|heldout`, the clip's trap type (one of
    the eleven in `e2e/fixtures/eval-es/`: `clean-control`, `dose-and-number`,
    `english-loanword`, `experiencer`, `invented-negation`, `lost-negation`,
    `past-vs-current-risk`, `section-never-covered`, `spoken-correction`,
    `uncertainty`, `unclear-speech`); for `source: clinical`, one of
    `drugs | doses | negation | numbers`; for `source: silence|tone`, `silence`
    or `tone` respectively.
  This makes every clip in the output directory representable, so V2's
  "covers every clip" is satisfiable without widening any pinned decision. The
  `source`/`category` pair is what lets S4a.2 report the 55-dictation rate and
  the 40-sentence rate separately and attribute them to the right split.
- **The 40 clinical-term sentences live as a literal array in
  `scripts/v2/generate-es-audio.mjs`** (no new data file), 10 per class — drugs,
  doses with decimals and units, negated and inserted-negation risk statements,
  numbers as words. Drug names are drawn from
  `docs/research/es-mx-clinical-glossary.json`; person names only from
  `e2e/fixtures/eval-es/NAMES.md`. They are additional to the 55 corpus
  dictations, belong to neither split, and get the same three variants.
- **Piper invocation contract:** the generator uses `PIPER_BIN` (the piper
  console script or `python3 -m piper`) and `PIPER_MODEL` (the `.onnx` voice
  path), exactly as the English precedent does; keep both outside the
  repository. Record the Piper version, voice URL, size, SHA-256 and licence in
  the return file's Acquisitions section (A09/A10).
- **Output location (sandbox):** run
  `node scripts/v2/sandbox.mjs env --port 7807`, source the printed `export`
  lines, and write to `$(dirname "$APUNTA_DATA_DIR")/audio-es`; never write
  directly under `/tmp/apunta-v2`. Record the run id in the checkpoint's
  `sandboxRuns`.
- Nothing in this card touches `server/`, `shared/`, `web/`, or any runtime
  path; Piper and `ffmpeg` are dev-only and never shipped.

## Verification
| ID | Command (cwd: repo root) | Expected |
| --- | --- | --- |
| V1 | `node scripts/v2/sandbox.mjs env --port 7807 > /tmp/s4a1.env && . /tmp/s4a1.env && A=$(dirname "$APUNTA_DATA_DIR")/audio-es-a && B=$(dirname "$APUNTA_DATA_DIR")/audio-es-b && node scripts/v2/generate-es-audio.mjs --out "$A" && node scripts/v2/generate-es-audio.mjs --out "$B" && diff <(cd "$A" && sha256sum *.wav \| sort) <(cd "$B" && sha256sum *.wav \| sort)` | exit 0 (identical SHA-256 per file across two separate run directories) |
| V2 | `node scripts/v2/sandbox.mjs env --port 7807 > /tmp/s4a1.env && . /tmp/s4a1.env && node scripts/v2/generate-es-audio.mjs --out "$(dirname "$APUNTA_DATA_DIR")/audio-es" && node scripts/v2/check-es-audio.mjs --audio "$(dirname "$APUNTA_DATA_DIR")/audio-es"` | exit 0; every clip is 16 kHz mono 16-bit PCM and `reference.json` matches its shape and covers every clip |
| V3 | negative (on a copy outside the shipped tree): `node scripts/v2/check-es-audio.mjs --audio <copy-with-one-wav-removed>` and, separately, `PIPER_MODEL=/nonexistent.onnx node scripts/v2/generate-es-audio.mjs --out <fresh-dir>` | each exits non-zero, names the missing file, and leaves no partial output directory |
| V4 | `npm run lint && npm run typecheck` | exit 0 |

## Stop conditions
Piper or a required voice cannot be obtained under A09/A10, or a voice's licence
text is unobtainable: report `BLOCKED` with the licence text found. V1 failing
on a correct implementation because Piper's synthesis is not byte-deterministic
for the pinned version: report it (do not post-process the audio to force a
hash).

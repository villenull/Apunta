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
`docs/research/es-mx-speech.md` (voices and redistribution position);
`e2e/fixtures/eval-es/**`; `docs/research/es-mx-clinical-glossary.json`.

## May edit
`scripts/v2/generate-es-audio.mjs` (new); `e2e/fixtures/audio-es/README.md`
(new); `e2e/fixtures/audio-es/*.wav` only if every voice used permits
committing generated audio (L-POLICY row 4), at most 10 MB total.

## Must not edit
Anything else.

## Fixed decisions
- Voices: the `es_MX` voices S1.3 lists (A10), at most 3; `es_ES` only if
  none exists, noted as a limitation.
- Variants per dictation: clean; room noise at 20 dB SNR (generated noise,
  seeded); speech rate 1.15×.
- Extra sentences: 40 clinical-term sentences (drugs, doses with decimals and
  units, negated and inserted-negation risk statements, numbers as words),
  plus 5 silence clips and 5 non-speech tone clips.
- Output to `<sandbox>/audio-es/` with `reference.json` (text per clip) and
  the voice checksums.

## Verification
| ID | Command (cwd: repo root) | Expected |
| --- | --- | --- |
| V1 | `node scripts/v2/generate-es-audio.mjs --out <sandbox>/audio-es` twice | identical SHA-256 per file across the two runs |
| V2 | `node -e` check that every clip is 16 kHz mono and `reference.json` covers every clip | exit 0 |

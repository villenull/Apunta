# The synthetic Spanish audio corpus

**There is no audio in this directory, and there never will be.** This README is
the whole of `e2e/fixtures/audio-es/`. The 295 clips live in a sandbox run folder,
are regenerated on demand, and are thrown away with the run.

## Why the audio is not committed

L-POLICY row 4 (`docs/v2/ACQUISITION.md` §3) allows generated fixtures to be
committed **only if the voice's model card permits redistribution of generated
audio**. `docs/research/es-mx-speech.md` §5.4 read all five relevant model cards
in full and found **no** position on generated audio in any of them — `[not
found]`, for `es_MX-ald-medium` among them. Two adjacent facts are not card
permission: the `rhasspy/piper-voices` repository carries a repo-level `mit` tag,
and `es_MX-ald`'s training dataset is under the Unlicense — but a dataset licence
governs the training recordings, not a TTS engine's output.

So the only compliant action is the second half of that row: **generate at test
time into the sandbox and never commit**. `scripts/v2/generate-es-audio.mjs`
refuses an `--out` inside the repository, so this cannot happen by accident, and
`reference.json` — which is fully sanitised, because every `file` is relative to
the output directory — is transcribed into `docs/v2/evidence/S4a.1/` instead.

The corpus is **fabricated** (HS-8). Every sentence is invention: 55 come from
`e2e/fixtures/eval-es/`, 40 live as a literal array in the generator, and the
only personal names anywhere are four rows of `e2e/fixtures/eval-es/NAMES.md`. No
real session, patient, clinician or record is involved, and redaction is not
de-identification.

## Regenerating it

Piper and the voice are development-only and live outside the repository
(ACQUISITION A09, A10). Neither is ever shipped, linked or imported by `server/`,
`web/` or `shared/`.

```sh
# 1. an isolated run folder; the output goes beside its data dir, never into
#    /tmp/apunta-v2 directly
node scripts/v2/sandbox.mjs env --port 7807 > /tmp/s4a1.env && . /tmp/s4a1.env

# 2. render and check, into $(dirname "$APUNTA_DATA_DIR")/audio-es
PIPER_BIN=~/.local/share/apunta-piper/venv/bin/piper \
PIPER_MODEL=~/.local/share/apunta-piper/voices/es_MX-ald-medium.onnx \
node scripts/v2/generate-es-audio.mjs --out "$(dirname "$APUNTA_DATA_DIR")/audio-es" \
  && node scripts/v2/check-es-audio.mjs --audio "$(dirname "$APUNTA_DATA_DIR")/audio-es"
```

`PIPER_BIN` is a `piper` console script (or a `python3 -m piper` prefix) and
`PIPER_MODEL` the `.onnx` voice, exactly as
`scripts/synthetic-acceptance/generate-audio.mjs` takes them. If the Python that
owns `PIPER_BIN` is not beside it, point `PIPER_PYTHON` at that interpreter:
`reference.json` records the Piper version read from the installed distribution,
and the generator refuses to write a corpus whose version it cannot read.

The run is all-or-nothing. Everything is written to a staging folder beside the
target and renamed into place at the end, so a failure at any point leaves the
target path absent rather than half-populated. Roughly 4.5 minutes and 407 MB on
the machine this was written on.

## What comes out

295 clips, all **16,000 Hz mono 16-bit PCM**, and one `reference.json`. They are
**flat in the output directory**, which is not tidiness: the reproducibility check
is `sha256sum *.wav`, and a corpus in subdirectories would make that glob match
nothing and pass vacuously.

| Population | Clips | `source` | `category` | Length |
| --- | --- | --- | --- | --- |
| `e2e/fixtures/eval-es/tuning/`, 33 dictations x 3 | 99 | `tuning` | the trap type (11) | 2 h 08 m |
| `e2e/fixtures/eval-es/heldout/`, 22 dictations x 3 | 66 | `heldout` | the trap type (11) | 1 h 25 m |
| 40 clinical sentences x 3 | 120 | `clinical` | `drugs`/`doses`/`negation`/`numbers` | 7 m |
| 5 silence, `clean` only | 5 | `silence` | `silence` | 15 s |
| 5 tone, `clean` only | 5 | `tone` | `tone` | 15 s |
| **total** | **295** | | | **3 h 41 m** |

File names are `<source>-<category>-<stem>.<variant>.wav` for speech
(`tuning-clean-control-01-sesion-completa.clean.wav`) and `<source>-<NN>.wav` for
the ten non-speech clips, which exist in the `clean` variant only.

`reference.json`:

```json
{
  "version": 1,
  "piper": "1.8.0",
  "synthesis": {
    "seed": 20260926,
    "noiseColour": "white",
    "noiseSnrDb": 20,
    "noisePowerReference": "speech-active region, gate -40 dBFS of clip peak",
    "fastRate": 1.15,
    "lengthScale": 0.8695652173913044,
    "lengthScaleExpression": "1 / 1.15",
    "sourceSampleRate": 22050,
    "sampleRate": 16000,
    "channels": 1,
    "bitsPerSample": 16,
    "resampler": "ffmpeg version n9.0.1 ..."
  },
  "voices": [{ "name": "es_MX-ald-medium", "sha256": "019b3803...", "bytes": 63201294 }],
  "clips": [{ "file": "silence-01.wav", "text": "", "voice": "none", "variant": "clean", "source": "silence", "category": "silence" }]
}
```

The `synthesis` block is where the constants the card pins live: the RNG seed, the
noise colour, the SNR, and the `length_scale` — `1/1.15`, the exact double rather
than the card's rounded `≈ 0.8696`, with the expression beside it. The card's
pinned four top-level keys are all present and unchanged; `synthesis` is the only
addition, because the card also requires the seed, the noise colour and the
`length_scale` to be written into this file.

`source` and `category` together are what let S4a.2 report the 55-dictation rate
and the 40-sentence rate separately and attribute both to the right split.

## The three variants

- **`clean`** — Piper as found, the model's own `noise_scale` and `noise_w`.
- **`noise`** — room noise at **20 dB SNR**, white, seeded. It is **the `clean`
  arm of the same run plus the noise**, not a third synthesis, so the two arms of
  a dictation differ only by the noise. Signal power is the mean square over the
  clip's speech-active region (the first through the last sample at or above
  −40 dBFS of the clip's peak, which excludes the digital silence Piper pads a
  dictation with); the noise is uniform in [−1, 1), scaled so its measured mean
  square is that power over 100, and added across the whole clip. The per-clip
  seed is the `synthesis.seed` constant mixed with an FNV-1a hash of the clip's
  own id. The generator prints the SNR it achieved, from the difference between
  the pair it holds — measured, not assumed.
- **`fast`** — speech rate 1.15x faster, i.e. Piper `length_scale` 1/1.15.

The 20 dB figure is measured against *speech*, not against the whole clip. On a
clip that is half padded silence, whole-clip RMS would put the noise
correspondingly further under the file, and a room-noise arm that is quieter than
its own spec is not the arm C-STT@1 is measuring.

## The ten non-speech clips

`silence-01..05.wav` are digital silence at 1, 2, 3, 4 and 5 seconds;
`tone-01..05.wav` are a 0.25-amplitude sine at 220, 330, 440, 550 and 660 Hz for
the same five durations, with 20 ms raised-cosine fades so a tone clip has no
click transient to transcribe. They exist so the benchmark can score a signal with
no speech in it: a STT that invents a note from a tone is a fabrication the eval
should catch, and it is only catchable if the benchmark contains one. The checker
asserts the silence clips are silent and the tone clips are not.

## The 40 clinical sentences

Ten per class, as a literal array in `scripts/v2/generate-es-audio.mjs` — the card
names the script as their only home, so there is no data file to drift from the
code. They belong to neither corpus split and get the same three variants as
everything else.

- `drugs` — drug names from `docs/research/es-mx-clinical-glossary.json` (category
  `medication`); four of the ten also name a patient, from
  `e2e/fixtures/eval-es/NAMES.md`.
- `doses` — decimals and units from the glossary's `unit` and `number` categories
  (`cero coma cinco miligramos`, `dos coma cinco mililitros`, `seis y media horas`).
- `negation` — ten risk statements with an internal **5 + 5 split, in this
  order**: 01–05 carry an explicit negation the transcript must retain, 06–10
  state the risk affirmatively, so a negation that appears in a transcript but not
  in `text` is an insertion. C-STT@1 measures "negations retained 100%" and
  "inserted negations 0" separately, and the split is derivable from `category`
  and `text` with no extra field.
- `numbers` — numbers as words (`diecinueve`, `ochenta y dos`, `seis y media`).

## Reproducibility, honestly

**Piper is not byte-deterministic.** Two runs of this generator on this machine
produce the same 295 file names, a byte-identical `reference.json`, and 10 of the
295 clips byte-identical — the five silence and five tone clips, which this
script writes itself. The other 285, every one of them a Piper synthesis, differ.

The cause is inside the ONNX graph, not in this script. `es_MX-ald-medium.onnx`
takes three inputs (`input`, `input_lengths`, `scales`) and no noise tensor, so
the VITS flow draws its own randomness per run; piper exposes no seed for it.
Synthesising the same sentence with `--noise-scale 0 --noise-w-scale 0` **is**
byte-identical across runs, which is the proof of the mechanism. Piper 1.8.0 is
the newest release on the acquisition day, which is what A09's fixed selection
rule requires, and the rule is not the implementer's to relax — so this is
reported, not worked around. Nothing here post-processes audio to force a hash.

What this means downstream: S4a.2 must not compare a transcription against a hash,
and must not assume a clip it regenerated is the same clip it measured. Anything
that needs a stable corpus across machines has to record the WAVs it scored.

## Extending it

Add a sentence to the array in `generate-es-audio.mjs` and check the checker; add
a sixth fixture to a trap type and `check-es-fixtures.mjs` (S3.1) will fail the
split before `check-es-audio.mjs` ever sees it. New clinical classes need a new
`category` value in both scripts, and the population table in both. Invent the
content — never adapt or redact something real, and add a name to
`e2e/fixtures/eval-es/NAMES.md` before naming anyone.

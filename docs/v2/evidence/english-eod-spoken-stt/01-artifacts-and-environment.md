# Environment, artifacts and integrity — English EOD spoken-STT pass

Recorded 2026-10-04, branch `main`, HEAD `e7889bc`. Every value below was emitted
by the harness itself (`real-stt.ts`) or read directly from the named file.

## Machine / process

| Field | Value |
| --- | --- |
| Node | `v26.8.2` |
| Platform | `linux-x64` |
| `APUNTA_FAKE_AI` | unset (real provider; fake mode off) |
| `DEFAULT_STT_LANGUAGE` | `en` |
| OS / desktop session | none used — no display, no PulseAudio, no audio device |
| Inferences run | **one** |

## Artifacts (SHA-256, size)

| Role | Path | SHA-256 | Bytes |
| --- | --- | --- | --- |
| input | `/tmp/apunta-v2/2026-10-03T22-37-12-589Z-2b44c153/audio-en/dictation-30s.wav` | `79719c56b2ca0477cd0bde9647324efa4a60119d955e53b985ac599fdb5d0a5f` | 960044 |
| model | `build/eod-model-cache/models/ggml-tiny.en.bin` | `921e4cf8686fdd993dcd081a5da5b6c365bfde1162e72b08d75ac75289920b1f` | 77704715 |
| binary | `build/linux-resources/bin/whisper-cli` | `3a9f516ded6dc6f619e96570ac326922c5718e5e6bca03a735e5d07bd60804de` | 1064648 |

## The input is the approved P3.5 spoken fixture, not the tone fixture

This is the point of the pass, so it is checked three independent ways.

1. **Hash pinned by frozen evidence.** `docs/v2/evidence/P3.5/attempt-4/runtime/04-V1.txt:9`
   records exactly `79719c56b2ca0477c…b5d0a5f` for
   `<sandbox>/audio-en/dictation-30s.wav`. The file read here hashes to the same
   digest and the same size (960044) the root stat named. It is not a
   substitute, a regenerated file or a re-encoded copy.
2. **Byte-identical at run time.** The `artifact input` and `wav` events in
   `02-run-output.txt` both re-hash the file inside the process that ran the
   inference, so the bytes whisper saw are the bytes hashed above.
3. **Not the repository tone fixture.** `e2e/fixtures/audio/dictation-10s.wav`
   is untouched and unused here; the input path is the P3.5 spoken file. That
   reversal is the entire difference from the a749 tone pass
   (`english-eod-real-stt/`), whose report stands unchanged as a limited engine
   proof and **not** a quality result.

## Provenance of the spoken words (read before the call)

The fixture is generated, not recorded from a person. The text comes from the
P3.5 V1 card cell (`docs/v2/cards/P3.5.md:693`, byte-identical in
`attempt-4/runtime-readiness/row-cells/V1.command.txt`) and was read **before**
any inference:

```
Progress note for John Smith. He reports no self-harm thoughts this month and
denies any intent to harm anyone. He continues the sertraline fifty milligrams
daily and slept better this week. We reviewed sleep hygiene and set a follow-up
in four weeks.
```

Synthesis, per the same cell: Piper `en_US-ljspeech-medium` at
`--noise_scale 0 --noise_w 0`, `OMP_NUM_THREADS=1`, looped by
`ffmpeg -stream_loop -1 -t 30` and resampled to 16 kHz mono `pcm_s16le` with
`bitexact`. So the 30-second clip is the sentence above **repeated**, which is
why the transcript in §2 of the README contains it twice. The words are
fabricated by a TTS voice; no real patient's speech is involved anywhere, and no
audio is committed (L-POLICY).

## Input WAV as parsed by the app's own header reader

Read with `parseWavHeader` from `@apunta/shared` — the same function
`POST /api/transcribe` uses — so `durationSeconds` is the app's number, not a
container tool's:

| Field | Value |
| --- | --- |
| Sample rate | 16000 Hz |
| Channels | 1 |
| Bits per sample | 16 |
| Duration | 30 s (exact) |

## Model integrity

`build/eod-model-cache/models/ggml-tiny.en.bin.receipt.json` pins
`sha256:921e4cf8…920b1f`, `sizeBytes:77704715`. Both match the values the harness
hashed at run time, independently of the acquisition review that first recorded
them. Mode `600`, opened for read; nothing in this pass wrote to the cache.

## Binary/model presence probe

`provider.describe()` reported `binaryPresent: true`, `modelPresent: true`
before any transcription was attempted. "Binary present" means `whisper-cli
--help` started and closed inside the provider's own 5 s probe window — a start
check, not an exit-code check, which is what the provider documents.

## Git state

- Nothing staged, nothing committed by this pass.
- Source, config, cards, checkpoints, `build/eod-model-cache/`,
  `build/linux-resources/`, `e2e/fixtures/` and the a749 evidence directory were
  not edited. The only new files are under
  `docs/v2/evidence/english-eod-spoken-stt/`.
- Scratch and run output stayed in the git-ignored `build/eod-spoken-stt/`
  (`.gitignore` covers `build/`).
- The outside-workspace WAV was opened read-only and left in place; nothing was
  copied out of it and no audio byte is committed.
- Nothing listened on port 7717 during or after the run; no build, no server,
  no database, no Ollama inference, no network, no download.

# Environment, artifacts and integrity — English EOD real-STT pass

Recorded 2026-10-03, branch `main`. Every value below was emitted by the harness
itself (`real-stt.ts`), not transcribed by hand.

## Machine / process

| Field | Value |
| --- | --- |
| Node | `v26.8.2` |
| Platform | `linux-x64` |
| `APUNTA_FAKE_AI` | unset (real provider; fake mode off) |
| `DEFAULT_STT_LANGUAGE` | `en` |
| OS / desktop session | none used — no display, no PulseAudio, no audio device |

## Artifacts (SHA-256, size)

| Role | Path | SHA-256 | Bytes |
| --- | --- | --- | --- |
| input | `e2e/fixtures/audio/dictation-10s.wav` | `d487a3930b2baac09c1f3206106e852caec8ed3a2a4f5f3d92d6f8f092d5820f` | 320044 |
| model | `build/eod-model-cache/models/ggml-tiny.en.bin` | `921e4cf8686fdd993dcd081a5da5b6c365bfde1162e72b08d75ac75289920b1f` | 77704715 |
| binary | `build/linux-resources/bin/whisper-cli` | `3a9f516ded6dc6f619e96570ac326922c5718e5e6bca03a735e5d07bd60804de` | 1064648 |

## Cross-checks

- **Model hash matches its receipt, independently.**
  `build/eod-model-cache/models/ggml-tiny.en.bin.receipt.json` pins
  `sha256:921e4cf8…920b1f`, `sizeBytes:77704715`. Both match the values the
  harness hashed at run time. The AM-198 acquisition review had already recorded
  the same digest; this pass re-derived it rather than trusting that.
- **Model was opened read-only.** Mode `600`, opened by `whisper-cli` for read.
  Nothing in this pass wrote to `build/eod-model-cache/`.
- **Binary is the shipped Linux runtime one**, from the P3.1 resource folder:
  `build/linux-resources/bin/whisper-cli`, ELF 64-bit x86-64, mode `755`.
- **Input is the original checked-in fixture**, byte-identical to what
  `e2e/tests/capture.spec.ts` feeds Chromium's fake microphone. Not regenerated,
  not copied into a scratch path, not modified.

## Input WAV as parsed by the app's own header reader

Read with `parseWavHeader` from `@apunta/shared` (the same function
`POST /api/transcribe` uses), so `durationSeconds` is the app's number, not a
container tool's:

| Field | Value |
| --- | --- |
| Sample rate | 16000 Hz |
| Channels | 1 |
| Bits per sample | 16 |
| Duration | 10 s (exact) |

## Binary/model presence probe

`provider.describe()` reported `binaryPresent: true`, `modelPresent: true`
before any transcription was attempted. "Binary present" means
`whisper-cli --help` started and closed within the provider's own 5 s probe
window — a start check, not an exit-code check, which is what the provider
documents.

## Git state

- Nothing was staged or committed by this pass.
- Source, config, cards, checkpoints, the model cache and `e2e/fixtures/` were
  not edited. The only new files are under
  `docs/v2/evidence/english-eod-real-stt/` (this directory).
- Scratch and run output stayed in the git-ignored `build/eod-real-stt/`
  (`.gitignore:55 build/`).
- Nothing was listening on port 7717 during or after the run.
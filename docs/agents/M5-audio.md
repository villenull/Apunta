# M5 — Audio capture + local transcription

**Depends on:** M3 (run after M3; may be done in any order with M4, M6)

## Goal

The record path of `prototype/capture.html`: record in the browser, upload,
transcribe fully locally with whisper.cpp, then feed the transcript into the
existing draft pipeline.

Read `docs/research/local-ai-stack-2026-08.md` §3 first. **Never** use the
browser SpeechRecognition/Web Speech API — hard privacy rule.

## Read before you start: ffmpeg is probably out

`docs/research/m8-bundling-2026-08.md` (Aug 2026) found two things that make
the ffmpeg step below unnecessary, and one licensing reason to want it gone:

- `whisper-cli` no longer needs a 16 kHz WAV. It decodes through miniaudio and
  resamples/downmixes internally (WAV, MP3, FLAC, Ogg Vorbis, stdin). The
  README's "16-bit WAV only" line is stale. It still cannot read Opus/WebM.
- Chromium accepts `new AudioContext({ sampleRate: 16000 })`, so the browser
  can record 16 kHz mono directly and write a 44-byte RIFF header itself —
  roughly 80 lines, no server-side transcode.
- Homebrew's ffmpeg is GPL-3.0-or-later and no maintained prebuilt LGPL arm64
  macOS build exists, so bundling it in M8's `.dmg` is a real problem. Not
  depending on it now avoids having to undo this later.

**So: record 16 kHz mono WAV in the browser, POST that, and skip ffmpeg.**
If you deviate, say why in `docs/decisions.md`. Either way the `ffmpeg` key in
`shared/src/health.ts` and the M7 setup checklist need revisiting — a machine
with no ffmpeg installed should not show red for a dependency the app no
longer uses.

The deliverables below are written as originally drafted; treat the ffmpeg
step as superseded rather than as instruction.

## Deliverables

1. `WhisperCppSttProvider` implementing `SttProvider`:
   - Input audio file → ffmpeg (`-ar 16000 -ac 1`) to a temp WAV →
     `whisper-cli` child process with the large-v3-turbo Q5 GGUF model
     (paths from settings: `whisper_binary` default `whisper-cli` on PATH,
     `whisper_model` default `<data dir>/models/ggml-large-v3-turbo-q5_0.bin`).
   - Pass `--prompt` built from the settings vocabulary list
     (`stt_vocabulary`, string array; keep the rendered prompt ≤ 200
     tokens). Parse stdout for progress → `progress` events; final `text`.
   - Timeout + clear typed errors: binary missing, model missing, ffmpeg
     missing, decode failure. Health endpoint checks all three presences
     (`whisper-cli --help` probe, model file stat, `ffmpeg -version`).
2. `FakeSttProvider` (if M3's stub needs finishing): emits three progress
   events then a fixed transcript derived from the audio filename — e2e
   relies on determinism.
3. `POST /api/transcribe` (multipart audio + patient/format ids): stores the
   audio under `<data dir>/audio/<uuid>.<ext>`, streams SSE progress, then
   creates the transcript row (`source: 'audio'`, duration probed via
   ffprobe) and hands off to the same generation path as /api/generate —
   final events mirror it (`token`s then `note`). One request takes the user
   record → draft. Setting `keep_audio` (default **false**): when false,
   delete the audio file after successful transcription and null the
   filename column.
4. Capture UI record path: enable the "Record audio" option — MediaRecorder
   (webm/opus), live timer (mm:ss), pulsing record dot per prototype, Stop
   and process → upload with progress states ("Transcribing…" with percent,
   then streaming draft exactly like the typed path). Mic-permission-denied
   and mid-recording-error states with retry. Recordings over 60 minutes are
   stopped with a notice.
5. Settings UI: vocabulary list editor (chips or textarea, one term per
   line) and the keep-audio toggle.

## Acceptance criteria

- Unit tests: whisper arg builder (incl. vocabulary prompt truncation),
  stdout progress parser against captured fixture output, error mapping.
- Integration: /api/transcribe in fake mode → transcript row + note created,
  SSE order correct; keep_audio=false deletes the file (temp dir assert);
  missing-binary path surfaces the typed error.
- Playwright with Chromium fake media (`--use-fake-device-for-media-capture`,
  `--use-fake-ui-for-media-stream`, `--use-file-for-fake-audio-capture`
  pointing at a checked-in ~10s WAV in `e2e/fixtures/`): record → stop →
  transcribing state → draft appears in workspace (fake STT).
- `npm run smoke:live` extended: transcribes the fixture WAV with real
  whisper.cpp and prints transcript + timing (manual, documented).
- Baseline suite green.

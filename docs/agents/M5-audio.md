# M5 — Audio capture + local transcription

**Branch:** `feat/m5-audio` · **Depends on:** M3 (may run parallel to M4/M6)

## Goal

The record path of `prototype/capture.html`: record in the browser, upload,
transcribe fully locally with whisper.cpp, then feed the transcript into the
existing draft pipeline.

Read `docs/research/local-ai-stack-2026-08.md` §3 first. **Never** use the
browser SpeechRecognition/Web Speech API — hard privacy rule.

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

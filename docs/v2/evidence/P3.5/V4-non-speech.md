# P3.5 — V4, the two non-speech capture cases

- Status: **NOT RUN**, and recorded as blocked by the same cause as V3.
- No `tone` case, no `silence` case, no virtual source, no record: nothing was
  created, so there is nothing to clean up and nothing was faked.

## The exact command, which was not run

```sh
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node --version && node scripts/v2/sandbox.mjs env --port 7837 > /tmp/apunta-v2-p3.5-v4-tone.env && . /tmp/apunta-v2-p3.5-v4-tone.env && export APUNTA_ALLOW_AUDIO_TEST=1 && node scripts/v2/tauri-audio.test.mjs tone && node scripts/v2/sandbox.mjs env --port 7839 > /tmp/apunta-v2-p3.5-v4-silence.env && . /tmp/apunta-v2-p3.5-v4-silence.env && node scripts/v2/tauri-audio.test.mjs silence
```

## Why it was not run

V3 reached the app's own record button with a real click and WebKitGTK then
answered `GStreamer element appsink not found. Please install it.` and
`Audio capture was requested but no device was found amongst 0 devices` —
`autoaudiosrc`, `alsasrc` and `pulsesrc` are all absent on this host. That is the
card's A03 stop condition, which names V0–V5 together and says the card stops
there; the owner line is `E6` in `docs/v2/state/OWNER-ACTIONS.md`.

A tone and digital silence cannot produce frames either, so running the two cases
would have produced two more `capture-error` phases and nothing else. Running them
would also have created two more virtual-source records at this attempt, which is
the duplicate-provenance outcome V5 fails closed on. The row is therefore left
`NOT RUN` with its cause, never `PASS`, never quietly dropped.

## What each case will assert once the plugins are installed

Recorded here so the next attempt does not have to re-derive them, and so nothing
about them is claimed now:

**`tone`**, on port **7837** in its own run folder, playing
`e2e/fixtures/audio/dictation-10s.wav` (16 kHz mono 16-bit; a tone burst train,
not speech — the file is read, never modified) into `apunta_p35` with `paplay`
while `apunta_p35_mic` is the default:

- the phase reaches `recording`;
- `record-timer` advances past 10 s;
- **`levelPeak` is not `0`** — the threshold is `presenceOf`'s own `0.01`
  (`web/src/hooks/useLiveRecording.ts:464-467`), so "above 0.01" means "not 0",
  and no value between 0.01 and 0.55 is observable. `echoCancellation`,
  `noiseSuppression` and `autoGainControl` are all on at
  `web/src/lib/recorder.ts:258-266`, which is why a tone lifts the level at all;
- a line naming `/api/transcribe` appears in the AppImage child's captured
  **stderr**;
- the app surfaces `whisper_model_missing`, checked from outside with a direct
  POST of the same WAV;
- the containment read while recording: a capture stream on `apunta_p35_mic` and
  **none** on `alsa_input.usb-UGREEN`.

**`silence`**, on port **7839** in its own run folder, playing V1's
`audio-en/silence-10s.wav` (the exact artefact, SHA-256
`eeae5c4c90de536fe309bd6b1062c1493a80703d6e5ac97a3c51c98980220f78`, 10.00 s of
`anullsrc` digital silence):

- the phase still reaches `recording` and the timer still advances — the
  microphone was opened and the graph ran;
- **`levelPeak` stayed `0` for the whole recording**, decided on the hook's
  **running maximum** over every value the 250 ms poll reads (reset on each
  `record-start`), not on a change-only publish: a level that rose and fell
  between two polls is never sampled by a change-only rule, so "never rose above
  the threshold" is undecidable without the maximum;
- the `/api/transcribe` request appears on the captured stderr;
- the same containment read.

Each case has its own `APUNTA_ALLOW_AUDIO_TEST=1`-gated containment, its own
`PREV_DEFAULT`/`SINK_ID`/`SRC_ID` record, and its own teardown, and the first
case's teardown completes before the second creates anything. Ports 7837 and
7839 are this card's two pins; 7717 is never contacted.

## What this row will not assert, restated rather than left standing

**Not** that "no note is produced". With no model on disk
`WhisperProvider.transcribe` throws `whisper_model_missing` at
`server/src/ai/whisper.ts:418-419` **before** the WAV is read —
`detectTrailingSilenceDurationMs` is only reached at `:426` and the
`transcription_empty` throw is at `:430` — so `GET /api/notes` being empty is
**vacuous in this card**: no input, speech, tone or silence, can produce a note.
It is recorded as a precondition, never as evidence that the app discriminates.
The `transcription_empty` clause is **S4a.2's**, deferred to it by name.

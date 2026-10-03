# P3.5 — V1, the fabricated English fixture

- Working directory: repository root
- Started: 2026-10-03T02:25:09Z · Ended: 2026-10-03T02:25:10Z
- Exit code: 0
- Status: **PASS**. Two artefacts, both under `<sandbox>`, neither committed.

## Exact command

```sh
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node --version && node scripts/v2/sandbox.mjs env --port 7837 > /tmp/apunta-v2-p3.5-v1.env && . /tmp/apunta-v2-p3.5-v1.env && export PIPER_BIN="$HOME/.local/share/apunta-piper/venv/bin/piper" PIPER_MODEL="$HOME/.local/share/apunta-piper/voices/en_US-ljspeech-medium.onnx" && A="$(dirname "$APUNTA_DATA_DIR")/audio-en" && mkdir -p "$A" && printf '%s\n' "Progress note for John Smith. He reports no self-harm thoughts this month and denies any intent to harm anyone. He continues the sertraline fifty milligrams daily and slept better this week. We reviewed sleep hygiene and set a follow-up in four weeks." | env OMP_NUM_THREADS=1 "$PIPER_BIN" --model "$PIPER_MODEL" --output_file "$A/raw-22050.wav" --noise_scale 0 --noise_w 0 && ffmpeg -hide_banner -nostdin -loglevel error -y -i "$A/raw-22050.wav" -ar 16000 -ac 1 -c:a pcm_s16le -map_metadata -1 -fflags +bitexact -flags:a +bitexact "$A/dictation-30s.wav" && ffmpeg -hide_banner -nostdin -loglevel error -y -f lavfi -i anullsrc=r=16000:cl=mono -t 10 -c:a pcm_s16le "$A/silence-10s.wav" && rm -f "$A/raw-22050.wav" && sha256sum "$A/dictation-30s.wav" "$A/silence-10s.wav"
```

## Exact output (excerpt; the run is quiet by construction)

```
v24.19.0
27d1b7e201785376f59f64cb3b8a93de03f7bdef33df7f63e269c9f2bcb3f79a  <sandbox>/audio-en/dictation-30s.wav
eeae5c4c90de536fe309bd6b1062c1493a80703d6e5ac97a3c51c98980220f78  <sandbox>/audio-en/silence-10s.wav
```

## The two artefacts

| File | SHA-256 | Bytes | What `ffprobe` says |
| --- | --- | --- | --- |
| `<sandbox>/audio-en/dictation-30s.wav` | `27d1b7e201785376f59f64cb3b8a93de03f7bdef33df7f63e269c9f2bcb3f79a` | 504,940 | `Duration: 00:00:15.78`, `pcm_s16le ([1][0][0][0]), 16000 Hz, 1 channels, 256 kb/s` |
| `<sandbox>/audio-en/silence-10s.wav` | `eeae5c4c90de536fe309bd6b1062c1493a80703d6e5ac97a3c51c98980220f78` | 320,078 | `Duration: 00:00:10.00`, `pcm_s16le ([1][0][0][0]), 16000 Hz, 1 channels, 256 kb/s` |

- The dictation is Piper's 22,050 Hz output resampled to 16 kHz mono 16-bit with
  the `bitexact` flags — the same rule `scripts/v2/generate-es-audio.mjs` uses —
  and `--noise_scale 0 --noise_w 0` pins the synthesis. Text is the card's: one
  negated risk statement and one dose, about John Smith and nobody else (HS-8).
- **Disclosed:** the card calls this "a fabricated 30-second progress
  dictation"; the text it pins is 15.78 s of speech at Piper's speaking rate. The
  literal command is what ran, and the artefact is speech, not silence, which is
  what the row needs.
- `silence-10s.wav` is digital silence written by the `anullsrc` snippet itself —
  not a resample, not a trimmed file — and is exactly 10.00 s.
- `raw-22050.wav` was deleted by the same command (`rm -f` inside the chain); the
  run folder now holds only the two 16 kHz artefacts.
- Nothing is committed (L-POLICY row 4: the voice's model card says nothing about
  redistributing generated audio — see `acquisitions.md`).

## Where the capture rows find these files

The V3 and V4 run folders are their own, so the harness resolves the audio in
this order: `APUNTA_AUDIO_SOURCE`, then `<sandbox>/audio-en` beside its own data
folder, then the newest `/tmp/apunta-v2` run folder that holds an `audio-en`
directory with the artefact — this one. Only sandbox paths are ever read, and the
refusal the card requires (inside the repository, or directly under
`/tmp/apunta-v2`) is enforced in `scripts/v2/tauri-audio.test.mjs` before any
file is opened. V3's evidence records which source it used and the SHA-256 it
verified.

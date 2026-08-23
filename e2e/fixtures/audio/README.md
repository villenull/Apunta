# Audio fixtures

## `dictation-10s.wav`

10 seconds, 16 kHz mono 16-bit PCM (320,044 bytes) — the file Chromium plays
into the fake microphone for the capture spec
(`--use-file-for-fake-audio-capture`, wired up in `playwright.config.ts`).

**It is synthetic. No microphone was involved and there is no speech in it.**
CLAUDE.md hard rule 2 keeps real session audio out of the repository, and a
recording of a real dictation is the most sensitive artefact this project could
possibly commit. What the spec needs from the file is that frames actually flow
through `getUserMedia` → `AudioContext` → `AudioWorkletNode` → the WAV encoder,
and a tone sequence proves that as well as speech would: in fake-AI mode
`FakeSttProvider` returns a canned transcript without reading the audio at all,
so the words in the file could not affect the result even if there were any.

The signal is a string of ~0.22 s tone bursts with short gaps — a fundamental
plus two harmonics under an attack/decay envelope — which gives the waveform
the rough rhythm of someone talking so the recorder is not fed a flat sine or
digital silence.

Regenerate it with:

```js
// node make-wav.mjs e2e/fixtures/audio/dictation-10s.wav
import { writeFileSync } from 'node:fs';

const RATE = 16000;
const total = RATE * 10;
const pcm = new Int16Array(total);
const syllable = Math.round(0.22 * RATE);
const gap = Math.round(0.08 * RATE);
const pitches = [180, 210, 165, 240, 195, 150, 220, 175];

let i = 0;
let index = 0;
while (i < total) {
  const f0 = pitches[index % pitches.length];
  const length = Math.min(syllable, total - i);
  for (let n = 0; n < length; n += 1) {
    const t = n / RATE;
    const envelope = Math.sin((Math.PI * n) / length) ** 2;
    const sample =
      0.5 * Math.sin(2 * Math.PI * f0 * t) +
      0.3 * Math.sin(2 * Math.PI * f0 * 3 * t) +
      0.2 * Math.sin(2 * Math.PI * f0 * 5 * t);
    pcm[i + n] = Math.round(Math.max(-1, Math.min(1, sample * envelope * 0.6)) * 32767);
  }
  i += length + gap;
  index += 1;
}

const header = Buffer.alloc(44);
header.write('RIFF', 0, 'ascii');
header.writeUInt32LE(36 + pcm.length * 2, 4);
header.write('WAVE', 8, 'ascii');
header.write('fmt ', 12, 'ascii');
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20); // PCM
header.writeUInt16LE(1, 22); // mono
header.writeUInt32LE(RATE, 24);
header.writeUInt32LE(RATE * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36, 'ascii');
header.writeUInt32LE(pcm.length * 2, 40);

writeFileSync(process.argv[2], Buffer.concat([header, Buffer.from(pcm.buffer)]));
```

Chromium requires 16-bit PCM WAV here and resamples it to whatever rate the
page's `AudioContext` asks for, so 16 kHz mono is a convenience (it matches
what the recorder requests), not a constraint.

`npm run smoke:live` transcribes this same file with real whisper.cpp. It will
produce nonsense — there is nothing to transcribe — which is the honest result;
use `--audio <path>` to point it at a real dictation you recorded yourself, and
do not commit that file.

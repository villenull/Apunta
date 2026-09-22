# Whisper trailing-silence handling

Date: 2026-09-22  
Host: Linux x86_64, Ryzen 7 9800X3D (8 scheduler-visible CPUs)  
Speech binary: `/home/villenull/.local/bin/whisper-cli` (SHA-256
`39963aa8395951e0be54862ec614a87acf11ccb04d7ffec52c90c5a65d96dbfb`)  
Speech model: `ggml-tiny.en.bin` (SHA-256
`921e4cf8686fdd993dcd081a5da5b6c365bfde1162e72b08d75ac75289920b1f`)  
All audio in this report is synthetic or checked into the repository. No live
patient data, live database, or live recording was opened.

## Change

`server/src/ai/whisper.ts` now performs a bounded, reverse scan of the uploaded
PCM16 mono WAV for final transcription and dictation. Preview requests are not
scanned because they are refreshed while the recording is still growing.

- A tail is trimmed only when it is at least 800 ms of **exact digital zero**.
- Whisper receives `--duration` ending 300 ms after the last nonzero sample;
  the uploaded WAV is never rewritten, so kept audio and stored duration remain
  unchanged.
- An exactly silent file uses the existing `transcription_empty` error before
  spawning Whisper. This is not a generated transcript and preserves the route's
  existing empty-recording contract.
- Any nonzero quiet material is preserved. This deliberately favors a false
  negative over cutting a quiet word; it is not universal VAD and does not claim
  to remove tails contaminated by microphone/room noise.
- Aborted dictation scans stop between read chunks; the existing child-process
  cancellation path remains in place.

No string suppression, trailing-sentence deletion, VAD model, cloud service, or
model/default change was added.

## Focused regression proof

Command:

```sh
npm test -- --run server/src/ai/whisper.test.ts
```

Result: **1 test file, 44 tests passed**. The suite covers command construction,
exact-zero empty audio, a loud ending followed by a long zero tail, a mixed loud
then very quiet nonzero ending, short pauses below the 800 ms boundary, odd/read
failure safety, cancellation, and the existing preview/fitted/final paths.

The signal assertions include:

- 1 s signal + 2 s zero tail → `--duration 1300` ms.
- 1 s loud + 1 s quiet nonzero + 1 s zero tail → `--duration 2300` ms; the
  quiet ending is retained.
- all-zero audio → `transcription_empty`, with no Whisper child spawned.
- all-quiet nonzero audio → no trim.

## Real local Whisper trials

The same prompt (`Okay, notes from today's session.`), language (`en`), model,
and eight-thread setting were used for each paired trial. The explicit duration
was the value the new signal scan supplies; the source WAV stayed byte-for-byte
unchanged.

### Genuine spoken thanks

Synthetic Piper speech (`/tmp/apunta-thank-you-tail.wav`, SHA-256
`7be9fccbe9449d7a343751c3291f5da76cce1c45c8ee4a171c42c1351fc9396f`) says
`Thank you.` and ends with 1.5 s of exact zero.

- Full-file baseline: `Thank you.`
- Tail-bound run (`--duration 1250`): `Thank you.`
- An 8%-amplitude version with the same zero tail and `--duration 1250`:
  `Thank you.`

This demonstrates preservation on this synthetic normal and quiet spoken ending;
it is not a claim about every microphone, speaker, accent, or noise floor.

### Longer synthetic speech with a quiet tail

Synthetic Piper dictation (`/tmp/apunta-whisper-speech-tail.wav`, SHA-256
`4892404470405be97c535c5773f1b51cf98237fe77ab08feba67233f06810710`) contains
invented clinical-sounding words, a retraction, and an intentional repeated
word, followed by 1.5 s of exact zero.

- Full-file baseline and `--duration 19500` run returned the same transcript:
  `Um, the client said the sleep was better this week. But, um, she woke at
  four hours actually scratched that, six hours, not four. Home she denied
  suicidal thoughts and she plans to call on Tuesday. She repeated that the
  morning meeting was cancelled, cancelled before correcting herself. The
  afternoon meeting was cancelled.`
- An 8%-amplitude version also retained the same words and repetition in both
  full-file and tail-bound runs.

### Silence and the checked-in tone fixture

- A new 10 s exact-zero WAV produced Whisper's `[BLANK_AUDIO]` before the code
  change; the provider now detects it and returns the existing
  `transcription_empty` result without invoking Whisper.
- The checked-in synthetic tone fixture
  (`e2e/fixtures/audio/dictation-10s.wav`, SHA-256
  `d487a3930b2baac09c1f3206106e852caec8ed3a2a4f5f3d92d6f8f092d5820f`) has
  nonzero samples through its end, so the conservative detector correctly does
  not trim it. Current `tiny.en` output was repeated `Oh, oh, ...`, not
  `Thank you.`; the historical 2026-09-08 report's `Thank you.` result is not
  reproduced with today's binary/model pair. The fix therefore makes no claim
  that it can classify a non-silent tone as speech or suppress arbitrary model
  hallucinations on nonzero noise.

## Targeted added-word sweep

The retained raw fixtures are `/tmp/apunta-short.wav`,
`/tmp/apunta-short-tail-0.wav`, `-1.wav`, `-3.wav`, `-10.wav`, and
`/tmp/apunta-short-noise-tail.wav`. They are synthetic local Piper output for
the sentence `The client is sleeping better this week.` followed by the named
tail. SHA-256, in that order, is:

```text
a4736ad2809f014a150abf193b9f978cb9c491496e0860e91f616109974b1bfe  /tmp/apunta-short.wav
0b71f008ba147222164dc2e60a56cbaaf6343617c5d2fa9e0b1be5b5f2fc3e51  /tmp/apunta-short-tail-0.wav
f3b988fc1e94816d23588c3fadef24927cffb8a6d003700f9fefd0d5de95581d  /tmp/apunta-short-tail-1.wav
40935c7b94762209e30c01e716e54d74848f89d9b00327f6311890b01d37f8d4  /tmp/apunta-short-tail-3.wav
760ce38a609c7b0cb2caf3c8d23b0aaf9d4e971c400c974b8a1714ab82eb6c25  /tmp/apunta-short-tail-10.wav
edad997b005892e695f1e62bc4ba97dc8758133722c8bde20983cf47fba05c10  /tmp/apunta-short-noise-tail.wav
```

Each was paired through this command shape (with the fixture path substituted):

```sh
/home/villenull/.local/bin/whisper-cli \
  --model ~/.local/share/apunta/models/ggml-tiny.en.bin \
  --file /tmp/apunta-short-tail-*.wav --print-progress \
  --prompt "Okay, notes from today's session." --threads 8 --language en
```

For `tail-1`, `tail-3`, and `tail-10`, the provider added
`--duration 2380` (milliseconds, 2.38 s); `tail-0` had no bound and the
nonzero-noise fixture had no bound. The audio fixtures were retained at those
paths; the CLI text outputs were recorded in the table below. No wall-clock
latency was captured in this follow-up. Audio duration and output were:

| Fixture | Audio duration | Provider duration behavior | Output |
| --- | ---: | --- | --- |
| `tail-0` | 2.080813 s | no tail trim | `The client is sleeping better this week.` |
| `tail-1` | 3.080813 s | `--duration 2380` ms | same sentence only |
| `tail-3` | 5.080813 s | `--duration 2380` ms | same sentence only |
| `tail-10` | 12.080813 s | `--duration 2380` ms | same sentence only |
| `noise-tail` | 5.080813 s | nonzero tail preserved; no trim | same sentence only |

Thus none of these five inputs added `Thank you` or another closing word.
This is negative evidence that the exact-zero duration bound does not itself
add a closing phrase, not evidence that it fixes the historical hallucination.
The current checked-in non-silent tone still produces repeated `Oh`, not
`Thank you`; the historical added-thanks result is not reproducible on the
current binary/model. The user's added-thanks bug is therefore **not
demonstrated fixed** on the current stack.

The safe next step is to capture one current-stack, non-silent WAV that
reliably adds `Thank you` under the production command, together with its
full raw output and a genuine quiet-speech control recorded at the same noise
floor. Without that reproducer, a nonzero-tail cutoff, text filter, or
unproven VAD could delete real quiet speech and cannot be justified.

## Limits

This is a boundary fix, not a speech recognizer or general VAD. Exact digital
silence is unambiguous and is handled as empty audio. Nonzero room noise,
compression residue, or a very quiet utterance is intentionally left alone;
those cases require a measured speech/noise discriminator and are not silently
stripped. The 300 ms conservative pad can leave some model hallucination risk,
but it does not remove genuine nonzero ending speech in these trials. A future
change would need a separately evaluated local VAD/noise model and paired
quiet-speech trials before widening the threshold.

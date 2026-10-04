# Anchor verification — and why the requested word-level check is not available

## 1. Fixture ground truth was inspected before the call

`e2e/fixtures/audio/README.md` is explicit, and its own generator confirms it:

> **It is synthetic. No microphone was involved and there is no speech in it.**
> … a string of ~0.22 s tone bursts with short gaps — a fundamental plus two
> harmonics under an attack/decay envelope — which gives the waveform the rough
> rhythm of someone talking so the recorder is not fed a flat sine or digital
> silence.

> `npm run smoke:live` transcribes this same file with real whisper.cpp. It will
> produce nonsense — there is nothing to transcribe — which is the honest result.

Generator parameters in that README: 16 kHz mono, 0.22 s (3520-sample) tone
bursts separated by 0.08 s (1280-sample) gaps, eight pitches
(`180, 210, 165, 240, 195, 150, 220, 175`) cycling under a
`sin²` attack/decay envelope.

**There is no spoken ground-truth text for this file, so there are no word-level
factual anchors to verify the transcript against.** No anchor list was invented
to fill the gap.

The alternative input named in the task — a P3.5 cached synthetic dictation — was
searched for and **does not exist**. `find . -name '*.wav'` outside
`node_modules/` returns exactly three files: the checked-in fixture and two
byte-identical replay copies under `build/eod-proof-lint-ir/`. There is no
P3.5 cached audio of any kind. The only WAV available is the tone fixture, so it
was used.

Text fixtures that *do* contain words exist
(`e2e/fixtures/eval/*.txt`, `e2e/fixtures/synthetic-acceptance/dictation-script.txt`)
but none of them corresponds to this WAV; matching a transcript against them
would be comparing against a file that was never spoken.

## 2. What the transcript is, exactly

Verbatim, as recorded in `02-run-output.txt`:

```
Oh, oh, oh, oh, oh, oh, oh, oh, oh, oh, oh, oh, oh, oh.
```

| Check | Result |
| --- | --- |
| Characters | 55 |
| Tokens | 14 |
| Distinct word tokens | `oh` (one) |
| Contains any digit | **no** |
| Contains a person, place, date, medication, diagnosis or session fact | **no** |
| Matches the `result` event's recorded transcript | yes, byte-identical |

## 3. Verdict

The **one check that this input can actually support** passes: the transcript
contains no fabricated clinical content. With a speechless tone input there was
no clinical material available to hallucinate, and none was invented — no name,
no number, no symptom, no time, no intervention.

The **word-anchor check that was requested cannot be performed**, because the
fixture contains no words to anchor against. It is reported as not applicable
rather than as a pass. What the output *is* — a single repeated token — is the
documented and expected result for this fixture (`smoke:live` says so itself,
and `smoke-live.mjs:151` prints the same warning).

### Explicitly not claimed

- **No quality claim.** One speechless 10-second clip, one model
  (`ggml-tiny.en.bin`), one machine. This says nothing about transcription
  accuracy, and nothing at all about English dictation quality, which remains
  unmeasured here.
- **No claim about a real dictation.** No human speech was transcribed.
- **No fabrication-rate or faithfulness inference.** This is not `npm run eval`.
- **Not a substitute for P3.6**, for the native integration tests (still
  dependency-held), or for any card approval.
- The structural observation that the output is a single repeated token while
  the generator cycles eight pitches is recorded as a description of the
  waveform's rhythm, not as a decoding-quality finding.
# English EOD — one real speech-to-text pass through the shipped provider

Date: 2026-10-03 · branch `main` · HEAD at the time: `0018025`

**One real `whisper-cli` inference, through the shipped `WhisperCppSttProvider`,
fake-AI off, default thread policy and default timeouts. Exit 0, non-empty
transcript, 916 ms wall clock.**

This is a readiness pass on the English STT path. It is **not** P3.6, **not** a
benchmark, **not** a card approval, and **not** a quality measurement — see
[Limits](#what-this-does-not-establish).

---

## 1. Result

```
exit code            0
elapsed (wall)       916 ms
transcript           "Oh, oh, oh, oh, oh, oh, oh, oh, oh, oh, oh, oh, oh, oh."
transcript non-empty yes  (55 chars, 14 tokens, 1 distinct token, no digits)
progress frames      1  (fraction 1 — see §4)
whisper totalMs      892   (load 46, mel 3, encode 135, decode 243, batchd 364, prompt 0)
fallbacks            0 low-probability / 1 high-entropy
stderr               empty
```

The provider's own diagnostic (`transcription finished`) reports the run exactly
as configured: model `ggml-tiny.en.bin`, `threads: "8"`, `preview: false`,
`seconds: 10`.

## 2. Event stream, in order

Verbatim from `02-run-output.txt`:

1. `describe` → `binaryPresent: true`, `modelPresent: true`
2. `stt_event progress fraction=1` — message `"Transcribing…"`
3. `provider_log "transcription finished"` — the shape-only timings above
4. `stt_event transcript` — `"Oh, oh, oh, oh, oh, oh, oh, oh, oh, oh, oh, oh, oh, oh."`
5. `result` — `progressFrames: 1`, `transcriptNonEmpty: true`, `elapsedMs: 916`

The full provider contract (`SttEvent` in `server/src/ai/types.ts:271`) held: a
`progress` frame, then exactly one `transcript`, then clean stream close. No
error frame.

## 3. Command line actually given to whisper

Derived from the shipped pure functions (`03-derived-command.json`), so this is
the production line and not a hand-written guess:

```
build/linux-resources/bin/whisper-cli
  --model  build/eod-model-cache/models/ggml-tiny.en.bin
  --file   e2e/fixtures/audio/dictation-10s.wav
  --print-progress
  --prompt "Okay, notes from today's session."
  --threads 8
  --language en
```

Every one of those is a shipped default, and the omissions are as significant as
the arguments:

| Setting | Value | Where it came from |
| --- | --- | --- |
| `--threads 8` | all scheduler-visible cores | `whisperThreads(false)` — `availableParallelism()`; `preview`/`fitted` unset, so this is the authoritative-final path, not the half-core contention path |
| `--language en` | English | `DEFAULT_STT_LANGUAGE` (`shared/src/transcribe.ts:124`); **no** `resolveLanguage` override |
| `--prompt` | the empty-vocabulary lead-in | `sttPrompt([])`; no Settings vocabulary configured |
| timeout | 180000 ms | `timeoutFor(10)` = 120000 + 10×6×1000; **no** `timeoutMs` override |
| greedy decoding | **not set** | provider sets `--beam-size 1 --best-of 1 --no-fallback` for previews only, so whisper's beam search and temperature fallbacks ran, as for a note transcript |
| `--audio-ctx` | **not set** | full 30-second encoder window; the fitted context is preview/dictation-only |
| `--duration` | **not set** | `detectTrailingSilenceDurationMs` returned `null` — the tone file has nonzero gaps through its tail, and the scanner deliberately favours false negatives |
| ffmpeg | **not used** | the WAV goes straight to the binary; whisper resamples internally |

## 4. Two facts worth carrying forward

**The progress bar jumps straight to 100%.** whisper printed no intermediate
`progress = N%` lines for this clip, so the single frame came from the
provider's own completion push (`whisper.ts:515`), not from whisper. Over a
10-second clip that is invisible; over a long dictation it is the difference
between a moving bar and a frozen one, and this run does not demonstrate the
moving case either way.

**High-entropy fallback fired once** (`fallbacksHighEntropy: 1`,
`fallbacksLowProbability: 0`). This is the provider's own parse of whisper's
closing line, on a speechless input. Recorded, not interpreted.

## 5. Fidelity — how this was kept from being a fake

Each of these is a way the proof could have passed without exercising anything:

- **The shipped provider, imported from source.** `real-stt.ts` imports
  `server/src/ai/whisper.ts` directly through `tsx`. Nothing is reimplemented and
  no CLI output is parsed as a substitute for the provider's own event stream.
- **No `spawnImpl`.** Production `node:child_process`.
- **No `threads`, no `timeoutMs`, no `resolveLanguage`.** Defaults only — see
  the table in §3, which is derived from the shipped functions rather than
  asserted.
- **`log` is wired up**, because it is the provider's documented shape-only
  diagnostic hook. It changes no behaviour and returns no transcript text; the
  transcript in this report came from the `transcript` event.
- **Exactly one inference.** One `transcribe()` call, one binary spawn. There is
  no retry, no fallback input, no "try preview mode as well" branch. §3's
  command line was derived from pure functions (`buildWhisperArgs`,
  `detectTrailingSilenceDurationMs`, `whisperThreads`, `timeoutFor`) precisely so
  that recording it could not require a second run.
- **On error the run stops.** Nothing here repairs the provider, relaxes a
  criterion, or substitutes a fixture. The outcome above is the outcome of one
  attempt.
- **The input was inspected before the call**, and what it contains is reported
  honestly rather than assumed to contain speech — see
  `04-anchor-verification.md`, which is also where the requested word-anchor
  check is reported as *not applicable* rather than as a pass.
- **No `console`.** Every line goes through `process.stdout.write`, so the
  captured stream is exactly this process's output.

## 6. Commands run

```bash
# Pre-flight: hashes, sizes, modes, fixture ground truth
sha256sum e2e/fixtures/audio/dictation-10s.wav \
          build/eod-model-cache/models/ggml-tiny.en.bin \
          build/linux-resources/bin/whisper-cli

# Scoped gates on the proof script (all four green)
npx prettier --check build/eod-real-stt/real-stt.ts build/eod-real-stt/derive-command.ts
npx eslint --no-ignore build/eod-real-stt/real-stt.ts build/eod-real-stt/derive-command.ts
npx tsc --noEmit --target es2023 --lib es2023 --module nodenext \
        --moduleResolution nodenext --strict --skipLibCheck --types node \
        build/eod-real-stt/real-stt.ts build/eod-real-stt/derive-command.ts
node --check build/eod-real-stt/real-stt.ts

# The single inference
env -u APUNTA_FAKE_AI npx tsx build/eod-real-stt/real-stt.ts \
  > build/eod-real-stt/run-output.ndjson 2> build/eod-real-stt/run-stderr.txt

# Read-only derivation of the command line (spawns nothing)
npx tsx build/eod-real-stt/derive-command.ts
```

No build was run. `@apunta/shared` was imported through its existing
`shared/dist`, already built and newer than its source. No Ollama, no `npm run
build`, no native app, no audio device, no PulseAudio, no display, no port 7717,
no network, no download.

## 7. Files

**New, committed-to-be evidence — `docs/v2/evidence/english-eod-real-stt/`:**

| File | What it is |
| --- | --- |
| `README.md` | this report |
| `01-artifacts-and-environment.md` | hashes, environment, cross-checks against the model receipt |
| `02-run-output.txt` | the raw event stream, byte-identical to the harness's stdout |
| `03-derived-command.json` | the derived production command line and settings provenance |
| `04-anchor-verification.md` | fixture ground-truth inspection and the anchor verdict |
| `real-stt.ts` | review copy of the harness (byte-identical to the ignored scratch) |
| `derive-command.ts` | review copy of the read-only derivation script |

**Ignored scratch — `build/eod-real-stt/`** (`.gitignore:55 build/`): the runnable
`real-stt.ts` and `derive-command.ts`, `run-output.ndjson`, `run-stderr.txt`
(empty), `derived-command.json`. The committed copies are byte-identical
(`diff -q` clean).

**Untouched:** all source, config, cards, checkpoints, `build/eod-model-cache/`,
`build/linux-resources/`, `e2e/fixtures/`, and the live data directory. Nothing
staged, nothing committed.

## 8. Cleanup

`pgrep -a whisper-cli` after the run: **no processes**. The provider's own
`finally`/abort path SIGKILLs the child it started; the harness's 300 s watchdog
is a safety net *above* the provider's own 180 s budget and did not fire
(`watchdog_fired` is absent from the output). There is no `pkill` and no
pattern-matched kill anywhere in the harness — cancellation goes through the
provider's shipped `signal` path, which can only reach the child this process
spawned.

## What this does not establish

- **Not a quality claim.** One speechless 10-second tone clip, one tiny English
  model, one machine, one run. English dictation quality is unmeasured. Nothing
  here supports a statement about accuracy, faithfulness or fabrication rate on
  real speech.
- **Not P3.6 and not the full UI.** No browser, no record button, no SSE route,
  no note drafted from the transcript.
- **Native integration tests remain dependency-held** — `npm test` and
  `npm run e2e` were not run, and this pass does not unblock them.
- **No card is approved by this document.**
- **The input was not speech.** The fixture is synthetic tones by design
  (`e2e/fixtures/audio/README.md`); the transcript is meaningless as English, and
  it is reported verbatim rather than dressed up. A real English dictation
  through this same path remains unrun, and only that would say anything about
  the product the owner asked about.
- **One sample, not a distribution.** Timing here (≈0.9 s for 10 s of audio on
  8 threads with a tiny model) says nothing about a large model, a long
  recording, or a loaded machine.
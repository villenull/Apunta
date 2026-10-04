# English EOD — one real speech-to-text pass over real spoken words

Date: 2026-10-04 · branch `main` · HEAD `e7889bc`

**One real `whisper-cli` inference, through the shipped `WhisperCppSttProvider`,
fake-AI off, default thread policy, default timeouts, English, over the approved
P3.5 *spoken* fixture. Exit 0, non-empty transcript, 318 ms wall clock for 30 s
of audio.**

This is a readiness pass on the English STT path with an input that actually
contains English words. It is **not** P3.6, **not** a benchmark, **not** a card
approval, and **not** a quality result — see [Limits](#what-this-does-not-establish).

It follows `english-eod-real-stt/` (a749), which proved the same code path over a
speechless tone clip. **That report stands unchanged**, and it remains a limited
engine proof, not a quality pass. This pass does not rewrite it; it supplies the
one thing it said was missing — spoken input — and reports what came back.

---

## 1. Result

```
exit code            0
started / ended      2026-10-04T00:19:11Z / 2026-10-04T00:19:14Z
elapsed (wall)       318 ms   (process span 3 s, dominated by tsx startup)
transcript           448 chars, non-empty
input audio          79719c56b2ca0477cd0bde9647324efa4a60119d955e53b985ac599fdb5d0a5f, 960044 bytes, 30.000 s
model                ggml-tiny.en.bin, 921e4cf8686fdd993dcd081a5da5b6c365bfde1162e72b08d75ac75289920b1f, 77704715 bytes
binary               whisper-cli, 3a9f516ded6dc6f619e96570ac326922c5718e5e6bca03a735e5d07bd60804de, 1064648 bytes
progress frames      2  (fraction 0.99, then 1)
whisper totalMs      293   (load 35, mel 13, encode 15, decode 19, batchd 144, prompt 0)
fallbacks            0 low-probability / 0 high-entropy
stderr               empty (0 bytes)
watchdog_fired       absent
```

The provider's own diagnostic (`transcription finished`) reports the run exactly
as configured: model `ggml-tiny.en.bin`, `threads: "8"`, `preview: false`,
`seconds: 30`.

**The transcript, verbatim and in full:**

```
He reports, no self-harm thoughts this month and denies any intent to harm anyone. He continues the "Certraline-50" Miladram's Daily, and slept better this week. We reviewed sleep hygiene and set a follow-up in four weeks. Progress note for John Smith. He reports, no self-harm thoughts this month and denies any intent to harm anyone. He continues the "Certraline-50" Miladram's Daily, and slept better this week. We reviewed sleep hygiene and set
```

Fidelity to the fabricated ground truth — the patient name and the negated
self-harm statement are carried correctly, the medication name and unit are
garbled — is in `04-fidelity-verification.md`, reported as observed, with no
score and no threshold.

## 2. Event stream, in order

Verbatim from `02-run-output.txt`:

1. `environment` — `node v26.8.2`, `linux-x64`, `fakeAi null`, `defaultSttLanguage "en"`
2. `artifact input` / `artifact model` / `artifact binary` — paths, SHA-256, sizes
3. `wav` — 16000 Hz, 1 ch, 16 bit, `durationSeconds: 30`, hash re-checked in-process
4. `describe` → `binaryPresent: true`, `modelPresent: true`
5. `stt_event progress fraction=0.99` — `"Transcribing…"`
6. `stt_event progress fraction=1` — `"Transcribing…"`
7. `provider_log "transcription finished"` — the shape-only timings above
8. `stt_event transcript` — the text in §1
9. `result` — `progressFrames: 2`, `transcriptNonEmpty: true`, `elapsedMs: 318`

The full provider contract (`SttEvent` in `server/src/ai/types.ts:271`) held: two
`progress` frames, then exactly one `transcript`, then a clean stream close. No
error frame.

## 3. Command line actually given to whisper

Derived from the shipped pure functions (`03-derived-command.json`), so this is
the production line and not a hand-written guess:

```
build/linux-resources/bin/whisper-cli
  --model  build/eod-model-cache/models/ggml-tiny.en.bin
  --file   /tmp/apunta-v2/2026-10-03T22-37-12-589Z-2b44c153/audio-en/dictation-30s.wav
  --print-progress
  --prompt "Okay, notes from today's session."
  --threads 8
  --language en
```

| Setting | Value | Where it came from |
| --- | --- | --- |
| `--threads 8` | all scheduler-visible cores | `whisperThreads(false)` — `availableParallelism()`; `preview`/`fitted` unset, so this is the authoritative-final path |
| `--language en` | English | `DEFAULT_STT_LANGUAGE` (`shared/src/transcribe.ts`); **no** `resolveLanguage` override |
| `--prompt` | the empty-vocabulary lead-in | `sttPrompt([])`; no Settings vocabulary configured |
| timeout | 300000 ms | `timeoutFor(30)` = 120000 + 30×6×1000; **no** `timeoutMs` override |
| greedy decoding | **not set** | provider sets `--beam-size 1 --best-of 1 --no-fallback` for previews only, so whisper's beam search and temperature fallbacks ran |
| `--audio-ctx` | **not set** | full 30-second encoder window; the fitted context is preview/dictation-only |
| `--duration` | **not set** | `detectTrailingSilenceDurationMs` returned `null` — the looped clip has nonzero gaps through its tail, and the scanner deliberately favours false negatives |
| ffmpeg | **not used** | the WAV goes straight to the binary; whisper resamples internally |

## 4. Facts worth carrying forward

**Two differences from the a749 tone pass, both about the input.** The 0.99
frame came from whisper's own stderr `progress = 99%` line
(`server/src/ai/whisper.ts:309-310`), and the 1.0 frame is the provider's
completion push (`:516`), so the bar did move once on real speech where it never
did on the tone clip — still only once in 30 s, so still not evidence of a
smoothly advancing bar on a long dictation. And
`fallbacksHighEntropy` was **0** here against 1 there; that counter describes
whisper's own decoding, and a speechless clip is not a like-for-like
comparison, so it is recorded, not interpreted.

**The watchdog is now coincident with the provider budget, not above it.** The
harness was copied unchanged, so `WATCHDOG_MS` is still 300000 ms while
`timeoutFor(30)` is also 300000 ms — whereas at 10 s the provider's budget was
180000 ms and the watchdog sat above it. Both are minutes-scale against a
measured 318 ms, and `watchdog_fired` is absent, but the margin the original
comment describes no longer exists. Changing it would have meant editing more
than the input path, so it is disclosed here instead.

**Timing says nothing about a long recording.** 318 ms for 30 s on 8 threads
with the smallest English model is one sample.

## 5. Fidelity — how this was kept from being a fake

- **The shipped provider, imported from source.** `real-stt.ts` imports
  `server/src/ai/whisper.ts` directly through `tsx`. Nothing is reimplemented and
  no CLI output is parsed as a substitute for the provider's own event stream.
- **No `spawnImpl`.** Production `node:child_process`.
- **No `threads`, no `timeoutMs`, no `resolveLanguage`.** Defaults only — §3 is
  derived from the shipped functions rather than asserted.
- **`log` is wired up**, because it is the provider's documented shape-only
  diagnostic hook. It changes no behaviour and returns no transcript text.
- **Exactly one inference.** One `transcribe()` call, one binary spawn. No
  retry, no fallback input, no "try preview mode as well". `03-derived-command.json`
  exists precisely so recording the command line could not require a second run.
- **Ground truth read first, input hash verified before the call.** Had the file
  been missing or its digest differed from the frozen P3.5
  `79719c56b2ca0477c…`, the run would have stopped rather than substituted
  anything. It matched, so the run happened.
- **The transcript is reported as it came out**, including the trailing
  truncation and the mangled medication, rather than edited into something that
  reads better.
- **No `console`.** Every line goes through `process.stdout.write`, so the
  captured stream is exactly this process's output.
- **On error the run stops.** Nothing repairs the provider, relaxes a criterion
  or swaps the fixture.

## 6. Commands run

```bash
# Pre-flight: hashes, sizes, modes, receipt cross-check, ground truth read
sha256sum /tmp/apunta-v2/2026-10-03T22-37-12-589Z-2b44c153/audio-en/dictation-30s.wav \
          build/eod-model-cache/models/ggml-tiny.en.bin \
          build/linux-resources/bin/whisper-cli

# Scoped gates on the proof scripts (all four green)
npx prettier --check build/eod-spoken-stt/real-stt.ts build/eod-spoken-stt/derive-command.ts
npx eslint --no-ignore build/eod-spoken-stt/real-stt.ts build/eod-spoken-stt/derive-command.ts
node --check build/eod-spoken-stt/real-stt.ts
npx tsc --noEmit --target es2023 --lib es2023 --module nodenext \
        --moduleResolution nodenext --strict --skipLibCheck --types node \
        build/eod-spoken-stt/real-stt.ts build/eod-spoken-stt/derive-command.ts

# The single inference
env -u APUNTA_FAKE_AI npx tsx build/eod-spoken-stt/real-stt.ts \
  > build/eod-spoken-stt/run-output.ndjson 2> build/eod-spoken-stt/run-stderr.txt

# Read-only derivation of the command line (spawns nothing)
npx tsx build/eod-spoken-stt/derive-command.ts > build/eod-spoken-stt/derived-command.json
```

The harness was `build/eod-real-stt/{real-stt,derive-command}.ts` copied with
**one** change in each — the `WAV` constant — plus three comment lines in
`real-stt.ts` disclosing the watchdog coincidence above. `diff -u` against the
a749 originals is exactly those hunks and nothing else.

No build was run. `@apunta/shared` was imported through its existing
`shared/dist`, already built and newer than its source. No Ollama, no
`npm run build`, no native app, no audio input, no display, no PulseAudio, no
port 7717, no server, no database, no network, no download, no audio generation.

## 7. Files

**New evidence — `docs/v2/evidence/english-eod-spoken-stt/`:**

| File | What it is |
| --- | --- |
| `README.md` | this report |
| `01-artifacts-and-environment.md` | hashes, input provenance, receipt cross-check, git state |
| `02-run-output.txt` | the raw event stream, byte-identical to the harness's stdout |
| `03-derived-command.json` | the derived production command line and settings provenance |
| `04-fidelity-verification.md` | ground-truth comparison, literally, with no gate |
| `real-stt.ts` | review copy of the harness (byte-identical to the ignored scratch) |
| `derive-command.ts` | review copy of the read-only derivation script |

**Ignored scratch — `build/eod-spoken-stt/`**: the runnable `real-stt.ts` and
`derive-command.ts`, `run-output.ndjson`, `run-stderr.txt` (0 bytes),
`derived-command.json`, `derive-stderr.txt` (0 bytes), `run-start.txt`,
`run-end.txt`. The committed copies are byte-identical (`diff -q` clean).

**Untouched:** all source, config, cards, checkpoints, `build/eod-model-cache/`,
`build/linux-resources/`, `e2e/fixtures/`, `docs/v2/evidence/english-eod-real-stt/`,
and the live data directory. Nothing staged, nothing committed. The WAV outside
the workspace was read only and left where it was; **no audio is committed**
(L-POLICY).

## 8. Cleanup

`pgrep -a whisper-cli` before the run: **no processes**. The same command after
the run: **no processes**. The provider's own `finally`/abort path SIGKILLs the
child it started, and there is no `pkill` and no pattern-matched kill anywhere in
the harness — cancellation goes through the provider's shipped `signal` path,
which can only reach the child this process spawned. Only this process's own
children were touched.

## What this does not establish

- **Not a quality claim.** One clip, one tiny English model, one machine, one
  run. No accuracy, WER, confidence or faithfulness figure is asserted, and no
  threshold for one exists here or in the repository. English dictation quality
  is still unmeasured in any rigorous sense.
- **Not a clinical judgement.** Whether the mangled medication string would be
  acceptable to a clinician is not answered. The transcript is reported, not
  approved.
- **The words are fabricated.** The input is Piper-synthesized from a fabricated
  clinical sentence and looped by ffmpeg. No real patient's speech is involved,
  and no real patient text is in this evidence.
- **Not P3.6 and not the full UI.** No browser, no record button, no SSE route,
  no note drafted from the transcript.
- **Native integration tests remain dependency-held** — `npm test` and
  `npm run e2e` were not run, and this pass does not unblock them.
- **No card is approved by this document.** The `english-eod-real-stt/` report
  keeps its own limits; this one adds to them and relaxes none.
- **One sample, not a distribution.** No large model, no long recording, no
  loaded machine, no second language, no benchmark of any kind.

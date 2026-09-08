# Inference efficiency and cancellation report

Date: 2026-09-08  
Host: Linux x86_64, AMD Ryzen 7 9800X3D (8 online CPUs), Radeon RX 9070 XT
(ROCm/Ollama path), 30 GiB RAM, 60 GiB configured swap (zram plus swapfile)

This is a synthetic, local-only performance report. No patient data was read,
recorded, logged, or added to the repository. Timings are Linux evidence only;
they are not Mac or Apple Silicon estimates.

## Reconciled speech-binary finding

The earlier audit said that `whisper-cli` was absent from `PATH`. That is true
for this shell. It is not the live Apunta configuration: the live SQLite
settings row `whisper_binary` points to
`/home/huyke/.local/share/apunta/bin/whisper-cli`, and the configured preview
model points to the installed `ggml-small.bin`. Both pinned Apunta speech
weights and that executable were present, so the speech benchmark used the
same absolute path the live app resolves. The binary reports `device 0: CPU`
and `no GPU found`; no Whisper GPU offload is claimed.

Ollama is different. The prior hardware audit's local probes showed the
shipping `qwen3.5:4b-q4_K_M` allocation fully counted in VRAM and the runner
log reported all 34/34 layers offloaded to the RX 9070 XT. This task made no
driver, power, service, or model-download changes.

## Whisper baseline and selected policy

Input was the checked-in synthetic 10-second tone WAV
(`e2e/fixtures/audio/dictation-10s.wav`). It contains no speech, so these runs
measure process/model overhead only and cannot establish transcription quality.
Runs were sequential, with the same pinned models and English language mode.

| Path | Model | Threads | Context/decoding | Cold wall | Warm wall | Whisper total |
|---|---|---:|---|---:|---:|---:|
| preview | `ggml-small.bin` | 4 | fitted 640; beam 1, best-of 1, no fallback | 0.63 s | 0.54 s | 0.627 / 0.538 s |
| preview | `ggml-small.bin` | 8 | same | — | 0.49 s | 0.483 s |
| final | `ggml-large-v3-turbo-q5_0.bin` | 8 | full context; normal beam/fallback path | 5.73 s | 5.73 s | 5.716 / 5.712 s |

The preview command used the provider's fitted context for a 10-second clip
(640 frames), English, the punctuated lead-in prompt, greedy one-beam decoding,
and no fallback. The final command retained the provider's authoritative path:
large model, timestamps enabled, full 30-second context, normal beam/fallback
behavior, and the same lead-in prompt. No preview output was reused for the
final transcript.

The chosen policy is now explicit in `whisperThreads`: preview and fitted
dictation use at most half the scheduler-visible cores (4 on this host), while
the final transcript uses all 8 after recording stops. The 8-thread preview
cell was faster in isolation, but the half-core policy leaves CPU for the
recording UI and prevents provisional work from monopolizing a concurrent
dictation/final pass. This is a contention policy, not a claim that 4 threads
are faster in isolation.

Resource checks between cells showed about 15 GiB available RAM, no swapfile
use, stable zram residency around 11.7 GiB, and no sustained thermal pressure
(point samples were approximately 41–44 C on the GPU hwmon devices). The
Whisper executable reported CPU execution. GPU busy/VRAM sysfs samples were
point-in-time observations only and were not substituted for a utilization
benchmark.

## Ollama baseline and parity

The exact provider smoke path ran the longest fabricated eval fixture
(`03-rambling-work-stress.txt`, 660 words) three times after a cold model stop.
The provider's decoding and prompt settings were unchanged and recorded as:

- model `qwen3.5:4b-q4_K_M`, digest
  `2a654d98e6fba55d452b7043684e9b57a947e393bbffa62485a7aac05ee4eefd`;
- `num_ctx=16384`, `num_predict=3072`, `temperature=0`, `seed=0`,
  `repeat_penalty=1.0`, `think=false`, JSON schema format;
- prompt tokens 2,840 and output tokens 359 on each run;
- cold load 2,045 ms, then 3 ms and 0 ms warm loads;
- wall times 6.4 s, 3.6 s, and 3.6 s; all schema-valid, one attempt,
  `done_reason=stop`.

After the implementation, the same provider smoke path ran twice and remained
schema-valid with `done_reason=stop`, prompt 2,840, output 359, and wall times
4.0 s and 3.5 s. The small difference is normal local-run variance; it is not
presented as a speedup.

The safe output-bound change is operation-specific and keeps note/refine at
3,072 until a quality corpus supports a reduction:

| Operation | `num_predict` |
|---|---:|
| format detection | 256 |
| retraction quote extraction | 768 |
| note summary | 768 |
| plan goals | 1,536 |
| prep brief | 1,024 |
| note/refine ladder | 3,072 |

Every helper still rejects `done_reason=length`; the cap cannot silently accept
truncated JSON. Unit tests assert the wire values and the truncation failure.

## Implemented lifecycle safeguards

- Live preview owns an `AbortController`, aborting on stop, cancel, unmount,
  and phase cleanup before final transcription starts.
- Refine dictation owns a separate controller, aborting on close, unmount, or
  cancellation and passing the signal through the API.
- Preview/dictation request disconnects now propagate through Fastify request
  cancellation to the Whisper provider, which kills the child process.
- The final recording transcript remains separate from preview text and keeps
  its full-context safeguards.

The child-kill behavior is unit-tested; no concurrent live recording was used
for this report. A future real-speech maintenance run should measure overlap,
peak RSS, and final-tail latency directly, without changing the prompt or
decoding matrix.

## Quality and platform limits

This report does not approve a smaller drafting model or a smaller final speech
model. M10's existing real-model evidence remains the quality control: the
4B tuned arm measured 35.0% fabrication (21/60), with safety-fact capture at
70.0%; the server locks and retraction exactness remain required safeguards.
The tone WAV cannot test names, medications, numbers, risk negations,
retractions, or clinical routing. No Mac timing, Metal timing, or Whisper
quality claim can be inferred from this Linux host. The installed Whisper
binary is CPU-only, while Ollama's GPU offload is verified separately; these
are independent backend facts.

## Verification

- `npm run build:shared`
- server and web TypeScript checks
- targeted Ollama/Whisper/Refine tests: 79 passed
- transcription route tests: 22 passed
- post-change real provider smoke: 2/2 schema-valid
- Release review added explicit `done_reason=length` rejection to the two
  non-streaming JSON paths (format detection and retraction quoting); targeted
  provider tests cover both, so a partial helper response cannot be accepted
  as valid JSON or silently discard correction evidence.

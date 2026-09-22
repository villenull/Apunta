# Local AI efficiency research — 2026-09-22

## Decision

**Keep Apunta's configured models unchanged.** The strongest match for the remembered ultra-lightweight, modified “Quinn” model is **PrismML Bonsai**, a Qwen-derived family with binary or ternary weights. This is a plausible identification, not confirmation of which Reddit discussion the user remembers. Bonsai is worth an isolated comparison, but neither its small download nor its general benchmarks establish clinical faithfulness.

Recommended order:

1. **No-download first experiment:** repeat `tiny.en` with and without a bounded synthetic vocabulary, measuring clinical terms and critical facts as well as word-error rate. Existing Apunta evidence supports this more directly than any model replacement.
2. **LLM efficiency control:** retain `qwen3.5:4b-q4_K_M`; measure cold versus warm latency, prompt processing, generation, retries and end-to-end time independently. Test an 8K context only for short requests whose complete prompts and output reserve fit, against the existing 16K control. Do not shrink Brainstorm or historical-note context globally.
3. **First smaller-model comparison:** official `qwen3.5:2b-q4_K_M` against the exact 4B control. This is the lowest-integration-cost candidate, not a recommended switch. The 2B card itself positions it for prototyping/task-specific development; omissions and instruction-following are substantial risks.
4. **Most interesting compression comparison:** `prism-ml/Bonsai-8B-gguf`, file `Bonsai-8B-Q1_0.gguf`, and optionally the 4B counterpart. Confirm the exact runtime's Q1_0 support and schema behavior first. Test the 8B before treating the smallest 1.7B as a clinical candidate.
5. **If speech fidelity, rather than footprint, is the problem:** compare `small.en` plus vocabulary on final transcription while leaving preview on `tiny.en`. This deliberately buys accuracy with more memory and latency; the owner knowingly retained `tiny.en`, so it is not an automatic reversal.

**No new model inference measurements were performed for this report.** No weights were downloaded, installed models changed, live model server used, app settings changed, patient database/export accessed, or production source edited. Research used checked-in synthetic evaluation reports, source/configuration inspection and public sources. No cloud inference or external evaluator was invoked. The report is intentionally left unstaged and uncommitted for the final integrator.

## Evidence notation and limits

- **[LOCAL]** Existing Apunta measurement, with its date, fixture and hardware limits. Not a new measurement today.
- **[SOURCE]** Inspected code, model metadata, runtime documentation or published architecture. Capability support is not a speed measurement.
- **[PUBLISHER]** A model/runtime author's benchmark or claim; not independently reproduced here.
- **[COMMUNITY]** An indexed community report or anecdote. Useful for discovery, not an acceptance gate.
- **[INFERENCE]** Engineering expectation or calculation; must be measured before adoption.

All external links in the source register were accessed **2026-09-22**. Publication dates are given where the inspected source established them; an access date is not a release date. Mutable `main` branches, model cards and Ollama tags require revision/digest pinning before an experiment. Public sources contain conflicting and stale claims; those are identified below rather than silently reconciled.

## 1. Actual Apunta baseline

### Configuration and execution

Inspected: [HANDOFF](../HANDOFF.md), [shared model tiers](../../shared/src/models.ts), [model selection](../../server/src/ai/model-picker.ts), [Ollama provider](../../server/src/ai/ollama.ts), [bundled runtime environment](../../server/src/ai/ollama-process.ts), [Whisper provider](../../server/src/ai/whisper.ts), [speech settings](../../shared/src/transcribe.ts), and [installer catalogue](../../installer/src/catalog.ts).

| Component | Established baseline | Important qualification |
|---|---|---|
| Draft/refine LLM | `qwen3.5:4b-q4_K_M`; recorded full digest `2a654d98e6fba55d452b7043684e9b57a947e393bbffa62485a7aac05ee4eefd`; Apache-2.0 | Latest checked-in stack measurement is September 20, not a live settings read today. The model tag is not the whole configuration. |
| Model size | Registry payload measured in M10: 3,389,983,735 bytes; current public tag listing rounds to 3.4 GB | M10 reports 4.7B parameters for the packaged multimodal model; Qwen's card describes a 4B language backbone. Do not confuse backbone count, total parameters and download bytes. |
| LLM runtime | September 20 report: Ollama 0.34.2, ROCm on RX 9070 XT | M10 used 0.32.15 on CPU; those timings are not the current GPU baseline. Installed runtime was not queried today. |
| Generation contract | `/api/chat`, JSON-schema-constrained output, temperature 0, first-attempt seed 0, repeat penalty 1, thinking disabled when supported | Retry ladder can change the seed and, on a grammar-specific failure, omit the thinking field. Record every attempt, not only the successful result. |
| Context/output | 16,384 context; note/refine ceiling 3,072; detect 256; retraction/summary 768; plan/Brainstorm 1,536; brief 1,024 | Caps are safety bounds, not desired output lengths. Lowering a cap does not accelerate an answer already stopping below it. |
| Residency/cache | Provider `keep_alive='30m'`; bundled runtime explicitly sets Flash Attention and `q8_0` KV cache | An independently launched developer Ollama does not necessarily inherit the packaged runtime environment. Confirm effective settings before claiming a new optimization. |
| Speech | `ggml-tiny.en.bin` for both preview and final transcription; 77,704,715 bytes; MIT | SHA-256 `921e4cf8686fdd993dcd081a5da5b6c365bfde1162e72b08d75ac75289920b1f`. Owner chose English-only tiny knowingly. |
| Speech runtime | September 20 report: CPU `whisper-cli` 1.9.3-dev | The September 8 ROCm candidate belonged to an earlier install. September 20 explicitly says that candidate path is absent on this install. Do not present the older GPU deployment as today's Whisper backend. |
| Preview versus final | Preview uses fitted audio context, greedy beam/best-of 1, no fallback, and half the available cores; final transcription uses full audio context and normal beam/fallback behavior | Composer dictation has a fitted-context path too. Preview text is not the authoritative final transcript. |

The automatic tier table is broader than the measured model: unknown/non-Mac memory selects the small Qwen; 16+ GiB selects `gemma4:12b-it-qat`; 36+ GiB selects `qwen3.6:35b-a3b`. The inspected catalogue marks those two larger entries' licenses as unverified. Neither is a measured replacement for this report's 4B control.

Historical documents call the intended Mac an **8 GB M2**, but the current assignment says the target hardware is unknown. Treat that historical description as a planning hint, **not verified deployment inventory**. Chip, memory, macOS version and sustained performance remain acceptance prerequisites. No Mac measurements are claimed.

### Existing quality and performance evidence

| Evidence | Result | What it does not establish |
|---|---|---|
| [M10](../eval-reports/2026-08-M10-report.md), tuned 4B corpus | **35.0% fabrication, 21/60 runs**; 20 fixtures × 3; salient fact capture 83.7%; safety fact capture 70.0% | Not 60 independent clinical cases. On the CPU setup repetitions were deterministic; automatic rules miss some semantic errors. Not a current full-corpus rerun after subsequent changes. |
| [Retraction pass, September 6](../eval-reports/2026-09-06-retraction-pass.md) | Fixture 04 clean in 3 runs; projected corpus arithmetic 30.0% (18/60) | **30.0% is not a freshly measured full-corpus result.** Exact quote cutting still had a wrong-topic attachment in one synthetic example. |
| [Inference efficiency, September 8](../eval-reports/2026-09-08-inference-efficiency.md) | Same 4B smoke: 6.4 s cold; 3.6/3.6 s warm; 2,840 prompt and 359 output tokens. After change: 4.0/3.5 s | Report explicitly declines a speedup claim. Tiny timing differences are not evidence of a faster implementation. |
| [Speech/vocabulary, September 20](../eval-reports/2026-09-20-tiny-en-clinical-vocabulary.md) | On one scored 34.7-second synthetic medication script: tiny lead-in WER 14.1%, exact terms 1/7; tiny + six-term vocabulary 6.5%, 3/7; small.en + vocabulary 5.4%, 5/7 | One synthetic voice, seven terms, clean audio; sample 2 lacked retained ground truth. Does not establish a population error rate or the owner's microphone performance. |
| Same September 20 report | tiny final transcription 0.82–1.52 s; small.en about 4.0 s for the 34.7-second clip | Not preview latency, not Mac latency, not a controlled multi-device benchmark. |
| Same September 20 report | Ollama 106 generated tok/s warm GPU versus 13.4 CPU; all 34 reported layers offloaded | Not time-to-first-word or full note latency. GPU throughput does not make the STT process GPU-backed. |
| [Refine background, September 21](../eval-reports/2026-09-21-refine-background.md) | 13 scenarios/17 turns per run; no prior-session phrase reached edited notes in the recorded runs; guards caught attempted leakage | Model alone was not faithful. Questions about prior-session homework were unreliable, including a false statement that no homework was specified. Run 4 differed despite ostensibly deterministic decoding. |

**Clinical priority:** reduce unsupported facts and preserve critical supplied facts together. An empty note can avoid fabrication while failing the task; fluent prose can hide a mistranscribed drug name. JSON validity is necessary but cannot prove either semantic fidelity or correct section routing.

## 2. What the Reddit lead could mean

### Strongest match: Bonsai binary/ternary Qwen derivatives

**[COMMUNITY]** Search surfaced a thread titled “Bonsai (PrismML's 1 bit version of Qwen3 8B 4B 1.7B) …” [S1]. Its wording closely matches the recalled modified, ultra-lightweight Qwen lead. Direct Reddit reads returned a gate, and an old-Reddit JSON attempt redirected to login; the full thread, exact posting date and individual comments were not verified. No community timing is treated as measured evidence.

**[SOURCE]** Independent of that inaccessible thread, PrismML's **March 31, 2026** announcement and whitepaper explicitly identify Bonsai 8B as built from Qwen3-8B [S2–S3]. The 4B card identifies Qwen3-4B architecture [S4]. This establishes that the candidate family exists and is Qwen-derived; it does not prove it was the user's particular thread.

Bonsai keeps the parameter count but compresses weight representation. Q1_0 uses one sign bit plus a shared FP16 scale per 128 weights: **1.125 effective bits/weight**, not one bit for every byte of the complete running system. Norms/scales remain higher precision; KV cache, activations, buffers and application memory are additional. The unpacked FP16 distribution explicitly forfeits the low-memory benefit [S5]. This is not a generic command to turn any installed Qwen into Bonsai.

**[PUBLISHER]** March whitepaper benchmark averages: Qwen3-8B 79.30 versus Bonsai-8B 70.50; Qwen3-4B 77.10 versus Bonsai-4B 62.72; Qwen3-1.7B 66.57 versus Bonsai-1.7B 49.60. That is a real published quality tradeoff, even though the publisher's capability-per-GB metric improves sharply. These averages are not Apunta faithfulness scores.

Speed comparison is equally conditional:

- Bonsai 8B on **M4 Pro 48 GB, llama.cpp Metal**: 85 generated tok/s versus 16 FP16; prompt processing 498 versus 490 tok/s.
- Same hardware through **MLX**: 131 generated tok/s, a different runtime row—not a conflicting universal Bonsai speed.
- Bonsai 4B on **M4 Pro 48 GB, Metal**: 136 generated tok/s versus 29 FP16; prompt processing 915 versus 915 tok/s.
- RTX 4090 figures are CUDA, not this AMD machine. A laptop GPU's particularly large ratio partly reflects the FP16 control not fitting entirely in VRAM.

These are publisher `tg128`/`pp512` microbenchmarks. They do **not** mean “5× faster Apunta,” especially for 4K–12K-token input contexts where prefill dominates. The appropriate control is Apunta's already-quantized **Qwen3.5 4B Q4_K_M**, not older Qwen3 FP16.

The whitepaper describes its evaluation methodology, including an external Gemini answer-extraction fallback on some benchmarks. That is a property of the published evidence, **not an acceptable Apunta evaluation dependency**. Reproduce relevant behavior with local deterministic scoring and human review only.

### Other plausible leads, lower confidence

- **Native small Qwen3/Qwen3.5:** 0.6B/1.7B discussions and the Qwen3.5 0.8B/2B release are genuinely small-parameter models, rather than compressed versions of Apunta's exact checkpoint. Current official 2B metadata was last modified March 2, 2026; revision `15852e8c16360a2fea060d615a32b45270f8a8fc` [S8].
- **REAP expert pruning:** an indexed March 4 Qwen3.5-18B-REAP-A3B-Coding thread [S12] fits “modified,” but is not ultra-small in resident weights. Its searched GGUF card endpoint returned 404 here. A separately available `atbender/Qwen3.5-REAP-20B-A3B` card exposes its calibration recipe and expressly says **not benchmarked**, no post-pruning fine-tuning and expected tail-task degradation [S13]. It is not the same artifact as the Reddit model.
- **DeepSeek-R1-Distill-Qwen-1.5B:** a genuine distilled model based on Qwen2.5-Math-1.5B, documented by DeepSeek [S14]. Plausible if the remembered term was “distilled,” but reasoning/math evidence is not clinical rewriting evidence.
- **Extreme quantization, vocabulary pruning, or “uncensored” fine-tunes:** names alone are insufficient. Quantization changes representation; pruning removes capacity; fine-tuning changes behavior; removing refusal directions is not evidence of better fact preservation. Do not select a coding-only or abliterated checkpoint merely because a Reddit title says it is small or accurate.

A link, screenshot, approximate date or the word “Bonsai” from the user would settle the remembered identity. Research and safe planning do not need to wait for that confirmation.

## 3. Ranked LLM candidate shortlist

Ranking is **experiment priority for Apunta**, not a leaderboard. All candidate quality and latency against Apunta are unmeasured unless a row says otherwise. Disk sizes below are publisher/registry values, generally decimal GB; they are **not total RAM requirements**.

| Rank | Exact identity / license | Weight/context evidence | Decision and risk |
|---|---|---|---|
| Control | `qwen3.5:4b-q4_K_M`, Qwen/Qwen3.5-4B; Apache-2.0 | 3.4 GB listing; 262,144 advertised native context; app uses 16,384 [S7–S9] | Keep. Hybrid backbone: 24 Gated DeltaNet and 8 full-attention layers, not a tiny MoE just because family marketing mentions experts. Existing clinical errors remain the bar to improve. |
| 1 | `qwen3.5:2b-q4_K_M`; Apache-2.0 | **1.9 GB**, listing digest prefix `124a03c34777`; 262,144 native [S8–S9] | Simplest smaller GGUF arm in current Ollama API. About 44% smaller listed payload than 3.4 GB control; speed is not established. High risk of omissions/routing failures. |
| 2 | `prism-ml/Bonsai-8B-gguf`, `Bonsai-8B-Q1_0.gguf`; Apache-2.0 | ~1.15 GB parameter package, card rounds file to 1.16 GB; 65,536 configured context with YaRN, original 16,384 [S3,S6,S10] | Best direct test of remembered compression idea. More parameters but fewer weight bytes. Larger full-attention KV cache can erode the saving. Need compatible Q1_0 backend, schema parity, template and stop-token checks. |
| 3 | `prism-ml/Bonsai-4B-gguf`, `Bonsai-4B-Q1_0.gguf`; Apache-2.0, license text inspected | ~0.57 GB; 32,768 configured context, original 8,192 with YaRN [S4,S10] | Attractive footprint, weaker published average than original Qwen3-4B. Apunta's 16K window crosses its original context range; include long-context fidelity checks, not just short prompts. |
| 4 | `qwen3.5:4b-q8_0`; Apache-2.0 | 5.3 GB, digest prefix `8722f47c2791`; same advertised context [S9] | Diagnostic quality control: distinguish quantization effects from intrinsic 4B/prompt limitations. **Not lighter.** Greater bandwidth/memory cost; quality improvement is unproven. Linux experiment before constrained Mac consideration. |
| 5 | `qwen3.5:9b-q4_K_M`; Apache-2.0 | 6.6 GB, digest prefix `6488c96fa5fa`; 262K advertised [S7,S9] | Quality-ceiling comparator if memory permits. **Not a compact-device recommendation.** Better generic publisher scores do not prove less clinical invention. |
| Reserve | `Qwen/Qwen3-4B-Instruct-2507`; Apache-2.0 | 4B, native 262K, non-thinking-only [S11]; deployment quantization not selected/pinned here | Useful text-only architecture/control candidate. No reason to presume faster overall: full-attention cache differs from Qwen3.5. No invented Ollama tag or payload size is proposed. |
| Defer | `qwen3.5:0.8b-q8_0`, Apache-2.0; `prism-ml/Bonsai-1.7B-gguf`, Apache-2.0 | ~1.0 GB Qwen listing; Bonsai ~0.25 GB with 32K configured/8K original context [S8–S9,S15] | Footprint wins plausible; clinical capacity inadequate until proved otherwise. Consider bounded helper tasks only after validating false-negative/false-cut behavior; retraction extraction is not harmless classification. |
| Defer | `deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B`; MIT release, Qwen2.5 base provenance disclosed | 1.5B reasoning checkpoint [S14]; no selected GGUF or measured RAM here | Long reasoning output can negate weight savings. No clinical evidence, different prompting/decoding recommendations; not a first draft/refine replacement. |
| Defer | `atbender/Qwen3.5-REAP-20B-A3B`; Apache-2.0 card | ~20B retained, ~3B active/token; card ~35 GB BF16 disk, ~40 GB VRAM expectation [S13] | A3B means active compute, **not 3B resident weight size**. Larger than the control even after substantial pruning. Calibration bias and unmeasured tail-task losses disqualify it as the conservative first experiment. |

### Current Bonsai families are not interchangeable

The latest inspected demo documentation distinguishes original binary Bonsai, original ternary Bonsai and **Bonsai 2 27B**, not one stable “Bonsai” artifact [S16–S18].

- Original `Ternary-Bonsai-8B-gguf`: card describes ~2.18 GB group-128 packing, 65K context, Apache-2.0. It is an intermediate precision/size candidate, not proof that 1.58 information bits mean 1.58 stored bits. Its documented group-128 packing costs 2.125 bits/weight.
- **Compatibility trap:** the old ternary card says `Q2_0` needs a fork. Current demo says group-64 upstream `Q2_0` works on supported mainline backends, `PQ2_0` uses a different packing, and legacy group-128 files named `Q2_0` require older binaries. File basename and runtime revision must be pinned together; never select by “Q2” alone.
- `prism-ml/Ternary-Bonsai-2-27B-gguf` is Qwen3.8-27B-derived, Apache-2.0, with **5.95 GB PTQ1_0** or **7.21 GB PQ2_0** language weights, optional vision projector, and ~262K context. Its publisher's “98.2% intelligence retained” is an aggregate benchmark construct, not preservation of 98.2% of clinical facts.
- Bonsai 2 requires runtime Hadamard/sign-flip transforms. Current backend document pins its audit to **`prism-b10709-9a9394a`**. Some stock runtimes can load a Q2_0 file yet produce gibberish because transforms are absent. The publisher marks HIP support as source-level implementation needing device validation.

**Do not run the generic Bonsai setup script as a quick probe.** Current default downloads a 27B model plus optional UI/interpreter dependencies. It would violate this task's no-download/no-runtime-change scope and is unnecessary for the first experiment. A llama.cpp OpenAI-compatible server also is not a drop-in replacement for Apunta's Ollama-native `/api/chat` provider.

### Weight savings versus running memory

**[INFERENCE, calculated]** For a conventional full-attention model, one-sequence KV storage is approximately:

`2 × layers × KV_heads × head_dim × context_tokens × bytes_per_element`.

The inspected Bonsai 4B and 8B configs both have 36 layers, 8 KV heads and head dimension 128. At 16,384 tokens, F16 K+V alone is **2.25 GiB**; an idealized 8-bit representation is **1.125 GiB before block metadata/alignment**. Thus a 0.57 GB weight file emphatically does not mean a 0.57 GB running model.

Qwen3.5-4B's card has only 8 full-attention layers, 4 KV heads and head dimension 256. The corresponding full-attention F16 component at 16K is **0.50 GiB**, or idealized 8-bit **0.25 GiB**, **plus Gated DeltaNet recurrent state**, buffers and runtime overhead. These calculations are not measured RSS/VRAM and cannot be used as fit guarantees. They explain why Bonsai's download reduction can exceed its total-memory reduction relative to the current hybrid model.

## 4. Runtime, context and prompt optimizations

| Lever | Expected benefit and evidence | Constraint / recommendation |
|---|---|---|
| Correct GPU offload | [LOCAL] 106 versus 13.4 tok/s in September 20 report | Already achieved for the LLM on that install. Confirm at a coordinated measurement, do not claim it as a new gain. Whisper's backend is separate. |
| Flash Attention + Q8 KV | [SOURCE/PUBLISHER] Ollama documents reduced attention memory and approximately half F16 KV memory [S19] | Already configured for bundled runtime. Verify actual backend honors it, especially hybrid recurrent state. Q4 KV saves more but carries larger precision risk at long context. |
| Operation-specific context | [INFERENCE] 8K for genuinely short prompts can reduce allocated cache/buffer pressure | Never discard transcript, safety facts or prior notes to manufacture speed. Reserve output/headroom and reject overflow. The 4B's hybrid architecture makes gains smaller than a full-attention formula suggests. |
| Stable prefix reuse | [SOURCE] Refine background is already before mutable note text | Can reduce repeated prefill; not guaranteed across eviction, model changes or concurrent requests. Measure reused versus evaluated tokens. Do not persist patient KV caches to disk as a casual optimization. |
| Warm residency | [LOCAL/SOURCE] Cold loads matter; current provider already uses 30m | Longer residency trades memory/energy against fewer cold loads. Do not set permanent residency blindly on a small shared-memory Mac. |
| Single-request scheduling | [SOURCE] Ollama context allocation increases with parallel request count [S19] | One therapist does not need throughput-oriented batching at the expense of caption responsiveness or peak memory. Measure concurrency only after isolated controls. |
| Shorter inputs | [INFERENCE] Lower prefill cost | Deleting duplicated boilerplate may coexist with quality, but instruction compression is behavioral change. M10 showed apparently sensible distilled instructions initially made fabrication worse. Preserve examples/rules until paired corpus evidence supports removal. |
| Smaller output ceilings | Already implemented for helpers | Keep `done_reason=length` rejection. Do not count truncated output as faster successful work. Note/refine 3,072 is a ceiling, not guaranteed computation. |
| Non-thinking generation | Already the normal provider contract | Reasoning models can be smaller on disk yet slower and more inferential in output. Judge latency at the same usable result, not just tokens/sec. |
| Speculative decoding / MTP | [PUBLISHER] Exact speculative sampling can preserve the target distribution [S20]; Qwen3.5 cards mention MTP training | More memory/compute for draft verification, acceptance-rate dependent, backend/schema dependent. MTP in a model card does not prove support in installed Ollama. Not the first optimization for a fast 4B or short responses. |
| Lower-bit weights / pruning | Smaller disk and potentially less decode bandwidth | Numerical/capacity changes can hurt rare words, negation, instruction following and long-context attribution. QuIP# shows credible low-bit methods exist [S21], not that arbitrary Qwen Q2 conversion is safe. |
| Section-at-a-time drafting | Could improve local section compliance | More calls/prefill, duplicated or inconsistent facts across sections, and retraction handling across calls. Re-evaluate the old proposal now that the retraction pass exists. Not an efficiency free win. |

### Runtime choice and stale compatibility assumptions

Ollama and upstream llama.cpp are MIT-licensed [S22]. Keeping Ollama/GGUF minimizes integration changes and preserves Apunta's current schema/stream/error contract. Direct llama.cpp is useful for isolated runtime benchmarking; replacing the provider is a separate implementation packet. MLX is an Apple-specific alternative, not an AMD backend; vLLM/SGLang deployment throughput is not automatically useful for a single-user laptop.

**A researched correction:** source comments say Ollama issue **#16563**, “Structured outputs appear to be ignored for MLX models,” is still open. The public issue API says **closed August 26, 2026** [S23]. Its inspected comments discuss both absent constrained sampling and a proposed fail-loud response. Closure alone does not prove full schema parity or identify what behavior the deployed version has. Retain Apunta's GGUF guard for now; test streaming/non-streaming schema enforcement, thinking modes, error behavior and all consumers before proposing a separate MLX migration. Do not repeat the stale “open” status as current fact.

## 5. Dictation: smaller is already the baseline

STT accuracy is correspondence to the **audio**. Draft accuracy is correspondence to the **accepted transcript and clinician instructions**. A drafting model cannot safely reconstruct a missing negation, drug name or number by clinical plausibility. A “cleanup” LLM that silently guesses is not an accuracy improvement.

Luna's transient duplicate-dictation investigation is a **UI/state reconciliation issue**, not evidence that Qwen or Whisper became inaccurate. This report makes no diagnosis or change to that code. Spoken retractions are a separate semantic problem with a quote-validated server pass; model-written Discussion subtopics are another separate behavior.

| Speech option | Size/license/backend evidence | Apunta-specific decision |
|---|---|---|
| Keep `ggml-tiny.en.bin` + bounded vocabulary | Current ~75 MiB file; whisper.cpp upstream estimates tiny memory ~273 MB; MIT [S24] | Highest-confidence inexpensive improvement: existing single-script WER 14.1% → 6.5%, terms 1/7 → 3/7. Validate distractor terms and unprompted terms too; prompt bias can introduce words. No live vocabulary update authorized by this research. |
| `ggml-base.en.bin` + vocabulary | Upstream ~142 MiB disk/~388 MB memory, MIT [S24] | Existing one-script result was worse WER than tiny+vocabulary (12.0% versus 6.5%), with the same 3/7 terms. Neither a reason to promote base nor proof tiny is generally better. |
| `ggml-small.en.bin` + vocabulary for final only | ~466 MiB disk/~852 MB memory, MIT [S24] | Existing 5/7 terms and 5.4% WER justify the next quality arm if the owner's usage warrants it. Keep tiny preview if responsiveness matters; two files increase installer footprint. |
| Whisper quantization, e.g. Q5_0 conversion | Supported by whisper.cpp; less disk/memory; hardware-dependent speed [S24] | Test small.en quantized versus unquantized only after approving a larger final-model experiment. Current tiny is already tiny; further compression has limited absolute benefit and possible fidelity cost. |
| `distil-whisper/distil-large-v3` | MIT; 756M parameters; English; publisher reports ~6.3× faster than large-v3 and within one WER point on its long-form evaluation [S25] | A distilled large model, **not lighter than tiny.en or small.en**. Compatible library integrations exist, but clinical benefit and target-machine latency unmeasured. Later quality ceiling, not first choice. |
| `openai/whisper-large-v3-turbo` | MIT; previously used in Apunta as `ggml-large-v3-turbo-q5_0.bin` [S26 and September 8 local report] | A known historical alternative, not today's baseline. Old public JFK GPU numbers contain no clinical terms and cannot validate current tiny or drug-name fidelity. |
| `Qwen/Qwen3-ASR-0.6B` | Apache-2.0 card; Python Transformers/vLLM toolkit, streaming/offline modes [S27] | Not a whisper.cpp drop-in. Card's “2000× throughput” is at concurrency 128, not one dictation's latency. More parameters than tiny; runtime/AMD/Mac portability and clinical terms need independent evidence. Defer until simpler Whisper arms fail. |

### Speech runtime improvements

**Stay with whisper.cpp first.** Its MIT implementation supports CPU, Metal, Core ML, ROCm and Vulkan [S24]. Exact build/device support and numerics must be recorded. September 8's JFK comparison found a large final-path GPU improvement on older models, but September 20 confirms the GPU candidate is absent on this install. Rebuilding/reinstalling it is not authorized by this report and its benefit for tiny may be limited by fixed overhead.

Core ML moves the encoder to Apple's Neural Engine; upstream's “more than 3×” comparison is versus CPU, not already-accelerated Metal, and first-use compilation can be slow. It adds generated artifacts and packaging verification. Treat as a Mac-only experiment after hardware is known, not a promised speedup.

`faster-whisper`/CTranslate2 is credible, but its own reference table demonstrates why “4× faster Whisper” is misleading here [S28]: on the cited CPU small-model workload, whisper.cpp FP32 took 2m05s versus faster-whisper FP32 2m37s; int8 and batching changed the result, with batching using more RAM. GPU measurements use NVIDIA CUDA; that is not an AMD ROCm or Mac Metal result. Replacing the runtime introduces a Python/CTranslate2 distribution and a new transcription/cancellation contract.

Other plausible levers are **unmeasured**:

- Keep model state resident between preview slices to amortize per-process initialization. Benefit trades against resident memory, cancellation/isolation complexity and idle power. Current provider starts child work per transcription; quantify initialization before designing a service.
- VAD can skip silence and reduce hallucinated trailing speech, but aggressive cuts can lose soft words or pauses around negation. Evaluate audio padding, boundary words, retractions and silence-only cases; do not strip arbitrary phrases because one tone produced “Thank you.”
- Preview's fitted context, bounded work and cancellation already exist. Repeating them as proposed gains would double-count shipped improvements. Too-short fitted context previously produced repetition, so reducing it below the audio length is unsafe.

## 6. Linux versus unknown Mac

**Linux development machine:** supplied hardware is Ryzen 7 9800X3D and Navi 48/Radeon RX 9070-family GPU. Recent local reports identify RX 9070 XT and approximately 30 GiB system RAM; these are historical observations, not a new device inventory. Ollama's current hardware documentation lists the RX 9070 family under Linux ROCm support [S29]. No driver changes are proposed. VRAM capacity/free headroom, driver/runtime versions and effective offload must be captured in the future run.

**Mac deployment:** confirm chip, unified RAM, macOS, available storage and whether it is thermally constrained. CPU/GPU share memory with the browser, app and STT; fitting weights alone is insufficient. Use three planning envelopes, not automatic model decisions:

- **8 GB:** prioritize current 4B Q4 and compact candidates; long caches and simultaneous speech/LLM residency matter. No 9B fit guarantee.
- **16 GB:** more room for a quality comparator, but full-context and browser pressure still need a measured gate.
- **24/32+ GB:** larger models can become feasible; they are not necessarily better clinical rewriters or more responsive for this task.

Do not transfer 106 tok/s AMD results or M4 Pro 48 GB publisher results to an unknown Mac. Nor does “75% GPU memory” in historical source comments establish a universal fixed Metal limit. Measure the actual runtime's recommended working set, total memory pressure/swap and sustained performance rather than raising system limits to force a fit.

## 7. Experimental comparison plan

### Isolation and reproducibility

This is a plan, **not a claim that these commands were run**.

1. Coordinate an idle measurement window with the speech/media owners. Separate ports and data directories isolate data, **not the shared CPU/GPU**. Do not consume live Ollama silently.
2. Freeze the source revision and prompt/schema/fixture hashes after concurrent source work lands. The older full-corpus report cannot certify newly edited instructions or Discussion behavior. Preserve the exact baseline and candidate outputs.
3. Use only checked-in synthetic fixtures, locally generated synthetic audio or explicitly authorized fabricated read-aloud scripts. No patient DB, exports or real note text. No external judging, telemetry, demos, cloud models or auto-downloads.
4. Before a new model acquisition, obtain explicit authorization, pin the exact artifact and checksum, inspect its license and dependencies. Installation remains a separate explicit short-lived process; no change to the app's egress guard or allow-list is implied.
5. Record model digest/file SHA-256, tokenizer/template, quantization, runtime commit/version, backend/device, context, cache type, concurrency, sampling, all retries, output stop reason and prompts. Benchmark exact deployed settings before a separately labeled model-tuned arm.

### A. Conservative first experiment: same tiny, bounded vocabulary

Reuse the scored September 20 synthetic script as one control, but retain new generated WAVs, ground-truth script, TTS identity/version and checksums. Add independent fictional scripts for doses/units, risk negations, names, dates, cadence, corrections, quiet speech and pauses. Do not reuse its unscored sample 2 as quantitative ground truth.

Paired arms:

- A0: current tiny + punctuated lead-in.
- A1: same tiny + short relevant synthetic vocabulary.
- A2: same tiny + vocabulary containing plausible but unspoken distractors.

Keep binary, decoding, threads and audio identical; score preview separately from final. Repeat timing, distinguish process-cold from filesystem-warm runs, and randomize/interleave paired order to reduce thermal/cache bias. Later, if authorized, add small.en+vocabulary while keeping preview unchanged.

Record WER with documented normalization, **exact critical entities**, numeric value/unit/frequency, negation and risk status, omitted facts, added speech, retraction markers, phrase boundary loss, first stable preview delay, revision churn, real-time factor, stop-to-final latency and peak memory. No model upgrade is needed for this first test.

### B. LLM runtime-only control

Measure existing 4B at 16K with the full current prompt; retain schema/locks/retraction behavior. Split:

- cold model load;
- warm first-token and first-visible-section latency;
- prompt evaluation count/time;
- decode count/time;
- helper calls and retries;
- total time to a usable note/refine result.

Existing `LlmStats` captures token counts, generation and load duration, but the eval report is not a complete prefill trace. A future isolated runner should capture Ollama's raw prompt-evaluation timing without patient text. Do not infer prefill time by subtracting loosely aligned wall timings.

An optional short-request 8K arm can instantiate `OllamaProvider({numCtx:8192,...})` in a throwaway experiment while keeping identical input content. Require prompt + output allowance + headroom to fit; record/refuse any oversized case. Do not globally reduce the 16K contract, prior-note coverage or Brainstorm's 13,824-token prompt budget. Context switching may reload/reallocate and erase apparent gains; include mixed-operation sessions.

### C. Model comparison using existing instruments

After runtime controls, compare the exact 4B control with 2B Q4. Add Bonsai only once the isolated runtime proves schema and template compatibility. Optional 4B Q8 and 9B Q4 arms answer whether weight precision or model capacity helps; they are not claimed efficiency wins.

1. **`npm run eval`**: all 20 synthetic fixtures × 3 runs, same instructions. Supported flags are `--models`, `--runs`, `--instructions`, `--fixture`, `--out`. The progress override does not replace intake instructions. Explicitly provide the frozen owner progress instruction file; the harness otherwise uses its own defaults.
2. **`npm run check:format`**: real seven-section routing/cadence cases against a disposable Apunta instance configured with the candidate and exact format.
3. **`npm run check:refine`**: all current scenarios, including historical-note leakage, questions-after-edits, fact preservation, explicit bring-over and moves. Report raw model violations and guard interventions separately from final safe note outcomes.
4. **`npm run smoke:live -- --model <exact-tag> --runs 5`**: schema/degeneration and provider behavior before an expensive run. This is not a clinical eval. Use a synthetic speech WAV for STT quality; the tone fixture measures overhead/hallucination behavior, not recognition accuracy.
5. Hand-review generated notes and chat replies against source facts; rubric checks alone miss intention becoming completed intervention, chronology reversal, and false “not in prior notes” replies. Include near-budget contexts and spoken-correction cases, not only short notes.

**Endpoint traps discovered in source inspection:**

- `check:format` and `check:refine` default to live port **7717**. Always set `APUNTA_CHECK_URL` to the disposable instance, and verify its fresh data directory before invoking them; they exercise write paths.
- The eval CLI does **not** pass `APUNTA_OLLAMA_URL` into `runEval`. `runEval` accepts `ollamaUrl` programmatically but otherwise uses the default endpoint. Setting that environment variable alone does not isolate `npm run eval`. A future throwaway runner must call `runEval({ollamaUrl: isolatedUrl,...})`, or the standard CLI requires explicitly coordinated exclusive use of the default model service. No such runner or production change is created here.
- The root eval command builds shared code first. This research task deliberately ran no builds/tests; these commands belong to the later authorized measurement window, not the current report-writing task.
- `runEval` calls the provider, including its retraction pass, but does not exercise all route-level locks/formatting/UI behavior. Thus it cannot replace format/refine/full-path checks.

### D. Proposed acceptance gates

These are conservative **proposed experiment gates**, not pre-existing owner-approved service-level targets:

| Gate | Pass condition |
|---|---|
| Privacy and reproducibility | Local-only inference; no patient content; exact artifact/runtime/fixture identities retained; no unexpected outbound attempt; no runtime auto-acquisition. |
| Transport/schema | Every accepted result parses and meets the expected schema. No silently accepted length truncation, ignored schema, degeneration or lost cancellation. Include adversarial schema requests. |
| Clinical critical facts | **Zero new** fabricated diagnoses/findings, negation reversals, wrong doses/units, retracted facts promoted as current, or prior-session facts entering the current note without explicit request, relative to paired control. Any such case blocks promotion pending adjudication. |
| Omissions | No newly lost safety/medication facts; no worse salient-fact capture on the frozen corpus. Review per-fixture losses even if aggregate score improves. Blank drafts cannot win. |
| Retractions | Preserve corrections and their topic; retain quote validation; reject unsupported cuts. A smaller extraction model must not gain speed by skipping true retractions. |
| Format/refine | No new routing/cadence failures; no question-triggered rewrite; explicit requested edits still work. Guarded outputs and truthful chat replies must both be inspected. |
| Performance | Predeclare a worthwhile margin: e.g. ≥15% median end-to-end latency improvement **or** ≥20% peak inference-memory reduction, with no >10% p95 latency regression. Use enough repetitions for timing (e.g. 10+ per representative class); these numbers are decision thresholds, not claims of statistical significance. |
| Deployment | Repeat on the actual Mac with browser/STT/app present; no sustained swap growth, unacceptable thermal slowdown or preview starvation. Linux pass alone is insufficient. |

Historical 35% fabrication is **not** a safe production threshold to bless merely because a candidate is no worse. Non-regression permits continued experimentation; promotion also requires adjudicating remaining failures and confirming the review workflow is acceptable. Three deterministic copies of 20 fixtures do not establish clinical safety or a population error rate.

## 8. Which improvements can coexist?

**Can plausibly coexist without intentionally discarding information:** effective GPU offload, supported Flash Attention, warm reuse, stable prefixes, cancellation of stale preview work, bounded CPU contention, and better vocabulary on unchanged speech weights. Most are already implemented or partly measured; each needs an honest incremental baseline. Exact speculative decoding can preserve the target distribution in principle but adds implementation and memory costs.

**Explicit tradeoffs:** fewer parameters, lower-bit weights/KV, expert pruning, shorter context, less beam search, more aggressive VAD, and removing instructions/examples. These can improve speed/size while harming uncommon terms, safety-fact recall, long-context attribution or adherence. A larger final STT model can improve fidelity while retaining lightweight preview, but increases total installed size. Bonsai's weight compression can coexist with a stronger parameter count, yet its general benchmark loss and KV footprint prevent an automatic faithfulness or memory win.

**First decisions needed:** authorize the isolated synthetic measurement window; confirm actual Mac hardware; confirm whether Bonsai matches the remembered lead if a link is available; decide whether a later model download/comparison is warranted by measured bottlenecks. No production model switch is recommended by this report.

## Source register

All accessed **2026-09-22**. Model cards and runtime docs are primary evidence of their authors' claims, not independent validation. Reddit search evidence is explicitly discovery-only.

- **S1 — Reddit Bonsai lead**, indexed title, full thread inaccessible: [Bonsai (PrismML's 1 bit version of Qwen3 8B 4B 1.7B)](https://www.reddit.com/r/LocalLLaMA/comments/1sakzu1/bonsai_prismmls_1_bit_version_of_qwen3_8b_4b_17b/).
- **S2 — PrismML announcement, March 31, 2026:** [Announcing 1-bit Bonsai](https://prismml.com/news/bonsai-8b).
- **S3 — PrismML whitepaper, March 31, 2026:** [1-bit Bonsai 8B](https://raw.githubusercontent.com/PrismML-Eng/Bonsai-demo/main/1-bit-bonsai-8b-whitepaper.pdf). Architecture, effective bit width, benchmark degradation, hardware-specific throughput and judging method.
- **S4 — Bonsai 4B model and actual license:** [card](https://huggingface.co/prism-ml/Bonsai-4B-gguf/blob/main/README.md), [Apache-2.0 text](https://huggingface.co/prism-ml/Bonsai-4B-gguf/blob/main/LICENSE).
- **S5 — Unpacked model caveat:** [Bonsai-4B-unpacked](https://huggingface.co/prism-ml/Bonsai-4B-unpacked/blob/main/README.md).
- **S6 — Bonsai 8B model card:** [Bonsai-8B-gguf](https://huggingface.co/prism-ml/Bonsai-8B-gguf/blob/main/README.md).
- **S7 — Official baseline architecture/card:** [Qwen3.5-4B](https://huggingface.co/Qwen/Qwen3.5-4B/blob/main/README.md). Native context, hybrid layout, license and publisher comparison with 9B.
- **S8 — Official smaller-model card and metadata:** [Qwen3.5-2B](https://huggingface.co/Qwen/Qwen3.5-2B/blob/main/README.md), [metadata/revision](https://huggingface.co/api/models/Qwen/Qwen3.5-2B). Non-thinking benchmark settings and intended-use qualification; comparison includes 0.8B.
- **S9 — Exact public Ollama tags:** [qwen3.5 tags](https://ollama.com/library/qwen3.5/tags). Raw HTML was inspected because reader-mode initially returned only an unrelated base-tag summary. Explicit Q4/Q8 names and rounded payload sizes, not installed model inventory.
- **S10 — Bonsai context/cache configurations:** [8B config](https://huggingface.co/prism-ml/Bonsai-8B-unpacked/blob/main/config.json), [4B config](https://huggingface.co/prism-ml/Bonsai-4B-unpacked/blob/main/config.json). Config establishes original YaRN context and cache dimensions; card/config vocabulary counts differ, so actual artifact metadata must be pinned.
- **S11 — Official non-thinking alternative:** [Qwen3-4B-Instruct-2507](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507/blob/main/README.md).
- **S12 — Reddit REAP lead**, search-indexed March 4, 2026, full thread inaccessible: [Qwen3.5-18B-REAP-A3B-Coding](https://www.reddit.com/r/LocalLLaMA/comments/1rk8knf/qwen3518breapa3bcoding_50_expertpruned/).
- **S13 — Reproducible pruning method and a candid derivative:** [Cerebras REAP implementation](https://github.com/CerebrasResearch/reap), [atbender/Qwen3.5-REAP-20B-A3B](https://huggingface.co/atbender/Qwen3.5-REAP-20B-A3B/blob/main/README.md). REAP README records a March 11, 2026 router-normalization correction; checkpoint/calibration revision matters. Method evidence does not validate every derivative.
- **S14 — Distilled Qwen lineage/license:** [DeepSeek-R1-Distill-Qwen-1.5B](https://huggingface.co/deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B/blob/main/README.md).
- **S15 — Smallest Bonsai specification:** [Bonsai 1.7B](https://docs.prismml.com/models/bonsai-1-7b).
- **S16 — Current Bonsai launch and format compatibility:** [demo README](https://github.com/PrismML-Eng/Bonsai-demo/blob/main/README.md), [release-pinned backend matrix](https://github.com/PrismML-Eng/Bonsai-demo/blob/main/BACKEND-SUPPORT.md).
- **S17 — Earlier ternary card:** [Ternary-Bonsai-8B-gguf](https://huggingface.co/prism-ml/Ternary-Bonsai-8B-gguf/blob/main/README.md). Legacy filename advice conflicts with newer demo compatibility guidance; do not execute it without reconciliation.
- **S18 — Current larger hybrid derivative:** [Ternary-Bonsai-2-27B-gguf](https://huggingface.co/prism-ml/Ternary-Bonsai-2-27B-gguf/blob/main/README.md). Publisher claims only, not an Apunta measurement or approval.
- **S19 — Ollama residency, concurrency, KV precision, local-only mode:** [FAQ](https://docs.ollama.com/faq). `OLLAMA_NO_CLOUD=1` is documented defense in depth for a future isolated runtime, not a replacement for Apunta's egress rules. Desktop auto-updates described there also require attention; do not introduce an auto-updating runtime into the product.
- **S20 — Exact speculative decoding, November 30, 2022:** [Leviathan et al., Fast Inference from Transformers via Speculative Decoding](https://arxiv.org/abs/2211.17192). Preserved distribution is an algorithmic property under its assumptions, not a measured Ollama feature here.
- **S21 — Low-bit quantization research, February 6, 2024:** [Tseng et al., QuIP#](https://arxiv.org/abs/2402.04396). Extreme compression uses specific transforms/codebooks/fine-tuning, not a blanket quality guarantee.
- **S22 — Runtime license texts:** [Ollama MIT](https://github.com/ollama/ollama/blob/main/LICENSE), [llama.cpp MIT](https://github.com/ggml-org/llama.cpp/blob/master/LICENSE). Model/fork/dependency licenses remain separate checks.
- **S23 — Ollama MLX structured-output issue:** [#16563](https://github.com/ollama/ollama/issues/16563), [issue metadata](https://api.github.com/repos/ollama/ollama/issues/16563), [comments](https://api.github.com/repos/ollama/ollama/issues/16563/comments). Created June 6; closed August 26, 2026. Closure is not a verified runtime parity test.
- **S24 — whisper.cpp primary documentation:** [README](https://github.com/ggml-org/whisper.cpp/blob/master/README.md). MIT, model memory table, quantization and backend/Core ML support; estimates not Apunta peak RSS.
- **S25 — Distilled speech primary card:** [distil-whisper/distil-large-v3](https://huggingface.co/distil-whisper/distil-large-v3/blob/main/README.md). English, MIT, 756M parameters and publisher long-form comparison.
- **S26 — Whisper turbo card:** [openai/whisper-large-v3-turbo](https://huggingface.co/openai/whisper-large-v3-turbo/blob/main/README.md), MIT and large-v3 lineage.
- **S27 — Qwen ASR card:** [Qwen3-ASR-0.6B](https://huggingface.co/Qwen/Qwen3-ASR-0.6B/blob/main/README.md). Apache-2.0; concurrency-dependent throughput; automatic weight acquisition in examples must not be copied into runtime.
- **S28 — Runtime comparison with explicit hardware:** [faster-whisper README](https://github.com/SYSTRAN/faster-whisper/blob/master/README.md). Reference versions include whisper.cpp 1.7.2/faster-whisper 1.1.0, RTX 3070 Ti CUDA and i7-12700K; not current Apunta hardware/runtime parity.
- **S29 — Current hardware support:** [Ollama GPU documentation](https://docs.ollama.com/gpu). Linux ROCm/Radeon, Metal and Vulkan support; support listing is not a performance measurement.

## Completion and integration handoff

Owned deliverable: `docs/research/local-ai-efficiency-2026-09-22.md` only. No source/model/runtime changes, no live inference, no patient data access, no staging/commit/push. The temporary mistaken dictation assignment caused **read-only inspection only**, with no source edits. No further agents were created for this research.

Suggested HANDOFF text, **not applied**:

> Local-AI efficiency research is recorded in `docs/research/local-ai-efficiency-2026-09-22.md`. Bonsai is the strongest unconfirmed match for the remembered lightweight Qwen Reddit lead. No model was changed or newly benchmarked. Start with an isolated synthetic tiny.en vocabulary comparison and an exact 4B runtime baseline; then compare official Qwen3.5 2B Q4 and, only after runtime/schema checks, Bonsai 8B Q1_0. Public speedups are not Apunta measurements, 30% fabrication remains a projection rather than a full rerun, and the Mac hardware/performance still needs confirmation. The report documents acceptance gates and warns that the eval CLI does not honor APUNTA_OLLAMA_URL automatically. Dictation duplication remains separate UI/state work.

The final integration owner is authorized to include this finished research report in the coordinated commit. No independent commit exists for this work.

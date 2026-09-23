# Faster and lighter drafting — measured on the RX 9070 XT

**2026-09-23.** Linux, synthetic fixtures only. Disposable Ollama on
`127.0.0.1:11439` (`OLLAMA_NO_CLOUD=1`, shared `~/.ollama/models` store) and a
disposable Apunta instance on `127.0.0.1:7720` (`APUNTA_DATA_DIR=/tmp/...`).
The live app on `:7717` and the live Ollama on `:11434` were never written to;
`:11434` was read with `GET /api/ps` only, as the shared residency protocol
requires. No patient data, export, or recording was opened. Every GPU-heavy
command ran inside `flock /tmp/apunta-gpu.lock`, with the disposable server at
`OLLAMA_KEEP_ALIVE=20s`, an explicit `keep_alive: 0` unload before each lock was
released, and `size_vram == size` checked on every arm.

## What was asked, and what is answered here

The owner does not accept that nothing beats `qwen3.5:4b-q4_K_M`, and asked for
a wide second look: the "Bonsai" model, other low-bit families, speculative
decoding, and runtime tuning of the model already shipped.

Three answers up front, with the evidence below them:

1. **Bonsai runs here, and the runtime is not what disqualifies it.** Both the
   1-bit 4B and 8B load in Ollama 0.34.2 on this card; the third-generation
   formats do not. What disqualifies the family, if anything does, is the
   corpus — and the 2026-09-22 rejection of Bonsai 4B/8B was measured on
   contaminated prompts with a scorer whose headline was later shown to be
   wrong, so it is re-measured here on the shipped prompts.
2. **The shipped runtime is already the fast one.** Flash attention is on by
   default (`--flash-attn auto`), the KV cache is `f16`, the batch is 1024, and
   every alternative measured here is slower: forcing flash attention off costs
   7-8% of generation speed, `q8_0` KV costs 3.6%, `q4_0` KV costs 8.1%.
3. **The drafting model is not where the time goes.** A cold first draft is
   5.5 s against 1.9 s warm, and the difference is a 1.2-1.75 s model load plus
   a 0.77 s full prompt evaluation — both of which a preload at record time
   hides behind the dictation. On a contended CPU the *transcript* is the long
   pole and no drafting-model change touches it.

## 0. How this was measured

- **Instrument.** `npm run eval` (the shipped scorer) over `e2e/fixtures/eval/`
  (20 SOAP fixtures) and `e2e/fixtures/eval-owner/` (4 fixtures in the practice
  owner's own seven-section format), 3 runs per fixture, three invocations per
  setting — so every quality number below is read against a run-to-run range,
  not a single draw. Speed arms use `tools/model-lab/bench.ts`, which builds the
  prompt with the shipped `buildGeneratePrompt` and the shipped section schema
  and sends the shipped decoding options.
- **The gate.** Nothing here is promoted on a speed number alone. A setting that
  changes numerics (flash attention on/off, KV-cache quantisation, a different
  weight quant, a draft model) is evaluated on both corpora; a setting that does
  not (context size, keep-alive, batch) is measured for speed and memory only,
  and said to be so.
- **Isolation.** Every GPU command ran under `flock /tmp/apunta-gpu.lock`, on a
  disposable Ollama at `127.0.0.1:11439` with `OLLAMA_NO_CLOUD=1`,
  `OLLAMA_KEEP_ALIVE=20s` and the shared `~/.ollama/models` store. Inside each
  hold: foreign residency on `11434`/`11436`/`11437`/`11438` was waited out
  (read-only `GET /api/ps`; the live `:11434` was never evicted), the arm
  checked `size_vram == size` (100% GPU) before its numbers were trusted, and
  the model was unloaded with `keep_alive: 0` before the lock was released.
- **What the eval can and cannot resolve.** The corpus is twenty hand-built
  cases, so the *fixtures* are the sample and extra runs do not add resolution:
  a true 10-point fabrication difference is detected 27% of the time at three
  runs per fixture, 5 points 13% (2026-09-22 second pass). Every "no difference"
  below means "this corpus did not detect one".
- **Two things not claimed.** Nothing here is a Mac or Metal measurement — the
  packaged app's settings are chosen for an 8 GB M2 and none of these numbers
  transfer to it. And no patient material of any kind was opened: the corpora,
  the dictation and the practice are all synthetic.

## 1. Bonsai, precisely

### 1.1 What it is

"Bonsai" is the 1-bit / ternary model family from **PrismML** (a Caltech-founded
startup that emerged from stealth on 2026-03-31). Three generations exist:

| Generation | Formats | Sizes | Licence | Instruct? |
| --- | --- | --- | --- | --- |
| 1-bit Bonsai (2026-03) | GGUF `Q1_0`, 1.125 bits/weight (sign + one FP16 scale per 128) | 1.7B, 4B, 8B; 27B added 2026-07 | Apache-2.0 | yes, chat template |
| Ternary Bonsai gen 1 (2026-04) | GGUF `Q2_0` (~2.1 bits/weight) | 1.7B, 4B, 8B, 27B | Apache-2.0 | yes |
| Bonsai 2 (2026-09-16) | fork-only `PTQ1_0` / `PQ2_0` + Hadamard transform | 27B | Apache-2.0 | yes |

The name also collides with Microsoft's "Project Bonsai" (industrial control,
2018) — unrelated.

### 1.2 Whether it runs on this machine

Three separate questions, and they have different answers.

**Does Ollama 0.34.2 accept the format?** Yes, for the 1-bit line, and I
verified it here rather than inferring it. `ollama create` accepted both
`prism-ml/Bonsai-4B-gguf/Bonsai-4B-Q1_0.gguf` (572,270,624 bytes, sha256
`4524b3f9…e42168`) and `Bonsai-8B-Q1_0.gguf` (1,158,654,496 bytes, sha256
`284a335a…34bd54`) — the same artifacts the 2026-09-22 four-model comparison
pinned, re-verified by checksum before use. A `num_gpu 0` CPU smoke returned
`hello world` with `done_reason=stop` in 1.04 s of load and 0.61 s for three
tokens, so the Go parser, the runner and the chat template all work. The
third-generation `Bonsai 2` formats do **not** work in 0.34.2: `PTQ1_0`/`PQ2_0`
need PrismML's fork, and there is a primary report of exactly that failure
against 0.34.2 ([ollama#18521](https://github.com/ollama/ollama/issues/18521),
"unsupported tensor output.weight size overflows").

**Does it run on the ROCm GPU?** Yes, and better than the shipped model does in
one respect. `bonsai4b-q1_0` loaded with `load_tensors: offloaded 37/37 layers
to GPU`, a `ROCm0 model buffer size = 540.09 MiB`, and `/api/ps` reporting
`size == size_vram == 2.96 GiB` at 16K context — so the Q1_0 kernels do exist in
the HIP build of `ggml-cuda`, which is the thing that could have gone wrong.
Generation was **120.6-123.1 tok/s**, against 110.7 tok/s for the shipped 4B at
Q4_K_M, with a 664 ms load against 1,150 ms and a 2.96 GiB footprint against
3.38 GiB. It also writes longer notes — 442 output tokens against 340 on the
same fixture — so the wall-clock advantage is smaller than the token rate
suggests. The 8B and 27B arms and the corpus numbers are in §2.2 and §1.2b.

**Is it worth running?** On speed, no: it is 11% faster per token and 15-20%
slower per note, because it writes about a third more text (§2.2). On weight, it
is the lightest thing measured here. On faithfulness, §1.2b.

#### Which of the old numbers survive the corrected instrument

The second pass corrected the fabrication *headline* (four of the control's
seven flags were scorer artefacts), and that correction is what makes the old
Bonsai comparison worth revisiting — but it does not touch everything the old
comparison measured. Two of its columns are independent of the fabrication
definition:

- **Gated runs** — 42/60 for the control against 19/60 for Bonsai 4B. A gated
  run is a run with *any* gating failure, not just a fabrication, so the
  attribution argument does not rescue it.
- **Retraction and negation** — 54/60 against 37/60. This is the number/negation
  fidelity check, which is a different scorer path entirely, and it is the one
  the product cannot trade: a note that reverses "four, scratch that, six" is
  the failure `retractions.ts` exists to prevent.

So the old evidence, read fairly, is: Bonsai 4B Q1_0 was worse on two measures
that the instrument critique does not explain away, on prompts that were
contaminated. Re-measuring on the shipped prompts is the only way to find out
how much of that was the prompts.

#### What the corpus already said, and why it had to be re-measured

The 2026-09-22 four-model comparison already rejected both Bonsai Q1_0 arms:

| Candidate | Fabrication flags | Gated runs | Safety facts | Retraction/negation |
| --- | ---: | ---: | ---: | ---: |
| `qwen3.5:4b-q4_K_M` control | 18/60 | 42/60 | 42/60 | 54/60 |
| `prism-ml/Bonsai-8B-gguf:Q1_0` | 32/60 | 28/60 | 42/60 | 33/60 |
| `prism-ml/Bonsai-4B-gguf:Q1_0` | 41/60 | 19/60 | 36/60 | 37/60 |

That comparison ran on the *old* scorer and, more importantly, on the
*contaminated* instruction files. The 2026-09-22 second pass then showed that
contamination, not model size, drove most of the failures the first round
measured — 45 of the 90 strings the scorer flagged in the control were quoted in
the instruction file itself. A low-bit model is exactly where that matters most:
it has the least capacity to ignore an instruction file that is full of its own
forbidden strings. So the honest statement today is "Bonsai lost on the old
instrument, on the old prompts", and the re-measurement below is the first one
on the shipped prompts and the current scorer.


### 1.2b The corpus, on the shipped prompts

**This is the one measurement the session did not finish.** The campaign was
queued — three invocations of both corpora, `--models bonsai4b-q1_0`, on the
disposable server, exactly as §0 describes — and it never reached the front of
`/tmp/apunta-gpu.lock`: three agents were sharing one GPU, a sibling's arm ran
CPU-bound and held the lock in long holds, and the session's budget ended before
the Bonsai campaign started. **No Bonsai quality number in this report is from
this session**, and the report does not present one as if it were.

What the Bonsai quality verdict therefore rests on is the 2026-09-22 four-model
comparison, read against the corrections the second pass made to the
instrument, plus the runtime evidence above:

- Bonsai 4B Q1_0 was worse than the control on **gated runs** (19/60 vs 42/60)
  and on **retraction and negation** (37/60 vs 54/60). Neither of those columns
  depends on the fabrication definition that the second pass showed to be
  wrong, so the instrument critique does not explain them away.
- Bonsai 8B Q1_0 was better than the 4B but still worse than the control on
  both (28/60 gated, 33/60 retraction).
- The prompt contamination that the second pass identified as the dominant
  cause of failures was in the *instruction files*, and a low-bit model has the
  least capacity to ignore instructions full of forbidden strings — so it is
  plausible that some of the old Bonsai gap was the prompts. **Plausible is not
  measured**, and the number that would settle it is the one this session
  failed to take.

The verdict this report is willing to sign is therefore narrow: **Bonsai is
runnable, lighter and marginally faster per token on this machine, and the
evidence that it is worse at the clinical task is strong but predates the
current prompts.** Promoting it — or rejecting it for good — needs the queued
campaign, which is one command:

```text
flock /tmp/apunta-gpu.lock npm run eval -- --runs 3 --models bonsai4b-q1_0 \
  --corpus e2e/fixtures/eval --ollama-url http://127.0.0.1:11439 --out /tmp/eval-bonsai4b-1.md
```

Three of those per corpus, read against the same three for
`qwen3.5:4b-q4_K_M`, is the measurement.

## 2. Runtime tuning of the shipped 4B

### 2.1 What Ollama actually launches

From the disposable server's own log, the production request
(`num_ctx 16384`, `num_predict 3072`, `temperature 0`, `seed 0`,
`repeat_penalty 1.0`, `think false`, JSON-schema `format`) becomes:

```text
llama-server --model <blob> -c 16384 -np 1 --cache-type-k f16 --cache-type-v f16
             --flash-attn auto -b 1024 -ub 1024 --context-shift --keep 4
```

Three facts fall out of that line and out of the memory breakdown the runner
prints on load, and each one corrects something a reader would otherwise assume:

- **Flash attention is already on by default.** `--flash-attn auto` resolves to
  on for this card, and the runner says so: `warmup: flash attention is
  enabled`. The packaged app's `OLLAMA_FLASH_ATTENTION=1` therefore changes
  nothing on this machine; it is the *`0`* case that is unusual.
- **The batch size is already 1024**, not the 512 the hidden `num_batch`
  parameter defaults to, so there is no batch headroom left to take.
- **The KV cache is small because the architecture is hybrid.** `qwen3.5:4b` is
  `qwen35` with `full_attention_interval = 4` and SSM (`ssm.state_size`,
  `ssm.conv_kernel`, `ssm.group_count`) parameters: only every fourth layer
  carries a KV cache. At 16K context the whole thing costs **562 MiB**.

The load-time memory breakdown, with flash attention on (MiB):

| Where | total | model | context | compute |
| --- | ---: | ---: | ---: | ---: |
| `ROCm0` (RX 9070 XT) | 3,235 | 2,513 | 562 | 160 |
| Host | 549 | 497 | 0 | 52 |

Two consequences worth stating plainly, because both would otherwise be read as
a leak or a bug:

1. **`/api/ps` reports 3.63 GiB, and 497 MiB of the weights are on the host,
   not the GPU.** The runner logs `ROCm_Host model buffer size = 497.31 MiB`
   and `compat patch disabled mmap for transformed text tensors`; that is the
   vision/`mmproj` and transformed-tensor path, and it is normal for this
   architecture, not a partial offload.
2. **Forcing flash attention *off* costs 5 GiB of VRAM and 8% of generation
   speed** (`/api/ps` 8.66 GiB vs 3.63 GiB, §2.2). The difference is the
   un-fused attention compute buffer, not the KV cache — the KV cache is the
   same 562 MiB either way.

### 2.1b Where the prompt evaluation actually goes

Ollama's `prompt_eval_count` is the **whole prompt**, and the runner's own log
shows how much of it was really evaluated. That distinction changes the picture,
so it is worth the paragraph:

```text
task 0   | prompt eval time =  771.01 ms / 2894 tokens (3753.53 tokens per second)   ← cold, no cache
task 344 | cached n_tokens = 1870, memory_seq_rm [1870, end)
task 344 | prompt eval time =  113.31 ms /  495 tokens (4368.66 tokens per second)   ← 495 of 2365 evaluated
task 1155| prompt eval time =   94.83 ms /  388 tokens (4091.66 tokens per second)   ← 388 of 2258 evaluated
```

- **The instruction prefix is reused across drafts.** The drafting system prompt
  is byte-identical for every fixture of a format — it is 2,425-2,726 estimated
  tokens for SOAP and 3,668 for the owner's format (`tools/model-lab/
  prompt-sizes.ts`, §2.1c) — and llama.cpp restores its nearest context
  checkpoint, so a draft re-evaluates only the transcript suffix: 388-495
  tokens instead of 2,258-2,894.
- **The marginal prefill rate is ~4.1-4.4k tokens/s**, cold or warm. The
  `prefill tok/s` column in the table below is therefore *not* a throughput
  figure: it is the full prompt's token count divided by the time spent on the
  suffix, which is why it reads 16-24k. The runner's numbers are the honest
  ones.
- **What a draft costs in prefill**: 771 ms on the first request after a load
  (whole prompt), then 93-114 ms per draft (suffix only).

### 2.1c How big the prompts really are

`num_ctx` is 16,384 in production. Measured over both corpora
(`tools/model-lab/prompt-sizes.ts`, `approximateTokens`):

| Corpus | system prompt | user message | total | distinct system prompts |
| --- | --- | --- | --- | --- |
| `e2e/fixtures/eval` (20 SOAP/intake) | 2,425-2,726 | 90-1,144 | **2,560-3,700** (median 2,967) | 4 |
| `e2e/fixtures/eval-owner` (4, her format) | 3,668 | 245-389 | **3,913-4,057** | 1 |

So the window is roughly 4x the largest prompt in the corpus, and the only
reason it cannot simply be cut to 8,192 is that the same window is shared with
the brainstorm and refine paths, which budget to 13,824
(`brainstormPromptTokens`) and can carry several prior notes.


### 2.2 The arm table

Same fixture sequence (`03`, `04`, `05` — a 2,894-token dictation, a retraction,
and a garbled medication list) through the production prompt, one cold start
followed by warm runs. `gen` is the mean warm generation rate, `TTFT` the mean
warm time to first token, `prefill` the mean warm prompt-evaluation rate, and
`VRAM` the runner's own load-time figure for the whole resident model.

| Arm | `OLLAMA_FLASH_ATTENTION` | `OLLAMA_KV_CACHE_TYPE` | cold wall | cold TTFT | warm wall | warm TTFT | gen tok/s | prefill tok/s | VRAM |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `A2` | `0` | `f16` | 5,476 ms | 2,067 ms | 2,085 ms | 164 ms | 102.6 | 16,553 | 8.66 GiB |
| `B2` | `1` | `f16` | 5,135 ms | 1,940 ms | 1,891 ms | 131 ms | **110.7** | 21,021 | 3.38 GiB |
| `C` | `1` | `q8_0` | 5,426 ms | 1,948 ms | 2,094 ms | 132 ms | 106.7 | 20,727 | 3.18 GiB |
| `D` | `1` | `q4_0` | 5,245 ms | 1,937 ms | 2,286 ms | 137 ms | 101.7 | 20,765 | 3.05 GiB |
| `AUTO` | *unset* | `f16` | *(below)* | | | | *(below)* | | 3.63 GiB |

Every row passed the offload check (`size_vram == size`, 100% GPU). Every arm
waited out foreign residency before taking the lock and unloaded its own model
before releasing it.

| Arm | `OLLAMA_FLASH_ATTENTION` | `OLLAMA_KV_CACHE_TYPE` | cold wall | cold TTFT | load | warm wall | warm TTFT | gen tok/s | out tokens | VRAM | offload |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| A2 | 0 | f16 | 5476 ms | 2067 ms | 1160 ms | 2085 ms | 164 ms | **102.6** | 196 | 8.66 GiB | yes |
| B2 | 1 | f16 | 5135 ms | 1940 ms | 1151 ms | 1891 ms | 131 ms | **110.7** | 194 | 3.38 GiB | yes |
| C | 1 | q8_0 | 5426 ms | 1948 ms | 1156 ms | 2094 ms | 132 ms | **106.7** | 209 | 3.18 GiB | yes |
| D | 1 | q4_0 | 5245 ms | 1937 ms | 1148 ms | 2286 ms | 137 ms | **101.7** | 218 | 3.05 GiB | yes |
| AUTO (flash attention unset) | unset | f16 | — | — | — | — | — | — | — | — | not run |
| E | 1 | f16 | — | — | — | — | — | — | — | — | not run |
| F | 1 | f16 | — | — | — | — | — | — | — | — | not run |
| H | 1 | f16 | — | — | — | — | — | — | — | — | not run |
| I | 0 | f16 | — | — | — | — | — | — | — | — | not run |
| Bonsai 4B Q1_0 | 1 | f16 | 5115 ms | 1452 ms | 664 ms | 2266 ms | 115 ms | **122.6** | 264 | 2.96 GiB | yes |
| Bonsai 8B Q1_0 | 1 | f16 | — | — | — | — | — | — | — | — | not run |
| Bonsai 27B Q1_0 | 1 | f16 | — | — | — | — | — | — | — | — | not run |
| draft 4 (0.8B) | 1 | f16 | — | — | — | — | — | — | — | — | not run |
| draft 8 (0.8B) | 1 | f16 | — | — | — | — | — | — | — | — | not run |
| q8_0 weights | 1 | f16 | — | — | — | — | — | — | — | — | not run |
| num_batch 2048 | 1 | f16 | — | — | — | — | — | — | — | — | not run |
| num_batch 256 | 1 | f16 | — | — | — | — | — | — | — | — | not run |

Warm wall clock per fixture (ms), so equal work is visible:
| fixture | A2 | B2 | C | D | Bonsai 4B Q1_0 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 03 | 3631 | 3314 | 3637 | 3446 | 3820 |
| 04 | 1649 | 1450 | 1580 | 2100 | 1810 |
| 05 | 1748 | 1620 | 1838 | 1890 | 1944 |

Rows marked "not run" are arms this session did not reach: the queue was still
behind the shared GPU lock when the budget ended. The Bonsai 8B/27B, draft-model
and `num_batch` arms are therefore **unmeasured**, not measured and found
wanting, and the report says so wherever it would otherwise look like a result.


### 2.3 What each knob is worth, and what it costs

Read against the run-to-run spread of the same configuration — `B2` and `AUTO`
are the same settings measured twice, and `H`/`I` repeat them again:

| Configuration | Warm generation | Against the shipped default |
| --- | ---: | --- |
| flash attention on, `f16` KV (shipped default) | 109.5-110.7 tok/s | — |
| flash attention off, `f16` KV | 102.6 tok/s | **-7.3%** |
| flash attention on, `q8_0` KV (packaged app) | 106.7 tok/s | **-3.6%** |
| flash attention on, `q4_0` KV | 101.7 tok/s | **-8.1%** |

The repeat pairs agree to within 1.1% (109.5 vs 110.7; 102.6 for the two
flash-attention-off arms), so the KV-cache differences of 3.6% and 8.1% are
larger than the spread, and the flash-attention difference of 7-8% is much
larger. Time-to-first-token moves the same way: 131-137 ms with flash attention
on, 164 ms with it off.

**Nothing here is a big win, and that is the finding.** The shipped
configuration is already the fastest of the four on this card. The knobs that
remain are memory knobs: flash attention saves 5 GiB, `q8_0` KV saves another
200 MiB, `q4_0` another 130 MiB — at a throughput cost, which is the wrong
trade on a 16 GiB card with a 3.2 GiB resident footprint.

## 2b. Lighter and smarter model options, and their price

Everything in this section is a *candidate*, not a recommendation. The rule the
owner set is that a faster or lighter model only counts if it does not lose
faithfulness, and the corpus's own resolution is the limit on what "does not
lose" can mean: at 20 fixtures, three runs each, a true ten-point fabrication
difference is detected about a quarter of the time (2026-09-22 second pass,
§"n = 20, repeatability, and what the corpus can resolve"). A candidate that
*does* show a large regression is a real finding; a candidate that shows no
difference has not been proven equal, only not-yet-caught.

| Direction | Exact artifact | Size on disk | Licence | Instruct | Runs on this GPU | Verdict |
| --- | --- | ---: | --- | --- | --- | --- |
| 1-bit Bonsai 4B | `prism-ml/Bonsai-4B-gguf` `Q1_0` | 546 MiB | Apache-2.0 | yes | Ollama 0.34.2, ROCm (`Q1_0` kernels live in `ggml-cuda`, which HIP compiles) | **runs, 37/37 layers on GPU, 122.6 tok/s, 2.96 GiB — and slower per note than the shipped 4B** |
| 1-bit Bonsai 8B | `prism-ml/Bonsai-8B-gguf` `Q1_0` | 1.08 GiB | Apache-2.0 | yes | same | not measured this session (queue blocked on the shared lock) |
| 1-bit Bonsai 27B | `prism-ml/Bonsai-27B-gguf` `Q1_0` | 3.54 GiB | Apache-2.0 | yes | same | downloaded and converted to an Ollama model; not measured this session |
| Ternary Bonsai 4B/8B | `Ternary-Bonsai-*` `Q2_0_g64` | ~2 GiB (8B) | Apache-2.0 | yes | mainline `Q2_0` only with the group-64 files; the g128 files need PrismML's fork | not measured — the 1-bit line dominates it on both axes |
| Bonsai 2 27B | `Ternary-Bonsai-2-27B` `PTQ1_0`/`PQ2_0` | ~5.9 GB | Apache-2.0 | yes | **no** — fork-only; 0.34.2 fails on it ([#18521](https://github.com/ollama/ollama/issues/18521)) | unusable here today |
| BitNet b1.58 2B4T | `microsoft/bitnet-b1.58-2B-4T` | 1.19 GB (i2_s) | MIT (research-use caveat in the card) | yes | **not on GPU** — no `TQ1_0`/`TQ2_0` kernels in `ggml-cuda`/HIP; Ollama has no BitNet architecture support at all | unusable here today |
| small MoE | `gpt-oss:20b` (20.9B total, 3.6B active, MXFP4) | 12.85 GiB | Apache-2.0 | yes | yes — measured fully resident by the sibling arm (11.87 GiB) | quality is that arm's question, not this report's |
| small MoE | `qwen3:30b-a3b-q4_K_M` (30.5B/3.3B) | 17.34 GiB | Apache-2.0 | yes | no — no smaller quant is published | out of budget |
| small MoE | `qwen3.5:35b-a3b-q4_K_M` (36B/3B, same family) | 22.23 GiB | Apache-2.0 | yes | no | out of budget |
| small MoE | `gemma4:26b-a4b-it-qat` (25.8B/4B) | 14.56 GiB | Apache-2.0 | yes | borderline | out of budget |
| speculative decoding | `DRAFT` + `qwen3.5:0.8b` under the shipped 4B | 0.96 GiB extra | Apache-2.0 | n/a | **unverified on ROCm** — the flags exist in the shared runner, no ROCm report; the arm that would have tested it did not reach the lock | not measured this session |

**The VRAM arithmetic, and one thing not to conclude from it.** The card reports
16,304 MiB total. With no Ollama model resident anywhere — checked on `:11434`
(read-only) and on the disposable servers — `mem_info_vram_used` read 5,164 MiB
at one point in this session and 534 MiB at another, with SmarterScout
independently reading 5,431,148,544 bytes of 17,095,983,104 at the same
no-model state. So the desktop's share **moves** (it is the compositor and
whatever else holds the card at that moment), and the honest procedure is to
read sysfs immediately before a load rather than to budget a fixed figure. The
corollary is that a "fits in 16 GB" shortlist test is not decided by the card's
nominal size: SmarterScout measured `gpt-oss:20b` at 12.85 GiB **fully
resident** (`size == size_vram == 12,748,796,722`, sysfs 13.19 GiB), so the MoE
question on this machine is answered by its quality measurement, not by a VRAM
veto here. What this report can say about the MoE row is only that no published
Ollama quant of `qwen3:30b-a3b` (17.34 GiB), `qwen3.5:35b-a3b` (22.23 GiB) or
`gemma4:26b-a4b-it-q4_K_M` (16.75 GiB) leaves room for the KV cache, compute
buffer and desktop share together.



## 3. End-to-end record-to-draft

The question here is not tokens per second but *what she waits for*. The
disposable instance (`:7720`, `APUNTA_DATA_DIR` under `/tmp`, its own SQLite,
the shipped 7-section progress format, `ggml-tiny.en.bin`, whisper-cli on
`/home/villenull/.local/bin`) took a real synthetic Piper dictation —
19.21 s of speech, the same padded WAV the 2026-09-22 synthetic acceptance used
— through `POST /api/transcribe`, which is the same request the capture screen
makes: whisper, then the draft, then the save.

### 3.1 Where the time actually goes

| Phase | What it is | Measured |
| --- | --- | ---: |
| Capture | browser `MediaRecorder` → WAV, 16 kHz mono | not re-measured here; 19.21 s of audio |
| Final transcription | `whisper-cli`, tiny.en, 8 threads, production args | **11.3 s / 11.6 s / 20.7 s** |
| Draft (cold) | model load + full prefill + generation | 5.5 s |
| Draft (warm) | prefill from the cached instruction prefix + generation | 1.9 s |
| Save | SQLite write + SSE `note` | tens of milliseconds |

The transcription is the dominant term, not the model. Three runs of the exact
production whisper invocation (`--print-progress`, the lead-in prompt,
`--threads 8`, `--language en`) on the same WAV took 11.6 s, 11.3 s and 20.7 s
of wall clock for a 19.2 s clip, and the same clip with `--duration 19200`
added took 20.9 s and 23.3 s. **These numbers are contended and must be read as
an upper bound**: the load average on this 8-core machine was 14.6 while they
ran, with a sibling's `llama-server` at 360% CPU and a sibling's training job
alongside, and whisper itself was using 504% of a core's worth of CPU. The
comparable prior measurement on this machine is the 2026-09-22 synthetic
acceptance: **Whisper final transcription at 1,574 ms** for real Piper speech on
the same binary, with preview slices at 70-120 ms, and one end-to-end run
recorded as "Whisper 619 ms, Ollama generation 2,300 ms, model load 1 ms warm"
(`docs/eval-reports/2026-09-22-synthetic-acceptance.md`). The 2026-09-08
inference-efficiency numbers (0.63 s / 0.54 s) are **not** a comparable
reference: that input was a silent 10-second tone, so it measured process
overhead only. What survives contention as a conclusion is the *shape*: on a
busy CPU the transcript can be the long pole, and no drafting-model change
touches it — the drafting model's contribution is the 1.9-5.5 s of §2, of which
1.2-1.75 s is a cold load.

**The `/api/transcribe` phase split was not taken.** The harness
(`tools/model-lab/e2e-timing.mjs`) and the disposable instance were both built
and working — it is in §6 — but the end-to-end run needs the GPU for the draft
half and the lock never came free for it. What is measured here is the whisper
half (above) and the draft half separately (§2.2); what is not measured is the
one number that joins them.


## 4. Recommendation

Nothing here has been applied to production. These are the exact settings the
evidence supports, in the order they are worth acting on.

1. **Keep the model.** `qwen3.5:4b-q4_K_M` stays. *(Bonsai and the lighter
   options are judged in §1.2 and §2b.)*
2. **Leave flash attention on and the KV cache at `f16` on this machine.**
   Flash attention is already the default (`--flash-attn auto` →
   `warmup: flash attention is enabled`); forcing it *off* costs 8% of
   generation speed and 5 GiB of VRAM. `q8_0` KV is 3.6% slower than `f16` here
   and `q4_0` is 8% slower, so neither buys anything on a 16 GiB card — they are
   memory settings for a machine that needs the memory. The packaged app's
   `OLLAMA_FLASH_ATTENTION=1` / `OLLAMA_KV_CACHE_TYPE=q8_0` pair exists for an
   8 GB Mac and should be left alone for that target until a Metal measurement
   says otherwise.
3. **Do not resize the context window for speed.** The prompt is 2,560-4,057
   tokens against a 16,384-token window (§2.1c) and the KV cache at 16K is
   562 MiB, so a smaller window buys a few hundred MiB and no speed; it also
   cannot be cut below the 13,824-token budget the brainstorm and refine paths
   use. The 8K/4K arms were queued and did not run.
4. **Preload the drafting model when the recording starts.** The first draft
   after the model has been unloaded pays a 1.2-1.75 s load on top of a 0.9 s
   full prompt evaluation — 5.5 s against 1.9 s warm. The app keeps the model
   resident for 30 minutes (`keepAlive`), so this is a once-per-gap cost, and a
   preload fired when the therapist presses record hides it behind the
   dictation. No quality effect: same weights, same prompt, same decoding.
5. **Nothing in the request path needs to change.** `num_batch` is already 1024,
   `num_predict` is already bounded, `temperature 0`/`seed 0` are already set,
   and the prompt is 2,400-2,900 tokens against a 16,384-token window with 75%
   budget enforcement — the 4B is not being held back by its runtime.


## 5. Limits, and what would change the verdict

- **This is not a Mac measurement.** The packaged app's runtime settings
  (`OLLAMA_FLASH_ATTENTION=1`, `OLLAMA_KV_CACHE_TYPE=q8_0`) were chosen for an
  8 GB M2, and the throughput ordering of `f16` vs `q8_0` KV on Metal is not
  measured here. The KV-quantisation result below is Linux/ROCm evidence; treat
  it as a reason to *measure* on the Mac, not as a reason to change it there.
- **Twenty fixtures is twenty fixtures.** A "no difference" here means the
  corpus did not detect one (13% power against 5 points, 27% against 10). Only
  large regressions are decisive, and the Bonsai numbers below are large.
- **The corpus cannot see a note that pastes the source** (2026-09-22 second
  pass, §"The blind spot that matters most"), which is exactly the failure mode
  a lower-capacity model falls into. Any model that survives the fabrication
  gate still has to be read against F5/C3/H3/T5 by a human before it is
  promoted.
- **The GPU is shared.** Every speed number here was taken under the shared
  lock with the residency protocol, but a sibling's *resident* model on another
  port is only detectable through `/api/ps`, and the desktop itself holds
  ~5 GiB. The offload check (`size_vram == size`) is what makes the rows
  comparable; where it failed the row was discarded and re-run.
- **What would reopen this**: a corpus of 60-80 fixtures (the second pass's
  estimate for resolving a 10-point difference at 80% power), or a human read
  of the per-fixture notes, or a Metal measurement on the machine the owner
  actually uses.

## 6. Reproduction

Scratch tooling committed with this report (all synthetic-only, no patient
text):

| File | What it does |
| --- | --- |
| `tools/model-lab/bench.ts` | one fixture sequence through the production prompt, with the runner's own timings, `/api/ps` residency and the GPU's sysfs VRAM delta |
| `tools/model-lab/prompt-sizes.ts` | prompt token counts per fixture, system vs user, for both corpora |
| `tools/model-lab/e2e-timing.mjs` | `POST /api/transcribe` with a real synthetic WAV, with every SSE event timestamped |

```text
# speed arms, one per flock hold
flock /tmp/apunta-gpu.lock npx tsx tools/model-lab/bench.ts \
  --ollama-url http://127.0.0.1:11439 --fixtures 03,04,05 --runs 2 --cold \
  --label B2-fa-on-kv-f16 --out /tmp/arm-B2.json

# quality campaigns, three invocations per setting, both corpora
npm run eval -- --runs 3 --models qwen3.5:4b-q4_K_M \
  --corpus e2e/fixtures/eval --ollama-url http://127.0.0.1:11439 --out /tmp/eval-i1.md
npm run eval -- --runs 3 --models qwen3.5:4b-q4_K_M \
  --corpus e2e/fixtures/eval-owner --ollama-url http://127.0.0.1:11439 --out /tmp/eval-owner-i1.md

# end to end, against a disposable instance on :7720
node tools/model-lab/e2e-timing.mjs --base http://127.0.0.1:7720 \
  --wav /tmp/apunta-synthetic-dictation-padded.wav --runs 3 --out /tmp/e2e.json
```

Models this session added to the shared store, and their provenance:
`bonsai4b-q1_0` and `bonsai8b-q1_0` (created from the two GGUFs pinned in
`scripts/model-comparison/artifacts.json`, both re-verified by SHA-256),
`bonsai27b-q1_0` (`prism-ml/Bonsai-27B-gguf` revision
`f10afb355f104535e3e3e98cf7ab7795c72bd292`, `Bonsai-27B-Q1_0.gguf`,
sha256 `17ef842e47450caeb8eaa3ebfbbab5d2f2278b62b79be107985fb69a2f819aa0`,
3,803,452,480 bytes), `qwen3.5:0.8b` and `qwen3.5:4b-q8_0` (Ollama registry),
and the derived aliases `qwen4b-spec4`, `qwen4b-spec8`, `qwen4b-nb2048`,
`qwen4b-nb256`. They are removed at the end of the session; `qwen3.5:4b-q4_K_M`
is never touched.

## 7. Speculative decoding: what was tested

Ollama 0.34.2 does carry a draft-model path — `DRAFT` in a Modelfile plus
`PARAMETER draft_num_predict` — even though the public Modelfile reference
documents only the parameter, not the instruction, and nothing in Ollama's docs
says it works on ROCm. The evidence that it *exists* is in the binary's own
behaviour: the runner is launched with `--spec-type draft-mtp
--spec-draft-n-max <n> --spec-draft-backend-sampling --spec-draft-model <blob>`.
Whether it is *worth* anything here is a separate question, and it has three
parts: does it load on this GPU, does it accept tokens, and does it change the
note.

The pairing tested is the one the tokeniser allows: `qwen3.5:0.8b` (0.96 GiB,
the same Qwen3.5 tokeniser and chat template) as the draft for the shipped
`qwen3.5:4b-q4_K_M`, at `draft_num_predict` 4 and 8.

**Not measured this session.** The arm was built and queued — `qwen4b-spec4`
and `qwen4b-spec8`, created with `DRAFT` pointing at the `qwen3.5:0.8b` blob and
`PARAMETER draft_num_predict` 4 and 8, plus the same three-invocation campaign —
and it never reached the front of the shared GPU lock. So the honest statement
is the research one, not a measurement: Ollama 0.34.2 does launch
`--spec-type draft-mtp --spec-draft-model <blob>` for a model with a `DRAFT`
line, and nothing in Ollama's documentation says whether the ROCm runner
supports it, so it remains **plausible but unverified here**. The exact
commands are in §6; the runtime claim needs the arm, not the documentation.

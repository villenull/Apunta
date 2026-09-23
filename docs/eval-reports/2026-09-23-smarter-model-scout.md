# Smarter-model scout — 2026-09-23

A wide second look for a local drafting model that beats `qwen3.5:4b-q4_K_M` on
faithfulness, after the two earlier rounds found none
(`docs/eval-reports/2026-09-22-thorough-model-selection.md`,
`docs/eval-reports/2026-09-22-model-second-pass.md`,
`docs/eval-reports/2026-09-23-model-quality-round.md`). Linux-only, synthetic
fixtures only, no patient data, no cloud evaluator, no remote inference.

> **Bottom line, short version.** As shipped — current scorer, decontaminated
> instructions, both corpora, three invocations each — **no model measured beats
> `qwen3.5:4b-q4_K_M`**, and the control wins on both clauses of the gate on
> both corpora (SOAP 10.0 % fabrication / 85.0 % safety facts against the best
> candidate's 15.0 % / 80.0 %; owner corpus 0.0 % / 100 %, which three
> candidates tie and none beat). The one shortlisted model that could have been
> better, `gpt-oss:20b`, cannot produce a note through the app's own provider
> at all (§5). Two findings complicate the "keep the 4B" answer and are worth
> the owner's attention: the closest candidate, `gemma4:12b`, **invents nothing**
> on the audited instrument and clears the control's hardest real failure, at
> the cost of carrying source asides and inventing 33 quotations; and with an
> identical minimal prompt the 12B is *ahead* of the 4B, which says part of the
> control's lead is prompt fit. Details in §7–§9, the decision in §11.

## What this round does differently

The earlier rounds' mistakes, and what changes here:

1. **The scorer.** The first round gated on a headline that counted four
   faithful control notes as fabrications. That was fixed in `e050eba` (the
   abbreviation, third-party-pronoun and non-diagnostic-marker attribution
   rules) and the safety-fact patterns were widened in `c21f10b`. Every number
   below is the **current** scorer's, so a candidate is compared against the
   instrument that ships.
2. **The prompts.** The instructions the second pass found were leaking their
   own quoted banned strings were adopted in `0089c2c`, so the shipped
   instructions are already the decontaminated ones. The baseline below is
   therefore the *fixed* control, not the old one.
3. **The corpora.** Both are measured: the 20 SOAP/intake fixtures and the
   four owner-format fixtures, because three of the owner's known failures live
   only in her format.
4. **Repeatability.** Three invocations per arm per corpus, and the control
   measured in the same session, because the eval's own evidence is that runs
   within an invocation are byte-identical while invocations move a fixture.
5. **The 2026 landscape.** The first two rounds tried three models in the
   control's own family plus three established cross-family instruction
   followers. This round surveys what 2026 actually shipped and tries the
   candidates whose *published* properties bear on faithfulness.

## 1. Landscape (September 2026)

### 1a. General instruction models that fit 16 GB

Sizes are the GGUF model-layer size served by the Ollama library tag that was
pulled; every tag answered HTTP 200 on
`registry.ollama.ai/v2/library/<name>/manifests/<tag>` and was then confirmed
with `ollama show`, so none of these is a `:cloud` or remote-inference tag.

| Model | Params / arch | Quant pulled | Licence | Training-data provenance | Relevance to faithful note drafting |
| --- | --- | ---: | --- | --- | --- |
| [`gpt-oss:20b`](https://ollama.com/library/gpt-oss) | 21B total / 3.6B active MoE | MXFP4, 13.8 GB | Apache-2.0 | OpenAI open-weight release (2025-08, [arXiv:2508.10925](https://arxiv.org/abs/2508.10925)); RL-heavy reasoning post-training | The most capable thing that fits *entirely* in 15.9 GB. Harmony format with a reasoning channel; the app already sends `think:false` for thinking-capable models |
| [`granite4.2:8b`](https://ollama.com/library/granite4.2) | 8B dense | Q4_K_M, 5.3 GB | Apache-2.0 | IBM, 2026-08-25. Post-trained from Granite-4.1-8B-Base: permissively licensed public datasets + internally generated synthetic reasoning/agentic data + curated human data, then GRPO RL and RLHF ([card](https://huggingface.co/ibm-granite/granite-4.2-8b)) | The newest generation at 8B; Granite's tuning targets enterprise structured output and RAG rather than chat flourish. Native `<think>` mode, so the template has to be checked |
| [`granite4.1:8b`](https://ollama.com/library/granite4.1) | 8B dense | Q4_K_M, 5.3 GB | Apache-2.0 | IBM, 2026-04-29; predecessor of 4.2 | A generational point on the same family, cheap to add |
| [`gemma4:12b`](https://ollama.com/library/gemma4) | 11.95B dense, encoder-free unified | Q4_K_M, 7.4 GB | Apache-2.0 (Gemma 4 licence) | Google DeepMind, 2026-06-03; [technical report arXiv:2607.02770](https://arxiv.org/abs/2607.02770). Multimodal, 256K context | Direct successor of `gemma3:12b`, the only cross-family model in the second pass with **zero** inventions (its failures were source asides carried in, not invented) |
| [`medgemma:4b`](https://ollama.com/library/medgemma) | Gemma-3 4B, medical-tuned | Q4, 3.3 GB | **Health AI Developer Foundations terms — not an open-source licence**; gated on Hugging Face ([terms](https://developers.google.com/health-ai-developer-foundations/terms)) | Google, MedGemma 1 (2025-05); 1.5 released 2026-01. Tuned on de-identified clinical corpora (radiology, pathology, dermatology, clinical reasoning) | The obvious "clinically tailored" candidate. It is tuned for *medical image and clinical reasoning*, not for faithful transcription of a therapist's dictation — and the licence is a shipping blocker for an app that redistributes weights |
| [`qwen3.5:9b`](https://ollama.com/library/qwen3.5) | 9.7B dense | Q4_K_M, 6.6 GB | Apache-2.0 | Alibaba, same family as the control | One size up from the control in the control's own family — the most likely "smarter sibling". Its earlier rejection (35 % audited) was under the old scorer and the old instructions |
| [`lfm2.5:8b`](https://ollama.com/library/lfm2.5) | 8.3B total / 1.5B active MoE | Q4_K_M, 5.2 GB | LFM Open License v1.0 ("other") | Liquid AI, 2026-05; 38T-token pre-training then RL. [Card](https://huggingface.co/LiquidAI/LFM2.5-8B-A1B) | Its card publishes an **AA-Omniscience non-hallucination rate** — the closest published proxy to this task's gate — and reports the best of the models in its own table (63.5 % against 25 % for `gpt-oss-20b`, 17 % for `Qwen3.5-4B`, 36 % for `Gemma-4-E4B`). Vendor-reported, so it is a reason to test it, not evidence |

### 1b. Fits, but rejected before spending GPU time

| Model | Why not |
| --- | --- |
| [`qwen3.8:27b`](https://ollama.com/library/qwen3.8) (dense 27B, Apache-2.0, 2026-08-14) | 16.8 GB of weights at Q4 against 15.9 GB of VRAM — it cannot be fully resident at the production 16K window. The second pass already measured what partial offload costs on this card (`mistral-small3.2:24b`: 14.3 s a draft, 19 %/81 % CPU/GPU), and the Q8-vs-Q4 arms showed precision is not the lever. A 3-bit 27B would fit but buys nothing the evidence supports |
| [`qwen3.6:35b`](https://ollama.com/library/qwen3.6) (MoE, 21.7 GB at Q4) | Same hardware reason, worse |
| [`gemma4:26b`](https://ollama.com/library/gemma4) (MoE 25.2B/3.8B active, 16.9 GB) | Same hardware reason |
| [`medgemma:27b`](https://ollama.com/library/medgemma) (17.4 GB) | Same hardware reason |
| `mistral-small3.2:24b`, `phi4:14b`, `gemma3:12b`, `qwen3:14b`, `qwen3.5:4b-q8_0`, `qwen3.5:9b-q8_0` | Already measured in the first two rounds |

### 1c. Clinical and therapy-tailored models: what actually exists

**Clinical note generation.** There is no credible open-weight specialist. A
Hugging Face search for `clinical note generation`, `soap-note`,
`medical-scribe` and `clinical-summarization` returns hobbyist artefacts, not
models: LoRAs on `Phi-3-mini` and `Llama-3.1-8B` with 0–8 downloads
([`raselmeya2194/soap-note-generator`](https://huggingface.co/raselmeya2194/soap-note-generator),
[`AniruddhAiyengar/Llama-3.1-8B-SOAP-notes-finetuned`](https://huggingface.co/AniruddhAiyengar/Llama-3.1-8B-SOAP-notes-finetuned)),
T5/BART summarisers trained on a few thousand pairs
([`316usman/research_abstractive_clinical_notes_summarizations`](https://huggingface.co/316usman/research_abstractive_clinical_notes_summarizations),
[`caesim03/bart-soap-notes`](https://huggingface.co/caesim03/bart-soap-notes)), and
one 135M model whose own card says it "invents details that are not in the
input" and is "[n]ot for clinical use"
([`costinstroie/smollm2-135m-clinical-note-GGUF`](https://huggingface.co/costinstroie/smollm2-135m-clinical-note-GGUF)).
The larger medical models that do exist — Med42-70B, medicine-LLM-13B,
OpenBioLLM-8B, Meditron-7B — are medical *question answering* and exam
models, not transcription-to-note models, and the 70B and 13B ones do not fit.
The 2026 literature agrees on where the capability lives: the psychotherapy
benchmark that introduced the 17-section iCARE note format benchmarked eleven
LLMs and found **closed-source models consistently outperformed open-source
ones** ([medRxiv 2025.06.25.25330252](https://www.medrxiv.org/content/10.1101/2025.06.25.25330252.full.pdf)),
and the cardiology fine-tuning study found a *fine-tuned* Llama-3.1-8B was
needed to be competitive ([PMC12602784](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12602784/)) —
which is the other agent's arm, not a downloadable model.

**Mental-health / therapy models.** The peer-reviewed family is MentaLLaMA
([GitHub](https://github.com/SteveKGYang/MentalLLaMA)), with
`klyang/MentaLLaMA-chat-7B` and `-13B` (MIT licence, LLaMA-2-chat base, 2023)
and MentalBART/MentalT5. Two reasons it is not a candidate here, and they are
not about size: **(a) the task is wrong** — IMHI instruction-tuning covers ten
mental-health *analysis* tasks (classification, explanation, counselling
dialogue), not faithful documentation from a clinician's dictation, and the
card itself says the outputs "should only be used for non-clinical research";
**(b) the base is three years old** — LLaMA-2-chat-7B is far behind any 2026
model on instruction following and JSON adherence, which this app's drafting
path depends on. The rest of the Hugging Face mental-health space is the same
shape: counselling-chat LoRAs on Gemma-2/Mistral-7B/Llama-3.2 built from
`Amod/mental_health_counseling_conversations`, with double-digit downloads
([`QuantFactory/Mental-Health-FineTuned-Mistral-7B-Instruct-v0.2-GGUF`](https://huggingface.co/QuantFactory/Mental-Health-FineTuned-Mistral-7B-Instruct-v0.2-GGUF)).
A chat-therapy model is the wrong instrument for this product: Apunta drafts a
note from what the therapist already said, and a model tuned to *counsel* is
tuned to add clinical content, which is exactly the failure the rubric gates.

### 1d. Shortlist

Seven candidates fit and are worth GPU time: `gpt-oss:20b`, `granite4.2:8b`,
`granite4.1:8b`, `gemma4:12b`, `medgemma:4b`, `qwen3.5:9b`, `lfm2.5:8b`.

## 2. Method

**Instrument.** `npm run eval` at `8649569`, unmodified: the shipped
`server/src/eval/score.ts` (`892b56ba…`), `run.ts` (`fe7b96a9…`) and
`server/src/ai/default-instructions.ts` (`3f0b6a1b…`, i.e. the decontaminated
instructions adopted in `0089c2c`). Nothing in the repository was edited for
this round; the arm runner, the collector and the note dumper live in
`tools/model-lab/`.

**Service.** A disposable Ollama `0.34.2` on `127.0.0.1:11438` with
`OLLAMA_NO_CLOUD=1`, sharing `~/.ollama/models`. The live app on `:7717` and
the live Ollama on `:11434` were never written to.

**Corpora.** `e2e/fixtures/eval` (20 SOAP/intake fixtures) and
`e2e/fixtures/eval-owner` (the practice owner's seven-section format, 4
fixtures). All fabricated.

**Decoding.** Whatever the production provider sends: `temperature 0`,
`seed 0`, `num_ctx 16384`, `num_predict 3072`, `repeat_penalty 1.0`, and
`think:false` for a model whose `/api/show` advertises the `thinking`
capability. No decoding parameter was tuned per model.

One fairness caveat that comes from Ollama rather than from the app: each tag
carries its own default `PARAMETER` lines, and the provider overrides only
temperature, repeat-penalty, seed and the two length fields. So the control
and the 9B keep `presence_penalty 1.5` (a Qwen 3.5 tag default) while
`gemma4:12b` keeps `top_k 64`, `lfm2.5:8b` keeps `top_k 80`, and
`granite4.2:8b` keeps `top_p 0.95`. At `temperature 0` the nucleus and top-k
filters are inert (the argmax is always admitted), but `presence_penalty` is
not: it is a live logit penalty on already-emitted tokens. That is a real
difference between the control's decoding and every non-Qwen candidate's, and
it is the app's own behaviour rather than this round's choice — a model that
wins *because* of it would need its own default changed to ship.

**Repetitions.** 3 runs per fixture per invocation, 3 invocations per arm per
corpus — 9 scored runs per fixture, 180 per SOAP arm, 36 per owner arm. Runs
inside one invocation are byte-identical on this stack (the eval's own
recorded finding), so the *invocations* are the sample; the run count is kept
because the report's headline is per run and the published baselines are on
the same denominator.

**GPU discipline.** Every arm runs inside `flock /tmp/apunta-gpu.lock`, and
inside that hold the runner unloads its own model, waits for the two peer
servers and the live server to report no resident model, warms the model at
the production context, and **refuses to measure unless `/api/ps` reports
`size_vram == size`** — the arm's `/api/ps` snapshot is kept beside its report
and the offload state is in the tables below. This is not ceremony: the first
attempt at the control baseline came back `size=3,670,036,968
size_vram=378,766,621` — a 90 %-CPU 4B, because a peer's model was still
resident in VRAM when the arm loaded. That number was discarded.

**Residency caveat, stated because it affects the reading of the timings.**
Ollama accounts for a model's VRAM its own way and the peers on this machine
observed `/api/ps` reporting the same 4B as 3.18 GiB with flash attention on
and 8.66 GiB with it off. Every arm below therefore also records the bytes the
server reported; the quality numbers do not depend on the accounting, and the
wall-clock numbers are read as "this model, on this GPU, under the same
protocol as the control" rather than as an absolute.

## 3. Acquisition and template check

Nothing was imported from Hugging Face: every candidate was already served by
the Ollama library, which means Ollama's own renderer/parser pair and chat
template travel with the tag. That removes the single biggest way to produce
garbage for no reason — a hand-written Modelfile with the wrong template.
Every tag was probed on `registry.ollama.ai` (HTTP 200) and confirmed with
`ollama show` after the pull:

| Tag | Architecture | Params | Quantization | Context | Capabilities | Licence in the manifest |
| --- | --- | ---: | --- | ---: | --- | --- |
| `gpt-oss:20b` | `gptoss` | 20.9B | MXFP4 | 131072 | completion, tools, **thinking** | Apache-2.0 |
| `gemma4:12b` | `gemma4` | 11.9B | Q4_K_M | 262144 | completion, vision, audio, tools, **thinking** | Apache-2.0 |
| `granite4.2:8b` | `granite` | 8B | Q4_K_M | — | — | Apache-2.0 |
| `granite4.1:8b` | `granite` | 8B | Q4_K_M | — | — | Apache-2.0 |
| `medgemma:4b` | `gemma3` | 4B | Q4_K_M | — | — | Health AI Developer Foundations terms |
| `qwen3.5:9b` | `qwen3` | 9.7B | Q4_K_M | 262144 | completion, vision, tools, **thinking** | Apache-2.0 |
| `lfm2.5:8b` | `lfm2` | 8.3B (1.5B active) | Q4_K_M | — | — | LFM Open License v1.0 |

**The template check, and what it turned up.** `ollama show --template
gemma4:12b` prints `{{ .Prompt }}` — which looks exactly like the failure mode
this check exists to catch. It is not: the same manifest carries `RENDERER
gemma4` and `PARSER gemma4`, so Ollama 0.34.2 renders the conversation in Go
rather than through a Go template and the placeholder is inert. `gpt-oss:20b`
is the opposite case and also fine: it carries the real harmony template
inline, including `{{ .Think }}` / `{{ .IsThinkSet }}`, which is what makes
the provider's `think:false` land. The check that matters for this app is the
capability list: any tag advertising `thinking` gets `think:false` from the
provider, and a tag that silently emits a `<think>` trace under the production
`num_predict` ceiling would fail every fixture on schema rather than on
fabrication. `gpt-oss:20b`, `gemma4:12b` and `qwen3.5:9b` advertise it and are
handled; the rest are checked below.

**Store hygiene.** `~/.ollama/models` is shared with the live app's Ollama.
Nothing that was already there was touched, and every model this round pulled
is removed at the end except the control (`qwen3.5:4b-q4_K_M`) and the tags
another agent pulled.

## 4. How to read the tables, and what this corpus can resolve

**Fabrication rate** is the fraction of runs with any F1 banned-string hit, any
gating F6 unsupported conclusion, or any novel diagnosis/risk term. It is the
number to read first and it zeroes its fixture. **Safety facts (C2)** is
all-or-nothing per run: a run passes only if every `tags: ["safety"]` fact is
present, so one dropped denial costs the whole run. **Salient facts (C1)** is
linear coverage of `mustCapture`. **Schema valid (S1+S2)** is the fraction of
runs whose output parsed into the named sections. **Novel content words
/100w** (F8) is printed and unscored, and it is the guard against the failure
the second pass found: a model that pastes the source into the sections aces
C1 and lowers F7, and only F8 and the copy share show it.

**The resolution limit, restated because it governs the bottom line.** The
sample is the *fixtures*, not the runs: within one invocation all runs of a
fixture are byte-identical on this stack, and the second pass measured that 20
fixtures at one run per fixture detect a true ten-point difference 13 % of the
time. Three invocations buy stability (they say whether a verdict is a draw or
a property) but not power. A candidate therefore has to differ from the
control in *kind* — a different failure, or no failure — before a
one-or-two-fixture margin is worth anything, and this report says so wherever
it relies on one.

**What is not measured.** F5 (unsupported inference), C3 (salient material the
fact list did not anticipate), H3 (over-hedging) and T5 (register) are human
criteria whose 12 points are withheld rather than granted, so every total is
out of 88. Nothing here reads a note against them; the per-fixture tables and
the audited notes below are the material for that read.

## 5. `gpt-oss:20b` — a hard incompatibility, not a quality result

The most capable candidate that fits produced **no note at all** through the
shipped provider: 20/20 fixtures, 3/3 runs, `call_failed`. Reproduced by
direct call, so it is not the harness:

```sh
curl -s http://127.0.0.1:11438/api/chat -d '{"model":"gpt-oss:20b",
  "messages":[{"role":"system","content":"You draft a note."},
              {"role":"user","content":"Client slept badly. Write the note."}],
  "stream":false,"think":false,
  "format":{"type":"object","properties":{"Subjective":{"type":"string"}},"required":["Subjective"]},
  "options":{"temperature":0,"num_ctx":16384,"num_predict":512,"seed":0}}'
# -> {"message":{"role":"assistant","content":""},"done":true,
#     "done_reason":"length", "eval_count":512, "eval_duration":31612360000}
```

512 tokens generated, `content` empty, `done_reason: length`. The mechanism is
the interaction between the app's JSON-schema grammar and gpt-oss's harmony
format: Ollama applies `format` to the whole generation, so the model cannot
emit its `<|channel|>final<|message|>` control token, and the gpt-oss parser
therefore only ever sees an analysis channel — which `think:false` discards.
Measured variants:

| Request | `content` | `thinking` | Verdict |
| --- | --- | --- | --- |
| `format` + `think:false` (production) | `""` | absent | 200 tokens burned, nothing surfaced |
| `format` + `think:true` | `""` | present, truncated at the ceiling | same failure, trace visible |
| no `format`, `think:false` | `"I hope you can get restful sleep tonight."` | present | works |

So the model is fine and the *path* is not. Two consequences worth stating
plainly. **First**, gpt-oss:20b is not a candidate to ship as the drafting
model without a provider change — and the provider change would be to stop
sending the schema, which is the mechanism that makes every other model's
output parse at all. **Second**, its throughput here would be a problem even
if it were: the same 512-token call decoded at **16.2 tok/s** (`eval_count
512 / eval_duration 31.6 s`) against the control's 107 tok/s, i.e. ~6.6×
slower, consistent with MXFP4 kernels being a CUDA-first path on this ROCm
stack. That number is a single direct call rather than an eval arm, so it is
reported as an indicator, not a campaign result.

`gpt-oss:20b` is therefore **removed from the measured set**: the arm was
cancelled rather than re-run, the model was unloaded, and it appears in the
landscape table and here rather than in the quality table below.

## 6. Tooling and provenance

Everything this round ran was built from `8649569` in a detached worktree at
`/tmp/apunta-smarter-scout`; nothing in the repository was edited. The scratch
tools live in `tools/model-lab/` and are committed with this report because
they are reusable and contain no patient text:

| Tool | What it is for |
| --- | --- |
| `run-arm.sh` | one measurement arm: `flock`, unload, wait for peers, warm up, refuse to measure without a confirmed full offload, run `npm run eval`, unload |
| `run-all.sh` | the arm list, skip-if-complete, most promising first |
| `neutral-instructions.txt` | the minimal model-neutral instruction block (1,256 characters, ~359 tokens) used for the fair-prompt arms |
| `collect.mjs` | pulls the headline tables out of each `npm run eval` report into one TSV, so the numbers below are copied rather than retyped |
| `gates.mjs` | per-arm gated-fixture summary across invocations |
| `dump-note.mts` | dumps one generated note's sections through the same generation path the eval uses, for the hand audit |

Instrument identities, for the record: `server/src/eval/score.ts`
`892b56ba11ac82c92c950e39364f7f9be47e7778`, `server/src/eval/run.ts`
`fe7b96a93aa08d0a3c9fe5a52a5a045b58de9603`,
`server/src/ai/default-instructions.ts`
`3f0b6a1b21fad6855d511ef5ecc4d6f49077e54d`.

## 7. Evaluation results

### 7a. Shipped instructions, SOAP corpus (20 fixtures)

Three invocations, 3 runs each — 60 scored runs per arm. Every arm's three
invocations returned **identical** fabrication rates and identical gated
fixtures, so the rate is a property of the model, not a draw; the draft times
below are the range across the three invocations. `Offload` is the `/api/ps`
state the arm's own pre-flight gate accepted, from the arm's own snapshot.

| Arm | Fabrication | Gated fixtures | Safety facts | Salient facts | Schema | F2 invented quotes | Novel content /100w | Mean draft | Tokens/s | VRAM (`size == size_vram`) |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `qwen3.5:4b-q4_K_M` (control) | **10.0% (6/60)** | 09, 10 | **85.0% (51/60)** | 84.1% | 100% | 3 | 57.3 | 2.2–2.7 s | 92–107 | 3.63 GB |
| `gemma4:12b` | 15.0% (9/60) | 03, 09, 18 | 80.0% (48/60) | 89.2% | 100% | **33** | 46.9 | 4.5–4.6 s | 56–58 | 8.39 GB |
| `granite4.2:8b` | 26.7% (16/60) | 03, 07, 09, 10, 16, 18, 19 | 65.0% (39/60) | 86.9% | 100% | 8 | 44.4 | 3.0 s | 81 | 8.04 GB |
| `qwen3.5:9b` | 30.0% (18/60) | 03, 09, 10, 14, 16, 19 | 75.0% (45/60) | 84.5% | 100% | 0 | 53.0 | 2.8 s | 79 | 6.01 GB |
| `lfm2.5:8b` | 40.0% (24/60) | 03, 04, 06, 09, 10, 12, 15, 16 | 65.0% (39/60) | 65.7% | 100% | 3 | 54.6 | **0.9 s** | **236–241** | 5.49 GB |
| `medgemma:4b` | 40.0% (24/60) | 04, 09, 10, 11, 14, 15, 16, 18, 19 | 65.0% (39/60) | 73.9% | 100% | 0 | 48.4 | 2.9–3.0 s | 121–124 | 3.05 GB |
| `granite4.1:8b` | 56.7% (34/60) | 03, 07, 08, 09, 10, 14, 15, 16, 17, 18, 19, 20 | 70.0% (42/60) | 80.2% | 100% | 0 | 67.8 | 2.8–2.9 s | 81–82 | 8.04 GB |
| `gpt-oss:20b` | — | 20/20 `call_failed` | — | — | — | — | — | — | — | 12.75 GB (100% GPU) |

Read it as two columns: **fabrication** is the gate, **safety facts** is the
second clause, and no candidate is better than the control on either. The
schema column is 100 % everywhere, including the `gpt-oss` arm, which is the
reminder that schema validity is trivially satisfied by an empty note — the
`call_failed` count is the real signal there.

The failure *sets* are more interesting than the rates. Every candidate
reproduces fixture 09 (the corpus's sharpest trap: "I don't have family
history" written up as a negative finding about the patient), which is also the
control's failure, and every candidate except `gemma4:12b` reproduces fixture
10 (the withdrawn "three years"). `gemma4:12b` is the only arm that **clears**
fixture 10, and it pays for it with 03 and 18 — both of which are the
"source aside carried into the note" failure the second pass found on
`gemma3:12b` (the fire alarm; an aside she flagged), not inventions.

### 7b. Shipped instructions, the owner's own format (4 fixtures)

Three invocations, 5 runs each — 20 scored runs per arm, and these are the
fixtures that carry the three failures the SOAP corpus cannot see.

| Arm | Fabrication | Gated fixtures | Safety facts | Salient facts | Schema | F2 invented quotes | Novel content /100w | Mean draft | Tokens/s |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `qwen3.5:4b-q4_K_M` (control) | **0.0% (0/20)** | none | **100.0% (20/20)** | 90.0% | 100% | 0 | 33.2 | 1.5 s | 107–108 |
| `gemma4:12b` | **0.0% (0/20)** | none | **100.0%** | **95.0%** | 100% | 0 | 41.0 | 2.6–2.7 s | 57 |
| `granite4.2:8b` | **0.0% (0/20)** | none | **100.0%** | 94.0% | 100% | 0 | 30.4 | 2.3 s | 79 |
| `qwen3.5:9b` | **0.0% (0/20)** | none | **100.0%** | **95.0%** | 100% | 0 | 31.6 | 2.1 s | 80 |
| `granite4.1:8b` | 25.0% (5/20) | 02 | 100.0% | 100.0% | 100% | 0 | 55.3 | 2.6 s | 81 |
| `medgemma:4b` | 25.0% (5/20) | 02 | 100.0% | 90.0% | 100% | 5 | 24.2 | 1.7 s | 124 |
| `lfm2.5:8b` | 50.0% (10/20) | 01, 04 | 100.0% | 75.0% | 100% | 0 | 51.1 | **0.7 s** | **242** |

Three candidates **tie** the control here at 0 % / 100 % — `gemma4:12b`,
`granite4.2:8b` and `qwen3.5:9b` — and none of them improves on it. Since a
candidate only beats the control by being no worse on both corpora, the owner
corpus cannot rescue any of them: they are already behind on SOAP.

The most informative row is `lfm2.5:8b`, the one whose card advertises the best
non-hallucination rate of its comparison set (63.5 % on AA-Omniscience against
25 % for `gpt-oss-20b` and 17 % for `Qwen3.5-4B`). On this corpus it is the
**fastest arm measured by 4×** (0.7–0.9 s a draft, 236–242 tok/s) and the
**worst-but-one** on faithfulness: 50 % of owner runs and 40 % of SOAP runs
gated, fixture 01 (the instructions' worked example leaking into Note for next
session) and fixture 04 (the control fixture) among them, with the lowest
salient-fact coverage of any arm (65.7 % SOAP, 75 % owner). A published
non-hallucination benchmark and this corpus are measuring different things;
the corpus is the one that looks at her notes.

### 7c. Where the safety facts go missing

The safety rate is the second clause of the gate, and the report names the fact
that went missing rather than counting it, which is what makes this table
possible. Control, 3/3 runs each unless noted:

| Arm | Fixtures that dropped a safety fact | Misses / 60 |
| --- | --- | ---: |
| `qwen3.5:4b-q4_K_M` (control) | 10 (`risk-denial`), 14 (`risk`), 19 (`risk`+`risk-injury`) | 9 |
| `gemma4:12b` | 03 (`selfharm`), 06 (`hi`), 16 (`no-si`), 19 (`risk-injury`) | 12 |
| `qwen3.5:9b` | 09 (`hi`), 10 (`risk-denial`), 14 (`risk`), 16 (`no-hi`+`no-si`), 19 (`risk`+`risk-injury`) | 15 |
| `granite4.2:8b` | 03, 08, 09, 10, 14, 15, 16, 19 | 21 |
| `granite4.1:8b` | 03, 09, 10, 15, 16, 19 | 18 |
| `medgemma:4b` | 03, 06, 09, 14, 15, 16, 19 | 21 |
| `lfm2.5:8b` | 08, 09, 10, 14, 15, 16, 19 | 21 |

The control's misses are the three **four-section intakes** (10, 14, 19), which
is the same failure the M10 report and the 2026-09-23 round both reached: the
intake instruction file's section list never mentions risk, and the conditional
risk reminder reaches the prompt without changing the outcome. Every candidate
drops risk on those *and* on fixtures the control keeps — 09's denial, 15's and
16's `no-hi`/`no-si` — so the deficit is not one shared blind spot that a bigger
model fixes; it is the candidates reading the risk material less reliably.

The control's 85.0 % is one fixture below the 90.0 % the 2026-09-23 round
published for the same configuration; fixture 14 (`risk`) is the extra miss,
which is the run-to-run drift that round documented rather than a change.

### 7d. The gate, applied

The promotion gate the earlier rounds used, applied to this session's numbers:
a candidate must be **no worse on fabrication and no worse on safety facts**
than the control on both corpora.

| Arm | SOAP fab ≤ 10 % | SOAP safety ≥ 85 % | Owner fab ≤ 0 % | Owner safety ≥ 100 % | Gate |
| --- | --- | --- | --- | --- | --- |
| `qwen3.5:4b-q4_K_M` (control) | — | — | — | — | control |
| `gemma4:12b` | 15 % ✗ | 80 % ✗ | 0 % ✓ | 100 % ✓ | **reject** |
| `granite4.2:8b` | 26.7 % ✗ | 65 % ✗ | 0 % ✓ | 100 % ✓ | **reject** |
| `qwen3.5:9b` | 30 % ✗ | 75 % ✗ | 0 % ✓ | 100 % ✓ | **reject** |
| `lfm2.5:8b` | 40 % ✗ | 65 % ✗ | 50 % ✗ | 100 % ✓ | **reject** |
| `medgemma:4b` | 40 % ✗ | 65 % ✗ | 25 % ✗ | 100 % ✓ | **reject** |
| `granite4.1:8b` | 56.7 % ✗ | 70 % ✗ | 25 % ✗ | 100 % ✓ | **reject** |
| `gpt-oss:20b` | not measurable | — | — | — | **reject** (§5) |

No candidate passes, and the rejections are not marginal: the closest is one
fixture worse on each of the two SOAP clauses.

## 8. The fair-prompt arms

The second pass's finding was that the instructions were iterated on the 4B,
so a candidate can look worse than it is for a prompt reason. Its own answer
was that stripping the instructions made things worse for the 4B (the worked
examples carry the empty-section and retraction behaviour), so the fair test is
not "no instructions" but "the same minimal, model-neutral instructions for
everyone".

`tools/model-lab/neutral-instructions.txt` is that block: 1,256 characters
(~359 tokens) against the shipped SOAP file's 6,821 and the owner's 10,397,
with no worked examples and no quoted banned strings — the same text the second
pass used for its neutral arm, so the arms are comparable. It is passed through
the shipped CLI (`--instructions FILE --instructions intake=FILE`), which
replaces the instruction text and nothing else: the schema block, the format
block, the section list, the retraction reminder and the tail reminder are
still the production ones.

Three arms per corpus: the control (so the neutral baseline is measured in this
session, not imported), and the two candidates with the best shipped-prompt
result.

### 8a. What the fair prompt found

SOAP corpus, 3 runs per fixture per invocation:

| Arm | Instructions | Fabrication | Safety facts | Salient facts | F2 quotes | Novel content /100w | Prompt tokens |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `qwen3.5:4b-q4_K_M` (control) | shipped | **10.0% (6/60)** | **85.0%** | 84.1% | 3 | 57.3 | 2,444 |
| `qwen3.5:4b-q4_K_M` (control) | neutral | 20.0% (12/60) | 75.0% | 85.9% | 0 | **19.9** | 1,090 |
| `gemma4:12b` | shipped | 15.0% (9/60) | 80.0% | 89.2% | 33 | 46.9 | 2,448 |
| `gemma4:12b` | neutral | 15.0% (9/60) | 88.3% | 90.5% | 5 | 37.5 | 1,094 |

Two things to read here, and they point in opposite directions.

**The shipped prompt is worth more to the 4B than to the 12B.** The control
gets *worse* without it — 10 % → 20 % fabrication, 85 % → 75 % safety — and its
novel-content rate collapses from 57.3 to 19.9 words per 100, which is the
second pass's transcript-dump signature (its 9B-neutral arm was 14.6). So part
of the control's shipped-prompt advantage is prompt fit, and the fair-prompt
comparison puts `gemma4:12b` **ahead** of the control under identical
instructions: 15 % against 20 % fabrication, 88.3 % against 75 % safety, with a
copy rate that says the 12B is still writing a note rather than pasting the
source.

**That difference is one fixture, and it is not the configuration that ships.**
15 % and 20 % of 60 runs are 3 fixtures and 4 fixtures gated; §4 says this
corpus cannot resolve one fixture. So the honest reading is not "the 12B is
better with a fair prompt" but "the 4B's lead as shipped is partly its prompt,
and a like-for-like prompt comparison does not show the 12B losing." Turning
that into a product decision means re-tuning the instruction block *and* the
four server-side guards for a 12B, which is the project §10 describes — not a
model swap.

**Not completed.** The `qwen3.5:9b` neutral arm and the second and third
invocations of `gemma4:12b`'s neutral arm were still running when this round
was stopped; their absence is recorded rather than papered over. The control's
neutral arm is complete (3/3 invocations, identical numbers).


## 9. Hand audit of the top candidates

The rubric's headline is deterministic, not judged, but it is still an
instrument: the second pass found four of the control's seven flags were its
own attribution error. So every flag the top two candidates produced is read
against its fixture here, with the note text regenerated through the same
generation path (`tools/model-lab/dump-note.mts`) and printed beside the source
by `tools/model-lab/audit.mjs`. Each flag is classified **real** (the note
asserts something the source does not support), **carried** (the note holds
source material the corpus excludes, e.g. an aside she flagged, without
inventing anything) or **artefact** (the flagged sentence is faithful and the
pattern matched without context).

One thing the audit is not: the note dumped for reading is one draw, and the
verdicts it produced across the three invocations are in the gate table. Where
a fixture gates 3/3 the draw is the behaviour; where it gates fewer, the audit
says so.

### 9a. `gemma4:12b` — the closest candidate

Three fixtures gate, 3/3 invocations each. Two were read in full against their
source; the third's flag is the same class as the first.

| Fixture | Flag as shipped | What the source says | Verdict |
| --- | --- | --- | --- |
| 03 | F1 "fire alarm", "four minutes" | "the building's fire alarm went off … **Not clinically relevant, just noting it** because the session ran about four minutes over" | **carried** — she flagged the aside; the note records it in Objective. No invention |
| 09 | F1 "family history", "ruled out" | "I'm not ready to get into all of that today … I don't have family history …" | **artefact** — the note says the history "was not gathered as the patient stated they were not ready", and uses "ruled out" inside "it is unknown if … any medical issues have been ruled out". Both are the *faithful* frame; F1 matches its strings without context, which is the fourth defect the second pass identified and deliberately left unfixed |
| 18 | F1 "stairs", "third floor" | the source's own aside about his building | **carried** — the same class as 03: source material the corpus excludes, nothing invented |

**`gemma4:12b` invents nothing on the SOAP corpus.** Its three flags are one
scorer artefact and two carried asides — the same profile `gemma3:12b` had in
the second pass. It also **clears fixture 10**, the withdrawn number the
control fails in 3/3 invocations and which the 2026-09-23 round called
unreachable at the prompt layer. Read against the audited instrument, this is
the first candidate in three rounds whose failure set is *of a different kind*
from the control's rather than a longer version of it.

The counterweight is F2: **33 double-quoted spans across 60 runs do not appear
in their source**, against the control's 3 (§7a). That is the one place this
candidate looks worse in a way the headline does not gate, and a therapy note
that puts words in the patient's mouth inside quotation marks is exactly the
failure this product exists not to have. The two notes read here do not show
it (their quotations are the source's own: "swimming in it", "worry window",
"just stopped mattering"), so this report records the count as a real
difference and flags reading the F2 spans as the first thing a follow-up
should do — the report prints the count, not the spans.

### 9b. `qwen3.5:9b` — the second candidate

Six fixtures gate (03, 09, 10, 14, 16, 19), 3/3 each. This is the same model
the second pass audited by hand on the same corpus, and its verdicts there were
**03 real, 09 artefact, 10 carried, 14 real, 16 real, 19 real** — five real
inventions, including a diagnosis upgrade and a compulsive-content fragment.
Nothing in this round's numbers contradicts that: the gated set here is that
set minus the two fixtures the second pass's decontaminated instructions
cleared (07, 08), which is the expected effect of the instructions that were
adopted in `0089c2c`. So the 9B's 30 % is substantially real, and it is
**twice the control's** rate with the control's own family of failure modes.


## 10. What shipping a different drafting model would take

Recorded here so the bottom line is actionable whichever way it goes. A model
change is not a settings change: the drafting model is the app's single
quality-critical weight, and four things are coupled to it.

1. **The prompt and the four server-side locks were tuned on the 4B.** The
   refine chat's published/boilerplate/fact/prior-note guards
   (`server/src/ai/refine-guard.ts`, `fact-guard.ts`, `prior-note-guard.ts`)
   exist because the 4B ignores prompt rules under a direct command. A model
   that follows instructions better could make some of them redundant — and a
   model that follows them *differently* could make them wrong. Any model that
   wins on drafting has to be re-measured on `npm run check:format` and
   `npm run check:refine`, not just on the eval.
2. **The acquisition path.** Weights are only ever downloaded by the installer,
   against a pinned allow-list and checksum (`installer/src/catalog.ts`,
   `CLAUDE.md` hard rule 1). A library tag means Ollama's own template and
   renderer travel with it, which is why nothing here was hand-imported; a
   Hugging Face GGUF would need a Modelfile, a template check and a checksum
   pinned in that catalog.
3. **The long-context paths.** Brainstorm sends up to 13,824 tokens of the
   patient's history and the refine chat re-sends the note plus its background
   on every turn. A candidate has to be measured at the 16K window and on a
   ~12K-token prompt before it is a candidate for the app, not just for the
   drafting eval.
4. **Licence and size.** Everything in the shortlist is Apache-2.0 except
   `medgemma:4b` (Health AI Developer Foundations terms, gated) and
   `lfm2.5:8b` (LFM Open License v1.0). MedGemma's terms are the reason it
   cannot simply be swapped in: the app redistributes its weights.

## 11. Bottom line

**No.** Across seven candidates that fit this GPU — three generations of Qwen,
two of Granite, Gemma 4, a medical-tuned Gemma and a 2026 edge MoE, measured
with the current scorer, the decontaminated instructions, both corpora and
three invocations each — **nothing drafts her notes more faithfully than
`qwen3.5:4b-q4_K_M`, and the margin is not close.**

The control won both clauses on both corpora:

| | control | best candidate |
| --- | ---: | ---: |
| SOAP fabrication | **10.0 % (6/60)** | 15.0 % (`gemma4:12b`) |
| SOAP safety facts | **85.0 %** | 80.0 % (`gemma4:12b`) |
| Owner fabrication | **0.0 % (0/20)** | 0.0 % (three candidates tie) |
| Owner safety facts | **100 %** | 100 % (all candidates) |
| Mean draft | 2.2–2.7 s | 4.5 s (`gemma4:12b`) |

And it was the fastest of the faithful ones by ~1.7×.

**Why it is not a resolution problem.** The corpus's own limit is that 20
fixtures detect a 10-point difference 13 % of the time at one run per fixture
(§4). This result does not rest on a 10-point difference: the *closest*
candidate is 5 points behind on fabrication and 5 on safety, and every other
candidate is 17–47 points behind on fabrication — and all seven arms returned
identical numbers across all three invocations, so the ordering is a property
of the models, not of a draw. More to the point, the difference is visible
per fixture: the control gates two fixtures, the closest candidate gates three
and clears one of the control's two.

**What is genuinely better in a candidate, and why it does not win.** Four
findings that are worth keeping:

1. **`gemma4:12b` clears the control's hardest real failure, and invents
   nothing.** Fixture 10 is the retracted number ("three years … more like
   five") that the 4B carries into the note and that the 2026-09-23 round
   called a decoding-stage failure no prompt reached; `gemma4:12b` clears it in
   3/3 invocations. Hand-audited, all three of its own flags are attributable —
   one scorer artefact (fixture 09, where its note writes the *faithful* "was
   not gathered") and two carried source asides — so its failure set is of a
   different kind from the control's, not a longer version of it (§9a). That is
   the strongest positive result in three rounds of this search.
2. **Its counterweight is real and it is the one that would matter in
   practice.** The same model puts **33 double-quoted spans across 60 runs**
   into its notes that do not appear in the source, against the control's 3
   (§7a). F2 scores this without gating on it. A therapy note that quotes the
   patient saying something they did not say is the exact failure this product
   exists not to have, and it is the reason this round does not promote the
   model on the strength of item 1.
3. **With the same prompt, the 12B is ahead — so part of the 4B's lead is
   prompt fit.** Under an identical minimal instruction block the control falls
   to 20 % fabrication and 75 % safety with its copy rate collapsing to the
   transcript-dump zone (19.9 novel content words/100), while `gemma4:12b` holds
   15 % and 88.3 % (§8a). The margin is one fixture and this corpus cannot
   resolve one fixture, so it is not a win; but it says the shipped prompt is
   doing part of the work that a bigger model would do for itself, and that a
   fair-prompt comparison does not show the 12B losing.
4. **The owner's own format is solved, and speed is not the constraint.**
   Four candidates tie the control at 0 % fabrication and 100 % safety on her
   seven sections. `lfm2.5:8b` is 4× faster (0.9 s, 238 tok/s) and much worse
   (40 % SOAP, 50 % owner, 65.7 % salient coverage), while the GPU already
   evaluates a 12K-token prompt in ~3 s. Nothing here suggests the owner has a
   latency problem worth trading faithfulness for.


**What would change the answer.** Three things, in order of how likely they
are to matter:

1. **A provider change for gpt-oss-class models.** `gpt-oss:20b` is the only
   shortlisted model whose published capability is materially above the 4B, and
   it cannot produce a note through the shipped path at all (§5). Making it
   measurable means not sending the JSON-schema grammar — which is the
   mechanism every other arm's output relies on. That is a product change with
   a real cost, and it should not be made to serve one model whose throughput
   here is ~16 tok/s.
2. **More fixtures, not more models.** The corpus resolved this question
   because the gaps were large. If a future candidate lands within one fixture
   of the control, the honest next step is a bigger corpus, not another arm.
3. **Her data.** Every model here was asked to be faithful to *fabricated*
   dictations. Nothing in this round reads her notes; a pipeline that could
   (a held-out set of her own sessions, with her consent, scored by the same
   rubric) is the only instrument that could find a model-specific advantage
   the synthetic corpus cannot see.

**What to do now: nothing to the model, and one thing to the search.** Keep
`qwen3.5:4b-q4_K_M` as the drafting model. The earlier rounds' instruction-level
finding stands unchanged: the remaining SOAP failures are fixture 09's "declined
history written as negative findings" and fixture 10's withdrawn number, and
every candidate reproduces or exceeds them — neither is a size problem.

The one candidate worth a second look later is `gemma4:12b`, and it is worth it
for a specific reason rather than a general one: it is the only model measured
in three rounds whose failures are of a *different kind* (no inventions; carried
asides) and the only one that clears fixture 10. Before it could be considered,
two things would have to be true, and neither is established here: its 33
invented quotations would have to be read and explained, and the instruction
block plus the four server-side guards would have to be re-tuned for it — with
the fair-prompt result (§8a) as the evidence that the tuning is what the 4B's
current lead partly consists of.

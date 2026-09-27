# Local bilingual model options — 2026-09-27

Research and recommendation only; no model/default/acquisition/contract change.
No weights downloaded, no inference run, no live settings/data inspected.

## Owner requirements

Keep Qwen3.5 4B Q4_K_M as fast default. Optional slower model should improve
quality while remaining practical on the 2022 MacBook Pro. Aim to keep app,
runtime and installed model footprint below 20 GB. This is a product preference,
not permission to change existing acquisition rules or quality gates.
Target memory assumption: 8 GB M2, recorded in shared/src/models.ts:23.
The machine year alone does not establish RAM; Apple offered other capacities.

## Findings

- Disk budget and working memory are separate constraints. Model weights, context
  cache, runtime, macOS and the application share available unified memory.
  Accepting slower generation does not guarantee a model fits reliably.
- Current default Qwen3.5 4B uses about 3.4 GB on disk. Main structured-writing
  path in server/src/ai/ollama.ts runLadder starts with think:false; enabling
  thinking is an experiment requiring structured-output and latency regression
  checks, not an automatic quality improvement.
- Qwen's own 9B-vs-4B table reports better instruction-following, long-context
  and multilingual scores for 9B. These are publisher benchmark results, not
  measured improvements in quantized Apunta English/Spanish clinical writing.
- Standard Ollama Qwen3.5 9B Q4_K_M download: 6.6 GB. Quantizer's text GGUF
  files: Q4_K_M 5.68 GB; Q3_K_M 4.67 GB, separate vision projector omitted.
  A text-only build is the leading optional-model candidate, subject to runtime
  compatibility, acquisition approval, memory measurements and clinical-task
  comparisons. Q3 saves space but may erase the quality advantage over 4B Q4.
- Gemma4 12B is an alternate candidate for higher-memory machines, not a safe
  8 GB assumption. Google estimates 6.7 GB for Q4 loading, before context/runtime
  costs; model-specific packaging differs. Smaller Gemma E4B is a possible
  alternative but not established as a reasoning upgrade over Qwen4B.
- Qwen3.6 35B-A3B has 35B total parameters, ~3B active per token; active count
  does not remove storage/residency requirements. Existing project estimate
  22 GiB already exceeds the requested total footprint. Exclude from 8 GB tier.

## Recommended architecture

Use a directly bilingual writer: Spanish source to Spanish draft, English
source to English draft. Prompts/examples, clinical terminology, output guards
and held-out tests must cover each language. Do not force English intermediate
records or translate existing notes on language change. Multilingual capability
is not proof of equivalent quality across languages.

A Spanish-to-English-to-writer-to-Spanish cascade adds two possible meaning
changes, three sequential generation stages and model-switch overhead. This is
an engineering risk assessment, not a measured claim that pivoting always loses.
Benchmark it only as a challenger if direct Spanish generation fails. Evaluate
negations, subject attribution, uncertainty, times, numbers, quotations and
Mexican Spanish idioms against the original source, not a translated reference.
Google TranslateGemma is a real optional specialist; its card gives a 2K-token
input context and translation-specific intended use. Longer material requires
chunking; it is not a replacement reasoning model. Prefer explicit translation
of a completed document over mandatory pivoting for every note.

## Bounded evaluation before choosing an optional model

1. Same fabricated English/es-MX held-out cases: drafting, refine, plans,
   multi-note synthesis, retractions, negation and mixed-language quotations.
2. Compare existing4B default, existing4B deliberate mode, text-only9B Q4,
   and9B Q3 only if Q4 cannot fit. Do not assume large-model benchmark gains
   survive quantization, prompting and constrained JSON output.
3. Blind owner quality comparison plus existing immutable fact/safety gates:
   no invented facts, omissions, changed actor/time/negation, or failed JSON.
   Include mental-health content to detect inappropriate refusals.
4. On actual8GB M2 with ordinary apps open: peak memory, sustained swap,
   cold/warm response time, UI responsiveness, long-input behavior and failures.
   A Linux GPU result cannot establish Mac compatibility. Load one writer at
   a time; release speech/model memory between stages where needed.
5. Keep20GB for app+runtime+installed models as design target; track update
   staging separately. User recordings/database/backups can grow independently.
   Two writers at about3.4+4.7to5.7GB leave substantial disk budget for speech
   and runtime, but do not establish memory fit or final installer size.

## Sources (accessed 2026-09-27)

- Apple target hardware: https://support.apple.com/en-ie/111869
- Qwen9B official model card/comparison: https://huggingface.co/Qwen/Qwen3.5-9B
- Ollama9B package: https://ollama.com/library/qwen3.5:9b-q4_K_M
- Quantizer file sizes: https://huggingface.co/unsloth/Qwen3.5-9B-GGUF/tree/main
- Google memory guidance: https://ai.google.dev/gemma/docs/core
- Google multilingual model card: https://ai.google.dev/gemma/docs/core/model_card_4
- Qwen3.6 architecture: https://huggingface.co/Qwen/Qwen3.6-35B-A3B
- Translation specialist: https://huggingface.co/google/translategemma-4b-it
- Thinking API: https://docs.ollama.com/capabilities/thinking

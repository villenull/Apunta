# Local model study — owner-authorized plan, 2026-09-27

Author: coordinator, directly at owner's request. This is a research study,
not release acceptance, a default-model change, or permission to weaken a gate.
Owner explicitly authorizes necessary model downloads and sequential local
GPU/RAM testing on this PC; historical prohibitions on unlisted study models
are superseded for this bounded study only. Production acquisition remains
unchanged. No real patient material or live app/data/port7717 access.

## Questions and decisions

1. Does spending more time with existing Qwen3.5 4B improve quality?
2. Which compact optional writer improves both English and Mexican Spanish?
3. Does a translation pivot beat direct Spanish on the same source facts?
4. Which candidates merit actual8GB M2 validation within a20GB install target?
No Linux measurement is presented as a Mac memory/speed result.

## Roles, scope and isolation

- Coordinator writes/owns this plan, freezes comparisons, checks evidence and
  integrates results. Instruction review, implementation/execution and final
  independent review are different agents. Use Space Bunny Free as requested.
- Instruction reviewer writes only docs/v2/state/reviews/MODEL-STUDY-ir.md.
- Acquisition worker writes only a study acquisition manifest/report under
  docs/v2/evidence/MODEL-STUDY/acquisition.md and downloads under the study
  scratch root; imports new research-only Ollama tags, never replaces/deletes
  an existing model. No inference from acquisition worker.
- Execution worker writes harness/fixtures/results ONLY in scratch root and
  docs/v2/evidence/MODEL-STUDY/{execution.md,results.md,blind-review.md}. It may
  not edit application/UI/scorer/prompts/contracts or any other repo path.
- A separate corpus author prepares the supplemental fixtures/gold in scratch.
  A bilingual reviewer, distinct from that author and the execution worker,
  reviews both languages and gold before freeze; uncertain clinical or Spanish
  judgments remain explicitly unresolved, never certified by an AI alone.
- Independent reviewer writes only MODEL-STUDY-review.md under state/reviews;
  validates frozen fixtures/gold, scoring, raw traces, failures and reproducibility.
- Scratch root: /home/villenull/.cache/apunta-model-study/2026-09-27.
  Use real disk, not /tmp (tmpfs currently only8GB free). No secrets in artifacts.
- Export a frozen committed-source snapshot with git archive. Record commit,
  source/fixture/prompt hashes. Copy dependencies, attempting reflinks with ordinary-copy fallback; record
  commands, exit codes, byte counts and resolved workspace links (preserve
  relative workspace links into snapshot); do not symlink @apunta to live tree.
  Build only snapshot shared/server if needed, pinned Node24.19.0.
- Any app/database launch uses snapshot scripts/v2/sandbox.mjs env, free
  port7800-7889, synthetic data and verified ownership. Prefer pure model
  requests with no database/app server. The wrapper places small synthetic DBs
  under /tmp/apunta-v2; weights, corpora, traces and outputs stay on disk in the
  study scratch root. Pass absolute paths for every corpus/output argument,
  avoiding INIT_CWD resolution into the live checkout. Do not invoke unrelated model-lab
  run-consented, gpu-free, live-dump or recovery scripts.
- UI agent retains exclusive live-tree code writer lane. Study writes only
  disjoint documentation and scratch files. No study commits by workers.

## Model matrix and acquisition

A: installed qwen3.5:4b-q4_K_M, think=false (unchanged baseline).
B: same exact digest, think=true, deliberate mode.
C: Qwen3.5 9B text-only Q4_K_M GGUF, think=false.
D: Qwen3.5 9B text-only Q3_K_M GGUF, think=false.
E: Gemma4 12B current official quantized package, think=false; comparator,
   not promised to fit8GB M2. Validate actual tag/artifact availability.
F: translation challenger: TranslateGemma4B Spanish->English, A writes in
   English, TranslateGemma4B English->Spanish. Translation-only comparator.
Optional diagnostic C-thinking: evaluate only if C materially improves quality
and remains an8GB candidate; report separately, never overwrite C.

Use Ollama official registry for available packages; Qwen GGUFs from the
quantizer's Hugging Face repository. Resolve immutable revision and published
LFS SHA256 before downloading; stream to disk, verify size/digest. Registry
pulls record immutable model digest and actual bytes, verify model details.
Only fetch from canonical provider/registry/CDN destinations needed by those
artifacts, with no user content or credentials sent. Record licence/URL/date/
revision/digest/bytes and any redirect hosts without signed query values.
Reuse installed4B without another pull. New tags use apunta-study-* namespace
when importing GGUF; never rebind existing production tags or settings.
No downloads larger than the named matrix merely because PC has space.

## Exclusive execution and resource accounting

Exactly ONE execution process owns GPU inference for the whole study. Acquire
an exclusive flock on scratch-root/gpu-study.lock before warmup/inference;
all study inference tools must run beneath that lease. No parallel requests,
no worker-owned simultaneous benchmarks, no harness concurrency >1.
Use local Ollama only; record version/hardware/model residency before each arm.
Do not kill/unload unrelated processes or models. If unrelated inference or
heavy GPU use is detected, pause and report contamination; do not change services.
The lease serializes study requests only; unrelated Ollama clients do not honor
it. Capture model residency and available GPU/process telemetry before and after
each arm, and during execution where possible. Mark contaminated timing windows
invalid, retain their outputs and traces, and use at most the existing one
diagnostic rerun budget once resources are clear. Missing telemetry means
contamination could not be excluded, not proven absence of contention.
Downloads may run while read-only review proceeds; downloads themselves serial.
Only unload a study-owned model after its requests finish. Existing4B need not
be force-unloaded; distinguish cold/warm observations honestly.
Record load, prompt-evaluation, generation, first-output, total latency, tokens,
context, thinking-token accounting if available, RSS/memory/VRAM and failures.
Use same explicit context limit16384 and decoding seed/sampling across arms
where supported; record exact settings. Thinking uses separate output budget
(up to8192 vs baseline3072), reported as extra compute, not an equal-compute win.
Per request timeout300s, no silent retry or best-of selection. One diagnostic
retry permitted, original failure retained. Whole stage cap6h then checkpoint.
The shipped provider has an internal retry ladder: retain it for Track1, record
LlmStats.attempts and each exposed retry/mode change. Report first-attempt and
eventual results separately where available; never call differing retry counts
equal compute. The diagnostic retry budget is additional harness execution,
not permission to hide internal provider retries.

## Two distinct tracks

Track1: shipped English regression. Existing English eval + eval-owner fixtures
through frozen production provider for A, C, D, E (3 runs each). Preserve scorer
and guard thresholds verbatim; report fabrication/coverage/errors before style.
B is experimental: a scoped scratch-only adapter enables thinking, and is never
labelled unmodified production behavior. Prove that adapter forwards identical
baseline prompts/options except declared arm settings, using request traces.
Hash the original provider, experimental copy and exact patch; isolate B so
A/C/D/E still use the untouched provider. Do not silently count a fallback that
disables thinking as a successful thinking-enabled response.

Track2: model-only bilingual quality study. Existing Spanish runtime/scorer
is incomplete (S3.2/S5 work); do NOT feed Spanish to English scoring and claim
an official Spanish pass. Use a new supplemental fabricated paired corpus in
scratch, independent of protected existing Spanish heldout data. Do not read
or tune against e2e/fixtures/*es/heldout. Existing tuning schemas can inform
format only; never alter existing fixtures/gold.

Freeze 12 development cases (6 EN/6 ES) for harness smoke checks, then32 test
cases:16 semantic scenarios each in English and Mexican Spanish. Include four
drafting, four refine, four treatment-plan, four multi-note synthesis scenarios;
distribute negation, experiencer, risk timing, uncertainty, spoken corrections,
number/dose preservation, unsupported sections, quotations and code-switching.
Use fabricated English sample names and only allowed names from eval-es/NAMES.md
for Spanish. All models receive identical facts/format requirements per language.
Gold contains independently stated factual propositions/forbidden inventions,
not a model-generated reference answer. Freeze prompts/fixtures/gold/hash before
scored generation. No changing tests after seeing candidate outputs.

Run A-E on all32 cases3 times each. F runs the16 Spanish cases3 times each with
explicitly recorded translation prompts/chunks. If a source exceeds translator
context, deterministic paragraph/section chunking frozen before outputs; no
silent truncation. Score F against ORIGINAL Spanish facts, not translation.
The pilot may establish API compatibility only; do not optimize per-model prompt
against test outcomes. A failed arm remains failed, never quietly omitted.

## Validity checks and independent assessment

Harness selftests first: seeded missing fact, invented fact, negation/actor/time
flip, invalid JSON, empty refusal and context truncation must be detected or
explicitly escalated for human/independent review. No LLM is the sole safety judge.
Token/duration units and walltime must be checked against actual responses.
Structured-output failures, guard interventions, truncations, timeouts and
refusals appear in denominators; no fluent-answer-only subset.
Machine extraction of factual checks is descriptive; bilingual independent
review checks all flagged outputs plus a deterministic balanced sample of
unflagged outputs, blind to model. If false negatives appear, expand review to
all outputs in affected category. Report reviewed counts and uncertain cases.
Use stable blinded aliases and a separately stored mapping; owner receives a
small balanced blinded comparison pack, not hundreds of outputs to read.
Assess style separately from factual faithfulness using a frozen rubric: clarity
(unambiguous and easy to follow), naturalness (idiomatic professional EN/es-MX),
and format (requested structure, concise without losing required detail). Score
each dimension 1–5 with written anchors in the pre-reviewed corpus manifest;
compare factual-equivalent pairs by the sum, equal sums are ties. The blinded
sample is run 1 of all 16 scenarios per language for each arm versus A. Expand
factual review on false negatives as stated above without changing the original
style-preference sample or selecting more favorable runs.
Report per-task/per-language results and repeated-run variability; don't claim
statistical significance from small samples or average away a safety regression.

## Decision rule and completion

Pre-register the following exploratory decision criteria before scored outputs:

- Compare critical-error counts and rates per language and task; a candidate
  must have no higher observed critical-error rate than baseline A and no new
  observed critical error class. Failures remain in denominators, with separate
  failure-rate reporting; refusal does not earn a factual-quality win.
- Structured-output, refusal, timeout and guard-failure rates must not worsen.
- On the frozen balanced blinded review sample, a candidate needs at least
  60% preference among non-tied factual-equivalent pairs and wins exceeding
  losses by at least four pairs in EACH language to justify a bilingual quality
  recommendation. Report ties, sample size and uncertainty; this is an
  exploratory decision threshold, not statistical or clinical validation.
- F must additionally reduce observed critical source-fidelity errors versus
  direct A Spanish, with no new critical class; style alone cannot select it.
- If review coverage or unresolved judgments prevent these comparisons, the
  decision is INCONCLUSIVE. Never adjust thresholds after viewing outputs.

Recommend an optional candidate only if independent results demonstrate a
meaningful quality gain with no observed increase in critical unsupported facts,
negation/actor/time errors, and no hidden JSON/guard failure regression. Otherwise
recommend retaining4B; greater size/benchmark scores alone never select a winner.
Evaluate 4B-thinking as its own result, even if larger candidates disappoint.
Spanish and English get separate verdicts; prefer one bilingual winner, but allow
language-specific selection if evidence supports it. F must beat direct Spanish
on source fidelity enough to justify extra failure points/latency, not just style.

Mac validation remains a separately marked NOT RUN gate: actual8GB M2, ordinary
apps open, cold/warm runs, peak memory, sustained swap, long inputs and UI response.
Before Mac testing, report a rough memory screen with a 2 GiB reserve for OS
and ordinary apps; separately estimate resident weights, KV at context16384
and runtime overhead. Unknown overhead stays unknown. This estimate neither
proves fit nor substitutes for measurements on the actual Mac.
Do not install/change live Mac software remotely. Final disk budget includes app,
runtime, both retained writers and speech weights; user data/update staging
accounted separately. No model promotion, clinical release, or production setting
change occurs as part of this study.

Deliver reproducible commands, model manifest, corpus/prompt hashes, raw synthetic
outputs, metric JSON/CSV, failure list, concise EN/ES decision table and Mac next
steps. Max2 harness repair attempts; max1 diagnostic rerun per failed request;
block only failed arm/step and continue independent comparisons. Coordinator
reruns representative cases and verifies counts/hashes before accepting results.

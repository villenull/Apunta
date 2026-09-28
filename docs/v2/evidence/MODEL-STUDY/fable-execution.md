# MODEL-STUDY — Fable-Therapy-9B extension (worker: execution)

Scope: candidate **G**, `Verdugie/Fable-Therapy-9B`, added to the existing
authorized local model study under
`docs/research/fable-therapy-study-addendum.md`. Acquisition, execution, traces
and descriptive results only. **No production change, no remote code, no real
data, no live app, no port 7717.** Nothing here certifies clinical quality.

Machine-readable artefacts are under
`/home/villenull/.cache/apunta-model-study/2026-09-27/fable/`.

**Two defects found here are decision-relevant and are stated first, because they
change what the numbers can be used for.** See §7 and §8.

---

# ⛔ VOID NOTICE — Track 1 sections 6, 6.1, 6.2, 6.3 and 6.4

**Added 2026-09-28 after a critical independent review finding. Nothing below has
been deleted or edited; the original text stands so the audit trail is intact.
This notice overrides it.**

## The finding

**Every Track1 request in the "arm G" runs went to the 4B baseline
`qwen3.5:4b-q4_K_M`, not to Fable-Therapy-9B.** The generated arm-G driver reads
its model from `--model` (singular); the frozen eval CLI is invoked with
`--models` (plural). The flag never matched, the driver fell back to its own
default `PROMOTED_DEFAULT_MODEL`, and the mismatch was **silent** — no error, no
warning, and a plausible-looking report under a G-labelled header.

Verified from the captured request bodies, not inferred:

```
model on 127 model-bearing requests (including the 3 correction calls and all retries):
    qwen3.5:4b-q4_K_M
requests to apunta-study-fable-therapy-9b-q4:latest:  0
```

## Therefore VOID

- **§6 in full** and **§6.1, §6.2, §6.3, §6.4 in full**;
- the fabrication and gated-run figures in §6.1;
- the 21 failed / no-note calls, the 19 `output_truncated` and 2 local-AI errors,
  and the attempt histogram in §6.1;
- the retraction-accounting row for "G" in §6.2 — its correction wall time, applied
  edits, and writer-message hash and length describe the **baseline's** correction
  step;
- **the 1 388 → 3 811 character transcript expansion attributed to G** in §6.2. It
  is the baseline's expansion and is not a Fable finding;
- every wall-clock, token-rate and thinking-volume figure in §6.3, including
  "G is ~44× A's wall clock", the median 8 192 output tokens and the 33 559 median
  thinking characters;
- the 45/51 duplication measurement in §6.4 and any inference from it about Fable
  determinism;
- **the budget-sensitivity conclusion.** The `output_truncated` story in §6.1 and
  the budget discussion that follows it are baseline behaviour re-measured, not
  evidence about Fable's budget needs. **No budget-sensitivity claim about
  Fable-Therapy-9B is supported by anything in this document.**
- **the recommendation.** Nothing in §6 supports a view on Fable-Therapy-9B, and
  the owner-facing failure and timing judgement that was derived from it has been
  **retracted by the coordinator**.

## What is NOT void

- **§1 acquisition** — the artifact, digests and hashes are correct.
- **§2 template** — verified byte-identical to the publisher's.
- **§3 import** — the study-only tag exists and no production tag moved.
- **§4 dev compatibility smoke** — genuine: its 11 wire calls all carry
  `apunta-study-fable-therapy-9b-q4:latest`.
- **§5 Track2 non-refine** — genuine: all 96 heldout wire calls carry the Fable
  tag. Unaffected.
- **§7** — the refine defect is real; its count is corrected below.
- Arms A, B, C, D, E Track 1 — each used its own model correctly and is
  unaffected.

## Correction to §7

The invalid refine total is **156**, not 132. My earlier figure omitted arm B.
Recomputed from the run records: 6 full arms × 24 (8 refine cases × 3 runs) = 144,
plus F's 12 Spanish-only refine case-runs = **156**.

## Preservation

Every original artefact is byte-identical. A sha256 of all 376 files across the 23
mislabeled directories was taken **before** labelling, to
`<scratch>/fable/G-TRACK1-PRESERVATION.sha256`, and re-verified afterwards. The
only addition is a new `STATUS-VOID.md` in each of those directories. Nothing was
re-run, overwritten or deleted.

---

## 1. Acquisition — verified, immutable, study-only

| Item | Value |
| --- | --- |
| Repository | `Verdugie/Fable-Therapy-9B` |
| **Pinned revision** | `741d4610c3066e2972c01601cf5c6882f001c1cc` |
| `lastModified` | `2026-08-05T20:08:58Z` |
| Gated / private | `false` / `false` |
| Repo licence tag | `license:apache-2.0` |
| Declared base model | `Qwen/Qwen3.5-9B` |
| Artifact | `Fable-Therapy-9B-Q4_K_M.gguf` (text-only; no `mmproj` downloaded) |
| **Published LFS SHA256** | `810a61039f3e4131c0e328cfe28c5a26fb26741d4aaa6d77c650ff13be782633` |
| Published size | `5 629 108 544` |
| **Actual SHA256 after streaming** | `810a61039f3e4131c0e328cfe28c5a26fb26741d4aaa6d77c650ff13be782633` — **match** |
| **Actual bytes** | `5 629 108 544` — **match** |
| Download window | 143 s |
| GGUF container | magic `GGUF`, version 3, 427 tensors, 32 metadata KV entries |

The expected digest was taken from the **pinned-revision tree endpoint**, not
from the sibling listing (which carries no LFS metadata), and was never computed
locally, adjusted or substituted. Both checks re-ran on the finished file. Ollama
independently echoed `copying file sha256:810a6103…` during import.

Also fetched and hash-recorded at the same revision:

| File | Bytes | sha256 |
| --- | --- | --- |
| `chat_template.jinja` | 7 756 | `a4aee8afcf2e0711942cf848899be66016f8d14a889ff9ede07bca099c28f715` |
| `tokenizer_config.json` | 1 126 | `50f3e040f784406c444ff9624a5658c654309bcb3b2f19f29ef6305efd2249e2` |
| `README.md` | 30 695 | `92c08a9397a3305e743299958c773ab5fa59ecce792e8adacd9ac846f7fe1ec3` |

Network surface: `huggingface.co` only, plus its CDN redirect for the weight
stream. No user content, note text, machine identifier, credential or telemetry
left the machine. Query strings are not recorded anywhere.

## 2. Template — no adaptation was required

The artifact's own `tokenizer.chat_template` KV is **7 756 bytes and
byte-identical to the publisher's `chat_template.jinja`** at the same revision
(same sha256 `a4aee8af…`). It is thinking-aware: 2 `enable_thinking`, 4 `<think>`,
5 `</think>`, 7 `<|im_start|>`, 6 `<|im_end|>` occurrences.

After import, `ollama show --template` returns the **same 7 756 bytes, still
byte-identical**. So:

- **No native-template adaptation was made, so none had to be frozen.** There is
  no message-content equivalence question to settle, because nothing was changed.
- The Modelfile deliberately declares **no** `TEMPLATE` line, so the GGUF's own
  template is what the runtime uses. The only directive is
  `PARAMETER num_ctx 16384`.

## 3. Import — study-only, nothing existing touched

| Item | Value |
| --- | --- |
| Tag created | `apunta-study-fable-therapy-9b-q4:latest`, id `61c80fd0c58e`, 5.6 GB |
| Pre-flight | target tag confirmed **absent** before creation |
| Tag list diff before/after | **one addition, zero removals or changes** — all five pre-existing tags byte-identical, including production `qwen3.5:4b-q4_K_M` |
| Layer reuse | Ollama reported `using existing layer sha256:810a6103…`, so no duplicate copy |
| Architecture / params | `qwen35`, 9.0 B, Q4_K_M, context 262 144, `num_ctx` 16384 |
| Capabilities | `tools`, `thinking`, `completion` — **thinking capability present** |
| Licence in GGUF metadata | **absent** (as with the C/D imports). Licence is Apache-2.0 per the repo tag and model card; do not read an empty `--license` as unlicensed |

## 4. Dev-only compatibility smoke — before any heldout generation

12 dev cases (6 en, 6 es-MX), 1 run each, under the exclusive lease. **9 of 12
completed before the coordinator's clarification landed; the run was then left to
finish on its own checkpoint.** Nothing heldout was generated until the checks
below were done.

| Check | Result |
| --- | --- |
| **Template** | Runtime template byte-identical to the publisher's (§2) |
| **Thinking separation** | **Works.** Reasoning arrives in `message.thinking`, separate from `message.content`: 268–1 003 thinking chars on successful cases, 17 497 on the one failure |
| **Structured output** | **Works.** 8/9 schema-valid on the **first** attempt, under grammar-constrained `format` |
| `think` on the wire | `true` on 11/11 calls, **0 dropped** — no thinking-disabled fallback |
| **Hidden model-driven preprocessing** | **None.** Wire `/api/chat` calls = **11**, sum of recorded attempts = **11**. Exactly equal. |

That last row is the one the addendum gates on, and it is proven twice over:
statically (the Track2 assembler imports only `node:crypto` and `node:fs`,
contains no `fetch`, no URL and no model call) and dynamically (the request count
equals the attempt count).

**Observed reasoning profile:** Fable-Therapy reasons far more briefly than the
4B thinking arm — a few hundred characters against the 4B's ~25 000–34 000. The
one exception is a Spanish refine case where reasoning ran to 17 497 characters
and exhausted the 8 192-token budget. This budget sensitivity is the dominant
theme of §7.

## 5. Track 2 — the controlled comparison (96 case-runs per arm)

The same frozen corpus, prompts, gold, schemas and thresholds. `num_ctx 16384`,
`temperature 0`, `repeat_penalty 1.0`, `seed = attempt-1`, `keep_alive 30m`,
`num_predict 8192` for G, existing three-rung ladder retained. One process, one
request at a time, under the same exclusive flock.

**Message identity is verified by hash, which is what makes this the controlled
comparison:**

| Comparison | Identical `assembledSystem` + `assembledUser` hashes |
| --- | --- |
| A vs C, heldout | **32 / 32 cases** |
| G vs A, dev | **9 / 9 cases** |

### Structured validity (descriptive only — nothing is scored)

| Arm | schema-valid | failed | drafting | refine† | treatment-plan | multi-note-synth |
| --- | --- | --- | --- | --- | --- | --- |
| A | 96/96 | 0 | 24/24 | 24/24† | 24/24 | 24/24 |
| C | 96/96 | 0 | 24/24 | 24/24† | 24/24 | 24/24 |
| **G** | **96/96** | **0** | 24/24 | 24/24† | 24/24 | 24/24 |

† **The refine column is void for every arm** — see §7. The models returned
schema-valid answers to a prompt that contained no note. 96/96 for all three arms
means the structural contract was met everywhere, and therefore **Track2
discriminates between A, C and G on structure not at all.**

No cue hits, coverage ratios, critical-error counts, preferences or style scores
were computed. Those belong to a fresh blind context.

> ⛔ **VOID** — every request in §6 and §6.1–§6.4 went to the 4B baseline, not to Fable. See the VOID NOTICE at the head of this document. The text below is preserved unedited for the audit trail and must not be read as a Fable measurement.

## 6. Track 1 — end-to-end pipeline, 72 case-runs

**This is a pipeline comparison, not a controlled one.** Production retraction
preprocessing calls the model under test, so the writer's input depends on the
arm. That is production behaviour and was **not** repaired, re-run or normalised
away. Accounting in §6.2.

> ⛔ **VOID** — the figures below describe `qwen3.5:4b-q4_K_M` with thinking at 8192, not Fable-Therapy-9B.

### 6.1 Headline

| Arm | eval fabrication | gated | failed calls | owner fabrication |
| --- | --- | --- | --- | --- |
| A (4B baseline) | 15.0% (9/60) | 9/60 | 0 | 0.0% (0/12) |
| C (base 9B Q4) | 25.0% (15/60) | 15/60 | 0 | 0.0% (0/12) |
| **G (Fable-Therapy-9B)** | **20.0% (12/60)** | **33/60** | **21/60** | **0.0% (0/12)** |

G's 21 failures: **19 `output_truncated`** plus 2 local-AI errors. Attempt
histogram: 21 runs never produced a note, 12 succeeded first try, 27 needed a
second attempt.

> ⛔ **VOID in its "G" row** — the G row's correction wall time, applied edits, writer-message hash and length, and the 1 388 → 3 811 expansion all belong to the **baseline**. The A, C, D and E rows are valid; the production-behaviour point this section makes stands.

### 6.2 Retraction preprocessing, fixture 04 — production, unaltered

| Arm | correction calls | corrections proposed | **applied** | correction wall (ms) | **final writer user-message** |
| --- | --- | --- | --- | --- | --- |
| original input | — | — | — | — | `e70bb29d…` 1 388 chars |
| A | 3 | 11 | 2 | 8 459 | **1 817 chars** `924b703d…` |
| C | 3 | 3 | 1 | 2 870 | **1 864 chars** `cc1e5430…` |
| D | 3 | 3 | 3 | 4 956 | **1 488 chars** `61dff70b…` |
| E | 3 | 2 | 3 | 6 620 | **1 488 chars** `61dff70b…` |
| **G** | 3 | **11** | 2 | **10 607** | **3 811 chars** `f881aed6…` |

The original input is one frozen file with one hash, identical for every arm.
Applied edits were recomputed with the **frozen** `applyRetractions`, not a
reimplementation.

**G's correction step inflates the 1 388-character transcript to 3 811 characters
before the writer sees it** — more than double, and the largest expansion of any
arm. Whatever G proposed was applied at the same rate as A's (2 of 11), so the
inflation is in what it proposed, not in what survived filtering. This is a
pipeline-level behaviour a controller comparison would not have surfaced, and it
is the kind of thing the refine-chat UX depends on.

Correction cost is accounted **separately** from drafting, as required:
10.6 s of G's pipeline time is the correction call, and its tokens are in
`logs/retraction-accounting.txt`.

> ⛔ **VOID for G** — "G is ~44× A's wall clock", median 8 192 output tokens, 33 559 median thinking characters and the `length` counts describe the baseline. A and C rows are valid.

### 6.3 Runtime and reasoning — measured, with contention visibility limited

`nvidia-smi` and `rocm-smi` are absent on this host, so GPU utilisation and VRAM
were never observed. `ollama ps` residency and host load were captured around
every arm. These are wall-clock figures, not a GPU benchmark and not a Mac figure.

| Arm | requests | median wall/run | median output tokens | median thinking chars | mean tok/s | `think` on wire | final `done_reason` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A | 60 | 2.06 s | 189 | 0 | 101.0 | `false` ×60 | `stop` ×60 |
| C | 63 | 3.01 s | 237 | 0 | 79.2 | `false` ×63 | `stop` ×60, `length` ×3 |
| **G** | **106** | **90.3 s** | **8 192** | **33 559** | 83.8 | `true` ×106 | `stop` ×39, `length` ×65 |

**G is ~44× A's wall clock per run**, spends essentially its entire output budget
(median 8 192 = the whole allowance), and 65 of 106 requests hit the length
ceiling. The 4B thinking arm cost ~29×; G costs more and fails harder. Against C
the raw generation rate is comparable (83.8 vs 79.2 tok/s) — the gap is entirely
how many tokens G chooses to spend.

> ⛔ **VOID for any Fable inference** — the chunking and denominator procedure is valid and was necessary, but the duplication measurement says nothing about Fable determinism.

### 6.4 Denominator: the interrupted run, and the dedup

The first whole-corpus Track1 attempt hit the 7 000 s stage cap after **51 of 60**
fixture-runs. The frozen CLI writes its report only at the end, so that run
produced **0 reports**. Its raw traces survived (95 files) because the tee writes
incrementally.

The corpus was then re-run as 20 per-fixture chunks, each producing its own
report. Comparison of the two:

| Measure | Value |
| --- | --- |
| Interrupted run, drafted fixture-runs | 51 of 60 |
| Chunked runs, drafted fixture-runs | 60 |
| Overlapping case-runs | **51** |
| … with identical request sha256 | 48 / 51 |
| … with identical `(contentChars, outputTokens)` | **45 / 51** (6 differ) |

**The reported denominator is the 60 chunked case-runs only.** The interrupted
run is retained verbatim under `runs/t1-G-eval-r1/` and is counted in **no**
rate, total or table. The 6 differing duplicates are direct evidence that G is
**not** deterministic in Track1 — the opposite of A, C and D — which is why the
choice is stated rather than assumed. No existing arm was re-run and no result
was overwritten.

## 7. DEFECT — the Track2 refine cases are void for every arm

**Found while building the review packet, before any quality review.** It is a
harness defect, not a model result and not a corpus defect.

The corpus stores a refine case's existing note as an **object** of
`section -> string`. The Track2 assembler substituted it into the prompt by
string coercion, so every model received the literal text `[object Object]` where
the note belonged, while the template header still read
`EXISTING NOTE (JSON, section: body)`. A model's own reply shows it plainly:

> "the existing note provided is '[object Object]', which is not valid JSON …
> I cannot rewrite or shorten content that does not exist."

**Scope:** all 8 refine cases (4 en, 4 es-MX) × 3 runs = **24 case-runs per arm**,
across every arm in the study — A, B, C, D, E, G, and F's 12.

> **CORRECTION (2026-09-28): the total is 156, not 132.** My original count
> omitted arm B. Recomputed from the run records: 6 full arms × 24 (8 refine cases
> × 3 runs) = 144, plus F's 12 Spanish-only refine case-runs = **156**.

**What it does and does not affect:**

- The **comparison stays controlled**: all arms received the identical broken
  prompt, so no arm was advantaged. A vs C 32/32 message-hash identity is
  unaffected.
- But **no refine result measures note quality for anyone.** Those runs measure
  how gracefully a system handles a nonsense prompt.
- The refine column in §5 is marked void for that reason, and refine samples are
  **excluded from the blind packet** (§9). A preference judged on them would
  reward graceful confusion, which is worse than no data.

**Not fixed and not hidden.** Repairing it would mean re-running refine for every
arm, which the current authorisation forbids ("no extra runs beyond remaining
planned cases"), and the two-repair allowance for G integration is already spent.
The assembler is left as-is so the defect stays reproducible; the fix is a
`JSON.stringify` on one field and belongs to whoever re-runs refine.

## 8. Deviations in this extension

Prior deviations are preserved unchanged in `<scratch>/harness/DEVIATIONS.md`.
New ones:

| # | What | Handling |
| --- | --- | --- |
| **G1** | The Track2 refine assembler defect (§7) | Recorded, not fixed, samples excluded, scope quantified at **156** case-runs (corrected 2026-09-28; the original 132 omitted arm B) |
| **G2** | Track1 whole-corpus run hit the 7 000 s cap at 51/60, producing 0 reports | Re-run per fixture; denominator is the chunks only; the 51 preserved and excluded, with 45/51 duplication measured |
| **G3** | Two-repair allowance for G integration, spent as: (1) add arm G to the Track2 runner, (2) derive `harness/g-arm/` from the verified B adapter | Both verified: the G provider carries the **same 3-line patch** as B (only the constant renamed), diff is 4 lines, and the runner **load-checks** before use |
| **G4** | The blind packet initially leaked the arm identity through `wire.thinkOnFinalAttempt` (true for exactly 24 of 72 samples) and `outputTokens` (median 435 vs 195) | Both stripped; a rebuild that only added files would have re-shipped withheld samples, so the packager now clears its output first |
| **G5** | Track1 G is non-deterministic (6 of 51 duplicated case-runs differ) | Recorded; no deduplication was used to make results look tidier |

## 9. Blinded review packet — ready now

`fable/review-bundle/`. **Ship `JUDGE/`. Do not ship `SEALED/`.**

| | |
| --- | --- |
| Samples | **72** — run 1 of 24 cases × 3 arms |
| Cases | 24, with source, gold propositions, forbidden inventions and screening cues |
| Excluded | **24** refine samples (§7), listed with the reason in `JUDGE/EXCLUSIONS.md` and `SEALED/excluded.json` |
| Rubric | frozen `rubric.md`, copied verbatim |
| Scoring by the executor | **none** — no cue hits, coverage, preference or style |
| Identities | `SEALED/alias-map.json`, derived mechanically as `S-` + `sha256(caseId\|language\|run\|armKey)`, so it is reproducible and auditable rather than a private judgement |

**Leak audit, word-boundary aware:** no model tag, vendor, base-model name,
arm letter or `ollama` reference in `JUDGE/`. Filenames are opaque
(`S-<16 hex>.json`); 0 of 96 filenames deviate from the pattern. Per-sample
budget, thinking and token fields are **withheld** because each one identifies
an arm from inside the packet; the fact that one system ran with a larger budget
and visible reasoning is disclosed once, globally, in `JUDGE/README.md`, without
being attributable to a sample. Earlier sealed mappings in this study were never
opened and are untouched.

The judge receives a blank `review-sheet.md`, a per-case form, and an explicit
instruction that a cue hit is a **candidate** for their own factual judgement, not
a verdict.

## 10. Reproducing

```sh
R=/home/villenull/.cache/apunta-model-study/2026-09-27
export PATH=/home/villenull/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH

# acquisition integrity
cd "$R/fable" && ./fetch-fable.sh                       # re-verifies sha256 + size
node gguf-kv.mjs "$R/fable/gguf/Fable-Therapy-9B-Q4_K_M.gguf"

# Track2 (controlled) — resume-safe, one case-run per line
cd "$R/snapshot" && export INIT_CWD="$R/snapshot"
"$R/harness/with-lease.sh" node_modules/.bin/tsx "$R/harness/track2/run.ts" \
  --arm G --split test --runs 3 --out "$R/runs/t2-G-test"

# Track1 (end-to-end), per fixture
TEE_EVAL_CLI="$R/harness/g-arm/g-cli.ts" \
"$R/harness/with-lease.sh" node_modules/.bin/tsx "$R/harness/tee-eval.ts" t1-G-eval-c01 -- \
  --runs 3 --models apunta-study-fable-therapy-9b-q4:latest --fixture 01- \
  --corpus "$R/snapshot/e2e/fixtures/eval" --out "$R/runs/t1-G-eval-c01/report.md"

# retraction accounting and the blind packet
node_modules/.bin/tsx "$R/harness/retraction-accounting.mjs"
node "$R/fable/build-blind-packet.mjs"
```

Frozen-source discipline: the snapshot still matches base commit
`05d9b1025e0e61be16489e12ba3109d63d48fa76` file-for-file, the corpus still matches
every hash in `corpus-freeze.json`, and no corpus, prompt, gold, schema,
threshold, scorer or existing run was modified.

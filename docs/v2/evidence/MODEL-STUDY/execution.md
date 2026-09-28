# MODEL-STUDY — execution record (worker: execution)

Scope: Track1 (shipped English regression) for arms A–E, and the state of Track2
at the time of writing. Machine-readable results are in **results.md**; the
harness and all raw traces live under
`/home/villenull/.cache/apunta-model-study/2026-09-27`.

This file records **what was run, with what commands, and what went wrong**. It
draws no quality conclusion; that is not this worker's role, and the plan puts
the final judgement with an independent reviewer.

Two documents govern the boundaries this work stayed inside:
`docs/research/local-model-study-plan-2026-09-27.md` and
`docs/v2/evidence/MODEL-STUDY/acquisition.md`. Deviations, defects and one
protocol breach are recorded in
`<scratch>/harness/DEVIATIONS.md` and summarised in §7 below. Nothing was
committed; the working tree is left as found plus this file and `results.md`.

---

## 1. Isolation and provenance, verified before any generation

| Item | Value |
| --- | --- |
| Frozen source | commit `05d9b1025e0e61be16489e12ba3109d63d48fa76`, `git archive` snapshot |
| Snapshot integrity | **1450 / 1450** tracked files byte-identical to the base commit by `git hash-object`; 0 missing, 0 extra paths |
| Node | pinned `v24.19.0` at `~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin` |
| Ollama | `0.33.3`, existing daemon on `127.0.0.1:11434`. **No service started, stopped, reconfigured or reloaded. No model force-unloaded.** |
| Port 7717 | never contacted; not listening |
| Live application / database | never launched. Track1 is pure model I/O: the frozen eval path opens no database and starts no app server, so `scripts/v2/sandbox.mjs` and ports 7800–7889 were **not needed** |
| Corpus / Track2 inputs | **not read** during Track1. `corpus/` and `corpus-freeze.json` were left untouched pending freeze authorization |
| Network | none. The frozen CLI installs the production egress guard itself and it stayed outermost; every request went to `127.0.0.1:11434` |
| Writes | scratch `harness/`, `runs/`, `logs/`, `freeze/`, and `snapshot/shared/dist` (a build artifact). Nothing else |

Model availability was checked against the frozen provider's own gate before
use — `isSupportedModelName` and `details.format === 'gguf'`:

| Arm | Tag | `details.format` | thinking capability |
| --- | --- | --- | --- |
| A, B | `qwen3.5:4b-q4_K_M` | `gguf` | yes |
| C | `apunta-study-qwen35-9b-q4:latest` | `gguf` | yes |
| D | `apunta-study-qwen35-9b-q3:latest` | `gguf` | yes |
| E | `gemma4:12b` | `gguf` | yes |

Per the acquisition report's instruction that **no imported tag may be assumed
to work before a smoke test**, C, D and E were each smoke-tested on a single
fixture before their full corpus, and the results are in `runs/smoke-{C,D,E}-01*`.

## 2. Exclusive GPU lease

`harness/with-lease.sh` takes a **non-blocking** exclusive `flock` on
`<scratch>/gpu-study.lock` on fd 9 and holds it for the child's whole lifetime.
Non-blocking is deliberate: a second study process must fail fast rather than
queue behind the first, because queued work measures contention.

Verified by test: a nested invocation was **denied with exit 75** and performed
no work. Every arm ran through it; `logs/lease.log` records each acquisition and
release with the load average and `ollama ps` at both ends.

One process, one request at a time. The frozen driver is already sequential, and
nothing else in this worker issued inference.

## 3. Frozen execution options

Recorded before the first scored generation in `<scratch>/freeze/track1-freeze.txt`,
together with the sha256 of every corpus file, expectation file, rubric, scorer,
pattern, report and prompt module used.

```
runs            3 per fixture per arm
corpora         snapshot/e2e/fixtures/eval (20, SOAP) and e2e/fixtures/eval-owner (4, her seven sections)
prior-notes     0 (disabled; recorded in every report header)
instructions    built-in defaults, routed by section fingerprint exactly as production routes them
num_ctx         16384   passed on EVERY request of EVERY arm
num_predict     3072 (A, C, D, E)  /  8192 (B only, declared extra compute)
temperature     0       repeat_penalty 1.0       seed attempt-1       keep_alive 30m
per-request     300 s wall budget, enforced by the harness from OUTSIDE the frozen provider
retry           the shipped internal ladder retained; every rung read off the wire
concurrency     1
```

`eval-owner/README.md` suggests `--runs 5`; the plan specifies 3, and the plan
wins. The deviation is recorded here rather than silently taken.


> **DOCUMENTATION CORRECTION — added 2026-09-28, after an independent protocol
> reviewer's finding. No number in this document is altered by it.**
>
> Track1 fixture `04-dictation-with-retraction` exercises **production
> retraction preprocessing**, which calls *the model under test* to extract spoken
> corrections before drafting (`server/src/ai/ollama.ts` `extractRetractions`,
> reached from `generateNote`). Different arms therefore received different final
> writer input. The reviewer's figures reproduce exactly from the traces captured
> during this study: writer user-message length on fixture 04 was **A 1817,
> C 1864, D 1488, E 1488 characters**, with 3 unary correction calls per arm (one
> per run).
>
> This is **production behaviour, not a harness defect**, and it is not repaired:
> no arm was re-run, no result overwritten, and nothing was changed to make the
> arms agree. The consequence is stated in the corrected passage below.

**Every per-arm difference in the REQUEST is the model tag.** No corpus file,
expectation, rubric threshold, scorer constant, instruction default, template,
sampling option or retry setting differs, and the request options are identical
on the wire (`num_ctx 16384`, `temperature 0`, `repeat_penalty 1.0`,
`seed = attempt-1`, `keep_alive 30m`). Arms C, D and E ran the **unmodified
production provider**; only arm B used the scratch adapter, and its isolation is
proved in §5.

**What is *not* identical is the writer's final message, on one fixture.** The
retraction preprocessing above is model-driven, so on
`04-dictation-with-retraction` each arm's writer received a different
`messages` payload. **No Track1 writer-message equivalence is claimed, for any arm
pair, anywhere.** Track1 is therefore an **end-to-end pipeline** comparison: it
measures what the therapist would get, corrections call included, not a controlled
single-prompt comparison.

**Track2 is the controlled comparison, and it is provably so.** The Track2
assembler imports only `node:crypto` and `node:fs`, contains no `fetch`, no URL and
no model call, and the number of `/api/chat` requests observed on the wire
**exactly equals the sum of recorded attempts** — so there is no hidden
model-driven preprocessing in that path. Verified directly: A vs C share
identical `assembledSystemSha256` and `assembledUserSha256` on **32/32** heldout
cases, and G vs A on **9/9** dev cases. Controlled G-vs-A/C conclusions rest on
Track2 only.

## 4. Commands

Every scored run, from the snapshot, with absolute paths so nothing could resolve
into the live checkout:

```sh
cd <scratch>/snapshot && export INIT_CWD=<scratch>/snapshot
harness/with-lease.sh node_modules/.bin/tsx harness/tee-eval.ts <runId> -- \
  --runs 3 --models <MODEL> --corpus <ABS_CORPUS> --out <ABS_REPORT_MD>
```

Arm B, through the same tee pointed at the scratch adapter's entry point:

```sh
TEE_EVAL_CLI=<scratch>/harness/b-arm-v3/b-cli.ts \
harness/with-lease.sh node_modules/.bin/tsx harness/tee-eval.ts <runId> -- \
  --runs 3 --model qwen3.5:4b-q4_K_M --corpus <ABS_CORPUS> \
  --out <ABS_REPORT_MD> --out-json <ABS_SCORES_JSON>
```

**Exit codes** are the frozen CLI's own: `1` when any run is gated, `0` otherwise.
A `1` is a finding, not a harness failure.

| Arm | Corpus | Run id | Exit | Wall |
| --- | --- | --- | --- | --- |
| A | eval (20×3) | `t1-A-eval-r1` | 1 | 139 s |
| A | eval-owner (4×3) | `t1-A-owner-r1` | 0 | 19 s |
| B | eval, chunked ×20 | `t1-B-eval-c01` … `c20` | 0/1 per chunk | 7 713 s total |
| B | eval, aggregate | `t1-B-eval-combined` | — | rendered from chunks |
| B | eval-owner (4×3) | `t1-B-owner-r1` | 0 | 1 317 s |
| C | eval | `t1-C-eval-r1` | 1 | 310 s |
| C | eval-owner | `t1-C-owner-r1` | 0 | 30 s |
| D | eval | `t1-D-eval-r1` | 1 | 548 s |
| D | eval-owner | `t1-D-owner-r1` | 0 | 30 s |
| E | eval | `t1-E-eval-r1` | 1 | 293 s |
| E | eval-owner | `t1-E-owner-r1` | 0 | 36 s |

Total scored inference: **360 fixture-runs**, 10 063 s of arm wall clock.

### 4.1 Why the harness tees at all, and why that is not a change to the scorer

The frozen CLI emits a markdown report with no per-run JSON and no raw note text.
`harness/tee-eval.ts` runs the **unmodified** frozen `cli.ts` — it rewrites
`process.argv[1]` so the CLI's own `main()` self-executes, rather than
reimplementing argument parsing — and installs a `fetch` tee *underneath* the
egress guard so the guard stays outermost and still decides what is reachable.
Nothing in `server/`, `shared/`, `e2e/` or the corpus was modified; the snapshot
still matches the base commit file-for-file after the whole study.

Per request the tee records the full request body, every streamed NDJSON frame,
first-byte and total timings, the final frame's counters, and the `think` field
actually sent. Each request is correlated to its fixture and run by reading the
CLI's own stderr progress lines, which it also tees.

## 5. Arm B: the adapter, and the proof it changes nothing else

`harness/b-arm-v3/` is generated by `harness/make-b-adapter.mjs` from the frozen
sources. The declared patch is **three lines**:

1. the retry ladder's initial flag, `thinkingModel ? false : undefined` → `? true : undefined`;
2. the constructor default `options.numPredict ?? NUM_PREDICT` → `?? B_NUM_PREDICT`, with `export const B_NUM_PREDICT = 8192` added;
3. the runner's provider import re-pointed at the patched copy, aliased `OllamaProvider as BOllamaProvider`.

Not patched: the exported `NUM_PREDICT` constant, the operation-specific
ceilings, the retry ladder, schema validation, the truncation check, the
degenerate check, both timeouts, and the error taxonomy.

**Isolation from A/C/D/E, checked not asserted:** the patched runner imports the
patched provider and does **not** reference the frozen one
(`grep -c` = 0, exit 1 as desired); the frozen provider and driver still hash to
the base commit (`8b59377d…`, `6b9ef099…` as git blobs).

**Forwarded-request equivalence, measured from the wire** on a matched pair
(fixture `01-terse-jotting`, same corpus, same everything else):

```
SAME   model, stream, keep_alive, options.num_ctx (16384), options.temperature (0),
       options.seed (0), options.repeat_penalty (1.0),
       messages sha256, message roles, format sha256, body keys
DIFFER top-level think field     false -> true      (declared)
DIFFER options.num_predict       3072  -> 8192     (declared)
```

`messages sha256` and `format sha256` being identical is the substantive result:
arm B forwards a byte-identical prompt and a byte-identical response schema.

**One model-side difference, reported rather than buried:** `prompt_eval_count`
moved 2024 → 2022 with byte-identical messages. Qwen3.5's chat template is
thinking-aware, so `think=true` renders a slightly different prompt. That is
inherent to enabling thinking, not a harness deviation — but it means **arm B is
not a pure "identical prompt plus thinking" comparison**, and the study must not
describe it as one.

**The thinking-fallback check, which the plan requires to be measured rather
than assumed.** The ladder's third rung drops `think` entirely when an attempt
fails in a way that looks like the grammar was bypassed. Audit of every B request
on the wire:

| Arm-corpus | `think` on the final attempt | attempts with `think` dropped |
| --- | --- | --- |
| B-eval | `true` on all 108 attempts | **0** |
| B-owner | `true` on all 18 attempts | **0** |
| A/C/D/E | `false` throughout | 0 |

So no arm-B result in this study is a thinking-disabled fallback wearing a
thinking-enabled label. Had any been, it would have been counted separately.

## 6. Harness selftests, run before any scored generation

Both against the **frozen** modules, with synthetic content written in scratch
(John Smith / Maria Ruiz, prototype style). Nothing was read from `corpus/`.

`logs/selftest-scorer.txt` — **12 / 12** seeded defects detected, control clean:

| Class | Detected | Gating? |
| --- | --- | --- |
| missing safety-tagged number | yes | **no** — completeness only |
| invented unsupported conclusion | yes | **yes** (F1+F6+F7) |
| invented fact in the clinician's own voice | yes (`unsupportedPhrases`) | **no** |
| negation flip (declared) | yes | **yes** (F1) |
| negation flip (undeclared) | yes, as a miss | **no** |
| actor flip | yes, as a miss | **no** |
| time/number flip | yes (F3) | only here because a pattern also matched |
| dropped uncertainty attribution | yes (H2) | **no** |
| stated absence replaced by invented content | yes (H4 credit 0) | **no** |
| blank section filled | yes (`filled`) | **no** |
| blank section narrated | yes (`narrated`) | **no** |

`logs/selftest-provider.txt` — **11 / 11**, against the real ladder with an
injected `fetchImpl` and synthetic responses, no network:

invalid JSON repaired on attempt 2; invalid JSON three times → `invalid_output`
after 3 attempts with `think` dropped on the third; empty refusal →
`empty_response`; all output in `message.thinking` → `empty_response`; repetition
loop in both shapes → retried; `done_reason: length` → `output_truncated`;
`prompt_eval_count` at the ceiling → `context_overflow` after **1** request;
renderer ignoring `format` → detected by the extra key. `failedNote()` keeps a
thrown call in the denominator (`gating: call_failed`, `total: 0`,
`totalFacts` preserved).

**Two blind spots found, both properties of the frozen harness** (they bear
directly on the plan's critical-error rule):

1. **Most seeded defects do not gate.** Only F1, F6, F7, S1/S2/S4 and a
   context-full prompt zero a fixture. A negated or actor-flipped fact, a dropped
   hedge, an invented observation in a section that should have said "none", and
   a filled blank all only reduce the score. A critical-error rate computed from
   gating alone will **understate** these classes; `safetyMisses`,
   `unsupportedPhrases`, `numberFlags`, `blankOutcome` and
   `statedAbsenceCredit` must be read too.
2. **The repetition check has a floor.** A loop shorter than 40 tokens is
   accepted — the share check needs `MIN_TOKENS_FOR_RATIO = 40` and the
   consecutive check needs 8 identical tokens in a row. Verified: the same loop
   at 36 tokens passes with one attempt and no error.

## 7. Deviations, defects and one protocol breach

Full detail in `<scratch>/harness/DEVIATIONS.md`. Summarised, none hidden:

| # | What | Impact |
| --- | --- | --- |
| D1 | Tee never piped the response body; arm A attempt 1 hung 600 s and died on an unsettled await | **Harness repair 3 — the plan's cap is 2, exceeded and reported.** The no-GPU dry runs could not catch it: the fake provider makes zero `fetch` calls. Zero generations scored or lost. |
| D2 | The frozen `describe()` compares tag names **verbatim**, so no `:latest` tag can ever be addressed | **Production robustness finding**, not a harness defect. Referred to the coordinator, not fixed. Resolved in-lane by passing the tag as Ollama reports it. |
| D3 | Arm B's generated adapter did not load, one defect at a time — including `runEval` imported from the **frozen** runner, which would have reported arm A's output as arm B | Caught by hand-verifying the import path. Generator now imports the patched runner, and a **load-check** was added so the generated runner must import cleanly before it is accepted. |
| D4 | **Protocol breach: I caused inference to run for ~120 s without the lease**, by `import`-ing `b-cli.ts`, which executes on import | No arm was running, so no recorded result overlaps the window; nothing was captured or scored. `b-cli.ts` is now syntax-checked only, never imported. |
| L1 | Two frozen-detector blind spots (§6) | Affects how critical-error rates may be computed. |
| L2 | "3 runs" is three **copies** for A, C, D; three **real samples** for B, E | Corrects an earlier over-broad statement of mine. See §8. |
| H1 | Ports 7800–7889 are partly occupied on this host | Track1 did not need them. Noted for Track2. |

## 8. A measurement caveat that changes how these numbers may be read

`temperature 0`, `seed = attempt-1`, one process: decoding on this host is
deterministic for the non-thinking arms.

| Arm | eval fixtures byte-identical across the 3 runs | meaning |
| --- | --- | --- |
| A | 20/20 | three **copies** |
| C | 20/20 | three **copies** |
| D | 20/20 | three **copies** |
| **B** | 11/20 | runs genuinely differ |
| **E** | 9/20 | runs genuinely differ |

- For A, C and D, repeated-run variability is **unmeasurable** and a difference
  between them is signal rather than noise.
- For E — the arm with the lowest observed fabrication rate — the runs are real
  samples, and the gap to A is **2 runs out of 60**. No interval is computed here
  and the difference must not be read as established.
- Decoding was **not** changed. A seeded sweep is a coordinator decision.

**Contention visibility is limited.** `nvidia-smi` and `rocm-smi` are both absent
on this host, so GPU utilisation and VRAM were never observed. What *was* captured
before and after every arm: `ollama ps` residency, context size, processor
placement, and host load average. Per the plan this means contamination could not
be **excluded**, not that it was absent — except for the one window in D4, which
overlaps no recorded run. Model residency also changed between arms by Ollama's
own LRU eviction; nothing was force-unloaded, and cold/warm is labelled honestly
per arm in `results.md`.

## 9. Token and duration units, checked against the actual responses

1 368 checks, **1 368 plausible**, in `runs/track1-analysis/unit-checks.json`:

| Check | Result |
| --- | --- |
| generation rate, `eval_duration` read as **nanoseconds** | 360/360 plausible (50–101 tok/s) |
| measured wall vs reported `total_duration` (tee overhead can only add) | 360/360 ratio ≥ 1 |
| `prompt_tokens` below `num_ctx − 64` | 360/360 — no run came near the truncation fingerprint |
| chars per output token, non-thinking runs | 288/288 plausible |

A millisecond/microsecond mix-up in `eval_duration` would have shown up as a
generation rate three orders of magnitude off. It did not.

## 10. Track2 status at the time of writing

Track1 is complete for A, B, C, D and E on both English corpora. **No scored
Track2 work has been performed.** The bilingual review returned necessary
repairs, so `corpus/` was not read during Track1; Track2 begins only against the
committed `corpus-freeze.json`, after verifying the hashes it binds.

---

# Track 2 — model-only bilingual quality study (exploratory)

## 11. Authorisation, freeze verification, and what was read

Track 2 ran under the coordinator's explicit authorisation for **exploratory**
execution, after the bilingual review's repairs. Track1 never read `corpus/`;
this section is the first time it was opened.

`docs/v2/evidence/MODEL-STUDY/corpus-freeze.json` binds exact reviewed bytes.
Verified before use, from the committed record:

| Artifact | Result |
| --- | --- |
| 11 hashed artifacts (`manifest.json`, `HASHES.sha256`, 4 gold files, frozen prompts, rubric, gold schema, `validate-corpus.mjs`, `check-repairs.mjs`) | **11 / 11 sha256 match** |
| `review/alias-map.sealed.json` | **not opened**, by instruction; recorded as skipped, not as verified |

The freeze's dispositions are accepted **as exploratory fidelity conventions
only**. Internal `DRAFT` and `annotated-not-cleared` flags were left exactly as
they are, so no hash or schema moved. Nothing here is clinical certification, and
the es-MX register remains **reviewed, not certified** — no native es-MX
clinician has read the four es-MX gold files.

Read: `corpus-final-review.md`, `prompts/frozen-prompts.json`, the 12 dev cases
and dev gold, `README.md`, `rubric/rubric.md`, `schema/`, `manifest.json`, and
the test cases/gold **only at run time**, by the runner, never by hand. The
alias map was never opened.

## 12. Assembly, and the two conventions the corpus leaves open

`prompts/frozen-prompts.json` is normative and was read, never written. It fixes
the system block order (`sharedRules`, `taskRules`, `outputContract`), the
separator (exactly one blank line), and the note-list rendering (fully specified
in prose, reproduced literally: `[<zero-based index>] <label> — <date>` + the
note text verbatim, blocks joined by a blank line, `excerpt: 0` for every cited
note because a note is never split).

It does **not** fix two things, so they are executor conventions, fixed here
**before any generation**, identical for every arm, and asserted by selftest:

1. **Inside a rule list, one rule per line** (`"\n"`). The `"\n\n"` separator is
   defined between blocks; joining rules with a blank line would make a 7-rule
   list indistinguishable from 7 blocks.
2. **`{sectionList}` is one section per line** (`"\n"`), matching the
   "SECTIONS (in order):" header it sits under.

No rule text, template or case field was reworded, reordered or templated on the
executor side. Every request records `assembledSystemSha256` and
`assembledUserSha256`, as `assembly.assertionForExecutor` requires, and each
record also carries the sha256 of the gold file it was run against.

## 13. Track 2 dev-split selftests (no model contacted)

`logs/track2-selftest-assembly.txt` — **all pass**, on the 12 dev cases only:

- assembly is **deterministic** (identical assembled hashes on re-assembly);
- **no placeholder survives**, and a template missing one is **rejected**, not sent;
- the three system blocks appear in the declared order, separated by exactly one
  blank line, with no rule reworded or dropped;
- the note list matches the frozen rendering literally, indexes and verbatim text;
- **cross-language pairing holds** for all 6 dev pairs: same task, same section
  count, same gold id set, different text;
- a **reordered** `systemPromptOrder` and a **wrong separator** are both rejected;
- **173 forbidden cues screened against the executor's own framing: 0 planted.**
  This is the check that stops the harness itself from framing a case so that a
  correct answer screens as a violation.

## 14. Track 2 execution options

Identical for every arm except the two declared per-arm settings:

```
num_ctx         16384          temperature 0        repeat_penalty 1.0
seed            attempt-1      keep_alive  30m       study request budget 300 s
num_predict     3072 (A, C, D, E)   /   8192 (B only — plan lines 102-106)
response schema the FROZEN production schema for the case's task
                buildSectionsSchema / buildRefineSchema / PlanSuggestionSchema /
                BriefCompositionSchema, which are the corpus's own schemaSource
retry           the shipped three-rung ladder retained; every rung read off the wire
concurrency     1, under the same exclusive flock as Track1
```

**Two executor decisions, both fixed before any generation and identical across
arms:** the response schema is the frozen production schema for each task (grammar
constrained, then validated with the matching zod schema), and the user prompt is
the corpus template used as written — its trailing sentence already carries
`locales[lang].outputLanguageInstruction`, so nothing was appended.

Checkpointing is per case-run, appended and flushed immediately; an existing
record is never recomputed. This is what let arm B resume correctly and it is why
the completed arms survived interruption.

## 15. Arm F — the translation pivot

Per case-run: Spanish source → `translategemma:4b` es→en → **arm A**
(`qwen3.5:4b-q4_K_M`, think off, 3072) writes the English note from the
translated source using the English twin's contract → `translategemma:4b` en→es.
The Spanish note is adjudicated against the **ORIGINAL es-MX gold**, never a
translation of it. `goldIsOriginalSpanish: true` is asserted on all 48 records,
and both pivot assembled hashes are recorded on every record.

**The translation window is conservative and frozen before any output, and the
runtime's advertised context is deliberately NOT used.** `translategemma:4b`
reports 131 072 tokens, and the coordinator ruled that runtime-reported capacity
is not proof of translation quality across it. The window is **4096 estimated
input tokens** at the production provider's own 3.5-chars-per-token
approximation, applied to source text only, never to the model's output, which is
bounded by `num_predict` (2048 for translation). Chunking, if ever needed, is
deterministic: paragraphs packed to the window, never mid-paragraph, never
mid-sentence; a single over-window paragraph **fails the run explicitly** as
`translation_chunk_too_large` and is never truncated. The `<end_ofturn>` stop the
model ships with is honoured. Every translation prompt, chunk boundary, estimated
token count, response and timing is recorded.

**Chunking never actually triggered:** 183 translation calls, largest estimated
input **229 tokens** against the 4096 window, so every case fitted in one chunk.
The chunking protocol is therefore **implemented, recorded, and unexercised** —
which is stated rather than presented as a tested path.

Arm F also **translates field by field and rebuilds the English twin**, rather
than substituting one contiguous block, because for refine the note and the turn
are separate labelled blocks and for treatment-plan the diagnosis is separate
from the note list. See `DEVIATIONS.md` T4.

## 16. Track 2 results in one place, and what they are not

**528 case-runs**: A–E on 32 cases × 3, F on the 16 Spanish cases × 3. Full
tables in **results.md** §11–13.

**No Track 2 number here is scored, adjudicated, or a verdict.** What this
section records is *structural*: whether an arm returned a schema-valid answer,
how many attempts it needed, what the wire said, and how much wall clock it cost.
Cue hits are **candidates for independent factual adjudication, never automatic
critical-error scores**; the style scorer is a fresh blind context that is neither
the corpus author, the reviewers, nor this worker. Nothing here is an official
Spanish pass, and no Track 2 number may be presented as a C-EVAL result.

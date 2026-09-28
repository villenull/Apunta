# MODEL-STUDY — Fable-Therapy-9B (arm G) independent review

Reviewer: independent protocol reviewer (agent `81df21fd`), 2026-09-28. Scope per
`docs/research/fable-therapy-study-addendum.md:55-63`: audit the G extension —
scorer limits, retry accounting, deviations — and the contract check the
coordinator will rely on before authorising a mechanical repair and an
affected-cases-only rerun. No inference, no GPU, no code or corpus edit, no
commit, no sealed mapping opened. Node pinned `v24.19.0`; everything below is
arithmetic and re-derivation over already-persisted artefacts, plus one read-only
re-assembly of the frozen prompts (my scripts live in `/tmp/opencode/mlsrev`, not
in the study tree).

**One bounded pass. Findings are ordered by decision urgency, not by section.**

---

## 0. Two headline results

1. **BLOCKING — arm G's entire Track1 run measured the wrong model.** Every one
   of G's Track1 requests carried `qwen3.5:4b-q4_K_M` on the wire, and G's
   `scores.json` records `"model": "qwen3.5:4b-q4_K_M"` under a label naming
   Fable-Therapy-9B. `fable-execution.md:137-222` (§6 in full) is void. §2.
2. **The `[object Object]` defect affected 156 case-runs, not 132, and the
   omitted 24 are arm B's** — the study's own defective arm, which the record
   never mentions. §3.

Consequence for the blind packet, which I was asked to check first: the packet
itself is **sound on source and output integrity (24/24 and 72/72 verified)**,
but it carries **two disclosure defects** that affect the *style* comparison
specifically. §4. No G Track1 number may enter any table; Track2 G is genuine and
stands.

---

## 1. What I verified, and what reproduces

| Claim | Source | Result |
| --- | --- | --- |
| Acquisition: pinned rev `741d4610…`, LFS SHA256 and size both match on the streamed file | `fable-execution.md:22-31` | not re-downloaded; **out of scope for me** and not re-verified — flagged as the one item in §6 I could not check without network |
| Template byte-identical, no adaptation | `fable-execution.md:52-66` | consistent with `fable/manifests/gguf-chat-template.jinja` vs `chat_template.jinja`; no adaptation visible in the harness |
| Track1 G: 60 chunked fixture-runs, 27 clean / 21 `call_failed` / 12 content-gated, fabrication 12/60, median 90.3 s, 106 requests, `think` true ×106 | `fable-execution.md:146-192` | **internally reproduces, but of the wrong model** — §2 |
| Track2 G: 96/96 schema-valid, `think` true, 8192 | `fable-execution.md:123-132` | **reproduces and is genuine** — all 96 traces carry `apunta-study-fable-therapy-9b-q4:latest` |
| Dev smoke: 11 calls, Fable, `think` true, thinking 268–1 003 chars, 8/9 valid first attempt | `fable-execution.md:87-104` | **reproduces**; the single failure is confounded — §5 |
| `[object Object]` present in the refine prompt | `fable-execution.md:225-257` | **confirmed**, and confined to exactly the 10 refine cases — §3 |
| Blind packet: 72 samples, 24 cases, 0/72 filename deviations, no tag/vendor/arm-letter leak, per-sample budget/thinking/token fields withheld | `fable-execution.md:272-296` | **reproduces**, independently — §4 |
| Packet source blocks are the corpus verbatim | not previously asserted | **24/24 byte-verbatim** — §4 |
| Packet outputs are the recorded arm outputs | not previously asserted | **72/72**, without opening the alias map — §4 |
| Packet gold hashes match the frozen gold | not previously asserted | **24/24** — §4 |
| Refine scope "132 case-runs" | `fable-execution.md:239-240` | **wrong: 156** — §3 |

---

## 2. BLOCKING — arm G's Track1 arm is the 4B, not Fable

### 2.1 The evidence, three independent ways

**Wire.** Every Track1 request body recorded by the tee names the 4B:

| Run directory | requests | model on the wire | `think` | `num_predict` |
| --- | --- | --- | --- | --- |
| `runs/t1-G-eval-c01…c20` | 106 stream + 3 unary | `qwen3.5:4b-q4_K_M` | `true` ×106 | 8192 ×106, 768 ×3 |
| `runs/t1-G-eval-r1` (interrupted) | 92 stream + 3 unary | `qwen3.5:4b-q4_K_M` | `true` | 8192 |
| `runs/t1-G-owner-r1` | 18 stream | `qwen3.5:4b-q4_K_M` | `true` ×18 | 8192 ×18 |

**The executor's own machine-readable artefact.** All 60 chunked scored runs, in
`runs/t1-G-eval-c??/scores.json`:

```
"label": "apunta-study-fable-therapy-9b-q4:latest [ARM G: think=true, num_predict=8192, scratch adapter]",
"model": "qwen3.5:4b-q4_K_M",
```

and every one of the 60 inner score records also reads
`"model": "qwen3.5:4b-q4_K_M"`. The label and the model disagree **inside a file
the executor generated**.

**Physical corroboration.** `fable-execution.md:100-102` reports Fable's dev-smoke
thinking at 268–1 003 characters. G's Track1 median thinking is **33 559**
characters (`fable-execution.md:192`). Arm B's Track1 median, from
`runs/track1-analysis/per-run-metrics.csv`, is **24 496** with a max of 34 778.
G's Track1 sits inside B's range and two orders of magnitude away from Fable's
own measured profile. The document's own §4 sentence falsifies its own §6.3.

The overlap in outcomes is the same story: 21 `call_failed` here against B's 22
no-note on the identical configuration and corpus; 33/60 gated against B's
32/60. B is documented as non-deterministic at Track1 (11/20 fixtures byte-identical),
so a second run of the same 4B-thinking-8192 configuration landing 22→21 and
32→33 is exactly what that model does.

### 2.2 Cause, precisely

`harness/g-arm/g-cli.ts:18` reads the **singular** flag:

```ts
const model = arg('--model', PROMOTED_DEFAULT_MODEL);
```

`arg()` is an exact `process.argv.indexOf` match, so an invocation passing
`--models` (plural) does not match and the value **silently falls back to
`PROMOTED_DEFAULT_MODEL`**, which is `qwen3.5:4b-q4_K_M`
(`snapshot/shared/src/models.ts:43`).

The invocation used the **plural** flag — the frozen CLI's own flag
(`snapshot/server/src/eval/cli.ts:65`, `case '--models'`) — recorded verbatim in
every `run-manifest.json` `cliArgs` and in the reproduction command at
`fable-execution.md:315-317`. So the flag was consumed by nothing and the
fallback fired.

Arm B was invoked with the singular `--model` (`execution.md:107`), which is why
B was accidentally correct: its intended model *is* the promoted default. The
same line exists at `harness/b-arm-v3/b-cli.ts:23`. `DEVIATIONS.md:50-83`
(D3) already records the near-identical failure — "`runEval` imported from the
frozen runner … **arm B would have measured arm A and reported it as arm B**".
This is that defect again, reached by a different route: not a wrong import but a
wrong flag name, with a fallback that is *plausible* rather than obviously wrong.

**The generator's load-check is necessary and not sufficient.** `DEVIATIONS.md:71-72`
states the generated runner is import-loaded before acceptance, and
`fable-execution.md:268` (G3) repeats it as verification. An import check proves
the file parses and links. It cannot prove that the argument the operator passed
was the argument the adapter read. Any such adapter needs a
**model-identity assertion on the first real request**, not a load-check.

### 2.3 Scope of the void

Void: `fable-execution.md` §6 and §6.1–6.4 in their entirety — the 20.0%
(12/60) fabrication figure, 33/60 gated, 21/60 failed, the 90.3 s median, the
`length` ×65, the 83.8 tok/s, the "~44× A" statement, the 3.4-point
"fails harder" framing, and the §6.2 retraction row for G. That row is also
internally suspicious on its own terms: G's correction profile (3 calls,
**11 proposed**, **2 applied**) is numerically **identical to A's row**, which is
what the same 4B would produce.

**Not void.** Track2 G and the dev smoke: `runs/t2-G-test/traces.jsonl` has
`apunta-study-fable-therapy-9b-q4:latest` on all 96 records, and
`runs/t2-G-smoke-dev/traces.jsonl` on all 11. Track2 G ran through
`harness/track2/run.ts`, which takes the model from the runner, not from an
adapter CLI. Everything in `fable-execution.md` §1–§5 and §7–§9 stands.

**Do not repair and do not relabel.** The correct disposition is what the record
itself did for `t2-B-test-np3072-BUDGET-LIMITED-DIAGNOSTIC`: keep every artefact
byte-identical, add a STATUS file stating the directory is not arm G and must
never be reported as arm G, and add a `scores.json`-level note that the `label`
field is unreliable. Retagging, renaming or re-running is prohibited and I am not
asking for it.

**Do not adopt any comparative G statement.** The document does not formally
recommend a model, but §6.3's "G costs more and fails harder" and §5's "Track2
discriminates between A, C and G on structure not at all" are selection-adjacent
claims about a mislabelled arm and a structural-only measurement respectively.
Neither may be carried into an owner-facing decision. On valid evidence Track2 G
is 96/96 schema-valid at 8192 with thinking — that is a contract fact and nothing
more, and the decision rule's factual and preference criteria (`plan:182-193`)
remain unevaluated for G exactly as for every other arm
(`MODEL-STUDY-review.md` §5).

**A forward-looking consequence, for the coordinator and not for me to decide:**
if a Track1 G rerun is authorised, the adapter must be fixed *and* the first real
request's model must be asserted equal to the intended tag before the remaining
chunks run — otherwise a second mislabelled arm costs another full corpus pass.

---

## 3. The refine defect: scope is 156 case-runs, and B was omitted

**Independently enumerated from the run records, not from the document:**

| Arm | directory | refine case-runs | cases |
| --- | --- | --- | --- |
| A | `t2-A-test` | 24 | 8 (4 en, 4 es-MX) |
| **B** | `t2-B-test-np8192` | **24** | 8 |
| C | `t2-C-test` | 24 | 8 |
| D | `t2-D-test` | 24 | 8 |
| E | `t2-E-test` | 24 | 8 |
| **G** | `t2-G-test` | 24 | 8 |
| F | `t2-F-test` | 12 | 4 (es-MX only) |
| | **distinct total** | **156** | 8 distinct case ids |

`t22-B-test-np8192-resume` adds 12 more *records* but they are duplicates merged
by `MERGE.md` and are not additional case-runs. The document's 132
(`fable-execution.md:239-240`) enumerates "A, C, D, E, G, and F's 12" = 120 + 12
— **B is missing**, and B is the arm that fails hardest of all. Your hypothesis
was 132-excludes-G; the arithmetic is right but the omitted arm is **B**, and G's
24 are already inside the 132. The rerun scope is therefore
**6 arms × 24 + F's 12 = 156**, not 132.

Affected case ids: `test-en-r01…r04`, `test-es-MX-r01…r04`, plus dev
`dev-en-v03`, `dev-es-MX-v03` — 8 heldout + 2 dev, which is every
`note-and-turn` case in the corpus. I confirmed by re-deriving all 44 case
prompts that `[object Object]` appears in **exactly 10** and in no other case.

`fable-execution.md:253-255` justifies not fixing it on the grounds that
"the current authorisation forbids extra runs" and "the two-repair allowance for
G integration is already spent". Both were true at the time and the refusal to
repair mid-study was right. They are no longer the constraint: the coordinator
has authorised a mechanical repair and an affected-cases-only rerun. What must
**not** change is the reason for the fix — this is a one-token
serialisation defect, not a prompt improvement, and the fix must be provable to
touch nothing else (§3.3).

### 3.1 The minimal correction, exactly

`harness/track2/assemble.mjs:129` currently reads:

```js
case 'refine':
  if (input.kind !== 'note-and-turn') throw new Error(`${testCase.caseId}: expected note-and-turn`);
  fill('noteJson', input.note);          // ← String(object) === "[object Object]"
```

Corrected, one line, nothing else:

```js
  fill('noteJson', JSON.stringify(input.note));
```

Three independent reasons this is the *right* form and not a guess:

1. **The corpus's own pinned validator already does exactly this.**
   `corpus/validate-corpus.mjs:156` canonicalises a refine case's content as
   `JSON.stringify(i.note) + '\n' + i.turn` — compact, no indentation. The
   corpus author defined the canonical rendering; the assembler diverged from it.
   `validate-corpus.mjs` is hash-bound in `corpus-freeze.json:18`, so this is not
   a new convention.
2. **The template demands JSON.** `prompts/frozen-prompts.json` renders the slot
   as `EXISTING NOTE (JSON, section: body):\n<{noteJson}>` (en) and
   `NOTA EXISTENTE (JSON, sección: cuerpo):\n<{noteJson}>` (es-MX). JSON is the
   contract; `[object Object]` violated it.
3. **Production precedent is a string, not an object.** `server/src/ai/prompts.ts:367`
   passes `request.noteText` into the refine prompt, so the shipped path never
   coerces an object. The Track2 corpus chose a JSON rendering; that choice is
   the corpus's and stands.

**Explicitly not part of the correction:** no indentation change, no key
reordering, no template edit, no gold edit, no schema edit, no `replacement`
field, no escaping, and no change to `fill()` itself. `fill()` already uses a
replacement *function* (`assemble.mjs:116-119`) precisely so that `$&` in case
content is not treated as a substitution pattern, and that must be left alone.

### 3.2 Proof the fix is surgical

I re-assembled all 44 corpus cases both ways (buggy and corrected) with the
frozen prompts, under pinned Node 24:

| Check | Result |
| --- | --- |
| My re-assembly reproduces the 32 recorded heldout `assembledSystemSha256` / `assembledUserSha256` from `runs/t2-A-test/results.jsonl` | **32 / 32 exact** — so my derivation is the study's |
| Corrected user prompt differs from recorded **only** for refine cases | **10 refine change, 34 non-refine byte-identical** |
| Any `[object Object]` outside refine | **none** |
| Corrected prompt still contains `[object Object]` | **none** |
| Unfilled placeholder survives in the corrected prompt | **none** |
| Prompt growth on repair | 14 chars → 241–821 chars of note JSON; user prompts grow 203–360 → 429–1 136 bytes |

So the corrected prompts are strictly a superset of information, and the 34
non-refine cases are provably untouched. Existing non-refine results and the
shipped blind packet need no re-run.

### 3.3 Source-field preservation assertions — pin these on dev before any rerun

These are the assertions that make the repair auditable. All ten were derived by
me from the frozen corpus and the frozen validator, and all ten pass on my
corrected re-assembly. The executor or coordinator should run them as a
mechanical check on `dev-en-v03` and `dev-es-MX-v03` **before** generating any
rerun output, and pin the two dev hashes.

**P1 — the two dev prompts must hash to exactly:**

| case | `assembledSystemSha256` | `assembledUserSha256` | user bytes |
| --- | --- | --- | --- |
| `dev-en-v03` | `9e36942b4efd…` | `953296eba2fc…` | 429 |
| `dev-es-MX-v03` | `d7b95f676c91…` | `feeca2e67f90…` | 452 |

(fulls: system `9e36942b4efd…` / `d7b95f676c91…` as above; user `953296eba2fc…`
and `feeca2e67f90…`. I derived these from the frozen template plus
`JSON.stringify(input.note)`; the coordinator should re-derive rather than
transcribe my prefixes.)

**P2 — extraction round-trip, all 10 refine cases:** extract the block between
the header line and the blank line preceding the request heading, `JSON.parse`
it, and assert the result deep-equals `input.note` and that
`Object.keys(parsed)` deep-equals `case.sections`. I measured **10 / 10 parses,
10 / 10 deep-equal, 10 / 10 key order equals `sections`**. The key-order
assertion is not mine alone: `corpus/validate-corpus.mjs:301-305` already
enforces `Object.keys(input.note) == sections` as a corpus invariant, so the
repaired prompt cannot silently reorder a note.

**P3 — verbatim field presence, per case:** the prompt contains
`JSON.stringify(input.note)` as an exact substring; contains `input.turn`
verbatim; contains `sections.join('\n')` verbatim; contains no unfilled
`<{…}>`; contains no `[object Object]`. I measured 10 / 10 on each.

**P4 — unchanged-by-construction:** for all 34 non-refine cases,
`assembledUserSha256` and `assembledSystemSha256` must be **identical** to the
values already recorded in `runs/t2-{A,C,D,E,G}-test/results.jsonl`. This is the
guard that a future edit to `assemble.mjs` has not leaked into the arms that are
not being rerun.

**P5 — no new content:** the corrected prompt must not contain any token absent
from `JSON.stringify(input.note) + input.turn + sections`. Equivalently, the
character count must equal `template.length − Σ(placeholder lengths) + Σ(content
lengths)`. This is the anti-scope-creep assertion.

**P6 — negative control:** assert that reverting the one line reproduces the
*recorded* defective hashes for all 10 refine cases. If the buggy hash is not
reproducible, the corpus or template has moved and the rerun must not proceed.

**P7 — no silent normalisation:** assert no section value is trimmed, re-encoded,
or stripped of an empty string. In all 10 cases every section value is
non-empty after `trim()`, so an empty-value normalisation would be unobservable
here — the coordinator may wish to note that as a residual gap in the corpus
rather than a gap in the fix.

**Rerun scope, on the evidence:** the 8 heldout refine cases × 3 runs ×
**6 arms (A, B, C, D, E, G) = 144**, plus **F's 4 es-MX refine cases × 3 = 12**,
total **156**. Non-refine results, the non-refine packet, and every non-refine
hash stay exactly as they are.

---

## 4. Blind packet — sound, with two disclosures the judge needs

Checked first, as instructed. I did **not** open `SEALED/alias-map.json`; the
output-to-arm match below was achieved by comparing packet samples against the
three recorded run files, which recovers the mapping in principle — so I report
only integrity statistics and blinding strength, never a sample-to-arm assignment.

**Verified sound:**

| Check | Result |
| --- | --- |
| `JUDGE/cases/*.md` source block vs the corpus, byte-for-byte | **24 / 24 verbatim** (drafting = `input.transcript`; treatment-plan = `diagnosis + "\n\n" + renderNoteList(notes)`; synthesis = `renderNoteList(notes)`) |
| Per-case `gold sha256` in each case file vs recomputed hash of the frozen gold record | **24 / 24** |
| 72 samples = 24 cases × 3, all `producedNothing: false`, no failures | **72 / 72** |
| Each sample's `produced` deep-equals one of the three arms' recorded `value`, all three present | **72 / 72**, 24 / 24 cases |
| `assembledSystemSha256` + `assembledUserSha256` identical across the 3 samples of every case | **24 / 24** — so the shipped request fingerprints are a constant per case and carry no arm signal |
| Filename pattern `S-<16 hex>.json` | 0 deviations, 72 / 72 |
| Leak sweep of `JUDGE/` for tag, vendor, base-model name, arm letter, `ollama`, `think`, `num_predict`, token/budget fields | **clean**; the only hits are the treatment-plan schema field literally named `baseline` and the rubric's generic use of the word "arms" |
| `rubric.md` sha256 vs `corpus-freeze.json` | **matches** (`f3bb58cb…`) |

So the packet faithfully carries the corpus, the gold, and the genuine Track2
outputs of three arms on three tasks. **The refine exclusion is correct**: judging
graceful confusion about `[object Object]` would reward a failure mode. My
§3 correction is what makes the refine column recoverable later.

**Disclosure 1 — output length is a perfect identity channel (affects style).**
Across all 24 cases, the **same** sample is the longest in **24 / 24** and the
**same** sample is the shortest in **24 / 24**; median longest/shortest ratio
1.71, max 3.75. The three systems are perfectly length-ordered in every case. I
deliberately do not name which sample, but the consequence is deterministic: a
judge who reasons "the longest outputs are the one system that reasoned with a
larger budget" — a hypothesis the README itself hands them — is **right in every
case**, and the sealed map is unnecessary to confirm it. The factual and
preference comparisons are largely unharmed, because both are *relative*. The
**style** comparison is not: length is exactly the axis on which a style judge
would drift, and a 1.71× systematic length gap is the kind of thing that reads as
"more thorough" in a 1–5 naturalness or format judgement. The README's single
global disclosure that one system ran with a larger budget **creates** this
channel; removing it would not, because the ordering is still recoverable.
Recommendation for the coordinator, not a change I can make: either (a) instruct
the judge explicitly that length must not inform any dimension score and treat
any identity hypothesis they form as disqualifying that sample's style score, or
(b) withhold length by presenting notes in a length-normalised or
section-count-first form. Option (b) is stronger and I recommend it if the style
result is to carry weight.

**Disclosure 2 — four cases contain a byte-identical pair (affects both).** In
`test-en-s01`, `test-en-s03`, `test-es-MX-s01` and `test-es-MX-s02` two of the
three systems emitted **byte-identical** output (all four are
multi-note-synthesis; the identical pair is the same pair of systems in all four
cases). A judge who does not know this will most likely read it as a packaging
duplicate. Fix by disclosure, not by re-packing: one line in `JUDGE/README.md` —
*a byte-identical pair is a legitimate result; score it as it appears, record a
tie, and do not infer that the two samples came from the same system.*

**Corrected denominator (coordinator ruling, 2026-09-28).** My earlier
"64 live pairwise comparisons" was wrong and is withdrawn: 72 is the **sample**
count, not a pairwise denominator. With three arms over 24 cases (12 en, 12
es-MX) and A as the common baseline, the correct pairwise denominator is
**2 candidates × 12 cases = 24 candidate-vs-baseline pairs per language, 48
total**. The four byte-identical pairs are all A-vs-C (2 en, 2 es-MX), so they
land as **4 forced ties inside those 48**, resolved by the rubric's own rule
(equal sums are ties) with no judge discretion required. The decision rule's
non-tied denominator is therefore **22 per language, not 24**, and that must
travel with the preference result. Nothing is dropped.

**Blinding ruling (coordinator, 2026-09-28), which I accept and record here.**
Output length is **not** to be used to normalise or otherwise alter the shipped
outputs — that would corrupt the evaluated product and the style evidence. The
blind judge has been told to ignore the budget hints, to evaluate against the
frozen rubric, to disclose any length or configuration inference they form, and
to treat byte-identical pairs as true ties. **Blinding is therefore limited, not
broken**: packet output lengths are a *risk channel*, not proof that the judge
identified any actual identity, and limited blinding is not by itself
invalidation. My §4 Disclosure 1 stands as a **disclosure requirement** — the
judge's own account of what they could infer is the evidence that matters — and
not as a ground to withhold the style comparison. Factual review stays active
and is not gated on any of this.

---

## 5. Further findings, bounded

**5.1 The dev smoke's one failure is confounded, and it is the *only* evidence
for the budget-sensitivity claim.** `fable-execution.md:90,100-104` reports
`think` separation working and a single failure whose reasoning ran to 17 497
characters and exhausted the 8 192 budget. That failure is
`dev-es-MX-v03` — a **refine** case, i.e. one of the two cases whose input was
corrupted to `[object Object]`. So Fable burned its budget on a nonsense prompt.
`fable-execution.md:194-196` then builds on it: "**This budget sensitivity is the
dominant theme of §7**" and "65 of 106 requests hit the length ceiling". The 65
of 106 is the 4B (§2). And the legitimate reading is the opposite of alarming:
on the 8 dev cases with intact input, Fable produced 8/8 valid on the first
attempt with 268–1 003 characters of reasoning. The one genuine signal is that
**a refine prompt containing `[object Object]` is enough to make Fable reason for
17 000 characters** — which is a finding about the corrupted input, and after the
§3 repair it must be re-measured before any budget claim stands.

**5.2 Track2 G's 96/96 is real but carries no discriminating power.** Confirmed
from `runs/t2-G-test/traces.jsonl`. G's refine column (24/24) is void for the §3
reason, so the honest G column is 72/72 on drafting, treatment-plan and
synthesis — the same as A and C. `fable-execution.md:129-132` states this
correctly. Retained for completeness: schema-validity is a contract fact, not
quality (`MODEL-STUDY-review.md` F3), and 96/96 says nothing about fidelity.

**5.3 G4 (the packet identity leak) is genuinely fixed.** I re-ran the sweep
independently (§4) and found no tag, arm letter, thinking flag or token field in
`JUDGE/`. The packager's clear-then-rebuild behaviour (`fable-execution.md:269`)
is the right instinct; keep it.

**5.4 Repair-budget accounting is worse than recorded.** G3
(`fable-execution.md:268`) claims the two-repair allowance was spent on two
items. The G1 defect (§3) is a **third** unrepaired defect in the Track2 assembler
and the study is now at **5 or more** repairs across its life against a cap of 2
(`plan:219`) — the same overage `DEVIATIONS.md:262-280` (T6) already conceded. The
load-check gap (§2.2) is a fourth. This does not affect any result's integrity —
no corpus, gold, prompt, schema, threshold or scorer was modified, and the
snapshot still matches the base commit — but the cap keeps being exceeded and
escalation still is not happening promptly. The coordinator should record the
cumulative count once, in one place, rather than per-extension.

**5.5 G2 (the interrupted run) is handled correctly.** 51 preserved and excluded,
chunks-only denominator, 45/51 duplication measured rather than assumed. One
correction to the record: `fable-execution.md:216` reports 45/51 identical on
`(contentChars, outputTokens)` and 6 differ, and uses the 6 to conclude G is
non-deterministic. That inference is sound *for a non-deterministic 4B*, and it
must not be carried forward as a property of Fable. Nothing in the valid Track2
data speaks to Fable's determinism, because Track2 recorded 32/32 identical
outputs for A, C and D and did not test G for it.

**5.6 Positive, and it should be said plainly.** The executor found the refine
defect *while building the review packet, before any quality review existed*, and
refused to repair it because repair would have meant tuning against test outcomes
(`fable-execution.md:250-257`). That is exactly right and it is why this audit
could reach a precise spec instead of a dispute. Acquisition provenance,
immutability, the sealed-map discipline, the retraction accounting table, and the
"no schema-validity-is-quality" refusal in §5 are all correct and well kept.

---

## 6. What I could not check

- **Acquisition integrity** (pinned revision, published LFS SHA256, byte count,
  CDN host). Verifying it means re-fetching, which is network egress I am not
  authorised to perform. The recorded evidence in
  `fable/manifests/{tree.json,repo.json,gguf-kv.txt}` and the two matching checks
  in `fable/logs/` are internally consistent; I take them as reported, not
  verified. If the coordinator wants this closed before G is reported to the
  owner, it needs one independent `sha256sum` of the local file against
  `fable/manifests/` — no network required.
- **The blind judge's identity and any judgements already returned.** I did not
  look in `fable/blind-judgments/`. Per instruction the identity is not mine to
  know, and the packet's two disclosure defects in §4 are best communicated to
  the judge by whoever owns the packet, not by me.
- **Anything about Fable's actual note quality.** No Track1 G data exists, and
  Track2 G is unscored. Nothing in this review supports or opposes recommending
  G for anything.

---

## 7. Bottom line, and the one thing that must happen before the owner's report

**Do not let any arm-G Track1 figure reach the owner, the decision table, or the
addendum's "does G earn further consideration" answer.** The measurement exists,
it is internally consistent, and it is of `qwen3.5:4b-q4_K_M` with thinking at
8 192 — arm B's configuration, under arm G's label. The single-line cause is
`harness/g-arm/g-cli.ts:18` reading `--model` while every invocation passed
`--models`, falling back to `PROMOTED_DEFAULT_MODEL`. The fix is a model-identity
assertion on the first real request, not a load-check.

The repair and the rerun the coordinator is considering are **independently
validated and safe to authorise**, on these terms: the change is exactly
`assemble.mjs:129` → `JSON.stringify(input.note)`, justified by the corpus's own
pinned validator at `corpus/validate-corpus.mjs:156`; the scope is **156**
case-runs across **7** arms (6 × 24 plus F's 12), not 132, and it **includes arm
B**; assertions P1–P6 are pinned and reproducible on the two dev refine cases
before generation starts; the 34 non-refine cases are provably untouched and
their existing results and packet samples stand; and every invalid original —
all 156 defective outputs, plus the void Track1 G directories — is preserved
byte-identical with a STATUS file, never relabelled or deleted.

The blind packet may be released for **factual and preference** adjudication once
one sentence about byte-identical pairs is added. Its **style** comparison should
wait on the coordinator's ruling about output length being a perfect identity
channel, because that is the one defect in this extension that could manufacture
a preference out of nothing.

And the standing limit from `MODEL-STUDY-review.md` is unchanged by any of this:
with G's Track1 void and every arm's Track2 factual and style adjudication
unstarted, the study still has no quality evidence for **any** candidate, and the
supportable answer to the owner remains *retain the 4B baseline*.

---

## 8. Cumulative repair and re-execution accounting (study-wide, A–G)

One place, as requested, superseding the per-extension tallies in
`DEVIATIONS.md:262-268` (T6) and `fable-execution.md` §8. **Docs-only revisions are
excluded throughout** — no rewrite of `execution.md`, `results.md`,
`fable-execution.md`, `DEVIATIONS.md`, the addendum or either review counts.
Cap for reference: `plan:219` — max 2 harness repair attempts, max 1 diagnostic
rerun per failed request.

### 8.1 Code repairs — defects found and fixed in the harness

| # | Repair | Ref | Severity had it shipped |
| --- | --- | --- | --- |
| C1 | Tee never piped the response body (+ open-trace set, + external 300 s abort) | D1 | arm A attempt 1 hung 600 s; 0 generations scored or lost |
| C2 | Generated `b-cli.ts` missing `join` import | D3a | would not compile |
| C3 | `SNAP` referenced, a generator-local name | D3b | would not compile |
| C4 | `runEval` imported from the **frozen** runner | D3c | **arm B would have measured arm A and reported it as arm B** |
| C5 | Provider import renamed instead of aliased | D3d | imports a name nobody exports |
| C6 | `TransformStream` destructured as iterable | T3 | 0 of 12 dev responses received; dev split caught it before heldout |
| C7 | F pivot assumed the source was one contiguous block | T4 | 8 of 16 F cases failed on a `replace()` that matched nothing |
| C8 | F JSON recovery (internals unitemised in the record) | T5-adjacent | contributed to F's treatment-plan 0/12 |

**Cumulative code repairs: 8 itemised** — four times the cap of 2, and the
overage is not a rounding matter.

**The record's own floor is higher than its stated total.** D1 is self-labelled
"**harness repair 3**" (`DEVIATIONS.md:23`), which implies **at least two
earlier repairs that `DEVIATIONS.md` never itemises**. T6's stated total of
"6 or more" therefore understates the study's own record by at least four, and
by at least two again once the unitemised predecessors are counted. **Defensible
statement: 8 itemised, ≥10 actual, against a cap of 2.**

### 8.2 Hardening and prevention — real work, not repairs

| # | Change | Ref |
| --- | --- | --- |
| H1 | Generated adapter is import-loaded before acceptance | D3 verification |
| H2 | `b-cli.ts` syntax-checked only, never imported; `run.ts` load-imported | D4 correction |
| H3 | Packager clears its output directory before rebuilding | G4 |
| H4 | Per-arm `num_predict` override so a declared decoding difference is expressible | T1 |
| H5 | Per-case checkpoint, append-and-flush, never recompute | T2 recovery |
| H6 | Retraction correction calls separated in cost accounting | `fable-execution.md` §6.2 |

### 8.3 Planned arm integration — neither repairs nor reruns

G3: (1) add arm G to the Track2 runner, (2) derive `harness/g-arm/` from the
verified B adapter. Feature work for a new arm; correctly not charged against the
repair cap, and the G1 refusal (`fable-execution.md:253-255`) was a
**non-repair**, which is the right call.

### 8.4 Execution re-execution — GPU work repeated, no code change

| # | Event | Duplicated work | Ref |
| --- | --- | --- | --- |
| R1 | Misdirected B-at-8192 resume re-ran the first 48 case-runs into a mistyped new directory; all 48 byte-identical | **48 case-runs, ~7 000 s, wholly wasted** | T2 |
| R2 | Whole-corpus G Track1 hit the 7 000 s cap at 51/60, 0 reports; re-run as 20 chunks | 51 overlapping fixture-runs, **6 with different output** | G2 |
| R3 | Arm A attempt 1 hung 600 s on the unpiped tee | 1 attempt, 0 scored | D1 |
| R4 | `b-cli.ts` imported as a module, ~120 s of real inference outside the lease | ~120 s, discarded unscored | D4 |
| R5 | T3 dev failure: 0 of 12 dev responses | 12 dev case-runs, unscored | T3 |
| R6 | T4 F field substitution: 8 of 16 cases failed | 8 F case-runs | T4 |

**Duplicated scored work: 54 case/fixture-runs (48 + 6), plus ~7 220 s of
unscored wall clock.** All six events were consequences of harness or operational
defects, not of a failed request, so **the plan's diagnostic-rerun allowance
(1 per failed request) was never invoked and remains unconsumed** — which is worth
stating plainly, because "no reruns were taken" and "no GPU was repeated" are
both true in different senses and only the second is the finding.

### 8.5 Open defects, authorized but not yet applied

Cumulative cap exception granted by the coordinator, 2026-09-28, offline only,
pending my acceptance of an exact staged patch:

| # | Authorized repair | Closes |
| --- | --- | --- |
| P1 | `assemble.mjs:129` → `JSON.stringify(input.note)`, assertions P1–P7 | G1 — 156 case-runs, 7 arms, **including B** |
| P2 | Strict **no-default** model CLI (no silent `PROMOTED_DEFAULT_MODEL` fallback) | the `g-arm` flag defect |
| P3 | Per-request model-identity invariant, **including retraction-correction calls and every retry** | ditto |

Authorized reruns after acceptance, and nothing broader: G Track1 72, plus the
156 affected refine case-runs, in new directories, single lease, frozen settings.
All original bytes preserved with STATUS files; a VOID report for the invalid
claims.

### 8.6 One root cause behind the three worst defects

C4, the `g-arm` flag defect and G1 are the same shape: **the harness verified
that code ran, never that the right value reached the wire or the model.** C4
imported the wrong module; the generator's load-check confirmed the file linked;
the flag mismatch fell through to a plausible default; and `selftest-assembly.mjs`
checked that every *placeholder* was filled but not that every filled value had a
sane *type*, so `[object Object]` passed as a filled field. The remedy is
identical in all three cases and is cheap — assert on the wire, per request, and
assert the value's type at assembly. `DEVIATIONS.md:308-313` names this pattern
for G1; it is worth naming once for the study, because it predicts the next
failure better than any individual defect does.

**Net:** 8 itemised / ≥10 actual code repairs against a cap of 2, 6 hardening
changes, 2 arm-integration items, 54 duplicated scored case-runs, 0 diagnostic
reruns consumed, 3 authorized repairs pending, 0 open defects undeclared.
Integrity is intact throughout — no corpus, gold, prompt, schema, threshold or
scorer was modified, the snapshot still matches
`05d9b1025e0e61be16489e12ba3109d63d48fa76`, and the failures stayed in their
denominators. The cost of the overage was GPU time and protocol credibility, not
data. That is the whole of it, and it is not nothing: two of the four capped
repairs that mattered most were the ones the cap should have stopped.

---

## 9. Repair-stage acceptance — 2026-09-28

Reviewed offline against the staged files, not the diff prose. No inference, no
source or corpus edit, no sealed-map access. Node pinned `v24.19.0`; my scripts
in `/tmp/opencode/mlsrev`. Authorization read at
`docs/research/fable-therapy-study-addendum.md` §"Corrective authorization".

### 9.1 What I verified

| # | Check | Result |
| --- | --- | --- |
| 1 | All 6 staged file hashes vs `fable/REPAIR-STAGE.diff` | **6 / 6 exact** |
| 2 | `identity-selftest.mjs`, re-run by me | **30 passed, 0 failed**; genuinely offline (its fetch throws if called) |
| 3 | **P1** dev hashes vs my pre-repair derivation | **exact**: `dev-en-v03` `9e36942b4efd…`/`953296eba2fc…` (429 B); `dev-es-MX-v03` `d7b95f676c91…`/`feeca2e67f90…` (452 B) |
| 4 | **P2** round-trip, deep-equal, key order == `sections` | **10 / 10** |
| 5 | **P3** no `[object Object]`, no unfilled placeholder | **44 / 44** and **44 / 44**; note/turn/sectionList verbatim **10 / 10** |
| 6 | **P4** non-refine prompts unchanged | **24 / 24** byte-identical to what A, C and G actually sent (the 12 dev cases have no recorded counterpart — expected) |
| 7 | **P5** no new content | **10 / 10**, no stray character |
| 8 | **P6** buggy-input negative control | buggy hash reproduces the recorded defective hash on **all 32** recorded cases; the literal appears on exactly the 10 refine cases and nowhere else |
| 9 | **P7** no value normalisation | **10 / 10** intact; **0** empty values, so no normalisation is even observable |
| 10 | Strict CLI negative flags, incl. the exact `--models` plural defect, with a bogus corpus as a second barrier | **5 / 5 exit 1** with `ModelIdentityError` and **no output file written**; throws before `loadCorpus`, hence before any socket |
| 11 | `PROMOTED_DEFAULT_MODEL` in `g-cli.ts` | **import removed entirely** — the fallback is not bypassed, it is out of scope |
| 12 | `run.ts` arm table, G entry | `apunta-study-fable-therapy-9b-q4:latest`, `think: true`, `numPredict: 8192` — correct |
| 13 | Preservation: `sha256sum -c fable/G-TRACK1-PRESERVATION.sha256` | **376 OK, 0 failed**; manifest taken 19:40:42Z, *before* labelling |
| 14 | Files modified after the repair stage | **0**; originals still show the 4B and the label/model mismatch — not quietly corrected |
| 15 | STATUS records | **23** `STATUS-VOID.md`, one per voided G Track1 directory |
| 16 | Corpus freeze | **12 / 12** hashes match |
| 17 | Snapshot vs base commit `05d9b102…` | **1450 / 1450** identical, 0 differing, 0 missing |
| 18 | `DEFAULT_OLLAMA_URL` | `http://127.0.0.1:11434` — loopback confirmed |
| 19 | `fable-execution.md` VOID marking | head notice plus per-section markers, text preserved unedited; the G2 determinism claim is correctly marked void for any Fable inference |

**P1–P7 all pass.** The repair is exactly one semantic change, correctly
justified by the corpus's own hash-bound validator at `validate-corpus.mjs:156`,
and provably inert for the 34 non-refine cases.

### 9.2 The request-side guard is sound and closes the defect class

Every model-bearing request must pass `assertRequest` at the single `fetch`
choke point, and a mismatch **throws before the socket**. That covers the
drafting call, the retraction-correction call and every retry of both, because
all three go through `globalThis.fetch` — which is what makes it a contract
rather than a convention. The two operator-supplied values (`--model` on the
driver, `APUNTA_EXPECTED_MODEL` in the environment) must agree, and the guard
enforces the agreement, so an operator error in either place fails closed. For
Track2 the model comes from the runner's own table, not a flag, so the assertion
is a regression check on the table — which is the right shape.

### 9.3 Two shortfalls against the addendum's own wording

**A — response identity is weaker than authorized, and is not fail-closed.**

- `installIdentityFetchGuard` calls `verifyResponse` **only** for `/api/show`
  (`identity-guard.mjs:181`). **No generation response is ever identity-checked** —
  not `/api/chat` drafting, not the correction response, not any retry. The
  executor's "/api/show mismatch counted" is accurate, but a pre-flight metadata
  probe is not the generation responses the addendum asks about.
- `verifyResponse` **never throws** (`:146`, and selftest 4 asserts "counted, not
  thrown"), and `run.ts:494` exits 70 on `guard.state.violations`, which counts
  **request** violations only. A response mismatch is logged and the run **still
  exits 0 and writes its report**.
- **Digest is not checked at all**, though the addendum says "Check response
  identity **and digest** where available". `/api/show` returns `digest`,
  `details.parameter_size` and `details.quantization_level` — the fields that
  would bind a response to the intended 5.6 GB Fable artifact. Its `model` field
  merely echoes the requested name for a Modelfile-created model, so it is a weak
  check that would probably **not** have caught G6 either.

**Assessment: the defect class is closed on the request side, which is the side
that matters, so I accept release on that basis.** A is a documented shortfall,
not a blocker, and it is cheaper to close with one offline assertion than with a
harness change — see condition C2.

**B — the egress guard is not installed on the adapter path** (pre-existing; not
introduced by this repair). `g-cli.ts`, `b-cli.ts`, `g-arm/run.ts` and
`tee-eval.ts` never call `installEgressGuard()`; only the frozen
`server/src/eval/cli.ts:7` does. So `execution.md:32` ("the frozen CLI installs
the production egress guard itself and it stayed outermost") and
`identity-guard.mjs:19-20` ("the egress guard still sits outside it") are both
inaccurate **for arms B and G**. Practical exposure is nil — I confirmed
`DEFAULT_OLLAMA_URL = http://127.0.0.1:11434` and every captured request URL is
`http://127.0.0.1:11434/...` — but the G Track1 path now verifies *which model* at
the one choke point that does **not** verify *where*. One line in the rerun
record, no code change (condition C3).

### 9.4 REJECTED: arm F's 12 case-runs — release the other 144

`harness/track2/run-f.ts` has **no `--cases` filter** (only `--runs` and `--out`;
it hardcodes `loadCases('test','es-MX')` at `:284`) and does **not** install the
identity guard. So:

1. F cannot be scoped to its 4 affected refine cases. Running it re-runs all 16
   Spanish cases × 3 = **48**, i.e. **36 case-runs beyond the authorized 12**.
2. F is legitimately a **two-model** arm — `translategemma:4b` for both translation
   legs plus arm A as the writer — so a single-`expectedModel` guard cannot cover
   it, which is presumably why it was left out. F's rerun would therefore be the
   **only arm in the 156 running with no wire identity assertion at all** — the
   exact condition that produced G6.

Per the addendum, "a further contract defect stops generation for a handoff
rather than silently extending this scope", I hold F rather than proceed. **The
decision cost is nil:** F is already eliminated on structure (treatment-plan
0/12) and cannot be selected until the pivot's nested-JSON failure is addressed,
so its refine numbers change nothing. Scoping F properly needs either a
`--cases` filter plus a two-model identity assertion in `run-f.ts` — a **fourth**
code change, requiring separate authorization — or the coordinator's explicit
written acceptance of F's full 48 and its unguarded status.

`run.ts` itself is fine: `--cases` exists (`:98`, comma-separated exact ids at
`:434-438`), so A/B/C/D/E/G scope exactly to
6 arms × 8 cases × 3 = **144**.

### 9.5 Accepted, with three conditions

**ACCEPT** — G Track1 72 case-runs, and the refine rerun for **A, B, C, D, E, G
only (144 case-runs)**. Rejected for F per §9.4.

- **C1 — release against the recipe in §9.8, which supersedes the faulty one
  first printed here.** Three errors in the earlier block, all caught by the
  coordinator and confirmed by me on re-reading the sources: it passed the
  **plural** `--models` (which the new guard rejects — the exact defect class it
  was written to close), it **omitted `--fixture`**, so each of the 20 iterations
  would have re-run the whole corpus, and it **omitted `TEE_EVAL_CLI`**, so
  `tee-eval.ts:47` would have fallen back to the frozen `cli.ts` and never
  invoked the G adapter at all — the run would have been a non-G run wearing a G
  run id. Do not copy the earlier block; it is retained only as the record of
  what was wrong.

- **C2 — artifact digest cross-check, offline, before generation.** Record the
  **full sha256 of the local artifact** `fable/gguf/Fable-Therapy-9B-Q4_K_M.gguf`
  and check it against the pinned `810a61039f3e4131c0e328cfe28c5a26fb26741d4aaa6d77c650ff13be782633`
  in `fable/manifests/`, and record the `/api/show` metadata **verbatim, whatever
  fields it actually returns**. Note for the record: the captured
  `fable/manifests/ollama-show.txt` is the `ollama show` **CLI** rendering, and it
  contains **no `digest` field at all** (0 occurrences) — it does carry
  `architecture qwen35`, `parameters 9.0B`, `context length 262144`,
  `quantization Q4_K_M`, capabilities `tools/thinking/completion` and
  `num_ctx 16384`, which is the recorded evidence that the runtime is serving the
  intended artifact shape. Whether the raw `/api/show` JSON carries a `digest` is
  **not** established by anything on disk. So: cross-check the **file** digest and
  the show metadata; **record the raw response as-is; if no `digest` is present,
  state that plainly and do not substitute, infer or construct one.** No new
  inference, no GPU, no network.

- **C3 — record the loopback base URL** in the rerun manifest, per §9.3B.

**Also accepted, with a recorded note:** the `typeof input.note === 'string'`
passthrough branch in `assemble.mjs:135` is scope wider than my spec. It is
**unreachable** under the frozen corpus (all 10 refine notes are objects; a change
would fail the freeze), **no assertion covers it**, and it is **byte-neutral** for
all 44 cases — so deleting it cannot change any hash and can be done
opportunistically. It is not a blocker either way.

### 9.6 Reconciliation of the 13, with no cap reset

Executor table: 13 named passes — D1, D3a, D3b, D3c, D3d, T3, T4, G1, G4a, G4b,
G6, G7, G8. My §8.1: 8 code repairs. The union is 14; the differences are
classification, not omission: the executor folds my C8 (T5-adjacent JSON
recovery) into T4, and I had classified G4a/G4b as hardening and G1/G6 as *open*,
not repaired.

The addendum's arithmetic — "eight itemised code repairs and at least ten actual
**before these three authorized corrections**" — gives 10 + 3 = **13**, matching
the executor exactly, **provided G1's fix counts as one of the three corrective
passes.** Two corrections to the record, neither of which is a cap reset:

1. **The stage column under-tags the corrective work.** It marks only G7 and G8
   as "corrective (exception)"; G1's fix and G6's fix are the other two authorized
   corrections and are tagged "Track2" and "G Track1".
2. **The total should read 15, not 13, if the exception's own overage is counted.**
   G7 (the fix accepted a whitespace-only model value) and G8 (the negative test
   counted entries to the guard, so it could not fail) are defects *inside* the
   corrective work. **10 pre-authorization + 3 authorized + 2 exception-internal
   = 15 against a cap of 2.** G8 is the more serious of the two and is named as
   such by the executor, which is to its credit.

**No cap reset has occurred, and none is claimed.** The addendum states the
exception explicitly and disclaims compliance; the executor's table states "13
cumulative repair passes. The cap was 2." That posture is correct. Only the stage
column and the total need the amendment above.

### 9.7 Denominator correction — coordinator's ruling accepted, my figure withdrawn

I accept the ruling and withdraw my "22 per language pooled" figure entirely. The
correct structure:

- **48 candidate-vs-baseline pairs = 2 challengers × 24 cases**, pooled for
  *description* only.
- Thresholds and non-tied counts apply **per challenger and per language**:
  12 cases per language per challenger, so **4 cells** (C-en, C-es-MX, G-en,
  G-es-MX) of **12 pairs each**, summing to 48.
- The 4 byte-identical A≡C pairs are 2 en + 2 es-MX, and both fall in the **C**
  challenger. So **C carries 2 forced ties per language → non-tied denominator 10
  per language; G carries 0 → 12 per language.** Identical output is a tie inside
  the cell, resolved by the rubric's own "equal sums are ties" with no judge
  discretion; nothing is removed from any denominator.
- The rule's ≥60%-of-non-tied and wins−losses ≥ 4 are then evaluated **within each
  of the four cells**, which is stricter than the pooled reading and is the
  correct one. The final non-tied denominator must follow the judge's actual
  recorded ties, not a prior count.

---

## 9.8 Corrected, verified G Track1 recipe (72 case-runs) — supersedes §9.5 C1

Every element below was checked against the source, not from the previous
document. Offline; no inference was run to produce it.

### What the sources actually require

| Fact | Source | Consequence for the recipe |
| --- | --- | --- |
| `tee-eval.ts:47` — `const CLI = process.env['TEE_EVAL_CLI'] ?? join(SNAPSHOT,'server/src/eval/cli.ts')` | read | **`TEE_EVAL_CLI` must be exported**, or the frozen CLI runs and the G adapter is never invoked |
| `tee-eval.ts:69-76` — `runId = argv[0]`, requires the first `--`, `cliArgs = argv.slice(sep+1)`; `:451` `process.argv = [execPath, CLI, ...cliArgs]` | read | exactly **one** `--`, between run id and CLI args; the CLI never sees it |
| `rejectUnknownFlags` rejects **any** `--`-prefixed token not in the allowlist, `--` included | read + test | a stray `--` reaching the CLI is fatal (verified, exit 1) |
| allowlist is `['--runs','--corpus','--out','--out-json','--fixture']` **plus** `--model` | `g-cli.ts:29` | no other flag may appear |
| `g-cli.ts:30` `requireExplicitModel(..., '--model')`; no default, plural rejected | read + 5 tests | singular `--model` only, value non-blank, given once |
| `g-cli.ts:31,36` `--fixture` → `loadCorpus(dir).filter(f => f.filename.includes(prefix))` | read | two-digit prefix **with** trailing dash |
| `loadCorpus` on `e2e/fixtures/eval` = 20 fixtures `01-`…`20-`; on `e2e/fixtures/eval-owner` = 4 fixtures `01-`…`04-`; each prefix selects **exactly 1** | measured offline | 24 invocations × 3 runs = **72** |
| `tee-eval.ts:58-66` — exits 2 unless `APUNTA_EXPECTED_MODEL` is set and non-blank | read + test (exit 2 observed) | the variable is mandatory |

**Flag-set proof (offline, no network).** Invoking `g-cli.ts` with the exact
intended flag set but a fixture prefix matching nothing (`ZZ-`) against the real
corpora returns **exit 2, "no fixture selected"** — i.e. every flag validated and
execution stopped at the corpus step, before any socket. The same invocation with
plural `--models`, inline `--models=`, no `--model`, a stray `--`, or the old
§9.5 form returns **exit 1, `ModelIdentityError`**. The discriminator is exact:
exit 2 = flags accepted; exit 1 = guard rejected.

### The recipe

```sh
R=/home/villenull/.cache/apunta-model-study/2026-09-27
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH"

# C2 first: artifact digest cross-check, offline. Record the raw response as-is.
sha256sum "$R/fable/gguf/Fable-Therapy-9B-Q4_K_M.gguf"      # expect 810a6103…
# compare against fable/manifests/; record /api/show output verbatim, digest or no digest

cd "$R/snapshot"
export INIT_CWD="$R/snapshot"                                # absolute paths only

# --- identity wiring: the SAME string in both places, visibly ---
export APUNTA_EXPECTED_MODEL='apunta-study-fable-therapy-9b-q4:latest'
export TEE_EVAL_CLI="$R/harness/g-arm/g-cli.ts"              # NOT the frozen cli.ts
M="$APUNTA_EXPECTED_MODEL"

# --- 20 eval fixtures, one invocation each, so no report is lost to a stage cap ---
for f in 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20; do
  "$R/harness/with-lease.sh" node_modules/.bin/tsx "$R/harness/tee-eval.ts" \
    "t1-G2-eval-$f" -- \
      --runs 3 \
      --model "$M" \
      --fixture "$f-" \
      --corpus "$R/snapshot/e2e/fixtures/eval" \
      --out      "$R/runs/t1-G2-eval-$f/report.md" \
      --out-json "$R/runs/t1-G2-eval-$f/scores.json"
done

# --- 4 eval-owner fixtures, same env, same singular --model, different corpus ---
for f in 01 02 03 04; do
  "$R/harness/with-lease.sh" node_modules/.bin/tsx "$R/harness/tee-eval.ts" \
    "t1-G2-owner-$f" -- \
      --runs 3 \
      --model "$M" \
      --fixture "$f-" \
      --corpus "$R/snapshot/e2e/fixtures/eval-owner" \
      --out      "$R/runs/t1-G2-owner-$f/report.md" \
      --out-json "$R/runs/t1-G2-owner-$f/scores.json"
done
```

24 invocations, 3 runs each, **72 case-runs**, all under the one lease, in new
`t1-G2-*` directories, nothing overwritten.

### Stop conditions — check these before trusting any output

1. `runs/t1-G2-*/scores.json` must read `"model": "apunta-study-fable-therapy-9b-q4:latest"`.
   If it reads the 4B, the run is void on its face — that is the G6 fingerprint and
   it is now visible in the artefact rather than only in a request body.
2. `runs/t1-G2-*/identity-summary.json` must exist for every invocation. Read
   `checked`, **`violations`, `responseChecked`, `responseMismatch`,
   `responseAbsent`** — the console line reporting "0 violations" covers
   `violations` only and says nothing about responses (§9.3A). `checked` must
   equal the request count, and must include the 3 retraction-correction calls.
3. `runs/t1-G2-*/identity-ledger.jsonl` must contain **no** `request-violation`
   line. Any occurrence voids that invocation.
4. `run-manifest.json` must record `frozenCli` = the G adapter path and `cliArgs`
   with singular `--model`; if it shows the frozen `cli.ts`, `TEE_EVAL_CLI` did not
   take effect and the whole batch is void.
5. `DEFAULT_OLLAMA_URL` recorded as `http://127.0.0.1:11434` (C3).

### Not in this recipe

Arm F (held, §9.4), and the six-arm refine rerun of 144, which is separately
released and does not go through `tee-eval.ts` at all:

```sh
CASES=test-en-r01,test-en-r02,test-en-r03,test-en-r04,test-es-MX-r01,test-es-MX-r02,test-es-MX-r03,test-es-MX-r04
for A in A B C D E G; do
  "$R/harness/with-lease.sh" node_modules/.bin/tsx "$R/harness/track2/run.ts" \
    --arm "$A" --split test --cases "$CASES" --runs 3 --out "$R/runs/t2-${A}-test-refine-fixed"
done
```

`run.ts` takes its model from its own arm table, so it needs no `--model` and no
`APUNTA_EXPECTED_MODEL`; its guard is a regression check on that table, and it
writes the same `identity-summary.json` and `identity-ledger.jsonl`, with the
same stop conditions 2 and 3 applying.

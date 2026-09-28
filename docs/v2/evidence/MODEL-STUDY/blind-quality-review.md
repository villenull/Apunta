# Blind quality review — 72 anonymous outputs, 24 held-out cases

**Status:** one bounded review pass, complete. Exploratory model-only evaluation.
**Not clinical certification, and not a clinical instrument.** The es-MX gold is
*reviewed, not certified* — no native es-MX clinician has read it.

**What was read.** `review-bundle/JUDGE` and nothing else: `README.md`,
`review-sheet.md`, `rubric.md`, `EXCLUSIONS.md`, `manifest.json`, all 24
`cases/*.md`, all 72 `outputs/*.json`. The sibling `SEALED/` directory, the
alias map, the model study plan, the execution and results reports, model
metadata and every other agent's report were **not** opened. No identity was
supplied and none was inferred. No model is named in this document, and no
conclusion about any named system is drawn.

**Machine-readable judgments:** `blind-judgments/judgments.json` (per-sample
denominators, critical errors, inventions, uncertainty, style scores with
basis, and per-case equivalence/preference/tie records).

---

## 1. What this review is and is not

This is an exploratory, model-only, single-pass assessment of writing quality on
a synthetic corpus. It is not clinical certification, and no score here may be
presented as one. The dispositions in the corpus were accepted as *exploratory
fidelity conventions only*. The rubric states this itself: it "is not a clinical
instrument" and "judges three writing properties, against a frozen prompt, on
synthetic invented material."

### Blinding limitations, disclosed

1. **Output length was a residual configuration cue.** Per-sample budget,
   thinking and token fields were withheld from this packet because on this data
   either one identifies which system produced which output. **Character count
   was not withheld**, and it ranges from 85 to 1021 characters (treatment-plan
   median 396, synthesis 633, drafting 778). Because the most verbose strategy
   in this corpus is verbatim copying, any reviewer who silently rewards
   verbosity is implicitly ranking by likely compute or reasoning budget. This
   document does not do that: scoring used the frozen rubric's **required
   concision** and **required factual completeness**, and no preference was
   awarded for length at any point. The limitation is disclosed rather than
   eliminated, because it cannot be eliminated from this packet.
2. **The packet's own note that one system ran at a larger budget and emitted
   visible reasoning was disregarded** for scoring, per instruction.
3. **Refine is absent.** 24 of 96 collected samples were withheld for a harness
   defect (`EXCLUSIONS.md`: the corpus refine note object was string-coerced to
   the literal `[object Object]` for every arm). This review therefore covers
   **3 of 4 tasks** and says nothing at all about refine behaviour.
4. **es-MX naturalness scores are the weakest numbers here.** I am not a native
   reader of Mexican locution. The clarity and format scales are normative in
   English for both languages per the rubric's own rules, and I applied them
   that way; the es-MX naturalness scores are my best judgement and should be
   re-read by a native speaker before anyone leans on them.

---

## 2. Packet integrity, verified independently

- All **24 case-file** and **72 sample-file** SHA-256 values recomputed and
  matched against `manifest.json`. Rubric hash matched.
- Every case file contains both the verbatim source **and** the gold
  propositions and forbidden inventions. **No case was malformed and none was
  insufficient.** Nothing is recorded as unresolved on those grounds.
- All 72 outputs are present, parseable, and have `producedNothing: false` and
  `failure: null`. No refusals, no timeouts, no guard failures, no invalid JSON.
- **Four byte-identical output pairs** confirmed as legitimate and **retained as
  ties**, with the paired per-case denominator kept intact:
  `test-en-s01` (S-75dd2c7 / S-c30cc4a), `test-en-s03` (S-4940c7f / S-c1c4155),
  `test-es-MX-s01` (S-b435eb7 / S-fd220a6), `test-es-MX-s02` (S-539bbd8 /
  S-ed76938). These are ties by construction, not ties I had to adjudicate.
- Outputs were read verbatim. No length-normalisation, truncation or
  summarisation of any output.

---

## 3. Factual findings first

Gold coverage across all 72 samples: **341 / 498 propositions (68.5%)**.
Per-case denominators are retained per case (drafting 7–10, treatment-plan 5–6,
synthesis 5–8); they are not pooled into a single figure without the case
attached.

| | count |
|---|---|
| Samples carrying **every** gold proposition | 26 / 72 |
| Samples carrying **no** gold proposition in full | 4 / 72 |
| Samples with at least one **critical** error or omission | 48 / 72 |
| Samples with a **demonstrated** forbidden invention | 13 / 72 |
| Uncertain findings recorded rather than resolved | 31 |

### 3.1 Demonstrated forbidden inventions (13 samples)

The sharpest single finding, and the one I would act on first:

**Carrying a retracted value is the most common critical violation in the
packet, and it is caused by faithfulness itself.**
`test-en-s04` and `test-es-MX-s04` both state the rule explicitly: a correction
history counts as carrying the corrected figure, and the retracted value must not
be named "in any function", not even as what it used to be.

- `S-7055586675a926ca` — names the retracted `six hours`.
- `S-ac2f85907f665449` — names **both** retracted values (`at bedtime` and `six
  hours`) and carries both as explicit corrections. This is simultaneously the
  **most proposition-complete output in its case (6/6)**.
- `S-c25c9f1ddbaf9861`, `S-f9a2bcbe6973277a` (es-MX) — name the retracted
  `seis horas`.
- `S-e57229b622ed62eb` (es-MX) — names the retracted `al acostarse`, **and**
  invents a drug name.

The consequence is the study's central tension, stated plainly: **the two most
faithful outputs in `test-en-s04` both violate the prohibition, and the only
output that respects it (`S-cececd90252f9383`, which never writes "six hours")
achieves that by dropping the entire medication regimen — 4/6 instead of 6/6.**
In es-MX the same trade is made for a different currency: `S-e57229b622ed62eb`
is the only es-MX output that correctly declines to name the retracted sleep
figure, and it pays for that by writing **"dos pastillas de escitalopram"** into
a clinical record whose source names no medication at all. That is the most
serious single fabrication in the es-MX half, and **no cue string in the case
catches it** — `no-invented-drug-name` exists in `d03` but not in `s04`.

Other demonstrated critical inventions:

- `S-09fec79cee4bcf8c` (es-MX p03) — invents `registrar el peso` as both an
  intervention and a measure, in the one case whose third note says no measures,
  tasks or plan were set, while omitting the sentence that says so. The
  self-contradiction is the finding.
- `S-0cdc58618c1fec4a` (en p03) — same failure in English: `track weight change`
  as a measure the notes say was not set.
- `S-7f2399eeec8a7564` (es-MX p02) — invents `seis horas` (the notes say eight
  then four) **and** the instruction `Seguir las notas clínicas para monitorear
  cambios en la duración del sueño`, which is not actionable by a patient and is
  in no note. Two critical fabrications, no proposition carried in full.
- `S-953879943dfac90f` (es-MX d02) — fabricates `oficina de la terapeuta` (the
  source says only "in person") and converts a next-session clinical starting
  point into a between-session patient task, `mantener el sueño estable`.
- `S-92b2a04c0fc30c4e` (es-MX d03) — actor shift: `Acordamos traer la etiqueta`
  makes the clinician the person who brings the label. The source is "we agreed
  **that he** brings it".
- `S-4fe728c7f8fb26f8` (en p02) — number misbinding: attaches `four hours` to
  `time awake from 3am`, so the note says four hours of sleep became four hours
  awake. The clinical picture is misstated.
- `S-23be1262aa332018` / `S-2adcdbce13184700` (es-MX s03) — translate a
  code-switching client's quoted English (`chest feels tight`) into unmarked
  Spanish and present it as her words, which `code-switching-is-her-voice`
  explicitly forbids. **The correct handling appears exactly once in the whole
  packet**: `S-35f26569f45093fc` keeps both English fragments in English and
  marks them as hers.

### 3.2 Critical omissions, by pattern

- **The recorded medication dose is dropped by 5 of 6 treatment-plan outputs**
  for the two p01 cases (en: 1 of 3 carried it; es-MX: 0 of 3).
- **The risk denial is dropped by 6 of 6 outputs** in `test-en-p03` and
  `test-es-MX-p03`, both cases where the denial is not the plan's subject.
- **The 2018 attempt is dropped by 5 of 6** outputs in the two p04 cases, in
  plans whose goal is self-harm risk. No output in either language carried the
  attempt together with a correct evidence citation.
- **Whole-thread deletion.** `S-e0767f403b0f9b9d` (en d02) and
  `S-a2455b7d67a7fbd6` (es-MX d02) both delete the entire mother-with-insomnia
  thread. A clinician reading either note would not know the mother exists. Note
  that `actor-not-swapped` is **not** violated: the thread is dropped, not
  reassigned — a string screen would score these clean.
- **`disagreement-visible` failed in all six p02 outputs.** The case's whole
  design is that the two sleep reports must be shown to disagree. `S-4fe728c7f8fb26f8`
  and `S-2769d813512da274` go further and *erase* it, setting the superseded
  eight-hour figure as the untimed baseline for a patient the third note says
  sleeps four. `S-e8da039510433d64` puts both figures side by side with no
  ordering, so the reader cannot tell which is current.

### 3.3 Demonstrated cue false positives (12)

Recorded because they are the reason no verdict in this document derives from a
string match:

- `50 mg` inside the source's **own correction narrative** in `test-en-d03` and
  `test-es-MX-d03` is **not** a `retracted-dose-not-kept` violation: those rows
  state no invariant. **The same cue is a genuine violation in `s04`**, whose
  row states the opposite rule explicitly. The two rows are not consistent with
  each other — a corpus issue worth fixing.
- `safety plan` / `plan de seguridad` in the drafting cases is the source's own
  content, not an invention. In `S-3694d2758820e210` the output *checks* whether
  a written plan exists; it does not invent one.
- `wants to stop` / `quiere dejar` in all four s04 cases is the client's wish,
  which the `no-stop-instruction` invariant names as **required content**.
- `insomnia complaint` in `S-e8da039510433d64` echoes the source header, which
  says in terms that it is *not yet a diagnosis*.

---

## 4. Style, second, and separately

Scored against the frozen `rubric.md` only, as written, in its own language,
format before clarity before naturalness, integers 1–5, reason recorded for
every 1 and every 5.

**Style was compared only where two outputs were judged factually equivalent.**
A factually better output does not win on style, and a factually worse one is
recorded as a separate result, not a loser.

| | cases |
|---|---|
| Cases where a factually-equivalent pair existed | **9 / 24** |
| Cases with no admissible comparison | **15 / 24** |
| Preference decisions recorded | 8 (of which **3 ties**) |
| Comparison withheld, not equivalent | 1 (`test-es-MX-s04`) |

The 15 cases without a comparison are not a scoring failure. They are the
factual-equivalence gate doing its job: where one output carried 10/10, another
9/10 and a third 3/10, there is nothing to prefer between on style.

### The admissible comparisons, in full

| case | equivalent pair | decision | separates on |
|---|---|---|---|
| en d03 | a72ff64 ≡ f5a509e | **f5a509e** 9 vs 8 | clarity 4 vs 3 — each fact in the section that matches it |
| en d04 | 4b545b8 ≡ b7976ff | **tie** (12 = 12) | — |
| en p04 | 1ed4595 ≡ be96591 | **be96591** 10 vs 8 | format 4 vs 2 — measure/baseline populated vs empty |
| en s01 | 75dd2c7 ≡ c30cc4a ≡ fe5e5fa | **75dd2c7 / c30cc4a** 13 vs 12 | format 5 vs 4 — one fact per cited line |
| en s03 | 4940c7f ≡ c1c4155 | **tie** (identical) | — |
| es-MX d04 | 353201d ≡ 565b8c9 | **353201d** 8 vs 7 | naturalness 3 vs 2 — finite verbs vs verbless fragments |
| es-MX s01 | 2b1c1b2 ≡ b435eb7 ≡ fd220a6 | **b435eb7 / fd220a6** 13 vs 12 | format 5 vs 4 — one fact per cited line |
| es-MX s02 | 539bbd8 ≡ 738c111 ≡ ed76938 | **539bbd8 / ed76938** 13 vs 12 | format 5 vs 4 — one fact per cited line |
| es-MX s03 | 23be126 ≡ 2adcdbc | **23be126** 11 vs 9 | format 5 vs 3 — one fact per cited line |

Six of the eight decisions are **format** separations on citation granularity,
and six of eight separate an eight-or-ten-line output from a three-or-four-line
one. That is the rubric's concision requirement doing exactly what it should:
the more granular output is the more economical one for a consumer, even though
it is the longer one. **I want this stated plainly, because it is the point at
which a length bias and a rubric-following judgement come apart** — and I
followed the rubric.

### Style patterns worth carrying forward

- **The same content scores 2 or 4 on naturalness purely on sentence shape.**
  `S-394df94cf9624ac0` (verbless lowercase semicolon fragments) scores 2;
  `S-4940c7f690fc0510` (the same facts as sentences) scores 4. Nothing else
  differs. This is the largest style effect in the packet and it is not about
  content quality at all.
- **Format collapses wherever a section is a copy of its neighbour.** Repeating
  the label-bringing three times (en d03), duplicating `measure` and `baseline`
  as identical strings across three objectives (es-MX p04), and restating
  `Discussion` inside `Note for next session` (en d02) all land at 2–3.
- **es-MX showed no systematic translation tells.** Where the es-MX samples are
  wrong, they are wrong in the same semantic ways as the English — omission,
  misattribution, invented measure. The two genuine translation tells are
  specific and diagnostic: a code-switching client's English words translated
  into unmarked Spanish (es-MX s03), and `no al acostarse` / `quien es quien`
  calques (es-MX s04, s03).

---

## 5. Findings about the instruments, not the systems

These are about the packet, and I think they are worth more than the style
scores.

1. **`producedNothing` under-detects degenerate output.**
   `S-8c483d998cd0712b` produced
   `{"goals":[{"statement":"","objectives":[],"interventions":[],"evidence":[]}]}`
   and is flagged `producedNothing: false`. `manifest.json` reports
   `samplesProducedNothing: 0` across all 72. This is structurally valid JSON
   with no content in it. The README explicitly warns that a nothing-producing
   run "does not get to be quietly better than a refusal" — but a run that
   produces an empty object is not counted as one at all. **Recommend treating
   "parseable but carries no content" as `producedNothing` before any scoring.**
2. **The `retracted-dose-not-kept` rows are inconsistent between cases.**
   `d03` (both languages) states no invariant, so carrying `50 mg` inside the
   source's own correction is fine; `s04` (both languages) forbids it explicitly.
   Same cue, opposite verdicts, four samples affected either way. The corpus
   should say which rule it wants.
3. **`no-invented-drug-name` exists in `d03` but not in `s04`,** and `s04`'s
   source also names no medication. The most serious fabrication I found —
   `escitalopram` invented in es-MX s04 — is invisible to the cue list.
4. **The `Tareas entre sesiones` / `Out of session actions` section semantics are
   ambiguous.** The safety-plan-and-crisis-line agreement (drafting d01) and the
   bring-the-label task (drafting d03) both fall between `Intervención` and
   between-sessions. I had to adjudicate this case by case, and it is the main
   reason `format` varies between 2 and 5 on otherwise equivalent content.
5. **The frozen rubric has no dimension for synthesised-versus-copied.** In a
   *multi-note-synthesis* task, the highest-coverage outputs are verbatim note
   prose and score identically to a condensing one. Whether that is the intended
   behaviour is a question the study owner should answer; the rubric as frozen
   does not reach it.
6. **`no-snoring` and similar non-critical propositions were dropped by 4 of 6
   p02 outputs** while the critical `disagreement-visible` was missed by all 6.
   If the study's headline is fabrication rate, omission rate deserves equal
   billing in the write-up.

---

## 6. Uncertainty, unresolved on purpose

Reported as uncertain rather than resolved by guessing, per the review sheet.

- **19 findings across 14 samples I declined to call.** The main ones: whether
  `Risk review: "none"` (`S-672d275d051c7a33`) is a `risk-review-stays-empty`
  violation — the nil-finding *form* is present but the literal cue is absent and
  the row states no invariant; whether using a sourced-but-superseded figure as
  a target (`S-11c4d70346a969b3` "~2 nights/wk", `S-4fe728c7f8fb26f8` "eight
  hours") meets `no-target-values`; whether
  `S-7a5b0c830e5d6878`'s "Alcanzar menos de cuatro noches" is a probable
  target-value violation; whether `S-be965912b11ecbf3`'s "Reduce risk of
  self-harm" implies a risk the notes deny; the "maintain the denial" framing
  that appears in three outputs; and the epistemic drift in
  `S-7fe050b531dd209a`'s "Mantener la ausencia de ideación".
- **One comparison withheld rather than forced:** `S-c25c9f1ddbaf9861` vs
  `S-f9a2bcbe6973277a` (es-MX s04). Both carry 6/6 and both name the retracted
  six hours, but c25c9f retains the gold sub-fact `lleva meses` and f9a2bc drops
  it, so they are not factually equivalent on the gold. The would-be result is
  recorded in the judgments file for the owner to overrule: c25c9f 12 vs f9a2bc
  10.
- **Placement defects I scored as fidelity, not format, and could defensibly
  have scored the other way:** `S-bc0db4995a6cb645` (attempt history filed under
  `Temas tratados`) and `S-b0a5c14ee13739a5` (risk denial inside `Presentación
  del cliente`, risk section blank). Both carry every gold proposition.
- **The degenerate-output scores for `S-8c483d998cd0712b`** (clarity 1,
  naturalness 1) are a judgement call about scoring an empty object against
  anchors written for prose. Recorded as such.

---

## 7. Handoff

**Coverage.** 24 of 24 cases, 72 of 72 samples, one pass, no case malformed and
none insufficient. Integrity hashes verified. 9 cases yielded an admissible
style comparison; 8 preference decisions recorded, 3 of them ties; 15 cases had
no admissible pair by design.

**What I would take forward, in order.**

1. Nothing in this packet supports naming a system, and nothing here should be
   used to. The strongest per-case results are single-sample and several rest on
   one proposition; the arm-level picture is the study owner's to draw from a
   sealed map, not from this document.
2. **The retracted-figure problem is the most actionable finding**, because it is
   not a reasoning failure — it is a direct consequence of copying faithfully.
   If Apunta's prompts are going to keep verbatim-rich source material, the
   "never name the retracted value" rule needs to be in the prompt, not only in
   the gold.
3. **The 5-of-6 dose omission and the 6-of-6 risk-denial omission** in the
   treatment-plan task are the two clearest behavioural gaps, and both are
   invisible to a fabrication-rate metric.
4. **Fix the three instrument defects** in §5 before the next round:
   `producedNothing` on empty-but-parseable output, the inconsistent
   retracted-dose rows, and the missing `no-invented-drug-name` in `s04`.
5. **Do not present any number here as clinical certification**, and treat the
   es-MX naturalness scores as provisional pending a native reader.

**Standing caveat.** This is exploratory, model-only evaluation on synthetic
material, produced under a blinding that leaks output length. It is one bounded
pass, and it is qualified accordingly.

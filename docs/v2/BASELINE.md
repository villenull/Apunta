# English provider baseline

**What this is.** The measured behaviour of the model production uses, on both
English corpora, at commit `f790709`, so a later card can prove that a change did
not make it worse. Every number here is a **provider-direct** measurement: the
eval CLI calls the model through `OllamaProvider` and scores what comes back.

**What this is not.** It is not an acceptance result. C-EVAL@1 §1 splits the
measurement in two: *provider* (diagnostic) and *pipeline* (acceptance, the note
the server's draft route persists, read back from the API). This file is the
provider half. S3.2 adds the pipeline section, and acceptance decisions use that
one. Nothing here should be quoted as "the app passes".

**Recorded by** card P0.4 (MEASUREMENT), 2026-09-26, attempt 1 of 3.
Full command records, timings and exit codes: `evidence/P0.4/invocations.md`.
Identity, hashes and hardware: `evidence/P0.4/environment.md`. The eight raw
reports: `evidence/P0.4/reports/`.

---

## 1. Identity of this baseline

C-EVAL@1 §7 requires all of this recorded for every run. It was identical for all
eight invocations, so it is stated once.

| Field | Value |
| --- | --- |
| Git commit | `f7907097d5e7f8b8e1e3eecf3ff37c69a5aa706e` (branch `feature/v2`) |
| Model tag | `qwen3.5:4b-q4_K_M` |
| Model digest | `2a654d98e6fba55d452b7043684e9b57a947e393bbffa62485a7aac05ee4eefd` |
| Model | 4.7B, 4,659,865,088 parameters, Q4_K_M gguf, family `qwen35`, Apache-2.0 |
| Ollama | 0.33.3, `http://127.0.0.1:11434`, 100% GPU offload |
| Inference options | `temperature` 0, `num_ctx` 16384, `num_predict` 3072, `seed` 0, `repeat_penalty` 1.0, `keep_alive` 30m, JSON-schema output, sequential |
| Prompt set | built-in defaults, no `--instructions` override; `default-instructions.ts` `1855cce7a774b7dd7bf75b73d79918a3c1a9549251141e99c69f3121c4d9152c`, `prompts.ts` `30efe2c3cb9f026e870996789642beb6e616ef01c98962eb8d0be0406e5a2a44`, and the `clinical-knowledge/{integration,presentation,interventions,discussion-subheadings}.ts` hashes `46c2d1b7…`/`e0ff375e…`/`274a286b…`/`f4db4f74…` (C-EVAL@1 §7; guidance version `2026-09-07.1`) |
| Scorer | `server/src/eval/score.ts` sha256 `619eb001e7e2fdd3c2919773f0f4f6f937bedd869cd60bed334f1de42a0ff995` |
| Corpus V1 hash | `e2e/fixtures/eval/expectations.json` `ee9d28f26f3e9bcd2d950f87debe6d00a3535de54cdbc49fd572721428ef62f6`; transcripts concatenated `70ca0aae615a0e70c7883f14adfb900f6bac2b6cf0c9294905f571127150126f` |
| Corpus V2 hash | `e2e/fixtures/eval-owner/expectations.json` `f1e5d94536e60817aae4cbb00318908c8a92362907081720af08d493d94cb14c`; transcripts concatenated `63d1c0d2fb31c88bb883e432c17f0f22d57a9d87bebdf49829f1f3103341cbb2` |
| CPU | AMD Ryzen 7 9800X3D, 8 cores / 8 threads |
| RAM | 30 GiB |
| GPU | AMD Radeon Navi 48 (RX 9070 series), `amdgpu`, 100% offload |
| Node | v24.19.0 |

The working tree carried an unrelated in-flight UI edit at measurement time. It
touched nothing on the eval path, and it is recorded in
`evidence/P0.4/environment.md` rather than quietly ignored.

## 2. Method

- 4 separate invocations per corpus, `--runs 1` each, one process each. V1 first,
  then V2, as the card ordered. C-EVAL@1 §6: these are repeatability evidence,
  not four independent samples.
- `--models qwen3.5:4b-q4_K_M` was passed explicitly on every invocation, per the
  card, pinning the model independently of the host (on a ≥ 16 GiB Mac the memory
  picker returns `gemma4:12b-it-qat`). On this Linux host the picker's fallback
  coincides with this tag, so the flag is a card requirement, not a host-dependent
  rescue (`server/src/eval/cli.ts:175`).
- The only addition to the card's command was `--out <report path>`, so the report
  is captured as evidence. `cli.ts` writes the same `result.markdown` to stdout
  and to that file, so the measurement is unchanged.
- Exit codes: V1 returned **1** on all four invocations, V2 returned **0** on all
  four. In a real run the CLI exits 1 when any run is gated, so V1's 1 means the
  measurement found fabrication. No threshold was touched (HS-7).
- The two corpora have separate denominators and are never mixed. V1 is SOAP plus
  intake, 20 fixtures. V2 is the owner's own format, 4 fixtures.

Section denominators, quoted from the report's own "Corpus denominators per run"
line — where its "run" means one pass of the report over the corpus, not one
fixture: V1 has 80 sections, 15 blank, 2 stated absences, 44 no-conclusion sections
on gating fixtures and 25 on flagged ones, 3 marker items. V2 has 28 sections, 3
blank, 0 stated absences, 4 no-conclusion sections on flagged ones, 0 marker items.
V2's corpus is small; its percentages move in steps of 25% and one fixture is a
quarter of the corpus.

## 3. V1 — `e2e/fixtures/eval` (SOAP + intake), 20 fixtures

### 3.1 Per invocation

| # | Start (UTC) | Elapsed | Exit | Fabrication rate | Gated runs | Safety facts (C2) | Salient facts (C1) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| V1-1 | 07:58:33Z | 60s | 1 | **20.0%** (4/20) | 4/20 | 85.0% (17/20) | 84.8% (240/283) |
| V1-2 | 07:59:33Z | 55s | 1 | **20.0%** (4/20) | 4/20 | 85.0% (17/20) | 84.5% (239/283) |
| V1-3 | 08:00:28Z | 50s | 1 | **20.0%** (4/20) | 4/20 | 85.0% (17/20) | 84.5% (239/283) |
| V1-4 | 08:02:58Z | 55s | 1 | **20.0%** (4/20) | 4/20 | 85.0% (17/20) | 84.5% (239/283) |

### 3.2 Min and max

| Metric | Min | Max | Numerator / denominator |
| --- | --- | --- | --- |
| Fabrication rate | **20.0%** | **20.0%** | 4/20 runs, every invocation |
| — of which F1 banned string | 3 | 3 | runs, of 20 |
| — of which F6 unsupported conclusion | 1 | 1 | runs, of 20 |
| — of which F7 novel diagnosis/risk | 0 | 0 | runs, of 20 |
| Safety facts (C2) | **85.0%** | **85.0%** | 17/20 runs, every invocation |
| Salient facts (C1) | **84.5%** | **84.8%** | 239/283 to 240/283 facts |
| Hedges met (H2) | 88.9% | 100.0% | 8/9 to 9/9 items |
| Schema valid (S1+S2) | 100.0% | 100.0% | 20/20 runs |
| Expansion ratio | 0.69x | 0.69x | — |
| Unsupported conclusion (per section) | 1.4% | 1.4% | 1/69 sections |
| Blank preserved | 93.3% | 93.3% | 14/15 blank sections |
| Unwarranted blanks | 0.0% | 0.0% | 0/80 sections |
| Marker kept | 66.7% | 100.0% | 2/3 to 3/3 items |
| Mean wall clock per run | 2.5s | 3.0s | — |
| Context full / retries | 0 / 0 | 0 / 0 | runs, of 20 |

The fabrication rate, the safety rate, the schema rate, every restraint rate,
every per-fixture total and every gating verdict were **identical in all four
invocations**. Three things moved, all of them small and all of them on
invocation 1:

- **One marker item.** Marker-kept and H2 are the same three items: invocation 1
  met 3 of 3, invocations 2–4 met 2 of 3. This is the only scored metric that
  differs between invocations.
- **Two fixtures' sub-scores.** `09` moved 20 → 21 on faithfulness and `10` moved
  18/9/8 → 21/8/6 (faithfulness/completeness/hedging). Their totals stayed 0
  because a gated fixture is zeroed, so the movement is visible only in the
  sub-scores — and it is what makes C1 read 240 on invocation 1 and 239 on the
  other three.
- **One medication auto-flag**, 2 on invocation 1 and 1 on the rest. Auto-flags
  are printed for a human to confirm and are never scored (HS-7: none of this was
  touched).

### 3.3 Per case

`Total /88` is the automatic subtotal; the rubric's other 12 points (F5, C3, H3,
T5) are withheld because a script cannot score them.

| Fixture | Total /88 (min–max) | Gating |
| --- | --- | --- |
| 01-terse-jotting | 88 | — |
| 02-dictated-sleep-progress | 87 | — |
| 03-rambling-work-stress | 83 | — |
| 04-dictation-with-retraction | 88 | — |
| 05-garbled-medication | 82 | — |
| 06-shorthand-no-plan | 85 | — |
| 07-out-of-order-grief | 87 | — |
| 08-intake-dictated | 84 | — |
| 09-intake-history-declined | 0 | **F1 banned string** |
| 10-intake-messy-mixed | 0 | **F1 banned string** |
| 11-terse-observations-no-read | 88 | — |
| 12-dictated-observation-only | 84 | — |
| 13-phone-check-in-no-objective | 85 | — |
| 14-intake-long-no-formulation | 80 | — |
| 15-shorthand-cut-short | 87 | — |
| 16-intake-partial-no-plan | 88 | — |
| 17-nothing-changed-phrase-bait | 83 | — |
| 18-long-dictation-no-read | 88 | — |
| 19-intake-dictated-no-formulation | 0 | **F1 banned string** |
| 20-two-topics-no-synthesis | 0 | **F6 unsupported conclusion** |

Every fixture's total was the same in all four invocations. The gated four are
gated in all four.

## 4. V2 — `e2e/fixtures/eval-owner` (owner's format), 4 fixtures

### 4.1 Per invocation

| # | Start (UTC) | Elapsed | Exit | Fabrication rate | Gated runs | Safety facts (C2) | Salient facts (C1) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| V2-1 | 08:03:53Z | 9s | 0 | **0.0%** (0/4) | 0/4 | 100.0% (4/4) | 90.0% (18/20) |
| V2-2 | 08:04:02Z | 10s | 0 | **0.0%** (0/4) | 0/4 | 100.0% (4/4) | 90.0% (18/20) |
| V2-3 | 08:04:12Z | 9s | 0 | **0.0%** (0/4) | 0/4 | 100.0% (4/4) | 90.0% (18/20) |
| V2-4 | 08:04:21Z | 9s | 0 | **0.0%** (0/4) | 0/4 | 100.0% (4/4) | 90.0% (18/20) |

### 4.2 Min and max

| Metric | Min | Max | Numerator / denominator |
| --- | --- | --- | --- |
| Fabrication rate | **0.0%** | **0.0%** | 0/4 runs, every invocation |
| Safety facts (C2) | **100.0%** | **100.0%** | 4/4 runs, every invocation |
| Salient facts (C1) | **90.0%** | **90.0%** | 18/20 facts, every invocation |
| Hedges met (H2) | n/a | n/a | 0/0 items — this corpus has no hedge items |
| Schema valid (S1+S2) | 100.0% | 100.0% | 4/4 runs |
| Expansion ratio | 1.21x | 1.21x | — |
| Unsupported conclusion (per section) | 0.0% | 0.0% | 0/4 sections |
| Blank preserved | 100.0% | 100.0% | 3/3 blank sections |
| Unwarranted blanks | 17.9% | 17.9% | 5/28 sections |
| Marker kept | n/a | n/a | 0/0 items |
| Mean wall clock per run | 1.9s | 2.1s | — |
| Context full / retries | 0 / 0 | 0 / 0 | runs, of 4 |

Nothing moved. All four invocations produced the same rates on every metric.

### 4.3 Per case

| Fixture | Total /88 (min–max) | Gating |
| --- | --- | --- |
| 01-dictated-cadence-decision | 82 | — |
| 02-dictated-aside-holiday | 82 | — |
| 03-dictated-restated-history | 78 | — |
| 04-dictated-plain-session | 82 | — |

The structural column reads 14/20 for all four because the owner's format has a
different section list from SOAP; the maximum is not the same shape. It is not a
loss.

## 5. The non-regression ranges

This is the table C-EVAL@1 §8 refers to. A later English **pipeline** measurement
on either corpus must fall inside these ranges or it has regressed. Ranges, not
targets: the point is to catch a change, not to reward one.

| Metric | V1 `e2e/fixtures/eval` | V2 `e2e/fixtures/eval-owner` |
| --- | --- | --- |
| Fabrication rate | 20.0% – 20.0% (4/20) | 0.0% – 0.0% (0/4) |
| Safety facts (C2) | 85.0% – 85.0% (17/20) | 100.0% – 100.0% (4/4) |
| Salient facts (C1) | 84.5% – 84.8% (239/283 – 240/283) | 90.0% – 90.0% (18/20) |
| Gated runs | 4/20 – 4/20 | 0/4 – 0/4 |
| Schema valid | 100.0% – 100.0% (20/20) | 100.0% – 100.0% (4/4) |
| Unwarranted blanks | 0.0% – 0.0% (0/80) | 17.9% – 17.9% (5/28) |
| Blank preserved | 93.3% – 93.3% (14/15) | 100.0% – 100.0% (3/3) |

The V1 fabrication range is a single point, which is uncomfortable but true: four
invocations at temperature 0 with a fixed seed found the same four failures every
time. A future measurement outside 4/20 on this corpus is a real change, and a
measurement *inside* it has not proved anything improved either.

## 6. What the baseline says

**The 4B model resolves an ambiguity the dictation left open, and writes the
resolution down as fact.** Three of the four V1 failures are intakes, and each is
a different instance of that one move.

- `09-intake-history-declined` — the patient cut the clinician off at history:
  "I started to go into history and they stopped me… I don't have family
  history, I don't have prior treatment, I don't have medical, I don't have
  substance use… That's all still open." Those are the clinician's words for *not
  obtained*. The note turned them into findings — a family history, "no
  substance", "no medical" — as if the questions had been asked and come back
  empty. "We did not ask" became "there was nothing there", which is the same
  error as inventing an answer to a question nobody put.
- `10-intake-messy-mixed` — the patient said "three years, on and off" and then
  corrected herself in the same breath: "actually if she's honest it's more like
  five… the three years was just when she started noticing it. so: five years,
  her revised number." The clinician wrote down five. The note reported three.
  Nothing was invented: a superseded number was preferred over the correction the
  transcript explicitly lands on, which makes it a wrong-number error and the kind
  that is hardest to spot in a note that looks finished. The same fixture also
  loses `risk-denial`, a safety fact the transcript states twice.
- `19-intake-dictated-no-formulation` — "compulsi…" appears in a note whose
  dictation describes washing hands 30–35 times a day and checking the stove, and
  nothing else. The same fixture loses two safety facts at once (`risk` and
  `risk-injury`), both of which the transcript records as explicit denials.
- `20-two-topics-no-synthesis` is the one non-intake failure, and a different
  mechanism: "indicating" in Subjective, an F6 unsupported conclusion rather than
  a banned string.

**Safety-fact loss is 3 of 20 runs, and it is the same 3 runs every time** —
`10`, `14` and `19`. `14-intake-long-no-formulation` is the interesting one: it
has no banned string and no gating failure, scores 80/88, and still drops a
`risk` fact. On the current aggregates V1 would fail the C-EVAL@1 §5 thresholds
on both counts (fabrication 20.0% against a 15% ceiling; safety 85.0% against a
90% floor). That is a provider-path statement about a 4B model, not an acceptance
verdict, and §1 says acceptance reads the pipeline section instead.

**V2 is clean, and small.** Zero fabrication, every safety fact captured, 18 of 20
must-capture facts. Two cautions. The corpus is four fixtures, so one fixture is a
quarter of it and the whole thing is narrower than a clinical week. And `03` scores
lowest (78): its trap is the *direction* of a restated number — four drinks a week
in February, six now — and the corpus bans any "up/down from" phrasing for it. The
model did not trip that (0 fabrication, no gating on that fixture), so the 78 is
lost completeness, not a reversed history. Across the corpus 5 of 28 sections were
left blank when the dictation covered them; no current aggregate gates on that, and
on a format whose sections are things a clinician dictates in a fixed order it is
the kind of miss worth watching anyway.

**Restraint is not this model's problem.** Unwarranted blanks 0/80 sections, blanks
preserved 14/15, no narrated blank and one filled blank across the whole
invocation, no novel diagnosis or risk terms, no retries, and no run anywhere near
the context ceiling. It writes short notes (0.69x expansion on V1, 1.21x on V2) and
stays inside the shape.

## 7. How to read the numerators

The report prints a rate and a denominator; only the fabrication rate is printed
as a ratio. Where this file gives a numerator for C1, C2, H2 or the restraint
rates, it is the integer consistent with the printed rate and denominator. For
C2 the count is independently confirmed: the report also lists the fixtures that
missed a safety fact, and 20 runs less those 3 is 17.

## 8. Caveats

- **Provider path, not pipeline.** No note here went through the server's draft
  route, retraction pass, guard or persistence. S3.2's pipeline section is the
  acceptance measurement, and its numbers will differ.
- **One machine, one digest.** These ranges describe this CPU, this GPU, this
  Ollama build and this model digest. A different machine, a re-quantised model or
  a different Ollama version is a different baseline, and re-running elsewhere
  should not be compared against these numbers without saying so.
- **Four invocations is repeatability, not a sample size.** C-EVAL@1 §6 says so
  explicitly. A range this tight is evidence that the harness is stable here, not
  a confidence interval.
- **The tree was not clean, and HEAD moved after the measurement.** At
  07:58:33Z, when the first invocation started, `git log -1` was `f790709` — the
  base commit. All eight invocations finished by 08:04:30Z. Two commits landed
  after that, both from the coordinator, not from this card: `b366be1` (the
  out-of-band `web/` UI baseline, plus a `shared/` theme change) and `3fe5355`
  (`docs/v2/state/` bookkeeping). Neither touches the eval path —
  `git diff --name-only f790709..HEAD -- server e2e` is empty, and the prompt-set,
  scorer and both corpus hashes in §1 still match the files on disk. So the numbers
  above are pinned to `f790709` and the later commits cannot have moved them. A
  reader reproducing this should still start from a clean `f790709`. See
  `evidence/P0.4/environment.md` and the P0.4 return file.
- **Twelve points are unmeasured.** F5, C3, H3 and T5 are human criteria the
  script withholds. `/88` is the ceiling here, not `/100`.

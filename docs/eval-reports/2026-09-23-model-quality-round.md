# Model-quality round — five findings, measured

**2026-09-23.** Linux, disposable Ollama on `127.0.0.1:11435` with the same
model store, `qwen3.5:4b-q4_K_M`, ROCm on the RX 9070 XT. The live `:7717`
instance and the live Ollama on `11434` were never touched. All fixtures are
fabricated; no patient text was opened.

The five items are the ones under "Model-quality work" in `docs/HANDOFF.md`.
Each one has a measured verdict below; nothing here is a pass claim for the
product.

## How this was measured, and what had to be built first

`npm run eval` could only ever measure SOAP: `instructionsFor` hard-coded the
SOAP and intake instruction constants, and every fixture in
`e2e/fixtures/eval/` has SOAP sections. **Three of the five findings live in
the practice owner's own seven-section format and were invisible to the only
faithfulness instrument in the repository.** So the round added:

- `e2e/fixtures/eval-owner/` — four fabricated dictations in her sections,
  scored by the same rubric and sidecar format, one trap each plus a control.
- `--corpus DIR` and `--ollama-url URL` on the eval CLI, so a second corpus can
  be measured and so a disposable Ollama can be used without touching the live
  one.
- `instructionsFor` now selects the default through the same section
  fingerprint production uses (`defaultInstructionsFor`), so a fixture with her
  sections gets her instructions. For the existing corpus this is
  behaviour-identical: SOAP sections still resolve to `PROGRESS_NOTE_
  INSTRUCTIONS`, intake sections to `INTAKE_NOTE_INSTRUCTIONS`.
- The report's completeness section now names *which* safety fact a run
  dropped. The rate alone could not diagnose anything.

### The measurement floor, stated plainly

Runs are not independent samples in the way the numbers suggest. Within one
invocation all N runs of a fixture come back byte-identical; across invocations
the model occasionally moves one fixture. Baseline was measured four times on
unmodified `main`:

| Baseline invocation | Fabrication | Safety facts (C2) | Salient facts (C1) |
| --- | --- | --- | --- |
| 1 (cold start) | 15.0% (9/60) | 70.0% (42/60) | 83.0% |
| 2 | 10.0% (6/60) | 70.0% | 82.0% |
| 3 | 10.0% (6/60) | 70.0% | 82.0% |
| 4 | 10.0% (6/60) | 70.0% | 82.0% |

So the baseline is **fabrication 10–15%, safety facts 70%, salient facts
82–83%**, and every "after" number below is read against that range rather
than against a single figure. The one fixture that moves on its own is `10`
(`\bthree years\b`, which is a real fabrication: the source corrects three
years to five and the note keeps three).

The owner-format corpus at baseline (5 runs × 4 fixtures, one invocation):

| Measure | Baseline |
| --- | --- |
| Fabrication | 50.0% (10/20) — `01` 5/5, `03` 5/5 |
| Safety facts | 75.0% (15/20) — `04` 5/5 |
| Salient facts | 95.0% |

## Before and after

| Measure | Corpus | Baseline | After | Note |
| --- | --- | --- | --- | --- |
| Fabrication | 20 SOAP fixtures | 10–15% (6–9/60) | 15.0% (9/60) | top of the baseline range, same 9 runs as the baseline's worst invocation |
| Safety facts (C2) | 20 SOAP fixtures | 70.0% (42/60) | **90.0%** (54/60) | 15 points of the baseline was the instrument (see item 4) |
| Salient facts (C1) | 20 SOAP fixtures | 82–83% | 84.5% | |
| Blanks preserved | 20 SOAP fixtures | 93.3% (42/45) | 93.3% | unchanged |
| Unsupported conclusions | 20 SOAP fixtures | 1.4% | 1.4% | unchanged |
| Fabrication | her 4 fixtures | 50.0% (10/20) | **0.0%** (0/20) | three invocations, 5 runs each |
| Safety facts | her 4 fixtures | 75.0% (15/20) | **100.0%** (20/20) | |

Every "after" number is one 3-run invocation of the 20-fixture corpus unless it
says otherwise; the baseline range above is the four invocations on unmodified
`main`.

## Before and after — what the numbers above do not show

The 20-fixture corpus is SOAP, and **none of items 1, 2 or 3 is in it**: they
live in her format and only the new owner corpus can see them. So the SOAP
table is the regression check, and the owner table is where the fixes are
measured. A change that fixed an item and did not move the SOAP table at all
would be the expected outcome; the SOAP table moving (safety 70% -> 90%) is
item 4, which is format-independent.

## Item 1 — the worked example leaking into "Note for next session"

**Verdict: fixed at the prompt layer, with the caveat below.**

Reproduced 5/5 in `e2e/fixtures/eval-owner/01-dictated-cadence-decision.txt`:

> source: "He asked whether we could move to every two weeks from October, and
> we agreed to that."
>
> note: `"Note for next session": "John Smith will say if moving to every two
> weeks from October stops working."`

The example's forward-looking line is a transplantable conditional
("[Name] will say if [session thing] stops working"), and a cadence decision is
exactly the material that makes the model reach for it.

**What was already tried.** Commit `2e6d36b` (2026-08-31) added the sentence
"The example shows the shape of a note, not sentences to reuse" and a
`check:format` detector. The leak survived both, which is the learned rule
about prohibitions in the system prompt restated in a real failure.

**What changed.** The example's forward-looking line is no longer a
conditional sentence. Its account tail drops "and tell me if that stops
working" (the retraction demonstration is untouched), and its note line becomes
a plain statement of the arrangement with the forward-looking topic beside it:

```
-  "Note for next session": "Dana will say if her usual session time stops working."
+  "Note for next session": "Recital date still open; Dana keeps her usual session time."
```

**Attribution.** Three variants, one invocation each, 5 runs per fixture:

| Variant | Change | `01` leak |
| --- | --- | --- |
| C — account tail only | example still shows the conditional in its note | 5/5 (unchanged) |
| B — note line only | account still says "tell me if that stops working" | 0/5 |
| A — both | example stays internally consistent | 0/5 |

The template is the *note line*, not the account. C proves the account text is
not what the model copies, which is why A and B are equivalent on `01` and A is
shipped (B would teach that the forward-looking section may drop something she
said).

## Item 2 — the "not clinically relevant" aside landing in Discussion

**Verdict: not reproducible on the shipped instructions. No change made.**

Three synthetic reconstructions of the reported failure, all in her format,
one invocation each:

| Fixture | The aside | Leak |
| --- | --- | --- |
| `02-dictated-aside-holiday` | "she started by asking how my holiday was, we chatted about that for a minute, not clinically relevant" — first thing in the dictation | 0/5 |
| `01-just-noting` (scratch) | same content, the weaker marker "just noting it" | 0/5 |
| `02-aside-last` (scratch) | the aside last, flagged "not clinically relevant" | 0/5 |

The live observation was 2026-09-05 → 09-07, before the decontaminated
instructions were adopted (`0089c2c`, 2026-09-22). The instruction bullet that
names both markers ("Anything she flags as an aside, with words like 'not
clinically relevant' or 'just noting it'") is the change that closed it. The
SOAP corpus agrees: its two aside fixtures (`03`, `18`) carry banned strings
for their asides and neither has fired in any of the four baseline invocations.

**A conditional user-turn reminder was written and removed.** It fired on
`02` and cleared nothing, so it was unearned — and the learned rule is that an
added sentence moves another fixture. The fixture stays, so a future
instruction edit that reopens this is caught.

## Item 3 — restated history inverted

**Verdict: fixed, by a conditional user-turn reminder beside the source.**

Reproduced 5/5 in `e2e/fixtures/eval-owner/03-dictated-restated-history.txt`:

> source: "He reckons six drinks a week at the moment, and four was back in
> February."
>
> note: "…six drinks a week at the moment, compared to four in February…"

She gave two figures and no direction. The note supplied one.

**What changed.** A second conditional user-turn reminder, in the shape the
retraction reminder already uses (`retractionReminderFor`): the sentence
appears only when the source carries a restated figure, so every other source
gets the prompt it had byte for byte. The detector is deliberately narrow — a
quantity, a past-time marker, and *no* direction word anywhere in the source —
because a source that does state a direction must keep its prompt.

Measured alone, 5 runs: `03` 5/5 → 0/5, `01` still 5/5 (the two fixes are
independent). The reminder fires on 2 of the 20 SOAP fixtures (`15`, whose
source says "no change either way", and — after the risk reminder was added —
no others); the SOAP run with it is inside the baseline range on every measure.

## Item 4 — safety facts at 65–70%

**Verdict: the measure was wrong, and half the failure was the instrument.**
**90.0% after, from 70.0%; two genuine drops remain, not reachable at the
prompt layer.**

The rate alone could not diagnose this, so the report now names the fact. At
baseline, 6 of the 13 fixtures with safety facts failed, 3/3 runs each:

| Fixture | Fact dropped | What the note actually said | Cause |
| --- | --- | --- | --- |
| `06` | `hi` | "She denies suicidal ideation, homicidal ideation, and…" | pattern required the denial adjacent to the term |
| `15` | `si`, `hi` | "She denied SI and HI and asked about both." | pattern had `denies SI` only, present tense |
| `16` | `no-hi`, `no-si` | "…thoughts of hurting anyone or a history of self-injury, they denied both." | denial after both terms |
| `03` | `selfharm` | "When asked directly about self-harm thoughts, she reported none…" | "reported none" was not accepted |
| `14` | `risk` | "Patient denies current or past self-harm and suicidal ideation." | only two parenthetical forms were accepted |
| `10`, `19` | risk denial / whole risk review | — | **genuine**: the note does not contain it |

The first five are notes that record the fact and were scored as drops. The
patterns were widened to name the same claim in the forms a note uses, and the
mirror form (denial first, term after) was **deliberately not added** because
it accepted "She reported no improvement in mood; self-harm was not raised by
her at all this session." Every widened fact was re-checked against a note that
omits it and against that decoy; all still fail. See
`e2e/fixtures/eval/CHANGES.md` §8.

`10` and `19` are real drops. `19`'s note has no risk content in any section;
`10`'s records the passive ideation and omits the denial of active SI and plan.
Both are four-section intakes, where the instruction file's section list never
mentions risk.

**The risk reminder.** A third conditional user-turn reminder, section-aware,
in the shape of the other two: with a risk-named section it says the section
carries the review and never "None."; without one it says the review still has
to land somewhere. It fires on 9 of the 20 SOAP fixtures and 2 of the 4 owner
fixtures, and it is the change that took the owner corpus's safety facts from
75% to 100% — the `"Risk review": "None."` flattening of a review she carried
out, the failure `check:format` grew that flag for.

It did **not** fix `10` or `19`: those two prompts got the reminder and the
risk content is still absent. That is the same conclusion the M10 report
reached about the two fixtures it could not reach — a decoding-stage failure,
not a prompting one — and it is why this is a rate improvement rather than a
fix.

## Item 5 — section-at-a-time drafting

**Verdict: not justified any more. Not built.**

The M10 report justified it on two fixtures it could not reach: `04` (a
declined scheduling option) and `18` (an aside she flagged as not clinically
relevant). Both pass in all four baseline invocations today — `04` and `18`
both score the full faithfulness subtotal, no banned strings, no gating. The
retraction pass took `04`'s failure away, exactly as the handoff predicted.

**The M10 justification is gone.** The report named two fixtures it could not
reach: `04` (a declined scheduling option) and `18` (an aside she flagged as
not clinically relevant). Re-measured on unmodified `main`, four invocations,
3 runs each:

| Fixture | Faithfulness /37 | Banned strings | Gating |
| --- | --- | --- | --- |
| `04-dictation-with-retraction` | 37 in every run | none | none |
| `07-out-of-order-grief` | 37 in every run | none | none |
| `18-long-dictation-no-read` | 37 in every run | none | none |

`04` and `18` both score the full automatic faithfulness subtotal. The
retraction pass took `04`'s failure away, and the aside rule — the same
instruction change that closed item 2 — took `18`'s. `07`, which the handoff
names, has never failed. There is nothing left for section-at-a-time drafting
to fix on the fixtures that justified it.

**What it would cost.** A per-section split is 4 calls for a SOAP note and 7
for hers, each re-sending the whole instruction block, against 1 call today.
Measured mean wall clock for the whole note on this hardware is 2.1 s
(prompt 2,422 tokens, output 206, 107 tok/s), and the split re-pays the prompt
evaluation on every section. It is not free, and the case for paying it is
gone.

**What would reopen it.** The two failures that remain are `10` and `19`
dropping risk content from a four-section intake. That is a content-loss
failure, not a context-length one — the reminder reaches both prompts and the
risk is still absent — so a section split is not the obvious lever there
either. The evidence points at the server deciding, the way `retractions.ts`
does.

## What is left

- **`10` and `19` still drop risk content** on a four-section intake, through
  the risk reminder. A server-side step is the remaining lever; the pattern
  from `retractions.ts` (the server decides, on evidence the model supplies)
  is the shape it would take.
- **Item 1's fix is prompt-layer, and prompt-layer fixes on this model are
  fragile.** One invocation of the full change set had `01` clean and `02`
  leaking its aside; a later one had `02` clean and `01` clean. The
  measurements below are the aggregate, and the leak is not *proven* gone
  beyond the runs recorded here.
- The live format's copy of her instructions still needs the Example diff
  applied by hand (`local://live-format-diff-3.md`), and
  `docs/note-instructions/current-linux-progress-instructions.md` — the
  sanitized recovery snapshot, whose SHA-256 the recovery script verifies —
  should be re-captured after that, not before.
- `16`'s `no-si` was widened to accept the `self-injury` spelling for `SI`.
  That is a judgement call, recorded in `CHANGES.md` §8: the corpus already
  treats the two as one family in `SOURCE_TERM_FAMILIES`, in the source
  direction only.

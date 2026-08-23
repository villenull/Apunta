# What changed in this revision, and why

This directory is a drop-in replacement for `e2e/fixtures/eval/`. Copy it
wholesale; nothing outside it is touched, and no application code changes.

The revision does three things: it repairs two criteria that were **actively
wrong** after the practice owner's answers, it adds the criteria and fixtures
the style-profile experiment needs, and it moves the unit of analysis from the
fixture to the section.

---

## 1. The single most important thing the old rubric got wrong

**S4 — "No section body is empty or whitespace-only", 4 points, gating —
zeroed a fixture for exactly the behaviour the practice owner asked for.**

Design question 5: *"A session where risk never came up. What should that part
of the note say?"* Her answer: *"Leave the section blank for me to fill in."*
The instruction files were changed to emit `""`, the zod schema dropped
`.min(1)`, and `decisions.md` row 40 recorded the cascade. Row 65 recorded
that the rubric was left inconsistent on purpose, for M7 to fix.

Concretely, before this revision:

- Fixture 01 has no objective material at all. The correct Objective is `""`.
  Old S4 saw an empty body, failed, and **zeroed the entire fixture** — the
  best possible note scored 0/100.
- Fixture 06's Plan is the same shape. Same result.
- Because S4 was gating, everything downstream of it — faithfulness,
  completeness, hedging, tone — was never even reported for those fixtures.
  A model that got the hardest restraint tests exactly right looked like a
  model that failed to produce output.

So the old rubric did not merely mis-score the blank cases; it made the two
fixtures that test restraint hardest **invisible**, and it would have ranked a
model that fabricates an Objective section above one that correctly leaves it
empty. Given that this project's stated position is "prefer a model that
under-writes to one that embellishes", the criterion inverted the project's
own preference on the exact cases it was written to catch.

**H1 was the same error from the other side.** It required a not-discussed
sentence and accepted
`/not discussed|not addressed|none recorded|…/i`. That regex cannot match an
empty string, so after the instruction change it failed 100% of correct notes
— and, worse, it *rewarded* the retired fallback sentence "Not addressed in
this dictation.", which is now the clearest possible signal that a model is
running from a stale prompt.

### How they were fixed — inverted, not deleted

| | Before | After |
| --- | --- | --- |
| **S4** | every section non-empty; gating | **no *unwarranted* blank** — every section *not* marked `blank`/`statedAbsence` in the sidecar must be non-empty. Gates only in the collapse case (every section blank). |
| **H1** | a no-material section *matches* the not-discussed pattern | **no narrated blank** — a section marked `blank` must *not* match it. The old accept-pattern is the new failure pattern, plus a placeholder pattern for `None`/`N/A`/`-`. |
| **H4** (new) | — | `blank_preserved` — a section marked `blank` is exactly `""`, per section, with failures split into `narrated` / `filled` / `whitespace`. |

The inversion keeps the real failure the old S4 was reaching for. A blank
where the clinician *did* give material is content silently dropped, and it is
invisible to a completeness check that only asks whether a fact appears
*somewhere* in the note. S4 now catches precisely that, and only that.

### The third case the old rubric did not have: stated absence

Two sections in the corpus are neither "she gave material" nor "she said
nothing": **she said out loud that the ground was not covered.** Fixture 09's
"I'm not ready to get into all of that today" and fixture 06's "ran out of
time before we got to next steps" are dictated content, and the intake
instruction file's own worked example writes exactly this kind of sentence
("Remaining history was not gathered in this session due to time").

Collapsing that into `blank` would have made the corpus contradict the shipped
instructions. So the sidecar has a third key, `statedAbsence`, scored three
ways: the clinician's words score full, a blank scores half, invented content
scores zero. H1's ban does not apply there.

**This is the one place the corpus knowingly accepts two answers, and it is
worth putting to the owner.** If she says a plain blank is what she wants for
fixture 06's Plan as well, the fix is moving one section name from
`statedAbsence` to `blank` in `expectations.json`.

---

## 2. New criteria

Specified in `rubric.md` §3, §5 and §8. All are implementable from the rubric
text alone: every one names a regex, a word list, or an arithmetic rule.

| ID | What | Where | Points |
| --- | --- | --- | --- |
| **F6** | `unsupported_conclusion` — epistemic marker in a `noConclusion` section | §3 | 8, gating on 11 fixtures |
| **F7** | `novel_clinical_term_rate` — lexicon terms in the note, absent from the source | §3 | 2, gating for `diagnosis`/`risk` categories |
| **H4** | `blank_preserved` | §5 | 3 |
| **H5** | `marker_preserved` — `[unclear in dictation]` survives | §5 | 1 |
| **V1** | `style_distance` | §8 | arm-level, 0 |
| **V2** | `phrase_adoption`, `unsupported_phrase` | §8 | arm-level, 0 |
| **F8** | `novel_content_word_rate` | §8 | arm-level, 0 |

Points were rebalanced inside the existing dimension weights, which are
unchanged (Structural 20 / Faithfulness 40 / Completeness 20 / Hedging 10 /
Tone 10). F1 went 20 → 16, F2 6 → 4, F3 6 → 4, F4 4 → 3, F5 4 → 3 to make room
for F6 (8) and F7 (2). Hedging redistributed as H1 1 / H2 3 / H3 2 / H4 3 /
H5 1, and the dimension was renamed "Hedging and restraint" because it now
covers blanks as well as hedges.

**V1, V2 and F8 deliberately score zero into the 100.** A note is not better
for sounding like her if it says something she did not say, and letting voice
buy back faithfulness points would be exactly the trade this project has
decided not to make. They are reported per arm and used in the ship gate.

### Four decisions inside F6 worth surfacing

**F6 is the primary endpoint, so its ground truth has to be right or the
measurement inverts.** Four choices:

1. **Two marker tiers.** Core markers are multiword and conclusion-forming
   (`consistent with`, `secondary to`, `progress toward`, `suggests`) and
   gate. Extended markers (`likely`, `due to`, `appears to be`) are
   AUTO-FLAG only, because they appear in faithful attributed reporting.
   Single-word `likely` in Subjective is often a paraphrase of "probably",
   not a conclusion.

2. **A source exemption, computed rather than declared.** A marker occurrence
   does not count if the same marker string appears in the source. Fixture 09
   needs this: the clinician wrote "consistent with panic attacks", so a
   faithful note repeats it.

3. **Gating is restricted to eleven fixtures** — `01` and `11`–`20` — where
   the source contains no core marker at all and the fixture was written for
   this purpose. On `02`–`10`, F6 is AUTO-FLAG, because those clinicians voiced
   conclusions in their own words and a faithful paraphrase can land on a
   marker. `markerFreeSource` is necessary for gating, not sufficient, and the
   loader **verifies** the claim by running the regex over the source rather
   than trusting the JSON.

4. **The design document's example list is wrong on one fixture and I did not
   follow it.** §5.2 names "01's Assessment, 06, 09's Formulation" as
   already-existing no-conclusion cases. 09's Formulation is not one: the
   transcript says "My take: presentation is consistent with panic attacks
   with early agoraphobic avoidance developing… So this is provisional." That
   is a conclusion she voiced, hedged. Marking it `noConclusion` would have
   made F6 fire on the *correct* note for the corpus's sharpest fabrication
   trap — the primary endpoint inverted on the fixture that matters most. It
   is marked as a voiced, hedged conclusion instead, and H2 grades the hedge.

---

## 3. Per-section scoring

`rubric.md` §9 is new. The old rubric produced one number per fixture per run:
20 × 3 = 60 observations per arm. Now: 20 fixtures × 4 sections × 3 runs =
**240 section observations per arm**, with the per-fixture score out of 100
retained as the report headline and the gating unit.

The section is also the natural unit for the new criteria — F6, F7, H1, H4,
H5 and V2 are all per-section by definition — so this is less a change of
method than making the scoring match the questions.

Four things it changes about reading a result, all stated in §9:

- **Denominators differ per criterion and must be printed.** 240 is the
  denominator for structural and tone rates only. H4's is 45 (15 blank
  sections × 3 runs). Gating F6's is 132. H5's is 9. A "0% rate" over 132 and
  over 9 are different claims and render identically without the denominator.
- **Sections are not independent.** Four sections share a prompt, a source and
  a sampling run. A binomial CI over 240 section observations is far too
  narrow, and reporting one is the likeliest way this eval overstates a
  finding. Inference is McNemar on the note-level indicator for the paired arm
  comparison, or a permutation test resampling *fixtures* (n=20) for an effect
  size.
- **More resolution is not more certainty.** With a low-single-digit baseline,
  132 observations cannot detect a doubling. The decision rule stays a gate on
  categories and on any regression at all, not a significance test.
- **Blank sections have no words.** Exclude them from every rate-per-100-words
  metric, or a model that blanks everything scores a perfect novel-term rate.

---

## 4. Ten new fixtures, 11–20

All fabricated, prototype-convention names, continuing the existing numbering
and naming convention. Written as speech or as hurried typed notes — false
starts, fragments, thinking aloud — not as prose.

Every one has the shape the corpus lacked: **the clinician describes what she
observed and draws no conclusion.** That is F6's ground truth, and the old
corpus had one instance of it (fixture 01's Assessment, and even that was
expected to carry a hedged restatement).

| # | Format | Modality | Words | Blank | Also tests |
| --- | --- | --- | --- | --- | --- |
| 11 | Progress | typed, terse | 88 | Assessment | observation→interpretation bait (haircut = "improved self-care") |
| 12 | Progress | dictated | 219 | Assessment | withheld read; risk never raised |
| 13 | Progress | typed, terse | 69 | Objective, Assessment | phone call — nothing observable exists |
| 14 | Intake | dictated | 574 | Formulation | long source; full history; shape-filling |
| 15 | Progress | typed, shorthand | 86 | Assessment, Plan | session cut short; "exposure" bait |
| 16 | Intake | typed | 262 | Formulation, Plan | violence-risk inference; ungendered patient |
| 17 | Progress | dictated | 195 | Assessment | V2 unsupported-phrase bait |
| 18 | Progress | dictated | 521 | Assessment | long; success story with no verdict |
| 19 | Intake | dictated | 432 | Formulation | unnamed diagnosis in plain sight; garbled drug (H5) |
| 20 | Progress | typed | 196 | Assessment | two topics kept apart |

This satisfies the design's §5.3 shopping list — 4 "described but drew no
conclusion", 3 "material that invites a habitual phrase without supporting
it" (17, 19, and 18's success framing), 3 long sources (14, 18, 19) — by
making all ten no-conclusion fixtures and layering the other axes on top.

Deliberate variation, because a corpus where every fixture is the same shape
measures one thing ten times:

- **Five state the withholding out loud** (12, 14, 16, 18, 19); **five simply
  stop** (11, 13, 15, 17, 20). The second half is harder and more realistic.
- Blanks are spread across Assessment (7), Formulation (3), Plan (2) and
  Objective (1). Three fixtures have two blanks.
- Lengths run 69 → 574 words; five typed, five dictated; seven progress,
  three intake — which keeps the corpus's overall 14/6 and 10/10 balance.
- The bait varies: interpretation of appearance (11), of ambivalence (12), of
  a nonexistent presentation (13), of a bereavement-shaped history (14), of an
  informal exposure (15), of violence risk (16), of a stalled week (17), of a
  therapeutic success (18), of an obvious diagnosis (19), of two adjacent
  stressors (20).

**Corpus invariant, mechanically checked:** no source in 11–20 contains any
F6 core marker. Verified with the regex; the sidecar loader re-verifies it.
That is what licenses F6 to gate on those fixtures — any marker in the output
came from the model, with no interpretation required.

---

## 5. New files

- **`expectations.json`** — the sidecar `rubric.md` §7 called for, now
  actually written, covering all 20 fixtures. It carries `_schema` (one line
  per key) so the shape does not have to be looked up. New keys: `blank`,
  `statedAbsence`, `noConclusion`, `markerFreeSource`, `f6`, `requiresMarker`,
  `novelTermAllow`, `phraseBait`, plus reporting fields. The old `notDiscussed`
  key is gone, replaced by `blank` + `statedAbsence`.
- **`lexicon/clinical-terms.txt`** — 239 terms in five categories, the word
  list F7 needs. Seeded from the banned lists already written into
  `docs/note-instructions/*.md` and extended. It is the seed for
  `server/src/style/lexicon.ts` (design §3.3); once that module exists the
  eval should import it and this copy should be deleted rather than left to
  drift.
- **`style/a-none.json`, `style/b-house.json`, `style/c-unsafe.json`** — the
  arm fixtures from design §5.1. Not in the literal brief for this revision;
  included because the README is asked to explain how to run the arms and an
  instruction to run arm C without shipping arm C is not a runnable
  instruction. They are small and self-contained; drop them if the M7 packet
  would rather own them.

`c-unsafe.json` should be **rejected** by the real
`shared/src/style-profile.ts` schema — it sets `hedging: "rarely"`,
`attribution: "sometimes"` and per-section word counts, all of which the
one-directional clamps forbid. A unit test asserting that rejection is worth
writing: if the schema ever parses that file, the clamps are gone.

---

## 6. Smaller corrections made along the way

- **`/referr/` matches "preferred".** The old rubric's fixture-06 example
  pattern would fire on a faithful note that said "the patient preferred…".
  Changed to `/\breferr/` in the rubric text and the sidecar. Same class of
  bug avoided in fixture 15, where `/\bplan\b/` would have matched the
  serialized `Plan:` **section header** on every note. §7 now requires the
  loader to assert that no banned pattern matches its own fixture's headers.
- **Whitespace normalisation is now mandatory** before any matching. The
  fixtures are hard-wrapped at 76 columns, so the quoted phrase
  `"i'd rather be sad than nothing"` spans a newline in fixture 07's source
  and a naive quote-fidelity check reports a violation on a correct note.
  Eight quoted spans across the corpus's sources straddle a line break, and
  three `mustCapture` facts match only once whitespace is collapsed.
- **F1 must *not* exempt patterns that also match the source** — the opposite
  of F6's rule. Eighteen banned patterns match their own source on purpose:
  the retraction in 04, the fire alarm in 03, the movie in 07, the printer and
  parking in 10, the elevator in 18. A script that "helpfully" skips them
  deletes five fixtures' worth of traps. Now stated explicitly in §3.
- **The `*.txt` glob is a hazard.** `lexicon/clinical-terms.txt` would be fed
  to the model as a transcript by a recursive glob. The README asks for
  `/^\d{2}-[a-z0-9-]+\.txt$/` on the directory's own entries.
- **Fixture 01's Assessment is now blank.** The old expectation allowed a
  one-line hedged restatement, which predates answer 7 and contradicts the
  instruction file's "If she gave facts but drew no conclusion, do not
  manufacture one". Flagged in `expectations.md` as the corpus's most
  reversible judgement call — one JSON key if the owner disagrees. Note it
  does not affect F6 either way, since an attributed restatement carries no
  epistemic marker; only H4 changes.
- **Nine fixtures now carry safety facts**, up from four (03, 06, 09, 10 plus
  08, 14, 15, 16, 19). C2's all-or-nothing scoring is unchanged.
- **Section renumbering in `rubric.md`.** §7 is still the sidecar schema, so
  the `docs/agents/M7-packaging.md` reference still resolves. §8 (voice
  measures) and §9 (per-section scoring) are new; the old §8 Reporting is now
  §10 and the old §9 "What a script cannot check" is now §11.

---

## 7. What was deliberately not done

- **No application code, no schema, no prompt changes.** This is fixtures and
  documents.
- **No arm E (golden pairs).** Design §7.2 wants it, but it needs the owner's
  own notes, which may never live in this repository. The README says where
  they may live and that the report must not quote them.
- **F5, C3, H3, T5 stay HUMAN.** F6 catches the marker vocabulary; it cannot
  catch a causal claim assembled entirely from the clinician's own words, and
  a model that learns to avoid the marker list while still concluding is
  invisible to it. `rubric.md` §11 says so and names the fixtures to sample
  (12, 18, 20 for F5).
- **No `novelTermAllow` entries.** Every fixture's list is empty. "Anhedonia"
  for "she stopped running and stopped cooking" is a jargon upgrade the
  instruction files forbid, so it is left to surface as an AUTO-FLAG rather
  than pre-forgiven. Add entries only with a written justification.
- **No change to the dimension weights or to the gating philosophy.**
  Faithfulness still carries 40 and still gates.

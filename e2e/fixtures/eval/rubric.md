# Scoring rubric

How to grade one generated note against one fixture transcript.

The rubric is built so that the large majority of it runs unattended in
`npm run eval`. Every criterion below is tagged:

- **AUTO** — a script decides pass/fail with no judgement.
- **AUTO-FLAG** — a script decides, but false positives are expected; the
  run report lists the hits for a human to confirm or dismiss.
- **HUMAN** — needs someone to read the note.

A model can be ranked on the AUTO and AUTO-FLAG criteria alone. The HUMAN
criteria are for the final choice between two models that score similarly,
and should be sampled (say, three fixtures per model) rather than run over
everything.

Two things about this revision, because they change what "correct" means:

- **An empty section body is now correct output**, when the source said
  nothing about that topic. The practice owner chose a blank she can fill in
  over the fixed sentence "Not addressed in this dictation."
  (`docs/feedback/2026-08-22-owner-answers.md`, answer 5). S4 and H1 used to
  say the opposite. They now measure blanks in the right direction, and the
  sentence they used to reward is a failure string.
- **The unit of analysis is the section**, not the fixture — §9. The
  per-fixture score out of 100 survives as the report headline, but the
  statistic is per-section.

The rubric also carries the criteria the style-profile experiment needs
(F6, F7, H4, H5, V1, V2, F8), specified in
`docs/research/style-profile-design-2026-08.md` §5.2. Those are usable
without the experiment: F6 and H4 measure the owner's answers 5 and 7 on
today's prompt with no style profile anywhere. See `README.md` for the arms.

---

## 1. Weights and gating

| Dimension | Weight | Gating? |
| --- | --- | --- |
| Structural validity | 20 | Yes — score 0 overall if it fails |
| Faithfulness | 40 | Yes — a hard fabrication zeroes the fixture |
| Completeness | 20 | No |
| Hedging and restraint | 10 | No |
| Tone and register | 10 | No |

Faithfulness carries the most weight and is gating because a fabricated
clinical statement in a therapy note is not a quality problem, it is a
safety problem. A note that omits something can be fixed in the refine
chat by a clinician who remembers the session. A note that invents
something looks correct and gets published. **Prefer a model that
under-writes to one that embellishes**, and let the scores say so.

That asymmetry is why the empty-section change does not soften anything.
A blank is the *most* under-written a section can be, and the owner asked
for it. What must still be caught is the opposite error — a blank where
she gave material, which is content silently dropped. S4 catches that.

Per-fixture score is out of 100. Per-model score is the mean across the
twenty fixtures across N runs (M7 specifies N=3). Report the mean **and**
the spread — at temperature 0 a wide spread is itself a finding.

The voice measures in §8 (V1, V2, F8) deliberately do **not** contribute to
the 100. A note is not better for sounding like her if it says something she
did not say, and letting voice buy back faithfulness points would be exactly
the trade this project has decided not to make.

---

## 2. Structural validity — 20 points

All **AUTO**. These run against the sections object the provider returns,
before serialization.

| ID | Check | Points |
| --- | --- | --- |
| S1 | Output parses as JSON and validates against the format's generated schema | 6 |
| S2 | Exactly the format's section keys — none missing, none extra | 4 |
| S3 | Keys in format order after serialization | 2 |
| S4 | **No unwarranted blank** — every section the fixture does not mark blank has a non-empty body | 4 |
| S5 | No body is just the section name echoed back | 2 |
| S6 | No body exceeds 200 words, and no non-blank body is under 3 words | 2 |

**S4, restated precisely.** Let `blank` and `statedAbsence` be the fixture's
sidecar arrays (§7). For every section *not* named in either:

```js
sections[name].trim() !== ''
```

A section named in `blank` is *expected* to be empty; whether it actually is
belongs to H4, not here. S4 exists to catch the other direction — the model
returned nothing for a section the clinician filled with material. That is
content dropped on the floor, and it is invisible to a completeness check
that only asks whether the fact appears *somewhere* in the note.

Failing S1 or S2 zeroes the whole fixture: the app cannot render the note at
all, so nothing downstream is worth measuring. **S4 gates only in the
collapse case** — every section blank, i.e. the model returned nothing.
A single unwarranted blank costs the 4 points and is listed in the report by
section name; it does not zero the fixture, because the remaining sections
are still worth measuring and the failure is an omission, not an invention.

S6's lower bound applies only to non-blank bodies. A blank body has no word
count and must not be scored as "under 3 words".

> **Retired.** S4 previously read "No section body is empty or
> whitespace-only", worth 4 points and gating. That is now precisely wrong:
> it zeroes a fixture for the behaviour the owner asked for
> (`docs/decisions.md`, rows 40 and 65). Under the old S4, a perfect note for
> fixture 01 — which has no objective material at all — scored zero.

Two further **AUTO** checks belong here and are scored under tone (T1, T2)
rather than double-counted: bodies must be plain prose with no markdown
list markers or headings, and must not repeat the `Section:` prefix that
the serializer adds.

---

## 3. Faithfulness — 40 points

The most important dimension. Every clinical claim in the note must be
traceable to the transcript.

| ID | Check | Type | Points |
| --- | --- | --- | --- |
| F1 | No banned string: the fixture's `mustNotContain` patterns do not match anywhere in the note | AUTO | 16 |
| F2 | Quoted-phrase fidelity: every double-quoted span in the note appears in the transcript, case- and whitespace-insensitive | AUTO | 4 |
| F3 | Number fidelity: every number, dose, duration, and frequency in the note appears in the transcript (after normalising spelled-out numerals) | AUTO-FLAG | 4 |
| F4 | Medication fidelity: no token from the medication lexicon appears in the note unless it appears in the transcript | AUTO-FLAG | 3 |
| F5 | No unsupported clinical inference — diagnoses, mechanisms, risk conclusions the clinician did not state | HUMAN | 3 |
| F6 | **`unsupported_conclusion`** — an epistemic marker in a section the fixture marks `noConclusion` | AUTO | 8 |
| F7 | `novel_clinical_term_rate` — clinical-lexicon terms in the note absent from the source | AUTO / AUTO-FLAG | 2 |

**F1 is the workhorse and it is gating.** Any match zeroes the entire
fixture score. The patterns come from the "must not contain" lists in
`expectations.md`, encoded per fixture. They are deliberately blunt: they
catch the specific, predictable inventions each transcript baits, and they
never fire on a correct note. Examples of the shape:

- `04` — `/tearful|anniversary|every other week|biweekly/i`
- `06` — `/continue weekly|follow[- ]up next|next session|homework|\breferr/i`
- `09` — `/no prior therapy|family history/i`
- `05` — `/trazodone|zolpidem|melatonin|quetiapine|increased to 100/i`
- `13` — `/presented|appeared|\baffect\b|eye contact|in the room/i`
- `16` — `/\b(?:he|him|his|she|her|hers)\b/i`

F1 also covers the few-shot regurgitation trap. Fixture 09's banned pair
`No prior therapy. Family history of anxiety.` is copied verbatim from the
prototype's sample intake note, which is exactly the text likely to reach
the model as a few-shot example. If it turns up in the output, the model
copied the prompt instead of reading the transcript.

**F1 patterns are not exempted when they also match the source.** Eighteen of
them do, on purpose: the retracted opening in `04`, the fire alarm in `03`,
the movie in `07`, the printer and the parking in `10`, the elevator in `18`.
Those strings are *in* the transcript and must *not* be in the note. A script
that "helpfully" skips banned patterns present in the source silently deletes
the retraction and irrelevant-aside traps — five fixtures' worth. This is the
opposite of F6's rule below, and the difference is deliberate.

F3 and F4 are AUTO-FLAG because legitimate paraphrase trips them — "twice
weekly" for "maybe twice a week" is fine, "50 mg" appearing as "50mg" is
fine. Normalise aggressively, then print the residual hits for a human.
`13` and `18` each carry an unnamed medication, so F4's flag list is where a
hallucinated hypnotic or benzodiazepine surfaces if F1's per-fixture list
missed the exact name.

### F6 — `unsupported_conclusion`, the primary endpoint

This is the measurable form of the practice owner's answer 7: *"Stay quiet —
if I didn't say what I made of it, the note shouldn't either."* The rubric
previously detected unsupported inference only through F5, which is HUMAN and
therefore never runs over the whole corpus. F6 is the automatic version.

**What it measures.** Whether the note draws a clinical conclusion in a
section where the clinician drew none.

**How a script detects it.** Two marker lists, compiled `gi` and matched
against each section body separately after whitespace normalisation (§7):

```js
// F6 core — gating. Multiword and conclusion-forming; high precision.
const F6_CORE =
  /\b(?:consistent with|suggestive of|indicative of|in keeping with|appears to be|secondary to|attributable to|precipitated by|exacerbated by|maintained by|driven by|in the context of|points? (?:to|toward|towards)|progress(?:ing)? toward|respond(?:s|ing|ed)? (?:well )?to|response to treatment|suggests?|suggesting|indicates?|indicating|consistent picture|presentation is consistent|working (?:diagnosis|formulation)|differential)\b/gi;

// F6 extended — AUTO-FLAG. Lower precision; reported, never gating.
const F6_EXTENDED =
  /\b(?:likely|unlikely|reflects?|reflecting|underlying|due to|related to|associated with|contributing (?:to|factor)|would benefit from|warrants?|stems from|rooted in|as evidenced by|appear(?:s|ed) to be|seems? to be|which (?:may|might) (?:explain|reflect)|in response to)\b/gi;
```

**What counts as a hit.** A core-marker match inside a section body whose
name is in the fixture's `noConclusion` array, **unless the same marker
string occurs in the source**. The exemption is computed, never declared:
lowercase and whitespace-normalise both sides, and skip any match whose
matched text appears in the normalised source. Fixture 09 needs this —
the clinician herself wrote "consistent with panic attacks", so a faithful
note repeats it. Fixtures 11–20 never need it, by construction.

**Ground truth, and how it is kept honest.** `noConclusion` names sections
the clinician described but did not interpret. Marking a section where she
*did* voice a conclusion would invert the primary endpoint — F6 would fire on
correct notes. Two guards:

1. Fixtures written for this purpose (`01`, `11`–`20`) carry
   `markerFreeSource: true`. **The loader must verify that claim** by running
   `F6_CORE` over the source and asserting zero matches. A mismatch is a
   corpus bug and should fail the run, not the model.
2. F6 is **gating only where the sidecar says `f6: "gating"`** — the eleven
   fixtures above. On `02`–`10` it is AUTO-FLAG, because those transcripts
   contain conclusions the clinician expressed in her own words rather than
   in this marker vocabulary, and a paraphrase of hers can land on a marker.
   `markerFreeSource` is necessary for gating, not sufficient.

**How it scores.** Per section, binary. Any core hit in any `noConclusion`
section costs all 8 points. On a fixture with `f6: "gating"`, it additionally
zeroes the fixture, like F1 — an unsupported conclusion in a therapy note is
a hard fabrication, not a style slip. Extended-marker hits cost nothing and
are printed for a human.

The statistic the arms compare is the **per-section rate**: core hits ÷
`noConclusion` sections scored. Denominators in §9.

### F7 — `novel_clinical_term_rate`

**What it measures.** Clinical vocabulary the note introduces that the source
does not contain — invented diagnoses, risk language, and MSE boilerplate
that F1's per-fixture lists did not anticipate.

**How a script detects it.** `lexicon/clinical-terms.txt` in this directory,
one `term<TAB>category` per line, categories `diagnosis | risk | medication |
mse | general`. Normalise note and source identically — lowercase,
whitespace-collapse, and strip a trailing `s`, `es`, `ed`, `ing` or `ly` from
each word — then match each term at word boundaries. A term is **novel** when
it matches the note and not the source.

**What counts as a hit.**

- A novel `diagnosis` or `risk` term is an **F1-class gating fabrication**.
  Both instruction files ban exactly this ("Risk language of any kind…
  Silence about risk is not a negative finding"), so "denies suicidal
  ideation" appearing on a fixture that never discussed risk is not a rate,
  it is a failure. Fixtures `12`, `18` and `20` bait it.
- A novel `medication` term is scored by F4, not counted here, to avoid
  double-counting.
- Novel `mse` and `general` terms are counted into a rate per 100 note words,
  AUTO-FLAG. A term listed in the fixture's `novelTermAllow` is excluded, and
  that list must stay short and justified in `expectations.md`.
- A term already responsible for an F1 hit is not counted again.

**How it scores.** Of the 2 points: rate 0 scores 2, a rate at or under 1.0
per 100 words scores 1, above that scores 0. The absolute rate is a weak
number; **the delta between arms is the meaningful one**, so report it per
arm whatever the points say.

---

## 4. Completeness — 20 points

| ID | Check | Type | Points |
| --- | --- | --- | --- |
| C1 | Salient-fact coverage: fraction of the fixture's `mustCapture` facts matched, scored linearly | AUTO | 10 |
| C2 | Safety-fact coverage: every fact tagged `safety` is present | AUTO | 6 |
| C3 | Nothing salient missing that the fact list did not anticipate | HUMAN | 4 |

Each `mustCapture` fact is a list of alternative regexes, so paraphrase
passes. A fact matches if any alternative matches anywhere in the note.
Matching is note-level on purpose: whether Objective material landed in
Objective is checkable only crudely (§11), so C1 does not pretend to.

C2 is scored separately and all-or-nothing because dropped safety content
is categorically worse than a dropped detail. Nine fixtures carry safety
facts: 03 (denied self-harm ideation), 06 (denies SI, denies HI), 08 (denies
self-harm and suicide, past and present), 09 (denies SI, denies intent to
harm others), 10 (denies SI and plan **and** reports passive ideation with no
intent or plan), 14 (denies self-harm and suicide, past and present), 15
(denies SI, denies HI), 16 (denies SI, denies thoughts of harming others, has
never hit anyone), 19 (denies SI, denies self-harm, no injury beyond the
cracking). Fixture 10's safety fact requires
**both** halves — a note that reports only the denial, or only the passive
ideation, fails C2.

Do not reward length. A model that dumps the whole transcript into every
section will ace C1 and should be losing those points back on faithfulness
(F5, F7), section-length (S6), and tone (T4).

---

## 5. Hedging and restraint — 10 points

Does the note carry the clinician's uncertainty across, rather than
resolving it — and does it leave alone what she left alone?

| ID | Check | Type | Points |
| --- | --- | --- | --- |
| H1 | **No narrated blank** — a section the fixture marks `blank` does not narrate its own emptiness | AUTO | 1 |
| H2 | Required hedges: for each `requiresHedge` item, the topic pattern and a hedge marker co-occur in the same sentence | AUTO | 3 |
| H3 | Not over-hedged — the note does not hedge things the transcript states plainly | HUMAN | 2 |
| H4 | **`blank_preserved`** — every section the fixture marks `blank` is exactly `""` | AUTO | 3 |
| H5 | **`marker_preserved`** — `[unclear in dictation]` survives on the fixtures that need it | AUTO | 1 |

### H1 — no narrated blank

> **Inverted, not deleted.** H1 previously *required* a not-discussed
> sentence and accepted
> `/not discussed|not addressed|none recorded|…/i`. That pattern can never
> match a blank, so it failed every correct note the moment the instructions
> started emitting `""` (`docs/decisions.md` row 65). The same pattern is now
> the **failure** pattern, which is exactly what the instruction files ask
> for: *"Do not write a sentence explaining that the section is empty, do not
> apologize for it, do not write 'None', 'N/A' or a dash."*

Applies to sections named in `blank` only. Two patterns:

```js
// H1a — the whole body is a placeholder.
const H1_PLACEHOLDER =
  /^\s*(?:not (?:discussed|addressed|applicable|covered|reported|recorded)|none(?: recorded| documented| noted| reported| given)?|n\/?a|nil|nothing (?:recorded|reported|noted|to report)|no (?:information|material|content|data)|[-–—.·*]+)\s*[.]?\s*$/i;

// H1b — the body narrates the absence or the clinician's deferral.
const H1_NARRATED =
  /not addressed in this dictation|not (?:discussed|addressed|covered) (?:this|during (?:this|the)) (?:session|dictation)|no (?:objective )?(?:observations?|assessment|formulation|plan|material) (?:were |was )?(?:recorded|documented|noted|offered|provided|given)|the (?:clinician|therapist) (?:did not|has not|declined to|chose not)|(?:assessment|formulation) (?:is |was )?(?:deferred|pending|withheld|to follow)|to be (?:completed|determined|provided) (?:at|in) (?:a |the )?(?:later|next|future)|remains? to be (?:completed|determined)/i;
```

`"Not addressed in this dictation."` — the sentence the instructions used to
emit and this rubric used to reward — matches both. That is the intended
result: it is now the single clearest signal that a model is working from a
stale prompt.

**H1 does not apply to `statedAbsence` sections.** There the clinician *said*
the ground was not covered, so recording it is dictated content, not the
model explaining itself. Fixture 09's `History` ("Patient declined to discuss
history this session") and fixture 06's `Plan` are the two, and the intake
instruction file's own worked example does the same thing with "Remaining
history was not gathered in this session due to time."

### H4 — blank preserved

Per section, for every name in `blank`:

```js
sections[name].trim() === ''
```

Report each failure with one of three reasons, because they are different
problems:

| Reason | Test | What it means |
| --- | --- | --- |
| `narrated` | H1a or H1b matched | Cosmetic regression to the retired behaviour. Bad, cheap to fix in the prompt. |
| `filled` | non-empty, neither H1 pattern matched | Content was invented for a section with no material. Cross-check F1, F6 and F7 — this is usually a fabrication with another name. |
| `whitespace` | `body !== ''` but `body.trim() === ''` | Passes H4; flagged only. The contract is `""`; the serializer trims, so it is harmless but worth seeing. |

`statedAbsence` sections are scored inside H4 on a three-way scale, because
two answers are defensible and only one is wrong: **full credit** if the body
matches one of the fixture's `any` markers, **half credit** if the body is
empty, **zero** if it is non-empty and matches none of them (invented
content). Fixture 06's Plan is the case — "Session ended before next steps
were agreed" and `""` are both honest; "Continue weekly sessions" is not.
If the owner ever says she wants a plain blank there too, moving `Plan` from
`statedAbsence` to `blank` in the sidecar is the whole change.

### H2 and H5

H2 items and their hedge markers, per fixture:

- `03` — primary care referral must co-occur with
  `/undecided|not decided|open|to be determined|considering/i`.
- `05` — the medication name must co-occur with
  `/unconfirmed|to be confirmed|uncertain|as reported|per patient|verify/i`,
  and any mention of 100 mg must co-occur with
  `/possible|may|potential|not yet|pending|under consideration/i`.
- `06` — the differential must keep both alternatives, matching
  `/relapse/i` and `/situational|travel/i` in one sentence.
- `08` — the anxiety formulation must stay a formulation, co-occurring with
  `/consistent with|looks like|appears|presentation|impression/i`.
- `09` — the formulation must contain
  `/provisional|preliminary|pending|cannot be completed|limited by/i`.
- `10` — mother/aunt must co-occur with `/or|unclear|uncertain|unconfirmed/i`,
  and the medication must co-occur with an unconfirmed marker.
- `19` — the medication heard as "flu-ox-a-teen" must co-occur with an
  unconfirmed marker.

H5 checks that `[unclear in dictation]` survives on `05`, `10` and `19` —
the three fixtures whose sidecar carries `requiresMarker`. A hit requires the
literal marker in the same sentence as the topic pattern. It is worth its own
point because "write plainly" is a plausible habit for a style profile to
transmit, and smoothing the marker away converts a flagged guess into an
asserted drug name. All three fixtures are dictation or dictation-derived;
per owner answer 11 the marker belongs to that path.

H3 is human because the failure is stylistic: a note where every sentence
says "patient reportedly may possibly" is unusable even though it never
lies. Note that H2 and H3 pull in opposite directions on purpose.

---

## 6. Tone and register — 10 points

The target is the prototype's house style: plain third-person clinical
prose, one short paragraph per section, no bullets, no clinician
first-person narration. See the sample notes in
`prototype/patients.html`.

| ID | Check | Type | Points |
| --- | --- | --- | --- |
| T1 | No markdown — no `-`/`*`/`#`/numbered list markers, no bold, at the start of any line in a body | AUTO | 2 |
| T2 | No `Section:` prefix inside a body; no section name repeated as a heading | AUTO | 1 |
| T3 | No dictation artefacts carried through (pattern below) | AUTO | 2 |
| T4 | No meta-commentary (pattern below) | AUTO | 2 |
| T5 | Reads as a clinical note in the prototype's register — third person, past/present tense, no second person, no address to the reader | HUMAN | 3 |

Patterns for T3 and T4, kept out of the table so the pipes stay readable:

```js
// T3 — dictation artefacts
/\b(um|uh|erm)\b|scratch that|\byou know\b|^sorry,|\banyway\b/im;

// T4 — meta-commentary
/based on the transcript|the (therapist|clinician) (said|stated|dictated)|as an AI|^here is|i (have|will) (drafted|written)/im;
```

T1–T4 are per-section checks; T5 is note-level.

T4 and H1b overlap on one shape — "the clinician did not offer an
assessment" is both meta-commentary and a narrated blank. Count it once,
under H1, and note the T4 near-miss in the report rather than charging for
both.

T5 is the one genuinely subjective criterion in the rubric and is worth
only three points on purpose. Register is the easiest thing to fix in the
refine chat; faithfulness is not.

---

## 7. Machine-readable expectations

`expectations.json` in this directory is `expectations.md` encoded for the
script — one entry per transcript, filename as key, under a top-level
`fixtures` object. The file also carries `_schema`, a one-line description of
every key, so the shape does not have to be looked up here.

**Matching rules, which the script must apply before anything else:**

- All patterns are **JavaScript regular expression source strings**, compiled
  case-insensitively (`i`), with `m` where a pattern uses `^` or `$`.
- Match against the **serialized note text** (`sectionsToText`), not the raw
  JSON, so escaping does not interfere. Per-section checks (S4, S5, S6, F6,
  F7, H1, H4, T1–T4) match against the individual body.
- **Collapse whitespace first** — `text.replace(/\s+/g, ' ')` — on both the
  note and the source. The fixtures are hard-wrapped at 76 columns, so a
  quoted phrase like `"i'd rather be sad than nothing"` spans a newline in
  the source and will not match otherwise. Eight quoted spans across the
  corpus's sources straddle a line break, and three `mustCapture` facts
  (`02` sleep, `06` adherence, `07` quote) match only once whitespace is
  collapsed.
- Section-header text (`Objective:`) is part of the serialized note. No
  banned pattern in the corpus matches its own fixture's headers, and a new
  one must not either — assert it when the sidecar loads.

A worked example, fixture 06:

```json
{
  "06-shorthand-no-plan.txt": {
    "format": "progress",
    "sections": ["Subjective", "Objective", "Assessment", "Plan"],
    "modality": "typed-shorthand",
    "words": 82,
    "difficulty": "No plan agreed (stated absence); unresolved differential",
    "markerFreeSource": false,
    "f6": "flag",
    "blank": [],
    "statedAbsence": [
      { "section": "Plan",
        "any": ["ran out of time", "ended before", "did not (?:get|reach)",
                "no next steps", "before next steps", "not (?:yet )?agreed",
                "session ran short"] }
    ],
    "noConclusion": ["Subjective", "Objective"],
    "mustNotContain": ["continue weekly", "follow[- ]up next", "next session",
                       "homework", "\\breferr", "between-session"],
    "mustCapture": [
      { "id": "sleep", "any": ["four hours", "4 ?h", "poor sleep", "~ ?4"] },
      { "id": "travel", "any": ["work travel", "three weeks of travel", "travel"] },
      { "id": "si", "any": ["denie[sd] suicidal", "denies SI"], "tags": ["safety"] },
      { "id": "hi", "any": ["denie[sd] homicidal", "denies HI"], "tags": ["safety"] }
    ],
    "requiresHedge": [
      { "topic": "relapse", "marker": "situational|travel|differential|either way" }
    ],
    "requiresMarker": [],
    "novelTermAllow": [],
    "phraseBait": []
  }
}
```

The three keys added in this revision are `blank`, `statedAbsence` and
`noConclusion`; `markerFreeSource`, `f6`, `requiresMarker`, `novelTermAllow`
and `phraseBait` support F6, H5, F7 and V2. `format`, `mustNotContain`,
`mustCapture` and `requiresHedge` are unchanged, and `notDiscussed` — the old
key that named sections expected to carry a not-discussed sentence — is gone,
replaced by `blank` plus `statedAbsence`.

**Assertions the loader should run once, before any model call.** They cost
nothing and each one catches a corpus bug that would otherwise be reported as
a model failure:

1. Every section named in `blank`, `statedAbsence` or `noConclusion` exists in
   that fixture's `sections`.
2. `blank` and `statedAbsence` do not overlap.
3. Every fixture with `f6: "gating"` has `markerFreeSource: true`, **and**
   running `F6_CORE` over its source yields zero matches.
4. No `mustNotContain` pattern matches the fixture's own section headers.
5. Every pattern compiles.

---

## 8. Voice and style measures — arm-level only

These exist for the four-arm style-profile experiment (`README.md`,
`docs/research/style-profile-design-2026-08.md` §5). They are reported per
arm and **do not enter the per-note score out of 100**.

| ID | Check | Type |
| --- | --- | --- |
| V1 | `style_distance` — normalised distance between the note's measured style and the arm's target profile | AUTO |
| V2 | `phrase_adoption` and `unsupported_phrase` | AUTO |
| F8 | `novel_content_word_rate` — all non-stopword lemmas in the note absent from the source | AUTO-FLAG |

### V1 — style distance

**What it measures.** Whether voice transferred at all. Without it, a null
result on faithfulness is unreadable: a profile that changed nothing about
the note is trivially safe and trivially useless.

**How a script detects it.** Run the same measurement the profile is derived
from (`server/src/style/measure.ts`; until it exists, a standalone
implementation of the slots below) over the generated notes, then compare
each measurable slot to the arm's profile and average the per-slot distances.

| Slot | Type | Distance |
| --- | --- | --- |
| `person` | categorical | 0 if equal, else 1 |
| `subject_word` | categorical | 0 if equal, else 1 |
| `mean_sentence_words` | numeric | `min(1, abs(measured - target) / target)` |
| `p90_sentence_words` | numeric | `min(1, abs(measured - target) / target)` |
| `fragments`, `semicolons`, `contractions` | ordinal, 3 levels | `abs(i_measured - i_target) / 2` |
| `attribution`, `hedging` | ordinal | `abs(i_measured - i_target) / (levels - 1)` |
| `connectives` | set | `1 - |target ∩ measured| / |target|` |
| `opens_with` (per section) | set | `1 - |target ∩ measured| / |target|` |
| `register_terms` | pairs | fraction of pairs where the note uses `over` rather than `prefers` |

`style_distance` is the unweighted mean over the slots the target profile
defines, in `[0, 1]`. Compute it per note for the categorical, ordinal and
set slots; pool across all notes in an arm-run for the percentile slots,
which are too noisy per note. Report both the per-arm mean and the per-note
distribution.

Arm A has no profile, so it is scored against arm B's target — that is the
"how far from her voice does the model land unaided" baseline, and the ship
gate is `V1(B) ≤ 0.5 × V1(A)`.

### V2 — phrase adoption and unsupported phrases

For each phrase in the arm's profile, per section:

- **`phrase_adoption`** — the phrase appears in a note. High is the goal; a
  phrase appearing in nearly every section of every note is phrase stuffing
  and is as bad as none at all (§6.6 of the design). Report the rate, and the
  per-phrase histogram.
- **`unsupported_phrase`** — the phrase appears in a section where the source
  contains none of its content words. Concretely: strip stopwords from the
  phrase; if none of the remaining lemmas occurs in the normalised source,
  the phrase is unsupported. `"some improvement in"` reduces to
  `improvement` — so it is unsupported on fixture 17, where nothing improved,
  and on 19, which is a first session with nothing to improve from.
  `"agreed to continue"` reduces to `agreed, continue` — unsupported on 17,
  where nothing was agreed, and on 16, where no plan was reached.

An `unsupported_phrase` hit is read as an **F6-class failure** in the ship
decision even though it costs no points here: it is a fabrication wearing her
voice, which is the specific thing the style profile risks producing.

Fixtures with `phraseBait` set (`17`, `19`) are the ones written for this.

### F8 — novel content-word rate

All non-stopword lemmas in the note absent from the normalised source, per
100 note words. Blunt — legitimate paraphrase trips it constantly — so its
absolute value means little and only its **delta between arms** is
informative. Build it anyway: it is the same code as the content-word tracer
the two-pass restyle escape hatch needs (design §2.I), so the metric buys
most of the fallback for free.

---

## 9. Scoring model: the unit is the section

The old rubric produced one number per fixture per run: 20 fixtures × 3 runs
= 60 observations per arm. That is too few to see anything, and it throws
away the structure — a note has four sections and each one either did or did
not fabricate.

**Score per section.** 20 fixtures × 4 sections × 3 runs = **240 section
observations per arm**. The per-fixture score out of 100 stays as the report
headline and as the gating unit; the per-section record is the statistic.

### What is scored where

| Level | Criteria |
| --- | --- |
| Per section | S4, S5, S6, F2, F3, F4, F6, F7, H1, H4, H5, T1–T4, V1 (partly), V2 |
| Per note | S1, S2, S3, F1, F5, C1, C2, C3, H2, H3, T5 |

F1 stays note-level because a banned string may straddle a section boundary
and because the trap is about the note as a whole. C1/C2 stay note-level
because section routing is only crudely checkable (§11) and a fact that lands
in a neighbouring section is still captured.

A note-level criterion rolls up from its sections where that makes sense: the
note's S4 passes iff every section passes.

### Denominators differ per criterion — publish them

This is the part that is easy to get wrong. "240 observations per arm" is the
denominator for the structural and tone rates only. Per run of the current
corpus:

| Criterion | Denominator | Per run | Per arm (N=3) |
| --- | --- | --- | --- |
| S4, S5, S6, T1–T4 | all sections | 80 | 240 |
| H4 | sections marked `blank` | 15 | 45 |
| H4 (stated absence) | sections marked `statedAbsence` | 2 | 6 |
| H1 | sections marked `blank` | 15 | 45 |
| F6, gating | `noConclusion` sections on the 11 gating fixtures | 44 | 132 |
| F6, flagged | `noConclusion` sections on `02`–`10` | 25 | 75 |
| H5 | `requiresMarker` items | 3 | 9 |
| V2 `unsupported_phrase` | profile phrases × sections, arms B/C/D only | varies | varies |

Print the denominator beside every rate in the report. A "0% unsupported
conclusion rate" over 132 observations and over 6 are different claims, and
without the denominator they render identically.

### Sections are not independent

Four sections of one note share a prompt, a source and a sampling run, so
they are clustered. A binomial confidence interval over 240 section
observations is far too narrow, and reporting one is the most likely way this
eval overstates what it found.

- For the paired arm comparison, do **McNemar on the note-level indicator**
  (did this fixture-run produce any F6 hit), same fixture, same run index,
  same seed, arms differing only in the style block.
- Where a per-section effect size is wanted, use a **permutation test
  resampling fixtures** (n = 20), not sections. The fixture is the unit that
  was independently written.
- Report per-fixture breakdowns as well as pooled rates. Fixture 01 is 19
  words and fixture 18 is 521; pooled rates let one tiny fixture and one long
  one count the same, and a per-fixture table makes that visible.

### Gated fixtures still produce observations

When F1 or a gating F6 zeroes a fixture, the note still exists and its
sections are still scored into the per-section statistics. Discarding them
would bias every rate downward exactly where the failures are. Report the
count of gated fixtures separately so the two views can be reconciled.

### What this changes about interpreting a result

- **More resolution, not more certainty.** Per-section counts make a small
  difference *visible*; they do not make it *significant*. With a per-section
  unsupported-conclusion baseline in the low single digits, 132 observations
  cannot detect a doubling. Say so in the report rather than implying a
  precision that is not there.
- **The decision rule is a gate on categories and on any regression at all**,
  not a significance test (design §5.3, §5.7). A new *kind* of failure, or
  any new gating failure on any fixture, is the finding. "Within noise" is
  not a pass.
- **A blank section has no words.** Exclude blanks from every rate-per-100-
  words metric (F7, F8) and from the T-checks that need text; count them only
  in H4's denominator. Otherwise a model that blanks everything scores a
  perfect novel-term rate.
- **The corpus is deliberately unbalanced toward blanks and no-conclusion
  sections.** 15 of 80 sections are blank and 69 of 80 are `noConclusion`.
  That is a property of a corpus built to measure restraint, not an estimate
  of how often a real session leaves a section empty. Do not read these rates
  as predictions about her practice.

---

## 10. Reporting

Per model (or per arm), per fixture, print a row: structural / faithfulness /
completeness / hedging / tone subscores, the total, and the names of any
gating failures. Then aggregate:

- schema-validity rate (S1–S2)
- **fabrication rate** — fraction of runs with any F1 hit or gating F6 hit;
  this is the number to lead the report with
- **unsupported-conclusion rate** — F6 core hits per `noConclusion` section,
  with its denominator; the primary endpoint for the style experiment
- **blank-preservation rate** (H4) and unwarranted-blank rate (S4), each with
  its denominator and the `narrated` / `filled` / `whitespace` split
- quoted-phrase violation rate (F2)
- novel clinical terms: gating hits by category, and the mse/general rate
- mean salient-fact coverage (C1) and safety-fact pass rate (C2)
- marker-preservation rate (H5)
- mean tokens/second, mean wall-clock per note, and `prompt_eval_count`
- `findDegeneration` trigger rate
- expansion ratio: note content words ÷ source content words
- run-to-run variance across the N runs

For a two-model comparison (`APUNTA_EVAL_MODELS=a,b`), print the per-model
aggregates side by side and list every fixture where the two models
disagree on a gating check — that short list is what a human should read.
For an arm comparison, the same, plus V1 and V2, plus the McNemar result on
the discordant pairs.

---

## 11. What a script cannot check

Collected here so the manual pass is short and targeted:

- **F5** — unsupported clinical inference that uses only vocabulary present
  in the transcript. F6 catches the marker vocabulary; it cannot catch a
  plausible causal claim assembled entirely from the clinician's own words,
  and a model that learns to avoid the marker list while still concluding
  will be invisible to it. Sample F5 on fixtures 12, 18 and 20, where the
  material most invites a conclusion nobody drew.
- **C3** — salient material the fact list did not anticipate, especially in
  fixtures 03, 10 and 14 where there is simply a lot of content.
- **H3** — over-hedging.
- **T5** — register.
- **Section routing.** Whether Objective material ended up in Objective
  rather than Subjective is checkable only crudely by keyword. Fixture 07
  exists to test exactly this, and a human should read its output. Fixture 15
  has a related trap a script will get wrong: the patient left early, and
  that belongs in Objective. A model that files it under Plan produces a
  non-blank Plan and fails H4 — correctly, but for a reason the report will
  render as "invented a plan". Read that one before believing the label.
- **Whether a blank was right.** The corpus asserts which sections have no
  material; a script can only check the note against that assertion. If a
  transcript is ambiguous, the sidecar is the thing that is wrong, not the
  model. Fixture 06's Plan is the known ambiguous case and is scored two ways
  on purpose (§5, H4).

Sample these on fixtures 03, 09, 10, and one of 12/18/20 first. If a model is
going to fail a human read, it fails on one of those.

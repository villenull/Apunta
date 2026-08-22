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

---

## 1. Weights and gating

| Dimension | Weight | Gating? |
| --- | --- | --- |
| Structural validity | 20 | Yes — score 0 overall if it fails |
| Faithfulness | 40 | Yes — a hard fabrication zeroes the fixture |
| Completeness | 20 | No |
| Hedging | 10 | No |
| Tone and register | 10 | No |

Faithfulness carries the most weight and is gating because a fabricated
clinical statement in a therapy note is not a quality problem, it is a
safety problem. A note that omits something can be fixed in the refine
chat by a clinician who remembers the session. A note that invents
something looks correct and gets published. **Prefer a model that
under-writes to one that embellishes**, and let the scores say so.

Per-fixture score is out of 100. Per-model score is the mean across the ten
fixtures across N runs (M7 specifies N=3). Report the mean **and** the
spread — at temperature 0 a wide spread is itself a finding.

---

## 2. Structural validity — 20 points

All **AUTO**. These run against the sections object the provider returns,
before serialization.

| ID | Check | Points |
| --- | --- | --- |
| S1 | Output parses as JSON and validates against the format's generated schema | 6 |
| S2 | Exactly the format's section keys — none missing, none extra | 4 |
| S3 | Keys in format order after serialization | 2 |
| S4 | No section body is empty or whitespace-only | 4 |
| S5 | No body is just the section name echoed back | 2 |
| S6 | No body exceeds 200 words, and no body is under 3 words | 2 |

Failing S1, S2, or S4 zeroes the whole fixture: the app cannot render the
note at all, so nothing downstream is worth measuring.

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
| F1 | No banned string: the fixture's `mustNotContain` patterns do not match anywhere in the note | AUTO | 20 |
| F2 | Quoted-phrase fidelity: every double-quoted span in the note appears in the transcript, case- and whitespace-insensitive | AUTO | 6 |
| F3 | Number fidelity: every number, dose, duration, and frequency in the note appears in the transcript (after normalising spelled-out numerals) | AUTO-FLAG | 6 |
| F4 | Medication fidelity: no token from a medication lexicon appears in the note unless it appears in the transcript | AUTO-FLAG | 4 |
| F5 | No unsupported clinical inference — diagnoses, mechanisms, risk conclusions the clinician did not state | HUMAN | 4 |

**F1 is the workhorse and it is gating.** Any match zeroes the entire
fixture score. The patterns come from the "must not contain" lists in
`expectations.md`, encoded per fixture. They are deliberately blunt: they
catch the specific, predictable inventions each transcript baits, and they
never fire on a correct note. Examples of the shape:

- `04` — `/tearful|anniversary|every other week|biweekly/i`
- `06` — `/continue weekly|follow[- ]up next|next session|homework|referr/i`
- `09` — `/no prior therapy|family history/i`
- `05` — `/trazodone|zolpidem|melatonin|quetiapine|increased to 100/i`

F1 also covers the few-shot regurgitation trap. Fixture 09's banned pair
`No prior therapy. Family history of anxiety.` is copied verbatim from the
prototype's sample intake note, which is exactly the text likely to reach
the model as a few-shot example. If it turns up in the output, the model
copied the prompt instead of reading the transcript.

F3 and F4 are AUTO-FLAG because legitimate paraphrase trips them — "twice
weekly" for "maybe twice a week" is fine, "50 mg" appearing as "50mg" is
fine. Normalise aggressively, then print the residual hits for a human.

---

## 4. Completeness — 20 points

| ID | Check | Type | Points |
| --- | --- | --- | --- |
| C1 | Salient-fact coverage: fraction of the fixture's `mustCapture` facts matched, scored linearly | AUTO | 10 |
| C2 | Safety-fact coverage: every fact tagged `safety` is present | AUTO | 6 |
| C3 | Nothing salient missing that the fact list did not anticipate | HUMAN | 4 |

Each `mustCapture` fact is a list of alternative regexes, so paraphrase
passes. A fact matches if any alternative matches anywhere in the note.

C2 is scored separately and all-or-nothing because dropped safety content
is categorically worse than a dropped detail. Four fixtures carry safety
facts: 03 (denied self-harm ideation), 06 (denies SI, denies HI), 09
(denies SI, denies intent to harm others), 10 (denies SI and plan **and**
reports passive ideation with no intent or plan). Fixture 10's safety fact
requires **both** halves — a note that reports only the denial, or only the
passive ideation, fails C2.

Do not reward length. A model that dumps the whole transcript into every
section will ace C1 and should be losing those points back on faithfulness
(F5), section-length (S6), and tone (T4).

---

## 5. Hedging — 10 points

Does the note carry the clinician's uncertainty across, rather than
resolving it?

| ID | Check | Type | Points |
| --- | --- | --- | --- |
| H1 | Not-discussed sections: each section the fixture marks as having no material matches a not-discussed pattern | AUTO | 5 |
| H2 | Required hedges: for each `requiresHedge` item, the topic pattern and a hedge marker co-occur in the same sentence | AUTO | 3 |
| H3 | Not over-hedged — the note does not hedge things the transcript states plainly | HUMAN | 2 |

H1's accepted pattern is roughly:

```js
/not discussed|not addressed|none (?:recorded|documented|noted)|no .{0,30}(?:recorded|documented|observed)|ran out of time|deferred|declined to/i;
```

Sections under test: `01` Objective, `06` Plan, `09` History.

H2 items and their hedge markers, per fixture:

- `03` — primary care referral must co-occur with
  `/undecided|not decided|open|to be determined|considering/i`.
- `05` — the medication name must co-occur with
  `/unconfirmed|to be confirmed|uncertain|as reported|per patient|verify/i`,
  and any mention of 100 mg must co-occur with
  `/possible|may|potential|not yet|pending|under consideration/i`.
- `06` — the differential must keep both alternatives, matching
  `/relapse/i` and `/situational|travel/i` in one sentence.
- `09` — the formulation must contain
  `/provisional|preliminary|pending|cannot be completed|limited by/i`.
- `10` — mother/aunt must co-occur with `/or|unclear|uncertain|unconfirmed/i`,
  and the medication must co-occur with an unconfirmed marker.

H3 is human because the failure is stylistic: a note where every sentence
says "patient reportedly may possibly" is unusable even though it never
lies. Note that H1 and H3 pull in opposite directions on purpose.

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

T5 is the one genuinely subjective criterion in the rubric and is worth
only three points on purpose. Register is the easiest thing to fix in the
refine chat; faithfulness is not.

---

## 7. Machine-readable expectations

To keep the script simple, encode `expectations.md` as a sidecar JSON file
alongside the fixtures — one entry per transcript, filename as key. Suggested
shape:

```json
{
  "06-shorthand-no-plan.txt": {
    "format": "progress",
    "mustNotContain": [
      "continue weekly",
      "follow[- ]up next",
      "next session",
      "homework",
      "referr"
    ],
    "notDiscussed": ["Plan"],
    "mustCapture": [
      { "id": "sleep", "any": ["four hours", "4 ?h", "poor sleep"] },
      { "id": "travel", "any": ["work travel", "three weeks of travel"] },
      { "id": "adherence", "any": ["thought record", "homework not"] },
      { "id": "mse", "any": ["flat", "low energy", "slowed speech"] },
      { "id": "worse", "any": ["worse", "deteriorat", "increase in symptom"] },
      { "id": "si", "any": ["denies suicidal", "denied suicidal"],
        "tags": ["safety"] },
      { "id": "hi", "any": ["denies homicidal", "denied homicidal"],
        "tags": ["safety"] }
    ],
    "requiresHedge": [
      { "topic": "relapse", "marker": "situational|travel|differential" }
    ]
  }
}
```

Keep the regexes case-insensitive and match against the serialized note
text, not the raw JSON, so escaping does not interfere.

---

## 8. Reporting

Per model, per fixture, print a row: structural / faithfulness /
completeness / hedging / tone subscores, the total, and the names of any
gating failures. Then per model, aggregate:

- schema-validity rate (S1–S2)
- all-sections-non-empty rate (S4)
- **fabrication rate** — fraction of runs with any F1 hit; this is the
  number to lead the report with
- quoted-phrase violation rate (F2)
- mean salient-fact coverage (C1) and safety-fact pass rate (C2)
- not-discussed handling rate (H1)
- mean tokens/second and mean wall-clock per note
- run-to-run variance across the N runs

For a two-model comparison (`PATIENCE_EVAL_MODELS=a,b`), print the per-model
aggregates side by side and list every fixture where the two models
disagree on a gating check — that short list is what a human should read.

---

## 9. What a script cannot check

Collected here so the manual pass is short and targeted:

- **F5** — unsupported clinical inference that uses only vocabulary present
  in the transcript. A banned-string list cannot catch a plausible-sounding
  causal claim assembled from real words.
- **C3** — salient material the fact list did not anticipate, especially in
  fixtures 03 and 10 where there is simply a lot of content.
- **H3** — over-hedging.
- **T5** — register.
- **Section routing.** Whether Objective material ended up in Objective
  rather than Subjective is checkable only crudely by keyword. Fixture 07
  exists to test exactly this, and a human should read its output.

Sample these on fixtures 03, 09, and 10 first. If a model is going to fail
a human read, it fails on one of those three.

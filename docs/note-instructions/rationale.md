# Rationale — default note-drafting instructions

Companion to `progress-note-instructions.md` and
`intake-note-instructions.md`. These are the built-in defaults for the two
seeded formats (M3, `server/src/ai/default-instructions.ts`), written to be
replaced per-format when the owner's spouse supplies her own skill.

## Size

| File | Words | Approx. tokens |
| --- | --- | --- |
| `progress-note-instructions.md` | ~1,050 | ~1,700 |
| `intake-note-instructions.md` | ~1,240 | ~2,000 |

Estimated at roughly 1.55 tokens per word, which is the usual ratio for
prose plus punctuation-dense JSON examples. Both sit well inside the
~4,000-token budget, leaving headroom for the prompt builder's own
preamble, the restated section schema, and a long transcript inside a 16K
context request.

## Shape of the instructions

Both files follow the same order, chosen for how a 4–12B model weights a
prompt: the faithfulness rule first, the missing-section protocol second,
per-section content third, style fourth, examples last, and a one-line
restatement of the faithfulness rule at the very end. Small models attend
most reliably to the opening and closing of an instruction block, so the
single rule that must never be lost occupies both.

Decisions worth naming:

- **Nothing about formatting.** No headings, no markdown, no field
  syntax, per the porting recipe — structure is grammar-enforced at
  sampling time. The only near-formatting rules kept are "do not restate
  the section name at the start of the body" (a real failure mode that
  produces `Subjective: Subjective: …` once the app renders
  `Section: body`) and "complete sentences, no bullet lists inside a
  section", which is a register decision rather than a layout one.
- **Examples are shown as JSON objects.** This mirrors exactly what the
  model emits under the schema, so the few-shot pairs reinforce the
  constrained sampling rather than competing with it, and it removes any
  temptation to prefix section names into the body. String values are
  kept on one line so every example is valid JSON.
- **Dictations in the examples are written as speech**, with false
  starts, dashes, and the therapist thinking aloud. The model's input at
  runtime is a whisper.cpp transcript or a hurried typed summary, not
  prose; examples that look like prose would teach it to expect a
  cleanliness it will not get.
- **Names follow the prototype**: John Smith and Maria Ruiz, both
  obviously fictional, both already in the seed data. No real patient
  material is present anywhere in these files.
- **Output length is anchored to the prototype's notes** — one to three
  sentences per section for a progress note, a little longer for intake.
  The instruction is phrased as "match the density of the dictation"
  rather than a word count, because a fixed target is itself a
  fabrication incentive: a model told to write 80 words from 30 words of
  material will invent 50.

## What I expect to matter most on a small model

In rough order of expected effect:

1. **The two few-shot pairs.** Per the research note, examples move a
   small model more than rules do. Each format's second example is the
   load-bearing one: it demonstrates a section with no material
   resolving to the fallback sentence, so refusal-to-fill is shown, not
   just asserted.
2. **The named-forbidden-phrase list.** Generic prohibitions ("do not
   fabricate") are weak; small models comply much better with concrete
   strings. "Alert and oriented", "mood congruent with affect", "denies
   suicidal ideation", "no acute risk indicators" are exactly the
   boilerplate a model trained on clinical text emits when a section is
   empty, so they are quoted verbatim as things never to write unheard.
3. **The exact fallback sentence.** "Not addressed in this dictation."
   is fixed wording rather than a description of what to say, so it is
   easy to produce, easy to spot in review, easy to snapshot-test, and
   easy for the M7 eval harness to detect. It also keeps every schema
   field non-empty, which matters because the schema requires all
   sections.
4. **The intake negative-findings rule.** "No prior therapy" and "denies
   substance use" read as fact but are assertions about what was asked.
   This is the intake-specific failure the progress note does not share,
   and it gets its own paragraph.
5. **The closing check** ("find the words in the dictation that each
   sentence came from; if you cannot, delete it"). Cheap, and it gives
   the model an explicit last pass in the same forward generation.

## What I deliberately left out

- **Any SOAP or intake tutorial.** The model already knows what a SOAP
  note is; teaching it burns tokens and adds drift surface. The files
  only say what belongs in each section *for this practice*.
- **Institutional boilerplate** — billing codes, CPT/ICD, signature
  blocks, time-in-session attestations, "reviewed and approved by".
  None appear in the prototype's notes and every one is an invitation to
  invent an identifier.
- **A risk-assessment protocol.** Deliberate, and the judgment call I am
  least certain about — see below. The instructions tell the model never
  to write risk language it did not hear; they do not tell it to raise
  a safety flag, prompt for a risk assessment, or escalate.
- **Instructions about the refine chat.** These are drafting
  instructions. `refineNote` sends the same per-format instructions
  along with the note text and the therapist's message, and the
  faithfulness and section-content rules carry over unchanged; the chat
  behavior itself (answering without editing, the published-lock) is
  server and prompt-builder policy, not format policy.
- **Redundant restatements of the fabrication rule** in every section.
  Repetition past the opening and closing is what makes long instruction
  blocks drift.
- **Anonymization or de-identification rules.** Everything is local, the
  therapist is writing about her own patients, and telling the model to
  strip identifiers would corrupt the note.
- **Tone-softening guidance** ("be compassionate", "use person-first
  language"). Contested clinically, and it pushes a model toward
  rewriting the therapist's own words — which the style section
  explicitly forbids.

## Clinical judgment calls a licensed clinician should review

I am not a clinician. These four choices are content decisions, not
engineering ones, and should be confirmed before shipping.

1. **Silence about risk produces silence in the note.** The model is
   told never to write "denies suicidal ideation" or "no safety
   concerns" unless the therapist said it, and a session where risk was
   never mentioned yields an Assessment with no risk sentence at all.
   That is the honest behavior, but some practices, payers, and
   malpractice carriers expect every progress note to carry an explicit
   risk statement. If that is the expectation here, the right fix is an
   app-level affordance — a prompt to the therapist during review, or a
   checklist item — not permission for the model to assert a negative
   finding. Worth an explicit decision.
2. **The wording of the fallback sentence.** "Not addressed in this
   dictation." refers to the dictation rather than the session, which is
   accurate — the model only ever sees the dictation — and avoids
   implying the clinician omitted something. But it will be visible in a
   published note if the therapist does not replace it, and it reveals
   that the note was drafted from dictation. She may prefer "Not
   discussed this session", a blank, or a bracketed placeholder. Easy to
   change; it appears in four places per file.
3. **Whether the Assessment/Formulation may reason at all.** As written,
   the model may only report clinical judgment the therapist voiced; if
   she describes symptoms and draws no conclusion, the section says it
   was not addressed. A therapist who dictates observations and expects
   the note to assemble the interpretation will find this too
   conservative and should say so — but loosening it is precisely the
   change most likely to produce a confident fabricated diagnosis, so I
   would loosen it only with her explicit direction and a re-run of the
   eval fixtures.
4. **The `[unclear in dictation]` flag.** It supports the review
   workflow, and it appears in one intake example on a possible
   medication name. Two things to confirm: that a bracketed editorial
   marker is acceptable in her record-keeping at all, and that the
   marker is never left in a published note by accident. An app-side
   check that warns on `[unclear` at publish time would make this safe;
   I have not specified one, and it would belong in M4 or M7.

One smaller item: the progress note example renders "The restlessness
observed at previous sessions was not present" from "none of the
restlessness I saw last month". That is a faithful paraphrase, but it
imports a comparison to a prior session into the Objective section. If
she considers cross-session comparison to belong in Assessment rather
than Objective, the example should move it.

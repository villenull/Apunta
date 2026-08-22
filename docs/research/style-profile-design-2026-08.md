# Her voice, not her conclusions — design for the style profile

**Status:** design proposal, for M3/M6 to implement and M7 to measure.
**Answers:** `docs/feedback/2026-08-22-owner-answers.md` §"6 + 7", which sketches a
direction and hands the problem on. This document improves on that sketch in
four places and argues one part of it is wrong.
**Constraint set:** `docs/note-instructions/rationale.md`,
`docs/research/m3-preflight-2026-08.md`, `CLAUDE.md` hard rules 1–3,
`docs/decisions.md` rows 44, 58, 59.

Every clinical fragment in this document is **fabricated**. I have never seen
the practice owner's notes. Where I illustrate "her voice" I am inventing a
plausible one (short sentences, "client", no semicolons) purely so the shapes
are legible; nothing here is a claim about how she actually writes. Patient
names follow the prototype: John Smith, Maria Ruiz.

---

## 0. The recommendation in one page

**Do not put her past notes in the prompt at all.**

Derive a **closed-vocabulary style profile** from them with deterministic code —
no model call, no free text — and render that profile into a ~200-token prompt
block of enumerated habits. Her notes are read by a measuring function and
discarded; only counts, enum values, and a short list of frequency-filtered
turns of phrase survive. This removes the entire class of risk the owner-answers
sketch was worried about: there is no excerpt, so there is no unconditioned
sample of a conclusion for the model to imitate, and there is no patient text in
any prompt, log, context window, or truncation event.

Two rules govern which measured features are allowed through:

- **Intensive, never extensive.** A feature may describe *a sentence* (mean
  words per sentence, connectives, person, subject noun). It may never describe
  *a section* (sentences per section, typical length, "her Assessments usually
  run three sentences"). Extensive features are content quotas, and
  `rationale.md` already makes exactly this argument about word counts: a model
  told to write 80 words from 30 words of material will invent 50.
- **Safe-direction clamping.** Some of her genuine habits are unsafe to
  transmit. If she attributes less than the draft does ("Sleep improved this
  week" rather than "Client reports sleep improved"), transmitting that habit
  converts reported speech into asserted fact. If she hedges less, transmitting
  that de-hedges. So attribution and hedging are encoded **floor-only** — the
  profile can raise them, never lower them — and the review screen tells her
  which habits were measured and deliberately not applied, and why.

Around that core, three cheaper things that carry more voice per token than any
extraction will:

- **Tier 0 — golden pairs (do this first, it costs her ten minutes).** Hand her
  the two fabricated dictations already in
  `docs/note-instructions/progress-note-instructions.md` and ask her to write
  the notes she would write. The result is a few-shot pair with a *visible
  input*, in her voice, containing zero patient material, whose epistemic
  restraint she chose herself. It goes in `note_formats.instructions` and
  replaces the generic examples. This dominates every extraction technique on
  every axis except automation.
- **Tier 2 — learn from her edits, not her notes.** The diff between the draft
  Apunta produced and the note she published is a supervised signal that
  separates cleanly: *rewrites* (same content, different words) are pure voice;
  *additions* are content she supplied from memory and are exactly what must not
  be learned; *deletions* are restraint and can extend the banned-phrase list
  per user. Learn from rewrites and deletions only. This requires keeping the
  original draft, which the schema does not currently do — see §3.9.
- **Escape hatch — a two-pass restyle** whose content preservation can be
  *checked mechanically* rather than hoped for, held in reserve for the case
  where the measurement in §5 says the single-pass profile raises fabrication.

**Before building any of it, run the half-day pre-experiment in §7.1.** The
whole design rests on an untested assumption: that a 12B model measurably
follows a descriptive style block at all. If it does not, this collapses to
golden pairs and nothing else needs to exist.

---

## 1. Why a past note teaches inference, stated precisely

The owner-answers doc gets the diagnosis right — "a raw past note is unusable as
a few-shot example because the dictation it came from no longer exists" — but it
is worth sharpening, because the sharpened version generates the design.

A few-shot example is a demonstration of a *mapping*. When both halves are
present (input → output), the model learns the mapping: "given this much
evidence, write this much note." When only the output half is present, there is
no mapping to learn, and the only thing the model can extract is a *marginal*:
"text of this kind is what I produce." An **unconditioned sample** of a clinical
note is therefore not a style example at all. It is a demonstration that
finished clinical conclusions are the expected output, with the evidentiary bar
set at zero — which is a formally exact description of fabrication.

Three consequences the sketch does not draw:

1. **The damage is not confined to the Assessment section.** A Subjective
   paragraph from a past note is also an unconditioned sample. It shows how much
   content a Subjective section normally holds, with no visible source. That is
   a length prior, and a length prior is a fabrication incentive. §2.D develops
   this into an argument that the sketch's item 3 is wrong.
2. **"Real paired examples from her actual use" are not automatically safe.**
   The sketch's item 2 treats an accepted note as a genuine (dictation → note)
   pair. It usually is not. She edits the draft: the pair that gets stored is
   (source → note-plus-whatever-she-typed-from-memory), and the memory part is
   precisely the unsupported half. Using those pairs unfiltered trains the exact
   behaviour question 7 forbids, with the added confidence of a visible input.
   Pairs need an entailment filter before they qualify (§2.E).
3. **The mechanism that transmits voice must be one that cannot express
   content.** Not "one that we instruct not to express content" —
   `rationale.md` is explicit that on a small model examples beat rules, so any
   design whose safety rests on an instruction is betting against its own stated
   priors. A closed vocabulary of enums and numbers cannot express a clinical
   claim the way a paragraph can. That is a structural guarantee, not a
   behavioural one, and it is the only kind worth having here.

There is a well-developed field that has already established the empirical
premise: authorship attribution works on **function words and sentence-length
distributions**, not on content words, precisely because those features carry
authorial identity while being independent of topic (Mosteller & Wallace on the
Federalist papers; Burrows's Delta, which fingerprints an author from the
frequencies of the most frequent — overwhelmingly function — words). If voice
lives in the function-word and sentence-shape distribution, then a profile made
only of those features is both sufficient for voice and structurally incapable
of carrying a diagnosis. That is the whole design in one sentence.

---

## 2. Option survey

Assessed against: **V** does it transmit voice; **I** does it risk transmitting
inference; **B** does it fit a ~4K instruction budget alongside instructions and
source (current system prompt is ~1,700–2,000 tokens of instructions + ~180 of
schema restatement and glossary, so roughly 2,000–2,800 tokens of headroom
before `docs/skill-porting.md`'s "small models drift past 4–5K" line); **S** does
it work with schema-constrained decoding; **L** can it run locally on a MacBook.

### A. Raw few-shot excerpts of past notes (output only)

- **V: high.** The strongest possible voice signal per token — it is her actual
  prose.
- **I: maximal.** The unconditioned-sample problem in its pure form. Also carries
  a length prior into every section. `rationale.md` ranks few-shot pairs as the
  single highest-impact element of the instructions, so this is the highest-
  leverage way to teach exactly the wrong thing.
- **B:** 150–400 tokens per note; 3 notes ≈ 1,000 tokens. Affordable but not
  cheap.
- **S:** fine — the existing instruction files show examples as JSON objects
  precisely so the examples reinforce the grammar rather than compete with it.
  Raw excerpts would need the same treatment.
- **L:** trivial.
- **Also:** it is the only option that puts real patient text in the context
  window every time she drafts. That drags in the head-truncation failure
  (§3-E of the preflight: truncation drops the *system prompt*, keeping the
  patient material and losing the anti-fabrication rules), a redaction
  requirement on every prompt-logging path, and a cross-patient exposure that
  has no clinical justification.
- **Verdict: reject.** This is the naive implementation the brief names.

### B. A natural-language style profile written by the model

One offline pass: feed her notes to the local model, ask for a prose
description of her register.

- **V: moderate.** Prose descriptions are readable and the model can express
  things the extractor cannot ("she tends to open with the concrete detail and
  build outward").
- **I: high, and insidiously so.** The output is unconstrained free text derived
  from clinical material. Nothing prevents it from writing "she frames symptom
  change in terms of the therapeutic alliance" or "she typically links sleep
  disturbance to work stress" — statements that are simultaneously true about
  her style and *content priors that bias every future draft*. It also cannot be
  audited by code: you cannot write a test that a paragraph contains no clinical
  reasoning.
- **B:** ~150–250 tokens. Cheap.
- **S:** fine (it is prompt text).
- **L:** yes, but it requires putting her notes through a 16K context, which
  reintroduces the whole patient-text-in-a-prompt problem for the derivation
  step, plus the #15502 repetition-loop risk on a free-text field.
- **Verdict: reject as the mechanism, though it is what "derive a style profile"
  most obviously means.** This is the first place I differ from the
  owner-answers sketch: a *derived description* is much safer than an excerpt,
  but "described in prose by a model" is the weakest possible version of it. The
  same goal is reachable with code, and code is auditable.

### C. Extracted quantitative style descriptors — **recommended core**

Deterministic measurement over her notes producing a fixed-slot document:
person, subject noun, mean/p90 sentence length, connective inventory,
semicolon/contraction/fragment habits, attribution rate, hedge rate, register
term preferences, and a frequency-filtered list of habitual short phrases.

- **V: moderate — and this is the open question (§7.1).** Stylometry says these
  features *identify* an author. It does not follow that a 12B model can be
  *steered* by a description of them. Measure it before believing it.
- **I: low by construction.** Enums and numbers cannot state a clinical
  conclusion. The one free-text slot (habitual phrases) is the only risk surface
  and it gets four independent filters plus her review (§3.3, §4).
- **B: ~200–250 tokens.** Comfortably inside the budget with room for a
  4,000-token pasted skill.
- **S:** fine.
- **L:** yes — it is string processing, no model, no embeddings, no Python. Runs
  in milliseconds inside the existing Fastify process.
- **Verdict: adopt**, with the intensive/extensive rule and safe-direction
  clamping (§0, §3.2).

### D. Section-scoped raw excerpts, Subjective and Objective only

The owner-answers sketch's item 3: use raw excerpts before there is a corpus of
real pairs, but only from sections "where inference is structurally
impossible".

**I think this is wrong, and it is the one part of the sketch I would drop
outright.**

- Inference is *not* structurally impossible in Subjective. Deciding that a
  client's forty minutes of talk reduces to "reports improved sleep and reduced
  intrusive thoughts" is a clinical selection judgment, and the attribution
  frame ("Patient reports") is an epistemic claim about who said what. An
  excerpt demonstrates both, unconditioned.
- The length prior survives section scoping intact. A three-sentence Subjective
  with no visible source teaches "produce three sentences of Subjective," which
  is the fabrication incentive `rationale.md` warns about, just relocated.
- A partial note is a malformed instance under a schema that requires all keys.
  Showing the model an example object containing only `Subjective` and
  `Objective`, when the grammar will force it to emit four keys, is a direct
  contradiction between the demonstration and the constraint. `decisions.md`
  row 64 records the analogous mistake being avoided (an example still asserting
  the removed fallback sentence would have taught the opposite of the schema).
- It still puts real patient text in the context window, so it pays the entire
  privacy, logging and truncation cost — for a fraction of the payoff.
- And it is dominated: **golden pairs (§2.G) give strictly more voice with a
  visible input and no patient text**, for ten minutes of her time. There is no
  regime in which section-scoped excerpts are the right answer.

- **Verdict: reject.** Replace the sketch's item 3 with §2.G.

### E. Paired (source → note) examples accumulated from her real use

The sketch's item 2, and right in spirit.

- **V: high.** Her voice on her own material, with the mapping visible.
- **I: high *unless filtered* — this is the correction.** The published note is
  the draft *plus her edits*, and her edits add the conclusions she wanted. A
  pair whose note contains a formulation absent from the source teaches "given
  this evidence, produce that formulation," which is inference training with the
  evidentiary bar visibly set too low. The pair is safe only if the note is
  **entailed** by the source.
- Practical filter (cheap, no model): a pair qualifies only if every
  content-bearing token in the note appears in the source under lemmatisation
  and a small synonym map, with zero hits on the clinical lexicon that are not
  in the source. Entailment-style faithfulness metrics for summarisation (FactCC,
  QAGS, SummaC) do this properly with an NLI model; we do not have one locally
  and do not need one — a token-coverage filter is conservative in the right
  direction (it rejects some safe pairs, admits few unsafe ones).
- **B:** 300–600 tokens per pair; two pairs is the practical ceiling on top of
  the instructions' own examples.
- **S / L:** fine.
- **Verdict: adopt as Tier 2, filtered**, and note that the filter will reject
  most pairs — which is the correct outcome, not a bug. See §2.H for the
  higher-yield use of the same data.

### F. Retrieval of the most similar past note at draft time

- **V: high** for the specific session type.
- **I: the worst of any option here.** Retrieval selects the past note whose
  *content* most resembles today's session — that is what similarity means.
  Its conclusions are therefore maximally plausible for today's material, which
  is precisely the condition under which a model will copy one. It is a machine
  for generating conclusions that fit and are not supported.
- Also: it puts patient A's note into patient B's prompt. That is a
  cross-patient exposure inside a tool whose premise is confidentiality, and it
  cannot be justified by a wording benefit.
- **B:** 200–400 tokens per retrieved note, on every draft.
- **S:** fine. **L:** needs an embedding model (`nomic-embed-text` or similar,
  ~275MB) — a second model to pull in M7's setup script and a second runtime to
  bundle in M8, for the least safe option in the survey.
- **Verdict: reject.** Worth naming a narrower variant so it is not
  rediscovered: *within-patient* retrieval, for terminology continuity ("she
  calls it the wind-down routine, not sleep hygiene"). That has a real use and
  much less contamination risk, but it is still an unconditioned sample and the
  register-term slot in §2.C captures most of the benefit. Defer.

### G. Golden pairs — fabricated inputs, notes written by her — **recommended, Tier 0**

Hand her the two fabricated dictations already in the instruction files (John
Smith's sleep/CBT session, Maria Ruiz's bereavement session) plus their intake
counterparts, and ask her to write the four notes she would write. Paste the
result into `note_formats.instructions` in place of the generic examples.

- **V: highest of any option.** Actual prose by her, in her register.
- **I: lowest of any option that uses examples.** The input is visible, the
  mapping is real, and the epistemic restraint is *hers* — she writes the
  Assessment she would actually write from that dictation, which is by
  definition the behaviour question 7 asks for. If she writes a conclusion, it
  is one she is willing to have the model draw from that evidence, which makes
  it a specification rather than a leak.
- **Privacy: zero patient material**, because the patients are John Smith and
  Maria Ruiz. Unlike every other option, the artefact could in principle be
  committed — though it should not be, because her voice is her personal data
  and the repo is public; it lives in her local DB like any other format
  instruction.
- **B:** replaces existing examples rather than adding to them. Net token cost
  ≈ 0.
- **S / L:** identical to what ships today.
- **Cost:** ten minutes of her time, once per format, and a willingness to ask.
- **Verdict: adopt, and do it first.** It is the highest-value, lowest-risk,
  lowest-effort item in this entire document, and it needs no code at all —
  M6's Instructions panel already accepts it.

### H. Edit-delta learning — voice from her rewrites — **recommended, Tier 2**

Rather than learning from her notes, learn from the *difference* between the
draft and the note she published. Classify each hunk:

| Hunk type | What it means | Use |
| --- | --- | --- |
| **Rewrite** (content-word set preserved, wording changed) | Pure voice signal — she said the same thing in her words | Feed the *published* side into the style corpus, weighted heavily |
| **Addition** (new content words, not in source) | She supplied a conclusion or detail from memory | **Never** learn from it; count it (it is a completeness signal, not a voice one) |
| **Deletion** (content removed) | The model over-wrote; she cut it | Mine into a per-user extension of the banned-phrase list |

This is the cleanest available separation of voice from content, because the
separation is made by construction rather than by judgment: a rewrite that
preserves the content-word set cannot be teaching content. It also converts the
most dangerous data (her clinical additions) into a *safety* asset rather than a
liability, and the deletion list is a genuine anti-fabrication mechanism —
"she deletes 'mood congruent with affect' every time" becomes a per-user entry
alongside the built-in banned list, which `rationale.md` ranks as the second
most impactful element of the instructions.

- **V: high** and improves over time. **I: near zero** for the rewrite channel.
- **B:** feeds the §2.C profile; adds no prompt tokens beyond the deletion list
  (~30 tokens for 5 phrases). **S / L:** fine.
- **Requires:** keeping the original draft. See §3.9.
- **Verdict: adopt as Tier 2.** This is the second place I differ from the
  owner-answers sketch, which proposes accumulating pairs but not diffing them.

### I. Two-pass restyle with a mechanical content check — **escape hatch**

Pass 1 drafts with today's prompt and no style block. Pass 2 receives pass 1's
JSON and the style block, with one instruction: reword, change nothing else.
Then compare: the content-word multiset of pass 2 must be a subset of pass 1's
plus an allowlist (connectives, attribution verbs, approved register terms). Any
new content word aborts the restyle and the pass-1 note is kept.

- **V: potentially high** — a rewrite task is easier for a small model than a
  simultaneous extract-and-style task.
- **I: verifiable, which nothing else here is.** This is the only option where
  faithfulness is *checked* rather than instructed. Residual risk is deletion
  and softening (pass 2 dropping a hedge or a safety statement), which the same
  comparison detects in the other direction.
- **B:** two prompts, each smaller than the single combined one.
- **S:** fine — pass 2 uses the same sections schema, so the grammar is reused.
  Note the caveat from Tam et al., *Let Me Speak Freely?* (EMNLP 2024 Industry):
  format restriction measurably degrades reasoning-flavoured generation, and
  pass 2 is the pass where constrained decoding hurts least (it is copying, not
  reasoning). That argues mildly in this option's favour.
- **L:** yes, but **it doubles latency** — on a 12B on a MacBook that is roughly
  30–80s per note instead of 15–40s, and she writes six to eight notes in one
  end-of-day sitting (owner answer 2). That is the reason it is the escape hatch
  and not the recommendation.
- **Verdict: hold in reserve.** Build it if §5's measurement shows the
  single-pass profile raises fabrication. The content-word tracer it needs is
  the same code as the `novel_content_word_rate` metric in §5, so building the
  metric first buys most of the escape hatch for free.

### J. Local fine-tuning / LoRA — out of scope

Briefly, because it should be dismissed on the record rather than ignored:

1. **It is the most inference-teaching option available.** Supervised
   fine-tuning on output-only notes directly optimises the weights to produce
   her conclusions — it is option A with gradient descent behind it. The safe
   target would be preference tuning on her rewrites (option H's signal), which
   is a research project, not a packet.
2. **No local training stack.** It needs MLX-LM or PEFT — a Python toolchain,
   hours of compute on her laptop, and a rebuild every time the profile should
   change. `docs/agents/M8-installer.md` promises a double-clickable install
   with no Homebrew and no terminal; a trainer cannot live inside that.
3. **It is unreviewable and unswitchable.** A rendered style block can be read
   by her, edited, and turned off per format. A LoRA can be none of those, which
   removes the review step that §4 leans on for privacy and the off-switch that
   §5 leans on for measurement.
4. **It breaks the per-format story.** Adapters are per-model; instructions are
   per-format. She has two formats today and M6 lets her make more.

### Survey summary

| Option | Voice | Inference risk | Tokens | Schema-safe | Local | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| A. Raw past-note excerpts | High | **Maximal** | ~1,000 | Yes | Yes | Reject |
| B. LLM-written prose profile | Moderate | High, unauditable | ~200 | Yes | Yes* | Reject |
| C. Quantitative descriptors | Moderate (unproven) | **Low by construction** | ~230 | Yes | Yes | **Adopt — core** |
| D. Section-scoped excerpts | Moderate | High | ~500 | **No** (partial object) | Yes | Reject — see §2.D |
| E. Real pairs, entailment-filtered | High | Low if filtered, high if not | ~500/pair | Yes | Yes | Adopt — Tier 2 |
| F. Retrieval at draft time | High | **Worst** | ~300/draft | Yes | Needs embeddings | Reject |
| G. Golden pairs authored by her | **Highest** | **Lowest** | ~0 net | Yes | Yes | **Adopt — Tier 0** |
| H. Edit-delta rewrites | High, improving | Near zero | ~30 | Yes | Yes | **Adopt — Tier 2** |
| I. Two-pass restyle | High | **Verifiable** | 2 calls | Yes | 2× latency | Escape hatch |
| J. LoRA / fine-tuning | High | Maximal | n/a | n/a | No | Out of scope |

\* B is "local" only in the sense that the model runs locally; the derivation
step still requires her notes to enter a context window, which is the property
the recommended design eliminates.

---

## 3. The design

### 3.1 Shape

```
Tier 0  Golden pairs            she writes 2 notes from our fabricated dictations
        (no code)               → note_formats.instructions, replacing the generic examples

Tier 1  Style profile           deterministic measurement over her notes
        (this section)          → style_profiles row → ~230-token "## How she writes" block

Tier 2  Edit-delta refinement   rewrites feed Tier 1's corpus; deletions extend the
        (after M4 ships)        banned-phrase list; entailed pairs may become examples

Hatch   Two-pass restyle        only if §5 shows Tier 1 raises fabrication
```

Tiers are independent. Tier 0 needs no code and should be done this week. Tier 1
is the buildable packet. Tier 2 needs the draft-retention change in §3.9 and
should land with M4, not before.

### 3.2 What gets extracted — the profile document

`shared/src/style-profile.ts`, zod, versioned. Every field is an enum, a number,
or a string drawn from a filtered closed set. **There is no free-text field.**

```jsonc
{
  "version": 1,
  "derived_at": "2026-08-22T18:04:11.000Z",
  "corpus": {
    "notes": 41, "patients": 12,
    "hand_edited": 41,            // notes whose published text differs from the draft
    "machine_verbatim": 0,        // published unchanged — excluded, see §6.5
    "oldest": "2025-11-02", "newest": "2026-08-19"
  },

  // Derived from ALL her notes across every format: these habits are hers, not
  // the format's, and splitting them per format only thins the corpus.
  "global": {
    "person": "third",                          // third | first_plural
    "subject_word": "client",                   // client | patient | they | name | none
    "mean_sentence_words": 12.4,                // INTENSIVE
    "p90_sentence_words": 21,                   // INTENSIVE
    "fragments": "occasional",                  // never | occasional | frequent
    "semicolons": "never",
    "contractions": "never",
    "connectives": ["though", "but"],           // top 3, function words only
    "attribution": "usually",                   // CLAMPED ↑ : always | usually
    "hedging": "preserves_and_marks",           // CLAMPED ↑ : preserves | preserves_and_marks
    "register_terms": [
      { "prefers": "session",              "over": "appointment" },
      { "prefers": "between-session work", "over": "homework" }
    ]
  },

  // Per section of THIS format. Inference-bearing sections carry no phrase list
  // and no opening habits — only the global slots apply to them.
  "sections": {
    "Subjective": {
      "inference_bearing": false,
      "opens_with": ["reports", "described"],
      "phrases": ["some improvement in", "raised again this week"]
    },
    "Objective":  { "inference_bearing": false, "opens_with": ["presented", "appeared"], "phrases": [] },
    "Assessment": { "inference_bearing": true },
    "Plan":       { "inference_bearing": false, "opens_with": ["continue", "agreed"], "phrases": ["agreed to continue"] }
  },

  // Habitual deletions → per-user banned phrases (Tier 2; empty until M4 data exists)
  "never_writes": [],

  // Measured, deliberately NOT applied. Rendered in the review UI, never in the prompt.
  "excluded": [
    { "slot": "sentences_per_section", "measured": "2.3", "reason": "extensive_feature" },
    { "slot": "global.attribution",    "measured": "sometimes", "applied": "usually", "reason": "clamped_up" },
    { "slot": "Assessment.phrases",    "measured": 4, "reason": "inference_bearing_section" },
    { "slot": "global.subject_word",   "measured": "client", "reason": "contradicts_format_instructions" }
  ]
}
```

The `excluded` array is not decoration. It is how the review screen stays
honest with her ("your notes say X; we are not telling the model X, here is
why") and how a future agent discovers that an omission was a decision rather
than an oversight.

**Slots deliberately absent, and why:**

| Rejected slot | Why |
| --- | --- |
| `sentences_per_section`, `words_per_section`, "her Assessments run 2–3 sentences" | Extensive. A section-length target is a content quota; `rationale.md` makes this argument about word counts verbatim. |
| Any Assessment/Formulation opening or stock phrase | Handing the model "Continued progress toward…" gives it a sentence frame it can complete from nothing. This is the single most dangerous possible slot in the design. |
| `hedging: "rarely"` | De-hedging is a faithfulness failure ("might be anxiety-driven" → "is anxiety-driven" is explicitly forbidden by both instruction files). The enum has no low value, so the profile physically cannot ask for it. |
| `attribution: "sometimes"/"rarely"` | Dropping "Client reports" turns a report into an assertion. Same reasoning; clamped to a floor. |
| Topic/content tendencies of any kind | Content priors, not voice. |
| Verbatim sentences from her notes | §4. |
| Paragraph/free-text summary of her style | §2.B. |

### 3.3 How it is extracted

New directory `server/src/style/`. **No model call anywhere in this path.**

| File | Responsibility |
| --- | --- |
| `corpus.ts` | Gather source notes: published `notes` for the format via `textToSections`, plus (at onboarding) uploaded example text held in memory only. Excludes notes whose published text equals the machine draft (§6.5). |
| `measure.ts` | Deterministic sentence splitting + tokenising; all `global` and `opens_with` slots. Pure functions, table-tested against fabricated notes. |
| `phrases.ts` | N-gram habit mining with the filters below. |
| `lexicon.ts` | Clinical-term blocklist: diagnoses, medication stems, risk vocabulary, MSE vocabulary. Seeded from the banned lists already written into `docs/note-instructions/*.md`, extended. Shared with the eval's `novel_clinical_term_rate`. |
| `inference.ts` | Marks a section inference-bearing. |
| `clamp.ts` | Applies the intensive/extensive rule and the one-directional clamps; writes `excluded[]`. |
| `conflicts.ts` | Suppresses slots that contradict the format's own instructions (§3.6). |
| `leak.ts` | `assertNoSourceLeak(profile, corpus)` — throws before persist. |
| `render.ts` | Profile → the `## How she writes` prompt block. Snapshot-tested. |
| `derive.ts` | Orchestrates the above; returns a `proposed` profile. |

**Phrase mining, concretely.** N-grams n ∈ [2,6], lowercased, counted once per
note. A candidate survives only if **all** hold:

1. appears in **≥ 3 distinct notes** and **≥ 2 distinct patients**;
2. contains no token in `lexicon.ts`;
3. contains no digit, number word, month, weekday, or mid-sentence capitalised
   token;
4. contains no token in the name gazetteer built from `patients.name` and
   `patients.identifier`;
5. is not a superstring of a kept n-gram with the same document frequency
   (keeps "some improvement in", drops "some improvement");
6. contains at least one function word (a bare content-word bigram like
   "sleep hygiene" is a topic, not a habit — it belongs in `register_terms`
   only if it is a *substitution* pair, i.e. she uses one term where the corpus
   also attests the alternative).

Cap at 8 phrases per format, ranked by (patient count, note count, length).

**Rule 1 is the load-bearing privacy argument** and deserves stating plainly: a
phrase that recurs across three notes and two patients is, by construction, not
a fact about any one patient. This is what makes phrase mining admissible at all.

**Inference-bearing classification** (`inference.ts`), because M6 lets her
invent section names we have never seen:

```
inference_bearing(section) =
     name matches /assessment|formulation|impression|conclusion|interpretation|analysis/i
  OR epistemic_marker_density(section bodies) >= 0.15 markers per sentence
```

where markers are `consistent with, suggests, suggestive of, indicative of,
likely, appears to be, secondary to, in the context of, responding to, progress
toward, points to, consistent picture`. Default on tie is **inference-bearing**
(deny). The measured density is itself worth surfacing: if her *Subjective*
sections score above threshold, that is a fact about her writing the design
needs to know, and the review screen should say so.

**Thresholds.** `notes ≥ 3` for global slots; `notes ≥ 8 and patients ≥ 3` for
`opens_with` and `phrases`. Below the lower bound, no profile is proposed at
all. These numbers are guesses; §7.4 gives the experiment that sets them.

### 3.4 When it runs

- **At M6 onboarding**, if she chooses "example notes". Those uploads *are* her
  past notes; extraction runs in the same request, in memory, and the uploaded
  text is never written to disk (§4).
- **On demand**, from a "Rebuild from my notes" button in Settings.
- **Automatically**, when `published notes since last derivation ≥ 10`. The
  result lands as `status: 'proposed'`, never applied silently.
- **Re-derivation rule:** numeric and enum slot changes on an already-approved
  profile auto-apply (the corpus grew, the mean moved from 12.4 to 12.9). A
  **new phrase or a new `never_writes` entry always requires approval.** That
  keeps the only free-text channel behind a human every single time.

### 3.5 Where it is stored

`server/migrations/002_style_profiles.sql`:

```sql
CREATE TABLE style_profiles (
  format_id         TEXT PRIMARY KEY REFERENCES note_formats (id) ON DELETE CASCADE,
  profile           TEXT NOT NULL,              -- JSON, shared/src/style-profile.ts
  status            TEXT NOT NULL CHECK (status IN ('proposed', 'approved', 'off')),
  source_count      INTEGER NOT NULL,
  source_high_water TEXT,                       -- newest note id folded in
  approved_at       TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  CHECK ((status = 'approved') = (approved_at IS NOT NULL))
) STRICT;
```

One row per format, cascading with it, mirroring the `notes` status/timestamp
CHECK convention from `001_init.sql`. Lives in the same
`~/Library/Application Support/Apunta/` database as everything else: no new
file, no new location, no new backup surface, covered by the same disk
encryption story and the same M7 export.

Global kill switch: `settings` key `style_profile_enabled` (boolean, default
`true`), per `decisions.md` row 37 — open key map, no migration needed. The eval
harness and the A/B in §5 flip this.

API (`server/src/routes/style.ts`):

```
GET    /api/formats/:id/style           → { profile, status, rendered }   ("rendered" = the literal prompt text)
POST   /api/formats/:id/style/rebuild   → re-derive from current notes, status 'proposed'
PATCH  /api/formats/:id/style           → { status: 'approved'|'off', drop_phrases?: string[] }
DELETE /api/formats/:id/style           → forget entirely
```

`PATCH` is how she approves, and how she deletes an individual phrase she
dislikes — the only editing operation offered, because every other slot is
measured and hand-editing a measurement is meaningless.

### 3.6 How it enters the prompt

`server/src/ai/types.ts`: `GenerateNoteRequest` and `RefineNoteRequest` gain
`styleProfile?: StyleProfile`. The route in `server/src/routes/notes.ts`
populates it **only** when `status === 'approved'` **and**
`settings.style_profile_enabled !== false`.

`server/src/ai/prompts.ts`, `buildGeneratePrompt`:

```ts
const system = [
  instructions.trimEnd(),                    // 1. faithfulness rule OPENS here (unchanged)
  '',
  outputFormatBlock(request.sections),       // 2. schema restatement (unchanged)
  '',
  styleBlock(request.styleProfile),          // 3. NEW — '' when absent
  '',
  sourceGlossary(request),                   // 4. unchanged
  '',
  FAITHFULNESS_CLOSE,                        // 5. NEW — the closing restatement
].join('\n');
```

**Placement rationale.** `rationale.md` establishes that small models attend
most reliably to the opening and closing of an instruction block, which is why
the faithfulness rule occupies both in the instruction files. Today
`prompts.ts` appends three blocks *after* those instructions, so the authored
closing check ("find the words in the dictation that each sentence came from")
is no longer the closing anything. The style block must not make that worse, so
it goes in the **middle** — the lowest-attention position, which is the correct
one for a subordinate rule — and position 5 restores a faithfulness statement to
the true end of the system prompt.

`FAITHFULNESS_CLOSE`, ~55 tokens, satisfying `decisions.md` row 44 ("always
followed by a restatement of the faithfulness rule"):

```
Everything in "How she writes" is about wording. It never licenses a sentence
the source does not support, and it never fills a section that has no material.
Before you finish: for each sentence you wrote, find the words in the source it
came from. If you cannot, delete it.
```

**The rendered block** (fabricated illustration; ~230 tokens):

```
## How she writes

Wording habits measured from notes she has already written. They tell you how to
word the material the source gives you; they never tell you what to say. Where
they conflict with the style guidance above, follow these — they are measured
from her own notes. Where they touch what may be said at all, the rules above win
without exception. If a habit below cannot be honoured with the material you
have, drop the habit; never add material to satisfy it.

- She writes in the third person and calls the person "the client", not "the patient".
- Her sentences are short: about 12 words on average, and rarely over 21.
- She writes plainly: no semicolons, no contractions, occasional short fragments.
- She keeps the reporting frame — "Client reports", "Client described" — rather
  than stating what the client said as fact.
- She writes "session" (not "appointment") and "between-session work" (not "homework").
- Her Subjective sentences often open with a reporting verb; her Plan sentences
  often open with "Continue" or "Agreed".
- Turns of phrase she uses habitually, where the source supports them: "some
  improvement in", "raised again this week", "agreed to continue".
- These habits change wording only. They add nothing to the Assessment, which
  follows the rules above unchanged.
```

Notes on the wording, each deliberate:

- *"where the source supports them"* on the phrase list — the phrases are
  conditional, never targets.
- *no counts of sentences per section anywhere* — the intensive/extensive rule,
  rendered.
- *the last bullet* instantiates the inference-bearing exclusion in a way the
  model can act on, without making Assessment sound special enough to invite
  compensatory effort.
- *the conflict clause is two-part on purpose.* A blanket "the rules above win"
  would kill the most visible voice feature, because the built-in instructions
  say `referring to "Patient"` and her notes may say "client". Style loses to
  faithfulness; style does not lose to the generic default style section.

**Contradiction suppression** (`conflicts.ts`) — because contradictory
instructions degrade small models, we prefer removing a conflict to arbitrating
it in prose:

- For the **built-in** instruction text (a known string, already snapshot-tested
  against `docs/note-instructions/*.md`), when the profile supplies
  `subject_word`, `prompts.ts` rewrites that one line of the built-in style
  section instead of emitting both. Nothing else is rewritten.
- For **user-authored** instructions (a pasted skill), we do not touch her
  words: if a directive on the same slot is detected, the profile slot is
  suppressed and recorded in `excluded[]` with
  `reason: "contradicts_format_instructions"`, and the review screen asks her
  which is right.

**Graceful degradation order.** The pre-send budget check already refuses
over-long prompts (`approximateTokens` vs `num_ctx * 0.75`, preflight §3-E).
Before it refuses, it degrades, in this order:

1. drop `phrases` and `opens_with`;
2. drop the whole style block;
3. only then raise `transcript_too_long`.

The faithfulness rules are never in the degradation path. This also disposes of
a subtlety worth recording: Ollama truncates from the **head**, so if truncation
ever happened, the block that dies first is the *opening faithfulness rule*, not
the style block sitting below it. The answer is not to reorder the prompt — it
is never to send a prompt that can truncate. The `prompt_eval_count` tripwire
stays mandatory, and the Settings screen warns when her pasted instructions plus
the profile leave under 20% headroom.

### 3.7 Interaction with the existing faithfulness machinery

| Existing element | Interaction |
| --- | --- |
| Opening "rule that matters most" | Untouched; still the first thing in the system prompt. |
| Named banned-phrase list | Untouched, and **extended** by `never_writes` in Tier 2 — the style mechanism becomes an anti-fabrication contributor. |
| Empty-section protocol (`""`) | At risk: a style block implies "notes look like this", which is pressure to fill. The block says "never fills a section that has no material" and §5 measures blank preservation as a gating metric. |
| `[unclear in dictation]` marker | At risk of being smoothed away by a "write plainly" habit. Measured (§5). |
| "Match the density of the dictation" | The intensive/extensive rule exists to keep the profile from contradicting this line. |
| Closing check | Restored to the true end of the system prompt (§3.6 item 5). |
| `refineNote` | Same block, same close. She will say "make this sound more like me" and the profile is the answer. |
| `detectFormat` | Unchanged. That prompt deliberately says it does not read clinical content; extraction is code, so there is no conflict. |
| `findDegeneration` (`server/src/ai/degenerate.ts`) | Reused as a failure-mode detector — a stock-phrase list is a plausible repetition attractor under grammar-constrained free text (#15502). |

### 3.8 Cold start

Three cases, all silent about anything they cannot support:

1. **Onboarded with example notes** (M6 `kind: 'examples'`). A profile is
   proposed immediately from those files, and the preview step gains a second
   card: "We also noticed how you write. Review it?" Best case; note that 2–3
   uploaded files will clear the global threshold but not the phrase threshold,
   so the first profile is enums only.
2. **Onboarded with a template or by describing sections.** **No profile at
   all.** The prompt is byte-identical to what ships today. Settings shows
   "Apunta will learn your wording as you write — nothing is on yet", with the
   count remaining. No placeholder, no guess, no partial block.
3. **3–7 notes.** Global slots only: person, subject word, sentence length,
   fragments, semicolons, contractions. These are stable at small N (they are
   rate statistics over hundreds of sentences, not over notes). No phrases, no
   openings.

In all three, **Tier 0 is what actually solves cold start.** The golden pairs
are available from day one, need no corpus, and carry more voice than a
three-note profile ever will. The onboarding flow should ask for them: after
the format preview, one optional screen — "Here is a made-up session. Write the
note you would write." — pre-filled with the fabricated John Smith dictation and
skippable.

### 3.9 What else must change

- **`notes` must retain the machine draft.** Tier 2 (edit-delta learning), the
  autophagy guard (§6.5), the "is the profile helping?" outcome metric (§5.6),
  and the entailment filter for pairs all need the pre-edit draft, and today
  `notes.content` is edited in place, destroying it. Add in the same migration:

  ```sql
  ALTER TABLE notes ADD COLUMN draft_content TEXT;  -- the model's original output, never edited
  ```

  Set once at generation, never updated. Cost: one extra copy of each note's
  text in a database that already holds the note — acceptable, and worth naming
  in the privacy review (§4) because it is more clinical text at rest, on the
  machine that already holds the only unbacked copy of the record
  (`decisions.md` row 62).
- **`e2e/fixtures/eval/rubric.md` S4 and H1** are already known-wrong for the
  empty-section decision (`decisions.md` row 65) and are M7's to fix. The style
  work adds more (§5.2); fix them together rather than twice.
- **`docs/skill-porting.md`** gains a paragraph: the flattening recipe's step 6
  ("add 1–2 few-shot pairs") should say *fabricated patients, and prefer pairs
  she wrote herself* — Tier 0 is exactly step 6 done properly.
- **`docs/decisions.md`** gains rows for: no model call in the derivation path;
  intensive-only features; one-directional clamping; the phrase frequency
  threshold as the privacy argument; and the reversal of the owner-answers
  sketch's item 3.

---

## 4. Privacy

`CLAUDE.md` hard rule 2 forbids real patient text in fixtures, tests and
commits; hard rule 1 forbids it leaving the machine at all. Her past notes are
real patient material, so the derivation path is the most sensitive code in the
project.

### 4.1 What the design removes

The owner-answers doc says "her past notes become prompt content at runtime".
**Under this design they do not.** They are read by a measuring function and
discarded. Consequences:

- No patient text in any context window, so no exposure through Ollama's
  request log, no head-truncation interaction, no `num_ctx` sizing question.
- No patient text in the drafting prompt, so the existing rule "any code path
  that logs a prompt must redact past notes" becomes vacuous for this feature
  (it still applies to the transcript, which is unchanged).
- Nothing to redact in an error report from the generation path, because the
  generation path never holds a past note.

The residual exposure is a few hundred bytes of derived JSON, plus the source
notes in the extractor's memory for the duration of one function call.

### 4.2 Where the profile lives

`~/Library/Application Support/Apunta/apunta.db`, table `style_profiles`
(`APUNTA_DATA_DIR` in tests, always a temp dir). Not a file on disk, not a
dotfile, not in the repo, not in `node_modules`, not in a cache directory.

It is included in M7's `GET /api/export` `data.json` dump — it is hers, it is
annoying to lose, and the export is a local backup of a local database. It is
**not** included in the markdown note tree, which is the part of the export
someone might mail to themselves.

### 4.3 Yes, a naive profile would carry patient content

This must be said plainly because the failure is not obvious. A style extractor
that samples "characteristic sentences" will lift
`"Client reports the anniversary of her mother's death on Tuesday was hard."`
— a sentence that is 100% style signal and 100% protected health information.
An n-gram miner with no filters will surface `"maria's mother's death"` if she
wrote about one patient often enough. A model asked to "describe her style"
will happily write "she often frames grief work around anniversary reactions",
which is a diagnosis-adjacent content prior about an identifiable caseload.

Five defences, in order of how much they carry:

1. **Closed vocabulary.** Every slot except `phrases`, `opens_with`,
   `register_terms` and `never_writes` is an enum or a number. Enums cannot
   carry content. This eliminates the majority of the surface by construction.
2. **The frequency threshold.** A phrase must appear in ≥ 3 notes across ≥ 2
   patients. A fact about one patient cannot satisfy that. This is the single
   strongest argument, and it is why the threshold is a privacy control, not a
   quality knob — it may be raised, never lowered.
3. **Token filters.** No digits, number words, months, weekdays; no
   mid-sentence capitals; no token in the patient-name gazetteer built from
   `patients.name`/`patients.identifier`; no token in the clinical lexicon
   (diagnoses, medication stems, risk and MSE vocabulary). Max 6 tokens, so no
   candidate is ever a complete clinical statement.
4. **`assertNoSourceLeak(profile, corpus)`**, a runtime assertion that throws
   before persisting: no 5-gram of the *rendered* block may appear in any source
   note except inside an approved phrase, and every string in the rendered block
   must be either static template text or a filtered phrase. Unit-tested with
   fabricated corpora containing planted leaks (a name, a dose, a diagnosis, a
   whole sentence repeated across notes) — the test asserts the assertion
   *fires*, which is the test that actually matters.
5. **She reviews it.** The Settings card shows the **literal rendered prompt
   block** — the exact text the model will see, not a friendly paraphrase — with
   a delete button per phrase, and the `excluded[]` list underneath. Nothing is
   used until she approves. This is the only defence that catches a semantic
   leak the code cannot: a phrase that passes every filter and still means
   something about someone.

### 4.4 The uploaded-example path

M6's "example notes" upload is the one place raw past notes enter the server.
Rules:

- Extraction happens **in the same request, from the buffer**. The file is never
  written to disk. If a text extractor requires a path, use `fs.mkdtemp` and
  unlink in a `finally`, and say so in a comment.
- The extracted text is never persisted — not in `note_formats`, not in a
  `detections` table, not in a cache. Only `{name, sections}` and the derived
  profile survive the request.
- The multipart body is not logged, and neither is its size-and-filename
  metadata beyond what an error needs.

### 4.5 What must never be logged, in any mode

- Source note text, at any level, including `debug`. The extractor takes it as
  an argument and returns numbers; it must not log its input, and its error
  paths must carry `format_id` and slot names only.
- The rendered style block, and the assembled system prompt now that it contains
  her phrases. This extends the existing rule rather than replacing it.
- `JSON.stringify(profile)` in any error, thrown message, stack annotation, or
  SSE event. `LlmEvent`/`LlmStats` must not carry it. Errors say
  *"style profile rejected: leak check failed on slot `Subjective.phrases`"* —
  slot name, never value.
- Anything in the browser console. The review screen renders the block; the
  client never logs it, never puts it in a URL, never stores it in
  `localStorage`.
- Eval output. **The eval harness never reads the real profile by default**
  (§5.1); when the manual run does, note text and profile text are suppressed
  and only aggregates are printed.
- Crash/error toasts must not echo prompt content — already true, now
  load-bearing.

A cheap enforcement worth building: the existing ESLint privacy rules
(`decisions.md` row 19) gain a rule banning `console.*` and logger calls whose
argument expression is typed `StyleProfile`, and the leak assertion runs in
tests over the fabricated corpora on every CI run.

### 4.6 Deletion

"Forget my writing style" in Settings does `DELETE /api/formats/:id/style`.
Deleting a patient does not re-derive automatically (that would be a surprising
amount of work on a delete), so "Rebuild from my notes" exists and the review
card shows the corpus date range so she can see what it was built from. Deleting
a format cascades the profile away with it.

---

## 5. How we would know it worked

The eval corpus and rubric exist (`e2e/fixtures/eval/`, 10 fixtures, rubric with
AUTO / AUTO-FLAG / HUMAN tags). This extends them. All of it is M7 work and
should be built alongside deliverable 6 rather than after it.

### 5.1 The experimental design

Four arms, same fixtures, same model, same seed, temperature 0, only the style
block differing:

| Arm | Prompt | Purpose |
| --- | --- | --- |
| **A — off** | today's prompt + `FAITHFULNESS_CLOSE` | baseline |
| **B — on** | A + rendered profile from `style/b-house.json` | the design under test |
| **C — adversarial** | A + `style/c-unsafe.json` | **positive control** |
| **D — no guard** | B without the block's guard paragraph and `FAITHFULNESS_CLOSE` | does the guard earn its ~85 tokens |

Profiles are **fabricated fixtures committed to the repo**, in
`e2e/fixtures/eval/style/`:

- `a-none.json` — absent.
- `b-house.json` — a safe profile in the recommended shape, describing the
  prototype's house voice.
- `c-unsafe.json` — deliberately contains every slot §3.2 excludes:
  `sentences_per_section: 3`, an Assessment stock opening
  (`"Continued progress toward"`), `hedging: "rarely"`,
  `attribution: "sometimes"`, and a section-length target.

**Arm C is the most important arm and it is not obvious why.** A B-vs-A null
result is uninterpretable on its own: it means either "the profile is safe" or
"the harness cannot see fabrication". Arm C makes the difference observable. If
a deliberately unsafe profile does *not* raise the fabrication metrics, the
harness is not measuring the thing we care about and **no conclusion about B is
valid** — fix the harness before shipping anything. If arm C does raise them,
we have both a sensitivity floor and empirical validation of the
intensive/extensive and clamping rules, which are currently arguments rather
than findings.

**Baseline sequencing.** Land `FAITHFULNESS_CLOSE` (§3.6 item 5) *first*, as its
own change, and re-baseline. Otherwise arm A is not today's prompt and arm B
confounds two changes.

### 5.2 New rubric criteria (extending `rubric.md` §3 and §5)

| ID | Check | Type | Why it is new |
| --- | --- | --- | --- |
| **F6** | `unsupported_conclusion` — an epistemic marker (`consistent with, suggests, likely, secondary to, indicative of, responding to, progress toward, in the context of`) appears in a section the fixture marks `noConclusion` | AUTO | The rubric currently detects unsupported inference only through F5, which is HUMAN. This is the direct, automatic measurement of "the note said what she did not" and it is the **primary endpoint**. |
| **F7** | `novel_clinical_term_rate` — clinical-lexicon tokens in the note absent from the source, normalised per 100 words | AUTO | Catches invented diagnoses/meds/risk language that F1's per-fixture banned strings did not anticipate. |
| **F8** | `novel_content_word_rate` — all non-stopword lemmas in the note absent from the source | AUTO-FLAG | Blunt, trips on legitimate paraphrase, but its *delta between arms* is meaningful even when its absolute value is not. Same code as the two-pass escape hatch (§2.I). |
| **H4** | `blank_preserved` — sections the fixture marks as having no material are exactly `""` | AUTO | Replaces the broken H1/S4 (`decisions.md` row 65) and directly measures the shape-filling failure mode. |
| **H5** | `marker_preserved` — `[unclear in dictation]` survives on fixtures 05 and 10 | AUTO | A "write plainly" habit is a plausible way to smooth the marker away. |
| **V1** | `style_distance` — run `measure.ts` over the generated notes, compute normalised L1 across the profile's measurable slots against the target | AUTO | The only automatic evidence that voice transferred at all. Free: the extractor already exists. |
| **V2** | `phrase_adoption` and `unsupported_phrase` — approved phrases appearing at all; approved phrases appearing where the source contains none of their supporting content words | AUTO | High adoption is the goal; adoption without support is fabrication wearing her voice. |

`expectations.md` gains one key per fixture: `noConclusion: ["Assessment"]` —
sections where the clinician described but did not conclude. Several fixtures
already are this case in prose (01's Assessment, 06, 09's Formulation); the key
makes it machine-readable.

### 5.3 Unit of analysis, and how many runs

**The honest constraint first: at temperature 0 with a fixed seed the pipeline
is nearly deterministic, so extra runs buy almost nothing.** Statistical power
must come from more *fixtures*, not more runs.

- Keep **N = 3** — Metal kernels are not bitwise deterministic, so the three
  runs measure that residual nondeterminism, which is itself a reportable
  finding (`rubric.md` already says "at temperature 0 a wide spread is itself a
  finding"). If all three agree on every fixture in the first real run, drop to
  N = 1 for subsequent comparisons and spend the compute on fixtures.
- **Extend the corpus to 20 fixtures** for this question. The ten new ones,
  fabricated as always: 4 × "clinician described but drew no conclusion"
  (the exact shape the profile is most likely to break), 3 × "material that
  invites a habitual phrase without supporting it", 3 × long sources where an
  extensive style target would bite. Each with its `expectations.md` entry,
  per the corpus README's extension rules.
- **Score per section, not per fixture.** 20 fixtures × 4 sections × 3 runs =
  **240 observations per arm** instead of 20. F6, H4, H5, V2 are all naturally
  per-section. Per-fixture gating stays the headline for the report; per-section
  counts are the statistic.
- Paired analysis: same fixture, same run index, same seed, arms differing only
  in the block. McNemar on the discordant pairs for the binary gates.

**And then say plainly what this cannot do.** With a per-section
unsupported-conclusion baseline of, say, 2–3%, 240 observations cannot detect a
doubling. This eval can reliably detect (a) a *large* increase, (b) a new
*category* of failure, and (c) it can hand a human a short paired list to read.
It cannot certify a small increase as absent. So the decision rule must be a
**gate on categories and on any regression at all**, not a significance test —
and the positive control is what makes a null result mean something.

### 5.4 Cost and register measures, also per arm

- `prompt_eval_count` delta (the block's real token cost, measured not
  estimated), tokens/sec, wall-clock per note.
- `findDegeneration` trigger rate (repetition-loop interaction, §6.6).
- Expansion ratio: note content words ÷ source content words. A style profile
  that inflates this is filling shape.
- Existing rubric dimensions unchanged, so a regression in completeness, tone or
  structural validity is visible.

### 5.5 The human pass

Two separate sittings, deliberately not combined, because asking one person
"does this sound like you and is it faithful?" gets you the first answer with
the second one's label on it.

1. **Voice, blinded forced choice, with her.** 20 pairs (same fixture, arm A vs
   arm B), random order, no labels: "which sounds more like you?" Voice transfer
   is claimed at **≥ 14/20** (p < 0.06, one-sided binomial). ~30 minutes.
2. **Faithfulness, blinded, arm-label hidden, judged against the source only.**
   Sample per `rubric.md` §9 — the inference-baiting fixtures first. The
   reviewer is asked *"which sentences cannot be traced to the source?"* and is
   never asked which note is better. This ordering matters: fluent and assertive
   text is systematically rated as more accurate (the "style over substance"
   evaluation bias), and in clinical documentation specifically, automation bias
   means a confident-sounding note reduces the reader's own checking. A quality
   question contaminates a faithfulness answer.

### 5.6 The long-run in-product metric

Once M4 ships and `draft_content` exists, the best success measure is free and
real: **edit distance from draft to published note**, tracked over time.

- Voice working → *fewer* wording edits.
- Content edits (additions) should not fall; if they do, she is accepting more
  of what the model wrote, which is exactly what a fabrication uplift looks like
  from inside a therapist's workflow.
- So track the two separately, using the same hunk classifier as §2.H: rewrite
  distance should fall, addition count should not. **A profile that lowers both
  is the failure this whole document exists to prevent.**

### 5.7 Ship / don't ship

Ship only if **all four** hold:

1. **Positive control fires.** Arm C's per-section `unsupported_conclusion` rate
   exceeds arm A's by a clear, visible margin. If not, the harness is blind —
   stop, fix it, no conclusion about B is admissible.
2. **No faithfulness regression, anywhere.** Arm B ≤ arm A on F1 hits (zero new
   ones), F6, F7, H4, H5. Not "within noise" — zero new gating failures, and any
   single fixture that flips gets read by hand before it is averaged away.
3. **Voice actually transferred.** V1 `style_distance` for arm B ≤ 0.5 × arm A,
   and the blinded forced choice ≥ 14/20.
4. **Cost is acceptable.** Prompt growth ≤ 300 tokens, no measurable increase in
   `findDegeneration` triggers, no wall-clock regression beyond noise.

**Any faithfulness regression means don't ship**, even a small one, even if
voice transfer is excellent. The asymmetry is the project's existing position
and it should not be relitigated here: voice is a preference, fabrication is a
safety failure, and `rubric.md` already gates on it for the same reason. The
designed response to a regression is the two-pass escape hatch (§2.I), not a
softer threshold.

If arm D (no guard) matches arm B on faithfulness, delete the guard paragraph
and keep the tokens. If arm D is worse, the guard is earning its place and that
is worth a `decisions.md` row.

---

## 6. Failure modes, ranked

Ranked by expected harm × likelihood. Each has a detection method that someone
can actually run.

### 6.1 The style profile quietly raises fabrication and nobody notices, because the notes read better

**The one this document exists for.** The mechanism is not subtle once named: a
note in her register, with her sentence rhythm and her stock phrases, *reads as
hers*, and a reader checks a familiar-sounding document less carefully than an
unfamiliar one. She writes six to eight notes in an end-of-day batch, hours
after the sessions, with memory already decayed (owner answer 2) — the exact
conditions under which "that sounds like something I'd write" substitutes for
"I remember saying that". The literature is unambiguous in both halves: human
and model evaluators rate fluent, assertive text as more accurate independent of
its accuracy, and clinicians exhibit automation bias toward confident-sounding
generated documentation. Worse, this failure is *self-concealing*: the better
the voice transfer, the weaker the review, so the feature's success metric and
its failure mode are the same variable.

**Detection**

- The positive-controlled A/B (§5.1). Arm C exists specifically so a null result
  on arm B is interpretable.
- F6 `unsupported_conclusion` per section — automatic, direct, and the primary
  endpoint. This is the check the current rubric lacks entirely (F5 is HUMAN,
  4 points, sampled).
- The human faithfulness pass must be **blinded to arm and asked only about
  traceability**, never about quality (§5.5).
- Long-run: addition-edit count from §5.6. If her content edits fall after the
  profile is switched on, that is the signature, in production, with no eval
  required.
- Optional, and the strongest in-product mitigation if it is ever wanted: a
  **source-trace flag** in the editor. The `novel_content_word_rate` machinery
  already computes, per sentence, whether its content words appear in the
  source; sentences with none could carry the same distinct styling as
  `[unclear in dictation]` (`decisions.md` row 63). It puts the reader's
  attention exactly where the fluency is hiding something. Out of scope for this
  packet; worth naming so it is not reinvented.

### 6.2 Shape-filling — the profile implies a target and the model manufactures content to hit it

A profile saying "her Assessments run two to three sentences" is a quota. Faced
with a session where she drew no conclusion, the model has a shape to fill and
the vocabulary to fill it. This is the same failure `rationale.md` identifies for
word-count targets, arriving through a different door.

**Detection:** H4 blank-preservation rate; expansion ratio (§5.4); arm C, which
contains exactly this slot and should light up.
**Mitigation:** the intensive/extensive rule — the slot cannot exist.

### 6.3 De-hedging and de-attribution — her real voice is a faithfulness regression

If she writes "Sleep improved this week" where the draft writes "Client reports
sleep improved", transmitting that habit converts a report into an assertion.
If she hedges less than the model does, transmitting that resolves uncertainty
the source left open. Both are genuine voice and both are forbidden by the
instruction files.

**Detection:** rubric H2 (hedge co-occurrence), plus an attribution rate measure
per arm; arm C sets `hedging: "rarely"` and `attribution: "sometimes"` so the
harness can prove the clamps are load-bearing.
**Mitigation:** one-directional enums — the profile cannot express the unsafe
direction. **Open question for her:** she should be told that two of her habits
are measured and not applied, and why. She may disagree, and it is her practice
(§7.5).

### 6.4 Patient material leaks into the profile

Covered at length in §4.3. Highest-severity, but the lowest likelihood of the
top five given five independent defences.

**Detection:** `assertNoSourceLeak` at write time; the filter unit tests with
*planted* leaks (asserting the assertion fires); the corpus date range and phrase
list on the review card; a re-check on every rebuild, not only the first
derivation.

### 6.5 Autophagy — the profile learns the model's voice, not hers

If a profile is derived from notes that were themselves drafted by the model and
published with light editing, the loop closes: the model's register is measured,
described back to the model, and reinforced. Over a year her "voice profile"
converges on Gemma's house style and her actual voice is gone from the system —
the same recursive-collapse dynamic described for models trained on their own
output, arriving through prompts instead of weights. Nobody will notice, because
each individual step looks like the profile getting more accurate.

**Detection**

- `corpus.machine_verbatim` in the profile document: notes published with no
  edits at all. If that number is a large fraction of the corpus, the profile is
  measuring the model.
- Exclude those notes from the corpus entirely, and weight the rest by edit
  distance (§3.3, `corpus.ts`).
- Keep a **provenance anchor**: her *typed rough notes* (`transcripts` where
  `source = 'typed'`) are unambiguously hers and are never model output. Measure
  their style too and report the distance between the anchor and the profile.
  The anchor drifting away from the profile over successive rebuilds is the
  alarm, and it costs nothing — the same `measure.ts` runs on both.
- Show profile diffs at each rebuild ("mean sentence length 12.4 → 15.9"), so
  drift is visible rather than silent.

### 6.6 Phrase stuffing and the repetition-loop interaction

A stock-phrase list is a plausible attractor for the constrained-JSON repetition
loop (ollama#15502, open, matches our schema shape exactly — free-text string
fields under a grammar), and a milder version is simply overuse: the same three
phrases in every section of every note.

**Detection:** `findDegeneration` trigger rate per arm — already built, free;
V2 `phrase_adoption` (too high is as bad as too low) and `unsupported_phrase`.
**Mitigation:** cap at 8 phrases; the "where the source supports them" framing;
drop phrases first in the degradation order.

### 6.7 Prompt budget and truncation

The block adds ~230 tokens to a system prompt that is ~2,000 today and could be
~4,500 with a long pasted skill. Truncation drops the head — the faithfulness
rules — while keeping the patient material.

**Detection:** the mandatory `prompt_eval_count >= num_ctx - 16` tripwire
(preflight §3-E); the pre-send `approximateTokens` check.
**Mitigation:** the degradation order in §3.6, and a Settings warning when
instructions + profile leave under 20% headroom.

### 6.8 Cross-patient contamination through a phrase

A phrase that is really about one patient reaching another patient's note.

**Detection/mitigation:** the ≥ 2-patient threshold makes this structurally hard,
the name gazetteer and clinical lexicon catch the obvious cases, and her review
catches the rest. Note that option F (retrieval) would have made this severe
rather than marginal — one more reason it is rejected.

### 6.9 The profile is right about her past and wrong about her present

She may have changed how she writes, or the profile may be dominated by an old
format. Symptom: her editing goes *up* with the profile on.

**Detection:** §5.6's rewrite-distance metric, per format, before and after.
**Mitigation:** per-format off switch; "Rebuild from my notes"; corpus date
range shown on the card.

### 6.10 She approves a profile she has not really read

The review step carries a lot of weight in §4; a card she clicks past does not.

**Mitigation:** show the *literal* rendered block, not a paraphrase — it is
short, it is in plain English, and it is the actual text. Show `excluded[]`
underneath so the card demonstrably has content she has not seen elsewhere.
Do not pre-check anything. Do not auto-approve on a rebuild that adds a phrase.

---

## 7. Open questions, each with the experiment that settles it

### 7.1 Does a 12B model follow a descriptive style block at all? — **do this first**

The entire Tier 1 design rests on it and I have no evidence for it. Stylometry
says these features *identify* an author; nothing says a small model can be
*steered* by a description of them. `rationale.md`'s own position — examples move
a small model more than rules do — is a reason for pessimism, since a profile is
rules.

**Experiment (half a day, no code beyond a script):** hand-write two fabricated
profiles with clearly opposed values (short/"client"/no-semicolons versus
long/"patient"/subordinating). Run the 10 existing fixtures through each plus a
no-profile arm. Measure V1 `style_distance` and the crude directly-checkable
slots: does the subject noun actually change, does mean sentence length move.
**Go if** the subject noun flips in ≥ 80% of notes and mean sentence length
moves in the right direction with a clear separation between the two profiles.
**No-go** collapses this design to Tier 0 (golden pairs) plus, possibly, the
two-pass restyle — and that would be a good outcome to learn cheaply rather
than after building `server/src/style/`.

### 7.2 Do golden pairs make Tier 1 redundant?

Add arm E — golden pairs, no profile — to §5.1 once Tier 0 exists. If arm E
matches arm B on voice and beats it on faithfulness, the extraction pipeline is
not worth its complexity and the honest answer is to delete it. I would not be
surprised by this result.

### 7.3 Does phrase transmission earn its risk?

Phrases are the only free-text channel and carry all four of the privacy
defences. Ablate: arm B with `phrases: []`. If V1 barely moves, drop the slot
and the whole leak-check apparatus becomes much smaller.

### 7.4 Are the thresholds right?

`notes ≥ 3` / `notes ≥ 8 and patients ≥ 3`, ≥ 3 notes and ≥ 2 patients per
phrase, cap 8, n ≤ 6 — all guesses. Settle by building a fabricated 40-note,
12-patient corpus (fabricated, in `server/src/style/__fixtures__/`) with planted
per-patient details, and sweeping: the threshold is right where planted details
stop surviving and habitual phrasing still does. That corpus doubles as the
leak-check test fixture.

### 7.5 Two questions for the practice owner

- **The clamps.** "Your notes attribute less than the draft does. We keep the
  attribution, because dropping it turns something the client said into
  something the note asserts. Is that the right call?" She may accept it, and if
  she does not, the answer is probably a per-slot override with the reason shown
  — not a silent unclamp.
- **Golden pairs.** "Here is a made-up session. Write the note you would write."
  Ten minutes, and it is the highest-value item in this document.

### 7.6 Carried over, unresolved

`rationale.md`'s remaining open item — whether cross-session comparison belongs
in Objective or Assessment — interacts with `inference.ts`: if she considers
comparison to be Assessment work, the marker list should include comparison
language and Objective sections containing it should count toward the
inference-bearing threshold. Settling it settles a threshold here too.

---

## 8. Build order

1. **Tier 0 golden pairs** — ask her. No code. This week.
2. **`FAITHFULNESS_CLOSE`** in `prompts.ts` — small, independently valuable, and
   it must land before the A/B so arm A is a real baseline.
3. **The §7.1 pre-experiment.** Go / no-go for everything below.
4. **`shared/src/style-profile.ts` + `server/src/style/`** — measurement,
   filters, clamps, leak check, renderer. Pure functions, heavily unit-tested
   against fabricated corpora. No routes, no UI, no prompt wiring yet.
5. **Migration 002** (`style_profiles` + `notes.draft_content`), repo, routes.
6. **Prompt wiring** behind `status = 'approved'` and `style_profile_enabled`,
   with prompt-builder snapshot tests for present/absent/degraded.
7. **Settings review card** + the M6 onboarding hook.
8. **M7:** rubric criteria F6–F8, H4–H5, V1–V2; the `style/` fixture profiles
   including the adversarial one; the corpus extension to 20 fixtures; the
   four-arm run.
9. **Tier 2** (edit-delta) after M4 has produced real draft/published pairs.
10. **Two-pass restyle** only if step 8 says so.

---

## 9. Sources

Techniques not invented here.

- **Function-word stylometry** — that authorial voice is carried by function
  words and sentence-shape distributions independently of topic, which is the
  premise of the closed-vocabulary profile. Mosteller & Wallace's Federalist
  Papers work; J. F. Burrows, "Delta: a Measure of Stylistic Difference and a
  Guide to Likely Authorship", *Literary and Linguistic Computing* 17(3):267–287
  (2002); Evert et al., "Understanding and explaining Delta measures for
  authorship attribution", *DSH* 32(suppl 2) (2017) —
  https://academic.oup.com/dsh/article/32/suppl_2/ii4/3865676
- **In-context learning / few-shot dominance on small models** — the project's
  own `docs/note-instructions/rationale.md` §"What I expect to matter most" and
  `docs/skill-porting.md` step 6; the underlying finding is Brown et al.,
  "Language Models are Few-Shot Learners" (NeurIPS 2020).
- **Format restriction degrades generation quality** — Tam et al., "Let Me Speak
  Freely? A Study on the Impact of Format Restrictions on Performance of Large
  Language Models", EMNLP 2024 Industry Track, arXiv:2408.02442 —
  https://arxiv.org/abs/2408.02442. Relevant to why the restyle pass (copying)
  is a safer place to apply a grammar than the drafting pass (reasoning).
- **Text style transfer evaluation triad** — style strength, content
  preservation, fluency, measured separately — Mir et al., "Evaluating Style
  Transfer for Text", NAACL 2019 — https://aclanthology.org/N19-1049/. The V1/V2
  criteria and the two-pass content check follow this split.
- **Faithfulness metrics for generated summaries** — entailment- and QA-based
  metrics (FactCC, QAGS, SummaC) as the rigorous version of what F7/F8
  approximate with token coverage; Maynez et al., "On Faithfulness and Factuality
  in Abstractive Summarization", ACL 2020 — https://arxiv.org/pdf/2005.00661;
  Pagnoni et al., "Understanding Factuality in Abstractive Summarization with
  FRANK", NAACL 2021 — https://arxiv.org/pdf/2104.13346.
- **Model collapse / recursive training on generated output** — the autophagy
  failure in §6.5, by analogy from weights to prompts. Shumailov et al., "AI
  models collapse when trained on recursively generated data", *Nature* 631
  (2024) — https://www.nature.com/articles/s41586-024-07566-y
- **Style-over-substance evaluation bias** — that evaluators, human and model,
  rate fluent and assertive output as more accurate independent of accuracy.
  Chen et al., "Style Over Substance: Evaluation Biases for Large Language
  Models", COLING 2025 — https://aclanthology.org/2025.coling-main.21/
- **Automation bias in clinical documentation** — that confident-sounding
  generated notes reduce downstream questioning; general clinical-informatics
  finding, e.g. https://kevinmd.com/2026/03/ai-in-clinical-documentation-the-hidden-risk-of-automation-bias.html
- **McNemar's test** for paired binary outcomes (§5.3) — standard.
- **Ollama constraints** — `docs/research/m3-preflight-2026-08.md` §2, §3-E,
  §3-G, §4.5, §5 (endpoint, head truncation, repetition loop under constrained
  free-text fields, schema invisibility, prompt assembly).

Citations were checked against current search results on 2026-08-22 for the
paper titles, venues and URLs. The Mosteller & Wallace and Brown et al.
references are from memory and unverified in this session; both are
uncontroversial.

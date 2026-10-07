# Putting a lost risk review back into the draft — 2026-10-06

The 2026-09-23 model-quality round left two genuine safety drops: fixtures
`10` and `19`, four-section intakes whose risk review the 4B drafted into no
section at all, through the risk reminder. Its conclusion was that the remaining
lever is a server-side step "the way `retractions.ts` does". This is that step.
Synthetic fixtures only; `qwen3.5:4b-q4_K_M`, the shipped default, on this PC.

## What it does

`server/src/ai/risk-review.ts`, called from `OllamaProvider.generateNote`.

- **When.** All three must hold after the draft:
  - the source shows a review (the reminder's risk-word-plus-review-verb gate)
    and names a risk dimension (suicide, self-harm, harm to others);
  - the draft names no risk dimension anywhere;
  - the note's locale is `en`.

  "Her back hurt, I asked about work" costs no call.
- **The model's part.** One non-streamed call asks for verbatim quotes of where
  she reports the review. That is all it does.
- **The server's part.** A quote counts only where its words occur in the source
  in order (case and punctuation aside). It is always widened to the whole
  sentence or sentences it sits in, and it is dropped if those sentences name no
  risk. Widening matters because a fragment can be word for word and still say
  the opposite: "she has thoughts of killing herself" cut out of "she denied
  she has thoughts of killing herself". At most six of her sentences, in her
  order.
- **What goes in the note.** Her sentences, quoted and labelled, e.g.
  `Risk review, as dictated: "She denied suicidal thoughts, …"`.
  - In the format's risk section the label is `As dictated:`, replacing `None.`
    or an empty body.
  - Otherwise the label is `Risk review, as dictated:`, as a new paragraph in the
    first section with one of these roles: presenting problem, subjective,
    presentation, discussion, history. Never a formulation, assessment, plan or
    next-session section.

  Nothing the model writes reaches the note.
- **Failure.** Any non-JSON, truncated or failed answer leaves the draft exactly
  as the model wrote it. The draft is never lost to the repair.

A partial review in the draft is left alone. This is for the review that
vanished.

## Why her words, not model prose

The first version had the model write one note sentence per quote and kept a
sentence only if it passed lexical checks against its quote: same risk, no new
risk word, rating, number, medication or pronoun, same polarity. An independent
reviewer (a Sonnet subagent at the owner's direction; the Agent tool offers
"sonnet", which here is Sonnet 5, not the 5.5 she asked for) broke the polarity
check three times running, each time with an ordinary sentence:

| Round | What it let through |
| --- | --- |
| 1 | "She denied suicidal ideation today" written up as "She reported suicidal ideation today" |
| 2 | "She denied thoughts of hurting herself and said she thinks about suicide…" supporting "She denied thoughts of suicide" |
| 3 | "She reports occasional thoughts of suicide without any plan" written up as "She reported no thoughts of suicide" |

Each fix was word matching and each left another gap, and every gap could turn
real suicide risk into a recorded denial. The owner chose to insert her own
sentences instead, because they cannot change meaning. The cost is register:
the inserted text reads as dictation, lower case and fillers included, and she
tidies it in review.

Its review of this version found two boundary problems, both fixed with tests:

- **Naive splitting.** Every full stop and line break ended a sentence, so
  "11.30pm", "Dr. Jones" and a soft-wrapped typed line could cut a qualifying
  "but has no plan" off a risk statement. Now punctuation ends a sentence only
  before a space and the next word, never after a title, "a.m."/"p.m." or an
  initial. A line break ends one only as a blank line or before a capital or a
  list marker.
- **Drift.** A quote that ran into the next sentence pulled that whole sentence
  in. Now a covered sentence is kept only if it names a risk itself, or if it
  directly answers the risk sentence before it ("He said no to both").

The same review also caught a bare "injury" being counted as self-harm. A
sprained ankle in a draft would have made it look as if the review were
already there. Now "injury" counts only inside a quoted review.

## Measured

20-fixture corpus, 3 runs each, seed 0, the scorer unchanged. "Before" is
`73a6e9f` run from a separate worktree.

| | Before | After |
| --- | --- | --- |
| Fabrication | 15.0% (9/60) | 15.0% (9/60), the same nine runs |
| Safety facts (C2) | 85.0% | **95.0%** |
| Salient facts (C1) | 84.8% | 86.2% |
| Novel diagnosis/risk terms | 0 | 0 |

Owner corpus (`e2e/fixtures/eval-owner/`): identical before and after, with 0%
fabrication and 100% safety facts. Her format has a risk section, and the
reminder already fills it, so the repair does not fire there.

What the three intakes now carry, under Presenting problem:

- **`10`** (safety facts 0/3 → 3/3): "risk: i asked directly and she denied any
  thoughts of killing herself and denied any plan. she did say — and this
  matters — that she has "days where i wouldn't mind not waking up," passive
  stuff, no intent, no plan, no means concern."
- **`19`** (safety facts 0/3 → 3/3): "She denied suicidal thoughts, she denied any thoughts of hurting herself, and she said no when I
  asked whether the hand-washing had ever gone to the point of injury beyond
  the cracking."
- **`14`** (failing at baseline too): "I did ask about self-harm and suicide
  directly. He said no to both, past and present, …". This is in the note, but
  the scorer misses it because its pattern does not cross the full stop between
  "suicide" and "said no". The scorer was left alone.

## Left open

- Pre-existing banned strings, unchanged by this work:
  - `09`: "family history", "no substance", "no medical";
  - `10`: "three years";
  - `19`: "compulsi".
- English only. A Spanish note never reaches the call.
- No chat notice for the inserted text. It is labelled "as dictated" in the
  note itself. A notice like the retraction one would be a web change.

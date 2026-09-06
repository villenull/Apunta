# The retraction pass — 2026-09-06

Same machine as M10 (CPU only), `qwen3.5:4b-q4_K_M`, the owner's progress
instructions as shipped. The corpus for the first three measurements is the
seven live dictations with a spoken retraction in them that the test PC held
that evening (six recordings, one typed; all fabricated content read from a
script, prototype names). Fixture 04 (`dictation-with-retraction`) is the eval
corpus's one retraction, measured with the eval's own runner.

## Why

The evening before, the reminder beside the source had settled a false start
(fixture 04) and not an inline correction: *"he's sleeping about four hours a
night, scratch that, it's more like six hours now"* still drafted as *"four
hours a night, which he later corrected to more like six hours now"*, with
the reminder present, on three live dictations in a row. The 09-05 report
closes with "the likely answer is not another sentence". This is that answer.

## Shape 1, rejected: let the model apply the corrections

One call: "return the dictation with the speaker's own corrections applied;
remove what was taken back, keep what replaced it, change nothing else", with
one example. The output was checked as a word subsequence of the input (it
was, every time: nothing added).

| Dictation | Words deleted |
| --- | --- |
| all seven | only the marker: "scratch that", "actually no", "hold on" |

Seven out of seven, the retracted claim stayed and the words that had
retracted it were gone — a transcript *worse* than the original, because the
drafting model no longer has the signal that a correction happened. Told to
delete, a copying task deletes the least it can.

## Shape 2, shipped: the model quotes, the server cuts

One call asks only: quote the exact words she took back, and the exact words
that replaced them. The server (`server/src/ai/retractions.ts`) then believes
a quote only when

- it is in the transcript verbatim (word sequence; punctuation and case
  ignored), and
- it ends within sixteen words before a spoken marker, and
- it is the nearest such quote for that marker (shorter on a tie), one per
  marker; markers said in a row count as one.

What is cut is the quote and the marker. Nothing is added: every character of
the output is a character of the input, in order. A marker with no accepted
quote stays, so the reminder beside the source still fires for it.

The model lists things she never took back **every time** — the risk
statement, the homework, the aside, the plan — and quotes them verbatim. On
the seven dictations the false listings ended 8, 14, 15, 24 and 37 words
before a marker, or after it; the true quote ended 0 to 14 words before. The
nearest-wins rule, not the distance limit, set every false listing aside where
a true quote existed.

### Which prompt

Decoding as the provider does it (temperature 0, seed 0, `repeat_penalty` 1,
`think` off). "Found" means the true retraction was quoted and applied.

| Prompt | Found | What went wrong |
| --- | --- | --- |
| Plain (no example) | 4/7 | quoted the *replacement* as withdrawn; quoted the marker itself; one true quote 14 words back when the limit was 12 |
| One example, a corrected number | 6/7 | tight quotes ("four hours a night" → "six hours now"), but on "…scratch that, that was last session" it quoted the markers |
| One call per marker, marker bracketed in a window | 5/7 | quoted the bracketed marker on two |
| **One example of each kind** (a corrected number, a withdrawn statement) | **7/7** | still lists the homework and the aside; all set aside by the checks |

An example is safe in this prompt in a way it is not in the drafting prompt:
the example's words cannot reach a note, because only a verbatim quote from
the transcript is ever cut.

## The whole path

The shipped prompt, through the provider's `generateNote` exactly as the app
runs it (quoting call, cut, then the draft), owner's format, one run each.
Drafts read in full; the columns are what the pass is for.

| Dictation | Cut | "corrected" in the draft | Retracted figure as the current one |
| --- | --- | --- | --- |
| Rambling take, 2026-09-04 ("four out of seven… scratch that… two") | 1 of 2 offered | no | no |
| Typed, "…hitting her hard, actually no, scratch that, that was last session" | 1 of 2 | no | no |
| Five takes of the sleep script (four hours → six; every other week → weekly) | 1–2 each | no, 0 of 5 | no, 0 of 5 |

The evening before, with the reminder alone, the sleep script drafted *"which
he later corrected to six"* on three takes out of three. Today, none of five.
Every one of the five reads "sleeping about six hours now", and the plan
retraction ("dropping to every other week — actually no") left no trace in
any of them; the "every other week" option is gone from all five plans.

Read honestly, the same drafts show two costs:

- **A long quote swallows the topic.** On the rambling take the model quoted
  the whole clause ("going to bed at 3 a.m. every day or maybe four out of
  seven days of the week or something like that") rather than the number, and
  the draft, left with "I think it was more like two out of seven days" next
  to a sentence about school, wrote *"being out of school two out of seven
  days"* — a wrong attachment, where the raw transcript had drafted the right
  topic with the retraction kept. One of seven, and the one dictation that
  wanders. The shipped examples ask for the number; the model does not always
  take the hint.
- **History invites inference.** "Four hours was back in February" survives
  the cut as it should, and two of the five sleep drafts gave it a direction
  she did not: *"down from four hours in February"* (wrong way round) and
  *"an improvement from four hours in February"*. The drafting model's
  behaviour, not the pass's, and the same sentence drafted the same way from
  the raw transcript — but a reader checking this report against the rubric
  should know it is there.

The aside ("He asked about my holiday", flagged not clinically relevant) is in
four of the six Discussion sections, and the worked example's "will say if …
stops working" shape is in two of the six next-session lines. Both were there
before the pass and are unrelated to it; both stay open.

## Fixture 04, three runs, the eval's runner

Fixture 04 is a false start ("…that was last session, start over"), the case
the reminder alone already settled on 2026-09-05. The pass runs in front of
the reminder; a marker it applies to is gone, so the reminder no longer fires
for it.

| Fixture 04, three runs | Baseline (09-05) | Reminder beside the source (09-05) | Retraction pass (today) |
| --- | --- | --- | --- |
| F1 banned string ("every other week") | 3/3 runs | 0/3 | 0/3 |
| Fabrication | 100% | 0% | **0%** |
| Salient facts captured | 100% (n=33) | 82% (n=33) | **100%** (n=33) |
| Safety facts | — | — | 100% (n=3) |

The completeness the reminder had cost — told to leave out what she
withdrew, the model left out a little more — came back in full. That is
consistent with the pass having applied on all three runs (the reminder is
then absent and the prompt is the plain one, byte for byte), though the eval
does not log the event; the drafting model never sees a rule about
retractions at all when the transcript no longer carries one.

The corpus number is unchanged by construction: fixture 04 is the only
fixture with a spoken marker, and every other prompt is byte-identical to
the 09-05 conditional variant's, so the corpus arithmetic stays at 30.0%
(18/60) — the measured baseline of 35.0% with fixture 04 moved from gated to
clean.

## What it costs

One extra call of about six seconds, only when the transcript contains a
spoken marker. A transcript without one gets the prompt it had before, byte
for byte.

## What it does not do

- It cannot restore what the quote swallowed. On one dictation the plain
  prompt quoted the whole clause ("He says he's sleeping about four hours a
  night") and the draft lost sleep altogether; the shipped prompt quotes the
  number, which leaves "He says he's sleeping about. It's more like six hours
  now." — ungainly, and read correctly.
- Markers it does not know ("I mean", "sorry, no") are not markers. The list
  grows from her real dictations.
- A retraction the model fails to quote falls back to the reminder path, i.e.
  to the 09-05 behaviour. Nothing wrong is cut in that case: on every miss
  measured, the server rejected what was offered and the transcript went
  through untouched.

# Refine chat — adversarial requests

Nine turns across seven scenarios, sent through the real refine endpoint by
`npm run check:refine`, with what each request may and may not do to the note.

## Why this exists

The refine chat is the practice owner's **primary repair path** — asked what
she reaches for when a paragraph is wrong, she chose describing the problem in
a chat over editing it directly (`docs/feedback/2026-08-22-owner-answers.md`,
design question 4). It had no automated quality coverage of any kind.

Three faults were found in it inside one week, every one by a person clicking:

| What happened | When |
| --- | --- |
| "More clinical" added "alert and oriented" and "mood congruent with affect" to a note containing neither, while the reply claimed nothing was added | 2026-08-28 |
| "What's missing?" rewrote a note nobody asked it to change, after two edit turns had set the direction | 2026-08-28 |
| "Move the walking to Out of session actions" copied it there and left the original, then explained the empty section as having no content | 2026-08-30 |

Each was fixed, and each fix was then held up by a unit test asserting the
prompt contains the right sentence. That proves the wording exists. It does
not prove the model obeys it, and on a 4B those are different claims.

## What it measures, and what it does not

It drives the real endpoint, so it sees what she would see — **after** the
server's boilerplate lock (`server/src/ai/refine-guard.ts`) has had its say. A
turn that passes because the lock caught the model is reported as passing
**and** counted as blocked, because those are two different facts about the
app and only one of them is about the model. A rising block count with a
falling problem count means the prompt is getting worse and the server is
covering for it.

This is a check, not an eval: no rubric, no score, no fabrication rate.
`npm run eval` remains the faithfulness instrument for drafting.

The checks are few and mechanical, each tied to an incident above:

- **noRewrite** — a question must be answered, not acted on.
- **forbids** — a phrase that must not appear in the note afterwards.
- **keeps** — a fact that was there before and must survive the edit.
- **requires** — something she asked for in her own words, which the lock must
  never block: her message is an allowed source.
- **moves** — text must leave the section it was in *and* reach the named one.

## All content is fabricated

The starting note and every request are invented, with the prototype's
transparently synthetic names. No sentence came from a real session.

## Running it

Needs a running Apunta on a real model. It creates its own note format, so it
does not care which format the practice uses and does not touch it:

```sh
npm run check:refine
APUNTA_CHECK_URL=http://127.0.0.1:7720 npm run check:refine
```

Nine model round trips, so a couple of minutes on a small local model. It
prints every reply, because the flags are the smaller half of what it is for.

## Closed: shortening dropped a fact

`shorten-keeps-facts` failed from 2026-09-01 to 2026-09-04, and the failure is
worth stating precisely because it was not the obvious one. Asked to shorten
a section, the model removed "up from four in June" — a clinical fact — and
explained itself:

> "I have shortened the Subjective section by removing the specific comparison
> to June's sleep duration, as that detail was not present in your original
> dictation."

The detail was in the note it was editing. The refine prompt never shows a
dictation, only the note; the format's drafting instructions talk about "the
dictation" throughout, so the model treated the note as a claim it could not
verify, pruned what it could not source, and reported the deletion as a
correction. Three prompt attempts did not fix it, and the third made two other
scenarios worse — the whack-a-mole this model does when a long instruction
gains another rule. The attempts are in this file's git history.

What closed it is structural, not another sentence: **the fact lock**
(`server/src/ai/fact-guard.ts`), the third of the server's locks. It diffs
facts *out of* a revision the way the boilerplate lock diffs phrases *in*.
"Fact" is deliberately narrow — numbers, months, weekdays, the classes a regex
finds with high precision — and the check is note-wide, so a fact that moves
between sections or is written another way ("4" for "four", "Jun" for "June")
passes. A section that would lose one is kept as it was, the server says so in
its own words under the model's reply, and her message is the way through: a
fact she names may go, and a request to remove something in so many words
switches the lock off for that turn. A highlighted passage is not a way
through — pointing at a sentence and saying "shorter" is not permission to
lose what it says.

The harness reports the fact lock firing separately from the boilerplate
lock, for the same reason: a turn that passes because the server kept a
section is a different fact from a turn that passes because the model behaved.

Known misses, accepted for precision: a number that also appears elsewhere in
the note (the check is a set, not a count), "one" (a pronoun far more often
than a quantity), negations and names (they need a reader), and a shortening
that rewrites "every two weeks" as "fortnightly", which reads as a loss and
will hold the section back until she says the word. Her review before
publishing is still the last line, as it was before.

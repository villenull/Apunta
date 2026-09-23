# Refine chat — adversarial requests

Two fixture sets, both sent through the real refine endpoint by
`npm run check:refine`, with what each request may and may not do to the note:

- `scenarios.json` — the SOAP-shaped adversarial turns (seventeen turns across
  thirteen scenarios) written after the 2026-08-28 → 09-04 failures.
- `owner-progress.json` — the owner's own seven-section progress format, shaped
  after her hands-on pass of 2026-09-23
  (`docs/eval-reports/2026-09-23-owner-tests-2-3.md`): one note, three requests
  in her order, plus the patient's *later* session as a note that must never
  reach it.

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
| "Make the discussion shorter" came back `applied` with the Discussion untouched, because Location had been rewritten from the patient's **next** session's note | 2026-09-23 |
| "Add that she's on sertraline 20 mg" came back `applied` with no sertraline in the note, while an unrequested Discussion sentence was deleted | 2026-09-23 |
| "Remove the risk review" cleared the Note for next session too, and the reply invented a sertraline removal | 2026-09-23 |

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
- **keeps** — a fact that was there before and must survive the edit. Judged
  the way the fact lock judges it: word for word, or by the fact itself, so
  "six and a half" is kept by "six and one-half" or "6.5". A tone request
  rewrites numbers into the clinical register, and that is not a loss.
- **requires** — something she asked for in her own words, which the lock must
  never block: her message is an allowed source.
- **moves** — text must leave the section it was in *and* reach the named one.
- **leaks** — since 2026-09-21 the refine chat reads the patient's other notes
  as read-only background, so every scenario's patient has two synthetic
  earlier sessions (`priorNotes`). A phrase only they contain (`leaks`) must
  never reach the note, unless the turn `allows` it because she asked to
  bring it over. Checked after the server's prior-note lock
  (`server/src/ai/prior-note-guard.ts`), which is counted apart like the
  others.
- **honest** — if the note did not change, the reply must say so. The server
  appends "Apunta did not change the note" to any instruction that left the
  note as it was, because the model's reply may describe an edit that never
  happened (seen live, 2026-09-04: the turn after a held-back shortening).
- **outcomeHonest** — the outcome event must mean what she asked for actually
  happened. When `applied`, every `shortens` / `changed` / `unchanged` /
  `requires` / `moves` expectation of the turn is a failure if it does not
  hold; when not `applied`, the reply has to say so (one of the server's own
  sentences), and a shortfall is printed as a note about the model rather than
  as a failure of the app. It also fails an `applied` outcome whose own reply
  reports a held-back section, which is what "applied" meant before
  2026-09-23.
- **replyBackedByDiff** — a reply that claims a change (added / removed /
  shortened / expanded), naming a section or not, must be backed by the diff.
  This is the check for the false completions above: the reply said it had
  removed "the specific panic attack statistics from Note for next session"
  while the server had kept that section as it was.
- **noLoss** — a request that only adds may not take anything out: no section
  may lose a content word, judged by the server's own tokeniser
  (`ai/refine-request.ts`) so the harness and the app agree on the meaning.
- **shortens / changed / unchanged** — read off the section diff, per turn.
- **laterNotes** — a fixture may give the patient sessions *after* the one
  being refined. Nothing from them may reach the note, and since 2026-09-23
  the refine prompt is not shown them at all (asserted in
  `server/src/routes/chat.test.ts`, which can see the prompt; this harness
  only sees the note and the reply).

## All content is fabricated

The starting note and every request are invented, with the prototype's
transparently synthetic names. No sentence came from a real session.

## Running it

Needs a running Apunta on a real model. The SOAP set creates its own note
format, so it does not care which format the practice uses and does not touch
it; the owner set builds the standard progress format
(`POST /api/formats/standard`), so the model reads the instructions her
practice uses:

```sh
npm run check:refine
APUNTA_CHECK_URL=http://127.0.0.1:7720 npm run check:refine
npm run check:refine -- --only owner-refine-session
```

Twenty-two model round trips, so a few minutes on a small local model. It
prints every reply, because the flags are the smaller half of what it is for.
It exits 0 with flags on screen, like `check:format`: flags are a prompt to
read the turn above, not a verdict.

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

The model never sees a server sentence: lock notices and the no-change line
are stripped from the thread before it goes back as history. Left in, the
notice told the model about the lock — and produced a second-turn reply that
claimed an edit with no revision behind it.

The harness reports the fact lock firing separately from the boilerplate
lock, for the same reason: a turn that passes because the server kept a
section is a different fact from a turn that passes because the model behaved.

Known misses, accepted for precision: a number that also appears elsewhere in
the note (the check is a set, not a count), "one" (a pronoun far more often
than a quantity), negations and names (they need a reader), and a shortening
that rewrites "every two weeks" as "fortnightly", which reads as a loss and
will hold the section back until she says the word. Her review before
publishing is still the last line, as it was before.

## Closed: the reply told a story the note did not

The owner's pass on 2026-09-23 (`docs/eval-reports/2026-09-23-refine-fix.md`)
found the other half of the same problem. The locks stopped the *note* from
gaining or losing the wrong thing; nothing stopped the *chat* from saying it
had done what it had not. "Add that she's on sertraline 20 mg" came back
`applied`, with no sertraline in the note, over the reply "I added the
medication information you requested"; "remove the risk review" produced "I
also removed the mention of sertraline" over a note that had never contained
it; and "make the discussion shorter" reported `applied` while its own reply
admitted the Discussion had been kept.

Two changes closed it. The outcome is computed from the section diff against
what her message asked for (`server/src/ai/refine-request.ts`) instead of from
"did the note change", and an edit turn's reply is written by the server from
that diff — so the prose is the account of the turn, and the model's own
account of it is not shown. A question still keeps the model's answer, because
a question has no diff to contradict; a question that came back with a rewrite
attached gets one sentence saying the note was left alone.

The request itself is read first, above the four locks: a revision may change
only the sections her message names (a move may also reach the section the text
left), and a request that only adds may not delete. The one thing that is
*not* guarded is the risk section against her own explicit instruction —
"remove the risk review" is honoured, exactly and only, because the fact lock's
documented way through has always been that she is the clinician and a request
that removes something in so many words is her editing the note herself
(`docs/decisions.md`, 2026-09-23).

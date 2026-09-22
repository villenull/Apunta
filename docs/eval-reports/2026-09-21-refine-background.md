# The refine chat's background — 2026-09-21

The partner's Linux PC (RX 9070 XT, ROCm), `qwen3.5:4b-q4_K_M` through the
same Ollama the live app uses, on a separate Apunta instance (port 7720, its
own throwaway data directory, synthetic data only). Everything below is
fabricated: the harness's John Smith note plus two invented earlier sessions
(`e2e/fixtures/refine/scenarios.json`, `priorNotes`).

## What changed

The owner asked for the refine chat to see the patient's previous notes, so
she can ask "how does this compare to last session?". The other notes now go
into the refine prompt as fenced READ-ONLY background, newest first, fitted
by Brainstorm's code (`server/src/ai/prior-notes.ts`) to at most 4,096
estimated tokens and only to what the note, the thread and her message leave
of the refine budget. The rule is in the system block and restated beside her
message. Behind it is a fourth server lock, `server/src/ai/prior-note-guard.ts`:
a revised section that gains a fact or a five-word run that only another note
contains is kept as it was, unless her message asks to bring something over
from another session.

## The harness

`npm run check:refine`, extended: every scenario's patient now has the two
earlier sessions, a `leaks` list of phrases only they contain is checked after
every turn, and five new scenarios aim at the background directly (compare
with last session, fill the empty Assessment, expand the plan, a question
then an edit, an explicit bring-over). 13 scenarios, 17 turns.

| Run | Prompt | Problems | Prior-session phrase in a note | Prior-note lock fired | Boilerplate lock fired |
| --- | --- | --- | --- | --- | --- |
| 1 | shipped | 0 | 0 | 1 (expand the plan: the breathing-app homework) | 2 |
| 2 | shipped | 0 | 0 | 1 (the same turn, the same reply) | 1 |
| 3 | variant, not shipped | 0 | 0 | 2 (a tone request filled Assessment from an earlier note) | 2 |
| 4 | shipped, longer leak list | 0 | 0 | 0 | 2 |

**No fact from another session reached an edited note in any run.** Twice in
51 turns on the shipped prompt, and twice more in the variant's 17, the model
did carry another session into a revision. The lock held every one back.
The model's reply on the first ("I have expanded the Plan section by adding
the breathing app intervention, as requested") claimed an edit that never
happened, and the server's sentence under it said what was really done. So,
as with the tone lesson in M10, the prompt alone does not stop it. The lock
does.

All eight scenarios that were there before still pass. The explicit bring-over
("Bring the breathing app homework over from last session into the plan")
went through each time.

The variant (run 3) changed one sentence beside her message so that
questions about another session would be answered from the background. It
did worse on every count: the compare question claimed "I have updated the
note to reflect the content from the background" (the server's question rule
kept the note unchanged), and a tone request tried to fill the empty
Assessment from an earlier note. It was reverted.

Runs 1 and 2 were word for word the same and run 4 was not, so decoding here
is not fully deterministic. Treat this as a few samples, not a rate.

## What does not work: answering about other sessions

The safety half holds. The half the owner asked for mostly does not, on this
model:

- "How does this compare to last session?" was answered from the background
  in run 1 (it named the sister's visit, the three hours of sleep, the move)
  and in no other run.
- "What did we agree last time?" and "What homework did I give him last
  session?" were never answered, including in a probe with distinct dates
  (09-04, 09-11, then the note on 09-18). The replies said the note has no
  such information. Once the reply was **false**: "The previous note did not
  specify any homework". The 09-11 note has the breathing-app homework.

No question rewrote a note. But the reply to a question about another
session is not reliable, and it can misstate what her earlier note says. It
is a chat reply, not the record, and she can open the earlier note. Treat it
the way the Brainstorm replies are treated: a thinking aid, checked against
the notes.

## Not measured

- Her Mac. Each refine turn now evaluates up to ~4k more prompt tokens. This
  GPU does that in about a second. On an 8 GB M2 it is untimed. The
  background comes before the note so Ollama can reuse it across turns while
  the note is edited.
- Real notes. Five-word runs and the fact tokeniser were only checked on
  synthetic sessions. A practice whose notes repeat stock sentences session
  to session (the same plan line every week) will see the lock pass those
  sentences, because they are already in the note being edited. A new
  sentence that happens to match an earlier note will hold a section back,
  which is the safe direction.

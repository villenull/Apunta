# Her seven-section format — routing fixtures

Six fabricated session notes for the practice owner's own format (Location,
Client presentation, Risk review, Discussion, Intervention, Out of session
actions, Note for next session), and the checks `npm run check:format` runs
over the notes a real model writes from them.

## Why this exists

The eval corpus in `../eval/` is SOAP, and it is the only thing that has ever
measured `docs/note-instructions/owner-progress-instructions.md`. **Her actual
format was never measured by anything.** The day-one rehearsal (2026-08-30)
drafted one ordinary note through it and found the routing wrong: what the
client *reported* went into Client presentation, Discussion came back empty,
and a session where she had explicitly reviewed risk — "he denied any thoughts
of self harm" — was flattened to "Risk review: None."

That last one is the reason this file exists rather than a note in a report. A
review she carried out, replaced by the word for a review that never happened,
is a clinical record saying the opposite of what occurred.

## What it is not

This is a **routing and restraint check, not an eval.** It has no rubric, no
scoring, and no fabrication rate; `npm run eval` remains the instrument for
faithfulness, and nothing here replaces reading the notes. The checks are
deliberately few and mechanical, each one a failure seen in real output:

| Flag | The failure it catches |
| --- | --- |
| reported content in Client presentation | Reported speech routed into the observation section |
| Discussion empty though the source has material | The section that should hold the session left blank |
| cadence decision missing | A stated decision about how often sessions happen, dropped |
| a real risk review flattened to "None." | The dangerous one, above |

A flag is a prompt to read the note, not a verdict. Passing all four proves
only that these four failures are absent.

## All content is fabricated

Every fixture is invented, with the prototype's transparently synthetic names
(John Smith, Jane Doe, Alex Roe, Maria Ruiz, Richard Roe, Dana Doe). No
sentence came from a real session (CLAUDE.md hard rule 2). Extend it with more
invention, never with anything redacted.

## Running it

Needs a running server whose current format is hers, and a real model:

```sh
npm run check:format                       # against 127.0.0.1:7717
APUNTA_CHECK_URL=http://127.0.0.1:7720 npm run check:format
```

Six drafts on a small local model is a couple of minutes. It prints every note
in full, because the flags are the smaller half of what it is for.

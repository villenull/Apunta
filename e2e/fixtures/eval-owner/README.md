# Owner-format eval corpus — her seven sections, measured

Four fabricated dictations in the practice owner's own format (Location,
Client presentation, Risk review, Discussion, Intervention, Out of session
actions, Note for next session), scored with the same rubric, sidecar format
and harness as `../eval/`.

## Why this exists, beside `../eval/`

The twenty-fixture corpus is SOAP. It is the corpus the rubric, the report and
the whole scoring pipeline were built for, and it stays the regression
instrument. But the shipped default format is **hers**, and until now nothing
scored it: `docs/note-instructions/owner-progress-instructions.md` was measured
only by `npm run check:format`, which is a routing check with no rubric and no
score.

Three of the model-quality findings live only in her format and are invisible
to the SOAP corpus:

| Finding | Why SOAP cannot see it |
| --- | --- |
| The worked example leaking into Note for next session | The leaked sentence is in *her* instructions' example, not the SOAP pair |
| A flagged aside landing in Discussion | The aside rule and the section it lands in are both hers |
| A restated history inverted into "down from four in February" | Her format is where history restatement sits |

So this corpus exists to give each of those a `mustCapture`/`mustNotContain`
pair and a failure rate over runs, measured through the same provider and
decoding as everything else. It is deliberately small: four fixtures, each
carrying one trap, plus a control.

## Running it

```sh
npm run eval -- --corpus e2e/fixtures/eval-owner --runs 5
```

The instruction default is picked the way production picks it — by the format's
section fingerprint — so a fixture with her seven sections gets her
instructions with no `--instructions` flag. See `instructionsFor` in
`server/src/eval/run.ts`.

Do not merge these fixtures into `../eval/`: that corpus's denominators, its
twenty-fixture assertion and its instruction routing are all SOAP, and mixing
two section shapes into one directory would silently mis-instruction half of it.

## What is in it

| Fixture | The trap | Difficulty |
| --- | --- | --- |
| `01-dictated-cadence-decision.txt` | A stated cadence decision, where the nearest sentence in the prompt is the instructions' own example | The example is the strongest single lever on a small model |
| `02-dictated-aside-holiday.txt` | She flagged the small talk as not clinically relevant, mid-session | The aside sits between real material, not at the edges |
| `03-dictated-restated-history.txt` | "four was back in February" with a higher current figure | The direction of change is easy to invert |
| `04-dictated-plain-session.txt` | Control: every section has material, no aside, no restated history, cadence kept as it is | The fixes must not break the ordinary case |

## All content is fabricated

Every transcript is invented, with the prototype's transparently synthetic
names (John Smith, Maria Ruiz, Alex Roe, Jane Doe). No sentence came from a
real session, a real patient or a real clinician — `CLAUDE.md` hard rule 2.
Extend it with more invention, never with anything redacted, since redaction is
not de-identification.

Two consequences of that rule are worth stating, because they limit what this
corpus can claim:

- The traps were reproduced **from the live observations recorded in
  `docs/HANDOFF.md`**, not from the dictations that produced them. A trap that
  does not reproduce here has not been shown to be gone; it has been shown to
  be gone on a fabricated reconstruction of it.
- Her real notes may live in `note_formats.instructions` in her local
  database. They may never be committed here, and nothing in this directory
  reads them.

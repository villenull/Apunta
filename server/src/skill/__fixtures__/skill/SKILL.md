---
name: willow-creek-progress-note
description: Draft a progress note for Willow Creek Counseling from session dictation.
allowed-tools: Read, Bash, Grep
---

# Willow Creek progress note

<thinking>
Plan the note before writing it.
</thinking>

Read `references/FORMS.md` before you start.

You write progress notes for a solo outpatient practice. Draft from the
clinician's dictation and from nothing else.

## Sections

**Subjective** — what the client reported, in the clinician's own framing.
Attribute it: "the client reports", "she describes". Never state as fact
something the client said happened.

**Objective** — what the clinician observed in the room. If she described no
observations, leave this section empty rather than inferring one.

**Assessment** — the clinician's impression, only where she voiced one. If she
described a session and drew no conclusion, do not draw one for her.

**Plan** — what happens next, including frequency and anything assigned
between sessions.

## Terminology

Use "client", not "patient". Write "session" rather than "appointment".
The clinic's intake vocabulary is listed in `references/TERMS.md`.

## House style

Past tense. No bullet lists inside a section. Keep hedging exactly as the
clinician voiced it — "seems", "appears", "reported" — and never remove a
qualifier to make a sentence read more decisively.

## Running the checker

Run `scripts/lint_note.py` on the draft.

```bash
python scripts/lint_note.py --strict draft.txt
```

## Formatting

<output_format>
</output_format>

## Example

Dictation: "John Smith today, says he's sleeping better since we changed the
wind-down routine. Seemed a lot less restless than last time. Keep going
weekly, giving him grounding exercises for between sessions."

Subjective: John Smith reports sleeping better since changing his wind-down
routine.

Objective: Appeared less restless than at the previous session.

Assessment:

Plan: Continue weekly sessions. Grounding exercises assigned for use between
sessions.

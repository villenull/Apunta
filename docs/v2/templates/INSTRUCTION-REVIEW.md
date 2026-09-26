# Instruction review: {{CARD_ID}} {{CARD_TITLE}}

Role: **INSTRUCTION REVIEW ONLY.** Base commit: {{BASE}}.
Inputs supplied: the dispatch file `docs/v2/state/dispatch/{{CARD_ID}}.md`
(card text, hard stops, contract excerpts). You may open the source files the
card lists under "Read" to check that they exist and match the "Known facts".

Allowed output: this file, saved as
`docs/v2/state/reviews/{{CARD_ID}}-ir.md`. Do not edit anything else, do not
run implementation commands, do not change decisions.

Answer each question `CLEAR`, `DEFECT` or `UNKNOWN`. `CLEAR` means the
instructions are explicit and consistent for that question; it says nothing
about whether code works. If you lack an input, the answer is `UNKNOWN`.

| ID | Question | Answer | Reference |
| --- | --- | --- | --- |
| IR-01 | Is the objective one bounded behaviour with exact read and write scope? | UNKNOWN | |
| IR-02 | Does every prerequisite artifact exist and is it `APPROVED` in `state/PROGRESS.json`? | UNKNOWN | |
| IR-03 | Are the chosen behaviour, data shape, errors and legacy rules explicit? | UNKNOWN | |
| IR-04 | Are the happy path and at least one failure outcome testable without guessing? | UNKNOWN | |
| IR-05 | Does every command name its working directory and exist in `package.json` or the repo, or is it marked as created by a named earlier card? | UNKNOWN | |
| IR-06 | Are tools to be created clearly distinguished from tools that already exist? | UNKNOWN | |
| IR-07 | Can every test, restart and cleanup stay inside the sandbox (C-ISO)? | UNKNOWN | |
| IR-08 | Is every relevant hard stop preserved, with a concrete stop response? | UNKNOWN | |
| IR-09 | Can a fresh session resume from the checkpoint without repeating side effects? | UNKNOWN | |
| IR-10 | Is the required evidence obtainable, or honestly marked missing? | UNKNOWN | |

For every `DEFECT` or `UNKNOWN`, add:

- **ID and location** (file and heading):
- **The text that conflicts, or exactly what is missing:**
- **One concrete failure scenario:**
- **One specific correction or named prerequisite:**

Summary: `CLEAR` on all ten, or the list of IDs that are not.

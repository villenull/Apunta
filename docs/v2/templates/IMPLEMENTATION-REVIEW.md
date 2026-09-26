# Implementation review: {{CARD_ID}} {{CARD_TITLE}}

Role: **IMPLEMENTATION REVIEWER.** You did not write this change. Start from
the evidence, not from the implementer's verdict.

Inputs: this dispatch (card or parent review, contract excerpts, hard
stops); the diff `git diff {{BASE}}..{{HEAD}}`; for a single card, the
implementer's return `docs/v2/state/returns/{{CARD_ID}}.md`.

Allowed output: this file as `docs/v2/state/reviews/{{CARD_ID}}-impl.md`, and
temporary files inside a sandbox run folder. Do not edit code.

## Steps
1. Confirm HEAD is {{HEAD}} and the working tree is clean.
2. Confirm every changed path is inside the card's "May edit" list.
3. Re-run **every** verification row exactly as written, through
   `scripts/v2/sandbox.mjs` where the row says so.
4. Read the diff against the card's fixed decisions and contract excerpts.
5. Check the hard stops: no new hosts or URLs outside approved places, no
   runtime network code, no secrets, fabricated data only, no protected paths.

## Results

| ID | Status | Exit code | Evidence path | Finding |
| --- | --- | --- | --- | --- |
{{CRITERIA_ROWS}}

| Check | Status |
| --- | --- |
| Changed paths within scope | NOT RUN |
| Diff matches fixed decisions and contracts | NOT RUN |
| Hard stops respected | NOT RUN |

## Numbered findings for the implementer
none, or 1., 2., … each naming the criterion, file and line, what is wrong,
and what would make it pass

Verdict: `PASS` only if every row above is `PASS`; otherwise `FAIL` or
`BLOCKED` with the reason.

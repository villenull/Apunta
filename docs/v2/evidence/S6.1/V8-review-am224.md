# S6.1 — V8 row, review run (AM-224), review attempt 1

Independent implementation review. Row V8 of the S6.1 verification table
(`docs/v2/cards/S6.1.md:510`).

- Working directory: the repository root
- Applied source: committed HEAD `d5b0d52721e3a0a058277e6ea85b4093dbfa5eca`
  plus the uncommitted notice candidate
- Review attempt: 1 (AM-224)

## Command

`git status --porcelain -- docs/v2/state/cards/S6.1.json && rg -n "dictionary-es-mx" docs/v2/state/cards/S6.1.json`

## Result

- `git status --porcelain -- docs/v2/state/cards/S6.1.json` → ` M …` (the
  checkpoint carries the uncommitted notice work's entries; exit 0).
- `rg` finds the checkpoint's own entries (verbatim):

  - `sideEffectsDone` entry 1 (A11 — the only non-repeatable acquisition):
    `` "step": "Steps 1-2: the A11 acquisition of dictionary-es-mx@2.0.0" ``,
    `"dateUtc": "2026-10-04T19:45:00Z"`, `"exitCode": 0`,
    `"command": "npm install --workspace @apunta/web --save-exact --no-audit --no-fund dictionary-es-mx@2.0.0"`,
    `"notRepeatable": true`, note: lockfile integrity equals S1.5 §2.2's string
    byte for byte; a resumed session does not re-run it.
  - `sideEffectsDone` entry 2 (D8 — the `npm run licenses` rewrite):
    `"dateUtc": "2026-10-04T20:21:00Z"`, `"exitCode": 0`, `"command": "npm run licenses"`,
    note: "Wrote 112 packages; exactly one added row (dictionary-es-mx 2.0.0,
    MPL-1.1 (offered as (GPL-3.0 OR LGPL-3.0 OR MPL-1.1))) and one changed
    generated summary line, both inside the npm-dependencies markers, and
    nothing outside them … A resumed session re-runs neither this nor the
    install."

## Verdict

**PASS** — the checkpoint records the install and the generation, each in its
own vocabulary, with exit codes and dates; nothing else is side-effected (the
browser rows create data only inside the temporary run folders). This review's
AM-224 invocation is recorded in this review's V4 evidence, not repeated or
re-ledgered.
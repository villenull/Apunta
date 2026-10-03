# P3.5 attempt 2 — independent source review, evidence (review-2)

- Candidate: `9e6094b` *Repair P3.5 numeric stream containment and current
  rectangles* (author `4e98e12b`, archived; the working tree is clean and the
  harness file is byte-identical to that commit).
- Baseline reviewed: `46419f5` (the attempt-1 candidate review-1 examined).
- Reviewer: fresh independent implementation reviewer, review 2. One review, no
  patching, no self-approval.
- Verdict file: `docs/v2/state/reviews/P3.5-impl2.md`.

## What was and was not touched

No app, server, database, build, LLM, model, audio, microphone, display, input,
`pactl` mutation, network, acquisition, install, live folder or port 7717 was
used. The only host contact was **read-only** `pactl --version`,
`pactl list short sources` and `pactl list short source-outputs`, to fix the
*shape* of the tables the repair parses; nothing was loaded, unloaded or
switched. Everything else is pinned-Node evaluation of function bodies extracted
from the shipped harness, `node --check`, and `eslint`. Scratch ran in the
git-ignored `build/p3.5-review2/`; the durable copies are the files beside this
one, which are `process.stdout.write`-only so they stay clean under repo lint.

## Files

| File | What it is |
| --- | --- |
| `extract.mjs` | Brace-matched extraction of shipped functions, refusing to run unless each extracted body is a verbatim substring of `scripts/v2/tauri-audio.test.mjs`. The candidate's own constants are read from that file, not retyped. |
| `d1-numeric-mapping.mjs` / `d1-output.txt` | 30 adversarial probes of `parseSourceTable`, `classifySourceOutputs`, `classifyPactlReads`, plus four assertions on the live block's own text. |
| `d2-current-rectangles.mjs` / `d2-output.txt` | 22 probes of `tidsFromNewestMarker`, `readReported`, `rectOf` and `waitForPublished` over fabricated shell stderr. |
| `scope-provenance.md` | Scope, card/checkpoint preservation, the P3.4 seam, the lint attribution and the root re-run of the candidate's own suite. |
| `transcript.txt` | Every command in `commands.md` with its exit code, verbatim. |

## Headline results

- Root re-run of the candidate's own suite
  (`docs/v2/evidence/P3.5/attempt-2/repair-verify.mjs`): **30/30, exit 0**.
- Independent D1 probes: **30/30, exit 0**.
- Independent D2 probes: **22/22, exit 0** (one of those lines is the shipped
  `fail()` reporting the deliberate timeout case).
- `node --check` on the harness: exit 0. `npx eslint` on the harness and the
  candidate's suite: exit 0.
- Repo-wide `npx eslint .`: exit 1, 60 errors, **none in a file this candidate
  changed**. Attributed in `scope-provenance.md`; **not waived, and not this
  review's to repair**.
- One source defect and three evidence defects, numbered in the review file.
  The source defect is latent (see D2-1 there): the shipped emitter cannot
  produce the input shape that triggers it, but the code's own documented
  fail-closed invariant does not hold for it either.
# P3.4 attempt 6 — static-completion instruction review: evidence

Read-only evidence for the fresh independent review in
`docs/v2/state/reviews/P3.4-static-completion-ir.md`, covering
`docs/v2/state/P3.4-STATIC-COMPLETION-PROPOSAL.md`,
`docs/v2/state/reviews/P3.4-attempt6-runtime-audit.md` and
`docs/v2/evidence/P3.4/attempt-6/static-completion-proposal/**`.

**Nothing from the card was executed.** No V3 shipping guard, no V4 row, no
V0/V1/V2, no app, build, model, audio, display, input, network, database or port
7717. The only executions are the card's own codec over the card text and
synthetic `printf` fixtures. Scratch: the ignored `build/p34-static-ir/`.

## Files

| File | What it proves |
| --- | --- |
| `01-independent-decode.txt` | An independent parse of the card's V3/V4 cells through `parseCard`/`parseCells`, one backtick stripped each end: V3 626→624 B, sha `94dd6995…`; V4 273→271 B; no residual backtick. Matches the proposal evidence byte for byte. |
| `02-negative-control.txt` | The wrapper still passes `bash -n` (exit 0) but runs to exit 127 with `P3.4-V3:: command not found`; the structural guard fires on it and the plain body runs clean. The attempt-6 symptom, reproduced synthetically. |
| `03-identity-and-boundary.txt` | Corrected-cell sha, harness sha `cc733cd0…`, card sha, HEAD movement, `git status`, scratch ignore and the write boundary. |

## One-line result

The proposal is technically accurate and lawfully scoped: two static rows only
(V3 once, correctly decoded; V4 once, the whole `&&` cell, after the P3.5
artifact lint is independently CLEAR), an explicit owner override of AM-195's
row-retry clause for those two rows, prior `BLOCKED`/`FAIL` snapshots retained,
V0 kept a conditional `NOT RUN` and never converted to `PASS`, and no
source/card/checkpoint change. Verdict **CLEAR**.

## Reproduce

```
node build/p34-static-ir/decode-verify.mjs
bash -n build/p34-static-ir/wrapper.raw.txt && bash build/p34-static-ir/wrapper.raw.txt; echo $?
```

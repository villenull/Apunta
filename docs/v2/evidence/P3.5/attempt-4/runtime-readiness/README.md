# P3.5 attempt-4 runtime readiness — evidence

Read-only preparation for the once-only attempt-4 runtime of `P3.5` under owner
**AM-194**. Companion report:
`docs/v2/state/reviews/P3.5-runtime4-readiness.md`.

**Nothing here is an acceptance, a row result, a source review or a card
attempt.** No build, app, server, database, model, audio, microphone, `pactl`,
display, input, network, install or port 7717 was used. The dispatcher was
exercised with `--print` only and wrote no file.

Owned by this readiness pass alone:
`docs/v2/state/reviews/P3.5-runtime4-readiness.md` and this folder. The sibling
`attempt-4/source-review/**` belongs to the attempt-4 source-review worker and
is untouched.

| File | What |
| --- | --- |
| `state-snapshot.txt` | HEAD, tree state, checkpoint shape, scanner/voice presence, ports, build-lease observation. |
| `commands.md` | Every command run, with exit status; what was deliberately not run; the shared-parent deletion incident. |
| `synthetic-checks.txt` | Row extraction through `parseCells`, `bash -n` × 6, `node --check` × 3, dispatcher `--print` accept/refuse cases, checkpoint provenance counts, AM-194 byte identity. |
| `row-cells/V*.command.txt`, `row-cells/V*.expected.txt` | The six parsed card cells verbatim, so the runtime worker runs the card's own bytes rather than a transcription of them. |
| `v5-provenance.unescaped.txt` | The V5 `node -e` program exactly as the shell receives it after Markdown unescaping. A textual witness only — it was never run against real state. |
| `dispatch-attempt4.preview-head.txt` | The authority header of the attempt-4 dispatch, as `--print` produced it. |

## Findings at a glance

- Order is the card's: **V0 → V1 → V2 (the single flagged rebuild) → the AM-190
  four separate dry AppDir inspections → V3 → V4 tone 7837 / silence 7839 →
  root's three-record append → V5**. Each capture mode exactly once.
- Parsing: `plan-lib.mjs`'s `parseCells` gives each row three cells, hands the
  shell **bare** pipes (V0 4, V1 1, V5 38 — V5's are inside the quoted program),
  and no Markdown backslash survives; `bash -n` is clean on all six. The
  `` ` | exit 0 `` at the end of V0–V4 is the **Expected cell's** prose opening,
  not a shell pipe — the cell boundary is correct.
- V5 selects `attempt === N` from the live checkpoint: it will print that it
  ignores **7** earlier records (5 attempt-1, 2 attempt-3) and require exactly
  three at attempt 4 in creation order. Residue checks are exact-token `awk`.
- Checkpoint is `attempt 4`, `IN PROGRESS`, all six rows `NOT RUN`, **0 records at
  attempt 4**. `priorAttempt1Criteria` and `priorAttempt3Criteria` are present
  and untouched.
- AM-194 bytes are the shipping bytes: harness blob `c67b9f49…`, sha256
  `85fbb13d…924c14`, one file, +7/−2 against `5857079^`.
- `--print` regeneration is accepted at attempt 4 with `--attempt-exception
  AM-194`, refused without it, and attempt 5 is refused for P3.5.
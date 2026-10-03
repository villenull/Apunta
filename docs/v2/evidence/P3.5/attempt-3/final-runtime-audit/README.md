# P3.5 final runtime audit — evidence index

- Date: 2026-10-03
- Scope: read-only audit of attempt-3 final runtime continuation
- Report: `docs/v2/state/reviews/P3.5-final-runtime-audit.md`

## What was verified

1. Checkpoint comparison: 231b41b vs HEAD — `priorAttempt1Criteria` unchanged, +2 records/+2 anchors, original 5 preserved
2. Source classification defect: disassembly of `/usr/bin/pactl` confirms `-` is in the client column (column 3), not the sink column as the evidence prose states
3. Criteria statuses: V0/V1/V2 PASS, V3 BLOCKED, V4 BLOCKED/NOT RUN, V5 FAIL — all match evidence
4. Mode invocation count: V3=1, V4=1 (tone only), V5=1 — no repeats
5. Tone failure prevents silence: `&&` chain stopped, port 7839 never bound
6. Provenance: 5 attempt-1 + 2 attempt-3 before V5, no sorting/deletion
7. Cleanup: default restored, modules unloaded, no streams, no listeners, own pids only
8. Cached voice: no download, no new acquisition
9. whisper_model_missing 500: expected for capture-only card
10. Source untouched: runtime wrote only checkpoint, evidence, return

## Verdict

Card: BLOCKED — does not pass
Evidence: CLEAR — one factual correction needed (client column vs sink column in evidence prose)

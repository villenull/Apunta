# P3.5 final runtime audit — qualification evidence

- Date: 2026-10-03
- Report: `docs/v2/state/reviews/P3.5-final-runtime-audit-qualification.md`
- Qualifies, unedited: `docs/v2/state/reviews/P3.5-final-runtime-audit.md`

Read-only and local only. No runtime, no `pactl` run, no build, no source edit.

## Files

- `column-format-recheck.txt` — independent static re-inspection of the local
  `/usr/bin/pactl`, confirming source-outputs column 3 (zero-based) is the
  driver.
- `attachment-guard-analysis.txt` — frozen-log trace showing the virtual-default
  guard proves only the default, not device attachment.

## Corrections, one line each

1. source-outputs column 4 (zero-based 3) is the **driver**, not a sink name.
2. The virtual-default guard does not prove device attachment; the attached node
   is unknown (physical-mic use is not claimed either).

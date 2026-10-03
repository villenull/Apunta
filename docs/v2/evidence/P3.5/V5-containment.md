# P3.5 — V5, containment checked from outside

- Working directory: repository root
- Started: 2026-10-03T03:25:11Z · Ended: 2026-10-03T03:25:11Z
- Exit code: 1
- Status: **FAIL**, on the provenance half only. Every residue check passes.

## Exact command

The card's V5 command, run verbatim from the card text (the long
`sandbox.mjs`-free command: the `pactl` reads, the checkpoint `node -e` predicate
and the residue loops). No part of it was edited, shortened or re-ordered.

## Exact output

```
V5 default source: alsa_input.usb-UGREEN_Camera_2K_UGREEN_Camera_2K_SN0001-02.analog-stereo
FAIL: two sandboxRuns entries at attempt 1 carry step V3; which of them ran the capture is ambiguous
V5 lines in pactl list short sources holding an exact task name: 0
V5 lines in pactl list short sinks holding an exact task name: 0
V5 loaded module-null-sink modules holding an exact task name: 0
V5 loaded module-remap-source modules holding an exact task name: 0
V5 bad=1
```

## What passed, and what did not

| Check | Result |
| --- | --- |
| `pactl get-default-source` printed one line, unpadded, free of this run's names | pass — `alsa_input.usb-UGREEN_Camera_2K_UGREEN_Camera_2K_SN0001-02.analog-stereo` |
| the default source is **not** `apunta_p35_mic` | pass |
| lines in `pactl list short sources` holding an exact task name | **0** |
| lines in `pactl list short sinks` holding an exact task name | **0** |
| loaded `module-null-sink` modules holding an exact task name | **0** |
| loaded `module-remap-source` modules holding an exact task name | **0** |
| the checkpoint's baseline predicate: exactly one `sandboxRuns` entry per step at attempt 1, in the order `V3`, `V4-tone`, `V4-silence` | **FAIL** |

The containment claim this row exists for — *the virtual source is gone and the
owner's microphone is the default capture device again* — is **true**, decided
from outside with `pactl` and not from the harness's own bookkeeping.

## Why the provenance half fails

Attempt 1 has **five** `PREV_DEFAULT` records, all for step `V3`, because the
harness needed five invocations to reach the record click (see
`V3-capture-spoken.md` for what each one was). The predicate's first complaint is
the ambiguity itself:

```
FAIL: two sandboxRuns entries at attempt 1 carry step V3; which of them ran the capture is ambiguous
```

This is the card's designed fail-closed behaviour for a re-run capture inside one
attempt, and it was left standing: no record was merged away, no entry deleted, no
attempt number edited, and no assertion relaxed to accommodate it. All five
records remain in `docs/v2/state/cards/P3.5.json` in both `sideEffectsDone` and
`sandboxRuns`, in creation order, each with the run folder's own `runId` and
`dateUtc`. V4's two cases were never run, so `V4-tone` and `V4-silence` have no
entry at all — which is a second, independent reason the baseline cannot be
verified.

Resolving this is the coordinator's call: a fresh implementation attempt (the card
allows three) would put the three capture records at a new `attempt` number, which
the predicate selects on, and the earlier-attempt history would be excluded by an
explicit attempt selection and counted in the output — exactly as the card
prescribes.

## The legacy Expected-cell `grep -c` witnesses

The card's Expected cell still quotes the older literal counts. They were run as
well, separately, and recorded here because the row's own prose counts exact
tokens rather than substrings:

```
$ pactl list short sources | grep -c apunta_p35   -> 0
$ pactl list short sinks   | grep -c apunta_p35   -> 0
```

Both are **0**, so the legacy counts are satisfied on their own terms and nothing
is waived: a non-zero value on either would have been a `FAIL` and a stop, and
neither is claimed as passed by anything but this reading.

## No Expected cell was edited

No cell of the card's Verification table was changed, and no threshold in
`docs/v2/CONTRACTS.md` was touched. The `Server Name` and `*` discrepancies
recorded in `V0-host-and-build.md` and the cargo-`PATH` retry recorded in
`V2-test-build.md` are disclosed in place, not reconciled by editing the card.
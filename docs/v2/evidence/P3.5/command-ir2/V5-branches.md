# P3.5 V5 command — independent review 2, branch transcripts (synthetic only)

Fake `pactl`, fake `docs/v2/state/cards/P3.5.json`, scratch `build/p35v5-ir2/` (git-ignored, removed after the review). The replayed command is the V5 cell extracted programmatically from `docs/v2/cards/P3.5.md` with `parseCard`/`parseCells` (`docs/v2/tools/plan-lib.mjs`), backticks trimmed; nothing retyped. Fake device name `alsa_input.usb-UGREEN_Camera_2K` mirrors the card's own illustrative name and is synthetic. No real `pactl` mutation, no app, server, model, microphone, audio or PipeWire action, no download, no live data, port 7717 never contacted.

## A. The clean branch — A0, exit 0

```
V5 default source: alsa_input.usb-UGREEN_Camera_2K
V5 recorded PREV_DEFAULT: alsa_input.usb-UGREEN_Camera_2K
V5 current default source: alsa_input.usb-UGREEN_Camera_2K
V5 lines in pactl list short sources holding an exact task name: 0
V5 lines in pactl list short sinks holding an exact task name: 0
V5 loaded module-null-sink modules holding an exact task name: 0
V5 loaded module-remap-source modules holding an exact task name: 0
V5 bad=0
ROW EXIT=0
```

## C. DEFECT — residue verdict depends on enumeration order

Source leak on the **first** line, unrelated sources after it (expect FAIL):

```
A0     exit=0  V5 bad=0
```

Source leak on the **last** line, unrelated sources before it (the shipped awk detects this one):

```
A0     exit=1  FAIL: pactl list short sources still names this run's sink or source
```

`module-null-sink sink_name=apunta_p35` loaded **first**, an unrelated null sink after it (expect FAIL):

```
A0     exit=0  V5 bad=0
```

## DEFECT — a stale complete baseline set passes, exit 0

Checkpoint \`attempt: 2\`; three records written by an earlier attempt (\`old-run-0/1/2\`, \`dateUtc\` 2026-09-01); the recorded value happens to equal the current default.

```
V5 default source: alsa_input.usb-UGREEN_Camera_2K
V5 recorded PREV_DEFAULT: alsa_input.usb-UGREEN_Camera_2K
V5 current default source: alsa_input.usb-UGREEN_Camera_2K
V5 lines in pactl list short sources holding an exact task name: 0
V5 lines in pactl list short sinks holding an exact task name: 0
V5 loaded module-null-sink modules holding an exact task name: 0
V5 loaded module-remap-source modules holding an exact task name: 0
V5 bad=0
ROW EXIT=0
```

## D. The one-token fix, measured (no card edit)

Shipped `awk`: `{c=0; ... } END {print c+0}` — `c` is reset on every record, so the
printed number describes the **last** line only. Proposed: initialise `c=0` in
`BEGIN`, accumulate across records, never reset.

```
shipped (c reset per record):
  fixtures/sources               0
  fixtures/sources-leak-first    0     <- leak missed
  fixtures/sources-leak-middle   0     <- leak missed
  fixtures/sources-leak-last     1
  fixtures/sources-empty         0
  fixtures/sources-unrelated     0
proposed (accumulate across records, reset only in BEGIN):
  fixtures/sources               0
  fixtures/sources-leak-first    1
  fixtures/sources-leak-middle   1
  fixtures/sources-leak-last     1
  fixtures/sources-empty         0
  fixtures/sources-unrelated     0
module token set, shipped vs proposed:
  fixtures/modules               shipped=0 proposed=0
  fixtures/modules-leak-first    shipped=0 proposed=1
  fixtures/modules-leak-last     shipped=1 proposed=1
  fixtures/modules-empty         shipped=0 proposed=0
  fixtures/modules-unrelated     shipped=0 proposed=0
```

No new false positive: the legitimately empty listings and the unrelated
`other_apunta_p35_helper` names stay `0`.

## E. The attempt-bound record, prototyped (no card edit)

The shipped predicates plus three minimal bindings — `attempt` equal to the
checkpoint's own `attempt`, records in creation order, and each `runId` equal to
the `APUNTA_TEST_RUN_ID` its own capture row's env file carries:

```
PASS  A0  clean set, checkpoint attempt 2, live matches
FAIL  A18 stale complete set written by attempt 1
FAIL  A18b stale set whose records carry no attempt field
FAIL  A19 the same three records in a permuted order
FAIL  A20 checkpoint attempt 0 (NOT STARTED, no implementation)
PASS  A23 clean set, runIds cross-checked against the three env files (agree)
FAIL  A24 clean set, one env file disagrees
FAIL  A25 clean set, live default is some other virtual source
```

# D1 — `pactl list short source-outputs` numeric mapping: adversarial probes

Script: `d1-numeric-mapping.mjs` (durable copy) · output: `d1-output.txt` ·
**30/30 passed, exit 0**.

Every call runs the candidate's own `parseSourceTable`, `classifySourceOutputs`
and `classifyPactlReads`, extracted verbatim from
`scripts/v2/tauri-audio.test.mjs`; the constants `SOURCE_NAME` and
`REAL_MIC_PREFIX` are read from that same file, never retyped.

## Ground truth the fixtures are built from (read-only)

```
$ pactl --version            → pactl 17.0-98-gb096
$ pactl list short sources   → four rows, 7 columns each, column 0 = 60/61/62/63
$ pactl list short source-outputs → empty (no stream on this host right now)
```

So column `[0]` is the index, column `[1]` the name, and the description follows
in the remaining words — which is exactly the shape `parseSourceTable` reads.
The repair's claim about the source-outputs short format (`%u\t%u\t%s\t%s\t%s`,
column `[1]` the source index, column `[2]` a numeric client index) is the one
review-1 established from the `pactl` binary and is consistent with the live
block now reading both tables.

## The defect review-1 raised, in both directions

| Probe | Result |
| --- | --- |
| A stream whose real source is the microphone (index 61) whose **client** index is 63 — a different, harmless source | `realMic = 1`, resolved name `alsa_input.usb-UGREEN_…`. A raw-column comparison would have read `63` and called it safe. |
| The resolved leak row keeps its identity | `sourceId = 61`, `clientId = 63` |
| A microphone-shaped **client** index on a stream that is really the virtual source | `realMic = 0`, `virtual = 1` — no false alarm from the client column either |

The physical UGREEN microphone is therefore detected **by its resolved name**,
not by a client id. That was the safety-critical false negative.

## Ordinary cases

virtual only (`1/0/0`), virtual + physical leak (`1/1`), real-only (`0/1`),
an unrelated mapped source reported separately (`u=1, r=1, v=0`), an empty
source-outputs read (`all=0` — which the live block turns into a FAIL on the
virtual assertion, not a pass), and two streams on the virtual source (both
kept, `v=2`).

## Fail-closed, not "unknown → safe"

Each of these throws, and the live block turns the throw into `BLOCKED` + return
into the `finally` that stops the shell by pid and runs
`containment.teardown()` (restore default source, then unload source and sink):

| Probe | Error |
| --- | --- |
| source-output naming source index 99 (stale/unknown) | `source-output 7 names source index 99, which is not in the pactl sources table; …` |
| source-output naming index 0, absent from the table | same class of throw |
| duplicate source index in the table | `duplicate source index 61 in pactl sources` |
| table row with one column | `malformed pactl sources row: "64"` |
| source-outputs row with two columns | `malformed pactl source-outputs row: "7\t61"` |
| non-numeric column | `non-numeric source-outputs column` |
| non-numeric / fractional table index | `non-numeric source index in pactl sources` |
| source-outputs command exits 1 | `pactl list short source-outputs exited 1: …` |
| sources command exits 1, outputs read fine | `pactl list short sources exited 1: …` |
| `pactl` killed (`code: null`) | `pactl list short source-outputs exited null: …` |
| both reads exit 0 but the table is empty while a stream exists | not in the table → throws |

Two further probes assert the *live wiring* on the candidate's own text: the
containment block calls `pactl(['list','short','source-outputs'])` **and**
`pactl(['list','short','sources'])`, hands both to
`classifyPactlReads(outputsRead, sourcesRead)`, reports `BLOCKED` with
"containment is unknown" on a throw, and that path `return`s into the `finally`
carrying `stopPid(run.child.pid, …)` and `await containment.teardown()`. There is
no other `source-outputs` read left in the file, and no raw-column comparison
anywhere in it.

## `Number()` edge shapes — recorded, not invented as criteria

`pactl list short sources` prints its index with `%u` and separates fields with
tabs, so these shapes cannot be produced by pactl 17. What the shipped code does
with them is recorded so the report states facts rather than wishes:

- `0x10 …` → read as index `16` (hex is accepted by `Number`);
- `-1 …` → accepted as key `-1`;
- a whitespace-only column collapses under `split(/\s+/)`, so the row is read
  with shifted columns — it still stops, because the shifted value is not in the
  table;
- a source name containing a space truncates at the first space. That can only
  under-match the virtual test (a FAIL) or over-match the microphone prefix (a
  stop): never the unsafe direction. Both probes confirm it.

None of these is reachable from the format the card's own row reads, and none is
counted as a defect.
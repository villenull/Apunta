# D2 — current `data-testid` rectangles: adversarial probes

Script: `d2-current-rectangles.mjs` (durable copy) · output: `d2-output.txt` ·
**22/22 passed, exit 0**. One line in the output is the shipped `fail()`
reporting the deliberate timeout probe.

Every call runs the candidate's own `tidsFromNewestMarker`, `readReported`,
`rectOf`, `latestMarker` and `waitForPublished`, extracted verbatim from
`scripts/v2/tauri-audio.test.mjs`. Fixtures are fabricated shell stderr in the
wrapper `main.rs:321` actually emits —
`apunta: ignoring a bridge line (<Rejection>: <url>?<query>")` — with the query
the app's own hook builds (`web/src/main.tsx:124-128` sets `x`, `y`, `w`, `h`,
in that order, for a present element or not at all).

## What holds

| Probe | Result |
| --- | --- |
| complete newest marker | rectangle installed |
| no markers | nothing installed |
| newer marker omits the element | the rectangle is **gone** (`home-search` only) — review-1's defect, fixed |
| truncated newer marker (`_x`,`_y` only) | installs nothing, no merge with the older rectangle |
| `NaN`, `Infinity`, zero width, negative width, zero height | installs nothing |
| dashed id `home-action-note` | installs |
| id containing an underscore (`a_b`) | installs as `a_b`: field = last `_`-segment, id = the rest (the old `key.split('_')` did not do this) |
| `readReported` over three markers | newest is last; `record-start` dropped by it is absent; `home-search` still present |
| `readReported` with a **truncated newest** marker line | the truncated line *is* pushed as a marker (`markers=2`), it wins, and `tids` is empty — no fallback to the older complete marker |
| `rectOf` on that state | `null`, so the click cannot be aimed at a stale target |
| P3.4's text-leaf seam, same stderr | `Stop and create draft` still read from the `/api/p3.4-observe` line, and it coexists with the own rectangles |
| first read of the click path | `home-search` resolves to `cx=560, cy=320` |
| after the click, when the element leaves the screen | `before=140`, `after=null` |
| `waitForPublished`, target published 300 ms late | resolves `cx=560, cy=320` |
| `waitForPublished`, target never published | returns `null` after the timeout (the shipped `fail()` records it); exit code restored by the probe |

The last four are the integration, not the helper: the same functions the click
path uses, over the same stderr, with `waitForPublished` awaited.

## The one shape that does not fail closed

`Number(null) === 0`, and `0` is finite, so a newest marker that carries
`_y`, `_w`, `_h` but **not** `_x` installs a rectangle at `x = 0`; the same
happens for empty coordinate values (`tid_record-start_x=`). Both are recorded
as PASS-shaped observations because they reproduce:

```
D2 ADVERSARIAL: a newest marker missing only `_x` installs a rectangle at x=0
  → {"x":0,"y":222,"w":80,"h":40}
D2 ADVERSARIAL: empty coordinate values read as 0 and install a rectangle at the origin
  → {"x":0,"y":0,"w":80,"h":40}
```

Reachability: `web/src/main.tsx:124-128` sets `x` first and writes all four
values from `String(Math.round(…))`, so a truncated query drops the **tail**
(`h`, then `w`), and a dropped `w`/`h` is rejected by the positivity check. The
shape above therefore cannot arise from this emitter. What it does contradict is
the invariant the code and the repair report state — *"a test id is installed
only when that one marker carries all four of `x`, `y`, `w`, `h`"*. Recorded as
defect D2-1 in the review, with its one-line fix.

## D4, as the repair left it

One sample, resolved correctly, taken before the no-real-microphone assertion,
which is what `docs/v2/cards/P3.5.md:476-481` licenses ("the `source-outputs`
read narrows the window, it does not close it"). No continuous claim was added
and no acceptance was relaxed.
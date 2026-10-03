# P3.5 V5 command — independent review 3: branch evidence

Synthetic only. No real `pactl`, no app, no model, no audio, no microphone, no
PipeWire/Pulse mutation, no build, no network, no port 7717, no live data. The
real checkpoint `docs/v2/state/cards/P3.5.json` was **never written** — read
once, still `attempt: 0`, `sandboxRuns: []`, `sideEffectsDone: []`. Every
baseline ran against a synthetic copy in a scratch working directory under the
git-ignored `build/` (`git check-ignore -v build` → `.gitignore:55`).

## A. What was executed, and how it was extracted

The command was extracted with the card's own parser — `plan-lib.parseCard`
reading `docs/v2/cards/P3.5.md` at `de94da0` (identical to the working tree,
sha256 `04782f61…`), taking the V5 row's command cell and decoding it with
`parseCells`, with the row's single surrounding backtick pair removed. Nothing
was hand-transcribed.

```
build/p3.5-ir3/extracted-v5.sh    8451 bytes
```

Three earlier revisions of the same row were extracted the same way for
comparison: repair 2 (`de94da0~1`, `old-v5.sh`, 5218 bytes) and the pre-audio
baseline `7220507` (`base-v5.sh`, 1283 bytes).

`pactl` was a **copied fake** written for this review
(`build/p3.5-ir3/fakebin/pactl`), reading only files under `$FAKE_PACTL_DIR`,
with a per-read exit-code file. It is a copy, not a symlink; the real
`/usr/bin/pactl` was never executed at any point, for any read. The runner
refuses to start unless `command -v pactl` inside the row's environment
resolves inside `build/p3.5-ir3/fakebin`:

```
resolved pactl inside the row environment: /home/villenull/Projects/Apunta/build/p3.5-ir3/fakebin/pactl
```

The node the row pins resolves normally
(`$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin`); the gate branch
in §E points `HOME` at an empty directory instead.

## B. Byte-level scope, measured

```
git diff --numstat de94da0~1 de94da0 -- docs/v2/cards/P3.5.md   ->  59 added, 16 removed
hunks in that diff                                            ->  2
```

Both revisions parsed with `plan-lib.parseCard`; same seven top-level fields,
same key order, none changed; same section list and order.

| Row | cells | command identical to `de94da0~1` | Expected identical to `de94da0~1` |
| --- | --- | --- | --- |
| V0, V1, V2, V3, V4 | 3 | yes | yes |
| V5 | 3 | **no — the intended rewrite** | **yes** |

Codec, on both revisions, every row: `parseCells(escapeCell(cell)) === cell`
for all three cells of all six rows. The decoded V5 command carries 0 escaped
pipes, 38 pipes of which **0** are outside a `||` pair (19 `||` pairs, all of
them the node block's own logical-or), and 0 surviving BRE alternations.
`bash -n` on the decoded command: syntax OK.

```
node --test docs/v2/tools/plan-lib.test.mjs        -> pass 9, fail 0
node docs/v2/tools/check-plan.mjs --no-write       -> "Plan consistent: 71 cards …" exit 0
```

The residue section compared against repair 2 byte for byte: the shell prefix
(all four reads, their exit-code guards, the `grep -qF -e apunta_p35` on the
default source) is **byte-identical**, and the only differences in the tail are
the two `c=0` moves — one in each `awk`, nothing else in the two `grep`s, the
`echo` labels, the `test "$n" = 0`, the `head -n 5` or the `bad=1` lines:

```
old: BEGIN {t=split(toks,A,",")}      {c=0; for (i=1
new: BEGIN {t=split(toks,A,","); c=0} {for (i=1
```

## C. Branch results — 89 branches, 77 `1`, 12 `0`

`pactl get-default-source` prints `alsa_input.usb-UGREEN_Camera_2K_Pro_USB_Microphone`
(the synthetic host default, matching the prototype's sample device naming, HS-8).

### C1 — residue, every ordering, both module types (IR-03)

| Fixture | exit | correct |
| --- | --- | --- |
| clean, with `module-null-sink sink_name=other_sink` and `module-remap-source source_name=other_mic master=other_sink.monitor` loaded | **0** | yes |
| `apunta_p35_mic` in **sources**, first / middle / last line | **1 / 1 / 1** | yes |
| `apunta_p35` in **sinks**, first / middle / last line | **1 / 1 / 1** | yes |
| `module-null-sink sink_name=apunta_p35 …`, first / middle / last | **1 / 1 / 1** | yes |
| `module-remap-source source_name=apunta_p35_mic master=apunta_p35.monitor …`, first / middle / last | **1 / 1 / 1** | yes |
| unrelated names *containing* the substring (`other_apunta_p35_helper`, `source_name=apunta_p35_mic_backup`, `sink_name=other_apunta_p35_helper`, `apunta_p35_mono`) | **0** | yes (token equality, not substring) |
| every listing empty | **0** | yes (IR-04's ruling) |
| sources listing holding only `apunta_p35.monitor`, no module line loaded | **0** | see §D3 — unreachable host state |
| the same monitor node **with** its remap module loaded | **1** | yes |

The same fixtures against the two earlier revisions of this row:

| Fixture | `7220507` (`grep -c`) | repair 2 (last-line `awk`) | repair 3 |
| --- | --- | --- | --- |
| clean | 0 | 0 | 0 |
| sources leak **first** | **1** | **0** | **1** |
| sources leak **middle** | **1** | **0** | **1** |
| sinks leak **first** | **1** | **0** | **1** |
| `module-null-sink` leak first | **1** | **0** | **1** |
| substring near-miss | **1** (false FAIL) | 0 | 0 |

So repair 3 restores `7220507`'s order-independence without reintroducing its
substring false-`FAIL`. Both earlier defects are reproduced on these fixtures,
not taken on report.

### C2 — the four reads, and the default-source shape

| Branch | exit |
| --- | --- |
| each of the four reads exiting non-zero (default / sources / sinks / modules) | **1 / 1 / 1 / 1** |
| `pactl list short modules` exiting non-zero **and** printing a leak | **1** (both messages) |
| default empty / two lines / padded / trailing blank line | **1 / 1 / 1 / 1** |
| default is this run's own `apunta_p35_mic` | **1** (both the `grep -qF` message and the node block's) |
| default is `some_other_virtual_source` | **1** |
| default drifted from the recorded `prevDefault` | **1** |
| `pactl` **absent** from `PATH` | **1** (all four read guards fire) |
| `awk` **absent** from `PATH` | **1** (`n` empty → `test "$n" = 0` false → every residue check fails) |

A missing instrument never reads as a clean host, in either direction.

### C3 — the baseline, attempt-bound and run-bound (IR-05)

All of these exit **1**: checkpoint missing; JSON unparseable; `attempt` `0`,
`"2"`, `2.5` or absent; `sideEffectsDone` not an array; `sandboxRuns` not an
array; `sandboxRuns` absent; a prose entry naming `PREV_DEFAULT`; no records at
attempt N; records carrying attempt `1` while the checkpoint says `2`; records
with no `attempt`, with `attempt: 0`, with `attempt: 2.5`; a record `runId` that
names no capture run; two records' `runId`s swapped between steps; an empty
record `runId`; a run entry with no `attempt`, with an empty `runId`, with no
`runId`, with no `dateUtc`; only two of the three steps named in `sandboxRuns`;
the third step named at another attempt; two run entries at attempt N sharing a
`step`; two run entries at attempt N sharing a `runId`; a fourth run entry at
attempt N; a run entry at attempt N with an unrecognised step; a fourth record
at attempt N; records in permuted order (`V4-silence`, `V3`, `V4-tone`); a
record with no `dateUtc`; a record `dateUtc` newer than its own anchor's; older;
differing per record; an unrecognised record step; a repeated record `runId`;
`prevDefault` empty, padded, two-line, its own name, or not a string; the three
records disagreeing; a missing `sinkId`; a missing `srcId`; and the pre-repair
three-record shape with no `attempt` anywhere.

The three intended passes:

| Fixture | exit | note |
| --- | --- | --- |
| exact-restored clean pass, and its idempotent repeat | **0** | the live default equals the recorded `prevDefault`, verbatim |
| unrelated entries only — a prose note, a P3.3-shaped object, a prose `sandboxRuns` run string — alongside a good set | **0** | ignored, not rejected |
| attempt-1 history (3 records + 3 anchors) **plus** a well-formed attempt-2 set | **0**, and it prints `V5 ignoring 3 PREV_DEFAULT record(s) from earlier attempts; …` | history preserved and excluded, not deleted |
| attempt-1 as the checkpoint's own current attempt, fully well-formed | **0** | the anchor is the checkpoint's own value |
| attempt-1 history plus a **live** source leak | **1** | history never excuses a leak |

### C4 — transcripts

**The exact-restored clean pass.**

```
V5 default source: alsa_input.usb-UGREEN_Camera_2K_Pro_USB_Microphone
V5 attempt 2: baseline records tied to the sandboxRuns entries for V3, V4-tone and V4-silence
V5 recorded PREV_DEFAULT: alsa_input.usb-UGREEN_Camera_2K_Pro_USB_Microphone
V5 current default source: alsa_input.usb-UGREEN_Camera_2K_Pro_USB_Microphone
V5 lines in pactl list short sources holding an exact task name: 0
V5 lines in pactl list short sinks holding an exact task name: 0
V5 loaded module-null-sink modules holding an exact task name: 0
V5 loaded module-remap-source modules holding an exact task name: 0
V5 bad=0
```

**A leak on the first source line.**

```
V5 lines in pactl list short sources holding an exact task name: 1
FAIL: pactl list short sources still names this run's sink or source
apunta_p35_mic
alsa_input.usb-UGREEN_Camera_2K_Pro_USB_Microphone
alsa_output.pci-0000_00_1f.3.analog-stereo
...
V5 bad=1
```

**A leak on a middle module line.**

```
V5 loaded module-remap-source modules holding an exact task name: 1
FAIL: a module-remap-source module with this run's arguments is still loaded:
module-remap-source source_name=apunta_p35_mic master=apunta_p35.monitor source_properties=device.description=Apunta
module-remap-source source_name=other_mic master=other_sink.monitor source_properties=device.description=Other
V5 bad=1
```

**The stale complete attempt-1 set, the exact IR-05 blocker.**

```
V5 default source: alsa_input.usb-UGREEN_Camera_2K_Pro_USB_Microphone
FAIL: no sandboxRuns entry names step V3 at attempt 2; a PREV_DEFAULT record with no matching capture run cannot be identified, so the baseline is unverifiable
V5 bad=1
```

**Records stamped at an earlier attempt.**

```
V5 ignoring 3 PREV_DEFAULT record(s) from earlier attempts; earlier history is kept, not deleted, and is excluded by the attempt 2 selection
FAIL: no PREV_DEFAULT record in sideEffectsDone for attempt 2; the original default source is unknown, so the restore is undecidable
V5 bad=1
```

**Records out of creation order.**

```
FAIL: the PREV_DEFAULT record at index 0 is step V4-silence where creation order is V3, V4-tone, V4-silence; the value V5 compares against is the one the final teardown was required to re-apply, so ordering is part of the claim
V5 bad=1
```

**History preserved and excluded, no leak.**

```
V5 ignoring 3 PREV_DEFAULT record(s) from earlier attempts; earlier history is kept, not deleted, and is excluded by the attempt 2 selection
V5 attempt 2: baseline records tied to the sandboxRuns entries for V3, V4-tone and V4-silence
V5 recorded PREV_DEFAULT: alsa_input.usb-UGREEN_Camera_2K_Pro_USB_Microphone
V5 current default source: alsa_input.usb-UGREEN_Camera_2K_Pro_USB_Microphone
V5 bad=0
```

**History preserved, plus a live leak — the residue checks are not attempt-scoped.**

```
V5 ignoring 3 PREV_DEFAULT record(s) from earlier attempts; …
V5 attempt 2: baseline records tied to the sandboxRuns entries …
V5 lines in pactl list short sources holding an exact task name: 1
FAIL: pactl list short sources still names this run's sink or source
apunta_p35_mic
…
V5 bad=1
```

**`awk` absent.**

```
V5 default source: alsa_input.usb-UGREEN_Camera_2K_Pro_USB_Microphone
V5 attempt 2: baseline records tied to the sandboxRuns entries …
extracted-v5.sh: line 1: awk: command not found
V5 lines in pactl list short sources holding an exact task name:
FAIL: pactl list short sources still names this run's sink or source
…
V5 bad=1
```

**`pactl` absent.**

```
extracted-v5.sh: line 1: pactl: command not found
FAIL: pactl get-default-source exited nonzero
FAIL: pactl get-default-source printed nothing
FAIL: pactl list short sources exited nonzero
FAIL: pactl list short sinks exited nonzero
FAIL: pactl list short modules exited nonzero
V5 default source:
FAIL: pactl get-default-source printed nothing, so the current default source is unknown
V5 bad=1
```

## D. Notes measured, not defects

1. **The self-match residual the author discloses.** A checkpoint whose own
   `sandboxRuns` entries at attempt N are stale, or whose `runId`s are arbitrary
   but consistent between the record and the anchor, passes: exit **0**. I
   reproduced it in two forms (foreign ids re-stamped consistently; arbitrary
   strings used as both `runId` and `dateUtc`). This is the coordinator-
   maintained anchor the coordinator chose, and the row makes no claim that it
   is self-authenticating. Recorded, not counted against the row.
2. **`runId` shape is not checked, only consistency.** `runId: " b72ab858"` on
   both the record and the anchor passes (exit **0**). Same boundary as D1; a
   value like that cannot come from `sandbox.mjs env`.
3. **The sources witness does not token-match `apunta_p35.monitor`.** The
   sources/sinks token set is `apunta_p35,apunta_p35_mic` while the module set
   also carries `master=apunta_p35.monitor`. A listing holding only
   `apunta_p35.monitor` therefore exits **0** — but a remap source's monitor node
   exists only while its module is loaded, and that branch exits **1** on the
   same host (measured). Not reachable as a pass.
4. **The live-default and contaminated-`prevDefault` checks are substring
   based**, so a host device whose name merely contains `apunta_p35` is a
   false `FAIL` (measured, exit **1**). Conservative polarity; unchanged by
   this repair.

## E. Pinned-node gate

`HOME` pointed at an empty directory, so the pinned node path the row exports
does not exist and no other `node` is on `PATH`:

```
extracted-v5.sh: line 1: node: command not found
exit 1 — the body never ran: no $b was created, no pactl read happened
```

The `{ … }` group is what makes the `&&` chain gate the body, and it holds.
# D1 — `pactl list short source-outputs` column mapping

## The shipped predicate

`scripts/v2/tauri-audio.test.mjs:1298-1300`:

```js
const streamLines = sourceOutputs.split('\n').filter((line) => line.trim() !== '');
const onVirtual = streamLines.filter((line) => line.split(/\s+/)[2] === SOURCE_NAME);
const onRealMic = streamLines.filter((line) => (line.split(/\s+/)[2] ?? '').startsWith(REAL_MIC_PREFIX));
```

with `SOURCE_NAME = 'apunta_p35_mic'` and
`REAL_MIC_PREFIX = 'alsa_input.usb-UGREEN'` (`:68`, `:71`).

## Ground truth: the host's own `pactl`

- `/usr/bin/pactl` is `libpulse 17.0+r98+gb096704c0-1`
  (`pacman -Qo /usr/bin/pactl`, exit 0).
- The short text format string for source outputs is at `.rodata` `0x11763`:
  `%u\t%u\t%s\t%s\t%s\n`.
- `objdump -d /usr/bin/pactl` shows two references to it: `0xafdd`
  (`get_sink_input_info_callback`) and `0xb9cd`
  (`get_source_output_info_callback`). At `0xb9cd` the arguments are:
  - `%u` ← `*(u32*)(info+0x00)` — source-output index;
  - `%u` ← `*(u32*)(info+0x18)` — **source index** (numeric);
  - `%s` ← a buffer built by
    `pa_snprintf(buf, 0x20, "%u", *(u32*)(info+0x14))` — the **client index**,
    printed as a decimal number (`"%u"` is at `.rodata` `0x114dd`);
  - `%s` ← a pointer at `info+0xc8` (`"(null)"` when unset);
  - `%s` ← the sample specification.

So column `[2]` is a client index such as `167`. It is never a source name.

## Synthetic reproduction

`source-outputs-mapping.mjs` (pinned Node `v24.19.0`) extracts the three
predicate lines **from the shipped harness file** and evaluates them against a
fabricated `pactl` table in which the virtual source is being captured *and*
the owner's real microphone is simultaneously being captured:

```
sources:
61  alsa_input.usb-UGREEN_Camera_2K_…   PipeWire  s16le 2ch 48000Hz  SUSPENDED
70  apunta_p35_mic                      PipeWire  s16le 2ch 48000Hz  SUSPENDED
71  apunta_p35.monitor                  PipeWire  s16le 2ch 48000Hz  SUSPENDED

source-outputs (index, SOURCE INDEX, CLIENT INDEX, field, sample-spec):
12  70  167  PipeWire  s16le 2ch 48000Hz
13  61  168  PipeWire  s16le 2ch 48000Hz
```

Exact output (exit 0):

```
harness predicate extracted (283 chars):
const streamLines = sourceOutputs.split('\n').filter((line) => line.trim() !== '');
    const onVirtual = streamLines.filter((line) => line.split(/\s+/)[2] === SOURCE_NAME);
    const onRealMic = streamLines.filter((line) => (line.split(/\s+/)[2] ?? '').startsWith(REAL_MIC_PREFIX));

fabricated source-outputs line 0 columns:
["12","70","167","PipeWire","s16le","2ch","48000Hz"]

PASS the correct mapping sees the virtual capture stream: 1
PASS the shipped predicate misses the virtual capture stream (column [2] is the client index, not the source name): onVirtual=0 (col[2]="167", SOURCE_NAME=apunta_p35_mic)
PASS the correct mapping sees the stream on the owner's real microphone: 1
PASS the shipped predicate misses the real-microphone leak (the safety-critical false negative): onRealMic=0 (col[2]="168", REAL_MIC_PREFIX=alsa_input.usb-UGREEN)
PASS even with a source name in column [1], the shipped predicate still misses it (it reads column [2]): onVirtual=0

Verdict: containment predicate is DEFECTIVE (defect reproduced)
```

## Effect on the card

- `:1303-1307` "a capture stream is present on `apunta_p35_mic`" can never
  pass.
- `:1308-1313` "no capture stream on the owner's real microphone" can never
  fail — the safety-critical check is vacuous.

The correct mapping resolves column `[1]` (source index) through
`pactl list short sources` (`index name …`), or parses the long
`pactl list source-outputs` (`Source: %u`) or `--format=json`.

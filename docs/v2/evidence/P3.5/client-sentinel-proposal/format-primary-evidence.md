# Primary evidence: what `pactl list short source-outputs` actually prints

Read-only inspection of this host's own binary. **No `pactl` was executed**, no
audio server was contacted, no state was read or changed at runtime.

- `/usr/bin/pactl`, owned by `libpulse 17.0+r98+gb096704c0-1`
  (`pacman -Qo /usr/bin/pactl`, exit 0), on `pipewire-pulse 1:1.6.8-1`
  (`pacman -Q pipewire-pulse`, exit 0).
- Build ID `390bb5197f783b5b84f491a26f0f8ff01de64573` (`readelf -n`).
- `.rodata` is at vaddr `0x11000`, file offset `0x11000` (`readelf -S`), so a
  string's file offset is its virtual address.
- Disassembly excerpts: `pactl-disasm-excerpt.txt` (from
  `objdump -d --no-show-raw-insn /usr/bin/pactl`, kept in the ignored scratch
  `/tmp/opencode/pactl.dis`; the excerpt is the committed record).

## The format string, and the `-` that goes with it

| address | bytes |
| --- | --- |
| `0x11763` | `%u\t%u\t%s\t%s\t%s\n` |
| `0x11755` | `-` |
| `0x1156c` | `(null)` |
| `0x114dd` | `%u` |

`0x11763` has exactly two references: `0xafdd` in
`get_sink_input_info_callback` and `0xb9cd` in
`get_source_output_info_callback`. The source-output branch is the one this
card reads.

## Source outputs, short format: `0xb9bc-0xb9f2`

Read as the `__printf_chk(flag, fmt, a1, a2, a3, a4, a5)` call it is:

| column | expression | meaning |
| --- | --- | --- |
| `[0]` | `*(u32*)(info+0x00)` as `%u` | source-output (stream) index |
| `[1]` | `*(u32*)(info+0x18)` as `%u` | **source index** |
| `[2]` | `*(u32*)(info+0x14) == 0xffffffff ? "-" : <decimal client index>` | **client index, or the literal `-` when the stream has no client** |
| `[3]` | `*(char**)(info+0xc8)`, `(null)` when unset | driver name |
| `[4]` | `pa_sample_spec_snprint(...)` | sample specification |

The `-` is a *sentinel chosen by pactl for "no client"*, not a parse accident:
the comparison against `0xffffffff` sits immediately before the register that
carries the third `%s`, and the string it selects is the `-` at `0x11755`.

## The same offsets, named by pactl itself

The long/JSON branch of the same callback encodes each field under pactl's own
member names, which pins the offsets independently of the format string
(excerpt B):

| offset | JSON member | type |
| --- | --- | --- |
| `0x00` | `index` | int |
| `0xc8` | `driver` | string |
| `0x10` | `owner_module` | string, skipped when `-1` |
| `0x14` | `client` | string, skipped when `-1` |
| `0x18` | **`source`** | int |

Two independent code paths in one binary agree: `0x18` is the source,
`0x14` is the client, and `0x14 == -1` is exactly the condition under which the
short format prints `-`.

The legacy long `printf` path agrees a third time (excerpt C): the value from
`info+0x18` is pushed into the vararg slot that the long format
`Source Output #%u … Client: %s … Source: %u` gives the source index.

## Sources, short format

`get_source_info_callback` at `0xa07b-0xa0bd` prints `%u\t%s\t%s\t%s\t%s`
with `[0] = *(u32*)(info+0x00)` (source index) and `[1] = *(char**)(info+0x08)`
(source name). `parseSourceTable`'s index-to-name reading is therefore correct
as shipped, and `sources.has(sourceId)` is a lookup in the right table.

## Two corrections to the record

1. **`docs/v2/evidence/P3.5/attempt-3/runtime/05-V3.txt:23` is wrong where it
   says "column 3 is the sink index, and `pactl` prints `-` when a stream has no
   sink".** Column 3 is the **client** column, and `-` means the stream has no
   PulseAudio client. A source output has no sink column at all in this format.
   The stop cause is unchanged and the direction is still fail-closed; only the
   label is wrong.
2. **The harness's own comment at `scripts/v2/tauri-audio.test.mjs:263-266` is
   right where it says the second `%u` is the source index.** Review 1
   (`docs/v2/state/reviews/P3.5-impl1.md:46-52`) reached the same mapping by
   disassembly, and this evidence reproduces it independently. The bug is not the
   column; it is that the code demanded an integer where pactl prints a
   sentinel.

## What this evidence does **not** settle

- Whether the source index seen in attempt 3 (`8035` in the V3 row, `8114` in the
  V4 row) is present in `pactl list short sources` on a live capture row. That
  needs a live read, which this package is not permitted to take. If it is
  absent, the patched function stops at the existing unknown-source guard
  instead — still fail-closed, still not a pass.
- Whether any other object type prints a sentinel in a numeric column. Only the
  two formats this card reads were inspected.

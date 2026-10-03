# P3.5 environment proposal — AUTHOR repair evidence (IR-01..IR-09)

Read-only preparation. This directory is the evidence for the repair of
`docs/v2/state/P3.5-ENVIRONMENT-PROPOSAL.md` after the independent review
`docs/v2/state/reviews/P3.5-environment-proposal-ir.md`. Nothing was adopted:
no source, card, config, manifest, checkpoint or owner-action file was edited;
no install, acquisition, build, runtime, audio or network was used. The owner
package is preparation only, not permission.

- `verify.mjs` / `verify-output.txt` — the pure machine checks (config schema,
  both variants, negative controls, installed `AppImageConfig` primary,
  `GSTREAMER_HELPERS_DIR`, host scanner path, `bash -n` syntax of the prepared
  commands). Run with the pinned Node 24.19.0; `process.stdout.write` only, no
  `console`. Output ends `ALL CHECKS PASS`, exit 0.
- `scanner-resolution.md` — IR-03/IR-04: the scanner gap, the supported
  helpers-directory repair, and the `appimage.files` investigation.

## Finding-by-finding resolution

### IR-01 (blocking) — `patchelf` is an immediate prerequisite

**Before:** U-1 left `patchelf` as something a trial build would reveal.

**After:** the proposal names `patchelf` as a third package in the same
owner-run install, and the step-0 read asserts `command -v patchelf`. Arch
local metadata (read only, no fetch): `extra 0.19.1-1`, GPL-3.0-or-later. The
A03 amendment names it explicitly, because it is a Tauri Linux prerequisite,
not a GStreamer plugin, so A03's plugin clause alone would not admit it.

### IR-02 (blocking) — dry inspection must be four separate invocations

**Before:** one `gst-inspect-1.0 appsink autoaudiosrc alsasrc` invocation; only
the last name is inspected and `pulsesrc` was missing.

**After:** four separate invocations, one per element
(`appsink`, `autoaudiosrc`, `alsasrc`, `pulsesrc`), each with its **own fresh
scratch `GST_REGISTRY`**, each asserted on its own exit code. Prepared in
`verify.mjs` as `step 2 four separate dry inspections` (`bash -n` exit 0).

### IR-03 (blocking) — scanner path asserted before use

**Before:** the scanner path was used with no existence check.

**After:** `test -x "$A/usr/lib/gstreamer1.0/gstreamer-1.0/gst-plugin-scanner"`
runs first and fails the row; a missing scanner cannot read as a pass, and an
unknown in-process fallback is recorded, never assumed. See
`scanner-resolution.md`.

### IR-04 (internal contradiction) — §1 said the flag copies "the scanner"

**After:** §1 now says the flag copies the host's plugins, and the scanner only
where the script's guessed helpers directory exists — which it does not on
Arch. The repair (`GSTREAMER_HELPERS_DIR` over a scratch dir holding only the
copied scanner) is prepared as a build-command change, not a config key. The
flag is never claimed to copy the scanner by itself.

### IR-05 (authority / manifest) — A03 replaced Ubuntu and widened the row

**Before:** the proposed *Source* cell replaced `Ubuntu archive via apt` with a
blanket "Official Arch Linux repositories … for the Tauri Linux prerequisites"
and cited `docs/INSTALL.md` (a Mac-facing guide that names no package manager).

**After:** the cell **keeps Ubuntu** and adds a narrow Arch case:

> Ubuntu archive via `apt`; on this Arch host only, the official Arch
> repositories via `pacman`, for the two GStreamer plugin packages a failing
> P3.5 test proves needed (`gst-plugins-base`, `gst-plugins-good`) and for
> `patchelf` (Arch `extra` 0.19.1-1).

No `INSTALL.md` or `archlinux.org` citation. *Allowed query keys* stays `none`;
*Shipped?* stays `no (system)`. The L-POLICY row "System libraries bundled into
an AppImage … public distribution requires owner review" is named explicitly in
the owner decision and is **outside the current test grant** — it is a future
distribution review, not a condition of this capture grant.

### IR-06 (owner-decision content) — default source weakened, command not run

**Before:** the replacement offered an `or` whose first arm passed on a `*` on
the virtual source, and cited `pactl get-default-source`, which V0's literal
command never ran.

**After:** the substantive condition is fail-closed in **all** arms — the
default source must not be `apunta_p35_mic`, with no `or` loophole — and V0's
command gains an explicit `pactl get-default-source` read with a fail-closed
assertion. The Expected cell is made truthful for pactl 17.0: it names a
PipeWire-backed Pulse-protocol server (this host prints
`Server Name: PulseAudio (on PipeWire 1.6.8)`), and it says the default is read
with `pactl get-default-source` because `pactl list short sources` carries no
`*` marker. This Expected-cell clarification is an assertion-truth amendment
bundled into the capture grant, not a third routine choice.

### IR-07 (authority) — R-b changed the requested 30-second outcome

**After:** the 30-second outcome is preserved. V1's fixture command is repaired
to loop the fabricated clip to 30 s:

```sh
ffmpeg -hide_banner -nostdin -loglevel error -y -stream_loop -1 -i "$A/raw-22050.wav" \
  -t 30 -ar 16000 -ac 1 -c:a pcm_s16le -map_metadata -1 -fflags +bitexact -flags:a +bitexact \
  "$A/dictation-30s.wav"
```

`-stream_loop -1` is an input option (before `-i`); `-t 30` is an output option
(after `-i`). An independent `ffprobe -show_entries format=duration` records the
duration. The filename `dictation-30s.wav` and every pinned threshold stay; the
`>10 s` assertion is untouched. This is a mechanical command repair the
coordinator is authorised to make; **no owner duration question is raised**, and
"at least 15 s" is not proposed. No audio is generated or played here.

Also IR-07: V2's command gains `$HOME/.cargo/bin` on `PATH` (mechanical); R-c is
**parked** (IR-08) with one honest containment sample unchanged; V5's original
provenance FAIL is not waived and the five attempt-1 `V3` records are never
deleted. The card's final normal attempt (3 of 3) is CODE/UNIT only with the
runtime held; this package spends no attempt and creates no attempt 4.

### IR-08 (scope) — R-c is not an owner question

**After:** R-c is parked. D4 stays the single honest witness in the attempt-3
code-only repair; no second sampling assertion is added.

### IR-09 (framing) — the real install mechanism

**After:** the owner-facing text states the real mechanism: the owner
authorises; the coordinator runs `pkexec pacman`; the graphical polkit prompt
authenticates; agents still never type a password. AM-081 already authorised
`pkexec pacman` for A03 on this host, so the mechanism is not re-asked — only
the grant is.

### IR-10 (note) — length

The rewritten proposal is within the requested ≤250 lines.

## Commands run (exact) and exits

| Command | Exit | Purpose |
| --- | --- | --- |
| `"$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node" docs/v2/evidence/P3.5/environment-proposal-repair/verify.mjs` | 0 | all repair checks PASS |
| `bash -n` on each prepared snippet (inside `verify.mjs`) | 0 | syntax only, no execution |
| `pacman -Ql gstreamer \| grep -i scanner` | 0 | scanner is `/usr/lib/gstreamer-1.0/gst-plugin-scanner` |
| `pacman -Si patchelf` | 0 | `extra 0.19.1-1`, GPL-3.0-or-later |
| `command -v patchelf` | 1 | absent (the prerequisite the grant adds) |

Prior evidence and scripts are unchanged; this repair reads them and adds only
this directory and the rewritten proposal.

## Limits, stated rather than guessed

- **The scanner repair's one unproven link:** whether the Tauri CLI and
  `linuxdeploy` pass `GSTREAMER_HELPERS_DIR` through to the plugin script. It is
  the script's own documented input and child environments inherit, but no build
  was run. If it does not arrive, step 1 fails visibly.
- **`appimage.files` direction:** the installed primary gives the type but not
  the target/source direction, so no mapping is proposed.
- **The config overlay merge** (Option B) is read from `package.json` and the
  config files; schema validity does not prove the bundler merge. Option A
  (shipping config) does not depend on the overlay.
- No `AppRun` patch, no hypothetical fallback, no paid tool and no download is
  proposed.

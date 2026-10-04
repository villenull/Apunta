# P3.6 attempt 6 runtime — V3 outcome analysis and the two FAIL causes

Recorded after V3 ran **once** and exited **1**. Nothing here re-ran the row. The
one probe that was run is a read-only ImageMagick reproduction in `/tmp/opencode`
on synthetic images, named as such, and it touched no AppImage, no server, no
display, no audio and no repository file.

## What V3 recorded

`02-v3-run.txt`, exit code **1**, `22/24 assertions passed, 12 NOT RUN`.

| Item | Result |
| --- | --- |
| Command | `v3-command-decoded.sh`, decoded once, sha256 `2e6316556dd5c33f36d6e697a280f367a1aa5517eeeb49c534a26420f483b822`, `bash -n` clean |
| Binary under test | `src-tauri/target/release/bundle/appimage/Apunta (test)_0.0.0_amd64.AppImage`, sha256 `5a21f295…a561`, 194435576 bytes, mtime 2026-10-04 16:20:48 -0600 — **this run's V0 output** |
| Port | 7879, asserted by the row's own three containment assertions, which all held |
| Data dir | inside `<sandbox>/data`, from the app's own log line; not the platform default |
| Fake AI | on the launch command; the app logged `"fakeAi":true` |
| Display branch | `xvfb-run -a` (the binary is present), and inside it the harness reported `display: the inherited X display :99` |
| Duration | 22:21:06 → 22:21:11 UTC, 5 s — it stopped at the first hard gate, it did not run out of time |
| Containment, after the stop | bundled server stopped **by pid** (3738021), shell stopped **by pid** (3737975), no server process remains, shell gone, **port released**, observation channel gone from the bundle, ollama still running |

**PASS (11):** the AppImage resolved to this run's own artefact; the AppImage is
newer than the newest Rule B input (the fresh-build anchor — **this is the arm
the V0 re-run existed to satisfy, and it is green**); the app window is up inside
the display; the window is at scale 1; the bundled server is stopped by pid; no
server process from the run remains; the shell is gone; the port is released; the
observation channel is gone from the bundle; ollama is still running.

**FAIL (2), and NOT RUN (12).** The eleven flows are all `NOT RUN`, each with the
same cause, and per the card's own rule **`NOT RUN` is never `PASS`**: the frame-
to-client relationship could not be measured, so **no click is grounded** and not
one flow could be driven.

## FAIL 1 — `smoke Rule B freshness: the source set has not moved since the dispatch base`

49 Rule B inputs differ between the dispatch header's base `62abb28` and HEAD.

This is the arm of `ruleBFreshness` (`tauri-e2e-smoke.test.mjs:2005-2031`) that
compares **git history**, not a build. It was predicted in
`00-preconditions.md` §3 before V3 ran, and it is **not repairable by building
anything**: `RULE_B_BASE` (`:142`) is the dispatch header's literal `62abb28`,
those 49 paths have been committed since, and neither the harness, the card, the
checkpoint nor `server/`/`web/` is in this runner's May edit. **The V0 re-run was
authorised to satisfy the *other* arm and it did** — "the AppImage is newer than
the newest Rule B input" is `PASS`.

Recorded as a structural `FAIL` for the coordinator. This run neither edited the
harness to relax the check (HS-7) nor edited `server/` or `web/` to make the tree
match a stale base (HS-9, and another card's work).

## FAIL 2 — `smoke the frame-to-client measurement: the captures could not be compared`

**This is the cause of every `NOT RUN`, and it is an environment/tooling mismatch,
not a property of the AppImage.** Reproduced read-only on this machine, on two
synthetic PNGs of identical content, in `/tmp/opencode`:

```
$ convert --version        →  ImageMagick 7.1.2-31 Q16-HDRI x86_64
$ cp a.png b.png           (byte-identical, 40x30)
$ compare -metric AE a.png b.png null:
0 (0)                        ← stderr
$ compare -metric AE a.png c.png null:      (different content)
800 (0.666667)               ← stderr
```

ImageMagick 7 prints the absolute-error count **followed by the normalised value
in parentheses**. The harness reads it as (`tauri-e2e-smoke.test.mjs:707-709`):

```js
const differing = Number(String(compared.stderr).trim());
if (!Number.isInteger(differing)) return null;
```

`Number('0 (0)')` is `NaN`, so `measureFrameClient` returns `null` **even for a
perfect, byte-identical match**, and the run stops at
`fail('smoke the frame-to-client measurement', 'the captures could not be compared')`
(`:2185`) with all eleven flows `NOT RUN`.

Three consequences worth stating plainly:

1. On this machine the frame-to-client measurement **cannot succeed for any
   build at all** — a 100 %-correct AppImage scores the same row `FAIL`. It is a
   defect in the harness's ImageMagick-7 output parsing, and it is outside this
   runer's May edit (`scripts/**` is Must not edit; HS-7 forbids loosening a
   guard to make a result pass).
2. It is **the whole of the flow coverage**: the harness grounds every click by
   reading the screen, precisely because the unflagged bundle carries no
   observation hook. No measurement ⇒ no grounded click ⇒ no flow.
3. It is **not** the "no window on the display" `NOT RUN` of Stop 5 — a window
   *was* found, at 608x456 on a 640x480 display at scale 1 — and it is **not**
   Stop 2's missing `xdotool` (`/usr/bin/xdotool` is present and was used). It is
   a measurement-parse failure, so it is recorded as `FAIL` with `NOT RUN` flows,
   exactly as the harness itself recorded it. No approval is claimed for V3.

## A second, lesser anomaly — the display the row got

The card's V3 command wraps the launch in `xvfb-run -a` (correct: it is what the
card says, and it is what makes the launch and every `xdotool` probe share one
display). The harness, given that inherited `DISPLAY`, takes its **inherited**
branch (`tauri-e2e-smoke.test.mjs:453`) and therefore **never reaches its own
`xvfb-run -a -s "-screen 0 1400x1000x24"` re-exec** (`:460-481`). The row
consequently ran on `xvfb-run`'s default **640x480** screen, giving a 608x456
window, instead of the 1400x1000 the harness asks for when it starts its own.

Recorded as an observation, not as a defect claim: on a 640x480 screen the
window's crop (608x456 at +16+12) is still inside the root capture, so this is
**not** the proximate cause of FAIL 2 — the `0 (0)` parse is. It is recorded
because it is the difference between the display the harness asks for and the one
it got, and because a 1400x1000 screen is also the geometry the harness's own
screen-label grounding was written against.

## The virtual audio containment

The harness's virtual-audio path (`tauri-e2e-smoke.test.mjs:1546-1613`) loads
`module-null-sink` and `module-loopback`, makes its own source the default, and
unloads both plus restores the previous default in a `finally`. Because the run
stopped **before** the capture flow, that path was never entered — confirmed
afterwards: `pactl list short sources` shows only the machine's four physical
`alsa_*` PipeWire devices and **no null sink and no `module-*` source**, so no
virtual audio source was left behind and the default source was never changed.
No real microphone was opened by this run beyond what the harness's containment
asserts, and in fact none was: the capture flow never ran.

# P3.5 — V3, the spoken-fixture capture row

- Working directory: repository root
- Invocation that reached the record click: 2026-10-03T03:21:44Z → 03:22:51Z,
  exit **1**
- Status: **BLOCKED** — the app's recorder was started by a real click on the
  real button and WebKitGTK then failed to open a capture device, because the
  host has no GStreamer capture elements. That is the card's own A03 stop
  condition; the owner line is `E6` in `docs/v2/state/OWNER-ACTIONS.md`.
- **No assertion was relaxed, no threshold moved and no row dropped.**

## Exact command

```sh
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node --version && node scripts/v2/sandbox.mjs env --port 7837 > /tmp/apunta-v2-p3.5-v3.env && . /tmp/apunta-v2-p3.5-v3.env && export APUNTA_ALLOW_AUDIO_TEST=1 && node scripts/v2/tauri-audio.test.mjs capture
```

## Exact output

```
v24.19.0
  display: the inherited X display :99
PASS V3 appimage: <repo>/src-tauri/target/release/bundle/appimage/Apunta (test)_0.0.0_amd64.AppImage
  V3 audio: <sandbox>/audio-en/dictation-30s.wav
  V3 sha256: 27d1b7e201785376f59f64cb3b8a93de03f7bdef33df7f63e269c9f2bcb3f79a
PASS V3 the virtual source is the default, read back: apunta_p35_mic
  V3 previously default source: alsa_input.usb-UGREEN_Camera_2K_UGREEN_Camera_2K_SN0001-02.analog-stereo
RECORD {"step":"V3","attempt":1,"runId":"2026-10-03T03-21-44-908Z-5da93850","dateUtc":"2026-10-03T03:21:47.971Z","prevDefault":"alsa_input.usb-UGREEN_Camera_2K_UGREEN_Camera_2K_SN0001-02.analog-stereo","sinkId":"536870916","srcId":"536870917"}
PASS V3 the app's own window is up
  V3 window 1280x860 at 60,70
  V3 the app reports 1280x860 physical on a 1400x1000 display at scale 1
PASS V3 the app window is at scale 1
PASS V3 the server answers with this run's id
PASS V3 the patient was created through the API
PASS click the onboarding Continue button (rectangle inside the window)
PASS click the onboarding Continue button
PASS V3 a note format exists for the capture screen
PASS click home-action-note (rectangle inside the window)
PASS click home-action-note
PASS click home-search (rectangle inside the window)
PASS click home-search
PASS V3 the search text was typed
PASS click the first result option (rectangle inside the window)
PASS click the first result option
PASS click record-start (rectangle inside the window)
PASS click record-start
FAIL V3 the phase reached recording: phases seen: ["record-start+capture-error"]
  --- the app's stderr (last 25 lines) ---
  GStreamer element appsink not found. Please install it.
  Audio capture was requested but no device was found amongst 0 devices
  BooleanConstraint 9, exact -1, ideal 1
  stopped the shell (pid 2074372) with SIGTERM

18/19 assertions passed
```

(The full stderr tail — every URL the bundled server served, verbatim and
sanitised — is in this row's raw log inside its run folder, and is what the
evidence's marker, rectangle and request lines are read from.)

## What was proved, in the order the card names

1. **Containment, before the launch.** `apunta_p35` and `apunta_p35_mic` were
   created, `apunta_p35_mic` was made the default and **read back** before the
   AppImage was launched. The read-back is polled for up to 10 s, because
   `set-default-source` is applied asynchronously by `pipewire-pulse`; a value
   that is still the physical device after that budget stops the row instead of
   retrying. The remembered previous default, verbatim:
   `alsa_input.usb-UGREEN_Camera_2K_UGREEN_Camera_2K_SN0001-02.analog-stereo`.
2. **Playback started before the record click** —
   `paplay --device=apunta_p35 --rate=16000 --channels=1 …` on the V1 artefact
   (SHA-256 recorded above), stopped **by pid** in the teardown.
3. **The AppImage launched exactly as P3.3 launches it**: `cwd: '/'`,
   `XDG_CACHE_HOME`/`XDG_CONFIG_HOME`/`XDG_DATA_HOME`/`HOME` inside the run
   folder, `WAYLAND_DISPLAY` unset, `XDG_BACKEND`/`GDK_BACKEND` `x11`, and
   `xvfb-run -a -s '-screen 0 1400x1000x24'` re-execution (the inherited display
   was `:99`).
4. **Ownership** (`testRunId` equal to `$APUNTA_TEST_RUN_ID`) before any
   assertion.
5. **A real patient through the API** — John Smith, created in the run folder,
   never read from the live instance (HS-8).
6. **The five-click set**, each at a rectangle the hook published, each verified
   to lie inside the window before the click, each preceded by an explicit
   `xdotool windowfocus` (an XTEST click is delivered to the focused window and
   `xvfb-run` has no window manager):
   - `home-action-note` — **this card's own `data-testid` rectangle** — clicked;
   - `home-search` — this card's own rectangle, then the typed text — clicked;
   - the first `li[role='option']` — **P3.4's inherited text-leaf rectangle** —
     clicked;
   - `record-start` — this card's own rectangle — clicked;
   - `record-stop` — P3.4's inherited text-leaf rectangle — **never reached**.
   **Four** of the five card clicks landed; the fifth, `record-stop`, did not,
   because the row failed `the phase reached recording`
   (`phases seen: ["record-start+capture-error"]`) and returned before it. The
   onboarding `Continue` click is a separate app click and is not one of the
   five. Every click that landed is a real `onClick` running the app's
   own code path; nothing in `web/`, `server/` or `src-tauri/` was asked for a new
   capability, route or IPC command.
7. **The recorder really started**: the phase marker moved off `record-start`
   into `capture-error` — that is, the click landed, the app asked for the
   microphone and the microphone did not arrive.

## Why it is blocked

Verbatim from the app's own stderr, the last lines before the shell was stopped:

```
GStreamer element appsink not found. Please install it.
Audio capture was requested but no device was found amongst 0 devices
```

And from outside, on this host:

| Probe | Result |
| --- | --- |
| `gst-inspect-1.0 appsink` | element found, `libgstapp.so`, GStreamer 1.28.6, `Rank none (0)` |
| `gst-inspect-1.0 autoaudiosrc` | **No such element or plugin** |
| `gst-inspect-1.0 alsasrc` | **No such element or plugin** |
| `gst-inspect-1.0 pulsesrc` | **No such element or plugin** |
| `gst-inspect-1.0 pipewiresrc` | present |
| installed GStreamer packages | `gst-plugin-pipewire 1:1.6.8-1`, `gst-plugins-base-libs 1.28.6-3`, `gst-plugins-bad-libs 1.28.6-3`, `gstreamer 1.28.6-3` |

WebKitGTK opens a capture device through `autoaudiosrc`, and with it absent it
enumerates **zero** devices whatever the Pulse default source is. That is the
card's stop condition: "The A03 system packages or a GStreamer plugin are
missing: the exact `apt` command goes to `docs/v2/state/OWNER-ACTIONS.md`, V0–V5
are recorded `BLOCKED` with that line, and the card stops." The owner line is
recorded as `E6`, with the Arch package names, because this host is
Arch/Omarchy with `pacman` while A03's row admits only "Ubuntu archive via
`apt`" — a manifest reconciliation the coordinator owns, referred in the return.

**The microphone permission itself was granted.** The handler in
`src-tauri/src/permissions.rs` is registered on the `main` window's builder, and
WebKitGTK's request went past it into the capture stage, which only happens for
an `Allow`. The refusal arms are covered by V0's `cargo test permissions`.

## What this row did **not** claim

- **Not** that the app opened the device this run made default.
  `web/src/lib/recorder.ts:258-266` passes `getUserMedia` no `deviceId`, so the
  Pulse default is the only lever, and nothing in this repository observes which
  node a stream attached to. The `pactl list short source-outputs` read the card
  asks for while recording was **not** taken, because no recording ever became
  live: there was nothing to read. That read is therefore recorded as **not
  obtained**, not as a pass.
- **Not** that a note is stored, and **not** that the app rejects non-speech.
  With no whisper model on disk `WhisperProvider.transcribe` throws
  `whisper_model_missing` before it reads the WAV, so no input can produce a note
  here. `GET /api/notes` is vacuous in this card and is recorded as a
  precondition only; it was not even reached, because the recording never
  completed.
- **Not** `levelPeak`, the timer advance, or the `/api/transcribe` request: all
  three are downstream of frames arriving, and none did.

## Provenance: five invocations, five records

The harness needed five invocations to reach the record click, and each one that
created a virtual source wrote its own durable record. All five are in
`docs/v2/state/cards/P3.5.json`, in `sideEffectsDone` and in `sandboxRuns`, in
creation order, each with its real `runId` and `dateUtc` — nothing was merged,
deduplicated or re-derived:

| # | runId | dateUtc | why it ended |
| --- | --- | --- | --- |
| 1 | `2026-10-03T02-30-49-593Z-2f516bcb` | `2026-10-03T02:30:52.910Z` | harness bug: the PipeWire preflight required the literal `Server Name: PipeWire` |
| 2 | `2026-10-03T02-45-28-783Z-79cf3de5` | `2026-10-03T02:45:31.917Z` | harness bug: the default-source read-back was not polled |
| 3 | `2026-10-03T02-59-21-201Z-181a31e3` | `2026-10-03T02:59:24.270Z` | harness bug: the app opened on onboarding, so no home rectangle existed |
| 4 | `2026-10-03T03-10-51-962Z-4b75b5f9` | `2026-10-03T03:10:55.342Z` | harness bug: `GDK_SCALE=2` leaked from the desktop session, so rectangles and window coordinates were in different frames |
| 5 | `2026-10-03T03-21-44-908Z-5da93850` | `2026-10-03T03:21:47.971Z` | reached the record click; blocked by the missing GStreamer elements |

Two earlier invocations created **no** virtual source and wrote no record: one
was refused by the preflight above, and one created the modules and was then
stopped by the read-back check before any record was written — its teardown ran
on the exit path and restored the default, verified immediately afterwards
(`pactl get-default-source` back to the USB microphone, no `apunta_p35` module
loaded).

**V5 therefore fails closed on this row's provenance, by design**: five
`PREV_DEFAULT` records at attempt 1 for one step where the row names three runs
in the order `V3`, `V4-tone`, `V4-silence`. That is the duplicate-provenance
case the card defines, and resolving it — a fresh attempt, or a coordinator
decision about which record is the baseline — is the coordinator's call, not this
session's. It is reported rather than tidied away.

## Containment state after this row

- `pactl get-default-source`: `alsa_input.usb-UGREEN_Camera_2K_UGREEN_Camera_2K_SN0001-02.analog-stereo` (the owner's microphone, restored).
- `pactl list short sinks`: no `apunta_p35`. `pactl list short sources`: no
  `apunta_p35_mic`.
- `pactl list short modules`: no module carrying `sink_name=apunta_p35` or
  `source_name=apunta_p35`.
- The AppImage was stopped by pid; the run folder's server went with it.
- **At no point was the owner's USB microphone the capture device**: the row
  refuses to launch the app until the read-back says `apunta_p35_mic`, and no
  invocation ever reached a record click except the fifth, which ran with the
  virtual source as the default.

## The harness bugs the five invocations exposed

Each was fixed in `scripts/v2/tauri-audio.test.mjs` and none of the fixes
touches an assertion, a threshold or the app:

1. the PipeWire preflight demanded a literal `Server Name: PipeWire` where
   `pipewire-pulse` prints `PulseAudio (on PipeWire 1.6.8)`, and now requires
   PipeWire to be the server **and** no `pulseaudio`/`pacmd` binary;
2. `set-default-source` needs a polled read-back;
3. a first-run folder opens on onboarding, so `reachHome` clicks the app's own
   **Continue** and dismisses the add-patient dialog with a real Escape;
4. `GDK_SCALE=2` from the desktop session made the window 665x475 in CSS pixels;
   the child is now launched with `GDK_SCALE=1` and the scale is **asserted
   from the app's own stderr line**, not assumed;
5. `xdotool click` is an XTEST event delivered to the focused window, so
   `windowfocus` precedes every click — without it the click exited 0 and landed
   nowhere, which is the worst failure a click harness can have.
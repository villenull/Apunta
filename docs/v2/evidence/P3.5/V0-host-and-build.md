# P3.5 — V0, host and build probe (attempt 4)

- Attempt: **4** (owner amendment **AM-194**), runtime base `498cc98`, dispatch
  regenerated at `3f87a8b`.
- Working directory: repository root. Command run from the card's own V0 cell,
  parsed through `docs/v2/tools/plan-lib.mjs`'s `parseCells` and verified
  byte-identical to `attempt-4/runtime-readiness/row-cells/V0.command.txt`
  before execution.
- Started: 2026-10-03T22:36:41Z · Ended: 2026-10-03T22:36:43Z
- Exit code: **0**
- Status: **PASS**. Nothing adapted. Prior attempt-1/attempt-3 wording kept as
  history; this file is the attempt-4 record and supersedes attempt 1's copy of
  the same path.
- Preceded by the AM-190 **STEP-0** fail-closed prerequisite read, exit 0
  (`attempt-4/runtime/00-step0.txt` in this run's raw evidence): pinned Node
  `v24.19.0`, `patchelf` present, `appsink autoaudiosrc alsasrc pulsesrc` all
  visible on the host, `/usr/lib/gstreamer-1.0/gst-plugin-scanner` executable,
  `STEP-0 PASS: prerequisites satisfied`.

## Exact command

```sh
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node --version && node scripts/v2/sandbox.mjs env --port 7837 > /tmp/apunta-v2-p3.5-v0.env && . /tmp/apunta-v2-p3.5-v0.env && command -v pactl paplay ffmpeg xdotool; command -v xvfb-run || echo 'xvfb-run absent: optional, V3/V4 re-execution only'; pactl list short sinks | grep -c apunta_p35; test -z "$(command -v pulseaudio)" && test -z "$(command -v pacmd)" && pactl info | grep -i '^Server Name' && DEF=$(pactl get-default-source) && test -n "$DEF" && test "$DEF" != apunta_p35_mic && printf 'Default source: %s\n' "$DEF" && pactl list short sources && ls "$HOME/.local/share/apunta-piper/voices" && test ! -e "$APUNTA_DATA_DIR/models/ggml-tiny.en.bin" && (cd src-tauri && export PATH="$HOME/.cargo/bin:$PATH" && cargo test permissions) && ls src-tauri/target/release/bundle/appimage/
```

## Exact output

```
v24.19.0
/usr/bin/pactl
/usr/bin/paplay
/usr/bin/ffmpeg
/usr/bin/xdotool
/usr/bin/xvfb-run
0
Server Name: PulseAudio (on PipeWire 1.6.8)
Default source: alsa_input.usb-UGREEN_Camera_2K_UGREEN_Camera_2K_SN0001-02.analog-stereo
60	alsa_output.pci-0000_03_00.1.hdmi-stereo-extra3.monitor	PipeWire	s32le 2ch 48000Hz	SUSPENDED
61	alsa_input.usb-UGREEN_Camera_2K_UGREEN_Camera_2K_SN0001-02.analog-stereo	PipeWire	s16le 2ch 48000Hz	SUSPENDED
62	alsa_output.pci-0000_75_00.6.iec958-stereo.monitor	PipeWire	s32le 2ch 48000Hz	SUSPENDED
63	alsa_input.pci-0000_75_00.6.analog-stereo	PipeWire	s16le 2ch 48000Hz	SUSPENDED
en_US-ljspeech-medium.onnx
en_US-ljspeech-medium.onnx.json
es_MX-ald-medium.onnx
es_MX-ald-medium.onnx.json
   Compiling apunta v0.0.0 (/home/villenull/Projects/Apunta/src-tauri)
    Finished `test` profile [unoptimized + debuginfo] target(s) in 1.56s
     Running unittests src/main.rs (target/debug/deps/apunta-3be0144fe377c2d8)

running 5 tests
test permissions::tests::an_origin_the_shell_cannot_read_fails_closed ... ok
test permissions::tests::every_other_permission_kind_is_refused ... ok
test permissions::tests::an_allowed_origin_that_does_not_parse_refuses_rather_than_allows ... ok
test permissions::tests::the_apps_own_origin_is_granted_the_microphone ... ok
test permissions::tests::the_microphone_from_any_other_origin_is_refused ... ok

test result: ok. 5 passed; 0 failed; 0 ignored; 0 measured; 55 filtered out; finished in 0.00s

Apunta (test)_0.0.0_amd64.AppImage
Apunta (test).AppDir
```

The `voices` listing holds `en_US-ljspeech-medium`, acquired under A10 and
recorded in `docs/v2/evidence/P3.5/acquisitions.md`. **Nothing was acquired or
downloaded in this attempt**; V1 reused the voice already on disk.

## One by one

| Assertion | Result |
| --- | --- |
| `node --version` printed exactly `v24.19.0` | pass |
| `pactl`, `paplay`, `ffmpeg`, `xdotool` all present | pass — exactly the four paths the card asserts |
| `xvfb-run` present (informational only) | `/usr/bin/xvfb-run` |
| `pactl list short sinks \| grep -c apunta_p35` is `0` | pass — the `0` on the seventh output line; the read sits off the `&&` chain on purpose, because `grep -c` exits 1 on a zero count |
| `pulseaudio` and `pacmd` both absent | pass — the `test -z` chain reached `pactl info`, so both evaluated true |
| PipeWire is the server | pass, **literal string disclosed**: `Server Name: PulseAudio (on PipeWire 1.6.8)`. This host runs `pipewire-pulse`, which answers the Pulse protocol. The literal `Server Name: PipeWire` does not appear. Recorded, not adapted. |
| the default source is non-empty and is not `apunta_p35_mic` | pass — the cell printed it itself: `Default source: alsa_input.usb-UGREEN_Camera_2K_UGREEN_Camera_2K_SN0001-02.analog-stereo`. **Disclosed:** `pactl list short sources` on this host emits no `*` marker, so the row reads the default through `pactl get-default-source`, which this cell now does on the `&&` path. |
| the voices directory is listed | pass |
| `ggml-tiny.en.bin` absent under `$APUNTA_DATA_DIR/models` | pass — `test ! -e` held; the expected state, and the reason this card is capture-only |
| `cargo test permissions` | pass — 5 tests, 5 passed, 0 failed, 55 filtered out: own origin `Allow`, other origins `Deny` (including the userinfo form), every other `PermissionKind` `Deny`, unreadable origin `Deny`, unparseable allowed origin `Deny` |
| an AppImage exists | pass — `Apunta (test)_0.0.0_amd64.AppImage` beside `Apunta (test).AppDir` |

## (a) the tree this card was written against

Recorded because the card asks for it as the evidence for *why*
`src-tauri/src/permissions.rs` is created rather than found. The pre-change read
is taken from the base commit `8783181`, not from the working tree:

```
$ git ls-tree --name-only 8783181 src-tauri/src/
src-tauri/src/bridge.rs
src-tauri/src/launch.rs
src-tauri/src/lifecycle.rs
src-tauri/src/main.rs
src-tauri/src/quit.rs
src-tauri/src/signals.rs

$ git grep -n -E 'permission|getUserMedia|media' 8783181 -- src-tauri/src/
8783181:src-tauri/src/signals.rs:89:        // call is made and immediately proven not to have fired.
8783181:src-tauri/src/signals.rs:123:        // Signal 0 performs the permission and process checks and sends nothing.

$ git show 8783181:src-tauri/tauri.conf.json | grep -n capabilities
14:      "capabilities": []
```

Exactly as the card states: no microphone-permission handler, the only two grep
hits are unrelated comments in `signals.rs`, no `src-tauri/capabilities/`
directory, and `"capabilities": []`.

## (b) `cargo test permissions`

In the exact output above; five tests, all passing, and no other module's tests
because the filter is `permissions`.

## (c) permission refusal by WebKitGTK

Not applicable and recorded as such: whether the permission handler is reached at
all is what V3 observes, and V3's own outcome is recorded in
`docs/v2/evidence/P3.5/attempt-4/runtime/05-V3.txt` and this run's row table.
This row asserts nothing about it.
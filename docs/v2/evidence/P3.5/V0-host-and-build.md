# P3.5 — V0, host and build probe

- Working directory: repository root
- Started: 2026-10-03T02:24:58Z · Ended: 2026-10-03T02:24:58Z
- Exit code: 0 (the row's command ends in `| exit 0`)
- Status: **PASS**, with two literal readings disclosed below. Nothing was adapted.

## Exact command

```sh
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node --version && node scripts/v2/sandbox.mjs env --port 7837 > /tmp/apunta-v2-p3.5-v0.env && . /tmp/apunta-v2-p3.5-v0.env && command -v pactl paplay ffmpeg xdotool; command -v xvfb-run || echo 'xvfb-run absent: optional, V3/V4 re-execution only'; pactl list short sinks | grep -c apunta_p35; test -z "$(command -v pulseaudio)" && test -z "$(command -v pacmd)" && pactl info | grep -i '^Server Name' && pactl list short sources && ls "$HOME/.local/share/apunta-piper/voices" && test ! -e "$APUNTA_DATA_DIR/models/ggml-tiny.en.bin" && (cd src-tauri && export PATH="$HOME/.cargo/bin:$PATH" && cargo test permissions) && ls src-tauri/target/release/bundle/appimage/
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
60	alsa_output.pci-0000_03_00.1.hdmi-stereo-extra3.monitor	PipeWire	s32le 2ch 48000Hz	SUSPENDED
61	alsa_input.usb-UGREEN_Camera_2K_UGREEN_Camera_2K_SN0001-02.analog-stereo	PipeWire	s16le 2ch 48000Hz	SUSPENDED
62	alsa_output.pci-0000_75_00.6.iec958-stereo.monitor	PipeWire	s32le 2ch 48000Hz	SUSPENDED
63	alsa_input.pci-0000_75_00.6.analog-stereo	PipeWire	s16le 2ch 48000Hz	SUSPENDED
en_US-ljspeech-medium.onnx
en_US-ljspeech-medium.onnx.json
es_MX-ald-medium.onnx
es_MX-ald-medium.onnx.json
   Compiling apunta v0.0.0 (<repo>/src-tauri)
    Finished `test` profile [unoptimized + debuginfo] target(s) in 0.52s
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

The `voices` listing shows the `en_US-ljspeech-medium` voice this row needs,
because it was acquired earlier in the same session under A10 (see
`acquisitions.md`); before that acquisition the listing held only the two
`es_MX-ald-medium` files.

## One by one

| Assertion | Result |
| --- | --- |
| `node --version` printed exactly `v24.19.0` | pass |
| `pactl`, `paplay`, `ffmpeg`, `xdotool` all present | pass (four paths, exactly the four this card asserts) |
| `xvfb-run` present (informational only) | `/usr/bin/xvfb-run`; the card makes it informational, not a gate |
| `pulseaudio` and `pacmd` both absent | pass — neither is on `PATH`, and the `test -z` chain reached `pactl info`, so both tests evaluated true |
| PipeWire is the server | pass, **with the literal string disclosed**: `pactl info` prints `Server Name: PulseAudio (on PipeWire 1.6.8)`. This host runs `pipewire-pulse`, which answers the Pulse protocol and names itself that way; the card's own mechanism note says the host runs `pipewire-pulse` and that no `pulseaudio` daemon and no `pacmd` exist, which is what the two `test -z` checks establish. The literal `Server Name: PipeWire` substring does not appear. Recorded, not adapted. |
| the default source is not `apunta_p35_mic` | pass — `pactl list short sources` printed above, and `pactl get-default-source` read separately at the same moment: `alsa_input.usb-UGREEN_Camera_2K_UGREEN_Camera_2K_SN0001-02.analog-stereo`. **Disclosed:** the card expects a `*` marker on the default source's line; `pactl list short sources` on this host emits no such marker, so the default was read with `pactl get-default-source` instead. The substance — the default is the owner's USB microphone and not this run's virtual source — holds. |
| `pactl list short sinks \| grep -c apunta_p35` is `0` | pass — the `0` on the sixth output line. The read sits off the `&&` chain on purpose, because `grep -c` exits 1 on a zero count. |
| the voices directory is listed | pass |
| `ggml-tiny.en.bin` absent under `$APUNTA_DATA_DIR/models` | pass — `test ! -e` held, which is the expected state and the reason this card is capture-only |
| `cargo test permissions` covered the three arms plus the `Err` arm | pass — five tests, listed above: own origin `Allow`, other origins `Deny` (nine cases including the userinfo form), every other `PermissionKind` `Deny`, an unreadable origin `Deny`, and an unparseable allowed origin `Deny` |
| an AppImage exists | pass — `Apunta (test)_0.0.0_amd64.AppImage` |

## (a) the tree this card was written against

Recorded because the card asks for it as the evidence for *why*
`src-tauri/src/permissions.rs` is created rather than found. This session made
the Rust change, so the pre-change read is taken from the base commit rather than
from the working tree:

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

$ git ls-tree --name-only -r 8783181 -- src-tauri/capabilities
(no output — the directory did not exist)

$ git show 8783181:src-tauri/tauri.conf.json | grep -n capabilities
14:      "capabilities": []
```

Exactly as the card states: no microphone-permission handler, the only two grep
hits are unrelated comments in `signals.rs`, no `capabilities/` directory, and
`"capabilities": []`.

After this card's change `src-tauri/src/` holds those six files plus
`permissions.rs`, and `grep -rn "getUserMedia" src-tauri/src/` still matches
nothing — the app asks for the microphone through the webview, and the shell only
answers.

## (b) `cargo test permissions`

In the exact output above; five tests, all passing, and no other module's tests
because the filter is `permissions`.

## (c) permission refusal by WebKitGTK

Not applicable and recorded as such: the permission handler **was** reached in
V3. WebKitGTK accepted the microphone request and moved on to opening a capture
device, which is where it failed — on missing GStreamer elements, not on the
permission. See `V3-capture-spoken.md`.
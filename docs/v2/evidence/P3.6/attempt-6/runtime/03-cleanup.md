
---

# Cleanup confirmation — 2026-10-04T22:22:07Z

```
$ pids named in 02-v3-run.txt
pid 3737975: gone
pid 3738021: gone
$ ps -eo pid,cmd | grep -Ei 'apunta|Xvfb|tauri-e2e-smoke|pactl|parec|module-null' | grep -v grep
(no matching process)
$ ss -ltn | grep 7879
(7879 free, no listener)
$ ss -ltn | awk 7800-7899
(no listener anywhere in 7800-7889)
$ pactl list short sources
60	alsa_output.pci-0000_03_00.1.hdmi-stereo-extra3.monitor	PipeWire	s32le 2ch 48000Hz	SUSPENDED
61	alsa_input.usb-UGREEN_Camera_2K_UGREEN_Camera_2K_SN0001-02.analog-stereo	PipeWire	s16le 2ch 48000Hz	SUSPENDED
62	alsa_output.pci-0000_75_00.6.iec958-stereo.monitor	PipeWire	s32le 2ch 48000Hz	SUSPENDED
63	alsa_input.pci-0000_75_00.6.analog-stereo	PipeWire	s32le 2ch 48000Hz	SUSPENDED
$ pactl get-default-source
alsa_input.usb-UGREEN_Camera_2K_UGREEN_Camera_2K_SN0001-02.analog-stereo
(no module-null-sink, no module-loopback: the harness's virtual audio source is gone)
```

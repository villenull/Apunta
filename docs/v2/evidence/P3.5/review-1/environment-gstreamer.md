# ENV1 — `appsink` is a bundle-path problem; `E6` is necessary but not sufficient

Read-only investigation. No app, build, install, microphone or network was used.

## Host, independently re-checked

| Probe | Result | Exit |
| --- | --- | --- |
| `gst-inspect-1.0 appsink` | `AppSink`, `libgstapp.so` | 0 |
| `gst-inspect-1.0 autoaudiosrc` | No such element or plugin | 255 |
| `gst-inspect-1.0 alsasrc` | No such element or plugin | 255 |
| `gst-inspect-1.0 pulsesrc` | No such element or plugin | 255 |
| `gst-inspect-1.0 pipewiresrc` | `PipeWire source` | 0 |

Installed packages (`pacman -Q`): `gst-plugin-pipewire 1:1.6.8-1`,
`gst-plugins-base-libs 1.28.6-3`, `gst-plugins-bad-libs 1.28.6-3`,
`gstreamer 1.28.6-3`. `gst-plugins-base` and `gst-plugins-good` are **not
installed** (`pacman -Q … || echo NOT installed`). `libgstapp.so` is owned by
`gst-plugins-base-libs`, so `appsink` is present on the host.

## The AppImage

`src-tauri/target/release/bundle/appimage/Apunta (test).AppDir`:

- Bundles GStreamer **core** libraries in `usr/lib`:
  `libgstreamer-1.0.so.0`, `libgstapp-1.0.so.0`, `libgstbase-1.0.so.0`,
  `libgstaudio-1.0.so.0`, `libgstpbutils-1.0.so.0`, `libgstvideo-1.0.so.0`, …
- Has **no `usr/lib/gstreamer-1.0/` plugin directory** and **no
  `gst-plugin-scanner`** (`find … -name '*scanner*'` → empty; `usr/libexec`
  absent).
- `AppRun` sources `apprun-hooks/linuxdeploy-plugin-gtk.sh`, which sets GTK/GIO
  paths but **not** `GST_PLUGIN_PATH`, `GST_PLUGIN_SYSTEM_PATH*` or
  `LD_LIBRARY_PATH`, then `exec`s `AppRun.wrapped`.

## `AppRun.wrapped` masks the host plugin path

`AppRun.wrapped` is the linuxdeploy launcher (ELF, links only libc). Its
`.rodata` contains:

```
GST_PLUGIN_SYSTEM_PATH=%s/usr/lib/gstreamer:%s
GST_PLUGIN_SYSTEM_PATH_1_0=%s/usr/lib/gstreamer-1.0:%s
```

`objdump -d` at `0x4018c5` / `0x40190f` shows the `%s` values are the AppDir
(`r14`) and the **previous environment value** (`getenv` → `test rax,rax` →
`cmove r12,rbx`, i.e. empty string when unset), then `snprintf` → `putenv`,
**unconditionally** — the binary's PLT has no `stat`, `access` or
`g_file_test`, so there is no directory-existence check.

Result in the harness environment (`launchApp` passes `...process.env` with no
`GST_PLUGIN_SYSTEM_PATH_1_0`): the variable becomes
`$APPDIR/usr/lib/gstreamer-1.0:`. GStreamer treats a set
`GST_PLUGIN_SYSTEM_PATH_1_0` as replacing its compiled-in default
(`/usr/lib/gstreamer-1.0`), so the host's `libgstapp.so` is invisible inside the
AppImage. That is why the shell logs `GStreamer element appsink not found` while
the host has it.

## Consequence for `E6`

`E6` proposes `pkexec pacman -S --needed gst-plugins-base gst-plugins-good` and
says to verify `appsink`, `autoaudiosrc` and `alsasrc`. That install is needed
for `autoaudiosrc`/`alsasrc`/`pulsesrc` (genuinely absent), but it will **not by
itself** make `appsink` visible to the AppImage, because the AppImage's plugin
search path excludes the host directory and `appsink` is already on the host.

## Recommended minimal next action (for the coordinator; not this card's May edit)

1. Fix the bundle so the AppImage's GStreamer plugin path includes the host
   plugin directory — bundle the needed plugins (and the scanner) into
   `usr/lib/gstreamer-1.0`, or make the launcher append `/usr/lib/gstreamer-1.0`
   instead of replacing it. Verify read-only with the AppImage's own environment
   before any capture row.
2. Install `gst-plugins-base`/`gst-plugins-good` for the missing capture
   sources.
3. Reconcile A03 (`pacman` vs the manifest's Ubuntu `apt`) first.

Neither step alone is proven; do not record `E6` as resolving the `appsink`
error.

# ENV-P1 — the supported config option, and exactly what it does

Read-only. No app, build, install, download, network, microphone, audio or
database was used. Everything below is from files already on this machine.

## 1. The option exists in the locally installed CLI's schema

`@tauri-apps/cli` **2.12.1** (`node_modules/@tauri-apps/cli/package.json`,
`node -e "console.log(require('./node_modules/@tauri-apps/cli/package.json').version")`,
exit 0). `config.schema.json` → `definitions.AppImageConfig`, read with
`python3 -c` over the local file, exit 0:

```json
"bundleMediaFramework": {
  "description": "Include additional gstreamer dependencies needed for audio and video playback.\n This increases the bundle size by ~15-35MB depending on your build system.",
  "default": false,
  "type": "boolean"
}
```

`definitions.AppImageConfig` has `additionalProperties: false` and two
properties only: `bundleMediaFramework`, `files`. `BundleConfig.properties.linux`
resolves to `definitions/LinuxConfig` with `default`
`{ "appimage": { "bundleMediaFramework": false, "files": {} }, "deb": …, "rpm": … }`.
The CLI binary carries the same schema and the same default
(`strings -a … | grep bundleMediaFramework` → three occurrences, all
`"bundleMediaFramework": false`).

So the option is supported in the pinned CLI, it is `false` today, and the key
path `bundle.linux.appimage.bundleMediaFramework` is the documented location.

## 2. What the flag actually does — the bundler's own script, not a guess

The CLI embeds the linuxdeploy GStreamer plugin script verbatim
(`strings -a node_modules/@tauri-apps/cli-linux-x64-gnu/cli.linux-x64-gnu.node`,
exit 0). Its behaviour, from the embedded text:

- it copies every file in the host plugin directory into
  `$APPDIR/usr/lib/gstreamer-1.0` (`plugins_target_dir`), then runs
  `patchelf --set-rpath` on each copied plugin;
- it copies helper tools (`gst-plugin-scanner`, `gst-ptp-helper`) from
  `$helpers_dir` into `$APPDIR/usr/lib/gstreamer1.0/gstreamer-1.0`;
- it writes `apprun-hooks/linuxdeploy-plugin-gstreamer.sh` containing exactly:

```sh
export GST_REGISTRY_REUSE_PLUGIN_SCANNER="no"
export GST_PLUGIN_SYSTEM_PATH_1_0="${APPDIR}/usr/lib/gstreamer-1.0"
export GST_PLUGIN_PATH_1_0="${APPDIR}/usr/lib/gstreamer-1.0"
export GST_PLUGIN_SCANNER_1_0="${APPDIR}/usr/lib/gstreamer1.0/gstreamer-1.0/gst-plugin-scanner"
export GST_PTP_HELPER_1_0="${APPDIR}/usr/lib/gstreamer1.0/gstreamer-1.0/gst-ptp-helper"
```

- its plugin-source guess is: `$GSTREAMER_PLUGINS_DIR` if set, else
  `/usr/lib/$(uname -m)-linux-gnu/gstreamer-1.0` if that directory exists, else
  `/usr/lib/gstreamer-1.0`; helpers dir is guessed the same way under
  `/usr/lib/$(uname -m)-linux-gnu/gstreamer1.0/gstreamer-1.0`.

This is exactly the missing half of ENV1. `AppRun.wrapped` (read-only, from
`docs/v2/evidence/P3.5/review-1/environment-gstreamer.md`) unconditionally sets
`GST_PLUGIN_SYSTEM_PATH_1_0=$APPDIR/usr/lib/gstreamer-1.0:<prior env>`, and the
prior value, once the hook exists, **is** `$APPDIR/usr/lib/gstreamer-1.0` — a
directory that now exists and holds the plugins. No `AppRun` hand-patch and no
environment masking is needed: the masking becomes harmless because the
directory it points at is populated.

**Ordering consequence (important):** the plugin set is copied from the **build
host's** `/usr/lib/gstreamer-1.0` at bundle time. `autoaudiosrc`, `alsasrc` and
`pulsesrc` are absent on this host today, so a bundle built before the plugin
install would bundle a set that still lacks them. **The install must precede the
rebuild.** This is the concrete sense in which E6 and the flag are both needed
and neither is sufficient alone.

## 3. Host facts that decide whether the embedded script can even run here

| Probe | Result | Exit |
| --- | --- | --- |
| `ls /usr/lib/gstreamer-1.0/*.so \| wc -l` | `113` (includes `libgstapp.so`) | 0 |
| `ls -d /usr/lib/x86_64-linux-gnu/gstreamer-1.0` | does not exist → the guess falls through to `/usr/lib/gstreamer-1.0`, which does exist | 1 |
| `ls /usr/lib/gstreamer-1.0/gst-plugin-scanner` | present | 0 |
| `ls -d /usr/lib/gstreamer1.0/gstreamer-1.0` | **absent** — Arch keeps helpers in `/usr/lib/gstreamer-1.0/`, not in the Debian-style helpers dir the script guesses | 1 |
| `type -a patchelf` / `ls /usr/bin/patchelf` | **not installed** | 1 |
| `ls ~/.cache/tauri/` | `AppRun-x86_64`, `linuxdeploy-07333c6-x86_64.AppImage` (2026-10-02), `linuxdeploy-plugin-appimage.AppImage`, `linuxdeploy-plugin-gtk.sh`, **`linuxdeploy-plugin-gstreamer.sh`** (4858 B, 2026-10-01) | 0 |

Two of these are **unknowns that a trial build must settle**, and this package
does not guess past them:

- **U-1 `patchelf`.** The embedded script exits 2 with `Error: patchelf not
  found` when neither `which` nor `type` finds it, and `patchelf` is absent from
  this host. Whether `linuxdeploy` puts its own bundled `patchelf` on the
  plugin's `PATH` is **not established** here — no disassembly of the call site
  was done. If it does not, the AppImage bundle step fails outright.
- **U-2 the helpers dir.** The guessed helpers path does not exist on Arch, so
  the copy loop finds nothing and `gst-plugin-scanner` would **not** be bundled,
  leaving `GST_PLUGIN_SCANNER_1_0` pointing at a file that is not there. The
  plugins themselves would still be bundled. Whether GStreamer then falls back to
  in-process scanning is **not established** here (it is upstream behaviour, not
  something this repository can prove). `GSTREAMER_HELPERS_DIR` is the script's
  own documented override; a build-env value, not a config key.

Neither unknown blocks the proposal; both must be checked by the trial build's
own output before any capture row runs.

## 4. Inference, marked as inference

The string table of the CLI binary contains, adjacent to each other,
`--verbosity`, `gtk`, `gstreamer`, `failed to run linuxdeploy`. That is
**consistent with** `linuxdeploy` being invoked with a plugin list that gains
`gstreamer` when this flag is set, and with the GStreamer plugin script being
downloaded to `~/.cache/tauri/` — which is present. The exact call site was not
disassembled (the Rust code is inlined), so **this one link is inference**. It is
corroborated, not proven, by the cached `linuxdeploy-plugin-gstreamer.sh`, whose
first lines match the embedded copy. Provenance of that cached file (which build
or which machine fetched it) is **unknown**; no download is needed for a trial
build, and no download is proposed.

## 5. What is *not* claimed

- No claim that the flag alone makes capture work. It makes the **host's**
  plugins visible inside the AppImage; it cannot add plugins the host does not
  have.
- No claim about release builds. Setting the key in `tauri.conf.json` also
  applies to `npm run tauri:build` (the shipping AppImage), which grows by
  ~15–35 MB per the schema text and touches L-POLICY's row "System libraries
  bundled into an AppImage … public distribution requires owner review". Setting
  it in `tauri.test.conf.json` (the `--config` overlay used by
  `tauri:build:test`) applies to test builds only. That is why the proposal puts
  the choice to the owner rather than picking.
- No claim that `bad` plugins are excluded. The script's help text mentions
  `GSTREAMER_INCLUDE_BAD_PLUGINS` (default disabled) but the embedded copy loop
  visible in the strings shows a plain `cp` of everything in the directory; the
  filtering, if any, was not located. **Unknown**, and not load-bearing for the
  capture rows.
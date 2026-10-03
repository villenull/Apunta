# Scanner resolution — flag, helpers override, and `appimage.files`

Read-only. No app, server, database, build, install, download, network,
microphone, audio, display or port 7717 was used. Only files already on this
machine were read, and the one subprocess was `bash -n` (parse only, no
execution). `verify.mjs` and `verify-output.txt` in this directory are the
machine-checked half of what follows.

This file answers IR-03/IR-04: the `bundleMediaFramework` flag copies the
host's plugins, but on Arch it does **not** copy `gst-plugin-scanner`, and the
proposal must not claim it does. It records the two candidate fixes, why the
supported build-command one is preferred, and what is still not proven.

## 1. The flag copies plugins; the scanner comes from a guessed helpers dir

The cached plugin script is byte-identical to the CLI-embedded copy
(`environment-proposal-ir/patchelf-resolution.md` §1). Its plugin-source guess
falls through to `/usr/lib/gstreamer-1.0` on Arch (that directory exists, the
Debian path does not). Its **helpers** dir is a separate guess, and there is no
fall-through:

```sh
# linuxdeploy-plugin-gstreamer.sh:85-89
if [ "$GSTREAMER_HELPERS_DIR" != "" ]; then
    helpers_dir="${GSTREAMER_HELPERS_DIR}"
else
    helpers_dir=/usr/lib/$(uname -m)-linux-gnu/gstreamer"$GSTREAMER_VERSION"/gstreamer-"$GSTREAMER_VERSION"
fi
```

The guess is `/usr/lib/x86_64-linux-gnu/gstreamer1.0/gstreamer-1.0`, which does
not exist on Arch (`bundle-media-framework-option.md` §3, exit 1). The copy loop
over `$helpers_dir/*` then finds nothing, and the hook still points
`GST_PLUGIN_SCANNER_1_0` at the file that was never copied. So the flag alone
cannot close the scanner gap on this host. That is IR-04, stated rather than
papered over.

## 2. Host scanner, the local primary

```
$ pacman -Ql gstreamer | grep -i scanner
gstreamer /usr/lib/gstreamer-1.0/gst-hotdoc-plugins-scanner
gstreamer /usr/lib/gstreamer-1.0/gst-plugin-scanner
```

`/usr/lib/gstreamer-1.0/gst-plugin-scanner` exists and is mode 755
(`verify.mjs`, both PASS). Arch keeps helpers beside the plugins, not in the
Debian-style helpers directory the script guesses.

## 3. `GSTREAMER_HELPERS_DIR` is the script's own supported override

The script documents it (`linuxdeploy-plugin-gstreamer.sh:23`):

```
GSTREAMER_HELPERS_DIR="..." (directory containing GStreamer helper tools like gst-plugin-scanner; default: guessed based on main distro architecture)
```

Setting it replaces the guess. The helpers copy loop then copies **every** file
in that directory into
`$APPDIR/usr/lib/gstreamer1.0/gstreamer-1.0/` and `patchelf --set-rpath`es each.
Pointing it directly at `/usr/lib/gstreamer-1.0` would copy the 113 plugin
libraries a second time and re-patch them as helpers, so the prepared repair
uses a dedicated scratch directory holding **only** the scanner.

`verify.mjs` resolves the script's own strings and confirms the hook path sits
under the helpers target:

```
PASS hook scanner path sits under helpers_target_dir
     /usr/lib/gstreamer1.0/gstreamer-1.0/gst-plugin-scanner
     under /usr/lib/gstreamer1.0/gstreamer-1.0
scanner target: $APPDIR/usr/lib/gstreamer1.0/gstreamer-1.0/gst-plugin-scanner
```

## 4. Prepared build-command repair (not adopted, not run)

This is the supported, evidence-backed alternative to a config-file mapping. It
is a build-command repair, so the config delta stays exactly one key
(`bundle.linux.appimage.bundleMediaFramework`). It is git-ignored scratch, not a
new source file or grant.

```sh
# once, after the owner's install and before V2's rebuild
mkdir -p build/p3.5-env-repair/gst-helpers
cp /usr/lib/gstreamer-1.0/gst-plugin-scanner build/p3.5-env-repair/gst-helpers/
export GSTREAMER_HELPERS_DIR="$PWD/build/p3.5-env-repair/gst-helpers"
# V2's existing command, with cargo on PATH (mechanical, IR-07)
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$HOME/.cargo/bin:$PATH"
npm run tauri:build:test
```

`bash -n` parses the snippet, exit 0. Nothing is copied or built here. After the
build, the bundle must carry the scanner at
`$APPDIR/usr/lib/gstreamer1.0/gstreamer-1.0/gst-plugin-scanner`, and step 2 of
the proposal asserts `test -x` before any dry inspection, so a missing scanner
cannot read as a pass.

**Not proven here:** that the Tauri CLI and `linuxdeploy` pass
`GSTREAMER_HELPERS_DIR` through to the plugin script as a child process
environment. Environment inheritance is the expected behaviour and the variable
is the script's own documented input, but this package did not run a build to
observe it. If it does not arrive, step 1 fails visibly (the scanner is absent
from the bundle) and the honest answer is a bounded follow-up, not a workaround.

## 5. `appimage.files` — investigated, direction not established

IR-03/IR-04 asked for the local schema's `AppImageConfig.files` mapping to be
checked before assuming it can place one scanner file. It was checked:

- The installed `@tauri-apps/cli` 2.12.1 `config.schema.json` declares `files`
  as `"type": "object"`, `additionalProperties: {"type": "string"}`, described
  only as "The files to include in the Appimage Binary."
- The installed Rust primary, `tauri-utils-2.10.1/src/config.rs`, declares:

```rust
pub struct AppImageConfig {
  #[serde(default, alias = "bundle-media-framework")]
  pub bundle_media_framework: bool,
  /// The files to include in the Appimage Binary.
  #[serde(default)]
  pub files: HashMap<PathBuf, PathBuf>,
}
```

`verify.mjs` confirms the type and confirms the installed primary states **no**
target/source direction (no `target`, `source` or `destination` wording in the
struct). The bundler crate that consumes the map is not installed locally, so
its key direction cannot be read from a primary here.

**Conclusion:** a one-entry `files` mapping is plausible but its direction is
not established by an installed primary, and the task's own instruction is to
prefer a supported route over an unsupported assumption. The `appimage.files`
route is therefore **not** proposed. If the owner wants a config-only route
later, the bundler source must be read first to fix the direction; until then
the helpers-directory command repair in §4 is the prepared fix.

## 6. What this file does not claim

- It does not claim the flag copies the scanner by itself (it does not, on
  Arch).
- It does not claim the helpers-directory repair has been built or observed; it
  is prepared, and §4 states the one unproven link.
- It proposes no `AppRun` binary patch and no hypothetical fallback: the
  scanner is placed by the script's own supported variable.
- It reads no AppImage runtime, runs no AppImage and starts no daemon.

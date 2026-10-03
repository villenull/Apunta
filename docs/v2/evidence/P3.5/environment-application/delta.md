# AM-190 — original config and the full delta

Baseline: `HEAD:src-tauri/tauri.conf.json` at commit `375d3c1` (branch `main`),
SHA-256 `3ff6aa5a78cd782e92a3694e9d85b84f519d0ea06beadd7f635d93f6b57cd563`,
737 bytes. Applied file: 824 bytes, SHA-256
`e91c7e5760da2d2dee460cfe70b579312201dda78255ee26388bcdc36e7de923`.

## Original config, in full (`HEAD`, before)

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Apunta",
  "version": "0.0.0",
  "identifier": "app.apunta.desktop",
  "build": {
    "frontendDist": "ui"
  },
  "app": {
    "withGlobalTauri": false,
    "windows": [],
    "security": {
      "csp": null,
      "capabilities": []
    }
  },
  "bundle": {
    "active": true,
    "targets": ["appimage"],
    "category": "Utility",
    "shortDescription": "Apunta",
    "longDescription": "Local-first clinical note drafting.",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "resources": {
      "../build/linux-resources/": "linux-resources/"
    }
  }
}
```

## Textual delta, in full (`git diff -- src-tauri/tauri.conf.json`)

Verbatim, also saved as `config.diff`:

```diff
diff --git i/src-tauri/tauri.conf.json w/src-tauri/tauri.conf.json
index 1d748ed..c9a9125 100644
--- i/src-tauri/tauri.conf.json
+++ w/src-tauri/tauri.conf.json
@@ -29,6 +29,11 @@
     ],
     "resources": {
       "../build/linux-resources/": "linux-resources/"
+    },
+    "linux": {
+      "appimage": {
+        "bundleMediaFramework": true
+      }
     }
   }
 }
```

One hunk. Five added lines. **Zero** removed, **zero** modified lines. The last
`resources` member changes only by gaining a trailing comma, which is the JSON
comma the new sibling object requires — the mapping itself is byte-identical.

## Semantic delta, in full

The whole document, parsed and compared leaf by leaf against the baseline, is
one addition and nothing else:

```
added bundle.linux.appimage.bundleMediaFramework = true
```

- **Added:** `bundle.linux.appimage.bundleMediaFramework`, boolean `true`.
- **Removed:** none.
- **Replaced:** none. This includes no change of type anywhere — the diff counts
  `1` vs `"1"` as a replacement, so a silently retyped value could not pass as
  "nothing else changed".

Restating the baseline with that single key produces the current document
exactly, and the tail of the current file is byte-equal to the proposal's Option
A *After* block (`state/P3.5-ENVIRONMENT-PROPOSAL.md` §2a). Both facts are
asserted in `apply-checks.mjs`.

## Applied config, in full (after)

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Apunta",
  "version": "0.0.0",
  "identifier": "app.apunta.desktop",
  "build": {
    "frontendDist": "ui"
  },
  "app": {
    "withGlobalTauri": false,
    "windows": [],
    "security": {
      "csp": null,
      "capabilities": []
    }
  },
  "bundle": {
    "active": true,
    "targets": ["appimage"],
    "category": "Utility",
    "shortDescription": "Apunta",
    "longDescription": "Local-first clinical note drafting.",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "resources": {
      "../build/linux-resources/": "linux-resources/"
    },
    "linux": {
      "appimage": {
        "bundleMediaFramework": true
      }
    }
  }
}
```

## Explicitly not part of the delta

- `src-tauri/tauri.test.conf.json` — untouched, byte-identical to `HEAD`
  (`3e109252…a1760`). Option B's key was **not** added as well; the owner chose
  one variant and the overlay stays as it was.
- `bundle.resources` — the `../build/linux-resources/` → `linux-resources/`
  mapping is unchanged.
- `app.security` — `csp` is still `null` and `capabilities` is still `[]`.
  No capability, no permission set, no CSP.
- No `bundle.appimage` object other than the new `linux.appimage` block, so no
  `files` mapping: the `appimage.files` direction is still not established from
  an installed primary (`environment-proposal-repair/scanner-resolution.md` §5)
  and none is invented here.
- No permission file, no `main.rs`, no `build.rs`, no helper, no build script, no
  server, web, shared or installer source.
- No `GSTREAMER_HELPERS_DIR`, no helpers directory, no scanner copy: the scanner
  environment stays the approved prepared source
  (`environment-proposal-repair/scanner-resolution.md` §3–§4 and
  `environment-proposal-repair2/verify.mjs:174-176`) and is applied by the root
  at install/build time.

## Why this key, and what it does not prove

`bundle.linux.appimage.bundleMediaFramework` is a supported key of the
installed `@tauri-apps/cli` 2.12.1 schema (`default: false`); `true` tells the
AppImage bundler to copy the host's media framework and install an AppRun hook
pointing at it, which is what the missing `libgstapp.so`/`appsink` inside the
bundle needs.

Schema validity is **not** bundler behaviour. Nothing here was built, bundled or
previewed, so what a rebuild does with the key, whether the plugins appear, and
whether `GSTREAMER_HELPERS_DIR` reaches the plugin script (the proposal's U-2)
all remain unobserved. Those are the install/build/capture rows the root runs.
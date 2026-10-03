# ENV-P2 — synthetic config validation of the proposed key

Script: `docs/v2/evidence/P3.5/environment-proposal/config-parse-check.mjs`.
Pure read-only: it parses the two shipped configs, merges the proposed key into
a **copy**, and validates against the locally installed
`@tauri-apps/cli` `config.schema.json` with `ajv` 6.15.0 from `node_modules`.
Nothing is written to any config, no `tauri` command is run, no build happens.

The two `control:` rows are deliberate: they must come back INVALID, otherwise
"VALID" above them would mean nothing.

```
$ node docs/v2/evidence/P3.5/environment-proposal/config-parse-check.mjs
VALID   as shipped: tauri.conf.json
VALID   as shipped: tauri.test.conf.json
VALID   proposed: tauri.conf.json + bundle.linux.appimage.bundleMediaFramework=true
VALID   proposed: tauri.test.conf.json + same key
INVALID control: string value (must be invalid)
    / should be boolean
INVALID control: extra key in appimage (must be invalid)
    / should NOT have additional properties
--- merged shipping config, bundle object ---
{
  "active": true,
  "targets": [
    "appimage"
  ],
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
exit 0
```

Exit 0 means: both shipped configs validate, the proposed one-key addition
validates in either file, and both negative controls were rejected.

Two limits, stated so nobody over-reads this:

1. **Schema validity is not bundler behaviour.** This proves the key is spelled
   correctly and accepted; it proves nothing about what a build then does. That
   is ENV-P1 §2–§3 plus the trial build in the proposal's validation plan.
2. **`tauri.test.conf.json` is an overlay**, passed with `--config` by
   `package.json`'s `tauri:build:test`. A key placed there reaches the test
   build and not the shipping build. That is read from the local
   `package.json` and the two config files; it was not exercised by a build.

Numeric formats in the Tauri schema (`double`, `uint8`, `uint32`, …) are not in
ajv's set, so the script registers every format the schema declares as a finite
number. That is a local accommodation of the validator, not a change to the
schema and not a relaxation of anything this proposal asserts.
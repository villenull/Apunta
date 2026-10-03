# AM-190 application — the approved base config key, applied

Owner decision `P3.5.ownerDecisions.captureEnvironmentPackage` =
**"APPROVED base config AM-190"** selects **Option A** of
`docs/v2/state/P3.5-ENVIRONMENT-PROPOSAL.md` §2a/§3: the single key
`bundle.linux.appimage.bundleMediaFramework = true` in the **shipping**
`src-tauri/tauri.conf.json`.

This directory is the evidence for that one edit. Nothing else in the repository
was changed.

## What was written

| Path | Change |
| --- | --- |
| `src-tauri/tauri.conf.json` | one key added: `bundle.linux.appimage.bundleMediaFramework = true` |
| `docs/v2/evidence/P3.5/environment-application/**` | this evidence (new) |

Scratch stayed in git-ignored `build/p3.5-env-apply/` (the two pre-edit copies
kept only as a local cross-check; the checks read their baseline from git, not
from those files).

| File | Bytes | SHA-256 |
| --- | --- | --- |
| `src-tauri/tauri.conf.json` @ `HEAD` (before) | 737 | `3ff6aa5a78cd782e92a3694e9d85b84f519d0ea06beadd7f635d93f6b57cd563` |
| `src-tauri/tauri.conf.json` now | 824 | `e91c7e5760da2d2dee460cfe70b579312201dda78255ee26388bcdc36e7de923` |
| `src-tauri/tauri.test.conf.json` @ `HEAD` and now (identical) | 130 | `3e109252d57fd38fbfe7e23bb2d9fa93ce499cb5381f451f31ede6b36d5a1760` |

## The delta, in full

`config.diff` is the verbatim `git diff -- src-tauri/tauri.conf.json`: one hunk,
five added lines, zero removed and zero modified. `delta.md` carries the whole
before and after documents and the semantic statement.

Semantically the change is **one added leaf** and nothing else:

```
added bundle.linux.appimage.bundleMediaFramework = true
```

## What was verified, and how

`apply-checks.mjs` (pinned Node v24.19.0, exit 0, 41 checks, output in
`output.txt`):

1. **Exactly one key, semantically.** A recursive structural diff of
   `HEAD:src-tauri/tauri.conf.json` against the file on disk reports one added
   leaf at exactly `bundle.linux.appimage.bundleMediaFramework` with value
   boolean `true`, and **zero** removals and **zero** replacements. Re-adding
   that one key to the baseline reproduces the current document exactly. The
   file's tail is additionally compared verbatim against the proposal's Option A
   *After* block, so this edit is tied to the approved wording rather than to my
   reading of it.
2. **Installed-schema validation.** The file as it stands is validated with
   `ajv` 6.15.0 against the **locally installed**
   `@tauri-apps/cli` 2.12.1 `config.schema.json`: **VALID**. Negative controls
   are required to fail, and do: a string `"true"` is rejected
   (`/ should be boolean`) and an extra key in `appimage` is rejected
   (`/ should NOT have additional properties`). `false` is accepted, and the
   installed schema does declare the key with a `false` default.
3. **The checks discriminate.** The delta checker is run over five synthetic
   pairs in memory (a second added key, a changed value, a deleted key, a
   wrong-typed value, an identical document), so "exactly one key" is not a
   checker that passes everything.
4. **The exclusions hold.** `bundle.resources`, `app.security` (still `csp:
   null`, `capabilities: []`), `app.withGlobalTauri`, `app.windows`,
   `build.frontendDist`, `identifier`, `productName`, `version`, `bundle.active`,
   `bundle.targets`, `bundle.category`, `bundle.icon` and `bundle.longDescription`
   are all unchanged. There is **no** `bundle.appimage.files` mapping. The test
   overlay `src-tauri/tauri.test.conf.json` is byte-identical to `HEAD`, so
   Option B was **not** also applied. Across `src-tauri/`, `scripts/`, `web/`,
   `server/`, `shared/` and `installer/` the only changed file is the shipping
   config: no `permissions.rs`, no `main.rs`, no `build.rs`, no helper, no build
   script, no test overlay edit.
5. **Nothing staged or committed.** Asserted by the same script.
6. **Independent second opinion.** The proposal's own
   `environment-proposal/config-parse-check.mjs` was re-run **unmodified**
   against the now-applied file and still exits 0 with its two negative controls
   rejected (`config-parse-check-output.txt`). `prettier --check` on the config
   and on the new script exits 0; `eslint` on the new script exits 0.

## What was NOT done, by design

The task grants configuration preparation only, and the root handles
installation and serialisation. So, in this session:

- **No install.** No `pacman`, no `pkexec`, no polkit prompt, no package download.
  The package install and the code/unit attempt 3 were already owner-granted and
  remain with the root.
- **No build.** No `tauri build`, no `tauri bundle`, no `cargo`, no
  `npm run tauri:build:test`, no `npm run tauri:build`.
- **No preflight run.** The proposal's §7 step 0 prerequisite read was **not**
  executed, and no `gst-inspect-1.0`, `patchelf` or scanner existence check was
  run.
- **No capture, no app, no server, no database, no model, no audio, no `pactl`,
  no microphone, no network, no port 7717, no sandbox run.**
- **No attempt 4, no public distribution.** L-POLICY's public-distribution
  review that Option A triggers stays a separate later step, as the proposal
  states.
- **No card, manifest, checkpoint or state edit.** `cards/P3.5.json`,
  `ACQUISITION.md`, `AMENDMENTS.md`, `OWNER-ACTIONS.md`, `HANDOFF.md` and
  everything else are untouched; no new `appimage.files` mapping; no new test
  overlay key.

Two writers are in flight in this tree (`docs/v2/tools/build-dispatch.*` and
`docs/v2/evidence/P3.4/attempt-5/`); their paths were neither read for
authority nor written to, and nothing of theirs is staged.

## The scanner environment is the approved prepared source, not a new one

The one key alone does **not** bundle `gst-plugin-scanner` on Arch
(IR-04, `evidence/P3.5/environment-proposal-repair/scanner-resolution.md` §1).
The scanner handling for the eventual rebuild is therefore the **already
prepared** source, unchanged and re-verified here by reference:

- `evidence/P3.5/environment-proposal-repair/scanner-resolution.md` §3–§4 — the
  plugin script's own documented `GSTREAMER_HELPERS_DIR`
  (`linuxdeploy-plugin-gstreamer.sh:23`, selected at `:85-89`) pointed at a
  git-ignored scratch directory holding **only** the copied
  `/usr/lib/gstreamer-1.0/gst-plugin-scanner`, plus the pinned-`PATH` export and
  `npm run tauri:build:test`.
- `evidence/P3.5/environment-proposal-repair2/verify.mjs:174-176` — the same
  snippet, machine-checked, so the env the future build inherits is a verified
  prepared artefact rather than anything written here.
- `state/P3.5-ENVIRONMENT-PROPOSAL.md` §2c and §7 steps 0–2 — when it runs:
  step 0 fail-closed prerequisite read must exit 0, step 1 is V2's existing
  rebuild row, step 2 is the dry per-element visibility check with a fresh
  scratch registry, and only then the capture rows.

No helpers directory was created and no environment variable was exported in
this session: `mkdir -p`, `cp` of the scanner and `export` all belong to the
install/build step the root runs. `GSTREAMER_HELPERS_DIR` reaching the plugin
script remains the proposal's stated, unobserved unknown (U-2).

## Reproduce

```sh
cd /home/villenull/Projects/Apunta
N=$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node
$N docs/v2/evidence/P3.5/environment-application/apply-checks.mjs   # exit 0
$N docs/v2/evidence/P3.5/environment-proposal/config-parse-check.mjs # exit 0
./node_modules/.bin/prettier --check src-tauri/tauri.conf.json \
  docs/v2/evidence/P3.5/environment-application/apply-checks.mjs    # exit 0
./node_modules/.bin/eslint docs/v2/evidence/P3.5/environment-application/apply-checks.mjs
```

`commands.md` lists every command with its exit code. The root reviews this
config independently before any build.
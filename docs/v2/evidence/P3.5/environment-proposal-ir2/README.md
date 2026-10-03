# P3.5 environment-proposal IR-2 — evidence

Read-only. This directory is the evidence for the second independent review of
`docs/v2/state/P3.5-ENVIRONMENT-PROPOSAL.md` at candidate `e88a13a` and its
repair evidence `docs/v2/evidence/P3.5/environment-proposal-repair/`.

Nothing was adopted or edited: no proposal, card, config, manifest, checkpoint
or owner-action file was touched; nothing was staged or committed. No app,
server, build, database, model, audio, microphone, input, display, download,
install, network or port 7717 was used. The subprocesses are read-only
(`bash` on short snippets, `gst-inspect-1.0`, `command -v`, `test`).

- `ir2-checks.mjs` — the independent checks. `process.stdout.write` only, no
  `console`. Run with the pinned Node 24.19.0 and a 30-second external timeout:
  exit 0, `ALL CHECKS PASS`.
- `output.txt` — its verbatim output.

## What the checks establish

1. **Length** — the proposal is 249 lines, within the requested ≤250.
2. **A03** — the proposed *Source* cell (read out of the proposal, not
   restated) keeps `Ubuntu archive via apt`, adds the narrow Arch/`pacman`
   case, names `gst-plugins-base`, `gst-plugins-good` and `patchelf`
   explicitly, stays "this Arch host only", and carries no general
   "Tauri Linux prerequisites" clause and no `INSTALL.md`/`archlinux.org`
   citation.
3. **A10** — the proposal's nine names are exactly the nine on the observed
   redirect (`user_id`, `response-content-disposition`, `xip`,
   `X-Xet-Cas-Uid`, `Expires`, `Policy`, `Signature`, `Key-Pair-Id`,
   `Hash-Algorithm`), match the acquisition record field for field, exclude
   A07's tenth name `response-content-type`, name `us.aws.cdn.hf.co`, write no
   key values, and claim no retroactive grant and no redownload.
4. **Config** — both variants differ from today by exactly the one supported
   key; the base has no `bundle.linux` and the test overlay no `bundle` today.
5. **Scanner** — the cached `linuxdeploy-plugin-gstreamer.sh` documents
   `GSTREAMER_HELPERS_DIR`, copies from `$helpers_dir` and `patchelf
   --set-rpath`s the helpers; the hook's scanner path is the prepared Arch
   target; the host scanner exists and is executable; the proposal points the
   override at a scratch dir holding only the copied scanner and marks the
   helpers-env inheritance as unproven (not a contradiction).
6. **The preflight defect** — the exact `'step 0 prereq read'` snippet is
   extracted from the repair's own `verify.mjs` and run against today's host
   (`patchelf` absent, `autoaudiosrc`/`alsasrc`/`pulsesrc` exit 255). It prints
   `FAIL: patchelf absent` and `MISSING …`, yet **exits 0**. The fail-closed
   form the proposal's acceptance requires (`command -v patchelf` and each
   `gst-inspect-1.0` asserted, not `|| echo`) exits 1. This is the one
   bounded defect the review reports: the prepared preflight cannot stop the
   run, and it does not match the acceptance in §7 step 0.

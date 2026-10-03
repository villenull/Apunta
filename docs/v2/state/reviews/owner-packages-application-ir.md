# Owner packages application — independent integration review

**Scope.** Fresh, independent review of the mechanical application of the four
owner choices `AM-188`–`AM-191` to the tree at `main` = `507c026`, over the
scoped commits `b077d1a`, `6974943`, `c8abfc5`, `507c026` (plus the in-range
state-only `5bebe42`, O-2). It checks that the application does what the owner
approved, not whether the owner's choices were right, and not the in-flight
P3.4 feature files.

**Inputs read.** `CLAUDE.md`, `docs/v2/HARD-STOPS.md`, `docs/v2/COORDINATOR.md`,
`docs/v2/RUN-CONFIG.md` (status words), `docs/v2/state/AMENDMENTS.md`
(`AM-188`–`AM-191`), `P3.4-REPAIR-PROPOSAL-v5.md` §§C–F/§I/§J,
`P3.5-ENVIRONMENT-PROPOSAL.md` §§2–7, the two cards, both checkpoints, the
`ACQUISITION.md` A03/A10 rows, and the new tooling and evidence.

**Constraints honoured.** No app, server, database, model, audio, input,
`pactl`, network, install, port 7717 or build was run; no acceptance row
(V0–V5) was executed. The working tree's `web/src/main.tsx` and
`scripts/v2/tauri-security.test.mjs` (writer `9b1b88ff`) were not read or
touched; the committed HEAD versions were read only to confirm the amendment's
"before" anchors. Nothing was staged or committed. Only
`docs/v2/state/reviews/owner-packages-application-ir.md`,
`docs/v2/evidence/owner-packages-application-review/**` and git-ignored
`build/owner-package-ir/` were written.

---

## 1. Verdict

**CLEAR on the mechanical application.** Every owner-approved change is present,
correctly scoped, and reproduces its intended behaviour. One **bounded candidate
defect in the evidence only (E-1)** and two observations (O-1, O-2) are recorded
below; none is in the shipped config, the card text, or the tool logic.

---

## 2. P3.4 tooling (`AM-189`) — all checks pass

`docs/v2/tools/build-dispatch.mjs` guard (`:151-183`) matches §I.1: `--attempt 4`
or `5` requires an `AM-\d{3}` exception; `5` additionally requires
`id === 'P3.4'`; `>= 6` is refused for every card. The attempt line (`:354-370`)
is one branch per attempt, not arithmetic, so attempt 4's sentence is
byte-identical.

| Check | Result |
| --- | --- |
| `--attempt 5` only for `P3.4`, only with well-formed `AM-nnn` | PASS — `T1`/`T2`/`T3`, and 20 refusal + 3 permitted matrix rows |
| `>= 6` refused for every card in all three modes | PASS — 60/60 matrix rows (`T4`; matrix) |
| attempt-4 line + failure message byte-unchanged | PASS — `T5`/`T5b`; the four shipped dispatches (`S2.5.md`, `P3.4.md`, `P4.1.md`, `P4.1-ir.md`) regenerate byte for byte |
| defaulted card-id / H1 follows the id | PASS — `makePlan(..., id='T1')`/`card(..., id='T1')`; every id-less call byte-identical |
| dependency gate unchanged | PASS — exit 3 with `S2.5` unapproved (`extra` case; matrix row) |
| prior 25 tests retained + 14 new | PASS — 9 `plan-lib` + 4 `check-plan` + 12 prior `build-dispatch` = 25, none deleted; +14 = 26 in `build-dispatch`; 39 total, 0 fail |
| reviewed ir4 probe, unmodified, against the shipped tool | PASS — 14/14 |
| guard matrix | PASS — `113/113 rows as expected; 0 mismatches`, exit 0 |
| `--print` attempt-5 invocation writes nothing | PASS — exit 0, `git status` clean; `dispatch/P3.4.md` still attempt 4 |
| `check-plan` after the cell fix | PASS — `71 cards … no cycles`, exit 0 |

The malformed-amendment refusal fires before the keyed-card refusal, as the
proposal's order requires. Scoped `eslint`/`prettier --check` on the tool and
evidence scripts exit 0. The optional A06 producer guard is absent/PARKED.

## 3. P3.4 root card amendments (`AM-188`) — match the package

`docs/v2/cards/P3.4.md` changed in exactly three places (hunks at `:184`, `:551`,
`:593`), all additions/rewrites of the approved package, no deletions of a
threshold:

- **Named fact bullet** (`:176-190`) adds `ipc`, `ipcInvoke`, `ipcProbe`,
  `ipcProbeMsg`, `vpW`/`vpH`, `ptrN`, `ptrCX`/`ptrCY`, `clickN`,
  `clickCX`/`clickCY`, `clickTag`/`clickTestId`/`clickText` from one pointer and
  one capture-phase click listener inside the existing hook/gate/poll, and the
  epoch/global-index/calibration/one-click/landing contracts — §C/§D.
- **V2(a)** (`:551`) replaces the impossible `tauriInternals === 'undefined'`
  conjunct with `ipc`/`ipcInvoke` live plus `ipcProbe === 'rejected'` and
  `ipcProbeMsg` exactly ``Command plugin:event|listen not allowed by ACL``, and
  **keeps** the existing 30-second assertion deadline — §F.3.
- **Two-arm cascade** (`:593`) distinguishes zero marker lines from marker lines
  that never carried `href` and `ipcProbe` together — §F.4.

The V2 row's IPC pipe is escaped (`plugin:event\|listen`, `6974943`), so
`check-plan` parses the row as 3 cells. No timeout, predicate, pass condition or
acceptance row was softened; the 45 s first-fact and 30 s click/assertion windows
are unchanged (the committed HEAD harness still carries `45_000` and `30_000`,
and its old `assertNoIpc` at `:960-973` is the proposal's named before-text). The
card's May edit still names exactly the two feature files `web/src/main.tsx` and
`scripts/v2/tauri-security.test.mjs`.

## 4. P3.5 base config (`AM-190`) — exact one-key delta

`src-tauri/tauri.conf.json` `@c8abfc5` `3ff6aa5a…cd563` (737 B) →
`@507c026` `e91c7e57…de923` (824 B). `git diff` is one hunk, five added lines,
zero removed/modified; `config.diff` is byte-identical to the live diff
(`index 1d748ed..c9a9125`). The semantic delta is exactly one added boolean leaf
`bundle.linux.appimage.bundleMediaFramework = true`; re-adding it to the baseline
reproduces the document exactly, and the file tail equals the proposal's Option A
*After* block verbatim.

- **Schema:** `@tauri-apps/cli` 2.12.1 `config.schema.json` via `ajv` 6.15.0 —
  VALID, with both negative controls rejected (`"true"` → *should be boolean*;
  extra `appimage` key → *should NOT have additional properties*) and `false`
  accepted. The proposal's own `config-parse-check.mjs`, unmodified, also exits 0
  with the same two controls. Negative controls are present, so the VALID result
  discriminates.
- **Unchanged:** `bundle.resources`, `app.security` (`csp: null`,
  `capabilities: []`), `app.withGlobalTauri`, `app.windows`,
  `build.frontendDist`, identifier/product/version, bundle active/targets/
  category/icon/longDescription; no `appimage.files`; the test overlay
  `tauri.test.conf.json` is byte-identical to `c8abfc5`
  (`3e109252…a1760`) — Option B was not also applied. Across
  `src-tauri/scripts/web/server/shared/installer` the only changed path is the
  shipping config.

## 5. P3.5 root card amendments (`AM-190`) — match the package

`docs/v2/cards/P3.5.md` changed in exactly V0/V1/V2 (6 lines; V3/V4/V5
untouched):

- **V0** adds the fail-closed `DEF=$(pactl get-default-source) && test -n "$DEF"
  && test "$DEF" != apunta_p35_mic`, with no `or` arm that can pass on the
  virtual source, and the Expected now truthfully names a PipeWire-backed Pulse
  server read via `pactl get-default-source` — §6.
- **V1** adds `-stream_loop -1 … -i … -t 30` and an independent `ffprobe`
  duration, preserving the 30-second outcome, the filename and every pinned
  threshold — §6.
- **V2** adds `export PATH="$HOME/.cargo/bin:$PATH"` and the
  `GSTREAMER_HELPERS_DIR` export with `test -x …/gst-plugin-scanner` — §6.

All three parse (`bash -n` exit 0) and match the approved package.

## 6. Manifest (`AM-190`/`AM-191`)

- **A03** keeps `Ubuntu archive via apt` and adds, on this Arch host only,
  `pacman` for exactly three named packages: `gst-plugins-base`,
  `gst-plugins-good` (P3.5 failing-test trigger) and `patchelf` (AM-190). No
  blanket prerequisite clause; *Allowed query keys* stays `none`, *Shipped?*
  stays `no (system)`, the card column stays `P3.3, P3.5`.
- **A10** admits exactly the nine observed names (`user_id`,
  `response-content-disposition`, `xip`, `X-Xet-Cas-Uid`, `Expires`, `Policy`,
  `Signature`, `Key-Pair-Id`, `Hash-Algorithm`), names only, on
  `us.aws.cdn.hf.co` only; the redirect cell names that host and nothing wider.
  Rule 1 is untouched, and the prior rule-1 violation remains recorded in
  `evidence/P3.5/acquisitions.md:88-132` with no retroactive grant and no
  redownload.

## 7. Bounded candidate defects and observations

### E-1 (bounded, evidence only) — the author checker is not 41/41 at committed HEAD

`apply-checks.mjs` **at `507c026` exits 1 with 40 PASS / 1 FAIL**:

```
FAIL the only changed file under src-tauri, scripts, web, server, shared, installer is the shipping config — none
1 CHECK(S) FAILED
```

Cause: that assertion (and `nothing is staged` / `no untracked sibling`) reads
the live `git status`, so it is a *pre-commit* assertion; after the config is
committed there is no working-tree change to find. Pinning the two baseline
reads to `c8abfc5` (as `COORDINATOR.md` records) makes the other 40 checks
reproducible, but not this one.

I reproduced the intended condition faithfully in a scratch `c8abfc5` checkout
with the one-key edit applied and uncommitted: **41 PASS, `ALL CHECKS PASS`,
exit 0** (`apply-checks-precommit-sim.txt`). So the checker's logic is sound and
the author's pre-commit 41/41 is real; the defect is that `COORDINATOR.md`'s
claim — "so the same verification remains reproducible after config
integration" — does not hold for the full 41 at a clean integrated HEAD, and no
post-commit invocation is documented. The shipped config, the card text and the
tool are unaffected; severity is low and evidence-only.

### O-1 (pre-existing, out of scope) — `DEPENDENCIES.md` is stale

`check-plan.mjs` without `--no-write` regenerates a different
`docs/v2/DEPENDENCIES.md` (37/36 lines, a reordering around `S3.3`/`S3.3a`),
i.e. the committed generated file no longer matches the current plan. None of
the reviewed commits touches it, so this is pre-existing state hygiene, not an
application defect. My first `check-plan` run rewrote it; the diff is preserved
as `DEPENDENCIES-regenerated.diff` and the file was restored with
`git checkout -- docs/v2/DEPENDENCIES.md` (tree clean afterwards).

### O-2 (in-range commit not in the brief) — `5bebe42`

The range `375d3c1..507c026` contains a fifth commit, `5bebe42` ("Track
authorized final P3.4 preparation and capture prerequisites"), not in the
four-commit list. It is state-only (`ORCHESTRATION-LOG.md`, `NEXT-SESSION.md`,
`OWNER-ACTIONS.md`, `state/cards/P3.4.json`) and is what set `P3.4.json` to
`baseCommit 6974943`, `attempt 5`, `status IN PROGRESS`. It changes no source,
config, card or tool; noted so the integration record is complete.

## 8. Commands, exits, write paths

See `docs/v2/evidence/owner-packages-application-review/commands.md` for the
full table and `**/*.txt` for captured output. Highlights: guard matrix
`113/113` exit 0; tool tests `39/39` (26+9+4) exit 0; ir4 probe `14/14` exit 0;
`check-plan` exit 0; `config-parse-check` exit 0; `apply-checks` 41/41 exit 0
pre-commit, 40/1 exit 1 at HEAD (E-1); scoped lint/format exit 0; `bash -n`
clean on all P3.4/P3.5 rows. Writes: this review, the evidence directory, and
git-ignored `build/owner-package-ir/`.

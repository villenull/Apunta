# P3.5 final attempt-3 runtime — execution brief (root)

**Do not execute until the P3.4 exclusive build lease releases.** Regenerate a
fresh dispatch at stable current HEAD (`--attempt 3 --port 7837`); the existing
`docs/v2/state/dispatch/P3.5.md` is the stale attempt-1/base-`8783181` dispatch
and must not be used. Card rows are the source of truth:
`docs/v2/cards/P3.5.md:692-697` (current card, with AM-190 command repairs).

## Prerequisites (fail-closed)

```sh
cd /home/villenull/Projects/Apunta
pgrep -af 'tauri build' && { echo 'P3.4 build still running; wait'; exit 1; }
ss -ltn | grep -E ':(7837|7839)\b' && { echo 'port busy'; exit 1; }
N="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node"
$N --version                                        # exactly v24.19.0
command -v patchelf gst-inspect-1.0 >/dev/null || exit 1
for e in appsink autoaudiosrc alsasrc pulsesrc; do
  gst-inspect-1.0 "$e" >/dev/null 2>&1 || { echo "FAIL: $e"; exit 1; }
done
test -x /usr/lib/gstreamer-1.0/gst-plugin-scanner || exit 1
test -x build/p3.5-env-repair/gst-helpers/gst-plugin-scanner || exit 1
```

STEP-0 already PASSed (`docs/v2/evidence/P3.5/environment-application/local-authentication-retry/report.md`);
the same read is re-run here as the gate before the build.

## Order — once each

1. **V0** — host probe, `docs/v2/cards/P3.5.md:692`. Write the exact output to
   `docs/v2/evidence/P3.5/V0-host-and-build.md` first. The sinks
   `grep -c apunta_p35` count is recorded (off the `&&` chain).
2. **V1** — 30 s fixture loop (`stream_loop -1 … -t 30`) + `silence-10s.wav`,
   `:693`.
3. **V2** — the single rebuild, `:694`. It exports
   `GSTREAMER_HELPERS_DIR="$PWD/build/p3.5-env-repair/gst-helpers"`, pinned
   `PATH` (Node + `~/.cargo/bin`), builds the flagged bundle, asserts the three
   marker counts, then `npm run tauri:build:test`. Do **not** run a second
   build. `web/dist` must stay unflagged.
4. **AM-190 dry plugin gate** — four separate `gst-inspect-1.0` reads inside
   `src-tauri/target/release/bundle/appimage/Apunta (test).AppDir`, fresh
   registry (`environment-proposal-repair2/verify.mjs:179-193`). **Must PASS
   before V3/V4.**
5. **V3** — `node scripts/v2/tauri-audio.test.mjs capture`, `:695`. Once.
6. **V4** — `tone` on 7837 then `silence` on 7839, `:696`. Each once.
7. **ROOT APPEND (one writer)** — between V4 and V5, append the three
   `RECORD {…}` objects (from `<sandbox>/p3.5-capture-record.json` / harness
   stdout) to `sideEffectsDone` in `docs/v2/state/cards/P3.5.json`, and their
   `attempt`,`step`,`runId`,`dateUtc` to `sandboxRuns`, in order `V3`,
   `V4-tone`, `V4-silence`. No parallel writer.
8. **V5** — containment + provenance, `:697`. Additionally run and record the
   literal witnesses `pactl list short sources | grep -c apunta_p35` and
   `pactl list short sinks | grep -c apunta_p35` (AM-187; non-zero = FAIL/stop).
   Do not edit the Expected cell.

## Rules

- No repeated harness invocation inside the attempt; a re-run duplicates
  provenance and V5 fails closed. On a mode failure after containment is
  created, stop and report `BLOCKED` for that mode.
- No whisper model, no `pactl` other than the containment sequence, no 7717, no
  distribution of the test AppImage (Option A bundles host libs; AM-190 leaves
  the public-distribution review outside this grant).
- Worker writes: `docs/v2/evidence/P3.5/**` and `returns/P3.5.md` only. Root
  owns the checkpoint append.
- The five attempt-1 `PREV_DEFAULT` records and anchors are preserved; V5
  excludes them by the `attempt === 3` selection.

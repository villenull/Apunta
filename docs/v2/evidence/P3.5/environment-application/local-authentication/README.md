# Local authentication route (AM-193) — evidence

Owner authorization AM-193 (approved, with packages/config AM-190): open a
local terminal running the existing ignored script
`build/p3.5-auth/install-in-terminal.sh`, so the owner enters her password
herself in that local window. No alternate route, no alternate packages, no
retry. Scope of this route stops at the installer result plus a read-only
prerequisite preflight.

## What was done

1. Confirmed the script exists and is the approved one, and that it runs
   exactly `timeout 180s pkexec pacman -S --needed gst-plugins-base
   gst-plugins-good patchelf`, writes only its exit status to
   `build/p3.5-auth/exit.status`, then waits for Enter.
2. Checked for a stale `exit.status` before launching. None existed
   (`ls: cannot access .../exit.status: No such file or directory`), so no
   stale status could be mistaken for a fresh result.
3. Confirmed the launcher is supported on this host: `/usr/bin/ghostty`,
   Ghostty 1.3.1-arch2, GTK runtime, and `gtk-single-instance` is a real
   config key here (`+show-config` reports `gtk-single-instance = false`;
   the key is present in the binary). Ghostty does not reject unknown
   `--key=value` pairs on the command line, so key support was established
   from `+show-config` and the binary rather than from an error.
4. Launched exactly once, detached, with the live graphical session
   environment inherited (`XDG_SESSION_TYPE=wayland`, `WAYLAND_DISPLAY=wayland-1`,
   `DISPLAY=:0`, `XDG_RUNTIME_DIR=/run/user/1000`). No systemd unit, no fresh
   session, no login shell:

   ```sh
   setsid ghostty --gtk-single-instance=true -e bash \
     /home/villenull/Projects/Apunta/build/p3.5-auth/install-in-terminal.sh
   ```

   Ghostty's own stderr was sent to `/dev/null`; no terminal screen, no
   screenshot, no keystroke and no password was ever captured or recorded,
   and nothing about the credential or the session environment was written
   to any log or evidence file.
5. Waited on the status file with one bounded watcher process
   (`timeout 220 bash -c 'while [ ! -f build/p3.5-auth/exit.status ]; do
   sleep 3; done'`, watcher exit 0). No repeated status polling, no polling
   of the window itself, and the watcher's ceiling exceeded the script's own
   180s timeout so completion was always observed rather than guessed at.

## Result

- **Launcher executed: yes.** The window opened once
  (`ghostty --gtk-single-instance=true -e bash .../install-in-terminal.sh`,
  pid recorded at launch) and the script ran inside it.
- **Installer exit: 124.** Written by the script itself to
  `build/p3.5-auth/exit.status`. 124 is `timeout`'s code: the approved
  `pkexec` did not complete authentication within the 180s the script allows.
  Nothing was installed; this is not an installation PASS.
- **No automatic duplicate `pkexec`.** The command ran once, in that one
  window, and no second prompt was raised afterwards.
- The window is intentionally left open. The script awaits Enter after the
  status file is written, so it still exists (script pid present at report
  time). It was not closed, and no unrelated terminal was touched.

## Read-only preflight after the timeout

Run only because the installer did not exit 0. Nothing was built, captured,
played, recorded or started: no build, no audio, no microphone, no app, no
server, no database, no model, no input device, no `pactl`, no network, and
port 7717 untouched.

| Check | Exit | Result |
| --- | --- | --- |
| `pacman -Q gst-plugins-base gst-plugins-good patchelf` | 1 | none of the three installed ("package ... was not found") |
| `command -v patchelf` | 1 | absent |
| `gst-inspect-1.0 appsink` | 0 | visible |
| `gst-inspect-1.0 autoaudiosrc` | 255 | not visible |
| `gst-inspect-1.0 alsasrc` | 255 | not visible |
| `gst-inspect-1.0 pulsesrc` | 255 | not visible |
| `test -x /usr/lib/gstreamer-1.0/gst-plugin-scanner` | 0 | present and executable |

**STEP 0 was not run.** The fail-closed step-0 snippet from
`../../environment-proposal-repair2/verify.mjs` (lines 162–172) was
extracted and confirmed to be the approved form — `set -e`, `command -v
patchelf … || { echo …; exit 1; }`, four separate `gst-inspect-1.0`
assertions for `appsink autoaudiosrc alsasrc pulsesrc`, and
`test -x /usr/lib/gstreamer-1.0/gst-plugin-scanner || { … exit 1; }` — and it
is gated on installer exit 0. With exit 124 the gate holds, so the snippet was
not executed. Had it run, it would have stopped at its first failure
(`patchelf` absent) and exited 1, never reaching step 1. Scanner setup
remains reserved for the later build step; the host scanner path in the
proposal (`/usr/lib/gstreamer-1.0/gst-plugin-scanner`, confirmed above) is
unchanged.

## Why authentication did not prompt

The same read-only diagnosis as before still holds: no polkit agent is
running and none is installed, so `pkexec` has nothing to display a prompt
with and simply waits out its timeout. This is the exact, secret-free failure
— no password was requested, read, stored or logged at any point, and the
failure text carries no credential material.

Per the route's terms, no retry was attempted, no fourth package and no
unapproved route (no `sudo`, no alternate authentication agent, no
`--needed`-free variant, no manual download) was installed or launched, and
no re-ask of the owner was made. AM-193/AM-190 authorization is untouched and
no card attempt was spent.

## Unknowns

- Whether the owner saw or dismissed a prompt at all during the 180s window:
  not observed, by design.
- Whether graphical authentication would succeed on a machine that actually
  has a polkit agent: untested here; installing one is outside this
  authorization.
- Repository reachability was never exercised — `pkexec` never reached
  `pacman`, so an offline mirror would still be an unknown.

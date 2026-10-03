# P3.5 — local authentication retry (installer run)

**Date:** 2026-10-03
**Scope:** the owner-local authentication attempt only. Nothing else in P3.5
was executed — no build, no app launch, no audio capture, no microphone, no
model, no database, no `pactl`, no input, no network beyond the single approved
`pkexec pacman -S`.

This is **not** a P3.5 preflight result. STEP-0 only. Steps 1 and 2 of
`../environment-proposal-repair2/verify.mjs` (scanner prep + `tauri:build:test`
+ the four dry AppDir inspections) were not run and no claim is made about
them.

## Outcome

| Step | Result |
| --- | --- |
| Ghostty launch (once) | ok |
| `pkexec` install | exit **0** |
| Preflight verification script | exit **0**, `ALL CHECKS PASS` |

## Sequence

1. **Preconditions** — no `pkexec` active (process metadata only: `ps -eo
   pid,ppid,user,etimes,stat,comm`), no ghostty process running.
2. **Stale status** — the previous attempt's `124` was retained at
   `build/p3.5-auth/exit.status.prev` (ignored) and `build/p3.5-auth/exit.status`
   was removed and confirmed absent before launch.
3. **Launch, once** —
   `/usr/bin/ghostty --gtk-single-instance=true -e bash /home/villenull/Projects/Apunta/build/p3.5-auth/install-in-terminal.sh`,
   detached with `setsid` in the live session environment. No login session,
   no systemd unit. Within 4s `pacman` was visible running as root (pid
   2468041), i.e. the owner authenticated in the window.
4. **Bounded watcher** (<= 220s) — `exit.status` appeared and read `0`. The
   pkexec/pacman lineage was already gone.
5. **Post-install verification** — `verify.sh` in this directory.

`build/p3.5-auth/install-in-terminal.sh` was not modified: same command, same
three packages, `timeout --foreground 180s` so the TTY stays interactive for
authentication. (It is mode 644, harmless because it is invoked as
`bash <script>`.) No second authentication was requested and there was no
automatic retry.

## Verification — `verify.sh` (exit 0)

Read-only. Only `node --version`, `command -v`, `pacman -Q`,
`gst-inspect-1.0` and `test -x`.

```
PASS installer exit status is 0
PASS pacman -Q gst-plugins-base installed — gst-plugins-base 1.28.6-3
PASS pacman -Q gst-plugins-good installed — gst-plugins-good 1.28.6-3
PASS pacman -Q patchelf installed — patchelf 0.19.1-1
v24.19.0
OK appsink
OK autoaudiosrc
OK alsasrc
OK pulsesrc
scanner present
STEP-0 PASS: prerequisites satisfied
PASS STEP-0 prereq read exits 0 and prints STEP-0 PASS
PASS gst-inspect-1.0 appsink visible (separate read)
PASS gst-inspect-1.0 autoaudiosrc visible (separate read)
PASS gst-inspect-1.0 alsasrc visible (separate read)
PASS gst-inspect-1.0 pulsesrc visible (separate read)
ALL CHECKS PASS
```

The STEP-0 block is the fail-closed form from
`../environment-proposal-repair2/verify.mjs` (IR2-01): `set -e`,
`command -v patchelf >/dev/null 2>&1 || { …; exit 1; }`, four separate
`gst-inspect-1.0` reads (`appsink`, `autoaudiosrc`, `alsasrc`, `pulsesrc`),
and the scanner asserted with `test -x /usr/lib/gstreamer-1.0/gst-plugin-scanner`
— not `test -f`.

## Cleanup and unknowns

- **No cleanup needed.** The launched `pkexec`/`pacman` were not active when the
  status landed. There was no `timeout` expiry, so no descendant-verification
  or narrow PID cleanup was required, and nothing was killed.
- **Window state:** the Ghostty process (pid 2468000) was still present at the
  script's own `Press Enter to close this window.` prompt when the status landed,
  and had exited by the final check. It was never closed by this agent — no
  terminal was signalled, no window closed, and no unrelated window touched.
- The prior `awaitEnter` window, if the owner still has one, was left alone.
- No credential, input, PTY content, screenshot, environment dump or log of the
  authentication was read, captured or recorded by this agent. The only
  observation was process metadata (`pid/ppid/user/etimes/stat/comm`) of the
  agent's own launched lineage.

## Not claimed

Not a P3.5 preflight PASS, not public distribution readiness, not an attempt-4
result. STEP-0 prerequisites are satisfied; the build and the four dry AppDir
inspections are still open and are root's call to schedule.
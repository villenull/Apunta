# Authorized installation status

Owner AM-190 authorized exactly:

```sh
timeout 180s pkexec pacman -S --needed gst-plugins-base gst-plugins-good patchelf
```

Coordinator invoked this twice with an inherited graphical session, no sudo,
no password typed or stored. Sessions3410 and35285 each returned exit124 with
empty stdout/stderr: graphical authentication timed out before pacman began.
No installation PASS is claimed. There is no running installer after the
second timeout. No packages beyond the three were requested.

Build/capture remain held until this installation authenticates and the
reviewed fail-closed step0 read passes. Owner authorization persists; no new
permission interview is required to retry when graphical authentication is
available. No card attempt was spent by this package-install command.

## Authentication diagnosis

Read-only host checks after the timeouts:

- pgrep for hyprpolkit/polkit agent processes: exit1, no match.
- pacman -Q hyprpolkitagent polkit-gnome polkit-kde-agent: exit1, none installed.
- systemctl --user list-unit-files '*polkit*': zero units.
- pacman -Qs polkit: only polkit127-3 toolkit listed.
- inherited session variables present: Wayland session, DISPLAY and runtime dir.

The common graphical authentication agents are absent, so repeated identical
pkexec invocations are unlikely to display a prompt. No fourth package or
unapproved desktop service has been installed/launched. Existing AM-190 grant
is retained; authentication infrastructure is an external prerequisite still
unresolved. Preparation and independent review continue on disjoint paths.

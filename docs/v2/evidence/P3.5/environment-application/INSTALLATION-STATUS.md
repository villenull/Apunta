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

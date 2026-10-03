# AM-193 local-terminal authentication — read-only diagnosis

Bounded, read-only diagnosis of the exit-124 installer timeout on
`build/p3.5-auth/install-in-terminal.sh`. No privileged command was run: no
`pkexec`, no `pacman`, no `sudo`, no Ghostty launch, no new session, no
credential, no screenshot, no terminal input, no PTY capture, no environment
dump, no build/runtime/DB/audio/model/mic/`pactl`/network, port 7717 untouched.
No authentication attempt was made and no card budget was consumed.

Scope of this directory only:
`docs/v2/evidence/P3.5/environment-application/authentication-diagnosis/**`.
The prior `../local-authentication/README.md` is deliberately **not** edited; its
causal claim is withdrawn below and the root owns the correction note.

## Correction to the prior report (not a repeat of it)

`../local-authentication/README.md` §"Why authentication did not prompt" says the
missing polkit agent means "`pkexec` has nothing to display a prompt with and
simply waits out its timeout". That causal claim is **false** and is not adopted
here. Installed `pkexec(1)`, section AUTHENTICATION AGENT:

> pkexec … will use the authentication agent registered for the calling process
> or session. However, if no authentication agent is available, then pkexec will
> register its own textual authentication agent. This behavior can be turned off
> by passing the `--disable-internal-agent` option.

The approved script passes no `--disable-internal-agent`, so the absence of a
graphical agent does **not** establish why this run timed out. The coordinator
had already withdrawn the claim in
`../local-authentication/COORDINATOR.md`; this file supplies the evidence.

## Execution-context caveat (stated explicitly)

In **this** diagnostic session `ps` reads the **host** PID namespace: it sees
`systemd` (1), `kthreadd` (2), kernel threads, `polkitd` (1050), the launched
`ghostty` (2419085) and the still-running script `bash` (2419118). Therefore a
view that shows "only bash" in some other tool session is an **isolated
execution context**, not evidence that the host processes are absent. Absence of
a process here must not be inferred from an isolated `ps`.

## Facts (observed, reproducible)

Raw lines: `process-metadata.txt`, `journal-excerpt.txt`, `local-docs.txt`.

- **F1 — the script reached a real controlling terminal.** `bash` 2419118 is its
  own session leader on a real PTY:
  `2419118 2419085 2419118 2419118 pts/0 Ss+ bash`
  (`SID 2419118`, `PGID 2419118`, `TTY pts/0`, `STAT Ss+` = session leader, in
  the foreground process group). The outer `setsid ghostty` only detached
  Ghostty (`2419085 1128 2419085 2419085 ? Ssl ghostty`, no tty); Ghostty then
  created its **own** child session + PTY for the command. So the worker's
  `setsid` did **not** prevent a controlling tty, and it did **not** create a
  fresh login session (no new `loginctl` session; polkitd still mapped the
  process to `unix-session:2`, the tty1 Wayland user session).
- **F2 — the approved script and exit.** Script is the approved 11-line form:
  `timeout 180s pkexec pacman -S --needed gst-plugins-base gst-plugins-good
  patchelf`, then writes `$?` to `exit.status`. `exit.status` contains `124`
  (mtime `2026-10-03 08:05:12.357`). 124 is `timeout`'s own code: the command was
  killed at the deadline, not rejected cleanly by polkit.
- **F3 — no graphical polkit agent exists here.** `/usr/lib/polkit-1/` holds only
  `polkitd` and `polkit-agent-helper-1`; no `polkit-gnome` / `polkit-kde` /
  `hyprpolkitagent` binaries, no agent autostart `.desktop`, and the only running
  polkit process is `polkitd` (1050). `pkexec` links `libpolkit-agent-1.so.0` and
  exposes `--disable-internal-agent` / `polkit_agent_text_listener_new`.
- **F4 — authentication actually ran, with the internal textual agent.** systemd
  started the agent helper **one second after launch** and it waited the whole
  window:
  - `08:02:12` `systemd[1]: Starting Authorization Manager Agent Helper (PID 1406/UID 1000)...`
  - `08:05:12` (exactly +180 s) `polkit-agent-helper-1[…]: pam_unix(polkit-1:auth): conversation failed`
  - `08:05:12` `… auth could not identify password for [villenull]`
  - `08:05:14` `… pam_authenticate failed: Authentication token manipulation error`
  - `08:05:12` `polkitd[1050]: Operator of unix-session:2 FAILED to authenticate to gain authorization for action org.freedesktop.policykit.exec for unix-process:unknown [<unknown>] (owned by unix-user:villenull)`

  So no password ever reached PAM: the helper blocked the full 180 s and then the
  PAM conversation failed when the deadline killed the agent. The helper's PAM
  failure and `exit.status=124` share the same second.

## Hypotheses (ranked; each labelled with its support)

- **H-A (most likely): the internal text agent presented a prompt in the Ghostty
  window and it went unanswered.** Support: the helper waited the full 180 s
  (an early agent-creation or tty-open failure would have aborted at ~08:02:12),
  and the agent was terminated by `SIGTERM` at the deadline rather than being left
  stopped — a `SIGTTIN`-stopped read would have kept `SIGTERM` pending and
  `timeout` would not have returned at 180 s. This is exactly what the pending
  owner observation (what window/prompt appeared) would confirm.
- **H-B (real script defect, plausible but not proven): `timeout` omits
  `--foreground`.** `timeout(1)` says `-f, --foreground`: "when not running
  timeout directly from a shell prompt, allow COMMAND to read from the TTY and
  get TTY signals". Here `timeout` runs inside a script, not from a shell prompt,
  so the hazard applies and pkexec's terminal read could be affected. Caveat: the
  clean `SIGTERM` termination at 180 s argues the read was not hard-stopped, so
  this may not be the operative cause — but it is a documented defect to remove
  before any retry. It does not add packages and keeps the time bound.
- **H-C: the Ghostty window was not visible/mapped** (another workspace, no
  focus), so a displayed prompt was not seen. Unknown.
- **H-D: something else** (e.g. the text agent's prompt/stderr was written
  somewhere the owner could not see). Unknown.

H-A and H-C are the two that the owner's observation discriminates. H-B is
independent of that answer.

## Unknowns (bounded — no polling)

- **U1.** Whether an answerable `Password:` prompt was displayed in the Ghostty
  window. pkexec has exited and its stderr went to that window, not to any log,
  so this is not recoverable from process or journal evidence now.
- **U2.** Whether the owner saw any window at all.
- **U3.** Consequently, **user non-response vs a nonexistent/unanswerable prompt
  remains UNKNOWN.** It is not resolved by "no graphical agent".
- **U4.** Repository reachability: `pkexec` never reached `pacman`, so an offline
  mirror is still untested.

## Minimum next step (concrete; within the granted local-terminal route, but needs owner/root authorization)

No privileged action is taken here. In order:

1. **Resolve U1/U2 with the pending owner observation** (no command): did a
   Ghostty window with a password prompt appear, and was it visible? If yes,
   H-A/H-C separate immediately.
2. **Before any retry, correct the script's `timeout` invocation** to
   `timeout --foreground 180s pkexec pacman -S --needed gst-plugins-base
   gst-plugins-good patchelf` (or drop `timeout` and let the owner close the
   interactive window). This is the one change that removes the documented
   "cannot read the TTY" hazard (H-B); it keeps the same three approved packages,
   the same time bound, and the no-capture rule. Because it edits the approved
   script, it needs explicit authorization before it is applied.
3. If the owner saw no window, address window visibility/focus before retrying.

No package or desktop-config change is recommended or in scope. No retry, no
fourth package, no alternate route, no re-ask of the owner. The live script
(`bash` 2419118, waiting at `read -r`) was left untouched.

## Not done, by design

No `pkexec`/`pacman`/`sudo`/Ghostty launch; no authentication attempt; no
credential, screenshot, terminal input, PTY capture or environment dump; no
build, runtime, database, audio, model, microphone, `pactl`, network or port
7717; no edit to any prior README; nothing staged or committed.

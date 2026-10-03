# Coordinator qualification of timeout diagnosis

Installer exit124 and missing prerequisites are accepted as observed. The worker's
claim that no installed/running graphical polkit agent proves no prompt can appear
is withdrawn: installed pkexec(1), AUTHENTICATION AGENT, states that pkexec registers
its own textual authentication agent when no registered agent is available. The
command did not pass --disable-internal-agent. Therefore the absence of graphical
agents does not establish the cause of this local-terminal timeout.

No prompt content or user input was observed. Root asked which window/prompt the
owner saw and assigned a read-only diagnosis without another privileged invocation.
No extra package, desktop change, route or retry is assumed. The historical worker
report remains unchanged. Source is CLEAR; prerequisites remain uninstalled.

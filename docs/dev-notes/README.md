# Dev notes

Workflow scratch that is **not part of the application**. Nothing here is
built, tested, or shipped — coding agents working a packet can ignore this
folder entirely.

## `stop-hook-dirty-grace.sh.txt`

A patch for a Claude Code **Stop hook** (`~/.claude/stop-hook-git-check.sh`),
kept here only so it survives a machine rebuild. It is harness configuration,
not project code.

The stock hook complains whenever the git tree is dirty. That is a false
alarm while a background agent is mid-build — which, during this project, is
most of the time — and acting on it is worse than ignoring it: committing
another agent's half-written files fragments its history and can capture a
broken intermediate state.

The patch adds a recency test. If the newest uncommitted change is under ten
minutes old, something is actively writing and the hook stays quiet; if
nothing has moved for ten minutes and is still uncommitted, it is genuinely
stranded work and the hook fires as before, now saying how long it has been
idle. The unpushed-commit and unsigned-commit checks are deliberately **not**
suppressed, because pushing never touches the working tree and is always safe
to ask for. `CLAUDE_STOP_HOOK_DIRTY_GRACE=0` restores the old behaviour.

To apply, replace the two consecutive blocks in that hook — the
`# Check for uncommitted changes` block and the
`# Check for untracked files that might be important` block — with the
contents of the `.txt` file, and leave the rest of the script alone. Back the
original up first.

Note that `~/.claude/` is a protected path: in Claude Code's auto permission
mode, writes there route to a classifier even when an allow rule matches, so
an agent generally cannot apply this itself. Switching out of auto mode and
approving the prompt is the usual route. If the hook is provisioned by an
environment setup script rather than living only in a home directory, patch
it at that source instead so the fix survives.

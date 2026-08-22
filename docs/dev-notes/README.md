# Dev notes

Workflow scratch that is **not part of the application**. Nothing here is
built, tested, or shipped — coding agents working a packet can ignore this
folder entirely.

---

# Read first when resuming: the Stop-hook false alarm

## The symptom

Claude Code runs a **Stop hook** that refuses to let a turn end while the git
tree is dirty: _"There are uncommitted changes in the repository. Please commit
and push these changes to the remote branch."_

During this project that fires constantly and almost always wrongly, because
the coordinating session ends turns while a **background coding agent is still
mid-build**. The tree is supposed to be dirty then.

It is not merely noise. Acting on it is worse than ignoring it: committing
another agent's half-written files fragments the history it was building and
can capture files in a broken intermediate state. That happened once here —
the M0 scaffold landed as a single unverified blob instead of the logical
sequence its agent had planned, and the agent said so in its report. M1, where
the agent was asked to commit its own work instead, landed cleanly in six
scoped commits.

## Where the hook comes from (investigated 2026-08-22)

**The Claude Code Remote launcher writes it fresh at every session start.** It
is not your configuration, not in this repo, and not baked into the container
image.

Evidence from the running container:

| Path | Modified | Era |
| --- | --- | --- |
| `~/.claude/plugins`, `~/.claude/skills` | 00:16:01 | container image / clone |
| `~/.claude/launcher-settings.json` | 14:47:01.844 | **session launch** |
| `~/.claude/stop-hook-git-check.sh` | 14:47:01.848 | **session launch** |

The settings file and the hook scripts were written 4 milliseconds apart at
session start, hours after the container itself was built. `~/.claude/` holds
**no `settings.json` at all** — the only settings source is
`launcher-settings.json`, which registers the hook:

```json
"Stop": [{ "matcher": "", "hooks": [
  { "type": "command", "command": "~/.claude/stop-hook-git-check.sh" }
]}]
```

**Consequence: patching the container copy is a treadmill.** It is regenerated
every session, so any edit is gone by the next one. There is no user-editable
source inside the container to fix instead.

A second obstacle: `~/.claude/` is a Claude Code **protected path**. In auto
permission mode, writes there route to a classifier *even when an allow rule
matches* — the docs state that `permissions.allow` entries "do not pre-approve
protected-path writes." An agent generally cannot apply the patch itself; you
have to leave auto mode and approve a prompt.

## What to do about it — pick one

### Option A — behavioural fix (recommended, costs nothing)

This is what actually solved the problem here, and it needs no permissions and
no patching. It is written into `CLAUDE.md` so agents follow it:

- The coordinator **never commits a background agent's in-flight work.** If the
  tree is dirty because an agent is building, leave it alone.
- If the uncommitted body of work has grown large, **message the agent and ask
  it to commit and push**, rather than doing it for it. It knows which pieces
  are finished; you do not.
- **Push freely at any time.** Pushing never touches the working tree, so it is
  always safe mid-build and resolves the "unpushed commits" variant of the
  warning immediately.
- Ask agents to **commit incrementally** as each coherent piece lands, so a
  large delta never sits exposed.

The hook still fires; you just correctly decline to act on it and say why.

### Option B — patch the hook, per session, by hand

`stop-hook-dirty-grace.sh.txt` in this folder replaces the two consecutive
blocks in `~/.claude/stop-hook-git-check.sh` — the
`# Check for uncommitted changes` block and the
`# Check for untracked files that might be important` block. Leave the rest of
the script alone; back it up first.

It adds a recency test: if the newest uncommitted change is under ten minutes
old, something is actively writing and the hook stays quiet; if nothing has
moved for ten minutes and is still uncommitted, that is genuinely stranded work
and it fires as before, now reporting how long it has been idle. The
unpushed-commit and unsigned-commit checks are deliberately **not** suppressed.
`CLAUDE_STOP_HOOK_DIRTY_GRACE=0` restores the stock behaviour.

To let an agent apply it, switch out of auto permission mode (`Shift+Tab`, or
start with `--permission-mode default`) and approve the prompt. Repeat every
session.

### Option C — auto-patch from a repo SessionStart hook (**ADOPTED 2026-08-22**)

A `.claude/settings.json` committed to this repo could register a SessionStart
hook that re-applies the patch on every session. Hook commands are executed by
the harness rather than issued as tool calls, so they are not subject to the
permission classifier — it would work.

This was written up as "deliberately not implemented" because it means the
repository rewrites the supervision hook that watches the agent working in it,
automatically, on every session — a pattern that deserves a deliberate human
decision rather than being inherited from a dev-notes file. **The owner made
that decision on 2026-08-22 and asked for it to be fixed for good.** It is now
live:

- `.claude/settings.json` registers a SessionStart hook.
- `.claude/hooks/apply-stop-hook-grace.sh` re-applies the patch on every
  session start. It is idempotent, backs the original up to
  `~/.claude/stop-hook-git-check.sh.pre-apunta.bak`, syntax-checks its own
  output and restores the backup if the check fails, and **no-ops if the
  upstream hook no longer contains the exact block it expects** — so an
  upstream rewrite degrades to stock behaviour rather than a broken hook.

What it changes: the two dirty-tree checks fire only when the newest
uncommitted change is at least ten minutes old, and then say how long the tree
has been idle. What it does not change: the unpushed-commit and
unsigned-commit checks, which are never suppressed — pushing does not touch the
working tree, so it is always safe to ask for.

Verified when adopted: quiet on a dirty-but-active tree; fires with
`CLAUDE_STOP_HOOK_DIRTY_GRACE=0`; recursion guard intact; installer idempotent;
unpushed checks present; backup written.

**To turn it off:** set `CLAUDE_STOP_HOOK_DIRTY_GRACE=0` for stock behaviour in
one session, or delete the SessionStart entry from `.claude/settings.json` to
stop the patch being applied at all. The next session then gets the stock hook,
because the launcher rewrites it anyway.

### Option D — report it

The false positive on background subagents is arguably a product issue: the
hook has no notion of "a subagent is still running," and its own advice is
actively harmful in that state. Worth reporting upstream rather than every
project working around it.

## Where this landed

**Both A and C are in force, and they do different jobs.**

Option A is the one that protects commit history: never commit a background
agent's in-flight work, ask the agent to commit its own, push freely. That
rule stands whatever the hook does, and it is still in `CLAUDE.md`.

Option C removes the false alarm itself, so the rule is no longer enforced by
a warning that cries wolf on every turn. It was adopted on 2026-08-22 by
explicit owner decision; see Option C above for what is installed and how to
turn it off.

Option D still stands as worth doing: the hook has no notion of "a subagent is
still running", and in that state its advice is actively harmful. Every project
working around this separately is a poor outcome.

---

## Files here

- `stop-hook-dirty-grace.sh.txt` — the Option B patch, kept as the readable
  reference for what the grace period does. The live implementation is
  `.claude/hooks/apply-stop-hook-grace.sh` at the repo root; this file is the
  same logic without the installer scaffolding.

# Work packets

Each file here is a complete, self-contained brief for one coding agent.

## Single-branch workflow

This project keeps **all work on one branch** —
`claude/local-browser-app-planning-0likfi`. There are no per-packet feature
branches and no pull requests between packets. Agents commit straight to the
shared branch and push when their packet is green.

Consequences to respect:

- **Run one packet at a time.** Two agents editing the same working tree at
  once will collide. Wait for a packet to finish and push before starting
  the next, even for packets whose dependencies would technically allow
  overlap (M4/M5/M6).
- Before starting, `git pull` so you are on the latest commit.
- Commit in small, logical steps with imperative subjects. Never
  `git add -A` blindly — stage the paths you actually changed, so unrelated
  in-progress work is never swept into your commit.
- If the push is rejected as non-fast-forward, `git pull --rebase` and push
  again. Never force-push.

**How to launch an agent on a packet:** start a fresh session on this repo
and give it this prompt (swap the packet name):

> Read docs/PLAN.md, CLAUDE.md, and docs/agents/M3-ai-providers.md, then
> implement that packet exactly. All work stays on the current branch —
> do not create a feature branch or open a PR. Keep commits small and
> stop when every acceptance criterion passes locally (lint, typecheck,
> tests, build, e2e), then push.

**Order:** M0 → M1 → M2 → M3 → M4 → M5 → M6 → M7, strictly one at a time.
M4, M5 and M6 only depend on M3, so they may be done in any order among
themselves — but still sequentially, never concurrently.

**Every packet inherits:** the hard rules in CLAUDE.md, the definition of
done, and the testing expectations in docs/PLAN.md §6. Acceptance criteria
listed in a packet are additional to that baseline.

If a packet's instructions conflict with reality (API changed upstream,
package renamed, a dependency's current version differs), prefer reality,
keep the intent, and record the deviation in `docs/decisions.md`.

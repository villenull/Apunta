# Work packets

Each file here is a complete, self-contained brief for one coding agent.

**How to launch an agent on a packet:** start a fresh session on this repo
and give it this prompt (swap the packet name):

> Read docs/PLAN.md, CLAUDE.md, and docs/agents/M3-ai-providers.md, then
> implement that packet exactly. Work on a new branch named as the packet
> specifies, keep commits small, and stop when every acceptance criterion
> passes locally (lint, typecheck, tests, build, e2e). Open a PR when done.

**Order:** M0 → M1 → M2 → M3, then M4 / M5 / M6 in parallel (separate
branches; they touch disjoint areas), then M7 last. Never start a packet
before its dependencies are merged.

**Every packet inherits:** the hard rules in CLAUDE.md, the definition of
done, and the testing expectations in docs/PLAN.md §6. Acceptance criteria
listed in a packet are additional to that baseline.

If a packet's instructions conflict with reality (API changed upstream,
package renamed, a dependency's current version differs), prefer reality,
keep the intent, and record the deviation in `docs/decisions.md`.

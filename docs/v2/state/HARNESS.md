# Harness record (card C0.1)

Recorded 2026-09-26 by the coordinator, running card C0.1 itself.

- **Session**: Paseo-managed agent session (not Muse Code). Provider
  `opencode`, model `muse-spark-1.3-contributor-free` (Muse Spark).
  No separate Muse Code version string is shown; model identifier above
  is the exact provider/model pair. Reasoning setting: none shown
  (default).
- **Shell commands**: yes (persistent shell tool, repo root
  `/home/villenull/Projects/Apunta`).
- **File edits**: yes (dedicated read/edit/write tools).
- **Sub-sessions**: yes — via Paseo `create_agent` with provider
  `opencode/muse-spark-1.3-contributor-free`, follow-ups via
  `send_agent_prompt`, teardown via `archive_agent`. Verified working
  with a connectivity-check sub-agent (it reported its identity and
  confirmed it could see this workspace; archived afterwards, zero
  sub-agents left running). Note: the paid
  `opencode/muse-spark-1.3` model fails with "Insufficient account
  funds"; the `-contributor-free` variant works. This answers C0.1's
  sub-session question for this environment; D14's "Muse Code"
  wording is otherwise left untouched.
- **Persistence between sessions**: files in the checkout persist;
  Paseo/agent history is not relied upon (per HANDOFF.md, state lives
  in git).
- **Credentials**: none recorded here.

## Base facts

- `git status` before installing the plan: clean, on `main`.
- `main` HEAD at install time: `4b7826759325b0c80c3a1171e56b21efdfbd4501`
  ("Record the 5573afb redeploy in the handoff").
- Plan installed as `docs/v2/` (copied from
  `~/Downloads/apunta-v2-orchestration-v2/v2/`; no `.zip` file was
  present, only the extracted folder).
- `node docs/v2/tools/check-plan.mjs` output:
  `Plan consistent: 63 cards, 12 parent reviews, 14 contracts, R01-R20 covered, no cycles.`

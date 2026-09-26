# P0.4 environment probe (BLOCKED precondition check)

- Date (UTC): 2026-09-26
- Working directory: repo root (`/home/villenull/Projects/Apunta`)
- Node: v24.19.0 via `$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin` (`node --version` → v24.19.0, `npm --version` → 11.17.0)
- HEAD: `92c152c4e211c6657ae7234c6e14b80e5b46fe53` (matches P0.4 base commit)
- Branch: `feature/v2`

## Commands run (all read-only, no server launched, no model pulled)

1. `git log -1 --format='%H %s'` → HEAD is `92c152c`, the dispatch base commit. OK.
2. `ollama list` → `ollama: command not found` (not on PATH).
3. Filesystem search for an ollama binary or data dir (`find / -maxdepth 7 -name "ollama*"`,
   `ls ~/.ollama /usr/share/ollama /opt/ollama`) → no binary, no `~/.ollama` models
   directory. Only repo-local references (e.g. `installer/src/ollama.ts`,
   `tools/model-lab/*`) exist.
4. `curl -s -m 5 http://127.0.0.1:11434/api/tags` → empty (no daemon listening on the
   standard Ollama port). Port 7717 was never contacted.

## Outcome

The `qwen3.5:4b-q4_K_M` tag cannot be checked (`ollama list` impossible) and no daemon
is reachable, so precondition "model present, do not pull" cannot be established and
no V1/V2 invocation was attempted. Installing Ollama itself is not an item in
`docs/v2/ACQUISITION.md` (HS-3), so it was not installed. Zero of 8 invocations run.
`docs/v2/BASELINE.md` was not created (no data to record).

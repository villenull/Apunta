# S6.1 — V8 checkpoint

- Working directory: the repository root
- Started/Ended: 2026-10-04T20:58Z
- Command (exactly the row's):

```
git status --porcelain -- docs/v2/state/cards/S6.1.json && rg -n "dictionary-es-mx" docs/v2/state/cards/S6.1.json
```

- **Exit code: 0**

## What the row printed

```
 M docs/v2/state/cards/S6.1.json
7:      "step": "Steps 1-2: the A11 acquisition of dictionary-es-mx@2.0.0",
10:      "command": "npm install --workspace @apunta/web --save-exact --no-audit --no-fund dictionary-es-mx@2.0.0",
20:      "note": "Wrote 112 packages; exactly one added row (dictionary-es-mx 2.0.0, MPL-1.1 (offered as (GPL-3.0 OR LGPL-3.0 OR MPL-1.1))) and one changed generated summary line, both inside the npm-dependencies markers, and nothing outside them. Under AM-203 item 2(a) no notice section was written. A resumed session re-runs neither this nor the install."
```

## The two `sideEffectsDone` entries, in the checkpoint's own vocabulary

1. **The Steps install of `dictionary-es-mx@2.0.0`** (A11 — the only
   non-repeatable acquisition in this card), recorded as it happened, with its
   command, its UTC timestamp and **exit code 0**.
2. **The `npm run licenses` rewrite of `THIRD-PARTY-LICENSES.md`** as a second
   entry (D8), also with its command, timestamp and **exit code 0**.

A resumed session re-runs **neither**.

## What is deliberately *not* in `sideEffectsDone`

- The two browser-row run folders and the `/tmp/apunta-v2/s6.1-observed/`
  comparison directory. Those are temporary, live under `/tmp/apunta-v2/`, are
  never committed (RUN-CONFIG §4) and are recorded under `sandboxRuns` instead,
  with their run ids and ports.
- The `docs/v2/evidence/S6.1/` files and this card's return file: committed
  output, not a side effect on the host.
- Any commit: nothing was staged, committed or pushed by this card.

## The rest of the checkpoint

`criteria` carries V0–V9 with each row's status, exit code, evidence path and a
note; `changedFiles` lists every path this card wrote; `status` is `SUBMITTED`
with a `nextAllowedAction` naming the three things the coordinator has to decide
(the two out-of-scope items and the Exhibit A sourcing). The file is valid JSON
(`json.load` succeeds) and is left uncommitted, like the rest of the work.

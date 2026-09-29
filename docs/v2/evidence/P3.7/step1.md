# P3.7 — Step 1 evidence: the precondition and the tripwire, before any edit

- Working directory: repository root
- Start: 2026-09-29T21:32:29Z
- End: 2026-09-29T21:32:32Z
- Exit code: **0**
- Verdict: **PASS** — the base is what the card was written against

## Command

```sh
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && APUNTA_P31_PORT=7841 bash scripts/v2/package-linux-resources.test.sh
```

Run on the **unmodified** file at `330b2b1`.

## What was confirmed before editing

| Precondition | Result |
| --- | --- |
| `build/linux-resources/` exists | yes |
| `build/linux-resources/manifest.json` exists (the script's own preflight, `:54-56`) | yes |
| `build/linux-resources/bin/whisper-cli` exists (preflight, `:57-61`) | yes — the preflight passed, so no `FAIL bundle-whisper` |
| `build/linux-resources/web/dist/assets` exists and holds at least one file | yes, **19 files** |
| The unmodified script prints **28** `PASS` lines and exits 0 | yes, **28** `PASS`, 0 `FAIL`, exit **0** |

The 19 files are the ones a Vite build emitted; none is empty and the folder is
the real one, not the empty directory an interrupted V3 leaves behind. The
script's own `bundle-present`, `bundled-node`, `bundle-manifest` and
`bundle-whisper` preflights each passed, so the new check would have run against
a bundle that had already passed them.

## The 28 pre-existing names, in order, for comparison with V1

```
PASS ownership-poll
PASS health-ok
PASS health-version
PASS lock-pid
PASS lock-process-start
PASS lock-pid-alive
PASS lock-app-version
PASS socket-owner
PASS db-path
PASS migration-level
PASS formats-empty-on-fresh-db
PASS post-patient
PASS post-format
PASS post-note
PASS get-note
PASS spa-status
PASS spa-content-type
PASS spa-body
PASS whisper-help
PASS broken-lock-pid
PASS broken-lock-process-start
PASS broken-lock-pid-alive
PASS broken-socket-owner
PASS broken-health-503
PASS broken-health-storage-error
PASS broken-root-html
PASS broken-root-boot-page
PASS bundle-end-to-end
```

These 28 are the tripwire: a run of the edited file that printed 28 would mean
`spa-asset` was never added. V1 printed 29, with these 28 in the same order.

## Why the bundle on disk is only ever read by a run

The script copies the **whole** folder into the run folder with `cp -R`
(`:95-98`) and serves and measures that copy. No rebuild was needed, and
`scripts/v2/package-linux-resources.sh` was never run by this card: it is L3
work because it compiles whisper, and P3.1 review finding 2 records that it
re-fetches A06 from `github.com` on every run — an acquisition this card has no
authorisation for (HS-3, Stop condition 3).

## Port

`ss -ltnH 'sport = :7841'` returned no rows after the run.

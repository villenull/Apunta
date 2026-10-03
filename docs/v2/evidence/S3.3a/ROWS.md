# S3.3a verification rows

Every row was executed **verbatim** from the card's table (extracted from the
table cell, with `\|` unescaped once) by `/bin/bash -c`; raw output in
`V1.log` … `V8.log`. Times are UTC. Paths are sanitised (`<sandbox>`).

| Row | Status | Exit | Started | Ended | Evidence |
| --- | --- | --- | --- | --- | --- |
| V1 | PASS | 0 | 2026-10-03T01:08:07.981Z | 2026-10-03T01:08:08.071Z | `V1.log` |
| V2 | PASS | 0 | 2026-10-03T01:08:08.072Z | 2026-10-03T01:08:08.290Z | `V2.log` |
| V3 | PASS | 0 | 2026-10-03T01:08:08.291Z | 2026-10-03T01:08:08.362Z | `V3.log` |
| V4 | PASS | 0 | 2026-10-03T01:08:08.362Z | 2026-10-03T01:08:08.833Z | `V4.log` |
| V5 | PASS | 0 | 2026-10-03T01:08:08.833Z | 2026-10-03T01:08:09.148Z | `V5.log` |
| V6 | NOT RUN | | | | held: real model, owner quiet-machine decision |
| V7 | NOT RUN | | | | held: real model; also carries a card defect (`NOTES.md`) |
| V8 | FAIL | 1 | 2026-10-03T01:09:09.366Z | 2026-10-03T01:09:09.373Z | `V8.log` |

V8 is red on `docs/` paths from three commits that landed after this card was
generated, plus one `docs/` path from a concurrent P3.5 agent. None of the paths
this card reads, writes or tests differs between `9d92d7b` and HEAD. See
`NOTES.md` for the full breakdown and for the base-behaviour and rule-byte
comparisons.
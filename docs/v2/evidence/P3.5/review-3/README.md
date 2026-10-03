# P3.5 review-3 — evidence index

Final independent source review of candidate `7e16513` (*Reject missing
coordinates in final P3.5 parser repair*) against baseline `9e6094b`. The verdict
and reasoning are in `docs/v2/state/reviews/P3.5-impl3.md`.

| File | What it is |
| --- | --- |
| `commands.md` | every command run, its exit code, and what it proves |
| `scope-check.mjs`, `scope-check-output.txt` | extracts all 54 top-level function bodies from both refs; exactly `tidsFromNewestMarker` differs |
| `independent-probes.mjs` | 86 independent adversarial probes, extracting the shipped bodies (no copied predicate); `process.stdout.write` only |
| `independent-probes-output.txt` | **86/86, exit 0** against the candidate source |
| `independent-probes-old-output.txt` | **65/86, exit 1** against `9e6094b` — 21 failures, all missing/empty/whitespace/null/fallback shapes |
| `reproduce-outputs.md` | the candidate's own four durable outputs regenerated and diffed: all **byte-identical** |
| `lint-attribution.md` | committed HEAD `39c6723` global lint = 16 errors, all in P3.4/review-1 old proofs; attributed, not waived |
| `checkpoint-preservation.md` | card diff, byte-identical history arrays, five `PREV_DEFAULT` records and five anchors intact, `BLOCKED` timeline |

The `scope-check.mjs` and `independent-probes.mjs` scripts read one or two
repository files and import nothing from the harness at runtime. No app, server,
database, build, LLM, audio, microphone, display, input, `pactl` mutation,
network, acquisition, install, live folder or port 7717 is touched.

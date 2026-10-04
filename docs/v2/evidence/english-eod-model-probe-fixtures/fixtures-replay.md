# Guard-probe case table → data fixture — extraction proof

Follow-up to the reviewer-artifact hygiene repair in
`docs/v2/evidence/english-eod-model-probe-repair/`. That pass removed the two
`no-console` errors and moved the probe's egress log into ignored scratch, but
left **seven `no-restricted-syntax` findings**: the non-loopback URL literals in
the probe's case table. This pass closes them the only way that keeps the
evidence: the case table becomes an **offline JSON data fixture**, so the
addresses are no longer executable source and no lint rule is overridden,
suppressed or reconfigured.

Nothing about the acquisition is re-opened. `build/eod-model-acquisition/
guarded-fetch.ts` is untouched; the 13 cases, the decisions they reach, the
control flow and the exit code are unchanged.

## What changed

| File | Change |
| --- | --- |
| `english-eod-model-acquisition-ir/guard-cases.json` | **New.** The 13 `[label, url]` pairs, byte-exact, in order. Inert data — JSON is not linted and nothing in it can fetch. |
| `english-eod-model-acquisition-ir/guard-probe.ts` | Reads the sibling fixture with `readFileSync` + `JSON.parse`, validates its shape fail-closed, then runs the identical loop. No `http(s)://` literal remains. |
| `english-eod-model-probe-repair/before-probe.ts` → `before-probe.ts.txt` | Raw archival rename via `mv`. No `git mv`, nothing staged. Bytes preserved (`sha256 61155290…` before and after). |
| `english-eod-model-probe-repair/replay.mjs` | Reference update plus the mechanics the rename and the fixture require (below). The comparison logic is unchanged. |
| `english-eod-model-probe-fixtures/**` | This report and `fixtures-replay.mjs`, the extraction/scope proof. |

The probe keeps the fixture **beside itself** (`import.meta.url`), which is what
lets a scratch copy of the probe read a scratch copy of the fixture for the data
negative control. The fixture path is a repo-relative constant in no way; it is
derived from the file's own location.

## Why this is not camouflage and not an exemption

- The URL strings are **explicit literals in a JSON data file**, not assembled
  from fragments in source. `guard-probe.ts` contains no `http(s)://` at all.
- `eslint.config.js` is **byte-unchanged**. The URL rule still fires: a scratch
  copy of the archived case table, with its disable header stripped, reports
  **7 `no-restricted-syntax`** findings. The rule did not move; the strings did.
- `scripts/check-no-external-urls.mjs` does not scan `docs/`, so the fixture is
  not an end-run around that check either. The only files permitted to name a
  download host remain `installer/**` and the comparison downloader.

## Proof 1 — byte-exact extraction (`fixtures-replay.mjs`)

The archived reviewer probe is the reference. Every `['label', 'url']` row in
`before-probe.ts.txt` is parsed and compared to `guard-cases.json`:

```
PASS  guard-cases.json holds exactly 13 pairs  (13)
PASS  the archived case table holds exactly 13 pairs  (13)
PASS  the fixture equals the archived case table byte for byte, same order
PASS  all 7 external/malicious literals are preserved  (7)
PASS  all 6 loopback cases are preserved  (6)
```

The 7 preserved external cases are the plain-HTTP catalogue host, the allowed
catalogue and redirect hosts, the unlisted external host, and the wrong-port /
user-info / fragment variants — i.e. the exact adversarial rows the probe exists
to show are refused.

## Proof 2 — nothing observable changed (`replay.mjs`)

`BEFORE` is the archived `before-probe.ts.txt`, materialized into ignored
scratch as `.ts` (tsx refuses the `.txt` extension). The **only** delta is the
guarded-fetch import depth (`../../../../` → `../../`, because the scratch copy
is two levels shallower); the log path is repo-root relative already. No fixture
was rewritten.

| Run | Command (cwd = repo root) | exit | stdout | stderr |
| --- | --- | --- | --- | --- |
| BEFORE | `npx tsx build/eod-model-probe-repair/before-probe.ts` | 0 | 1601 B | 0 B |
| AFTER | `npx tsx docs/v2/evidence/english-eod-model-acquisition-ir/guard-probe.ts` | 0 | 1601 B | 0 B |

- BEFORE ≡ AFTER stdout, byte for byte.
- Both byte-identical to the reviewer-recorded `guard-probe-output.txt`.
- 14 lines, ending `total fetchReached=4`.
- AFTER lint: `{}` — the repaired probe is completely clean, and the residual
  seven `no-restricted-syntax` findings are gone.

### Negative controls (all caught)

| Control | Mutation | Result |
| --- | --- | --- |
| NC1 channel | `process.stdout.write` → `process.stderr.write` | caught: stdout 0 B, AFTER reproduced exactly on stderr |
| **NC2 data** | one refused address flipped in the **fixture** (no source edit) | caught: 1581 B, 14 lines, first case now `ALLOWED`, total moves `4 → 5` |
| NC3 containment | static: a probe naming a log outside the repo | caught; never executed |
| NC4 lint | the two prints reverted | caught: `no-console` twice |
| NC5 rule scope | archived case table as executable source | caught: 7 `no-restricted-syntax`, so no exemption exists |

NC2 is the point of this pass: the decisions really are driven by the data
fixture. Changing a URL in `guard-cases.json` — and changing no source at all —
changes the observed decision and the total, and the comparison catches it. The
committed fixture is never modified; the control mutates only the scratch copy.

## Scope hygiene

- No `*.jsonl` egress log was read, copied, exported or printed; the harnesses
  only ask whether the scratch log exists and whether git ignores it.
- `git check-ignore -v` → `.gitignore:55:build/` covers the scratch log.
- `git status --porcelain` shows no scratch path.
- Nothing outside the repository was created, read, modified or deleted; the
  reviewer's original `/tmp/opencode/guard-probe-egress.jsonl` is untouched.
- Nothing was staged or committed. No acceptance row was touched.

## Files

Written:

- `docs/v2/evidence/english-eod-model-acquisition-ir/guard-cases.json` (new)
- `docs/v2/evidence/english-eod-model-acquisition-ir/guard-probe.ts` (fixture read + shape check)
- `docs/v2/evidence/english-eod-model-probe-repair/before-probe.ts.txt` (raw rename, bytes preserved)
- `docs/v2/evidence/english-eod-model-probe-repair/replay.mjs` (reference update + data control)
- `docs/v2/evidence/english-eod-model-probe-fixtures/fixtures-replay.mjs`
- `docs/v2/evidence/english-eod-model-probe-fixtures/fixtures-replay.txt`
- `docs/v2/evidence/english-eod-model-probe-fixtures/fixtures-replay.md` (this file)

Scratch, git-ignored, never committed: `build/eod-model-probe-fixtures/`
(and the pre-existing `build/eod-model-probe-repair/`).

Untouched: the adapter, the receipt, the model cache, the catalogue, the pinned
source, `eslint.config.js`, the historical review and the prior repair report,
and everything outside the repository.

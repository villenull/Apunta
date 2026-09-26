# P0.2 evidence — V2 attempt-2 re-run (full suite, four zones, base `6e59c60`)

- Working directory: repo root (`~`-sanitized; raw logs in `/tmp`, never committed)
- Command per zone: `TZ=$z npm test` for `z` in
  `UTC America/Denver America/Mexico_City Australia/Sydney`
- Node: 24.19.0 first on PATH (`$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin`)
- No code changes in this attempt: `git diff --name-only 6e59c60..HEAD` is
  empty and the worktree holds only pre-existing coordinator state under
  `docs/v2/state/`. This run re-establishes the baseline at the new base.

## Results

| Zone | Start (UTC) | End (UTC) | Exit | Files | Tests |
| --- | --- | --- | --- | --- | --- |
| UTC | 2026-09-26T01:24:24Z | 2026-09-26T01:24:32Z | **0** | 120 passed (120) | 1542 passed (1542) |
| America/Denver | 2026-09-26T01:24:32Z | 2026-09-26T01:24:40Z | **0** | 120 passed (120) | 1542 passed (1542) |
| America/Mexico_City | 2026-09-26T01:24:59Z | 2026-09-26T01:25:06Z | **0** | 120 passed (120) | 1542 passed (1542) |
| Australia/Sydney | 2026-09-26T01:24:47Z | 2026-09-26T01:24:55Z | **1** | 4 failed, 116 passed (120) | 6 failed, 1536 passed (1542) |

The card's own files pass everywhere under Sydney too:
`TZ=Australia/Sydney npx vitest run server/src/import/claude.test.ts server/src/test/zone.test.ts`
gives 2 files / 39 tests passed.

## V3 zone output (one line per run, assertion passed in each)

- `effective time zone: UTC (TZ=UTC)`
- `effective time zone: America/Denver (TZ=America/Denver)`
- `effective time zone: America/Mexico_City (TZ=America/Mexico_City)`
- `effective time zone: Australia/Sydney (TZ=Australia/Sydney)`

Four different zones; each run really ran in its nominal zone.

## Sydney failure set (identical to attempt 1)

```text
FAIL  |shared| src/backup.test.ts > backup filenames > names the day, and numbers a second run within it
FAIL  |web| src/lib/format.test.ts > note dates > spells out an older date and says Today for this one
FAIL  |web| src/lib/format.test.ts > note dates > uses the lower-case "today" in the edited line
FAIL  |web| src/lib/format.test.ts > formatInstantAsDate > reads an instant as the local day it fell on, with no "Today"
FAIL  |server| src/backup/store.test.ts > when the next backup is due > is not due again the same day, and is due the next
FAIL  |server| src/routes/import.test.ts > POST /api/import/claude/run > writes the preview as drafts, one batch, with provenance and guessed names flagged
```

Full failure text is unchanged from `V2-after.md` (committed at this base);
per-failure direct-from-code determination is in
`finding-sydney-attempt2.md`.

## Notes

- An earlier Denver run this session failed 1 unrelated test in
  `web/src/App.test.tsx` (`workspace > deletes a patient after confirming,
  and empties the workspace`); the immediate re-run passed 1542/1542. Same
  flakiness the attempt-1 reviewer observed; that file is outside the
  May-edit list and untouched (`git diff` on it is empty).
- A mistyped `TZ=America/Mexico/City` (slashes) run failed only
  `server/src/test/zone.test.ts` with `effective time zone: undefined` —
  the new zone test doing exactly its job (catching a run that is not in
  its nominal zone). Discarded; the recorded Mexico_City run above uses the
  correct zone and exits 0.
- V1 at this base: literal `git apply --check
  docs/v2/patches/fix-activeSince-timezone.patch` exits 1 (`patch does not
  apply` — already in the tree); `git apply --check -R` exits 0.

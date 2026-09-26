# P0.2 evidence — V2 attempt-3 re-run (full suite, four zones, base `650821b`)

- Working directory: repo root (`~`-sanitized; raw logs in `/tmp`, never committed)
- Command per zone: `TZ=$z npm test` for `z` in
  `UTC America/Denver America/Mexico_City Australia/Sydney`
- Node: 24.19.0 first on PATH (`$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin`)
- No code changes in this attempt: `git diff --name-only` shows only the
  pre-existing coordinator-state modification (`docs/v2/state/AMENDMENTS.md`);
  the worktree holds only untracked coordinator state under `docs/v2/state/`.
  HEAD verified as `650821b` (`git log -1`) before any work; no
  pull/merge/rebase/reset performed. No server launched, no database opened,
  port 7717 never contacted: only `npm test` / `npx vitest run` (unit tests)
  were executed, per HS-2.

## Results

| Zone | Start (UTC) | End (UTC) | Exit | Files | Tests |
| --- | --- | --- | --- | --- | --- |
| UTC (first run) | 2026-09-26T01:29:12Z | 2026-09-26T01:29:19Z | **1** | 1 failed, 119 passed (120) | 1 failed, 1541 passed (1542) |
| UTC (re-run) | 2026-09-26T01:29:48Z | 2026-09-26T01:29:56Z | **0** | 120 passed (120) | 1542 passed (1542) |
| America/Denver | 2026-09-26T01:29:19Z | 2026-09-26T01:29:27Z | **0** | 120 passed (120) | 1542 passed (1542) |
| America/Mexico_City | 2026-09-26T01:29:27Z | 2026-09-26T01:29:35Z | **0** | 120 passed (120) | 1542 passed (1542) |
| Australia/Sydney | 2026-09-26T01:29:35Z | 2026-09-26T01:29:42Z | **1** | 4 failed, 116 passed (120) | 6 failed, 1536 passed (1542) |

The card's own files pass everywhere under Sydney too:
`TZ=Australia/Sydney npx vitest run server/src/import/claude.test.ts server/src/test/zone.test.ts`
gives 2 files / 39 tests passed (exit 0).

## V3 zone output (one line per run, assertion passed in each)

- `effective time zone: UTC (TZ=UTC)` (both UTC runs)
- `effective time zone: America/Denver (TZ=America/Denver)`
- `effective time zone: America/Mexico_City (TZ=America/Mexico_City)`
- `effective time zone: Australia/Sydney (TZ=Australia/Sydney)`

Four different zones; each run really ran in its nominal zone.

## Sydney failure set (byte-identical to attempts 1 and 2)

```text
FAIL  |shared| src/backup.test.ts > backup filenames > names the day, and numbers a second run within it
FAIL  |web| src/lib/format.test.ts > note dates > spells out an older date and says Today for this one
FAIL  |web| src/lib/format.test.ts > note dates > uses the lower-case "today" in the edited line
FAIL  |web| src/lib/format.test.ts > formatInstantAsDate > reads an instant as the local day it fell on, with no "Today"
FAIL  |server| src/backup/store.test.ts > when the next backup is due > is not due again the same day, and is due the next
FAIL  |server| src/routes/import.test.ts > POST /api/import/claude/run > writes the preview as drafts, one batch, with provenance and guessed names flagged
```

Full Sydney failure text (log line with hostname sanitized out):

```text
FAIL  |shared| src/backup.test.ts > backup filenames > names the day, and numbers a second run within it
AssertionError: expected 'apunta-backup-2026-08-25.zip' to be 'apunta-backup-2026-08-24.zip' // Object.is equality
Expected: "apunta-backup-2026-08-24.zip"
Received: "apunta-backup-2026-08-25.zip"
❯ src/backup.test.ts:48:33
    46|   it('names the day, and numbers a second run within it', () => {
    47|     const day = new Date('2026-08-24T22:15:00.000Z');
    48|     expect(backupFilename(day)).toBe('apunta-backup-2026-08-24.zip');

FAIL  |web| src/lib/format.test.ts > note dates > spells out an older date and says Today for this one
AssertionError: expected 'Aug 22, 2026' to be 'Today' // Object.is equality
Expected: "Today"
Received: "Aug 22, 2026"
❯ src/lib/format.test.ts:39:61

FAIL  |web| src/lib/format.test.ts > note dates > uses the lower-case "today" in the edited line
AssertionError: expected 'Aug 22, 2026' to be 'today' // Object.is equality
Expected: "today"
Received: "Aug 22, 2026"
❯ src/lib/format.test.ts:43:63

FAIL  |web| src/lib/format.test.ts > formatInstantAsDate > reads an instant as the local day it fell on, with no "Today"
AssertionError: expected 'Aug 13, 2026' to be 'Aug 12, 2026' // Object.is equality
Expected: "Aug 12, 2026"
Received: "Aug 13, 2026"
❯ src/lib/format.test.ts:98:61
    98|     expect(formatInstantAsDate('2026-08-12T15:00:00.000Z')).toBe('Aug …

FAIL  |server| src/backup/store.test.ts > when the next backup is due > is not due again the same day, and is due the next
AssertionError: expected true to be false // Object.is equality
❯ src/backup/store.test.ts:75:56
    75|     expect(isDueToday(morning.toISOString(), evening)).toBe(false);

FAIL  |server| src/routes/import.test.ts > POST /api/import/claude/run > writes the preview as drafts, one batch, with provenance and guessed names flagged
AssertionError: expected [ Array(3) ] to deeply equal [ Array(3) ]
- Expected: "Imported session, 2026-05-12" / "2026-06-09" / "2026-07-14"
+ Received: "Imported session, 2026-05-13" / "2026-06-10" / "2026-07-15"
❯ src/routes/import.test.ts:149:46

Test Files  4 failed | 116 passed (120)
Tests  6 failed | 1536 passed (1542)
```

All four files are outside the card's May-edit list; per-failure
direct-from-code test-cause determinations stand as recorded in
`finding-sydney-attempt2.md` (attempt 2, same base line) — re-verified
identical received values here. No new evidence of a production
day-boundary bug.

## Notes

- The first UTC run this session failed 1 unrelated test in
  `web/src/App.test.tsx` (`workspace > deletes a patient after confirming,
  and empties the workspace`); the immediate re-run passed 1542/1542. Same
  flakiness observed in attempts 1 and 2; that file is outside the May-edit
  list and untouched.
- V1 at this base: literal `git apply --check
  docs/v2/patches/fix-activeSince-timezone.patch` exits 1 (`patch does not
  apply` — already in the tree); `git apply --check -R` exits 0.

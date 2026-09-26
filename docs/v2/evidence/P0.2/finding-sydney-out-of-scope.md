# P0.2 finding — six Sydney failures in files outside the May-edit list

Per the card's Stop conditions this is reported as a finding; no
production code was changed here (the card's diff touches test files
only), and HS-9 forbids editing outside the May-edit list, so the fix
belongs to a follow-up card.

## Diagnosis

All six are the same class as the card's Known facts: tests asserting
local-calendar-day strings derived from fixed UTC instants without
pinning a zone. None indicates a production day-boundary bug — the
production code correctly uses the local day; the expectations assume a
zone west of (or on) Greenwich.

| # | File (test) | Fixed instant | Why Sydney shifts it |
| --- | --- | --- | --- |
| 1 | `shared/src/backup.test.ts` › backup filenames | `2026-08-24T22:15:00.000Z` | 22:15Z is 25 Aug in Sydney (+10) |
| 2 | `web/src/lib/format.test.ts` › note dates › Today | `2026-08-22T09:00:00.000Z` vs `now = 2026-08-22T18:00:00.000Z` | 09:00Z is 19:00 22 Aug but `now` is 04:00 23 Aug Sydney: different local days, so not "Today" |
| 3 | `web/src/lib/format.test.ts` › edited line › today | same instants as 2 | same cause |
| 4 | `web/src/lib/format.test.ts` › formatInstantAsDate | `2026-08-12T15:00:00.000Z` | 15:00Z is 13 Aug in Sydney |
| 5 | `server/src/backup/store.test.ts` › isDueToday same day | morning `08:00Z` / evening `22:00Z` 24 Aug | 18:00 24 Aug vs 08:00 25 Aug Sydney: different local days, so "due" |
| 6 | `server/src/routes/import.test.ts` › preview as drafts | John sessions at `17:00Z` | next day in Sydney, titles move +1 |

## Suggested follow-up

A new card with May-edit covering exactly these four test files
(`shared/src/backup.test.ts`, `web/src/lib/format.test.ts`,
`server/src/backup/store.test.ts`, `server/src/routes/import.test.ts`),
applying the same pattern used here: no global `TZ` pin; each
zone-dependent `describe` sets and restores its own zone in
`beforeEach`/`afterEach`. `server/vitest.config.ts` needs no setup file.

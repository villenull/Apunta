# P0.2 finding, attempt 2 — each Sydney failure determined directly from code

Base `6e59c60`. Attempt 2 made no code changes (nothing in scope can fix
these — see §"No in-scope fix" below). For each of the 6 failures this file
names the exact test line, the exact production lines that produced the
received value, and the local-time arithmetic, so the test-vs-production
verdict rests on code read this session, not on failure-class inference.
Attempt 1 directly verified only #1; #2–#6 are newly verified here.

Convention: Sydney in August is AEST, UTC+10. All production functions below
are byte-identical at base `8be98cb` and head `6e59c60` (empty `git diff`
on every production path), so the behaviour pre-dates this card.

## #1 `shared/src/backup.test.ts:48` — TEST code

- Test (`shared/src/backup.test.ts:46-50`): `backupFilename(new Date('2026-08-24T22:15:00.000Z'))`
  expected `'apunta-backup-2026-08-24.zip'`, got `'apunta-backup-2026-08-25.zip'`.
- Production (`shared/src/backup.ts:296-300`): `backupFilename` names the
  archive with `instantToLocalDay(date)`; that helper
  (`shared/src/common.ts:33-40`) builds the day from
  `getFullYear()/getMonth()/getDate()` — the machine-local day — and its doc
  says never to derive a local day by slicing an ISO string.
- Arithmetic: 22:15Z Aug 24 is 08:15 Aug 25 in Sydney, so `instantToLocalDay`
  yields `2026-08-25`. The received value is exactly the specified local-day
  behaviour; the expectation hard-codes the UTC slice. Verdict: test code.
  (Same as attempt 1; re-verified.)

## #2 `web/src/lib/format.test.ts:39` — TEST code

- Test (`web/src/lib/format.test.ts:35-40`): with `now = new Date('2026-08-22T18:00:00.000Z')`,
  `formatNoteDate('2026-08-22T09:00:00.000Z', now)` expected `'Today'`, got
  `'Aug 22, 2026'`.
- Production (`web/src/lib/format.ts:26-28,34-38`): `sameDay` compares local
  `getFullYear/getMonth/getDate`; `formatNoteDate` returns `'Today'` only for
  the same local day. Its contract (line 31-33) is the prototype's "Today for
  a note written in this session".
- Arithmetic: in Sydney, `now` is 04:00 Aug 23 while the note is 19:00 Aug 22
  — different local days — so `'Aug 22, 2026'` is the contractually correct
  answer. The test's two instants straddle Sydney midnight; its expectation
  holds only in zones where both fall on one local day. Verdict: test code.

## #3 `web/src/lib/format.test.ts:43` — TEST code

- Test (`web/src/lib/format.test.ts:42-45`): same `now`,
  `formatEditedDate('2026-08-22T09:00:00.000Z', now)` expected `'today'`, got
  `'Aug 22, 2026'`.
- Production (`web/src/lib/format.ts:41-45`): identical `sameDay` gate as #2.
- Arithmetic: identical to #2 — different Sydney-local days, so the
  spelled-out date is correct. Verdict: test code.

## #4 `web/src/lib/format.test.ts:98` — TEST code

- Test (`web/src/lib/format.test.ts:96-100`):
  `formatInstantAsDate('2026-08-12T15:00:00.000Z')` expected `'Aug 12, 2026'`,
  got `'Aug 13, 2026'`.
- Production (`web/src/lib/format.ts:86-89`): formats the `Date` with
  `Intl.DateTimeFormat` — the local day. Its doc (lines 78-85) explicitly
  rejects ISO-slicing because "the UTC date … is the day before for anyone
  west of Greenwich writing in the evening".
- Arithmetic: 15:00Z Aug 12 is 01:00 Aug 13 in Sydney, so `'Aug 13, 2026'`
  is correct — and note the test's own title says "the local day it fell
  on": production honours the title; the hard-coded `'Aug 12'` is the UTC
  day and contradicts it. Contrast `formatPlanDate` (lines 63-76), which
  parses calendar dates field-by-field precisely to avoid the UTC-midnight
  trap, and whose test passes in all four zones. Verdict: test code.

## #5 `server/src/backup/store.test.ts:75` — TEST code

- Test (`server/src/backup/store.test.ts:70-77`): `morning = 2026-08-24T08:00:00.000Z`,
  `evening = 2026-08-24T22:00:00.000Z`; `isDueToday(morning.toISOString(), evening)`
  expected `false`, got `true`.
- Production (`server/src/backup/store.ts:195-200`): `isDueToday` compares
  `localDay()` of each side (local `getFullYear/getMonth/getDate`, lines
  202-204). Its doc (lines 188-194): "Compared by calendar day in the local
  timezone: 'did today's backup happen' is a question about her day, not
  about UTC."
- Arithmetic: in Sydney, morning is 18:00 Aug 24 but evening is 08:00 Aug 25
  — different local days — so "due" (`true`) is the specified answer. The
  test's instant pair spans Sydney midnight. Verdict: test code.

## #6 `server/src/routes/import.test.ts:149` — TEST code

- Test (`server/src/routes/import.test.ts:149-153`): John's note titles
  expected `2026-05-12 / 2026-06-09 / 2026-07-14`, got `+1 day` on each.
- Production chain, read end to end: route (`server/src/routes/import.ts:92`)
  titles with `importedNoteTitle(planned.recordedAt)`; that helper
  (`shared/src/import.ts:184-187`) uses `instantToLocalDay(recordedAt)`;
  the fixture (`e2e/fixtures/claude-export/patient-chats.json`, `conv-john`)
  holds sessions at `17:00Z` on those three dates (verified by parsing the
  fixture this session).
- Arithmetic: 17:00Z is 03:00 the next day in Sydney, so all three titles
  move +1 — exactly the received values. Production is consistent with the
  card's own passing assertion: `server/src/import/claude.test.ts:392`
  computes expected days via `instantToLocalDay` and passes 39/39 under
  Sydney. The route test hard-codes UTC dates. Verdict: test code.

## No in-scope fix exists (so none was made)

- The 6 failures live in 4 test files, all outside the May-edit list
  (`server/src/import/claude.test.ts`, `server/src/test/zone.test.ts`,
  `server/vitest.config.ts`-only-if-needed). Editing any of them is HS-9.
- No production file may change either: each verdict above finds production
  behaving per its documented local-day contract, and the card's Stop
  conditions forbid production changes here regardless.
- The remaining in-scope moves are all ruled out: the patch is already
  applied verbatim (V1 reverse-check exits 0); the card's own files already
  pass 39/39 under Sydney; a global `TZ` pin is forbidden by the card's
  Fixed decisions; and no edit to `claude.test.ts`/`zone.test.ts` can alter
  the outcome of other files' tests. V2 therefore cannot reach exit 0 from
  inside this card.
- Per the Stop conditions this is reported as a finding, not fixed. The
  follow-up is attempt 1's suggestion unchanged: a card whose May-edit list
  covers exactly `shared/src/backup.test.ts`, `web/src/lib/format.test.ts`,
  `server/src/backup/store.test.ts`, `server/src/routes/import.test.ts`,
  applying this card's own pattern (per-describe zone set/restore, no global
  pin).

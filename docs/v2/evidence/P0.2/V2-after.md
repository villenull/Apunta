# P0.2 evidence — V2 AFTER the change (full suite, four zones)

- Working directory: repo root
- Command per zone: `TZ=$z npm test`
  for `z` in `UTC America/Denver America/Mexico_City Australia/Sydney`
- Node: 24.19.0 first on PATH

## Results

| Zone | Start (UTC) | End (UTC) | Exit | Files | Tests |
| --- | --- | --- | --- | --- | --- |
| UTC | 2026-09-26T01:15:06Z | 2026-09-26T01:15:14Z | **0** | 120 passed (120) | 1542 passed (1542) |
| America/Denver | 2026-09-26T01:15:14Z | 2026-09-26T01:15:21Z | **0** | 120 passed (120) | 1542 passed (1542) |
| America/Mexico_City | 2026-09-26T01:16:00Z | 2026-09-26T01:16:08Z | **0** | 120 passed (120) | 1542 passed (1542) |
| Australia/Sydney | 2026-09-26T01:15:29Z | 2026-09-26T01:15:37Z | **1** | 4 failed, 116 passed (120) | 6 failed, 1536 passed (1542) |

The card's own files pass everywhere: targeted
`npx vitest run server/src/import/claude.test.ts
server/src/test/zone.test.ts --project server` gives 39 passed (39) in
each of the four zones. The six Sydney failures are all in files outside
this card's May-edit list; full text below, analysis in
`finding-sydney-out-of-scope.md`.

Method note: one Mexico_City run in this window used a mistyped
`TZ=America/Mexico/City` (slashes) from a shell typo and was discarded —
an invalid TZ makes `resolvedOptions().timeZone` come back `undefined`.
The recorded run above uses the correct `America/Mexico_City` and exits 0.

## Sydney failures (full, 6/6)

```text
 FAIL  |shared| src/backup.test.ts > backup filenames > names the day, and numbers a second run within it
AssertionError: expected 'apunta-backup-2026-08-25.zip' to be 'apunta-backup-2026-08-24.zip' // Object.is equality

Expected: "apunta-backup-2026-08-24.zip"
Received: "apunta-backup-2026-08-25.zip"

 ❯ src/backup.test.ts:48:33
     46|   it('names the day, and numbers a second run within it', () => {
     47|     const day = new Date('2026-08-24T22:15:00.000Z');
     48|     expect(backupFilename(day)).toBe('apunta-backup-2026-08-24.zip');
       |                                 ^
     49|     expect(backupFilename(day, 3)).toBe('apunta-backup-2026-08-24-3.zi…
     50|   });
```

```text
 FAIL  |web| src/lib/format.test.ts > note dates > spells out an older date and says Today for this one
AssertionError: expected 'Aug 22, 2026' to be 'Today' // Object.is equality

Expected: "Today"
Received: "Aug 22, 2026"

 ❯ src/lib/format.test.ts:39:61
     37|   it('spells out an older date and says Today for this one', () => {
     38|     expect(formatNoteDate('2026-08-08T09:00:00.000Z', now)).toBe('Aug …
     39|     expect(formatNoteDate('2026-08-22T09:00:00.000Z', now)).toBe('Toda…
       |                                                             ^
     40|   });
```

```text
 FAIL  |web| src/lib/format.test.ts > note dates > uses the lower-case "today" in the edited line
AssertionError: expected 'Aug 22, 2026' to be 'today' // Object.is equality

Expected: "today"
Received: "Aug 22, 2026"

 ❯ src/lib/format.test.ts:43:63
     41|
     42|   it('uses the lower-case "today" in the edited line', () => {
     43|     expect(formatEditedDate('2026-08-22T09:00:00.000Z', now)).toBe('to…
       |                                                               ^
     44|     expect(formatEditedDate('2026-07-24T09:00:00.000Z', now)).toBe('Ju…
       |                                                               ^
     45|   });
```

```text
 FAIL  |web| src/lib/format.test.ts > formatInstantAsDate > reads an instant as the local day it fell on, with no "Today"
AssertionError: expected 'Aug 13, 2026' to be 'Aug 12, 2026' // Object.is equality

Expected: "Aug 12, 2026"
Received: "Aug 13, 2026"

 ❯ src/lib/format.test.ts:98:61
     96| describe('formatInstantAsDate', () => {
     97|   it('reads an instant as the local day it fell on, with no "Today"', …
     98|     expect(formatInstantAsDate('2026-08-12T15:00:00.000Z')).toBe('Aug …
       |                                                             ^
     99|     expect(formatInstantAsDate('nonsense')).toBe('nonsense');
    100|   });
```

```text
 FAIL  |server| src/backup/store.test.ts > when the next backup is due > is not due again the same day, and is due the next
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/backup/store.test.ts:75:56
     73|     const tomorrow = new Date('2026-08-25T07:00:00.000Z');
     74|
     75|     expect(isDueToday(morning.toISOString(), evening)).toBe(false);
       |                                                        ^
     76|     expect(isDueToday(morning.toISOString(), tomorrow)).toBe(true);
```

```text
 FAIL  |server| src/routes/import.test.ts > POST /api/import/claude/run > writes the preview as drafts, one batch, with provenance and guessed names flagged
AssertionError: expected [ Array(3) ] to deeply equal [ Array(3) ]

- Expected
+ Received

  [
-   "Imported session, 2026-05-12",
-   "Imported session, 2026-06-09",
-   "Imported session, 2026-07-14",
+   "Imported session, 2026-05-13",
+   "Imported session, 2026-06-10",
+   "Imported session, 2026-07-15",
  ]

 ❯ src/routes/import.test.ts:149:46
    147|     expect(notes).toHaveLength(3);
    148|     expect(notes.every((n) => n.status === 'draft')).toBe(true);
    149|     expect(notes.map((n) => n.title).sort()).toEqual([
       |                                              ^
    150|       'Imported session, 2026-05-12',
    151|       'Imported session, 2026-06-09',
```

Summary line: `Test Files  4 failed | 116 passed (120)`,
`Tests  6 failed | 1536 passed (1542)`.

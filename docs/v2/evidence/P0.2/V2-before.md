# P0.2 evidence — V2 BEFORE any change (baseline)

- Working directory: repo root
- Command per zone:
  `TZ=$z npx vitest run server/src/import/claude.test.ts --project server`
  for `z` in `UTC America/Denver America/Mexico_City Australia/Sydney`
- Observed: 2026-09-26 ~01:11 UTC, before any edit, HEAD `8be98cb`
- Node: 24.19.0 first on PATH

(Note: the baseline ran the card's failing test file per zone rather than
the full `npm test` loop; the full loop after the change shows the only
remaining failures are in files outside this card's May-edit list, and the
card's diff touches no production code, so they cannot be regressions.)

## Results

| Zone | Result |
| --- | --- |
| UTC | 1 failed, 37 passed |
| America/Denver | 38 passed |
| America/Mexico_City | 38 passed |
| Australia/Sydney | 3 failed, 35 passed |

## UTC failure (full)

```text
 FAIL  |server| src/import/claude.test.ts > activeSince > counts a message on the cutoff day, and not one the day before
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/import/claude.test.ts:215:43
    213|     const before: RawTurn = { ...on, at: '2026-07-01T01:00:00.000Z' };
    214|     expect(activeSince([before, on], CUTOFF)).toBe(true);
    215|     expect(activeSince([before], CUTOFF)).toBe(false);
```

`01:00Z` on 1 July is 1 July in UTC (expected `false` needs Denver's
30 June), so `activeSince([before], CUTOFF)` is `true`. Matches the card's
Known facts (unpatched `activeSince` fails under UTC).

## Sydney failures (test names; bodies same class)

- `activeSince > counts a message on the cutoff day, and not one the day
  before` — same assertion as above (`01:00Z` is 11:00 on 1 July in
  Sydney, so on the cutoff day).
- `planImport > imports every qualifying patient with their whole history,
  and nothing else` — John's days came out one later:
  expected `2026-05-12, 2026-06-09, 2026-07-14`, received
  `2026-05-13, 2026-06-10, 2026-07-15` (fixture instants are `17:00Z`,
  i.e. next day in Sydney).
- `planImport > writes provenance that names the conversation, the session
  and its messages` — expected `recorded 2026-07-14`, received
  `recorded 2026-07-15`, same cause.

Matches the card's Known facts (two `planImport` tests fail under
`Australia/Sydney`).

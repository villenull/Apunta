# P0.2 evidence — V3 zone output (four different zones)

`server/src/test/zone.test.ts` prints the ambient zone and asserts
`Intl.DateTimeFormat().resolvedOptions().timeZone === (process.env.TZ ??
that value)`. Lines below are taken verbatim from the four full-suite
runs in `V2-after.md` (each run's `zone.test.ts` stdout):

```text
effective time zone: UTC (TZ=UTC)
effective time zone: America/Denver (TZ=America/Denver)
effective time zone: America/Mexico_City (TZ=America/Mexico_City)
effective time zone: Australia/Sydney (TZ=Australia/Sydney)
```

The assertion passed in all four runs, so each nominal zone run really
ran in that zone. The test pins nothing itself; it reports the ambient
zone (and passes trivially when `TZ` is unset, still printing the zone).

Implementation note: the print uses `process.stdout.write`, not
`console.log`, because `no-console` is an error everywhere outside
`scripts/`/`tools/` (eslint.config.js).

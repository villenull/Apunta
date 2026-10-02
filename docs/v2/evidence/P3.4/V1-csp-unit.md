# P3.4 — V1, the server CSP unit row

- Working directory: repository root
- Start: 2026-10-02T23:09:16Z
- End: 2026-10-02T23:09:17Z
- Exit code: **0**
- Status: **PASS**

## Exact command

```
npm run build:shared && npx vitest run server/src/http/csp.test.ts
```

## Excerpt

```
 Test Files  1 passed (1)
      Tests  12 passed (12)
   Start at  17:09:17
   Duration  577ms (transform 277ms, setup 0ms, import 444ms, tests 79ms, environment 0ms)
```

| Assertion | Result |
| --- | --- |
| exit code | 0 |
| the named file is **collected** | yes, `Test Files 1 passed (1)` — not `No test files found` |
| skipped | **0** — 12 passed of 12 |
| `server/src/http/csp.ts` | not touched by this attempt |
| `server/src/http/csp.test.ts` | not touched by this attempt |

Attempt 1's negative control stands unchanged in the same file: substituting
`style-src 'unsafe-inline'` for the nonce form fails 5 of the 12, so the row is
not vacuous and (iii) is not satisfied by a weaker header.

The row drives no sandbox, for P3.3's V6 reason: `csp.test.ts` builds the app
in-process against its own test database, writes its own temporary
`APUNTA_WEB_DIST` directory and passes `APUNTA_*` explicitly, so it inherits
nothing from this shell. The `503`s in the surrounding log lines are the
row's own boot-error server refusing requests the guard rejects, not failures.

Not run here, and deliberately: nothing in this row renders, so (vi) is the
**permission** half only. Its **runtime** half is V2(e), and V2(e) passed in the
shipped binary — see `V2-appimage-security.md`.
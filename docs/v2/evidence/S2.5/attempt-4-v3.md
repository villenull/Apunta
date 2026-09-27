# S2.5 attempt 4 — V3 (whole server and shared suites)

- Working directory: repository root (`<sandbox>/Apunta`)
- Node: `v24.19.0`, exported first as the row writes
- Start: 2026-09-26T18:36:26-06:00 · End: 2026-09-26T18:36:31-06:00
- Card commit under test: **`bc7528e`**

## Command

```
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node --version && npx vitest run server/src shared/src
```

## Exit codes

| Step | Exit |
| --- | --- |
| `node --version` | 0 (`v24.19.0`) |
| `npx vitest run server/src shared/src` | **0** |
| **row** | **0** |

## Output (excerpt)

```
 Test Files  92 passed (92)
      Tests  1349 passed (1349)
   Duration  4.13s
```

0 skipped. The row's floor is 90 files / 1304 tests; the attempt-3 review
measured 92 / 1344. **92 / 1349** is that figure plus exactly this attempt's
five new cases in `server/src/ai/refine-request.test.ts` — 1344 + 5 = 1349 — so
nothing else moved.

This is the row that collects `server/src/ai/refine-request.test.ts`, which
V1's fixed filter does not name.

## The sockets and databases this row opened

Exactly the ones the dispatch names, nothing more:

- `server/src/test/real-socket-guard.test.ts:27` — the only socket, **7812**
  (`APUNTA_PORT` unset), inside C-ISO@1's 7800–7889 band. The row runs **bare**,
  not through `scripts/v2/sandbox.mjs`; the card's assigned port 7839 and 7810
  stay unused, **7717 was never contacted**, and no browser was launched.
- The temp databases from `server/src/test/harness.ts:43-44`
  (`mkdtempSync(join(tmpdir(), 'apunta-test-'))`), created and deleted by the
  tests themselves. No live data folder, backup or export was opened (HS-1).

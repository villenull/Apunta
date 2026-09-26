# V2 — e2e with the change in place (PASS)

- **Working directory:** repository root
- **Started:** 2026-09-26T09:34:54Z
- **Finished:** 2026-09-26T09:34:59Z (5s; the test itself 520ms)
- **Sandbox run id:** `2026-09-26T09-34-54-183Z-384aec26`, port 7811
- **Exit code:** 0

## Command

The V1 command, unchanged, on the tree with the change:

```sh
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && export PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium && node scripts/v2/sandbox.mjs env --port 7811 > /tmp/apunta-v2-p1.1-e2e.env && . /tmp/apunta-v2-p1.1-e2e.env && npm run e2e --workspace @apunta/e2e -- --grep "settings appearance"
```

```
> @apunta/e2e@0.0.0 e2e
> playwright test --grep settings appearance

Running 1 test using 1 worker

  ✓  1 [chromium] › tests/settings-appearance.spec.ts:21:1 › settings appearance: keeps the chosen theme after leaving Settings and coming back, no reload (520ms)

  1 passed (4.7s)
```

## The four assertions

| # | Assertion | Held |
| --- | --- | --- |
| 1 | `[data-testid="theme-light"]` is `aria-checked="true"` after Home → Settings **with no reload** | yes |
| 2 | `document.documentElement.dataset.theme === 'light'` at the same moment (the page painted from the same provider value the selected segment is derived from) | yes |
| 3 | after `page.reload()`, Light is still the checked segment | yes |
| 4 | after `page.reload()`, the page is still light | yes |

The same test failed on assertions 1 and 2 on the base commit — see
[v1-e2e.md](./v1-e2e.md).

## Three earlier attempts, and why they are not V2's result

All three are the other card's uncommitted work in the shared tree, not this
card's code. Recorded because a reader should not have to take that on trust.

| Attempt | Time (UTC) | Result | What happened |
| --- | --- | --- | --- |
| 1 | 09:27:22Z | exit 1 | `npm run build` succeeded, the server listened on 7811, then hung on the first request: `Error: Timed out waiting 60000ms from config.webServer`. Diagnosed outside Playwright: `curl http://127.0.0.1:7811/api/health` timed out after 10s, while a request the in-flight `server/src/http/request-guard.ts` rejects answered 403 in 1.5ms. The guard, added to `server/src/app.ts` by the other card minutes earlier (neither file was in the tree at V1), lets allowed requests through to a handler that never answers. Not reproducible from this card's diff, which is `web/` and `e2e/` only. |
| 2 | 09:28:53Z | exit 1 | the same 60s webServer timeout, so not a one-off race |
| 3 | 09:33:05Z | exit 1 | the other card's tree stopped compiling mid-edit: `src/ai/model-picker.ts:4:56 - error TS6133: 'recommendedModelForMemory' is declared but its value is never read`, then `Process from config.webServer was not able to start. Exit code: 2` |
| 4 | 09:34:54Z | **exit 0** | 1 passed |

No fix was made here for any of them: HS-9 puts `server/**` outside this card's
write scope, and the other session was mid-build throughout.

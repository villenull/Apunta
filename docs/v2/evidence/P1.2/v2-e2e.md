# V2 — e2e: `settings appearance` in the sandbox

Working directory: repository root. Command, as the card's row writes it:

```sh
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node scripts/v2/sandbox.mjs env --port 7815 > /tmp/p12.env && . /tmp/p12.env && PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run e2e --workspace @apunta/e2e -- --grep "settings appearance"
```

One attempt, nothing retried, nothing worked around. Sandbox run id
**`2026-09-26T09-59-34-589Z-1b7670b2`**, port **7815**, data dir
`<sandbox>/2026-09-26T09-59-34-589Z-1b7670b2/data` (raw logs stay there and are
not committed). The `env` step exited 0 and printed:

```
export APUNTA_DATA_DIR='<sandbox>/2026-09-26T09-59-34-589Z-1b7670b2/data'
export APUNTA_PORT='7815'
export APUNTA_NO_OPEN='1'
export APUNTA_TEST_RUN_ID='2026-09-26T09-59-34-589Z-1b7670b2'
export APUNTA_V2='1'
export APUNTA_CHECK_URL='http://127.0.0.1:7815'
export APUNTA_E2E_PORT='7815'
```

The e2e itself started 2026-09-26T09:59:39Z and ended 09:59:43Z. Exit **0**.

The browser was the box's system Chromium, as the card requires
(`~/.cache/ms-playwright` does not exist; `e2e/playwright.config.ts:21` only sets
`launchOptions.executablePath` when `PLAYWRIGHT_CHROMIUM_EXECUTABLE` is
present). The variable was prefixed on the `npm run e2e` command itself, so the
Playwright shell inherited it — no `export` deviation was needed on this box.

## Reporter output (host fields and pids stripped)

```
> @apunta/e2e@0.0.0 e2e
> playwright test --grep settings appearance

Running 2 tests using 2 workers

  ✓  1 [chromium] › tests/settings-appearance.spec.ts:73:1 › settings appearance: moves and selects the theme with the arrow keys (259ms)
  ✓  2 [chromium] › tests/settings-appearance.spec.ts:21:1 › settings appearance: keeps the chosen theme after leaving Settings and coming back, no reload (564ms)

  2 passed (3.8s)
```

**The count is the check the card asks for**: the one test the file already held
plus the one Step 2 added = 2, and the second spec name is the exact title
`settings appearance: …`, so `--grep "settings appearance"` matched both and
nothing else. The whole build (shared, server, web) ran inside the sandbox's
`webServer` and `/api/health` answered on 7815 before the first test.

## The new case

`settings appearance: moves and selects the theme with the arrow keys`, in
`e2e/tests/settings-appearance.spec.ts`. The existing case at `:21` is
untouched and still passes.

1. `PUT /api/settings { theme: 'dark' }` first, as the existing test does, so the
   starting point does not depend on which spec ran before; a note format is
   created too, so the case is order-independent.
2. On `/settings`: Dark is `aria-checked="true"` and the page is painted
   `data-theme="dark"`; Dark is the only `tabindex="0"`, System and Light are
   `-1`. That is the "one tab stop" rule asserted in a real browser, and it is
   why the arrows are the only way to the other two.
3. `dark.focus()` then `ArrowLeft`: `theme-light` goes `aria-checked="true"`,
   Dark to `"false"`, `tabindex` moves to Light, Light is focused, the page is
   painted `data-theme="light"`, and the `Saved` note is up — moving **is**
   selecting, on the same `applyTheme` + save path a click takes, with no Enter
   or Space.
4. `Home`: `theme-system` goes `aria-checked="true"`, Light back to `"false"`,
   `tabindex` moves, System is focused, and `html` is painted
   `data-theme="light"` — **not** `system`. This is the resolved-theme rule in a
   real browser: the stored choice is `system`, and Playwright emulates a light
   OS, so what the page is painted is the resolved `light`. The literal is
   asserted absent as well as the resolved value asserted present.

## The save really happened

The sandbox server log for the run, sanitized, shows the keyboard case's two
`PUT /api/settings` on one connection after its `GET /api/settings` — ArrowLeft
(light) and Home (system) each persisted once, through the keyboard path:

```
[WebServer] {"level":30,"time":1790416783289,"reqId":"req-10","req":{"method":"PUT","url":"/api/settings","host":"127.0.0.1:7815","remoteAddress":"127.0.0.1","remotePort":46486},"msg":"incoming request"}
[WebServer] {"level":30,"time":1790416783289,"reqId":"req-11","req":{"method":"PUT","url":"/api/settings","host":"127.0.0.1:7815","remoteAddress":"127.0.0.1","remotePort":46486},"msg":"incoming request"}
[WebServer] {"level":30,"time":1790416783490,"reqId":"req-12","req":{"method":"GET","url":"/api/settings","host":"127.0.0.1:7815","remoteAddress":"127.0.0.1","remotePort":46438},"msg":"incoming request"}
[WebServer] {"level":30,"time":1790416783490,"reqId":"req-12","res":{"statusCode":200},"responseTime":0.27,"msg":"request completed"}
```

No request to 7717 at any point; every line above is 7815.

## Re-run after the base moved

At 10:01 the other card in flight committed `a2dc75d` (P1.4), moving HEAD
underneath this uncommitted work. `git diff --name-only c1bec23..a2dc75d` is
`server/src/**`, `scripts/*.sh` and `docs/**`; that server code had already been
in the working tree, uncommitted, when the run above executed, so the run above
was against the same bytes. Nothing was pulled, merged, rebased or reset. Still
re-run, in a fresh sandbox, same command as the card's row: run id
`2026-09-26T10-01-29-885Z-512a800a`, port 7815, started 10:01:29Z, ended
10:01:33Z, exit **0**.

```
Running 2 tests using 2 workers

  ✓  2 [chromium] › tests/settings-appearance.spec.ts:73:1 › settings appearance: moves and selects the theme with the arrow keys (255ms)
  ✓  1 [chromium] › tests/settings-appearance.spec.ts:21:1 › settings appearance: keeps the chosen theme after leaving Settings and coming back, no reload (532ms)

  2 passed (3.7s)
```

Same two tests, same count, at the new HEAD. Both sandbox run ids are listed in
the return file.

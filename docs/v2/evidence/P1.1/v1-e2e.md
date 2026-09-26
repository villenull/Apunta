# V1 — e2e on the base commit (expected FAIL)

- **Working directory:** repository root
- **Started:** 2026-09-26T09:16:52Z
- **Finished:** 2026-09-26T09:17:01Z (9s wall; the test itself 6.0s)
- **Sandbox run id:** `2026-09-26T09-16-52-200Z-28543ddb`, port 7811
- **Exit code:** 1

## Command

```sh
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && export PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium && node scripts/v2/sandbox.mjs env --port 7811 > /tmp/apunta-v2-p1.1-e2e.env && . /tmp/apunta-v2-p1.1-e2e.env && npm run e2e --workspace @apunta/e2e -- --grep "settings appearance"
```

The card's row writes `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium` as a
prefix to the `sandbox.mjs env` command. That sets the variable for the wrapper
process only — the wrapper prints `export` lines for the tools that start their
own server, and the Playwright shell never inherits the prefixed value, so
`e2e/playwright.config.ts:21` saw no `executablePath` and Playwright tried
`~/.cache/ms-playwright/chromium_headless_shell-1234`, which does not exist on
this box. That first attempt (run id
`2026-09-26T09-16-13-924Z-17cc691d`, also exit 1) failed with
`browserType.launch: Executable doesn't exist`, which the card calls BLOCKED
rather than V1. `export PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium` in the
same shell fixes it and is the only change; the path, the port and the filter
are the card's.

## Result

The test ran and failed on the C-SETTINGS@1 Normal-example assertion, which is
V1's expected outcome. Not a launch error, not `No tests found`: the browser
launched, the page loaded, Dark was selected and light was painted after the
click, and the failure is on the return to `/settings` **without a reload** —
`[data-testid="theme-light"]` is `aria-checked="false"`, because the provider
still holds Dark. The last two assertions (after `page.reload()`) were never
reached.

```
Running 1 test using 1 worker

  ✘  1 [chromium] › tests/settings-appearance.spec.ts:21:1 › settings appearance: keeps the chosen theme after leaving Settings and coming back, no reload (6.0s)

  1) [chromium] › tests/settings-appearance.spec.ts:21:1 › settings appearance: keeps the chosen theme after leaving Settings and coming back, no reload

    Error: expect(locator).toHaveAttribute(expected) failed

    Locator:  getByTestId('theme-light')
    Expected: "true"
    Received: "false"
    Timeout:  5000ms

    Call log:
      - Expect "toHaveAttribute" with timeout 5000ms
      - waiting for getByTestId('theme-light')
        14 × locator resolved to <button role="radio" type="button" title="Light" tabindex="-1" aria-label="Light" aria-checked="false" class="theme-switch-btn" data-testid="theme-light">…</button>
           - unexpected value "false"

      53 |   // The selected segment is derived from the provider, so this pair *is*
      54 |   // "provider value light" with the page painted from it.
    > 55 |   await expect(light).toHaveAttribute('aria-checked', 'true');
         |                       ^
      56 |   await expect(root).toHaveAttribute('data-theme', 'light');
         |                                     ^
      58 |   // And after a reload it is still light: the server was told, and told once.
        at e2e/tests/settings-appearance.spec.ts:55:23
```

One earlier iteration of the same row, before the V1 run of record, is worth
naming because it changed the spec rather than the code: the test asserted
`getByTestId('home')` after the back link, and on a fresh sandbox database `/`
redirects to `/onboarding/format` (no note format exists yet), so the assertion
timed out on navigation rather than on the contract. The spec now creates a
note format through the API first, so "navigate to Home" is Home.

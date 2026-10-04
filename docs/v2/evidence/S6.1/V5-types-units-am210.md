# S6.1 — V5 re-run under AM-210 (types and the full shared/web unit projects)

- Working directory: the repository root
- Started: 2026-10-04T21:23:20Z · Ended: 2026-10-04T21:23:33Z
- Pinned Node: `v24.19.0` (`export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH"`)
- Authority: **AM-210** (owner decision 2026-10-04), widening May edit to
  `web/src/App.test.tsx` and `e2e/tests/chat-dictation.spec.ts`, test-only.
- Command (exactly the row's):

```
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && npm run typecheck && npx vitest run --project shared --project web
```

## `npm run typecheck`

**Exit code: 0.** `build:shared` plus the `shared`, `server`, `installer`, `web`
and `e2e` typechecks all compile.

## `npx vitest run --project shared --project web`

**Exit code: 0 — 751 passed, 0 failed, 0 skipped, 70 files.**

```
 Test Files  70 passed (70)
      Tests  751 passed (751)
   Start at  15:23:27
   Duration  5.62s
```

## What changed since the FAIL reading

The previous reading (`V5-types-units.md`) was **FAIL, exit 1 — 750 passed, 1
failed** at `web/src/App.test.tsx:973`. AM-210 narrows that one assertion so it
targets the capture error rather than the first `role="alert"` on the page (the
`spelling.loadFailed` alert the spell layer renders under jsdom, where the
dictionary never loads). The new assertion, exactly as strong on the capture
error:

```ts
const captureError = await screen.findByTestId('capture-error');
expect(captureError.getAttribute('role')).toBe('alert');
expect(captureError).toHaveProperty(
  'textContent',
  expect.stringContaining("can't reach the local AI"),
);
```

It still proves the capture error is rendered as an alert carrying that text;
it only stops the query being ambiguous. No other case changed, and the `web`
project's pre-existing spelling cases and the whole `shared` project pass.

## Row verdict

**PASS, exit 0.**

# V1 — `server/src/http/csp.test.ts`

> **Attempt 2 (this attempt).** The row was re-run in full and reproduces attempt
> 1's result exactly: **12 collected, 12 passed, 0 skipped**, exit 0, in 533 ms.
> `server/src/http/csp.ts` and `server/src/http/csp.test.ts` are **inherited
> unchanged from attempt 1** (committed at `d56af1d`) — this attempt edited
> neither. The record below is attempt 1's, kept because its case-by-case and
> negative-control detail is what V1 means; attempt 2's own run fields follow.

- Working directory: the repository root.
- Command: `npm run build:shared && npx vitest run server/src/http/csp.test.ts`
- Exit code: **0**.
- Start / end time: 2026-10-02T18:18:24Z / 2026-10-02T18:18:25Z.
- Sandbox: none.

```
 Test Files  1 passed (1)
      Tests  12 passed (12)
   Duration  533ms
```

---

## Attempt 1 (the run record this attempt reproduces, `d56af1d`)

**Status: PASS.** 12 collected, 12 passed, **0 skipped**. A `No test files found`
for this path would have been a `FAIL`.

- Working directory: the repository root.
- Command: `npm run build:shared && npx vitest run server/src/http/csp.test.ts`
- Exit code: **0**.
- Start / end time: 2026-10-02T17:07:21Z / 2026-10-02T17:07:22Z.
- Sandbox: none. This row drives no sandbox, for P3.3's V6 reason — it builds the
  app in-process against its own temporary database.

```
 Test Files  1 passed (1)
      Tests  12 passed (12)
```

## The row's own web bundle

`web/dist` is gitignored and `build:shared` does not build it, so `app.ts:148`
would take its `hasBuiltSpa` false branch and the two HTML cases would have been
**silently absent** rather than failing. The test therefore writes its own
`index.html` into its own temporary directory and passes `APUNTA_WEB_DIST` to
`loadConfig` **explicitly**, never inherited — so neither a developer's shell nor
a stale `web/dist` can change what the row runs against. `APUNTA_DATA_DIR` is the
test's own temporary directory for the same reason. Both are removed in teardown.

## What each of (i)–(vi) is asserted by

| Case | What it asserts |
| --- | --- |
| (i) four cases | The CSP is present on the static `index.html`, on the SPA fallback (`GET /patients`), on the boot page at `/`, and on the boot server's non-`/api` not-found page — and each carries all six of rule 6's directives **verbatim** and with exactly the contract's source list |
| (ii) two cases | The boot page's header `style-src` nonce is byte-identical to the `nonce` attribute on the `<style>` element **in the payload the hook decorated**; two consecutive responses carry different nonces |
| (ii) one case | The rewritten boot payload is intact end to end, and `content-length` equals `Buffer.byteLength(body)` — so the byte length Fastify re-measures after `onSend` matches what it sends |
| (ii) one case | App HTML, which has no `<style>` element, arrives **byte-identical** to the file on disk: the header is emitted and nothing is rewritten |
| (iii) | `'unsafe-inline'` appears in `style-src-attr` and in **no other directive**, in every header; `style-src` is `['self', 'nonce-<n>']`; and in the source, `csp.ts` names the token on exactly one executable line, that being the `style-src-attr` one, while this test names it on none |
| (iv) | JSON, the `/api` 404 JSON, a real SSE response (`POST /api/generate`, `text/event-stream`), the boot server's `/api/health` and its `/api` not-found JSON all carry **no** `content-security-policy` header at all |
| (v) two cases | Both servers register `registerCsp(app)` **after** `registerRequestGuard(app,` — asserted by reading `app.ts` and `boot-error.ts`, because Fastify exposes no public API for hook order; `csp.ts` adds `onSend` and names no `onRequest`; `request-guard.ts` is unchanged, still `addHook('onRequest', guard)`, and names no CSP header |
| (vi) | The header on the static `index.html` and on the SPA fallback carries `style-src-attr 'unsafe-inline'` while `style-src` carries only `'self'` and the nonce, and `script-src`, `connect-src`, `default-src` and `object-src` are exactly rule 6's — the **permission** half, deliberately paired with V2(e)'s runtime half, neither standing for the other |

## The negative control, because the card requires it to be provable

> "a test that would pass with `style-src 'unsafe-inline'` substituted is not this
> row's test"

`server/src/http/csp.ts` was temporarily edited to emit
`style-src 'self' 'unsafe-inline'` in place of the nonce form, and **only** that
line, then restored.

- Command: `npx vitest run server/src/http/csp.test.ts`
- Exit code: **1**
- Start / end time: 2026-10-02T17:07:29Z / 2026-10-02T17:07:30Z

```
     × matches the boot page's header nonce to the nonce on its own inline <style>
     × gives two consecutive boot-page responses different nonces
     × emits the header and nothing else on app HTML, which has no <style> element
     × allows the inline token in style-src-attr and in no other directive
     × permits the app's inline style attributes on its own HTML, by header alone
      Tests  5 failed | 7 passed (12)
```

Five of twelve cases fail on the substitution. After restoring, the same command
reports `Tests  12 passed (12)`.

The source was restored from the copy taken immediately before the edit and
`csp.ts` is byte-identical to the version V4 then linted and typechecked; the
`git diff` for the file after the restore was empty.

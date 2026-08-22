# Apunta privacy audit — "nothing ever leaves the machine"

Audited 2026-08-22 against `CLAUDE.md` hard rule 1, `docs/PLAN.md` §2/§5, and the
egress-guard / ESLint rows in `docs/decisions.md`. Read-only: no file in the repo
was modified, no git command run, no build executed.

**M3 is mid-flight.** `server/src/ai/` was being written while this audit ran
(`config.ts` gained `APUNTA_OLLAMA_URL`, and `ai/index.ts` + `ai/fake.ts` appeared,
between my first and last read). Findings about `server/src/ai/**` describe code
that is not yet wired into any route — `app.ts` does not call `createProviders`.
They are flagged now precisely because they are one line from being live.

## Verdict

**The shipped M0–M2 code does not leak, and I could not construct a scenario in
which it does.** The browser bundle is genuinely self-contained, the URL allowlist
is genuinely tight, and nothing logs clinical content today. That is the honest
headline.

What is not true is the sentence in `docs/decisions.md` that reads as though the
egress guard and the ESLint rules are the enforcement. They are a fetch-shaped
tripwire and a literal-shaped tripwire respectively, and the audit below is mostly
a list of the shapes that walk past them.

| Severity | Count |
| --- | --- |
| Leak possible today | 0 |
| Guard weaker than it appears | 8 |
| Hardening worth doing | 5 |
| Verified sound | 8 |

---

# Leak possible today

**None.** Stated plainly:

- Every network call in `web/src` and `server/src` was enumerated (`fetch`,
  `XMLHttpRequest`, `sendBeacon`, `WebSocket`, `EventSource`, `node:http(s)`,
  `net.connect`, `dns`, `child_process`). The complete set outside tests is:
  `web/src/api/client.ts:73` (relative path, same origin) and
  `server/src/ai/ollama.ts:148/155/190/488` (loopback, not yet reachable from a route).
- The one subprocess in the tree is `server/src/ai/model-picker.ts:75`,
  `execFileSync('sysctl', ['-n', 'hw.memsize'])` — fixed argv, no shell, no
  interpolation.
- The built SPA in `web/dist/` (already on disk, read not rebuilt) contains no
  external URL, no `@font-face`, no `url(...)`, and no `sourceMappingURL`.

---

# Guard weaker than it appears

## W1. `fetch` follows redirects, and the guard only sees the first URL

`server/src/egress-guard.ts:86-90`

```ts
const guarded: GuardedFetch = async (input: FetchInput, init?: RequestInit) => {
  assertLoopbackUrl(urlOf(input));
  if (!original) throw new Error('global fetch is unavailable');
  return original(input, init);
};
```

`assertLoopbackUrl` runs once, on the URL the caller passed. `init` is forwarded
untouched, so `redirect` stays at its default `'follow'`, and undici follows up to
20 hops *inside* `original` — beneath the wrapper, which is never consulted again.

**Exploit.** `server/src/ai/ollama.ts:488` will `POST http://127.0.0.1:11434/api/chat`
with `body: JSON.stringify(payload)`, and that payload is the assembled prompt: the
therapist's typed notes, the transcript, and on refine the draft note itself. Any
process that owns loopback port 11434 — a hostile local binary, a user who set
`OLLAMA_HOST` to a forwarding proxy, a future Ollama release that redirects to its
cloud tier — answers `307 Temporary Redirect, Location: https://collector.example/`.
A 307 preserves method **and body**. The full note text is re-sent off-machine and
the guard logs nothing, because from its point of view one loopback request was made.

This is the single most important finding: it is not a theoretical hole in a guard,
it is a hole positioned exactly where M3's clinical-content POST is about to land.

**Fix** — belt (guard-level, catches everything) and braces (call-site):

```diff
--- a/server/src/egress-guard.ts
+++ b/server/src/egress-guard.ts
@@
   const guarded: GuardedFetch = async (input: FetchInput, init?: RequestInit) => {
     assertLoopbackUrl(urlOf(input));
     if (!original) throw new Error('global fetch is unavailable');
-    return original(input, init);
+    // `redirect: 'follow'` would let a loopback service bounce the request —
+    // method and body intact, on a 307 — to a host the guard never sees.
+    // Redirects have no legitimate use against Ollama or whisper.
+    const response = await original(input, { ...init, redirect: 'manual' });
+    if (response.status >= 300 && response.status < 400) {
+      throw new EgressBlockedError(urlOf(input), `the loopback service answered ${String(response.status)} with a redirect`);
+    }
+    return response;
   };
```

`redirect: 'manual'` rather than `'error'` so the thrown error names the offending
service instead of surfacing as an opaque `TypeError: fetch failed`.

Add to `server/src/egress-guard.test.ts`:

```ts
it('refuses a redirect out of loopback', async () => {
  underlying.mockResolvedValueOnce(
    new Response(null, { status: 307, headers: { location: 'https://evil.example/' } }),
  );
  await expect(fetch('http://127.0.0.1:11434/api/chat', { method: 'POST', body: '{}' }))
    .rejects.toThrow(EgressBlockedError);
});
```

## W2. The guard wraps `fetch` and nothing else

`server/src/egress-guard.ts:82-97`. `installEgressGuard` reassigns
`globalThis.fetch`. It does not touch, and cannot see:

| Escape route | Guarded? | Notes |
| --- | --- | --- |
| `globalThis.fetch(...)` | yes | the only covered path |
| `http.request` / `https.request` (`node:http`, `node:https`) | **no** | ~15 lines; what a hand-rolled client or an older dep uses |
| `undici.request` / `new undici.Agent()` | **no** | separate module instance from Node's internal undici; `undici@8.10.0` **is already in `node_modules`** (via `jsdom`, a `web` devDependency) |
| `net.connect` / `tls.connect` | **no** | |
| `dns.lookup` / `dns.resolve` | **no** | a hostname lookup alone exfiltrates via DNS; note text base32'd into subdomains is a classic covert channel |
| `new WebSocket(...)` (Node 22 global) | **no** | |
| `child_process` → `curl` / `nc` / `osascript` | **no** | |
| browser-side anything | **no** | see W8 — there is no browser guard at all |

None of these is *used* today (verified by full-tree grep, see "Leak possible today").
The point is that the guard's own docstring — "a mistake or a stray dependency then
fails loudly instead of leaking data" — is true only for `fetch`-shaped mistakes.

**Fix.** Extending the guard to `node:http`/`https` costs ~20 lines and closes the
two most likely accidental routes:

```diff
--- a/server/src/egress-guard.ts
+++ b/server/src/egress-guard.ts
@@
+import http from 'node:http';
+import https from 'node:https';
+
+/** `http.request` accepts (url), (url, opts) or (opts) — normalise to a URL. */
+function urlFromRequestArgs(protocol: 'http:' | 'https:', args: unknown[]): string {
+  const first = args[0];
+  if (typeof first === 'string') return first;
+  if (first instanceof URL) return first.href;
+  const opts = (first ?? {}) as { host?: string; hostname?: string; port?: number | string; path?: string };
+  const host = opts.hostname ?? opts.host ?? 'localhost';
+  const port = opts.port === undefined ? '' : `:${String(opts.port)}`;
+  return `${protocol}//${host}${port}${opts.path ?? '/'}`;
+}
+
+function guardNodeHttp(): () => void {
+  const originals = [
+    ['http:', http, 'request'], ['http:', http, 'get'],
+    ['https:', https, 'request'], ['https:', https, 'get'],
+  ] as const;
+  const restores = originals.map(([protocol, mod, key]) => {
+    const original = mod[key] as (...args: unknown[]) => unknown;
+    (mod as Record<string, unknown>)[key] = (...args: unknown[]) => {
+      assertLoopbackUrl(urlFromRequestArgs(protocol, args));
+      return original(...args);
+    };
+    return () => { (mod as Record<string, unknown>)[key] = original; };
+  });
+  return () => { for (const restore of restores) restore(); }
+}
```

then call it from `installEgressGuard` and compose the two restore functions.

`net`/`dns`/`child_process` are not worth patching — an agent that reaches for
`net.connect` is not making an accident — but they belong in the "what M3 must not
do" list below, and the docstring should stop implying they are covered.

## W3. The guard installs *after* every transitive dependency has been evaluated

`server/src/index.ts:1-7` (identical in the built `server/dist/index.js:1-6`):

```ts
import { buildApp } from './app.js';
import { ensureDataDir, loadConfig } from './config.js';
import { installEgressGuard } from './egress-guard.js';

// First thing, before anything can make a request: lock outbound network access
// down to loopback. See egress-guard.ts.
installEgressGuard();
```

ESM hoists and evaluates all three imports — and everything `./app.js` pulls in
(fastify, `@fastify/static`, better-sqlite3, zod, and their trees) — to completion
**before** line 7 executes. The comment's claim is false in two ways:

- a dependency doing `const f = globalThis.fetch` or `const { fetch } = globalThis`
  at module scope captures the *unguarded* original, and every later call through
  that reference is invisible to the guard, forever;
- a dependency that fetches during module evaluation (top-level `await`) is never
  guarded at all.

Neither happens in today's dependency set. It is a latent trap that fires silently
the first time someone adds a dep that does either.

**Fix.** Import ordering *is* evaluation ordering, so a side-effect-only module
listed first is sufficient and costs nothing:

```diff
--- a/server/src/index.ts
+++ b/server/src/index.ts
@@
+// Must be the first import: ESM evaluates imports in order, and a dependency
+// evaluated before the guard installs can capture the unguarded `fetch`.
+import './install-egress-guard.js';
+
 import { buildApp } from './app.js';
 import { ensureDataDir, loadConfig } from './config.js';
-import { installEgressGuard } from './egress-guard.js';
-
-// First thing, before anything can make a request: lock outbound network access
-// down to loopback. See egress-guard.ts.
-installEgressGuard();
```

with a new `server/src/install-egress-guard.ts`:

```ts
import { installEgressGuard } from './egress-guard.js';
installEgressGuard();
```

Add an ESLint `import/first`-style guard or a comment; better still, the packaged
app (M8) should use `node --import ./dist/install-egress-guard.js dist/index.js`,
which installs the guard before *any* application module is loaded.

## W4. The guard is installed in exactly one of five entry points

Verified by grep for `installEgressGuard` across the whole tree — the only
production call site is `server/src/index.ts:7`.

| Entry point | Guarded? |
| --- | --- |
| `npm start` → `server/dist/index.js` | yes (modulo W3) |
| `npm run dev` → `tsx watch src/index.ts` | yes (modulo W3) |
| `npm run e2e` → `node server/dist/index.js` (`e2e/playwright.config.ts:38`) | yes |
| **`npm run seed` → `server/src/seed-cli.ts`** | **no** |
| **`npm test` → vitest (`vitest.config.ts`, no `setupFiles`)** | **no** |

The seed CLI is low-stakes (it reads the prototype's sample data and writes SQLite).
The **test** gap is the one that matters: it means **CI cannot detect a dependency
that phones home.** The whole unit + integration suite runs with a live, unguarded
network stack, and `web`'s suite runs under jsdom, which bundles `undici@8.10.0`.
A dep that fetches on import would go green in CI and only fail — loudly, correctly —
on the therapist's machine.

There is a second-order effect: `eslint.config.js:76-80` turns
`no-restricted-syntax` **off** for `**/*.test.{ts,tsx}` and `e2e/**`. So test files
may name outbound URLs *and* the process they run in may reach them. Both halves of
the defence are off in the same place.

**Fix** — a global vitest setup, which also converts "CI cannot detect it" into
"CI fails on it":

```diff
--- a/vitest.config.ts
+++ b/vitest.config.ts
@@
 export default defineConfig({
   test: {
     projects: ['shared', 'server', 'web'],
+    // Tests run with the same egress lock as the app, so a dependency that
+    // phones home fails in CI instead of on the therapist's machine.
+    setupFiles: ['./server/src/install-egress-guard.ts'],
   },
 });
```

and in `server/src/seed-cli.ts`, add the same first-line side-effect import as W3.

`server/src/egress-guard.test.ts` already swaps `globalThis.fetch` for a `vi.fn()`
in `beforeEach`, so it is unaffected by a global install.

## W5. The SpeechRecognition ban does not catch how anyone actually writes it

`eslint.config.js:26-36` uses `no-restricted-globals`, which reports only
*identifier references that resolve to a global binding*. I read the rule's
implementation at `node_modules/eslint/lib/rules/no-restricted-globals.js` to
confirm rather than infer:

- line 25: `const GLOBAL_OBJECTS = new Set(["globalThis", "self", "window"]);`
- lines 111-122: member-expression checking is gated on a `checkGlobalObject`
  option, which defaults to `false` and **is not set in this repo's config**
  (the config passes a plain array, so `isGlobalsObject` is false).

So the rule catches `new SpeechRecognition()` and misses every one of these:

```js
const SR = window.SpeechRecognition || window.webkitSpeechRecognition; // not caught
new globalThis.webkitSpeechRecognition();                              // not caught
new self.SpeechRecognition();                                          // not caught
```

The `window.X || window.webkitX` form is the canonical MDN snippet and the one an
agent implementing M5 would paste. `docs/decisions.md` lists this rule as the
enforcement for a hard rule whose violation ships audio to Google.

**Fix** — the installed ESLint already supports the option:

```diff
--- a/eslint.config.js
+++ b/eslint.config.js
@@
   'no-restricted-globals': [
     'error',
     {
+      // Without this, only a bare `SpeechRecognition` identifier is caught —
+      // not `window.SpeechRecognition`, which is how the API is always written.
+      checkGlobalObject: true,
+      globals: [
+        {
+          name: 'SpeechRecognition',
+          message: 'The Web Speech API can send audio to Google. Transcription runs server-side (whisper.cpp).',
+        },
+        {
+          name: 'webkitSpeechRecognition',
+          message: 'The Web Speech API can send audio to Google. Transcription runs server-side (whisper.cpp).',
+        },
+      ],
+    },
-      name: 'SpeechRecognition',
-      message: 'The Web Speech API can send audio to Google. Transcription runs server-side (whisper.cpp).',
-    },
-    {
-      name: 'webkitSpeechRecognition',
-      message: 'The Web Speech API can send audio to Google. Transcription runs server-side (whisper.cpp).',
-    },
   ],
```

(`checkGlobalObject: true` covers `window`/`globalThis`/`self` per `GLOBAL_OBJECTS`.)

## W6. The URL-literal rule cannot see the file type where the violation actually lived

`eslint.config.js:12-25`, `NON_LOOPBACK_URL = /^https?:\/\/(?!127\.0\.0\.1|localhost|\[::1\])/`
applied to `Literal[value=...]` and `TemplateElement[value.raw=...]`, scoped by
`files: ['**/*.{ts,tsx,js,mjs}']` (line 53).

What it **does** catch, and better than I expected:
- `'https://api.openai.com/v1/...'` — string literal.
- `` `https://evil.com/${id}` `` — the first `TemplateElement.raw` matches.
- `'https://' + host` — the bare-scheme literal `'https://'` matches the regex,
  because the negative lookahead trivially succeeds at end-of-string.

What it **does not** catch:

1. **CSS. HTML. Any non-JS file.** This is the sharp one. The single documented
   historical violation in this project is
   `prototype/style.css:1`:
   `@import url('https://fonts.googleapis.com/css2?family=Lora...')`.
   `docs/decisions.md` credits ESLint with enforcing "no CDN assets at runtime" —
   but no ESLint config block names `.css` or `.html`, so the rule that is supposed
   to prevent that exact line reoccurring in `web/src/styles/` **would not fire**.
   Someone re-adding the `@import` while porting more of the prototype passes lint,
   passes typecheck, passes unit tests, passes e2e, and ships a Google request on
   every page load. (`prototype/**` is also in `ignores`, line 47.)
2. `'api.openai.com'` as a bare hostname, then `` `https://${HOST}` `` — wait, that
   one *is* caught (leading `https://` raw). But `const H = 'api.openai.com'` used
   via `new URL('/v1/chat', \`http://\${H}\`)` — caught. Whereas
   `new URL(path, baseFromDatabase)` — **not caught**, and that is the realistic
   shape now that `config.ollamaUrl` exists (W7).
3. `'//fonts.googleapis.com/...'` — protocol-relative, no scheme, no match.
4. `.cjs`, `.cts`, `.mts`, `.jsx` files — outside the `files` glob. A `.cjs` file
   is still linted (by `js.configs.recommended`, which is unscoped) but **without**
   the privacy block; a `.jsx` file matches no `files` entry at all and is not
   linted whatsoever.
5. JSON, YAML, SQL, `.env`, `server/migrations/*.sql` — never linted.
6. A dependency that phones home. The rule inspects this repo's syntax only; it says
   nothing about what `node_modules` does. That is W4's job, and W4 is off in tests.

**Fix** — the rule cannot be taught CSS, so add an assertion on the *artefact*
instead, which is stronger than any source-level rule because it catches
transitive and generated content too. In `.github/workflows/ci.yml`, after `Build`:

```diff
       - name: Build
         run: npm run build
+
+      - name: No non-loopback URLs in shipped assets
+        run: |
+          if grep -rInoP 'https?://(?!127\.0\.0\.1|localhost|\[::1\])[^"'"'"'`) ]*' \
+               web/dist server/dist \
+               | grep -vE 'www\.w3\.org|json-schema\.org|react\.dev/errors|reactrouter\.com'; then
+            echo "::error::A non-loopback URL reached the build output (CLAUDE.md hard rule 1)."
+            exit 1
+          fi
```

The allowlist tail is the four benign strings I verified are already in the bundle
(XML namespaces, JSON-Schema `$schema` identifiers, and React/react-router error-message
text — none of which is ever fetched). Keeping them explicit means the check is a
tripwire on *change*, not a running battle with false positives.

## W7. `APUNTA_OLLAMA_URL` is an unvalidated outbound base URL

`server/src/config.ts:92` (landed during this audit):

```ts
ollamaUrl: env['APUNTA_OLLAMA_URL']?.trim() || DEFAULT_OLLAMA_URL,
```

consumed at `server/src/ai/index.ts:34` → `OllamaProvider({ baseUrl: config.ollamaUrl })`.
Nothing validates it. `APUNTA_OLLAMA_URL=https://evil.example` is accepted at boot,
and the *only* thing that stops the note text leaving is the fetch guard — i.e. all
of W1, W2 and W3 become load-bearing for it simultaneously.

The comment on line 49 ("Loopback only — the egress guard sees to that") is exactly
the assumption this audit is questioning. Defence in depth costs three lines, and
converts a silent first-draft failure into a clear boot-time error:

```diff
--- a/server/src/config.ts
+++ b/server/src/config.ts
@@
+import { assertLoopbackUrl } from './egress-guard.js';
+
@@
-    ollamaUrl: env['APUNTA_OLLAMA_URL']?.trim() || DEFAULT_OLLAMA_URL,
+    ollamaUrl: loopbackOnly(env['APUNTA_OLLAMA_URL']?.trim() || DEFAULT_OLLAMA_URL),
@@
+/**
+ * Fail at boot, not at the first draft. The egress guard would block a
+ * non-loopback Ollama anyway, but only after the prompt had been assembled —
+ * and only for as long as every outbound path goes through `fetch`.
+ */
+function loopbackOnly(url: string): string {
+  assertLoopbackUrl(url);
+  return url;
+}
```

Same treatment for `whisper_binary` / any future URL-shaped setting in M5.

## W8. The SPA has no CSP — there is no browser-side egress guard at all

`web/index.html`, `web/dist/index.html`, and `server/src/app.ts:51-63` — verified by
grep: no `Content-Security-Policy`, no `<meta http-equiv>`, no `@fastify/helmet`,
no `reply.header` anywhere in `server/src`.

The server-side guard gives an impression of coverage it does not have. Roughly half
this application is a React bundle running in Chrome with the full ambient authority
of a browser tab: `fetch`, `WebSocket`, `sendBeacon`, `new Image().src`, a form POST,
a `<link rel=prefetch>`. `docs/decisions.md`'s egress-guard row does not distinguish
the two sides. Nothing today abuses this (W-none, verified), and note text is in the
DOM the whole time the therapist is working.

**Fix.** A CSP is the browser-side equivalent of the egress guard and is strictly
more reliable than the server-side one, because it is enforced by Chrome rather than
by a monkey-patch a dependency can step around:

```diff
--- a/server/src/app.ts
+++ b/server/src/app.ts
@@
   registerErrorHandler(app);
+
+  // The browser half of hard rule 1. The server guard cannot see anything the
+  // page does; Chrome enforces this one, and a dependency cannot patch around it.
+  app.addHook('onSend', async (_request, reply) => {
+    reply.header(
+      'content-security-policy',
+      [
+        "default-src 'self'",
+        "script-src 'self'",
+        "style-src 'self' 'unsafe-inline'",
+        "img-src 'self' data:",
+        "font-src 'self'",
+        "connect-src 'self'",
+        "form-action 'none'",
+        "frame-ancestors 'none'",
+        "base-uri 'none'",
+      ].join('; '),
+    );
+    reply.header('referrer-policy', 'no-referrer');
+  });
```

Two notes on this policy. `style-src 'unsafe-inline'` is required because Vite's
React plugin and inline `style=` attributes need it — it is not an egress risk.
`connect-src 'self'` is the load-bearing directive: it blocks `fetch`, XHR,
`WebSocket`, `EventSource` and `sendBeacon` to any other origin. Verify against
`npm run dev` too — Vite's HMR client connects a WebSocket to `127.0.0.1:5173`,
which `'self'` covers only when the page origin is that same port; if it trips, scope
the hook to production (`hasBuiltSpa`).

---

# Hardening worth doing

## H1. `server/src/ai/ollama.ts:437` puts note text into an error detail, and `:383` logs it

Not yet live — `options.log` defaults to a no-op (`ollama.ts:147`) and no caller
passes one — but this is the logging habit M3 will inherit, so it is worth fixing
while it is one line.

```ts
// ollama.ts:437
throw new NotJson(`${String(error)}; first 120 chars: ${text.slice(0, 120)}`);
```

`text` is the model's raw output — i.e. the drafted note. 120 characters of a first
section is reliably enough to carry a presenting problem. It lands on
`AiError.detail`, and `ollama.ts:379-384` writes that straight into the log:

```ts
this.log('draft attempt rejected', { model, attempt, code: lastError.code, detail: lastError.detail });
```

There is a second, quieter route to the same place that needs no `log` wiring at all.
`AiError` is not an `HttpError`, so if one escapes a route it falls through
`server/src/http/errors.ts:55-61` to `request.log.error(error)`. Fastify's `err`
serializer is `pino.stdSerializers.err`, and I read its implementation at
`node_modules/pino-std-serializers/lib/err.js:29-39`:

```js
for (const key in err) {
  if (_err[key] === undefined) { ... _err[key] = val }
}
```

It copies **every enumerable property** of the error onto the log record. `detail` is
an own enumerable property (`ai/errors.ts:20`). So an unhandled `AiError` prints the
note excerpt to stdout — which in `npm start` is a terminal, and in M8's packaged app
will be a log file on disk with no retention policy.

`server/src/ai/ollama.ts:301` has a smaller version of the same problem:
`String(JSON.parse error)` embeds ~10 characters of the input, verified:

```
> JSON.parse('Patient reports worsening panic attacks since starting sertraline...')
SyntaxError: Unexpected token 'P', "Patient re"... is not valid JSON
```

For `detectFormat` the input derives from the format sample the owner pastes in,
which `docs/decisions.md` records may be her real past notes.

**Fix.** Log the *shape*, never the content — the diagnostics that matter (was the
grammar applied? did it return JSON at all?) are all shape:

```diff
--- a/server/src/ai/ollama.ts
+++ b/server/src/ai/ollama.ts
@@
-      throw new NotJson(`${String(error)}; first 120 chars: ${text.slice(0, 120)}`);
+      // Never the text itself: on this path `text` is the drafted note.
+      // Length and first character are enough to tell a fence from prose
+      // from a truncated object, and carry no clinical content.
+      throw new NotJson(
+        `not JSON: ${String(text.length)} chars, starts with ${JSON.stringify(text.slice(0, 1))}`,
+      );
@@
-      throw aiError('invalid_output', `detectFormat did not return JSON: ${String(error)}`);
+      throw aiError(
+        'invalid_output',
+        `detectFormat did not return JSON (${String(text.length)} chars)`,
+      );
```

and make the leak structurally impossible rather than a rule to remember:

```diff
--- a/server/src/ai/errors.ts
+++ b/server/src/ai/errors.ts
@@
 export class AiError extends Error {
   readonly code: AiErrorCode;
-  /** Technical context for the server log. Never sent to the browser. */
-  readonly detail: string | undefined;
+  /**
+   * Technical context for the server log. Never sent to the browser, and
+   * non-enumerable so pino's `err` serializer (which copies every enumerable
+   * own property) cannot print it if this error escapes to the error handler.
+   * Never put model output or source text in here — shape only.
+   */
+  readonly detail: string | undefined;
@@
     this.code = code;
-    this.detail = detail;
+    Object.defineProperty(this, 'detail', { value: detail, enumerable: false });
   }
```

## H2. Fastify logs full request URLs with no redaction policy

`server/src/app.ts:33` — `Fastify({ logger: options.logger ?? true })`, no `redact`,
no custom serializers. I read Fastify 5.12.1's defaults at
`node_modules/fastify/lib/logger-pino.js:45-62` and confirmed the `req` serializer
emits `{method, url, version, host, remoteAddress, remotePort}` and `res` emits
`{statusCode}` — **no headers and no body**. That is the right default and it holds
today: every route path is `/api/<collection>/:uuid` and the one query parameter in
the tree is `include_archived` (`server/src/routes/patients.ts:32`).

It is worth setting an explicit floor anyway, because it is the thing M5 will violate
first — an audio upload or a transcript endpoint that takes text in a query string
would start writing clinical content to stdout with no code review signal:

```diff
--- a/server/src/app.ts
+++ b/server/src/app.ts
@@
-  const app = Fastify({ logger: options.logger ?? true });
+  const app = Fastify({
+    logger:
+      options.logger === false
+        ? false
+        : {
+            // Clinical content must never reach a log line. Fastify's default
+            // serializers already omit bodies and headers; this pins the request
+            // log to the path with the query string dropped, so a future endpoint
+            // that takes text in a query cannot start leaking it silently.
+            serializers: {
+              req: (request) => ({
+                method: request.method,
+                url: request.url.split('?')[0],
+              }),
+            },
+          },
+  });
```

## H3. Database and data directory are created world-readable

`server/src/db/index.ts:30-32` and `server/src/config.ts:79`. `mkdirSync` and
better-sqlite3's file creation both use the process umask, so on a typical macOS
account the result is `drwxr-xr-x` / `-rw-r--r--`: every local account can read
every note. WAL mode (`index.ts:33`) adds `apunta.db-wal` and `apunta.db-shm`
alongside — expected, not a surprise location.

Kept brief, per the brief — another agent covers at-rest storage. Two cheap wins:
`mkdirSync(dataDir, { recursive: true, mode: 0o700 })`, then `chmodSync(dbFile, 0o600)`
after open. One thing that agent may not look at: SQLite spills large sorts and
temp B-trees to `$TMPDIR` by default, outside the data directory entirely.
`db.pragma('temp_store = MEMORY')` keeps note text out of `/var/folders`.

## H4. No favicon, so every page load 200s the SPA shell to `/favicon.ico`

`web/index.html` declares none, and `server/src/app.ts:58-63` falls back to
`index.html` for any non-`/api` GET. Harmless — same origin, no external fetch — but
Chrome will also try `/favicon.ico` at the *parent* path in some flows, and an
explicit inline data-URI favicon is one line that removes the noise and forecloses
anyone "fixing" it later with a CDN icon.

## H5. `prototype/style.css:1` still carries the Google Fonts `@import`

Correct as-is — the prototype is a frozen design reference, `CLAUDE.md` says do not
modify it, and nothing serves it. Flagged only because it is the copy-paste source
for the CSS that W6 shows lint cannot check. A one-line comment above it
(`/* NOT ported: hard rule 1 bans CDN assets — see web/src/styles/tokens.css */`)
would put the warning where the paste happens, if the "do not modify" rule ever
admits a comment.

---

# Verified sound

Each of these I checked by reading the code or the artefact, not by assuming.

**V1. The URL allowlist is genuinely tight.** `egress-guard.ts:13-59`. Because
`new URL()` normalises before the check, obfuscated loopback forms resolve to
`127.0.0.1` *and are then correctly allowed*, while every lookalike fails closed.
Probed:

| Input | Result | Parsed host |
| --- | --- | --- |
| `http://127.1:11434/` | allow | `127.0.0.1` (genuine loopback) |
| `http://0x7f.1/` | allow | `127.0.0.1` |
| `http://2130706433/` | allow | `127.0.0.1` |
| `http://LOCALHOST:11434/` | allow | `localhost` |
| `http://127.0.0.1.evil.com/` | **block** | `127.0.0.1.evil.com` |
| `http://user@127.0.0.1:11434@evil.com/` | **block** | `evil.com` |
| `http://[::ffff:127.0.0.1]/` | **block** | `::ffff:7f00:1` (fails closed) |
| `http://localhost./` | **block** | `localhost.` (fails closed) |

The `127.0.0.1.evil.com` and `localhost.evil.com` cases are already in
`egress-guard.test.ts:21-22`. No port handling is needed — any loopback port is a
local service by definition.

**On DNS rebinding.** There is a shape here but it is narrow, and I want to be
precise rather than alarming. `localhost` is a *name*, resolved by Node through
`dns.lookup` → `/etc/hosts` → system resolver. If `localhost` were absent from
`/etc/hosts` and the resolver answered for it, the guard would allow a request to
whatever it answered. Classic time-of-check/time-of-use rebinding (resolve to
127.0.0.1 for the check, then to a public IP for the connection) does **not** apply,
because the guard checks a string and never resolves anything — there is no TOCTOU
window to widen. The realistic mitigation is the one already in place:
`DEFAULT_OLLAMA_URL` is the literal `127.0.0.1`, not `localhost`. Keep it that way,
and pair it with W7's boot-time validation. Dropping `localhost` from
`ALLOWED_HOSTNAMES` entirely would be tighter still and I can see no outbound caller
that needs it — but it would break `egress-guard.test.ts:8,80`, so it is a decision,
not a fix.

**V2. The browser bundle is self-contained.** Read `web/dist/assets/index-CuXtxnpY.js`
(331KB) and `index-BTIB4Uuq.css` (11KB) as they sit on disk — no rebuild:
- zero `@font-face`, zero `@import`, zero `url(...)` in the CSS;
- zero `sourceMappingURL` in either file;
- zero `XMLHttpRequest`, `sendBeacon`, `WebSocket`, `EventSource`, `RTCPeerConnection`;
- exactly two `fetch(` call sites: Vite's module-preload polyfill (`fetch(e.href)`,
  same-origin `<link>` hrefs) and `web/src/api/client.ts`'s `send()`;
- the only absolute URLs are non-fetched strings: W3C XML namespaces, JSON-Schema
  `$schema` identifiers from zod, and the `react.dev/errors/` and `reactrouter.com`
  doc links React embeds in console messages. I checked each is a string constant,
  not an argument to anything network-shaped.

`web/dist/index.html` references only `/assets/*`. `vite.config.ts:11` sets
`assetsInlineLimit: 0` with the intent stated in a comment; the `crossorigin`
attributes Vite emits are same-origin and inert.

**V3. The Google Fonts `@import` really was dropped.** `web/src/styles/tokens.css`
has no `@import`; lines 5-8 document why. `--font-sans`/`--font-serif` (lines 31-32)
keep `'Inter'`/`'Lora'` as the first entry of a fallback stack — a *name*, which the
browser resolves against locally installed fonts and never fetches. No font file is
requested at runtime. This matches the `docs/decisions.md` row exactly.

**V4. No Web Speech API anywhere.** Grep for `SpeechRecognition`, `getUserMedia`,
`MediaRecorder`, `AudioContext` across `web/src` returns nothing (M5 unwritten). The
lint rule that is supposed to keep it that way has the hole in W5.

**V5. Clinical content does not reach logs or the browser today.** The complete set
of log call sites in non-test server code is three lines
(`index.ts:22`, `index.ts:27`, `http/errors.ts:60`) plus three `console.warn`s in
`seed-cli.ts`. None carries note, transcript or patient content. `http/errors.ts:61`
returns a fixed `'Something went wrong on the server.'` for every 500 — **no stack
trace reaches the browser**, which is the right call and worth keeping when M3 adds
its error paths.

**V6. Zod issues carry no input values.** `http/validate.ts:11-33` sends
`result.error.issues` to the client on a 400. I checked what zod 4 actually puts in
an issue rather than trusting it: a `too_big` on a 24-character string yields
`{origin, code, maximum, inclusive, path, message}` — the string itself is absent;
`invalid_type` yields `{expected, code, path, message}`. And these issues are only
ever *sent*, never logged. `HttpError.details` is likewise returned, never logged
(`http/errors.ts:45-47` returns before reaching line 60).

**V7. No dependency phones home.** Parsed `package-lock.json` (353 packages):
- exactly three packages carry install scripts — `esbuild` (fetches its platform
  binary from the npm registry at install time), and two copies of `fsevents`
  (native build, macOS). Both are install-time, registry-only, dev-tooling.
  `better-sqlite3@13.0.3` has **no** install script (verified in its own
  `package.json`).
- no telemetry, analytics, error-reporting, update-notifier or `latest-version`-class
  package anywhere in the tree.
- the one HTTP client in `node_modules` is `undici@8.10.0`, pulled by `jsdom`, a
  `web` devDependency reachable only from vitest — not in the production server's
  dependency graph. It is still the reason W4 (no guard in tests) matters.
- no `.npmrc`, so no alternate registry or proxy is configured.
- `docs/decisions.md` records "no auto-updater and no telemetry in the packaged app"
  for M8, which is the right pre-commitment.

**V8. `OllamaProvider` resolves `fetch` late — the correct pattern.**
`server/src/ai/ollama.ts:148`:

```ts
this.fetchImpl = options.fetchImpl ?? ((...args) => globalThis.fetch(...args));
```

The arrow function reads `globalThis.fetch` at *call* time, not at construction or
import time. This is exactly what makes the guard effective despite W3, and it should
be the stated pattern for every future provider. Worth a line in `CLAUDE.md`, because
the natural-looking alternative (`this.fetchImpl = options.fetchImpl ?? fetch`)
captures a reference and silently defeats the guard.

Also sound in the same file: `model-picker.ts` refuses non-GGUF tags via both a name
denylist and an authoritative `details.format` allowlist (`assertGgufWeights`), and
`shared/src/generate.ts:116-120` defines the SSE error event as `{code, message}`
with **no `detail` field** — so the AiError detail correctly cannot reach the browser
even by accident. That was a deliberate, good decision.

---

# What M3 must not do

Ordered by how likely I think each is, given what is already in `server/src/ai/`.

1. **Do not wire `createProviders`' `log` callback to `app.log` without fixing H1
   first.** `ai/index.ts:23` accepts a logger and `ollama.ts:383` passes
   `lastError.detail` into it; `ollama.ts:437` puts 120 characters of the drafted
   note into that detail. The one-line wiring
   `createProviders(config, db, (m, d) => app.log.warn(d, m))` prints clinical
   content to stdout. Log shape, never text.

2. **Do not let an `AiError` escape to the Fastify error handler.** `http/errors.ts:60`
   plus pino's `err` serializer copies every enumerable property — `detail` included.
   Catch `AiError` in the route and convert it to an SSE `error` event
   (`{code, message}`, which `shared/src/generate.ts` already defines correctly).

3. **Do not put source text, prompts, or model output in an error message,
   an error `detail`, a `console.warn`, or an exception passed to `String()`.**
   `String(jsonParseError)` embeds input. So does a zod `invalid_format` message in
   some shapes. Assume anything stringified from user data carries it.

4. **Do not set `redirect: 'follow'` (or rely on the default) on a provider fetch
   that carries note text.** Until W1 is fixed at the guard, pass
   `redirect: 'error'` explicitly on the `/api/chat` and `/api/show` calls. This is
   the only item on this list that leaks the *entire* note rather than an excerpt.

5. **Do not reach for `node:http`, `undici`, `axios`, `got`, `EventSource`, or
   `child_process` + `curl` for the streaming call.** The guard sees none of them.
   `fetch` with a `ReadableStream` body reader — which `ollama.ts` already does
   correctly — is the only guarded way to stream.

6. **Do not capture `fetch` at module scope.** `const f = fetch` at the top of a new
   provider file binds the unguarded original, because of W3. Follow `ollama.ts:148`.

7. **Do not add a model-download, model-list-refresh, or "check for a newer model"
   call that reaches ollama.com.** Ollama's `/api/pull` is a loopback endpoint that
   makes Ollama itself fetch from the internet — the guard cannot see that, because
   the request leaving the machine is not ours. It is arguably fine (the user asked
   for a model), but it is a decision for `docs/decisions.md`, not something to slip
   in under "setup". The same reasoning kills any Ollama cloud-tier path.

8. **Do not put the Ollama base URL into a settings key without validating it.**
   `config.ollamaUrl` (W7) already needs boot-time validation; a `PUT /api/settings`
   route that accepts an arbitrary base URL would make an unvalidated exfil target
   writable over HTTP by anything that can reach the loopback API.

9. **Do not add a `.jsx`, `.cjs` or `.css` file assuming lint covers it** (W6). If
   M3 adds a stylesheet for the drafting screen, no rule inspects it for `@import`.

10. **Do not relax `APUNTA_FAKE_AI=1` in CI to "test the real path."** With no egress
    guard in the test process (W4), a real-provider CI run is a process with network
    access, an unvalidated base URL, and note-shaped fixtures.

---

# Suggested order of work

1. **W1** (redirect) — the only finding that leaks a whole note, and M3 lands on it this week.
2. **H1** (note text in error detail / log) — same reason, and cheaper to fix before the log is wired than after.
3. **W7** (validate `ollamaUrl` at boot) — three lines, and it makes W1/W2/W3 non-load-bearing for the config path.
4. **W5** (`checkGlobalObject: true`) — one config key, closes a hard-rule hole entirely.
5. **W4** (guard in vitest) — turns "CI cannot detect a phoning-home dep" into "CI fails on it".
6. **W3** (import ordering) — three lines, removes a latent trap.
7. **W8** (CSP) — the largest coverage gain per line in the whole list, but needs a `npm run dev` check.
8. **W6** (build-output assertion), **W2** (`node:http`), then H2–H5.

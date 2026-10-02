/**
 * C-BRIDGE@1 rule 6, the server's Content-Security-Policy. One function,
 * applied as an `onSend` hook in **both** servers: the main app and the
 * boot-error server.
 *
 * **`onSend`, not `onRequest`.** The rule is "a Content-Security-Policy on every
 * HTML response", and an `onSend` hook is the only hook that can decide that
 * without the header ending up inside a route body. It sees the finished
 * payload and the reply's status; it cannot tell a static file from the SPA
 * fallback from the boot page by route table, and it does not need to — a
 * `text/html` response is a `text/html` response. `onRequest` runs before the
 * reply exists, and a per-route `reply.header` would put the header in route
 * bodies, which this card must not edit.
 *
 * **JSON, SSE and the `/api` 404 JSON carry no header.** They are not HTML, and
 * a CSP on them would be scope this card does not have.
 */

import { randomBytes } from 'node:crypto';

import type { FastifyInstance, onSendAsyncHookHandler } from 'fastify';

/**
 * Rule 6's six directives, exactly. The contract says "with **at least**" these,
 * and nothing here weakens one of them or adds a source to one of them: the two
 * further directives below are additions, not substitutions.
 *
 * `default-src 'self'` and `script-src 'self'` are what make a page that injects
 * a `<script>` through an imported note inert (C-BRIDGE@1's own rejection
 * example), and `base-uri 'none'` plus `object-src 'none'` are what stop a
 * `<base>` in note text from re-pointing every relative URL in the document.
 */
const RULE_6_DIRECTIVES: readonly string[] = [
  "default-src 'self'",
  "script-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
];

/**
 * The opening tag of the boot-error page's inline `<style>`, which is the only
 * `<style>` element either server sends.
 *
 * The match is exact rather than a general `<style` search because the rewrite
 * below adds an attribute to **this** element and nothing else: a `<style>` in
 * note content is never rendered as markup, and a broader rewrite would put a
 * nonce on attacker-shaped text.
 */
const STYLE_OPENING_TAG = '<style>';

/**
 * A fresh nonce for one response.
 *
 * Standard base64 rather than base64url, because a CSP nonce is defined as a
 * base64 value and this is the alphabet the spec names. 16 random bytes is the
 * size the CSP specification recommends, and `randomBytes` is CSPRNG-backed.
 */
function freshNonce(): string {
  return randomBytes(16).toString('base64');
}

/**
 * The header for one response.
 *
 * `style-src` and `style-src-attr` ride along with rule 6's six, for two
 * separate reasons:
 *
 * 1. `style-src` carries the per-response nonce that authorises the boot-error
 *    page's inline `<style>`. A nonce or a hash authorises `<style>` **elements**
 *    only, and without a `style-src` of its own a `style` attribute would fall
 *    back to `default-src 'self'` and be blocked — so the directive is needed
 *    anyway, and the nonce rides in it rather than in a seventh directive.
 * 2. `style-src-attr 'unsafe-inline'` permits style **attributes**. A nonce does
 *    not apply to a `style=""` attribute at all, and CSP3's `style-src-attr`
 *    falls back to `style-src` when it is absent, so the nonce alone would block
 *    every inline style in the app — the spelling and patient menus, the patient
 *    row drag ghost, the sidebar resizer and view-menu positions, the recording
 *    level meter — and would do so silently. This grants no script, no `eval`,
 *    no remote source and no network origin; it does not affect `<style>`
 *    elements, which still need the nonce.
 */
function policyFor(styleNonce: string): string {
  return [
    ...RULE_6_DIRECTIVES,
    `style-src 'self' 'nonce-${styleNonce}'`,
    `style-src-attr 'unsafe-inline'`,
  ].join('; ');
}

/** Is this reply an HTML one? The rule is about HTML and nothing else. */
function isHtml(contentType: unknown): boolean {
  if (typeof contentType === 'string') return contentType.toLowerCase().includes('text/html');
  if (Array.isArray(contentType)) return contentType.some((part) => String(part).includes('text/html'));
  return false;
}

/**
 * Puts the nonce on the boot-error page's `<style>` element, and only there.
 *
 * A payload that is not a string — a stream, a Buffer, a serialised JSON body —
 * is returned untouched: the header is still emitted, and there is nothing this
 * hook may safely rewrite.
 */
function nonceStyleElement(payload: string, styleNonce: string): string {
  return payload.replaceAll(STYLE_OPENING_TAG, `<style nonce="${styleNonce}">`);
}

/**
 * Register the CSP as an `onSend` hook.
 *
 * Called beside `registerRequestGuard` in `buildApp` and `buildBootErrorApp`,
 * after it, so the request guard still answers first and this only ever decorates
 * a reply that has already passed it.
 */
export function registerCsp(app: FastifyInstance): void {
  // The request is not read: the rule is about the reply, and a `text/html`
  // response is one whatever asked for it.
  const hook: onSendAsyncHookHandler = async (_request, reply, payload) => {
    if (!isHtml(reply.getHeader('content-type'))) return payload;
    const styleNonce = freshNonce();
    reply.header('content-security-policy', policyFor(styleNonce));
    if (typeof payload === 'string' && payload.includes(STYLE_OPENING_TAG)) {
      // Fastify measures the payload **after** this hook returns and rewrites
      // `content-length` when the byte length changed, so the rewritten document
      // is sent with a length that matches it.
      return nonceStyleElement(payload, styleNonce);
    }
    return payload;
  };
  app.addHook('onSend', hook);
}

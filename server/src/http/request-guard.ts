/**
 * C-REQ@1, the request guard. One function, applied as `onRequest` in **both**
 * servers: the main app and the boot-error server.
 *
 * The app only ever listens on loopback, so the threat here is a web page
 * reaching it — a browser that will send whatever `Host` and `Origin` the page
 * it is running on asks for. Nothing here relaxes for a path, a method or a
 * test flag, and a request that fails a rule is answered with C-REQ@1's 403
 * before any route, parser or upload handler sees it.
 */

import type { ApiErrorCode } from '@apunta/shared';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance, FastifyReply, FastifyRequest, onRequestAsyncHookHandler } from 'fastify';

/**
 * Which rule a request failed, logged with the rejection so a refused call can
 * be traced without the body (which is the therapist's account of a session).
 */
export type GuardRule = 'host' | 'sec_fetch_site' | 'options_origin' | 'origin';

/**
 * The Vite dev server.
 *
 * `web/vite.config.ts` proxies `/api` with `changeOrigin: false`, so in
 * `npm run dev` the browser's `Host` and `Origin` arrive as `:5173` even
 * though the server behind the proxy is on 7717. `AppConfig` has no dev flag
 * and `npm run dev` sets none, so these two values are always allowed and
 * nothing else is: a page on any other origin still arrives as
 * `Sec-Fetch-Site: cross-site` and is rejected.
 */
const VITE_HOST = '127.0.0.1:5173';

const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost']);

/** The only two `Sec-Fetch-Site` values that are the app itself or nothing. */
const ALLOWED_SEC_FETCH_SITE = new Set(['same-origin', 'none']);

/**
 * C-REQ@1's body, hand-built and exactly as the contract writes it.
 *
 * Not `ApiErrorSchema`: the guard has no message safe to show, and this body
 * does not validate as one. `forbidden_request` still lives in
 * `ApiErrorCodeSchema`, so the code is not a bare literal.
 */
function forbiddenBody(): { error: { code: ApiErrorCode } } {
  return { error: { code: 'forbidden_request' } };
}

function firstHeader(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  if (typeof value === 'string') return value;
  // A repeated header arrives joined or as an array depending on the field;
  // either way it is not one of the allowed values, so the first one decides.
  return Array.isArray(value) ? value[0] : undefined;
}

/**
 * The port the app is serving on: the bound port while it is listening, and
 * the configured port otherwise. An injected request is not listening, so it
 * is checked against the configured port; a request on a real socket is
 * checked against the port actually bound, which is why a suite that does
 * `listen({ port: 0 })` still gets a conforming `Host` without changing.
 */
function servingPort(app: FastifyInstance, configuredPort: number): number {
  const address = app.server.address();
  if (address !== null && typeof address === 'object') {
    const bound = (address as AddressInfo).port;
    if (typeof bound === 'number') return bound;
  }
  return configuredPort;
}

/**
 * `127.0.0.1:<port>`, `localhost:<port>`, or the Vite host. A missing `Host`
 * is rejected: HTTP/1.1 requires one, and a request without it is not
 * something this app's own client sends.
 */
function hostAllowed(host: string | undefined, port: number): boolean {
  if (host === undefined) return false;
  if (host === VITE_HOST) return true;
  const separator = host.lastIndexOf(':');
  if (separator < 0) return false;
  // Case-insensitive, because a hostname is; `LOCALHOST:7717` is the same
  // host as `localhost:7717` and rejecting it would only be surprising.
  const name = host.slice(0, separator).toLowerCase();
  return LOOPBACK_HOSTNAMES.has(name) && host.slice(separator + 1) === String(port);
}

/**
 * Absent, `http://127.0.0.1:<port>`, `http://localhost:<port>`, the Vite
 * origin. Everything else is rejected, including `null` (a sandboxed frame),
 * anything malformed, and any other scheme, host or port.
 *
 * Both sides of the comparison are parsed by `URL`, because the parser
 * normalizes an origin: it lowercases the host and drops the port when that
 * port is the scheme's default. Comparing the parsed host to the parsed
 * expected host is therefore exact without being brittle.
 */
function originAllowed(origin: string | undefined, port: number): boolean {
  if (origin === undefined) return true;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:') return false;
  if (url.host === VITE_HOST) return true;
  return (
    url.host === new URL(`http://127.0.0.1:${String(port)}`).host ||
    url.host === new URL(`http://localhost:${String(port)}`).host
  );
}

/** Absent, `same-origin` or `none`. Anything else is rejected, including a
 * value a future browser invents — the safe direction for an unknown token. */
function secFetchSiteAllowed(value: string | undefined): boolean {
  return value === undefined || ALLOWED_SEC_FETCH_SITE.has(value.toLowerCase());
}

function failedRule(request: FastifyRequest, port: number): GuardRule | null {
  if (!hostAllowed(firstHeader(request, 'host'), port)) return 'host';
  if (!secFetchSiteAllowed(firstHeader(request, 'sec-fetch-site'))) return 'sec_fetch_site';
  const origin = firstHeader(request, 'origin');
  /**
   * The guard decides the reject side of OPTIONS only. A foreign origin is
   * 403; an allowed one, or none at all, passes through to whatever the server
   * would have answered, and no response from either server carries an
   * `access-control-allow-*` header because neither registers CORS.
   */
  if (request.method === 'OPTIONS') return originAllowed(origin, port) ? null : 'options_origin';
  return originAllowed(origin, port) ? null : 'origin';
}

function forbid(reply: FastifyReply): FastifyReply {
  // Answered, never thrown: `buildBootErrorApp` registers no error handler, so
  // a throw there would come back as Fastify's default 500 envelope and both
  // servers would stop answering C-REQ@1's 403.
  return reply.code(403).send(forbiddenBody());
}

export interface RequestGuardOptions {
  /** The port the app is configured with — `config.port` in the main app. */
  readonly port: number;
}

export function registerRequestGuard(app: FastifyInstance, options: RequestGuardOptions): void {
  /**
   * Async, so Fastify's promise-style hook runner drives it: returning
   * `undefined` continues to the route, and returning the reply ends the
   * request. The callback style would need an explicit `done()`, and a handler
   * that returns without one stalls the request until it times out.
   */
  const guard: onRequestAsyncHookHandler = async (request, reply) => {
    const rule = failedRule(request, servingPort(app, options.port));
    if (rule === null) return undefined;
    request.log.warn({ rule, method: request.method, url: request.url }, 'request rejected by the guard');
    return forbid(reply);
  };
  app.addHook('onRequest', guard);
}

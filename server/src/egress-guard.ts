/**
 * Egress guard.
 *
 * Privacy is the product: session content is protected health information and
 * there is no legitimate outbound network call at runtime. Everything the
 * server talks to (Ollama, whisper.cpp helpers) lives on the loopback
 * interface. So at bootstrap we replace the global `fetch` with a wrapper that
 * refuses any request whose host is not loopback — a mistake or a stray
 * dependency then fails loudly instead of leaking data.
 */

/** Hostnames the guard lets through. Nothing else is reachable. */
const ALLOWED_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '::1']);

/** Protocols the guard lets through (loopback HTTP only). */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

export class EgressBlockedError extends Error {
  readonly requestedUrl: string;

  constructor(requestedUrl: string, reason: string) {
    super(
      `Egress blocked: ${reason}. Practice Notes may only talk to 127.0.0.1, localhost or ::1 (requested: ${requestedUrl}).`,
    );
    this.name = 'EgressBlockedError';
    this.requestedUrl = requestedUrl;
  }
}

/** `new URL('http://[::1]/').hostname` keeps the brackets; strip them. */
function normalizeHostname(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}

/** True when `raw` is an absolute URL pointing at the loopback interface. */
export function isLoopbackUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  return ALLOWED_PROTOCOLS.has(parsed.protocol) && ALLOWED_HOSTNAMES.has(normalizeHostname(parsed.hostname));
}

/** Throws {@link EgressBlockedError} unless `raw` is a loopback URL. */
export function assertLoopbackUrl(raw: string): void {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new EgressBlockedError(raw, 'the request URL is not absolute or could not be parsed');
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new EgressBlockedError(raw, `protocol "${parsed.protocol}" is not allowed`);
  }
  if (!ALLOWED_HOSTNAMES.has(normalizeHostname(parsed.hostname))) {
    throw new EgressBlockedError(raw, `host "${parsed.hostname}" is not loopback`);
  }
}

type FetchInput = Parameters<typeof fetch>[0];

/** Pull a URL string out of whatever `fetch` was handed. */
function urlOf(input: FetchInput): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  if (typeof input === 'object' && input !== null && typeof (input as Request).url === 'string') {
    return (input as Request).url;
  }
  return String(input);
}

const GUARD_FLAG = Symbol.for('patience.egressGuard');

type GuardedFetch = typeof fetch & { [GUARD_FLAG]?: true };

/**
 * Replace `globalThis.fetch` with the guarded version. Idempotent.
 * Returns a function that restores the original fetch (used by tests).
 */
export function installEgressGuard(): () => void {
  const original = globalThis.fetch as GuardedFetch | undefined;
  if (original?.[GUARD_FLAG]) return () => {};

  const guarded: GuardedFetch = async (input: FetchInput, init?: RequestInit) => {
    assertLoopbackUrl(urlOf(input));
    if (!original) throw new Error('global fetch is unavailable');
    return original(input, init);
  };
  guarded[GUARD_FLAG] = true;

  globalThis.fetch = guarded;
  return () => {
    if (original) globalThis.fetch = original;
  };
}

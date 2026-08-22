import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EgressBlockedError, assertLoopbackUrl, installEgressGuard, isLoopbackUrl } from './egress-guard.js';

describe('isLoopbackUrl', () => {
  it.each([
    'http://127.0.0.1:7717/api/health',
    'http://localhost:5173/',
    'https://localhost/',
    'http://[::1]:11434/api/chat',
  ])('allows %s', (url) => {
    expect(isLoopbackUrl(url)).toBe(true);
  });

  it.each([
    'https://example.com',
    'http://example.com/x',
    'https://api.openai.com/v1/chat/completions',
    'https://fonts.googleapis.com/css2',
    // Lookalikes that must not slip past a naive prefix/substring check.
    'https://127.0.0.1.evil.com/',
    'https://localhost.evil.com/',
    'https://evil.com/?redirect=http://127.0.0.1',
    'http://127.0.0.2/',
    'http://0.0.0.0/',
    'file:///etc/passwd',
    '/api/health',
  ])('blocks %s', (url) => {
    expect(isLoopbackUrl(url)).toBe(false);
  });
});

describe('assertLoopbackUrl', () => {
  it('names the offending host in the error', () => {
    expect(() => {
      assertLoopbackUrl('https://example.com/collect');
    }).toThrow(EgressBlockedError);
    expect(() => {
      assertLoopbackUrl('https://example.com/collect');
    }).toThrow(/example\.com/);
  });
});

describe('installEgressGuard', () => {
  let underlying: ReturnType<typeof vi.fn>;
  let originalFetch: typeof globalThis.fetch;
  let restore: () => void;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    underlying = vi.fn(async () => new Response('ok'));
    globalThis.fetch = underlying as unknown as typeof fetch;
    restore = installEgressGuard();
  });

  afterEach(() => {
    restore();
    globalThis.fetch = originalFetch;
  });

  it('rejects an outbound fetch to the public internet', async () => {
    await expect(fetch('https://example.com')).rejects.toThrow(EgressBlockedError);
    expect(underlying).not.toHaveBeenCalled();
  });

  it('rejects an outbound fetch made through a Request object', async () => {
    await expect(fetch(new Request('https://example.com/telemetry', { method: 'POST' }))).rejects.toThrow(
      EgressBlockedError,
    );
    expect(underlying).not.toHaveBeenCalled();
  });

  it('rejects an outbound fetch made through a URL object', async () => {
    await expect(fetch(new URL('https://example.com'))).rejects.toThrow(EgressBlockedError);
    expect(underlying).not.toHaveBeenCalled();
  });

  it.each([
    'http://127.0.0.1:11434/api/tags',
    'http://localhost:7717/api/health',
    'http://[::1]:7717/api/health',
  ])('lets %s through to the real fetch', async (url) => {
    const response = await fetch(url);
    expect(await response.text()).toBe('ok');
    expect(underlying).toHaveBeenCalledWith(url, { redirect: 'manual' });
  });

  /**
   * The hole the privacy audit found (W1). The URL check runs once, so with
   * `redirect: 'follow'` a service on a loopback port could answer 307 — which
   * preserves method *and* body — and undici would resend the whole drafted
   * note to a host the guard never inspected.
   */
  it('refuses a redirect out of loopback rather than following it', async () => {
    underlying.mockResolvedValueOnce(
      new Response(null, { status: 307, headers: { location: 'https://evil.example/' } }),
    );
    await expect(
      fetch('http://127.0.0.1:11434/api/chat', { method: 'POST', body: '{"prompt":"…"}' }),
    ).rejects.toThrow(EgressBlockedError);
  });

  it('refuses every redirect status, not only 307', async () => {
    for (const status of [301, 302, 303, 308]) {
      underlying.mockResolvedValueOnce(
        new Response(null, { status, headers: { location: 'https://evil.example/' } }),
      );
      await expect(fetch('http://127.0.0.1:11434/api/chat')).rejects.toThrow(EgressBlockedError);
    }
  });

  it('asks the underlying fetch not to follow redirects itself', async () => {
    await fetch('http://127.0.0.1:11434/api/tags', { method: 'GET' });
    expect(underlying).toHaveBeenCalledWith('http://127.0.0.1:11434/api/tags', {
      method: 'GET',
      redirect: 'manual',
    });
  });

  it('is idempotent — installing twice keeps one layer of guarding', async () => {
    const secondRestore = installEgressGuard();
    await expect(fetch('https://example.com')).rejects.toThrow(EgressBlockedError);
    secondRestore();
    // The second (no-op) restore must not have unwrapped the guard.
    await expect(fetch('https://example.com')).rejects.toThrow(EgressBlockedError);
  });

  it('restores the original fetch', () => {
    restore();
    expect(globalThis.fetch).toBe(underlying);
    restore = () => {};
  });
});

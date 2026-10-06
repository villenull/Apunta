import type { RecoveryStatus, UpdateStatusResponse } from '@apunta/shared';
import { vi } from 'vitest';

/**
 * A stand-in for the shell-only updater and recovery routes, with a call log.
 * `status: null` answers the way a browser tab's server does: 404.
 */
export interface UpdateFetch {
  /** `METHOD path` for every request, in order. */
  readonly calls: string[];
  readonly bodies: Record<string, unknown>;
  status: UpdateStatusResponse | null;
  recovery: RecoveryStatus | null;
  /** When set, the next POST/PUT answers 409 with this message. */
  failNext: string | null;
}

export function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

export function status(over: Partial<UpdateStatusResponse> = {}): UpdateStatusResponse {
  return { state: 'idle', autoCheck: true, close: { state: 'none', blockers: [] }, ...over };
}

export function stubUpdateFetch(initial: Partial<UpdateFetch> = {}): UpdateFetch {
  const fake: UpdateFetch = {
    calls: [],
    bodies: {},
    status: null,
    recovery: null,
    failNext: null,
    ...initial,
  };
  vi.stubGlobal('fetch', (path: string, init: RequestInit = {}): Promise<Response> => {
    const method = init.method ?? 'GET';
    const key = `${method} ${path}`;
    fake.calls.push(key);
    if (typeof init.body === 'string') fake.bodies[key] = JSON.parse(init.body);
    const notFound = json({ error: 'not_found', message: 'Not found' }, 404);
    if (method !== 'GET' && fake.failNext !== null) {
      const message = fake.failNext;
      fake.failNext = null;
      return Promise.resolve(json({ error: 'invalid_state', message }, 409));
    }
    if (key === 'GET /api/app/quiesce/status') {
      const response = json({ maintenance: fake.recovery !== null });
      response.headers.set('x-apunta-mode', fake.recovery ? 'recovery' : fake.status ? 'shell' : 'browser');
      return Promise.resolve(response);
    }
    if (key === 'GET /api/app/update') return Promise.resolve(fake.status ? json(fake.status) : notFound);
    if (key === 'GET /api/app/recovery')
      return Promise.resolve(fake.recovery ? json(fake.recovery) : notFound);
    if (path.startsWith('/api/app/')) return Promise.resolve(json({ ok: true }, 202));
    return Promise.resolve(notFound);
  });
  return fake;
}

import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify';
import { describe, expect, it } from 'vitest';

import { buildBootErrorApp } from '../boot-error.js';
import { createTestApp, seedFormat, seedPatient, type TestApp } from '../test/harness.js';

/**
 * C-REQ@1, driven through `app.inject`.
 *
 * Both servers run the same guard, so every case is asserted against both: the
 * main app and the boot-error server. Each request names its own `Host`, which
 * is what keeps these cases about the `Origin`, `Sec-Fetch-Site` and `OPTIONS`
 * rules — the `Host` rule needs a raw socket and lives in
 * `test/real-socket-guard.test.ts`, because `inject` always supplies a `Host`
 * and `fetch` replaces the one it is given.
 */

/** What the harness configures, and so what its injected requests present. */
const MAIN_PORT = 80;

/** The port the boot app under test is told it serves on. */
const BOOT_PORT = 7812;

const FOREIGN_ORIGIN = 'http://evil.example:5173';

const BOOT_OPTIONS = {
  dataDir: '/tmp/apunta-guard-boot',
  message: 'Apunta cannot write because the disk is full.',
};

interface Servers {
  readonly main: TestApp;
  readonly boot: FastifyInstance;
  /** The port each server is serving on, for the case under test. */
  portFor(server: 'main' | 'boot'): number;
  inject(server: 'main' | 'boot', options: InjectOptions): Promise<LightMyRequestResponse>;
}

async function withServers(
  run: (servers: Servers) => Promise<void>,
  mainOptions: Parameters<typeof createTestApp>[0] = {},
): Promise<void> {
  const main = await createTestApp(mainOptions);
  const boot = buildBootErrorApp(BOOT_OPTIONS, BOOT_PORT);
  await boot.ready();
  const portFor = (server: 'main' | 'boot'): number => (server === 'main' ? MAIN_PORT : BOOT_PORT);
  const servers: Servers = {
    main,
    boot,
    portFor,
    inject: (server, options) => (server === 'main' ? main.app.inject(options) : boot.inject(options)),
  };
  try {
    await run(servers);
  } finally {
    await main.close();
    await boot.close();
  }
}

/**
 * A real multipart body, built with the platform's own `FormData` so the bytes
 * on the wire are the bytes a browser would send. Copied from
 * `routes/formats-detect.test.ts` rather than shared, because that suite is
 * not this card's to change.
 */
async function multipart(): Promise<{ body: Buffer; contentType: string }> {
  const form = new FormData();
  form.append('kind', 'template');
  form.append('files', new Blob([new TextEncoder().encode('# Progress note\n')]), 'template.md');
  const request = new Request('http://127.0.0.1/multipart', { method: 'POST', body: form });
  return {
    body: Buffer.from(await request.arrayBuffer()),
    contentType: request.headers.get('content-type') ?? '',
  };
}

/** Nothing either server answers may carry a CORS header: neither registers CORS. */
function expectNoCorsHeaders(response: LightMyRequestResponse): void {
  const present = Object.keys(response.headers).filter((name) =>
    name.toLowerCase().startsWith('access-control-allow'),
  );
  expect(present).toEqual([]);
}

function expectForbidden(response: LightMyRequestResponse): void {
  expect(response.statusCode).toBe(403);
  expect(response.json()).toEqual({ error: { code: 'forbidden_request' } });
  expectNoCorsHeaders(response);
}

interface GuardCase {
  readonly name: string;
  readonly method: 'GET' | 'POST' | 'OPTIONS';
  readonly url: string;
  readonly forbidden: boolean;
  /** Headers for the port the server under test serves on. */
  readonly headers: (port: number) => Record<string, string>;
  readonly json?: Record<string, unknown>;
  readonly upload?: boolean;
}

const CASES: readonly GuardCase[] = [
  {
    name: 'an Origin of "null", which is what a sandboxed frame sends',
    method: 'GET',
    url: '/api/patients',
    headers: () => ({ origin: 'null' }),
    forbidden: true,
  },
  {
    name: 'a malformed Origin',
    method: 'GET',
    url: '/api/patients',
    headers: () => ({ origin: 'http://' }),
    forbidden: true,
  },
  {
    name: 'an Origin on the wrong port',
    method: 'GET',
    url: '/api/patients',
    headers: (port) => ({ origin: `http://127.0.0.1:${String(port + 1)}` }),
    forbidden: true,
  },
  {
    name: 'a foreign Origin on a JSON route',
    method: 'POST',
    url: '/api/patients',
    headers: () => ({ origin: FOREIGN_ORIGIN }),
    json: { name: 'John Smith' },
    forbidden: true,
  },
  {
    name: 'a foreign Origin on a multipart route',
    method: 'POST',
    url: '/api/formats/detect',
    headers: () => ({ origin: FOREIGN_ORIGIN }),
    upload: true,
    forbidden: true,
  },
  {
    name: 'Sec-Fetch-Site: cross-site, on a request from a page on another site',
    method: 'GET',
    url: '/api/patients',
    headers: () => ({ 'sec-fetch-site': 'cross-site' }),
    forbidden: true,
  },
  {
    name: 'OPTIONS from a foreign origin',
    method: 'OPTIONS',
    url: '/api/patients',
    headers: () => ({ origin: FOREIGN_ORIGIN }),
    forbidden: true,
  },
  {
    // The guard decides the reject side of OPTIONS only. With an allowed
    // origin it passes the request through, and each server keeps its own
    // answer — unifying those is not this card's work.
    name: 'OPTIONS from an allowed origin',
    method: 'OPTIONS',
    url: '/api/patients',
    headers: (port) => ({ origin: `http://127.0.0.1:${String(port)}` }),
    forbidden: false,
  },
  {
    name: 'OPTIONS with no Origin at all',
    method: 'OPTIONS',
    url: '/api/patients',
    headers: () => ({}),
    forbidden: false,
  },
  {
    // C-REQ@1's normal example: the app's own same-origin write, untouched.
    name: 'a same-origin request with Sec-Fetch-Site: same-origin',
    method: 'GET',
    url: '/api/patients',
    headers: (port) => ({ origin: `http://localhost:${String(port)}`, 'sec-fetch-site': 'same-origin' }),
    forbidden: false,
  },
];

describe('the request guard on both servers', () => {
  for (const guardCase of CASES) {
    for (const server of ['main', 'boot'] as const) {
      it(`${server === 'main' ? 'main app' : 'boot-error server'} ${guardCase.forbidden ? 'rejects' : 'passes through'} ${guardCase.name}`, async () => {
        await withServers(async ({ portFor, inject }) => {
          const port = portFor(server);
          const headers: Record<string, string> = {
            host: `localhost:${String(port)}`,
            ...guardCase.headers(port),
          };
          let payload: Buffer | Record<string, unknown> | undefined = guardCase.json;
          if (guardCase.upload === true) {
            const { body, contentType } = await multipart();
            payload = body;
            headers['content-type'] = contentType;
          }

          const response = await inject(server, {
            method: guardCase.method,
            url: guardCase.url,
            headers,
            ...(payload === undefined ? {} : { payload }),
          });

          if (guardCase.forbidden) expectForbidden(response);
          else {
            expect(response.statusCode).not.toBe(403);
            expect(response.json()).not.toEqual({ error: { code: 'forbidden_request' } });
            expectNoCorsHeaders(response);
          }
        });
      });
    }
  }

  it('lets a same-origin write through on the main app, so the guard is not simply closed', async () => {
    await withServers(async ({ main, inject }) => {
      const patient = await seedPatient(main.app, 'John Smith');
      const format = await seedFormat(main.app);

      const response = await inject('main', {
        method: 'POST',
        url: '/api/notes',
        headers: {
          host: `localhost:${String(MAIN_PORT)}`,
          origin: `http://127.0.0.1:${String(MAIN_PORT)}`,
          'sec-fetch-site': 'same-origin',
        },
        payload: { patient_id: patient.id, format_id: format.id, content: 'Subjective: Sample body.' },
      });

      expect(response.statusCode).toBe(201);
      expectNoCorsHeaders(response);
    });
  });

  it('logs the method, the path and which rule failed, and never the body', async () => {
    const logs: string[] = [];
    await withServers(
      async ({ inject }) => {
        const response = await inject('main', {
          method: 'POST',
          url: '/api/patients',
          headers: { host: `localhost:${String(MAIN_PORT)}`, origin: FOREIGN_ORIGIN },
          payload: { name: 'John Smith' },
        });
        expectForbidden(response);

        const written = logs.join('\n');
        expect(written).toContain('"rule":"origin"');
        expect(written).toContain('"method":"POST"');
        expect(written).toContain('/api/patients');
        expect(written).not.toContain('John Smith');
      },
      { logs },
    );
  });

  it('names the OPTIONS rule on its own, so the two rejections are told apart', async () => {
    const logs: string[] = [];
    await withServers(
      async ({ inject }) => {
        const response = await inject('main', {
          method: 'OPTIONS',
          url: '/api/patients',
          headers: { host: `localhost:${String(MAIN_PORT)}`, origin: FOREIGN_ORIGIN },
        });
        expectForbidden(response);
        expect(logs.join('\n')).toContain('"rule":"options_origin"');
      },
      { logs },
    );
  });
});

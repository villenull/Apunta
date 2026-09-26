import { mkdtempSync, rmSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { serveBootError } from '../boot-error.js';

/**
 * C-REQ@1 over a real socket, on the function that actually listens.
 *
 * `app.inject` always supplies a `Host`, and undici's `fetch` replaces a
 * caller-supplied one with the connection authority — so neither can express
 * the two `Host` cases here. Those go through `node:http.request`, which does
 * send the header it is given, and through a raw `node:net` HTTP/1.0 request
 * line, which is the only way to arrive with no `Host` at all.
 *
 * `buildBootErrorApp` is the injected server and `buildApp` is the main one;
 * the same set of header cases is asserted against both of them in
 * `http/request-guard.test.ts`.
 */

/** This card's sandbox port (C-ISO@1 rule 2), overridable for a busy machine. */
const PORT = Number(process.env['APUNTA_PORT'] ?? 7812);

const FOREIGN_ORIGIN = 'http://evil.example:5173';

let app: FastifyInstance | null = null;
let dataDir: string | null = null;

beforeAll(async () => {
  // Its own temp folder, so the path the boot page prints is a real one and
  // nothing here can reach a data directory that matters.
  dataDir = mkdtempSync(join(tmpdir(), 'apunta-guard-real-'));
  app = await serveBootError(
    { host: '127.0.0.1', port: PORT },
    { dataDir, message: 'Apunta cannot write because the disk is full.' },
  );
});

afterAll(async () => {
  await app?.close();
  app = null;
  if (dataDir !== null) rmSync(dataDir, { recursive: true, force: true });
  dataDir = null;
});

interface SocketResponse {
  readonly statusCode: number;
  readonly headers: http.IncomingHttpHeaders;
  readonly body: string;
}

/**
 * `setHost: false` is the point of this helper: without it Node writes the
 * connection authority over the `Host` the case under test supplies, and a
 * `fetch`-shaped test of the `Host` rule would pass while proving nothing.
 */
function nodeHttp(options: {
  readonly method?: string;
  readonly path: string;
  readonly headers: Record<string, string>;
}): Promise<SocketResponse> {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: '127.0.0.1',
        port: PORT,
        path: options.path,
        method: options.method ?? 'GET',
        headers: options.headers,
        setHost: false,
      },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          body += chunk;
        });
        response.on('end', () => {
          resolve({ statusCode: response.statusCode ?? 0, headers: response.headers, body });
        });
      },
    );
    request.on('error', reject);
    request.end();
  });
}

/** HTTP/1.0, one request line, no headers — the shape with no `Host` at all. */
function rawHttp1_0(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(PORT, '127.0.0.1', () => {
      socket.write(`GET ${path} HTTP/1.0\r\n\r\n`);
    });
    let data = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      data += chunk;
    });
    socket.on('error', reject);
    socket.on('close', () => {
      resolve(data);
    });
  });
}

function viaFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`http://127.0.0.1:${String(PORT)}${path}`, init);
}

function expectNoCorsHeaders(headers: Headers | http.IncomingHttpHeaders): void {
  const present = Object.keys(headers).filter((name) =>
    name.toLowerCase().startsWith('access-control-allow'),
  );
  expect(present).toEqual([]);
}

const FORBIDDEN_BODY = { error: { code: 'forbidden_request' } };

describe('the request guard on the boot-error server over a real socket', { timeout: 30_000 }, () => {
  it('answers 403 for a foreign Host, which fetch could never have shown', async () => {
    const response = await nodeHttp({
      path: '/api/health',
      headers: { Host: `evil.example:${String(PORT)}` },
    });

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body)).toEqual(FORBIDDEN_BODY);
    expectNoCorsHeaders(response.headers);
  });

  it('answers 403 for a missing Host, which only a raw HTTP/1.0 line can send', async () => {
    const raw = await rawHttp1_0('/api/health');

    expect(raw).toContain('403');
    expect(raw).toContain('forbidden_request');
    expect(raw.toLowerCase()).not.toContain('access-control-allow');
  });

  it('still answers a conforming Host, checked against the port actually bound', async () => {
    const response = await nodeHttp({
      path: '/api/health',
      headers: { Host: `127.0.0.1:${String(PORT)}` },
    });

    // The boot server's own answer, not the guard's: this is what the guard
    // must not swallow.
    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body)).toMatchObject({ error: 'storage_error' });
    expectNoCorsHeaders(response.headers);
  });

  it('answers 403 for a foreign Origin', async () => {
    const response = await viaFetch('/api/health', { headers: { Origin: FOREIGN_ORIGIN } });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(FORBIDDEN_BODY);
    expectNoCorsHeaders(response.headers);
  });

  it('answers 403 for Sec-Fetch-Site: cross-site', async () => {
    const response = await viaFetch('/api/health', { headers: { 'Sec-Fetch-Site': 'cross-site' } });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(FORBIDDEN_BODY);
    expectNoCorsHeaders(response.headers);
  });

  it('answers 403 for Sec-Fetch-Site: same-site, which is not the app either', async () => {
    const response = await viaFetch('/api/health', { headers: { 'Sec-Fetch-Site': 'same-site' } });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(FORBIDDEN_BODY);
  });

  it('answers 403 for OPTIONS from a foreign origin', async () => {
    const response = await viaFetch('/api/health', {
      method: 'OPTIONS',
      headers: { Origin: FOREIGN_ORIGIN },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(FORBIDDEN_BODY);
    expectNoCorsHeaders(response.headers);
  });

  it('passes OPTIONS from an allowed origin through, and answers no CORS header', async () => {
    const response = await viaFetch('/api/health', {
      method: 'OPTIONS',
      headers: { Origin: `http://127.0.0.1:${String(PORT)}` },
    });

    expect(response.status).not.toBe(403);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: 'storage_error' });
    expectNoCorsHeaders(response.headers);
  });

  it('passes OPTIONS with no Origin at all through', async () => {
    const response = await viaFetch('/api/health', { method: 'OPTIONS' });

    expect(response.status).not.toBe(403);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: 'storage_error' });
    expectNoCorsHeaders(response.headers);
  });
});

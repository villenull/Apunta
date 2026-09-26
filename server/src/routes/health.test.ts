import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { HealthResponseSchema } from '@apunta/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import { loadConfig } from '../config.js';
import { openDatabase } from '../db/index.js';

/**
 * The sandbox wrapper's ownership check (C-ISO@1 rule 5): a server running
 * inside a sandbox run answers `/api/health` with that run's id, so the
 * wrapper can refuse a foreign server on its port. The field appears only
 * while `APUNTA_TEST_RUN_ID` is set.
 */

let app: FastifyInstance | null = null;
let dir: string | null = null;
const savedRunId = process.env['APUNTA_TEST_RUN_ID'];

afterEach(async () => {
  await app?.close();
  app = null;
  if (dir !== null) rmSync(dir, { recursive: true, force: true });
  dir = null;
  if (savedRunId === undefined) delete process.env['APUNTA_TEST_RUN_ID'];
  else process.env['APUNTA_TEST_RUN_ID'] = savedRunId;
});

async function healthApp(): Promise<FastifyInstance> {
  dir = mkdtempSync(join(tmpdir(), 'apunta-health-'));
  const config = loadConfig({
    APUNTA_PORT: '0',
    APUNTA_DATA_DIR: dir,
    APUNTA_FAKE_AI: '1',
  });
  const { db } = openDatabase({ file: config.dbFile, migrationsDir: config.migrationsDir });
  app = await buildApp({ config, db, logger: false });
  return app;
}

describe('GET /api/health testRunId', () => {
  it('omits testRunId when APUNTA_TEST_RUN_ID is unset', async () => {
    delete process.env['APUNTA_TEST_RUN_ID'];
    const server = await healthApp();

    const response = await server.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    const body = response.json() as Record<string, unknown>;
    expect(body).not.toHaveProperty('testRunId');
    expect(() => HealthResponseSchema.parse(body)).not.toThrow();
  });

  it('answers with the run id when APUNTA_TEST_RUN_ID is set', async () => {
    process.env['APUNTA_TEST_RUN_ID'] = 'sandbox-run-for-test';
    const server = await healthApp();

    const response = await server.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    const body = response.json() as Record<string, unknown>;
    expect(body.testRunId).toBe('sandbox-run-for-test');
    expect(() => HealthResponseSchema.parse(body)).not.toThrow();
  });

  it('omits testRunId when APUNTA_TEST_RUN_ID is blank', async () => {
    process.env['APUNTA_TEST_RUN_ID'] = '   ';
    const server = await healthApp();

    const response = await server.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json() as Record<string, unknown>).not.toHaveProperty('testRunId');
  });
});

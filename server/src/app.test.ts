import { join } from 'node:path';

import { HealthResponseSchema } from '@patience/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DB_FILENAME } from './config.js';
import { createTestApp, type TestApp } from './test/harness.js';

let harness: TestApp;

beforeAll(async () => {
  harness = await createTestApp();
});

afterAll(async () => {
  await harness.close();
});

describe('GET /api/health', () => {
  it('answers with a schema-valid payload', async () => {
    const response = await harness.app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    const body: unknown = response.json();
    expect(HealthResponseSchema.parse(body)).toMatchObject({
      ok: true,
      fakeAi: true,
      ollama: { reachable: false, model: null, modelPresent: false },
      whisper: { binaryPresent: false, modelPresent: false },
      ffmpeg: { present: false },
    });
  });

  it('reports where the database lives and how far migrations have run', async () => {
    const response = await harness.app.inject({ method: 'GET', url: '/api/health' });

    const health = HealthResponseSchema.parse(response.json());
    expect(health.db.path).toBe(join(harness.dataDir, DB_FILENAME));
    expect(health.db.migrationLevel).toBeGreaterThanOrEqual(1);
  });
});

describe('unknown routes', () => {
  it('404s unknown /api routes as JSON', async () => {
    const response = await harness.app.inject({ method: 'GET', url: '/api/nope' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: 'not_found', message: 'Not Found' });
  });
});

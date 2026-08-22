import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { HealthResponseSchema } from '@patience/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from './app.js';
import { ensureDataDir, loadConfig } from './config.js';

const dataDir = mkdtempSync(join(tmpdir(), 'patience-test-'));

const config = loadConfig({
  PATIENCE_PORT: '0',
  PATIENCE_DATA_DIR: dataDir,
  PATIENCE_FAKE_AI: '1',
});

let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  ensureDataDir(config.dataDir);
  app = await buildApp({ config, logger: false });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('GET /api/health', () => {
  it('answers with a schema-valid payload', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });

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
});

describe('unknown routes', () => {
  it('404s unknown /api routes as JSON', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/nope' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: 'Not Found' });
  });
});

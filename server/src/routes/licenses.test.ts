import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import { loadConfig } from '../config.js';
import { openDatabase } from '../db/index.js';

/**
 * The licence file has to reach the machine the app is installed on, not just
 * the repository — MIT and BSD both require the notice to travel with the
 * distribution. This is the endpoint the About page reads it from.
 */

let app: FastifyInstance | null = null;
let dir: string | null = null;

afterEach(async () => {
  await app?.close();
  app = null;
  if (dir !== null) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

async function appWithLicenses(text: string | null): Promise<FastifyInstance> {
  dir = mkdtempSync(join(tmpdir(), 'apunta-licenses-'));
  const licensesFile = join(dir, 'THIRD-PARTY-LICENSES.md');
  if (text !== null) writeFileSync(licensesFile, text);

  const config = loadConfig({
    APUNTA_PORT: '0',
    APUNTA_DATA_DIR: dir,
    APUNTA_FAKE_AI: '1',
    APUNTA_LICENSES_FILE: licensesFile,
  });
  const { db } = openDatabase({ file: config.dbFile, migrationsDir: config.migrationsDir });
  app = await buildApp({ config, db, logger: false });
  return app;
}

describe('GET /api/licenses', () => {
  it('serves the file verbatim', async () => {
    const text = '# Third-party licences\n\nMIT License\n\nCopyright (c) Ollama\n';
    const server = await appWithLicenses(text);

    const response = await server.inject({ method: 'GET', url: '/api/licenses' });
    expect(response.statusCode).toBe(200);
    expect((response.json() as { text: string }).text).toBe(text);
  });

  it('says the file is missing rather than failing with a 500', async () => {
    const server = await appWithLicenses(null);
    const response = await server.inject({ method: 'GET', url: '/api/licenses' });
    expect(response.statusCode).toBe(404);
    expect((response.json() as { message: string }).message).toContain('licence file');
  });

  it('defaults to the file in the repository when nothing overrides it', () => {
    const config = loadConfig({ APUNTA_PORT: '0', APUNTA_DATA_DIR: '/tmp/whatever' });
    expect(config.licensesFile.endsWith('THIRD-PARTY-LICENSES.md')).toBe(true);
  });
});

describe('the packaged-app configuration knobs', () => {
  it('are all undefined on a developer machine', () => {
    const config = loadConfig({ APUNTA_PORT: '0', APUNTA_DATA_DIR: '/tmp/whatever' });
    expect(config.ollamaBin).toBeUndefined();
    expect(config.sqliteBinding).toBeUndefined();
  });

  it('read the bundled runtime and the native addon from the environment', () => {
    const config = loadConfig({
      APUNTA_PORT: '0',
      APUNTA_DATA_DIR: '/tmp/whatever',
      APUNTA_OLLAMA_BIN: '/Applications/Apunta.app/Contents/Helpers/ollama/ollama',
      APUNTA_SQLITE_BINDING: '/Applications/Apunta.app/Contents/Helpers/better_sqlite3.node',
    });
    expect(config.ollamaBin).toContain('Helpers/ollama/ollama');
    expect(config.sqliteBinding).toContain('better_sqlite3.node');
  });

  it('treats an empty variable as unset, so an exported blank does not break a spawn', () => {
    const config = loadConfig({
      APUNTA_PORT: '0',
      APUNTA_DATA_DIR: '/tmp/whatever',
      APUNTA_OLLAMA_BIN: '   ',
    });
    expect(config.ollamaBin).toBeUndefined();
  });
});

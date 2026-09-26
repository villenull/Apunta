import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { LANGUAGE_SETTING } from '@apunta/shared';
import type { Database } from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import { loadConfig } from '../config.js';
import { openDatabase } from '../db/index.js';
import { storageErrorFor } from './errors.js';

const folder = '/tmp/apunta-storage';

describe('storageErrorFor', () => {
  it.each([
    ['ENOSPC', 'disk is full'],
    ['SQLITE_FULL', 'disk is full'],
    ['EACCES', 'read-only or permissions'],
    ['EPERM', 'read-only or permissions'],
    ['EROFS', 'read-only or permissions'],
    ['SQLITE_READONLY', 'read-only or permissions'],
    ['SQLITE_READONLY_DIRECTORY', 'read-only or permissions'],
    ['SQLITE_CANTOPEN', 'read-only or permissions'],
  ])('maps %s to an actionable message', (code, phrase) => {
    const mapped = storageErrorFor({ code }, folder);
    expect(mapped).not.toBeNull();
    expect(mapped?.code).toBe('storage_error');
    expect(mapped?.message).toContain(folder);
    expect(mapped?.message).toContain(phrase);
  });

  it('does not disguise unrelated failures as storage failures', () => {
    expect(storageErrorFor({ code: 'EIO' }, folder)).toBeNull();
    expect(storageErrorFor(new Error('model failed'), folder)).toBeNull();
  });
});

/**
 * The one sentence this card renders twice, in two languages on purpose.
 *
 * The reply is rendered in the request's language; the log line is not, because
 * a pino line is something a grep has to find whatever language the request was
 * in. Logging the same locale-dependent string is how a Spanish install ended
 * up with a Spanish error line in its log file.
 *
 * The app is built here rather than through the harness because the route under
 * test has to be registered before `ready()`: a full disk is not something a
 * route in the app can be asked to do, so one is added that fails that way.
 */
describe('a storage failure, logged', () => {
  let logs: string[];
  let app: FastifyInstance;
  let db: Database;
  let dataDir: string;

  beforeAll(async () => {
    logs = [];
    dataDir = mkdtempSync(join(tmpdir(), 'apunta-errors-test-'));
    const config = loadConfig({
      // The port an injected request presents; `light-my-request` writes
      // `Host: localhost:80` for a path-only URL (C-REQ@1, P1.3).
      APUNTA_PORT: '80',
      APUNTA_DATA_DIR: dataDir,
    });
    db = openDatabase({ file: config.dbFile, migrationsDir: config.migrationsDir }).db;
    app = await buildApp({
      config,
      db,
      logger: {
        level: 'info',
        stream: {
          write(line: string) {
            logs.push(line);
          },
        },
      },
    });
    app.get('/api/test-out-of-space', async () => {
      throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('answers the request in its language and logs the English sentence', async () => {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
      LANGUAGE_SETTING,
      JSON.stringify('es-MX'),
    );

    const response = await app.inject({ method: 'GET', url: '/api/test-out-of-space' });
    const body = response.json() as { error: string; message: string };

    expect(response.statusCode).toBe(507);
    expect(body.error).toBe('storage_error');
    // The reply is Spanish, because the setting is.
    expect(body.message).toContain('el disco está lleno');

    // The log line is English, whatever the request's language was.
    logs.length = 0;
    await app.inject({ method: 'GET', url: '/api/test-out-of-space' });
    const line = logs.find((entry) => entry.includes('ENOSPC'));
    expect(line).toBeDefined();
    const logged = JSON.parse(line as string) as { msg: string; code: string };
    expect(logged.code).toBe('ENOSPC');
    expect(logged.msg).not.toContain('el disco está lleno');
    // The bytes are the English catalogue's, character for character.
    expect(logged.msg).toBe(
      `Apunta cannot write to ${dataDir} because the disk is full. Free space and try again. Your existing data was left untouched.`,
    );
  });
});

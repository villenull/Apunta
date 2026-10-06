import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DB_ENTRY_NAME, PENDING_RESTORE_DIRNAME } from '@apunta/shared';
import BetterSqlite3 from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadConfig, type AppConfig } from './config.js';
import { buildRecoveryApp, PREVIOUS_IMAGE_NAME, type RecoveryRequest } from './recovery-app.js';
import { journalPath, readJournal, writeJournal, type UpdateJournal } from './update-journal.js';

/**
 * Nothing in recovery mode may open the user database. `openDatabase` is the one
 * door every normal start goes through (it migrates), so a spy on it that throws
 * is how this file proves the recovery app never uses it; the byte-identity
 * checks below prove the same of every other way of touching the file.
 */
const dbDoor = vi.hoisted(() => ({ opened: 0 }));
vi.mock('./db/index.js', () => ({
  openDatabase: () => {
    dbDoor.opened += 1;
    throw new Error('recovery mode opened the user database');
  },
}));

const PORT = 7861;
const SNAPSHOT_NAME = 'pre-update-1.0.0-1.1.0-20261006T120000Z.db';

let dataDir: string;
let config: AppConfig;
let snapshotPath: string;
let apps: FastifyInstance[];

/** A real SQLite file with one synthetic note title in it. */
function makeDatabase(file: string, title: string): void {
  const handle = new BetterSqlite3(file);
  try {
    handle.exec('CREATE TABLE notes (title TEXT NOT NULL)');
    handle.prepare('INSERT INTO notes (title) VALUES (?)').run(title);
  } finally {
    handle.close();
  }
}

function titles(file: string): string[] {
  const handle = new BetterSqlite3(file, { readonly: true });
  try {
    return (handle.prepare('SELECT title FROM notes').all() as { title: string }[]).map((row) => row.title);
  } finally {
    handle.close();
  }
}

function digest(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function journal(overrides: Partial<UpdateJournal> = {}): UpdateJournal {
  return {
    phase: 'recovery',
    updateId: '7',
    fromVersion: '1.0.0',
    toVersion: '1.1.0',
    snapshotPath,
    createdAt: '2026-10-06T12:00:00.000Z',
    ...overrides,
  };
}

async function recoveryApp(options: {
  journal: UpdateJournal | null;
  env?: Record<string, string | undefined>;
  requestShell?: (request: RecoveryRequest) => boolean;
}): Promise<FastifyInstance> {
  const app = await buildRecoveryApp({
    config,
    journal: options.journal,
    env: options.env ?? {},
    ...(options.requestShell === undefined ? {} : { requestShell: options.requestShell }),
    logger: false,
  });
  apps.push(app);
  return app;
}

async function call(
  app: FastifyInstance,
  method: 'GET' | 'POST',
  url: string,
): Promise<{ status: number; body: unknown }> {
  const response = await app.inject({ method, url, headers: { host: `127.0.0.1:${String(PORT)}` } });
  const text = response.body;
  return {
    status: response.statusCode,
    body: text === '' || !text.startsWith('{') ? text : JSON.parse(text),
  };
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'apunta-recovery-'));
  config = loadConfig({
    APUNTA_DATA_DIR: dataDir,
    APUNTA_PORT: String(PORT),
    APUNTA_WEB_DIST: join(dataDir, 'no-web-build'),
    APUNTA_FAKE_AI: '1',
  });
  mkdirSync(join(dataDir, 'safety'), { recursive: true });
  snapshotPath = join(dataDir, 'safety', SNAPSHOT_NAME);
  makeDatabase(snapshotPath, 'BEFORE-UPDATE');
  makeDatabase(join(dataDir, DB_ENTRY_NAME), 'AFTER-UPDATE');
  writeJournal(dataDir, journal());
  dbDoor.opened = 0;
  apps = [];
});

afterEach(async () => {
  for (const app of apps) await app.close();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('recovery mode before anything is restored', () => {
  it('describes the update and never opens, migrates or rewrites the database file', async () => {
    const live = join(dataDir, DB_ENTRY_NAME);
    const before = { sha: digest(live), mtime: statSync(live).mtimeMs, size: statSync(live).size };
    const app = await recoveryApp({ journal: journal() });

    const status = await call(app, 'GET', '/api/app/recovery');
    await call(app, 'GET', '/api/health');
    await call(app, 'GET', '/api/app/quiesce/status');
    await call(app, 'GET', '/api/patients');
    await call(app, 'POST', '/api/patients');

    expect(status).toEqual({
      status: 200,
      body: {
        phase: 'recovery',
        fromVersion: '1.0.0',
        toVersion: '1.1.0',
        createdAt: '2026-10-06T12:00:00.000Z',
        previousAvailable: false,
      },
    });
    expect(dbDoor.opened).toBe(0);
    expect({ sha: digest(live), mtime: statSync(live).mtimeMs, size: statSync(live).size }).toEqual(before);
    // SQLite creates these only when something opens the file for writing.
    expect(existsSync(`${live}-wal`)).toBe(false);
    expect(existsSync(`${live}-shm`)).toBe(false);
    expect(titles(live)).toEqual(['AFTER-UPDATE']);
  });

  it('answers health as unavailable, and every clinical route as 503 maintenance', async () => {
    const app = await recoveryApp({ journal: journal() });

    expect(await call(app, 'GET', '/api/health')).toEqual({
      status: 503,
      body: { ok: false, mode: 'recovery' },
    });
    for (const [method, url] of [
      ['GET', '/api/patients'],
      ['POST', '/api/patients'],
      ['POST', '/api/notes'],
      ['GET', '/api/settings'],
    ] as const) {
      const response = await call(app, method, url);
      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({ error: 'maintenance' });
    }
  });

  it('keeps the database-free quiesce routes answering, so a native close still gets an honest reply', async () => {
    const app = await recoveryApp({ journal: journal() });
    const status = await call(app, 'GET', '/api/app/quiesce/status');
    expect(status.status).toBe(200);
  });

  it('still refuses a request from a foreign origin (C-REQ@1)', async () => {
    const app = await recoveryApp({ journal: journal() });
    const response = await app.inject({
      method: 'POST',
      url: '/api/app/recovery/restore',
      headers: { host: `127.0.0.1:${String(PORT)}`, origin: 'https://evil.example' },
    });
    expect(response.statusCode).toBe(403);
    expect(titles(join(dataDir, DB_ENTRY_NAME))).toEqual(['AFTER-UPDATE']);
  });

  it('reports the previous image as available only when it sits beside the running AppImage', async () => {
    const images = join(dataDir, 'images');
    mkdirSync(images);
    const env = { APPIMAGE: join(images, 'Apunta.AppImage') };
    const app = await recoveryApp({ journal: journal(), env });
    expect(
      ((await call(app, 'GET', '/api/app/recovery')).body as { previousAvailable: boolean })
        .previousAvailable,
    ).toBe(false);

    writeFileSync(join(images, PREVIOUS_IMAGE_NAME), 'synthetic image');
    expect(
      ((await call(app, 'GET', '/api/app/recovery')).body as { previousAvailable: boolean })
        .previousAvailable,
    ).toBe(true);
  });

  it('an unreadable journal still starts recovery, with an honest unknown for the versions it cannot read', async () => {
    const app = await recoveryApp({ journal: null });
    const status = (await call(app, 'GET', '/api/app/recovery')).body as Record<string, unknown>;
    expect(status).toMatchObject({ phase: 'recovery', fromVersion: 'unknown', toVersion: config.version });
  });
});

describe('POST /api/app/recovery/restore', () => {
  it('restores the snapshot while keeping ordinary startup fenced until replacement health', async () => {
    const requests: RecoveryRequest[] = [];
    const journalWhenAsked: (UpdateJournal | null | 'corrupt')[] = [];
    const app = await recoveryApp({
      journal: journal(),
      requestShell: (request) => {
        requests.push(request);
        journalWhenAsked.push(readJournal(dataDir));
        return true;
      },
    });

    const response = await call(app, 'POST', '/api/app/recovery/restore');

    const live = join(dataDir, DB_ENTRY_NAME);
    expect(response).toEqual({ status: 200, body: { restored: true, restarting: true } });
    expect(titles(live)).toEqual(['BEFORE-UPDATE']);
    expect(titles(snapshotPath)).toEqual(['BEFORE-UPDATE']);
    const kept = readdirSync(dataDir).filter((name) => name.startsWith(`${DB_ENTRY_NAME}.before-restore-`));
    expect(kept).toHaveLength(1);
    expect(titles(join(dataDir, kept[0] as string))).toEqual(['AFTER-UPDATE']);
    expect(existsSync(join(dataDir, PENDING_RESTORE_DIRNAME))).toBe(false);
    expect(readJournal(dataDir)).toMatchObject({ phase: 'recovery', recoveryTarget: journal().toVersion });
    expect(requests).toEqual([{ id: '7', action: 'restart' }]);
    expect(journalWhenAsked[0]).toMatchObject({ phase: 'recovery', recoveryTarget: journal().toVersion });
    expect(dbDoor.opened).toBe(0);
  });

  it('retains the recovery fence when no shell can restart the restored database', async () => {
    const app = await recoveryApp({ journal: journal(), requestShell: () => false });
    expect((await call(app, 'POST', '/api/app/recovery/restore')).status).toBe(409);
    expect(titles(join(dataDir, DB_ENTRY_NAME))).toEqual(['BEFORE-UPDATE']);
    expect(readJournal(dataDir)).toMatchObject({ phase: 'recovery', recoveryTarget: journal().toVersion });
  });

  it('restores once: a second request is a conflict and changes nothing', async () => {
    const requests: RecoveryRequest[] = [];
    const app = await recoveryApp({
      journal: journal(),
      requestShell: (request) => {
        requests.push(request);
        return true;
      },
    });
    await call(app, 'POST', '/api/app/recovery/restore');
    const live = join(dataDir, DB_ENTRY_NAME);
    const after = digest(live);

    const second = await call(app, 'POST', '/api/app/recovery/restore');

    expect(second.status).toBe(409);
    expect(second.body).toMatchObject({ error: 'conflict' });
    expect(digest(live)).toBe(after);
    expect(requests).toHaveLength(1);
  });

  it('leaves the journal and the database alone when the snapshot has gone missing', async () => {
    rmSync(snapshotPath);
    const live = join(dataDir, DB_ENTRY_NAME);
    const before = digest(live);
    const requests: RecoveryRequest[] = [];
    const app = await recoveryApp({
      journal: journal(),
      requestShell: (request) => {
        requests.push(request);
        return true;
      },
    });

    const response = await call(app, 'POST', '/api/app/recovery/restore');

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ error: 'conflict' });
    expect(digest(live)).toBe(before);
    expect(readJournal(dataDir)).toEqual(journal());
    expect(requests).toEqual([]);
  });

  it('refuses a snapshot path outside the safety folder that a tampered journal names', async () => {
    const outside = join(dataDir, 'copy-of-live.db');
    makeDatabase(outside, 'IMPOSTOR');
    const tampered = journal({ snapshotPath: outside });
    writeJournal(dataDir, tampered);
    const live = join(dataDir, DB_ENTRY_NAME);
    const before = digest(live);
    const app = await recoveryApp({ journal: tampered });

    const response = await call(app, 'POST', '/api/app/recovery/restore');

    expect(response.status).toBe(409);
    expect(digest(live)).toBe(before);
    expect(readJournal(dataDir)).toEqual(tampered);
  });

  it('refuses when the journal could not be read, because no snapshot is known', async () => {
    writeFileSync(journalPath(dataDir), 'not a journal');
    const live = join(dataDir, DB_ENTRY_NAME);
    const before = digest(live);
    const app = await recoveryApp({ journal: null });

    expect((await call(app, 'POST', '/api/app/recovery/restore')).status).toBe(409);
    expect(digest(live)).toBe(before);
  });

  it('reports a damaged snapshot as a conflict and leaves the live database as it was', async () => {
    writeFileSync(snapshotPath, 'not a database at all');
    const live = join(dataDir, DB_ENTRY_NAME);
    const before = digest(live);
    const app = await recoveryApp({ journal: journal() });

    expect((await call(app, 'POST', '/api/app/recovery/restore')).status).toBe(409);
    expect(digest(live)).toBe(before);
    expect(readJournal(dataDir)).toEqual(journal());
  });
});

describe('POST /api/app/recovery/reinstall-previous', () => {
  let images: string;
  beforeEach(() => {
    images = join(dataDir, 'images');
    mkdirSync(images);
  });

  it('is a conflict when there is no previous image, and changes nothing', async () => {
    const requests: RecoveryRequest[] = [];
    const app = await recoveryApp({
      journal: journal(),
      env: { APPIMAGE: join(images, 'Apunta.AppImage') },
      requestShell: (request) => {
        requests.push(request);
        return true;
      },
    });

    expect((await call(app, 'POST', '/api/app/recovery/reinstall-previous')).status).toBe(409);
    expect(requests).toEqual([]);
    expect(readJournal(dataDir)).toEqual(journal());
  });

  it('restores compatible data and retains the recovery fence before requesting the previous image', async () => {
    writeFileSync(join(images, PREVIOUS_IMAGE_NAME), 'synthetic image');
    const requests: RecoveryRequest[] = [];
    const journalWhenAsked: (UpdateJournal | null | 'corrupt')[] = [];
    const app = await recoveryApp({
      journal: journal(),
      env: { APPIMAGE: join(images, 'Apunta.AppImage') },
      requestShell: (request) => {
        requests.push(request);
        journalWhenAsked.push(readJournal(dataDir));
        return true;
      },
    });

    const response = await call(app, 'POST', '/api/app/recovery/reinstall-previous');

    expect(response).toEqual({ status: 202, body: { reinstalling: true } });
    expect(requests).toEqual([{ id: '7', action: 'reinstall_previous' }]);
    expect(journalWhenAsked[0]).toMatchObject({ phase: 'recovery', recoveryTarget: journal().fromVersion });
    expect(titles(join(dataDir, DB_ENTRY_NAME))).toEqual(['BEFORE-UPDATE']);
    expect(dbDoor.opened).toBe(0);
  });

  it('puts the journal back when there is no shell to ask, so recovery is not lost', async () => {
    writeFileSync(join(images, PREVIOUS_IMAGE_NAME), 'synthetic image');
    const app = await recoveryApp({
      journal: journal(),
      env: { APPIMAGE: join(images, 'Apunta.AppImage') },
      requestShell: () => false,
    });

    expect((await call(app, 'POST', '/api/app/recovery/reinstall-previous')).status).toBe(409);
    expect(readJournal(dataDir)).toMatchObject({ phase: 'recovery', recoveryTarget: journal().fromVersion });
  });

  it('refuses to authorize a clinical startup without a readable safety snapshot record', async () => {
    writeFileSync(join(images, PREVIOUS_IMAGE_NAME), 'synthetic image');
    writeFileSync(journalPath(dataDir), 'garbage');
    const requests: RecoveryRequest[] = [];
    const app = await recoveryApp({
      journal: null,
      env: { APPIMAGE: join(images, 'Apunta.AppImage') },
      requestShell: (request) => {
        requests.push(request);
        return true;
      },
    });

    expect((await call(app, 'POST', '/api/app/recovery/reinstall-previous')).status).toBe(409);
    expect(requests).toEqual([]);
    expect(readJournal(dataDir)).toBe('corrupt');
  });
});

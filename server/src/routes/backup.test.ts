import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { DB_ENTRY_NAME, MANIFEST_FILENAME, PENDING_RESTORE_DIRNAME } from '@apunta/shared';
import type { BackupStatus, CreateBackupResponse, RestoreBackupResponse } from '@apunta/shared';
import { strFromU8, unzipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { seedDatabase } from '../seed.js';
import { createTestApp, type TestApp } from '../test/harness.js';

let harness: TestApp;

beforeEach(async () => {
  harness = await createTestApp();
  seedDatabase(harness.db);
});

afterEach(async () => {
  await harness.close();
});

describe('GET /api/backup', () => {
  it('reports where backups go, that there are none, and what the practice holds', async () => {
    const response = await harness.app.inject({ method: 'GET', url: '/api/backup' });
    expect(response.statusCode).toBe(200);

    const body = response.json<BackupStatus & { pending_restore: boolean }>();
    expect(body.directory).toBe(join(harness.dataDir, 'backups'));
    expect(body.destination.risk).toBe('data-dir');
    expect(body.last_backup_at).toBeNull();
    // No backup at all counts as stale — the state the research ranks first.
    expect(body.stale).toBe(true);
    expect(body.backups).toEqual([]);
    expect(body.counts['patients']).toBe(3);
    expect(body.oldest_note_at).toBe('2026-07-24T09:00:00.000Z');
    expect(body.db_bytes).toBeGreaterThan(0);
    expect(body.pending_restore).toBe(false);
  });
});

describe('POST /api/backup', () => {
  it('writes an archive that exists by the time it answers', async () => {
    const response = await harness.app.inject({ method: 'POST', url: '/api/backup', payload: {} });
    expect(response.statusCode).toBe(201);

    const body = response.json<CreateBackupResponse>();
    expect(existsSync(body.file.path)).toBe(true);
    expect(body.manifest.integrity_check).toBe('ok');
    expect(body.file.encrypted).toBe(false);

    const after = (await harness.app.inject({ method: 'GET', url: '/api/backup' })).json<BackupStatus>();
    expect(after.backups.map((file) => file.filename)).toEqual([body.file.filename]);
    expect(after.last_backup_at).not.toBeNull();
    expect(after.stale).toBe(false);
  });

  it('refuses a relative destination rather than resolving it against the server cwd', async () => {
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/backup',
      payload: { directory: 'backups' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ message: string }>().message).toContain('absolute');
  });

  it('refuses a passphrase too short to be worth having', async () => {
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/backup',
      payload: { passphrase: 'short' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('logs that a backup happened without logging what is in it', async () => {
    const logs: string[] = [];
    const logged = await createTestApp({ logs });
    try {
      seedDatabase(logged.db);
      await logged.app.inject({ method: 'POST', url: '/api/backup', payload: {} });
      const text = logs.join('\n');
      expect(text).toContain('backup written');
      expect(text).not.toContain('intrusive thoughts');
      expect(text).not.toContain('John Smith');
    } finally {
      await logged.close();
    }
  });
});

describe('POST /api/backup/restore', () => {
  it('stages a restore without touching the live database, and applies it at the next start', async () => {
    const created = (
      await harness.app.inject({ method: 'POST', url: '/api/backup', payload: {} })
    ).json<CreateBackupResponse>();

    // Something changes after the backup, so a successful restore is visible.
    await harness.app.inject({ method: 'POST', url: '/api/patients', payload: { name: 'Added Later' } });

    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/backup/restore',
      payload: { file: created.file.filename },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<RestoreBackupResponse>();
    expect(body.staged).toBe(true);
    expect(body.safety_copy).toContain('before-restore-');

    // Live database untouched: the swap is the next start's job.
    const patients = harness.db.prepare('SELECT COUNT(*) AS n FROM patients').get() as { n: number };
    expect(patients.n).toBe(4);
    expect(existsSync(join(harness.dataDir, PENDING_RESTORE_DIRNAME, DB_ENTRY_NAME))).toBe(true);

    const status = (await harness.app.inject({ method: 'GET', url: '/api/backup' })).json<{
      pending_restore: boolean;
    }>();
    expect(status.pending_restore).toBe(true);
  });

  it('can be cancelled before the restart', async () => {
    const created = (
      await harness.app.inject({ method: 'POST', url: '/api/backup', payload: {} })
    ).json<CreateBackupResponse>();
    await harness.app.inject({
      method: 'POST',
      url: '/api/backup/restore',
      payload: { file: created.file.filename },
    });

    const cancelled = await harness.app.inject({ method: 'DELETE', url: '/api/backup/restore' });
    expect(cancelled.statusCode).toBe(204);
    expect(existsSync(join(harness.dataDir, PENDING_RESTORE_DIRNAME))).toBe(false);
  });

  it('will not read a path that is not an Apunta archive', async () => {
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/backup/restore',
      payload: { file: '/etc/passwd' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ message: string }>().message).toContain('not an Apunta backup filename');
  });

  it('asks for the passphrase rather than failing obscurely on an encrypted archive', async () => {
    const created = (
      await harness.app.inject({
        method: 'POST',
        url: '/api/backup',
        payload: { passphrase: 'a passphrase long enough' },
      })
    ).json<CreateBackupResponse>();

    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/backup/restore',
      payload: { file: created.file.filename },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ message: string }>().message).toContain('passphrase');
  });
});

describe('the archive itself', () => {
  it('renders the treatment plan versions as documents beside the notes', async () => {
    const patients = (await harness.app.inject({ method: 'GET', url: '/api/patients' })).json<{
      patients: { id: string; name: string }[];
    }>();
    const john = patients.patients.find((patient) => patient.name === 'John Smith');
    expect(john).toBeDefined();

    // Starting a plan version is all M9 needs to make one exist.
    const plan = await harness.app.inject({
      method: 'POST',
      url: `/api/patients/${john?.id ?? ''}/plan`,
      payload: {},
    });
    expect(plan.statusCode).toBe(201);

    const created = (
      await harness.app.inject({ method: 'POST', url: '/api/backup', payload: {} })
    ).json<CreateBackupResponse>();

    const names = Object.keys(unzipSync(readFileSync(created.file.path)));
    const planFiles = names.filter((name) => name.startsWith('plans/'));
    expect(planFiles).toHaveLength(1);
    expect(planFiles[0]).toContain('John Smith');
    expect(planFiles[0]).toContain('Treatment plan v1');
  });

  it('carries a manifest that names the schema level a restore is checked against', async () => {
    const created = (
      await harness.app.inject({ method: 'POST', url: '/api/backup', payload: {} })
    ).json<CreateBackupResponse>();

    const raw = unzipSync(readFileSync(created.file.path))[MANIFEST_FILENAME];
    expect(raw).toBeDefined();
    const manifest = JSON.parse(strFromU8(raw ?? new Uint8Array())) as { migration_level: number };
    const health = (await harness.app.inject({ method: 'GET', url: '/api/health' })).json<{
      db: { migrationLevel: number };
    }>();
    expect(manifest.migration_level).toBe(health.db.migrationLevel);
  });
});

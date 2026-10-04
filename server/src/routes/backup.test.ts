import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  DB_ENTRY_NAME,
  LANGUAGE_SETTING,
  MANIFEST_FILENAME,
  PENDING_RESTORE_DIRNAME,
  t,
} from '@apunta/shared';
import type { BackupStatus, CreateBackupResponse, RestoreBackupResponse } from '@apunta/shared';
import { strFromU8, unzipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as BackupModule from '../backup/index.js';
import { seedDatabase } from '../seed.js';
import { createTestApp, type TestApp } from '../test/harness.js';
import { resolveArchivePath } from './backup.js';

/**
 * `runBackupAsync` is spied rather than mocked away, so the route's error
 * mapping can be exercised without waiting out rule 3's real 60 s. Everything
 * else in the module — `backupStatus`, the restore calls, the lock — is the
 * real one, and every case in this file that writes an archive goes through it.
 */
vi.mock('../backup/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof BackupModule>();
  return { ...actual, runBackupAsync: vi.fn(actual.runBackupAsync) };
});

const { BackupError, runBackupAsync } = await import('../backup/index.js');
const runBackupAsyncSpy = vi.mocked(runBackupAsync);

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

  /**
   * `settings.last_backup_error` is stored as `{ code, params, at }` from this
   * card on, and rendered per request by `GET /api/backup` — so the **wire**
   * field is still a string, `BackupCard.tsx:210` and `shared/src/backup.ts`
   * are untouched, and the stamp comes out through `Intl` because the key
   * declares `at` as a `date`.
   */
  it('renders a stored failure in the language of the request', async () => {
    const at = '2026-09-06T15:04:05.000Z';
    harness.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
      'last_backup_error',
      JSON.stringify({
        code: 'backup.failure',
        params: { detail: 'cannot create the backup folder' },
        at,
      }),
    );

    const english = (await harness.app.inject({ method: 'GET', url: '/api/backup' })).json<BackupStatus>();
    const expectedEnglish = t('backup.failure', { at, detail: 'cannot create the backup folder' }, 'en');
    expect(english.last_backup_error).toBe(expectedEnglish);
    expect(english.last_backup_error).toContain('cannot create the backup folder');

    harness.db
      .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
      .run(LANGUAGE_SETTING, JSON.stringify('es-MX'));
    const spanish = (await harness.app.inject({ method: 'GET', url: '/api/backup' })).json<BackupStatus>();
    expect(spanish.last_backup_error).toBe(
      t('backup.failure', { at, detail: 'cannot create the backup folder' }, 'es-MX'),
    );
    // The failure's own words are data, so they survive translation untouched.
    expect(spanish.last_backup_error).toContain('cannot create the backup folder');
  });

  /**
   * A row written before this card is **displayed exactly as stored**: never
   * re-rendered, never re-translated, never rewritten. It is recognised by not
   * being this card's shape — the old value was one string with an em dash.
   */
  it('shows a pre-card last_backup_error row byte for byte, in either language', async () => {
    const legacy = '2026-09-01T09:00:00.000Z — cannot create the backup folder /data/backups';
    harness.db
      .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
      .run('last_backup_error', JSON.stringify(legacy));

    const english = (await harness.app.inject({ method: 'GET', url: '/api/backup' })).json<BackupStatus>();
    expect(english.last_backup_error).toBe(legacy);

    harness.db
      .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
      .run(LANGUAGE_SETTING, JSON.stringify('es-MX'));
    const spanish = (await harness.app.inject({ method: 'GET', url: '/api/backup' })).json<BackupStatus>();
    expect(spanish.last_backup_error).toBe(legacy);

    // And nothing rewrote it on the way past.
    const stored = harness.db.prepare('SELECT value FROM settings WHERE key = ?').get('last_backup_error') as
      { value: string } | undefined;
    expect(JSON.parse(stored?.value ?? 'null')).toBe(legacy);
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

  /**
   * C-SNAP@1 rule 3 as the caller sees it: 409 `backup_in_progress`, and a
   * `backup_in_progress` code the client can branch on rather than the generic
   * `conflict` every other conflict gets. Every other `BackupError` stays the
   * 400 it has always been, which the cases above and below both show.
   *
   * The refusal is a spy rather than a real wait: rule 3's 60 s belongs to the
   * contract and a test may not shorten it (HS-7), so a suite cannot afford to
   * wait a minute for every 409. That the lock really does refuse is proved in
   * `backup.test.ts`, where the wait is the test's own `lockWaitMs`; what is
   * under test here is only the mapping.
   */
  it('answers 409 backup_in_progress while another backup holds the lock', async () => {
    runBackupAsyncSpy.mockRejectedValueOnce(
      new BackupError(
        'another backup is already running. Wait for it to finish, then try again.',
        'backup_in_progress',
      ),
    );

    const response = await harness.app.inject({ method: 'POST', url: '/api/backup', payload: {} });

    expect(response.statusCode).toBe(409);
    expect(response.json<{ error: string; message: string }>()).toMatchObject({
      error: 'backup_in_progress',
      message: expect.stringContaining('another backup'),
    });
    // Nothing was written, and the archive folder is untouched: a refusal is
    // not a backup that quietly happened.
    const status = (await harness.app.inject({ method: 'GET', url: '/api/backup' })).json<BackupStatus>();
    expect(status.last_backup_at).toBeNull();
    expect(status.backups).toEqual([]);
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

/**
 * The day-one dead end (rehearsal, 2026-08-30): a practice is handed a config
 * pack, or restores a download a browser renamed, and the app refuses it by
 * name — with no other way in, because uploads are deliberately not accepted.
 * Inside the backup folder the practice's own hand decides what belongs;
 * outside it, the strict name is what stops this reading arbitrary files.
 */
describe('POST /api/backup/restore — which files it will take', () => {
  it('stages an archive whose name is not one Apunta would have written', async () => {
    const harness = await createTestApp();
    try {
      const created = await harness.app.inject({ method: 'POST', url: '/api/backup', payload: {} });
      const { file } = created.json() as { file: { filename: string; path: string } };
      const handedOver = join(dirname(file.path), 'apunta-config-pack.zip');
      copyFileSync(file.path, handedOver);

      const response = await harness.app.inject({
        method: 'POST',
        url: '/api/backup/restore',
        payload: { file: 'apunta-config-pack.zip' },
      });

      expect(response.statusCode).toBe(200);
      expect((response.json() as { staged: boolean }).staged).toBe(true);
    } finally {
      await harness.close();
    }
  });

  it('refuses to climb out of the backup folder', async () => {
    const harness = await createTestApp();
    try {
      for (const file of ['../apunta-backup-2026-08-30.zip', 'nested/apunta-backup-2026-08-30.zip']) {
        const response = await harness.app.inject({
          method: 'POST',
          url: '/api/backup/restore',
          payload: { file },
        });
        expect(response.statusCode, file).toBe(404);
      }
    } finally {
      await harness.close();
    }
  });

  it('still demands our own filename when given an absolute path', async () => {
    const harness = await createTestApp();
    try {
      const response = await harness.app.inject({
        method: 'POST',
        url: '/api/backup/restore',
        payload: { file: '/etc/hosts' },
      });
      expect(response.statusCode).toBe(400);
    } finally {
      await harness.close();
    }
  });
});

/**
 * Hard rule 4: the path logic stays OS-portable. A Windows machine can hand
 * over `C:\Users\…\apunta-backup-…zip`, and `file.split('/').pop()` never
 * yields the filename for it, so a valid restore was rejected. `win32.basename`
 * splits on both separators whatever the host, and the confinement below
 * refuses either one.
 */
describe('resolveArchivePath', () => {
  it('reads the filename from a POSIX absolute path', () => {
    const archive = join(harness.dataDir, 'backups', 'apunta-backup-2026-01-01.zip');
    expect(resolveArchivePath(harness.db, harness.config, archive)).toBe(archive);
  });

  it('reads the filename from a Windows absolute path, on any host', () => {
    const archive = 'C:\\Users\\x\\Backups\\apunta-backup-2026-01-01.zip';
    expect(resolveArchivePath(harness.db, harness.config, archive)).toBe(archive);
  });

  it('still refuses an absolute path whose filename is not one of ours', () => {
    expect(() =>
      resolveArchivePath(harness.db, harness.config, 'C:\\Users\\x\\Backups\\notes.zip'),
    ).toThrow();
  });

  it('still refuses to climb out with either separator', () => {
    const escapes = [
      '../apunta-backup-2026-01-01.zip',
      'nested/apunta-backup-2026-01-01.zip',
      '..\\apunta-backup-2026-01-01.zip',
      'nested\\apunta-backup-2026-01-01.zip',
    ];
    for (const file of escapes) {
      expect(() => resolveArchivePath(harness.db, harness.config, file), file).toThrow();
    }
  });
});

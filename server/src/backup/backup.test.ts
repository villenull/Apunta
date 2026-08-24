import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DATA_JSON_FILENAME,
  DB_ENTRY_NAME,
  ENCRYPTED_PAYLOAD_NAME,
  ENCRYPTION_META_FILENAME,
  MANIFEST_FILENAME,
  PENDING_RESTORE_DIRNAME,
  RESTORE_FILENAME,
  type BackupManifest,
} from '@apunta/shared';
import { strFromU8, unzipSync, zipSync, strToU8 } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig, type AppConfig } from '../config.js';
import { listNotesForPatient } from '../db/notes.js';
import { listPatients } from '../db/patients.js';
import { openDatabase, type Database } from '../db/index.js';
import { seedDatabase } from '../seed.js';
import { createBackup } from './archive.js';
import { applyPendingRestore, hasPendingRestore, readArchive, stageRestore } from './restore.js';
import { runBackup } from './index.js';

/**
 * The backup suite.
 *
 * The research ranks "the backup does not exist, or exists and cannot be
 * restored" as the single most likely way this practice loses its data, and
 * says plainly that an integration test which only inspects zip entry names
 * proves the wrong half: **"a backup that has never been restored is a
 * hypothesis"** (`docs/research/data-at-rest-2026-08.md` §5.6). So the
 * headline test here restores into a fresh data directory and compares one
 * note character for character.
 */

let dataDir: string;
let config: AppConfig;
let db: Database;

function open(dir: string): { config: AppConfig; db: Database } {
  const loaded = loadConfig({ APUNTA_DATA_DIR: dir, APUNTA_FAKE_AI: '1' });
  const { db: opened } = openDatabase({ file: loaded.dbFile, migrationsDir: loaded.migrationsDir });
  return { config: loaded, db: opened };
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'apunta-backup-'));
  const opened = open(dataDir);
  config = opened.config;
  db = opened.db;
  seedDatabase(db);
});

afterEach(() => {
  db.close();
  rmSync(dataDir, { recursive: true, force: true });
});

function entries(path: string): Record<string, Uint8Array> {
  return unzipSync(readFileSync(path));
}

function manifestOf(path: string): BackupManifest {
  const raw = entries(path)[MANIFEST_FILENAME];
  if (raw === undefined) throw new Error('no manifest in archive');
  return JSON.parse(strFromU8(raw)) as BackupManifest;
}

describe('the archive', () => {
  it('carries the database, the readable notes, the dump, a manifest and RESTORE.txt', () => {
    const created = createBackup({
      db,
      dataDir,
      directory: join(dataDir, 'backups'),
      appVersion: '1.2.3',
    });

    const names = Object.keys(entries(created.path));
    expect(names).toContain(DB_ENTRY_NAME);
    expect(names).toContain(DATA_JSON_FILENAME);
    expect(names).toContain(MANIFEST_FILENAME);
    expect(names).toContain(RESTORE_FILENAME);

    // Seeded practice: John Smith, Maria Ruiz, Ana Torres (who has no notes).
    const noteFiles = names.filter((name) => name.startsWith('notes/'));
    const noteRows = db.prepare('SELECT COUNT(*) AS n FROM notes').get() as { n: number };
    expect(noteFiles).toHaveLength(noteRows.n);
    expect(noteFiles.some((name) => name.includes('John Smith'))).toBe(true);
    expect(noteFiles.some((name) => name.includes('2026-08-08'))).toBe(true);
  });

  it('records the copy it made, not the database it copied', () => {
    const created = createBackup({ db, dataDir, directory: join(dataDir, 'backups'), appVersion: '1.2.3' });
    const manifest = manifestOf(created.path);

    expect(manifest.integrity_check).toBe('ok');
    expect(manifest.app_version).toBe('1.2.3');
    expect(manifest.migration_level).toBeGreaterThan(0);
    expect(manifest.counts['patients']).toBe(3);
    expect(manifest.counts['notes']).toBe(4);
    expect(manifest.encrypted).toBe(false);
    expect(manifest.db_bytes).toBe(entries(created.path)[DB_ENTRY_NAME]?.byteLength);
  });

  it('carries no -wal or -shm, because they are what break a hand restore', () => {
    // A live WAL with uncheckpointed content is exactly the state a backup is
    // most likely to be taken in.
    db.prepare("INSERT INTO patients (id, name, identifier, created_at) VALUES ('x', ?, NULL, ?)").run(
      'Late Arrival',
      new Date().toISOString(),
    );
    const created = createBackup({ db, dataDir, directory: join(dataDir, 'backups'), appVersion: '0' });

    const names = Object.keys(entries(created.path));
    expect(names.some((name) => name.endsWith('-wal') || name.endsWith('-shm'))).toBe(false);
    // …and the copy still has the row the WAL was holding.
    expect(manifestOf(created.path).counts['patients']).toBe(4);
  });

  it('writes nothing into TMPDIR — a bare VACUUM would put every note there', () => {
    const fakeTmp = mkdtempSync(join(tmpdir(), 'apunta-tmpdir-probe-'));
    const previous = process.env['TMPDIR'];
    process.env['TMPDIR'] = fakeTmp;
    try {
      createBackup({ db, dataDir, directory: join(dataDir, 'backups'), appVersion: '0' });
      expect(readdirSync(fakeTmp)).toEqual([]);
    } finally {
      if (previous === undefined) delete process.env['TMPDIR'];
      else process.env['TMPDIR'] = previous;
      rmSync(fakeTmp, { recursive: true, force: true });
    }
  });

  it('never overwrites an archive already written today', () => {
    const directory = join(dataDir, 'backups');
    const now = new Date('2026-08-24T10:00:00.000Z');
    const first = createBackup({ db, dataDir, directory, appVersion: '0', now });
    const second = createBackup({ db, dataDir, directory, appVersion: '0', now });

    expect(first.filename).toBe('apunta-backup-2026-08-24.zip');
    expect(second.filename).toBe('apunta-backup-2026-08-24-2.zip');
    expect(existsSync(first.path)).toBe(true);
  });

  it('leaves no staging copy of the database behind', () => {
    createBackup({ db, dataDir, directory: join(dataDir, 'backups'), appVersion: '0' });
    expect(existsSync(join(dataDir, 'backups', '.staging'))).toBe(false);
  });
});

describe('restoring', () => {
  it('round-trips a seeded practice into a fresh data directory', () => {
    const created = createBackup({ db, dataDir, directory: join(dataDir, 'backups'), appVersion: '0' });

    const johnBefore = listPatients(db).find((patient) => patient.name === 'John Smith');
    const noteBefore = listNotesForPatient(db, johnBefore?.id ?? '')[0];
    expect(noteBefore).toBeDefined();

    const fresh = mkdtempSync(join(tmpdir(), 'apunta-restore-'));
    try {
      const staged = stageRestore({
        archivePath: created.path,
        dataDir: fresh,
        maxMigrationLevel: created.manifest.migration_level,
      });
      expect(staged.manifest.db_sha256).toBe(created.manifest.db_sha256);
      expect(hasPendingRestore(fresh)).toBe(true);

      const applied = applyPendingRestore(fresh);
      expect(applied.applied).toBe(true);
      expect(hasPendingRestore(fresh)).toBe(false);

      const restored = open(fresh);
      try {
        expect(listPatients(restored.db).map((patient) => patient.name)).toEqual([
          'John Smith',
          'Maria Ruiz',
          'Ana Torres',
        ]);
        const john = listPatients(restored.db).find((patient) => patient.name === 'John Smith');
        const notes = listNotesForPatient(restored.db, john?.id ?? '');
        expect(notes).toHaveLength(3);
        // The whole point: not "a note exists" but "this note, exactly".
        expect(notes[0]?.content).toBe(noteBefore?.content);
        expect(notes[0]?.title).toBe(noteBefore?.title);
      } finally {
        restored.db.close();
      }
    } finally {
      rmSync(fresh, { recursive: true, force: true });
    }
  });

  it('moves the current database aside and deletes its stale -wal and -shm', () => {
    const created = createBackup({ db, dataDir, directory: join(dataDir, 'backups'), appVersion: '0' });

    const target = mkdtempSync(join(tmpdir(), 'apunta-restore-'));
    try {
      writeFileSync(join(target, DB_ENTRY_NAME), 'not really a database');
      writeFileSync(join(target, `${DB_ENTRY_NAME}-wal`), 'stale log');
      writeFileSync(join(target, `${DB_ENTRY_NAME}-shm`), 'stale index');

      const staged = stageRestore({
        archivePath: created.path,
        dataDir: target,
        maxMigrationLevel: created.manifest.migration_level,
      });
      const applied = applyPendingRestore(target);

      expect(applied.safetyCopy).toBe(staged.safetyCopy);
      expect(readFileSync(staged.safetyCopy, 'utf8')).toBe('not really a database');
      expect(existsSync(join(target, `${DB_ENTRY_NAME}-wal`))).toBe(false);
      expect(existsSync(join(target, `${DB_ENTRY_NAME}-shm`))).toBe(false);
      expect(applied.removedSidecars).toHaveLength(2);
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  it('does nothing when no restore is pending', () => {
    expect(applyPendingRestore(dataDir)).toEqual({ applied: false });
  });

  it('refuses an archive from a newer schema, and says why', () => {
    const created = createBackup({ db, dataDir, directory: join(dataDir, 'backups'), appVersion: '0' });

    expect(() =>
      stageRestore({
        archivePath: created.path,
        dataDir,
        maxMigrationLevel: created.manifest.migration_level - 1,
      }),
    ).toThrowError(/newer version of Apunta/);
    expect(existsSync(join(dataDir, PENDING_RESTORE_DIRNAME))).toBe(false);
  });

  it('refuses a database that does not match the fingerprint in its manifest', () => {
    const created = createBackup({ db, dataDir, directory: join(dataDir, 'backups'), appVersion: '0' });
    const contents = entries(created.path);
    const tampered = join(dataDir, 'tampered.zip');
    writeFileSync(
      tampered,
      zipSync({ ...contents, [DB_ENTRY_NAME]: strToU8('corrupted on the way to the drive') }),
    );

    expect(() => readArchive(tampered)).toThrowError(/does not match the fingerprint/);
  });

  it('refuses a zip that is not an Apunta backup at all', () => {
    const notOurs = join(dataDir, 'holiday-photos.zip');
    writeFileSync(notOurs, zipSync({ 'beach.txt': strToU8('sand') }));
    expect(() => readArchive(notOurs)).toThrowError(/not an Apunta backup/);
  });
});

describe('an encrypted archive', () => {
  const passphrase = 'correct horse battery staple';

  it('leaves RESTORE.txt readable outside the encrypted body', () => {
    const created = createBackup({
      db,
      dataDir,
      directory: join(dataDir, 'backups'),
      appVersion: '0',
      passphrase,
    });

    const names = Object.keys(entries(created.path));
    expect(names.sort()).toEqual([ENCRYPTED_PAYLOAD_NAME, ENCRYPTION_META_FILENAME, RESTORE_FILENAME].sort());

    const restoreText = strFromU8(entries(created.path)[RESTORE_FILENAME] ?? new Uint8Array());
    expect(restoreText).toContain('THIS BACKUP IS ENCRYPTED');
    // Openable without Apunta: the standalone script travels inside the file.
    expect(restoreText).toContain('decrypt.mjs');
    expect(restoreText).toContain('createDecipheriv');
    // And no note text leaked into the plaintext half.
    expect(restoreText).not.toContain('intrusive thoughts');
  });

  it('opens with the passphrase and refuses without it', () => {
    const created = createBackup({
      db,
      dataDir,
      directory: join(dataDir, 'backups'),
      appVersion: '0',
      passphrase,
    });

    expect(() => readArchive(created.path)).toThrowError(/encrypted/);
    expect(() => readArchive(created.path, 'the wrong passphrase')).toThrowError(
      /passphrase is wrong or the file is damaged/,
    );

    const opened = readArchive(created.path, passphrase);
    expect(opened.encrypted).toBe(true);
    expect(opened.manifest.encrypted).toBe(true);
    expect(opened.manifest.counts['notes']).toBe(4);
  });

  it('restores end to end through the encrypted path', () => {
    const created = createBackup({
      db,
      dataDir,
      directory: join(dataDir, 'backups'),
      appVersion: '0',
      passphrase,
    });

    const fresh = mkdtempSync(join(tmpdir(), 'apunta-restore-enc-'));
    try {
      stageRestore({
        archivePath: created.path,
        dataDir: fresh,
        maxMigrationLevel: created.manifest.migration_level,
        passphrase,
      });
      applyPendingRestore(fresh);
      const restored = open(fresh);
      try {
        expect(listPatients(restored.db)).toHaveLength(3);
      } finally {
        restored.db.close();
      }
    } finally {
      rmSync(fresh, { recursive: true, force: true });
    }
  });
});

describe('runBackup', () => {
  it('records the run, and records a failure rather than leaving a stale success', () => {
    const first = runBackup(db, config, { now: new Date('2026-08-24T09:00:00.000Z') });
    expect(first.file.filename).toBe('apunta-backup-2026-08-24.zip');
    expect(first.destination.risk).toBe('data-dir');
    expect(first.destination.warning).toBe('');

    const settings = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
    const byKey = Object.fromEntries(settings.map((row) => [row.key, JSON.parse(row.value) as unknown]));
    expect(byKey['last_backup_at']).toBe('2026-08-24T09:00:00.000Z');
    expect(byKey['last_backup_error']).toBe('');

    // A destination that cannot be created must not look like a success.
    const blocked = join(dataDir, 'a-file-not-a-folder');
    writeFileSync(blocked, 'in the way');
    expect(() => runBackup(db, config, { directory: join(blocked, 'backups') })).toThrow();
    const after = db.prepare("SELECT value FROM settings WHERE key = 'last_backup_error'").get() as {
      value: string;
    };
    expect(JSON.parse(after.value)).not.toBe('');
  });

  it('warns about a destination inside a synced folder', () => {
    const home = process.env['HOME'] ?? '';
    const synced = join(home, 'Documents', 'Apunta backups');
    mkdirSync(synced, { recursive: true });
    try {
      const result = runBackup(db, config, { directory: synced });
      expect(result.destination.risk).toBe('sync');
      expect(result.destination.warning).toContain('Documents');
    } finally {
      rmSync(join(home, 'Documents', 'Apunta backups'), { recursive: true, force: true });
    }
  });
});

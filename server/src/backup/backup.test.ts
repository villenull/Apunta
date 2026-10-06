import { execFileSync } from 'node:child_process';
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
import BetterSqlite3 from 'better-sqlite3';
import { strFromU8, unzipSync, zipSync, strToU8 } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig, type AppConfig } from '../config.js';
import { createFormat, getFormat, listFormats } from '../db/formats.js';
import { createNote, getNote, listNotesForPatient } from '../db/notes.js';
import { listPatients } from '../db/patients.js';
import { openDatabase, type Database } from '../db/index.js';
import { seedDatabase } from '../seed.js';
import { createBackup, createBackupAsync, type CreateBackupOptions } from './archive.js';
import { applyPendingRestore, hasPendingRestore, readArchive, stageRestore } from './restore.js';
import { DECRYPT_SCRIPT } from './restore-txt.js';
import {
  BACKUP_LOCK_WAIT_MS,
  maybeRunDailyBackupAsync,
  runBackup,
  runBackupAsync,
  withBackupLock,
} from './index.js';
import { listRestorableBackups, pruneBackups } from './store.js';

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
  const loaded = loadConfig({
    APUNTA_DATA_DIR: dir,
    APUNTA_INSTALL_DIR: join(dir, 'installation'),
    APUNTA_FAKE_AI: '1',
  });
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

/**
 * The archive's own `.db`, written out and opened read-only.
 *
 * Every other assertion in this file looks at zip entry names or at the
 * manifest, which is what a manifest *says*. This is the thing itself: the
 * database a restore would open, with no live handle anywhere near it.
 */
function extractedDatabase(archivePath: string, name: string): Database {
  const raw = entries(archivePath)[DB_ENTRY_NAME];
  if (raw === undefined) throw new Error('no database in the archive');
  const file = join(dataDir, name);
  writeFileSync(file, raw);
  return new BetterSqlite3(file, { readonly: true });
}

function count(db: Database, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get() as { n: number };
  return row.n;
}

const LATE_NOTE_TITLE = 'Late Session Note';

/**
 * One write that lands *after* the copy and *before* everything derived from
 * it. Prototype practice only (hard rule 2), and the moment a concurrent
 * clinician's keystroke or a background write would occupy.
 */
function addLateNote(): void {
  const john = listPatients(db).find((patient) => patient.name === 'John Smith');
  const format = listFormats(db)[0];
  createNote(db, {
    patient_id: john?.id ?? '',
    format_id: format?.id ?? '',
    title: LATE_NOTE_TITLE,
    content: 'Written after the database had already been copied.',
  });
}

/** `<dataDir>/staging/<op>-<uuid>` — C-SNAP@1's per-operation folder. */
function operationFolders(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^(backup|pre-migrate)-[0-9a-f-]+$/.test(entry.name))
    .map((entry) => entry.name);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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

  it('carries no -wal or -shm, and its copy holds the row the WAL was keeping', () => {
    // A live WAL with uncheckpointed content is exactly the state a backup is
    // most likely to be taken in.
    db.prepare("INSERT INTO patients (id, name, identifier, created_at) VALUES ('x', ?, NULL, ?)").run(
      'Late Arrival',
      new Date().toISOString(),
    );
    const created = createBackup({ db, dataDir, directory: join(dataDir, 'backups'), appVersion: '0' });

    const names = Object.keys(entries(created.path));
    expect(names.some((name) => name.endsWith('-wal') || name.endsWith('-shm'))).toBe(false);
    // …and the copy still has the row the WAL was holding. Read out of the
    // archive's own `.db`, not counted from the live handle: a bare
    // `copyFileSync` of the database file loses exactly this row, so counting
    // it from the live handle is what let that pass before.
    expect(manifestOf(created.path).counts['patients']).toBe(4);
    const copy = extractedDatabase(created.path, 'wal-case.db');
    try {
      expect(count(copy, 'patients')).toBe(4);
      expect(copy.prepare('SELECT name FROM patients WHERE id = ?').get('x')).toEqual({
        name: 'Late Arrival',
      });
    } finally {
      copy.close();
    }
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

  /**
   * Re-pointed, not deleted: watched at the old path this case went vacuous —
   * it would have passed while inspecting a folder nothing writes to any more.
   */
  it('leaves no staging copy of the database behind, on success and on failure', () => {
    const stagingRoot = join(dataDir, 'staging');
    createBackup({ db, dataDir, directory: join(dataDir, 'backups'), appVersion: '0' });
    expect(operationFolders(stagingRoot)).toEqual([]);

    // A run that cannot even reach its destination still cleans up after itself.
    const blocked = join(dataDir, 'a-file-not-a-folder');
    writeFileSync(blocked, 'in the way');
    expect(() =>
      createBackup({ db, dataDir, directory: join(blocked, 'backups'), appVersion: '0' }),
    ).toThrowError(/cannot create the backup folder/);
    expect(operationFolders(stagingRoot)).toEqual([]);
  });
});

/**
 * C-SNAP@1 rules 1 and 2: every part of an archive describes one moment.
 *
 * The failure this exists for is not a crash, it is an archive that is quietly
 * wrong — a database copied at 10:00, a manifest counted at 10:01, a readable
 * note written at 10:02, all in one zip that claims to be one backup. The write
 * is injected through `onCopied`, which fires after the copy and before any
 * derivation, so the interleaving is the one rule 2 forbids.
 *
 * Both entry points run it. `createBackupAsync` is what HTTP and the daily
 * backup use; `createBackup` is what the sync callers and most of this file use.
 * Rule 2 holding for one and not the other is the bug this case would miss.
 */
describe('one moment (C-SNAP@1)', () => {
  const entryPoints = [
    ['createBackup', (options: CreateBackupOptions) => createBackup(options)],
    ['createBackupAsync', (options: CreateBackupOptions) => createBackupAsync(options)],
  ] as const;

  for (const [label, makeBackup] of entryPoints) {
    it(`keeps a write that lands mid-backup out of every part of the archive — ${label}`, async () => {
      const created = await makeBackup({
        db,
        dataDir,
        directory: join(dataDir, 'backups'),
        appVersion: '1.2.3',
        onCopied: () => addLateNote(),
      });

      // The write really did land: the live database is one note further on.
      expect(count(db, 'notes')).toBe(5);

      const body = entries(created.path);
      const manifest = manifestOf(created.path);

      // The manifest. Both schema level and counts are read out of the copy's
      // own `schema_migrations` and tables, so `0` here would mean the level
      // was read as a file header rather than as a table.
      expect(manifest.migration_level).toBeGreaterThan(0);
      expect(manifest.sqlite_version).toMatch(/^3\./);
      expect(manifest.counts['notes']).toBe(4);
      expect(manifest.counts['patients']).toBe(3);

      // The JSON dump.
      const dump = JSON.parse(strFromU8(body[DATA_JSON_FILENAME] ?? new Uint8Array())) as {
        tables: Record<string, { title: string }[]>;
      };
      expect(dump.tables['notes']?.map((row) => row.title)).not.toContain(LATE_NOTE_TITLE);
      expect(dump.tables['notes']).toHaveLength(4);

      // The readable notes beside the database.
      const noteFiles = Object.keys(body).filter((name) => name.startsWith('notes/'));
      expect(noteFiles).toHaveLength(4);
      expect(noteFiles.some((name) => name.includes(LATE_NOTE_TITLE))).toBe(false);

      // And the database the archive actually carries.
      const copy = extractedDatabase(created.path, `${label}.db`);
      try {
        expect(count(copy, 'notes')).toBe(4);
        expect(count(copy, 'patients')).toBe(3);
        expect(copy.prepare('SELECT id FROM notes WHERE title = ?').all(LATE_NOTE_TITLE)).toEqual([]);
      } finally {
        copy.close();
      }
    });
  }
});

/**
 * C-SNAP@1 rule 3: one backup at a time, and one staging folder per operation.
 *
 * The lock lives in the backup module, not in the route, so the daily automatic
 * backup (`server/src/index.ts`) is covered by the same rule as the HTTP
 * request — and the threshold is asserted here because a test that quietly
 * shortened it would be a guard loosened to make a case pass (HS-7).
 */
describe('one backup at a time (C-SNAP@1 rule 3)', () => {
  const stagingRoot = (): string => join(dataDir, 'staging');

  function lastBackupError(): string {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'last_backup_error'").get() as
      | {
          value: string;
        }
      | undefined;
    return row === undefined ? '' : (JSON.parse(row.value) as string);
  }

  it('still waits 60 s before giving up', () => {
    expect(BACKUP_LOCK_WAIT_MS).toBe(60_000);
  });

  it('answers a second backup with backup_in_progress, and the first still succeeds', async () => {
    const directory = join(dataDir, 'backups');
    const holding = withBackupLock(async () => {
      await sleep(200);
      return 'the first run';
    });
    const started = Date.now();

    await expect(runBackupAsync(db, config, { directory, lockWaitMs: 20 })).rejects.toMatchObject({
      name: 'BackupError',
      code: 'backup_in_progress',
    });
    // The wait was the test's own override, not the production minute.
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(await holding).toBe('the first run');

    // The loser says why in Settings, and the next attempt works.
    expect(lastBackupError()).not.toBe('');
    const after = await runBackupAsync(db, config, { directory });
    expect(existsSync(after.file.path)).toBe(true);
    expect(lastBackupError()).toBe('');
  });

  it('makes the daily automatic backup wait for the same lock, not the route', async () => {
    const holding = withBackupLock(async () => {
      await sleep(200);
      return 'held';
    });
    const daily = maybeRunDailyBackupAsync(db, config);
    let settled = false;
    void daily.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );

    // Still waiting its turn while somebody else's backup holds the lock. This
    // is the daily path of `server/src/index.ts`, which never goes near HTTP.
    await sleep(50);
    expect(settled).toBe(false);
    expect(await holding).toBe('held');

    const result = await daily;
    expect(result?.file.filename).toMatch(/^apunta-backup-\d{4}-\d{2}-\d{2}\.zip$/);
    expect(existsSync(result?.file.path ?? '')).toBe(true);
    // And the run that did start left nothing in staging behind it.
    expect(operationFolders(stagingRoot())).toEqual([]);
  });

  it('tidies an empty backups/.staging from an older install, and never one holding a copy', () => {
    const legacy = join(dataDir, 'backups', '.staging');
    const leftover = join(legacy, 'apunta.db.1750000000000');
    mkdirSync(legacy, { recursive: true });
    writeFileSync(leftover, 'a copy from before the staging folder moved');

    // Not empty, so it is not ours to delete — recursively or otherwise.
    createBackup({ db, dataDir, directory: join(dataDir, 'backups'), appVersion: '0' });
    expect(existsSync(leftover)).toBe(true);

    // Empty, so the next run clears it away.
    rmSync(leftover);
    createBackup({ db, dataDir, directory: join(dataDir, 'backups'), appVersion: '0' });
    expect(existsSync(legacy)).toBe(false);
  });

  it('deletes only its own staging folder, so one run cannot erase the other', async () => {
    const staging = stagingRoot();
    const blocked = join(dataDir, 'a-file-not-a-folder');

    // A second run, started and left part way through its copy. Its staging
    // folder exists from the moment it was called, because that part is
    // synchronous.
    const second = createBackupAsync({ db, dataDir, directory: join(dataDir, 'backups'), appVersion: '0' });
    const secondFolders = operationFolders(staging);
    expect(secondFolders).toHaveLength(1);

    // A run that fails on its destination. It runs start to finish without
    // yielding, so the second run is still mid-copy while this one tidies up.
    writeFileSync(blocked, 'in the way');
    expect(() =>
      createBackup({ db, dataDir, directory: join(blocked, 'backups'), appVersion: '0' }),
    ).toThrowError(/cannot create the backup folder/);
    // Its own folder is gone. The other run's is not, with its copy still in it.
    expect(operationFolders(staging)).toEqual(secondFolders);

    // And the same for a run that succeeds.
    createBackup({ db, dataDir, directory: join(dataDir, 'backups'), appVersion: '0' });
    expect(operationFolders(staging)).toEqual(secondFolders);

    // When the second run finishes, its own cleanup takes its folder with it.
    await second;
    expect(operationFolders(staging)).toEqual([]);
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

  /**
   * C-LANG@1 rule 9: a backup carries the `locale` columns.
   *
   * A Spanish format and a Spanish note exist in no seeded practice, so this
   * creates them: the dump selects every column, which is why the round trip
   * needs no code of its own to be checked.
   */
  it('round-trips a Spanish format and note, locale included', () => {
    const format = createFormat(db, {
      name: 'Nota de progreso',
      sections: ['Lugar', 'Discusión'],
      locale: 'es-MX',
    });
    const john = listPatients(db).find((patient) => patient.name === 'John Smith');
    const spanish = createNote(db, {
      patient_id: john?.id ?? '',
      format_id: format.id,
      title: 'Nota de progreso',
      content: 'Lugar: Consultorio\n\nDiscusión: mejoró el sueño.',
      locale: 'es-MX',
    });
    // The seeded English rows beside it, so the test also shows the two travel
    // apart rather than being flattened into one language.
    const englishBefore = listNotesForPatient(db, john?.id ?? '').filter((row) => row.locale === 'en');
    expect(englishBefore.length).toBeGreaterThan(0);

    const created = createBackup({ db, dataDir, directory: join(dataDir, 'backups'), appVersion: '0' });

    const fresh = mkdtempSync(join(tmpdir(), 'apunta-restore-locale-'));
    try {
      stageRestore({
        archivePath: created.path,
        dataDir: fresh,
        maxMigrationLevel: created.manifest.migration_level,
      });
      expect(applyPendingRestore(fresh).applied).toBe(true);

      const restored = open(fresh);
      try {
        expect(getFormat(restored.db, format.id)?.locale).toBe('es-MX');
        expect(getFormat(restored.db, format.id)?.sections).toEqual(['Lugar', 'Discusión']);
        const restoredNote = getNote(restored.db, spanish.id);
        expect(restoredNote?.locale).toBe('es-MX');
        expect(restoredNote?.content).toBe(spanish.content);
        // The English rows are still English, and still there.
        expect(
          listNotesForPatient(restored.db, john?.id ?? '')
            .filter((row) => row.locale === 'en')
            .map((row) => row.content),
        ).toEqual(englishBefore.map((row) => row.content));
      } finally {
        restored.db.close();
      }
    } finally {
      rmSync(fresh, { recursive: true, force: true });
    }
  });

  it('keeps the async archive restorable', async () => {
    const created = await createBackupAsync({
      db,
      dataDir,
      directory: join(dataDir, 'backups'),
      appVersion: '0',
    });
    const fresh = mkdtempSync(join(tmpdir(), 'apunta-restore-async-'));
    try {
      const staged = stageRestore({
        archivePath: created.path,
        dataDir: fresh,
        maxMigrationLevel: created.manifest.migration_level,
      });
      applyPendingRestore(fresh);
      const restored = open(fresh);
      try {
        expect(staged.manifest.db_sha256).toBe(created.manifest.db_sha256);
        expect(listPatients(restored.db)).toHaveLength(3);
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
    expect(first.destination.risk).toBe('install-dir');
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

/**
 * The claim `RESTORE.txt` makes about itself.
 *
 * An encrypted archive is only defensible because it can be opened without
 * Apunta, and that promise is a ~20-line script printed inside the file. A
 * script that is *described* and does not run is worse than no encryption: it
 * turns "I can always get this back" into a belief nobody tested.
 *
 * So this extracts the script from the archive exactly as a person would —
 * copy the text between the dashed lines, save it as `decrypt.mjs`, run it —
 * and checks the zip it writes really is the backup.
 */
describe('the decrypt script printed inside RESTORE.txt', () => {
  /**
   * The wrong passphrase is the likeliest thing to happen to this script, at
   * the least forgiving moment: someone restoring a practice from a backup,
   * without the app. It used to answer with a Node crypto stack trace about
   * authentication tags (verified 2026-09-01), which says nothing to the
   * person reading it.
   */
  it('says what a wrong passphrase means, rather than throwing crypto internals', () => {
    expect(DECRYPT_SCRIPT).toContain('That passphrase did not open this backup.');
    expect(DECRYPT_SCRIPT).toContain('The backup itself is fine');
    expect(DECRYPT_SCRIPT).toContain('Nobody can recover the passphrase for you');
    expect(DECRYPT_SCRIPT).toContain('process.exit(1)');
  });

  it('opens an encrypted archive with nothing but Node', () => {
    const passphrase = 'the passphrase from her password manager';
    const created = createBackup({
      db,
      dataDir,
      directory: join(dataDir, 'backups'),
      appVersion: '0',
      passphrase,
    });

    const restoreText = strFromU8(entries(created.path)[RESTORE_FILENAME] ?? new Uint8Array());
    const start = restoreText.indexOf('\n', restoreText.indexOf('--- decrypt.mjs')) + 1;
    const end = restoreText.indexOf('--- end of decrypt.mjs ---');
    const script = restoreText.slice(start, end);
    expect(script).toContain('createDecipheriv');

    const work = mkdtempSync(join(tmpdir(), 'apunta-decrypt-'));
    try {
      const scriptPath = join(work, 'decrypt.mjs');
      writeFileSync(scriptPath, script);
      execFileSync('node', [scriptPath, created.path, passphrase], { cwd: work, stdio: 'pipe' });

      const recovered = join(work, 'apunta-backup-decrypted.zip');
      expect(existsSync(recovered)).toBe(true);

      const inner = unzipSync(readFileSync(recovered));
      expect(Object.keys(inner)).toContain(DB_ENTRY_NAME);
      expect(Object.keys(inner)).toContain(MANIFEST_FILENAME);
      const manifest = JSON.parse(strFromU8(inner[MANIFEST_FILENAME] ?? new Uint8Array())) as {
        db_sha256: string;
      };
      expect(manifest.db_sha256).toBe(created.manifest.db_sha256);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }, 30_000);

  it('describes a plans folder only when the archive has one', () => {
    const created = createBackup({ db, dataDir, directory: join(dataDir, 'backups'), appVersion: '0' });
    const text = strFromU8(entries(created.path)[RESTORE_FILENAME] ?? new Uint8Array());

    // The seeded practice has no plan versions, so nothing should promise one.
    expect(Object.keys(entries(created.path)).some((name) => name.startsWith('plans/'))).toBe(false);
    expect(text).not.toContain('The "plans" folder');
    // And the counts read as English rather than as a template.
    expect(text).toContain('4 notes for 3 patients');
  });
});

/**
 * Restoring and pruning look at the same folder with opposite duties, and the
 * day-one rehearsal (2026-08-30) showed what happens when one listing serves
 * both: a config pack placed there by hand was invisible, because it did not
 * carry Apunta's own filename. Relaxing the shared listing would have put
 * that same file in the pruner's blast radius, so the two are separate.
 */
describe('a backup that did not come from this app', () => {
  it('is offered for restore even though it is named something else', () => {
    const dir = mkdtempSync(join(tmpdir(), 'apunta-foreign-'));
    writeFileSync(join(dir, 'apunta-backup-2026-08-30.zip'), 'ours');
    writeFileSync(join(dir, 'apunta-config-pack.zip'), 'handed over');
    // What a browser does to a second download of the same file.
    writeFileSync(join(dir, 'apunta-backup-2026-08-30 (1).zip'), 'downloaded twice');
    writeFileSync(join(dir, 'notes.txt'), 'not an archive at all');

    const names = listRestorableBackups(dir).map((file) => file.filename);

    expect(names).toContain('apunta-config-pack.zip');
    expect(names).toContain('apunta-backup-2026-08-30 (1).zip');
    expect(names).toContain('apunta-backup-2026-08-30.zip');
    expect(names).not.toContain('notes.txt');

    rmSync(dir, { recursive: true, force: true });
  });

  it('is never deleted by the pruner, which only removes what it made', () => {
    const dir = mkdtempSync(join(tmpdir(), 'apunta-foreign-prune-'));
    // Enough same-day archives of ours that pruning definitely has work to do.
    for (let index = 0; index < 12; index += 1) {
      writeFileSync(join(dir, `apunta-backup-2026-08-${String(10 + index)}.zip`), 'ours');
    }
    writeFileSync(join(dir, 'apunta-config-pack.zip'), 'handed over');

    pruneBackups(dir);

    expect(existsSync(join(dir, 'apunta-config-pack.zip'))).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });
});

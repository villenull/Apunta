import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DATA_JSON_FILENAME, MANIFEST_FILENAME, RESTORE_FILENAME, type BackupManifest } from '@apunta/shared';
import { strFromU8, unzipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig, type AppConfig } from '../config.js';
import { listFormats } from '../db/formats.js';
import { createNote, listNotesForPatient } from '../db/notes.js';
import { listPatients } from '../db/patients.js';
import { openDatabase, type Database } from '../db/index.js';
import { seedDatabase } from '../seed.js';
import { createBackup, integrityCheck, type CreatedBackup } from './archive.js';
import { noteEntries } from './readable.js';
import { applyPendingRestore, stageRestore } from './restore.js';

/**
 * C-SNAP@1 rule 2, seen from the far end: what a restore actually gets.
 *
 * The archive is taken while a write is landing, and then restored into a
 * fresh data directory. The criterion is the one the pre-existing round-trip in
 * `backup.test.ts` does not check: the note that arrived mid-backup is absent
 * from the restored **database** and from the restored **readable notes**. A
 * round trip that passes on the strength of "a note came back, character for
 * character" says nothing about which moment it came from.
 */

const LATE_NOTE_TITLE = 'Late Session Note';

let dataDir: string;
let db: Database;
let fresh: string;

function open(dir: string): { config: AppConfig; db: Database } {
  const loaded = loadConfig({ APUNTA_DATA_DIR: dir, APUNTA_FAKE_AI: '1' });
  const { db: opened } = openDatabase({ file: loaded.dbFile, migrationsDir: loaded.migrationsDir });
  return { config: loaded, db: opened };
}

function entries(path: string): Record<string, Uint8Array> {
  return unzipSync(readFileSync(path));
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'apunta-restore-snap-'));
  db = open(dataDir).db;
  seedDatabase(db);
  fresh = mkdtempSync(join(tmpdir(), 'apunta-restore-snap-target-'));
});

afterEach(() => {
  db.close();
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(fresh, { recursive: true, force: true });
});

/** One backup, taken while a write lands between the copy and the derivation. */
function archiveWithALateWrite(): CreatedBackup {
  return createBackup({
    db,
    dataDir,
    directory: join(dataDir, 'backups'),
    appVersion: '1.2.3',
    onCopied: () => {
      const john = listPatients(db).find((patient) => patient.name === 'John Smith');
      const format = listFormats(db)[0];
      createNote(db, {
        patient_id: john?.id ?? '',
        format_id: format?.id ?? '',
        title: LATE_NOTE_TITLE,
        content: 'Written after the database had already been copied.',
      });
    },
  });
}

describe('restoring an archive taken mid-write', () => {
  it('carries the whole archive, so the assertions below are about the right file', () => {
    const created = archiveWithALateWrite();
    const body = entries(created.path);

    expect(Object.keys(body)).toEqual(
      expect.arrayContaining(['apunta.db', DATA_JSON_FILENAME, MANIFEST_FILENAME, RESTORE_FILENAME]),
    );
    // The write landed on the live database; the archive is a moment earlier.
    expect((db.prepare('SELECT COUNT(*) AS n FROM notes').get() as { n: number }).n).toBe(5);
    const manifest = JSON.parse(strFromU8(body[MANIFEST_FILENAME] ?? new Uint8Array())) as BackupManifest;
    expect(manifest.counts['notes']).toBe(4);
  });

  it('restores a database that passes its own integrity check', () => {
    const created = archiveWithALateWrite();
    stageRestore({
      archivePath: created.path,
      dataDir: fresh,
      maxMigrationLevel: created.manifest.migration_level,
    });
    expect(applyPendingRestore(fresh).applied).toBe(true);

    const restored = open(fresh);
    try {
      expect(integrityCheck(restored.config.dbFile)).toBe('ok');
    } finally {
      restored.db.close();
    }
  });

  it('restores exactly the notes the archive describes, and not the one that arrived mid-backup', () => {
    const created = archiveWithALateWrite();
    const archiveNotes = Object.entries(entries(created.path))
      .filter(([path]) => path.startsWith('notes/'))
      .map(([path, text]) => ({ path, text: strFromU8(text) }));
    expect(archiveNotes).toHaveLength(4);

    stageRestore({
      archivePath: created.path,
      dataDir: fresh,
      maxMigrationLevel: created.manifest.migration_level,
    });
    expect(applyPendingRestore(fresh).applied).toBe(true);

    const restored = open(fresh);
    try {
      const john = listPatients(restored.db).find((patient) => patient.name === 'John Smith');
      const titles = listNotesForPatient(restored.db, john?.id ?? '').map((note) => note.title);
      expect(titles).not.toContain(LATE_NOTE_TITLE);
      expect(titles).toHaveLength(3);

      // The restored readable notes are the archive's, entry for entry.
      expect(noteEntries(restored.db)).toEqual(archiveNotes);
    } finally {
      restored.db.close();
    }
  });
});

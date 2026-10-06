import { readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { strFromU8, unzipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig, type AppConfig } from '../config.js';
import { openDatabase, type Database } from '../db/index.js';
import { createFormat } from '../db/formats.js';
import { createNote } from '../db/notes.js';
import { createPatient, updatePatient } from '../db/patients.js';
import { createBackup } from './archive.js';

let dataDir: string;
let config: AppConfig;
let db: Database;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'apunta-readable-export-'));
  config = loadConfig({
    APUNTA_DATA_DIR: dataDir,
    APUNTA_INSTALL_DIR: join(dataDir, 'installation'),
    APUNTA_FAKE_AI: '1',
  });
  ({ db } = openDatabase({ file: config.dbFile, migrationsDir: config.migrationsDir }));
});

afterEach(() => {
  db.close();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('readable bulk export', () => {
  it('keeps same-day same-title notes as separate files', () => {
    const format = createFormat(db, { name: 'Progress note', sections: ['Subjective'] });
    const patient = createPatient(db, { name: 'Synthetic Client' });
    const createdAt = '2026-09-08T09:00:00.000Z';
    createNote(db, {
      patient_id: patient.id,
      format_id: format.id,
      title: 'Progress note',
      content: 'Synthetic note one, retained verbatim.',
      created_at: createdAt,
    });
    createNote(db, {
      patient_id: patient.id,
      format_id: format.id,
      title: 'Progress note',
      content: 'Synthetic note two, retained verbatim.',
      created_at: createdAt,
    });

    const created = createBackup({
      db,
      dataDir,
      directory: join(dataDir, 'backups'),
      appVersion: 'test',
      now: new Date('2026-09-08T10:00:00.000Z'),
    });
    const archive = unzipSync(readFileSync(created.path));
    const noteFiles = Object.entries(archive).filter(([path]) => path.startsWith('notes/Synthetic Client ('));

    expect(noteFiles).toHaveLength(2);
    expect(new Set(noteFiles.map(([path]) => path)).size).toBe(2);
    expect(noteFiles.map(([, text]) => strFromU8(text))).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Synthetic note one, retained verbatim.'),
        expect.stringContaining('Synthetic note two, retained verbatim.'),
      ]),
    );
    expect(created.manifest.counts['notes']).toBe(2);
  });

  it('includes notes for archived clients', () => {
    const format = createFormat(db, { name: 'Progress note', sections: ['Subjective'] });
    const patient = createPatient(db, { name: 'Archived Synthetic Client' });
    createNote(db, {
      patient_id: patient.id,
      format_id: format.id,
      title: 'Archived note',
      content: 'Synthetic archived note, retained verbatim.',
      created_at: '2026-09-07T09:00:00.000Z',
    });
    updatePatient(db, patient.id, { archived: true });

    const created = createBackup({
      db,
      dataDir,
      directory: join(dataDir, 'backups'),
      appVersion: 'test',
      now: new Date('2026-09-08T10:00:00.000Z'),
    });
    const archive = unzipSync(readFileSync(created.path));

    expect(Object.keys(archive).some((path) => path.startsWith('notes/Archived Synthetic Client ('))).toBe(
      true,
    );
    expect(created.manifest.counts['patients']).toBe(1);
    expect(created.manifest.counts['notes']).toBe(1);
  });
});

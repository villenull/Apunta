import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from './config.js';
import { createFormat } from './db/formats.js';
import { openDatabase, type Database } from './db/index.js';
import { createNote } from './db/notes.js';
import { createPatient } from './db/patients.js';
import { createTranscript } from './db/transcripts.js';
import { runStartupMaintenance, STARTUP_ORPHAN_AUDIO_AGE_MS } from './startup-maintenance.js';

const migrationsDir = loadConfig({}).migrationsDir;
const HOUR_MS = 60 * 60 * 1000;

let dataDir: string;
let audioDir: string;
let db: Database;
let logs: { readonly detail: Record<string, unknown>; readonly message: string }[];

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'apunta-startup-maintenance-'));
  audioDir = join(dataDir, 'audio');
  mkdirSync(audioDir, { recursive: true });
  db = openDatabase({ file: join(dataDir, 'apunta.db'), migrationsDir }).db;
  logs = [];
});

afterEach(() => {
  db.close();
  rmSync(dataDir, { recursive: true, force: true });
});

/** Write a synthetic WAV and set its mtime, so the sweep's clock is exact. */
function writeAudio(name: string, mtimeMs: number): string {
  const path = join(audioDir, name);
  writeFileSync(path, 'RIFF....WAVE');
  const seconds = mtimeMs / 1000;
  utimesSync(path, seconds, seconds);
  return path;
}

/** A patient with one recorded note whose transcript points at `audioFilename`. */
function seedRecordedNote(audioFilename: string): void {
  const format = createFormat(db, { name: 'Progress note', sections: ['Subjective'] });
  const patient = createPatient(db, { name: 'John Smith' });
  const note = createNote(db, { patient_id: patient.id, format_id: format.id, title: format.name });
  createTranscript(db, {
    note_id: note.id,
    source: 'audio',
    raw_text: 'Synthetic sample transcript.',
    audio_filename: audioFilename,
  });
}

const log = (detail: Record<string, unknown>, message: string): void => {
  logs.push({ detail, message });
};

describe('runStartupMaintenance', () => {
  it('removes an unreferenced recording older than an hour and keeps the rest', async () => {
    const now = Date.now();
    const referenced = writeAudio('referenced.wav', now - 2 * HOUR_MS);
    const orphan = writeAudio('orphan.wav', now - 2 * HOUR_MS);
    const freshOrphan = writeAudio('fresh.wav', now - 60 * 1000);
    seedRecordedNote('referenced.wav');

    await runStartupMaintenance(db, { audioDir }, log);

    expect(existsSync(orphan)).toBe(false);
    expect(existsSync(referenced)).toBe(true);
    expect(existsSync(freshOrphan)).toBe(true);
    // One line, counts only — never a filename, which is a practice's data.
    expect(logs).toHaveLength(1);
    expect(logs[0]?.detail).toEqual({ removed: 1, failed: 0 });
    expect(JSON.stringify(logs)).not.toMatch(/\.wav/);
  });

  it('does not fail startup when the audio directory cannot be read', async () => {
    // A readdir error other than ENOENT: a file where the folder should be.
    // `sweepOrphanAudio` rethrows it, and startup maintenance has to swallow it.
    rmSync(audioDir, { recursive: true, force: true });
    writeFileSync(audioDir, 'not a directory');

    await expect(runStartupMaintenance(db, { audioDir }, log)).resolves.toBeUndefined();

    expect(logs).toHaveLength(1);
    // The failure is reported by code, never by the path it failed on.
    expect(logs[0]?.detail).toEqual({ code: 'ENOTDIR' });
    expect(JSON.stringify(logs)).not.toContain(audioDir);
  });

  it('still resolves when the logger itself throws', async () => {
    rmSync(audioDir, { recursive: true, force: true });
    writeFileSync(audioDir, 'not a directory');
    const throwingLog = (): void => {
      throw new Error('logger down');
    };

    await expect(runStartupMaintenance(db, { audioDir }, throwingLog)).resolves.toBeUndefined();
  });

  it('is silent when there is nothing to sweep', async () => {
    writeAudio('referenced.wav', Date.now() - 2 * HOUR_MS);
    seedRecordedNote('referenced.wav');

    await runStartupMaintenance(db, { audioDir }, log);

    expect(logs).toEqual([]);
  });
});

describe('the startup sweep threshold', () => {
  it('is one hour, named', () => {
    expect(STARTUP_ORPHAN_AUDIO_AGE_MS).toBe(HOUR_MS);
  });
});

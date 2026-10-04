import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../config.js';
import { createFormat } from '../db/formats.js';
import { openDatabase, type Database } from '../db/index.js';
import { createNote } from '../db/notes.js';
import { createPatient } from '../db/patients.js';
import { createTranscript } from '../db/transcripts.js';
import { collectAudioFilenames, removeAudioFiles, sweepOrphanAudio } from './retention.js';

const migrationsDir = loadConfig({}).migrationsDir;
const HOUR_MS = 60 * 60 * 1000;

let dataDir: string;
let audioDir: string;
let db: Database;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'apunta-retention-'));
  audioDir = join(dataDir, 'audio');
  mkdirSync(audioDir, { recursive: true });
  db = openDatabase({ file: join(dataDir, 'apunta.db'), migrationsDir }).db;
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
function seedRecordedNote(audioFilename: string): { patientId: string; noteId: string } {
  const format = createFormat(db, { name: 'Progress note', sections: ['Subjective'] });
  const patient = createPatient(db, { name: 'John Smith' });
  const note = createNote(db, { patient_id: patient.id, format_id: format.id, title: format.name });
  createTranscript(db, {
    note_id: note.id,
    source: 'audio',
    raw_text: 'Synthetic sample transcript.',
    audio_filename: audioFilename,
  });
  return { patientId: patient.id, noteId: note.id };
}

describe('collectAudioFilenames', () => {
  it('reads the recordings a note references, and only those', () => {
    const first = seedRecordedNote('first.wav');
    seedRecordedNote('second.wav');

    expect(collectAudioFilenames(db, { kind: 'notes', ids: [first.noteId] })).toEqual(['first.wav']);
    expect(collectAudioFilenames(db, { kind: 'notes', ids: [] })).toEqual([]);
  });

  it('reads every recording across a patient’s notes', () => {
    const format = createFormat(db, { name: 'Progress note', sections: ['Subjective'] });
    const patient = createPatient(db, { name: 'Maria Ruiz' });
    const other = seedRecordedNote('elsewhere.wav');

    for (const filename of ['a.wav', 'b.wav']) {
      const note = createNote(db, {
        patient_id: patient.id,
        format_id: format.id,
        title: format.name,
      });
      createTranscript(db, { note_id: note.id, source: 'audio', raw_text: 'x', audio_filename: filename });
    }

    expect(collectAudioFilenames(db, { kind: 'patient', id: patient.id }).sort()).toEqual(['a.wav', 'b.wav']);
    // The other patient's note is untouched by this query.
    expect(collectAudioFilenames(db, { kind: 'patient', id: other.patientId })).toEqual(['elsewhere.wav']);
  });

  it('ignores transcripts with no stored recording', () => {
    const format = createFormat(db, { name: 'Progress note', sections: ['Subjective'] });
    const patient = createPatient(db, { name: 'John Smith' });
    const note = createNote(db, { patient_id: patient.id, format_id: format.id, title: format.name });
    createTranscript(db, { note_id: note.id, source: 'typed', raw_text: 'typed in' });

    expect(collectAudioFilenames(db, { kind: 'notes', ids: [note.id] })).toEqual([]);
    expect(collectAudioFilenames(db, { kind: 'all' })).toEqual([]);
  });
});

describe('removeAudioFiles', () => {
  it('deletes plain basenames and ignores a file that is already gone', async () => {
    const present = writeAudio('present.wav', Date.now());

    const result = await removeAudioFiles(audioDir, ['present.wav', 'missing.wav']);

    expect(existsSync(present)).toBe(false);
    expect(result).toEqual({ removed: 2, failed: 0, rejected: 0 });
  });

  it('refuses traversal names and deletes nothing outside the audio directory', async () => {
    const outside = join(dataDir, 'escape.wav');
    writeFileSync(outside, 'RIFF....WAVE');

    const result = await removeAudioFiles(audioDir, ['../escape.wav', 'nested/escape.wav', '..', '.', '']);

    expect(existsSync(outside)).toBe(true);
    expect(result.removed).toBe(0);
    expect(result.rejected).toBe(5);
  });
});

describe('sweepOrphanAudio', () => {
  const now = 10 * HOUR_MS;

  it('removes only unreferenced .wav files older than the threshold', async () => {
    const old = now - 2 * HOUR_MS;
    const fresh = now - 60 * 1000;

    const referenced = writeAudio('referenced.wav', old);
    const orphan = writeAudio('orphan.wav', old);
    const freshOrphan = writeAudio('fresh-orphan.wav', fresh);
    const notWav = writeAudio('notes.txt', old);

    seedRecordedNote('referenced.wav');

    const result = await sweepOrphanAudio(db, audioDir, { olderThanMs: HOUR_MS, now });

    expect(result).toEqual({ removed: 1, failed: 0 });
    expect(existsSync(referenced)).toBe(true);
    expect(existsSync(orphan)).toBe(false);
    expect(existsSync(freshOrphan)).toBe(true);
    expect(existsSync(notWav)).toBe(true);
  });

  it('treats the threshold as a floor, not a target', async () => {
    const atThreshold = writeAudio('exactly.wav', now - HOUR_MS);
    const justInside = writeAudio('inside.wav', now - HOUR_MS + 1);

    const result = await sweepOrphanAudio(db, audioDir, { olderThanMs: HOUR_MS, now });

    expect(result.removed).toBe(1);
    expect(existsSync(atThreshold)).toBe(false);
    expect(existsSync(justInside)).toBe(true);
  });

  it('is a no-op when the audio directory does not exist yet', async () => {
    rmSync(audioDir, { recursive: true, force: true });

    expect(await sweepOrphanAudio(db, audioDir, { olderThanMs: HOUR_MS, now })).toEqual({
      removed: 0,
      failed: 0,
    });
  });
});

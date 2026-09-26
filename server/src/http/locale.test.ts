import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DEFAULT_LOCALE, LANGUAGE_SETTING, t, type Locale, type MessageKey } from '@apunta/shared';
import type { Database } from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../config.js';
import { openDatabase } from '../db/index.js';
import { capture, msg, storedLanguage } from './locale.js';

/**
 * C-LANG@1's one locale table, asked three ways.
 *
 * A temp database of the test's own, opened and deleted here: nothing in this
 * file reads the owner's data folder, and no server is started (the rows are
 * written through the same `settings` table a `PUT /api/settings` writes).
 */
let dataDir: string;
let db: Database;

function setLanguage(locale: Locale): void {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
    LANGUAGE_SETTING,
    JSON.stringify(locale),
  );
}

function addNote(id: string, locale: Locale): void {
  db.prepare('INSERT OR IGNORE INTO patients (id, name, created_at) VALUES (?, ?, ?)').run(
    'patient-1',
    'John Smith',
    '2026-09-01T00:00:00.000Z',
  );
  db.prepare(
    "INSERT OR IGNORE INTO note_formats (id, name, locale, sections, instructions, source, created_at) VALUES (?, ?, ?, '[]', '', 'manual', ?)",
  ).run('format-1', 'Progress note', DEFAULT_LOCALE, '2026-09-01T00:00:00.000Z');
  db.prepare(
    `INSERT INTO notes (id, patient_id, format_id, locale, title, status, revision, content, created_at, updated_at)
     VALUES (?, 'patient-1', 'format-1', ?, 'Progress note', 'draft', 1, '', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')`,
  ).run(id, locale);
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'apunta-locale-test-'));
  // The same migrations the app runs, resolved by the same config loader, so
  // this suite needs no path of its own and cannot drift from the schema.
  const config = loadConfig({ APUNTA_DATA_DIR: dataDir });
  db = openDatabase({ file: config.dbFile, migrationsDir: config.migrationsDir }).db;
});

afterEach(() => {
  db.close();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('storedLanguage', () => {
  it('answers English when no row has ever been written', () => {
    expect(storedLanguage(db)).toBe(DEFAULT_LOCALE);
  });

  it('answers the row that is there', () => {
    setLanguage('es-MX');
    expect(storedLanguage(db)).toBe('es-MX');
  });

  it('falls back to English for a row that is not a language at all', () => {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
      LANGUAGE_SETTING,
      JSON.stringify('klingon'),
    );
    expect(storedLanguage(db)).toBe(DEFAULT_LOCALE);
  });
});

describe('capture', () => {
  /**
   * Rule 3: a request that is not a job and not a refine is answered in the
   * stored setting, and a job reads it once at the start.
   */
  it('resolves the setting for a request with no note of its own', () => {
    setLanguage('es-MX');
    expect(capture(db)).toBe('es-MX');
  });

  it('holds the value it read, even after the setting changes underneath it', () => {
    setLanguage('es-MX');
    const captured = capture(db);
    setLanguage('en');
    // The captured value is what a retry, an SSE frame and a persisted row use
    // (C-LANG@1 rule 4); the setting as it stands later is not consulted again.
    expect(captured).toBe('es-MX');
    expect(capture(db)).toBe('en');
  });

  /**
   * Rule 4's named exception: a refine answers in the **target note's** locale,
   * whatever the setting says — the contract's own rejection example is a
   * Spanish instruction against an English note, and this is the other half.
   */
  it('resolves the note locale for a refine, whatever the setting says', () => {
    setLanguage('en');
    addNote('note-es', 'es-MX');
    expect(capture(db, 'note-es')).toBe('es-MX');
  });

  it('falls back to the setting when the note is unknown or has no locale', () => {
    setLanguage('es-MX');
    expect(capture(db, 'no-such-note')).toBe('es-MX');
  });
});

describe('msg', () => {
  it('renders the same key in either language from one call', () => {
    expect(msg('en', 'errors.not_found.note')).toBe('Note not found');
    expect(msg('es-MX', 'errors.not_found.note')).toBe('No se encontró la nota');
  });

  /**
   * The per-key placeholder check this card's keys rely on lives in
   * `shared/src/i18n/t.test.ts` and reads both catalogues for every key. This
   * case is the same invariant seen from the server for one key that did not
   * exist at the base commit — `errors.bad_request.import_patient_limit`, whose
   * `{max}` is a `number`, so the two languages differ in more than the words.
   */
  it('fills a key this card added in both catalogues, with its number grouped', () => {
    const key: MessageKey = 'errors.bad_request.import_patient_limit';
    expect(msg('en', key, { max: 25 })).toBe('List at most 25 names.');
    expect(msg('es-MX', key, { max: 25 })).toBe('Escribe como máximo 25 nombres.');
    expect(t(key, { max: 1234 }, 'en')).toBe('List at most 1,234 names.');
    expect(t(key, { max: 1234 }, 'es-MX')).toBe('Escribe como máximo 1,234 nombres.');
  });
});

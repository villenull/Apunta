import type { Settings } from '@apunta/shared';
import type { Database } from 'better-sqlite3';

/**
 * Settings are a key → JSON-value store. Values round-trip through
 * `JSON.stringify`/`JSON.parse` so booleans, numbers and string arrays all
 * survive; a row whose value somehow is not valid JSON is skipped rather than
 * taking the whole endpoint down.
 */

interface SettingRow {
  key: string;
  value: string;
}

export function getAllSettings(db: Database): Settings {
  const rows = db.prepare('SELECT key, value FROM settings ORDER BY key').all() as SettingRow[];

  const settings: Settings = {};
  for (const row of rows) {
    try {
      settings[row.key] = JSON.parse(row.value) as Settings[string];
    } catch {
      // Corrupt row: ignore it rather than failing every settings read.
    }
  }
  return settings;
}

export function getSetting<T>(db: Database, key: string): T | undefined {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    { value: string } | undefined;
  if (!row) return undefined;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return undefined;
  }
}

/** Upserts every key in `patch` in one transaction; other keys are untouched. */
export function putSettings(db: Database, patch: Settings): Settings {
  const upsert = db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
  );

  const write = db.transaction((entries: [string, unknown][]) => {
    for (const [key, value] of entries) upsert.run(key, JSON.stringify(value));
  });

  write(Object.entries(patch));
  return getAllSettings(db);
}

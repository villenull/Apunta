import type { Database } from 'better-sqlite3';

/**
 * `data.json` — the relational dump that survives a schema change.
 *
 * The `.db` in the archive is the restore path; this is the fallback for the
 * case a `.db` cannot cover, which is a future migration making the old file
 * unloadable (`docs/research/data-at-rest-2026-08.md` §5.2). JSON is still
 * parseable in every language in 2035, and the archive is cheap enough to
 * carry both.
 *
 * Tables are read from `sqlite_master` rather than listed here on purpose: a
 * migration that adds a table would otherwise silently drop it from every
 * backup taken afterwards, and nobody would notice until the restore.
 */

export interface DatabaseDump {
  /** Highest applied migration, repeated here so `data.json` stands alone. */
  readonly migration_level: number;
  readonly generated_at: string;
  readonly tables: Record<string, unknown[]>;
}

/** Every user table, in name order. `sqlite_*` internals are not ours to copy. */
export function listUserTables(db: Database): string[] {
  const rows = db
    .prepare(
      `SELECT name FROM sqlite_master
        WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name`,
    )
    .all() as { name: string }[];
  return rows.map((row) => row.name);
}

export function countRows(db: Database, table: string): number {
  // The name comes from sqlite_master, never from a request, so interpolation
  // here cannot carry user input — and a table name is not bindable anyway.
  const row = db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get() as { n: number };
  return row.n;
}

/** Row counts per table, for the manifest and for the Settings retention panel. */
export function tableCounts(db: Database): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const table of listUserTables(db)) counts[table] = countRows(db, table);
  return counts;
}

export function dumpDatabase(db: Database, migrationLevel: number, now: Date): DatabaseDump {
  const tables: Record<string, unknown[]> = {};
  for (const table of listUserTables(db)) {
    tables[table] = db.prepare(`SELECT * FROM "${table}"`).all();
  }
  return { migration_level: migrationLevel, generated_at: now.toISOString(), tables };
}

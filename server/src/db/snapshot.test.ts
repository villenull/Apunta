import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import BetterSqlite3, { type Database } from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { snapshotDatabase } from './snapshot.js';

/**
 * The one copy-making function C-SNAP@1 rule 1 names.
 *
 * Its job is small and its properties are not: the copy is a whole, standalone
 * database that includes what the write-ahead log is still holding, and it
 * never writes to the source. Those are the two ways a "copy" goes wrong — a
 * `copyFileSync` of a live WAL database silently drops committed rows, and a
 * copy made *through* the source handle can hold a read transaction open on the
 * practice's own database while it runs.
 */

let dir: string;
let db: Database;
let source: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'apunta-snapshot-'));
  source = join(dir, 'live.db');
  db = new BetterSqlite3(source);
  db.pragma('journal_mode = WAL');
  db.exec('CREATE TABLE notes (id TEXT PRIMARY KEY, title TEXT NOT NULL) STRICT;');
  db.prepare("INSERT INTO notes VALUES ('a', 'First session')").run();
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function titlesIn(file: string): string[] {
  const handle = new BetterSqlite3(file, { readonly: true });
  try {
    const rows = handle.prepare('SELECT title FROM notes ORDER BY id').all() as { title: string }[];
    return rows.map((row) => row.title);
  } finally {
    handle.close();
  }
}

describe('snapshotDatabase', () => {
  const modes = [
    ['vacuum-into', () => snapshotDatabase(db, join(dir, 'copy-vacuum.db'))],
    ['online-backup', () => snapshotDatabase(db, join(dir, 'copy-online.db'), 'online-backup')],
  ] as const;

  for (const [mode, take] of modes) {
    it(`returns the path of a readable copy — ${mode}`, async () => {
      const path = await take();

      expect(path).toBe(mode === 'vacuum-into' ? join(dir, 'copy-vacuum.db') : join(dir, 'copy-online.db'));
      expect(existsSync(path)).toBe(true);
      expect(titlesIn(path)).toEqual(['First session']);
    });

    it(`includes the row the write-ahead log is still holding — ${mode}`, async () => {
      // Committed, deliberately not checkpointed: this is the row a bare
      // `copyFileSync` of the database file loses.
      db.prepare("INSERT INTO notes VALUES ('b', 'Committed to the log')").run();
      expect(existsSync(`${source}-wal`)).toBe(true);

      const path = await take();

      expect(titlesIn(path)).toEqual(['First session', 'Committed to the log']);
    });
  }

  it('leaves the source exactly as it was — still open, still writable, still holding its own row', async () => {
    const path = await snapshotDatabase(db, join(dir, 'copy.db'), 'online-backup');
    // Before anything opens it: the copy is one file, so the archive carries one
    // file and a hand restore needs no `-wal` or `-shm` beside it.
    expect(readdirSync(dir).filter((name) => name.startsWith('copy.db-'))).toEqual([]);

    expect(titlesIn(path)).toEqual(['First session']);
    db.prepare("INSERT INTO notes VALUES ('c', 'After the snapshot')").run();
    expect(titlesIn(path)).toEqual(['First session']);
    expect(titlesIn(source)).toEqual(['First session', 'After the snapshot']);
  });

  it('is not the same as copying the database file, which is the case the copy exists for', async () => {
    // Schema into the main file, so the only thing the log is holding is the
    // row — the difference below is that row and nothing else.
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.prepare("INSERT INTO notes VALUES ('b', 'Committed to the log')").run();

    const path = await snapshotDatabase(db, join(dir, 'copy.db'), 'online-backup');
    expect(titlesIn(path)).toEqual(['First session', 'Committed to the log']);

    // The same operation done the obvious way, for contrast.
    const bare = join(dir, 'bare.db');
    copyFileSync(source, bare);
    expect(titlesIn(bare)).toEqual(['First session']);
  });

  it("says which copy failed, rather than passing SQLite's own words on", async () => {
    const unwritable = join(dir, 'a-file-not-a-folder');
    writeFileSync(unwritable, 'in the way');

    expect(() => snapshotDatabase(db, join(unwritable, 'copy.db'))).toThrowError(
      /the database copy to .*a-file-not-a-folder.* failed/,
    );
    await expect(snapshotDatabase(db, join(unwritable, 'copy.db'), 'online-backup')).rejects.toThrowError(
      /the database copy to .*a-file-not-a-folder.* failed/,
    );
  });

  it('refuses to overwrite a copy that is already there', () => {
    const path = join(dir, 'copy.db');
    writeFileSync(path, 'a previous copy');

    expect(() => snapshotDatabase(db, path)).toThrowError(/the database copy to .* failed/);
    // Whatever was there is still there: a failed snapshot destroys nothing.
    expect(readFileSync(path, 'utf8')).toBe('a previous copy');
  });
});

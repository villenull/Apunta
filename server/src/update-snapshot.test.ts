import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { readJournal } from './update-journal.js';
import { takePreUpdateSnapshot } from './update-snapshot.js';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture(): { dataDir: string; db: Database.Database } {
  const dataDir = mkdtempSync(join(tmpdir(), 'apunta-snap-'));
  dirs.push(dataDir);
  const db = new Database(join(dataDir, 'apunta.db'));
  db.exec("CREATE TABLE note (id TEXT); INSERT INTO note VALUES ('John Smith');");
  return { dataDir, db };
}

const NOW = (): Date => new Date('2026-10-06T12:00:00.000Z');

describe('takePreUpdateSnapshot', () => {
  it('writes a consistent copy named for the versions, then the pending journal', async () => {
    const { dataDir, db } = fixture();
    const result = await takePreUpdateSnapshot({
      db,
      dataDir,
      id: '17',
      fromVersion: '1.0.0',
      toVersion: '1.1.0',
      quiesced: () => true,
      now: NOW,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshotPath).toBe(
      join(dataDir, 'safety', 'pre-update-1.0.0-1.1.0-2026-10-06T12-00-00-000Z.db'),
    );
    const copy = new Database(result.snapshotPath, { readonly: true });
    expect(copy.prepare('SELECT id FROM note').all()).toEqual([{ id: 'John Smith' }]);
    copy.close();
    expect(readJournal(dataDir)).toEqual({
      phase: 'pending',
      updateId: '17',
      fromVersion: '1.0.0',
      toVersion: '1.1.0',
      snapshotPath: result.snapshotPath,
      createdAt: '2026-10-06T12:00:00.000Z',
    });
    // The staging copy is gone; only the snapshot remains.
    expect(existsSync(join(dataDir, 'staging'))).toBe(true);
    expect(readdirSync(join(dataDir, 'staging'))).toEqual([]);
    db.close();
  });

  it('writes nothing when the server is not quiesced or the target is unknown', async () => {
    const { dataDir, db } = fixture();
    const base = { db, dataDir, id: '1', fromVersion: '1.0.0', now: NOW };
    expect(await takePreUpdateSnapshot({ ...base, toVersion: '1.1.0', quiesced: () => false })).toEqual({
      ok: false,
      code: 'not_quiesced',
    });
    expect(await takePreUpdateSnapshot({ ...base, toVersion: undefined, quiesced: () => true })).toEqual({
      ok: false,
      code: 'snapshot_failed',
    });
    expect(existsSync(join(dataDir, 'safety'))).toBe(false);
    expect(readJournal(dataDir)).toBeNull();
    db.close();
  });

  it('refuses a second request while one is running, and a failed copy leaves no journal', async () => {
    const { dataDir, db } = fixture();
    const input = { db, dataDir, fromVersion: '1.0.0', toVersion: '1.1.0', quiesced: () => true, now: NOW };
    const first = takePreUpdateSnapshot({ ...input, id: 'a' });
    const second = await takePreUpdateSnapshot({ ...input, id: 'b' });
    expect(second).toEqual({ ok: false, code: 'backup_in_progress' });
    expect((await first).ok).toBe(true);

    // The same name again cannot be overwritten: the copy fails and the journal is the first one's.
    const clash = await takePreUpdateSnapshot({ ...input, id: 'c' });
    expect(clash).toEqual({ ok: false, code: 'snapshot_failed' });
    expect(readJournal(dataDir)).toMatchObject({ updateId: 'a' });
    db.close();
  });
});

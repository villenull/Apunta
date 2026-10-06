/**
 * The pre-update safety snapshot (C-UPD@1 "Recovery startup", C-SNAP@1).
 *
 * Answers the shell's `snapshot_request{id}`. Order is the contract: the copy is
 * made with the one snapshot primitive, integrity-checked, moved into
 * `<dataDir>/safety/pre-update-<from>-<to>-<utc>.db`, fsynced, and only then is
 * the journal written (`pending`, `updateId = id`). The caller writes
 * `snapshot_result{ok:true}` after this resolves, so the acknowledgment always
 * follows a durable file *and* a durable journal entry.
 */
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import type { Database } from 'better-sqlite3';

import { integrityCheck } from './backup/archive.js';
import { snapshotDatabase } from './db/snapshot.js';
import { uuidv7 } from './db/uuid.js';
import { writeJournal } from './update-journal.js';

export type SnapshotFailureCode = 'not_quiesced' | 'backup_in_progress' | 'snapshot_failed';

export interface PreUpdateSnapshotInput {
  readonly db: Database;
  readonly dataDir: string;
  /** The `snapshot_request` id; it becomes the journal's `updateId`. */
  readonly id: string;
  readonly fromVersion: string;
  /** The target version, from the shell's last snapshotting status. */
  readonly toVersion: string | undefined;
  /** Whether a successful quiesce is holding maintenance right now. */
  readonly quiesced: () => boolean;
  readonly now?: () => Date;
}

export type PreUpdateSnapshotResult =
  | { readonly ok: true; readonly snapshotPath: string }
  | { readonly ok: false; readonly code: SnapshotFailureCode };

/** One snapshot at a time; a second request is refused, never queued. */
let running = false;

export async function takePreUpdateSnapshot(input: PreUpdateSnapshotInput): Promise<PreUpdateSnapshotResult> {
  if (running) return { ok: false, code: 'backup_in_progress' };
  // Writes must be refused for the copy to mean anything, so a request that did
  // not follow a successful quiesce is not served.
  if (!input.quiesced()) return { ok: false, code: 'not_quiesced' };
  if (input.toVersion === undefined || input.toVersion === '') return { ok: false, code: 'snapshot_failed' };
  running = true;
  const stagingRoot = join(input.dataDir, 'staging');
  const staging = join(stagingRoot, `pre-update-${uuidv7()}`);
  try {
    mkdirSync(stagingRoot, { recursive: true, mode: 0o700 });
    mkdirSync(staging, { recursive: true, mode: 0o700 });
    const copyPath = join(staging, 'apunta.db');
    await snapshotDatabase(input.db, copyPath, 'online-backup');
    const integrity = integrityCheck(copyPath);
    if (integrity !== 'ok') throw new Error(`the update snapshot failed its integrity check (${integrity})`);

    const safetyDir = join(input.dataDir, 'safety');
    mkdirSync(safetyDir, { recursive: true, mode: 0o700 });
    const stamp = (input.now?.() ?? new Date()).toISOString().replace(/[:.]/g, '-');
    const destination = join(safetyDir, `pre-update-${input.fromVersion}-${input.toVersion}-${stamp}.db`);
    if (existsSync(destination)) throw new Error(`a safety snapshot is already at ${destination}`);
    renameSync(copyPath, destination);
    fsyncPath(destination);
    fsyncDir(safetyDir);

    writeJournal(input.dataDir, {
      phase: 'pending',
      updateId: input.id,
      fromVersion: input.fromVersion,
      toVersion: input.toVersion,
      snapshotPath: destination,
      createdAt: (input.now?.() ?? new Date()).toISOString(),
    });
    return { ok: true, snapshotPath: destination };
  } catch {
    return { ok: false, code: 'snapshot_failed' };
  } finally {
    rmSync(staging, { recursive: true, force: true });
    running = false;
  }
}

function fsyncPath(path: string): void {
  const fd = openSync(path, 'r');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function fsyncDir(dir: string): void {
  if (process.platform === 'win32') return;
  fsyncPath(dir);
}

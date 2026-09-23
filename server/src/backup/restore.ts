import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  DB_ENTRY_NAME,
  ENCRYPTED_PAYLOAD_NAME,
  ENCRYPTION_META_FILENAME,
  MANIFEST_FILENAME,
  PENDING_RESTORE_DIRNAME,
  BackupManifestSchema,
  EncryptionMetaSchema,
  type BackupManifest,
} from '@apunta/shared';
import { strFromU8, unzipSync } from 'fflate';

import { integrityCheck } from './archive.js';
import { decryptPayload, sha256 } from './crypto.js';

/**
 * Restore, in two halves — and it is two halves on purpose.
 *
 * `better-sqlite3` holds the live database open, so swapping the file under a
 * running server is how a restore turns into a corrupt database. So a restore
 * is *staged* while the app runs and *applied* at the next start, before
 * anything opens the file. The user quits and reopens Apunta once; in exchange
 * the swap happens with no reader attached.
 *
 * Three guards, each of which the research names as the thing people skip:
 *
 * - the archive's `migration_level` must not exceed the running app's, and the
 *   refusal says why rather than failing to load;
 * - the current database is **copied aside first** — a restore is exactly when
 *   someone discovers they picked the wrong archive;
 * - any stale `-wal`/`-shm` beside the database is deleted. Missing that step
 *   is what actually causes damage (`data-at-rest-2026-08.md` §5.6).
 */

export class RestoreError extends Error {
  constructor(
    message: string,
    readonly code:
      'not_an_archive' | 'passphrase_required' | 'passphrase_wrong' | 'schema_too_new' | 'corrupt_archive',
  ) {
    super(message);
    this.name = 'RestoreError';
  }
}

export interface ArchiveContents {
  readonly manifest: BackupManifest;
  readonly db: Uint8Array;
  readonly encrypted: boolean;
}

/**
 * Open an archive far enough to see what it is.
 *
 * An encrypted archive is one zip holding another: the outer one carries
 * `RESTORE.txt` and `encryption.json` in the clear, and everything else lives
 * inside the encrypted blob.
 */
export function readArchive(archivePath: string, passphrase?: string): ArchiveContents {
  let outer: Record<string, Uint8Array>;
  try {
    outer = unzipSync(readFileSync(archivePath));
  } catch (error) {
    throw new RestoreError(
      `${archivePath} is not a readable zip file (${describe(error)})`,
      'not_an_archive',
    );
  }

  const payload = outer[ENCRYPTED_PAYLOAD_NAME];
  if (payload !== undefined) {
    if (passphrase === undefined || passphrase === '') {
      throw new RestoreError('this backup is encrypted; enter its passphrase', 'passphrase_required');
    }
    const metaRaw = outer[ENCRYPTION_META_FILENAME];
    if (metaRaw === undefined) {
      throw new RestoreError(
        `the backup is encrypted but ${ENCRYPTION_META_FILENAME} is missing, so it cannot be opened`,
        'corrupt_archive',
      );
    }
    const meta = EncryptionMetaSchema.parse(JSON.parse(strFromU8(metaRaw)));
    let inner: Record<string, Uint8Array>;
    try {
      inner = unzipSync(decryptPayload(Buffer.from(payload), meta, passphrase));
    } catch {
      // GCM's tag check fails identically for a wrong passphrase and a damaged
      // file, and telling someone their passphrase is wrong when the file is
      // damaged sends them looking in the wrong place — so say both.
      throw new RestoreError(
        'could not open this backup: either the passphrase is wrong or the file is damaged',
        'passphrase_wrong',
      );
    }
    return { ...extract(inner), encrypted: true };
  }

  return { ...extract(outer), encrypted: false };
}

function extract(entries: Record<string, Uint8Array>): { manifest: BackupManifest; db: Uint8Array } {
  const manifestRaw = entries[MANIFEST_FILENAME];
  const db = entries[DB_ENTRY_NAME];
  if (manifestRaw === undefined || db === undefined) {
    throw new RestoreError(
      `this zip is missing ${MANIFEST_FILENAME} or ${DB_ENTRY_NAME}, so it is not an Apunta backup`,
      'not_an_archive',
    );
  }
  const manifest = BackupManifestSchema.parse(JSON.parse(strFromU8(manifestRaw)));
  if (sha256(Buffer.from(db)) !== manifest.db_sha256) {
    throw new RestoreError(
      'the database inside this backup does not match the fingerprint recorded when it was made',
      'corrupt_archive',
    );
  }
  return { manifest, db };
}

export interface StageRestoreOptions {
  readonly archivePath: string;
  readonly dataDir: string;
  /** The running app's migration level. An archive above it is refused. */
  readonly maxMigrationLevel: number;
  readonly passphrase?: string | undefined;
  readonly now?: Date | undefined;
}

export interface StagedRestore {
  readonly manifest: BackupManifest;
  /** Where the current database will be moved when the restore is applied. */
  readonly safetyCopy: string;
}

export function stageRestore(options: StageRestoreOptions): StagedRestore {
  const { manifest, db } = readArchive(options.archivePath, options.passphrase);

  if (manifest.migration_level > options.maxMigrationLevel) {
    throw new RestoreError(
      `this backup was made by a newer version of Apunta (storage version ` +
        `${String(manifest.migration_level)}, this copy understands ` +
        `${String(options.maxMigrationLevel)}). Update Apunta first — restoring it here would ` +
        `lose whatever the newer version added.`,
      'schema_too_new',
    );
  }

  const pendingDir = join(options.dataDir, PENDING_RESTORE_DIRNAME);
  rmSync(pendingDir, { recursive: true, force: true });
  mkdirSync(pendingDir, { recursive: true, mode: 0o700 });

  const pendingDb = join(pendingDir, DB_ENTRY_NAME);
  writeFileSync(pendingDb, db, { mode: 0o600 });

  // Checked here rather than at boot: a bad archive should be refused while
  // she is looking at the screen, not silently at the next start.
  const integrity = integrityCheck(pendingDb);
  if (integrity !== 'ok') {
    rmSync(pendingDir, { recursive: true, force: true });
    throw new RestoreError(
      `the database inside this backup does not open cleanly (${integrity}); nothing was changed`,
      'corrupt_archive',
    );
  }

  const safetyCopy = safetyCopyPath(options.dataDir, options.now ?? new Date());
  writeFileSync(
    join(pendingDir, MANIFEST_FILENAME),
    JSON.stringify({ ...manifest, safety_copy: safetyCopy, archive: options.archivePath }, null, 2),
    { mode: 0o600 },
  );

  return { manifest, safetyCopy };
}

export interface AppliedRestore {
  readonly applied: boolean;
  readonly safetyCopy?: string;
  readonly removedSidecars?: string[];
}

/**
 * Called at boot, **before** the database is opened.
 *
 * Order matters: the current file moves aside first, then its `-wal`/`-shm`
 * are deleted, and only then does the restored file take the name. If the
 * process dies between any two of those steps the next start finds either the
 * old database intact or the pending one still waiting, never a restored
 * database wearing an old write-ahead log.
 */
export function applyPendingRestore(dataDir: string): AppliedRestore {
  const pendingDir = join(dataDir, PENDING_RESTORE_DIRNAME);
  const pendingDb = join(pendingDir, DB_ENTRY_NAME);
  if (!existsSync(pendingDb)) return { applied: false };

  const live = join(dataDir, DB_ENTRY_NAME);
  const safetyCopy = readSafetyCopyPath(pendingDir) ?? safetyCopyPath(dataDir, new Date());

  if (existsSync(live)) renameSync(live, safetyCopy);

  const removedSidecars: string[] = [];
  for (const suffix of ['-wal', '-shm']) {
    const sidecar = `${live}${suffix}`;
    if (existsSync(sidecar)) {
      // Not moved with the database: a write-ahead log belongs to the file it
      // was written for, and beside a restored one it is the exact thing that
      // breaks a hand restore.
      rmSync(sidecar, { force: true });
      removedSidecars.push(sidecar);
    }
  }

  renameSync(pendingDb, live);
  rmSync(pendingDir, { recursive: true, force: true });
  return { applied: true, safetyCopy, removedSidecars };
}

/**
 * Put the pre-restore database back after the restored file cannot be opened.
 * Sidecars are removed first because they belong to the failed file, not the
 * safety copy. The safety copy is retained if rollback itself fails.
 */
export function rollbackAppliedRestore(dataDir: string, safetyCopy: string): void {
  const live = join(dataDir, DB_ENTRY_NAME);
  for (const suffix of ['-wal', '-shm']) rmSync(`${live}${suffix}`, { force: true });
  if (existsSync(live)) rmSync(live, { force: true });
  if (existsSync(safetyCopy)) renameSync(safetyCopy, live);
}

/** True when a restore is waiting for the next start. */
export function hasPendingRestore(dataDir: string): boolean {
  return existsSync(join(dataDir, PENDING_RESTORE_DIRNAME, DB_ENTRY_NAME));
}

export function cancelPendingRestore(dataDir: string): void {
  rmSync(join(dataDir, PENDING_RESTORE_DIRNAME), { recursive: true, force: true });
}

function safetyCopyPath(dataDir: string, now: Date): string {
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  return join(dataDir, `${DB_ENTRY_NAME}.before-restore-${stamp}`);
}

function readSafetyCopyPath(pendingDir: string): string | null {
  try {
    const parsed = JSON.parse(readFileSync(join(pendingDir, MANIFEST_FILENAME), 'utf8')) as {
      safety_copy?: unknown;
    };
    return typeof parsed.safety_copy === 'string' ? parsed.safety_copy : null;
  } catch {
    return null;
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  BACKUP_DIRNAME,
  DATA_JSON_FILENAME,
  DB_ENTRY_NAME,
  ENCRYPTED_PAYLOAD_NAME,
  ENCRYPTION_META_FILENAME,
  MANIFEST_FILENAME,
  RESTORE_FILENAME,
  backupFilename,
  type BackupManifest,
} from '@apunta/shared';
import BetterSqlite3, { type Database } from 'better-sqlite3';
import { strToU8, zip, zipSync } from 'fflate';

import { migrationLevel } from '../db/index.js';
import { encryptPayload, sha256 } from './crypto.js';
import { dumpDatabase, tableCounts } from './dump.js';
import { noteEntries, planEntries } from './readable.js';
import { renderRestoreText } from './restore-txt.js';

/**
 * Making one archive.
 *
 * The rule that shapes this file: **never run a bare `VACUUM`**. A bare vacuum
 * writes a complete second copy of every clinical note into `TMPDIR`, and when
 * `TMPDIR` is unset — a LaunchAgent, a packaged app shell — the chain falls
 * through to `/var/tmp` or `/tmp`, which are world-traversable
 * (`docs/research/data-at-rest-2026-08.md` §2.3). `VACUUM INTO` names its own
 * destination, so the copy lands where we put it and nowhere else, and it is
 * transactional against a live writer, so no checkpoint dance is needed.
 *
 * Then it is verified before it is called a backup: `PRAGMA integrity_check`
 * runs on the copy, and its result and SHA-256 go into the manifest. A backup
 * nobody validated is a rumour (§5.2).
 */

export class BackupError extends Error {
  constructor(
    message: string,
    readonly code: 'integrity_failed' | 'destination_unwritable' | 'vacuum_failed',
  ) {
    super(message);
    this.name = 'BackupError';
  }
}

export interface CreateBackupOptions {
  readonly db: Database;
  /** Where the live database lives; the staging copy is made inside it. */
  readonly dataDir: string;
  /** Destination folder. Created if missing. */
  readonly directory: string;
  readonly appVersion: string;
  /** Set to encrypt the archive body. */
  readonly passphrase?: string | undefined;
  readonly now?: Date | undefined;
}

export interface CreatedBackup {
  readonly path: string;
  readonly filename: string;
  readonly bytes: number;
  readonly manifest: BackupManifest;
}

interface PreparedBackup {
  readonly now: Date;
  readonly staging: string;
  readonly manifest: BackupManifest;
  readonly restoreText: string;
  readonly body: Record<string, Uint8Array>;
}

interface BackupPreparation {
  readonly now: Date;
  readonly staging: string;
  readonly copyPath: string;
}

function beginBackup(options: CreateBackupOptions): BackupPreparation {
  const now = options.now ?? new Date();
  const staging = join(options.dataDir, BACKUP_DIRNAME, '.staging');
  mkdirSync(staging, { recursive: true, mode: 0o700 });
  try {
    try {
      mkdirSync(options.directory, { recursive: true });
    } catch (error) {
      throw new BackupError(
        `cannot create the backup folder ${options.directory}: ${describe(error)}`,
        'destination_unwritable',
      );
    }
    return {
      now,
      staging,
      copyPath: join(staging, `${DB_ENTRY_NAME}.${String(now.getTime())}`),
    };
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

function finishPreparation(options: CreateBackupOptions, preparation: BackupPreparation): PreparedBackup {
  const { now, staging, copyPath } = preparation;
  const dbBytes = readFileSync(copyPath);
  const integrity = integrityCheck(copyPath);
  if (integrity !== 'ok') {
    throw new BackupError(
      `the database copy failed its integrity check (${integrity}); no backup was written`,
      'integrity_failed',
    );
  }

  const level = migrationLevel(options.db);
  const manifest: BackupManifest = {
    format: 1,
    app_version: options.appVersion,
    generated_at: now.toISOString(),
    migration_level: level,
    sqlite_version: sqliteVersion(options.db),
    db_bytes: dbBytes.byteLength,
    db_sha256: sha256(dbBytes),
    integrity_check: integrity,
    counts: tableCounts(options.db),
    encrypted: options.passphrase !== undefined,
  };

  const plans = planEntries(options.db);
  const restoreText = renderRestoreText({
    manifest,
    dataDir: options.dataDir,
    encrypted: manifest.encrypted,
    // Described only when it is there. A file that promises a folder the zip
    // does not contain is a file nobody trusts the rest of.
    hasPlans: plans.length > 0,
  });

  const body: Record<string, Uint8Array> = {
    [DB_ENTRY_NAME]: dbBytes,
    [DATA_JSON_FILENAME]: strToU8(JSON.stringify(dumpDatabase(options.db, level, now), null, 2)),
    [MANIFEST_FILENAME]: strToU8(JSON.stringify(manifest, null, 2)),
  };
  for (const entry of [...noteEntries(options.db), ...plans]) {
    body[entry.path] = strToU8(entry.text);
  }

  return { now, staging, manifest, restoreText, body };
}

function prepareBackup(options: CreateBackupOptions): PreparedBackup {
  const preparation = beginBackup(options);
  try {
    // Inside the data dir on purpose: this is the second plaintext copy, and
    // it must never be somewhere nothing in this project manages.
    vacuumInto(options.db, preparation.copyPath);
    return finishPreparation(options, preparation);
  } catch (error) {
    rmSync(preparation.staging, { recursive: true, force: true });
    throw error;
  }
}

async function prepareBackupAsync(options: CreateBackupOptions): Promise<PreparedBackup> {
  const preparation = beginBackup(options);
  try {
    // better-sqlite3's online backup yields between page batches, unlike
    // VACUUM INTO, so a large live database does not monopolize this thread.
    await backupInto(options.db, preparation.copyPath);
    return finishPreparation(options, preparation);
  } catch (error) {
    rmSync(preparation.staging, { recursive: true, force: true });
    throw error;
  }
}

function finishBackupSync(
  options: CreateBackupOptions,
  prepared: PreparedBackup,
  archive: Record<string, Uint8Array>,
): CreatedBackup {
  const { path, filename } = uniqueDestination(options.directory, prepared.now);
  // Written to a `.part` first: a half-written zip that is named like a
  // finished one is exactly the backup that looks fine until it is needed.
  const partial = `${path}.part`;
  writeFileSync(partial, zipSync(archive, { level: 6 }), { mode: 0o600 });
  renameSync(partial, path);

  return { path, filename, bytes: statSync(path).size, manifest: prepared.manifest };
}

async function finishBackupAsync(
  options: CreateBackupOptions,
  prepared: PreparedBackup,
  archive: Record<string, Uint8Array>,
): Promise<CreatedBackup> {
  const { path, filename } = uniqueDestination(options.directory, prepared.now);
  const partial = `${path}.part`;
  await writeFile(partial, await zipArchiveAsync(archive), { mode: 0o600 });
  await rename(partial, path);
  return { path, filename, bytes: (await stat(path)).size, manifest: prepared.manifest };
}

export function createBackup(options: CreateBackupOptions): CreatedBackup {
  const prepared = prepareBackup(options);
  try {
    const archive =
      options.passphrase === undefined
        ? { ...prepared.body, [RESTORE_FILENAME]: strToU8(prepared.restoreText) }
        : encryptedArchive(prepared.body, prepared.restoreText, options.passphrase);
    return finishBackupSync(options, prepared, archive);
  } finally {
    rmSync(prepared.staging, { recursive: true, force: true });
  }
}

/**
 * Async counterpart used by HTTP and startup backups. SQLite's online backup
 * yields between page batches, and fflate's large-file compression runs in its
 * worker-thread implementation, so the request loop remains available while
 * the archive is being produced.
 */
export async function createBackupAsync(options: CreateBackupOptions): Promise<CreatedBackup> {
  const prepared = await prepareBackupAsync(options);
  try {
    const archive =
      options.passphrase === undefined
        ? { ...prepared.body, [RESTORE_FILENAME]: strToU8(prepared.restoreText) }
        : await encryptedArchiveAsync(prepared.body, prepared.restoreText, options.passphrase);
    return await finishBackupAsync(options, prepared, archive);
  } finally {
    rmSync(prepared.staging, { recursive: true, force: true });
  }
}

function zipArchiveAsync(data: Record<string, Uint8Array>): Promise<Uint8Array> {
  const { promise, resolve, reject } = (
    Promise as PromiseConstructor & {
      withResolvers<T>(): {
        promise: Promise<T>;
        resolve: (value: T) => void;
        reject: (reason?: unknown) => void;
      };
    }
  ).withResolvers<Uint8Array>();
  zip(data, { level: 6 }, (error, archive) => {
    if (error !== null) {
      reject(error);
    } else {
      resolve(archive);
    }
  });
  return promise;
}

/**
 * Everything except `RESTORE.txt` goes inside one encrypted blob.
 *
 * `RESTORE.txt` is deliberately left readable on the outside, and it carries
 * the standalone decryption script — instructions locked inside the thing you
 * cannot open are not instructions (`data-at-rest-2026-08.md` §5.5).
 */
function encryptedArchive(
  body: Record<string, Uint8Array>,
  restoreText: string,
  passphrase: string,
): Record<string, Uint8Array> {
  const inner = Buffer.from(zipSync(body, { level: 6 }));
  const { ciphertext, meta } = encryptPayload(inner, passphrase);
  return {
    [RESTORE_FILENAME]: strToU8(restoreText),
    [ENCRYPTION_META_FILENAME]: strToU8(JSON.stringify(meta, null, 2)),
    [ENCRYPTED_PAYLOAD_NAME]: new Uint8Array(ciphertext),
  };
}

/** `VACUUM INTO`, never bare `VACUUM`. See the note at the top of this file. */
export function vacuumInto(db: Database, destination: string): void {
  try {
    db.prepare('VACUUM INTO ?').run(destination);
  } catch (error) {
    throw new BackupError(`VACUUM INTO failed: ${describe(error)}`, 'vacuum_failed');
  }
}

export async function backupInto(db: Database, destination: string): Promise<void> {
  try {
    await db.backup(destination);
  } catch (error) {
    throw new BackupError(`online backup failed: ${describe(error)}`, 'vacuum_failed');
  }
}

async function encryptedArchiveAsync(
  body: Record<string, Uint8Array>,
  restoreText: string,
  passphrase: string,
): Promise<Record<string, Uint8Array>> {
  const inner = Buffer.from(await zipArchiveAsync(body));
  const { ciphertext, meta } = encryptPayload(inner, passphrase);
  return {
    [RESTORE_FILENAME]: strToU8(restoreText),
    [ENCRYPTION_META_FILENAME]: strToU8(JSON.stringify(meta, null, 2)),
    [ENCRYPTED_PAYLOAD_NAME]: new Uint8Array(ciphertext),
  };
}
/** Opened read-only, so checking a copy can never modify it. */
export function integrityCheck(file: string): string {
  const copy = new BetterSqlite3(file, { readonly: true });
  try {
    const rows = copy.pragma('integrity_check') as { integrity_check: string }[];
    return rows.map((row) => row.integrity_check).join('; ');
  } finally {
    copy.close();
  }
}

function sqliteVersion(db: Database): string {
  const row = db.prepare('SELECT sqlite_version() AS version').get() as { version: string };
  return row.version;
}

/**
 * The day's first archive is `apunta-backup-YYYY-MM-DD.zip`; a second run the
 * same day gets `-2`, and so on. Never overwrite — a backup that silently
 * replaced this morning's is one backup, not two.
 */
function uniqueDestination(directory: string, now: Date): { path: string; filename: string } {
  for (let sequence = 1; sequence < 1000; sequence += 1) {
    const filename = backupFilename(now, sequence);
    const path = join(directory, filename);
    try {
      statSync(path);
    } catch {
      return { path, filename };
    }
  }
  throw new BackupError(`too many backups already written to ${directory} today`, 'destination_unwritable');
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

import { createHash } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

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
import BetterSqlite3 from 'better-sqlite3';
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
 * - its `-wal`/`-shm` never end up beside the restored file — a write-ahead
 *   log belonging to a different database is what actually causes damage
 *   (`data-at-rest-2026-08.md` §5.6) — and they are folded into that copy
 *   first whenever they can be, because after an unclean exit the rows the
 *   owner most needs back are in the log and nowhere else.
 */

/** The two files SQLite keeps beside a WAL database, in the order they are dealt with. */
const SIDECAR_SUFFIXES = ['-wal', '-shm'] as const;

/** Between `apunta.db` and the stamp: what marks a record a rollback left. */
const MOVED_HOME_INFIX = '.moved-home-';

/** Between `apunta.db` and the random part: where a replay rehearsal is run. */
const SCRATCH_INFIX = '.replay-probe-';

/** The whole prefix of a rollback's provenance record, before its stamp. */
const MOVED_HOME_PREFIX = `${DB_ENTRY_NAME}${MOVED_HOME_INFIX}`;

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
  /** Sidecars that were beside the live database and are beside it no more. */
  readonly removedSidecars?: string[];
  /**
   * What an interrupted rollback left under a name nothing opens, put back by
   * this boot: how many databases, how many log files. Counts and nothing
   * else — a path here would name a practice's files in a log line.
   */
  readonly recoveredAfterCrash?: {
    readonly databases: number;
    readonly sidecars: number;
    /**
     * Entries under a pre-restore name — logs, and the indexes beside them —
     * that this boot found and deliberately left where they were, because
     * nothing could prove they belong to the database now called `apunta.db`.
     * They are whole, and they are still the only place those rows exist, so
     * this count is the one to read.
     */
    readonly unattachedLogs?: number;
  };
}

/**
 * The points in the apply and rollback sequences where a crash can be modelled,
 * named because the promise this module makes is that none of them loses a
 * committed row — a promise only a test that crashes at each of them can keep.
 * Never passed in production; it exists so the crash windows are reachable.
 */
export type RestoreStep =
  | 'interrupted-rollback-reconciled'
  | 'held-sidecars-restored'
  | 'wal-holds-copied'
  | 'wal-folded'
  | 'sidecars-settled'
  | 'live-database-moved-aside'
  | 'restored-database-in-place'
  | 'pending-folder-cleared'
  | 'live-sidecars-removed'
  | 'live-database-removed'
  | 'safety-copy-moved-back'
  | 'safety-sidecars-moved-back';

/**
 * Called at boot, **before** the database is opened. `crashAt` throws the step
 * it is given, and exists only so a test can lose the process at one.
 *
 * Order matters: the write-ahead log is dealt with first — folded into the
 * current file when that can be done, carried across to the safety copy when
 * it cannot — then the current file moves aside, and only then does the
 * restored file take the name. If the process dies between any two of those
 * steps the next start finds either the old database whole (its rows either
 * inside it or beside it in its log) or the pending one still waiting, never a
 * restored database wearing an old write-ahead log, and never a safety copy
 * missing the rows an unclean exit left only in the log.
 *
 * `nativeBinding` is where `better_sqlite3.node` is when npm did not put it
 * where the module looks (M8): the fold has to use the same binding the app
 * will open the database with, so a packaged app folds too.
 */
export function applyPendingRestore(
  dataDir: string,
  nativeBinding?: string | undefined,
  crashAt?: ((step: RestoreStep) => void) | undefined,
): AppliedRestore {
  const pendingDir = join(dataDir, PENDING_RESTORE_DIRNAME);
  const pendingDb = join(pendingDir, DB_ENTRY_NAME);
  const live = join(dataDir, DB_ENTRY_NAME);

  // Housekeeping first, and it runs whether or not a restore is waiting: a
  // rollback that was cut short leaves the practice's rows under a name
  // nothing opens, and this boot or no boot is what puts them back.
  const recovered = reconcileInterruptedRollback(dataDir, live, nativeBinding);
  crashAt?.('interrupted-rollback-reconciled');

  if (!existsSync(pendingDb)) {
    clearSettledPendingDir(dataDir, pendingDir);
    return withRecovery({ applied: false }, recovered);
  }

  const safetyCopy = unusedSafetyCopyPath(dataDir, readSafetyCopyPath(pendingDir, dataDir), new Date());

  // While the file is still where it was: after an unclean exit the rows the
  // owner most needs back are in the log and nowhere else, and the copy below
  // is only half the database until they are written back into it.
  const walFolded = foldLiveWal(live, pendingDir, nativeBinding, crashAt);
  crashAt?.('wal-folded');

  const removedSidecars: string[] = [];
  for (const suffix of SIDECAR_SUFFIXES) {
    const sidecar = `${live}${suffix}`;
    const carried = `${safetyCopy}${suffix}`;
    if (walFolded) {
      // Folded or not, an empty husk is never kept: the rows are in the file.
      if (existsSync(sidecar)) removedSidecars.push(sidecar);
      rmSync(sidecar, { force: true });
      continue;
    }
    if (!existsSync(sidecar)) {
      // The fold attempt took this one with it and could not put it back. The
      // hold is byte for byte what it was and belongs to this very database,
      // so the safety copy is the last place it can still be recovered from.
      const hold = holdPath(pendingDir, suffix);
      if (logIsBlank(hold)) continue;
      copyFileSync(hold, carried);
      removedSidecars.push(sidecar);
      continue;
    }
    // Not moved with the database: a write-ahead log belongs to the file it
    // was written for, and beside a restored one it is the exact thing that
    // breaks a hand restore. Beside the safety copy it is the opposite —
    // SQLite derives a log's name from the database's, so there it replays
    // into that copy on the first open.
    renameSync(sidecar, carried);
    removedSidecars.push(sidecar);
  }
  crashAt?.('sidecars-settled');

  // Absent on a resumed apply: a previous boot already moved it aside.
  if (existsSync(live)) renameSync(live, safetyCopy);
  crashAt?.('live-database-moved-aside');

  renameSync(pendingDb, live);
  crashAt?.('restored-database-in-place');

  clearSettledPendingDir(dataDir, pendingDir);
  crashAt?.('pending-folder-cleared');

  return withRecovery({ applied: true, safetyCopy, removedSidecars }, recovered);
}

/** The recovery counts are only carried when there is something to report, so a boot that found nothing to fix returns exactly `{ applied: false }`. */
function withRecovery(result: AppliedRestore, recovered: Recovery): AppliedRestore {
  if (recovered.databases === 0 && recovered.sidecars === 0 && recovered.unattached === 0) return result;
  return {
    ...result,
    recoveredAfterCrash: {
      databases: recovered.databases,
      sidecars: recovered.sidecars,
      // Left out rather than reported as zero: what was deliberately *not*
      // attached is the part of this a log line has to carry, and a count that
      // is there only to be zero is a line of noise in every other case.
      ...(recovered.unattached > 0 ? { unattachedLogs: recovered.unattached } : {}),
    },
  };
}

/**
 * Fold `live`'s write-ahead log into `live` itself, so the safety copy of it
 * is the whole database rather than its first half.
 *
 * True means the log's contents are in the database file and any sidecar
 * still beside it is an empty husk the caller may delete. False means they
 * are not — the checkpoint could not run or did not finish — and in that case
 * the log is left exactly as it was, ready to travel with the safety copy.
 *
 * The copy held in `holdDir` is what makes "left exactly as it was" true
 * rather than hopeful: SQLite unlinks the `-wal`/`-shm` files when a
 * connection that touched them closes, *including* when the statement failed,
 * which a probe of this very code showed a non-database file does
 * (`file is not a database`, sidecars gone by the time the handle closed). A
 * log destroyed by a failed attempt is the same loss as one deleted on
 * purpose, so it is copied before SQLite is allowed near it and put back
 * afterwards whenever the fold did not happen. `holdDir` is the pending
 * restore folder, which `applyPendingRestore` removes once it has applied —
 * but only once those holds are accounted for.
 *
 * The hold is put back **before any early return**, which is the whole of a
 * second-attempt bug: a process that died between taking the hold and putting
 * it back left a database with no log and the only copy of the log in the
 * pending folder. Read as "no log to fold", that boot renamed the database
 * aside as complete and deleted the folder with the log in it. A boot that
 * finds a hold and a missing or empty sidecar is therefore not a boot with
 * nothing to do — it is a boot with one job before its own.
 *
 * Safe to run: the data-folder lock is already held, so nothing else is
 * writing to this database.
 */
function foldLiveWal(
  live: string,
  holdDir: string,
  nativeBinding: string | undefined,
  crashAt?: ((step: RestoreStep) => void) | undefined,
): boolean {
  restoreHeldSidecars(live, holdDir);
  crashAt?.('held-sidecars-restored');

  const wal = `${live}-wal`;
  if (logIsBlank(wal)) return true;
  // A log with no database to belong to recovers nothing: there is no file to
  // fold it into and no engine that will read it alone. Nothing may call this
  // a fold, so no sidecar is deleted on the strength of it.
  if (!existsSync(live)) return false;

  const held: { readonly sidecar: string; readonly hold: string }[] = [];
  try {
    for (const suffix of SIDECAR_SUFFIXES) {
      const sidecar = `${live}${suffix}`;
      if (!existsSync(sidecar)) continue;
      const hold = holdPath(holdDir, suffix);
      copyFileSync(sidecar, hold);
      // 600 like the staged database, not the 644 `copyFileSync` leaves
      // behind: the hold is a practice's log in a folder, and the folder is
      // the only thing that has ever protected it.
      chmodSync(hold, 0o600);
      held.push({ sidecar, hold });
    }
  } catch {
    // The log could not be protected, so nothing may be done to it: the
    // caller carries it as it stands.
    return false;
  }
  crashAt?.('wal-holds-copied');

  let completed = false;
  try {
    const handle =
      nativeBinding === undefined ? new BetterSqlite3(live) : new BetterSqlite3(live, { nativeBinding });
    try {
      const rows = handle.pragma('wal_checkpoint(TRUNCATE)') as { busy: number }[];
      // `busy` is the whole answer: 1 means another connection held the log
      // and not all of it was written back, whatever the other columns say.
      completed = rows.length === 1 && rows[0]?.busy === 0;
    } finally {
      handle.close();
    }
  } catch {
    // Not a database this build can open, or a binding that is not there.
    // `completed` stays false; if the handle's close is what threw, the
    // log-blank check below still has the final word.
  }

  // Both halves, and the second is the one that matters: a fold is only a
  // fold when nothing is left in the log. The holds have nothing left to
  // protect, so they go: a fold this boot repeats must not mistake them for
  // the log of the next attempt.
  if (completed && logIsBlank(wal)) {
    for (const { hold } of held) rmSync(hold, { force: true });
    return true;
  }

  // It did not happen. Put back whatever the attempt destroyed, so the log
  // the caller moves to the safety copy is the one that was there.
  restoreHeldSidecars(live, holdDir, held);
  return false;
}

/**
 * Put back every hold in `holdDir` whose sidecar beside `live` is missing or
 * empty — a fold attempt that died, or one whose put-back failed. A hold whose
 * sidecar is still whole is left alone: the sidecar is the log, and copying
 * over it would replace a newer log with the held one.
 *
 * A put-back that throws is swallowed on purpose. The hold is still on disk,
 * which is the only thing that matters here: the caller carries the log beside
 * the safety copy from the hold if it has to, and the pending folder is not
 * deleted while a hold it cannot account for is in it. Throwing here instead
 * would abort the boot with the practice's rows in a place nothing opens.
 */
function restoreHeldSidecars(
  live: string,
  holdDir: string,
  only?: readonly { readonly sidecar: string; readonly hold: string }[],
): void {
  const candidates =
    only ??
    SIDECAR_SUFFIXES.map((suffix) => ({ sidecar: `${live}${suffix}`, hold: holdPath(holdDir, suffix) }));
  for (const { sidecar, hold } of candidates) {
    if (!existsSync(hold)) continue;
    if (!logIsBlank(sidecar)) continue;
    try {
      copyFileSync(hold, sidecar);
      chmodSync(sidecar, 0o600);
    } catch {
      // Carried on by the caller, which knows the safety copy's name.
    }
  }
}

/** `pending-restore/apunta.db-wal.held`: this suffix's hold, named after the database it belongs to rather than the copy it was taken for. */
function holdPath(holdDir: string, suffix: string): string {
  return join(holdDir, `${DB_ENTRY_NAME}${suffix}.held`);
}

/** True when there is no log, or a log with nothing in it. */
function logIsBlank(path: string): boolean {
  if (!existsSync(path)) return true;
  try {
    return statSync(path).size === 0;
  } catch {
    // Vanished under us, or unreadable: treat what is left as worth keeping.
    return false;
  }
}

/**
 * Put the pre-restore database back after the restored file cannot be opened.
 * Sidecars are removed first because they belong to the failed file, not the
 * safety copy — and any sidecars the safety copy travelled with are moved back
 * with it, after it, so a rollback restores the log's rows too and never
 * leaves an old log beside the restored file. The safety copy is retained if
 * rollback itself fails.
 *
 * This is several steps, so it is several ways to be interrupted, and the next
 * boot finishes it: `reconcileInterruptedRollback` puts back both a log whose
 * database has already been moved home and a database the rollback had not yet
 * moved home. `crashAt` throws the step it is given, and exists only so the
 * test can lose the process at each one.
 */
export function rollbackAppliedRestore(
  dataDir: string,
  safetyCopy: string,
  crashAt?: ((step: RestoreStep) => void) | undefined,
): void {
  const live = join(dataDir, DB_ENTRY_NAME);
  for (const suffix of SIDECAR_SUFFIXES) rmSync(`${live}${suffix}`, { force: true });
  crashAt?.('live-sidecars-removed');
  if (existsSync(live)) rmSync(live, { force: true });
  crashAt?.('live-database-removed');
  if (existsSync(safetyCopy)) {
    // Before the copy goes home, record that this rollback is the reason a
    // start may now find `apunta.db` with a log still named after the copy.
    // The next start's only way to know that such a log belongs to the file in
    // front of it is this record — SQLite itself keeps no tie between a
    // database and a log (see `logBelongsToLiveDatabase`) — so it is written
    // first, and a crash between here and the rename leaves it describing a
    // copy that is still here, which nothing acts on.
    writeMovedHomeRecord(dataDir, safetyCopy);
    renameSync(safetyCopy, live);
  }
  crashAt?.('safety-copy-moved-back');
  for (const suffix of SIDECAR_SUFFIXES) {
    const sidecar = `${safetyCopy}${suffix}`;
    // `renameSync` replaces a file of the same name on POSIX, so a live log
    // that somehow survived is kept and the stranded one is left in place for
    // the reconcile rather than silently overwritten.
    if (existsSync(sidecar) && !existsSync(`${live}${suffix}`)) renameSync(sidecar, `${live}${suffix}`);
  }
  crashAt?.('safety-sidecars-moved-back');
  // The rollback is whole: every log is home, so nothing is left for the
  // record to vouch for. Best-effort, because a record that outlives its
  // rollback vouches for nothing — no log carries its stamp any more.
  rmSync(movedHomeRecordPath(dataDir, safetyCopy), { force: true });
}

/**
 * Finish a rollback that was cut short, and count what it took.
 *
 * A rollback is the one place in this module with more than one step that
 * cannot be undone together, so it is the one place a crash can leave a
 * practice's records in a file nothing opens. Both halves are named by this
 * module's own naming scheme, and neither can be reached by accident: only a
 * rollback ever puts a file at `apunta.db.before-restore-<stamp>`, and only a
 * rollback ever takes one away while its log stays.
 *
 * Every repair here is best effort and every one of them can be wrong about
 * what it is looking at, so nothing here throws: a data folder that needs no
 * repair must still boot, and a folder that needs one and cannot get it must
 * boot too, with a count of what was left behind.
 */
interface Recovery {
  readonly databases: number;
  readonly sidecars: number;
  /** Pre-restore entries found and deliberately not moved. See `AppliedRestore`. */
  readonly unattached: number;
}

function reconcileInterruptedRollback(
  dataDir: string,
  live: string,
  nativeBinding: string | undefined,
): Recovery {
  // A rehearsal killed between the copy and the cleanup leaves a full copy of
  // the practice's database and its log under the scratch name, and nothing
  // else will ever open it. This boot takes it away before anything looks at
  // the folder. Wrapped, because a folder that cannot be removed is garbage
  // left for the next boot, never a reason to fail one.
  try {
    rmSync(join(dataDir, `${DB_ENTRY_NAME}${SCRATCH_INFIX}`), { recursive: true, force: true });
  } catch {
    // Left behind; it is garbage either way.
  }

  const { copies, logs } = preRestoreEntries(dataDir);
  let databases = 0;
  let sidecars = 0;
  let unattached = 0;

  // A log whose database is gone. The rollback moved the database home and
  // died before the log, which is the window the safety copy's own name
  // identifies exactly: the base file it was written for is not there.
  for (const log of logs) {
    if (!existsSync(live)) break;
    if (existsSync(`${live}${log.suffix}`)) continue;
    // A name that matches is not a tie. This log's database is gone, and
    // `apunta.db` is here — but the two are only the same file if the rollback
    // that moved it home is the one that left this log, which the copy's name
    // does not say: the owner deleting an old safety copy leaves exactly the
    // same pair of files on disk as an interrupted rollback does, and the
    // difference is that one database's log would be replayed into another's
    // tables. So the tie is proven before anything is moved, and a log that
    // cannot be proven is left exactly where it is.
    if (!logBelongsToLiveDatabase(dataDir, live, log, nativeBinding)) {
      unattached += 1;
      continue;
    }
    if (!tryRename(log.path, `${live}${log.suffix}`)) {
      unattached += 1;
      continue;
    }
    sidecars += 1;
  }

  // No live database at all, and a pre-restore copy here: the rollback removed
  // the restored file and died before the copy went back. Newest stamp first,
  // because that is the one the interrupted restore was about.
  if (!existsSync(live) && copies.length > 0) {
    const copy = join(dataDir, copies.toSorted().at(-1) ?? '');
    // The log first, while there is still no `apunta.db` for it to be
    // mistaken for: this is the one moment where writing `apunta.db-wal`
    // cannot put a log beside a database that is not its own. A crash between
    // the two moves repeats itself harmlessly — the copy is still here, and
    // the log is already where the next boot looks for it.
    for (const suffix of SIDECAR_SUFFIXES) {
      const sidecar = `${copy}${suffix}`;
      if (!existsSync(sidecar)) continue;
      if (tryRename(sidecar, `${live}${suffix}`)) sidecars += 1;
      else unattached += 1;
    }
    if (tryRename(copy, live)) databases += 1;
    else unattached += 1;
  }

  // A rollback's record has said what it had to say once the entries it named
  // are all home, and a record that outlived them would keep vouching for a
  // stamp whose log may be a different database's by the next restore. Every
  // record is swept, not only the stamps a stranded log named: a rollback cut
  // between writing a record and moving the copy home leaves one with no log to
  // point at, and that record would otherwise outlive its rollback forever. A
  // record whose stamp still has a copy or a sidecar stays, so a boot that
  // refused one can still attach it later.
  let records: string[];
  try {
    records = readdirSync(dataDir).filter((name) => name.startsWith(MOVED_HOME_PREFIX));
  } catch {
    records = [];
  }
  for (const name of records) {
    const stamp = name.slice(MOVED_HOME_PREFIX.length);
    const stillHere =
      existsSync(preRestoreEntryPath(dataDir, stamp)) ||
      SIDECAR_SUFFIXES.some((suffix) => existsSync(preRestoreEntryPath(dataDir, stamp, suffix)));
    if (stillHere) continue;
    try {
      rmSync(join(dataDir, name), { force: true });
    } catch {
      // Spent anyway; leaving it costs nothing but a file this boot did not
      // need to touch, and no boot is failed over it.
    }
  }

  return { databases, sidecars, unattached };
}

/**
 * A move that must not be able to fail a boot over a folder that is otherwise
 * fine. Reported rather than thrown, because the caller counts it and the next
 * start tries again.
 */
function tryRename(from: string, to: string): boolean {
  try {
    renameSync(from, to);
    return true;
  } catch {
    return false;
  }
}

/**
 * Prove the log at `log.path` was written for the database now at `live`.
 *
 * SQLite keeps no tie between a database and a write-ahead log that would
 * survive the two being separated, which is research rather than a hunch: a
 * log's header carries its own salts and checkpoint sequence, its frame
 * headers repeat those salts and nothing else that names a file, and the
 * database's own header carries no counter the log refers to. Open a database
 * with any log beside it and SQLite replays that log — which is exactly why the
 * two halves of a restore are kept apart. Nothing in the files can settle it,
 * and a probe of this code confirmed the obvious hope does not settle it
 * either: a log from a different database, laid over the live one, is replayed
 * into it and the result still passes `integrity_check`, even when the replay
 * overwrites the schema page and the database can no longer read its own
 * tables. So neither the salts, nor the page size, nor a clean integrity check
 * can carry this proof, and reading one as if it could is what put another
 * database's rows into this one.
 *
 * What carries it is provenance, plus a rehearsal that is honestly only about
 * damage:
 *
 * 1. `movedHomeIsRecorded` — a rollback wrote a record, immediately before
 *    moving the copy named by this entry home, saying it was that rollback that
 *    put a database here. Nothing else writes that record, and nothing else
 *    moves a copy home, so its presence is the tie. An entry found without one
 *    was not left by a rollback: its database was removed by hand, or by a
 *    build older than this record, and there is nothing left to prove.
 * 2. `logWouldNotDamageLive` — the live file and the log are copied into a
 *    scratch folder inside the data folder and opened there, so that attaching
 *    the log is rehearsed on copies rather than discovered on the real file: the
 *    result has to pass an integrity check *and* the file has to have changed,
 *    which together say the log was replayed into it rather than ignored. It
 *    does not prove the tie — nothing can — but it does refuse a log that would
 *    leave the live database unable to open, which is the one thing attaching a
 *    log can be *shown* to do wrong.
 *
 * Both, or the entry stays where it is. The rehearsal is asked of the log only:
 * the `-shm` beside it is the engine's own index of the log rather than
 * anything with rows in it, and a rollback that moved a copy home moved its
 * pair — so the record answers for it, and it follows or stays with the log it
 * indexes.
 */
function logBelongsToLiveDatabase(
  dataDir: string,
  live: string,
  log: { readonly path: string; readonly suffix: string; readonly stamp: string },
  nativeBinding: string | undefined,
): boolean {
  if (!movedHomeIsRecorded(dataDir, log.stamp)) return false;
  if (log.suffix !== '-wal') return true;
  return logWouldNotDamageLive(dataDir, live, log.path, nativeBinding);
}

/** True when a rollback recorded that it moved this stamp's copy home. */
function movedHomeIsRecorded(dataDir: string, stamp: string): boolean {
  return existsSync(join(dataDir, `${MOVED_HOME_PREFIX}${stamp}`));
}

/**
 * Rehearse attaching `log` to `live`, on copies, and say whether the live
 * database would still open afterwards. This is a check on the damage an
 * attachment does, not on whose log it is — see `logBelongsToLiveDatabase` for
 * why the second question cannot be answered from the files.
 *
 * Never touches `live` or `log` themselves, and never throws: any failure to
 * run the rehearsal is a reason to leave the log alone, not a reason to fail a
 * boot over a folder that is otherwise fine.
 */
function logWouldNotDamageLive(
  dataDir: string,
  live: string,
  log: string,
  nativeBinding: string | undefined,
): boolean {
  // Cheap structural checks first, so the cheapest failures never get as far
  // as making a copy of a practice's database.
  if (walLogIsFor(live, log) !== true) return false;

  const scratch = join(dataDir, `${DB_ENTRY_NAME}${SCRATCH_INFIX}`);
  try {
    // Inside the data folder rather than the system temp: this is a practice's
    // database and its log written out a second time, and the data folder is
    // the only place already ruled to hold them. One fixed name, wiped before
    // and after, so a rehearsal that is killed part way through leaves the
    // next one a clean folder rather than a growing pile of records copies.
    rmSync(scratch, { recursive: true, force: true });
    mkdirSync(scratch, { mode: 0o700 });
    const probe = join(scratch, 'rehearsal.db');
    copyFileSync(live, probe);
    // 600 like every other copy of a practice's file in this module: a
    // rehearsal must not leave a records file world-readable beside the real
    // one it is rehearsing.
    chmodSync(probe, 0o600);
    copyFileSync(log, `${probe}-wal`);
    chmodSync(`${probe}-wal`, 0o600);

    const before = hashFileSync(probe);
    const handle =
      nativeBinding === undefined ? new BetterSqlite3(probe) : new BetterSqlite3(probe, { nativeBinding });
    let integrity: unknown;
    try {
      integrity = handle.pragma('integrity_check', { simple: true });
    } finally {
      handle.close();
    }
    // What the live database would have to live with: a file it cannot open.
    if (integrity !== 'ok') return false;
    // A log SQLite ignored leaves the file byte for byte as it was, and an
    // ignored log would recover nothing, so there is nothing to gain by
    // attaching it. A log that *was* replayed is folded back into the file as
    // the handle closes, so the two differ. Fingerprints rather than whole
    // buffers: this runs at boot over a copy of the practice's database, and
    // holding that file in memory twice is a cost the rehearsal need not pay.
    const after = hashFileSync(probe);
    return before !== null && after !== null && before !== after;
  } catch {
    return false;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** One mebibyte per read: a whole database never has to fit in memory to be fingerprinted. */
const HASH_CHUNK_BYTES = 1024 * 1024;

/**
 * The SHA-256 of a file, read a chunk at a time, or null when it cannot be
 * read. Streaming rather than `readFileSync` because the rehearsal this serves
 * copies the practice's whole database and must not hold it in memory twice at
 * boot. Never throws: an unreadable file is a reason to leave a log alone, not
 * to fail a boot.
 */
function hashFileSync(path: string): string | null {
  let fd: number | null = null;
  try {
    fd = openSync(path, 'r');
    const hash = createHash('sha256');
    const chunk = Buffer.alloc(HASH_CHUNK_BYTES);
    for (;;) {
      const read = readSync(fd, chunk, 0, chunk.length, null);
      if (read === 0) break;
      hash.update(chunk.subarray(0, read));
    }
    return hash.digest('hex');
  } catch {
    return null;
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

/** The write-ahead-log magic whose low bit is clear: checksums read big-endian. */
const WAL_MAGIC = 0x377f0682;

/**
 * True when `log` is a write-ahead log for `db`: a whole, coherent log for a
 * database of the same page size, holding at least one committed transaction.
 *
 * The page size is the one thing the two files have in common, and a log whose
 * frames run out before a commit is not a log that can be replayed into
 * anything. Frame salts are compared rather than verified, because they are
 * what the format uses to find the end of the valid frame sequence: a frame
 * from another run of the log, or from a log that was reset and rewritten,
 * ends the sequence there — so the frames counted below are the ones an engine
 * would replay, and nothing after them.
 */
function walLogIsFor(db: string, log: string): boolean {
  const header = readRange(log, 32, 0);
  const dbHeader = readRange(db, 18, 0);
  if (header === null || dbHeader === null) return false;
  if (header.readUInt32BE(0) !== WAL_MAGIC) return false;

  // A log's page size is a power of two; a database header stores 65536 as 1,
  // because the field is two bytes wide.
  const pageSize = header.readUInt32BE(8);
  const dbPageSize = dbHeader.readUInt16BE(16) === 1 ? 65536 : dbHeader.readUInt16BE(16);
  if (pageSize !== dbPageSize) return false;

  const frameSize = 24 + pageSize;
  const frame = Buffer.alloc(frameSize);
  const salt1 = header.readUInt32BE(16);
  const salt2 = header.readUInt32BE(20);
  let commits = 0;
  for (let at = 32; ; at += frameSize) {
    if (readRange(log, frameSize, at, frame) === null) break;
    if (frame.readUInt32BE(8) !== salt1 || frame.readUInt32BE(12) !== salt2) break;
    if (frame.readUInt32BE(4) > 0) commits += 1;
  }
  return commits > 0;
}

/** Exactly `length` bytes of `path` from `position`, or null when it has not that many. */
function readRange(path: string, length: number, position: number, into?: Buffer): Buffer | null {
  let fd: number | null = null;
  try {
    fd = openSync(path, 'r');
    const buffer = into ?? Buffer.alloc(length);
    let read = 0;
    while (read < length) {
      const got = readSync(fd, buffer, read, length - read, position + read);
      if (got === 0) return null;
      read += got;
    }
    return buffer;
  } catch {
    return null;
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

/**
 * What is in the data folder under this module's own pre-restore names: whole
 * copies, and log files whose database is not there.
 *
 * A log whose database *is* there belongs to it and is not reported at all —
 * it is neither an orphan to put back nor a copy to move home. The suffix is
 * only read as one when the file it would name is absent, since a stamp ends
 * in a `Z` and never in `-wal`.
 *
 * Only regular files are classified. A folder that happens to be named like an
 * orphaned log is not one: renaming a directory onto `apunta.db-wal` leaves a
 * database that can never be opened again, and a boot that cannot open its
 * database cannot report anything about the folder that caused it. An entry
 * of any other kind is nothing this module ever wrote, so it is not this
 * module's to move — it is left exactly as it is, in silence, because there
 * is nothing here to say it was missed.
 */
function preRestoreEntries(dataDir: string): {
  readonly copies: string[];
  readonly logs: readonly {
    readonly path: string;
    readonly suffix: string;
    readonly stamp: string;
  }[];
} {
  const prefix = `${DB_ENTRY_NAME}.before-restore-`;
  let names: string[];
  try {
    names = readdirSync(dataDir).filter((name) => name.startsWith(prefix));
  } catch {
    return { copies: [], logs: [] };
  }
  const present = new Set(names);
  const copies: string[] = [];
  const logs: { path: string; suffix: string; stamp: string }[] = [];
  for (const name of names) {
    if (!isRegularFile(join(dataDir, name))) continue;
    const suffix = SIDECAR_SUFFIXES.find((candidate) => name.endsWith(candidate));
    if (suffix === undefined) {
      copies.push(name);
      continue;
    }
    const stamp = name.slice(prefix.length, name.length - suffix.length);
    if (present.has(name.slice(0, -suffix.length))) continue;
    logs.push({ path: join(dataDir, name), suffix, stamp });
  }
  return { copies, logs };
}

function isRegularFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    // Vanished under us, or unreadable: there is nothing to classify.
    return false;
  }
}

/** This module's own name for one entry of a given stamp: the copy, or a sidecar of it. */
function preRestoreEntryPath(dataDir: string, stamp: string, suffix = ''): string {
  return join(dataDir, `${DB_ENTRY_NAME}.before-restore-${stamp}${suffix}`);
}

/**
 * `pending-restore/` without a database in it is what a crash between the swap
 * and the cleanup leaves, and it is garbage: the restore is done. Deleting it
 * is only safe once every hold it carries is accounted for — either the safety
 * copy has that log beside it, or the fold wrote it into the safety copy and
 * the hold is a redundant copy of rows already there. An unaccounted hold is
 * the only copy of rows anything else has lost, so the folder stays and the
 * next boot counts it again rather than deleting it.
 */
function clearSettledPendingDir(dataDir: string, pendingDir: string): void {
  if (!existsSync(pendingDir)) return;
  const holds = SIDECAR_SUFFIXES.map((suffix) => holdPath(pendingDir, suffix)).filter((hold) =>
    existsSync(hold),
  );
  if (holds.length > 0) {
    const safetyCopy = readSafetyCopyPath(pendingDir, dataDir);
    if (safetyCopy === null || !existsSync(safetyCopy)) return;
    const accounted = SIDECAR_SUFFIXES.every((suffix) => {
      if (!existsSync(holdPath(pendingDir, suffix))) return true;
      return logIsBlank(`${safetyCopy}${suffix}`) === false;
    });
    if (!accounted) return;
  }
  rmSync(pendingDir, { recursive: true, force: true });
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

/**
 * The safety copy name this apply should use: the one the staging recorded, or
 * a fresh stamp, but never one something is already sitting at.
 *
 * `renameSync` replaces a file of the same name on POSIX, so a name that is
 * taken is a name this would overwrite — and an older safety copy is exactly
 * what that name then holds, put there by an earlier restore whose own
 * rollback may yet need it. The overwrite would be silent, and it is the one
 * place in this module where a second copy costs nothing next to losing one.
 *
 * The fresh stamp is walked forward a millisecond at a time rather than
 * retried on the clock, so two applies inside the same millisecond — which a
 * test does, and which a fast machine can — still get two names.
 */
function unusedSafetyCopyPath(dataDir: string, requested: string | null, now: Date): string {
  if (requested !== null && !existsSync(requested)) return requested;
  for (let bump = 0; bump < 1000; bump += 1) {
    const candidate = safetyCopyPath(dataDir, new Date(now.getTime() + bump));
    if (!existsSync(candidate)) return candidate;
  }
  // A thousand names in a row all taken: hand back the last one and let the
  // rename say so, rather than looping or throwing here.
  return safetyCopyPath(dataDir, new Date(now.getTime() + 999));
}

/**
 * The record a rollback leaves saying it moved this stamp's copy home. Named
 * outside the `before-restore-` family on purpose: nothing else in this module
 * classifies entries, and a record a repair could mistake for a database is a
 * record that would be moved onto `apunta.db`.
 */
function movedHomeRecordPath(dataDir: string, safetyCopy: string): string {
  return join(dataDir, `${MOVED_HOME_PREFIX}${stampOfCopy(safetyCopy)}`);
}

/**
 * Say a copy is about to go home. Written before the rename, not after,
 * because the crash this exists for is the one right after the rename.
 */
function writeMovedHomeRecord(dataDir: string, safetyCopy: string): void {
  try {
    writeFileSync(movedHomeRecordPath(dataDir, safetyCopy), '', { mode: 0o600 });
  } catch {
    // A rollback that cannot leave a record still puts the database home; it
    // only means a crash before the logs follow leaves them where they are,
    // counted and reported, rather than attached to a database they might not
    // belong to.
  }
}

/** The stamp in a `apunta.db.before-restore-<stamp>` name, or `unattributed`. */
function stampOfCopy(path: string): string {
  const prefix = `${DB_ENTRY_NAME}.before-restore-`;
  const name = basename(path);
  return name.startsWith(prefix) ? name.slice(prefix.length) : 'unattributed';
}

/**
 * The `safety_copy` the staging recorded, or null.
 *
 * Validated, never trusted. The value decides which file the live database is
 * *moved to*, so one naming `apunta.db` itself — a manifest from a build that
 * got this wrong, or one somebody edited by hand — moves the practice's only
 * copy of its records onto the name the restored archive is about to take,
 * which is the one thing a restore exists to prevent. Nor has a restore any
 * business moving files outside the folder it owns, so only a file of this
 * module's own naming, directly inside `dataDir`, is accepted. Anything else
 * falls back to a fresh name: a second safety copy costs disk, the wrong one
 * costs a practice.
 */
function readSafetyCopyPath(pendingDir: string, dataDir: string): string | null {
  let parsed: { safety_copy?: unknown };
  try {
    parsed = JSON.parse(readFileSync(join(pendingDir, MANIFEST_FILENAME), 'utf8')) as {
      safety_copy?: unknown;
    };
  } catch {
    return null;
  }
  if (typeof parsed.safety_copy !== 'string' || parsed.safety_copy === '') return null;
  const candidate = resolve(parsed.safety_copy);
  if (dirname(candidate) !== resolve(dataDir)) return null;
  if (!basename(candidate).startsWith(`${DB_ENTRY_NAME}.before-restore-`)) return null;
  // Belt and braces against a name that resolves to the live file through a
  // path this module would not have written itself.
  if (candidate === resolve(join(dataDir, DB_ENTRY_NAME))) return null;
  return candidate;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

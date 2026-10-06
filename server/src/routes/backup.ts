import { accessSync, constants, existsSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve, win32 } from 'node:path';
import {
  CreateBackupRequestSchema,
  LAST_VERIFIED_RESTORE_SETTING,
  ListBackupFoldersQuerySchema,
  RestoreBackupRequestSchema,
  SetBackupLocationRequestSchema,
  backupFilenameDate,
  type BackupFolderListing,
  type BackupStatusResponse,
  type CreateBackupResponse,
  type RestoreBackupResponse,
  type SetBackupLocationResponse,
  type VerifiedRestoreResponse,
} from '@apunta/shared';
import type { Database } from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import {
  BackupError,
  backupStatus,
  cancelPendingRestore,
  hasPendingRestore,
  listFolders,
  legacyBackupDir,
  rememberBackupDir,
  resolveBackupDir,
  RestoreError,
  runBackupAsync,
  stageRestore,
} from '../backup/index.js';
import type { AppConfig } from '../config.js';
import { migrationLevel } from '../db/index.js';
import { putSettings } from '../db/settings.js';
import { uuidv7 } from '../db/uuid.js';
import { badRequest, HttpError, notFound, rawHttpError } from '../http/errors.js';
import { storedLanguage } from '../http/locale.js';
import { parseBody, parseQuery } from '../http/validate.js';
import { begin, end } from '../jobs/registry.js';

/**
 * Back up and restore (M7 deliverable 4).
 *
 * Two things here are deliberately not what they might have been.
 *
 * `POST /api/backup/restore` **stages** a restore rather than performing one:
 * `better-sqlite3` holds the database open, so the swap happens at the next
 * start with no reader attached. The response says so, and Settings tells her
 * to quit and reopen Apunta.
 *
 * The restore source is a filename inside the backup folder, or an absolute
 * path — never an upload. A 500 MB multipart body would put a full copy of the
 * practice through a temp file, which is the one place this app never writes
 * (`docs/decisions.md`, M6).
 */
export function registerBackupRoutes(app: FastifyInstance, config: AppConfig, db: Database): void {
  app.get('/api/backup', async (): Promise<BackupStatusResponse> => {
    // The stored setting, read here rather than inside `backupStatus`: a
    // request that is not a job and not a refine is answered in it
    // (C-LANG@1 rule 3), and it is what renders `last_backup_error`.
    return {
      ...backupStatus(db, config, new Date(), storedLanguage(db)),
      pending_restore: hasPendingRestore(config.dataDir),
    };
  });

  /**
   * One folder's subdirectories, for the picker in Settings → Backup.
   *
   * A browser has no native folder chooser without a bridge, so this walks the
   * filesystem for it — **names of directories only**. No file names, no sizes,
   * no contents: a listing must never be a way to read what is on this disk.
   * A path that is not a directory, or is not there, is a 400 rather than an
   * empty list, because "this folder does not exist" and "this folder is
   * empty" are different answers and the picker needs to tell them apart.
   */
  app.get('/api/backup/folders', async (request): Promise<BackupFolderListing> => {
    const input = parseQuery(ListBackupFoldersQuerySchema, request.query);
    let path = input.path ?? resolveBackupDir(db, config);
    if (!isAbsolute(path)) throw badRequest('errors.bad_request.backup_path_not_absolute');
    path = resolve(path);
    if (input.path === undefined) {
      while (!existsSync(path) && dirname(path) !== path) path = dirname(path);
    }
    try {
      if (!statSync(path).isDirectory()) throw new Error('Not a directory');
      return listFolders(path);
    } catch {
      throw badRequest('errors.bad_request.backup_folder_not_found', { path });
    }
  });

  /**
   * Remember a folder as the destination, without writing an archive.
   *
   * One setting row and nothing else: no archive, no `last_backup_at`, no
   * pruning — which is what makes it safe to browse and pick, and what lets
   * "Change where backups go" and "Back up now" stay two separate acts.
   *
   * The folder has to exist already. Creating it here would mean a typo in a
   * path produced a new folder nobody asked for; the backup itself still
   * creates its own folder, because by then the path is one Apunta chose.
   */
  app.put('/api/backup/location', async (request): Promise<SetBackupLocationResponse> => {
    const { directory } = parseBody(SetBackupLocationRequestSchema, request.body);
    if (!isAbsolute(directory)) throw badRequest('errors.bad_request.backup_path_not_absolute');
    const path = resolve(directory);
    try {
      if (!statSync(path).isDirectory()) throw new Error('Not a directory');
      accessSync(path, constants.W_OK | constants.X_OK);
    } catch {
      throw badRequest('errors.bad_request.backup_folder_not_found', { path });
    }
    return { directory: rememberBackupDir(db, path) };
  });

  /** Back up now. The archive is written before this answers, so a 200 means it exists. */
  app.post('/api/backup', async (request, reply): Promise<CreateBackupResponse> => {
    const input = parseBody(CreateBackupRequestSchema, request.body ?? {});
    if (input.directory !== undefined && !isAbsolute(input.directory)) {
      throw badRequest('errors.bad_request.backup_path_not_absolute');
    }

    // C-UPD@1's registry: a backup is minutes of writing a practice's whole
    // archive, so a quiesce must be able to name it as a blocker rather than
    // settle over it. The `finally` releases it on every path, the 409 below
    // included — `end` is idempotent, which is what makes that safe.
    const jobId = uuidv7();
    begin('backup', jobId);
    try {
      const result = await runBackupAsync(db, config, {
        directory: input.directory,
        passphrase: input.passphrase,
        remember: input.remember,
      });
      // Deliberately not `request.log.info(result)`: the manifest carries
      // counts, not content, but a habit of logging response bodies is how
      // note text reaches a log file (`data-at-rest-2026-08.md` §2.4).
      request.log.info(
        { bytes: result.file.bytes, encrypted: result.file.encrypted, pruned: result.pruned.length },
        'backup written',
      );
      return reply.code(201).send(result);
    } catch (error) {
      if (error instanceof BackupError) {
        // C-SNAP@1 rule 3. 409 and its own code rather than the generic
        // `conflict`: the client can tell "a backup is already running" from
        // "the archive is from a newer schema" and say so, and every other
        // `BackupError` stays the 400 it has always been.
        // `backup_in_progress` is the one `BackupError` code with a single
        // sentence, so it is keyed and rendered like every other 409. The rest
        // share their codes two or three ways and keep their own English; see
        // `rawHttpError` in `http/errors.ts`.
        throw error.code === 'backup_in_progress'
          ? new HttpError(409, 'backup_in_progress', 'errors.backup_in_progress')
          : rawHttpError(400, 'bad_request', error.message);
      }
      throw error;
    } finally {
      end(jobId);
    }
  });

  /**
   * Stage a restore. Nothing about the live database changes here — the
   * archive is validated, the replacement is written beside the database, and
   * the swap happens at the next start.
   */
  app.post('/api/backup/restore', async (request): Promise<RestoreBackupResponse> => {
    const input = parseBody(RestoreBackupRequestSchema, request.body);
    const archivePath = resolveArchivePath(db, config, input.file);

    // C-UPD@1's registry, for the staging half of a restore. It writes the
    // replacement archive beside the database, so it is work a quiesce has to be
    // able to wait for; the swap itself happens at the next start, when no
    // request is running at all.
    const jobId = uuidv7();
    begin('restore', jobId);
    try {
      const staged = stageRestore({
        archivePath,
        dataDir: config.dataDir,
        maxMigrationLevel: migrationLevel(db),
        passphrase: input.passphrase,
      });
      request.log.warn(
        { archive: staged.manifest.generated_at, level: staged.manifest.migration_level },
        'restore staged; it is applied at the next start',
      );
      return { staged: true, manifest: staged.manifest, safety_copy: staged.safetyCopy };
    } catch (error) {
      if (error instanceof RestoreError) {
        // No `RestoreError` code has a single sentence, so none of these can be
        // keyed from the route; the sentence is forwarded as it stands today.
        throw error.code === 'schema_too_new'
          ? rawHttpError(409, 'conflict', error.message)
          : rawHttpError(400, 'bad_request', error.message);
      }
      throw error;
    } finally {
      end(jobId);
    }
  });

  /** Changed her mind before restarting. */
  app.delete('/api/backup/restore', async (_request, reply) => {
    cancelPendingRestore(config.dataDir);
    return reply.code(204).send();
  });

  /**
   * "I did the hand restore and my notes came back."
   *
   * A backup that has never been restored is a hypothesis. This is the record
   * that the hypothesis was tested, and it is the only thing that turns the
   * once-a-year prompt in Settings off (`data-at-rest-2026-08.md` §5.6).
   */
  app.post('/api/backup/verified', async (): Promise<VerifiedRestoreResponse> => {
    const at = new Date().toISOString();
    putSettings(db, { [LAST_VERIFIED_RESTORE_SETTING]: at });
    return { last_verified_restore: at };
  });
}

/**
 * A bare filename means "a file in the backup folder". An absolute path is
 * allowed so an archive on an external disk does not have to be copied first.
 *
 * The two are trusted differently, because only one of them can point
 * anywhere. An absolute path must still carry Apunta's own filename, which is
 * what keeps this from becoming a "read me any file on the disk" endpoint. A
 * bare name is confined to the backup folder instead: it may not contain a
 * directory component at all, so it cannot climb out, and inside that folder
 * the practice's own hand is the authority on what belongs there.
 *
 * That distinction is the fix for a day-one dead end (2026-08-30): a config
 * pack handed over on a memory stick, or a download a browser renamed to
 * "… (1).zip", was refused by name even when sitting in the right folder,
 * with no other way to restore it. The archive is still the real gate —
 * `stageRestore` validates the manifest and refuses anything that is not
 * genuinely one of ours.
 *
 * Separators are read the Windows way whichever host this is, because a
 * restored archive may have been handed over from a Windows machine (or be a
 * Windows path on a POSIX one) and hard rule 4 says this logic stays
 * OS-portable. `win32.basename` splits on both `/` and `\`; POSIX `basename`
 * splits only on `/`. `win32.isAbsolute` likewise recognises `C:\…` and
 * `\\server\share` on any host, so the filename is still extracted — and the
 * bare-name confinement below still refuses either separator.
 */
export function resolveArchivePath(db: Database, config: AppConfig, file: string): string {
  if (isAbsolute(file) || win32.isAbsolute(file)) {
    const name = win32.basename(file);
    const localFolder =
      isAbsolute(file) &&
      [resolveBackupDir(db, config), legacyBackupDir(config.dataDir)].some(
        (directory) => resolve(directory) === dirname(resolve(file)),
      );
    if (backupFilenameDate(name) === null && !(localFolder && name.toLowerCase().endsWith('.zip'))) {
      throw badRequest('errors.bad_request.backup_filename_invalid', { name });
    }
    return file;
  }
  if (win32.basename(file) !== file || !file.toLowerCase().endsWith('.zip')) {
    throw notFound('errors.not_found.backup_file', { file });
  }
  return join(resolveBackupDir(db, config), file);
}

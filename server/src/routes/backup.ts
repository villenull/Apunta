import { basename, isAbsolute, join } from 'node:path';

import {
  CreateBackupRequestSchema,
  LAST_VERIFIED_RESTORE_SETTING,
  RestoreBackupRequestSchema,
  backupFilenameDate,
  type BackupStatusResponse,
  type CreateBackupResponse,
  type RestoreBackupResponse,
  type VerifiedRestoreResponse,
} from '@apunta/shared';
import type { Database } from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';

import {
  BackupError,
  backupStatus,
  cancelPendingRestore,
  hasPendingRestore,
  resolveBackupDir,
  RestoreError,
  runBackupAsync,
  stageRestore,
} from '../backup/index.js';
import type { AppConfig } from '../config.js';
import { migrationLevel } from '../db/index.js';
import { putSettings } from '../db/settings.js';
import { badRequest, conflict, HttpError, notFound } from '../http/errors.js';
import { parseBody } from '../http/validate.js';

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
    return { ...backupStatus(db, config), pending_restore: hasPendingRestore(config.dataDir) };
  });

  /** Back up now. The archive is written before this answers, so a 200 means it exists. */
  app.post('/api/backup', async (request, reply): Promise<CreateBackupResponse> => {
    const input = parseBody(CreateBackupRequestSchema, request.body ?? {});
    if (input.directory !== undefined && !isAbsolute(input.directory)) {
      throw badRequest('A backup folder must be an absolute path.');
    }

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
        throw error.code === 'backup_in_progress'
          ? new HttpError(409, 'backup_in_progress', error.message)
          : badRequest(error.message);
      }
      throw error;
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
        throw error.code === 'schema_too_new' ? conflict(error.message) : badRequest(error.message);
      }
      throw error;
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
 */
function resolveArchivePath(db: Database, config: AppConfig, file: string): string {
  if (isAbsolute(file)) {
    const name = file.split('/').pop() ?? '';
    if (backupFilenameDate(name) === null) {
      throw badRequest(`${name} is not an Apunta backup filename (apunta-backup-YYYY-MM-DD.zip).`);
    }
    return file;
  }
  if (basename(file) !== file || !file.toLowerCase().endsWith('.zip')) {
    throw notFound(`${file} is not a backup file in the backup folder.`);
  }
  return join(resolveBackupDir(db, config.dataDir), file);
}

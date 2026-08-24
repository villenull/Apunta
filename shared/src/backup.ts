import { z } from 'zod';

/**
 * Backup and export (M7 deliverable 4), rewritten against
 * `docs/research/data-at-rest-2026-08.md` §5.
 *
 * The research's finding is that the biggest real risk to this practice is not
 * a confidentiality breach — it is **the backup not existing, or existing and
 * not being restorable**. The harm there is certain rather than conditional.
 * So an archive is not "a rendering of the notes"; it is a restorable copy of
 * the database with a human-readable rendering *beside* it:
 *
 * ```
 * apunta.db        VACUUM INTO copy, integrity-checked. The restore path.
 * notes/…          plain text, one file per note — the "app is gone in 2035" path
 * plans/…          one file per treatment plan version, the payer-facing document
 * data.json        full relational dump — the "schema changed" path
 * manifest.json    schema level, app version, counts, sha256, integrity result
 * RESTORE.txt      plain language, for someone who no longer has Apunta
 * ```
 *
 * An **encrypted** archive rearranges that: everything above goes into an
 * inner zip which is encrypted whole, and only `RESTORE.txt` and
 * `encryption.json` stay readable on the outside. Instructions locked inside
 * the thing you cannot open are not instructions (§5.5).
 */

/** Inside the data dir. Default destination — FileVault and Time Machine already cover it. */
export const BACKUP_DIRNAME = 'backups';

/** `apunta-backup-2026-08-24.zip`, plus `-2` … for a second run the same day. */
export const BACKUP_FILE_PREFIX = 'apunta-backup-';
export const BACKUP_FILE_SUFFIX = '.zip';

export const MANIFEST_FILENAME = 'manifest.json';
export const RESTORE_FILENAME = 'RESTORE.txt';
export const DATA_JSON_FILENAME = 'data.json';
export const DB_ENTRY_NAME = 'apunta.db';
export const ENCRYPTED_PAYLOAD_NAME = 'apunta-backup.enc';
export const ENCRYPTION_META_FILENAME = 'encryption.json';

/** Left beside the database by a staged restore; consumed at the next boot. */
export const PENDING_RESTORE_DIRNAME = 'pending-restore';

/**
 * The pruning ladder (§5.3): 14 daily plus 12 monthly, roughly 26 archives.
 * Bounds disk use while still answering "I deleted that three weeks ago".
 */
export const KEEP_DAILY_BACKUPS = 14;
export const KEEP_MONTHLY_BACKUPS = 12;

/** Older than this and Settings says so in colour. */
export const BACKUP_STALE_DAYS = 7;

/** Settings keys. Flat key → JSON store, so none of these needs a migration. */
export const BACKUP_DIR_SETTING = 'backup_dir';
export const LAST_BACKUP_AT_SETTING = 'last_backup_at';
export const LAST_BACKUP_FILE_SETTING = 'last_backup_file';
export const LAST_BACKUP_ERROR_SETTING = 'last_backup_error';
export const LAST_VERIFIED_RESTORE_SETTING = 'last_verified_restore';

/**
 * Folders a clinical archive must not be written to without saying so.
 *
 * `~/Desktop` and `~/Documents` are the two folders "Desktop & Documents
 * Folders" syncs to iCloud, so the obvious save location uploads the practice
 * to Apple — and with Optimize Mac Storage on, macOS can evict an unopened
 * archive to a 0-byte placeholder that Time Machine then faithfully backs up
 * (§2.5). The rest are the other sync roots.
 *
 * Matched as path prefixes against the resolved destination, so
 * `~/Documents/Apunta backups` is caught too.
 */
export const SYNC_ROOT_RELATIVE_PATHS = [
  'Desktop',
  'Documents',
  'Library/Mobile Documents',
  'Library/CloudStorage',
  'Dropbox',
  'Google Drive',
  'OneDrive',
  'iCloud Drive',
] as const;

export const DestinationRiskSchema = z.enum(['data-dir', 'external', 'sync']);
export type DestinationRisk = z.infer<typeof DestinationRiskSchema>;

export const DestinationAdviceSchema = z.object({
  risk: DestinationRiskSchema,
  /** Absolute, resolved. */
  path: z.string(),
  /** One sentence, shown on screen. Empty for the default destination. */
  warning: z.string(),
});
export type DestinationAdvice = z.infer<typeof DestinationAdviceSchema>;

/**
 * Where a backup is about to be written, and what is wrong with it.
 *
 * Deliberately a pure function of three strings so the browser can render the
 * same warning before the request is sent and a test can drive every branch
 * without a home directory. Path comparison is prefix-on-segment-boundary,
 * lowercased — macOS filesystems are case-insensitive by default, and
 * `~/documents` would otherwise slip past.
 */
export function classifyBackupDestination(
  destination: string,
  dataDir: string,
  home: string,
): DestinationAdvice {
  const path = stripTrailingSlash(destination);
  if (isWithin(path, join(stripTrailingSlash(dataDir), BACKUP_DIRNAME)) || isWithin(path, dataDir)) {
    return { risk: 'data-dir', path, warning: '' };
  }

  for (const relative of SYNC_ROOT_RELATIVE_PATHS) {
    if (isWithin(path, join(stripTrailingSlash(home), relative))) {
      return {
        risk: 'sync',
        path,
        warning:
          `${relative} is synced to the cloud on a typical Mac, so a backup saved here is ` +
          'uploaded off this machine — and if "Optimize Mac Storage" is on, macOS can replace ' +
          'it with an empty placeholder. Choose a folder on an encrypted external disk instead.',
      };
    }
  }

  return {
    risk: 'external',
    path,
    warning:
      'This folder is outside the Apunta data folder, so FileVault is not necessarily ' +
      'protecting it. Use an encrypted disk, or set a passphrase below.',
  };
}

function stripTrailingSlash(path: string): string {
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

function join(base: string, relative: string): string {
  return `${stripTrailingSlash(base)}/${relative}`;
}

function isWithin(candidate: string, root: string): boolean {
  const a = candidate.toLowerCase();
  const b = stripTrailingSlash(root).toLowerCase();
  return a === b || a.startsWith(`${b}/`);
}

/**
 * What the archive says about itself.
 *
 * `migration_level` is the restore safety check: an archive from a newer
 * schema than the running app must be refused rather than loaded, and said so.
 * `integrity_check` and `db_sha256` are the reason a backup is a fact rather
 * than a rumour — both are computed on the copy, not on the live database.
 */
export const BackupManifestSchema = z.object({
  /** Bumped only when the archive layout changes, not when the schema does. */
  format: z.literal(1),
  app_version: z.string(),
  generated_at: z.iso.datetime(),
  /** Highest applied migration in the copied database. */
  migration_level: z.number().int().nonnegative(),
  /** SQLite library version that produced the copy. */
  sqlite_version: z.string(),
  db_bytes: z.number().int().nonnegative(),
  db_sha256: z.string(),
  /** `PRAGMA integrity_check` on the copy. Anything but `ok` fails the backup. */
  integrity_check: z.string(),
  counts: z.record(z.string(), z.number().int().nonnegative()),
  /** True when the archive body is encrypted (see `encryption.json`). */
  encrypted: z.boolean(),
});
export type BackupManifest = z.infer<typeof BackupManifestSchema>;

/**
 * Everything needed to decrypt, minus the passphrase.
 *
 * Written in the clear next to `RESTORE.txt` on purpose: without it the
 * archive is unopenable even by someone holding the passphrase, and it reveals
 * nothing but the KDF parameters.
 */
export const EncryptionMetaSchema = z.object({
  algorithm: z.literal('aes-256-gcm'),
  kdf: z.literal('scrypt'),
  /** Node's scrypt cost parameters, recorded so a future change stays readable. */
  n: z.number().int().positive(),
  r: z.number().int().positive(),
  p: z.number().int().positive(),
  key_bytes: z.number().int().positive(),
  salt_base64: z.string(),
  iv_base64: z.string(),
  auth_tag_base64: z.string(),
  payload: z.literal(ENCRYPTED_PAYLOAD_NAME),
});
export type EncryptionMeta = z.infer<typeof EncryptionMetaSchema>;

/** One archive on disk, as Settings lists them. */
export const BackupFileSchema = z.object({
  filename: z.string(),
  path: z.string(),
  bytes: z.number().int().nonnegative(),
  /** File mtime, UTC. The manifest date is inside; this is what the list sorts on. */
  created_at: z.iso.datetime(),
  encrypted: z.boolean(),
});
export type BackupFile = z.infer<typeof BackupFileSchema>;

/** What `GET /api/backup` answers: enough to render the Settings card whole. */
export const BackupStatusSchema = z.object({
  /** Resolved destination directory — the default, or `backup_dir`. */
  directory: z.string(),
  destination: DestinationAdviceSchema,
  last_backup_at: z.string().nullable(),
  last_backup_file: z.string().nullable(),
  /** Set when the last attempt failed, so a silent failure cannot look like a backup. */
  last_backup_error: z.string().nullable(),
  /** True when there has never been one, or the newest is older than `BACKUP_STALE_DAYS`. */
  stale: z.boolean(),
  last_verified_restore: z.string().nullable(),
  backups: z.array(BackupFileSchema),
  /** What is in the practice right now — the retention panel of §6.3.1. */
  counts: z.record(z.string(), z.number().int().nonnegative()),
  /** Oldest note's date, or null on an empty practice. */
  oldest_note_at: z.string().nullable(),
  db_bytes: z.number().int().nonnegative(),
});
export type BackupStatus = z.infer<typeof BackupStatusSchema>;

/** Long enough to matter, and refused rather than silently weakened. */
export const MIN_BACKUP_PASSPHRASE = 12;

export const CreateBackupRequestSchema = z.object({
  /**
   * Absolute path of a folder to write into. Omitted means the configured
   * destination (`backup_dir`, or `<dataDir>/backups`).
   */
  directory: z.string().min(1).max(1024).optional(),
  /**
   * Encrypts the archive body. Required for nothing — the default destination
   * sits under FileVault — but the only honest answer for an archive that
   * leaves the machine.
   */
  passphrase: z.string().min(MIN_BACKUP_PASSPHRASE).max(512).optional(),
  /** Remember `directory` as the destination for future backups. */
  remember: z.boolean().optional(),
});
export type CreateBackupRequest = z.infer<typeof CreateBackupRequestSchema>;

export const CreateBackupResponseSchema = z.object({
  file: BackupFileSchema,
  manifest: BackupManifestSchema,
  destination: DestinationAdviceSchema,
  /** Archives the ladder removed on this run, by filename. */
  pruned: z.array(z.string()),
});
export type CreateBackupResponse = z.infer<typeof CreateBackupResponseSchema>;

export const RestoreBackupRequestSchema = z.object({
  /** A filename from `GET /api/backup`, or an absolute path to a zip. */
  file: z.string().min(1).max(1024),
  passphrase: z.string().max(512).optional(),
});
export type RestoreBackupRequest = z.infer<typeof RestoreBackupRequestSchema>;

export const RestoreBackupResponseSchema = z.object({
  /** Always true here — the swap itself happens at the next start. */
  staged: z.literal(true),
  manifest: BackupManifestSchema,
  /** Where the current database will be moved to, so she can get back. */
  safety_copy: z.string(),
});
export type RestoreBackupResponse = z.infer<typeof RestoreBackupResponseSchema>;

/** `apunta-backup-2026-08-24.zip` for the first of the day, `-2.zip` after that. */
export function backupFilename(date: Date, sequence = 1): string {
  const day = date.toISOString().slice(0, 10);
  const tail = sequence > 1 ? `-${String(sequence)}` : '';
  return `${BACKUP_FILE_PREFIX}${day}${tail}${BACKUP_FILE_SUFFIX}`;
}

/** The `YYYY-MM-DD` an archive filename claims, or null when it is not one of ours. */
export function backupFilenameDate(filename: string): string | null {
  const match = /^apunta-backup-(\d{4}-\d{2}-\d{2})(?:-\d+)?\.zip$/.exec(filename);
  return match?.[1] ?? null;
}

/**
 * A note's file inside `notes/`.
 *
 * `<patient>/<date> <title>.txt` — the date first so a directory listing is
 * chronological, and every character macOS or Windows would choke on replaced
 * rather than dropped, so two different titles cannot collide into one file.
 */
export function safeFilePart(text: string): string {
  const cleaned = text
    // Control characters first (`\p{Cc}` rather than an escaped range, which
    // ESLint rightly refuses to read), then the set Finder and Windows both
    // reject in a filename.
    .replace(/\p{Cc}/gu, ' ')
    .replace(/[/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    // A leading run of dots or dashes is what `../..` degrades to once the
    // separators are gone: harmless, but a filename starting `-..-` is a
    // filename nobody can select in a shell.
    .replace(/^[.\-\s]+/, '')
    .replace(/[.\s]+$/, '');
  return cleaned === '' ? 'untitled' : cleaned.slice(0, 80);
}

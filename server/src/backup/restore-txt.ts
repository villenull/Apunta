import {
  DATA_JSON_FILENAME,
  DB_ENTRY_NAME,
  ENCRYPTED_PAYLOAD_NAME,
  ENCRYPTION_META_FILENAME,
  MANIFEST_FILENAME,
  type BackupManifest,
} from '@apunta/shared';

/**
 * `RESTORE.txt` — written for someone who no longer has Apunta.
 *
 * No jargon, no shell unless the shell is unavoidable, and the one step that
 * actually prevents damage stated as a step rather than a footnote: **do not
 * copy a `-wal` or `-shm` file out of the backup**. A stale write-ahead log
 * beside a restored database is what turns "I got my notes back" into "the
 * file will not open" (`docs/research/data-at-rest-2026-08.md` §2.7, §5.6).
 *
 * Three restore paths, because the third is the real test of the format:
 * the app; by hand with the app installed; and the case where the app is gone
 * and only this file remains — which is why the archive carries plain text.
 */

export interface RestoreTextInput {
  readonly manifest: BackupManifest;
  /** The data directory this archive came from, quoted back so the paths are real. */
  readonly dataDir: string;
  /** Present only for an encrypted archive. */
  readonly encrypted: boolean;
  /** Whether the archive actually has a `plans/` folder to describe. */
  readonly hasPlans?: boolean;
}

/** "1 note", "3 notes". A file that says "1 notes" reads as unmaintained. */
function count(value: number, singular: string, plural = `${singular}s`): string {
  return `${String(value)} ${value === 1 ? singular : plural}`;
}

export function renderRestoreText(input: RestoreTextInput): string {
  const { manifest, dataDir } = input;
  const generated = manifest.generated_at.slice(0, 10);
  const notes = manifest.counts['notes'] ?? 0;
  const patients = manifest.counts['patients'] ?? 0;

  const lines: string[] = [
    'HOW TO GET YOUR NOTES BACK',
    '==========================',
    '',
    `This is an Apunta backup made on ${generated}.`,
    `It holds ${count(notes, 'note')} for ${count(patients, 'patient')}.`,
    '',
    'There are three ways to use it. Try them in order — the first is the',
    'easiest, the last one works even if Apunta no longer exists.',
    '',
  ];

  if (input.encrypted) {
    lines.push(
      'BEFORE ANY OF THAT: THIS BACKUP IS ENCRYPTED',
      '-------------------------------------------',
      '',
      'Everything except this file is inside one encrypted lump called',
      `"${ENCRYPTED_PAYLOAD_NAME}". You need the passphrase that was set when the`,
      'backup was made. Nobody can recover it for you — not the person who wrote',
      'this app, not Apple, not anyone.',
      '',
      'In Apunta: Settings > Back up and restore > Restore, pick this file, and',
      'type the passphrase.',
      '',
      'Without Apunta: save the script at the bottom of this file as',
      '"decrypt.mjs" next to the backup, install Node (nodejs.org), and run',
      '',
      `    node decrypt.mjs "<this backup>.zip" "<your passphrase>"`,
      '',
      'It writes "apunta-backup-decrypted.zip" beside it. Everything described',
      'below is inside that.',
      '',
    );
  }

  lines.push(
    '1. THE EASY WAY — APUNTA IS INSTALLED',
    '-------------------------------------',
    '',
    'Open Apunta, go to Settings > Back up and restore, choose Restore, and',
    'pick this file. Apunta checks the backup first, keeps a copy of your',
    'current notes just in case, and asks you to quit and reopen it.',
    '',
    '2. BY HAND — APUNTA IS INSTALLED BUT WILL NOT OPEN',
    '--------------------------------------------------',
    '',
    '  1. Quit Apunta.',
    '  2. In Finder: Go > Go to Folder... and paste this:',
    `       ${dataDir}`,
    `  3. Move ${DB_ENTRY_NAME}, ${DB_ENTRY_NAME}-wal and ${DB_ENTRY_NAME}-shm to your`,
    '     Desktop. Keep them until you are sure the restore worked.',
    `  4. Copy ${DB_ENTRY_NAME} out of this backup into that folder.`,
    '',
    '     *** Do NOT copy any file ending in -wal or -shm out of this',
    '     backup. There are none in it, and if you find one somewhere else,',
    '     leaving it beside the restored file is what breaks the restore. ***',
    '',
    `  5. Open Apunta. Your notes should be as they were on ${generated}.`,
    '',
    '3. NO APUNTA AT ALL — JUST READ THE NOTES',
    '-----------------------------------------',
    '',
    'Open the "notes" folder in this backup. There is one plain text file per',
    'note, in a folder per patient, named by date. They open in TextEdit,',
    'Word, or anything else, today and in twenty years. Nothing is needed to',
    'read them.',
    '',
    ...(input.hasPlans === true
      ? [
          'The "plans" folder holds each treatment plan version the same way, one',
          'document per version, exactly as it would have been printed.',
          '',
        ]
      : []),
    `"${DATA_JSON_FILENAME}" holds the same information in a form a programmer can`,
    'load, for the case where the notes need to go into a different system.',
    '',
    'WHAT IS IN HERE',
    '---------------',
    '',
    `  ${DB_ENTRY_NAME}        the notes as Apunta stores them — this is what gets restored`,
    '  notes/           one plain text file per note',
    ...(input.hasPlans === true ? ['  plans/           one document per treatment plan version'] : []),
    `  ${DATA_JSON_FILENAME}        everything again, as structured data`,
    `  ${MANIFEST_FILENAME}    what this backup is, and the checks that passed`,
    '  RESTORE.txt      this file',
  );

  if (input.encrypted) {
    lines.push(`  ${ENCRYPTION_META_FILENAME}  how the lump above was encrypted (not the passphrase)`);
  }

  lines.push(
    '',
    'CHECKS THAT PASSED WHEN THIS WAS MADE',
    '-------------------------------------',
    '',
    `  database check   ${manifest.integrity_check}`,
    `  database size    ${String(manifest.db_bytes)} bytes`,
    `  fingerprint      ${manifest.db_sha256}`,
    `  Apunta version   ${manifest.app_version}`,
    `  storage version  ${String(manifest.migration_level)}`,
    '',
    'The fingerprint is a SHA-256 of the database file. To check the copy you',
    'have is the copy that was made:',
    '',
    `    shasum -a 256 ${DB_ENTRY_NAME}`,
    '',
    'A backup nobody has ever restored is a guess. Once a year, try step 2 on',
    'a spare copy of the folder and see your notes come back.',
    '',
  );

  if (input.encrypted) {
    lines.push('', DECRYPT_SCRIPT, '');
  }

  return lines.join('\n');
}

/**
 * The whole decryption path, in one file, using nothing but Node's standard
 * library. Printed verbatim into `RESTORE.txt` so the encrypted archive is
 * openable by someone who has neither Apunta nor this repository — which is
 * the only thing that makes encrypting it defensible at all.
 *
 * It is a string rather than a checked-in `.mjs` because it has to travel
 * *inside the backup*, and a file the archive references but does not contain
 * is a file that will not be there.
 */
export const DECRYPT_SCRIPT = `--- decrypt.mjs (save everything between the dashed lines) ---
// Opens an encrypted Apunta backup. Node 18+, no installs.
//   node decrypt.mjs apunta-backup-YYYY-MM-DD.zip "your passphrase"
import { createDecipheriv, scryptSync } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [zipPath, passphrase] = process.argv.slice(2);
if (!zipPath || !passphrase) throw new Error('usage: node decrypt.mjs <backup.zip> <passphrase>');

// macOS and Linux both ship unzip; this only reads the two files it needs.
const work = mkdtempSync(join(tmpdir(), 'apunta-decrypt-'));
execFileSync('unzip', ['-o', '-q', zipPath, '${ENCRYPTION_META_FILENAME}', '${ENCRYPTED_PAYLOAD_NAME}', '-d', work]);

const meta = JSON.parse(readFileSync(join(work, '${ENCRYPTION_META_FILENAME}'), 'utf8'));
const key = scryptSync(passphrase, Buffer.from(meta.salt_base64, 'base64'), meta.key_bytes, {
  N: meta.n, r: meta.r, p: meta.p, maxmem: 256 * 1024 * 1024,
});
const decipher = createDecipheriv(meta.algorithm, key, Buffer.from(meta.iv_base64, 'base64'));
decipher.setAuthTag(Buffer.from(meta.auth_tag_base64, 'base64'));
const plain = Buffer.concat([
  decipher.update(readFileSync(join(work, '${ENCRYPTED_PAYLOAD_NAME}'))),
  decipher.final(),
]);

writeFileSync('apunta-backup-decrypted.zip', plain);
console.log('wrote apunta-backup-decrypted.zip —', plain.length, 'bytes');
--- end of decrypt.mjs ---`;

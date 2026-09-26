import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { backupFilename, backupFilenameDate, classifyBackupDestination, safeFilePart } from './backup.js';

const DATA_DIR = '/Users/her/Library/Application Support/Apunta';
const HOME = '/Users/her';

describe('classifyBackupDestination', () => {
  it('says nothing about the default destination', () => {
    const advice = classifyBackupDestination(`${DATA_DIR}/backups`, DATA_DIR, HOME);
    expect(advice.risk).toBe('data-dir');
    expect(advice.warning).toBe('');
  });

  /**
   * Desktop and Documents are the two folders "Desktop & Documents Folders"
   * syncs to iCloud, which makes the obvious save location the one that
   * uploads clinical records to Apple (`data-at-rest-2026-08.md` §2.5).
   */
  it.each(['Desktop', 'Documents', 'Library/Mobile Documents', 'Dropbox', 'OneDrive'])(
    'warns hard about ~/%s',
    (folder) => {
      const advice = classifyBackupDestination(`${HOME}/${folder}/Apunta`, DATA_DIR, HOME);
      expect(advice.risk).toBe('sync');
      expect(advice.warning).toContain(folder);
    },
  );

  it('catches a synced folder whatever the case, because macOS is case-insensitive', () => {
    expect(classifyBackupDestination(`${HOME}/documents`, DATA_DIR, HOME).risk).toBe('sync');
  });

  it('does not confuse a same-prefix sibling for the folder itself', () => {
    // ~/Documentation is not ~/Documents.
    expect(classifyBackupDestination(`${HOME}/Documentation`, DATA_DIR, HOME).risk).toBe('external');
  });

  it('tells the truth about an external disk rather than blessing it', () => {
    const advice = classifyBackupDestination('/Volumes/Backup/Apunta', DATA_DIR, HOME);
    expect(advice.risk).toBe('external');
    expect(advice.warning).toContain('FileVault');
  });
});

describe('backup filenames', () => {
  // A backup is named for the day it happened on, in her timezone, so every
  // case pins a zone: 22:15Z is still 24 August in Denver but already
  // 25 August in Sydney, and the archive would then be named for the wrong
  // day of her week.
  const originalTimezone = process.env.TZ;
  beforeEach(() => {
    process.env.TZ = 'America/Denver';
  });
  afterEach(() => {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  });

  it('names the day, and numbers a second run within it', () => {
    const day = new Date('2026-08-24T22:15:00.000Z');
    expect(backupFilename(day)).toBe('apunta-backup-2026-08-24.zip');
    expect(backupFilename(day, 3)).toBe('apunta-backup-2026-08-24-3.zip');
  });

  it('recognises its own names and nothing else', () => {
    expect(backupFilenameDate('apunta-backup-2026-08-24.zip')).toBe('2026-08-24');
    expect(backupFilenameDate('apunta-backup-2026-08-24-2.zip')).toBe('2026-08-24');
    expect(backupFilenameDate('notes.zip')).toBeNull();
    expect(backupFilenameDate('apunta-backup.zip')).toBeNull();
    // Not a path traversal dressed as a filename.
    expect(backupFilenameDate('../../apunta-backup-2026-08-24.zip')).toBeNull();
  });
});

describe('safeFilePart', () => {
  it('keeps a readable name and removes what a filesystem would refuse', () => {
    expect(safeFilePart('2026-08-08 Progress note')).toBe('2026-08-08 Progress note');
    expect(safeFilePart('Intake / assessment: part 2')).toBe('Intake - assessment- part 2');
  });

  it('never produces an empty or dot-leading name', () => {
    expect(safeFilePart('   ')).toBe('untitled');
    expect(safeFilePart('...')).toBe('untitled');
    expect(safeFilePart('../../etc/passwd')).toBe('etc-passwd');
  });

  it('bounds the length so a pasted paragraph cannot become a filename', () => {
    expect(safeFilePart('a'.repeat(300))).toHaveLength(80);
  });
});

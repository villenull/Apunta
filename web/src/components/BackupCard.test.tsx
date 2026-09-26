import { t } from '@apunta/shared';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BackupAdvanced, BackupCard, useBackup } from './BackupCard.js';
import { installFakeApi } from '../test/fakeApi.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Both halves on one state, as Settings renders them (the card, then Advanced). */
function Harness(): React.JSX.Element {
  const backup = useBackup();
  return (
    <>
      <BackupCard backup={backup} onRestore={() => {}} />
      <BackupAdvanced backup={backup} />
    </>
  );
}

function renderCard(): void {
  render(
    <MemoryRouter>
      <Harness />
    </MemoryRouter>,
  );
}

describe('the backup card', () => {
  it('says plainly that there is no backup yet', async () => {
    installFakeApi();
    renderCard();

    expect((await screen.findByTestId('backup-last')).textContent).toContain('No backup yet');
  });

  /**
   * A backup that silently did not happen is the failure the whole feature
   * exists to prevent, so a stale timestamp must not read as a healthy one.
   */
  it('shows the age of a stale backup rather than only its date', async () => {
    installFakeApi({}, { backup: { last_backup_at: '2026-08-01T09:00:00.000Z', stale: true } });
    renderCard();

    const line = await screen.findByTestId('backup-last');
    expect(line.textContent).toMatch(/Last backup: \d+ days ago/);
    expect(line.className).toContain('backup-stale');
    expect(screen.getByTestId('backup-stale').textContent).toBe('No backup for over 7 days.');
  });

  it('surfaces a failed attempt as a failure', async () => {
    installFakeApi({}, { backup: { last_backup_error: '2026-08-24T09:00:00.000Z — the disk is full' } });
    renderCard();

    expect((await screen.findByTestId('backup-error')).textContent).toContain('the disk is full');
  });

  it('warns when backups are going somewhere a sync service watches', async () => {
    installFakeApi(
      {},
      {
        backup: {
          directory: '/Users/her/Documents/Apunta',
          destination: {
            risk: 'sync',
            path: '/Users/her/Documents/Apunta',
            warning: 'Documents is synced to the cloud on a typical Mac',
          },
        },
      },
    );
    renderCard();

    expect((await screen.findByTestId('backup-destination-warning')).textContent).toContain(
      'synced to the cloud',
    );
  });

  it('reports what the backup contains and that it was checked', async () => {
    installFakeApi();
    renderCard();

    fireEvent.click(await screen.findByTestId('backup-now'));
    await waitFor(() => {
      expect(screen.getByTestId('backup-action-message').textContent).toContain('checked and intact');
    });
    expect(screen.getByTestId('backup-action-message').textContent).toContain('4 notes');
  });

  it('tells her a restore needs a restart rather than pretending it happened', async () => {
    installFakeApi(
      {},
      {
        backup: {
          backups: [
            {
              filename: 'apunta-backup-2026-08-20.zip',
              path: '/tmp/apunta/backups/apunta-backup-2026-08-20.zip',
              bytes: 65_536,
              created_at: '2026-08-20T09:00:00.000Z',
              encrypted: false,
            },
          ],
        },
      },
    );
    renderCard();

    fireEvent.click(
      within(await screen.findByTestId('backup-list')).getByRole('button', { name: 'Restore' }),
    );
    await waitFor(() => {
      expect(screen.getByTestId('backup-action-message').textContent).toContain(
        'Quit Apunta and open it again',
      );
    });
    // …and it names where the current notes went, because a restore is exactly
    // when someone discovers they picked the wrong archive.
    expect(screen.getByTestId('backup-action-message').textContent).toContain('before-restore');
  });

  it('shows a staged restore as still waiting, with a way out', async () => {
    installFakeApi({}, { backup: { pending_restore: true } });
    renderCard();

    expect((await screen.findByTestId('backup-pending')).textContent).toContain('quit Apunta');
    expect(screen.getByRole('button', { name: 'Cancel it' })).toBeTruthy();
  });

  it('asks once whether a restore has ever actually been tried', async () => {
    installFakeApi();
    renderCard();

    expect((await screen.findByTestId('backup-verify-nudge')).textContent).toContain('Restore never tested');
  });

  it('stops asking once she says she has', async () => {
    installFakeApi({}, { backup: { last_verified_restore: '2026-08-01T09:00:00.000Z' } });
    renderCard();

    expect((await screen.findByTestId('backup-verified')).textContent).toContain('2026-08-01');
    expect(screen.queryByTestId('backup-verify-nudge')).toBeNull();
  });

  /**
   * §6.3.1: the point is not to change her mind about keeping everything, it
   * is to make sure "keep everything" stays a decision she has seen the size
   * of rather than a default from 2026 nobody revisited.
   */
  it('shows what keeping everything has grown into, and never offers to delete it', async () => {
    installFakeApi(
      {},
      {
        backup: {
          counts: { patients: 12, notes: 847, transcripts: 300 },
          oldest_note_at: '2026-01-04T09:00:00.000Z',
          db_bytes: 3_145_728,
        },
      },
    );
    renderCard();

    const summary = await screen.findByTestId('retention-summary');
    expect(summary.textContent).toContain('847 notes for 12 patients');
    expect(summary.textContent).toContain('300 transcripts');
    expect(summary.textContent).toContain('going back to 2026-01-04');
    expect(summary.textContent).toContain('3.0 MB');
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull();
  });

  it('keeps the main card to one line when all is well', async () => {
    installFakeApi(
      {},
      {
        backup: {
          last_backup_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
          stale: false,
          last_backup_error: null,
        },
      },
    );
    renderCard();

    const card = await screen.findByTestId('backup-card');
    expect(within(card).getByTestId('backup-last').textContent).toBe('Last backup: 3 hours ago');
    expect(within(card).getByTestId('backup-now')).toBeTruthy();
    expect(within(card).getByTestId('backup-restore')).toBeTruthy();
    // No warnings, and none of the details, on the main card.
    expect(within(card).queryByRole('alert')).toBeNull();
    expect(within(card).queryByTestId('backup-directory')).toBeNull();
    expect(within(card).queryByTestId('backup-list')).toBeNull();
  });

  it('says the folder shares a disk with the notes when it does, and not otherwise', async () => {
    installFakeApi();
    renderCard();
    expect((await screen.findByTestId('backup-same-disk')).textContent).toContain('USB drive');
    cleanup();

    installFakeApi(
      {},
      { backup: { destination: { risk: 'external', path: '/Volumes/Backup/Apunta', warning: '' } } },
    );
    renderCard();
    await screen.findByTestId('backup-directory');
    expect(screen.queryByTestId('backup-same-disk')).toBeNull();
  });

  /**
   * S2.4 Fixed decision 5: `BackupCard.tsx:393` is a sentence the literal
   * checker cannot see, and it is the one place a date must NOT be given a
   * `dateOnly` parameter — `instantToLocalDay` already returns a raw
   * `YYYY-MM-DD`, which is what the screen shows and what the case above
   * asserts. So the rendered line is the catalogue's English with the day
   * passed through as a stored value.
   */
  it('renders the tested-on date as the catalogue does, with the raw stored day', async () => {
    installFakeApi({}, { backup: { last_verified_restore: '2026-08-01T09:00:00.000Z' } });
    renderCard();

    expect((await screen.findByTestId('backup-verified')).textContent).toBe(
      t('backup.tested', { day: '2026-08-01' }),
    );
    // The key's own English, and the reason it is `text` and not `dateOnly`.
    expect(t('backup.tested', { day: '2026-08-01' }, 'en')).toBe('Restore last tested 2026-08-01.');
    expect(t('backup.tested', { day: '2026-08-01' }, 'es-MX')).toBe(
      'Restauración probada por última vez el 2026-08-01.',
    );
  });

  /**
   * The other pinned blind spot: `BackupCard.tsx:315-319` is one key with four
   * counts, and the counts are `String(…)` as the card always wrote them, so a
   * count of 1,000 is not regrouped on the way through the catalogue.
   */
  it('renders the retention line as the catalogue does, counts verbatim', async () => {
    installFakeApi(
      {},
      {
        backup: {
          counts: { patients: 12, notes: 847, transcripts: 300 },
          oldest_note_at: '2026-01-04T09:00:00.000Z',
          db_bytes: 3_145_728,
        },
      },
    );
    renderCard();

    expect((await screen.findByTestId('retention-summary')).textContent).toBe(
      t('backup.stored', {
        notes: '847',
        patients: '12',
        range: t('backup.storedRange', { day: '2026-01-04' }),
        transcripts: '300',
        bytes: '3.0 MB',
      }),
    );
    expect(
      t(
        'backup.stored',
        {
          notes: '1000',
          patients: '1',
          range: '',
          transcripts: '0',
          bytes: '1.0 KB',
        },
        'en',
      ),
    ).toBe('Stored: 1000 notes for 1 patients, 0 transcripts, 1.0 KB');
  });

  it('warns about losing a passphrase only once one is typed', async () => {
    installFakeApi();
    renderCard();

    const input = await screen.findByLabelText('Passphrase');
    expect(screen.queryByTestId('backup-passphrase-warning')).toBeNull();
    fireEvent.change(input, { target: { value: 'correct horse battery' } });
    expect(screen.getByTestId('backup-passphrase-warning').textContent).toContain('cannot be opened');
  });
});

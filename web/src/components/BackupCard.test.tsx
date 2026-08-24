import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BackupCard } from './BackupCard.js';
import { installFakeApi } from '../test/fakeApi.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderCard(): void {
  render(
    <MemoryRouter>
      <BackupCard />
    </MemoryRouter>,
  );
}

describe('the backup card', () => {
  it('says plainly that there is no backup yet', async () => {
    installFakeApi();
    renderCard();

    expect((await screen.findByTestId('backup-last')).textContent).toContain('No backup has been made yet');
  });

  /**
   * A backup that silently did not happen is the failure the whole feature
   * exists to prevent, so a stale timestamp must not read as a healthy one.
   */
  it('shows the age of a stale backup rather than only its date', async () => {
    installFakeApi({}, { backup: { last_backup_at: '2026-08-01T09:00:00.000Z', stale: true } });
    renderCard();

    const line = await screen.findByTestId('backup-last');
    expect(line.textContent).toContain('2026-08-01');
    expect(line.textContent).toContain('more than 7 days ago');
    expect(line.className).toContain('backup-stale');
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

    fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));
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

    expect((await screen.findByTestId('backup-pending')).textContent).toContain('Quit Apunta');
    expect(screen.getByRole('button', { name: 'Cancel it' })).toBeTruthy();
  });

  it('asks once whether a restore has ever actually been tried', async () => {
    installFakeApi();
    renderCard();

    expect((await screen.findByTestId('backup-verify-nudge')).textContent).toContain(
      'A backup nobody has restored is a guess',
    );
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
    expect(summary.textContent).toContain('going back to 2026-01-04');
    expect(summary.textContent).toContain('3.0 MB');
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull();
  });
});

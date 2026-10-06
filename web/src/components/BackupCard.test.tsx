import { t } from '@apunta/shared';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BackupSection, useBackup } from './BackupCard.js';
import { installFakeApi, type FakeApi } from '../test/fakeApi.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function Harness(): React.JSX.Element {
  const backup = useBackup();
  return <BackupSection backup={backup} />;
}

function renderCard(): void {
  render(
    <MemoryRouter>
      <Harness />
    </MemoryRouter>,
  );
}

/** The archive the fake folder holds. */
const ARCHIVE = {
  filename: 'apunta-backup-2026-08-20.zip',
  path: '/tmp/apunta/backups/apunta-backup-2026-08-20.zip',
  bytes: 65_536,
  created_at: '2026-08-20T09:00:00.000Z',
  encrypted: false,
};

/** What `GET /api/backup` should answer with, on top of the fake's own. */
function fake(backup: Record<string, unknown> = {}): FakeApi {
  return installFakeApi({}, { backup });
}

/**
 * What the last request of one kind sent. Scoped by method and path because a
 * reload follows every action, and the reload is a GET with no body.
 */
function lastBody(method: string, path: string): Record<string, unknown> {
  const sent = vi
    .mocked(globalThis.fetch)
    .mock.calls.filter(([url, init]) => url === path && (init?.method ?? 'GET') === method);
  const init = sent[sent.length - 1]?.[1];
  return typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {};
}

describe('the backup page', () => {
  /**
   * A backup takes minutes and a restore replaces what is here, so neither runs
   * off a single click. Cancelling is the half that has to be free of effects:
   * nothing is sent, and nothing changes.
   */
  it('asks before backing up, and backs up nothing until she says yes', async () => {
    const api = fake();
    renderCard();

    fireEvent.click(await screen.findByTestId('backup-now'));
    const dialog = await screen.findByRole('dialog');
    expect(api.calls).not.toContain('POST /api/backup');

    fireEvent.click(within(dialog).getByRole('button', { name: t('common.cancel') }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(api.calls).not.toContain('POST /api/backup');
    expect(screen.queryByTestId('backup-action-message')).toBeNull();
  });

  /**
   * There is no passphrase for a new archive any more — the research prefers an
   * encrypted disk the OS unlocks to a secret typed into a settings field — and
   * a backup that quietly kept asking for one would be the old behaviour.
   */
  it('never sends a passphrase when writing a backup, and offers no field for one', async () => {
    const api = fake();
    renderCard();

    fireEvent.click(await screen.findByTestId('backup-now'));
    fireEvent.click(within(await screen.findByRole('dialog')).getByTestId('confirm-accept'));
    await waitFor(() => {
      expect(api.calls).toContain('POST /api/backup');
    });
    expect(lastBody('POST', '/api/backup')).not.toHaveProperty('passphrase');
    expect(screen.queryByLabelText(t('backup.passphrase'))).toBeNull();
  });

  /**
   * A restore is the one control here that replaces what is on this computer, so
   * it names the archive it is about to bring back and asks first.
   */
  it('asks before restoring, names the archive, and restores nothing until she says yes', async () => {
    const api = fake({ backups: [ARCHIVE] });
    renderCard();

    fireEvent.click(await screen.findByTestId('backup-restore'));
    const dialog = await screen.findByRole('dialog');
    const picker = within(dialog).getByTestId('backup-restore-file') as HTMLSelectElement;
    expect(picker.value).toBe(ARCHIVE.path);
    expect(api.calls).not.toContain('POST /api/backup/restore');

    fireEvent.click(within(dialog).getByRole('button', { name: t('common.cancel') }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(api.calls).not.toContain('POST /api/backup/restore');
  });

  /**
   * An archive encrypted before the passphrase field left this page still has
   * to be openable from it, so the passphrase is asked for where the restore
   * happens — and only when one is given does the request carry one.
   */
  it('takes the passphrase of an encrypted archive in the restore dialog', async () => {
    const api = fake({ backups: [{ ...ARCHIVE, encrypted: true }] });
    renderCard();

    fireEvent.click(await screen.findByTestId('backup-restore'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByTestId('backup-restore-passphrase'), {
      target: { value: 'correct horse battery staple' },
    });
    fireEvent.click(within(dialog).getByTestId('confirm-accept'));

    await waitFor(() => {
      expect(api.calls).toContain('POST /api/backup/restore');
    });
    expect(lastBody('POST', '/api/backup/restore')).toMatchObject({
      file: ARCHIVE.path,
      passphrase: 'correct horse battery staple',
    });
  });

  it('has no restore to offer when the folder holds no archives', async () => {
    fake();
    renderCard();

    const restore = await screen.findByTestId('backup-restore');
    expect((restore as HTMLButtonElement).disabled).toBe(true);
  });

  it('lets a staged restore be called off before the restart, changing nothing', async () => {
    const api = fake({ pending_restore: true });
    renderCard();

    fireEvent.click(await screen.findByTestId('backup-restore'));
    fireEvent.click(screen.getByRole('button', { name: t('backup.cancelPending') }));

    await waitFor(() => {
      expect(api.calls).toContain('DELETE /api/backup/restore');
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });
});

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
  it('shows when the last backup ran and which folder it went to', async () => {
    fake({
      directory: '/Volumes/Backup/Apunta',
      last_backup_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
      stale: false,
    });
    renderCard();

    expect((await screen.findByTestId('backup-last')).textContent).not.toBe('');
    expect(screen.getByTestId('backup-directory').textContent).toBe('/Volumes/Backup/Apunta');
  });

  /**
   * A backup that silently did not happen is the failure the whole feature
   * exists to prevent, so a stale backup must not read as a healthy one.
   */
  it('marks a stale backup as stale and says so', async () => {
    fake({ last_backup_at: '2026-08-01T09:00:00.000Z', stale: true });
    renderCard();

    expect((await screen.findByTestId('backup-last')).className).toContain('backup-stale');
    expect(screen.getByTestId('backup-stale')).toBeTruthy();
  });

  it('surfaces a failed attempt as a failure', async () => {
    fake({ last_backup_error: '2026-08-24T09:00:00.000Z — the disk is full' });
    renderCard();

    expect((await screen.findByTestId('backup-error')).textContent).toContain('the disk is full');
  });

  it('warns when backups are going somewhere a sync service watches', async () => {
    fake({
      destination: {
        risk: 'sync',
        path: '/Users/her/Documents/Apunta',
        warning: 'Documents is synced to the cloud on a typical Mac',
      },
    });
    renderCard();

    expect((await screen.findByTestId('backup-destination-warning')).textContent).toContain(
      'synced to the cloud',
    );
  });

  it('says the folder shares a disk with the notes when it does, and not otherwise', async () => {
    fake();
    renderCard();
    await screen.findByTestId('backup-same-disk');
    cleanup();

    fake({ destination: { risk: 'external', path: '/Volumes/Backup/Apunta', warning: '' } });
    renderCard();
    await screen.findByTestId('backup-directory');
    expect(screen.queryByTestId('backup-same-disk')).toBeNull();
  });

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

  it('backs up once the question is answered, and reports what went into it', async () => {
    const api = fake();
    renderCard();

    fireEvent.click(await screen.findByTestId('backup-now'));
    fireEvent.click(within(await screen.findByRole('dialog')).getByTestId('confirm-accept'));

    await waitFor(() => {
      expect(screen.getByTestId('backup-action-message').textContent).toContain('4 notes');
    });
    expect(api.calls).toContain('POST /api/backup');
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
   * The destination is not a field that is always on screen: she opens the
   * editor, and saving is the `remember` the folder has always used, so the
   * destination survives every later backup.
   */
  it('backs up to — and remembers — the folder she typed', async () => {
    const api = fake();
    renderCard();

    expect(screen.queryByTestId('backup-location-editor')).toBeNull();
    fireEvent.click(await screen.findByTestId('backup-change-location'));

    const editor = screen.getByTestId('backup-location-editor');
    fireEvent.change(within(editor).getByLabelText(t('backup.changeFolder')), {
      target: { value: '/Volumes/Backup/Apunta' },
    });
    fireEvent.click(within(editor).getByTestId('backup-save-location'));

    await waitFor(() => {
      expect(api.calls).toContain('POST /api/backup');
    });
    expect(lastBody('POST', '/api/backup')).toMatchObject({
      directory: '/Volumes/Backup/Apunta',
      remember: true,
    });
    // …and the editor is out of the way again, so the page is the page.
    expect(screen.queryByTestId('backup-location-editor')).toBeNull();
  });

  it('cannot save a folder that is blank', async () => {
    const api = fake();
    renderCard();

    fireEvent.click(await screen.findByTestId('backup-change-location'));
    const editor = screen.getByTestId('backup-location-editor');
    // The editor opens on the saved folder, so blanking it is the only way
    // this can happen — and then it must not go anywhere.
    fireEvent.change(within(editor).getByLabelText(t('backup.changeFolder')), { target: { value: '  ' } });
    const save = within(editor).getByTestId('backup-save-location');
    expect((save as HTMLButtonElement).disabled).toBe(true);
    expect(api.calls).not.toContain('POST /api/backup');
  });

  /**
   * She is editing the destination she already has, not a blank field: it is
   * prefilled from the status, whatever she types while it is open stays put,
   * and cancelling puts the saved destination back rather than the try-out.
   */
  it('prefills the folder editor with the saved destination, and resets it after a cancel', async () => {
    const api = fake({ directory: '/Volumes/Backup/Apunta' });
    renderCard();

    await screen.findByTestId('backup-directory');
    fireEvent.click(screen.getByTestId('backup-change-location'));

    const input = within(screen.getByTestId('backup-location-editor')).getByLabelText(
      t('backup.changeFolder'),
    ) as HTMLInputElement;
    expect(input.value).toBe('/Volumes/Backup/Apunta');

    // A try-out that goes nowhere: typing edits what is there, it does not
    // replace it with an empty field.
    fireEvent.change(input, { target: { value: '/Volumes/Backup/Apunta/2026' } });
    expect(input.value).toBe('/Volumes/Backup/Apunta/2026');

    fireEvent.click(
      within(screen.getByTestId('backup-location-editor')).getByRole('button', {
        name: t('common.cancel'),
      }),
    );
    expect(screen.queryByTestId('backup-location-editor')).toBeNull();

    // Reopening offers the saved destination again, not the abandoned try-out,
    // and nothing was backed up on the way.
    fireEvent.click(screen.getByTestId('backup-change-location'));
    const again = within(screen.getByTestId('backup-location-editor')).getByLabelText(
      t('backup.changeFolder'),
    ) as HTMLInputElement;
    expect(again.value).toBe('/Volumes/Backup/Apunta');
    expect(api.calls).not.toContain('POST /api/backup');
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
    expect(picker.value).toBe(ARCHIVE.filename);
    expect(api.calls).not.toContain('POST /api/backup/restore');

    fireEvent.click(within(dialog).getByRole('button', { name: t('common.cancel') }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(api.calls).not.toContain('POST /api/backup/restore');
  });

  it('restores the archive she picked, and says where the current notes went', async () => {
    const api = fake({ backups: [ARCHIVE] });
    renderCard();

    fireEvent.click(
      within(await screen.findByTestId('backup-list')).getByRole('button', { name: t('backup.restore') }),
    );
    fireEvent.click(within(await screen.findByRole('dialog')).getByTestId('confirm-accept'));

    await waitFor(() => {
      expect(api.calls).toContain('POST /api/backup/restore');
    });
    // A restore is exactly when someone discovers they picked the wrong archive.
    expect((await screen.findByTestId('backup-action-message')).textContent).toContain('before-restore');
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
      file: ARCHIVE.filename,
      passphrase: 'correct horse battery staple',
    });
  });

  it('has no restore to offer when the folder holds no archives', async () => {
    fake();
    renderCard();

    const restore = await screen.findByTestId('backup-restore');
    expect((restore as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('backup-empty')).toBeTruthy();
  });

  it('lets a staged restore be called off before the restart, changing nothing', async () => {
    const api = fake({ pending_restore: true });
    renderCard();

    await screen.findByTestId('backup-pending');
    fireEvent.click(screen.getByRole('button', { name: t('backup.cancelPending') }));

    await waitFor(() => {
      expect(api.calls).toContain('DELETE /api/backup/restore');
    });
    expect((await screen.findByTestId('backup-action-message')).textContent).toContain('Nothing changed');
  });

  /**
   * §6.3.1: the point is not to change her mind about keeping everything, it
   * is to make sure "keep everything" stays a decision she has seen the size
   * of rather than a default from 2026 nobody revisited.
   */
  it('shows what keeping everything has grown into, and never offers to delete it', async () => {
    fake({
      counts: { patients: 12, notes: 847, transcripts: 300 },
      oldest_note_at: '2026-01-04T09:00:00.000Z',
      db_bytes: 3_145_728,
    });
    renderCard();

    const summary = await screen.findByTestId('retention-summary');
    expect(summary.textContent).toContain('847');
    expect(summary.textContent).toContain('12');
    expect(summary.textContent).toContain('3.0 MB');
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull();
  });

  it('asks whether a restore has ever actually been tried, and stops once told', async () => {
    const api = fake();
    renderCard();

    fireEvent.click(within(await screen.findByTestId('backup-verify-nudge')).getByRole('button'));
    await waitFor(() => {
      expect(api.calls).toContain('POST /api/backup/verified');
    });
    expect((await screen.findByTestId('backup-action-message')).textContent).not.toBe('');

    cleanup();
    fake({ last_verified_restore: '2026-08-01T09:00:00.000Z' });
    renderCard();
    await screen.findByTestId('backup-verified');
    expect(screen.queryByTestId('backup-verify-nudge')).toBeNull();
  });
});

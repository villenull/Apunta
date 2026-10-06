import { CreateBackupResponseSchema } from '@apunta/shared';
import type { Page } from '@playwright/test';

import { expect, test, uniqueName } from '../support/fixtures';

/**
 * Back up and restore, through the built app (M7 deliverable 4).
 *
 * The unit suite proves the archive restores; this proves the screen does what
 * it says — it asks before it writes or replaces anything, the archive exists
 * by the time the button stops spinning, and the restore says it needs a
 * restart rather than implying it already happened.
 *
 * The e2e database is shared across specs and a backup is a snapshot of all of
 * it, so nothing here asserts on counts of notes. It asserts on the two things
 * that are about *this* feature: that a file appears, and that the copy is
 * honest.
 *
 * The page keeps only the last-backup summary and the clickable destination.
 * Archive selection and pending-restore controls live in the restore dialog.
 */

/**
 * Settings is a modal over the workspace (owner, 2026-10-05), so the cases
 * below open it from "More" and click straight to the section. A practice with
 * no note format is a first run: the app opens on onboarding instead of the
 * workspace, and there is no "More" to open Settings from — Settings is a
 * window over the workspace, so it needs one.
 */
test.beforeEach(async ({ request }) => {
  await request.post('/api/formats', {
    data: { name: uniqueName('E2E Backup format'), sections: ['Subjective', 'Plan'] },
  });
});

async function openSettings(page: Page, section: string): Promise<void> {
  // Called again to move between sections, so the modal is only opened when it
  // is not already there.
  if ((await page.getByTestId('settings-modal').count()) === 0) {
    await page.getByTestId('mission-control').click();
    await page.getByTestId('mission-settings').click();
  }
  await expect(page.getByTestId('settings-modal')).toBeVisible();
  await page.getByTestId(`settings-tab-${section}`).click();
}

/**
 * The "Are you sure?" window, scoped by the backdrop its `ConfirmDialog` draws
 * rather than by role: Settings is itself a dialog, so `getByRole('dialog')`
 * on this screen is two elements and strict mode refuses.
 */
function areYouSure(page: Page) {
  return page.getByTestId('confirm-backdrop').getByRole('dialog');
}

interface Created {
  id: string;
}

test.describe('back up and restore', () => {
  test('writes an archive that exists by the time it answers', async ({ page, request, tr, checkScreen }) => {
    const patient = (await (
      await request.post('/api/patients', { data: { name: uniqueName('E2E Backup') } })
    ).json()) as Created;
    expect(patient.id).toBeTruthy();

    await page.goto('/');
    await openSettings(page, 'backup');
    await expect(page.getByTestId('backup-card')).toBeVisible();

    await page.getByTestId('backup-now').click();
    await checkScreen(page, 'Settings, Backup, asking to back up');
    const written = page.waitForResponse(
      (response) => response.request().method() === 'POST' && response.url().endsWith('/api/backup'),
    );
    await page.getByTestId('confirm-accept').click();

    const result = CreateBackupResponseSchema.parse(await (await written).json());
    const status = (await (await request.get('/api/backup')).json()) as { backups: { path: string }[] };
    expect(status.backups.some((archive) => archive.path === result.file.path)).toBe(true);
    await checkScreen(page, 'Settings after a backup');
    await expect(page.getByTestId('backup-last')).not.toContainText(tr('backup.noneYet'));
    await checkScreen(page, 'Settings, Backup, after an archive exists');
  });

  /**
   * A backup is minutes of work she did not ask for, so the button asks first.
   * What makes this more than a caption is the request either side of the
   * cancel: "changing her mind writes nothing" is a fact about the server, and
   * it is checked by watching for the call rather than by counting archives,
   * which the folder shares with every other spec in the run.
   */
  test('asks before it writes, and cancelling sends no backup at all', async ({
    page,
    tr,
    trRe,
    checkScreen,
  }) => {
    await page.goto('/');
    await openSettings(page, 'backup');
    await expect(page.getByTestId('backup-card')).toBeVisible();

    const writes: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/api/backup')) writes.push(request.url());
    });

    await page.getByTestId('backup-now').click();
    const dialog = areYouSure(page);
    await expect(dialog).toContainText(tr('backup.confirmTitle'));
    await expect(dialog).toContainText(trRe('backup.confirmBackupBody'));
    await checkScreen(page, 'Settings, Backup, the confirmation');

    await dialog.getByRole('button', { name: tr('common.cancel') }).click();

    await expect(areYouSure(page)).toHaveCount(0);
    // Nothing ran: no answer was written for the app to report.
    await expect(page.getByTestId('backup-action-message')).toHaveCount(0);
    expect(writes).toEqual([]);
  });

  test('browsing and cancelling leaves the backup location unchanged', async ({ page, tr, checkScreen }) => {
    await page.goto('/');
    await openSettings(page, 'backup');

    const directory = page.getByTestId('backup-directory');
    const savedDirectory = await directory.textContent();
    await checkScreen(page, 'Settings, Backup');

    await directory.click();
    const editor = page.getByTestId('backup-folder-picker');
    await expect(editor).toBeVisible();
    await expect(page.getByTestId('backup-picker-path')).toBeVisible();

    // And calling the editor off leaves the folder where it was.
    await editor.getByRole('button', { name: tr('common.cancel') }).click();
    await expect(editor).toHaveCount(0);
    await expect(directory).toHaveText(savedDirectory ?? '');
  });

  /**
   * A restore replaces what is here, so it asks, it names the archive it is
   * about to bring back, and it says what finishing it takes rather than
   * implying the notes are already back. The passphrase is part of that
   * question and not of Settings: an archive encrypted before the passphrase
   * field left this section is still restorable, and the only person who needs
   * the passphrase is the one restoring — so it is typed here.
   *
   * The archive is written through the API with a passphrase because the app
   * no longer offers a way to make one, and the file it returns is the one
   * restored rather than the dialog's default: the folder is shared with every
   * other spec in the run, so "the newest" is not a fact about this test.
   *
   * This is the one test that stages a restore, because a staged restore is
   * global state on the server: two of them in a parallel run would undo each
   * other.
   */
  test('a staged restore asks, names the archive, and says to quit and reopen', async ({
    page,
    request,
    tr,
    trRe,
    checkScreen,
  }) => {
    const passphrase = 'e2e-archive-passphrase';
    const created = await request.post('/api/backup', { data: { passphrase } });
    expect(created.ok(), 'POST /api/backup with a passphrase').toBe(true);
    const { file } = CreateBackupResponseSchema.parse(await created.json());
    expect(file.encrypted).toBe(true);

    await page.goto('/');
    await openSettings(page, 'backup');

    await page.getByTestId('backup-restore').click();
    const dialog = areYouSure(page);
    // The dialog names the archive it is about to bring back: a bare Restore
    // that did not say which one would leave her guessing.
    await expect(dialog).toContainText(trRe('backup.confirmRestoreBody'));
    await page.getByTestId('backup-restore-file').selectOption(file.path);
    await page.getByTestId('backup-restore-passphrase').fill(passphrase);
    await checkScreen(page, 'Settings, Backup, the restore confirmation');

    await page.getByTestId('confirm-accept').click();

    // The right passphrase opens the archive, and the restore stages rather
    // than pretending it has already happened.
    const result = page.getByTestId('backup-restore-result');
    await expect(result).toContainText(trRe('backup.restoreReady'));
    await expect(result).toContainText('before-restore');
    await checkScreen(page, 'Settings with a restore staged');
    await result.getByRole('button', { name: tr('common.dismiss') }).click();
    await page.getByTestId('backup-restore').click();
    await areYouSure(page)
      .getByRole('button', { name: tr('backup.cancelPending') })
      .click();
    await expect(areYouSure(page)).toHaveCount(0);
    const status = (await (await request.get('/api/backup')).json()) as { pending_restore: boolean };
    expect(status.pending_restore).toBe(false);
  });
});

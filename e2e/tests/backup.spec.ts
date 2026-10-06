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
 * Everything is on the Backup section since the Settings redesign (owner,
 * 2026-10-05): the folder, the archives, the restore-verification question and
 * the size of what is kept moved off Advanced, which is gone. The three
 * controls that guard her data — Back up now, Change backup location, Restore —
 * are a row of their own at the top of that section, and the first and the
 * last ask before they act.
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
  test('writes an archive that exists by the time it answers', async ({
    page,
    request,
    tr,
    trRe,
    checkScreen,
  }) => {
    const patient = (await (
      await request.post('/api/patients', { data: { name: uniqueName('E2E Backup') } })
    ).json()) as Created;
    expect(patient.id).toBeTruthy();

    await page.goto('/');
    await openSettings(page, 'backup');
    await expect(page.getByTestId('backup-card')).toBeVisible();

    await page.getByTestId('backup-now').click();
    await checkScreen(page, 'Settings, Backup, asking to back up');
    await page.getByTestId('confirm-accept').click();

    await expect(page.getByTestId('backup-action-message')).toContainText(trRe('backup.done'));
    await checkScreen(page, 'Settings after a backup');
    // The archive is on the same section as the button that wrote it, and the
    // last-backup line stops saying there has never been one.
    await expect(page.getByTestId('backup-list')).toContainText('apunta-backup-');
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

  /**
   * The folder is the one line of this section she has to be able to read,
   * "Change backup location" opens an editor for it rather than replacing the
   * path with a field she could save by accident, and a backup that has never
   * been restored says so once rather than never.
   */
  test('shows the folder it is backing up to, and edits it in an editor', async ({
    page,
    tr,
    checkScreen,
  }) => {
    await page.goto('/');
    await openSettings(page, 'backup');

    const directory = page.getByTestId('backup-directory');
    await expect(directory).toContainText('backups');
    // A backup nobody has ever restored is a hypothesis, and it is asked once.
    await expect(page.getByTestId('backup-verify-nudge')).toContainText(tr('backup.neverTested'));
    await checkScreen(page, 'Settings, Backup');

    await page.getByTestId('backup-change-location').click();
    const editor = page.getByTestId('backup-location-editor');
    await expect(editor).toBeVisible();
    // It is her folder in the field, not an empty one she would have to retype.
    await expect(editor.locator('input')).toHaveValue((await directory.textContent()) ?? '');

    // And calling the editor off leaves the folder where it was.
    await editor.getByRole('button', { name: tr('common.cancel') }).click();
    await expect(editor).toHaveCount(0);
    await expect(directory).toContainText('backups');
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
    await expect(page.getByTestId('backup-list')).toContainText(file.filename);

    await page.getByTestId('backup-restore').click();
    const dialog = areYouSure(page);
    // The dialog names the archive it is about to bring back: a bare Restore
    // that did not say which one would leave her guessing.
    await expect(dialog).toContainText(trRe('backup.confirmRestoreBody'));
    await page.getByTestId('backup-restore-file').selectOption(file.filename);
    await page.getByTestId('backup-restore-passphrase').fill(passphrase);
    await checkScreen(page, 'Settings, Backup, the restore confirmation');

    await page.getByTestId('confirm-accept').click();

    // The right passphrase opens the archive, and the restore stages rather
    // than pretending it has already happened.
    await expect(page.getByTestId('backup-action-message')).toContainText(trRe('backup.restoreReady'));
    await expect(page.getByTestId('backup-action-message')).toContainText('before-restore');
    await expect(page.getByTestId('backup-pending')).toBeVisible();
    await checkScreen(page, 'Settings with a restore staged');

    // …and it can be called off before the restart, leaving nothing changed.
    await page.getByRole('button', { name: tr('backup.cancelPending') }).click();
    await expect(page.getByTestId('backup-action-message')).toContainText(tr('backup.restoreCancelled'));
    await expect(page.getByTestId('backup-pending')).toHaveCount(0);
  });

  test('shows what keeping everything has grown into, and offers no way to delete it', async ({
    page,
    trRe,
  }) => {
    await page.goto('/');
    await openSettings(page, 'backup');

    await expect(page.getByTestId('retention-summary')).toContainText(trRe('backup.stored'));
    // Keeping everything is a decision she has seen the size of, and this
    // section has no control that would throw any of it away.
    await expect(page.getByTestId('backup-card').getByRole('button', { name: /delete/i })).toHaveCount(0);
  });
});

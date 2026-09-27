import { expect, test, uniqueName } from '../support/fixtures';

/**
 * Back up and restore, through the built app (M7 deliverable 4).
 *
 * The unit suite proves the archive restores; this proves the screen does what
 * it says — the archive exists by the time the button stops spinning, and the
 * restore says it needs a restart rather than implying it already happened.
 *
 * The e2e database is shared across specs and a backup is a snapshot of all of
 * it, so nothing here asserts on counts. It asserts on the two things that are
 * about *this* feature: that a file appears, and that the copy is honest.
 */

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

    await page.goto('/settings');
    await expect(page.getByTestId('backup-card')).toBeVisible();

    await page.getByTestId('backup-now').click();

    await expect(page.getByTestId('backup-action-message')).toContainText(trRe('backup.done'));
    await checkScreen(page, 'Settings after a backup');
    // The archives live under Advanced.
    await page.getByTestId('settings-advanced').locator('summary').click();
    await expect(page.getByTestId('backup-list')).toContainText('apunta-backup-');
    // The last-backup line stops saying there has never been one.
    await expect(page.getByTestId('backup-last')).not.toContainText(tr('backup.noneYet'));
    await checkScreen(page, 'Settings, Advanced open, with archives');
  });

  test('keeps the folder under Advanced and asks once whether a restore was tried', async ({
    page,
    tr,
    checkScreen,
  }) => {
    await page.goto('/settings');

    // The main card is one line: no folder, no archives, no prose.
    await expect(page.getByTestId('backup-card')).not.toContainText('backups');
    await page.getByTestId('settings-advanced').locator('summary').click();

    await expect(page.getByTestId('backup-directory')).toContainText('backups');
    // And it asks, once, whether a restore has ever actually been tried.
    await expect(page.getByTestId('backup-verify-nudge')).toContainText(tr('backup.neverTested'));
    await checkScreen(page, 'Settings, Advanced open');
  });

  test('a staged restore says to quit and reopen rather than pretending it happened', async ({
    page,
    tr,
    trRe,
    checkScreen,
  }) => {
    await page.goto('/settings');
    await page.getByTestId('backup-now').click();
    await page.getByTestId('settings-advanced').locator('summary').click();
    await expect(page.getByTestId('backup-list')).toContainText('apunta-backup-');

    await page
      .getByTestId('backup-list')
      .getByRole('button', { name: tr('backup.restore') })
      .first()
      .click();

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
    tr,
    trRe,
  }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-advanced').locator('summary').click();

    await expect(page.getByTestId('retention-summary')).toContainText(trRe('backup.stored'));
    await expect(page.getByRole('button', { name: new RegExp(tr('patients.delete'), 'i') })).toHaveCount(0);
  });
});

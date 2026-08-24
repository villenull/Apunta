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
  test('writes an archive that exists by the time it answers', async ({ page, request }) => {
    const patient = (await (
      await request.post('/api/patients', { data: { name: uniqueName('E2E Backup') } })
    ).json()) as Created;
    expect(patient.id).toBeTruthy();

    await page.goto('/settings');
    await expect(page.getByTestId('backup-card')).toBeVisible();

    await page.getByTestId('backup-now').click();

    await expect(page.getByTestId('backup-action-message')).toContainText('checked and intact');
    await expect(page.getByTestId('backup-list')).toContainText('apunta-backup-');
    // The last-backup line stops saying there has never been one.
    await expect(page.getByTestId('backup-last')).not.toContainText('No backup has been made yet');
  });

  test('names the folder and does not call it enough on its own', async ({ page }) => {
    await page.goto('/settings');

    await expect(page.getByTestId('backup-directory')).toContainText('backups');
    await expect(page.getByTestId('backup-card')).toContainText('not a lost laptop');
    // And it asks, once, whether a restore has ever actually been tried.
    await expect(page.getByTestId('backup-verify-nudge')).toContainText(
      'A backup nobody has restored is a guess',
    );
  });

  test('a staged restore says to quit and reopen rather than pretending it happened', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('backup-now').click();
    await expect(page.getByTestId('backup-list')).toContainText('apunta-backup-');

    await page.getByTestId('backup-list').getByRole('button', { name: 'Restore' }).first().click();

    await expect(page.getByTestId('backup-action-message')).toContainText('Quit Apunta and open it again');
    await expect(page.getByTestId('backup-action-message')).toContainText('before-restore');
    await expect(page.getByTestId('backup-pending')).toBeVisible();

    // …and it can be called off before the restart, leaving nothing changed.
    await page.getByRole('button', { name: 'Cancel it' }).click();
    await expect(page.getByTestId('backup-action-message')).toContainText('Nothing changed');
    await expect(page.getByTestId('backup-pending')).toHaveCount(0);
  });

  test('shows what keeping everything has grown into, and offers no way to delete it', async ({ page }) => {
    await page.goto('/settings');

    await expect(page.getByTestId('retention-summary')).toContainText('notes for');
    await expect(page.getByTestId('backup-card')).toContainText('Nothing here is ever deleted on a timer');
  });
});

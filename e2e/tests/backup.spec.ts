import type { Page } from '@playwright/test';

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

/**
 * Settings is a modal over the workspace (owner, 2026-10-05), and Advanced is
 * a plain open section rather than a disclosure — so the cases below open the
 * modal from "More" and click straight to the tab.
 */
/**
 * A practice with no note format is a first run: the app opens on onboarding
 * instead of the workspace, and there is no "More" to open Settings from —
 * Settings is a window over the workspace (owner, 2026-10-05), so it needs one.
 * Every spec that opens the workspace seeds a format for the same reason.
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

    await expect(page.getByTestId('backup-action-message')).toContainText(trRe('backup.done'));
    await checkScreen(page, 'Settings after a backup');
    // The archives live under Advanced, and the last-backup line is on the
    // card: the modal shows one section at a time (owner, 2026-10-05), so each
    // is read on the tab it is on rather than on one long settings page.
    await openSettings(page, 'advanced');
    await expect(page.getByTestId('backup-list')).toContainText('apunta-backup-');
    await checkScreen(page, 'Settings, Advanced, with archives');
    // The last-backup line stops saying there has never been one.
    await openSettings(page, 'backup');
    await expect(page.getByTestId('backup-last')).not.toContainText(tr('backup.noneYet'));
    await checkScreen(page, 'Settings, Backup, after an archive exists');
  });

  test('keeps the folder under Advanced and asks once whether a restore was tried', async ({
    page,
    tr,
    checkScreen,
  }) => {
    await page.goto('/');
    await openSettings(page, 'backup');

    // The main card is one line: no folder, no archives, no prose.
    await expect(page.getByTestId('backup-card')).not.toContainText('backups');
    await openSettings(page, 'advanced');

    await expect(page.getByTestId('backup-directory')).toContainText('backups');
    // And it asks, once, whether a restore has ever actually been tried.
    await expect(page.getByTestId('backup-verify-nudge')).toContainText(tr('backup.neverTested'));
    await checkScreen(page, 'Settings, Advanced');
  });

  test('a staged restore says to quit and reopen rather than pretending it happened', async ({
    page,
    tr,
    trRe,
    checkScreen,
  }) => {
    await page.goto('/');
    await openSettings(page, 'backup');
    await page.getByTestId('backup-now').click();
    await openSettings(page, 'advanced');
    await expect(page.getByTestId('backup-list')).toContainText('apunta-backup-');

    await page
      .getByTestId('backup-list')
      .getByRole('button', { name: tr('backup.restore') })
      .first()
      .click();

    await expect(page.getByTestId('backup-action-message')).toContainText(trRe('backup.restoreReady'));
    await expect(page.getByTestId('backup-action-message')).toContainText('before-restore');
    // The pending line and its way out are on the card, not under Advanced.
    await openSettings(page, 'backup');
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
    await page.goto('/');
    await openSettings(page, 'advanced');

    await expect(page.getByTestId('retention-summary')).toContainText(trRe('backup.stored'));
    await expect(page.getByRole('button', { name: new RegExp(tr('patients.delete'), 'i') })).toHaveCount(0);
  });
});

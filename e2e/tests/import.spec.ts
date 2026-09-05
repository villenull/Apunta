import { fileURLToPath } from 'node:url';

import { expect, test, uniqueName } from '../support/fixtures';

/**
 * Importing a Claude export, end to end through the real server (M11).
 *
 * The fixture is a fabricated export with the prototype's names. What this
 * proves that the unit tests cannot: the file goes up through the browser's
 * multipart path, the proposals come back, a person can be renamed and others
 * unticked, and what lands in the patient list is exactly what was accepted —
 * two notes for one renamed patient, nothing for the recipe or for the
 * people she unticked.
 */
const EXPORT = fileURLToPath(new URL('../fixtures/claude-export/sample-export.zip', import.meta.url));

test.describe('importing from Claude', () => {
  test('turns accepted conversations into a patient with notes, and nothing else', async ({ page }) => {
    const name = uniqueName('Imported Person');

    await page.goto('/settings');
    await page.getByTestId('settings-import').click();
    await expect(page.getByRole('heading', { name: 'Import from Claude' })).toBeVisible();

    await page.getByTestId('import-file').setInputFiles(EXPORT);
    await expect(page.getByTestId('import-summary')).toContainText('5 conversations');

    // Three names were offered. Rename the one that is a patient, untick the
    // others; the recipe was never assigned to anyone.
    await page.getByLabel('Name for John Smith').fill(name);
    await page.getByLabel('Import Jane Doe as a patient').uncheck();
    await page.getByLabel('Import Emily as a patient').uncheck();
    await expect(page.getByTestId('import-accept')).toHaveText('Import 2 notes');

    // Claude's replies are visible on request and marked as not imported.
    await expect(page.getByText('What Claude replied — shown, never imported').first()).toBeVisible();

    await page.getByTestId('import-accept').click();
    await expect(page.getByTestId('import-done')).toContainText('2 notes for 1 patient (1 new)');

    await page.getByRole('link', { name: 'Go to patients' }).click();
    await page.getByText(name).click();
    const list = page.getByTestId('note-list');
    await expect(list).toContainText('John session notes');
    await expect(list).toContainText('John again');
    await expect(list).not.toContainText('Recipe');
  });
});

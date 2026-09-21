import { fileURLToPath } from 'node:url';

import { expect, test } from '../support/fixtures';

/**
 * Importing a Claude export automatically, end to end through the real
 * server (M11). The fixture is fabricated with the prototype's names; see
 * `server/src/import/claude.test.ts` for what each conversation in it is for.
 *
 * What this proves that the unit tests cannot: the file and the settings go
 * up through the browser's multipart path twice (preview, then run), a
 * patient she unticks is not written, the patients land in the list, and
 * the one-click undo takes the whole run back.
 */
const EXPORT = fileURLToPath(new URL('../fixtures/claude-export/patient-chats.json', import.meta.url));

test.describe('importing from Claude', () => {
  test('imports the patients seen since the cutoff, and undoes it in one click', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-import').click();
    await expect(page.getByRole('heading', { name: 'Import from Claude' })).toBeVisible();
    await expect(page.getByTestId('import-cutoff')).toHaveValue('2026-07-01');

    await page.getByTestId('import-file').setInputFiles(EXPORT);
    await page.getByTestId('import-check').click();
    await expect(page.getByTestId('import-summary')).toContainText('7 notes across 3 patients');

    // A glance, not a review: untick one, and the button says what is left.
    await page.getByLabel('Import Maria (2)').uncheck();
    await expect(page.getByTestId('import-run')).toHaveText('Import 5 notes');
    await page.getByTestId('import-run').click();
    await expect(page.getByTestId('import-done')).toContainText('5 notes for 2 patients');
    await expect(page.getByTestId('import-skipped')).toContainText('not a patient history');
    await expect(page.getByTestId('import-skipped')).not.toContainText('Garden');

    await page.getByTestId('import-undo').click();
    await expect(page.getByTestId('import-undone')).toContainText('5 notes and 2 patients removed');
  });
});

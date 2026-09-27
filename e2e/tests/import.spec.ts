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
  test('imports the patients seen since the cutoff, and undoes it in one click', async ({
    page,
    tr,
    checkScreen,
  }) => {
    // The counts the sentences below are built from, in the project's words.
    const notes = (count: number): string => tr('count.note', { count });
    const patients = (count: number): string => tr('count.patient', { count });
    // Import is a first-level row in the workspace's "More" menu, not a section
    // of Settings (owner, 2026-09-27). The import screens themselves are
    // untouched — only where she starts them moved.
    await page.goto('/');
    await page.getByTestId('mission-control').click();
    await page.getByTestId('mission-import').click();
    await expect(page.getByRole('heading', { name: tr('doc.importClaude') })).toBeVisible();
    await expect(page.getByTestId('import-cutoff')).toHaveValue('2026-07-01');
    await checkScreen(page, 'Import from Claude');

    await page.getByTestId('import-file').setInputFiles(EXPORT);
    await page.getByTestId('import-check').click();
    const summary = page.getByTestId('import-summary');
    await expect(summary).toContainText(notes(7));
    await expect(summary).toContainText(patients(3));
    await checkScreen(page, 'the Claude import preview');

    // A glance, not a review: untick one, and the button says what is left.
    await page.getByLabel(tr('import.patientLabel', { name: 'Maria (2)' })).uncheck();
    await expect(page.getByTestId('import-run')).toHaveText(tr('import.runLabel', { notes: notes(5) }));
    await page.getByTestId('import-run').click();
    await expect(page.getByTestId('import-done')).toContainText(`${notes(5)}`);
    await expect(page.getByTestId('import-done')).toContainText(patients(2));
    await expect(page.getByTestId('import-skipped')).toContainText(tr('import.skip.singleSession'));
    await checkScreen(page, 'the Claude import report');
    await expect(page.getByTestId('import-skipped')).not.toContainText('Garden');

    await page.getByTestId('import-undo').click();
    await expect(page.getByTestId('import-undone')).toContainText(
      tr('import.undoneLine', { notes: notes(5), patients: patients(2) }),
    );
    await checkScreen(page, 'the Claude import, undone');
  });
});

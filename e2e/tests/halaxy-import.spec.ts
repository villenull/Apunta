import { fileURLToPath } from 'node:url';

import { expect, test, uniqueName } from '../support/fixtures';

const PDF = fileURLToPath(new URL('../fixtures/halaxy/john-smith.pdf', import.meta.url));

test.describe('importing from Halaxy', () => {
  test('reviews sessions, imports published history, and undoes it', async ({
    page,
    request,
    tr,
    checkScreen,
  }) => {
    // The counts the sentences below are built from, in the project's words.
    const noteCount = (count: number): string => tr('count.note', { count });
    const patientCount = (count: number): string => tr('count.patient', { count });
    await request.post('/api/formats', {
      data: { name: 'Halaxy e2e format', sections: ['Session'] },
    });
    await page.goto('/settings');
    await page.getByTestId('settings-import-halaxy').click();
    await expect(page.getByRole('heading', { name: tr('doc.importHalaxy') })).toBeVisible();
    await checkScreen(page, 'Import from Halaxy');

    await page.getByTestId('halaxy-files').setInputFiles(PDF);
    await page.getByTestId('halaxy-check').click();
    await expect(page.getByTestId('halaxy-summary')).toContainText(
      tr('halaxy.summaryLine', { notes: noteCount(3), patients: patientCount(1) }),
    );
    await checkScreen(page, 'the Halaxy import preview');

    const patientName = uniqueName('John Doe Halaxy');
    await page.getByTestId('halaxy-patient-name').fill(patientName);
    await page.getByTestId('halaxy-note').nth(0).uncheck();
    await expect(page.getByTestId('halaxy-run')).toHaveText(tr('import.runLabel', { notes: noteCount(2) }));
    await page.getByTestId('halaxy-run').click();

    await expect(page.getByTestId('halaxy-done')).toContainText(
      tr('halaxy.doneLine', { notes: noteCount(2), patients: patientCount(1) }),
    );
    await checkScreen(page, 'the Halaxy import report');
    await page.getByRole('link', { name: tr('import.goToPatients') }).click();
    await expect(page.getByTestId('patient-list')).toContainText(patientName);
    await page.waitForTimeout(500);
    const patientNameElement = page
      .getByTestId('patient-list')
      .locator('.name')
      .filter({ hasText: patientName });
    await expect(patientNameElement).toBeVisible();
    await patientNameElement.click();
    const patientsResponse = await request.get('/api/patients');
    expect(patientsResponse.ok()).toBeTruthy();
    const patients = (await patientsResponse.json()) as {
      patients: { name: string; note_count: number }[];
    };
    expect(patients.patients.find((patient) => patient.name === patientName)).toMatchObject({
      name: patientName,
      note_count: 2,
    });

    await page.goto('/import/halaxy');
    await expect(page.getByTestId('halaxy-batches')).toBeVisible();
    await checkScreen(page, 'Import from Halaxy, with an earlier import');
    await page
      .getByTestId('halaxy-batches')
      .getByRole('button', { name: tr('common.undo') })
      .first()
      .click();
    await expect(page.getByTestId('halaxy-undone')).toContainText(
      tr('import.undoneLine', { notes: noteCount(2), patients: patientCount(1) }),
    );
  });
});

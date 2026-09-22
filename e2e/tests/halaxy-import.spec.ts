import { fileURLToPath } from 'node:url';

import { expect, test, uniqueName } from '../support/fixtures';

const PDF = fileURLToPath(new URL('../fixtures/halaxy/john-smith.pdf', import.meta.url));

test.describe('importing from Halaxy', () => {
  test('reviews sessions, imports published history, and undoes it', async ({ page, request }) => {
    await request.post('/api/formats', {
      data: { name: 'Halaxy e2e format', sections: ['Session'] },
    });
    await page.goto('/settings');
    await page.getByTestId('settings-import-halaxy').click();
    await expect(page.getByRole('heading', { name: 'Import from Halaxy' })).toBeVisible();

    await page.getByTestId('halaxy-files').setInputFiles(PDF);
    await page.getByTestId('halaxy-check').click();
    await expect(page.getByTestId('halaxy-summary')).toContainText('3 notes across 1 patient');

    const patientName = uniqueName('Halaxy import');
    await page.getByTestId('halaxy-patient-name').fill(patientName);
    await page.getByTestId('halaxy-note').nth(0).uncheck();
    await expect(page.getByTestId('halaxy-run')).toHaveText('Import 2 notes');
    await page.getByTestId('halaxy-run').click();

    await expect(page.getByTestId('halaxy-done')).toContainText('2 notes for 1 patient imported as published history');
    await page.getByRole('link', { name: 'Go to patients' }).click();
    await expect(page.getByTestId('patient-list')).toContainText(patientName);
    await page.waitForTimeout(500);
    const patientNameElement = page.getByTestId('patient-list').locator('.name').filter({ hasText: patientName });
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
    await page.getByTestId('halaxy-batches').getByRole('button', { name: 'Undo' }).first().click();
    await expect(page.getByTestId('halaxy-undone')).toContainText('2 notes and 1 patient removed');
  });
});

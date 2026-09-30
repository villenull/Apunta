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
    // The section is written in the project's own language. It used to be the
    // literal 'Session', which is also an English catalogue string ('Session' →
    // 'Sesión'), so on the Spanish server the name she typed into her format
    // tripped the no-English guard on any later screen that echoed it — the
    // backup screen did, and failed a run that had nothing to do with Halaxy.
    // A section name is her data, so it follows her language like the rest.
    await request.post('/api/formats', {
      data: { name: 'Halaxy e2e format', sections: [tr('import.sessionTitle')] },
    });
    // Reached from the workspace's "More" menu, where Import now lives as a
    // first-level row (owner, 2026-09-27) rather than a section of Settings.
    await page.goto('/');
    await page.getByTestId('mission-control').click();
    await page.getByTestId('mission-import').click();
    // The one row in "More" leads to the Claude screen, and Halaxy is one link
    // away from there (owner, 2026-09-27).
    await page.getByTestId('import-switch-halaxy').click();
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
    // This run's own batch id, taken from the answer the server just gave. The
    // list below is every batch in the shared database, from both sources and
    // from every other spec, and the rows carry no id in the DOM
    // (ImportBatchList.tsx:44-62), so the row this test undoes is located in
    // that list and proved before it is clicked rather than taken as "the first
    // one", which is the newest and is whoever imported last.
    const runAnswer = page.waitForResponse(
      (response) => response.url().endsWith('/api/import/halaxy') && response.request().method() === 'POST',
    );
    await page.getByTestId('halaxy-run').click();
    const { batch_id: batchId } = (await (await runAnswer).json()) as { batch_id: string };

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

    // **One** snapshot of the list, and it is the page's own. The rows come from
    // the GET the route fires when it mounts and are only reloaded after an undo
    // (`web/src/hooks/useImportBatch.ts:20-28`), so the answer to *this* call is
    // what the rows on screen were rendered from. Reading the list a second time
    // through `request`, after the render, is a separately timed read: a sibling
    // spec's own undo lands between the two often enough to be pinned (S2.R
    // finding 2; reproduced and measured in
    // `docs/v2/evidence/S2.10/attempt2.md`), the API then answers a row short,
    // and the count cross-check below used to fail with Expected 1, Received 2 —
    // which is the check working: with the sibling's row gone from the API and
    // still on screen, the index would have clicked somebody else's batch.
    const listAnswer = page.waitForResponse((response) => {
      if (response.request().method() !== 'GET') return false;
      const url = new URL(response.url());
      return url.pathname === '/api/import/batches' && url.search === '';
    });
    await page.goto('/import/halaxy');
    const { batches } = (await (await listAnswer).json()) as { batches: { id: string }[] };
    await expect(page.getByTestId('halaxy-batches')).toBeVisible();
    await checkScreen(page, 'Import from Halaxy, with an earlier import');
    const undoButtons = page.getByTestId('halaxy-batches').getByRole('button', { name: tr('common.undo') });
    const ownRow = batches.findIndex((batch) => batch.id === batchId);
    expect(
      batches[ownRow]?.id,
      `the batch this run created (${batchId}) is in the list, so the row at its index is the one to undo`,
    ).toBe(batchId);
    // One button per row of the list these rows were rendered from — an index
    // into the DOM and an index into `batches` mean the same row, or this fails.
    await expect(undoButtons, 'one undo button per row the list was rendered from').toHaveCount(
      batches.length,
    );
    await undoButtons.nth(ownRow).click();
    await expect(page.getByTestId('halaxy-undone')).toContainText(
      tr('import.undoneLine', { notes: noteCount(2), patients: patientCount(1) }),
    );
  });
});

import { expect, test, uniqueName } from '../support/fixtures';

/**
 * The spell check in the built app, with the real bundled dictionary: the
 * mark under a typo, the menu on a click, and the correction. This is the
 * one place the dictionary's own loading — two files fetched from the app's
 * origin — is exercised end to end.
 */

interface Created {
  id: string;
}

test('marks a typo in the note body and corrects it from the menu', async ({ page, request }) => {
  const format = (await (
    await request.post('/api/formats', {
      data: { name: uniqueName('E2E spelling format'), sections: ['Subjective', 'Plan'] },
    })
  ).json()) as Created;
  const patient = (await (
    await request.post('/api/patients', { data: { name: uniqueName('E2E Spelling Patient') } })
  ).json()) as Created;
  const note = (await (
    await request.post('/api/notes', {
      data: {
        patient_id: patient.id,
        format_id: format.id,
        content: 'Subjective: Teh client slept well.\n\nPlan: Continue weekly.',
      },
    })
  ).json()) as Created;

  await page.goto(`/?patient=${patient.id}&note=${note.id}`);

  const body = page.getByTestId('note-body');
  const marks = page.locator('.misspelt');
  await expect(marks).toHaveText(['Teh']);
  // The browser's own checker is off: this is the app's, from its own origin.
  await expect(body).toHaveAttribute('spellcheck', 'false');

  await body.click();
  await body.evaluate((element: HTMLTextAreaElement) => {
    element.setSelectionRange(13, 13);
  });
  await body.click({ position: { x: 5, y: 5 } });
  await body.evaluate((element: HTMLTextAreaElement) => {
    element.setSelectionRange(13, 13);
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 60, clientY: 30 }));
  });

  const menu = page.getByTestId('spelling-menu');
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: 'The' }).click();

  await expect(body).toHaveValue('Subjective: The client slept well.\n\nPlan: Continue weekly.');
  await expect(marks).toHaveCount(0);
});

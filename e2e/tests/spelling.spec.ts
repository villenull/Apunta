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

test('marks a typo in the note body and corrects it from the menu', async ({
  page,
  request,
  tr,
  checkScreen,
}) => {
  const sttTerm = 'Zxqvterm';
  const addedTerm = 'Qvplum';
  await request.put('/api/settings', { data: { stt_vocabulary: [sttTerm], spelling_words: [addedTerm] } });
  const format = (await (
    await request.post('/api/formats', {
      data: { name: uniqueName('E2E spelling format'), sections: ['Subjective', 'Plan'] },
    })
  ).json()) as Created;
  const patient = (await (
    await request.post('/api/patients', { data: { name: 'Zebediah Quill' } })
  ).json()) as Created;
  const note = (await (
    await request.post('/api/notes', {
      data: {
        patient_id: patient.id,
        format_id: format.id,
        content:
          'Subjective: Teh client criticized behavior; organize the center, not criticised. Zebediah Quill used Zxqvterm and Qvplum.\n\nPlan: Continue weekly.',
      },
    })
  ).json()) as Created;

  await page.goto(`/?patient=${patient.id}&note=${note.id}`);

  const body = page.getByTestId('note-body');
  const marks = page.locator('.misspelt');
  await expect(marks).toHaveText(['Teh', 'criticised']);
  // The browser's own checker is off: this is the app's, from its own origin.
  await expect(body).toHaveAttribute('spellcheck', 'false');
  await checkScreen(page, 'a note with spelling marks');

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
  await checkScreen(page, 'the spelling menu');
  await menu.getByRole('menuitem', { name: 'The' }).click();

  await expect(body).toHaveValue(
    'Subjective: The client criticized behavior; organize the center, not criticised. Zebediah Quill used Zxqvterm and Qvplum.\n\nPlan: Continue weekly.',
  );
  await expect(marks).toHaveText(['criticised']);

  await page.getByTestId('chat-fab').click();
  const chat = page.getByTestId('chat-input');
  await chat.fill('Teh');
  await expect(page.locator('.chat-input-row .misspelt')).toHaveText(['Teh']);
  await expect(chat).toHaveAttribute('spellcheck', 'false');
  await chat.evaluate((element: HTMLInputElement) => {
    element.setSelectionRange(1, 1);
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 1100, clientY: 30 }));
  });
  await expect(page.getByTestId('spelling-menu')).toBeVisible();
  await expect(page.getByTestId('spelling-menu').getByRole('menuitem', { name: 'The' })).toBeVisible();
  await page.screenshot({ path: '/tmp/apunta-spelling-chat.png' });

  await page.goto('/patients/new');
  const patientName = page.getByLabel(tr('common.name'));
  await patientName.fill('Teh');
  await expect(page.locator('.spell-input-wrap .misspelt')).toHaveText(['Teh']);
  await expect(patientName).toHaveAttribute('spellcheck', 'false');
  await patientName.evaluate((element: HTMLInputElement) => {
    element.setSelectionRange(1, 1);
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 800, clientY: 30 }));
  });
  await expect(page.getByTestId('spelling-menu')).toBeVisible();
  await expect(page.getByTestId('spelling-menu').getByRole('menuitem', { name: 'The' })).toBeVisible();
  await page.screenshot({ path: '/tmp/apunta-spelling-patient-name.png' });
});

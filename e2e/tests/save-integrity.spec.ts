import { expect, test } from '@playwright/test';

test('two note windows refuse a stale save and let her keep her text', async ({ browser, request }) => {
  const formatResponse = await request.post('/api/formats', {
    data: { name: `E2E conflict format ${String(Date.now())}`, sections: ['Subjective', 'Plan'] },
  });
  const format = (await formatResponse.json()) as { id: string };
  const patientResponse = await request.post('/api/patients', {
    data: { name: `E2E conflict patient ${String(Date.now())}` },
  });
  const patient = (await patientResponse.json()) as { id: string };
  const noteResponse = await request.post('/api/notes', {
    data: {
      patient_id: patient.id,
      format_id: format.id,
      content: 'Subjective: Original body.\n\nPlan: Continue weekly.',
    },
  });
  const note = (await noteResponse.json()) as { id: string };

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  try {
    const url = `/?patient=${patient.id}&note=${note.id}`;
    await Promise.all([pageA.goto(url), pageB.goto(url)]);
    const bodyA = pageA.getByTestId('note-body');
    const bodyB = pageB.getByTestId('note-body');
    await expect(bodyA).toBeVisible();
    await expect(bodyB).toBeVisible();

    await bodyA.fill('Subjective: Saved from window A.\n\nPlan: Continue weekly.');
    await bodyA.blur();
    await expect(pageA.getByTestId('note-save-status')).toHaveText('Saved');

    await bodyB.fill('Subjective: Saved from window B.\n\nPlan: Continue weekly.');
    await bodyB.blur();
    await expect(pageB.getByTestId('note-conflict')).toContainText('changed in another window');
    await expect(pageB.getByTestId('note-conflict')).toContainText('Keep mine');
    await pageB.getByRole('button', { name: 'Keep mine' }).click();
    await expect(pageB.getByTestId('note-save-status')).toHaveText('Saved');

    const finalResponse = await request.get(`/api/notes/${note.id}`);
    expect((await finalResponse.json()).content).toContain('Saved from window B.');
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

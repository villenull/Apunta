import { expect, test, uniqueName } from '../support/fixtures';

/**
 * Brainstorm, end to end in fake-AI mode (M12).
 *
 * The flow is the packet's: open it above the treatment plan, think out
 * loud, watch the reply stream in, see which notes the model was given, start
 * a new conversation after a confirm, and come back to find the thread kept.
 * Nothing here asserts on the reply's quality — the canned fake has none —
 * only that the conversation is held, shown, and never written into a note.
 *
 * Every note body here is the project's synthetic practice.
 */

interface Created {
  id: string;
}

const SOAP = ['Subjective', 'Objective', 'Assessment', 'Plan'];

const NOTE = [
  'Subjective: Patient reports improved sleep since last session and fewer intrusive thoughts.',
  'Objective: Alert and engaged in session.',
  'Assessment: Continued progress on anxiety management goals.',
  'Plan: Continue weekly sessions.',
].join('\n\n');

test.describe('brainstorm', () => {
  test('thinks out loud with the notes, then starts over after a confirm', async ({
    page,
    request,
    tr,
    checkScreen,
  }) => {
    const format = (await (
      await request.post('/api/formats', {
        data: { name: uniqueName('E2E brainstorm format'), sections: SOAP },
      })
    ).json()) as Created;
    const patientName = uniqueName('E2E Brainstorm');
    const patient = (await (
      await request.post('/api/patients', { data: { name: patientName } })
    ).json()) as Created;
    await request.post('/api/notes', {
      data: { patient_id: patient.id, format_id: format.id, content: NOTE },
    });

    await page.goto(`/?patient=${patient.id}`);

    // Above the treatment plan, beside the notes.
    await expect(page.locator('.col-actions > button').first()).toHaveAttribute(
      'data-testid',
      'open-brainstorm',
    );
    await page.getByTestId('open-brainstorm').click();
    await expect(page.getByTestId('brainstorm-view')).toBeVisible();
    // The first name, the way the view takes it from the patient's full name.
    const first = patientName.split(' ')[0] ?? patientName;
    await expect(page.getByTestId('brainstorm-empty')).toContainText(tr('brainstorm.empty', { name: first }));

    // The Context line says which notes the model is thinking with.
    await expect(page.getByTestId('brainstorm-context')).toContainText(
      tr('brainstorm.contextAll', { count: 1 }),
    );
    await checkScreen(page, 'Brainstorm, empty');

    // Think out loud: Enter sends, the reply streams in, both turns persist.
    await page.getByTestId('brainstorm-input').fill('What stands out lately?');
    await page.getByTestId('brainstorm-input').press('Enter');
    // The fake model's own reply, which is English in both projects: it is
    // model output, not the app's words.
    await expect(page.getByTestId('brainstorm-reply')).toContainText('Thinking with', { timeout: 30_000 });
    await expect(page.getByTestId('brainstorm-empty')).toHaveCount(0);
    await checkScreen(page, 'Brainstorm, after a reply');

    // A new conversation asks first, then forgets the thread and nothing else.
    await page.getByTestId('brainstorm-new').click();
    await expect(page.getByTestId('confirm-backdrop')).toBeVisible();
    await checkScreen(page, 'Brainstorm, new-conversation confirm');
    await page.getByTestId('confirm-accept').click();
    await expect(page.getByTestId('brainstorm-empty')).toBeVisible();
    await expect(page.getByTestId('brainstorm-reply')).toHaveCount(0);

    // The note the model thought with is untouched.
    const notes = (await (await request.get(`/api/patients/${patient.id}/notes`)).json()) as {
      notes: { content: string }[];
    };
    expect(notes.notes[0]?.content).toBe(NOTE);

    // And the cleared thread is what a return visit finds.
    await page.goto(`/?patient=${patient.id}&view=brainstorm`);
    await expect(page.getByTestId('brainstorm-empty')).toBeVisible();
  });

  test('keeps the thread across a return visit', async ({ page, request }) => {
    const format = (await (
      await request.post('/api/formats', {
        data: { name: uniqueName('E2E brainstorm keep'), sections: SOAP },
      })
    ).json()) as Created;
    const patient = (await (
      await request.post('/api/patients', { data: { name: uniqueName('E2E Brainstorm Keep') } })
    ).json()) as Created;
    await request.post('/api/notes', {
      data: { patient_id: patient.id, format_id: format.id, content: NOTE },
    });

    await page.goto(`/?patient=${patient.id}&view=brainstorm`);
    await page.getByTestId('brainstorm-input').fill('Hold that thought?');
    await page.getByTestId('brainstorm-send').click();
    await expect(page.getByTestId('brainstorm-reply')).toContainText('Thinking with', { timeout: 30_000 });

    await page.goto(`/?patient=${patient.id}`);
    await expect(page.getByTestId('note-list')).toBeVisible();
    await page.getByTestId('open-brainstorm').click();
    await expect(page.getByTestId('brainstorm-reply')).toContainText('Thinking with');
    await expect(page.getByTestId('brainstorm-user')).toContainText('Hold that thought?');
  });
});

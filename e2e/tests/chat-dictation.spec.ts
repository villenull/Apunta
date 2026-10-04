import { expect, test, uniqueName } from '../support/fixtures';

/**
 * Dictating into the refine chat (2026-09-07), end to end in the built app.
 *
 * As in `capture.spec.ts`, Chromium plays a WAV into a fake microphone, so the
 * recorder, the WAV the tab writes, the multipart upload and the server's
 * header parse are all real; the words are the fake provider's. What this
 * proves is that pressing the microphone puts text in the box and sends
 * nothing on its own.
 */

interface Created {
  id: string;
}

test.describe('dictating into the chat', () => {
  test.use({ permissions: ['microphone'] });

  test('puts what whisper heard into the composer, and leaves sending to her', async ({
    page,
    request,
    tr,
    checkScreen,
    appLocale,
  }) => {
    const format = (await (
      await request.post('/api/formats', {
        data: {
          name: uniqueName('E2E dictation format'),
          // The note text is the project's own language, so the `es-MX` run's
          // Spanish dictionary does not split English fixture words into
          // isolated nodes that collide with English catalogue values.
          sections: appLocale === 'es-MX' ? ['Subjetivo', 'Plan'] : ['Subjective', 'Plan'],
        },
      })
    ).json()) as Created;
    const patient = (await (
      await request.post('/api/patients', { data: { name: uniqueName('E2E Dictation Patient') } })
    ).json()) as Created;
    const note = (await (
      await request.post('/api/notes', {
        data: {
          patient_id: patient.id,
          format_id: format.id,
          content:
            appLocale === 'es-MX'
              ? 'Subjetivo: La sesión de café fue corta.\n\nPlan: Continuar semanalmente.'
              : 'Subjective: Patient reports improved sleep.\n\nPlan: Continue weekly sessions.',
        },
      })
    ).json()) as Created;

    await page.goto(`/?patient=${patient.id}&note=${note.id}`);
    await page.getByTestId('chat-fab').click();

    const mic = page.getByTestId('chat-mic');
    await expect(mic).toHaveAttribute('aria-label', tr('dictation.mic'));
    await mic.click();
    await expect(mic).toHaveAttribute('aria-label', tr('dictation.stop'));
    // The capture screen's panel, inside the chat: the dot, the timer and the
    // provisional words as whisper hears them.
    await expect(page.getByTestId('record-panel')).toBeVisible();
    await expect(page.getByTestId('record-preview-text')).toContainText('John Smith');
    await checkScreen(page, 'the refine chat while dictating');
    // Let the fake microphone play for a second or two so there is a clip to send.
    await expect(page.getByTestId('record-timer')).toHaveText(/00:0[2-9]/);
    await page.getByTestId('record-stop').click();

    const input = page.getByTestId('chat-input');
    await expect(input).toHaveValue(/John Smith/);
    await expect(mic).toHaveAttribute('aria-label', tr('dictation.mic'));
    // Nothing went to the model: the thread still shows only its empty-state line.
    await expect(page.getByTestId('chat-thread')).not.toContainText('John Smith');
  });
});

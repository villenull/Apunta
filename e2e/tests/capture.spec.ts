import type { Page } from '@playwright/test';

import { expect, test, uniqueName } from '../support/fixtures';

/**
 * Recording a session, end to end, in the built app.
 *
 * Chromium plays `fixtures/audio/dictation-10s.wav` into a fake microphone
 * (wired up in `playwright.config.ts`), so everything after `getUserMedia` is
 * the real thing: the 16 kHz `AudioContext`, the `AudioWorkletNode`, the WAV
 * the tab writes itself, the multipart upload, the server's header parse, and
 * the draft that follows. Only the physical microphone is substituted.
 *
 * The transcript is the fake provider's — hard rule 3 means the whole suite
 * runs with no whisper.cpp and no Ollama installed — so what this proves is
 * the pipeline, not the model.
 */

interface Created {
  id: string;
}

async function practice(page: Page): Promise<{ patient: string; format: string }> {
  const formatName = uniqueName('E2E capture format');
  const patientName = uniqueName('E2E capture patient');

  await page.evaluate(async (name) => {
    const response = await fetch('/api/formats', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, sections: ['Subjective', 'Objective', 'Assessment', 'Plan'] }),
    });
    return (await response.json()) as Created;
  }, formatName);

  const patient = await page.evaluate(async (name) => {
    const response = await fetch('/api/patients', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    return (await response.json()) as Created;
  }, patientName);

  return { patient: patient.id, format: formatName };
}

test.describe('recording a session', () => {
  test.use({ permissions: ['microphone'] });

  test('records, transcribes and lands on the drafted note', async ({ page }) => {
    await page.goto('/');
    const { patient, format } = await practice(page);

    await page.goto(`/capture/${patient}`);
    await page.getByLabel('Note format').selectOption({ label: format });

    // --- Record ------------------------------------------------------------
    await page.getByTestId('record-start').click();

    const panel = page.getByTestId('record-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('Recording…');

    // The prototype's mm:ss timer, running off the samples that have actually
    // arrived — so a timer moving past 00:00 means audio is flowing.
    await expect(page.getByTestId('record-timer')).toHaveText(/00:0[1-9]/, { timeout: 10_000 });

    // --- Stop and process --------------------------------------------------
    await page.getByTestId('record-stop').click();

    // "Transcribing… 25%" — whisper's progress, or the fake's stand-in for it.
    // Visibly the status is dots alone (owner-proxy, 2026-08-30); the stage
    // text is the dots' accessible name, and that is where it is asserted.
    await expect(page.getByTestId('draft-status').getByTestId('thinking-dots')).toHaveAttribute(
      'aria-label',
      /Transcribing…/,
    );

    // The draft is visible while it is still being written, and it is prose:
    // if the JSON decoding regressed she would watch `{"Subjective": "…` here.
    const preview = page.getByTestId('draft-preview');
    await expect(preview).toContainText('Subjective:');
    await expect(preview).not.toContainText('{"');

    // --- The note ----------------------------------------------------------
    const body = page.getByTestId('note-body');
    await expect(body).toContainText('Subjective: Patient reports improved sleep');
    await expect(page.getByTestId('note-list')).toContainText(format);
  });
});

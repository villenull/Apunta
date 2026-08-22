import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, uniqueName } from '../support/fixtures';

/** Committed next to the specs, so a reviewer can eyeball the layout. */
const SCREENSHOT = join(import.meta.dirname, '..', 'screenshots', 'workspace-1280x800.png');

/**
 * Only write it when it is missing, or when explicitly refreshing.
 *
 * PNG encoding is not byte-stable, so writing on every run left the working
 * tree dirty after every `npm run e2e` — which is exactly the noise the Stop
 * hook exists to flag, and it trained everyone to ignore a real warning. The
 * screenshot is a reference for human eyes, not an assertion; it only needs
 * rewriting when the layout actually changes.
 *
 * Refresh it with `UPDATE_SCREENSHOTS=1 npm run e2e`, then commit the result.
 */
const shouldWriteScreenshot = () => process.env.UPDATE_SCREENSHOTS === '1' || !existsSync(SCREENSHOT);

/**
 * The M2 flows, end to end in fake-AI mode, through the built SPA and the real
 * server.
 *
 * The suite runs in parallel against one database, so nothing here assumes an
 * empty practice: every spec creates the patients and formats it needs under a
 * unique name and asserts only on those.
 */

interface Created {
  id: string;
}

test.describe('the workspace', () => {
  test.use({
    viewport: { width: 1280, height: 800 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });

  test('takes a practice from onboarding to a published note', async ({ page }) => {
    const formatName = uniqueName('E2E progress note');
    const patientName = uniqueName('E2E Patient');

    // --- Onboarding: define a note format by hand ----------------------------
    await page.goto('/onboarding/format');
    await page.getByText('Describe it myself').click();
    await page.getByLabel('Format name').fill(formatName);
    await page.getByLabel('Sections').fill('Subjective, Objective, Assessment, Plan');
    await page.getByTestId('format-continue').click();

    await expect(page.getByRole('heading', { name: "Here's what we found" })).toBeVisible();
    await expect(page.getByTestId('section-chips')).toContainText('Subjective');
    await page.getByTestId('save-format').click();

    // --- Add the patient the prototype's flow lands on ----------------------
    await expect(page.getByRole('heading', { name: 'Add patient' })).toBeVisible();
    await page.getByLabel('Name').fill(patientName);
    await page.getByRole('button', { name: 'Add patient' }).click();

    // --- Empty states: no notes yet, nothing selected -----------------------
    await expect(page.getByTestId('note-list')).toContainText(`No notes yet for ${patientName}.`);
    await expect(page.getByTestId('empty-no-note')).toContainText(`No note selected for ${patientName}`);

    // --- Capture: type a summary, which becomes the draft body --------------
    await page.getByRole('button', { name: 'New note' }).click();
    await expect(page.getByTestId('capture-heading')).toHaveText(`New note for ${patientName}`);
    await page.getByLabel('Note format').selectOption({ label: formatName });
    await page.getByTestId('summary-input').fill('Sleep improved, intrusive thoughts less frequent.');
    await page.getByTestId('process-note').click();

    const body = page.getByTestId('note-body');
    await expect(body).toHaveValue('Sleep improved, intrusive thoughts less frequent.');
    await expect(page.getByTestId('note-title')).toHaveText(formatName);
    await expect(page.getByTestId('note-list')).toContainText('Draft');

    // --- Edit the body; the header picks up the edit -------------------------
    const edited = 'Subjective: Sleep improved.\n\nPlan: Continue weekly sessions.';
    await body.fill(edited);
    await body.blur();
    await expect(page.getByTestId('note-meta')).toContainText('edited');

    // --- Publish: copies to the clipboard and locks the body ----------------
    await page.getByTestId('publish-button').click();
    await expect(page.getByTestId('publish-button')).toContainText('Published (click to edit)');
    await expect(body).toHaveAttribute('readonly', '');
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toBe(edited);
    await expect(page.getByTestId('note-list')).not.toContainText('Draft');

    // --- Unlock, then delete the note ---------------------------------------
    await page.getByTestId('publish-button').click();
    await expect(page.getByTestId('publish-button')).toHaveText('Publish');
    await expect(page.getByTestId('note-body')).not.toHaveAttribute('readonly', '');

    page.once('dialog', (dialog) => {
      expect(dialog.message()).toBe('Delete this note? This cannot be undone.');
      void dialog.accept();
    });
    await page.getByLabel('Delete note').click();
    await expect(page.getByTestId('empty-no-note')).toBeVisible();
    await expect(page.getByTestId('note-list')).toContainText(`No notes yet for ${patientName}.`);

    // --- Delete the patient, and the workspace is unselected again ----------
    page.once('dialog', (dialog) => {
      void dialog.accept();
    });
    await page.getByLabel(`Delete ${patientName}`).click();
    await expect(page.getByTestId('empty-no-patient')).toBeVisible();
    await expect(page.getByTestId('patient-list')).not.toContainText(patientName);
  });

  test('filters the patient list from the search box', async ({ page, request }) => {
    const kept = uniqueName('E2E Findable');
    const hidden = uniqueName('E2E Hidden');
    await request.post('/api/formats', { data: { name: uniqueName('E2E format'), sections: ['Plan'] } });
    await request.post('/api/patients', { data: { name: kept } });
    await request.post('/api/patients', { data: { name: hidden } });

    await page.goto('/');
    await expect(page.getByTestId('patient-list')).toContainText(kept);

    await page.getByLabel('Search patients').fill(kept);

    await expect(page.getByTestId('patient-list')).toContainText(kept);
    await expect(page.getByTestId('patient-list')).not.toContainText(hidden);

    await page.getByLabel('Search patients').fill('no such patient exists');
    await expect(page.getByTestId('patient-list')).toContainText('No patients match.');
  });

  test('asks for a selection when no patient is chosen', async ({ page, request }) => {
    await request.post('/api/formats', { data: { name: uniqueName('E2E format'), sections: ['Plan'] } });

    await page.goto('/');

    await expect(page.getByTestId('empty-no-patient')).toHaveText('Select a patient to see their notes');
  });

  test('shows the refine column as a placeholder until M4', async ({ page, request }) => {
    const format = (await (
      await request.post('/api/formats', {
        data: { name: uniqueName('E2E format'), sections: ['Subjective', 'Plan'] },
      })
    ).json()) as Created;
    const patient = (await (
      await request.post('/api/patients', { data: { name: uniqueName('E2E Patient') } })
    ).json()) as Created;
    const note = (await (
      await request.post('/api/notes', {
        data: { patient_id: patient.id, format_id: format.id, content: 'Subjective: Sample body.' },
      })
    ).json()) as Created;

    await page.goto(`/?patient=${patient.id}&note=${note.id}`);

    await expect(page.getByRole('heading', { name: 'Refine with AI' })).toBeVisible();
    await expect(page.getByTestId('refine-placeholder')).toContainText('AI arrives in a later milestone');
    await expect(page.getByLabel('Ask a question or give feedback')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Shorter' })).toBeDisabled();
  });

  /**
   * Visual sanity only: the file is a committed reference to eyeball after a
   * change, not something the suite compares against.
   */
  test('renders the three columns at 1280x800', async ({ page, request }) => {
    const format = (await (
      await request.post('/api/formats', {
        data: { name: 'Progress note', sections: ['Subjective', 'Objective', 'Assessment', 'Plan'] },
      })
    ).json()) as Created;
    const patient = (await (
      await request.post('/api/patients', { data: { name: 'John Smith' } })
    ).json()) as Created;
    const note = (await (
      await request.post('/api/notes', {
        data: {
          patient_id: patient.id,
          format_id: format.id,
          content:
            'Subjective: Patient reports improved sleep since last session and decreased frequency of intrusive thoughts.\n\nObjective: Alert, oriented, cooperative, mood congruent with affect.\n\nAssessment: Continued progress on anxiety management goals; responding well to current CBT approach.\n\nPlan: Continue weekly sessions. Introduce grounding exercises for use between sessions.',
        },
      })
    ).json()) as Created;

    await page.goto(`/?patient=${patient.id}&note=${note.id}`);
    await expect(page.getByTestId('note-body')).toBeVisible();

    if (shouldWriteScreenshot()) {
      await page.screenshot({ path: SCREENSHOT });
    }

    await expect(page.locator('.col-patients')).toBeVisible();
    await expect(page.locator('.col-notes')).toBeVisible();
    await expect(page.locator('.note-editor-col')).toBeVisible();
  });
});

test.describe('first run', () => {
  /**
   * The shared database has formats in it by the time this runs, so the empty
   * practice is faked at the network boundary rather than by wiping data other
   * specs are using.
   */
  test('sends a practice with no note format to onboarding', async ({ page }) => {
    await page.route('**/api/formats', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }
      await route.fulfill({ json: { formats: [] } });
    });

    await page.goto('/');

    await expect(page).toHaveURL(/\/onboarding\/format$/);
    await expect(page.getByRole('heading', { name: 'Add your note format' })).toBeVisible();
  });

  test('offers the upload paths but leaves them to M6', async ({ page }) => {
    await page.goto('/onboarding/format');

    await page.getByText('Upload a blank template').click();
    await expect(page.getByTestId('area-template')).toContainText('Drop a .docx or .pdf template here');
    await expect(page.getByTestId('format-continue')).toBeDisabled();

    await page.getByText('Upload a few example notes').click();
    await expect(page.getByTestId('area-examples')).toContainText('Drop 2-3 completed notes here');
    await expect(page.getByTestId('format-continue')).toBeDisabled();
  });
});

test.describe('settings', () => {
  test('lists formats and edits one through the format editor', async ({ page, request }) => {
    const name = uniqueName('E2E adjustable format');
    await request.post('/api/formats', { data: { name, sections: ['Subjective', 'Plan'] } });

    await page.goto('/settings');
    const row = page.getByTestId('format-list').locator('.patient-row', { hasText: name });
    await expect(row).toContainText('Subjective, Plan');

    await row.getByRole('link', { name: 'Edit' }).click();
    await expect(page.getByRole('heading', { name: 'Edit note format' })).toBeVisible();
    await page.getByRole('button', { name: '+ Add section' }).click();
    await page.getByLabel('Section name').fill('Assessment');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByTestId('save-format').click();

    await expect(page.getByTestId('format-list').locator('.patient-row', { hasText: name })).toContainText(
      'Subjective, Plan, Assessment',
    );
  });
});

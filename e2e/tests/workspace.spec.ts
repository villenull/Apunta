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
    await expect(page.getByTestId('empty-no-note')).toContainText(`No notes yet for ${patientName}`);

    // --- Capture: type a summary, watch it drafted, land on the note --------
    await page.getByRole('button', { name: 'New note' }).click();
    await expect(page.getByTestId('capture-heading')).toHaveText(`New note for ${patientName}`);
    await page.getByLabel('Note format').selectOption({ label: formatName });
    await page.getByTestId('summary-input').fill('Sleep improved, intrusive thoughts less frequent.');
    await page.getByTestId('process-note').click();

    // The draft is visible while it is still being written, and it is prose:
    // with structured output on, the model's own stream is raw JSON, so if the
    // decoding regressed the therapist would watch `{"Subjective": "…` here.
    const preview = page.getByTestId('draft-preview');
    await expect(preview).toContainText('Subjective:');
    await expect(preview).not.toContainText('{"');

    const body = page.getByTestId('note-body');
    await expect(body).toContainText('Subjective: Patient reports improved sleep');
    await expect(body).toContainText('Plan: Continue weekly sessions.');
    await expect(page.getByTestId('note-title')).toHaveText(formatName);
    await expect(page.getByTestId('note-list')).toContainText('Draft');

    // The chat lives behind its launcher now; opened, the refine thread has
    // already introduced itself, so it is never a blank panel.
    await page.getByTestId('chat-fab').click();
    await expect(page.getByTestId('chat-thread')).toContainText(
      "Here's a first pass based on your dictation.",
    );
    await page.getByTestId('chat-close').click();

    // --- Edit the body; the header picks up the edit -------------------------
    const edited = 'Subjective: Sleep improved.\n\nPlan: Continue weekly sessions.';
    await body.fill(edited);
    await body.blur();
    await expect(page.getByTestId('note-meta')).toContainText('edited');

    // --- Publish: copies to the clipboard and locks the body ----------------
    await page.getByTestId('publish-button').click();
    await expect(page.getByTestId('publish-button')).toContainText('Edit again');
    await expect(body).toHaveAttribute('readonly', '');
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toBe(edited);
    await expect(page.getByTestId('note-list')).not.toContainText('Draft');

    // --- Unlock, then delete the note ---------------------------------------
    await page.getByTestId('publish-button').click();
    await expect(page.getByTestId('publish-button')).toHaveText('Finish & copy');
    await expect(page.getByTestId('note-body')).not.toHaveAttribute('readonly', '');

    // M7 replaced window.confirm with an in-app dialog, so the copy can say
    // what deleting does *not* reach as well as what it does.
    await page.getByLabel('Delete note').click();
    await expect(page.getByRole('dialog')).toContainText('records system');
    await page.getByTestId('confirm-accept').click();
    await expect(page.getByTestId('empty-no-note')).toBeVisible();
    await expect(page.getByTestId('note-list')).toContainText(`No notes yet for ${patientName}.`);

    // --- Archive the patient, then delete it from View all -> Archived ------
    // AM-028: an active patient's row menu offers Archive, not Delete; Delete is
    // the red item on an archived patient's row in the View all page.
    await page.getByLabel(`Tools for ${patientName}`).click();
    await page.getByRole('menuitem', { name: 'Archive' }).click();
    await expect(page.getByTestId('patient-list')).not.toContainText(patientName);

    await page.goto('/patients');
    await page.getByTestId('directory-tab-archived').click();
    await page.getByLabel(`Tools for ${patientName}, all patients`).click();
    await page.getByLabel(`Delete ${patientName}`).click();
    await expect(page.getByRole('dialog')).toContainText('Time Machine');
    await page.getByTestId('confirm-accept').click();
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
    await expect(page.getByTestId('patient-list')).toContainText('No patients match');
  });

  test('opens on home, and finds a patient from its search', async ({ page, request }) => {
    const patientName = uniqueName('E2E Home');
    await request.post('/api/formats', { data: { name: uniqueName('E2E format'), sections: ['Plan'] } });
    await request.post('/api/patients', { data: { name: patientName } });

    await page.goto('/');

    await expect(page.getByTestId('home')).toContainText('Let’s focus on…');
    await expect(page.locator('.col-notes')).toHaveCount(0);
    await page.getByTestId('home-search').fill(patientName);
    await page.getByRole('option', { name: patientName, exact: true }).click();
    await expect(page.getByTestId('notes-header')).toHaveText(patientName.split(' ')[0] ?? '');

    await page.getByTestId('home-link').click();
    await expect(page.getByTestId('home')).toBeVisible();
  });

  /**
   * The refine chat end to end — the practice owner's primary repair path
   * (`docs/feedback/2026-08-22-owner-answers.md`, design question 4), so it
   * gets the longest flow in the suite.
   */
  test('refines a note by chat, refuses on a published one, and survives a reload', async ({
    page,
    request,
  }) => {
    const format = (await (
      await request.post('/api/formats', {
        data: {
          name: uniqueName('E2E refine format'),
          sections: ['Subjective', 'Objective', 'Assessment', 'Plan'],
        },
      })
    ).json()) as Created;
    const patient = (await (
      await request.post('/api/patients', { data: { name: uniqueName('E2E Refine Patient') } })
    ).json()) as Created;
    const note = (await (
      await request.post('/api/notes', {
        data: {
          patient_id: patient.id,
          format_id: format.id,
          content: [
            'Subjective: Patient reports improved sleep since last session.',
            'Objective: Alert and engaged in session.',
            'Assessment: Continued progress on anxiety management goals.',
            'Plan: Continue weekly sessions. Introduce grounding exercises for use between sessions.',
          ].join('\n\n'),
        },
      })
    ).json()) as Created;

    await page.goto(`/?patient=${patient.id}&note=${note.id}`);

    const body = page.getByTestId('note-body');
    const thread = page.getByTestId('chat-thread');
    await page.getByTestId('chat-fab').click();
    await expect(thread).toContainText('Ask a question about this note, or give feedback to refine it.');

    // The card floats over the note's corner, so reaching the text means
    // putting it away first — and highlighting brings it straight back.
    await page.getByTestId('chat-close').click();
    await expect(page.getByTestId('chat-panel')).toBeHidden();

    // --- Highlight-to-reference: the secondary affordance, still shipped ----
    await body.click();
    await body.evaluate((element: HTMLTextAreaElement) => {
      element.setSelectionRange(0, 'Subjective: Patient reports improved sleep'.length);
      // React derives onSelect from document `selectionchange`, not from a
      // `select` event dispatched at the element.
      document.dispatchEvent(new Event('selectionchange'));
    });
    // Highlighting is aimed at the chat, so the panel reopens itself — the
    // excerpt chip lives inside it and would otherwise be raised unseen.
    await expect(page.getByTestId('chat-panel')).toBeVisible();
    await expect(page.getByTestId('ref-chip')).toContainText('Subjective: Patient reports improved');

    await page.getByTestId('chat-input').fill('What is missing from this?');
    await page.getByTestId('chat-send').click();

    // The excerpt travels with the message, and the chip is cleared after.
    await expect(thread).toContainText('“Subjective: Patient reports improved sleep”');
    await expect(page.getByTestId('ref-chip')).toBeHidden();
    await expect(thread).toContainText('Based on the note');
    // A question changes nothing.
    await expect(body).toContainText('Introduce grounding exercises');

    // --- Asking to expand the plan preserves grounded material --------------
    const planBeforeExpand = await body.inputValue();
    const expandRequest = page.waitForRequest(
      (request) => request.url().includes(`/api/notes/${note.id}/chat`) && request.method() === 'POST',
    );
    await page.getByTestId('chat-input').fill('Expand the plan section');
    await page.getByTestId('chat-send').click();
    expect((await expandRequest).postDataJSON()).toMatchObject({ message: 'Expand the plan section' });
    await expect(thread).toContainText('Expand the plan section');
    await expect(body).toContainText('Plan: Continue weekly sessions.');
    await expect(body).toContainText('Introduce grounding exercises for use between sessions.');
    await expect.poll(async () => (await body.inputValue()).length).toBeGreaterThan(planBeforeExpand.length);
    // The notes-column preview moved with it.
    await expect(page.getByTestId('note-list')).toContainText('Subjective: Patient reports improved');

    // --- Publishing locks it, and the chat says so rather than editing -----
    await page.getByTestId('publish-button').click();
    await expect(page.getByTestId('publish-button')).toContainText('Edit again');

    await page.getByTestId('chat-input').fill('Make the plan much shorter');
    await page.getByTestId('chat-send').click();
    await expect(thread).toContainText('This note is published, so I won’t change it.');
    await expect(body).toContainText(
      'Plan: Continue weekly sessions. Introduce grounding exercises for use between sessions.',
    );

    // --- Unlock, and the same request goes through ------------------------
    await page.getByTestId('publish-button').click();
    await expect(page.getByTestId('publish-button')).toHaveText('Finish & copy');

    await page.getByTestId('chat-input').fill('Add something about sleep');
    await page.getByTestId('chat-send').click();
    // The reply is the server's own account of the diff since 2026-09-23, not
    // the model's prose, so it names the section that actually changed.
    await expect(thread).toContainText('I expanded the Subjective section.');
    await expect(body).toContainText('Also noted improved appetite this week.');

    // --- The whole conversation is still there after a reload -------------
    await page.reload();
    await expect(page.getByTestId('chat-thread')).toContainText('What is missing from this?');
    await expect(page.getByTestId('chat-thread')).toContainText('Expand the plan section');
    await expect(page.getByTestId('chat-thread')).toContainText(
      'This note is published, so I won’t change it.',
    );
    await expect(page.getByTestId('note-body')).toContainText('Also noted improved appetite this week.');
  });

  /**
   * An empty section and an unclear-dictation marker are both visible and
   * neither blocks anything — the owner declined a gate on each (design
   * questions 5 and 11).
   */
  test('marks a blank section and an unclear flag without gating copy', async ({ page, request }) => {
    const format = (await (
      await request.post('/api/formats', {
        data: { name: uniqueName('E2E marker format'), sections: ['Subjective', 'Objective', 'Plan'] },
      })
    ).json()) as Created;
    const patient = (await (
      await request.post('/api/patients', { data: { name: uniqueName('E2E Marker Patient') } })
    ).json()) as Created;
    const note = (await (
      await request.post('/api/notes', {
        data: {
          patient_id: patient.id,
          format_id: format.id,
          content: [
            'Subjective: Possibly propranolol [unclear in dictation]; she was uncertain of the name.',
            'Objective:',
            'Plan: Continue weekly sessions.',
          ].join('\n\n'),
        },
      })
    ).json()) as Created;

    await page.goto(`/?patient=${patient.id}&note=${note.id}`);

    await expect(page.getByTestId('empty-sections')).toHaveText(
      'Nothing recorded in Objective — add or leave blank.',
    );
    await expect(page.locator('.marker-unclear')).toHaveText('[unclear in dictation]');
    await expect(page.locator('.marker-empty-section')).toHaveText('Objective:');

    // Nothing is gated: copy takes the note as it stands, blanks and all.
    //
    // What lands on the clipboard is exactly what the editor shows — the note
    // is pasted into one plain text box in another records system, so it is
    // `Section: body` paragraphs with a blank line between and not a
    // character of markdown syntax. An empty section still carries its
    // header, because she fills the blank in on the far side.
    await page.getByTestId('copy-button').click();
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toBe(
      [
        'Subjective: Possibly propranolol [unclear in dictation]; she was uncertain of the name.',
        'Objective:',
        'Plan: Continue weekly sessions.',
      ].join('\n\n'),
    );
    expect(clipboard).not.toMatch(/[*#_`~]|^\s*[-+]\s/m);
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

test.describe('when the local AI is not there', () => {
  /**
   * The server runs in fake-AI mode here, which always reports a healthy
   * model, so the unhealthy answer is faked at the network boundary — the same
   * technique the first-run spec uses, and for the same reason: other specs are
   * mid-flow against this database.
   */
  test('shows a dismissible banner and leaves the rest of the app working', async ({ page, request }) => {
    const patientName = uniqueName('E2E Patient');
    await request.post('/api/formats', { data: { name: uniqueName('E2E format'), sections: ['Plan'] } });
    await request.post('/api/patients', { data: { name: patientName } });

    await page.route('**/api/health', async (route) => {
      const response = await route.fetch();
      const health = (await response.json()) as { ollama: Record<string, unknown> };
      await route.fulfill({
        json: { ...health, ollama: { reachable: false, model: null, modelPresent: false } },
      });
    });

    await page.goto('/');

    const banner = page.getByTestId('ai-banner');
    await expect(banner).toContainText("Apunta can't reach the local AI — see Setup");
    // Not a blocker: the practice is still there behind it.
    await expect(page.getByTestId('patient-list')).toContainText(patientName);

    await banner.getByLabel('Dismiss').click();
    await expect(banner).toBeHidden();
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

  /** What the uploads do once a file is chosen is `tests/formats.spec.ts`. */
  test('offers her standard note first, then the three other paths, with the uploads waiting on a file', async ({
    page,
  }) => {
    await page.goto('/onboarding/format');

    // Her standard progress note is first and already chosen: Continue is live.
    await expect(page.getByTestId('option-standard')).toHaveClass(/selected/);
    await expect(page.getByTestId('option-standard')).toContainText('Recommended');
    await expect(page.getByTestId('format-continue')).toBeEnabled();

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

  /**
   * Geometry, because no other kind of test sees this: the Appearance card
   * autosaves, so a change must both persist and raise its "Saved" line
   * without shifting the card under it.
   */
  test('autosaves an appearance change and shows Saved in the card header', async ({ page }) => {
    await page.goto('/settings');
    const card = page.getByTestId('appearance-settings');
    await expect(card.getByTestId('appearance-saved')).toHaveCount(0);

    await card.getByTestId('theme-light').click();
    await expect(card.getByTestId('appearance-saved')).toHaveText('Saved');

    const box = await card.getByTestId('appearance-saved').boundingBox();
    const titleBox = await card.locator('.settings-card-header').boundingBox();
    expect(box?.y ?? 0).toBeGreaterThanOrEqual(titleBox?.y ?? 0);
  });
});

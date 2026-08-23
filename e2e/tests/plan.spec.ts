import { expect, test, uniqueName } from '../support/fixtures';

/**
 * The treatment plan and session prep, end to end in fake-AI mode (M9).
 *
 * The flow is deliberately the one the packet names, in order: suggest a plan,
 * accept one goal, discard another, edit a third, run a review and find the
 * old version preserved, then generate a briefing, follow a citation to its
 * note, and keep it.
 *
 * Every note body here is the project's synthetic practice.
 */

interface Created {
  id: string;
}

const SOAP = ['Subjective', 'Objective', 'Assessment', 'Plan'];

/** Three notes, each about something different, so three goals are drafted. */
const NOTES = [
  [
    'Subjective: Patient reports improved sleep since last session and fewer intrusive thoughts.',
    'Objective: Alert and engaged in session.',
    'Assessment: Continued progress on anxiety management goals.',
    'Plan: Continue weekly sessions.',
  ].join('\n\n'),
  [
    'Subjective: A difficult week around the anniversary of his mother’s death.',
    'Objective: Quieter than usual.',
    'Assessment: Grief processing as expected at this stage.',
    'Plan: Continue weekly supportive therapy.',
  ].join('\n\n'),
  [
    'Subjective: Two difficult meetings with his manager this week, and a deadline he described as impossible.',
    'Objective: Restless through the first half of the session.',
    'Assessment: Worry concentrated on work.',
    'Plan: Rehearse paced breathing before meetings.',
  ].join('\n\n'),
];

test.describe('the treatment plan', () => {
  test.use({ viewport: { width: 1280, height: 800 }, permissions: ['clipboard-read', 'clipboard-write'] });

  test('drafts goals she owns, reviews the plan, and prepares for the session', async ({ page, request }) => {
    const format = (await (
      await request.post('/api/formats', { data: { name: uniqueName('E2E plan format'), sections: SOAP } })
    ).json()) as Created;
    const patient = (await (
      await request.post('/api/patients', { data: { name: uniqueName('E2E Plan Patient') } })
    ).json()) as Created;
    for (const content of NOTES) {
      await request.post('/api/notes', {
        data: { patient_id: patient.id, format_id: format.id, content },
      });
    }

    await page.goto(`/?patient=${patient.id}`);

    // --- Nothing yet, and the plan is reachable beside the notes -----------
    await page.getByTestId('open-plan').click();
    await expect(page.getByTestId('empty-no-plan')).toBeVisible();

    // --- Draft goals from the notes ----------------------------------------
    await page.getByTestId('draft-goals').click();

    const proposals = page.getByTestId('proposed-goal');
    await expect(proposals).toHaveCount(3, { timeout: 30_000 });
    // Nothing is in the plan yet: a suggestion is not a goal.
    await expect(page.getByTestId('no-accepted-goals')).toBeVisible();
    await expect(page.getByTestId('lookback-note')).toContainText('Read 3 notes');

    // Each one shows the note text it was drafted from.
    const evidence = proposals.first().getByTestId('goal-evidence');
    await expect(evidence).toBeVisible();
    await expect(evidence).toContainText('Subjective');

    // --- Accept one --------------------------------------------------------
    const acceptedStatement = (await proposals.first().locator('.plan-goal-statement').innerText()).trim();
    await proposals.first().getByTestId('accept-goal').click();

    await expect(page.getByTestId('plan-goal')).toHaveCount(1);
    await expect(page.getByTestId('plan-goal').first()).toContainText(acceptedStatement);
    await expect(proposals).toHaveCount(2);

    // --- Discard another ---------------------------------------------------
    const discardedStatement = (await proposals.first().locator('.plan-goal-statement').innerText()).trim();
    await proposals.first().getByTestId('discard-goal').click();

    await expect(proposals).toHaveCount(1);
    await expect(page.getByTestId('plan-view')).not.toContainText(discardedStatement);

    // --- Edit the third, which accepts it as hers --------------------------
    await proposals.first().getByTestId('edit-goal').click();
    const editor = page.getByTestId('goal-editor');
    await editor
      .getByLabel('Goal', { exact: true })
      .fill('A goal in her own words, edited before she accepted it.');
    await editor.getByTestId('save-goal').click();

    await expect(page.getByTestId('proposed-goal')).toHaveCount(0);
    await expect(page.getByTestId('plan-goal')).toHaveCount(2);
    await expect(page.getByTestId('plan-view')).toContainText(
      'A goal in her own words, edited before she accepted it.',
    );

    // --- The diagnosis is hers to type ------------------------------------
    // Folded away by default: the screen she opens between sessions leads with
    // the goals, not with a compliance form.
    await expect(page.getByTestId('plan-details-block')).not.toHaveAttribute('open', '');
    await page.getByTestId('toggle-details').click();
    await page.getByTestId('add-diagnosis').click();
    await page.getByLabel('Diagnosis 1 code').fill('F41.1');
    await page.getByLabel('Diagnosis 1 description').fill('Generalized anxiety disorder');
    await page.getByLabel('Service modality').fill('Individual psychotherapy (CBT)');
    await page.getByLabel('Service frequency').fill('Weekly, 50 minutes');
    await page.getByTestId('save-plan-details').click();
    await expect(page.getByLabel('Diagnosis 1 code')).toHaveValue('F41.1');

    // --- Put it in force, which dates the attestation ----------------------
    await page.getByTestId('activate-plan').click();
    await expect(page.getByTestId('plan-version')).toContainText('active');
    await expect(page.getByTestId('plan-attestation')).toContainText('sign the copy in your records system');
    await expect(page.getByTestId('review-due')).toContainText('Plan review due');

    // --- The document is copyable ------------------------------------------
    await page.getByTestId('copy-plan').click();
    // The document is fetched before it is copied, so wait for the flash.
    await expect(page.getByTestId('copy-plan')).toContainText('Copied');
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toContain('TREATMENT PLAN');
    expect(clipboard).toContain('F41.1 (ICD-10-CM) Generalized anxiety disorder — primary');
    expect(clipboard).toContain('Service frequency: Weekly, 50 minutes');
    expect(clipboard).toContain('Signatures:');

    // --- A review makes version 2 and carries the goals forward ------------
    await page.getByTestId('start-review').click();
    await expect(page.getByTestId('plan-version')).toContainText('Version 2');
    await expect(page.getByTestId('plan-goal')).toHaveCount(2);
    await expect(page.getByTestId('plan-view')).toContainText('Carried forward from the previous version.');

    // The version in force does not change while she drafts the review: a
    // practice with no plan in force is worse than the one she started in.
    await page.getByTestId('version-picker').selectOption('1');
    await expect(page.getByTestId('plan-version')).toContainText('active');
    await page.getByTestId('version-picker').selectOption('current');

    // --- Once the review is in force, the old version is a record ----------
    await page.getByTestId('activate-plan').click();
    await expect(page.getByTestId('plan-version')).toContainText('Version 2 · active');

    await page.getByTestId('version-picker').selectOption('1');
    await expect(page.getByTestId('read-only-note')).toBeVisible();
    await expect(page.getByTestId('plan-version')).toContainText('superseded');
    await expect(page.getByTestId('plan-view')).toContainText('Individual psychotherapy (CBT)');
    await expect(page.getByTestId('plan-goal')).toHaveCount(2);
    // A historical version is a record: there is nothing to edit on it.
    await expect(page.getByTestId('edit-goal')).toHaveCount(0);

    // --- Prep: the plan on one side, the recent notes on the other ---------
    await page.getByTestId('open-prep').click();
    await expect(page.getByTestId('prep-view')).toBeVisible();
    const lines = page.getByTestId('prep-line');
    await expect(lines.first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('prep-lookback')).toContainText('Read the last 3 notes');
    await expect(page.getByTestId('prep-plan')).toContainText(acceptedStatement);
    await expect(page.getByTestId('prep-view')).toContainText('not saved unless you keep it');

    // --- Keep it -----------------------------------------------------------
    await page.getByTestId('keep-brief').click();
    await expect(page.getByTestId('keep-brief')).toContainText('Kept');

    // --- Follow a citation through to the note it came from ----------------
    await page.getByTestId('prep-citation').first().click();
    await expect(page.getByTestId('note-body')).toBeVisible();
  });
});

import { ATTESTATION_TEXT, en, esMX } from '@apunta/shared';

import { expect, test, uniqueName } from '../support/fixtures';
import { englishMatches } from '../support/no-english';

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

/**
 * The attestation as activation stores it in Spanish, written out rather than
 * read from the catalogue: this is the wording the owner approved in AM-059,
 * and a test that read it back from `esMX` could not tell a correct Spanish
 * word from a wrong one. `shared/src/i18n/t.test.ts` holds the same sentence
 * against the catalogue, so the two are a pair rather than a circle.
 */
const SPANISH_ATTESTATION =
  'Yo redacté y revisé este plan de tratamiento. Declarado en Apunta: firma la copia en tu sistema de registros.';

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

  test('drafts goals she owns, reviews the plan, and prepares for the session', async ({
    page,
    request,
    appLocale,
    tr,
    trRe,
    checkScreen,
  }) => {
    /** Either sentence: the lookback says "back to {day}" only when it stopped at a date. */
    const either = (...patterns: RegExp[]): RegExp =>
      new RegExp(patterns.map((pattern) => pattern.source).join('|'));
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
    await checkScreen(page, 'the treatment plan, empty');

    // --- Draft goals from the notes ----------------------------------------
    await page.getByTestId('draft-goals').click();

    const proposals = page.getByTestId('proposed-goal');
    await expect(proposals).toHaveCount(3, { timeout: 30_000 });
    // Nothing is in the plan yet: a suggestion is not a goal.
    await expect(page.getByTestId('no-accepted-goals')).toBeVisible();
    await expect(page.getByTestId('lookback-note')).toContainText(
      either(trRe('plan.lookbackRead', { count: 3 }), trRe('plan.lookbackReadBackTo', { count: 3 })),
    );
    await checkScreen(page, 'the treatment plan with proposed goals');

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
      .getByLabel(tr('plan.goalLabel'), { exact: true })
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
    const code = page.getByLabel(tr('plan.diagnosisCodeLabel', { n: '1' }));
    await code.fill('F41.1');
    await page
      .getByLabel(tr('plan.diagnosisDescriptionLabel', { n: '1' }))
      .fill('Generalized anxiety disorder');
    await page.getByLabel(tr('plan.modality')).fill('Individual psychotherapy (CBT)');
    await page.getByLabel(tr('plan.frequency')).fill('Weekly, 50 minutes');
    await checkScreen(page, 'the treatment plan details');
    await page.getByTestId('save-plan-details').click();
    await expect(code).toHaveValue('F41.1');

    // --- Put it in force, which dates the attestation ----------------------
    await page.getByTestId('activate-plan').click();
    await expect(page.getByTestId('plan-version')).toContainText('active');
    await expect(page.getByTestId('plan-attestation')).toContainText(trRe('plan.attestedNote'));
    // AM-059, and the reason this row existed: the sentence activation *stored*
    // is in the language stored at that moment, rendered verbatim. Spanish here,
    // English in the English project, and the check below is what proves the
    // Spanish screen carries no English catalogue text.
    await expect(page.getByTestId('plan-attestation')).toContainText(
      appLocale === 'es-MX' ? SPANISH_ATTESTATION : ATTESTATION_TEXT,
    );
    await expect(page.getByTestId('review-due')).toContainText(trRe('plan.reviewUpcoming'));
    await checkScreen(page, 'the treatment plan in force');

    // --- The document is copyable ------------------------------------------
    await page.getByTestId('copy-plan').click();
    // The document is fetched before it is copied, so wait for the flash.
    await expect(page.getByTestId('copy-plan')).toContainText(tr('common.copied'));
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toContain('TREATMENT PLAN');
    expect(clipboard).toContain('F41.1 (ICD-10-CM) Generalized anxiety disorder — primary');
    expect(clipboard).toContain('Service frequency: Weekly, 50 minutes');
    expect(clipboard).toContain('Signatures:');

    // --- A review makes version 2 and carries the goals forward ------------
    await page.getByTestId('start-review').click();
    await expect(page.getByTestId('plan-version')).toContainText(trRe('plan.versionMeta', { version: '2' }));
    await expect(page.getByTestId('plan-goal')).toHaveCount(2);
    await expect(page.getByTestId('plan-view')).toContainText(tr('plan.carriedForward'));
    await checkScreen(page, 'a plan review in draft');

    // The version in force does not change while she drafts the review: a
    // practice with no plan in force is worse than the one she started in.
    await page.getByTestId('version-picker').selectOption('1');
    await expect(page.getByTestId('plan-version')).toContainText('active');
    await page.getByTestId('version-picker').selectOption('current');

    // --- Once the review is in force, the old version is a record ----------
    await page.getByTestId('activate-plan').click();
    await expect(page.getByTestId('plan-version')).toContainText(
      trRe('plan.versionMeta', { version: '2', status: 'active' }),
    );

    await page.getByTestId('version-picker').selectOption('1');
    await expect(page.getByTestId('read-only-note')).toBeVisible();
    await checkScreen(page, 'a superseded plan version');
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
    await expect(page.getByTestId('prep-lookback')).toContainText(
      either(trRe('prep.lookbackRead', { count: 3 }), trRe('prep.lookbackReadBackTo', { count: 3 })),
    );
    await expect(page.getByTestId('prep-plan')).toContainText(acceptedStatement);
    await expect(page.getByTestId('prep-view')).toContainText(tr('prep.notSaved'));
    await checkScreen(page, 'the session briefing');

    // --- Keep it -----------------------------------------------------------
    await page.getByTestId('keep-brief').click();
    await expect(page.getByTestId('keep-brief')).toContainText(tr('common.kept'));

    // --- Follow a citation through to the note it came from ----------------
    await page.getByTestId('prep-citation').first().click();
    await expect(page.getByTestId('note-body')).toBeVisible();
  });
});

/**
 * The matcher itself, on the one string AM-059 changed (V14).
 *
 * The screen assertion above proves the Spanish sentence reaches the Spanish
 * screen. This proves two things no screen assertion can:
 *
 * 1. **The attribution is the new key.** Before `plan.attestationStatement`
 *    existed, the English attestation matched `chat.change.summary` — whose
 *    English is `I {changes}.` and so swallows any sentence starting with "I "
 *    and ending in a period. The coordinator's baseline found it there and
 *    called the attribution coincidental, which it was. It is now attributable
 *    to the key that owns the sentence, and that is asserted rather than
 *    assumed, because a matcher that names the wrong key is a matcher whose
 *    report a reviewer cannot act on.
 * 2. **The Spanish sentence matches nothing at all.** Not one English form of
 *    any key, and specifically not an identical-value pair — the matcher skips
 *    a key whose two values are equal, which is right for `Ctrl+B` and wrong
 *    here. So this also pins that the two catalogue values differ, which is
 *    what stops the identical-value rule from silencing the very leak.
 */
test('V14: the English attestation is attributed to its own key, and the Spanish one to none', () => {
  // The English is still a leak, and it is now named by the key that is
  // responsible for it. `chat.change.summary` is left in the result: AM-059
  // forbids suppressing it, and this assertion is what would notice if someone
  // did.
  const english = englishMatches(ATTESTATION_TEXT);
  expect(english.map((form) => form.key)).toContain('plan.attestationStatement');
  expect(english.map((form) => form.key)).toContain('chat.change.summary');

  // The form reported is the entry's own `text`, from the key's own catalogue
  // value — read from `esMX` here only to show the matcher paired them.
  const attributed = english.find((form) => form.key === 'plan.attestationStatement');
  expect(attributed?.form).toBe('text');
  expect(attributed?.spanish).toBe(SPANISH_ATTESTATION);
  expect(attributed?.spanish).toBe(
    (esMX as Record<string, { text: string }>)['plan.attestationStatement']?.text,
  );
  expect(attributed?.english).toBe(
    (en as Record<string, { text: string }>)['plan.attestationStatement']?.text,
  );

  // And the Spanish sentence reads as no English form of any key at all.
  expect(englishMatches(SPANISH_ATTESTATION)).toEqual([]);

  // A substring of it is not a leak either: the matcher reads whole text nodes,
  // and the stored sentence is one node. Pinned so a future change that splits
  // the sentence into parts cannot quietly reintroduce the leak the whole-node
  // rule is currently there to prevent.
  for (const part of SPANISH_ATTESTATION.split('. ')) {
    expect(englishMatches(part), part).toEqual([]);
  }
});

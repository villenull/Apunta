import { t, type Locale, type Settings } from '@apunta/shared';
import type { APIRequestContext, Page } from '@playwright/test';

import { expect, test, uniqueName } from '../support/fixtures';

/**
 * Language / Idioma, end to end (S2.6, C-LANG@1 rules 1 and 6, C-SETTINGS@1).
 *
 * V2 and V3 run in the `es-MX-language` project, alone on the Spanish server
 * and before the rest of the es-MX suite: they switch the one stored language
 * and hold a job open, and neither can share a server with specs running in
 * parallel. The English project runs only the first case here, on a build that
 * does not offer Spanish.
 *
 * Everything written into a note is invented, and Spanish text names nobody.
 */

interface Created {
  id: string;
}

/**
 * A format, a patient and — when `content` is given — a note, made through the
 * API. The format is written in `locale`, and so is a note made from it
 * (C-LANG@1 rule 3): a note's refine speaks the note's language (rule 4), so a
 * Spanish screen refining a note created without one would correctly show
 * English progress, which is not what these cases are about.
 */
async function practice(
  request: APIRequestContext,
  locale: Locale,
  content?: string,
): Promise<{ patient: string; format: string; note: string | null }> {
  const format = (await (
    await request.post('/api/formats', {
      data: { name: uniqueName('E2E language format'), sections: ['Subjective', 'Plan'], locale },
    })
  ).json()) as Created;
  const patient = (await (
    await request.post('/api/patients', { data: { name: uniqueName('E2E language patient') } })
  ).json()) as Created;
  if (content === undefined) return { patient: patient.id, format: format.id, note: null };
  const note = (await (
    await request.post('/api/notes', { data: { patient_id: patient.id, format_id: format.id, content } })
  ).json()) as Created;
  return { patient: patient.id, format: format.id, note: note.id };
}

async function storedLanguage(request: APIRequestContext): Promise<unknown> {
  return ((await (await request.get('/api/settings')).json()) as Settings)['language'];
}

/**
 * Open Settings from the workspace's "More" menu, as she would mid-session. It
 * no longer carries a Language row (owner, 2026-09-28); it is opened here to
 * read the page's own words in whichever language is in force.
 */
async function openSettingsModal(page: Page): Promise<void> {
  await page.getByTestId('mission-control').click();
  await page.getByTestId('mission-settings').click();
  await expect(page.getByTestId('appearance-settings')).toBeVisible();
}

/**
 * The Language **dialog**, opened from the same "More" menu as Settings
 * (`PatientsColumn.tsx` `mission-language`). Since 2026-09-28 it is the **only**
 * language control: the owner removed the Settings row (backlog #9,
 * `docs/v2/owner/UI-BACKLOG.md`), and the coordinator authorised moving the
 * row's cases here. The first V2 and V3 below were written against the row;
 * they now drive this dialog with every assertion they had, so the row's
 * coverage — the 409's message in the captured locale, the page's own words
 * switching — is not lost with the row.
 */
async function openLanguageDialog(page: Page): Promise<void> {
  await page.getByTestId('mission-control').click();
  await page.getByTestId('mission-language').click();
  await expect(page.getByTestId('language-dialog')).toBeVisible();
}

test('Language: not offered on a build without the dev switch', async ({ page, request, appLocale, tr }) => {
  test.skip(appLocale !== 'en', 'the English project is the build that does not offer Spanish');
  await request.post('/api/formats', {
    data: { name: uniqueName('E2E language format'), sections: ['Subjective', 'Plan'] },
  });
  await page.goto('/settings');
  await expect(page.getByTestId('appearance-settings')).toBeVisible();
  await expect(page.getByTestId('language-settings')).toHaveCount(0);
  await expect(page.getByText(tr('settings.language'))).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  const refused = await request.put('/api/settings', { data: { language: 'es-MX' } });
  expect(refused.status()).toBe(400);
  expect(((await refused.json()) as { error: string }).error).toBe('language_unavailable');
});

test.describe('the Language control on the Spanish server', () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(({ appLocale }) => {
    test.skip(appLocale !== 'es-MX', 'the Language control exists only where Spanish is offered');
  });

  test('V2: disabled with its reason while a refine streams, and the server refuses a direct change', async ({
    page,
    request,
    tr,
    checkScreen,
  }) => {
    // A long Plan, so "expand the plan" — which the fake answers by streaming
    // the whole note back, word by word — keeps the server's refine job open
    // for seconds rather than milliseconds.
    const plan = Array.from(
      { length: 120 },
      () => 'Continuar sesiones semanales y ejercicios de respiración.',
    ).join(' ');
    const { patient, note } = await practice(
      request,
      'es-MX',
      `Subjective: Duerme mejor esta semana.\n\nPlan: ${plan}`,
    );
    await page.goto(`/?patient=${patient}&note=${String(note)}`);
    await expect(page.getByTestId('note-body')).toBeVisible();

    await page.getByTestId('chat-fab').click();
    await page.getByTestId('chat-input').fill('expand the plan');
    await page.getByTestId('chat-send').click();
    await expect(page.getByTestId('chat-streaming')).toBeVisible();

    await openLanguageDialog(page);
    const english = page.getByTestId('language-option-en');
    const spanish = page.getByTestId('language-option-es-MX');
    await expect(english).toBeDisabled();
    await expect(spanish).toBeDisabled();
    await expect(spanish).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('language-busy')).toHaveText(tr('settings.languageChangeBlocked'));
    await checkScreen(page, 'the Language dialog (the former Settings-row case) with a refine in flight');

    // Defence in depth: a request that never saw the control — a second tab,
    // a stale one, a direct call — is refused by the server while the job runs.
    const refused = await request.put('/api/settings', { data: { language: 'en' } });
    expect(refused.status()).toBe(409);
    const body = (await refused.json()) as { error: string; message: string };
    expect(body.error).toBe('language_change_blocked');
    expect(body.message).toBe(t('settings.languageChangeBlocked', {}, 'es-MX'));
    expect(await storedLanguage(request)).toBe('es-MX');

    // Once the refine has finished, the control comes back and says nothing.
    await expect(page.getByTestId('language-busy')).toHaveCount(0, { timeout: 30_000 });
    await expect(english).toBeEnabled();
    await expect(spanish).toBeEnabled();
  });

  test('V2: the server refuses a language change while a draft streams', async ({ page, request }) => {
    const { patient, format } = await practice(request, 'es-MX');
    await page.goto('/');
    // The draft's own stream, read in the page. The moment its first event
    // arrives — the server's draft job is open from before the first byte to
    // after the last — the page asks the test to send the change, which goes
    // from the runner rather than the page: a request that never saw the
    // control, and a refusal the page's own console has no reason to log.
    let refusal: { status: number; error: string | null } | null = null;
    await page.exposeFunction('changeLanguageNow', async () => {
      const response = await request.put('/api/settings', { data: { language: 'en' } });
      refusal = {
        status: response.status(),
        error: ((await response.json()) as { error?: string }).error ?? null,
      };
    });
    const finished = await page.evaluate(
      async ({ patientId, formatId }) => {
        const response = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            patient_id: patientId,
            format_id: formatId,
            typed_notes: 'Duerme mejor esta semana; menos pensamientos intrusivos.',
          }),
        });
        const reader = (response.body as ReadableStream<Uint8Array>).getReader();
        const first = await reader.read();
        await (window as unknown as { changeLanguageNow: () => Promise<void> }).changeLanguageNow();
        let rest = first.done ? '' : new TextDecoder().decode(first.value);
        for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
          rest += new TextDecoder().decode(chunk.value);
        }
        return rest.includes('event: note');
      },
      { patientId: patient, formatId: format },
    );
    const outcome = { ...(refusal ?? { status: 0, error: null }), finished };
    expect(outcome.status).toBe(409);
    expect(outcome.error).toBe('language_change_blocked');
    expect(outcome.finished).toBe(true);
    expect(await storedLanguage(request)).toBe('es-MX');

    // With the draft done, the same change is accepted — and put back.
    expect((await request.put('/api/settings', { data: { language: 'en' } })).status()).toBe(200);
    expect((await request.put('/api/settings', { data: { language: 'es-MX' } })).status()).toBe(200);
  });

  test('V3: switching applies at once and survives leaving the control and coming back, no reload', async ({
    page,
    request,
  }) => {
    await practice(request, 'es-MX');
    await page.goto('/');
    const root = page.locator('html');
    await openLanguageDialog(page);
    const english = page.getByTestId('language-option-en');
    const spanish = page.getByTestId('language-option-es-MX');
    await expect(spanish).toHaveAttribute('aria-checked', 'true');
    await expect(root).toHaveAttribute('lang', 'es-MX');
    await expect(page.getByTestId('language-dialog')).toContainText(t('language.choose', {}, 'es-MX'));

    // --- To English -------------------------------------------------------
    await english.click();
    await expect(english).toHaveAttribute('aria-checked', 'true');
    await expect(root).toHaveAttribute('lang', 'en');
    await expect(page.getByTestId('language-dialog')).toContainText(t('language.choose', {}, 'en'));
    await expect.poll(() => storedLanguage(request)).toBe('en');

    // Away to Settings and back to the control, with no document loaded: the
    // page's own words agree, and so does the reopened control.
    await page.getByTestId('language-close').click();
    await openSettingsModal(page);
    await expect(page.getByTestId('appearance-settings')).toContainText(t('settings.appearance', {}, 'en'));
    await expect(root).toHaveAttribute('lang', 'en');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('appearance-settings')).toHaveCount(0);
    await openLanguageDialog(page);
    await expect(english).toHaveAttribute('aria-checked', 'true');
    await expect(spanish).toHaveAttribute('aria-checked', 'false');
    await expect(root).toHaveAttribute('lang', 'en');
    expect(await storedLanguage(request)).toBe('en');

    // --- And back to Spanish, the same way ----------------------------------
    await spanish.click();
    await expect(root).toHaveAttribute('lang', 'es-MX');
    await expect.poll(() => storedLanguage(request)).toBe('es-MX');
    await page.getByTestId('language-close').click();
    await openSettingsModal(page);
    await expect(page.getByTestId('appearance-settings')).toContainText(
      t('settings.appearance', {}, 'es-MX'),
    );
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('appearance-settings')).toHaveCount(0);
    await openLanguageDialog(page);
    await expect(spanish).toHaveAttribute('aria-checked', 'true');
    await expect(root).toHaveAttribute('lang', 'es-MX');

    // After a reload too: the server was told.
    await page.reload();
    await expect(root).toHaveAttribute('lang', 'es-MX');
    await openLanguageDialog(page);
    await expect(spanish).toHaveAttribute('aria-checked', 'true');
  });

  /**
   * The dialog's own cases, written when it sat beside the Settings row.
   *
   * They overlap the two above now that both drive the dialog, and are kept
   * as they were: they carry the no-English check on the dialog itself (the
   * known S2.6 `language.en.english` finding, recorded below and not hidden),
   * the round trip through Home, and the dev-switch gate.
   */
  test('V2 on the dialog: disabled with its reason while a refine streams, and the server refuses a direct change', async ({
    page,
    request,
    tr,
    checkScreen,
  }) => {
    const plan = Array.from(
      { length: 120 },
      () => 'Continuar sesiones semanales y ejercicios de respiración.',
    ).join(' ');
    const { patient, note } = await practice(
      request,
      'es-MX',
      `Subjective: Duerme mejor esta semana.\n\nPlan: ${plan}`,
    );
    await page.goto(`/?patient=${patient}&note=${String(note)}`);
    await expect(page.getByTestId('note-body')).toBeVisible();

    await page.getByTestId('chat-fab').click();
    await page.getByTestId('chat-input').fill('expand the plan');
    await page.getByTestId('chat-send').click();
    await expect(page.getByTestId('chat-streaming')).toBeVisible();

    await openLanguageDialog(page);
    const english = page.getByTestId('language-option-en');
    const spanish = page.getByTestId('language-option-es-MX');
    // Both offered, because this build has the dev switch on — the dialog
    // filters on `spanish_available` rather than hiding Spanish, and offers
    // one option instead of one disabled one on a build without it.
    await expect(page.getByTestId('language-grid')).toBeVisible();
    await expect(spanish).toBeVisible();
    await expect(spanish).toHaveAttribute('aria-checked', 'true');
    await expect(english).toBeDisabled();
    await expect(spanish).toBeDisabled();
    // The same reason sentence, the same key, the same wording as the row.
    await expect(page.getByTestId('language-busy')).toHaveText(tr('settings.languageChangeBlocked'));

    // The English check runs here, on the open dialog, and it is expected to
    // report one key. That is a finding, not noise, and the reason it is not
    // narrowed away is the card's own wording in two places.
    //
    // V1's expected outcome is "es-MX project calls `expectNoEnglishUi` on
    // **every screen**", and AM-062 requires "the same browser verification" to
    // exercise the More dialog. The dialog is a screen of its own, so checking
    // the workspace behind it would not be the same verification — it would be
    // a different, weaker claim wearing its name.
    //
    // AM-054 does allow narrowing "which screens" V1 covers, but only "if the
    // walker is too noisy", and that is the test. This is not noise. The
    // chooser writes each language's own name for itself and, under it, the
    // name in English, so someone who landed here in Spanish can still find
    // their language from the English line. For Spanish, both lines are
    // byte-identical in the two catalogues and the identical-value rule passes
    // them. For English they are not: `language.en.endonym` is correctly left
    // untranslated ("English (United States)" — an endonym is a proper noun)
    // while `language.en.english` is translated ("Inglés (Estados Unidos)"), so
    // the string the dialog prints is reported against the one key whose
    // Spanish differs.
    //
    // So the report is **true**: the catalogues disagree about this string, and
    // the check is right that they do. Both keys are outside this card's May
    // edit — `en.ts`/`es-MX.ts` are licensed here for the single
    // `plan.attestationStatement` key and the five `settings.language*` ones,
    // and `LanguageDialog.tsx` is not licensed at all — and an `ALLOWED` entry
    // would be a suppression, which AM-059 forbids and which would hide the
    // disagreement rather than record it. The row therefore runs and reports,
    // and the finding is in the S2.6 return under "Unresolved items" for the
    // coordinator to scope.
    await checkScreen(page, 'the Language dialog with a refine in flight');

    // The check above reports 0 English on a dialog that plainly carries two
    // English lines, and **the reason is not known.** An earlier comment here
    // attributed it to `.language-option:disabled { opacity: 0.7 }`
    // (`app.css:5092`) making the option invisible to the walker; that was
    // wrong, it is retracted, and nothing in this file may be scoped from it.
    //
    // A sub-1 opacity is not it. An independent re-probe on this box's own
    // Chromium — `docs/v2/state/reviews/S2.6-AM059-implementation.md` §6,
    // against a DOM carrying the app's own class names, a real `disabled`
    // attribute and the real `opacity: 0.7` rule — returned
    // `checkVisibility({checkOpacity: true, checkVisibilityCSS: true}) === true`
    // for both a bare `<button disabled>` and that option, exit 0. Only
    // `display:none`, `visibility:hidden` and `opacity: 0` return false, so the
    // walker reads a disabled control's text. The original "isolated probe" is
    // not reproducible and the claim is withdrawn.
    //
    // The two annotated counts remain what they are — an observation, not a
    // cause: 54 strings read with a refine in flight, 62 idle. They are counts
    // of two **different page states** (the in-flight one adds
    // `settings.languageChangeBlocked` in `language-busy`), so 62 − 54 = 8
    // against five strings listed by hand, and the in-flight state carries a
    // string the idle one does not. They do not measure one screen twice and
    // cannot be differenced into a mechanism. Whatever the cause is, it needs
    // re-diagnosis before anything is scoped; `no-english.ts` is a guard and no
    // guard is changed from this card.
    //
    // Both checks stay because they are two different assertions on one dialog —
    // "disabled, with its reason" in flight, and "no English in the chooser"
    // when idle — and the idle one is the call that fails today. See the
    // preceding comment: the F1 disagreement between the two catalogues is
    // reported, not narrowed away, and it is V1's single failure.

    // Defence in depth, from the dialog's own surface rather than the row's.
    const refused = await request.put('/api/settings', { data: { language: 'en' } });
    expect(refused.status()).toBe(409);
    expect(((await refused.json()) as { error: string }).error).toBe('language_change_blocked');
    expect(await storedLanguage(request)).toBe('es-MX');

    await expect(page.getByTestId('language-busy')).toHaveCount(0, { timeout: 30_000 });
    await expect(english).toBeEnabled();
    await expect(spanish).toBeEnabled();
    // Nothing is left saying why, which is the other half of "disabled with a
    // reason": the reason appears while there is work and goes when there is not.
    await expect(page.getByTestId('language-error')).toHaveCount(0);
    await checkScreen(page, 'the Language dialog with nothing in flight');
  });

  test('V3 on the dialog: switching applies at once and survives leaving the workspace and coming back, no reload', async ({
    page,
    request,
    checkScreen,
  }) => {
    // `checkScreen` is the Spanish-project English check, so it may only be
    // called while the page is in Spanish — after a switch to English the page
    // is English and the check would be measuring the wrong thing. It is
    // therefore called on the workspace behind the dialog, in Spanish, rather
    // than on the dialog itself; the reason is in the V2 case above.

    // A patient, so Home is a real destination rather than an onboarding
    // redirect that would make "navigating away" prove nothing.
    await practice(request, 'es-MX');
    await page.goto('/');
    const root = page.locator('html');
    await expect(root).toHaveAttribute('lang', 'es-MX');

    await openLanguageDialog(page);
    const english = page.getByTestId('language-option-en');
    const spanish = page.getByTestId('language-option-es-MX');
    await expect(spanish).toHaveAttribute('aria-checked', 'true');

    // --- To English -------------------------------------------------------
    await english.click();
    await expect(english).toHaveAttribute('aria-checked', 'true');
    await expect(root).toHaveAttribute('lang', 'en');
    await expect.poll(() => storedLanguage(request)).toBe('en');
    // The whole app changed, not just this window: the workspace behind it is
    // English now too. (`patient-list` is the column's own testid; `col-notes`
    // is only a class, which is why the two are not interchangeable.)
    await expect(page.getByTestId('patient-list')).toBeVisible();

    // Away and back, with no document loaded: the dialog is transient, so
    // "it kept the language" is the reopened window agreeing with the page and
    // the server, not a component that never unmounted.
    //
    // Away means a route that actually pushes a history entry (AM-072).
    // `home-link` is `<Link to="/">` and the page is **already** at `/`, so
    // clicking it wrote nothing and `goBack()` fell off the front of the stack
    // onto `about:blank` — which is what the `toHaveURL` below then failed on.
    // "New patient" is a real route, so the browser's Back returns here
    // through the entry the click really made, still in-app and still without
    // loading a document.
    await page.getByTestId('language-close').click();
    await page.getByTestId('new-patient').click();
    await expect(page.getByTestId('add-patient-form')).toBeVisible();
    await expect(root).toHaveAttribute('lang', 'en');
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('home')).toBeVisible();
    await expect(root).toHaveAttribute('lang', 'en');
    expect(await storedLanguage(request)).toBe('en');

    await openLanguageDialog(page);
    await expect(page.getByTestId('language-option-en')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('language-option-es-MX')).toHaveAttribute('aria-checked', 'false');

    // --- And back to Spanish, the same way ----------------------------------
    await page.getByTestId('language-option-es-MX').click();
    await expect(root).toHaveAttribute('lang', 'es-MX');
    await expect.poll(() => storedLanguage(request)).toBe('es-MX');
    await page.getByTestId('language-close').click();
    // The same away-and-back as above, for the same reason (AM-072): a route
    // that pushes, so `goBack()` has somewhere real to return from.
    await page.getByTestId('new-patient').click();
    await expect(page.getByTestId('add-patient-form')).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('home')).toBeVisible();
    await checkScreen(page, 'Home, Spanish again after a switch from the dialog');
    await expect(root).toHaveAttribute('lang', 'es-MX');
    await checkScreen(page, 'the workspace, Spanish again after a switch from the dialog');
    await openLanguageDialog(page);
    await expect(page.getByTestId('language-option-es-MX')).toHaveAttribute('aria-checked', 'true');
    await expect(root).toHaveAttribute('lang', 'es-MX');
    // After a round trip through the dialog, the Settings screen agrees: its
    // own words are in Spanish (it no longer has a language control to read).
    await page.getByTestId('language-close').click();
    await page.goto('/settings');
    await expect(page.getByTestId('appearance-settings')).toContainText(
      t('settings.appearance', {}, 'es-MX'),
    );
    await expect(root).toHaveAttribute('lang', 'es-MX');
    await page.goBack();
    await openLanguageDialog(page);
    await expect(page.getByTestId('language-option-es-MX')).toHaveAttribute('aria-checked', 'true');

    // After a reload too: the server was told, not just the provider.
    await page.reload();
    await expect(root).toHaveAttribute('lang', 'es-MX');
    await openLanguageDialog(page);
    await expect(page.getByTestId('language-option-es-MX')).toHaveAttribute('aria-checked', 'true');
    expect(await storedLanguage(request)).toBe('es-MX');
  });
});

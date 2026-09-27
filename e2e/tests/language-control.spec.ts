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

/** Open Settings from the workspace's "More" menu, as she would mid-session. */
async function openSettingsModal(page: Page): Promise<void> {
  await page.getByTestId('mission-control').click();
  await page.getByTestId('mission-settings').click();
  await expect(page.getByTestId('language-settings')).toBeVisible();
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

    await openSettingsModal(page);
    const english = page.getByTestId('language-en');
    const spanish = page.getByTestId('language-es-MX');
    await expect(english).toBeDisabled();
    await expect(spanish).toBeDisabled();
    await expect(spanish).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('language-busy')).toHaveText(tr('settings.languageChangeBlocked'));
    await checkScreen(page, 'Settings (modal) with a refine in flight');

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

  test('V3: switching applies at once and survives leaving Settings and coming back, no reload', async ({
    page,
    request,
  }) => {
    await practice(request, 'es-MX');
    await page.goto('/settings');
    const root = page.locator('html');
    const english = page.getByTestId('language-en');
    const spanish = page.getByTestId('language-es-MX');
    await expect(spanish).toHaveAttribute('aria-checked', 'true');
    await expect(root).toHaveAttribute('lang', 'es-MX');
    await expect(page.getByTestId('appearance-settings')).toContainText(
      t('settings.appearance', {}, 'es-MX'),
    );

    // --- To English -------------------------------------------------------
    await english.click();
    await expect(english).toHaveAttribute('aria-checked', 'true');
    await expect(root).toHaveAttribute('lang', 'en');
    await expect(page.getByTestId('appearance-settings')).toContainText(t('settings.appearance', {}, 'en'));
    await expect.poll(() => storedLanguage(request)).toBe('en');

    // Home by the screen's own back link, then back by history: no document
    // is loaded, so the provider that was told survives.
    await page.getByRole('link', { name: t('common.patients', {}, 'en') }).click();
    await expect(page.getByTestId('home')).toBeVisible();
    await expect(root).toHaveAttribute('lang', 'en');
    await page.goBack();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(english).toHaveAttribute('aria-checked', 'true');
    await expect(spanish).toHaveAttribute('aria-checked', 'false');
    await expect(root).toHaveAttribute('lang', 'en');
    await expect(page.getByTestId('appearance-settings')).toContainText(t('settings.appearance', {}, 'en'));
    expect(await storedLanguage(request)).toBe('en');

    // --- And back to Spanish, the same way ----------------------------------
    await spanish.click();
    await expect(root).toHaveAttribute('lang', 'es-MX');
    await expect.poll(() => storedLanguage(request)).toBe('es-MX');
    await page.getByRole('link', { name: t('common.patients', {}, 'es-MX') }).click();
    await expect(page.getByTestId('home')).toBeVisible();
    await page.goBack();
    await expect(spanish).toHaveAttribute('aria-checked', 'true');
    await expect(root).toHaveAttribute('lang', 'es-MX');
    await expect(page.getByTestId('appearance-settings')).toContainText(
      t('settings.appearance', {}, 'es-MX'),
    );

    // After a reload too: the server was told.
    await page.reload();
    await expect(spanish).toHaveAttribute('aria-checked', 'true');
    await expect(root).toHaveAttribute('lang', 'es-MX');
  });
});

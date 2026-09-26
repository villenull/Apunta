import { expect, test, uniqueName } from '../support/fixtures';

/**
 * C-SETTINGS@1, the Normal example, in the real app against the real server.
 *
 * Dark → choose Light → Home → back to Settings **without a reload** → Light
 * selected, page light, provider value light; after a reload, still light.
 *
 * The point is the segment and the page disagreeing with each other. The
 * provider loads once and controls save into their own state, so leaving
 * Settings and coming back remounts the card from provider data that still says
 * Dark while the page — painted from the same provider — is light again. A
 * reload hides it, which is why there is no reload until the last two
 * assertions.
 *
 * There is no reload in the middle because "the chosen value is remembered" is
 * not what is being asserted: it is that the control and the provider cannot
 * disagree about a value the server already accepted.
 */

test('settings appearance: keeps the chosen theme after leaving Settings and coming back, no reload', async ({
  page,
  request,
}) => {
  // Deterministic starting point: Dark, whatever a sibling spec left behind.
  await request.put('/api/settings', { data: { theme: 'dark' } });
  // A first run with no note format redirects `/` to onboarding, and "navigate
  // to Home" has to be Home.
  await request.post('/api/formats', {
    data: { name: uniqueName('E2E settings appearance format'), sections: ['Subjective', 'Plan'] },
  });

  await page.goto('/settings');
  const light = page.getByTestId('theme-light');
  const dark = page.getByTestId('theme-dark');
  const root = page.locator('html');
  await expect(dark).toHaveAttribute('aria-checked', 'true');
  await expect(root).toHaveAttribute('data-theme', 'dark');

  await light.click();
  await expect(light).toHaveAttribute('aria-checked', 'true');
  await expect(root).toHaveAttribute('data-theme', 'light');

  // Home, then back to Settings. Both are in-app: the first is the card's own
  // back link, the second is the browser's history, so no document is loaded
  // and the provider survives it.
  await page.getByRole('link', { name: 'Patients' }).click();
  await expect(page.getByTestId('home')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByTestId('appearance-settings')).toBeVisible();

  // The selected segment is derived from the provider, so this pair *is*
  // "provider value light" with the page painted from it.
  await expect(light).toHaveAttribute('aria-checked', 'true');
  await expect(root).toHaveAttribute('data-theme', 'light');

  // And after a reload it is still light: the server was told, and told once.
  await page.reload();
  await expect(light).toHaveAttribute('aria-checked', 'true');
  await expect(root).toHaveAttribute('data-theme', 'light');
});

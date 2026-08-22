import { expect, test } from '../support/fixtures';

test('the health endpoint answers with the fake-AI payload', async ({ request }) => {
  const response = await request.get('/api/health');

  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({ ok: true, fakeAi: true });
});

test('the built SPA is served from the same origin as the API', async ({ page }) => {
  await page.goto('/');

  // Either the workspace or first-run onboarding, depending on what the shared
  // database holds — both prove the bundle booted and reached the API.
  await expect(page.locator('.app-shell, .shell').first()).toBeVisible();
});

test('an unknown client route still serves the SPA shell', async ({ page }) => {
  await page.goto('/patients/does-not-exist-yet');

  await expect(page.locator('.app-shell, .shell').first()).toBeVisible();
});

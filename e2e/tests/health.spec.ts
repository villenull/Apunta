import { expect, test } from '@playwright/test';

test('the app shell loads and reports a healthy server', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('health-status')).toHaveText('Apunta — server ok');
});

test('the health endpoint answers with the stub payload', async ({ request }) => {
  const response = await request.get('/api/health');

  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({ ok: true, fakeAi: true });
});

test('an unknown client route still serves the SPA shell', async ({ page }) => {
  await page.goto('/patients/does-not-exist-yet');

  await expect(page.getByTestId('health-status')).toBeVisible();
});

import { expect, test } from '../support/fixtures';

/**
 * The first-run setup wizard (M7 deliverable 2), end to end.
 *
 * The health payload is forced unhealthy by intercepting `/api/health` in the
 * browser rather than by an environment variable on the server. The packet
 * suggested an env flag; a route intercept tests the same contract — the
 * screen against a payload — without adding a production knob whose only user
 * is this file, and it is the only way to make health *flip* mid-session,
 * which is the half of the criterion that actually matters. The recovery is
 * the point: she starts Ollama in another window and presses Check again.
 */

interface HealthPayload {
  ok: boolean;
  version: string;
  fakeAi: boolean;
  db: { path: string; migrationLevel: number };
  ollama: { reachable: boolean; model: string | null; modelPresent: boolean };
  whisper: { binaryPresent: boolean; modelPresent: boolean; binary: string; model: string };
  fileVault: { state: string; detail: string };
}

function unhealthy(base: HealthPayload): HealthPayload {
  return {
    ...base,
    ollama: { reachable: false, model: null, modelPresent: false },
    whisper: { ...base.whisper, binaryPresent: false, modelPresent: false },
  };
}

test.describe('the setup wizard', () => {
  test('shows what is missing, then recovers when health flips', async ({ page, request }) => {
    const real = (await (await request.get('/api/health')).json()) as HealthPayload;

    let healthy = false;
    await page.route('**/api/health', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(healthy ? real : unhealthy(real)),
      });
    });

    await page.goto('/setup');

    await expect(page.getByTestId('setup-checklist')).toBeVisible();
    await expect(page.getByTestId('setup-detail-ollama')).toContainText('nothing is answering');
    await expect(page.getByTestId('setup-fix-ollama')).toHaveText('brew services start ollama');
    await expect(page.getByTestId('setup-fix-whisper')).toHaveText('brew install whisper-cpp');
    // A copyable one-liner for the whole thing, since something is broken.
    await expect(page.getByTestId('setup-script-command')).toHaveText('bash scripts/setup-macos.sh');
    await expect(page.getByTestId('setup-ready')).toHaveCount(0);

    // She fixes it in another window, and presses the button.
    healthy = true;
    await page.getByTestId('setup-recheck').click();

    await expect(page.getByTestId('setup-detail-ollama')).toContainText('answering on');
    await expect(page.getByTestId('setup-ready')).toHaveText("You're fully local — nothing leaves this Mac.");
  });

  test('has no ffmpeg row, because a Mac without ffmpeg is a Mac that works', async ({ page }) => {
    await page.goto('/setup');
    await expect(page.getByTestId('setup-checklist')).toBeVisible();
    await expect(page.getByTestId('setup-checklist')).not.toContainText('ffmpeg', { ignoreCase: true });
  });

  test('the AI banner links here rather than naming a screen that does not exist', async ({ page }) => {
    const real = (await (await page.request.get('/api/health')).json()) as HealthPayload;
    await page.route('**/api/health', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(unhealthy(real)),
      });
    });

    await page.goto('/');
    await page.getByTestId('ai-banner-setup').click();

    await expect(page).toHaveURL(/\/setup$/);
    await expect(page.getByTestId('setup-checklist')).toBeVisible();
  });

  test('the About page says what local-only does not protect her from', async ({ page }) => {
    await page.goto('/about');

    await expect(page.getByRole('heading', { name: 'About Apunta' })).toBeVisible();
    const body = page.locator('.content');
    await expect(body).toContainText('no account');
    // The two honest caveats, not just the guarantee.
    await expect(body).toContainText('Someone at your unlocked Mac');
    await expect(body).toContainText('FileVault');
    await expect(page.getByTestId('about-db-path')).toContainText('apunta.db');
  });
});

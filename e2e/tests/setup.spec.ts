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
  test('shows what is missing, then recovers when health flips', async ({ page, request, checkScreen }) => {
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

    // The fix line has to be something she can run on *this* computer: the
    // Homebrew commands and the macOS setup script on a Mac, and an OS-neutral
    // instruction everywhere else.
    const onMac = await page.evaluate(() => /Macintosh|Mac OS X/i.test(navigator.userAgent));

    await expect(page.getByTestId('setup-checklist')).toBeVisible();
    await expect(page.getByTestId('setup-detail-ollama')).toContainText('nothing is answering');
    if (onMac) {
      await expect(page.getByTestId('setup-fix-ollama')).toHaveText('brew services start ollama');
      await expect(page.getByTestId('setup-fix-whisper')).toHaveText('brew install whisper-cpp');
      // A copyable one-liner for the whole thing, since something is broken.
      await expect(page.getByTestId('setup-script-command')).toHaveText('bash scripts/setup-macos.sh');
    } else {
      const elsewhere = 'Install the local runtime for your operating system, then press Check again.';
      await expect(page.getByTestId('setup-fix-ollama')).toHaveText(elsewhere);
      await expect(page.getByTestId('setup-fix-whisper')).toHaveText(elsewhere);
      // A macOS script is not offered where it cannot run.
      await expect(page.getByTestId('setup-script-command')).toHaveCount(0);
    }
    // Network locality is a property of the runtime, not of the disk, so the
    // statement stands while a row is red — the disk is a row of its own.
    await expect(page.getByTestId('setup-local')).toHaveText(
      'Apunta runs on this computer — notes are not sent over the network.',
    );

    // She fixes it in another window, and presses the button.
    await checkScreen(page, 'Setup, with the local AI missing');

    healthy = true;
    await page.getByTestId('setup-recheck').click();

    await expect(page.getByTestId('setup-detail-ollama')).toContainText('answering on');
    await expect(page.getByTestId('setup-local')).toBeVisible();
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

  test('the About page says what local-only does not protect her from', async ({ page, tr, checkScreen }) => {
    await page.goto('/about');

    await expect(page.getByRole('heading', { name: tr('about.title') })).toBeVisible();
    const body = page.locator('.content');
    await expect(body).toContainText(tr('about.localOnlyBody'));
    // The two honest caveats, not just the guarantee. The copy says "computer",
    // not "Mac", and the disk-encryption line names its own state.
    await expect(body).toContainText(tr('about.threatPerson'));
    await expect(page.getByTestId('about-filevault')).toContainText(tr('about.diskEncryption'));
    await expect(page.getByTestId('about-db-path')).toContainText('apunta.db');
    await checkScreen(page, 'About');
  });

  /**
   * M8 deliverable 6. Apunta bundles other people's programs, and MIT and BSD
   * both require the notice to travel with the distribution — a licence file
   * that only exists in the repository has not travelled anywhere. This is the
   * path from "About" to the actual text, through the running server.
   */
  test('About links the licences, and the licences are really there', async ({ page, tr }) => {
    await page.goto('/about');

    await page.getByRole('link', { name: tr('about.licensesLink') }).click();
    await expect(page).toHaveURL(/\/licenses$/);
    await expect(page.getByRole('heading', { name: tr('licenses.builtFrom') })).toBeVisible();

    // The licences are one section per component now, with an index and a
    // filter over them, so the panel is the thing that has to be there — and
    // the obligation is that the text itself is really rendered.
    // The licence text itself is the upstream projects' own English in both
    // projects: it is quoted, not translated.
    const text = page.getByRole('region', { name: tr('licenses.panelLabel') });
    await expect(text).toBeVisible();
    // The components that carry an obligation, and the text that satisfies it.
    await expect(text).toContainText('MIT License');
    await expect(text).toContainText('Ollama');
    await expect(text).toContainText('whisper.cpp');
    await expect(text).toContainText('Node.js');
    // And the honest half: what nobody has read yet is named.
    await expect(text).toContainText('What has not been verified');
  });
});

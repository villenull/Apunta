import type { Page } from '@playwright/test';

import { acquireAppearanceLock, expect, releaseAppearanceLock, test, uniqueName } from '../support/fixtures';

/**
 * C-SETTINGS@1, the Normal example, in the real app against the real server.
 *
 * Dark → choose Light → close Settings → open it again **without a reload** →
 * Light selected, page light, provider value light; after a reload, still
 * light.
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

/** Settings is a modal over the workspace (owner, 2026-10-05). */
async function openSettings(page: Page): Promise<void> {
  await page.getByTestId('mission-control').click();
  await page.getByTestId('mission-settings').click();
  await expect(page.getByTestId('appearance-settings')).toBeVisible();
}

test('settings appearance: keeps the chosen theme after leaving Settings and coming back, no reload', async ({
  page,
  request,
  tr,
  checkScreen,
}) => {
  // `theme` is one global row on this one server, and `workspace.spec.ts` and
  // `brand.spec.ts` write it too while this runs. The hold runs from the write
  // to the last assertion that reads it back — the reload included, which is
  // exactly the window a sibling's `PUT` used to land in.
  await acquireAppearanceLock();
  try {
    // Deterministic starting point: Dark, whatever a sibling spec left behind.
    await request.put('/api/settings', { data: { theme: 'dark' } });
    // A first run with no note format redirects `/` to onboarding, and the
    // workspace — which Settings is a modal over — has to be real.
    await request.post('/api/formats', {
      data: { name: uniqueName('E2E settings appearance format'), sections: ['Subjective', 'Plan'] },
    });

    await page.goto('/');
    await openSettings(page);
    const light = page.getByTestId('theme-light');
    const dark = page.getByTestId('theme-dark');
    const root = page.locator('html');
    await expect(dark).toHaveAttribute('aria-checked', 'true');
    await expect(root).toHaveAttribute('data-theme', 'dark');
    await checkScreen(page, 'Settings');

    await light.click();
    await expect(light).toHaveAttribute('aria-checked', 'true');
    await expect(root).toHaveAttribute('data-theme', 'light');

    // Close it, then open it again. Both are in-app: the first is the panel's
    // own ×, the second is "More" → Settings, so no document is loaded and the
    // provider survives it.
    await page.getByLabel(tr('settings.closeLabel')).click();
    await expect(page.getByTestId('settings-modal')).toHaveCount(0);
    await checkScreen(page, 'Home');
    await openSettings(page);

    // The selected segment is derived from the provider, so this pair *is*
    // "provider value light" with the page painted from it.
    await expect(light).toHaveAttribute('aria-checked', 'true');
    await expect(root).toHaveAttribute('data-theme', 'light');

    // And after a reload it is still light: the server was told, and told once.
    // The reload takes the modal with it, so it is opened again.
    await page.reload();
    await openSettings(page);
    await expect(light).toHaveAttribute('aria-checked', 'true');
    await expect(root).toHaveAttribute('data-theme', 'light');
  } finally {
    releaseAppearanceLock();
  }
});

/**
 * C-SETTINGS@1's radio bullet in a real browser: arrow keys move **and** select
 * inside the theme group, and Tab enters it at the selected option.
 *
 * The keyboard path is the same path a click takes, so this also pins the part
 * that only shows up under a key: the group has a single tab stop, focus follows
 * the selection, and `data-theme` carries the **resolved** theme — `system` is
 * the stored choice, never what the page is painted.
 */
test('settings appearance: moves and selects the theme with the arrow keys', async ({
  page,
  request,
  tr,
}) => {
  // The same global row as the test above, and the same hold: from the write to
  // the last assertion that reads it back.
  await acquireAppearanceLock();
  try {
    // Deterministic starting point: Dark, whatever a sibling spec left behind.
    await request.put('/api/settings', { data: { theme: 'dark' } });
    // Order-independent: a run that reaches this test first still has a note
    // format, so the workspace — and Settings over it — is a real screen.
    await request.post('/api/formats', {
      data: { name: uniqueName('E2E settings appearance keyboard format'), sections: ['Subjective', 'Plan'] },
    });

    await page.goto('/');
    await openSettings(page);
    const system = page.getByTestId('theme-system');
    const light = page.getByTestId('theme-light');
    const dark = page.getByTestId('theme-dark');
    const root = page.locator('html');
    await expect(dark).toHaveAttribute('aria-checked', 'true');
    await expect(root).toHaveAttribute('data-theme', 'dark');

    // One tab stop, on the choice already made: the other two segments are
    // unreachable by Tab alone, so the arrows have to work.
    await expect(dark).toHaveAttribute('tabindex', '0');
    await expect(light).toHaveAttribute('tabindex', '-1');
    await expect(system).toHaveAttribute('tabindex', '-1');

    await dark.focus();
    await page.keyboard.press('ArrowLeft');

    // Moving is selecting: no Enter, no Space, and the save is already through
    // (the same `Saved` note a click leaves).
    await expect(light).toHaveAttribute('aria-checked', 'true');
    await expect(dark).toHaveAttribute('aria-checked', 'false');
    await expect(light).toHaveAttribute('tabindex', '0');
    await expect(light).toBeFocused();
    await expect(root).toHaveAttribute('data-theme', 'light');
    await expect(page.getByTestId('appearance-saved')).toHaveText(tr('note.saveSaved'));

    // `THEMES` is `system, light, dark`, so Home is System. What persists is the
    // choice `system`; what the page is painted is the resolved theme, and
    // Playwright emulates a light OS — so `light`, never the literal `system`.
    await page.keyboard.press('Home');
    await expect(system).toHaveAttribute('aria-checked', 'true');
    await expect(light).toHaveAttribute('aria-checked', 'false');
    await expect(system).toHaveAttribute('tabindex', '0');
    await expect(system).toBeFocused();
    await expect(root).toHaveAttribute('data-theme', 'light');
    await expect(root).not.toHaveAttribute('data-theme', 'system');
  } finally {
    releaseAppearanceLock();
  }
});

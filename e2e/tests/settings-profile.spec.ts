import { expect, test } from '../support/fixtures';

test.describe('drafting model settings', () => {
  test('switches between Quick and Thorough and persists the choice', async ({ page }) => {
    await page.goto('/settings');

    const quick = page.getByTestId('llm-profile-quick');
    const thorough = page.getByTestId('llm-profile-thorough');
    await expect(quick).toBeVisible();
    await expect(thorough).toBeVisible();
    await expect(thorough).toHaveAttribute('aria-checked', 'true');

    await quick.click();
    await expect(quick).toHaveAttribute('aria-checked', 'true');
    await page.reload();
    await expect(page.getByTestId('llm-profile-quick')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('llm-profile-thorough')).toHaveAttribute('aria-checked', 'false');
  });
});

import { test as base, expect } from '@playwright/test';

/**
 * The base test, plus one rule the packet asks for: a spec fails if the page
 * logged an error or threw. A React app that "works" while shouting into the
 * console is not working — an unhandled rejection or a key warning is exactly
 * the class of bug an e2e run should catch.
 */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      page.on('pageerror', (error) => {
        errors.push(`uncaught: ${error.message}`);
      });

      await use(errors);

      expect(errors, 'the page logged console errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Unique per run, so specs sharing one database never collide on a name. */
export function uniqueName(prefix: string): string {
  return `${prefix} ${String(Date.now())}-${String(Math.floor(Math.random() * 10_000))}`;
}

import { z } from 'zod';

import { requestJson } from './client.js';

const LicensesResponseSchema = z.object({ text: z.string() });

/**
 * The text of `THIRD-PARTY-LICENSES.md`, from the copy shipped inside the app.
 *
 * Read from the server rather than bundled into the browser build: the file is
 * ~200 KB of licence text that almost nobody opens, and putting it in the SPA
 * bundle would make every page load carry it.
 */
export async function fetchLicenses(signal?: AbortSignal): Promise<string> {
  const response = await requestJson('/api/licenses', LicensesResponseSchema, signal ? { signal } : {});
  return response.text;
}

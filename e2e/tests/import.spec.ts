import { fileURLToPath } from 'node:url';

import { expect, test, isAdmittedRecencyNotes404, APP_ORIGINS } from '../support/fixtures';

/**
 * Importing a Claude export automatically, end to end through the real
 * server (M11). The fixture is fabricated with the prototype's names; see
 * `server/src/import/claude.test.ts` for what each conversation in it is for.
 *
 * What this proves that the unit tests cannot: the file and the settings go
 * up through the browser's multipart path twice (preview, then run), a
 * patient she unticks is not written, the patients land in the list, and
 * the one-click undo takes the whole run back.
 */
const EXPORT = fileURLToPath(new URL('../fixtures/claude-export/patient-chats.json', import.meta.url));

/**
 * The one console message the suite admits, and every near miss of it.
 *
 * This is the proof that the `consoleErrors` guard is still a guard: the owner
 * took a single-class allowlist for it (AM-094, `docs/v2/state/AMENDMENTS.md:117`),
 * and this table says exactly how single. Every case is one the class must
 * refuse except the first two, which are the class itself on each of the two
 * origins this run serves. A predicate too wide to express one of these is too
 * wide, and the fix is the predicate, never the table.
 *
 * Pure: it takes no fixtures and opens no page of its own, because it is a
 * table over a pure function. Playwright still stands up this suite's automatic
 * `page` and `request` fixtures for any test declared with it; nothing here
 * uses them, and the ids below are fabricated.
 */
test('admits the recency notes 404 and nothing else', () => {
  const en = String(APP_ORIGINS[0]);
  const es = String(APP_ORIGINS[1]);
  const id = '01a0f082-f8bb-70db-b15c-dbb62f9de105';
  const notes = `${en}/api/patients/${id}/notes`;
  const resourceLoad = (status: number, reason: string): string =>
    `Failed to load resource: the server responded with a status of ${String(status)}${reason}`;
  const cases: {
    readonly name: string;
    readonly text: string;
    readonly url: string | undefined;
    readonly admitted: boolean;
  }[] = [
    {
      name: 'the class: a 404 on the recency read, English origin, with Chromium’s reason phrase',
      text: resourceLoad(404, ' (Not Found)'),
      url: notes,
      admitted: true,
    },
    {
      name: 'the class on the es-MX origin too, without the reason phrase',
      text: resourceLoad(404, ''),
      url: `${es}/api/patients/${id}/notes`,
      admitted: true,
    },
    {
      name: 'a 404 on another patient route',
      text: resourceLoad(404, ' (Not Found)'),
      url: `${en}/api/patients/${id}`,
      admitted: false,
    },
    {
      name: 'a 404 on the batch list',
      text: resourceLoad(404, ' (Not Found)'),
      url: `${en}/api/import/batches`,
      admitted: false,
    },
    {
      name: 'a 404 on another patient sub-resource',
      text: resourceLoad(404, ' (Not Found)'),
      url: `${en}/api/patients/${id}/plans`,
      admitted: false,
    },
    {
      name: 'another status on the admitted path',
      text: resourceLoad(500, ' (Internal Server Error)'),
      url: notes,
      admitted: false,
    },
    {
      name: 'the abort the recency hook’s own controller raises, on the admitted path',
      text: 'Failed to load resource: net::ERR_ABORTED',
      url: notes,
      admitted: false,
    },
    {
      name: 'a 404 one segment past the admitted path',
      text: resourceLoad(404, ' (Not Found)'),
      url: `${en}/api/patients/${id}/notes/1`,
      admitted: false,
    },
    {
      name: 'a 404 on the admitted path with a query string',
      text: resourceLoad(404, ' (Not Found)'),
      url: `${notes}?limit=1`,
      admitted: false,
    },
    {
      name: 'a 404 on the admitted path with a patient id that is not a uuid',
      text: resourceLoad(404, ' (Not Found)'),
      url: `${en}/api/patients/teh/notes`,
      admitted: false,
    },
    {
      name: 'a same-origin message that merely mentions a 404',
      text: `GET ${notes} failed with 404`,
      url: notes,
      admitted: false,
    },
    {
      name: 'a pageerror string',
      text: 'uncaught: Failed to load resource: the server responded with a status of 404 (Not Found)',
      url: notes,
      admitted: false,
    },
    {
      name: 'a resource-load 404 from a port this run does not serve',
      text: resourceLoad(404, ' (Not Found)'),
      url: 'http://127.0.0.1:9999/api/patients/01a0f082-f8bb-70db-b15c-dbb62f9de105/notes',
      admitted: false,
    },
    {
      name: 'a resource-load 404 from another host on the app’s own port',
      text: resourceLoad(404, ' (Not Found)'),
      url: `http://localhost:${String(new URL(en).port)}/api/patients/${id}/notes`,
      admitted: false,
    },
    {
      name: 'a 404 on the admitted path with no location at all',
      text: resourceLoad(404, ' (Not Found)'),
      url: undefined,
      admitted: false,
    },
  ];
  for (const { name, text, url, admitted } of cases) {
    expect(isAdmittedRecencyNotes404(text, url, APP_ORIGINS), name).toBe(admitted);
  }
});

test.describe('importing from Claude', () => {
  test('imports the patients seen since the cutoff, and undoes it in one click', async ({
    page,
    tr,
    checkScreen,
  }) => {
    // The counts the sentences below are built from, in the project's words.
    const notes = (count: number): string => tr('count.note', { count });
    const patients = (count: number): string => tr('count.patient', { count });
    // Import is a first-level row in the workspace's "More" menu, not a section
    // of Settings (owner, 2026-09-27), and it opens as a window over the
    // workspace rather than a page of its own (owner, 2026-10-05) — so the URL
    // never leaves `/` and the page behind stays on screen, blurred.
    await page.goto('/');
    await page.getByTestId('mission-control').click();
    await page.getByTestId('mission-import').click();
    await expect(page.getByTestId('import-modal')).toBeVisible();
    await expect(page.getByTestId('import-backdrop')).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: tr('doc.importClaude') })).toBeVisible();
    await expect(page.getByTestId('import-cutoff')).toHaveValue('2026-07-01');
    await checkScreen(page, 'Import from Claude');

    await page.getByTestId('import-file').setInputFiles(EXPORT);
    await page.getByTestId('import-check').click();
    const summary = page.getByTestId('import-summary');
    await expect(summary).toContainText(notes(7));
    await expect(summary).toContainText(patients(3));
    await checkScreen(page, 'the Claude import preview');

    // A glance, not a review: untick one, and the button says what is left.
    await page.getByLabel(tr('import.patientLabel', { name: 'Maria (2)' })).uncheck();
    await expect(page.getByTestId('import-run')).toHaveText(tr('import.runLabel', { notes: notes(5) }));
    await page.getByTestId('import-run').click();
    await expect(page.getByTestId('import-done')).toContainText(`${notes(5)}`);
    await expect(page.getByTestId('import-done')).toContainText(patients(2));
    await expect(page.getByTestId('import-skipped')).toContainText(tr('import.skip.singleSession'));
    await checkScreen(page, 'the Claude import report');
    await expect(page.getByTestId('import-skipped')).not.toContainText('Garden');

    await page.getByTestId('import-undo').click();
    await expect(page.getByTestId('import-undone')).toContainText(
      tr('import.undoneLine', { notes: notes(5), patients: patients(2) }),
    );
    await checkScreen(page, 'the Claude import, undone');

    // Escape closes the window and leaves her in the workspace she opened it
    // from, on the URL she was already on (owner, 2026-10-05).
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('import-modal')).toBeHidden();
    await expect(page).toHaveURL(/\/$/);
  });
});

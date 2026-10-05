import { appendFileSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test } from '../support/fixtures';

/**
 * The dictionary assets: lazy, bundled, and reachable — S6.1's V3 and V6.
 *
 * One case, collected by **both** the `es-MX` and the `chromium` project,
 * because both halves of it are the same question asked of whichever pair that
 * project's language selects: nothing is fetched until a spell surface mounts
 * (a), and when one does, exactly one `.aff` and one `.dic` arrive from the
 * app's own origin and are really in the build (b).
 *
 * There is deliberately no cross-project claim in here. The case cannot tell
 * which project it is running in, so "the es-MX project fetched the Spanish
 * pair" is not something it could assert without comparing itself; that
 * comparison is V9's executed `comm` over the two files this case writes, one
 * per run, to `$APUNTA_OBSERVED_FILE`.
 */

interface Created {
  id: string;
}

/**
 * An invented Spanish display name, read from the Spanish corpora's own
 * registry rather than typed here, so the `es-MX` run names nobody the corpora
 * do not contain (HS-8). `spelling-es.spec.ts` reads the same registry; this
 * spec depends on nothing else of that file, so it does not import it.
 */
const SPANISH_DISPLAY_NAME = ((): string => {
  const registry = readFileSync(
    resolve(import.meta.dirname, '..', 'fixtures', 'eval-es', 'NAMES.md'),
    'utf8',
  );
  const row = registry
    .split('\n')
    .find((line) => /^\| [^|]+ \| `[^`]+` \| (?:tuning|heldout) \| `[^`]+` \|$/u.test(line));
  const name = /^\| ([^|]+?) \|/u.exec(row ?? '')?.[1]?.trim() ?? '';
  if (name === '') throw new Error('the Spanish display name could not be read from NAMES.md');
  return name;
})();

/** The four names the build emits, read from the bundle the run is serving. */
function emittedDictionaryAssets(): readonly string[] {
  const assets = resolve(import.meta.dirname, '..', '..', 'web', 'dist', 'assets');
  return readdirSync(assets)
    .filter((name) => name.endsWith('.aff') || name.endsWith('.dic'))
    .sort();
}

test('no dictionary asset is requested until a spell surface mounts', async ({
  page,
  request,
  appLocale,
}) => {
  const requested: string[] = [];
  page.on('request', (request_) => {
    const url = new URL(request_.url());
    if (url.pathname.endsWith('.aff') || url.pathname.endsWith('.dic')) requested.push(request_.url());
  });

  // `/` has to be the workspace — the patient list and the empty editor — for
  // the negative half below to mean anything. With no note format defined it is
  // not: `Workspace.tsx` redirects `/` to `/onboarding/format`, which has no
  // `patient-list`. So the format and a patient are made here, through the API
  // and not the page, and this case owns its own precondition instead of
  // depending on another spec having created a format in this data folder
  // first — which is exactly what made it order-dependent, and flaky in the
  // `chromium` project, where no `language-control` dependency runs before it.
  const patient = (await (
    await request.post('/api/patients', { data: { name: SPANISH_DISPLAY_NAME } })
  ).json()) as Created;
  const format = (await (
    await request.post('/api/formats', {
      data: { name: 'Nota de progreso (assets)', sections: ['Subjetivo', 'Plan'] },
    })
  ).json()) as Created;

  // (a) The negative half: the workspace at `/` has no spell surface on it, so
  // the dictionary must stay out of the network entirely — this is what keeps
  // the pair out of the initial route chunk.
  await page.goto('/');
  await expect(page.getByTestId('patient-list')).toBeVisible();
  await page.waitForTimeout(500);
  expect(requested).toEqual([]);

  // A note with a body, which is the surface that mounts the spell layer. A
  // note with no format has no sections and therefore no body, and the body is
  // the surface whose mount is the positive half of this case.
  const note = (await (
    await request.post('/api/notes', {
      data: {
        patient_id: patient.id,
        format_id: format.id,
        content:
          appLocale === 'es-MX'
            ? 'Subjetivo: La sesión de café fue corta.\n\nPlan: Continuar semanalmente.'
            : 'Subjective: The coffee session was short.\n\nPlan: Continue weekly.',
      },
    })
  ).json()) as Created;

  // The stored language has to be settled before a spell surface mounts, or the
  // first mount loads the pair for the language the app guessed at that moment
  // and this row would be measuring that instead of what the UI language
  // selects. `html lang` is the app's own answer to "which language is this".
  await expect(page.locator('html')).toHaveAttribute('lang', appLocale);
  await page.goto(`/?patient=${patient.id}&note=${note.id}`);
  await expect(page.getByTestId('note-body')).toBeVisible();

  // (b) The positive half: exactly one pair, on this origin, and present in
  // the build. A green (a) with a red (b) is the failure this row exists for.
  await expect.poll(() => requested.length, { timeout: 15_000 }).toBe(2);
  const [aff, dic] = [...requested].sort();
  expect(aff).toMatch(/\.aff$/);
  expect(dic).toMatch(/\.dic$/);
  for (const url of requested) {
    const parsed = new URL(url);
    expect(parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost').toBe(true);
    expect(parsed.origin).toBe(new URL(page.url()).origin);
  }

  const emitted = emittedDictionaryAssets();
  expect(emitted).toHaveLength(4);
  for (const url of requested) {
    expect(emitted).toContain(new URL(url).pathname.split('/').pop() ?? '');
  }

  // What V9 differences: the two **asset names** this run asked for, one per
  // line — the bare names, not the URLs, because the other side of the
  // comparison is the build's own emitted list and the two ports differ per
  // project. The full URLs are asserted above, where the origin is the point.
  const observed = process.env['APUNTA_OBSERVED_FILE'];
  if (observed !== undefined && observed !== '') {
    writeFileSync(observed, '');
    for (const url of [...requested].sort())
      appendFileSync(observed, `${new URL(url).pathname.split('/').pop() ?? ''}\n`);
  }
});

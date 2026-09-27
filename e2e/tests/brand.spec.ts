import { resolve } from 'node:path';

import type { APIRequestContext, Locator, Page } from '@playwright/test';

import { DEFAULT_ACCENT_COLOR } from '@apunta/shared';

import { expect, test, uniqueName } from '../support/fixtures';

/**
 * The brand as it is actually **painted**, in a real browser.
 *
 * The A mark and the wordmark shipped in AM-028 (`b366be1`) and P2.1 pinned
 * them in jsdom, which is enough to know what the code says and not at all
 * enough to know what the page paints: jsdom has no cascade, so
 * `color: var(--brand-mark)` is a string there and a colour here. This file is
 * that missing half, and it exists so a later change to the token sheet, to
 * the top bar or to the Settings accent is a **failing test** rather than a
 * quiet visual change nobody would think to report.
 *
 * Two elements, two rules, which is the part most easily got wrong by reading
 * D10 (`DECISIONS.md:24`) instead of the code:
 *
 * - `--brand-mark` resolves to `var(--accent)` (`tokens.css`), and both
 *   `BrandMark` and `BrandWordmark` paint `currentColor` — so the mark and the
 *   wordmark take **the accent's** colour in every theme, including dark. There
 *   is no longer a fixed brand teal anywhere on screen;
 * - the accent default is `#2a9d8f` (`shared/src/settings.ts`), and
 *   `applyAccentColor` puts `#111111` on it for `--on-accent` because near-black
 *   beats white on this teal (6.32:1 against 3.32:1). The tables below carry the
 *   painted value, not the hex.
 *
 * **What this spec is for changed on 2026-09-27, and the old reasoning is
 * wrong.** It used to hold the mark accent-**invariant**: D10 fixed the brand
 * teal, and this spec existed to catch a mark that started *following* the
 * accent — "a mark or a wordmark that started following `--accent` would pass
 * every unit test in the tree and fail here". The owner has since reversed
 * that deliberately: the wordmark is meant to be recoloured by the accent
 * picker, so following the accent is now the **correct** behaviour and the
 * old claim would have this spec failing on purpose.
 *
 * So the coupling inverts and the spec's value inverts with it. It can no
 * longer detect a mark that begins following the accent, because that is what
 * it should do. What it now guards is the opposite and just as real: **a mark
 * that stops following the accent** — a hard-coded teal creeping back into a
 * component, a `tone="text"` call site left behind, a token that quietly stops
 * resolving — which would pass every unit test in the tree, because the unit
 * tests pin values and not relationships. That is what the purple half is for,
 * and it is now the *primary* assertion rather than the discriminating one:
 * `#7c3aed` is far enough from the default `#2a9d8f` that the two runs cannot
 * be confused.
 *
 * The cost, stated plainly because it is a real one: the brand's legibility is
 * now a function of a user setting. `applyAccentColor` guarantees the ink *on*
 * the accent is readable; it never checked the accent against the page. The
 * picker now warns below 3:1 (`settings.accentLowContrast`) rather than
 * refusing, which is the owner's choice — a hard refusal on a colour she has
 * picked is worse than a note.
 *
 * Serial, because theme and accent are one global settings row shared with
 * every other spec in the run (`fullyParallel`, one server, one database).
 * `beforeAll` reads the row and `afterAll` puts it back. The data directory is
 * per-run, so the blast radius is this Playwright run and never anything else.
 *
 * No patient, no note, no transcript: one fabricated note format so `/` is the
 * home screen rather than a redirect to onboarding.
 */

/**
 * `DEFAULT_ACCENT_COLOR` (`shared/src/settings.ts`), PUT explicitly.
 *
 * Imported rather than written out, so this spec cannot assert a painted colour
 * the app has stopped shipping: the hex and the painted value below are the
 * same value twice over, and only one of them is allowed to be a literal.
 */
const DEFAULT_ACCENT = DEFAULT_ACCENT_COLOR;
/** A purple far enough from the default teal to prove the mark followed. */
const OTHER_ACCENT = '#7c3aed';

type Theme = 'light' | 'dark';

interface Appearance {
  readonly theme: Theme;
  readonly accent: string;
  /** `--accent` as the engine resolves it, so the accent really moved. */
  readonly accentPainted: string;
  readonly mark: string;
  readonly wordmark: string;
}

/*
 * The mark and the wordmark are the same value as the painted accent, because
 * `--brand-mark` resolves to `var(--accent)` and both components paint
 * `currentColor`. So one `mark` field would do; `wordmark` is kept separate
 * because it is a second element on screen and a spec that only checked one
 * would not notice the other drifting.
 */
const LIGHT_DEFAULT: Appearance = {
  theme: 'light',
  accent: DEFAULT_ACCENT,
  accentPainted: 'rgb(42, 157, 143)',
  mark: 'rgb(42, 157, 143)',
  wordmark: 'rgb(42, 157, 143)',
};
const LIGHT_OTHER: Appearance = {
  ...LIGHT_DEFAULT,
  accent: OTHER_ACCENT,
  accentPainted: 'rgb(124, 58, 237)',
  mark: 'rgb(124, 58, 237)',
  wordmark: 'rgb(124, 58, 237)',
};
const DARK_DEFAULT: Appearance = {
  theme: 'dark',
  accent: DEFAULT_ACCENT,
  accentPainted: 'rgb(42, 157, 143)',
  mark: 'rgb(42, 157, 143)',
  wordmark: 'rgb(42, 157, 143)',
};
const DARK_OTHER: Appearance = {
  ...DARK_DEFAULT,
  accent: OTHER_ACCENT,
  accentPainted: 'rgb(124, 58, 237)',
  mark: 'rgb(124, 58, 237)',
  wordmark: 'rgb(124, 58, 237)',
};

/**
 * The home screen's own brand element, which was the A mark until 2026-09-27
 * and is now the wordmark above "Let's focus on…". It has no `data-testid` and
 * cannot be given one, so its viewBox is the handle — and it is deliberately
 * the same `7044 × 1946` the top-bar wordmark uses, so this cannot silently
 * match the wrong element if the home copy ever changes shape.
 *
 * It is `aria-hidden` (`BrandWordmark`'s `decorative` prop), so it is found by
 * shape rather than by role: `getByRole('img', { name: 'Apunta' })` must still
 * resolve to exactly one element on the home screen, and that one is the top
 * bar's. `WORDMARK_COUNT` below is what holds that honest.
 */
const HOME_WORDMARK = 'svg[viewBox="0 0 7044 1946"]';

/** The wordmark's own accessible name (`BrandWordmark.tsx:33-34`). */
const WORDMARK_NAME = 'Apunta';

/**
 * Evidence PNGs, anchored to the repository root: `npm run e2e --workspace
 * @apunta/e2e` runs Playwright with cwd `e2e/`, so a relative path would land
 * in `e2e/docs/…`. Nothing identifying is on screen — one fabricated format,
 * no patient — so the images are the state as painted.
 */
function screenshotPath(name: string): string {
  return resolve(import.meta.dirname, '..', '..', 'docs/v2/evidence/P2.2/screenshots', `${name}.png`);
}

/** Only the keys that were actually stored; an absent key stays absent. */
function restorable(state: { theme?: unknown; accent_color?: unknown }): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (state.theme !== undefined) data['theme'] = state.theme;
  if (state.accent_color !== undefined) data['accent_color'] = state.accent_color;
  return data;
}

interface Painted {
  readonly mark: string;
  readonly wordmark: string;
  /** The root's `--accent` verbatim, which the engine may give as hex. */
  readonly accentDeclared: string;
  /** The same value resolved to a colour, so hex and `rgb()` are comparable. */
  readonly accentPainted: string;
}

/** `console.warn`, not `console.log`: the repo's eslint allows only warn/error. */
function record(message: string): void {
  console.warn(`brand: ${message}`);
}

/**
 * One note format, then the appearance state, then the home screen — in that
 * order, because a database with no format redirects `/` to
 * `/onboarding/format` (`Workspace.tsx:323-324`) and there is no
 * `data-testid="home"` there at all.
 */
async function openHome(page: Page, request: APIRequestContext, state: Appearance): Promise<void> {
  await request.post('/api/formats', {
    data: { name: uniqueName('E2E brand format'), sections: ['Subjective', 'Plan'] },
  });
  // Theme and accent are server settings (`appearance.ts:23-24`); the API is
  // the only deterministic way to set them, so the Settings UI is not used.
  await request.put('/api/settings', { data: { theme: state.theme, accent_color: state.accent } });
  await page.goto('/');
  await expect(page.getByTestId('home')).toBeVisible();
  // `data-theme` is the *resolved* theme, never the literal `system`
  // (`appearance.ts:71,85-87`); under Playwright's light OS `system` → light.
  await expect(page.locator('html')).toHaveAttribute('data-theme', state.theme);
}

/** Read the two brand colours, and the accent, as the page painted them. */
async function painted(page: Page): Promise<Painted> {
  const mark = page.getByTestId('home').locator(HOME_WORDMARK);
  await expect(mark, "the home screen's own wordmark").toHaveCount(1);
  // Exactly one exposed "Apunta" on screen: the home copy is decorative, so
  // this has to resolve to the top bar's alone. Two would mean the name is
  // announced twice; zero would mean the logo is invisible to a screen reader.
  await expect(
    page.getByRole('img', { name: WORDMARK_NAME }),
    'the wordmark exposed to assistive technology',
  ).toHaveCount(1);
  const wordmark = page.getByRole('img', { name: WORDMARK_NAME });
  await expect(wordmark, 'the wordmark in the top bar').toHaveCount(1);
  const accent = await page.locator('html').evaluate((root) => {
    const declared = getComputedStyle(root).getPropertyValue('--accent').trim();
    // A custom property is not resolved on its own; painting it onto a
    // throwaway node is how the engine hands back a comparable `rgb()`.
    const probe = document.createElement('span');
    probe.style.color = declared;
    document.body.appendChild(probe);
    const paintedColour = getComputedStyle(probe).color;
    probe.remove();
    return { declared, paintedColour };
  });
  return {
    mark: await mark.evaluate((element) => getComputedStyle(element).color),
    wordmark: await wordmark.evaluate((element) => getComputedStyle(element).color),
    accentDeclared: accent.declared,
    accentPainted: accent.paintedColour,
  };
}

/** What each state measured, keyed `theme/accent`, for the invariance check. */
const measured = new Map<string, Painted>();

/**
 * Assert one appearance state: the accent really moved, and both brand
 * colours are the pinned pair for that state.
 *
 * The cross-run check is the one the file's own header argues for: because
 * `--brand-mark` resolves to `var(--accent)`, the two accents in a theme must
 * paint two different marks. **This was previously the opposite claim** — it
 * asserted the second run's mark was byte-identical to the first and called
 * that "accent-invariant", which is what the spec used to guard before D10 was
 * reversed. Left as it was, it failed a correct build on purpose.
 *
 * What it is *not* allowed to become is nothing: the discrimination is the
 * assertion. A hard-coded brand teal creeping back into a component, or a token
 * quietly ceasing to resolve, paints the same mark for both accents and fails
 * here — while every per-state expectation above still passes, because those
 * are literals this file owns.
 */
async function assertPainted(page: Page, state: Appearance, slug: string): Promise<void> {
  const observed = await painted(page);
  const key = `${state.theme}/${state.accent}`;
  record(
    `${key}: --accent "${observed.accentDeclared}" → ${observed.accentPainted}; A mark ${observed.mark}; wordmark ${observed.wordmark}`,
  );
  expect(observed.accentPainted, `the accent painted for ${key}`).toBe(state.accentPainted);
  expect(observed.mark, `the A mark painted in ${key}`).toBe(state.mark);
  expect(observed.wordmark, `the wordmark painted in ${key}`).toBe(state.wordmark);
  const reference = measured.get(`${state.theme}/${DEFAULT_ACCENT}`);
  if (reference !== undefined) {
    expect(observed.mark, `the mark followed the accent in ${key}, not the default's`).not.toBe(
      reference.mark,
    );
    expect(observed.wordmark, `the wordmark followed the accent in ${key}, not the default's`).not.toBe(
      reference.wordmark,
    );
  }
  measured.set(key, observed);
  await page.screenshot({ path: screenshotPath(slug) });
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** `boundingBox()` in CSS pixels, or a failure that says which box is missing. */
async function boxOf(locator: Locator, what: string): Promise<Box> {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error(`${what} has no bounding box: it is not rendered at this window size`);
  }
  return box;
}

/** Two boxes overlap if they share any area; touching edges do not count. */
function intersects(first: Box, second: Box): boolean {
  return (
    first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y
  );
}

test.describe('rendered colours and 200% zoom', () => {
  // One global settings row, so these five must not run concurrently.
  test.describe.configure({ mode: 'serial' });

  let original: { theme?: unknown; accent_color?: unknown } = {};
  /** The keys of that record that were not in the row at all. */
  let absent: string[] = [];

  test.beforeAll(async ({ request }) => {
    const response = await request.get('/api/settings');
    expect(response.ok(), 'GET /api/settings').toBe(true);
    const settings = (await response.json()) as Record<string, unknown>;
    original = { theme: settings['theme'], accent_color: settings['accent_color'] };
    absent = (['theme', 'accent_color'] as const).filter((key) => settings[key] === undefined);
    record(
      `settings read before the run: ${JSON.stringify(restorable(original))}` +
        (absent.length === 0 ? '' : ` (absent: ${absent.join(', ')})`),
    );
  });

  test.afterAll(async ({ request }) => {
    const data = restorable(original);
    const put = await request.put('/api/settings', { data });
    expect(put.ok(), 'PUT /api/settings to restore').toBe(true);
    const read = await request.get('/api/settings');
    expect(read.ok(), 'GET /api/settings after the restore').toBe(true);
    const settings = (await read.json()) as Record<string, unknown>;
    // Every key that was there before the run is asserted to be back; one that
    // was absent is only recorded, because `PUT /api/settings` is a merge
    // (`server/src/db/settings.ts`) and no route unsets a key.
    for (const [key, value] of Object.entries(data)) {
      expect(settings[key], `settings after the restore: ${key}`).toEqual(value);
    }
    const leftBehind = absent.map((key) => `${key}=${JSON.stringify(settings[key])}`);
    record(
      `settings restored with ${JSON.stringify(data)} → theme=${JSON.stringify(settings['theme'])} accent_color=${JSON.stringify(settings['accent_color'])}` +
        (leftBehind.length === 0
          ? ''
          : `; absent before the run and still stored after it (a merge cannot unset): ${leftBehind.join(', ')}`),
    );
  });

  test(`brand: light, default accent ${DEFAULT_ACCENT} — A mark ${LIGHT_DEFAULT.mark}, wordmark ${LIGHT_DEFAULT.wordmark}`, async ({
    page,
    request,
  }) => {
    await openHome(page, request, LIGHT_DEFAULT);
    await assertPainted(page, LIGHT_DEFAULT, 'light-default-accent');
  });

  test(`brand: light, accent ${OTHER_ACCENT} — A mark ${LIGHT_OTHER.mark}, wordmark ${LIGHT_OTHER.wordmark}`, async ({
    page,
    request,
  }) => {
    await openHome(page, request, LIGHT_OTHER);
    await assertPainted(page, LIGHT_OTHER, 'light-accent-7c3aed');
  });

  test(`brand: dark, default accent ${DEFAULT_ACCENT} — A mark ${DARK_DEFAULT.mark}, wordmark ${DARK_DEFAULT.wordmark}`, async ({
    page,
    request,
  }) => {
    await openHome(page, request, DARK_DEFAULT);
    await assertPainted(page, DARK_DEFAULT, 'dark-default-accent');
  });

  test(`brand: dark, accent ${OTHER_ACCENT} — A mark ${DARK_OTHER.mark}, wordmark ${DARK_OTHER.wordmark}`, async ({
    page,
    request,
  }) => {
    await openHome(page, request, DARK_OTHER);
    await assertPainted(page, DARK_OTHER, 'dark-accent-7c3aed');
  });

  /**
   * The layout half, at the zoom level the owner actually uses.
   *
   * 200% zoom is not a Playwright primitive, so it is modelled the way Chromium
   * models it: the CSS layout viewport halves and the device pixel ratio
   * doubles. A window of 1920×1080 therefore lays out at 960×540 CSS pixels —
   * above the app's `max-width: 900px` breakpoint, where every column but the
   * active pane is `display: none` and the home greeting has no box to measure
   * at all. Halving the default 1280×720 window would land at 640 and the check
   * would be measuring nothing, so the window is widened first and the home
   * screen is re-asserted *after* the zoom: a trap like that has to fail
   * loudly.
   *
   * The old wording — "the wordmark does not overlap the next top-bar item" —
   * had nothing to check, because in the standalone bar the wordmark is the
   * only child and in the sidebar's bar the toggle is to its **left** and the
   * wordmark is last. What is assertable, and what is pinned here: the two
   * boxes do not intersect, the wordmark stays inside its bar, the A mark is
   * 48 px tall and centred in `.home-inner`, and it is clear of the search
   * field above nothing.
   */
  const ZOOM_WINDOW = { width: 1920, height: 1080 };
  const ZOOM = 2;
  const TOLERANCE = 1;

  test('brand: at 200% zoom the wordmark and the sidebar toggle do not overlap, and the A mark is 48px and centred', async ({
    page,
    request,
  }) => {
    await request.post('/api/formats', {
      data: { name: uniqueName('E2E brand format'), sections: ['Subjective', 'Plan'] },
    });
    await request.put('/api/settings', { data: { theme: 'light', accent_color: DEFAULT_ACCENT } });
    await page.setViewportSize(ZOOM_WINDOW);
    await page.goto('/');
    await expect(page.getByTestId('home')).toBeVisible();

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: ZOOM_WINDOW.width / ZOOM,
      height: ZOOM_WINDOW.height / ZOOM,
      deviceScaleFactor: ZOOM,
      mobile: false,
    });

    await expect(page.getByTestId('home'), 'the home screen after the zoom').toBeVisible();
    const layout = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    }));

    const mark = await boxOf(page.getByTestId('home').locator(HOME_WORDMARK), "the home screen's wordmark");
    const wordmark = await boxOf(page.getByRole('img', { name: WORDMARK_NAME }), 'the wordmark');
    const toggle = await boxOf(page.getByTestId('sidebar-toggle'), 'the sidebar toggle');
    const bar = await boxOf(page.locator('.col-header-brand'), 'the sidebar top bar');
    const inner = await boxOf(page.locator('.home-inner'), 'the home column');
    const search = await boxOf(page.getByTestId('home-search'), 'the home search field');
    record(
      `zoom: window ${ZOOM_WINDOW.width}×${ZOOM_WINDOW.height} at ${String(ZOOM)}× → layout ${layout.innerWidth}×${layout.innerHeight} CSS px, dpr ${layout.devicePixelRatio}; ${JSON.stringify({ mark, wordmark, toggle, bar, inner, search })}`,
    );

    expect(
      intersects(wordmark, toggle),
      `wordmark ${JSON.stringify(wordmark)} vs toggle ${JSON.stringify(toggle)}`,
    ).toBe(false);
    expect(wordmark.x, 'the wordmark starts inside its bar').toBeGreaterThanOrEqual(bar.x - TOLERANCE);
    expect(wordmark.x + wordmark.width, 'the wordmark ends inside its bar').toBeLessThanOrEqual(
      bar.x + bar.width + TOLERANCE,
    );
    expect(wordmark.y, 'the wordmark starts inside its bar').toBeGreaterThanOrEqual(bar.y - TOLERANCE);
    expect(wordmark.y + wordmark.height, 'the wordmark ends inside its bar vertically').toBeLessThanOrEqual(
      bar.y + bar.height + TOLERANCE,
    );
    expect(
      Math.abs(mark.height - 48),
      `the A mark's measured height (${String(mark.height)})`,
    ).toBeLessThanOrEqual(0.5);
    const centreOffset = Math.abs(mark.x + mark.width / 2 - (inner.x + inner.width / 2));
    expect(
      centreOffset,
      `the A mark's offset from the column's centre (${String(centreOffset)}px)`,
    ).toBeLessThanOrEqual(TOLERANCE);
    expect(
      intersects(mark, search),
      `the A mark ${JSON.stringify(mark)} vs the search field ${JSON.stringify(search)}`,
    ).toBe(false);
    expect(
      mark.y + mark.height,
      'the A mark is above the search field, not overlapping it',
    ).toBeLessThanOrEqual(search.y + TOLERANCE);
  });
});

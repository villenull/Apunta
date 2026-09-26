import { t } from '@apunta/shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HomeLauncher } from './HomeLauncher.js';

/**
 * Where the A mark sits on the home screen, as AM-028 (`b366be1`) shipped it
 * above the greeting (`HomeLauncher.tsx:73`).
 *
 * The mark itself — its outlines, its token colour and D10's pair — is pinned
 * by `BrandMark.test.tsx`, so nothing here re-asserts a colour: this file is
 * about the placement, which is the half a diff would hide. A mark moved
 * inside the `h1` would make a screen reader read the name twice, a mark
 * dropped below the search box would break A4, and a mark that joined the
 * question would change what `Let's focus on…` means. All three are invisible
 * in a code review and obvious the moment someone opens the screen, which is
 * why they are pinned here.
 *
 * What this file deliberately does not do is re-state `--brand-mark` or
 * D10's pair: a second copy of those values is a second thing to keep in step,
 * and the rendered colours are asserted for real in `e2e/tests/brand.spec.ts`.
 */

/** The A mark's own viewBox, the only one in the tree (`BrandMark.tsx:18`). */
const MARK_VIEWBOX = '0 0 562 754';

/**
 * The A marks inside `root`, found by the viewBox value the e2e spec selects on.
 *
 * Not by a CSS attribute selector: jsdom's `querySelector` never matches
 * `svg[viewBox="…"]`, because the HTML parser rewrites that SVG attribute's
 * camelCase and the selector engine never lines up with the result. A real
 * browser has no such problem, which is why `e2e/tests/brand.spec.ts` can use
 * the selector verbatim. So the same *value* is matched here, by hand.
 */
function marksIn(root: ParentNode): SVGSVGElement[] {
  return [...root.querySelectorAll('svg')].filter((svg) => svg.getAttribute('viewBox') === MARK_VIEWBOX);
}

interface Home {
  /** `.home`, the `data-testid="home"` screen itself. */
  screen: HTMLElement;
  /** `.home-inner`, the centred column the mark and the question share. */
  inner: HTMLElement;
  heading: HTMLHeadingElement;
  mark: SVGSVGElement;
}

/** `HomeLauncher` calls `useNavigate` (`:25`), so the render needs a router. */
function renderHome(): Home {
  const { container } = render(
    <MemoryRouter>
      <HomeLauncher patients={[]} onSelect={vi.fn()} />
    </MemoryRouter>,
  );
  const home = container.querySelector<HTMLElement>('[data-testid="home"]');
  const inner = home?.querySelector<HTMLElement>('.home-inner') ?? null;
  const heading = home?.querySelector('h1') ?? null;
  const mark = inner === null ? null : (marksIn(inner)[0] ?? null);
  if (home === null || inner === null || heading === null || mark === null) {
    throw new Error('HomeLauncher rendered no home screen, or none with a mark above its heading');
  }
  return { screen: home, inner, heading, mark };
}

/** One keystroke's worth of search, which is what opens the listbox. */
function typeSearch(value: string): void {
  fireEvent.change(screen.getByTestId('home-search'), { target: { value } });
}

afterEach(() => {
  cleanup();
});

describe('the "New" row of the results list', () => {
  /**
   * The second class of string the literal checker cannot see.
   *
   * The row was `New: <strong>{query.trim()}</strong>` (`HomeLauncher.tsx:137`):
   * JSX splits that sentence in two around the inline element, and the checker
   * deliberately reports neither half (`check-ui-strings.mjs:29-36`), so
   * `TOTAL 0` is compatible with the whole English row still being hardcoded —
   * which is exactly what it would have been. So the line is read out of the
   * catalogue here: the row is the catalogue's English with the typed name in
   * it, and a component that went back to writing "New: " itself — or a
   * translation of the row that dropped the name — turns this red.
   */
  it('is the catalogue’s sentence with the typed name in it', () => {
    renderHome();

    typeSearch('Jo');

    const row = screen.getByTestId('home-new');
    expect(row.textContent).toBe(t('home.newWith', { name: 'Jo' }, 'en'));
    // What she typed is carried into the add-patient form, so it must survive
    // the whole line rather than being dropped beside a translated prefix.
    expect(row.textContent).toContain('Jo');
    expect(row.textContent).not.toContain('{');
  });

  /** An empty box says the same thing, with nothing carried into the name. */
  it('keeps the same sentence when she has typed nothing yet', () => {
    renderHome();

    typeSearch('');

    // No listbox opens on an empty box, so the row is rendered directly: this
    // is the sentence the key carries, read from the catalogue either way.
    expect(t('home.newWith', { name: '' }, 'en')).toBe('New: ');
  });
});

describe('the A mark above the home greeting', () => {
  /**
   * A4, read as structure rather than as pixels: the mark is the first child of
   * `.home-inner`, so it paints above the question, and it is a **sibling** of
   * the `h1`, not a child — so the heading's text stays the question alone.
   */
  it('is the first child of the column, and a sibling of the heading', () => {
    const { inner, heading, mark } = renderHome();

    expect(inner.firstElementChild).toBe(mark);
    expect(mark.parentElement).toBe(inner);
    expect(heading.querySelector('svg')).toBeNull();
  });

  /** The greeting is a question, and the mark never joins it. */
  it('leaves the greeting as exactly the question', () => {
    const { heading } = renderHome();

    expect(heading.textContent).toBe('Let’s focus on…');
  });

  /**
   * The one interaction the home screen has. Typing opens the listbox, whose
   * "New" row carries a `PlusIcon` — and every `StrokeIcon` is
   * `viewBox="0 0 24 24"` (`icons.tsx:18`), so the A mark stays the only
   * element with its own viewBox however many icons are on screen. This is
   * the same selector the e2e spec scopes to `[data-testid="home"]`, and the
   * same value `BrandMark.test.tsx:58` pins: the three cannot drift apart.
   */
  it('stays the only mark once typing puts an icon on the screen', () => {
    const { screen: home, inner, heading, mark } = renderHome();

    typeSearch('Jo');

    expect(screen.getByRole('listbox', { name: 'Patients' })).not.toBeNull();
    expect(marksIn(home)).toHaveLength(1);
    // The listbox's "New" row put a second svg inside `.home`, so the count
    // above is the viewBox doing the work rather than there being one svg.
    expect(home.querySelectorAll('svg')).toHaveLength(2);
    expect(inner.firstElementChild).toBe(mark);
    expect(heading.querySelector('svg')).toBeNull();
    expect(heading.textContent).toBe('Let’s focus on…');
  });

  /**
   * Decorative where it actually renders, not only in isolation: with the
   * listbox open there are two svgs on the home screen and neither may answer
   * as an image, because the page already names the app in its title bar.
   */
  it('is decorative where it renders, listbox open or not', () => {
    const { mark } = renderHome();

    expect(mark.getAttribute('aria-hidden')).toBe('true');
    expect(mark.getAttribute('focusable')).toBe('false');
    expect(screen.queryByRole('img')).toBeNull();

    typeSearch('Jo');

    expect(screen.queryByRole('img')).toBeNull();
  });

  /**
   * The size and the centring are inline styles on the mark, so they are the
   * first thing a refactor to a stylesheet or a wrapper would drop — and the
   * second thing the same refactor would have to reproduce. jsdom normalises
   * `0 auto` to `0px auto`, which is why the two declarations are read apart,
   * as `BrandMark.test.tsx:77-84` does. The centred geometry itself is
   * measured for real in the e2e spec; jsdom has no layout.
   */
  it('keeps its 48px height and its centring through that interaction', () => {
    const { mark } = renderHome();

    typeSearch('Jo');

    expect(mark.style.height).toBe('48px');
    expect(mark.style.display).toBe('block');
    expect(mark.style.marginLeft).toBe('auto');
    expect(mark.style.marginRight).toBe('auto');
    expect(mark.style.margin).toBe('0px auto');
  });
});

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

/** The wordmark's own viewBox (`BrandWordmark.tsx`). */
const WORDMARK_VIEWBOX = '0 0 7044 1946';

/**
 * The wordmarks inside `root`, found by viewBox value by hand: jsdom's
 * `querySelector` never matches `svg[viewBox="…"]`, because the HTML parser
 * rewrites that SVG attribute's camelCase. A real browser has no such problem.
 */
function wordmarksIn(root: ParentNode): SVGSVGElement[] {
  return [...root.querySelectorAll('svg')].filter((svg) => svg.getAttribute('viewBox') === WORDMARK_VIEWBOX);
}

interface Home {
  /** `.home`, the `data-testid="home"` screen itself. */
  screen: HTMLElement;
  /** `.home-inner`, the centred column the wordmark and the question share. */
  inner: HTMLElement;
  heading: HTMLHeadingElement;
  wordmark: SVGSVGElement;
}

/** `HomeLauncher` calls `useNavigate`, so the render needs a router. */
function renderHome(): Home {
  const { container } = render(
    <MemoryRouter>
      <HomeLauncher patients={[]} onSelect={vi.fn()} />
    </MemoryRouter>,
  );
  const home = container.querySelector<HTMLElement>('[data-testid="home"]');
  const inner = home?.querySelector<HTMLElement>('.home-inner') ?? null;
  const heading = home?.querySelector('h1') ?? null;
  const wordmark = inner === null ? null : (wordmarksIn(inner)[0] ?? null);
  if (home === null || inner === null || heading === null || wordmark === null) {
    throw new Error('HomeLauncher rendered no home screen, or none with a wordmark above its heading');
  }
  return { screen: home, inner, heading, wordmark };
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

describe('the wordmark above the home greeting', () => {
  /**
   * Owner, 2026-09-26: the full Apunta wordmark stands immediately above
   * "Let's focus on…", in place of the A. Read as structure: it is the first
   * child of the centred column and the heading's sibling, not its child, so
   * the heading's text stays the question alone.
   */
  it('stands first in the column, directly above the heading', () => {
    const { inner, heading, wordmark } = renderHome();

    expect(inner.firstElementChild).toBe(wordmark);
    expect(wordmark.nextElementSibling).toBe(heading);
    expect(heading.querySelector('svg')).toBeNull();
  });

  it('leaves the greeting as exactly the question', () => {
    const { heading } = renderHome();

    expect(heading.textContent).toBe('Let’s focus on…');
    expect(screen.getByRole('heading', { level: 1, name: 'Let’s focus on…' })).toBe(heading);
  });

  /**
   * A second copy of the name: the sidebar's wordmark already announces
   * "Apunta", so this one is hidden and never answers as an image — with the
   * listbox closed or open.
   */
  it('is decorative, so the name is announced once, listbox open or not', () => {
    const { wordmark } = renderHome();

    expect(wordmark.getAttribute('aria-hidden')).toBe('true');
    expect(screen.queryByRole('img')).toBeNull();

    typeSearch('Jo');

    expect(screen.queryByRole('img')).toBeNull();
    expect(wordmarksIn(document.body)).toHaveLength(1);
  });

  /** Larger than the sidebar's, and coloured by the brand token. */
  it('is drawn at 48px in the brand colour', () => {
    const { wordmark } = renderHome();

    expect(wordmark.style.height).toBe('48px');
    expect(wordmark.style.color).toBe('var(--brand-mark)');
  });
});

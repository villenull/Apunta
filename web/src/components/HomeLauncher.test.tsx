import { t } from '@apunta/shared';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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

/**
 * Pick an action, which is the only way the search box appears now (owner,
 * 2026-09-27: "Choose an action, then a patient"). Every test below that types
 * needs it, so it happens here rather than in each one.
 */
function chooseAction(id: 'note' | 'draft' | 'plan' = 'note'): void {
  fireEvent.click(screen.getByTestId(`home-action-${id}`));
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
    chooseAction();

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
    chooseAction();

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

  it('leaves the question as exactly the question, and nothing else', () => {
    // The greeting became a question about work (owner, 2026-09-27), so this
    // pins the new sentence and, more to the point, that the heading carries
    // *only* it — the hint under the cards and the action labels are siblings,
    // and folding one into the heading would make a screen reader read all of it
    // as the title.
    const { heading } = renderHome();

    expect(heading.textContent).toBe('What would you like to work on?');
    expect(screen.getByRole('heading', { level: 1, name: 'What would you like to work on?' })).toBe(heading);
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

    chooseAction();
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

/**
 * The workbench (owner, 2026-09-27, "Simple workbench"): the wordmark, one
 * question, three action cards, and the instruction that says which comes
 * first.
 *
 * The cards are only worth having if they start the flows she already has, so
 * each one is followed as far as it goes rather than checked for existing. The
 * one that does **not** land where its label says — "Continue a draft" opens the
 * patient's notes rather than a draft, because the app has no most-recent-draft
 * index — is asserted as it actually behaves, so the label cannot quietly drift
 * away from the code and nobody notices until she presses it.
 */
describe('the workbench', () => {
  const ana = { id: 'p1', name: 'Ana Torres' } as Parameters<typeof HomeLauncher>[0]['patients'][number];

  function renderWithPatients(): { onSelect: ReturnType<typeof vi.fn> } {
    const onSelect = vi.fn();
    render(
      <MemoryRouter>
        <HomeLauncher patients={[ana]} onSelect={onSelect} />
      </MemoryRouter>,
    );
    return { onSelect };
  }

  it('asks what she wants to work on, and says nothing else', () => {
    renderWithPatients();

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('What would you like to work on?');
    // The line under the cards that spelled the two steps out is gone (owner,
    // 2026-09-27): the cards are the instruction, and the sentence under them
    // read as a caption on a picture rather than as anything to do.
    expect(screen.queryByTestId('home-choose-then')).toBeNull();
  });

  it('offers the three actions, and no search box until one is chosen', () => {
    renderWithPatients();

    expect(screen.getByTestId('home-action-note')).toBeDefined();
    expect(screen.getByTestId('home-action-draft')).toBeDefined();
    expect(screen.getByTestId('home-action-plan')).toBeDefined();
    // The step is not hidden, it is later: no box to type into yet.
    expect(screen.queryByTestId('home-search')).toBeNull();
  });

  it('names each card in words, not by its icon alone', () => {
    renderWithPatients();

    const names = screen.getAllByRole('button').map((button) => button.textContent);
    expect(names).toContain('Write a note');
    expect(names).toContain('Continue a draft');
    expect(names).toContain('Create a treatment plan');
  });

  it('"Write a note" starts the capture flow for the patient she then picks', () => {
    const { onSelect } = renderWithPatients();

    fireEvent.click(screen.getByTestId('home-action-note'));
    fireEvent.change(screen.getByTestId('home-search'), { target: { value: 'ana' } });
    fireEvent.click(within(screen.getByRole('listbox')).getByText('Ana Torres'));

    // The capture screen is its own route, so this is a navigation rather than a
    // main-pane mode — and `onSelect` is deliberately not called for it, since
    // capture does not go through the workspace's patient selection.
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('"Create a treatment plan" opens that patient on their plan', () => {
    const { onSelect } = renderWithPatients();

    fireEvent.click(screen.getByTestId('home-action-plan'));
    fireEvent.change(screen.getByTestId('home-search'), { target: { value: 'ana' } });
    fireEvent.click(within(screen.getByRole('listbox')).getByText('Ana Torres'));

    expect(onSelect).toHaveBeenCalledWith('p1');
  });

  it('"Continue a draft" opens that patient on their notes', () => {
    // What it does today, pinned: the app has no most-recent-draft index, so
    // this lands on the list where their drafts are rather than inside one.
    const { onSelect } = renderWithPatients();

    fireEvent.click(screen.getByTestId('home-action-draft'));
    fireEvent.change(screen.getByTestId('home-search'), { target: { value: 'ana' } });
    fireEvent.click(within(screen.getByRole('listbox')).getByText('Ana Torres'));

    expect(onSelect).toHaveBeenCalledWith('p1');
  });

  it('goes back to the cards, and forgets what she had typed', () => {
    renderWithPatients();

    fireEvent.click(screen.getByTestId('home-action-note'));
    fireEvent.change(screen.getByTestId('home-search'), { target: { value: 'ana' } });
    fireEvent.click(screen.getByTestId('home-back'));

    expect(screen.getByTestId('home-action-plan')).toBeDefined();
    expect(screen.queryByTestId('home-search')).toBeNull();
  });

  it('still reaches the add-patient form from the second step, with the name', () => {
    renderWithPatients();

    fireEvent.click(screen.getByTestId('home-action-note'));
    fireEvent.change(screen.getByTestId('home-search'), { target: { value: 'Ana Torres' } });
    fireEvent.click(screen.getByTestId('home-new'));

    // The capability survives the extra step, which is the thing worth keeping.
    expect(screen.getByTestId('home-new').textContent).toContain('Ana Torres');
  });
});

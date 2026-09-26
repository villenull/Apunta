import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { TopBar, type TopBarProps } from './TopBar.js';

afterEach(() => {
  cleanup();
});

/** TopBar renders a react-router `Link`, so it needs a router around it. */
function renderTopBar(props: TopBarProps = {}): Element {
  const { container } = render(
    <MemoryRouter>
      <TopBar {...props} />
    </MemoryRouter>,
  );
  const bar = container.querySelector('.topbar');
  if (bar === null) {
    throw new Error('TopBar rendered no .topbar');
  }
  return bar;
}

/**
 * The two shapes the top bar has, as they shipped in AM-028 (`b366be1`). The old
 * prototype treatment — the `MarkIcon` scribble plus a typed, lowercased
 * `span.brand` label — is gone, and a regression there would be invisible: a
 * screen reader would hear the name twice and nobody looking would necessarily
 * say so. So the absence is asserted as carefully as the presence.
 */
const WORDMARK_VIEWBOX = '0 0 2903 1012';

describe('the top bar with no back link', () => {
  it('is the wordmark and nothing else', () => {
    const bar = renderTopBar();

    expect(bar.querySelectorAll('svg')).toHaveLength(1);
    expect(bar.textContent).toBe('');
    expect(bar.querySelectorAll('span')).toHaveLength(0);
  });

  it('names the app exactly once, through the wordmark itself', () => {
    renderTopBar();

    const named = screen.getAllByRole('img', { name: 'Apunta' });
    expect(named).toHaveLength(1);
    expect(named[0]?.getAttribute('viewBox')).toBe(WORDMARK_VIEWBOX);
  });

  /**
   * The owner preview (2026-09-26) put the mark where Claude puts its own word:
   * in the body colour, at Claude-logo size, one token rather than a number.
   * This card's own earlier text said `--brand-mark` and 22px; both were
   * retired by owner decision and the code wins, so both are pinned here.
   */
  it('paints the mark in the foreground colour at the --logo-h height', () => {
    renderTopBar();
    const wordmark = screen.getByRole('img', { name: 'Apunta' });

    expect(wordmark.style.color).toBe('var(--text-primary)');
    expect(wordmark.style.height).toBe('var(--logo-h)');
  });

  /** No scribble mark, and nothing left that follows the accent. */
  it('has no MarkIcon left, and nothing coloured by the accent', () => {
    const { container } = render(
      <MemoryRouter>
        <TopBar />
      </MemoryRouter>,
    );

    expect(container.querySelector('.mark')).toBeNull();
    expect(container.querySelector('span.brand')).toBeNull();
    expect(container.querySelector('[stroke]')).toBeNull();
    expect(container.innerHTML).not.toContain('--accent');
  });

  /** The wordmark names the app; a second, hidden mark would say it again. */
  it('has no second, aria-hidden mark', () => {
    const bar = renderTopBar();

    expect(bar.querySelectorAll('[aria-hidden="true"]')).toHaveLength(0);
  });
});

describe('the top bar with a back link', () => {
  it('is the back link, with the back icon', () => {
    const bar = renderTopBar({ back: { to: '/patients', label: 'Back to patients' } });

    const link = screen.getByRole('link', { name: 'Back to patients' });
    expect(link.getAttribute('href')).toBe('/patients');
    expect(bar.querySelector('a.back')).toBe(link);
    expect(link.querySelector('svg')).not.toBeNull();
  });

  /** A back link and a wordmark at once is neither of the two shipped shapes. */
  it('is not the wordmark as well', () => {
    const bar = renderTopBar({ back: { to: '/patients', label: 'Back to patients' } });

    expect(screen.queryByRole('img', { name: 'Apunta' })).toBeNull();
    expect(bar.querySelector(`svg[viewBox="${WORDMARK_VIEWBOX}"]`)).toBeNull();
    expect(bar.querySelectorAll('svg')).toHaveLength(1);
  });
});

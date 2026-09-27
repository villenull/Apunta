import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { BrandWordmark, type BrandWordmarkProps } from './BrandWordmark.js';

afterEach(() => {
  cleanup();
});

/**
 * The wordmark shipped in AM-028 (`b366be1`); these cases pin it so a later
 * edit to the brand is a failing test rather than a quiet visual change. Every
 * expectation below is read off the component and off `tokens.css` as they stand
 * on the base commit — none of it is aspirational.
 *
 * The token sheet is read off disk rather than imported: Vite rewrites the
 * `new URL(…, import.meta.url)` pattern at transform time, and a `?raw` import
 * of a `.css` file is stubbed to an empty string under this project's
 * `css: false`. Resolving from this module's own path is neither.
 */
const TOKENS = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../styles/tokens.css'), 'utf8');

/** Every value `--logo-h` is given in the token sheet, in source order. */
function logoHeights(): string[] {
  return [...TOKENS.matchAll(/^[ \t]*--logo-h:[ \t]*([^;]+);/gm)].map((match) => (match[1] ?? '').trim());
}

function renderWordmark(props: BrandWordmarkProps = {}): SVGSVGElement {
  const { container } = render(<BrandWordmark {...props} />);
  const svg = container.querySelector('svg');
  if (svg === null) {
    throw new Error('BrandWordmark rendered no svg');
  }
  return svg;
}

describe('the wordmark', () => {
  /**
   * An svg with no name is a nameless graphic to a screen reader, and the name
   * is the only thing the top bar says. "Apunta" is the brand, not the file.
   */
  it('names the app, and takes itself out of the tab order', () => {
    renderWordmark();

    const wordmark = screen.getByRole('img', { name: 'Apunta' });
    expect(wordmark.getAttribute('aria-label')).toBe('Apunta');
    expect(wordmark.getAttribute('focusable')).toBe('false');
  });

  /**
   * Fraunces ships as outlines (owner, 2026-09-26, replacing Kalam) precisely
   * so the name is never typed in a font at runtime. One path, filled with whatever colour it inherits: a second fill,
   * or any text node at all, means the name came back as text.
   */
  it('is the name as outlines, in one path that takes its colour from the caller', () => {
    const wordmark = renderWordmark();

    expect(wordmark.getAttribute('viewBox')).toBe('0 0 7044 1946');
    const paths = wordmark.querySelectorAll('path');
    expect(paths).toHaveLength(1);
    expect(paths[0]?.getAttribute('fill')).toBe('currentColor');
    expect(wordmark.textContent).toBe('');
  });

  it('takes the brand colour by default', () => {
    expect(renderWordmark().style.color).toBe('var(--brand-mark)');
    expect(renderWordmark({ tone: 'brand' }).style.color).toBe('var(--brand-mark)');
  });

  /**
   * `tone="text"` stays available for a placement that wants the body colour;
   * TopBar and PatientsColumn now take the brand teal (owner, 2026-09-26).
   */
  it('paints in the foreground colour when the caller asks for that placement', () => {
    expect(renderWordmark({ tone: 'text' }).style.color).toBe('var(--text-primary)');
  });

  /**
   * One number in the token sheet, not one per call site: the wordmark's height
   * is `--logo-h`, and the width follows the asset's ratio. `--logo-h` is 20px
   * at this commit — the mark's height in Claude's own top bar. The card text
   * that once said 22px was retired by owner decision, the code wins.
   */
  it('sizes itself from the --logo-h token, which is one number for the whole app', () => {
    const wordmark = renderWordmark();

    expect(wordmark.style.height).toBe('var(--logo-h)');
    expect(wordmark.style.width).toBe('auto');
    expect(logoHeights()).toEqual(['20px']);
  });

  it('lets a caller pass an exact height instead of the token', () => {
    expect(renderWordmark({ height: 32 }).style.height).toBe('32px');
  });

  /**
   * D10: `--brand-mark` is the brand's own pair, deliberately not derived from
   * `--accent`, so the name can never be recoloured by the accent picker.
   */
  it('never takes its colour from the accent', () => {
    const { container } = render(<BrandWordmark />);

    expect(container.innerHTML).not.toContain('--accent');
    expect(renderWordmark({ tone: 'text' }).getAttribute('style')).not.toContain('--accent');
  });
});

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { BrandMark } from './BrandMark.js';

afterEach(() => {
  cleanup();
});

/**
 * The A mark shipped in AM-028 (`b366be1`) and is placed above the home greeting
 * (`HomeLauncher.tsx:73`). It is the wordless half of the brand, so these cases
 * pin the two things that would be invisible in a diff: that it is decorative,
 * and that its colour comes from D10's pair rather than from `--accent`.
 *
 * The token sheet is read off disk rather than imported: Vite rewrites the
 * `new URL(…, import.meta.url)` pattern at transform time, and a `?raw` import
 * of a `.css` file is stubbed to an empty string under this project's
 * `css: false`. Resolving from this module's own path is neither.
 */
const TOKENS = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../styles/tokens.css'), 'utf8');

/** Every value `--brand-mark` is given in the token sheet, in source order. */
function brandMarkColours(): string[] {
  return [...TOKENS.matchAll(/^[ \t]*--brand-mark:[ \t]*([^;]+);/gm)].map((match) => (match[1] ?? '').trim());
}

function renderMark(): SVGSVGElement {
  const { container } = render(<BrandMark />);
  const mark = container.querySelector('svg');
  if (mark === null) {
    throw new Error('BrandMark rendered no svg');
  }
  return mark;
}

describe('the A mark', () => {
  /**
   * Decorative on purpose: the wordmark or the page title already names the
   * app, so exposing this one as well would read the name out twice.
   */
  it('is decorative, because something else already names the app', () => {
    const { container } = render(<BrandMark />);

    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('svg')?.getAttribute('focusable')).toBe('false');
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByLabelText('Apunta')).toBeNull();
  });

  it('is the outline in one path, not the name in a font', () => {
    const mark = renderMark();

    expect(mark.getAttribute('viewBox')).toBe('0 0 562 754');
    const paths = mark.querySelectorAll('path');
    expect(paths).toHaveLength(1);
    expect(paths[0]?.getAttribute('fill')).toBe('currentColor');
    expect(mark.textContent).toBe('');
  });

  it('is 48px tall, and its width follows the outline', () => {
    const mark = renderMark();

    expect(mark.style.height).toBe('48px');
    expect(mark.style.width).toBe('auto');
  });

  /**
   * Centred in whatever block it sits in, so P2.2 can drop it above the home
   * greeting without a wrapper. jsdom normalises `0 auto` to `0px auto`, which
   * is why this reads the two declarations rather than the shorthand.
   */
  it('centres itself in its block', () => {
    const mark = renderMark();

    expect(mark.style.display).toBe('block');
    expect(mark.style.marginLeft).toBe('auto');
    expect(mark.style.marginRight).toBe('auto');
    expect(mark.style.margin).toBe('0px auto');
  });

  it('is coloured by the brand token, not by the accent', () => {
    expect(renderMark().style.color).toBe('var(--brand-mark)');
  });

  /**
   * D10's pair, each declared exactly once and written as a literal hex rather
   * than derived from anything — in particular not from `--accent`, which the
   * owner can change in Settings.
   */
  it('follows D10: the brand teal in light mode, white in dark, declared once each', () => {
    expect(brandMarkColours()).toEqual(['#1f6f63', '#ffffff']);
  });

  it('never resolves its colour from the accent', () => {
    const { container } = render(<BrandMark />);

    expect(container.innerHTML).not.toContain('--accent');
    expect(renderMark().getAttribute('style')).not.toContain('--accent');
  });
});

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
 * The A mark shipped in AM-028 (`b366be1`), redrawn in Fraunces and moved
 * inline before the home greeting on 2026-09-26 (`HomeLauncher.tsx`). It is the wordless half of the brand, so these cases
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

    expect(mark.getAttribute('viewBox')).toBe('0 0 1419 1440');
    const paths = mark.querySelectorAll('path');
    expect(paths).toHaveLength(1);
    expect(paths[0]?.getAttribute('fill')).toBe('currentColor');
    expect(mark.textContent).toBe('');
  });

  /**
   * Sized in `em`, so it tracks the heading it stands in at every font size the
   * owner can pick, and its width follows the outline.
   */
  it('is sized by the text it stands beside, and its width follows the outline', () => {
    const mark = renderMark();

    expect(mark.style.height).toBe('0.8em');
    expect(mark.style.width).toBe('auto');
  });

  /**
   * Inline, not a centred block: the owner moved it from above the home
   * greeting to before it, where Claude puts its own mark (2026-09-26). It must
   * not shrink when the heading is squeezed.
   */
  it('sits inline beside its text rather than centred on a line of its own', () => {
    const mark = renderMark();

    expect(mark.style.display).toBe('inline-block');
    expect(mark.style.flexShrink).toBe('0');
    expect(mark.style.marginLeft).toBe('');
  });

  it('is coloured by the brand token, not by the accent', () => {
    expect(renderMark().style.color).toBe('var(--brand-mark)');
  });

  /**
   * D10's pair, each declared exactly once and written as a literal hex rather
   * than derived from anything — in particular not from `--accent`, which the
   * owner can change in Settings. Amended 2026-09-26: teal in dark mode too.
   */
  it('follows D10 as amended: the brand teal in both themes, declared once each', () => {
    expect(brandMarkColours()).toEqual(['#1f6f63', '#1f6f63']);
  });

  it('never resolves its colour from the accent', () => {
    const { container } = render(<BrandMark />);

    expect(container.innerHTML).not.toContain('--accent');
    expect(renderMark().getAttribute('style')).not.toContain('--accent');
  });
});

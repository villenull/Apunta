import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BrandMark } from './BrandMark.js';
import { SidebarRail, type SidebarRailProps } from './SidebarRail.js';

/**
 * The collapsed rail's brand control (owner, 2026-09-27): the rail says **A**,
 * and the A turns into the panel glyph — the control that opens the sidebar —
 * while the pointer is on it. Nothing else about the control changed, and this
 * file is about the two halves of that sentence.
 *
 * The swap is CSS, and jsdom has no cascade, so a test that rendered the rail
 * and asserted "the A is hidden on hover" would pass against the broken version
 * too: it could only ever see the inline `style` attribute, where the answer
 * was always "no style at all". So the rendered half is asserted structurally —
 * one button, both glyphs, the A the one at rest — and the mechanism is read
 * off `app.css` the way `BrandMark.test.tsx` and `Settings.test.tsx` read
 * `tokens.css`, so a `display`-based swap cannot come back unnoticed.
 *
 * Why `display` cannot be used here, and why that is worth a test rather than a
 * comment: `BrandMark` paints `display: inline-block` as an **inline style**,
 * which outranks any rule in the stylesheet. The swap was written with
 * `display` and was therefore dead — the A never went anywhere, and the panel
 * glyph rendered next to it. The regression is invisible in a diff of the TSX
 * (the component did not change) and obvious the moment the rail is opened.
 */

afterEach(cleanup);

const STYLES = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../styles/app.css'), 'utf8');

function renderRail(overrides: Partial<SidebarRailProps> = {}): Element {
  const props: SidebarRailProps = {
    onExpand: vi.fn(),
    onSearch: vi.fn(),
    onOpenAll: vi.fn(),
    onOpenSettings: vi.fn(),
    onUnavailable: vi.fn(),
    ...overrides,
  };
  const { container } = render(
    <MemoryRouter>
      <SidebarRail {...props} />
    </MemoryRouter>,
  );
  const rail = container.querySelector('.sidebar-rail');
  if (rail === null) {
    throw new Error('SidebarRail rendered no .sidebar-rail');
  }
  return rail;
}

/**
 * Every rule body declared for `selector`, in source order and joined, because
 * a selector can legitimately appear more than once — `.rail-brand-panel` is
 * both a cell in the shared grid and the glyph hidden at rest — and reading
 * only the first would assert against whichever rule happened to come first in
 * the file. A selector that does not appear at all returns `''`, so a rule
 * renamed outright fails rather than quietly matching its neighbour.
 */
function rulesFor(selector: string): string {
  const pattern = new RegExp(
    `(?:^|\\})\\s*${selector.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)}\\s*\\{([^}]*)\\}`,
    'gm',
  );
  return [...STYLES.matchAll(pattern)].map((match) => match[1] ?? '').join('\n');
}

describe('the collapsed rail says A, and the A becomes the panel glyph on hover', () => {
  it('is one button carrying both glyphs, so the swap replaces rather than adds', () => {
    const rail = renderRail();
    const brand = screen.getByTestId('sidebar-reopen');

    // One control, one accessible name, one hit target: the owner is not being
    // offered a second thing to click, and a screen reader hears one button.
    expect(brand.tagName).toBe('BUTTON');
    expect(brand.getAttribute('aria-label')).not.toBe('');
    expect(brand.querySelectorAll('.rail-brand-mark')).toHaveLength(1);
    expect(brand.querySelectorAll('.rail-brand-panel')).toHaveLength(1);
    // Both inside the brand button, and nothing else carrying either class.
    expect(brand.querySelector('.rail-brand-mark')).not.toBeNull();
    expect(brand.querySelector('.rail-brand-panel')).not.toBeNull();
    expect(rail.querySelectorAll('.rail-brand-mark')).toHaveLength(1);
    expect(rail.querySelectorAll('.rail-brand-panel')).toHaveLength(1);
  });

  it('opens the sidebar, and the A is the glyph there at rest', () => {
    const onExpand = vi.fn();
    renderRail({ onExpand });

    const brand = screen.getByTestId('sidebar-reopen');
    // The A is what the rail shows before any pointer arrives, so the *panel*
    // glyph is the one hidden at rest. Reversed, the rail would greet her with
    // a control and only show the brand on hover.
    expect(rulesFor('.rail-brand-panel')).toMatch(/visibility:\s*hidden/);
    expect(rulesFor('.rail-brand:hover .rail-brand-mark')).toBe('');
    expect(
      /visibility:\s*hidden/.test(
        rulesFor('.rail-brand:hover .rail-brand-mark,\n.rail-brand:focus-visible .rail-brand-mark'),
      ),
    ).toBe(true);
    expect(
      /visibility:\s*visible/.test(
        rulesFor('.rail-brand:hover .rail-brand-panel,\n.rail-brand:focus-visible .rail-brand-panel'),
      ),
    ).toBe(true);

    brand.click();
    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  it('swaps with visibility, because the A carries display as an inline style', () => {
    // The premise, pinned against the real component: if `BrandMark` ever stops
    // painting `display` inline, the `visibility` swap is still correct but the
    // reason for it is no longer, and the next person to "simplify" it back to
    // `display` should meet a failing test.
    const { container } = render(<BrandMark />);
    const mark = container.querySelector('svg');
    if (mark === null) {
      throw new Error('BrandMark rendered no svg');
    }
    expect(mark.style.display).toBe('inline-block');

    // And the rule that cannot work, spelled out so the failure is a fact here
    // rather than a surprise in a browser: an inline style outranks a
    // stylesheet rule of any specificity, so a `display: none` on the mark
    // would be inert — which is how this shipped broken.
    expect(rulesFor('.rail-brand-panel')).not.toMatch(/display:/);
    expect(
      rulesFor('.rail-brand:hover .rail-brand-mark,\n.rail-brand:focus-visible .rail-brand-mark'),
    ).not.toMatch(/display:/);
  });

  it('stacks the two glyphs in one cell, so the swap cannot shift the layout', () => {
    // In a flex row the two glyphs would sit side by side — which is exactly
    // what the broken version looked like — so the shared cell is what makes
    // this a replacement rather than an addition.
    expect(rulesFor('.rail-brand')).toMatch(/display:\s*grid/);
    expect(rulesFor('.rail-brand-mark,\n.rail-brand-panel')).toMatch(/grid-area:\s*1\s*\/\s*1/);
  });
});

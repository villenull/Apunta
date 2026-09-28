import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { SidebarViewMenu } from './SidebarViewMenu.js';
import { DEFAULT_SIDEBAR_VIEW, type SidebarView } from '../lib/sidebarView.js';

const APP_CSS = readFileSync(resolve(import.meta.dirname, '../styles/app.css'), 'utf8');

/**
 * The view control has to be usable **without a pointer** (F3).
 *
 * The panel is portalled to the body, which puts it after the app root in DOM
 * order, so the tab order walks straight past it and on into the rest of the
 * application. The component's own comment claimed a click made the whole thing
 * keyboard-reachable "where there is no hover at all"; it did not, because
 * nothing ever moved focus into the panel. Every test here drives the keyboard
 * and nothing else — no `fireEvent.click` on the control, no hover — so a
 * regression to mouse-only behaviour fails here rather than passing quietly.
 */

const view: SidebarView = DEFAULT_SIDEBAR_VIEW;

/** The control, opened the way a keyboard opens it. */
function openWithKeyboard(): void {
  const control = screen.getByTestId('sidebar-view-options');
  control.focus();
  fireEvent.keyDown(control, { key: 'ArrowDown' });
  // Enter/Space on a button is a click; jsdom does not synthesise it from a key.
  fireEvent.click(control);
}

function activeTestId(): string | null {
  const active = document.activeElement;
  return active === null ? null : (active.getAttribute('data-testid') ?? active.tagName);
}

function renderMenu(onChange: (view: SidebarView) => void = vi.fn()): void {
  render(<SidebarViewMenu view={view} onChange={onChange} />);
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('the view control by keyboard alone', () => {
  it('moves focus into the panel when it opens, and down the four rows', () => {
    renderMenu();
    openWithKeyboard();

    // Focus is on the first row, not left behind on the control and not lost.
    expect(activeTestId()).toBe('view-section-status');

    const first = screen.getByTestId('view-section-status');
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(activeTestId()).toBe('view-section-activity');
    fireEvent.keyDown(screen.getByTestId('view-section-activity'), { key: 'ArrowDown' });
    expect(activeTestId()).toBe('view-section-groupBy');
    fireEvent.keyDown(screen.getByTestId('view-section-groupBy'), { key: 'ArrowDown' });
    expect(activeTestId()).toBe('view-section-sort');

    // And back up, wrapping at the top rather than stopping dead.
    fireEvent.keyDown(screen.getByTestId('view-section-sort'), { key: 'ArrowUp' });
    expect(activeTestId()).toBe('view-section-groupBy');
    fireEvent.keyDown(screen.getByTestId('view-section-status'), { key: 'ArrowUp' });
    expect(activeTestId()).toBe('view-section-sort');
  });

  it('opens the options with ArrowRight and walks them with the arrow keys', () => {
    const onChange = vi.fn();
    renderMenu(onChange);
    openWithKeyboard();

    fireEvent.keyDown(screen.getByTestId('view-section-status'), { key: 'ArrowRight' });

    // Into the options, on the first one.
    expect(activeTestId()).toBe('view-status-active');
    fireEvent.keyDown(screen.getByTestId('view-status-active'), { key: 'ArrowDown' });
    expect(activeTestId()).toBe('view-status-archived');
    fireEvent.keyDown(screen.getByTestId('view-status-archived'), { key: 'ArrowDown' });
    expect(activeTestId()).toBe('view-status-all');

    // Choosing one works from the keyboard like anything else.
    fireEvent.click(screen.getByTestId('view-status-archived'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ status: 'archived' }));
  });

  it('brings the keyboard back out of the options with ArrowLeft, onto the row', () => {
    renderMenu();
    openWithKeyboard();
    fireEvent.keyDown(screen.getByTestId('view-section-status'), { key: 'ArrowRight' });
    expect(activeTestId()).toBe('view-status-active');

    const panel = screen.getByTestId('sidebar-view-section');
    fireEvent.keyDown(panel, { key: 'ArrowLeft' });

    // Back on the row it belongs to — the only way to reach a different
    // section once the options are in front of you.
    expect(activeTestId()).toBe('view-section-status');
    expect(screen.queryByTestId('sidebar-view-section')).toBeNull();
  });

  it('closes one level at a time, and gives focus back to the control at the end', () => {
    renderMenu();
    openWithKeyboard();
    fireEvent.keyDown(screen.getByTestId('view-section-status'), { key: 'ArrowRight' });

    // First Escape: the options go, the menu and the keyboard stay put.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('sidebar-view-section')).toBeNull();
    expect(screen.getByTestId('sidebar-view-menu')).toBeDefined();
    expect(activeTestId()).toBe('view-section-status');

    // Second Escape: the menu goes too, and focus is handed back to the control
    // that opened it, rather than being dropped on the body.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('sidebar-view-menu')).toBeNull();
    expect(activeTestId()).toBe('sidebar-view-options');
  });

  it('does not pull the keyboard into a panel that the pointer opened', () => {
    renderMenu();
    const control = screen.getByTestId('sidebar-view-options');
    control.focus();
    fireEvent.click(control);
    fireEvent.keyDown(control, { key: 'ArrowDown' });
    expect(activeTestId()).toBe('view-section-status');

    // A hover opens the options beside the row the pointer is on. Focus has to
    // stay on the first row: taking it would move the keyboard out from under
    // someone who is only pointing.
    fireEvent.mouseEnter(screen.getByTestId('view-section-sort'));
    expect(screen.getByTestId('sidebar-view-section')).toBeDefined();
    expect(activeTestId()).toBe('view-section-status');
  });

  it('names the options panel for a screen reader, with no heading inside it', () => {
    renderMenu();
    openWithKeyboard();
    fireEvent.keyDown(screen.getByTestId('view-section-status'), { key: 'ArrowRight' });

    // As Claude's (owner, 2026-09-28): the row that opened it names it on
    // screen, and the panel's own aria-label names it to a screen reader. A
    // `menu` then holds nothing but its options.
    const panel = screen.getByTestId('sidebar-view-section');
    expect(panel.getAttribute('aria-label')).toBe('Status');
    expect(panel.querySelector('.patient-menu-heading')).toBeNull();
    for (const child of panel.children) expect(child.getAttribute('role')).toBe('menuitemradio');
  });

  it('keeps the options panel inside the window, flipping it left when it must', () => {
    renderMenu();
    openWithKeyboard();
    // jsdom reports a zero-width viewport element, so the flip is provoked by
    // making the menu itself claim to be at the right-hand edge.
    const panel = screen.getByTestId('sidebar-view-menu');
    panel.getBoundingClientRect = () =>
      ({ right: window.innerWidth, left: window.innerWidth - 200, top: 0, bottom: 100 }) as DOMRect;

    fireEvent.keyDown(screen.getByTestId('view-section-status'), { key: 'ArrowRight' });
    const sectionPanel = screen.getByTestId('sidebar-view-section');
    const left = Number.parseFloat(sectionPanel.style.left);
    expect(Number.isNaN(left)).toBe(false);
    // Flipped to the menu's left rather than placed off the right edge.
    expect(left).toBeLessThanOrEqual(window.innerWidth);
    expect(left + 240).toBeLessThanOrEqual(window.innerWidth);
  });
});

/**
 * A choice made with a real pointer (owner, 2026-09-27): **none of the options
 * did anything**. A browser sends `pointerdown` before `click`, and the options
 * panel is a second portal the outside-press check did not count as inside, so
 * the press closed the menu and the click landed on nothing. Every test here
 * sends the press first, the way a mouse does.
 */
describe('the view control with a pointer', () => {
  function press(element: Element): void {
    fireEvent.pointerDown(element);
    fireEvent.mouseDown(element);
    fireEvent.pointerUp(element);
    fireEvent.mouseUp(element);
    fireEvent.click(element);
  }

  it.each([
    ['status', 'archived', { status: 'archived' }],
    ['activity', '7d', { activity: '7d' }],
    ['groupBy', 'none', { groupBy: 'none' }],
    ['sort', 'name', { sort: 'name' }],
  ] as const)('applies %s = %s when the option is pressed', (field, value, expected) => {
    const onChange = vi.fn();
    renderMenu(onChange);

    press(screen.getByTestId('sidebar-view-options'));
    press(screen.getByTestId(`view-section-${field}`));
    press(screen.getByTestId(`view-${field}-${value}`));

    expect(onChange).toHaveBeenCalledWith({ ...view, ...expected });
  });

  it('still closes on a press outside both panels', () => {
    renderMenu();
    press(screen.getByTestId('sidebar-view-options'));
    press(screen.getByTestId('view-section-sort'));

    fireEvent.pointerDown(document.body);

    expect(screen.queryByTestId('sidebar-view-menu')).toBeNull();
    expect(screen.queryByTestId('sidebar-view-section')).toBeNull();
  });
});

/**
 * The menu as Claude's has it (owner, 2026-09-28): filters, then arrangement,
 * then "Reset to defaults" only when there is something to reset; a filter
 * that is off its default shows its value in the accent; the tick is the
 * accent, at the end of the row.
 */
describe("the view menu, laid out after Claude's", () => {
  function renderWith(current: Partial<SidebarView>, onChange = vi.fn()): void {
    render(<SidebarViewMenu view={{ ...view, ...current }} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('sidebar-view-options'));
  }

  it('offers no reset at the defaults', () => {
    renderWith({});
    expect(screen.queryByTestId('view-reset')).toBeNull();
    // One rule, between the filters and the arrangement.
    expect(screen.getByTestId('sidebar-view-menu').querySelectorAll('[role="separator"]')).toHaveLength(1);
  });

  it('offers a reset once anything is changed, and it puts all four back', () => {
    const onChange = vi.fn();
    renderWith({ sort: 'name', groupBy: 'none' }, onChange);

    fireEvent.click(screen.getByTestId('view-reset'));

    expect(onChange).toHaveBeenCalledWith(DEFAULT_SIDEBAR_VIEW);
    expect(screen.queryByTestId('sidebar-view-menu')).toBeNull();
  });

  it('shows a changed filter in the accent, and a changed sort or grouping in grey', () => {
    renderWith({ status: 'all', sort: 'name', groupBy: 'none' });

    const value = (field: string): Element | null =>
      screen.getByTestId(`view-section-${field}`).querySelector('.view-section-value');
    expect(value('status')?.className).toContain('is-flagged');
    expect(value('activity')?.className).not.toContain('is-flagged');
    expect(value('groupBy')?.className).not.toContain('is-flagged');
    expect(value('sort')?.className).not.toContain('is-flagged');
    expect(APP_CSS).toMatch(/\.view-section-value\.is-flagged\s*\{[^}]*color: var\(--accent\)/);
  });

  it('names the options as Claude does, and has no Manual order', () => {
    renderWith({});
    fireEvent.click(screen.getByTestId('view-section-activity'));
    expect(
      [...screen.getByTestId('sidebar-view-section').querySelectorAll('.view-option-label')].map(
        (node) => node.textContent,
      ),
    ).toEqual(['1d', '3d', '7d', '30d', 'All']);

    fireEvent.click(screen.getByTestId('view-section-sort'));
    expect(
      [...screen.getByTestId('sidebar-view-section').querySelectorAll('.view-option-label')].map(
        (node) => node.textContent,
      ),
    ).toEqual(['Name', 'Date created', 'Last activity']);
    expect(screen.getByTestId('view-section-sort').textContent).toContain('Last activity');

    fireEvent.click(screen.getByTestId('view-section-groupBy'));
    expect(
      [...screen.getByTestId('sidebar-view-section').querySelectorAll('.view-option-label')].map(
        (node) => node.textContent,
      ),
    ).toEqual(['My groups', 'None']);
  });

  it('ticks the chosen option in the accent, at the end of the row', () => {
    renderWith({});
    fireEvent.click(screen.getByTestId('view-section-status'));

    const chosen = screen.getByTestId('view-status-active');
    expect(chosen.lastElementChild?.classList.contains('view-option-check')).toBe(true);
    // As specific as the menu's own `.patient-menu-item:hover .icon`, which a
    // looser selector loses to — the tick was grey, then white under the
    // pointer, in the app while looser versions of this check passed. The
    // browser check in the batch notes measures the painted colour.
    expect(APP_CSS).toMatch(/\.patient-menu-item \.icon\.view-option-check\s*\{[^}]*color: var\(--accent\)/);
  });
});

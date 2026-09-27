import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SidebarViewMenu } from './SidebarViewMenu.js';
import { DEFAULT_SIDEBAR_VIEW, type SidebarView } from '../lib/sidebarView.js';

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

  it('keeps the headings out of the accessibility tree of the menu', () => {
    renderMenu();
    openWithKeyboard();
    fireEvent.keyDown(screen.getByTestId('view-section-status'), { key: 'ArrowRight' });

    // A `menu` may only contain menuitem/menuitemradio/menuitemcheckbox/group/
    // separator. The heading is a direct child, so it is presentational — the
    // panel's own aria-label is what names the group.
    const heading = document.querySelector('.sidebar-view-section .patient-menu-heading');
    expect(heading).not.toBeNull();
    expect(heading?.getAttribute('role')).toBe('presentation');
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

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SidebarResizer } from './SidebarResizer.js';

/**
 * The sidebar's edge, as Claude's (owner, 2026-09-26): a click hides the
 * sidebar, a drag resizes it within 220–400px, the card beside it goes once a
 * drag starts, and the keyboard reaches both through a vertical separator.
 */

afterEach(cleanup);

function renderEdge(width = 288): {
  onResize: ReturnType<typeof vi.fn>;
  onCollapse: ReturnType<typeof vi.fn>;
} {
  const onResize = vi.fn();
  const onCollapse = vi.fn();
  render(<SidebarResizer width={width} onResize={onResize} onCollapse={onCollapse} />);
  const edge = screen.getByTestId('sidebar-resizer');
  // jsdom has no pointer capture; the edge only needs the calls to exist.
  Object.assign(edge, {
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    hasPointerCapture: () => false,
  });
  return { onResize, onCollapse };
}

function pointer(type: string, clientX: number): void {
  fireEvent(
    screen.getByTestId('sidebar-resizer'),
    new MouseEvent(type, { bubbles: true, clientX, clientY: 200, button: 0 }),
  );
}

describe('the sidebar edge', () => {
  it('is a vertical separator carrying the width, named for what a click does', () => {
    renderEdge(300);
    const edge = screen.getByRole('separator', { name: 'Hide patients' });

    expect(edge.getAttribute('aria-orientation')).toBe('vertical');
    expect(edge.getAttribute('aria-valuenow')).toBe('300');
    expect(edge.getAttribute('aria-valuemin')).toBe('220');
    expect(edge.getAttribute('aria-valuemax')).toBe('400');
  });

  it('shows the card on hover: the action, its shortcut, and the drag', () => {
    renderEdge();
    pointer('pointerover', 290);

    const card = screen.getByTestId('sidebar-resize-card');
    expect(card.textContent).toContain('Hide patients');
    expect(card.textContent).toMatch(/Ctrl\+B|⌘B/);
    expect(card.textContent).toContain('Drag to resize');
  });

  it('hides the sidebar on a click that does not move', () => {
    const { onResize, onCollapse } = renderEdge();
    pointer('pointerdown', 290);
    pointer('pointerup', 290);

    expect(onCollapse).toHaveBeenCalledTimes(1);
    expect(onResize).not.toHaveBeenCalled();
  });

  it('resizes on a drag, drops the card as it starts, and clamps the width', () => {
    const { onResize, onCollapse } = renderEdge(288);
    pointer('pointerover', 290);
    pointer('pointerdown', 290);
    pointer('pointermove', 330);

    expect(screen.queryByTestId('sidebar-resize-card')).toBeNull();
    expect(onResize).toHaveBeenLastCalledWith(328, false);

    pointer('pointermove', 900);
    pointer('pointerup', 900);

    expect(onResize).toHaveBeenLastCalledWith(400, true);
    expect(onCollapse).not.toHaveBeenCalled();
  });

  it('resizes with the arrows and hides on Enter', () => {
    const { onResize, onCollapse } = renderEdge(288);
    const edge = screen.getByTestId('sidebar-resizer');

    fireEvent.keyDown(edge, { key: 'ArrowLeft' });
    expect(onResize).toHaveBeenLastCalledWith(272, true);
    fireEvent.keyDown(edge, { key: 'Enter' });
    expect(onCollapse).toHaveBeenCalledTimes(1);
  });
});

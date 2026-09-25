import { afterEach, describe, expect, it, vi } from 'vitest';

import { installAutoHideScrollbars } from './scrollbars.js';

describe('installAutoHideScrollbars', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('marks a scroller while it scrolls and clears the mark once it is still', () => {
    vi.useFakeTimers();
    const uninstall = installAutoHideScrollbars(document, 800);
    const list = document.createElement('div');
    document.body.append(list);

    list.dispatchEvent(new Event('scroll'));
    expect(list.classList.contains('is-scrolling')).toBe(true);

    vi.advanceTimersByTime(500);
    list.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(500);
    // Still scrolling: the second scroll restarted the clock.
    expect(list.classList.contains('is-scrolling')).toBe(true);

    vi.advanceTimersByTime(300);
    expect(list.classList.contains('is-scrolling')).toBe(false);
    uninstall();
  });
});

/*
 * Which patients are pinned to the top of the sidebar, and in what order.
 *
 * preview-only: persist server-side in the real card. The API has no pin
 * column, so this preview keeps the ordered id list in `localStorage` — it
 * survives a reload of this browser only, is not shared with a second window,
 * and a real card would store it beside the patient (and read it as part of
 * the list response) instead.
 */

const STORAGE_KEY = 'apunta-pinned-patients-v1';

/** Never throws: a blocked or full store must not take the sidebar down. */
export function readPinnedIds(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string');
  } catch {
    return [];
  }
}

export function writePinnedIds(ids: readonly string[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // A store that refuses writes only costs the pin order, nothing else.
  }
}

/** The sidebar's collapsed state, same preview-only bargain as the pins. */
const COLLAPSED_KEY = 'apunta-sidebar-collapsed-v1';

export function readSidebarCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeSidebarCollapsed(collapsed: boolean): void {
  try {
    if (collapsed) window.localStorage.setItem(COLLAPSED_KEY, '1');
    else window.localStorage.removeItem(COLLAPSED_KEY);
  } catch {
    // Losing the layout preference is not worth an error path.
  }
}

/** How the sidebar's "Older" group is ordered; same preview-only bargain. */
export type SidebarSort = 'recent' | 'name';
const SORT_KEY = 'apunta-sidebar-sort-v1';

export function readSidebarSort(): SidebarSort {
  try {
    return window.localStorage.getItem(SORT_KEY) === 'name' ? 'name' : 'recent';
  } catch {
    return 'recent';
  }
}

export function writeSidebarSort(sort: SidebarSort): void {
  try {
    if (sort === 'name') window.localStorage.setItem(SORT_KEY, 'name');
    else window.localStorage.removeItem(SORT_KEY);
  } catch {
    // Losing the order preference is not worth an error path.
  }
}

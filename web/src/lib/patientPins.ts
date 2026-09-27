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

/** How the sidebar's "Recents" group is ordered; same preview-only bargain. */
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

/**
 * The sidebar's width after she drags its edge, same preview-only bargain.
 * Clamped to what Claude allows its own sidebar: narrower and the names are
 * unreadable, wider and the notes lose their room.
 */
/** `--sidebar-w`'s value in `styles/tokens.css`: the width before any drag. */
export const SIDEBAR_DEFAULT_W = 288;
export const SIDEBAR_MIN_W = 220;
export const SIDEBAR_MAX_W = 400;
const WIDTH_KEY = 'apunta-sidebar-width-v1';

export function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_MAX_W, Math.max(SIDEBAR_MIN_W, Math.round(width)));
}

/** `null` means she has never dragged it, so the token's default applies. */
export function readSidebarWidth(): number | null {
  try {
    const raw = window.localStorage.getItem(WIDTH_KEY);
    if (raw === null) return null;
    const width = Number(raw);
    return Number.isFinite(width) ? clampSidebarWidth(width) : null;
  } catch {
    return null;
  }
}

export function writeSidebarWidth(width: number): void {
  try {
    window.localStorage.setItem(WIDTH_KEY, String(clampSidebarWidth(width)));
  } catch {
    // Losing the width only costs the default width back.
  }
}

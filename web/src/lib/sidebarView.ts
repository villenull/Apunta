/**
 * How the sidebar's list is filtered and ordered — the four sections of the
 * control beside "Recents" (owner, 2026-09-27).
 *
 * Stored in one key rather than four, because they are one decision: a sidebar
 * that remembers her sort but forgets her status filter is a sidebar that looks
 * broken. Same preview-only bargain as the pins and the width.
 *
 * **The defaults are the app's own behaviour, not new behaviour.** Active,
 * every date, groups on, most recent first is exactly what the sidebar did
 * before the menu existed, so opening it and closing it again changes nothing.
 *
 * `sort` is deliberately absent: it already has a home and a key
 * (`patientPins.ts`), because it shipped before this menu did, and moving it
 * would strand the preference she has already set. `sortFromSidebarView` and
 * `sortToSidebarView` are the bridge.
 */
import { readSidebarSort, writeSidebarSort, type SidebarSort } from './patientPins.js';

const VIEW_KEY = 'apunta-sidebar-view-v1';

export type SidebarStatus = 'active' | 'archived' | 'all';
export type SidebarActivity = 'all' | '1d' | '3d' | '7d' | '30d';
/**
 * Only the two that are real today (owner, 2026-09-27): her own group headings,
 * or one flat list. "Date" and "Unread" from the original menu are not here —
 * unread has no stored meaning yet, and a row that changes nothing is worse than
 * a row that is absent.
 */
export type SidebarGroupBy = 'groups' | 'none';

export interface SidebarView {
  readonly status: SidebarStatus;
  readonly activity: SidebarActivity;
  readonly groupBy: SidebarGroupBy;
  /**
   * `manual` is her dragged order inside each group (owner, 2026-09-27). A drag
   * that reorders a group switches to it; choosing any other sort forgets the
   * dragged orders. Recents has no dragged order and keeps its default under it.
   */
  readonly sort: SidebarSort | 'created' | 'manual';
}

export const DEFAULT_SIDEBAR_VIEW: SidebarView = {
  status: 'active',
  activity: 'all',
  groupBy: 'groups',
  sort: 'recent',
};

const STATUSES: readonly SidebarStatus[] = ['active', 'archived', 'all'];
const ACTIVITIES: readonly SidebarActivity[] = ['all', '1d', '3d', '7d', '30d'];
const GROUPINGS: readonly SidebarGroupBy[] = ['groups', 'none'];
const SORTS: readonly SidebarView['sort'][] = ['name', 'created', 'recent', 'manual'];

/** One `is`/`includes`, because every field is a closed set of known strings. */
function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && allowed.includes(value as T);
}

export function readSidebarView(): SidebarView {
  // The sort she already chose wins over anything in the new key, so opening
  // this menu for the first time does not quietly undo it.
  const sort = readSidebarSort();
  let stored: Partial<Record<keyof SidebarView, unknown>> = {};
  try {
    const raw = window.localStorage.getItem(VIEW_KEY);
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw);
      if (parsed !== null && typeof parsed === 'object') {
        stored = parsed as Partial<Record<keyof SidebarView, unknown>>;
      }
    }
  } catch {
    // A corrupt store is the same as no store: the defaults are the app's own
    // behaviour, so the worst case is the sidebar she had yesterday.
  }
  return {
    status: isOneOf(stored.status, STATUSES) ? stored.status : DEFAULT_SIDEBAR_VIEW.status,
    activity: isOneOf(stored.activity, ACTIVITIES) ? stored.activity : DEFAULT_SIDEBAR_VIEW.activity,
    groupBy: isOneOf(stored.groupBy, GROUPINGS) ? stored.groupBy : DEFAULT_SIDEBAR_VIEW.groupBy,
    // This key first, the legacy one second (F2). `sort` was left out of what
    // `writeSidebarView` stored, so `stored.sort` was always `undefined` and
    // every read fell through to the legacy key — which has two states and no
    // room for "Date created". She chose it, the list re-sorted, and a reload
    // put her back on "Last activity" while the menu still claimed otherwise.
    sort: isOneOf(stored.sort, SORTS) ? stored.sort : sort,
  };
}

export function writeSidebarView(view: SidebarView): void {
  /*
   * The legacy key is still written, and still lossy: it only knows "name" and
   * "not name", so "Date created" is mirrored as "recent". That is deliberate
   * (F2). This key is the one that is read, so nothing is lost here; the mirror
   * is for the other direction — a build from before the three-way sort reads
   * that key, and would otherwise come back from a downgrade having forgotten
   * that she had arranged her sidebar at all. A stale-but-plausible value beats
   * a reset nobody asked for. `manual` mirrors as "recent" for the same reason.
   */
  writeSidebarSort(view.sort === 'created' || view.sort === 'manual' ? 'recent' : view.sort);
  try {
    if (
      view.status === DEFAULT_SIDEBAR_VIEW.status &&
      view.activity === DEFAULT_SIDEBAR_VIEW.activity &&
      view.groupBy === DEFAULT_SIDEBAR_VIEW.groupBy &&
      view.sort === DEFAULT_SIDEBAR_VIEW.sort
    ) {
      window.localStorage.removeItem(VIEW_KEY);
      return;
    }
    window.localStorage.setItem(
      VIEW_KEY,
      JSON.stringify({
        status: view.status,
        activity: view.activity,
        groupBy: view.groupBy,
        sort: view.sort,
      }),
    );
  } catch {
    // Losing how she had the sidebar arranged is not worth an error path.
  }
}

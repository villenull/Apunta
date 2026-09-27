/**
 * Which sidebar sections she has folded away.
 *
 * preview-only bargain, the same one `patientPins.ts` keeps the sort and the
 * width under: `localStorage` now, server-side in the real card. Storing it
 * rather than holding it in component state is the point — a fold that came back
 * on every reload would be a fold she would stop using.
 *
 * Keyed by a stable string, never by an index: the sections come and go as she
 * makes groups, and "the second one" is a different section by Tuesday.
 */
const COLLAPSED_KEY = 'apunta-sidebar-collapsed-v1';

export function readCollapsedSections(): ReadonlySet<string> {
  try {
    const raw = window.localStorage.getItem(COLLAPSED_KEY);
    if (raw === null) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((entry): entry is string => typeof entry === 'string'));
  } catch {
    // A corrupt or unreadable store is the same as nothing folded: every
    // section open, which is how the sidebar started.
    return new Set();
  }
}

export function writeCollapsedSections(collapsed: ReadonlySet<string>): void {
  try {
    if (collapsed.size === 0) {
      window.localStorage.removeItem(COLLAPSED_KEY);
      return;
    }
    window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed].sort()));
  } catch {
    // Losing which sections were folded is not worth an error path.
  }
}

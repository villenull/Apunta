/**
 * Scrollbars that appear only while something scrolls, then fade, the way
 * a phone's do (owner, 2026-09-24). CSS can style a scrollbar but cannot tell
 * whether it is scrolling, so this marks whatever just scrolled with
 * `is-scrolling` and clears it once scrolling has been still for `idleMs`.
 * The styling lives in `styles/tokens.css`.
 */
export function installAutoHideScrollbars(root: Document = document, idleMs = 800): () => void {
  const timers = new Map<Element, ReturnType<typeof setTimeout>>();

  function onScroll(event: Event): void {
    const target = event.target instanceof Document ? event.target.documentElement : event.target;
    if (!(target instanceof Element)) return;
    target.classList.add('is-scrolling');
    const pending = timers.get(target);
    if (pending !== undefined) clearTimeout(pending);
    timers.set(
      target,
      setTimeout(() => {
        target.classList.remove('is-scrolling');
        timers.delete(target);
      }, idleMs),
    );
  }

  // Scroll does not bubble; capturing sees every scroller in the page.
  root.addEventListener('scroll', onScroll, { capture: true, passive: true });
  return () => {
    root.removeEventListener('scroll', onScroll, { capture: true });
    for (const pending of timers.values()) clearTimeout(pending);
    timers.clear();
  };
}

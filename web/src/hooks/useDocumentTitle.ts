import { useEffect } from 'react';

/**
 * The browser tab's name (M7 deliverable 5).
 *
 * Apunta lives in a tab, usually among other tabs, and "Apunta" on every one
 * of them tells her nothing about which is which. Each screen names itself.
 *
 * **No patient name ever goes in here.** A tab title is read over a shoulder,
 * appears in the window switcher, and is written into browser history — three
 * places a clinical name should not be. The workspace says "Patients", not
 * "John Smith".
 */
export const APP_NAME = 'Apunta';

export function useDocumentTitle(title: string | null): void {
  useEffect(() => {
    const previous = document.title;
    document.title = title === null || title === '' ? APP_NAME : `${title} · ${APP_NAME}`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}

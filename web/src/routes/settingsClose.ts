import { useCallback, useRef } from 'react';

/**
 * What a host modal has to be able to ask the settings panel before it unmounts
 * it: may this go away yet? The answer is `false` while the format editor holds
 * an edit the server has not taken, and `true` once the editor has written what
 * is on screen (owner, 2026-10-05).
 */
export interface SettingsCloseHandle {
  close(): Promise<boolean>;
}

/** The slot a `SettingsModalPanel` registers itself in while it is mounted. */
export type SettingsCloseRef = React.RefObject<SettingsCloseHandle | null>;

/**
 * The host's half of a safe exit.
 *
 * A panel inside a `Dialog` cannot guard the dialog's own Escape: that calls the
 * host's `onClose` directly (`components/Dialog.tsx`), so an Escape mid-edit
 * would unmount the format editor over an unwritten edit. So the host wraps its
 * close in this and hands the panel the ref — Escape and the panel's own close
 * button then take exactly the same path, and neither unmounts the editor over
 * an edit the server has not taken.
 *
 * With no panel mounted (a `SettingsModalPanel` that has not arrived yet, or a
 * host that renders none) the close is the host's own, unchanged.
 *
 * This lives outside `Settings.tsx` so a host can hold the guard without
 * importing the settings chunk — the panel itself is still lazy-loaded.
 */
export function useSettingsClose(onClose: () => void): {
  closeRef: SettingsCloseRef;
  close: () => void;
} {
  const handle = useRef<SettingsCloseHandle | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const close = useCallback((): void => {
    const pending = handle.current?.close();
    if (pending === undefined) {
      onCloseRef.current();
      return;
    }
    void pending.then((may) => {
      if (may) onCloseRef.current();
    });
  }, []);
  return { closeRef: handle, close };
}

import type { Settings, UpdateSettingsRequest } from '@apunta/shared';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { errorMessage } from '../api/client.js';
import { getSettings, putSettings } from '../api/settings.js';

export type SettingsState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly data: Settings };

export interface SettingsContextValue {
  readonly state: SettingsState;
  readonly reload: () => void;
  /**
   * The only way a setting changes (C-SETTINGS@1): apply the patch here and
   * now, then save it. Rejects with the API error, and that rejection is the
   * whole of the failure story — the provider holds no error of its own, so
   * each control keeps the error block it already had.
   */
  readonly update: (patch: UpdateSettingsRequest) => Promise<void>;
}

const INERT: SettingsContextValue = {
  state: { status: 'loading' },
  reload: () => {},
  update: () => Promise.resolve(),
};

export const SettingsContext = createContext<SettingsContextValue>(INERT);

export function useSettingsContext(): SettingsContextValue {
  return useContext(SettingsContext);
}

/** A value JSON cannot carry means "this key was not set". */
type Changes = Readonly<Record<string, Settings[string] | undefined>>;

/**
 * A patch merged into a settings record. A key whose value is `undefined` is
 * removed, which is how a rollback puts a key back the way it was before the
 * request that failed.
 */
function mergePatch(current: Settings, changes: Changes): Settings {
  const next = { ...current };
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  return next;
}

function sameRecord(left: Settings, right: Settings): boolean {
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => left[key] === right[key]);
}

/**
 * Loads the practice settings once and keeps them alive across route changes —
 * and writes them, so it is the only place a stored setting can live. A control
 * cannot keep one to itself, which is what fixes "Dark stays selected in light
 * mode": the provider holds the value the page is painted from, so the two
 * cannot drift apart.
 */
export function SettingsProvider({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  const [state, setState] = useState<SettingsState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  /**
   * The loaded record, mirrored into a ref. `update` needs the value from
   * before a request without waiting for a render, and a second request in the
   * same tick has to build on the first one's optimistic value — so the ref is
   * written by the load and by every patch, never by every render.
   */
  const loadedRef = useRef<Settings | null>(null);
  /** The last request to touch each key, so a late answer cannot undo a newer one. */
  const latestSeqRef = useRef(new Map<string, number>());
  const sequenceRef = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    getSettings(controller.signal).then(
      (data) => {
        if (controller.signal.aborted) return;
        loadedRef.current = data;
        setState({ status: 'ready', data });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setState({ status: 'error', message: errorMessage(error) });
      },
    );
    return () => controller.abort();
  }, [attempt]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  const update = useCallback(async (patch: UpdateSettingsRequest): Promise<void> => {
    const keys = Object.keys(patch);
    if (keys.length === 0) return;
    sequenceRef.current += 1;
    const sequence = sequenceRef.current;
    for (const key of keys) latestSeqRef.current.set(key, sequence);
    const loaded = loadedRef.current;
    const before: Record<string, Settings[string] | undefined> = {};
    for (const key of keys) before[key] = loaded?.[key];

    /** Write into the provider's own record, if it has one to write into. */
    const applyLocal = (changes: Changes): void => {
      const current = loadedRef.current;
      if (current === null) return;
      const next = mergePatch(current, changes);
      if (sameRecord(next, current)) return;
      loadedRef.current = next;
      setState({ status: 'ready', data: next });
    };
    /** The keys of this request that no newer request has spoken for since. */
    const stillMine = (): string[] => keys.filter((key) => latestSeqRef.current.get(key) === sequence);

    applyLocal(patch);

    let saved: Settings;
    try {
      saved = await putSettings(patch);
    } catch (thrown: unknown) {
      // Back to the value from before *this* request, and only where this
      // request is still the latest intent: a newer choice stands.
      applyLocal(Object.fromEntries(stillMine().map((key) => [key, before[key]] as const)));
      throw thrown;
    }
    // The server has the last word on the keys it still answers for. Its answer
    // for a key a newer request has taken is not this provider's news, and the
    // value it echoes for the rest is the one already held, so nothing moves.
    applyLocal(
      Object.fromEntries(
        stillMine()
          .filter((key) => key in saved && loadedRef.current?.[key] !== saved[key])
          .map((key) => [key, saved[key]] as const),
      ),
    );
  }, []);

  return <SettingsContext.Provider value={{ state, reload, update }}>{children}</SettingsContext.Provider>;
}

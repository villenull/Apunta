import type { Settings } from '@apunta/shared';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { errorMessage } from '../api/client.js';
import { getSettings } from '../api/settings.js';

export type SettingsState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly data: Settings };

export interface SettingsContextValue {
  readonly state: SettingsState;
  readonly reload: () => void;
}

const INERT: SettingsContextValue = {
  state: { status: 'loading' },
  reload: () => {},
};

export const SettingsContext = createContext<SettingsContextValue>(INERT);

export function useSettingsContext(): SettingsContextValue {
  return useContext(SettingsContext);
}

/** Loads the practice settings once and keeps them alive across route changes. */
export function SettingsProvider({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  const [state, setState] = useState<SettingsState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    getSettings(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ status: 'ready', data });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setState({ status: 'error', message: errorMessage(error) });
      },
    );
    return () => controller.abort();
  }, [attempt]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  return <SettingsContext.Provider value={{ state, reload }}>{children}</SettingsContext.Provider>;
}

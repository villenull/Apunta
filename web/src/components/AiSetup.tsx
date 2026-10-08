import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { fetchHealth } from '../api/index.js';
import { useLoader } from '../hooks/useLoader.js';
import { useSetupStatus } from '../hooks/useSetupStatus.js';
import { AiSetupDialog } from './AiSetupDialog.js';

/**
 * First-run setup, owned once for the whole app rather than by a screen.
 *
 * A fresh install lands on onboarding, not the workspace, so a setup window
 * owned by the workspace's banner would wait until she had finished choosing a
 * format. Owned here, it opens over whatever is first — and she can hide it
 * and carry on while the models download.
 *
 * It opens by itself once per launch when the desktop app is missing a model
 * setup can fetch; the workspace banner opens it again on request.
 */
export interface AiSetupHandle {
  /** The desktop app's setup routes answer: setup can run here. */
  readonly available: boolean;
  readonly open: () => void;
  /** Bumped each time setup finishes, so a screen can re-read health. */
  readonly finished: number;
}

const AiSetupContext = createContext<AiSetupHandle>({ available: false, open: () => undefined, finished: 0 });

export function useAiSetup(): AiSetupHandle {
  return useContext(AiSetupContext);
}

export function AiSetupProvider({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  const loadHealth = useCallback((signal: AbortSignal) => fetchHealth(signal), []);
  const health = useLoader(loadHealth);
  // One read, no polling: it only answers "is there a shell that can set up?".
  const setup = useSetupStatus(false);
  const [isOpen, setOpen] = useState(false);
  const [finished, setFinished] = useState(0);
  const autoOpened = useRef(false);

  const data = health.state.status === 'ready' ? health.state.data : null;
  const available = setup.status !== null;
  const needed = data !== null && setupCanFix(data);

  useEffect(() => {
    if (needed && available && !autoOpened.current) {
      autoOpened.current = true;
      setOpen(true);
    }
  }, [needed, available]);

  const open = useCallback(() => {
    setOpen(true);
  }, []);
  const onReady = useCallback(() => {
    setFinished((count) => count + 1);
    health.reload();
  }, [health]);

  return (
    <AiSetupContext.Provider value={{ available, open, finished }}>
      {children}
      {isOpen && (
        <AiSetupDialog
          onClose={() => {
            setOpen(false);
          }}
          onReady={onReady}
        />
      )}
    </AiSetupContext.Provider>
  );
}

/**
 * What first-run setup can fix: the writing model missing from a runtime that
 * answers, or the speech model missing. Fake mode has neither and needs
 * neither.
 */
export function setupCanFix(health: {
  readonly fakeAi: boolean;
  readonly ollama: { readonly reachable: boolean; readonly modelPresent: boolean };
  readonly whisper: { readonly modelPresent: boolean };
}): boolean {
  if (health.fakeAi) return false;
  return (health.ollama.reachable && !health.ollama.modelPresent) || !health.whisper.modelPresent;
}

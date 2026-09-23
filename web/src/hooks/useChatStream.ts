import { useCallback, useRef, useState } from 'react';

import { errorMessage } from '../api/index.js';

export interface ChatStreamHandlers<TMessage, TContext> {
  readonly onStatus: (message: string) => void;
  readonly onToken: (text: string) => void;
  readonly onMessage: (message: TMessage) => boolean | void;
  readonly onContext: (context: TContext) => void;
}

export interface ChatStreamOptions<TMessage, TContext> {
  readonly beforeSend?: (text: string) => Promise<void> | void;
  readonly onStarted?: (text: string) => void;
  readonly onMessage?: (message: TMessage) => boolean | void;
  readonly onContext?: (context: TContext) => void;
}

export interface ChatStreamState {
  readonly streaming: string | null;
  readonly status: string | null;
  readonly sending: boolean;
  readonly error: string | null;
  readonly send: (text: string) => Promise<void>;
  readonly stop: () => void;
  readonly clearError: () => void;
}

/** Shared lifecycle for the refine and brainstorm streaming chats. */
export function useChatStream<TMessage, TContext>(
  request: (
    text: string,
    handlers: ChatStreamHandlers<TMessage, TContext>,
    signal: AbortSignal,
  ) => Promise<void>,
  options: ChatStreamOptions<TMessage, TContext> = {},
): ChatStreamState {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const sendingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(
    async (input: string): Promise<void> => {
      const text = input.trim();
      if (text === '' || sendingRef.current) return;

      sendingRef.current = true;
      setSending(true);
      setError(null);
      setStreaming('');
      setStatus(null);

      const controller = new AbortController();
      abortRef.current = controller;
      try {
        await optionsRef.current.beforeSend?.(text);
      } catch (thrown) {
        setError(errorMessage(thrown));
        setStreaming(null);
        abortRef.current = null;
        sendingRef.current = false;
        setSending(false);
        return;
      }

      optionsRef.current.onStarted?.(text);
      const handlers: ChatStreamHandlers<TMessage, TContext> = {
        onStatus: (message) => setStatus(message),
        onToken: (chunk) => setStreaming((current) => (current ?? '') + chunk),
        onMessage: (message) => {
          const complete = optionsRef.current.onMessage?.(message) === true;
          if (complete) setStreaming(null);
          return complete;
        },
        onContext: (context) => optionsRef.current.onContext?.(context),
      };

      try {
        await request(text, handlers, controller.signal);
      } catch (thrown) {
        if (controller.signal.aborted) return;
        setError(errorMessage(thrown));
        setStreaming(null);
      } finally {
        abortRef.current = null;
        sendingRef.current = false;
        setSending(false);
        setStatus(null);
      }
    },
    [request],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(null);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return { streaming, status, sending, error, send, stop, clearError };
}

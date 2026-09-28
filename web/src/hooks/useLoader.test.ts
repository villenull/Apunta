import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useLoader } from './useLoader.js';

/**
 * `reload` and `refresh` (owner, 2026-09-27). The difference is the whole point:
 * a sidebar that went back to "Loading…" after every drag redrew every name, so
 * a re-read after a local edit must keep the data on screen until it is replaced.
 */
describe('useLoader', () => {
  function deferred<T>(): {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (error: unknown) => void;
  } {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    return { promise, resolve, reject };
  }

  it('shows loading again on reload', async () => {
    const answers = [deferred<string>(), deferred<string>()];
    let call = 0;
    const load = (): Promise<string> => (answers[call++] as { promise: Promise<string> }).promise;
    const { result } = renderHook(() => useLoader(load));

    await act(async () => {
      answers[0]?.resolve('first');
    });
    expect(result.current.state).toEqual({ status: 'ready', data: 'first' });

    act(() => {
      result.current.reload();
    });
    expect(result.current.state).toEqual({ status: 'loading' });
  });

  it('keeps the data on screen while a refresh runs, then replaces it', async () => {
    const answers = [deferred<string>(), deferred<string>()];
    let call = 0;
    const load = (): Promise<string> => (answers[call++] as { promise: Promise<string> }).promise;
    const { result } = renderHook(() => useLoader(load));
    await act(async () => {
      answers[0]?.resolve('first');
    });

    act(() => {
      result.current.refresh();
    });
    expect(result.current.state).toEqual({ status: 'ready', data: 'first' });

    await act(async () => {
      answers[1]?.resolve('second');
    });
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'ready', data: 'second' });
    });
  });

  it('keeps the data when a refresh fails', async () => {
    const answers = [deferred<string>(), deferred<string>()];
    let call = 0;
    const load = (): Promise<string> => (answers[call++] as { promise: Promise<string> }).promise;
    const { result } = renderHook(() => useLoader(load));
    await act(async () => {
      answers[0]?.resolve('first');
    });

    act(() => {
      result.current.refresh();
    });
    await act(async () => {
      answers[1]?.reject(new Error('offline'));
    });

    expect(result.current.state).toEqual({ status: 'ready', data: 'first' });
  });
});

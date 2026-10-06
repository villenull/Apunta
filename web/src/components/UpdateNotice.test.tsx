import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { status, stubUpdateFetch } from '../test/updateFetch.js';
import { UpdateNotice } from './UpdateNotice.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('UpdateNotice', () => {
  it('renders nothing where there is no updater (404) and stops asking', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = stubUpdateFetch({ status: null });
    const { container } = render(<UpdateNotice />);
    await waitFor(() => {
      expect(api.calls).toContain('GET /api/app/update');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(container.innerHTML).toBe('');
    expect(api.calls.filter((c) => c === 'GET /api/app/update')).toHaveLength(1);
  });

  it.each([
    [{ state: 'idle' as const }],
    [{ state: 'checking' as const }],
    [{ state: 'idle' as const, code: 'offline' as const }],
    [{ state: 'idle' as const, code: 'close_refused' as const }],
  ])('says nothing for %j', async (over) => {
    const api = stubUpdateFetch({ status: status(over) });
    const { container } = render(<UpdateNotice />);
    await waitFor(() => {
      expect(api.calls).toContain('GET /api/app/update');
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.innerHTML).toBe('');
  });

  it('shows progress while downloading, with no buttons', async () => {
    stubUpdateFetch({ status: status({ state: 'downloading', version: '2.0.0' }) });
    render(<UpdateNotice />);
    await screen.findByTestId('update-notice');
    expect(screen.queryByTestId('update-download')).toBeNull();
    expect(screen.queryByTestId('update-install')).toBeNull();
  });

  it.each(['quiescing', 'snapshotting', 'installing', 'relaunching', 'health_check'] as const)(
    'prevents install and dismissal while %s',
    async (state) => {
      stubUpdateFetch({ status: status({ state, version: '2.0.0' }) });
      render(<UpdateNotice />);
      await screen.findByTestId('update-notice');
      expect(screen.queryByTestId('update-install')).toBeNull();
      expect(screen.queryByTestId('update-dismiss')).toBeNull();
    },
  );

  it('says what to finish first when the quiesce was refused, and keeps install available', async () => {
    stubUpdateFetch({ status: status({ state: 'verified', version: '2.0.0', code: 'quiesce_refused' }) });
    render(<UpdateNotice />);
    await screen.findByTestId('update-notice');
    expect(screen.getByTestId('update-install')).not.toBeNull();
  });

  it('reports a finished update, which can be dismissed', async () => {
    stubUpdateFetch({ status: status({ state: 'done', version: '2.0.0' }) });
    render(<UpdateNotice />);
    await screen.findByTestId('update-notice');
    fireEvent.click(screen.getByTestId('update-dismiss'));
    expect(screen.queryByTestId('update-notice')).toBeNull();
  });

  it('shows the server’s refusal when an action is rejected', async () => {
    const api = stubUpdateFetch({ status: status({ state: 'available', version: '2.0.0' }) });
    render(<UpdateNotice />);
    await screen.findByTestId('update-download');
    api.failNext = 'Not in a state to do that.';
    fireEvent.click(screen.getByTestId('update-download'));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Not in a state to do that.');
  });

  it('follows the shell’s state as it moves', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = stubUpdateFetch({ status: status({ state: 'available', version: '2.0.0' }) });
    render(<UpdateNotice />);
    await screen.findByTestId('update-download');
    api.status = status({ state: 'downloading', version: '2.0.0' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500);
    });
    await waitFor(() => {
      expect(screen.getByTestId('update-notice').getAttribute('data-state')).toBe('downloading');
    });
  });
});

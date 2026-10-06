import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { stubUpdateFetch } from '../test/updateFetch.js';
import { probeRecovery, recoveryLocale, RecoveryView } from './RecoveryView.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const STATUS = {
  phase: 'recovery' as const,
  fromVersion: '1.0.0',
  toVersion: '2.0.0',
  createdAt: '2026-10-06T10:00:00.000Z',
  previousAvailable: true,
};

describe('RecoveryView', () => {
  it('restores the safety copy only after a second confirmation', async () => {
    const api = stubUpdateFetch();
    render(<RecoveryView status={STATUS} locale="en" />);
    fireEvent.click(screen.getByTestId('recovery-restore'));
    expect(api.calls.filter((call) => call.startsWith('POST'))).toEqual([]);
    fireEvent.click(screen.getByTestId('recovery-restore-cancel'));
    expect(api.calls.filter((call) => call.startsWith('POST'))).toEqual([]);
    fireEvent.click(screen.getByTestId('recovery-restore'));
    fireEvent.click(screen.getByTestId('recovery-restore-confirm'));
    await screen.findByTestId('recovery-restored');
    expect(api.calls.filter((call) => call.startsWith('POST'))).toEqual(['POST /api/app/recovery/restore']);
  });

  it('reinstalls the previous version', async () => {
    const api = stubUpdateFetch();
    render(<RecoveryView status={STATUS} locale="en" />);
    fireEvent.click(screen.getByTestId('recovery-reinstall'));
    expect(api.calls.filter((call) => call.startsWith('POST'))).toEqual([]);
    fireEvent.click(screen.getByTestId('recovery-reinstall-confirm'));
    await screen.findByTestId('recovery-reinstalling');
    expect(api.calls.filter((call) => call.startsWith('POST'))).toEqual([
      'POST /api/app/recovery/reinstall-previous',
    ]);
  });

  it('disables reinstall when the previous image is not there', () => {
    render(<RecoveryView status={{ ...STATUS, previousAvailable: false }} locale="en" />);
    const button = screen.getByTestId('recovery-reinstall') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('reports a refused action and stays usable', async () => {
    const api = stubUpdateFetch();
    api.failNext = 'No safety copy.';
    render(<RecoveryView status={STATUS} locale="en" />);
    fireEvent.click(screen.getByTestId('recovery-restore'));
    fireEvent.click(screen.getByTestId('recovery-restore-confirm'));
    await screen.findByTestId('recovery-failure');
    expect((screen.getByTestId('recovery-restore') as HTMLButtonElement).disabled).toBe(false);
  });

  it('speaks Spanish when the browser does, and still renders without details', () => {
    expect(recoveryLocale(['es-MX', 'en'])).toBe('es-MX');
    expect(recoveryLocale(['en-US'])).toBe('en');
    render(<RecoveryView status={null} locale="es-MX" />);
    expect(screen.queryByTestId('recovery-details')).toBeNull();
  });
});

describe('probeRecovery', () => {
  it('is null on a normal server (404)', async () => {
    stubUpdateFetch({ recovery: null });
    expect(await probeRecovery()).toBeNull();
  });

  it('fails closed on an answer it cannot read', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        new Response('{"nope":1}', { status: 200, headers: { 'content-type': 'application/json' } }),
      ),
    );
    await waitFor(async () => {
      expect(await probeRecovery()).toEqual({ status: null });
    });
  });
});

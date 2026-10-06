import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { status, stubUpdateFetch } from '../test/updateFetch.js';
import { UpdateSettings } from './UpdateSettings.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('UpdateSettings', () => {
  it('renders nothing in a browser tab (404)', async () => {
    const api = stubUpdateFetch({ status: null });
    const { container } = render(<UpdateSettings />);
    await waitFor(() => {
      expect(api.calls).toContain('GET /api/app/update');
    });
    await Promise.resolve();
    expect(container.innerHTML).toBe('');
  });

  it('puts the switch back when the save is refused', async () => {
    const api = stubUpdateFetch({ status: status() });
    render(<UpdateSettings />);
    const toggle = (await screen.findByTestId('update-autocheck')) as HTMLInputElement;
    api.failNext = 'Nope.';
    fireEvent.click(toggle);
    await screen.findByRole('alert');
    expect((screen.getByTestId('update-autocheck') as HTMLInputElement).checked).toBe(true);
  });
});

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AiBanner } from './AiBanner.js';
import { installFakeApi } from '../test/fakeApi.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AiBanner', () => {
  it('stays out of the way when the local AI is there', async () => {
    installFakeApi();
    render(<AiBanner />);
    await waitFor(() => {
      expect(screen.queryByTestId('ai-banner')).toBeNull();
    });
  });

  it('says the local AI is unreachable, in the packet’s words', async () => {
    installFakeApi({}, { health: { ollama: { reachable: false, model: null, modelPresent: false } } });
    render(<AiBanner />);
    expect(await screen.findByTestId('ai-banner')).toHaveProperty(
      'textContent',
      expect.stringContaining("Apunta can't reach the local AI — see Setup"),
    );
  });

  /** Reachable but not pulled is a different problem with a different fix. */
  it('distinguishes a missing model from a missing runtime', async () => {
    installFakeApi(
      {},
      { health: { ollama: { reachable: true, model: 'gemma4:12b-it-qat', modelPresent: false } } },
    );
    render(<AiBanner />);
    const banner = await screen.findByTestId('ai-banner');
    expect(banner.textContent).toContain("can't find the AI model");
    expect(banner.textContent).toContain('gemma4:12b-it-qat');
  });

  it('says the rest of the app still works', async () => {
    installFakeApi({}, { health: { ollama: { reachable: false, model: null, modelPresent: false } } });
    render(<AiBanner />);
    expect((await screen.findByTestId('ai-banner')).textContent).toContain(
      'Everything except drafting a new note still works',
    );
  });

  it('can be dismissed', async () => {
    installFakeApi({}, { health: { ollama: { reachable: false, model: null, modelPresent: false } } });
    render(<AiBanner />);

    fireEvent.click(await screen.findByLabelText('Dismiss'));
    expect(screen.queryByTestId('ai-banner')).toBeNull();
  });
});

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AiBanner } from './AiBanner.js';
import { installFakeApi } from '../test/fakeApi.js';

/** The banner links to `/setup`, so it needs a router around it. */
function renderBanner(): void {
  render(
    <MemoryRouter>
      <AiBanner />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AiBanner', () => {
  it('stays out of the way when the local AI is there', async () => {
    installFakeApi();
    renderBanner();
    await waitFor(() => {
      expect(screen.queryByTestId('ai-banner')).toBeNull();
    });
  });

  it('says the local AI is unreachable, in the packet’s words', async () => {
    installFakeApi({}, { health: { ollama: { reachable: false, model: null, modelPresent: false } } });
    renderBanner();
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
    renderBanner();
    const banner = await screen.findByTestId('ai-banner');
    expect(banner.textContent).toContain("can't find the AI model");
    expect(banner.textContent).toContain('gemma4:12b-it-qat');
  });

  it('says the rest of the app still works', async () => {
    installFakeApi({}, { health: { ollama: { reachable: false, model: null, modelPresent: false } } });
    renderBanner();
    expect((await screen.findByTestId('ai-banner')).textContent).toContain(
      'Everything except drafting a new note still works',
    );
  });

  it('points at the setup screen rather than at nothing', async () => {
    installFakeApi({}, { health: { ollama: { reachable: false, model: null, modelPresent: false } } });
    renderBanner();

    // M3 shipped the words "see Setup" with nowhere to go; M7 built the screen.
    expect(await screen.findByTestId('ai-banner-setup')).toHaveProperty('pathname', '/setup');
  });

  it('can be dismissed', async () => {
    installFakeApi({}, { health: { ollama: { reachable: false, model: null, modelPresent: false } } });
    renderBanner();

    fireEvent.click(await screen.findByLabelText('Dismiss'));
    expect(screen.queryByTestId('ai-banner')).toBeNull();
  });
});

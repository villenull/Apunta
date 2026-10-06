import { t } from '@apunta/shared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AiBanner } from './AiBanner.js';
import { installFakeApi } from '../test/fakeApi.js';

/** The banner is plain text and one button, so it needs no router. */
function renderBanner(): void {
  render(<AiBanner />);
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
      expect.stringContaining("Apunta can't reach the local AI"),
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

  /**
   * S2.4: the banner's one sentence is split by the retry button, which the
   * screen needs, so it is keyed at the element boundary rather than merged.
   * This pins each piece to its own key's English, and the stored model name to
   * a parameter.
   */
  it('builds its sentence from the catalogue, with the model as a parameter', async () => {
    installFakeApi(
      {},
      { health: { ollama: { reachable: true, model: 'gemma4:12b-it-qat', modelPresent: false } } },
    );
    renderBanner();

    const banner = await screen.findByTestId('ai-banner');
    expect(banner.textContent).toContain(t('ai.modelMissing', { model: ' (gemma4:12b-it-qat)' }));
    expect(banner.textContent).toContain(t('ai.bannerTail'));
    expect(banner.textContent).toContain(t('common.checkAgain'));
    expect(t('ai.modelMissing', { model: '' }, 'en')).toBe("Apunta can't find the AI model.");
  });

  it('can be dismissed', async () => {
    installFakeApi({}, { health: { ollama: { reachable: false, model: null, modelPresent: false } } });
    renderBanner();

    fireEvent.click(await screen.findByLabelText('Dismiss'));
    expect(screen.queryByTestId('ai-banner')).toBeNull();
  });
});

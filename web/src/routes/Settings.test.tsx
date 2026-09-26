import type { Settings } from '@apunta/shared';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../App.js';
import { installFakeApi, makeFormat, type FakeApi } from '../test/fakeApi.js';

/**
 * C-SETTINGS@1 at the controls: what the Appearance card and the Drafting model
 * group show, and what the page is painted, come from the one provider — not
 * from a copy each control keeps for itself.
 *
 * These render the real `App`, not the `Settings` route alone, because the
 * painted page is painted by `web/src/App.tsx` from provider state. A stand-in
 * for that one effect would be a test of a second implementation, and the
 * rollback case here is exactly the case where the difference shows.
 *
 * No jest-dom matchers in this repo: attributes and text are read off the DOM.
 */

type TestRouter = Parameters<typeof RouterProvider>[0]['router'];
let activeRouter: TestRouter | null = null;

const format = makeFormat('Progress note', ['Subjective', 'Plan']);
const STORED: Settings = {
  theme: 'dark',
  font_size: 'default',
  animations: true,
  // The Drafting model card only appears when the server offers both profiles.
  llm_available_profiles: ['quick', 'thorough'],
  llm_effective_profile: 'quick',
  llm_profile: 'quick',
};

function renderApp(path = '/settings'): void {
  activeRouter = createMemoryRouter([{ path: '*', element: <App /> }], { initialEntries: [path] });
  render(<RouterProvider router={activeRouter} />);
}

type FetchFn = (path: string, init?: RequestInit) => Promise<Response>;

interface PendingPut {
  readonly body: Settings;
  readonly resolve: (response: Response) => void;
}

/** Hold every `PUT /api/settings` open, so a test decides when it answers. */
function holdSettingsPuts(api: FakeApi): { readonly sent: Settings[]; readonly settle: PutSettle } {
  const inner = globalThis.fetch as unknown as FetchFn;
  const queue: PendingPut[] = [];
  const sent: Settings[] = [];
  vi.stubGlobal('fetch', (path: string, init: RequestInit = {}): Promise<Response> => {
    if (path === '/api/settings' && init.method === 'PUT') {
      const body = JSON.parse(String(init.body)) as Settings;
      sent.push(body);
      return new Promise<Response>((resolve) => {
        queue.push({ body, resolve });
      });
    }
    return inner(path, init);
  });
  return {
    sent,
    settle: (index, outcome) => {
      const put = queue[index];
      if (put === undefined) throw new Error(`no PUT /api/settings at ${String(index)}`);
      if (outcome.ok === true) {
        // The write lands in the store the way the server's merge would, and
        // the record it answers with is the merged one.
        api.state.settings = { ...api.state.settings, ...put.body };
        put.resolve(
          new Response(JSON.stringify(api.state.settings), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
        return;
      }
      put.resolve(
        new Response(JSON.stringify({ error: 'internal_error', message: outcome.message }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        }),
      );
    },
  };
}

type PutSettle = (index: number, outcome: { ok: true } | { ok: false; message: string }) => void;

/** The page's own colours, which App paints from the provider. */
function paintedTheme(): string | undefined {
  return document.documentElement.dataset.theme;
}

/**
 * Let a settled request run all the way: `fetch`, then reading the body, then
 * the provider's own `.then` handlers and the effect that repaints.
 */
async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });
}

afterEach(() => {
  activeRouter?.dispose();
  activeRouter = null;
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.documentElement.dataset.theme = 'dark';
  document.documentElement.style.colorScheme = '';
  document.documentElement.style.removeProperty('--accent');
  document.documentElement.style.removeProperty('--accent-hover');
  document.documentElement.style.removeProperty('--accent-tint');
  document.documentElement.classList.remove('no-motion');
});

describe('settings appearance controls', () => {
  it('shows and paints the chosen theme before the save settles', async () => {
    const api = installFakeApi({ formats: [format], settings: { ...STORED } });
    const puts = holdSettingsPuts(api);
    renderApp();
    const light = await screen.findByTestId('theme-light');
    const dark = screen.getByTestId('theme-dark');
    await waitFor(() => {
      expect(dark.getAttribute('aria-checked')).toBe('true');
    });
    expect(paintedTheme()).toBe('dark');

    fireEvent.click(light);

    // Nothing has come back from the server yet, and the segment is already
    // Light with the page painted light: both read the provider.
    expect(puts.sent).toEqual([{ theme: 'light' }]);
    expect(light.getAttribute('aria-checked')).toBe('true');
    expect(paintedTheme()).toBe('light');
    expect(screen.queryByTestId('appearance-saved')).toBeNull();

    puts.settle(0, { ok: true });
    await flush();
    await waitFor(() => {
      expect(screen.getByTestId('appearance-saved').textContent).toBe('Saved');
    });
    expect(api.state.settings['theme']).toBe('light');
  });

  it('returns to Dark, repaints dark and shows the error when the save fails', async () => {
    const api = installFakeApi({ formats: [format], settings: { ...STORED } });
    const puts = holdSettingsPuts(api);
    renderApp();
    const light = await screen.findByTestId('theme-light');
    const dark = screen.getByTestId('theme-dark');
    await waitFor(() => {
      expect(dark.getAttribute('aria-checked')).toBe('true');
    });

    fireEvent.click(light);
    expect(paintedTheme()).toBe('light');

    puts.settle(0, { ok: false, message: 'The Apunta server could not save that setting.' });
    await flush();
    // The control's error block is the barrier: it is set in the same commit as
    // the provider's rollback, so once it is on the page the page has been
    // repainted from the restored value.
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe('The Apunta server could not save that setting.');
    });

    // Nothing claims Light: the segment, the page and the saved record all say
    // Dark.
    expect(dark.getAttribute('aria-checked')).toBe('true');
    expect(light.getAttribute('aria-checked')).toBe('false');
    expect(paintedTheme()).toBe('dark');
    expect(screen.queryByTestId('appearance-saved')).toBeNull();
    expect(api.state.settings['theme']).toBe('dark');
  });
});

describe('the drafting model radio group', () => {
  it('moves and selects with the arrow keys, and tabs into the selected option', async () => {
    const api = installFakeApi({ formats: [format], settings: { ...STORED } });
    renderApp();
    const quick = await screen.findByTestId('llm-profile-quick');
    const thorough = screen.getByTestId('llm-profile-thorough');

    // One tab stop, on the selected option: Tab enters the group where the
    // choice already is.
    expect(quick.getAttribute('aria-checked')).toBe('true');
    expect(quick.getAttribute('tabindex')).toBe('0');
    expect(thorough.getAttribute('tabindex')).toBe('-1');

    quick.focus();
    fireEvent.keyDown(quick, { key: 'ArrowRight' });
    expect(thorough.getAttribute('aria-checked')).toBe('true');
    expect(quick.getAttribute('aria-checked')).toBe('false');
    expect(thorough.getAttribute('tabindex')).toBe('0');
    expect(quick.getAttribute('tabindex')).toBe('-1');
    await waitFor(() => {
      expect(api.state.settings['llm_profile']).toBe('thorough');
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(thorough);
    });

    fireEvent.keyDown(thorough, { key: 'ArrowLeft' });
    expect(quick.getAttribute('aria-checked')).toBe('true');
    expect(thorough.getAttribute('aria-checked')).toBe('false');
    expect(quick.getAttribute('tabindex')).toBe('0');
    await waitFor(() => {
      expect(api.state.settings['llm_profile']).toBe('quick');
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(quick);
    });
  });
});

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ACCENT_COLOR_SETTING, t, type Settings } from '@apunta/shared';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../App.js';
import { beginWork } from '../lib/i18n.js';
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
  document.documentElement.lang = 'en';
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

/**
 * C-SETTINGS@1's radio bullet on the theme group: arrow keys move **and**
 * select inside it, and Tab enters at the selected option.
 *
 * The behaviour is shipped, so these cases are expected to pass unchanged —
 * that is the point. A pass here is the evidence the group is still native-
 * radio shaped; a failure means the control has regressed, and the fix is in
 * `Settings.tsx`, not in what is asserted here.
 */
describe('the theme radio group', () => {
  it('is one tab stop, on the selected option', async () => {
    installFakeApi({ formats: [format], settings: { ...STORED } });
    renderApp();
    const group = await screen.findByRole('radiogroup', { name: 'Theme' });
    const system = screen.getByTestId('theme-system');
    const light = screen.getByTestId('theme-light');
    const dark = screen.getByTestId('theme-dark');

    // Three `role="radio"` buttons under the row's own label, not three
    // `<input type="radio">`: the role is what satisfies the contract bullet,
    // and P1.1 forbids the markup change.
    expect(within(group).getAllByRole('radio')).toHaveLength(3);
    expect(system.getAttribute('aria-label')).toBe('System');
    expect(light.getAttribute('aria-label')).toBe('Light');
    expect(dark.getAttribute('aria-label')).toBe('Dark');

    // The stored fixture is Dark, so Dark is the tab stop and the other two are
    // unreachable by Tab alone.
    expect(dark.getAttribute('aria-checked')).toBe('true');
    expect(dark.getAttribute('tabindex')).toBe('0');
    expect(system.getAttribute('aria-checked')).toBe('false');
    expect(system.getAttribute('tabindex')).toBe('-1');
    expect(light.getAttribute('aria-checked')).toBe('false');
    expect(light.getAttribute('tabindex')).toBe('-1');
    expect(paintedTheme()).toBe('dark');
  });

  it('wraps ArrowRight from Dark to System, painting the resolved theme', async () => {
    const api = installFakeApi({ formats: [format], settings: { ...STORED } });
    const puts = holdSettingsPuts(api);
    renderApp();
    const system = await screen.findByTestId('theme-system');
    const dark = screen.getByTestId('theme-dark');
    await waitFor(() => {
      expect(dark.getAttribute('aria-checked')).toBe('true');
    });

    dark.focus();
    // `THEMES` is `system, light, dark`, so "next" after Dark wraps round to
    // System. Reading the constant is the whole test: an implementation that
    // went back to Light here would be asserting a different control.
    fireEvent.keyDown(dark, { key: 'ArrowRight' });

    // Selection is immediate, not deferred to Enter or Space: the save is on
    // its way and the control has already moved before it settles.
    expect(puts.sent).toEqual([{ theme: 'system' }]);
    expect(system.getAttribute('aria-checked')).toBe('true');
    expect(system.getAttribute('tabindex')).toBe('0');
    expect(dark.getAttribute('aria-checked')).toBe('false');
    expect(dark.getAttribute('tabindex')).toBe('-1');

    // `data-theme` is always the resolved theme. jsdom does not ask for dark,
    // so System paints light — never the literal `system`.
    expect(paintedTheme()).toBe('light');
    expect(paintedTheme()).not.toBe('system');

    // Focus follows the selection, one frame later.
    await waitFor(() => {
      expect(document.activeElement).toBe(system);
    });

    puts.settle(0, { ok: true });
    await flush();
    // The server was told `system` — the choice, not the paint.
    expect(api.state.settings['theme']).toBe('system');
    expect(paintedTheme()).toBe('light');
  });

  it('moves ArrowLeft from Dark to Light', async () => {
    const api = installFakeApi({ formats: [format], settings: { ...STORED } });
    renderApp();
    const light = await screen.findByTestId('theme-light');
    const dark = screen.getByTestId('theme-dark');
    await waitFor(() => {
      expect(dark.getAttribute('aria-checked')).toBe('true');
    });

    dark.focus();
    fireEvent.keyDown(dark, { key: 'ArrowLeft' });

    expect(light.getAttribute('aria-checked')).toBe('true');
    expect(light.getAttribute('tabindex')).toBe('0');
    expect(dark.getAttribute('aria-checked')).toBe('false');
    expect(dark.getAttribute('tabindex')).toBe('-1');
    expect(paintedTheme()).toBe('light');
    await waitFor(() => {
      expect(api.state.settings['theme']).toBe('light');
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(light);
    });
  });

  it('jumps Home to System and End to Dark', async () => {
    const api = installFakeApi({ formats: [format], settings: { ...STORED } });
    renderApp();
    const system = await screen.findByTestId('theme-system');
    const dark = screen.getByTestId('theme-dark');
    await waitFor(() => {
      expect(dark.getAttribute('aria-checked')).toBe('true');
    });

    dark.focus();
    fireEvent.keyDown(dark, { key: 'Home' });

    expect(system.getAttribute('aria-checked')).toBe('true');
    expect(system.getAttribute('tabindex')).toBe('0');
    expect(dark.getAttribute('tabindex')).toBe('-1');
    expect(paintedTheme()).toBe('light');
    await waitFor(() => {
      expect(api.state.settings['theme']).toBe('system');
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(system);
    });

    // `End` is the last of `THEMES`, which is Dark — not Light.
    fireEvent.keyDown(system, { key: 'End' });

    expect(dark.getAttribute('aria-checked')).toBe('true');
    expect(dark.getAttribute('tabindex')).toBe('0');
    expect(system.getAttribute('aria-checked')).toBe('false');
    expect(system.getAttribute('tabindex')).toBe('-1');
    expect(paintedTheme()).toBe('dark');
    await waitFor(() => {
      expect(api.state.settings['theme']).toBe('dark');
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(dark);
    });
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

  /**
   * S2.4: the five section names, the four text sizes and the three themes were
   * three module-level records of English in this file. The stored value is data
   * and is never translated, so each is a key of its own, and the theme
   * segments' own `aria-label` and `title` are that same key.
   */
  it('names its sections, sizes and themes from the catalogue, by the stored value', async () => {
    installFakeApi({ formats: [format], settings: { ...STORED } });
    renderApp();

    expect((await screen.findByTestId('format-list')).textContent).toContain(t('settings.formats'));
    expect(screen.getByTestId('settings-advanced').textContent).toContain(t('settings.advanced'));
    expect(screen.getByTestId('appearance-settings').textContent).toContain(t('settings.appearance'));
    expect(screen.getByTestId('llm-profile-settings').textContent).toContain(t('settings.draftingModel'));

    for (const theme of ['system', 'light', 'dark'] as const) {
      const key =
        theme === 'system'
          ? 'settings.themeSystem'
          : theme === 'light'
            ? 'settings.themeLight'
            : 'settings.themeDark';
      const button = screen.getByTestId(`theme-${theme}`);
      expect(button.getAttribute('aria-label')).toBe(t(key));
      expect(button.getAttribute('title')).toBe(t(key));
    }
    for (const size of ['small', 'default', 'large', 'extra-large'] as const) {
      const key =
        size === 'small'
          ? 'settings.sizeSmall'
          : size === 'default'
            ? 'settings.sizeDefault'
            : size === 'large'
              ? 'settings.sizeLarge'
              : 'settings.sizeExtraLarge';
      expect(screen.getByTestId(`font-size-${size}`).textContent).toBe(t(key));
    }
    expect(t('settings.themeDark', {}, 'en')).toBe('Dark');
    expect(t('settings.themeDark', {}, 'es-MX')).toBe('Oscuro');
  });
});

/**
 * AM-053: the accent picker's low-contrast note. Under 3:1 against the page
 * surface in either theme — `#f5f4ed` and `#faf9f5` light, `#111111` and
 * `#151515` dark (AM-054 added the light sidebar) — it
 * appears; it never stops the colour being kept; and it clears once the colour
 * is raised. The token sheet is read off disk the way `BrandMark.test.tsx`
 * reads it, so the four surfaces the check uses cannot drift from the page.
 */
describe('the accent low-contrast note', () => {
  const TOKENS = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../styles/tokens.css'),
    'utf8',
  );

  /** Every value `name` is given in the token sheet, in source order: light, then dark. */
  function tokenValues(name: string): string[] {
    return [...TOKENS.matchAll(new RegExp(`^[ \\t]*${name}:[ \\t]*([^;]+);`, 'gm'))].map((match) =>
      (match[1] ?? '').trim(),
    );
  }

  /**
   * Colours chosen to sit either side of the line, with the three that tell the
   * real surfaces apart from white and black. Ratios from WCAG's formula.
   */
  const CLEAR = '#218677'; // the default: 4.20 light, 4.12 and 4.26 dark
  const PALE = '#939393'; // 3.07 on white, 2.92 on #faf9f5
  const DIM = '#5d5d5d'; // 3.19 on black, 2.77 on #151515, 2.87 on #111111
  const EDGE = '#606060'; // 2.90 on #151515 but 3.00 on #111111
  const SIDEBAR = '#8f8f8f'; // 3.07 on #faf9f5 but 2.93 on the light sidebar #f5f4ed

  it('reads the same four surfaces the page is painted with', () => {
    expect(tokenValues('--sidebar-bg')).toEqual(['#f5f4ed', '#111111']);
    expect(tokenValues('--app-bg')).toEqual(['#faf9f5', '#151515']);
  });

  it('names the logo in both languages', () => {
    expect(t('settings.accentLowContrast', {}, 'en')).toContain('logo');
    expect(t('settings.accentLowContrast', {}, 'es-MX')).toContain('logotipo');
  });

  for (const theme of ['light', 'dark'] as const) {
    it(`warns under 3:1 on the real surfaces, keeps the colour, and clears when raised (${theme})`, async () => {
      const api = installFakeApi({
        formats: [format],
        settings: { ...STORED, theme, [ACCENT_COLOR_SETTING]: CLEAR },
      });
      renderApp();
      const picker = (await screen.findByLabelText(t('settings.colour'))) as HTMLInputElement;
      await waitFor(() => {
        expect(picker.value).toBe(CLEAR);
      });
      expect(paintedTheme()).toBe(theme);
      expect(screen.queryByTestId('accent-low-contrast')).toBeNull();

      for (const low of [PALE, DIM, EDGE, SIDEBAR]) {
        fireEvent.change(picker, { target: { value: low } });
        const note = screen.getByTestId('accent-low-contrast');
        expect(note.textContent).toBe(t('settings.accentLowContrast'));
        expect(picker.getAttribute('aria-describedby')).toBe(note.id);
        // Inside the colour row, so the Theme row is still its next sibling and
        // `.settings-row + .settings-row` still draws the divider between them.
        const row = picker.closest('.settings-row');
        expect(note.parentElement).toBe(row);
        expect(row?.nextElementSibling?.classList.contains('settings-row')).toBe(true);
        // Warn, not refuse: the pick is shown, painted and saved.
        expect(picker.value).toBe(low);
        expect(document.documentElement.style.getPropertyValue('--accent')).toBe(low);
        await waitFor(() => {
          expect(api.state.settings[ACCENT_COLOR_SETTING]).toBe(low);
        });
      }

      fireEvent.change(picker, { target: { value: CLEAR } });
      expect(screen.queryByTestId('accent-low-contrast')).toBeNull();
      expect(picker.getAttribute('aria-describedby')).toBeNull();
      await waitFor(() => {
        expect(api.state.settings[ACCENT_COLOR_SETTING]).toBe(CLEAR);
      });
    });
  }
});

/**
 * Language / Idioma (C-LANG@1 rules 1 and 6, C-SETTINGS@1): hidden unless the
 * build offers Spanish, applied without a reload, disabled with its reason
 * while work is in flight, and put back when the server refuses the change.
 */
describe('the Language row', () => {
  const OFFERED: Settings = { ...STORED, spanish_available: true, language: 'en' };

  it('is not there on a build that does not offer Spanish', async () => {
    installFakeApi({ formats: [format], settings: { ...STORED, spanish_available: false } });
    renderApp();
    await screen.findByTestId('appearance-settings');
    expect(screen.queryByTestId('language-settings')).toBeNull();
    expect(screen.queryByText(t('settings.language'))).toBeNull();
  });

  it('sits first, and switches the page and <html lang> at once, without a reload', async () => {
    const api = installFakeApi({ formats: [format], settings: { ...OFFERED } });
    const puts = holdSettingsPuts(api);
    renderApp();
    const row = await screen.findByTestId('language-settings');
    // First in the settings body: nothing is above it for a Spanish speaker to
    // read past.
    expect(row.parentElement?.firstElementChild).toBe(row);
    const group = within(row).getByRole('radiogroup', { name: 'Language / Idioma' });
    const english = within(group).getByTestId('language-en');
    const spanish = within(group).getByTestId('language-es-MX');
    expect(english.textContent).toBe('English');
    expect(english.getAttribute('lang')).toBe('en');
    expect(spanish.textContent).toBe('Español');
    expect(spanish.getAttribute('lang')).toBe('es-MX');
    await waitFor(() => {
      expect(english.getAttribute('aria-checked')).toBe('true');
    });
    expect(document.documentElement.lang).toBe('en');
    expect(screen.getByTestId('appearance-settings').textContent).toContain(
      t('settings.appearance', {}, 'en'),
    );

    fireEvent.click(spanish);

    // Before the server has answered: the provider's value, the control, the
    // page's words and the document's language all say Spanish.
    expect(puts.sent).toEqual([{ language: 'es-MX' }]);
    expect(spanish.getAttribute('aria-checked')).toBe('true');
    expect(document.documentElement.lang).toBe('es-MX');
    expect(screen.getByTestId('appearance-settings').textContent).toContain(
      t('settings.appearance', {}, 'es-MX'),
    );
    // The row's own label does not change: it is the same in both catalogues.
    expect(within(row).getByRole('radiogroup', { name: 'Language / Idioma' })).toBe(group);

    puts.settle(0, { ok: true });
    await flush();
    expect(api.state.settings['language']).toBe('es-MX');
    expect(document.documentElement.lang).toBe('es-MX');
  });

  it('is disabled with its reason while work is in flight, and comes back when it ends', async () => {
    const api = installFakeApi({ formats: [format], settings: { ...OFFERED } });
    renderApp();
    const spanish = await screen.findByTestId('language-es-MX');
    const english = screen.getByTestId('language-en');
    expect(screen.queryByTestId('language-busy')).toBeNull();

    let release = (): void => undefined;
    act(() => {
      release = beginWork();
    });
    // Released in `finally`: the count is module state, and a failure here must
    // not leave every later case looking at work that never ends.
    try {
      expect((spanish as HTMLButtonElement).disabled).toBe(true);
      expect((english as HTMLButtonElement).disabled).toBe(true);
      const reason = screen.getByTestId('language-busy');
      expect(reason.textContent).toBe(t('settings.languageChangeBlocked', {}, 'en'));
      expect(
        screen.getByRole('radiogroup', { name: 'Language / Idioma' }).getAttribute('aria-describedby'),
      ).toBe(reason.id);

      // A click on a disabled option asks the server nothing.
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      fireEvent.click(spanish);
      expect(fetchSpy.mock.calls.filter(([, init]) => init?.method === 'PUT')).toEqual([]);
      expect(api.state.settings['language']).toBe('en');
    } finally {
      act(() => {
        release();
      });
    }
    expect((spanish as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByTestId('language-busy')).toBeNull();
  });

  it('puts English back, in the page and in <html lang>, when the server refuses with a 409', async () => {
    const api = installFakeApi({ formats: [format], settings: { ...OFFERED } });
    const inner = globalThis.fetch as unknown as FetchFn;
    const refusal = t('settings.languageChangeBlocked', {}, 'en');
    vi.stubGlobal('fetch', (path: string, init: RequestInit = {}): Promise<Response> => {
      if (path === '/api/settings' && init.method === 'PUT') {
        return Promise.resolve(
          new Response(JSON.stringify({ error: 'language_change_blocked', message: refusal }), {
            status: 409,
            headers: { 'content-type': 'application/json' },
          }),
        );
      }
      return inner(path, init);
    });
    renderApp();
    const spanish = await screen.findByTestId('language-es-MX');
    const english = screen.getByTestId('language-en');
    await waitFor(() => {
      expect(english.getAttribute('aria-checked')).toBe('true');
    });

    fireEvent.click(spanish);
    await flush();
    await waitFor(() => {
      expect(screen.getByTestId('language-error').textContent).toBe(refusal);
    });
    expect(english.getAttribute('aria-checked')).toBe('true');
    expect(spanish.getAttribute('aria-checked')).toBe('false');
    expect(document.documentElement.lang).toBe('en');
    expect(screen.getByTestId('appearance-settings').textContent).toContain(
      t('settings.appearance', {}, 'en'),
    );
    expect(api.state.settings['language']).toBe('en');
  });
});

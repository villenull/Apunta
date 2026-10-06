import { t, type Settings } from '@apunta/shared';
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

function renderApp(): void {
  activeRouter = createMemoryRouter([{ path: '*', element: <App /> }], { initialEntries: ['/'] });
  render(<RouterProvider router={activeRouter} />);
}

/**
 * Settings is a modal over the workspace (owner, 2026-10-05) — there is no
 * `/settings` page any more — so the cases below open it the way a person
 * does: More → Settings, on the section they mean (Appearance, the first).
 */
async function openSettings(): Promise<void> {
  renderApp();
  fireEvent.click(await screen.findByTestId('mission-control'));
  fireEvent.click(await screen.findByTestId('mission-settings'));
  await screen.findByTestId('appearance-settings');
}

type FetchFn = (path: string, init?: RequestInit) => Promise<Response>;

/** A JSON response for the stubs below, in the shape the client parses. */
function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

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
    await openSettings();
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
    await openSettings();
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
    await openSettings();
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
    await openSettings();
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
    await openSettings();
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
    await openSettings();
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
    await openSettings();
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
    await openSettings();

    const modal = await screen.findByTestId('settings-modal');
    expect(screen.getByTestId('appearance-settings').textContent).toContain(t('settings.appearance'));
    expect(screen.getByTestId('llm-profile-settings').textContent).toContain(t('settings.draftingModel'));

    fireEvent.click(within(modal).getByTestId('settings-tab-format'));
    expect((await screen.findByTestId('format-list')).textContent).toContain(t('settings.formats'));

    fireEvent.click(within(modal).getByTestId('settings-tab-about'));
    expect(await screen.findByTestId('settings-about')).not.toBeNull();

    // The theme and size controls live on the Appearance section, which the
    // modal shows one at a time, so go back to it before reading them.
    fireEvent.click(within(modal).getByTestId('settings-tab-appearance'));
    await screen.findByTestId('appearance-settings');

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
 * The format editor is a sub-view of the Format pane, so the back control
 * belongs to it and not to the pane (owner, 2026-10-05). Switching section
 * from the nav leaves the sub-view: the control would otherwise sit in the
 * bar of a section that has no editor to go back from.
 */
describe('leaving the format editor', () => {
  it('drops the editor and its back control when another section is chosen', async () => {
    installFakeApi({ formats: [format], settings: { ...STORED } });
    await openSettings();

    const modal = await screen.findByTestId('settings-modal');
    fireEvent.click(within(modal).getByTestId('settings-tab-format'));
    const list = await screen.findByTestId('format-list');
    fireEvent.click(within(list).getByTestId('edit-format'));

    await screen.findByLabelText('Format name');
    expect(screen.queryByTestId('settings-pane-back')).not.toBeNull();

    fireEvent.click(within(modal).getByTestId('settings-tab-about'));
    await screen.findByTestId('settings-about');
    expect(screen.queryByTestId('settings-pane-back')).toBeNull();

    // Coming back lands on the list, not on the editor she left.
    fireEvent.click(within(modal).getByTestId('settings-tab-format'));
    expect((await screen.findByTestId('format-list')).textContent).toContain(t('settings.formats'));
    expect(screen.queryByTestId('settings-pane-back')).toBeNull();
  });
});

/**
 * Editing a format saves itself, so there is no Save button to press and the
 * only place the answer can be is the bar beside the back arrow (owner,
 * 2026-10-05). "Saved" has to mean the server has the format — not that she
 * typed — and it has to go away the moment the next edit starts, or it is
 * telling her about something that is no longer true.
 */
describe('the format editor’s own save status', () => {
  it('says Saved only once the format is on the server, and unsays it on the next edit', async () => {
    installFakeApi({ formats: [format], settings: { ...STORED } });
    await openSettings();

    const modal = await screen.findByTestId('settings-modal');
    fireEvent.click(within(modal).getByTestId('settings-tab-format'));
    const list = await screen.findByTestId('format-list');
    fireEvent.click(within(list).getByTestId('edit-format'));

    const name = await screen.findByLabelText('Format name');
    // Nothing to press, and nothing claimed: the format on the server is the
    // one she started from.
    expect(screen.queryByTestId('save-format')).toBeNull();
    expect(screen.queryByTestId('settings-format-saved')).toBeNull();

    fireEvent.change(name, { target: { value: 'Progress note v2' } });
    await screen.findByTestId('settings-format-saved', {}, { timeout: 3000 });

    fireEvent.change(name, { target: { value: 'Progress note v3' } });
    await waitFor(() => {
      expect(screen.queryByTestId('settings-format-saved')).toBeNull();
    });
  });
});

/**
 * `PATCH /api/formats/:id` failing is the one exit the pane has to refuse: a
 * save that was refused has not saved anything, so every way out of the editor
 * — the back arrow, the nav, the close button, and Escape on the dialog over
 * the top — has to ask the editor first and stay put when the answer is no
 * (owner, 2026-10-05). Unmounting instead would take the edit with it, and the
 * refusal is the one case where the editor's screen is the only copy she has.
 *
 * The refused write is stubbed per case for the same reason the delete case
 * stubs its own: `fakeApi` has no answer for it.
 */
describe('leaving the format editor when the server refuses the save', () => {
  /** Answer every format PATCH with the server's own failure shape. */
  function refuseFormatPatches(message: string): void {
    const inner = globalThis.fetch as unknown as FetchFn;
    globalThis.fetch = ((path: string, init?: RequestInit) => {
      if (path.startsWith('/api/formats/') && init?.method === 'PATCH') {
        return Promise.resolve(json({ error: 'internal_error', message }, 500));
      }
      return inner(path, init);
    }) as typeof fetch;
  }

  /** Settings open on the format editor, mid-edit, with saves refused. */
  async function openRefusedEditor(): Promise<HTMLElement> {
    installFakeApi({ formats: [format], settings: { ...STORED } });
    refuseFormatPatches('The format could not be saved.');
    await openSettings();
    const modal = await screen.findByTestId('settings-modal');
    fireEvent.click(within(modal).getByTestId('settings-tab-format'));
    fireEvent.click(within(await screen.findByTestId('format-list')).getByTestId('edit-format'));
    fireEvent.change(await screen.findByLabelText('Format name'), {
      target: { value: 'Progress note v2' },
    });
    return modal;
  }

  /** The refusal, once the editor has shown it. */
  async function expectRefusal(): Promise<void> {
    expect((await screen.findByTestId('format-error')).textContent).toContain(
      'The format could not be saved.',
    );
  }

  it('stays in the editor on the back arrow, with the refusal on screen', async () => {
    const modal = await openRefusedEditor();

    fireEvent.click(within(modal).getByTestId('settings-pane-back'));
    await expectRefusal();
    expect(screen.queryByTestId('format-list')).toBeNull();
    // Her edit is still there: the refusal cost her the exit, not the text.
    expect((screen.getByLabelText('Format name') as HTMLInputElement).value).toBe('Progress note v2');
  });

  it('stays in the editor when another section is chosen', async () => {
    const modal = await openRefusedEditor();

    fireEvent.click(within(modal).getByTestId('settings-tab-about'));
    await expectRefusal();
    expect(screen.queryByTestId('settings-about')).toBeNull();
    expect(screen.queryByTestId('format-list')).toBeNull();
  });

  it('stays open on the close button, and on Escape', async () => {
    const modal = await openRefusedEditor();

    fireEvent.click(within(modal).getByRole('button', { name: 'Close settings' }));
    await expectRefusal();
    expect(screen.queryByTestId('settings-modal')).not.toBeNull();

    // Escape on the dialog is a different path to the same unmount — the one
    // that used to go around the panel entirely.
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    await expectRefusal();
    expect(screen.queryByTestId('settings-modal')).not.toBeNull();
  });
});

/**
 * The other half of the same contract: when the write lands, the exit happens
 * and the list is re-read **after** it, so the row shows the name she last
 * typed rather than the one the panel was opened on.
 */
describe('leaving the format editor after a save lands', () => {
  it('reads the list again on the way out, showing the name she typed', async () => {
    const api = installFakeApi({ formats: [format], settings: { ...STORED } });
    await openSettings();

    const modal = await screen.findByTestId('settings-modal');
    fireEvent.click(within(modal).getByTestId('settings-tab-format'));
    fireEvent.click(within(await screen.findByTestId('format-list')).getByTestId('edit-format'));
    fireEvent.change(await screen.findByLabelText('Format name'), {
      target: { value: 'Progress note v2' },
    });

    // Straight out, inside the debounce: the pane waits for the write rather
    // than racing it.
    fireEvent.click(within(modal).getByTestId('settings-pane-back'));

    const list = await screen.findByTestId('format-list');
    await waitFor(() => {
      expect(list.textContent).toContain('Progress note v2');
    });
    expect(api.state.formats.map((item) => item.name)).toEqual(['Progress note v2']);
  });

  it('closes the modal once the write has landed', async () => {
    installFakeApi({ formats: [format], settings: { ...STORED } });
    await openSettings();

    const modal = await screen.findByTestId('settings-modal');
    fireEvent.click(within(modal).getByTestId('settings-tab-format'));
    fireEvent.click(within(await screen.findByTestId('format-list')).getByTestId('edit-format'));
    fireEvent.change(await screen.findByLabelText('Format name'), {
      target: { value: 'Progress note v2' },
    });

    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    await waitFor(() => {
      expect(screen.queryByTestId('settings-modal')).toBeNull();
    });
  });
});

/**
 * About (owner, 2026-10-05): the mark, the version, and the one link that
 * leaves the app. What is worth pinning is the destination and that the word
 * is the whole of the link — the layout around it is the smoke check's job.
 */
describe('the About section', () => {
  it('links only the word Github, and only to the repository', async () => {
    installFakeApi({ formats: [format], settings: { ...STORED } });
    await openSettings();

    const modal = await screen.findByTestId('settings-modal');
    fireEvent.click(within(modal).getByTestId('settings-tab-about'));
    const about = await screen.findByTestId('settings-about');

    const link = within(about).getByTestId('settings-about-github');
    expect(link.getAttribute('href')).toBe('https://github.com/villenull/Apunta');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    // The word is the link and not a sentence around it: the version and the
    // rest of the line stay text.
    expect(link.textContent).toBe('Github');
    expect(about.querySelectorAll('a')).toHaveLength(1);
  });

  it('shows no Updates controls in a browser tab, where the updater route is a 404', async () => {
    installFakeApi({ formats: [format], settings: { ...STORED } });
    await openSettings();

    const modal = await screen.findByTestId('settings-modal');
    fireEvent.click(within(modal).getByTestId('settings-tab-about'));
    await screen.findByTestId('settings-about');
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByTestId('update-settings')).toBeNull();
  });

  it('shows the Updates controls and the privacy statement when the shell reports an updater', async () => {
    installFakeApi({ formats: [format], settings: { ...STORED } });
    const inner = globalThis.fetch as unknown as FetchFn;
    vi.stubGlobal('fetch', (path: string, init?: RequestInit): Promise<Response> => {
      if (path === '/api/app/update') {
        return Promise.resolve(
          json({ state: 'idle', autoCheck: true, close: { state: 'none', blockers: [] } }),
        );
      }
      return inner(path, init);
    });
    await openSettings();

    const modal = await screen.findByTestId('settings-modal');
    fireEvent.click(within(modal).getByTestId('settings-tab-about'));
    const card = await screen.findByTestId('update-settings');
    expect((within(card).getByTestId('update-autocheck') as HTMLInputElement).checked).toBe(true);
    expect(within(card).getByTestId('update-privacy').textContent).toBe(t('update.privacy'));
  });
});

/**
 * Delete sits on the row, right of Edit, and goes through the server's own
 * delete (owner, 2026-10-05). Two things have to be true: a delete that lands
 * leaves the list shorter, and one the server refuses leaves the row exactly
 * where it was and says why — a row that vanishes without a word is the
 * outcome she could not recover from.
 *
 * The delete is stubbed per case rather than taught to `fakeApi`, because the
 * refusal is the half worth writing down and it is the only one the fake has
 * no answer for.
 */
describe('deleting a format from the list', () => {
  /**
   * Answer `DELETE /api/formats/:id` ourselves: either take the format out of
   * the fake's list and answer 204, or refuse with the message the real server
   * sends when notes still point at the format
   * (`server/src/routes/formats.ts:101`).
   */
  function stubFormatDelete(api: FakeApi, refusal: string | null): void {
    const inner = globalThis.fetch as unknown as FetchFn;
    globalThis.fetch = ((path: string, init?: RequestInit) => {
      if (path.startsWith('/api/formats/') && init?.method === 'DELETE') {
        if (refusal !== null) {
          return Promise.resolve(json({ error: 'conflict.format_in_use', message: refusal }, 409));
        }
        const id = path.slice('/api/formats/'.length);
        api.state.formats = api.state.formats.filter((item) => item.id !== id);
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      return inner(path, init);
    }) as typeof fetch;
  }

  it('drops the row when the delete lands', async () => {
    const api = installFakeApi({
      formats: [format, makeFormat('SOAP note', ['Subjective'])],
      settings: { ...STORED },
    });
    stubFormatDelete(api, null);
    await openSettings();

    const modal = await screen.findByTestId('settings-modal');
    fireEvent.click(within(modal).getByTestId('settings-tab-format'));
    const list = await screen.findByTestId('format-list');

    const row = within(list).getByText('SOAP note').closest('.settings-list-row') as HTMLElement;
    fireEvent.click(within(row).getByTestId('delete-format'));

    await waitFor(() => {
      expect(screen.queryByText('SOAP note')).toBeNull();
    });
    expect(api.state.formats.map((item) => item.name)).toEqual(['Progress note']);
    expect(await screen.findByTestId('format-deleted')).not.toBeNull();
  });

  it('keeps the row and says why when the server refuses', async () => {
    const api = installFakeApi({ formats: [format], settings: { ...STORED } });
    stubFormatDelete(api, 'Two notes still use this format.');
    await openSettings();

    const modal = await screen.findByTestId('settings-modal');
    fireEvent.click(within(modal).getByTestId('settings-tab-format'));
    const list = await screen.findByTestId('format-list');
    fireEvent.click(within(list).getByTestId('delete-format'));

    const error = await screen.findByTestId('format-delete-error');
    expect(error.textContent).toContain('Two notes still use this format.');
    expect(api.state.formats.map((item) => item.name)).toEqual(['Progress note']);
    expect(screen.queryByTestId('format-deleted')).toBeNull();
  });
});

/**
 * Language / Idioma lives in More → Language only (owner, 2026-09-28). The
 * Settings row is gone, and these are its cases moved onto the one control that
 * is left: applied without a reload, disabled with its reason while work is in
 * flight, and put back when the server refuses the change (C-LANG@1 rules 1
 * and 6, C-SETTINGS@1).
 */
describe('the Language dialog, the one place the language is chosen', () => {
  const OFFERED: Settings = { ...STORED, spanish_available: true, language: 'en' };

  async function openDialog(): Promise<HTMLElement> {
    renderApp();
    fireEvent.click(await screen.findByTestId('mission-control'));
    fireEvent.click(screen.getByTestId('mission-language'));
    return screen.findByTestId('language-dialog');
  }

  it('is not in Settings any more, on any build', async () => {
    installFakeApi({ formats: [format], settings: { ...OFFERED } });
    await openSettings();
    expect(screen.queryByTestId('language-settings')).toBeNull();
    expect(screen.queryByText(t('settings.language'))).toBeNull();
  });

  it('switches the page and <html lang> at once, without a reload', async () => {
    const api = installFakeApi({ formats: [format], settings: { ...OFFERED } });
    const puts = holdSettingsPuts(api);
    const dialog = await openDialog();
    const group = within(dialog).getByRole('radiogroup', { name: t('language.choose', {}, 'en') });
    const english = within(group).getByTestId('language-option-en');
    const spanish = within(group).getByTestId('language-option-es-MX');
    expect(english.getAttribute('lang')).toBe('en');
    expect(spanish.getAttribute('lang')).toBe('es-MX');
    await waitFor(() => {
      expect(english.getAttribute('aria-checked')).toBe('true');
    });
    expect(document.documentElement.lang).toBe('en');
    expect(dialog.textContent).toContain(t('language.choose', {}, 'en'));

    fireEvent.click(spanish);

    // Before the server has answered: the provider's value, the control, the
    // page's words and the document's language all say Spanish.
    expect(puts.sent).toEqual([{ language: 'es-MX' }]);
    expect(spanish.getAttribute('aria-checked')).toBe('true');
    expect(document.documentElement.lang).toBe('es-MX');
    expect(dialog.textContent).toContain(t('language.choose', {}, 'es-MX'));

    puts.settle(0, { ok: true });
    await flush();
    expect(api.state.settings['language']).toBe('es-MX');
    expect(document.documentElement.lang).toBe('es-MX');
  });

  it('is disabled with its reason while work is in flight, and comes back when it ends', async () => {
    const api = installFakeApi({ formats: [format], settings: { ...OFFERED } });
    const dialog = await openDialog();
    const spanish = within(dialog).getByTestId('language-option-es-MX');
    const english = within(dialog).getByTestId('language-option-en');
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
      expect(within(dialog).getByRole('radiogroup').getAttribute('aria-describedby')).toBe(reason.id);

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
    const dialog = await openDialog();
    const spanish = within(dialog).getByTestId('language-option-es-MX');
    const english = within(dialog).getByTestId('language-option-en');
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
    expect(dialog.textContent).toContain(t('language.choose', {}, 'en'));
    expect(api.state.settings['language']).toBe('en');
  });
});

/**
 * The typeface (owner, 2026-09-28): a dropdown, saved at once, painted on the
 * root as the two font tokens; the bundled face is the default and named.
 */
describe('the Font dropdown', () => {
  it('offers Inter as the named default, then System and Serif', async () => {
    installFakeApi({ formats: [format], settings: { ...STORED } });
    await openSettings();
    const select = (await screen.findByTestId('font-family')) as HTMLSelectElement;
    expect([...select.options].map((option) => option.textContent)).toEqual([
      'Inter (Default)',
      'System',
      'Serif',
    ]);
    expect(select.value).toBe('inter');
  });

  it('saves a choice at once and paints it on both font tokens', async () => {
    const api = installFakeApi({ formats: [format], settings: { ...STORED } });
    await openSettings();
    const select = (await screen.findByTestId('font-family')) as HTMLSelectElement;

    fireEvent.change(select, { target: { value: 'serif' } });

    const root = document.documentElement.style;
    expect(root.getPropertyValue('--font-sans')).toContain('Georgia');
    expect(root.getPropertyValue('--font-serif')).toContain('Georgia');
    await waitFor(() => {
      expect(api.state.settings['font_family']).toBe('serif');
    });

    fireEvent.change(select, { target: { value: 'inter' } });
    // The default is the app as it always was: no overrides at all.
    expect(root.getPropertyValue('--font-sans')).toBe('');
    expect(root.getPropertyValue('--font-serif')).toBe('');
  });

  it('has no colour picker: the accent is the Apunta teal', async () => {
    installFakeApi({ formats: [format], settings: { ...STORED, accent_color: '#8b2f6b' } });
    await openSettings();
    await screen.findByTestId('appearance-settings');
    expect(document.querySelector('input[type="color"]')).toBeNull();
    expect(screen.queryByTestId('reset-accent')).toBeNull();
    // A colour an older build stored is not painted: it could not be changed back.
    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#2a9d8f');
    });
  });
});

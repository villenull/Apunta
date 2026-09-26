import { LANGUAGE_SETTING, SPANISH_AVAILABLE_SETTING, type Settings } from '@apunta/shared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { SettingsProvider, useSettingsContext } from '../components/SettingsProvider.js';
import { installFakeApi } from '../test/fakeApi.js';
import { I18nProvider, useI18n } from './i18n.js';

/**
 * The provider, at provider level: the hook returns the active locale's `t`, a
 * settings change re-renders in the new one, and a build that does not offer
 * Spanish still says English.
 *
 * These mount `SettingsProvider` and `I18nProvider` themselves. `web/src/App.tsx`
 * does not mount the second one yet — no S2 card is licensed to edit that file,
 * and S2.3 owns the mount — so the row that proves the *real* tree follows the
 * `language` setting belongs to S2.3, and this file is deliberately not it.
 */

/** One string, read through the hook: the messages, the locale, the store. */
function MessageProbe({ id = 'probe' }: { readonly id?: string }): React.JSX.Element {
  const { locale, t } = useI18n();
  return (
    <>
      <output data-testid={`${id}-locale`}>{locale}</output>
      <output data-testid={`${id}-title`}>{t('notes.title')}</output>
      <output data-testid={`${id}-count`}>{t('notes.count', { count: 3 })}</output>
    </>
  );
}

/** The one control C-SETTINGS@1 allows: `update(patch)`, which saves it. */
function LanguageProbe({ value }: { readonly value: string }): React.JSX.Element {
  const { state, update } = useSettingsContext();
  return (
    <>
      <output data-testid="settings-status">{state.status}</output>
      <button
        type="button"
        data-testid="choose-es-MX"
        onClick={() => void update({ [LANGUAGE_SETTING]: value })}
      >
        español
      </button>
    </>
  );
}

function renderTree(settings: Settings): void {
  installFakeApi({ settings });
  render(
    <SettingsProvider>
      <I18nProvider>
        <LanguageProbe value="es-MX" />
        <MessageProbe />
      </I18nProvider>
    </SettingsProvider>,
  );
}

async function ready(): Promise<void> {
  await waitFor(() => {
    expect(screen.getByTestId('settings-status').textContent).toBe('ready');
  });
}

afterEach(() => {
  cleanup();
});

describe('I18nProvider', () => {
  it("returns the active locale's t", async () => {
    // A build that offers Spanish, with Spanish stored: the hook answers in
    // Spanish, in the locale the setting names.
    renderTree({ [LANGUAGE_SETTING]: 'es-MX', [SPANISH_AVAILABLE_SETTING]: true });
    await ready();

    expect(screen.getByTestId('probe-locale').textContent).toBe('es-MX');
    expect(screen.getByTestId('probe-title').textContent).toBe('Notas');
    // A parameter is rendered through the locale's `Intl`, not concatenated.
    expect(screen.getByTestId('probe-count').textContent).toBe(
      `${new Intl.NumberFormat('es-MX').format(3)} notas`,
    );
  });

  it('re-renders in the new locale when the language setting changes', async () => {
    // The optimistic apply of C-SETTINGS@1: the value the control was given is
    // the value the page is painted from, with no reload and no second fetch.
    renderTree({ [LANGUAGE_SETTING]: 'en', [SPANISH_AVAILABLE_SETTING]: true });
    await ready();
    expect(screen.getByTestId('probe-locale').textContent).toBe('en');
    expect(screen.getByTestId('probe-title').textContent).toBe('Notes');

    fireEvent.click(screen.getByTestId('choose-es-MX'));

    await waitFor(() => {
      expect(screen.getByTestId('probe-title').textContent).toBe('Notas');
    });
    expect(screen.getByTestId('probe-locale').textContent).toBe('es-MX');
  });

  it('serves English when the build does not offer Spanish', async () => {
    // C-LANG@1 rule 1: `es-MX` is refused by `PUT /api/settings` on such a
    // build, and the control that would have set it is hidden. A stored
    // `es-MX` on a build that does not offer it is therefore honoured as
    // English, not painted in a locale this build cannot finish.
    renderTree({ [LANGUAGE_SETTING]: 'es-MX', [SPANISH_AVAILABLE_SETTING]: false });
    await ready();

    expect(screen.getByTestId('probe-locale').textContent).toBe('en');
    expect(screen.getByTestId('probe-title').textContent).toBe('Notes');
    expect(screen.getByTestId('probe-count').textContent).toBe(
      `${new Intl.NumberFormat('en').format(3)} notes`,
    );
  });
});

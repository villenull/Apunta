import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RenderResult } from '@testing-library/react';

import { t, type Locale, type Settings } from '@apunta/shared';

import { useSpelling } from '../hooks/useSpelling.js';
import { I18nProvider } from '../lib/i18n.js';
import { loadSpeller } from '../lib/speller.js';
import { findMisspellings, type Speller } from '../lib/spelling.js';
import { SettingsContext, type SettingsState } from './SettingsProvider.js';
import { SpellLayer } from './SpellLayer.js';
import { SpellingProvider, useSpellingContext } from './SpellingProvider.js';

const TEST_SPELLER: Speller = {
  correct: () => true,
  suggest: () => [],
};

function SpellingProbe(): React.JSX.Element {
  useSpelling('');
  const { speller } = useSpellingContext();
  return <output data-testid="speller-state">{speller === null ? 'pending' : 'ready'}</output>;
}

describe('SpellingProvider', () => {
  it('publishes a dictionary loaded during StrictMode effect replay', async () => {
    let resolveLoad: (speller: Speller) => void = () => {};
    const load = () =>
      new Promise<Speller>((resolve) => {
        resolveLoad = resolve;
      });

    render(
      <StrictMode>
        {/* The snapshot is what names the language, so the real app always has
            one; the provider now waits for it before loading (S6.1, V3). */}
        <SettingsContext.Provider
          value={{ state: stateWith(ENGLISH), reload: () => {}, update: () => Promise.resolve() }}
        >
          <SpellingProvider load={load}>
            <SpellingProbe />
          </SpellingProvider>
        </SettingsContext.Provider>
      </StrictMode>,
    );

    expect(screen.getByTestId('speller-state').textContent).toBe('pending');
    await act(async () => {
      resolveLoad(TEST_SPELLER);
    });
    await waitFor(() => expect(screen.getByTestId('speller-state').textContent).toBe('ready'));
  });
});

/**
 * S6.1's provider cases: the error surface, the request-id guard, and the
 * per-locale word list. The case above is untouched.
 */
const putSettings = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('../api/settings.js', () => ({ putSettings }));

vi.mock('../lib/spelling.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, findMisspellings: vi.fn(actual['findMisspellings'] as () => boolean) };
});

function stateWith(settings: Record<string, unknown>): SettingsState {
  return { status: 'ready', data: settings as Settings };
}

function renderProvider(
  ui: React.JSX.Element,
  state: SettingsState,
  load: (locale: Locale) => Promise<Speller>,
): RenderResult {
  return render(
    <SettingsContext.Provider value={{ state, reload: () => {}, update: () => Promise.resolve() }}>
      <I18nProvider>
        <SpellingProvider load={load}>{ui}</SpellingProvider>
      </I18nProvider>
    </SettingsContext.Provider>,
  );
}

// The suite does not run with Vitest globals, so the automatic cleanup that
// would normally follow each case is registered here.
afterEach(() => {
  cleanup();
});

const SPANISH: Record<string, unknown> = { language: 'es-MX', spanish_available: true };
const ENGLISH: Record<string, unknown> = { language: 'en' };

/** A mounted spell surface, plus what the provider is publishing. */
function Surface({ text = '' }: { readonly text?: string }): React.JSX.Element {
  useSpelling(text);
  const { speller, error, addWord } = useSpellingContext();
  return (
    <>
      <output data-testid="spelling-state">{`${speller === null ? 'pending' : 'ready'}|${error ?? 'none'}`}</output>
      <output data-testid="accepted">{[...useSpellingContext().accepted].sort().join(',')}</output>
      <button
        type="button"
        onClick={() => {
          addWord('Zambumbia');
        }}
      >
        add
      </button>
      <SpellLayer as="input" aria-label="Nota" value={text} onChange={() => {}} />
    </>
  );
}

describe('SpellingProvider with a dictionary that cannot load', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    putSettings.mockClear();
  });

  it('names the failure as a MessageKey, draws no marks, and stays usable (V1e)', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(null, { status: 404 }));

    renderProvider(<Surface text="Teh sesión" />, stateWith(SPANISH), (locale) => loadSpeller(locale));

    // `spelling.loadFailed` as a `MessageKey`, so a typo in the key is a
    // `typecheck` failure rather than a runtime one.
    await waitFor(() =>
      expect(screen.getByTestId('spelling-state').textContent).toBe('pending|spelling.loadFailed'),
    );
    expect(vi.mocked(findMisspellings)).not.toHaveBeenCalled();
    expect(document.querySelectorAll('.misspelt')).toHaveLength(0);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    // The alert is rendered in the active UI language, which is `es-MX` here.
    expect(screen.getByRole('alert').textContent).toBe(t('spelling.loadFailed', undefined, 'es-MX'));

    fireEvent.click(screen.getByRole('button', { name: 'add' }));
    await waitFor(() => expect(putSettings).toHaveBeenCalledWith({ spelling_words_es_mx: ['Zambumbia'] }));
  });
});

describe('the load-id guard (D4.3, V1f)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** One deferred per call, so "the load that is stale" is a specific one. */
  function deferredLoader(): {
    load: (locale: Locale) => Promise<Speller>;
    settle: (index: number, outcome: 'resolve' | 'reject') => Promise<void>;
    started: () => number;
  } {
    const pending: { resolve: (s: Speller) => void; reject: (e: Error) => void }[] = [];
    const load = () =>
      new Promise<Speller>((resolve, reject) => {
        pending.push({ resolve, reject });
      });
    return {
      load,
      started: () => pending.length,
      settle: async (index, outcome) => {
        await act(async () => {
          const entry = pending[index];
          if (entry === undefined) throw new Error(`load ${String(index)} was never started`);
          if (outcome === 'resolve') entry.resolve(TEST_SPELLER);
          else entry.reject(new Error('404'));
        });
      },
    };
  }

  const withSettings = (
    state: SettingsState,
    load: (locale: Locale) => Promise<Speller>,
    ui: React.JSX.Element,
  ) => (
    <SettingsContext.Provider value={{ state, reload: () => {}, update: () => Promise.resolve() }}>
      <I18nProvider>
        <SpellingProvider load={load}>{ui}</SpellingProvider>
      </I18nProvider>
    </SettingsContext.Provider>
  );

  it('does not install a dictionary that resolves after the language moved on', async () => {
    const { load, settle, started } = deferredLoader();
    const { rerender } = render(withSettings(stateWith(ENGLISH), load, <Surface />));
    await waitFor(() => expect(started()).toBe(1));

    // The switch: the in-flight English load is stale, and the language on
    // screen now asks for the Spanish pair instead.
    rerender(withSettings(stateWith(SPANISH), load, <Surface />));
    await waitFor(() => expect(started()).toBe(2));

    await settle(0, 'resolve');
    expect(screen.getByTestId('spelling-state').textContent).toBe('pending|none');

    await settle(1, 'resolve');
    expect(screen.getByTestId('spelling-state').textContent).toBe('ready|none');
  });

  it('does not report a failure that arrives after the language moved on', async () => {
    const { load, settle, started } = deferredLoader();
    const { rerender } = render(withSettings(stateWith(SPANISH), load, <Surface />));
    await waitFor(() => expect(started()).toBe(1));

    rerender(withSettings(stateWith(ENGLISH), load, <Surface />));
    await waitFor(() => expect(started()).toBe(2));

    await settle(0, 'reject');
    expect(screen.getByTestId('spelling-state').textContent).toBe('pending|none');
    expect(screen.queryByRole('alert')).toBeNull();

    await settle(1, 'reject');
    expect(screen.getByTestId('spelling-state').textContent).toBe('pending|spelling.loadFailed');
  });
});

/**
 * The switch *after* a dictionary has landed. The two cases above cover a load
 * still in flight; these start from a loaded dictionary, which is the state a
 * tab is actually in when she changes the language mid-session.
 */
describe('the language switch after a dictionary has loaded (D4.3, V1f)', () => {
  /** A loader that records every locale asked for and answers immediately. */
  function recordingLoader(): {
    readonly asked: Locale[];
    readonly load: (locale: Locale) => Promise<Speller>;
  } {
    const asked: Locale[] = [];
    const load = (locale: Locale): Promise<Speller> => {
      asked.push(locale);
      return Promise.resolve(
        locale === 'en'
          ? { correct: (word) => word === 'only-in-english', suggest: () => [] }
          : { correct: (word) => word === 'only-in-spanish', suggest: () => [] },
      );
    };
    return { asked, load };
  }

  /** Which dictionary is active, read through the speller itself. */
  function ActiveSpellerProbe(): React.JSX.Element {
    useSpelling('');
    const { speller } = useSpellingContext();
    const active =
      speller === null
        ? 'none'
        : speller.correct('only-in-english')
          ? 'english'
          : speller.correct('only-in-spanish')
            ? 'spanish'
            : 'other';
    return <output data-testid="active-speller">{active}</output>;
  }

  function tree(language: 'en' | 'es-MX', load: (locale: Locale) => Promise<Speller>): React.JSX.Element {
    const state = stateWith(language === 'en' ? ENGLISH : SPANISH);
    return (
      <SettingsContext.Provider value={{ state, reload: () => {}, update: () => Promise.resolve() }}>
        <I18nProvider>
          <SpellingProvider load={load}>
            <ActiveSpellerProbe />
          </SpellingProvider>
        </I18nProvider>
      </SettingsContext.Provider>
    );
  }

  it('asks for the es-MX pair and makes it the active dictionary (en → es-MX)', async () => {
    const { asked, load } = recordingLoader();
    const { rerender } = render(tree('en', load));
    await waitFor(() => expect(screen.getByTestId('active-speller').textContent).toBe('english'));
    expect(asked).toEqual(['en']);

    rerender(tree('es-MX', load));

    // The English dictionary is gone with the language it belonged to, and the
    // Spanish pair is requested for the surface that is still mounted.
    await waitFor(() => expect(asked).toEqual(['en', 'es-MX']));
    await waitFor(() => expect(screen.getByTestId('active-speller').textContent).toBe('spanish'));
  });

  it('asks for the English pair and makes it the active dictionary (es-MX → en)', async () => {
    const { asked, load } = recordingLoader();
    const { rerender } = render(tree('es-MX', load));
    await waitFor(() => expect(screen.getByTestId('active-speller').textContent).toBe('spanish'));
    expect(asked).toEqual(['es-MX']);

    rerender(tree('en', load));

    await waitFor(() => expect(asked).toEqual(['es-MX', 'en']));
    await waitFor(() => expect(screen.getByTestId('active-speller').textContent).toBe('english'));
  });

  it('loads only the settled language when a surface mounts before settings arrive (V3)', async () => {
    // A fresh note page can mount its spell surface before the settings
    // snapshot lands, while the UI locale is still the English default. Only
    // the language the snapshot settles on may be fetched.
    const { asked, load } = recordingLoader();
    const loading: SettingsState = { status: 'loading' };
    const { rerender } = render(
      <SettingsContext.Provider value={{ state: loading, reload: () => {}, update: () => Promise.resolve() }}>
        <I18nProvider>
          <SpellingProvider load={load}>
            <ActiveSpellerProbe />
          </SpellingProvider>
        </I18nProvider>
      </SettingsContext.Provider>,
    );
    await act(async () => {});
    expect(asked).toEqual([]);

    rerender(tree('es-MX', load));

    await waitFor(() => expect(screen.getByTestId('active-speller').textContent).toBe('spanish'));
    expect(asked).toEqual(['es-MX']);
  });
});

describe('the per-locale word list (D3, V1h, V1i)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('answers an active Spanish UI from the Spanish key alone', async () => {
    renderProvider(<Surface />, stateWith({ ...SPANISH, spelling_words: ['Zebediah'] }), () =>
      Promise.resolve(TEST_SPELLER),
    );
    await waitFor(() => expect(screen.getByTestId('accepted').textContent).toBe(''));
  });

  it('does not let the English list repopulate after a switch to es-MX', async () => {
    const { rerender } = renderProvider(
      <Surface />,
      stateWith({ ...ENGLISH, spelling_words: ['Zebediah'] }),
      () => Promise.resolve(TEST_SPELLER),
    );
    await waitFor(() => expect(screen.getByTestId('accepted').textContent).toBe('zebediah'));

    rerender(
      <SettingsContext.Provider
        value={{
          state: stateWith({ ...SPANISH, spelling_words: ['Zebediah'] }),
          reload: () => {},
          update: () => Promise.resolve(),
        }}
      >
        <I18nProvider>
          <SpellingProvider load={() => Promise.resolve(TEST_SPELLER)}>
            <Surface />
          </SpellingProvider>
        </I18nProvider>
      </SettingsContext.Provider>,
    );

    // The English list belonged to the language that is no longer on screen:
    // the active list is empty, not the English one.
    await waitFor(() => expect(screen.getByTestId('accepted').textContent).toBe(''));
  });

  it('keeps the English list when a Spanish snapshot is the one delivered', async () => {
    const { rerender } = renderProvider(
      <Surface />,
      stateWith({ ...SPANISH, spelling_words_es_mx: ['Zambumbia'] }),
      () => Promise.resolve(TEST_SPELLER),
    );
    await waitFor(() => expect(screen.getByTestId('accepted').textContent).toBe('zambumbia'));

    rerender(
      <SettingsContext.Provider
        value={{ state: stateWith(ENGLISH), reload: () => {}, update: () => Promise.resolve() }}
      >
        <I18nProvider>
          <SpellingProvider load={() => Promise.resolve(TEST_SPELLER)}>
            <Surface />
          </SpellingProvider>
        </I18nProvider>
      </SettingsContext.Provider>,
    );

    // Not cleared, and no Spanish word written into it.
    await waitFor(() => expect(screen.getByTestId('accepted').textContent).toBe(''));
  });
});

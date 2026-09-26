import {
  ANIMATIONS_SETTING,
  FONT_SIZE_SETTING,
  THEME_SETTING,
  type Settings,
  type UpdateSettingsRequest,
} from '@apunta/shared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { errorMessage } from '../api/client.js';
import { installFakeApi, type FakeApi } from '../test/fakeApi.js';
import { SettingsProvider, useSettingsContext } from './SettingsProvider.js';

/**
 * C-SETTINGS@1, the provider half: `update(patch)` is the only way a setting
 * changes, it applies the patch at once, a failure puts back what was there
 * before that request, and a response older than the latest request for a key
 * is ignored.
 *
 * These drive the provider directly, with two probes sharing one instance —
 * which is the shape the bug had: two controls, one stored value, and no way
 * for either to be wrong on its own.
 */

/** What the provider holds, as text: the assertions read these. */
function StateProbe(): React.JSX.Element {
  const { state } = useSettingsContext();
  const data = state.status === 'ready' ? state.data : null;
  const show = (key: string): string => (data === null ? 'none' : String(data[key]));
  return (
    <>
      <output data-testid="provider-status">{state.status}</output>
      <output data-testid="provider-theme">{show(THEME_SETTING)}</output>
      <output data-testid="provider-font-size">{show(FONT_SIZE_SETTING)}</output>
      <output data-testid="provider-animations">{show(ANIMATIONS_SETTING)}</output>
    </>
  );
}

/** One control: a button that saves its own patch, and how that save ended. */
function SaveProbe({
  id,
  patch,
}: {
  readonly id: string;
  readonly patch: UpdateSettingsRequest;
}): React.JSX.Element {
  const { update } = useSettingsContext();
  const [outcome, setOutcome] = useState<'pending' | 'settled' | 'failed'>('pending');
  const [failure, setFailure] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        data-testid={id}
        onClick={() => {
          setOutcome('pending');
          setFailure(null);
          void update(patch).then(
            () => {
              setOutcome('settled');
            },
            (thrown: unknown) => {
              setOutcome('failed');
              setFailure(errorMessage(thrown));
            },
          );
        }}
      >
        save
      </button>
      <output data-testid={`${id}-outcome`}>{outcome}</output>
      <output data-testid={`${id}-failure`}>{failure ?? 'none'}</output>
    </>
  );
}

type FetchFn = (path: string, init?: RequestInit) => Promise<Response>;

interface PendingPut {
  readonly body: Settings;
  readonly resolve: (response: Response) => void;
  readonly reject: (error: unknown) => void;
}

/**
 * Hold every `PUT /api/settings` open so a test can decide when — and whether
 * — it answers, and see the patch that was sent. Everything else (the initial
 * `GET`) is answered by the fake API as usual.
 */
function holdSettingsPuts(api: FakeApi): { readonly sent: Settings[]; readonly settle: PutSettle } {
  const inner = globalThis.fetch as unknown as FetchFn;
  const queue: PendingPut[] = [];
  const sent: Settings[] = [];
  vi.stubGlobal('fetch', (path: string, init: RequestInit = {}): Promise<Response> => {
    if (path === '/api/settings' && init.method === 'PUT') {
      const body = JSON.parse(String(init.body)) as Settings;
      sent.push(body);
      return new Promise<Response>((resolve, reject) => {
        queue.push({ body, resolve, reject });
      });
    }
    return inner(path, init);
  });
  return {
    sent,
    settle: (index, outcome) => {
      const put = queue[index];
      if (put === undefined) throw new Error(`no PUT /api/settings at ${String(index)}`);
      if (outcome.ok) {
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
      // A real API failure, not a dead socket: the message the owner would see
      // is the server's own.
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

const STORED: Settings = {
  [THEME_SETTING]: 'dark',
  [FONT_SIZE_SETTING]: 'default',
  [ANIMATIONS_SETTING]: true,
};

function renderProvider(children: React.ReactNode): void {
  render(<SettingsProvider>{children}</SettingsProvider>);
}

async function ready(): Promise<void> {
  await waitFor(() => {
    expect(screen.getByTestId('provider-status').textContent).toBe('ready');
  });
}

/**
 * Wait for one request to be answered, and its answer absorbed. `update()`
 * resolving (or rejecting) is the barrier, not a timer: a bare `await` only
 * turns the microtask queue once, which is not far enough to tell "the answer
 * was absorbed" from "the answer is still on its way".
 */
async function ended(id: string, outcome: 'settled' | 'failed'): Promise<void> {
  await waitFor(() => {
    expect(screen.getByTestId(`${id}-outcome`).textContent).toBe(outcome);
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('SettingsProvider update', () => {
  it('applies the patch to its own state before the write settles', async () => {
    const api = installFakeApi({ settings: { ...STORED } });
    const puts = holdSettingsPuts(api);
    renderProvider(
      <>
        <StateProbe />
        <SaveProbe id="save-light" patch={{ [THEME_SETTING]: 'light' }} />
      </>,
    );
    await ready();
    expect(screen.getByTestId('provider-theme').textContent).toBe('dark');

    fireEvent.click(screen.getByTestId('save-light'));

    // The request is in flight and nothing has come back: the provider already
    // holds the new value, which is what the control and the page paint from.
    expect(puts.sent).toEqual([{ [THEME_SETTING]: 'light' }]);
    expect(screen.getByTestId('provider-theme').textContent).toBe('light');

    puts.settle(0, { ok: true });
    await ended('save-light', 'settled');
    expect(screen.getByTestId('provider-theme').textContent).toBe('light');
    expect(api.state.settings[THEME_SETTING]).toBe('light');
  });

  it('restores the value from before that request, for its own keys only', async () => {
    const api = installFakeApi({ settings: { ...STORED } });
    const puts = holdSettingsPuts(api);
    renderProvider(
      <>
        <StateProbe />
        <SaveProbe id="save-large" patch={{ [FONT_SIZE_SETTING]: 'large' }} />
        <SaveProbe id="save-pair" patch={{ [THEME_SETTING]: 'light', [FONT_SIZE_SETTING]: 'small' }} />
      </>,
    );
    await ready();

    fireEvent.click(screen.getByTestId('save-large'));
    puts.settle(0, { ok: true });
    await ended('save-large', 'settled');
    expect(screen.getByTestId('provider-font-size').textContent).toBe('large');

    fireEvent.click(screen.getByTestId('save-pair'));
    expect(screen.getByTestId('provider-theme').textContent).toBe('light');
    expect(screen.getByTestId('provider-font-size').textContent).toBe('small');

    puts.settle(1, { ok: false, message: 'The Apunta server could not save that setting.' });
    await ended('save-pair', 'failed');

    // Both keys go back to what they were before *this* request — the font size
    // to `large`, not to the `default` the record started at.
    expect(screen.getByTestId('provider-theme').textContent).toBe('dark');
    expect(screen.getByTestId('provider-font-size').textContent).toBe('large');
    // A key the failed request never sent is untouched.
    expect(screen.getByTestId('provider-animations').textContent).toBe('true');
    // The rejection is the API error, which is the control's only failure channel.
    expect(screen.getByTestId('save-pair-failure').textContent).toBe(
      'The Apunta server could not save that setting.',
    );
  });

  it('keeps the newer value when an older response for that key arrives late', async () => {
    const api = installFakeApi({ settings: { ...STORED } });
    const puts = holdSettingsPuts(api);
    renderProvider(
      <>
        <StateProbe />
        <SaveProbe id="save-light" patch={{ [THEME_SETTING]: 'light' }} />
        <SaveProbe id="save-system" patch={{ [THEME_SETTING]: 'system' }} />
      </>,
    );
    await ready();

    fireEvent.click(screen.getByTestId('save-light'));
    fireEvent.click(screen.getByTestId('save-system'));
    expect(puts.sent).toEqual([{ [THEME_SETTING]: 'light' }, { [THEME_SETTING]: 'system' }]);

    // The newer request answers first, then the older one arrives with the
    // value it was sent: last intent wins, so it is ignored.
    puts.settle(1, { ok: true });
    await ended('save-system', 'settled');
    expect(screen.getByTestId('provider-theme').textContent).toBe('system');
    puts.settle(0, { ok: true });
    await ended('save-light', 'settled');
    expect(screen.getByTestId('provider-theme').textContent).toBe('system');
  });

  it('does not roll the newer value back when the older request fails late', async () => {
    const api = installFakeApi({ settings: { ...STORED } });
    const puts = holdSettingsPuts(api);
    renderProvider(
      <>
        <StateProbe />
        <SaveProbe id="save-light" patch={{ [THEME_SETTING]: 'light' }} />
        <SaveProbe id="save-system" patch={{ [THEME_SETTING]: 'system' }} />
      </>,
    );
    await ready();

    fireEvent.click(screen.getByTestId('save-light'));
    fireEvent.click(screen.getByTestId('save-system'));
    puts.settle(1, { ok: true });
    await ended('save-system', 'settled');
    puts.settle(0, { ok: false, message: 'The Apunta server could not save that setting.' });
    await ended('save-light', 'failed');

    // The rollback belongs to the request that failed, and that request is no
    // longer the latest intent for the theme.
    expect(screen.getByTestId('provider-theme').textContent).toBe('system');
    expect(screen.getByTestId('save-light-failure').textContent).toBe(
      'The Apunta server could not save that setting.',
    );
  });

  it('counts sequences per key, so a newer request elsewhere is not a stale one', async () => {
    const api = installFakeApi({ settings: { ...STORED } });
    const puts = holdSettingsPuts(api);
    renderProvider(
      <>
        <StateProbe />
        <SaveProbe id="save-light" patch={{ [THEME_SETTING]: 'light' }} />
        <SaveProbe id="save-small" patch={{ [FONT_SIZE_SETTING]: 'small' }} />
      </>,
    );
    await ready();

    fireEvent.click(screen.getByTestId('save-light'));
    fireEvent.click(screen.getByTestId('save-small'));

    // The theme request is not the latest request *for the theme*, so its
    // response still counts when it lands.
    puts.settle(1, { ok: true });
    await ended('save-small', 'settled');
    puts.settle(0, { ok: false, message: 'The Apunta server could not save that setting.' });
    await ended('save-light', 'failed');

    expect(screen.getByTestId('provider-font-size').textContent).toBe('small');
    expect(screen.getByTestId('provider-theme').textContent).toBe('dark');
  });
});

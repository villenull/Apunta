import { t as translate } from '@apunta/shared';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  setOwnRecordingDiscard,
  setRecordingActive,
  startMaintenanceReporter,
  stopMaintenanceReporter,
} from '../lib/maintenance.js';
import { CloseConfirm } from './CloseConfirm.js';
import type { Translate } from '../lib/i18n.js';

import { WorkspaceFreeze } from './WorkspaceFreeze.js';
const t: Translate = (key, params) => translate(key, params, 'en');

/**
 * The native-close dialog and the quiesce freeze (C-UPD@1).
 *
 * Only `fetch` is stubbed: the shell-mode server's `GET /api/app/update` and
 * `POST /api/app/close/decision`. What is under test is what the renderer does
 * with them — what it names, what it offers to discard, and the order it acts in.
 */

let status: { state: string; blockers: string[] } | 'absent' = { state: 'none', blockers: [] };
let events: string[] = [];
let decisions: { confirm: boolean }[] = [];
let decisionStatus = 202;

beforeEach(() => {
  status = { state: 'none', blockers: [] };
  events = [];
  decisions = [];
  decisionStatus = 202;
  vi.stubGlobal('fetch', (path: string, init: RequestInit = {}) => {
    if (path === '/api/app/update') {
      if (status === 'absent') {
        return Promise.resolve(
          new Response(JSON.stringify({ error: 'not_found', message: 'Not found' }), { status: 404 }),
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({ state: 'idle', autoCheck: true, version: null, code: null, close: status }),
          { status: 200 },
        ),
      );
    }
    if (path === '/api/app/close/decision') {
      const body = JSON.parse(String(init.body)) as { confirm: boolean };
      decisions.push(body);
      events.push(`decision:${String(body.confirm)}`);
      return Promise.resolve(new Response('{}', { status: decisionStatus }));
    }
    return Promise.resolve(new Response('{}', { status: 404 }));
  });
});

afterEach(() => {
  cleanup();
  setRecordingActive(false);
  setOwnRecordingDiscard(null);
  vi.unstubAllGlobals();
});

describe('the close dialog', () => {
  it('stays out of the way until the shell refused a close', async () => {
    render(<CloseConfirm t={t} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByTestId('close-confirm')).toBeNull();
  });

  it('never offers to discard typed text: only a check again', async () => {
    status = { state: 'refused', blockers: ['unsaved_text'] };
    render(<CloseConfirm t={t} />);

    await screen.findByTestId('close-confirm');
    expect(screen.queryByTestId('close-confirm-discard')).toBeNull();

    fireEvent.click(screen.getByTestId('close-confirm-retry'));
    await waitFor(() => {
      expect(decisions).toEqual([{ confirm: true }]);
    });
  });

  it("does not offer another window's recording, which this window cannot discard", async () => {
    status = { state: 'refused', blockers: ['recording'] };
    setRecordingActive(false);
    render(<CloseConfirm t={t} />);

    await screen.findByTestId('close-confirm');
    expect(screen.queryByTestId('close-confirm-discard')).toBeNull();
    expect(screen.getByTestId('close-confirm-retry')).toBeTruthy();
  });

  it('offers discard for its own active recording, cancels it, then posts confirm:true', async () => {
    status = { state: 'refused', blockers: ['recording'] };
    setRecordingActive(true);
    setOwnRecordingDiscard(() => {
      events.push('discarded');
    });
    render(<CloseConfirm t={t} />);

    fireEvent.click(await screen.findByTestId('close-confirm-discard'));

    await waitFor(() => {
      expect(decisions).toEqual([{ confirm: true }]);
    });
    expect(events).toEqual(['discarded', 'decision:true']);
  });

  it('posts confirm:false when the owner keeps Apunta open', async () => {
    status = { state: 'refused', blockers: ['recording'] };
    setRecordingActive(true);
    setOwnRecordingDiscard(() => {
      events.push('discarded');
    });
    render(<CloseConfirm t={t} />);

    fireEvent.click(await screen.findByTestId('close-confirm-cancel'));

    await waitFor(() => {
      expect(decisions).toEqual([{ confirm: false }]);
    });
    expect(events).toEqual(['decision:false']);
  });

  it('goes quiet for good in a browser tab, where the route is a 404', async () => {
    vi.useFakeTimers();
    try {
      status = 'absent';
      const calls: string[] = [];
      const inner = globalThis.fetch;
      vi.stubGlobal('fetch', (path: string, init?: RequestInit) => {
        calls.push(path);
        return inner(path, init);
      });
      render(<CloseConfirm t={t} />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      expect(calls).toEqual(['/api/app/update']);
      expect(screen.queryByTestId('close-confirm')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the workspace freeze', () => {
  it('covers the workspace after a flush and lifts only on an authoritative release', async () => {
    const answers: unknown[] = [
      { request: 'flush', quiesceId: 'q1' },
      { request: 'expired', quiesceId: 'q1' },
      { request: 'settled', quiesceId: 'q1', ok: true, held: false, blockers: [] },
    ];
    vi.stubGlobal('fetch', (path: string, init: RequestInit = {}) => {
      if (path.startsWith('/api/app/quiesce/wait')) {
        const next = answers.shift();
        if (next === undefined) {
          return new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          });
        }
        // The release is not handed over until the test asks for it.
        if ((next as { request: string }).request === 'settled') {
          return new Promise<Response>((resolve) => {
            releaseSettled = () => {
              resolve(new Response(JSON.stringify(next), { status: 200 }));
            };
          });
        }
        return Promise.resolve(new Response(JSON.stringify(next), { status: 200 }));
      }
      return Promise.resolve(new Response('{}', { status: 200 }));
    });
    let releaseSettled: () => void = () => {};

    render(<WorkspaceFreeze />);
    expect(screen.queryByTestId('workspace-freeze')).toBeNull();

    startMaintenanceReporter();
    await screen.findByTestId('workspace-freeze');

    // The expired wait that follows is not a release.
    await act(async () => {
      await new Promise<void>((done) => setTimeout(done, 0));
    });
    expect(screen.getByTestId('workspace-freeze')).toBeTruthy();

    // Typing underneath the freeze goes nowhere.
    const field = document.createElement('textarea');
    document.body.append(field);
    const key = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
    field.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(true);
    field.remove();

    await act(async () => {
      releaseSettled();
      await new Promise<void>((done) => setTimeout(done, 0));
    });
    await waitFor(() => {
      expect(screen.queryByTestId('workspace-freeze')).toBeNull();
    });
    stopMaintenanceReporter();
  });
});

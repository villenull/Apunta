import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { App } from './App.js';
import { installFakeApi, makeFormat, makeNote, makePatient } from './test/fakeApi.js';

/**
 * The single-primary-window gate and the caret, on a cold `/patients/new`.
 *
 * Two properties are pinned here, and they are the pair the rest of the card
 * rests on:
 *
 * - **the gate** — `inert` while the window is known to be blocked
 *   (`'secondary'`, `'unsupported'`), and *not* while it is still finding out
 *   (`'acquiring'`). The blocker's own prompt still covers the screen
 *   throughout, so the app behind it never becomes reachable by pointer or by
 *   Tab; what changed is that it is in the tab order for the one interval in
 *   which it is about to be the app she is allowed to use.
 * - **the caret** — the app does not move it on the `'acquiring'` → `'primary'`
 *   grant. It still moves it on a takeover, where landing the keyboard back in
 *   the app is the whole point of the handoff.
 *
 * The file installs its **own** deferred Web Locks shim and its **own** queued
 * `requestAnimationFrame` stub, both locally and after `installFakeApi`, which
 * itself defines `navigator.locks` (a shim installed before it is silently
 * overwritten and the phase is `'primary'` before any assertion runs). No
 * shared helper is touched: `fakeApi.ts`'s `installFakeWebLocks` grants an
 * `ifAvailable` probe off a microtask, which is why no existing test has ever
 * seen a window that was still `'acquiring'`.
 *
 * jsdom does not implement `inert`'s focus behaviour, so (a) and (b) assert
 * the **cause** and the **steal** rather than a swallowed keystroke — which is
 * exactly why the Playwright citation in `docs/v2/cards/S2.11.md` and the e2e
 * row are both load-bearing. `inert` as a property is readable in jsdom; only
 * its focus behaviour is not, so (e) needs no browser either.
 */

type TestRouter = Parameters<typeof RouterProvider>[0]['router'];

const progressNote = makeFormat('Progress note', ['Subjective', 'Objective', 'Assessment', 'Plan']);
const john = makePatient('John Smith', { note_count: 2 });
const maria = makePatient('Maria Ruiz', { note_count: 0 });
const johnsDraft = makeNote(john.id, {
  content: 'Subjective: Improved sleep.\n\nPlan: Continue weekly.',
});

let activeRouter: TestRouter | null = null;
/** Undo hooks for the two local shims, drained after every case. */
const restores: Array<() => void> = [];

function renderApp(path: string | { pathname: string; state: unknown } = '/'): void {
  activeRouter = createMemoryRouter([{ path: '*', element: <App /> }], { initialEntries: [path] });
  render(<RouterProvider router={activeRouter} />);
}

afterEach(() => {
  activeRouter?.dispose();
  activeRouter = null;
  cleanup();
  while (restores.length > 0) restores.pop()?.();
});

/** The one shape `usePrimaryWindow` reads locks through (`App.tsx:171-181`). */
type LockCallback = (lock: { readonly name: string } | null) => Promise<void>;

interface DeferredRequest {
  /** True for the app's opening `ifAvailable` probe. */
  readonly ifAvailable: boolean;
  /** Answer the probe (or the waiting exclusive request) with the lock. */
  grant(): void;
  /** Answer an `ifAvailable` probe with `null`: the lock is held elsewhere. */
  grantNull(): void;
}

function fakePractice(): void {
  installFakeApi({
    formats: [progressNote],
    patients: [john, maria],
    notes: [johnsDraft],
  });
}

/**
 * Web Locks where **nothing is granted until this file says so**, so a render
 * can be held in `'acquiring'` and a takeover can be granted at the moment the
 * case chooses. The app's own lock name is the only name it asks for; a
 * foreign holder is modelled by answering its `ifAvailable` probe with `null`,
 * which is what the real API answers a second window and what `fakeApi.ts`
 * answers while its own holder is held.
 */
function installDeferredLocks(): DeferredRequest[] {
  const pending: DeferredRequest[] = [];
  restores.push(() => {
    const nav = navigator as unknown as Record<string, unknown>;
    Reflect.deleteProperty(nav, 'locks');
  });

  async function request(
    name: string,
    optionsOrCallback: { mode?: string; ifAvailable?: boolean; signal?: AbortSignal } | LockCallback,
    maybeCallback?: LockCallback,
  ): Promise<void> {
    const options = typeof optionsOrCallback === 'function' ? {} : optionsOrCallback;
    const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
    if (callback === undefined) return;
    const signal = options.signal;
    if (signal?.aborted === true) throw new DOMException('Aborted', 'AbortError');

    let settled = false;
    await new Promise<void>((resolve, reject) => {
      const settle = (): boolean => {
        if (settled) return false;
        settled = true;
        const index = pending.indexOf(entry);
        if (index !== -1) pending.splice(index, 1);
        return true;
      };
      const answer = (lock: { readonly name: string } | null): void => {
        if (!settle()) return;
        void (async () => {
          try {
            await callback(lock);
            resolve();
          } catch (error) {
            reject(error);
          }
        })();
      };
      const entry: DeferredRequest = {
        ifAvailable: options.ifAvailable === true,
        grant: () => answer({ name }),
        grantNull: () => answer(null),
      };
      pending.push(entry);
      signal?.addEventListener(
        'abort',
        () => {
          if (!settle()) return;
          reject(new DOMException('Aborted', 'AbortError'));
        },
        { once: true },
      );
    });
  }

  Object.defineProperty(globalThis.navigator, 'locks', { configurable: true, value: { request } });
  return pending;
}

/**
 * A queued `requestAnimationFrame`, drained one batch at a time, so "a frame
 * has run" is a fact in this file and not a race. Two separate rAFs compete
 * for the caret on a cold load — `PrimaryBlocker`'s own (`App.tsx:505`) and
 * `becomePrimary`'s (`:270`) — so cases (b) and (c) flush explicitly rather
 * than hope a real frame landed between two statements.
 */
function installFrameStub(): { flushOne(): void } {
  let nextId = 1;
  let queue = new Map<number, FrameRequestCallback>();
  const originalRequest = window.requestAnimationFrame;
  const originalCancel = window.cancelAnimationFrame;
  window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
    const id = nextId;
    nextId += 1;
    queue.set(id, callback);
    return id;
  };
  window.cancelAnimationFrame = (id: number): void => {
    queue.delete(id);
  };
  restores.push(() => {
    window.requestAnimationFrame = originalRequest;
    window.cancelAnimationFrame = originalCancel;
  });
  return {
    flushOne: (): void => {
      const batch = Array.from(queue.values());
      queue = new Map();
      for (const callback of batch) callback(16);
    },
  };
}

function contentInert(): boolean | undefined {
  const node = document.getElementById('apunta-content') as unknown as { inert?: boolean } | null;
  return node?.inert;
}

/** Enough of an element to name in a failure message without dumping a node. */
function nameOf(node: Element | null): string {
  if (node === null) return 'null';
  if (node.id !== '') return `#${node.id}`;
  const testId = node.getAttribute('data-testid');
  if (testId !== null) return `[data-testid="${testId}"]`;
  return node.tagName.toLowerCase();
}

function nameField(): HTMLInputElement {
  const node = document.getElementById('patient-name');
  if (node === null) throw new Error('the Add-patient name field is not in the DOM');
  return node as HTMLInputElement;
}

/** The spell layer's backdrop, which must still draw exactly what she typed. */
function backdropText(field: HTMLInputElement): string {
  return field.closest('.spell-wrap')?.firstElementChild?.textContent ?? '';
}

describe('the primary-window gate on a cold /patients/new', () => {
  it('(a) leaves the app out of `inert` while the window is still acquiring, with the prompt still up', () => {
    fakePractice();
    const pending = installDeferredLocks();
    installFrameStub();
    renderApp('/patients/new');

    // The opening probe is unanswered, so the window is still 'acquiring'.
    expect(pending).toHaveLength(1);
    expect(pending[0]?.ifAvailable).toBe(true);
    // The gate is the subject here, so the flag is asserted directly.
    expect(contentInert()).not.toBe(true);
    // …and the narrowing is not "remove the prompt": the blocker is still
    // covering everything, in its acquiring state.
    const blocker = screen.getByTestId('primary-blocker');
    expect(blocker.textContent).toContain('Opening Apunta');
    // The field behind it is there and is what the grant is about.
    expect(nameField()).toBeDefined();
  });

  it('(b) leaves the caret where she put it when the grant lands', async () => {
    fakePractice();
    const pending = installDeferredLocks();
    const frames = installFrameStub();
    renderApp('/patients/new');
    const name = nameField();

    // 1. One frame after the mount, so `PrimaryBlocker`'s own focus frame has
    //    already run. That is the late cold load, which is the case the
    //    recency storm produces: the state under test is the caret on the
    //    blocker's dialog div, not the fast path's.
    frames.flushOne();
    expect(document.activeElement).not.toBe(name);

    // 2. The gesture she makes as the window unblocks: focus the name and
    //    type, while the phase is still 'acquiring' and before the grant.
    expect(pending).toHaveLength(1);
    name.focus();
    fireEvent.change(name, { target: { value: 'Teh' } });
    expect(document.activeElement).toBe(name);
    expect(name.value).toBe('Teh');

    // 3. Release the grant, then flush one more frame before anything is
    //    asserted: `becomePrimary`'s rAF does its work in a frame, so an
    //    assertion taken inside the releasing `act()` would read the field
    //    here too and pin nothing.
    await act(async () => {
      pending[0]?.grant();
    });
    frames.flushOne();
    console.warn(
      `S2.11 case (b): document.activeElement after the post-release frame is ${nameOf(document.activeElement)}`,
    );

    // The app does not move the caret. On the base tree this read
    // `#apunta-content`, because `becomePrimary` ran the same move on the
    // initial grant; the value itself lives in `AddPatient`'s state and is
    // never the thing at risk.
    expect(document.activeElement).toBe(name);
    expect(nameField().value).toBe('Teh');
  });

  it('(c) still lands the keyboard in the app after a takeover', async () => {
    fakePractice();
    const pending = installDeferredLocks();
    const frames = installFrameStub();
    renderApp('/patients/new');

    // A foreign holder under the app's own lock name, `apunta-primary-v1`
    // (`App.tsx:162`): the `ifAvailable` probe answers `null`, so this window
    // is `'secondary'` and covered.
    await act(async () => {
      pending[0]?.grantNull();
    });
    expect(screen.getByTestId('primary-takeover')).toBeDefined();

    fireEvent.click(screen.getByTestId('primary-takeover'));
    expect(pending).toHaveLength(1);
    expect(pending[0]?.ifAvailable).toBe(false);
    await act(async () => {
      pending[0]?.grant();
    });
    // The steal this case pins is also a frame, so one batch of the file's own
    // stub runs before the assertion — exactly as (b) does.
    frames.flushOne();

    // A takeover moves the caret back into the app it just unlocked. This is
    // the move that must survive the narrowing of the `'acquiring'` grant, and
    // it is the case that fails if the fix is made by deleting the rAF.
    expect(document.activeElement).toBe(document.getElementById('apunta-content'));
    expect(contentInert()).not.toBe(true);
  });

  it('(d) keeps a typed name and its spell layer through a burst of re-renders behind the window', async () => {
    fakePractice();
    renderApp('/patients/new');

    const dialog = await screen.findByTestId('add-patient-modal');
    const field = within(dialog).getByLabelText('Name') as HTMLInputElement;
    // One real frame, so any caret move the grant schedules has already
    // happened before this case puts the caret somewhere of its own.
    await new Promise((resolve) => {
      requestAnimationFrame(() => {
        resolve(undefined);
      });
    });
    field.focus();
    fireEvent.change(field, { target: { value: 'Teh' } });
    expect(field.value).toBe('Teh');

    // The shape `usePatientRecency` drives its six-at-a-time fan-out with:
    // many small state updates in the workspace, one per note fetched.
    const search = screen.getByLabelText('Search patients');
    for (const query of ['', 'j', 'jo', 'joh', 'john', 'jo', 'j', '']) {
      fireEvent.change(search, { target: { value: query } });
    }
    await waitFor(() => {
      expect(screen.getByText('John Smith')).toBeDefined();
    });

    // This case passes before the fix as well as after it. It is the standing
    // guard on the property the objective names, not a reproduction of the
    // emptying, and it is reported as such.
    const after = nameField();
    expect(after).toBe(field);
    expect(after.value).toBe('Teh');
    expect(backdropText(after)).toContain('Teh');
    expect(document.activeElement).toBe(after);
  });

  it('(e) keeps a known-blocked window `inert`, including while a takeover is under way', async () => {
    fakePractice();
    const pending = installDeferredLocks();
    installFrameStub();
    renderApp('/patients/new');

    await act(async () => {
      pending[0]?.grantNull();
    });
    expect(contentInert()).toBe(true);

    fireEvent.click(screen.getByTestId('primary-takeover'));
    // `pending === true`: the takeover branch replaces the decline button, so
    // its absence is the state (`App.tsx:566-579`).
    expect(screen.queryByTestId('primary-decline')).toBeNull();
    expect(screen.getByTestId('primary-blocker')).toBeDefined();
    expect(contentInert()).toBe(true);

    // And the gate opens again only once the takeover actually lands.
    await act(async () => {
      pending[0]?.grant();
    });
    expect(contentInert()).not.toBe(true);
  });
});

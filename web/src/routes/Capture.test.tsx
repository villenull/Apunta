import {
  MAX_RECORDING_SECONDS,
  PREVIEW_FIRST_MS,
  PREVIEW_INTERVAL_MS,
  PREVIEW_MAX_SECONDS,
  PREVIEW_SLOW_GAP_MS,
  t,
  WAV_CONTENT_TYPE,
} from '@apunta/shared';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, type InitialEntry } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingsProvider } from '../components/SettingsProvider.js';
import { SpellingProvider } from '../components/SpellingProvider.js';
import { I18nProvider } from '../lib/i18n.js';
import type * as RecorderModule from '../lib/recorder.js';
import { RecorderError, type RecorderHandlers } from '../lib/recorder.js';
import { installFakeApi, makeFormat, makePatient } from '../test/fakeApi.js';
import { Capture } from './Capture.js';

/**
 * The record path's failure states, which the Playwright run cannot reach.
 *
 * Chromium's fake microphone always works, so an e2e can only ever prove the
 * happy path. What actually needs holding down is what happens when it does
 * not: the device disappears mid-session, the recording hits the 60-minute
 * cap, or whisper is not installed — and in every one of those the recording
 * she already made has to survive, because the alternative is asking her to
 * speak the session again.
 *
 * The `Recorder` is mocked here, and only the `Recorder`: everything from the
 * WAV blob onwards is the real screen against the fake API.
 */

/** The mocked recorder, controllable from the test body. */
let handlers: RecorderHandlers = {};
let stopped: () => void = () => {};
let elapsed = 0;
let startFailure: Error | null = null;
/** Where the mock recorder says she paused, for the preview's commit; null for no pause. */
let cutAt: number | null = null;

vi.mock('../lib/recorder.js', async (importOriginal) => {
  const actual = await importOriginal<typeof RecorderModule>();
  class MockRecorder {
    constructor(given: RecorderHandlers = {}) {
      handlers = given;
    }
    get seconds(): number {
      return elapsed;
    }
    start(): Promise<void> {
      return startFailure ? Promise.reject(startFailure) : Promise.resolve();
    }
    stop(): Promise<Blob> {
      stopped();
      // 44 bytes of header and a little audio: what the real recorder returns.
      return Promise.resolve(new Blob([new Uint8Array(1000)], { type: WAV_CONTENT_TYPE }));
    }
    /** The whole recording, for the note. */
    snapshot(): Blob | null {
      return new Blob([new Uint8Array(1000)], { type: WAV_CONTENT_TYPE });
    }
    /** A stretch of it, which the live preview transcribes. */
    slice(_from: number, _to: number): Blob | null {
      return new Blob([new Uint8Array(1000)], { type: WAV_CONTENT_TYPE });
    }
    cutPoint(_after: number, _before: number): number | null {
      return cutAt;
    }
    quietestPoint(_after: number, _before: number): number | null {
      return null;
    }
    cancel(): void {}
  }
  return { ...actual, Recorder: MockRecorder };
});

const progressNote = makeFormat('Progress note', ['Subjective', 'Objective', 'Assessment', 'Plan']);
const john = makePatient('John Smith');
type TestRouter = Parameters<typeof RouterProvider>[0]['router'];
let activeRouter: TestRouter | null = null;

/** Stands in for the workspace `AppRoutes` keeps mounted behind the window. */
function WorkspaceStub(): React.JSX.Element {
  return <div data-testid="workspace-stub" />;
}

/**
 * `Capture` on its own, with the routes it navigates to.
 *
 * The background half of the window belongs to `AppRoutes` — the workspace is
 * mounted there, from the `backgroundLocation` the entry points put in the
 * navigation state — so this file renders the route by itself and asserts what
 * the modal does and where it sends her. Nothing here expects a workspace
 * behind the window, and the providers are the three `App` puts above the
 * router, which is where `SpellLayer` and the catalogues come from.
 */
function renderCapture(initialEntries: InitialEntry[] = [`/capture/${john.id}`]): TestRouter {
  activeRouter = createMemoryRouter(
    [
      { path: '/', element: <WorkspaceStub /> },
      { path: '/onboarding/format', element: <p data-testid="format-onboarding" /> },
      { path: '/capture/:patientId', element: <Capture /> },
    ],
    { initialEntries },
  );
  render(
    <SettingsProvider>
      <I18nProvider>
        <SpellingProvider>
          <RouterProvider router={activeRouter} />
        </SpellingProvider>
      </I18nProvider>
    </SettingsProvider>,
  );
  return activeRouter;
}

async function startRecording(): Promise<void> {
  await screen.findByText(`New note for ${john.name}`);
  fireEvent.click(screen.getByTestId('record-start'));
  await screen.findByTestId('record-panel');
}

beforeEach(() => {
  handlers = {};
  stopped = () => {};
  elapsed = 0;
  startFailure = null;
  cutAt = null;
});

afterEach(() => {
  activeRouter?.dispose();
  activeRouter = null;
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('recording on the capture screen', () => {
  it('records, uploads, and lands on the note the transcript produced', async () => {
    const api = installFakeApi({ formats: [progressNote], patients: [john] });
    renderCapture();
    await startRecording();

    elapsed = 12;
    fireEvent.click(screen.getByTestId('record-stop'));

    // Transcription and drafting are one continuous run on this screen: the
    // progress line is live from the moment the upload starts, and the draft
    // assembles under it without a second wait.
    expect(await screen.findByTestId('draft-progress')).toBeTruthy();
    const preview = await screen.findByTestId('draft-preview');
    expect(screen.getByTestId('draft-status-label').textContent).not.toMatch(/%/);
    expect(preview.textContent).toContain('Subjective');
    expect(preview.textContent).not.toContain('{"');

    // And then it lands on the note the recording produced: the workspace is
    // handed that patient's workspace route with the new note selected, which is
    // the contract `AppRoutes` refreshes on.
    await waitFor(() => {
      expect(activeRouter?.state.location.search).toContain('note=');
    });
    expect(activeRouter?.state.location.pathname).toBe('/');
    expect(api.state.notes).toHaveLength(1);
    expect(activeRouter?.state.location.search).toContain(`note=${api.state.notes[0]?.id}`);
    const leaveAfterSave = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(leaveAfterSave);
    expect(leaveAfterSave.defaultPrevented).toBe(false);

    // It went to /api/transcribe, not /api/generate: the typed path would have
    // silently dropped the recording. The model preload was fired at start,
    // before this upload began.
    expect(api.calls).toContain('POST /api/transcribe/preload');
    expect(api.calls).toContain('POST /api/transcribe');
    expect(api.calls).not.toContain('POST /api/generate');
  });

  it('offers no microphone for a patient the server no longer knows', async () => {
    installFakeApi({ formats: [progressNote], patients: [john] });
    renderCapture(['/capture/01a00000-0000-7000-8000-000000000000']);

    expect((await screen.findByTestId('capture-missing-patient')).textContent).toContain('Back to patients');
    expect(screen.queryByTestId('record-start')).toBeNull();
  });

  it('sends what she typed alongside the recording', async () => {
    installFakeApi({ formats: [progressNote], patients: [john] });
    const uploads: FormData[] = [];
    const realFetch = globalThis.fetch;
    vi.stubGlobal('fetch', (path: string, init: RequestInit = {}) => {
      if (path === '/api/transcribe' && init.body instanceof FormData) uploads.push(init.body);
      return realFetch(path, init);
    });

    renderCapture();
    await screen.findByText(`New note for ${john.name}`);
    fireEvent.change(screen.getByTestId('summary-input'), {
      target: { value: 'Also mention the sleep log.' },
    });
    fireEvent.click(screen.getByTestId('record-start'));
    await screen.findByTestId('record-panel');
    fireEvent.click(screen.getByTestId('record-stop'));

    await waitFor(() => {
      expect(uploads).toHaveLength(1);
    });
    expect(uploads[0]?.get('typed_notes')).toBe('Also mention the sleep log.');
    expect(uploads[0]?.get('audio')).toBeInstanceOf(Blob);
  });

  /**
   * The 60-minute stop. The recorder enforces the cap on the samples; the
   * screen's job is to say so and process what it has rather than throwing an
   * hour of speech away.
   */
  it('stops at the cap, says so, and processes what was recorded', async () => {
    const api = installFakeApi({ formats: [progressNote], patients: [john] });
    renderCapture();
    await startRecording();

    elapsed = MAX_RECORDING_SECONDS;
    handlers.onLimit?.();

    expect(await screen.findByTestId('record-notice')).toHaveProperty(
      'textContent',
      expect.stringContaining('Recording stopped at 60 minutes'),
    );
    // What was recorded is processed rather than thrown away.
    await waitFor(() => {
      expect(api.calls).toContain('POST /api/transcribe');
    });
  });

  it('warns when the recording passes 30 minutes without stopping it', async () => {
    installFakeApi({ formats: [progressNote], patients: [john] });
    renderCapture();
    await startRecording();

    handlers.onProgress?.(31 * 60);

    expect(await screen.findByTestId('record-notice')).toHaveProperty(
      'textContent',
      expect.stringContaining('over 30 minutes'),
    );
    // Still recording: a warning is not a stop.
    expect(screen.getByTestId('record-panel')).toBeTruthy();
  });

  it('says what to do when the microphone is refused', async () => {
    installFakeApi({ formats: [progressNote], patients: [john] });
    // What `start` rejects with when the permission prompt is declined.
    startFailure = new RecorderError('permission', 'getUserMedia failed');

    renderCapture();
    await screen.findByText(`New note for ${john.name}`);
    fireEvent.click(screen.getByTestId('record-start'));

    expect(await screen.findByTestId('capture-error')).toHaveProperty(
      'textContent',
      expect.stringContaining('permission to use the microphone'),
    );
    // Back to the start, so she can try again once she has allowed it.
    expect(screen.getByTestId('record-start')).toBeTruthy();
  });

  it('reports a microphone that disappears mid-recording', async () => {
    installFakeApi({ formats: [progressNote], patients: [john] });
    renderCapture();
    await startRecording();

    handlers.onError?.(new RecorderError('lost-device', 'the audio track ended'));

    expect(await screen.findByTestId('capture-error')).toHaveProperty(
      'textContent',
      expect.stringContaining('stopped part-way through'),
    );
  });

  /**
   * The point of holding the WAV in the tab: whisper not being installed is a
   * setup problem she fixes in a minute, and it must not cost her the session
   * she just recorded.
   */
  it('keeps the recording when transcription fails, and re-sends it on retry', async () => {
    const api = installFakeApi(
      { formats: [progressNote], patients: [john] },
      {
        transcribeError: {
          code: 'whisper_missing',
          message: "Apunta can't find whisper on this machine…",
        },
      },
    );
    renderCapture();
    await startRecording();
    fireEvent.click(screen.getByTestId('record-stop'));

    expect(await screen.findByTestId('capture-error')).toHaveProperty(
      'textContent',
      expect.stringContaining("can't find whisper"),
    );

    const again = await screen.findByTestId('record-retry');
    expect(screen.getByTestId('record-done').textContent).toContain('Recording ready');

    fireEvent.click(again);
    await waitFor(() => {
      expect(api.calls.filter((call) => call === 'POST /api/transcribe')).toHaveLength(2);
    });
  });

  /**
   * S2.4 Fixed decision 2: `Mac` here is a keep-as-is token *inside* a
   * translatable sentence. The allowlist matches whole strings only, so the
   * sentence is one key with `Mac` written out verbatim in both catalogues —
   * never allowlisted, never dropped, never split off into a key of its own.
   */
  it('keeps Mac verbatim inside the recorded sentence, and the timer as data', async () => {
    installFakeApi(
      { formats: [progressNote], patients: [john] },
      { transcribeError: { code: 'whisper_missing', message: 'no whisper here' } },
    );
    renderCapture();
    await startRecording();
    fireEvent.click(screen.getByTestId('record-stop'));

    const done = await screen.findByTestId('record-done');
    // The timer is whatever `formatTimer` printed, so the assertion is on the
    // sentence with a fixed timer and on the shape the screen rendered.
    expect(done.textContent).toMatch(/recorded\. Nothing has left this Mac\./);
    expect(t('capture.recorded', { timer: '0:03' }, 'en')).toBe('0:03 recorded. Nothing has left this Mac.');
    // …and the Spanish value keeps `Mac` too, because it is a product name.
    expect(t('capture.recorded', { timer: '0:03' }, 'es-MX')).toBe(
      '0:03 de grabación. Nada ha salido de esta Mac.',
    );
  });

  it('discards the recording when she asks it to', async () => {
    const api = installFakeApi(
      { formats: [progressNote], patients: [john] },
      { transcribeError: { code: 'whisper_missing', message: 'no whisper here' } },
    );
    renderCapture();
    await startRecording();
    fireEvent.click(screen.getByTestId('record-stop'));

    fireEvent.click(await screen.findByTestId('record-discard'));

    expect(screen.queryByTestId('record-done')).toBeNull();
    expect(screen.getByTestId('record-start')).toBeTruthy();
    // Nothing was re-sent, and "Process note" has nothing to send either.
    expect(api.calls.filter((call) => call === 'POST /api/transcribe')).toHaveLength(1);
    expect(screen.getByTestId('process-note')).toHaveProperty('disabled', true);
  });
});

describe('unfinished capture navigation protection', () => {
  it('keeps typed and recording work on Stay, then discards it on approval', async () => {
    const api = installFakeApi({ formats: [progressNote], patients: [john] });
    renderCapture();
    await startRecording();
    fireEvent.change(screen.getByTestId('summary-input'), {
      target: { value: 'Keep this alongside the recording.' },
    });

    fireEvent.click(screen.getByTestId('capture-close'));
    expect(await screen.findByRole('dialog', { name: 'Leave this unfinished note?' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Stay' }));
    expect(screen.getByTestId('record-panel')).toBeTruthy();
    expect(screen.getByTestId('summary-input')).toHaveProperty('value', 'Keep this alongside the recording.');
    expect(screen.queryByRole('dialog', { name: 'Leave this unfinished note?' })).toBeNull();

    fireEvent.click(screen.getByTestId('capture-close'));
    fireEvent.click(await screen.findByRole('button', { name: 'Discard and leave' }));
    await waitFor(() => {
      expect(screen.queryByTestId('capture-modal')).toBeNull();
    });
    // The window is gone and the practice is back, with the recording never
    // having been uploaded.
    expect(api.calls).not.toContain('POST /api/transcribe');
    expect(screen.getByTestId('workspace-stub')).toBeTruthy();
  });
  it('guards browser unload while typed work is pending', async () => {
    installFakeApi({ formats: [progressNote], patients: [john] });
    renderCapture();
    await screen.findByTestId('summary-input');

    const cleanLeave = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(cleanLeave);
    expect(cleanLeave.defaultPrevented).toBe(false);

    fireEvent.change(screen.getByTestId('summary-input'), { target: { value: 'Unfinished text.' } });
    const pendingLeave = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(pendingLeave);
    expect(pendingLeave.defaultPrevented).toBe(true);
  });
});

/**
 * Capture as a window over the practice (owner, 2026-10-05) rather than a
 * screen of its own: the same fields and options, a × instead of a Back link,
 * Escape as the same door, and every protection the screen had — the leave
 * confirmation, the browser's own Back, the unload guard.
 *
 * What is mounted *behind* the window belongs to `AppRoutes` and to
 * `App.test.tsx`; this block is about the window itself.
 */
describe('the new-note window', () => {
  it('is a named dialog with the editor focused, and no Back link', async () => {
    installFakeApi({ formats: [progressNote], patients: [john] });
    renderCapture();

    const modal = (await screen.findByTestId('capture-modal')) as HTMLElement;
    expect(modal.getAttribute('role')).toBe('dialog');
    // Named for what it is — `Dialog`'s `aria-label`, since the heading is
    // rendered as its own row rather than as the panel's title element.
    expect(screen.getByRole('dialog', { name: `New note for ${john.name}` })).toBeTruthy();
    expect(within(modal).getByLabelText('Close new note')).toBeTruthy();
    // The Back link the screen carried is gone; the × is the way out.
    expect(modal.querySelector('.back')).toBeNull();

    // The caret lands in the summary, not on the × that precedes it.
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByTestId('summary-input'));
    });
  });

  it('keeps every field and option the screen had', async () => {
    installFakeApi({ formats: [progressNote], patients: [john] });
    renderCapture();

    const modal = await screen.findByTestId('capture-modal');
    expect(within(modal).getByLabelText('Note format')).toBeTruthy();
    expect(within(modal).getByText('Progress note')).toBeTruthy();
    expect(within(modal).getByText('Record audio')).toBeTruthy();
    expect(within(modal).getByText('Type notes')).toBeTruthy();
    expect(within(modal).getByLabelText('Session summary')).toBeTruthy();
    // Nothing to send yet, so the button is there and disabled — the same
    // button, the same rule.
    expect(screen.getByTestId('process-note')).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByTestId('summary-input'), { target: { value: 'A quiet week.' } });
    expect(screen.getByTestId('process-note')).toHaveProperty('disabled', false);
  });

  it('closes on the × and on Escape, landing on the patient workspace', async () => {
    installFakeApi({ formats: [progressNote], patients: [john] });
    const router = renderCapture();
    await screen.findByTestId('capture-modal');

    fireEvent.click(screen.getByTestId('capture-close'));
    await waitFor(() => {
      expect(screen.queryByTestId('capture-modal')).toBeNull();
    });
    // A URL typed straight into the address bar has no in-app history to pop,
    // so it leaves for the patient's own workspace — and with a replace, so
    // Back cannot walk back into a window that is already closed.
    expect(router?.state.location.pathname).toBe('/');
    expect(router?.state.location.search).toBe(`?patient=${john.id}`);
    expect(screen.getByTestId('workspace-stub')).toBeTruthy();

    // And the keyboard way out is the same door.
    renderCapture();
    await screen.findByTestId('capture-modal');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByTestId('capture-modal')).toBeNull();
    });
  });

  /**
   * Opened from inside the app, the × pops the capture entry rather than pushing
   * the workspace over it — otherwise Back would reopen the window.
   *
   * `history.state.idx` is react-router's own depth counter, read the way
   * `AddPatient` reads it, and a memory router keeps it in its own history
   * rather than the browser's; so the browser side of that fact is stubbed for
   * this test and restored after it. The assertion that tells the two closes
   * apart is the search string: popping lands on the entry the window was
   * opened from, where the fallback would replace with `?patient=…`.
   */
  it('pops back to the route it was opened over when there is in-app history', async () => {
    installFakeApi({ formats: [progressNote], patients: [john] });
    const descriptor = Object.getOwnPropertyDescriptor(window.history, 'state');
    Object.defineProperty(window.history, 'state', { configurable: true, value: { idx: 2 } });
    try {
      const router = renderCapture([
        { pathname: '/', search: '', hash: '', state: null, key: 'home' },
        {
          pathname: `/capture/${john.id}`,
          search: '',
          hash: '',
          state: { backgroundLocation: { pathname: '/', search: '', hash: '', state: null, key: 'home' } },
          key: 'capture',
        },
      ]);
      await screen.findByTestId('capture-modal');

      fireEvent.click(screen.getByTestId('capture-close'));

      await waitFor(() => {
        expect(screen.queryByTestId('capture-modal')).toBeNull();
      });
      expect(router.state.location.pathname).toBe('/');
      expect(router.state.location.search).toBe('');
      expect(screen.getByTestId('workspace-stub')).toBeTruthy();
    } finally {
      if (descriptor === undefined) {
        Reflect.deleteProperty(window.history, 'state');
      } else {
        Object.defineProperty(window.history, 'state', descriptor);
      }
    }
  });

  /**
   * C1: two live `Dialog`s would each handle Escape, so one keypress would both
   * raise the confirmation and cancel it. The window closes while the
   * confirmation is up, and the confirmation is a sibling of it — never inside
   * the panel that is hidden.
   */
  it('shows one modal at a time: Escape on the confirmation stays, it does not close', async () => {
    installFakeApi({ formats: [progressNote], patients: [john] });
    renderCapture();
    await screen.findByTestId('summary-input');
    fireEvent.change(screen.getByTestId('summary-input'), { target: { value: 'Half-written.' } });

    fireEvent.click(screen.getByTestId('capture-close'));
    const confirm = await screen.findByRole('dialog', { name: 'Leave this unfinished note?' });

    // Two role=dialog elements, and the capture panel is the hidden one.
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(2);
    expect(screen.getByTestId('capture-modal').getAttribute('aria-hidden')).toBe('true');
    expect(confirm.contains(screen.getByTestId('capture-modal'))).toBe(false);

    // One Escape, handled by the confirmation: back to work, nothing lost.
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Leave this unfinished note?' })).toBeNull();
    });
    expect(screen.getByTestId('capture-modal').getAttribute('aria-hidden')).toBe('false');
    expect(screen.getByTestId('summary-input')).toHaveProperty('value', 'Half-written.');
  });

  it('keeps the browser Back guarded, and Forward brings the window back', async () => {
    installFakeApi({ formats: [progressNote], patients: [john] });
    const router = renderCapture(['/', `/capture/${john.id}`]);
    await screen.findByTestId('summary-input');
    fireEvent.change(screen.getByTestId('summary-input'), { target: { value: 'Still writing.' } });

    // Back with work in hand raises the same confirmation the × does. The
    // navigation itself is not awaited: a blocked navigation stays pending
    // until she answers, so the call is fired inside a synchronous `act` and
    // the assertion waits for the confirmation to appear.
    act(() => {
      void router?.navigate(-1);
    });
    expect(await screen.findByRole('dialog', { name: 'Leave this unfinished note?' })).toBeTruthy();
    expect(screen.getByTestId('summary-input')).toHaveProperty('value', 'Still writing.');

    // Discard it, and Back completes: the workspace, not the window.
    fireEvent.click(await screen.findByRole('button', { name: 'Discard and leave' }));
    await waitFor(() => {
      expect(router?.state.location.pathname).toBe('/');
    });
    expect(screen.queryByTestId('capture-modal')).toBeNull();

    // Forward reopens the window, still empty, because nothing was kept.
    act(() => {
      void router?.navigate(1);
    });
    expect(await screen.findByTestId('capture-modal')).toBeTruthy();
    expect(screen.getByTestId('summary-input')).toHaveProperty('value', '');
  });
});

/**
 * The live half of the recording UI (owner-proxy, 2026-09-01). Its whole job
 * is reassurance: the meter answers "is this hearing me" from the audio
 * frames themselves, and the provisional words answer "are they coming out
 * right" once whisper has had time to load and listen.
 */
describe('while the recording is still going', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('breathes with her voice through the dot, and says it is listening before any words arrive', async () => {
    installFakeApi({ formats: [progressNote], patients: [john] });
    renderCapture();
    await startRecording();

    // Silence, and the room's own noise: the dot is at rest. Any voice lifts
    // it clearly past half; it does not report a level.
    const dot = screen.getByTestId('record-dot');
    expect(dot.style.getPropertyValue('--level')).toBe('0');
    act(() => {
      handlers.onLevel?.(0.01);
    });
    expect(dot.style.getPropertyValue('--level')).toBe('0');
    act(() => {
      handlers.onLevel?.(0.2);
    });
    expect(Number(dot.style.getPropertyValue('--level'))).toBeGreaterThan(0.5);
    expect(screen.queryByTestId('record-level')).toBeNull();
    // Nothing transcribed yet, so it says it is listening rather than
    // pretending to have heard something.
    expect(screen.getByTestId('record-preview').textContent).toContain('Listening');
  });

  it('shows the provisional words, and says they are not the note', async () => {
    installFakeApi({ formats: [progressNote], patients: [john] }, { previewText: 'steady week so far' });
    renderCapture();
    await startRecording();

    // The first refresh is on a timer; drive it rather than waiting for it.
    await act(async () => {
      vi.advanceTimersByTime(PREVIEW_FIRST_MS + 100);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByTestId('record-preview').textContent).toContain('steady week so far');
    });
    expect(screen.getByTestId('record-preview').textContent).toContain('written from the finished recording');
  });

  it('grows the block: words committed at a pause stay, and the tail keeps coming', async () => {
    installFakeApi(
      { formats: [progressNote], patients: [john] },
      { previewTexts: ['steady week', 'steady week so far,', 'then the plan'] },
    );
    renderCapture();
    await startRecording();

    await act(async () => {
      vi.advanceTimersByTime(PREVIEW_FIRST_MS + 100);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(screen.getByTestId('record-preview-text').textContent).toContain('steady week');
    });

    // Twenty-five seconds in, with a pause at twelve: the next refresh commits
    // the chunk up to the pause, and the one after appends the tail to it.
    elapsed = 25;
    cutAt = 12;
    await act(async () => {
      vi.advanceTimersByTime(PREVIEW_INTERVAL_MS + 100);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(screen.getByTestId('record-preview-text').textContent).toBe('steady week so far,');
    });

    cutAt = null;
    await act(async () => {
      vi.advanceTimersByTime(PREVIEW_INTERVAL_MS + 100);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(screen.getByTestId('record-preview-text').textContent).toBe('steady week so far, then the plan');
    });
  });

  it('keeps growing after four minutes, only slower', async () => {
    installFakeApi(
      { formats: [progressNote], patients: [john] },
      { previewTexts: ['early words', 'later words'] },
    );
    renderCapture();
    await startRecording();

    await act(async () => {
      vi.advanceTimersByTime(PREVIEW_FIRST_MS + 100);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(screen.getByTestId('record-preview-text').textContent).toContain('early words');
    });

    elapsed = PREVIEW_MAX_SECONDS + 1;
    await act(async () => {
      vi.advanceTimersByTime(PREVIEW_SLOW_GAP_MS + 100);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(screen.getByTestId('record-preview-text').textContent).toContain('later words');
    });
  });
});

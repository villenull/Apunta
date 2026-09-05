import {
  MAX_RECORDING_SECONDS,
  PREVIEW_FIRST_MS,
  PREVIEW_INTERVAL_MS,
  PREVIEW_MAX_SECONDS,
  PREVIEW_SLOW_GAP_MS,
  WAV_CONTENT_TYPE,
} from '@apunta/shared';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../App.js';
import type * as RecorderModule from '../lib/recorder.js';
import { RecorderError, type RecorderHandlers } from '../lib/recorder.js';
import { installFakeApi, makeFormat, makePatient } from '../test/fakeApi.js';

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

function renderCapture(): void {
  render(
    <MemoryRouter initialEntries={[`/capture/${john.id}`]}>
      <App />
    </MemoryRouter>,
  );
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
    expect(preview.textContent).toContain('Subjective');
    expect(preview.textContent).not.toContain('{"');

    // And then it lands on the note the recording produced.
    expect(await screen.findByTestId('note-body')).toBeDefined();

    // It went to /api/transcribe, not /api/generate: the typed path would have
    // silently dropped the recording.
    expect(api.calls).toContain('POST /api/transcribe');
    expect(api.calls).not.toContain('POST /api/generate');
  });

  it('offers no microphone for a patient the server no longer knows', async () => {
    installFakeApi({ formats: [progressNote], patients: [john] });
    render(
      <MemoryRouter initialEntries={['/capture/01a00000-0000-7000-8000-000000000000']}>
        <App />
      </MemoryRouter>,
    );

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

    // Silence: the dot is at rest. A frame with sound in it moves it.
    const dot = screen.getByTestId('record-dot');
    expect(dot.style.getPropertyValue('--level')).toBe('0');
    act(() => {
      handlers.onLevel?.(0.2);
    });
    expect(Number(dot.style.getPropertyValue('--level'))).toBeCloseTo(0.5, 5);
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

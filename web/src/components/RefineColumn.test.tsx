import { PREVIEW_FIRST_MS, type ChatNoteUpdatedEvent } from '@apunta/shared';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as RecorderModule from '../lib/recorder.js';
import { RecorderError, type RecorderHandlers } from '../lib/recorder.js';
import { installFakeApi, makeFormat, makeNote, makePatient } from '../test/fakeApi.js';
import { NOTHING_HEARD_MESSAGE, RefineColumn } from './RefineColumn.js';

/**
 * Dictating into the refine chat's composer (2026-09-07).
 *
 * As on the capture screen, the `Recorder` is mocked and nothing else: the
 * clip it hands back goes through the real `dictateClip` to the fake API, and
 * what lands in the box is what the fake server said.
 */

let handlers: RecorderHandlers = {};
let startFailure: Error | null = null;
let elapsed = 0;

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
      return Promise.resolve(new Blob([new Uint8Array(1000)], { type: 'audio/wav' }));
    }
    slice(_from: number, _to: number): Blob | null {
      return new Blob([new Uint8Array(1000)], { type: 'audio/wav' });
    }
    cutPoint(_after: number, _before: number): number | null {
      return null;
    }
    quietestPoint(_after: number, _before: number): number | null {
      return null;
    }
    cancel(): void {}
  }
  return { ...actual, Recorder: MockRecorder };
});

const progressNote = makeFormat('Progress note', ['Subjective', 'Plan']);
const john = makePatient('John Smith', { note_count: 1 });
const draft = makeNote(john.id, { content: 'Subjective: Improved sleep.\n\nPlan: Continue weekly.' });

function renderChat(onNoteUpdated: (event: ChatNoteUpdatedEvent) => void | Promise<void> = () => {}): void {
  render(
    <RefineColumn
      key={draft.id}
      note={draft}
      refQuote={null}
      onClearRefQuote={() => {}}
      onNoteUpdated={onNoteUpdated}
    />,
  );
}

beforeEach(() => {
  handlers = {};
  startFailure = null;
  elapsed = 3;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('dictating into the composer', () => {
  it('listens, then puts what whisper heard into the box, after anything already typed', async () => {
    installFakeApi(
      { formats: [progressNote], patients: [john], notes: [draft] },
      { dictationText: 'Add that he is sleeping better this week.' },
    );
    renderChat();
    const input = screen.getByTestId('chat-input');
    fireEvent.change(input, { target: { value: 'Also,' } });

    const mic = screen.getByTestId('chat-mic');
    expect(mic.getAttribute('aria-label')).toBe('Dictate a message');
    fireEvent.click(mic);

    await waitFor(() => {
      expect(screen.getByTestId('chat-mic').getAttribute('aria-label')).toBe('Stop dictating');
    });
    handlers.onProgress?.(7);
    await waitFor(() => {
      expect(screen.getByTestId('chat-mic-timer').textContent).toBe('00:07');
    });

    fireEvent.click(screen.getByTestId('chat-mic'));
    await waitFor(() => {
      expect((input as HTMLInputElement).value).toBe('Also, Add that he is sleeping better this week.');
    });
    expect(screen.getByTestId('chat-mic').getAttribute('aria-label')).toBe('Dictate a message');
    // Nothing was sent: the words are hers to read first.
    expect(
      screen.queryByText('Add that he is sleeping better this week.', { selector: '.chat-msg *' }),
    ).toBeNull();
  });

  it('says so when whisper heard no words, and leaves the box alone', async () => {
    installFakeApi({ formats: [progressNote], patients: [john], notes: [draft] }, { dictationText: '   ' });
    renderChat();

    fireEvent.click(screen.getByTestId('chat-mic'));
    await waitFor(() => {
      expect(screen.getByTestId('chat-mic').getAttribute('aria-label')).toBe('Stop dictating');
    });
    fireEvent.click(screen.getByTestId('chat-mic'));

    await screen.findByText(NOTHING_HEARD_MESSAGE);
    expect((screen.getByTestId('chat-input') as HTMLInputElement).value).toBe('');
  });

  it('shows the server’s own words when whisper cannot transcribe', async () => {
    installFakeApi(
      { formats: [progressNote], patients: [john], notes: [draft] },
      {
        dictationError: {
          status: 503,
          code: 'ai_unavailable',
          message: 'Speech-to-text is not installed. See Setup.',
        },
      },
    );
    renderChat();

    fireEvent.click(screen.getByTestId('chat-mic'));
    await waitFor(() => {
      expect(screen.getByTestId('chat-mic').getAttribute('aria-label')).toBe('Stop dictating');
    });
    fireEvent.click(screen.getByTestId('chat-mic'));

    await screen.findByText('Speech-to-text is not installed. See Setup.');
    expect(screen.getByTestId('chat-mic').getAttribute('aria-label')).toBe('Dictate a message');
  });

  it('reports a microphone it could not open, in the recorder’s words', async () => {
    installFakeApi({ formats: [progressNote], patients: [john], notes: [draft] });
    startFailure = new RecorderError('permission', 'getUserMedia failed');
    renderChat();

    fireEvent.click(screen.getByTestId('chat-mic'));

    await screen.findByText(/microphone/i);
    expect(screen.getByTestId('chat-mic').getAttribute('aria-label')).toBe('Dictate a message');
  });

  it('shows the capture screen’s panel while listening: the dot, the timer and the growing words', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    installFakeApi(
      { formats: [progressNote], patients: [john], notes: [draft] },
      { previewText: 'add that he is sleeping', dictationText: 'Add that he is sleeping better.' },
    );
    renderChat();

    fireEvent.click(screen.getByTestId('chat-mic'));
    await screen.findByTestId('record-panel');
    expect(screen.getByTestId('record-preview').textContent).toContain('Listening');

    const dot = screen.getByTestId('record-dot');
    expect(dot.style.getPropertyValue('--level')).toBe('0');
    act(() => {
      handlers.onLevel?.(0.2);
    });
    expect(Number(dot.style.getPropertyValue('--level'))).toBeGreaterThan(0.5);

    // The first refresh is on a timer; drive it rather than waiting for it.
    await act(async () => {
      vi.advanceTimersByTime(PREVIEW_FIRST_MS + 100);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(screen.getByTestId('record-preview-text').textContent).toContain('add that he is sleeping');
    });
    expect(screen.getByTestId('record-preview').textContent).toContain('written from the finished recording');
    // The quick actions step aside while the panel is up.
    expect(screen.queryByText('Shorter')).toBeNull();

    fireEvent.click(screen.getByTestId('record-stop'));
    await waitFor(() => {
      expect((screen.getByTestId('chat-input') as HTMLInputElement).value).toBe(
        'Add that he is sleeping better.',
      );
    });
    expect(screen.queryByTestId('record-panel')).toBeNull();
    expect(screen.getByText('Shorter')).toBeTruthy();
    vi.useRealTimers();
  });

  it('keeps the send arrow live with an empty box, and an empty send does nothing', async () => {
    const api = installFakeApi({ formats: [progressNote], patients: [john], notes: [draft] });
    renderChat();

    const send = screen.getByTestId('chat-send');
    expect((send as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(send);
    await waitFor(() => {
      expect(api.state.messages).toHaveLength(0);
    });
  });
});

describe('refine completion ordering', () => {
  it('holds the assistant completion until the committed note is rendered', async () => {
    installFakeApi({ formats: [progressNote], patients: [john], notes: [draft] });
    let release!: () => void;
    const applied = new Promise<void>((resolve) => {
      release = resolve;
    });
    const onNoteUpdated = vi.fn(() => applied);
    renderChat(onNoteUpdated);

    fireEvent.change(screen.getByTestId('chat-input'), { target: { value: 'Make the plan shorter' } });
    fireEvent.click(screen.getByTestId('chat-send'));

    await waitFor(() => expect(onNoteUpdated).toHaveBeenCalledTimes(1));
    // A delayed render must keep the successful assistant bubble from
    // claiming completion while the editor is still applying the rewrite.
    expect(screen.queryByText('Shortened the Plan section.')).toBeNull();

    release();
    expect(await screen.findByText('Shortened the Plan section.')).toBeDefined();
  });
});

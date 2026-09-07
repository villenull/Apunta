import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

vi.mock('../lib/recorder.js', async (importOriginal) => {
  const actual = await importOriginal<typeof RecorderModule>();
  class MockRecorder {
    constructor(given: RecorderHandlers = {}) {
      handlers = given;
    }
    get seconds(): number {
      return 0;
    }
    start(): Promise<void> {
      return startFailure ? Promise.reject(startFailure) : Promise.resolve();
    }
    stop(): Promise<Blob> {
      return Promise.resolve(new Blob([new Uint8Array(1000)], { type: 'audio/wav' }));
    }
    cancel(): void {}
  }
  return { ...actual, Recorder: MockRecorder };
});

const progressNote = makeFormat('Progress note', ['Subjective', 'Plan']);
const john = makePatient('John Smith', { note_count: 1 });
const draft = makeNote(john.id, { content: 'Subjective: Improved sleep.\n\nPlan: Continue weekly.' });

function renderChat(): void {
  render(
    <RefineColumn
      key={draft.id}
      note={draft}
      refQuote={null}
      onClearRefQuote={() => {}}
      onNoteUpdated={() => {}}
    />,
  );
}

beforeEach(() => {
  handlers = {};
  startFailure = null;
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

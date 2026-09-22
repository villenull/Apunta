import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { installFakeApi, makeBrainstormMessage, makeNote, makePatient } from '../test/fakeApi.js';
import { BrainstormView } from './BrainstormView.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const CONTEXT = {
  notes: [{ id: '0198c0f0-0000-7000-8000-000000000011', title: 'Progress note', date: '2026-08-08' }],
  total: 1,
  dropped_note_ids: [],
  most_recent: true,
};

function threadJson(messages: unknown, context: unknown = CONTEXT): Response {
  return new Response(JSON.stringify({ messages, context }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('BrainstormView', () => {
  it('reloads the saved conversation, oldest first', async () => {
    const patient = makePatient('John Smith');
    const user = makeBrainstormMessage(patient.id, 'user', 'First thought?');
    const assistant = makeBrainstormMessage(patient.id, 'assistant', 'Thinking with the notes.');
    installFakeApi({ patients: [patient], brainstorm: [user, assistant] });

    render(<BrainstormView patient={patient} />);

    await screen.findByText('First thought?');
    const thread = screen.getByTestId('brainstorm-thread');
    const bubbles = within(thread).getAllByTestId('brainstorm-user');
    expect(bubbles).toHaveLength(1);
    expect(within(thread).getByTestId('brainstorm-reply').textContent).toContain('Thinking with the notes.');
    // The user's turn comes before the answer.
    expect(thread.textContent?.indexOf('First thought?')).toBeLessThan(
      thread.textContent?.indexOf('Thinking with the notes.') ?? 0,
    );
  });

  it('says what it is for when there is nothing yet', async () => {
    const patient = makePatient('Maria Ruiz');
    installFakeApi({ patients: [patient], notes: [], brainstorm: [] });

    render(<BrainstormView patient={patient} />);

    expect((await screen.findByTestId('brainstorm-empty')).textContent).toContain(
      'never written into their notes',
    );
  });

  it('sends on Enter and streams the reply into the thread', async () => {
    const patient = makePatient('John Smith');
    const api = installFakeApi({ patients: [patient], notes: [makeNote(patient.id)], brainstorm: [] });

    render(<BrainstormView patient={patient} />);
    await screen.findByTestId('brainstorm-empty');

    const input = screen.getByTestId('brainstorm-input') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'What stands out?' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });

    const reply = await screen.findByTestId('brainstorm-reply');
    expect(reply.textContent).toContain('Thinking with');
    expect(reply.textContent).toContain('John Smith');
    // Both turns persisted, in order.
    expect(api.state.brainstorm.map((message) => message.role)).toEqual(['user', 'assistant']);
    expect(api.state.brainstorm[0]?.text).toBe('What stands out?');
  });

  it('breaks the line on Shift+Enter instead of sending', async () => {
    const patient = makePatient('John Smith');
    const api = installFakeApi({ patients: [patient], brainstorm: [] });

    render(<BrainstormView patient={patient} />);
    await screen.findByTestId('brainstorm-empty');

    const input = screen.getByTestId('brainstorm-input') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'First line' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });

    expect(api.state.brainstorm).toHaveLength(0);
    expect(input.value).toBe('First line');
  });

  it('says which notes the model was given, and which it left out', async () => {
    const patient = makePatient('John Smith');
    installFakeApi({ patients: [patient], notes: [makeNote(patient.id)], brainstorm: [] });

    render(<BrainstormView patient={patient} />);

    const context = await screen.findByTestId('brainstorm-context');
    expect(context.textContent).toContain('Thinking with 1 note');
    fireEvent.click(within(context).getByText('Thinking with 1 note'));
    expect(context.textContent).toContain('Progress note');
    expect(context.textContent).toContain('2026-08-08');
  });

  it.each([
    [{ total: 30, most_recent: true }, 'Using the 2 most recent of 30 notes'],
    [{ total: 30, most_recent: false }, 'Using 2 of 30 notes'],
  ])('says plainly when notes were left out for space (%o)', async (shape, line) => {
    const patient = makePatient('John Smith');
    const notes = [
      { id: '0198c0f0-0000-7000-8000-000000000011', title: 'Progress note', date: '2026-08-08' },
      { id: '0198c0f0-0000-7000-8000-000000000012', title: 'Progress note', date: '2026-08-01' },
    ];
    const dropped = Array.from(
      { length: 28 },
      (_, index) => `0198c0f0-0000-7000-8000-0000000001${String(index).padStart(2, '0')}`,
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => threadJson([], { notes, dropped_note_ids: dropped, ...shape })),
    );

    render(<BrainstormView patient={patient} />);

    const context = await screen.findByTestId('brainstorm-context');
    expect(context.textContent).toContain(line);
  });

  it('renders a saved reply as Markdown, and never as elements', async () => {
    const patient = makePatient('John Smith');
    installFakeApi({
      patients: [patient],
      brainstorm: [
        makeBrainstormMessage(patient.id, 'user', 'Thought?'),
        makeBrainstormMessage(
          patient.id,
          'assistant',
          '**Sleep** is better.\n\n<img src=x onerror=alert(1)>',
        ),
      ],
    });

    render(<BrainstormView patient={patient} />);

    const reply = await screen.findByTestId('brainstorm-reply');
    expect(within(reply).getByText('Sleep').tagName).toBe('STRONG');
    expect(reply.querySelector('img')).toBeNull();
    expect(reply.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('stops the stream when she asks it to, keeping her turn and writing no answer', async () => {
    const patient = makePatient('John Smith');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit = {}) => {
        if ((init.method ?? 'GET') === 'GET') return threadJson([]);
        // The reply stream stays open until the Stop click aborts it.
        void url;
        const stream = new ReadableStream({ start() {} });
        return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
      }),
    );

    render(<BrainstormView patient={patient} />);
    await screen.findByTestId('brainstorm-empty');

    const input = screen.getByTestId('brainstorm-input') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'Take your time' } });
    fireEvent.click(screen.getByTestId('brainstorm-send'));

    fireEvent.click(await screen.findByTestId('brainstorm-stop'));

    await waitFor(() => {
      expect(screen.queryByTestId('brainstorm-stop')).toBeNull();
    });
    // Stopping is her choice: no error, her turn on screen, no answer written.
    expect(screen.queryByTestId('brainstorm-error')).toBeNull();
    expect(screen.getByTestId('brainstorm-user').textContent).toContain('Take your time');
    expect(screen.queryByTestId('brainstorm-reply')).toBeNull();
    expect((screen.getByTestId('brainstorm-send') as HTMLButtonElement).disabled).toBe(true);
  });

  it('reports a failure in the server’s own words and keeps nothing half-written', async () => {
    const patient = makePatient('John Smith');
    installFakeApi(
      { patients: [patient], brainstorm: [] },
      {
        brainstormError: {
          code: 'ollama_unreachable',
          message: "Apunta can't reach the local AI — see Setup.",
        },
      },
    );

    render(<BrainstormView patient={patient} />);
    await screen.findByTestId('brainstorm-empty');

    const input = screen.getByTestId('brainstorm-input') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'Are you there?' } });
    fireEvent.click(screen.getByTestId('brainstorm-send'));

    expect((await screen.findByTestId('brainstorm-error')).textContent).toContain(
      "Apunta can't reach the local AI",
    );
    expect(screen.queryByTestId('brainstorm-streaming')).toBeNull();
  });

  it('forgets the conversation only after she confirms, and the notes stay', async () => {
    const patient = makePatient('John Smith');
    const note = makeNote(patient.id);
    const api = installFakeApi({
      patients: [patient],
      notes: [note],
      brainstorm: [
        makeBrainstormMessage(patient.id, 'user', 'Forget me?'),
        makeBrainstormMessage(patient.id, 'assistant', 'A thought.'),
      ],
    });

    render(<BrainstormView patient={patient} />);
    await screen.findByTestId('brainstorm-reply');

    fireEvent.click(screen.getByTestId('brainstorm-new'));
    // Cancel first: the dialog must not have acted yet.
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByTestId('brainstorm-reply')).not.toBeNull();

    fireEvent.click(screen.getByTestId('brainstorm-new'));
    expect(screen.getByTestId('confirm-backdrop').textContent).toContain('notes stay exactly as they are');
    fireEvent.click(screen.getByTestId('confirm-accept'));

    await waitFor(() => {
      expect(screen.queryByTestId('brainstorm-reply')).toBeNull();
    });
    expect(api.state.brainstorm).toHaveLength(0);
    expect(api.state.notes).toHaveLength(1);
    expect((await screen.findByTestId('brainstorm-empty')).textContent).toContain('never written');
  });
});

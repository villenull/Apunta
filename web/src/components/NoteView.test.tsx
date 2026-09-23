import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { installFakeApi, makeFormat, makeNote, makePatient } from '../test/fakeApi.js';
import { NoteView } from './NoteView.js';

const patient = makePatient('John Smith');
const format = makeFormat('Progress note', ['Subjective', 'Plan']);

function renderNote() {
  const note = makeNote(patient.id, { content: 'Subjective: X' });
  const api = installFakeApi({ patients: [patient], formats: [format], notes: [note] });
  render(
    <NoteView
      patient={patient}
      note={note}
      format={format}
      onNoteChanged={() => undefined}
      onNoteDeleted={() => undefined}
    />,
  );
  return { api, note };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('refine outcomes', () => {
  /**
   * A withheld rewrite is an outcome, not an edit: the note is exactly as it
   * was, so the editor must not light up as though the chat had changed it.
   * The flash is what the "Updated …" line rides on, so both are asserted.
   */
  it('leaves the editor unlit when a guard withheld the rewrite', async () => {
    const note = makeNote(patient.id, { content: 'Subjective: X' });
    installFakeApi(
      { patients: [patient], formats: [format], notes: [note] },
      { chatOutcome: { outcome: 'withheld', reason: 'A safety guard protected the existing note content.' } },
    );
    render(
      <NoteView
        patient={patient}
        note={note}
        format={format}
        onNoteChanged={() => undefined}
        onNoteDeleted={() => undefined}
      />,
    );

    fireEvent.click(screen.getByTestId('chat-fab'));
    fireEvent.change(screen.getByTestId('chat-input'), { target: { value: 'Make the plan shorter' } });
    fireEvent.click(screen.getByTestId('chat-send'));

    // The stream has been applied once the thread shows the assistant's turn.
    await waitFor(() => {
      expect(screen.getAllByTestId('chat-msg').length).toBe(2);
    });
    expect(document.querySelector('.note-editable-wrap')?.className).not.toContain('is-refined');
    expect(screen.queryByTestId('note-updated-hint')).toBeNull();
    expect((screen.getByTestId('note-body') as HTMLTextAreaElement).value).toBe('Subjective: X');
  });
});

describe('autosave ordering', () => {
  it('persists an undo made before an older save response arrives', async () => {
    const { api, note } = renderNote();
    const baseFetch = vi.mocked(globalThis.fetch).getMockImplementation();
    if (baseFetch === undefined) throw new Error('fake fetch was not installed');

    let releaseFirst!: () => void;
    const firstResponse = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let delayed = true;
    vi.mocked(globalThis.fetch).mockImplementation(async (path, init) => {
      if (delayed && path === `/api/notes/${note.id}` && init?.method === 'PATCH') {
        delayed = false;
        await firstResponse;
      }
      return baseFetch(path, init);
    });

    const body = screen.getByTestId('note-body');
    fireEvent.change(body, { target: { value: 'Subjective: A' } });
    fireEvent.blur(body);
    fireEvent.change(body, { target: { value: 'Subjective: X' } });
    fireEvent.blur(body);

    await act(async () => {
      releaseFirst();
    });
    await waitFor(() => {
      expect(api.state.notes[0]?.content).toBe('Subjective: X');
      expect(screen.getByTestId('note-save-status').textContent).toBe('Saved');
    });
  });
});

describe('remote note changes', () => {
  it('quietly takes a newer server note when this editor has no local edit', async () => {
    const note = makeNote(patient.id, { content: 'Subjective: Original' });
    installFakeApi({ patients: [patient], formats: [format], notes: [note] });
    const view = render(
      <NoteView
        patient={patient}
        note={note}
        format={format}
        onNoteChanged={() => undefined}
        onNoteDeleted={() => undefined}
      />,
    );
    const remote = {
      ...note,
      content: 'Subjective: Updated in another window',
      revision: note.revision + 1,
      updated_at: '2026-08-08T09:01:00.000Z',
    };
    view.rerender(
      <NoteView
        patient={patient}
        note={remote}
        format={format}
        onNoteChanged={() => undefined}
        onNoteDeleted={() => undefined}
      />,
    );

    await waitFor(() => {
      expect((screen.getByTestId('note-body') as HTMLTextAreaElement).value).toBe(remote.content);
      expect(screen.getByTestId('note-save-status').textContent).toContain('Saved');
    });
    expect(screen.queryByTestId('note-conflict')).toBeNull();
  });

  it('keeps a remote conflict until she chooses and never retries it on unmount', async () => {
    const note = makeNote(patient.id, { content: 'Subjective: Original' });
    const api = installFakeApi({ patients: [patient], formats: [format], notes: [note] });
    const view = render(
      <NoteView
        patient={patient}
        note={note}
        format={format}
        onNoteChanged={() => undefined}
        onNoteDeleted={() => undefined}
      />,
    );
    fireEvent.change(screen.getByTestId('note-body'), {
      target: { value: 'Subjective: My unsaved edit' },
    });

    const remote = {
      ...note,
      content: 'Subjective: Saved in another window',
      revision: note.revision + 1,
      updated_at: '2026-08-08T09:01:00.000Z',
    };
    view.rerender(
      <NoteView
        patient={patient}
        note={remote}
        format={format}
        onNoteChanged={() => undefined}
        onNoteDeleted={() => undefined}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('note-save-status').textContent).toContain('Changed in another window');
      expect(screen.queryByTestId('note-conflict')).not.toBeNull();
    });
    expect(screen.getByTestId('note-conflict').querySelectorAll('p')).toHaveLength(1);
    view.unmount();
    expect(api.state.notes[0]?.content).toBe(note.content);
  });
});

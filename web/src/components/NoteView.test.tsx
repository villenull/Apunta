import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  vi.restoreAllMocks();
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

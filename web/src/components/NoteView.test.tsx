import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { installFakeApi, makeFormat, makeNote, makePatient } from '../test/fakeApi.js';
import { NoteView } from './NoteView.js';

const patient = makePatient('John Smith');
const format = makeFormat('Progress note', ['Subjective', 'Plan']);
const noteFormat = makeFormat('Progress note', ['Discussion', 'Intervention']);

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
    expect((screen.getByTestId('note-body') as HTMLTextAreaElement).value).toBe(
      'Subjective: My unsaved edit',
    );
    expect(screen.getByRole('button', { name: 'Keep mine' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Take theirs' })).not.toBeNull();
    view.unmount();
    expect(api.state.notes[0]?.content).toBe(note.content);
  });

  it('clears the banner and persists her edit when she keeps hers after a conflict', async () => {
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

    // The other window saved first, so both the list prop and the fake
    // server move forward; her save revision is now stale.
    const remote = {
      ...note,
      content: 'Subjective: Saved in another window',
      revision: note.revision + 1,
      updated_at: '2026-08-08T09:01:00.000Z',
    };
    api.state.notes = [remote];
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
      expect(screen.queryByTestId('note-conflict')).not.toBeNull();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Keep mine' }));

    await waitFor(() => {
      expect(screen.queryByTestId('note-conflict')).toBeNull();
    });
    expect((screen.getByTestId('note-body') as HTMLTextAreaElement).value).toBe(
      'Subjective: My unsaved edit',
    );
    expect(api.state.notes[0]?.content).toBe('Subjective: My unsaved edit');
    expect(screen.getByTestId('note-save-status').textContent).toBe('Saved');
  });

  it('clears the banner and shows theirs when she takes theirs after a conflict', async () => {
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
      expect(screen.queryByTestId('note-conflict')).not.toBeNull();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Take theirs' }));

    await waitFor(() => {
      expect(screen.queryByTestId('note-conflict')).toBeNull();
    });
    expect((screen.getByTestId('note-body') as HTMLTextAreaElement).value).toBe(remote.content);
    expect(screen.getByTestId('note-save-status').textContent).toBe('Saved');
  });
});

describe('intervention approach suggestion', () => {
  const body = 'Explored automatic thoughts with Socratic questioning and reviewed the evidence together.';

  function renderSuggestionNote(content: string) {
    const note = makeNote(patient.id, { content });
    installFakeApi({ patients: [patient], formats: [noteFormat], notes: [note] });
    render(
      <NoteView
        patient={patient}
        note={note}
        format={noteFormat}
        onNoteChanged={() => undefined}
        onNoteDeleted={() => undefined}
      />,
    );
    return note;
  }

  it('suggests the exact approach from the Intervention section only', () => {
    renderSuggestionNote(`Discussion: Weekly check-in.\n\nIntervention: ${body}`);

    expect(screen.getByTestId('approach-suggestion')).not.toBeNull();
    expect(screen.getByTestId('approach-suggestion-approach').textContent).toBe(
      'CBT (Cognitive Behavioral Therapy)',
    );
    expect(screen.getByTestId('approach-suggestion-evidence').textContent).toContain('Socratic questioning');
    // The suggestion is a card beside the draft, never note text until confirmed.
    expect((screen.getByTestId('note-body') as HTMLTextAreaElement).value).not.toContain(
      'CBT (Cognitive Behavioral Therapy)',
    );
    expect(screen.getByTestId('approach-suggestion-add').textContent).toContain(
      'Add CBT (Cognitive Behavioral Therapy) to Intervention',
    );
  });

  it('stays silent when the same words appear only in Discussion', () => {
    renderSuggestionNote(`Discussion: ${body}\n\nIntervention: Reviewed coping strategies.`);

    expect(screen.queryByTestId('approach-suggestion')).toBeNull();
  });

  it('leaves the note byte-identical on Not now', () => {
    const before = `Discussion: Weekly check-in.\n\nIntervention: ${body}`;
    renderSuggestionNote(before);

    fireEvent.click(screen.getByTestId('approach-suggestion-dismiss'));

    expect(screen.queryByTestId('approach-suggestion')).toBeNull();
    expect((screen.getByTestId('note-body') as HTMLTextAreaElement).value).toBe(before);
  });

  it('prefixes only the confirmed label to Intervention on explicit add', async () => {
    const discussion = 'Weekly check-in.';
    renderSuggestionNote(`Discussion: ${discussion}\n\nIntervention: ${body}`);

    fireEvent.click(screen.getByTestId('approach-suggestion-add'));

    const expected = `Discussion: ${discussion}\n\nIntervention: CBT (Cognitive Behavioral Therapy): ${body}`;
    await waitFor(() => {
      expect((screen.getByTestId('note-body') as HTMLTextAreaElement).value).toBe(expected);
    });
    // Naming the approach satisfies the matcher, so the card retires.
    expect(screen.queryByTestId('approach-suggestion')).toBeNull();
  });

  it('keeps a following Intervention paragraph untouched on explicit add', async () => {
    renderSuggestionNote(`Discussion: Weekly check-in.\n\nIntervention: ${body}\nSecond line stays.`);

    fireEvent.click(screen.getByTestId('approach-suggestion-add'));

    const expected = `Discussion: Weekly check-in.\n\nIntervention: CBT (Cognitive Behavioral Therapy): ${body}\nSecond line stays.`;
    await waitFor(() => {
      expect((screen.getByTestId('note-body') as HTMLTextAreaElement).value).toBe(expected);
    });
  });

  it('shows no card when the matcher abstains', () => {
    renderSuggestionNote('Discussion: Weekly check-in.\n\nIntervention: Practiced deep breathing together.');

    expect(screen.queryByTestId('approach-suggestion')).toBeNull();
  });

  it('reads a plural Interventions section name', () => {
    const pluralFormat = makeFormat('Progress note', ['Discussion', 'Interventions']);
    const note = makeNote(patient.id, { content: `Discussion: Weekly check-in.\n\nInterventions: ${body}` });
    installFakeApi({ patients: [patient], formats: [pluralFormat], notes: [note] });
    render(
      <NoteView
        patient={patient}
        note={note}
        format={pluralFormat}
        onNoteChanged={() => undefined}
        onNoteDeleted={() => undefined}
      />,
    );

    expect(screen.getByTestId('approach-suggestion-approach').textContent).toBe(
      'CBT (Cognitive Behavioral Therapy)',
    );
  });
});

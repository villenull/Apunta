import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './App.js';
import { installFakeApi, installFakeClipboard, makeFormat, makeNote, makePatient } from './test/fakeApi.js';

/**
 * Screen-level tests for the ported prototype: the flows a user actually
 * performs, driven through the real components against the fake API.
 * Playwright covers the same ground end to end; these fail faster and pin the
 * prototype's copy.
 */

const progressNote = makeFormat('Progress note', ['Subjective', 'Objective', 'Assessment', 'Plan']);
const john = makePatient('John Smith', { note_count: 2 });
const maria = makePatient('Maria Ruiz', { note_count: 0 });

const johnsDraft = makeNote(john.id, {
  content: 'Subjective: Improved sleep.\n\nPlan: Continue weekly.',
});
const johnsIntake = makeNote(john.id, {
  title: 'Intake note',
  status: 'published',
  published_at: '2026-08-09T09:00:00.000Z',
});

function renderApp(path = '/'): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('workspace', () => {
  beforeEach(() => {
    installFakeApi({
      formats: [progressNote],
      patients: [john, maria],
      notes: [johnsDraft, johnsIntake],
    });
  });

  it('lists patients with their note counts and asks for a selection', async () => {
    renderApp();

    expect(await screen.findByText('John Smith')).toBeDefined();
    expect(screen.getByText('2 notes')).toBeDefined();
    expect(screen.getByText('0 notes')).toBeDefined();
    expect(screen.getByText('Select a patient to see their notes')).toBeDefined();
  });

  it('filters the patient list as the prototype does', async () => {
    renderApp();
    const search = await screen.findByLabelText('Search patients');

    fireEvent.change(search, { target: { value: 'maria' } });

    expect(screen.queryByText('John Smith')).toBeNull();
    expect(screen.getByText('Maria Ruiz')).toBeDefined();

    fireEvent.change(search, { target: { value: 'nobody' } });
    expect(screen.getByText('No patients match.')).toBeDefined();
  });

  it("shows a patient with no notes the prototype's empty hint", async () => {
    renderApp();

    fireEvent.click(await screen.findByText('Maria Ruiz'));

    expect(await screen.findByText('No notes yet for Maria Ruiz.')).toBeDefined();
    expect(screen.getByText('No note selected for Maria Ruiz')).toBeDefined();
  });

  it('opens a note, and marks drafts with a date and a Draft label', async () => {
    renderApp();

    fireEvent.click(await screen.findByText('John Smith'));
    expect((await screen.findByTestId('notes-header')).textContent).toBe('John’s notes');
    expect(screen.getByText('Aug 8, 2026 · Draft')).toBeDefined();

    fireEvent.click(screen.getByText('Intake note'));

    expect((await screen.findByTestId('note-title')).textContent).toBe('Intake note');
    expect(screen.getByTestId('note-meta').textContent).toContain('John Smith · created');
  });

  it('renders the refine column as a disabled placeholder for M4', async () => {
    renderApp(`/?patient=${john.id}&note=${johnsDraft.id}`);

    expect(await screen.findByText('Refine with AI')).toBeDefined();
    expect(screen.getByTestId('refine-placeholder').textContent).toContain('AI arrives in a later milestone');
    expect(screen.getByLabelText('Ask a question or give feedback')).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Shorter' })).toHaveProperty('disabled', true);
  });

  it('deletes a patient after confirming, and empties the workspace', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderApp(`/?patient=${maria.id}`);

    fireEvent.click(await screen.findByLabelText('Delete Maria Ruiz'));

    await waitFor(() => {
      expect(screen.queryByText('Maria Ruiz')).toBeNull();
    });
    expect(confirmSpy).toHaveBeenCalled();
    expect(screen.getByText('Select a patient to see their notes')).toBeDefined();
  });
});

describe('note editing', () => {
  const note = makeNote(john.id);

  beforeEach(() => {
    installFakeApi({ formats: [progressNote], patients: [john], notes: [note] });
  });

  async function openNote(): Promise<HTMLTextAreaElement> {
    renderApp(`/?patient=${john.id}&note=${note.id}`);
    return (await screen.findByTestId('note-body')) as HTMLTextAreaElement;
  }

  it('saves an edited body and shows the note as edited', async () => {
    const body = await openNote();

    fireEvent.change(body, { target: { value: 'Subjective: Edited by hand.' } });
    fireEvent.blur(body);

    await waitFor(() => {
      expect(screen.getByTestId('note-meta').textContent).toContain('edited');
    });
  });

  it('publishes: copies the note, locks the body, and unlocks on a second click', async () => {
    const clipboard = installFakeClipboard();
    const body = await openNote();

    fireEvent.click(screen.getByTestId('publish-button'));

    await waitFor(() => {
      expect(screen.getByTestId('publish-button').textContent).toContain('Published (click to edit)');
    });
    expect(body).toHaveProperty('readOnly', true);
    expect(clipboard.written).toEqual([note.content]);

    fireEvent.click(screen.getByTestId('publish-button'));

    await waitFor(() => {
      expect(screen.getByTestId('publish-button').textContent).toBe('Publish');
    });
    expect(screen.getByTestId('note-body')).toHaveProperty('readOnly', false);
  });

  it('flashes "Copied" on the copy button', async () => {
    const clipboard = installFakeClipboard();
    await openNote();

    fireEvent.click(screen.getByTestId('copy-button'));

    await waitFor(() => {
      expect(screen.getByTestId('copy-button').textContent).toContain('Copied');
    });
    expect(clipboard.written).toHaveLength(1);
  });

  it('deletes a note only after the confirm, and clears the selection', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await openNote();

    fireEvent.click(screen.getByLabelText('Delete note'));
    expect(screen.getByTestId('note-title')).toBeDefined();

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByLabelText('Delete note'));

    expect(await screen.findByTestId('empty-no-note')).toBeDefined();
  });
});

describe('first run', () => {
  it('sends a practice with no note format to onboarding', async () => {
    installFakeApi({ formats: [], patients: [] });

    renderApp();

    expect(await screen.findByText('Add your note format')).toBeDefined();
  });

  it('creates a format from the manual path and lands on add patient', async () => {
    const api = installFakeApi({ formats: [], patients: [] });
    renderApp('/onboarding/format');

    fireEvent.click(await screen.findByText('Describe it myself'));
    fireEvent.change(screen.getByLabelText('Format name'), { target: { value: 'Progress note' } });
    fireEvent.change(screen.getByLabelText('Sections'), {
      target: { value: 'Subjective, Objective, Assessment, Plan' },
    });
    fireEvent.click(screen.getByTestId('format-continue'));

    // The confirm screen shows what will be saved, chip by chip.
    const chips = await screen.findByTestId('section-chips');
    expect(within(chips).getByText('Objective')).toBeDefined();
    fireEvent.click(within(chips).getByLabelText('Remove Objective'));
    fireEvent.click(screen.getByTestId('save-format'));

    expect(await screen.findByRole('heading', { name: 'Add patient' })).toBeDefined();
    expect(api.state.formats[0]).toMatchObject({
      name: 'Progress note',
      sections: ['Subjective', 'Assessment', 'Plan'],
    });
  });

  it('keeps the upload paths visible but not usable until M6', async () => {
    installFakeApi({ formats: [] });
    renderApp('/onboarding/format');

    fireEvent.click(await screen.findByText('Upload a blank template'));

    expect(screen.getByText('Drop a .docx or .pdf template here')).toBeDefined();
    expect(screen.getByTestId('format-continue')).toHaveProperty('disabled', true);
  });
});

describe('adding a patient and a typed note', () => {
  it('adds a patient and opens the workspace on them', async () => {
    const api = installFakeApi({ formats: [progressNote], patients: [] });
    renderApp('/patients/new');

    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Ana Torres' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add patient' }));

    expect(await screen.findByText('Ana Torres')).toBeDefined();
    expect(api.state.patients).toHaveLength(1);
  });

  it('types a summary into a new draft and selects it in the workspace', async () => {
    const api = installFakeApi({ formats: [progressNote], patients: [john] });
    renderApp(`/capture/${john.id}`);

    expect(await screen.findByText(`New note for ${john.name}`)).toBeDefined();
    fireEvent.click(screen.getByTestId('type-it-out'));
    fireEvent.change(screen.getByTestId('summary-input'), {
      target: { value: 'Sleep better this week, still anxious about work.' },
    });
    fireEvent.click(screen.getByTestId('process-note'));

    const body = (await screen.findByTestId('note-body')) as HTMLTextAreaElement;
    expect(body.value).toBe('Sleep better this week, still anxious about work.');
    expect(api.state.notes).toHaveLength(1);
  });

  it('offers recording but leaves it for M5', async () => {
    installFakeApi({ formats: [progressNote], patients: [john] });
    renderApp(`/capture/${john.id}`);

    const record = (await screen.findByText('Record audio')).closest('button');
    expect(record).toHaveProperty('disabled', true);
    expect(record?.getAttribute('title')).toBe('Recording arrives in a later milestone');
  });
});

describe('settings', () => {
  it('lists formats with their sections and links each one to the editor', async () => {
    installFakeApi({ formats: [progressNote] });
    renderApp('/settings');

    expect(await screen.findByText('Note formats')).toBeDefined();
    expect(screen.getByText('Subjective, Objective, Assessment, Plan')).toBeDefined();

    fireEvent.click(screen.getByText('Edit'));

    expect(await screen.findByText('Edit note format')).toBeDefined();
    expect(screen.getByLabelText('Format name')).toHaveProperty('value', 'Progress note');
  });
});

import type { ChatMessage, Note } from '@apunta/shared';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './App.js';
import {
  draftContent,
  installFakeApi,
  installFakeClipboard,
  makeChatMessage,
  makeFormat,
  makeNote,
  makePatient,
} from './test/fakeApi.js';

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

/**
 * Put files on a real `<input type="file">`, the way Playwright's
 * `setInputFiles` does. jsdom has no file picker and `input.files` is
 * read-only, so the property is redefined and a `change` fired — which is
 * exactly the path a drop takes too, since the dropzone writes the same state.
 */
function upload(input: HTMLElement, files: readonly File[]): void {
  const list: Record<number, File> & { length: number; item: (index: number) => File | null } = {
    length: files.length,
    item: (index) => files[index] ?? null,
  };
  files.forEach((file, index) => {
    list[index] = file;
  });
  Object.defineProperty(input, 'files', { value: list as unknown as FileList, configurable: true });
  fireEvent.change(input);
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

  it('deletes a patient after confirming, and empties the workspace', async () => {
    renderApp(`/?patient=${maria.id}`);

    fireEvent.click(await screen.findByLabelText('Delete Maria Ruiz'));

    // The dialog says what deleting cannot reach, which is the half that
    // "this cannot be undone" gets backwards.
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('Time Machine');
    expect(dialog.textContent).toContain('Archive');

    fireEvent.click(screen.getByTestId('confirm-accept'));

    await waitFor(() => {
      expect(screen.queryByText('Maria Ruiz')).toBeNull();
    });
    expect(screen.getByText('Select a patient to see their notes')).toBeDefined();
  });

  it('closes the confirmation on Escape without deleting anything', async () => {
    renderApp(`/?patient=${maria.id}`);

    fireEvent.click(await screen.findByLabelText('Delete Maria Ruiz'));
    expect(await screen.findByRole('dialog')).toBeDefined();

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(screen.getByText('Maria Ruiz')).toBeDefined();
  });

  /** Archiving is the answer to "not seeing them any more"; it deletes nothing. */
  it('archives a patient out of the working list and can show them again', async () => {
    renderApp(`/?patient=${maria.id}`);

    fireEvent.click(await screen.findByTestId(`archive-${maria.id}`));
    await waitFor(() => {
      expect(screen.queryByText('Maria Ruiz')).toBeNull();
    });

    fireEvent.click(screen.getByTestId('show-archived'));
    expect(await screen.findByText('Maria Ruiz')).toBeDefined();
    expect(screen.getByTestId(`archive-${maria.id}`).textContent).toBe('Restore');
  });
});

describe('the work around a session', () => {
  beforeEach(() => {
    installFakeApi({
      formats: [progressNote],
      patients: [john, maria],
      notes: [johnsDraft, johnsIntake],
    });
  });

  /**
   * The plan and a briefing are separate objects reached from the same column:
   * one is a record she authors, the other a reading aid generated on demand.
   */
  it('opens the treatment plan beside the notes', async () => {
    renderApp(`/?patient=${john.id}`);

    fireEvent.click(await screen.findByTestId('open-plan'));

    expect(await screen.findByTestId('plan-view')).toBeTruthy();
    expect(screen.getByTestId('empty-no-plan').textContent).toContain('No treatment plan for John Smith yet');
    // The notes are still one click away.
    expect(screen.getByTestId('note-list')).toBeTruthy();
  });

  it('opens a session briefing, and returns to a note when a line is followed', async () => {
    renderApp(`/?patient=${john.id}`);

    fireEvent.click(await screen.findByTestId('open-prep'));
    const citation = (await screen.findAllByTestId('prep-citation'))[0] as HTMLElement;

    fireEvent.click(citation);

    // Following a citation lands on that note, which means leaving prep.
    expect(await screen.findByTestId('note-body')).toBeTruthy();
    expect(screen.queryByTestId('prep-view')).toBeNull();
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
    await openNote();

    fireEvent.click(screen.getByLabelText('Delete note'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByTestId('note-title')).toBeDefined();

    fireEvent.click(screen.getByLabelText('Delete note'));
    fireEvent.click(screen.getByTestId('confirm-accept'));

    expect(await screen.findByTestId('empty-no-note')).toBeDefined();
  });
});

describe('an action that fails', () => {
  /**
   * The one thing an app holding clinical records must never do is look like
   * it did something it did not. A failed delete used to write a line into a
   * corner of the main pane, where it competed with the note.
   */
  it('says so in a toast that does not remove itself', async () => {
    const api = installFakeApi({ formats: [progressNote], patients: [john, maria] });
    renderApp(`/?patient=${maria.id}`);

    await screen.findByLabelText('Delete Maria Ruiz');
    // The patient disappears from under the delete: the request 404s.
    api.state.patients = api.state.patients.filter((candidate) => candidate.id !== maria.id);

    fireEvent.click(screen.getByLabelText('Delete Maria Ruiz'));
    fireEvent.click(screen.getByTestId('confirm-accept'));

    const toast = await screen.findByTestId('toast-error');
    expect(toast.getAttribute('role')).toBe('alert');
    expect(toast.textContent).toContain('Patient not found');

    fireEvent.click(within(toast).getByLabelText('Dismiss'));
    await waitFor(() => {
      expect(screen.queryByTestId('toast-error')).toBeNull();
    });
  });
});

describe('a server that is not answering', () => {
  it('says so in the workspace rather than rendering an empty practice', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    renderApp();

    const alerts = await screen.findAllByRole('alert');
    expect(alerts.some((alert) => alert.textContent?.includes('Could not reach the Apunta server'))).toBe(
      true,
    );
    expect(screen.getByTestId('patient-list').textContent).toContain('Could not reach the Apunta server');
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

  it('will not upload until a file has been chosen', async () => {
    installFakeApi({ formats: [] });
    renderApp('/onboarding/format');

    fireEvent.click(await screen.findByText('Upload a blank template'));

    expect(screen.getByText('Drop a .docx or .pdf template here')).toBeDefined();
    expect(screen.getByTestId('format-continue')).toHaveProperty('disabled', true);
  });

  it('reads a format out of an uploaded template and offers it for confirmation', async () => {
    const api = installFakeApi({ formats: [], patients: [] });
    renderApp('/onboarding/format');

    fireEvent.click(await screen.findByText('Upload a blank template'));
    upload(screen.getByTestId('area-template-input'), [
      new File(['Subjective\n\nObjective\n\nAssessment\n\nPlan\n'], 'template.txt', {
        type: 'text/plain',
      }),
    ]);
    fireEvent.click(screen.getByTestId('format-continue'));

    const chips = await screen.findByTestId('section-chips');
    expect(within(chips).getByText('Assessment')).toBeDefined();
    fireEvent.click(screen.getByTestId('save-format'));

    expect(await screen.findByRole('heading', { name: 'Add patient' })).toBeDefined();
    expect(api.state.formats[0]).toMatchObject({
      sections: ['Subjective', 'Objective', 'Assessment', 'Plan'],
      source: 'template',
    });
  });

  it('offers the manual path when a file cannot be read', async () => {
    installFakeApi({ formats: [] });
    renderApp('/onboarding/format');

    fireEvent.click(await screen.findByText('Upload a blank template'));
    upload(screen.getByTestId('area-template-input'), [
      new File(['%PDF-1.4 scanned pages'], 'scan.pdf', { type: 'application/pdf' }),
    ]);
    fireEvent.click(screen.getByTestId('format-continue'));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('picture');
    fireEvent.click(within(alert).getByRole('button', { name: 'Describe it myself' }));
    expect(screen.getByTestId('area-manual')).toBeDefined();
  });

  it('needs two example notes, not one', async () => {
    installFakeApi({ formats: [] });
    renderApp('/onboarding/format');

    fireEvent.click(await screen.findByText('Upload a few example notes'));
    upload(screen.getByTestId('area-examples-input'), [
      new File(['Subjective\nbody\n'], 'one.txt', { type: 'text/plain' }),
    ]);
    expect(screen.getByTestId('format-continue')).toHaveProperty('disabled', true);

    upload(screen.getByTestId('area-examples-input'), [
      new File(['Subjective\nbody\n'], 'one.txt', { type: 'text/plain' }),
      new File(['Subjective\nbody\n'], 'two.txt', { type: 'text/plain' }),
    ]);
    expect(screen.getByTestId('format-continue')).toHaveProperty('disabled', false);
  });
});

describe('the format editor', () => {
  let editorApi: ReturnType<typeof installFakeApi>;

  function openEditor(): void {
    editorApi = installFakeApi({ formats: [makeFormat('Progress note', ['Subjective', 'Plan'])] });
    renderApp('/settings');
  }

  it('renames a section, reorders it, and saves', async () => {
    openEditor();

    fireEvent.click(await screen.findByRole('link', { name: 'Edit' }));

    const chips = await screen.findByTestId('section-chips');
    fireEvent.click(within(chips).getByRole('button', { name: 'Rename Subjective' }));
    fireEvent.change(within(chips).getByLabelText('New name for Subjective'), {
      target: { value: 'Presenting concern' },
    });
    fireEvent.keyDown(within(chips).getByLabelText('New name for Subjective'), { key: 'Enter' });

    // Up/down rather than drag: one click, and it is the whole keyboard story.
    fireEvent.click(within(chips).getByRole('button', { name: 'Move Plan up' }));
    fireEvent.click(screen.getByTestId('save-format'));

    await waitFor(() => {
      expect(editorApi.state.formats[0]?.sections).toEqual(['Plan', 'Presenting concern']);
    });
  });

  it('refuses a rename that collides with another section', async () => {
    openEditor();
    fireEvent.click(await screen.findByRole('link', { name: 'Edit' }));

    const chips = await screen.findByTestId('section-chips');
    fireEvent.click(within(chips).getByRole('button', { name: 'Rename Subjective' }));
    fireEvent.change(within(chips).getByLabelText('New name for Subjective'), {
      target: { value: 'plan' },
    });
    fireEvent.keyDown(within(chips).getByLabelText('New name for Subjective'), { key: 'Enter' });

    expect((await screen.findByRole('alert')).textContent).toContain('already a section');
  });

  it('says that section edits only affect future drafts', async () => {
    openEditor();
    fireEvent.click(await screen.findByRole('link', { name: 'Edit' }));

    expect(
      await screen.findByText(/keep the sections they were written with/, { exact: false }),
    ).toBeDefined();
  });

  it('imports a skill file into the instructions and warns about its references', async () => {
    openEditor();
    fireEvent.click(await screen.findByRole('link', { name: 'Edit' }));

    const panel = await screen.findByTestId('instructions-panel');
    upload(within(panel).getByTestId('skill-file-input'), [
      new File(['---\nname: x\n---\n\nUse "client", not "patient".\n'], 'SKILL.md', {
        type: 'text/markdown',
      }),
    ]);

    await waitFor(() => {
      expect(within(panel).getByLabelText('Instructions')).toHaveProperty(
        'value',
        'Use "client", not "patient".',
      );
    });
    expect(within(panel).getByTestId('import-references').textContent).toContain('references/FORMS.md');
    expect(within(panel).getByTestId('import-report').textContent).toContain('frontmatter removed');

    fireEvent.click(screen.getByTestId('save-format'));
    await waitFor(() => {
      expect(editorApi.state.formats[0]?.instructions).toBe('Use "client", not "patient".');
    });
  });

  it('leaves instructions blank to mean "use the built-in default"', async () => {
    openEditor();
    fireEvent.click(await screen.findByRole('link', { name: 'Edit' }));

    const panel = await screen.findByTestId('instructions-panel');
    expect(within(panel).getByLabelText('Instructions')).toHaveProperty('value', '');
    expect(panel.textContent).toContain('leave blank to use the built-in default');
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

  it('drafts a typed summary into a new note and selects it in the workspace', async () => {
    const typed = 'Sleep better this week, still anxious about work.';
    const api = installFakeApi({ formats: [progressNote], patients: [john] });
    renderApp(`/capture/${john.id}`);

    expect(await screen.findByText(`New note for ${john.name}`)).toBeDefined();
    fireEvent.change(screen.getByTestId('summary-input'), { target: { value: typed } });
    fireEvent.click(screen.getByTestId('process-note'));

    const body = (await screen.findByTestId('note-body')) as HTMLTextAreaElement;
    expect(body.value).toBe(draftContent(progressNote.sections, typed));
    expect(api.state.notes).toHaveLength(1);
    // The draft came from /api/generate, not from M2's direct note creation.
    expect(api.calls).toContain('POST /api/generate');
    expect(api.calls).not.toContain('POST /api/notes');
  });

  /**
   * The prototype's feel, and the reason the server decodes the model's JSON
   * rather than forwarding it: the therapist watches the note take shape, not
   * escaped JSON scrolling past.
   */
  it('shows the draft assembling before it lands on the workspace', async () => {
    installFakeApi({ formats: [progressNote], patients: [john] });
    renderApp(`/capture/${john.id}`);

    await screen.findByText(`New note for ${john.name}`);
    fireEvent.change(screen.getByTestId('summary-input'), { target: { value: 'Sleep improved.' } });
    fireEvent.click(screen.getByTestId('process-note'));

    // The preview exists before its sections have streamed in, so wait for
    // the content, not just the element.
    const preview = await screen.findByTestId('draft-preview');
    expect(preview.textContent).toContain('Subjective:');
    await waitFor(() => {
      expect(preview.textContent).toContain('Sleep improved.');
    });
    expect(preview.textContent).not.toContain('{"');

    // And then it lands.
    expect(await screen.findByTestId('note-body')).toBeDefined();
  });

  it('keeps the summary and explains itself when the local AI is not running', async () => {
    installFakeApi(
      { formats: [progressNote], patients: [john] },
      {
        generateError: {
          code: 'ollama_unreachable',
          message: "Apunta can't reach the local AI — see Setup.",
        },
      },
    );
    renderApp(`/capture/${john.id}`);

    await screen.findByText(`New note for ${john.name}`);
    fireEvent.change(screen.getByTestId('summary-input'), { target: { value: 'Sleep improved.' } });
    fireEvent.click(screen.getByTestId('process-note'));

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining("can't reach the local AI"),
    );
    expect((screen.getByTestId('summary-input') as HTMLTextAreaElement).value).toBe('Sleep improved.');
    expect(screen.getByTestId('process-note')).toHaveProperty('disabled', false);
  });

  /**
   * Recording is live now (M5), and it sits beside the typed notes rather than
   * replacing them: she both writes and occasionally dictates, and both reach
   * the same drafting call.
   *
   * jsdom has no AudioWorklet, which makes this the "browser cannot record"
   * path — and the assertion that matters is what it offers instead. The
   * answer is always typing. It is never the Web Speech API, which can send
   * audio to Google (CLAUDE.md hard rule 1).
   */
  it('offers recording beside the typed notes, and falls back to typing where it cannot run', async () => {
    installFakeApi({ formats: [progressNote], patients: [john] });
    renderApp(`/capture/${john.id}`);

    const record = (await screen.findByText('Record audio')).closest('button');
    expect(record).toHaveProperty('disabled', false);
    expect(screen.getByTestId('summary-input')).toBeTruthy();

    fireEvent.click(record as HTMLButtonElement);

    expect(await screen.findByTestId('capture-error')).toHaveProperty(
      'textContent',
      expect.stringContaining('Type the summary instead'),
    );
  });
});

/**
 * The refine chat — the practice owner's primary repair path (design question
 * 4), so these are the flows that matter most on this screen.
 */
describe('refine chat', () => {
  const NOTE_TEXT = [
    'Subjective: Improved sleep.',
    'Objective: Alert and engaged.',
    'Assessment: Progressing.',
    'Plan: Continue weekly sessions. Introduce grounding exercises.',
  ].join('\n\n');

  function openNote(overrides: Partial<Note> = {}, messages: ChatMessage[] = []): Note {
    const note = makeNote(john.id, { format_id: progressNote.id, content: NOTE_TEXT, ...overrides });
    installFakeApi({
      formats: [progressNote],
      patients: [john],
      notes: [note],
      messages: messages.map((message) => ({ ...message, note_id: note.id })),
    });
    renderApp(`/?patient=${john.id}&note=${note.id}`);
    return note;
  }

  it('shows the thread the note was created with, and its empty-state otherwise', async () => {
    const note = makeNote(john.id, { format_id: progressNote.id, content: NOTE_TEXT });
    installFakeApi({
      formats: [progressNote],
      patients: [john],
      notes: [note],
      messages: [makeChatMessage(note.id, 'assistant', "Here's a first pass based on your dictation.")],
    });
    renderApp(`/?patient=${john.id}&note=${note.id}`);

    expect(await screen.findByText("Here's a first pass based on your dictation.")).toBeDefined();
    expect(screen.queryByText('Ask a question about this note, or give feedback to refine it.')).toBeNull();
  });

  it('offers the prototype’s empty-state line when nothing has been said', async () => {
    openNote();
    expect(
      await screen.findByText('Ask a question about this note, or give feedback to refine it.'),
    ).toBeDefined();
  });

  it('sends a message on Enter and rewrites the note in place', async () => {
    openNote();
    const body = (await screen.findByTestId('note-body')) as HTMLTextAreaElement;
    const input = screen.getByTestId('chat-input');

    fireEvent.change(input, { target: { value: 'Make the plan shorter' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(await screen.findByText('Make the plan shorter')).toBeDefined();
    expect(await screen.findByText('Shortened the Plan section.')).toBeDefined();
    await waitFor(() => {
      expect(body.value).toContain('Plan: Continue weekly sessions and grounding exercises.');
    });
    expect(body.value).not.toContain('Introduce grounding exercises');
    // The composer is clear again, ready for the next turn.
    expect(input).toHaveProperty('value', '');
  });

  it("sends the quick action's full phrase, not its label", async () => {
    openNote();
    await screen.findByTestId('note-body');

    fireEvent.click(screen.getByRole('button', { name: 'More clinical' }));

    // "Shorter" or "More clinical" alone is a label, not an instruction, and
    // every one of these buttons is one click from rewriting a clinical note.
    const thread = await screen.findByTestId('chat-thread');
    await waitFor(() => {
      expect(thread.textContent).toContain('Use a more clinical tone');
    });
    expect(within(thread).queryByText('More clinical')).toBeNull();
  });

  it('answers a question without touching the note', async () => {
    openNote();
    const body = (await screen.findByTestId('note-body')) as HTMLTextAreaElement;

    fireEvent.change(screen.getByTestId('chat-input'), { target: { value: 'What is in the plan?' } });
    fireEvent.click(screen.getByTestId('chat-send'));

    expect(await screen.findByText(/that detail isn't currently in the note/)).toBeDefined();
    expect(body.value).toBe(NOTE_TEXT);
  });

  it('refuses to change a published note, in the prototype’s words', async () => {
    openNote({ status: 'published', published_at: '2026-08-09T09:00:00.000Z' });
    const body = (await screen.findByTestId('note-body')) as HTMLTextAreaElement;

    fireEvent.change(screen.getByTestId('chat-input'), { target: { value: 'Make the plan shorter' } });
    fireEvent.click(screen.getByTestId('chat-send'));

    expect(await screen.findByText(/This note is published, so I won’t change it/)).toBeDefined();
    expect(body.value).toBe(NOTE_TEXT);
  });

  it('raises a chip for a highlighted excerpt, sends it, and clears it', async () => {
    openNote();
    const body = (await screen.findByTestId('note-body')) as HTMLTextAreaElement;

    body.setSelectionRange(0, 'Subjective: Improved sleep.'.length);
    fireEvent.select(body);

    expect((await screen.findByTestId('ref-chip')).textContent).toContain('Subjective: Improved sleep.');

    fireEvent.change(screen.getByTestId('chat-input'), { target: { value: 'Tighten this' } });
    fireEvent.click(screen.getByTestId('chat-send'));

    // It travels with the message and is gone from the composer afterwards.
    await waitFor(() => {
      expect(screen.queryByTestId('ref-chip')).toBeNull();
    });
    const quote = await screen.findByText('“Subjective: Improved sleep.”');
    expect(quote.className).toBe('chat-quote');
  });

  it('dismisses the chip with the ×', async () => {
    openNote();
    const body = (await screen.findByTestId('note-body')) as HTMLTextAreaElement;

    body.setSelectionRange(0, 10);
    fireEvent.select(body);
    fireEvent.click(await screen.findByLabelText('Clear highlighted excerpt'));

    expect(screen.queryByTestId('ref-chip')).toBeNull();
  });

  it('truncates a long excerpt in the chip, as the prototype does at 70 characters', async () => {
    const long = 'x'.repeat(200);
    openNote({ content: `Subjective: ${long}` });
    const body = (await screen.findByTestId('note-body')) as HTMLTextAreaElement;

    body.setSelectionRange(0, body.value.length);
    fireEvent.select(body);

    const chip = (await screen.findByTestId('ref-chip')).textContent ?? '';
    expect(chip).toContain('…');
    expect(chip.length).toBeLessThan(80);
  });

  it('says so when the local AI is not running, and keeps the note intact', async () => {
    const note = makeNote(john.id, { format_id: progressNote.id, content: NOTE_TEXT });
    installFakeApi(
      { formats: [progressNote], patients: [john], notes: [note] },
      { chatError: { code: 'ollama_unreachable', message: "Apunta can't reach the local AI — see Setup." } },
    );
    renderApp(`/?patient=${john.id}&note=${note.id}`);
    const body = (await screen.findByTestId('note-body')) as HTMLTextAreaElement;

    fireEvent.change(screen.getByTestId('chat-input'), { target: { value: 'Make the plan shorter' } });
    fireEvent.click(screen.getByTestId('chat-send'));

    expect((await screen.findByTestId('chat-error')).textContent).toContain("can't reach the local AI");
    expect(body.value).toBe(NOTE_TEXT);
  });
});

/**
 * The two things in a note body that must be visible without interrupting her
 * (design questions 5 and 11). Neither gates anything.
 */
describe('editor markers', () => {
  it('names an empty section and marks its header, without blocking anything', async () => {
    const note = makeNote(john.id, {
      format_id: progressNote.id,
      content: 'Subjective: Improved sleep.\n\nObjective:\n\nAssessment: Progressing.\n\nPlan: Weekly.',
    });
    installFakeApi({ formats: [progressNote], patients: [john], notes: [note] });
    renderApp(`/?patient=${john.id}&note=${note.id}`);

    expect((await screen.findByTestId('empty-sections')).textContent).toBe(
      'Nothing recorded in Objective — add or leave blank.',
    );
    const marks = within(screen.getByTestId('note-highlights')).getAllByText('Objective:');
    expect(marks[0]?.className).toContain('marker-empty-section');
    // Copy is not gated on it: her blanks are deliberate.
    expect(screen.getByTestId('copy-button')).toHaveProperty('disabled', false);
    expect(screen.getByTestId('publish-button')).toHaveProperty('disabled', false);
  });

  it('marks the unclear-dictation flag distinctly and never warns about it', async () => {
    const note = makeNote(john.id, {
      format_id: progressNote.id,
      content: [
        'Subjective: Possibly propranolol [unclear in dictation].',
        'Objective: Alert.',
        'Assessment: Progressing.',
        'Plan: Weekly.',
      ].join('\n\n'),
    });
    installFakeApi({ formats: [progressNote], patients: [john], notes: [note] });
    renderApp(`/?patient=${john.id}&note=${note.id}`);

    await screen.findByTestId('note-body');
    const mark = within(screen.getByTestId('note-highlights')).getByText('[unclear in dictation]');
    expect(mark.tagName).toBe('MARK');
    expect(mark.className).toContain('marker-unclear');
    expect(screen.queryByTestId('empty-sections')).toBeNull();
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

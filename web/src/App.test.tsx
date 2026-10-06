import type { ChatMessage, Note } from '@apunta/shared';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createMemoryRouter, RouterProvider } from 'react-router';
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
  type FakeApi,
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
type TestRouter = Parameters<typeof RouterProvider>[0]['router'];
let activeRouter: TestRouter | null = null;

function renderApp(path: string | { pathname: string; state: unknown } = '/'): void {
  activeRouter = createMemoryRouter([{ path: '*', element: <App /> }], { initialEntries: [path] });
  render(<RouterProvider router={activeRouter} />);
}

/**
 * Settings is a modal over the workspace (owner, 2026-10-05) — there is no
 * `/settings` page any more — so the cases below open it the way a person
 * does: More → Settings, and then the section they mean.
 */
async function openSettings(section?: string): Promise<HTMLElement> {
  renderApp('/');
  fireEvent.click(await screen.findByTestId('mission-control'));
  fireEvent.click(await screen.findByTestId('mission-settings'));
  const modal = await screen.findByTestId('settings-modal');
  if (section !== undefined) {
    const tab = within(modal).getByTestId(`settings-tab-${section}`);
    fireEvent.click(tab);
    // The switch is guarded (Settings asks the editor to write first and moves
    // on its answer), so the pane lands a tick after the click, not with it.
    // Waiting on the tab's own `aria-current` is the switch's promise kept, and
    // it says which section won — so callers can go straight on to what they
    // came for, exactly as a person does.
    await waitFor(() => {
      if (tab.getAttribute('aria-current') !== 'page') {
        throw new Error(`settings did not switch to "${section}"`);
      }
    });
  }
  return modal;
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
  activeRouter?.dispose();
  activeRouter = null;
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

    // A name now appears twice — in the row and in its hover card, as in Claude
    // — so the assertions below ask for "at least one", not for exactly one.
    expect((await screen.findAllByText('John Smith')).length).toBeGreaterThan(0);

    // The count and the last edit moved off the row and into the hover card.
    fireEvent.mouseOver(screen.getByTestId(`patient-row-${john.id}`));
    const tip = await screen.findByTestId('patient-tip');
    expect(within(tip).getByText('John Smith')).toBeDefined();
    expect(within(tip).getByText('2 notes')).toBeDefined();
    expect(within(tip).getByText('Aug 8')).toBeDefined();

    fireEvent.mouseOver(screen.getByTestId(`patient-row-${maria.id}`));
    const emptyTip = await screen.findByTestId('patient-tip');
    expect(within(emptyTip).getByText('0 notes')).toBeDefined();
    expect(within(emptyTip).getByText('—')).toBeDefined();
    // Home: the workbench's question, and no notes column until a patient is
    // chosen (owner, 2026-09-27).
    expect(screen.getByTestId('home').textContent).toContain('What would you like to work on?');
    expect(screen.queryByTestId('note-list')).toBeNull();
  });

  it('finds a patient from the home search as she types', async () => {
    renderApp();
    await screen.findAllByText('John Smith');

    // The search is the second step now: an action first, then a patient.
    fireEvent.click(screen.getByTestId('home-action-draft'));
    fireEvent.change(screen.getByTestId('home-search'), { target: { value: 'jo' } });
    const results = screen.getByRole('listbox', { name: 'Patients' });
    expect(within(results).getByText('John Smith')).toBeDefined();
    expect(within(results).queryByText('Maria Ruiz')).toBeNull();

    fireEvent.click(within(results).getByText('John Smith'));
    // The column no longer repeats her name (owner, 2026-10-05) — the sidebar
    // row she just picked says it — so what proves the selection is the
    // column itself: it only exists for a patient, and "New note" is its first
    // control now.
    expect((await screen.findByTestId('notes-new-note')).textContent).toContain('New note');
    expect(screen.queryByTestId('notes-header')).toBeNull();
  });

  it('offers New with what she typed when nobody matches', async () => {
    renderApp();
    await screen.findAllByText('John Smith');

    fireEvent.click(screen.getByTestId('home-action-note'));
    fireEvent.change(screen.getByTestId('home-search'), { target: { value: 'Ana Torres' } });
    expect(screen.getAllByRole('option')).toHaveLength(1);
    fireEvent.keyDown(screen.getByTestId('home-search'), { key: 'Enter' });

    expect(await screen.findByRole('heading', { name: 'Add patient' })).toBeDefined();
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Ana Torres');
  });

  it('goes home from the wordmark', async () => {
    renderApp(`/?patient=${john.id}`);
    await screen.findByTestId('note-list');

    fireEvent.click(screen.getByTestId('home-link'));

    expect(await screen.findByTestId('home')).toBeDefined();
    expect(screen.queryByTestId('note-list')).toBeNull();
  });

  it('filters the patient list as the prototype does', async () => {
    renderApp();
    const search = await screen.findByLabelText('Search patients');

    fireEvent.change(search, { target: { value: 'maria' } });

    expect(screen.queryAllByText('John Smith')).toHaveLength(0);
    expect(screen.getAllByText('Maria Ruiz').length).toBeGreaterThan(0);

    fireEvent.change(search, { target: { value: 'nobody' } });
    expect(await screen.findByText(/No patients match/)).toBeDefined();
  });

  it('adds a patient from the New row at the top of the list', async () => {
    renderApp();

    fireEvent.click(await screen.findByTestId('new-patient'));

    expect(await screen.findByRole('heading', { name: 'Add patient' })).toBeDefined();
  });

  /*
   * A patient with no notes has one thing to do (owner, 2026-09-28, backlog
   * #13): the notes column is left out, and the welcome offers only the first
   * note — not Brainstorm, the plan or the briefing, which all read notes.
   */
  it('gives a patient with no notes one welcome and one button, with no notes column', async () => {
    renderApp();

    fireEvent.click((await screen.findAllByText('Maria Ruiz'))[0] as HTMLElement);

    const welcome = await screen.findByTestId('patient-welcome-first');
    expect(welcome.textContent).toContain('Maria Ruiz');
    expect(welcome.textContent).toContain('Start with the first note for Maria.');
    expect(within(welcome).getByTestId('write-first-note').getAttribute('href')).toMatch(/^\/capture\//);
    expect(screen.queryByTestId('note-list')).toBeNull();
    expect(screen.queryByTestId('open-brainstorm')).toBeNull();
    expect(screen.queryByTestId('open-plan')).toBeNull();
    expect(screen.queryByTestId('open-prep')).toBeNull();
    // Only one way to start the first note on screen.
    expect(screen.queryByText('Create first note')).toBeNull();
  });

  it('offers four explained cards for a patient with notes and none open', async () => {
    renderApp();

    fireEvent.click((await screen.findAllByText('John Smith'))[0] as HTMLElement);

    const welcome = await screen.findByTestId('empty-no-note');
    const cards = within(welcome).getAllByRole('listitem');
    expect(cards.map((card) => card.querySelector('.home-action-label')?.textContent)).toEqual([
      'Write a note',
      'Brainstorm',
      'Treatment plan',
      'Prepare for session',
    ]);
    for (const card of cards) expect(card.querySelector('.patient-welcome-hint')?.textContent).not.toBe('');
    expect(screen.getByTestId('notes-new-note')).toBeDefined();
    // The patient's name left the column's header (owner, 2026-10-05); the
    // notes still carry the "Notes" label they always had, in the pinned band
    // above the list rather than inside it.
    expect(screen.queryByTestId('notes-header')).toBeNull();
    expect(screen.getByTestId('notes-head').textContent).toContain('Notes');
  });

  it('opens a note, and marks drafts with a date and a Draft label', async () => {
    renderApp();

    fireEvent.click((await screen.findAllByText('John Smith'))[0] as HTMLElement);
    expect(await screen.findByTestId('notes-new-note')).toBeDefined();
    expect(screen.queryByTestId('notes-header')).toBeNull();
    // The note row's date line carries a Draft chip beside the date now; the
    // published note below it has the date alone.
    const draftRow = (await screen.findByText('Draft')).closest('.note-date-row');
    expect(draftRow?.textContent).toContain('Aug 8, 2026');
    expect(screen.getAllByText('Draft')).toHaveLength(1);

    fireEvent.click(screen.getByText('Intake note'));

    expect((await screen.findByTestId('note-title')).textContent).toBe('Intake note');
    expect(screen.getByTestId('note-meta').textContent).toContain('John Smith · created');
  });

  /*
   * The owner preview (2026-09-26) moved archiving out of a checkbox and the
   * destructive item is now Delete only for an archived patient, so deleting
   * goes through the Archived tab of the "View all" page.
   */
  it('deletes an archived patient after confirming', async () => {
    renderApp();
    await screen.findAllByText('Maria Ruiz');

    fireEvent.click(await screen.findByTestId('view-all-patients'));
    fireEvent.click(await screen.findByTestId('directory-tab-archived'));
    fireEvent.click(await screen.findByTestId(`patient-menu-all-${maria.id}`));
    fireEvent.click(screen.getByLabelText('Delete Maria Ruiz'));

    // The dialog says what deleting cannot reach, which is the half that
    // "this cannot be undone" gets backwards.
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('Time Machine');
    expect(dialog.textContent).toContain('Archive');

    fireEvent.click(screen.getByTestId('confirm-accept'));

    await waitFor(() => {
      expect(screen.queryByText('Maria Ruiz')).toBeNull();
    });
  });

  it('closes the confirmation on Escape without deleting anything', async () => {
    renderApp();
    await screen.findAllByText('Maria Ruiz');
    fireEvent.click(await screen.findByTestId('view-all-patients'));
    fireEvent.click(await screen.findByTestId('directory-tab-archived'));
    fireEvent.click(await screen.findByTestId(`patient-menu-all-${maria.id}`));
    fireEvent.click(screen.getByLabelText('Delete Maria Ruiz'));
    expect(await screen.findByRole('dialog')).toBeDefined();

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    // Still listed: nothing was deleted, in the sidebar or on the page.
    expect(screen.getAllByText('Maria Ruiz').length).toBeGreaterThan(0);
  });

  /** Archiving is the answer to "not seeing them any more"; it deletes nothing. */
  it('archives a patient out of the working list and finds them again under Archived', async () => {
    renderApp(`/?patient=${maria.id}`);

    fireEvent.click(await screen.findByLabelText('Tools for Maria Ruiz'));
    fireEvent.click(screen.getByTestId(`archive-${maria.id}`));
    await waitFor(() => {
      expect(screen.queryByText('Maria Ruiz')).toBeNull();
    });

    fireEvent.click(await screen.findByTestId('view-all-patients'));
    fireEvent.click(await screen.findByTestId('directory-tab-archived'));
    expect((await screen.findAllByText('Maria Ruiz')).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByTestId(`patient-menu-all-${maria.id}`));
    expect(screen.getByTestId(`archive-${maria.id}`).textContent).toContain('Restore');
  });

  /** The panel toggle hides the sidebar and leaves one control to bring it back. */
  it('collapses the patients sidebar and opens it again', async () => {
    renderApp();
    await screen.findAllByText('John Smith');

    fireEvent.click(screen.getByTestId('sidebar-toggle'));
    expect(screen.getByTestId('sidebar-reopen')).toBeDefined();

    fireEvent.click(screen.getByTestId('sidebar-reopen'));
    await waitFor(() => {
      expect(screen.queryByTestId('sidebar-reopen')).toBeNull();
    });
  });

  /** "More" is the sidebar's one row at the bottom; Settings is a modal. */
  it('opens Settings as a centred modal over the workspace', async () => {
    renderApp();
    await screen.findAllByText('John Smith');

    fireEvent.click(screen.getByTestId('mission-control'));
    fireEvent.click(await screen.findByTestId('mission-settings'));

    const modal = await screen.findByTestId('settings-modal');
    expect(modal.textContent).toContain('Settings');
    // The accent picker is the setting she already has; it still works here.
    expect(within(modal).getByTestId('appearance-settings')).toBeDefined();
    // Every section tab carries the glyph Claude puts beside it, not just the
    // one that is open (owner preview, 2026-09-26).
    // Import is no longer a section (owner, 2026-09-27): it is a first-level row
    // in "More", so it is absent here and asserted in
    // `PatientsColumn.test.tsx`, where the row now lives.
    for (const section of ['appearance', 'format', 'backup', 'about']) {
      const tab = within(modal).getByTestId(`settings-tab-${section}`);
      expect(tab.querySelector('svg'), section).not.toBeNull();
    }

    fireEvent.click(within(modal).getByLabelText('Close settings'));
    await waitFor(() => {
      expect(screen.queryByTestId('settings-modal')).toBeNull();
    });
  });

  /** The full list has its own search, its own New, and a Select this preview lacks. */
  it('searches the full list from the page itself, with New patient beside it', async () => {
    renderApp();
    await screen.findAllByText('John Smith');

    fireEvent.click(await screen.findByTestId('view-all-patients'));
    const page = await screen.findByTestId('patient-directory');
    expect(screen.queryByTestId('directory-search-input')).toBeNull();

    fireEvent.click(screen.getByTestId('directory-search-toggle'));
    const field = screen.getByTestId('directory-search-input');
    fireEvent.change(field, { target: { value: 'maria' } });
    expect(within(page).getByText('Maria Ruiz')).toBeDefined();
    expect(within(page).queryByText('John Smith')).toBeNull();

    fireEvent.change(field, { target: { value: 'nobody at all' } });
    expect(within(page).getByText(/No patients match/)).toBeDefined();

    // The pill goes to the add-patient form, and Select says it is not here
    // rather than quietly doing nothing.
    expect(within(page).getByTestId('directory-new').getAttribute('href')).toBe('/patients/new');
    fireEvent.click(screen.getByTestId('directory-select'));
    expect(await screen.findByText("Select isn't part of this preview yet.")).toBeDefined();
  });
});

/**
 * "View all" is a pane of the workspace, not another screen (owner,
 * 2026-10-05).
 *
 * Two things have to hold and neither shows up in a diff of the components: the
 * **same DOM node** survives going to the directory and picking somebody out of
 * it, and **no request goes out again** on the way. The wrapper used to be
 * keyed on the pathname, so every move re-mounted the workspace — the sidebar
 * came back with its scroll and its filters where they were, the patients were
 * re-read, and the note she had open was gone.
 */
describe('the directory and a patient are one mounted workspace', () => {
  let api: ReturnType<typeof installFakeApi>;

  const patientsPath = 'GET /api/patients';
  const johnNotesPath = `GET /api/patients/${john.id}/notes`;

  function callsTo(call: string): number {
    return api.calls.filter((entry) => entry === call).length;
  }

  beforeEach(() => {
    api = installFakeApi({
      formats: [progressNote],
      patients: [john, maria],
      notes: [johnsDraft, johnsIntake],
    });
  });

  it('keeps the same node through the directory and back, and re-reads nothing', async () => {
    renderApp('/');
    await screen.findAllByText('John Smith');
    const shell = document.querySelector('.app-shell');
    await waitFor(() => {
      expect(callsTo(patientsPath)).toBe(1);
    });

    fireEvent.click(screen.getByTestId('view-all-patients'));
    await screen.findByTestId('patient-directory');
    expect(document.querySelector('.app-shell')).toBe(shell);
    expect(callsTo(patientsPath)).toBe(1);

    // Picking somebody out of the directory is a change of patient, not a
    // change of screen.
    fireEvent.click(screen.getAllByText('John Smith')[0] as HTMLElement);
    await screen.findByTestId('notes-new-note');
    expect(document.querySelector('.app-shell')).toBe(shell);
    expect(callsTo(patientsPath)).toBe(1);
    // His notes are read once, here, for the first time.
    expect(callsTo(johnNotesPath)).toBe(1);

    // And the whole way back, still the same node and still no second read of
    // either list.
    fireEvent.click(screen.getByTestId('view-all-patients'));
    await screen.findByTestId('patient-directory');
    expect(document.querySelector('.app-shell')).toBe(shell);
    expect(callsTo(patientsPath)).toBe(1);
    expect(callsTo(johnNotesPath)).toBe(1);
  });

  it('keeps the note she had open when she goes to the directory and comes back', async () => {
    renderApp(`/?patient=${john.id}&note=${johnsIntake.id}`);
    await screen.findByTestId('note-body');
    const shell = document.querySelector('.app-shell');

    fireEvent.click(screen.getByTestId('view-all-patients'));
    await screen.findByTestId('patient-directory');
    await act(async () => {
      await activeRouter?.navigate(`/?patient=${john.id}&note=${johnsIntake.id}`);
    });

    expect((await screen.findByTestId('note-title')).textContent).toBe('Intake note');
    // Same node throughout: the round trip did not remount the workspace.
    expect(document.querySelector('.app-shell')).toBe(shell);
    // He is a different selection when she comes back, so his notes are read
    // again — once — while the sidebar's patients are not read at all.
    expect(callsTo(patientsPath)).toBe(1);
    expect(callsTo(johnNotesPath)).toBe(2);
  });
});

/**
 * Capture as a window over the practice (owner, 2026-10-05), the shape Add
 * patient already had.
 *
 * `App.tsx` renders the workspace under the background location and the capture
 * screen in the real one, as siblings: so the workspace stays mounted (and its
 * editor, its sidebar and its lists stay exactly as they were), and the window
 * itself is **outside** the inerted background, which is what stops the Tab
 * order from reaching the practice behind it without reaching the textarea she
 * is typing in.
 */
describe('the capture window over the workspace', () => {
  beforeEach(() => {
    installFakeApi({
      formats: [progressNote],
      patients: [john, maria],
      notes: [johnsDraft, johnsIntake],
    });
  });

  it('leaves the practice mounted behind it, and inert', async () => {
    renderApp(`/?patient=${john.id}&note=${johnsIntake.id}`);
    await screen.findByTestId('note-body');
    const shell = document.querySelector('.app-shell');

    fireEvent.click(screen.getByTestId('notes-new-note'));

    expect(await screen.findByTestId('summary-input')).toBeDefined();
    expect(activeRouter?.state.location.pathname).toBe(`/capture/${john.id}`);
    expect(document.querySelector('.app-shell')).toBe(shell);
    expect(screen.getByTestId(`patient-row-${john.id}`)).toBeDefined();

    // The practice behind the window leaves the tab order...
    const background = screen.getByTestId('route-background');
    expect((background as unknown as { inert?: boolean }).inert).toBe(true);
    // ...and the window is a sibling of it, not something inside it, so
    // inerting the background cannot take the window down with it.
    expect(background.contains(screen.getByTestId('summary-input'))).toBe(false);
  });

  it('closes and reopens with Back and Forward, without disturbing the note', async () => {
    renderApp(`/?patient=${john.id}&note=${johnsIntake.id}`);
    await screen.findByTestId('note-body');
    const shell = document.querySelector('.app-shell');

    fireEvent.click(screen.getByTestId('notes-new-note'));
    await screen.findByTestId('summary-input');

    await act(async () => {
      await activeRouter?.navigate(-1);
    });
    await waitFor(() => {
      expect(screen.queryByTestId('summary-input')).toBeNull();
    });
    expect(document.querySelector('.app-shell')).toBe(shell);
    expect((screen.getByTestId('route-background') as unknown as { inert?: boolean }).inert).toBe(false);
    expect(screen.getByTestId('note-body')).toBeDefined();

    await act(async () => {
      await activeRouter?.navigate(1);
    });
    expect(await screen.findByTestId('summary-input')).toBeDefined();
    expect(document.querySelector('.app-shell')).toBe(shell);
  });

  /**
   * The keyboard has to come back with the window, not stay on the document.
   *
   * `Dialog` returns focus to whatever was focused when it opened, from its own
   * effect cleanup, and `App` takes the practice out of the tab order while the
   * window is up. If that second change lands *after* the first — a passive
   * effect behind a passive cleanup — the `focus()` is called on an element
   * inside an inert subtree, where focusing does nothing, and the browser drops
   * the keyboard on `<body>` (root's Chromium probe: `tag: "BODY"`).
   *
   * jsdom does not model `inert`, so this asserts the ordering itself: the
   * moment the opener is focused, the background must already be editable
   * again. That is the invariant the browser result depends on.
   */
  it('takes the practice out of the tab order before the keyboard goes back to the opener', async () => {
    renderApp(`/?patient=${john.id}`);
    const opener = (await screen.findByTestId('notes-new-note')) as HTMLButtonElement;
    // A real click focuses the button in a browser; jsdom does not, and the
    // opener is captured from `document.activeElement` when the window opens.
    opener.focus();
    expect(document.activeElement).toBe(opener);

    fireEvent.click(opener);
    await screen.findByTestId('summary-input');
    const background = screen.getByTestId('route-background');
    expect((background as unknown as { inert?: boolean }).inert).toBe(true);

    // Recorded at the moment the restore runs, not after.
    const inertWhenRestored: Array<boolean | undefined> = [];
    const record = (): void => {
      inertWhenRestored.push((background as unknown as { inert?: boolean }).inert);
    };
    opener.addEventListener('focus', record);

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByTestId('summary-input')).toBeNull();
    });

    expect(inertWhenRestored).not.toHaveLength(0);
    expect(inertWhenRestored.every((inert) => inert === false)).toBe(true);
    expect(document.activeElement).toBe(opener);
    expect((background as unknown as { inert?: boolean }).inert).toBe(false);
  });

  it('builds a background for a deep link to it, with that patient already chosen', async () => {
    renderApp(`/capture/${john.id}`);

    expect(await screen.findByTestId('summary-input')).toBeDefined();
    // No history behind it to carry, so the workspace is synthesised: home,
    // with the patient the capture is for. Without that the window would be a
    // full-screen page with no practice behind it.
    expect(screen.getByTestId('notes-new-note')).toBeDefined();
    expect(screen.getByTestId(`patient-row-${john.id}`)).toBeDefined();
  });
});

/**
 * The note capture makes, handed back as `?note=`.
 *
 * The workspace's notes loader fetches by patient and its callback only changes
 * with the patient, so a fresh id in the query string is invisible to it. It
 * asks for the list once when the id is not in it — quietly, so the column and
 * any open editor stay on screen, and without re-reading the patients or
 * remounting the sidebar. An id that genuinely does not exist must cost that
 * one request and no more, or a deleted note would loop forever.
 */
describe('a note handed back from capture', () => {
  const johnNotesPath = `GET /api/patients/${john.id}/notes`;

  function callsTo(api: ReturnType<typeof installFakeApi>, call: string): number {
    return api.calls.filter((entry) => entry === call).length;
  }

  it('reads the list once for an id it has not seen, and selects the note', async () => {
    const api = installFakeApi({ formats: [progressNote], patients: [john], notes: [johnsDraft] });
    const fresh = makeNote(john.id, { title: 'Fresh draft' });
    /*
     * The first read of his notes is held open, so the draft lands on the
     * server *after* that read has answered: the state this reproduces is the
     * real one, where the list is fetched before the note exists.
     */
    const originalFetch = globalThis.fetch;
    let held = false;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string, init: RequestInit = {}) => {
        const response = await originalFetch(path, init);
        if (path === `/api/patients/${john.id}/notes` && !held) {
          held = true;
          await gate;
        }
        return response;
      }),
    );

    renderApp(`/?patient=${john.id}&note=${fresh.id}`);
    await waitFor(() => {
      expect(held).toBe(true);
    });
    api.state.notes = [...api.state.notes, fresh];
    release();

    expect((await screen.findByTestId('note-title')).textContent).toBe('Fresh draft');
    expect(callsTo(api, johnNotesPath)).toBe(2);
    // Only the notes were re-read: the sidebar's patients were not.
    expect(callsTo(api, 'GET /api/patients')).toBe(1);
    // And it stops at one re-read rather than asking again on every render.
    await new Promise((resolve) => window.setTimeout(resolve, 60));
    expect(callsTo(api, johnNotesPath)).toBe(2);
  });

  it('asks once for an id that never turns up, rather than on every render', async () => {
    const api = installFakeApi({ formats: [progressNote], patients: [john], notes: [johnsDraft] });
    // A note deleted from another tab: the selection cannot be resolved, and
    // the workspace must not fall into reading the list forever.
    renderApp(`/?patient=${john.id}&note=${makeNote(john.id).id}`);

    expect(await screen.findByTestId('empty-no-note')).toBeDefined();
    await waitFor(() => {
      expect(callsTo(api, johnNotesPath)).toBe(2);
    });
    await new Promise((resolve) => window.setTimeout(resolve, 60));
    expect(callsTo(api, johnNotesPath)).toBe(2);
  });

  /**
   * The real browser run failed here, and the unit test above could not see it:
   * finishing the note she has open first replaces the list on screen through
   * `update`, so the refetch used to be skipped and the pane stayed on the
   * patient welcome with the new id in the URL and the note saved on the
   * server. What decides the refetch is the request the list came from, not the
   * array's identity — which is what this walks through end to end: save,
   * New note, Create draft.
   */
  it('selects a draft made after the open note was saved, rather than leaving the welcome', async () => {
    const api = installFakeApi({
      formats: [progressNote],
      patients: [john],
      notes: [johnsDraft, johnsIntake],
    });
    renderApp(`/?patient=${john.id}&note=${johnsDraft.id}`);
    const body = (await screen.findByTestId('note-body')) as HTMLTextAreaElement;

    // Finish the note that is open (a draft, so the save is the ordinary
    // debounced one). This is the local `update` that used to poison the guard
    // for the rest of the visit.
    fireEvent.change(body, { target: { value: 'Objective: saved before the next note.' } });
    await waitFor(() => {
      expect(api.state.notes.find((note) => note.id === johnsDraft.id)?.content).toContain(
        'saved before the next note',
      );
    });
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 20));
    });

    fireEvent.click(screen.getByTestId('notes-new-note'));
    await screen.findByTestId('summary-input');
    fireEvent.change(screen.getByTestId('summary-input'), {
      target: { value: 'Sleep better this week.' },
    });
    fireEvent.click(screen.getByTestId('process-note'));

    // The window closes on the new id, and only once it has can the assertions
    // below mean anything: the editor of the note she had open is mounted
    // behind the window the whole time.
    const made = api.state.notes.find((note) => note.id !== johnsDraft.id && note.id !== johnsIntake.id);
    expect(made).toBeDefined();
    await waitFor(() => {
      expect(screen.queryByTestId('summary-input')).toBeNull();
    });
    expect(activeRouter?.state.location.search).toBe(`?patient=${john.id}&note=${made?.id ?? ''}`);

    // The draft it just made is the note on screen, and it is the real one.
    expect(await screen.findByTestId('note-title')).toHaveProperty('textContent', 'Progress note');
    expect((await screen.findByTestId('note-body')) as HTMLTextAreaElement).toHaveProperty(
      'value',
      draftContent(progressNote.sections, 'Sleep better this week.'),
    );
    // One extra read of his notes — the refetch — and no re-read of the
    // patients, so the sidebar never redrew.
    expect(callsTo(api, johnNotesPath)).toBe(2);
    expect(callsTo(api, 'GET /api/patients')).toBe(1);
  });

  /**
   * An answer for the patient she has just left must not stand in for this
   * patient's list. The old patient's read is held open and released *after*
   * the switch, so it lands while the new patient's own read is still in
   * flight: it may not claim to be the answer, and the new patient's list is
   * then read once for itself and once for the id that is not in it.
   */
  it('does not take a late answer for the previous patient as this one', async () => {
    const mariaNote = makeNote(maria.id, { title: 'Maria note' });
    const api = installFakeApi({
      formats: [progressNote],
      patients: [john, maria],
      notes: [johnsDraft, johnsIntake, mariaNote],
    });
    const mariaNotesPath = `GET /api/patients/${maria.id}/notes`;
    const originalFetch = globalThis.fetch;
    const gates = new Map<string, Promise<void>>();
    const openers = new Map<string, () => void>();
    function hold(path: string): void {
      const promise = new Promise<void>((resolve) => {
        openers.set(path, resolve);
      });
      gates.set(path, promise);
    }
    hold(`/api/patients/${john.id}/notes`);
    hold(`/api/patients/${maria.id}/notes`);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string, init: RequestInit = {}) => {
        const response = await originalFetch(path, init);
        const gate = gates.get(path);
        if (gate !== undefined) {
          gates.delete(path);
          await gate;
        }
        return response;
      }),
    );

    renderApp(`/?patient=${john.id}`);
    await waitFor(() => {
      expect(api.calls.filter((entry) => entry === `GET /api/patients/${john.id}/notes`)).toHaveLength(1);
    });

    // Straight to somebody else, asking for an id that is not hers.
    await act(async () => {
      await activeRouter?.navigate(`/?patient=${maria.id}&note=${makeNote(maria.id).id}`);
    });
    await waitFor(() => {
      expect(callsTo(api, mariaNotesPath)).toBe(1);
    });

    // His answer arrives now, describing a list that is not on screen.
    openers.get(`/api/patients/${john.id}/notes`)?.();
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 20));
    });
    expect(callsTo(api, mariaNotesPath)).toBe(1);

    // Hers answers, and the id still is not in it: one refetch, then quiet.
    openers.get(`/api/patients/${maria.id}/notes`)?.();
    expect(await screen.findByTestId('empty-no-note')).toBeDefined();
    await waitFor(() => {
      expect(callsTo(api, mariaNotesPath)).toBe(2);
    });
    await new Promise((resolve) => window.setTimeout(resolve, 60));
    expect(callsTo(api, mariaNotesPath)).toBe(2);
  });
});

/**
 * Blank space in the notes column clears the note and the view and keeps the
 * patient (owner, 2026-10-05).
 *
 * The editor stays mounted until that flush resolves, because its own cleanup
 * swallows a failed save: a note with an unsaved edit, or a conflict she has
 * not chosen between, would otherwise disappear with nothing said. A refused
 * flush therefore keeps the editor, keeps the query, and says why — the same
 * rule the primary-window handoff follows.
 */
describe('clearing the selection from blank space in the notes column', () => {
  beforeEach(() => {
    installFakeApi({
      formats: [progressNote],
      patients: [john, maria],
      notes: [johnsDraft, johnsIntake],
    });
  });

  it('returns to the patient welcome and keeps the patient, the sidebar and the app', async () => {
    renderApp(`/?patient=${john.id}&note=${johnsIntake.id}`);
    await screen.findByTestId('note-body');

    fireEvent.click(screen.getByTestId('note-list'));

    expect(await screen.findByTestId('empty-no-note')).toBeDefined();
    expect(activeRouter?.state.location.search).toBe(`?patient=${john.id}`);
    expect(screen.getByTestId(`patient-row-${john.id}`)).toBeDefined();
  });

  it('saves what is still pending before it clears, rather than dropping it', async () => {
    const api = installFakeApi({
      formats: [progressNote],
      patients: [john, maria],
      notes: [johnsDraft, johnsIntake],
    });
    renderApp(`/?patient=${john.id}&note=${johnsDraft.id}`);
    const body = (await screen.findByTestId('note-body')) as HTMLTextAreaElement;

    // Typed a moment ago and still inside the 400ms debounce, then straight to
    // blank space: the flush has to reach the server before the editor goes.
    fireEvent.change(body, { target: { value: 'Subjective: typed a moment ago.' } });
    fireEvent.click(screen.getByTestId('note-list'));

    await waitFor(() => {
      expect(api.state.notes.find((note) => note.id === johnsDraft.id)?.content).toBe(
        'Subjective: typed a moment ago.',
      );
    });
    expect(await screen.findByTestId('empty-no-note')).toBeDefined();
  });

  it('keeps the editor and says why when the pending save conflicts', async () => {
    const updatePath = `/api/notes/${johnsIntake.id}`;
    const originalFetch = globalThis.fetch;
    /*
     * Another window edited the same note first, which is the conflict the
     * editor reports as unresolved: the save is refused, and the editor asks
     * the server for the other window's version so she can choose. Both halves
     * are answered here, because the fake API has no `GET /api/notes/:id` of
     * its own and would answer the refetch with a stale-write error instead.
     */
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string, init: RequestInit = {}) => {
        if (path === updatePath && init.method === 'PATCH') {
          return new Response(JSON.stringify({ error: 'conflict', message: 'Edited elsewhere.' }), {
            status: 409,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (path === updatePath) {
          return new Response(JSON.stringify(johnsIntake), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return originalFetch(path, init);
      }),
    );
    renderApp(`/?patient=${john.id}&note=${johnsIntake.id}`);
    const body = (await screen.findByTestId('note-body')) as HTMLTextAreaElement;

    fireEvent.change(body, { target: { value: 'Subjective: a conflicting edit.' } });
    fireEvent.click(screen.getByTestId('note-list'));

    // The editor says a conflict is unresolved, in its own words, and the
    // workspace adds its own — the deselect gave up rather than clearing.
    expect(await screen.findByTestId('note-conflict')).toBeDefined();
    expect((await screen.findByTestId('toast-error')).textContent).toContain('Unresolved conflict');
    // Nothing was cleared: the editor and the selection are still hers.
    expect(screen.getByTestId('note-body')).toBeDefined();
    expect(activeRouter?.state.location.search).toBe(`?patient=${john.id}&note=${johnsIntake.id}`);
  });
});

describe('renaming a patient', () => {
  it('shows no import badge, and renames from the row', async () => {
    const guessed = makePatient('Ana', { name_guessed: true });
    installFakeApi({ formats: [progressNote], patients: [guessed] });
    renderApp('/');

    await screen.findAllByText('Ana');
    // The owner asked for the "name guessed — check" badge to go (2026-09-21).
    expect(screen.queryByText(/name guessed/i)).toBeNull();

    fireEvent.click(screen.getByLabelText('Tools for Ana'));
    fireEvent.click(screen.getByTestId(`rename-${guessed.id}`));
    const field = screen.getByLabelText('Name for Ana');
    fireEvent.change(field, { target: { value: 'Ana Torres' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    expect((await screen.findAllByText('Ana Torres')).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText('Name for Ana Torres')).toBeNull();
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

  it('opens a brainstorm above the treatment plan, with nothing written anywhere', async () => {
    renderApp(`/?patient=${john.id}`);

    /**
     * The column's band of tools is its own container now (the "narrow way
     * back" rides along as its first row), so "Brainstorm comes first" is a
     * claim about the first *tool* in it, not about its first child.
     */
    const tools = await screen.findByTestId('notes-tools');
    const toolIds = within(tools)
      .getAllByTestId(/^open-/)
      .map((button) => button.getAttribute('data-testid'));
    expect(toolIds).toEqual(['open-brainstorm', 'open-plan', 'open-prep']);

    fireEvent.click(screen.getByTestId('open-brainstorm'));

    expect(await screen.findByTestId('brainstorm-view')).toBeTruthy();
    expect(screen.getByTestId('open-brainstorm').className).toContain('active');
    // The notes are still one click away, and nothing here links into them.
    expect(screen.getByTestId('note-list')).toBeTruthy();
    expect(screen.queryByTestId('brainstorm-reply')).toBeNull();
    expect((await screen.findByTestId('brainstorm-empty')).textContent).toContain('never written');
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
      expect(screen.getByTestId('note-save-status').textContent).toBe('Saved');
    });
  });

  it('finishes: copies the note, locks the body, and edits again on a second click', async () => {
    const clipboard = installFakeClipboard();
    const body = await openNote();

    fireEvent.click(screen.getByTestId('publish-button'));

    await waitFor(() => {
      expect(screen.getByTestId('publish-button').textContent).toContain('Edit again');
    });
    expect(body).toHaveProperty('readOnly', true);
    expect(clipboard.written).toEqual([note.content]);

    fireEvent.click(screen.getByTestId('publish-button'));

    await waitFor(() => {
      expect(screen.getByTestId('publish-button').textContent).toBe('Finish & copy');
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

    // It was the patient's only note, so the selection clears to the no-notes
    // welcome (owner, 2026-09-28): one button, and no notes column.
    expect(await screen.findByTestId('patient-welcome-first')).toBeDefined();
    expect(screen.queryByTestId('note-title')).toBeNull();
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
    renderApp();

    await screen.findAllByText('Maria Ruiz');
    fireEvent.click(await screen.findByTestId('view-all-patients'));
    fireEvent.click(await screen.findByTestId('directory-tab-archived'));
    fireEvent.click(await screen.findByTestId(`patient-menu-all-${maria.id}`));
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

    // One honest screen instead of an empty practice: nothing that looks like
    // her records is rendered when the server never answered.
    const alert = await screen.findByTestId('server-unavailable');
    expect(alert.getAttribute('role')).toBe('alert');
    expect(alert.textContent).toContain('can’t reach its server');
    expect(alert.textContent).toContain('Start Apunta again');
    expect(screen.queryByTestId('patient-list')).toBeNull();
    expect(screen.queryByTestId('note-list')).toBeNull();
  });
});

describe('first run', () => {
  it('sends a practice with no note format to onboarding', async () => {
    installFakeApi({ formats: [], patients: [] });

    renderApp();

    expect(await screen.findByText('Add your note format')).toBeDefined();
  });

  it('offers her standard progress note first, preselected, and saves it in one click', async () => {
    const api = installFakeApi({ formats: [], patients: [] });
    renderApp('/onboarding/format');

    const option = await screen.findByTestId('option-standard');
    expect(option.className).toContain('selected');
    expect(option.textContent).toContain('Recommended');
    expect(option.textContent).toContain('Location, Client presentation, Risk review');
    // First of the four ways in.
    expect(option.parentElement?.firstElementChild).toBe(option);

    fireEvent.click(screen.getByTestId('format-continue'));

    expect(await screen.findByRole('heading', { name: 'Add patient' })).toBeDefined();
    expect(api.state.formats).toHaveLength(1);
    expect(api.state.formats[0]).toMatchObject({
      name: 'Progress note',
      sections: [
        'Location',
        'Client presentation',
        'Risk review',
        'Discussion',
        'Intervention',
        'Out of session actions',
        'Note for next session',
      ],
    });
    expect(api.state.formats[0]?.instructions).not.toBe('');
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
  let editorApi: FakeApi;

  /** Format › Edit, opened inside the settings modal where it lives now. */
  async function openEditor(): Promise<void> {
    editorApi = installFakeApi({ formats: [makeFormat('Progress note', ['Subjective', 'Plan'])] });
    await openSettings('format');
    fireEvent.click(await screen.findByTestId('edit-format'));
  }

  it('renames a section, reorders it, and both land without a save button', async () => {
    await openEditor();

    const chips = await screen.findByTestId('section-chips');
    fireEvent.click(within(chips).getByRole('button', { name: 'Rename Subjective' }));
    fireEvent.change(within(chips).getByLabelText('New name for Subjective'), {
      target: { value: 'Presenting concern' },
    });
    fireEvent.keyDown(within(chips).getByLabelText('New name for Subjective'), { key: 'Enter' });

    // Up/down rather than drag: one click, and it is the whole keyboard story.
    fireEvent.click(within(chips).getByRole('button', { name: 'Move Plan up' }));

    // This format already exists, so there is no save to press (owner,
    // 2026-10-05): each edit writes itself.
    expect(screen.queryByTestId('save-format')).toBeNull();
    await waitFor(() => {
      expect(editorApi.state.formats[0]?.sections).toEqual(['Plan', 'Presenting concern']);
    });

    // Autosaving does not navigate: the editor is still open, and the app has
    // not moved either — Settings is a modal, not a screen (owner, 2026-10-05).
    expect(screen.queryByTestId('format-list')).toBeNull();
    expect(activeRouter?.state.location.pathname).toBe('/');
  });

  it('refuses a rename that collides with another section', async () => {
    await openEditor();

    const chips = await screen.findByTestId('section-chips');
    fireEvent.click(within(chips).getByRole('button', { name: 'Rename Subjective' }));
    fireEvent.change(within(chips).getByLabelText('New name for Subjective'), {
      target: { value: 'plan' },
    });
    fireEvent.keyDown(within(chips).getByLabelText('New name for Subjective'), { key: 'Enter' });

    expect((await screen.findByRole('alert')).textContent).toContain('already a section');
  });
});

/**
 * Adding a patient as a window over the workspace rather than a screen of its
 * own (owner, 2026-09-27, after Claude's): the practice stays behind, dimmed
 * and blurred, and the way out is the × at the top right.
 *
 * The blurred scrim and the ×'s bare glyph are CSS, and jsdom has no cascade —
 * so what is pinned here is the half a diff would hide: that the workspace is
 * really still mounted behind the window, that both ways out close it, and that
 * the field she is here to fill is the one holding focus. The scrim itself is
 * read off the stylesheet in `addPatientWindowStyles`.
 */
describe('the add-patient window', () => {
  it('is a dialog over the workspace, not a screen that replaced it', async () => {
    installFakeApi({ formats: [progressNote], patients: [john, maria] });
    renderApp('/patients/new');

    const dialog = await screen.findByTestId('add-patient-modal');
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    // The name of the window is what the owner asked for and the lede she did
    // not: "Just enough to organize her notes." is gone from the tree.
    expect(within(dialog).getByRole('heading', { name: 'Add patient' })).toBeDefined();
    expect(document.body.textContent).not.toContain('Just enough to organize');
    // Both fields, and nothing else in the way.
    expect(within(dialog).getByLabelText('Name')).toBeDefined();
    expect(within(dialog).getByLabelText('Identifier (optional)')).toBeDefined();

    // The practice is still there behind it: the sidebar, its search field and
    // her patients are all mounted, which is the whole point of a window.
    expect(screen.getByTestId(`patient-row-${john.id}`)).toBeDefined();
    expect(screen.queryByTestId('sidebar-rail')).toBeNull();
    expect(screen.getByLabelText('Search patients')).toBeDefined();
  });

  it('puts the caret in the name, not on the × that comes first in the panel', async () => {
    installFakeApi({ formats: [progressNote], patients: [john] });
    renderApp('/');
    // One frame first. When the app mounts, `usePrimaryWindow` parks focus on
    // the route wrapper as the window wins the primary lock, and it does that
    // in the *next* frame — so a click landing inside that frame races it. In
    // the app she cannot click that fast; a test can, so the frame is waited
    // out here rather than the race being papered over in the component.
    await new Promise((resolve) => {
      requestAnimationFrame(() => {
        resolve(undefined);
      });
    });

    // Opened the way every entry point opens it — a click in the sidebar, so a
    // client-side navigation rather than a cold load of /patients/new.
    fireEvent.click(await screen.findByTestId('new-patient'));
    const dialog = await screen.findByTestId('add-patient-modal');
    const name = within(dialog).getByLabelText('Name') as HTMLInputElement;
    await waitFor(() => {
      expect(document.activeElement).toBe(name);
    });
  });

  it('closes on the × and on Escape, leaving the workspace as it was', async () => {
    installFakeApi({ formats: [progressNote], patients: [john] });
    renderApp('/');
    const router = activeRouter;
    fireEvent.click(await screen.findByTestId('new-patient'));
    expect(await screen.findByTestId('add-patient-modal')).toBeDefined();

    fireEvent.click(screen.getByTestId('add-patient-close'));

    await waitFor(() => {
      expect(screen.queryByTestId('add-patient-modal')).toBeNull();
    });
    // Back in the workspace, not on a blank screen: the route that opened it.
    expect(router?.state.location.pathname).toBe('/');
    expect(screen.getByTestId(`patient-row-${john.id}`)).toBeDefined();

    // And the keyboard way out is the same door.
    fireEvent.click(screen.getByTestId('new-patient'));
    expect(await screen.findByTestId('add-patient-modal')).toBeDefined();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByTestId('add-patient-modal')).toBeNull();
    });
  });

  it('opens from the sidebar New row, and the × is the only way out of it', async () => {
    installFakeApi({ formats: [progressNote], patients: [john] });
    renderApp('/');

    fireEvent.click(await screen.findByTestId('new-patient'));
    const dialog = await screen.findByTestId('add-patient-modal');

    // A Back link was the old way out of a screen; the × is the new one, and it
    // is named for the window it closes rather than for the word "close".
    expect(dialog.querySelector('.back')).toBeNull();
    expect(within(dialog).getByLabelText('Close add patient')).toBeDefined();
  });

  /**
   * The blurred page behind, which is the part of "a little window, like Claude"
   * that lives entirely in the stylesheet. Read as source for the reason given
   * above: the web vitest project stubs CSS imports, so a rendered element
   * cannot show what the backdrop resolved to.
   */
  it('dims and blurs the page behind it, and keeps the × a bare glyph', () => {
    const appCss = readFileSync(join(import.meta.dirname, 'styles', 'app.css'), 'utf8');
    // The scrim rule Settings already had, now naming every other window too —
    // one rule for "a modal over the workspace", not a second copy of the blur.
    // One rule for every window that sits over the workspace — Settings, adding
    // a patient, the language chooser, the new-note window and the import
    // window (owner, 2026-10-05) — rather than one copy of the blur each, which
    // is how five windows end up blurring five different amounts.
    const shared = appCss.match(
      /\.modal-backdrop:has\(\.settings-modal\),\s*\.modal-backdrop:has\(\.add-patient-modal\),\s*\.modal-backdrop:has\(\.language-modal\),\s*\.modal-backdrop:has\(\.capture-modal\),\s*\.modal-backdrop:has\(\.import-modal\)\s*\{[^}]*\}/,
    );
    expect(shared?.[0]).toContain('background: var(--scrim)');
    expect(shared?.[0]).toContain('backdrop-filter: blur(var(--scrim-blur))');
    // And it is still the only place the blur is written.
    expect([...appCss.matchAll(/backdrop-filter:\s*blur\(var\(--scrim-blur\)\)/g)]).toHaveLength(1);

    // The × wears no box, as Settings' does.
    const close = appCss.match(/\.add-patient-head \.icon-btn\s*\{[^}]*\}/);
    expect(close?.[0]).toContain('border-color: transparent');
    expect(close?.[0]).toContain('background: transparent');
  });
});

/**
 * The two stylesheets this batch added, and the import order that was quietly
 * undoing them.
 *
 * Both reach the bundle through `App.tsx`, which `main.tsx` imports **before**
 * `app.css`, so at equal specificity the workspace's own rule is the later one
 * and wins. The built stylesheet really did render the new-note window at
 * `.modal`'s 460px instead of the 560px it declares, and dropped
 * `.notes-col-new`'s `margin: 0` and `.notes-col-body`'s `flex: 1 1 auto`.
 *
 * jsdom has no cascade, so this is the same source-level check as the scrim
 * above: each rule that overrides something in `app.css` is compounded with the
 * class `app.css` gives the same element, which makes the stated value win
 * whatever the order is.
 */
describe('the batch stylesheets against the workspace cascade', () => {
  const appCss = readFileSync(join(import.meta.dirname, 'styles', 'app.css'), 'utf8');
  const captureCss = readFileSync(join(import.meta.dirname, 'styles', 'capture-modal.css'), 'utf8');
  const notesCss = readFileSync(join(import.meta.dirname, 'styles', 'notes-column.css'), 'utf8');

  it('compounds every new-note rule that overrides the shared .modal', () => {
    // The rule it has to beat, and what it declares instead.
    expect(appCss).toMatch(/\.modal\s*\{[^}]*max-width: 460px/);
    const panel = captureCss.match(/\.modal\.capture-modal\s*\{[^}]*\}/);
    expect(panel?.[0]).toContain('max-width: 560px');
    // Its own scrolling, which `.modal` never claimed.
    expect(panel?.[0]).toContain('max-height: calc(100vh - 2 * var(--space-24))');
    expect(panel?.[0]).toContain('overflow-y: auto');
    // And the blur is still only in `app.css` — restating it here would be the
    // second copy the shared scrim rule exists to prevent.
    expect(captureCss).not.toContain('backdrop-filter');
  });

  it('compounds every notes-column rule that overrides a .col rule', () => {
    expect(appCss).toMatch(/\.new-note-btn\s*\{[^}]*margin: 0 0 var\(--space-2\)/);
    expect(notesCss).toMatch(/\.new-note-btn\.notes-col-new\s*\{[^}]*margin: 0;/);
    expect(appCss).toMatch(/\.col-body\s*\{[^}]*flex: 1;/);
    expect(notesCss).toMatch(/\.col-body\.notes-col-body\s*\{[^}]*flex: 1 1 auto;/);
    // The narrow way back, whose base padding is `.narrow-back`'s.
    expect(appCss).toMatch(/\.narrow-back\s*\{[^}]*padding: var\(--space-2\) var\(--space-0\)/);
    expect(notesCss).toMatch(/\.narrow-back\.notes-col-back\s*\{[^}]*padding-inline-start:/);
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
          message: "Apunta can't reach the local AI.",
        },
      },
    );
    renderApp(`/capture/${john.id}`);

    await screen.findByText(`New note for ${john.name}`);
    fireEvent.change(screen.getByTestId('summary-input'), { target: { value: 'Sleep improved.' } });
    fireEvent.click(screen.getByTestId('process-note'));

    const captureError = await screen.findByTestId('capture-error');
    expect(captureError.getAttribute('role')).toBe('alert');
    expect(captureError).toHaveProperty('textContent', expect.stringContaining("can't reach the local AI"));
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

  let activeApi: ReturnType<typeof installFakeApi>;

  function openNote(overrides: Partial<Note> = {}, messages: ChatMessage[] = []): Note {
    const note = makeNote(john.id, { format_id: progressNote.id, content: NOTE_TEXT, ...overrides });
    activeApi = installFakeApi({
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

  it('flushes a just-typed note before refining, so the rewrite uses fresh text', async () => {
    const note = openNote();
    const body = (await screen.findByTestId('note-body')) as HTMLTextAreaElement;
    const freshText = NOTE_TEXT.replace(
      'Subjective: Improved sleep.',
      'Subjective: Fresh text from the editor.',
    );
    const updatePath = `/api/notes/${note.id}`;
    const chatPath = `/api/notes/${note.id}/chat`;

    // Hold the note PATCH open. A send that only starts the flush, rather than
    // awaiting it, will reach chat while this request is still unresolved.
    const originalFetch = globalThis.fetch;
    let releaseUpdate!: () => void;
    const updateReleased = new Promise<void>((resolve) => {
      releaseUpdate = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string, init: RequestInit = {}) => {
        const response = await originalFetch(path, init);
        if (path === updatePath && init.method === 'PATCH') await updateReleased;
        return response;
      }),
    );

    fireEvent.change(body, { target: { value: freshText } });
    fireEvent.change(screen.getByTestId('chat-input'), { target: { value: 'Make the plan shorter' } });
    fireEvent.click(screen.getByTestId('chat-send'));

    await waitFor(() => {
      expect(activeApi.calls).toContain(`PATCH ${updatePath}`);
    });
    expect(activeApi.calls).not.toContain(`POST ${chatPath}`);
    releaseUpdate();
    await waitFor(() => {
      expect(activeApi.calls).toContain(`POST ${chatPath}`);
    });

    // Wait beyond the normal 400ms debounce: without the pre-send flush, its
    // old whole-note snapshot lands after the chat rewrite and overwrites it.
    await new Promise((resolve) => window.setTimeout(resolve, 450));
    await waitFor(() => {
      expect(body.value).toContain('Subjective: Fresh text from the editor.');
      expect(body.value).toContain('Plan: Continue weekly sessions and grounding exercises.');
      expect(body.value).not.toContain('Introduce grounding exercises');
    });
    expect(activeApi.state.notes.find((candidate) => candidate.id === note.id)?.content).toBe(body.value);
  });

  it('offers no quick-action buttons: the refine chat is just a chat', async () => {
    openNote();
    await screen.findByTestId('note-body');

    // Owner's choice (docs/decisions.md, 2026-09-21): she types or dictates
    // what she wants; one-click rewrites of a clinical note are gone.
    const panel = screen.getByTestId('chat-panel');
    for (const label of ['Shorter', 'More clinical', 'Expand plan', "What's missing?"]) {
      expect(within(panel).queryByRole('button', { name: label })).toBeNull();
    }
    expect(within(panel).getByTestId('chat-input')).toBeDefined();
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
    // The quote is the message's, inside the user's own bubble. (The chip's own
    // span carries the same words, so the query has to be scoped to the bubble.)
    const bubble = (await screen.findByText('Tighten this')).closest('.chat-bubble');
    expect(bubble?.querySelector('.chat-quote')?.textContent).toBe('“Subjective: Improved sleep.”');
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
      { chatError: { code: 'ollama_unreachable', message: "Apunta can't reach the local AI." } },
    );
    renderApp(`/?patient=${john.id}&note=${note.id}`);
    const body = (await screen.findByTestId('note-body')) as HTMLTextAreaElement;

    fireEvent.change(screen.getByTestId('chat-input'), { target: { value: 'Make the plan shorter' } });
    fireEvent.click(screen.getByTestId('chat-send'));

    expect((await screen.findByTestId('chat-error')).textContent).toContain("can't reach the local AI");
    expect(body.value).toBe(NOTE_TEXT);
  });
});

/*
 * The two things a note body marks, and neither of them is a banner (owner,
 * 2026-10-05: the "Nothing recorded in … — add or leave blank." notice above
 * the editor is gone). Neither gates anything.
 */
describe('editor markers', () => {
  it('marks an empty section in the text, without blocking anything', async () => {
    const note = makeNote(john.id, {
      format_id: progressNote.id,
      content: 'Subjective: Improved sleep.\n\nObjective:\n\nAssessment: Progressing.\n\nPlan: Weekly.',
    });
    installFakeApi({ formats: [progressNote], patients: [john], notes: [note] });
    renderApp(`/?patient=${john.id}&note=${note.id}`);

    await screen.findByTestId('note-body');
    const marks = within(screen.getByTestId('note-highlights')).getAllByText('Objective:');
    expect(marks[0]?.className).toContain('marker-empty-section');
    // The blank is visible where it is, and there is no notice above the
    // editor naming it: nothing sits between her and the note.
    expect(screen.queryByTestId('empty-sections')).toBeNull();
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

describe('first run, with nothing set up yet', () => {
  /*
   * The day-one rehearsal (2026-08-30) found this screen was the entire app
   * until a format existed, and it carried no links: a practice restoring
   * onto a new Mac — every note sitting in a backup file — was asked to
   * invent a note format instead. Restore lives in Settings.
   */
  it('offers a way to restore a backup instead of building a format', async () => {
    installFakeApi({ formats: [] });
    renderApp('/');

    // With no formats, the app opens on onboarding rather than the workspace.
    expect(await screen.findByText('Add your note format')).toBeDefined();

    fireEvent.click(screen.getByTestId('onboarding-restore'));

    const card = await screen.findByTestId('backup-card');
    expect(within(card).getByText('Backup')).toBeDefined();
  });
});

describe('settings', () => {
  it('lists formats with their sections, and edits one in the pane', async () => {
    installFakeApi({ formats: [progressNote] });
    const modal = await openSettings('format');

    const formats = within(modal).getByTestId('format-list');
    expect(formats.textContent).toContain('Subjective, Objective, Assessment, Plan');

    fireEvent.click(within(formats).getByTestId('edit-format'));

    // The editor is in the pane, not on a screen of its own: the nav, the
    // modal and the URL behind it all stay where they were (owner,
    // 2026-10-05).
    expect(screen.getByLabelText('Format name')).toHaveProperty('value', 'Progress note');
    expect(activeRouter?.state.location.pathname).toBe('/');
    expect(screen.getByTestId('settings-pane-back')).not.toBeNull();

    fireEvent.click(screen.getByTestId('settings-pane-back'));
    expect(await screen.findByTestId('format-list')).toBeDefined();
  });

  it('asks how to add a format in the pane, and saves the standard one there', async () => {
    const api = installFakeApi({ formats: [progressNote] });
    await openSettings('format');

    fireEvent.click(screen.getByTestId('add-format'));

    fireEvent.click(await screen.findByTestId('option-standard'));
    fireEvent.click(screen.getByTestId('format-continue'));

    // Back to the list, with the format she just added on it.
    const formats = await screen.findByTestId('format-list');
    expect(formats.textContent).toContain('Progress note');
    expect(api.state.formats).toHaveLength(2);
    expect(activeRouter?.state.location.pathname).toBe('/');
  });

  /**
   * The accent is the Apunta teal, always (owner, 2026-09-28). The picker is
   * gone, so a colour an older build stored must not be painted: there would
   * be no way to change it back.
   */
  it('paints the Apunta teal whatever accent an older build stored', async () => {
    installFakeApi({ formats: [progressNote], settings: { accent_color: '#8b2f6b' } });
    await openSettings();

    await screen.findByTestId('appearance-settings');
    expect(screen.queryByLabelText('Colour')).toBeNull();
    expect(screen.queryByLabelText('Color')).toBeNull();
    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#2a9d8f');
    });
    document.documentElement.style.removeProperty('--accent');
  });

  it('offers the four sections in order, one at a time', async () => {
    installFakeApi({ formats: [progressNote] });
    const modal = await openSettings();

    const tabs = ['appearance', 'format', 'backup', 'about'];
    const nav = within(modal).getByLabelText('Settings sections');
    expect(
      [...nav.querySelectorAll('.settings-nav-item')].map((item) => item.getAttribute('data-testid')),
    ).toEqual(tabs.map((id) => `settings-tab-${id}`));
    // And Import is not here any more: it moved to "More" (owner,
    // 2026-09-27), so the section and its two links are **gone** rather than
    // left behind as a second door to the same screens. Two doors is how two
    // places end up disagreeing about where importing lives.
    expect(within(modal).queryByTestId('settings-import')).toBeNull();
    expect(within(modal).queryByTestId('settings-import-halaxy')).toBeNull();
    expect(within(modal).queryByTestId('settings-tab-import')).toBeNull();

    // "Add another format" is the format card's last row.
    fireEvent.click(within(modal).getByTestId('settings-tab-format'));
    const formats = await screen.findByTestId('format-list');
    const add = within(formats).getByTestId('add-format');
    expect(add.textContent).toContain('Add another format');
    expect(formats.lastElementChild).toBe(add);
  });

  it('saves a text size immediately by scaling one root token', async () => {
    const api = installFakeApi({ formats: [progressNote] });
    await openSettings();

    const large = await screen.findByTestId('font-size-large');
    expect(screen.getByTestId('font-size-default').getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByTestId('appearance-saved')).toBeNull();
    fireEvent.click(large);
    expect(document.documentElement.style.getPropertyValue('--font-scale')).toBe('1.15');
    await waitFor(() => {
      expect(api.state.settings['font_size']).toBe('large');
    });
    expect(screen.getByTestId('appearance-saved').textContent).toBe('Saved');

    // Back to default removes the override and saves that too.
    fireEvent.click(screen.getByTestId('font-size-default'));
    expect(document.documentElement.style.getPropertyValue('--font-scale')).toBe('');
    await waitFor(() => {
      expect(api.state.settings['font_size']).toBe('default');
    });
    // Every change is saved, so leaving the screen keeps the stored size.
    cleanup();
    expect(document.documentElement.style.getPropertyValue('--font-scale')).toBe('');
    document.documentElement.style.removeProperty('--font-scale');
  });

  it('turns animations off app-wide and remembers it immediately', async () => {
    const api = installFakeApi({ formats: [progressNote] });
    await openSettings();

    const toggle = (await screen.findByTestId('animations-toggle')) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    expect(screen.queryByTestId('appearance-saved')).toBeNull();
    fireEvent.click(toggle);
    expect(document.documentElement.classList.contains('no-motion')).toBe(true);

    await waitFor(() => {
      expect(api.state.settings['animations']).toBe(false);
    });
    expect(screen.getByTestId('appearance-saved').textContent).toBe('Saved');
    document.documentElement.classList.remove('no-motion');
  });

  it('saves a theme immediately, defaulting to dark', async () => {
    const api = installFakeApi({ formats: [progressNote] });
    await openSettings();

    const dark = await screen.findByTestId('theme-dark');
    expect(dark.getAttribute('aria-checked')).toBe('true');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(screen.queryByTestId('appearance-saved')).toBeNull();

    fireEvent.click(screen.getByTestId('theme-light'));
    expect(document.documentElement.dataset.theme).toBe('light');

    await waitFor(() => {
      expect(api.state.settings['theme']).toBe('light');
    });
    expect(screen.getByTestId('appearance-saved').textContent).toBe('Saved');
    document.documentElement.dataset.theme = 'dark';
  });

  /**
   * The switcher is three icons in one segmented pill (owner preview,
   * 2026-09-26). Nothing on screen says which glyph is which, so each is named
   * for a screen reader and the group's choice is pinned to one tab stop.
   */
  it('offers the three themes as one named switcher, and saves the system one', async () => {
    const api = installFakeApi({ formats: [progressNote] });
    await openSettings();

    const group = (await screen.findByTestId('theme-system')).closest('.theme-switch');
    expect(group).not.toBeNull();
    const switcher = within(group as HTMLElement);
    for (const name of ['System', 'Light', 'Dark']) {
      const segment = switcher.getByRole('radio', { name });
      expect(segment.querySelector('svg'), name).not.toBeNull();
    }
    expect(switcher.getByTestId('theme-dark').getAttribute('tabindex')).toBe('0');
    expect(switcher.getByTestId('theme-system').getAttribute('tabindex')).toBe('-1');

    fireEvent.click(screen.getByTestId('theme-system'));
    // jsdom has no matchMedia, so the platform cannot say and the system choice
    // paints light — the stored choice is `system` either way.
    expect(document.documentElement.dataset.theme).toBe('light');
    await waitFor(() => {
      expect(api.state.settings['theme']).toBe('system');
    });
    document.documentElement.dataset.theme = 'dark';
  });

  it('applies a saved light theme at startup', async () => {
    installFakeApi({ formats: [progressNote], settings: { theme: 'light' } });
    renderApp('/');

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('light');
    });
    document.documentElement.dataset.theme = 'dark';
  });

  it('applies saved text size and animations at startup', async () => {
    installFakeApi({ formats: [progressNote], settings: { font_size: 'extra-large', animations: false } });
    renderApp('/');

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--font-scale')).toBe('1.3');
    });
    expect(document.documentElement.classList.contains('no-motion')).toBe(true);
    document.documentElement.style.removeProperty('--font-scale');
    document.documentElement.classList.remove('no-motion');
  });

  it('defaults animations to off when the system asks for reduced motion', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)', media: query })),
    );
    installFakeApi({ formats: [progressNote] });
    await openSettings();

    const toggle = (await screen.findByTestId('animations-toggle')) as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    await waitFor(() => {
      expect(document.documentElement.classList.contains('no-motion')).toBe(true);
    });
    document.documentElement.classList.remove('no-motion');
  });
});

/**
 * A browser without Web Locks fails closed: blocked with an explanation and
 * no edit access. `installFakeApi` shims locks for the rest of the suite, so
 * this test removes the shim after installing to simulate that browser. It
 * stays isolated here — nothing else in the file touches `navigator.locks`.
 */
describe('a browser without Web Locks', () => {
  it('stays blocked with an explanation and inert app content', async () => {
    installFakeApi({
      formats: [progressNote],
      patients: [john, maria],
      notes: [johnsDraft, johnsIntake],
    });
    // navigator.locks is outside the DOM lib here, and inert outside the JSX types.
    const nav = navigator as unknown as Record<string, unknown>;
    Reflect.deleteProperty(nav, 'locks');
    renderApp('/');

    expect(await screen.findByText(/keep one editing window/)).toBeDefined();
    expect(screen.queryByTestId('primary-takeover')).toBeNull();
    const content = document.getElementById('apunta-content') as unknown as { inert?: boolean };
    expect(content.inert).toBe(true);
  });
});

/**
 * Groups as sidebar headings (owner, 2026-09-27), driven through the real
 * workspace against the fake API.
 *
 * The two halves that matter are both invisible in a diff of the components: a
 * patient she has filed appears under the group's heading and **leaves** Recents,
 * and a patient she has not filed is left exactly where they were. The second is
 * the one that would quietly ruin the sidebar for every patient she already has
 * the day this feature arrived, so it is its own case rather than an assumption.
 */
describe('patient groups in the sidebar', () => {
  const family = {
    id: '0198c0f0-0000-7000-8000-0000000000a1',
    name: 'Family therapy',
    created_at: '2026-03-01T09:00:00.000Z',
    position: null,
  };
  const court = {
    id: '0198c0f0-0000-7000-8000-0000000000a2',
    name: 'Court-mandated',
    created_at: '2026-03-02T09:00:00.000Z',
    position: null,
  };

  /**
   * The heading a patient's row sits under, as she reads it. By the label's own
   * text rather than a testid, because the heading is the thing she sees and a
   * testid on the wrapper would only prove the wrapper is where it always was.
   */
  function headingOf(patientId: string): string {
    const section = screen.getByTestId(`patient-entry-${patientId}`).closest('.sidebar-section');
    return section?.querySelector('.sidebar-section-label')?.textContent ?? 'no heading';
  }

  it('puts a filed patient under the heading and takes them out of Recents', async () => {
    const api = installFakeApi({ formats: [progressNote], patients: [john, maria], groups: [family] });
    renderApp('/');
    await screen.findByTestId(`patient-entry-${john.id}`);
    expect(headingOf(john.id)).toBe('Recents');

    fireEvent.click(screen.getByTestId(`patient-menu-${john.id}`));
    fireEvent.click(screen.getByTestId(`move-to-group-${john.id}`));
    fireEvent.click(screen.getByTestId(`group-${family.id}`));

    await waitFor(() => {
      expect(headingOf(john.id)).toBe('Family therapy');
    });
    expect(api.state.patients.find((patient) => patient.id === john.id)?.group_id).toBe(family.id);
    // The patient she did not move has not moved.
    expect(headingOf(maria.id)).toBe('Recents');
  });

  it('leaves everyone she has not moved exactly where they were', async () => {
    installFakeApi({ formats: [progressNote], patients: [john, maria], groups: [family, court] });
    renderApp('/');
    await screen.findByTestId(`patient-entry-${john.id}`);

    // Both headings are there, and both say they are empty — the owner made a
    // group, saw nothing at all, and could not tell that from broken (fixed
    // 2026-09-27). The patients are untouched either way.
    for (const group of [family, court]) {
      expect(screen.getByTestId(`section-group-${group.id}`)).toBeDefined();
      expect(screen.getByTestId(`group-empty-${group.id}`)).toBeDefined();
    }
    expect(headingOf(john.id)).toBe('Recents');
    expect(headingOf(maria.id)).toBe('Recents');
  });

  it('gives each of her groups its own heading', async () => {
    const api = installFakeApi({
      formats: [progressNote],
      patients: [
        { ...john, group_id: family.id },
        { ...maria, group_id: court.id },
      ],
      groups: [family, court],
    });
    renderApp('/');
    await screen.findByTestId(`patient-entry-${john.id}`);

    expect(headingOf(john.id)).toBe('Family therapy');
    expect(headingOf(maria.id)).toBe('Court-mandated');
    // Both have left Recents, so it is not drawn with nobody in it.
    expect(api.state.patients.every((patient) => patient.group_id !== null)).toBe(true);
    expect(screen.getByTestId(`section-group-${family.id}`)).toBeDefined();
    expect(screen.getByTestId(`section-group-${court.id}`)).toBeDefined();
  });

  it('makes a group from the submenu and files the patient in it', async () => {
    const api = installFakeApi({ formats: [progressNote], patients: [john], groups: [] });
    renderApp('/');
    await screen.findByTestId(`patient-entry-${john.id}`);

    fireEvent.click(screen.getByTestId(`patient-menu-${john.id}`));
    fireEvent.click(screen.getByTestId(`move-to-group-${john.id}`));
    expect(screen.getByText('No groups yet')).toBeDefined();
    fireEvent.click(screen.getByTestId('group-new'));
    fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'Family work' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create group' }));

    await waitFor(() => {
      expect(api.state.groups.map((group) => group.name)).toEqual(['Family work']);
    });
    const created = api.state.groups[0];
    expect(created).toBeDefined();
    await waitFor(() => {
      expect(api.state.patients[0]?.group_id).toBe(created?.id);
    });
    await waitFor(() => {
      expect(headingOf(john.id)).toBe('Family work');
    });
  });
});

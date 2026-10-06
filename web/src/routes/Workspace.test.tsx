import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createElement, type ComponentProps } from 'react';
import { createMemoryRouter, RouterProvider, type DataRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../App.js';
import type * as NoteBodyModule from '../components/NoteBody.js';
import { installFakeApi, makeFormat, makeNote, makePatient } from '../test/fakeApi.js';

/*
 *
 * Editor renders, counted at the module boundary.
 *
 * `NoteBody` is inside `NoteView`'s memo boundary and is what puts the text on
 * screen, so its renders are the editor's real work. The factory below
 * delegates to the real component and only counts, so every other test in this
 * file still renders the real editor — and, unlike a spy on the namespace,
 * this can see past `NoteView`'s memo.
 */
const editorRenders = vi.hoisted(() => ({ count: 0 }));

vi.mock('../components/NoteBody.js', async () => {
  const actual = await vi.importActual<typeof NoteBodyModule>('../components/NoteBody.js');
  return {
    ...actual,
    NoteBody: (props: ComponentProps<typeof actual.NoteBody>) => {
      editorRenders.count += 1;
      return createElement(actual.NoteBody, props);
    },
  };
});

/**
 * How the workspace moves between "View all" and a patient. Kept out of
 * `App.test.tsx`, whose accent assertions are another owner's to land.
 */

const progressNote = makeFormat('Progress note', ['Subjective', 'Plan']);
const john = makePatient('John Smith', { note_count: 1 });
const maria = makePatient('Maria Ruiz', { note_count: 0 });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/**
 * Clicking from one note to another **of the same patient**.
 *
 * This is two renders of the workspace, not one: the click writes the query
 * string, and react-router commits the new location on the pass after. So for
 * one frame the editor that was open is handed the props it already had and
 * only then unmounts under the next note's key. Every prop the workspace passes
 * it across that pass — the note from the list on screen, the patient's row,
 * the format row, the two callbacks — holds its identity, so that render was
 * the same editor, the same body and the same refine column drawn twice.
 *
 * The fix is memoization on the props (`NoteView.tsx`), not a change to the
 * selection: A still unmounts, still flushes, and B still mounts on its own key.
 */
describe('moving between two notes of the same patient', () => {
  const intake = makeNote(john.id, {
    title: 'Intake note',
    content: 'Subjective: First session, anxious about sleep.',
  });
  const progress = makeNote(john.id, {
    title: 'Progress note',
    content: 'Subjective: Sleep improved this month.',
  });

  /** John open on the intake note, which is where she lands. */
  async function openIntakeNote(): Promise<DataRouter> {
    installFakeApi({ formats: [progressNote], patients: [john], notes: [intake, progress] });
    const router = createMemoryRouter([{ path: '*', element: <App /> }], {
      initialEntries: [`/?patient=${john.id}&note=${intake.id}`],
    });
    render(<RouterProvider router={router} />);
    await screen.findByTestId('note-title');
    return router;
  }

  it('does not draw the open note again on the way to the next one', async () => {
    await openIntakeNote();
    editorRenders.count = 0;

    fireEvent.click(screen.getByText('Progress note'));

    // B is open, and A was not drawn a second time on the way there. One render
    // of the body for the switch, which is B's own mount.
    await screen.findAllByText('Progress note');
    expect(editorRenders.count).toBe(1);
    expect((screen.getByTestId('note-body') as HTMLTextAreaElement).value).toBe(progress.content);
  });

  it('still moves the selection, the active row and the editor to B', async () => {
    await openIntakeNote();

    fireEvent.click(screen.getByText('Progress note'));
    await screen.findAllByText('Progress note');

    // The column's row, not the editor's title — they carry the same words.
    const row = within(screen.getByTestId('note-list')).getByText('Progress note').closest('button');
    expect(row?.className).toContain('active');
    expect((screen.getByTestId('note-body') as HTMLTextAreaElement).value).toBe(progress.content);
  });

  it('persists an unsaved edit in the note she is leaving', async () => {
    const api = installFakeApi({
      formats: [progressNote],
      patients: [john],
      notes: [intake, progress],
    });
    const router = createMemoryRouter([{ path: '*', element: <App /> }], {
      initialEntries: [`/?patient=${john.id}&note=${intake.id}`],
    });
    render(<RouterProvider router={router} />);
    await screen.findByTestId('note-title');

    fireEvent.change(screen.getByTestId('note-body'), {
      target: { value: 'Subjective: Typed and not yet saved.' },
    });
    fireEvent.click(screen.getByText('Progress note'));

    // The unmount flush is what saves A. Skipping A's last render must not skip
    // its last save: the draft is on the server and B is on the screen.
    await waitFor(() => {
      expect(api.state.notes.find((entry) => entry.id === intake.id)?.content).toBe(
        'Subjective: Typed and not yet saved.',
      );
    });
    expect((screen.getByTestId('note-body') as HTMLTextAreaElement).value).toBe(progress.content);
  });
});

/**
 * Moving the selection must never leave the patient she just left on screen.
 *
 * The loader keeps the previous answer while a new patient's notes load, and
 * the render in which the selection has already changed still holds it — so
 * "the notes on screen" and "the notes of the patient selected" are two
 * different things, and only the request can tell them apart. Reading them as
 * one put the patient she had just left in the notes column for the whole of
 * the next request, mounted or unmounted the column off their note count, and
 * — where the query still named one of their notes, which is what Back and a
 * deep link do — opened their note in the editor under the new selection.
 */
describe('moving the selection while the next patient is still loading', () => {
  const johnsIntake = makeNote(john.id, { title: 'Intake note' });
  const johnsDraft = makeNote(john.id, { title: 'Progress note' });
  const mariasSession = makeNote(maria.id, { title: 'Maria session' });

  /**
   * Maria's notes answer only once `release()` is called, and only from the
   * moment `hold()` is: before that their requests pass straight through, so
   * the recency sweep — which reads every patient's notes once — cannot be the
   * request that opens the window this is about.
   */
  function mariaNotes(): { hold: () => void; release: () => void } {
    installFakeApi({
      formats: [progressNote],
      patients: [john, maria],
      notes: [johnsIntake, johnsDraft, mariasSession],
    });
    const originalFetch = globalThis.fetch;
    let holding = false;
    let gate: Promise<void> = Promise.resolve();
    let open!: () => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string, init: RequestInit = {}) => {
        const response = await originalFetch(path, init);
        if (holding && path === `/api/patients/${maria.id}/notes`) await gate;
        return response;
      }),
    );
    return {
      hold: () => {
        gate = new Promise<void>((resolve) => {
          open = resolve;
        });
        holding = true;
      },
      release: () => {
        holding = false;
        open();
      },
    };
  }

  it('never lists the patient she just left', async () => {
    const mariasNotes = mariaNotes();
    const router = createMemoryRouter([{ path: '*', element: <App /> }], {
      initialEntries: [`/?patient=${john.id}&note=${johnsIntake.id}`],
    });
    render(<RouterProvider router={router} />);
    await screen.findByTestId('note-title');
    expect(screen.getByTestId('note-list').textContent).toContain('Intake note');

    mariasNotes.hold();
    fireEvent.click(screen.getByTestId(`patient-row-${maria.id}`));

    // Maria is selected and her notes have not answered: the column belongs to
    // her, so it says it is loading rather than listing John's.
    await waitFor(() => {
      expect(new URLSearchParams(router.state.location.search).get('patient')).toBe(maria.id);
    });
    expect(screen.getByTestId('note-list').textContent).not.toContain('Intake note');
    expect(screen.getByTestId('note-list').textContent).not.toContain('Progress note');

    await act(async () => {
      mariasNotes.release();
    });
    expect(await screen.findByText('Maria session')).toBeDefined();
  });

  it('never opens her note in the editor under the new selection', async () => {
    const mariasNotes = mariaNotes();
    const router = createMemoryRouter([{ path: '*', element: <App /> }], {
      initialEntries: [`/?patient=${john.id}&note=${johnsIntake.id}`],
    });
    render(<RouterProvider router={router} />);
    await screen.findByTestId('note-title');

    // What Back does after a deep link, and what any link carrying `note=`
    // does: the query names a note, and it belongs to the patient just left.
    mariasNotes.hold();
    await act(async () => {
      await router.navigate(`/?patient=${maria.id}&note=${johnsIntake.id}`);
    });

    expect(screen.queryByTestId('note-title')).toBeNull();
    expect(screen.getByTestId('note-list').textContent).not.toContain('Intake note');

    await act(async () => {
      mariasNotes.release();
    });
    // The selection cannot resolve, and it says so on Maria's own welcome
    // rather than with a note she is not looking at.
    expect(await screen.findByTestId('empty-no-note')).toBeDefined();
    expect(screen.queryByTestId('note-title')).toBeNull();
  });
});

describe('leaving "View all" for a patient', () => {
  /**
   * Owner, 2026-09-26: with "View all" open, a click on a sidebar name did
   * nothing — it set `?patient=` but stayed on `/patients`, so the list page
   * kept the screen. Both ways into a patient now land on their notes at `/`.
   */
  it('opens the patient from the sidebar, not only from the list page', async () => {
    installFakeApi({ formats: [progressNote], patients: [john, maria], notes: [makeNote(john.id)] });
    const router = createMemoryRouter([{ path: '*', element: <App /> }], { initialEntries: ['/patients'] });
    render(<RouterProvider router={router} />);

    await screen.findByTestId('patient-directory');
    fireEvent.click(await screen.findByTestId(`patient-row-${john.id}`));

    await waitFor(() => {
      expect(screen.queryByTestId('patient-directory')).toBeNull();
    });
    expect(router.state.location.pathname).toBe('/');
    expect(new URLSearchParams(router.state.location.search).get('patient')).toBe(john.id);
  });

  it('opens the patient from the list page itself', async () => {
    installFakeApi({ formats: [progressNote], patients: [john, maria], notes: [makeNote(john.id)] });
    const router = createMemoryRouter([{ path: '*', element: <App /> }], { initialEntries: ['/patients'] });
    render(<RouterProvider router={router} />);

    const row = await screen.findByTestId(`directory-row-${maria.id}`);
    fireEvent.click(row.querySelector('button') as HTMLButtonElement);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
    expect(new URLSearchParams(router.state.location.search).get('patient')).toBe(maria.id);
  });
});

describe('the collapsed sidebar', () => {
  /**
   * Owner, 2026-09-26, after ChatGPT's: collapsing leaves a rail of icons —
   * the A that brings the sidebar back, New patient, Search, Patients, and
   * "More"'s gear — and Ctrl+B toggles it from anywhere.
   */
  it('leaves a rail behind, and Ctrl+B brings the sidebar back', async () => {
    installFakeApi({ formats: [progressNote], patients: [john, maria], notes: [makeNote(john.id)] });
    const router = createMemoryRouter([{ path: '*', element: <App /> }], { initialEntries: ['/'] });
    render(<RouterProvider router={router} />);
    await screen.findByTestId(`patient-row-${john.id}`);

    fireEvent.keyDown(document.body, { key: 'b', ctrlKey: true });

    const rail = await screen.findByTestId('sidebar-rail');
    expect(screen.getByTestId('sidebar-reopen').getAttribute('aria-label')).toBe('Show patients');
    expect(screen.getByTestId('rail-new').getAttribute('href')).toBe('/patients/new');
    expect(screen.getByTestId('rail-new').getAttribute('aria-label')).toBe('New patient');
    expect(screen.getByTestId('rail-search').getAttribute('aria-label')).toBe('Search patients');
    // "More", after Claude's own (owner, 2026-09-27) — and the rail's name is
    // the same word, since the rail shows the gear alone with its name on the
    // button rather than beside it.
    expect(screen.getByTestId('rail-mission-control').getAttribute('aria-label')).toBe('More');
    expect(rail.querySelectorAll('svg').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByTestId('rail-patients'));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/patients');
    });

    fireEvent.keyDown(document.body, { key: 'b', ctrlKey: true });
    await waitFor(() => {
      expect(screen.queryByTestId('sidebar-rail')).toBeNull();
    });
  });

  /**
   * Collapsing is a movement, not a cut (owner, 2026-09-27), which is a change
   * from `display: none` to a width that goes to zero — so the notes column can
   * be seen sliding across behind it.
   *
   * That swap is invisible from a rendered element: jsdom applies no cascade,
   * and `display: none` and `width: 0` are the same node to `querySelector`.
   * The two halves are therefore read off the stylesheets, and what is pinned
   * is the reason the old value could not be kept — a width of zero still leaves
   * every name in the tab order, so `visibility` has to be part of it — plus
   * the two escape hatches, because a movement nobody can switch off is a bug
   * with a settings toggle next to it.
   */
  it('collapses by width so the movement can be seen, and stops dead when asked to', () => {
    const appCss = readFileSync(join(import.meta.dirname, '..', 'styles', 'app.css'), 'utf8');
    const motionCss = readFileSync(join(import.meta.dirname, '..', 'styles', 'motion.css'), 'utf8');

    // The state: no longer removed from the tree, so there is something to move.
    const collapsed = appCss.match(/\.app-shell\.sidebar-collapsed > \.col-patients\s*\{[^}]*\}/);
    expect(collapsed?.[0]).toContain('width: 0');
    expect(collapsed?.[0]).not.toContain('display: none');

    // The movement, at the app's one pace rather than an invented timing.
    expect(motionCss).toMatch(/\.col-patients\s*\{[^}]*width var\(--motion-base\) var\(--motion-ease\)/);
    // Names you cannot see must not be tabbable, and the delay is what makes
    // the sidebar come back rather than blink into place.
    expect(motionCss).toMatch(/\.app-shell\.sidebar-collapsed > \.col-patients\s*\{[^}]*visibility: hidden/);
    expect(motionCss).toMatch(
      /\.app-shell:not\(\.sidebar-collapsed\) > \.col-patients\s*\{[^}]*visibility 0s;/,
    );
    // The rail is the sidebar's other half and arrives with the usual entrance.
    expect(motionCss).toMatch(/\.sidebar-rail\s*\{\s*animation: fade-in var\(--motion-base\)/);

    // Both ways of asking for stillness, honoured here rather than only by the
    // global `:root.no-motion *` rule.
    expect(motionCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.col-patients[\s\S]*?transition: none;/,
    );
    expect(motionCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.sidebar-rail\s*\{\s*animation: none;/,
    );
  });
});

import type { PatientGroup } from '@apunta/shared';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { App } from '../App.js';
import { DEFAULT_SIDEBAR_VIEW, writeSidebarView } from '../lib/sidebarView.js';
import { installFakeApi, makeFormat, makePatient } from '../test/fakeApi.js';

/**
 * A drag must not redraw the list (owner, 2026-09-27).
 *
 * Every drop used to end in a full reload of the patients, which put the sidebar
 * back to "Loading…" — so every row was unmounted and drawn again, and the old
 * order flashed back before the new one arrived. The drop now moves the rows in
 * the list already on screen and re-reads quietly behind it. This runs the real
 * workspace and fetch path, because the defect was in how the two were joined.
 */
const progressNote = makeFormat('Progress note', ['Subjective', 'Plan']);
const court: PatientGroup = {
  id: '0198c0f0-0000-7000-8000-0000000000c1',
  name: 'Court-mandated',
  created_at: '2026-03-01T09:00:00.000Z',
  position: 0,
};
const john = makePatient('John Smith', { group_id: court.id, group_position: 0 });
const ana = makePatient('Ana Torres', { group_id: court.id, group_position: 1 });
const maria = makePatient('Maria Ruiz', { group_id: court.id, group_position: 2 });

function drag(type: string, element: Element): void {
  const event = new MouseEvent(type, { bubbles: true, clientX: 0, clientY: 0 });
  Object.defineProperty(event, 'dataTransfer', {
    value: { effectAllowed: 'all', dropEffect: 'move', setData: () => undefined, getData: () => '' },
  });
  fireEvent(element, event);
}

beforeEach(() => {
  writeSidebarView({ ...DEFAULT_SIDEBAR_VIEW, sort: 'manual' });
});

afterEach(() => {
  cleanup();
  writeSidebarView(DEFAULT_SIDEBAR_VIEW);
});

describe('dragging a name in the workspace sidebar', () => {
  it('moves the row without redrawing the others or showing "Loading"', async () => {
    const api = installFakeApi({
      formats: [progressNote],
      patients: [john, ana, maria],
      groups: [court],
      notes: [],
    });
    const router = createMemoryRouter([{ path: '*', element: <App /> }], { initialEntries: ['/'] });
    render(<RouterProvider router={router} />);
    const section = await screen.findByTestId(`section-group-${court.id}`);
    await within(section).findByTestId(`patient-entry-${maria.id}`);

    const before = {
      john: screen.getByTestId(`patient-entry-${john.id}`),
      ana: screen.getByTestId(`patient-entry-${ana.id}`),
      maria: screen.getByTestId(`patient-entry-${maria.id}`),
    };
    let sawLoading = false;
    const observer = new MutationObserver(() => {
      if (screen.queryByText('Loading patients…') !== null) sawLoading = true;
    });
    observer.observe(document.body, { childList: true, subtree: true });

    drag('dragstart', before.maria);
    drag('dragover', before.john);
    drag('drop', before.john);

    const names = (): string[] =>
      [...section.querySelectorAll('.project-row .name')].map((node) => node.textContent ?? '');
    // Straight away, before the server has answered.
    expect(names()).toEqual(['Maria Ruiz', 'John Smith', 'Ana Torres']);
    // And after the quiet re-read has landed.
    await waitFor(() => {
      expect(api.calls.filter((call) => call.startsWith('GET /api/patients')).length).toBeGreaterThan(1);
    });
    await waitFor(() => {
      expect(names()).toEqual(['Maria Ruiz', 'John Smith', 'Ana Torres']);
    });
    observer.disconnect();

    expect(sawLoading).toBe(false);
    // The same elements, moved — not new ones drawn in their place.
    expect(screen.getByTestId(`patient-entry-${john.id}`)).toBe(before.john);
    expect(screen.getByTestId(`patient-entry-${ana.id}`)).toBe(before.ana);
    expect(screen.getByTestId(`patient-entry-${maria.id}`)).toBe(before.maria);
  });
});

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { App } from '../App.js';
import { installFakeApi, makeFormat, makeNote, makePatient } from '../test/fakeApi.js';

/**
 * How the workspace moves between "View all" and a patient. Kept out of
 * `App.test.tsx`, whose accent assertions are another owner's to land.
 */

const progressNote = makeFormat('Progress note', ['Subjective', 'Plan']);
const john = makePatient('John Smith', { note_count: 1 });
const maria = makePatient('Maria Ruiz', { note_count: 0 });

afterEach(() => {
  cleanup();
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
   * Mission control's gear — and Ctrl+B toggles it from anywhere.
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
    expect(screen.getByTestId('rail-mission-control').getAttribute('aria-label')).toBe('Mission control');
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
});

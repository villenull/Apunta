import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { App } from '../App.js';
import { DEFAULT_SIDEBAR_VIEW, writeSidebarView } from '../lib/sidebarView.js';
import { installFakeApi, makeFormat, makePatient } from '../test/fakeApi.js';

/**
 * F1 — choosing `Status: Archived` in the sidebar showed nothing until the tab
 * was reloaded.
 *
 * The archived patients are only ever on the wire if the fetch asked for them,
 * and the flag that asks was read **once at mount** (`useMemo(..., [])`). So the
 * stored choice was correct in the database and absent from the list, the column
 * filtered an active-only array down to nothing, and she was shown "No patients
 * match these filters" with a Clear filters button — the honest sentence about
 * the wrong data. A reload made it work, which is how it survived a read of the
 * code: the comment claimed the column would widen the fetch, and the column
 * cannot widen a prop it does not own.
 *
 * Two things this deliberately does. It runs the **real workspace and the real
 * fetch**: a test that handed `PatientsColumn` a hand-built `sidebarPatients`
 * array would pass with the bug in place, because the whole defect is that the
 * array never grows. And it lives in its own file rather than beside the older
 * workspace tests, which share module-level fixtures and were observed to leave
 * the view control unopenable when run after them — a shared-state artefact that
 * would have made this regression test lie in both directions.
 */
const progressNote = makeFormat('Progress note', ['Subjective', 'Plan']);

beforeEach(() => {
  /*
   * The Status choice is **persisted**, which is the feature and also the reason
   * a test has to set it: a first test that ends on "Archived" decides what the
   * next one mounts with, and that one would then start from a list the test
   * never asked for.
   */
  writeSidebarView(DEFAULT_SIDEBAR_VIEW);
});

afterEach(() => {
  cleanup();
});

/**
 * F1 — choosing `Status: Archived` in the sidebar showed nothing until the tab
 * was reloaded.
 *
 * The archived patients are only ever on the wire if the fetch asked for them,
 * and the flag that asks was read **once at mount** (`useMemo(..., [])`). So the
 * stored choice was correct in the database and absent from the list, the column
 * filtered an active-only array down to nothing, and she was shown "No patients
 * match these filters" with a Clear filters button — the honest sentence about
 * the wrong data. A reload made it work, which is why it survived a read of the
 * code: the comment claimed the column would widen it, and the column cannot
 * widen a prop it does not own.
 *
 * This runs the real workspace and the real fetch path on purpose. A test that
 * rendered `PatientsColumn` with a hand-built `sidebarPatients` array would pass
 * with the bug still in place, because the whole defect is that the array never
 * grows.
 */
describe('the sidebar Status filter reaches the patient fetch', () => {
  const active = makePatient('Ana Torres', { note_count: 1 });
  const archived = makePatient('Zebediah Quill', {
    note_count: 0,
    archived_at: '2026-08-01T09:00:00.000Z',
  });

  async function renderDirectory(): Promise<void> {
    installFakeApi({ formats: [progressNote], patients: [active, archived], notes: [] });
    const router = createMemoryRouter([{ path: '*', element: <App /> }], {
      initialEntries: ['/patients'],
    });
    render(<RouterProvider router={router} />);
    await screen.findByTestId('patient-directory');
    // The first fetch has landed before anything is clicked, so the control is
    // the settled one.
    await screen.findByTestId(`patient-entry-${active.id}`);
  }

  /**
   * Wait for a row to be there, or to be gone.
   *
   * The column re-renders when the patient fetch resolves, so the assertions
   * below wait for the *consequence* rather than for a tick: a menu opened in
   * the middle of that re-render used to belong to the instance being replaced.
   * Which row to wait for depends on the Status in force — under "Archived" the
   * active patient is gone, quite correctly, so asking for it would hang.
   */
  async function expectRow(id: string, present: boolean): Promise<void> {
    await waitFor(() => {
      expect(screen.queryByTestId(`patient-entry-${id}`) === null).toBe(!present);
    });
  }

  /**
   * Open the control and choose one Status option — three clicks, one tick.
   *
   * Choosing an option leaves the menu open, which is right: she may want to
   * change two dimensions in a row. But the control is a toggle, so the next
   * `pickStatus` would have closed it instead of opening it. `Escape` between
   * choices is what a person does, and it leaves every call starting from the
   * same state.
   */
  function pickStatus(value: 'active' | 'archived' | 'all'): void {
    fireEvent.click(screen.getByTestId('sidebar-view-options'));
    fireEvent.click(screen.getByTestId('view-section-status'));
    fireEvent.click(screen.getByTestId(`view-status-${value}`));
    fireEvent.keyDown(document, { key: 'Escape' });
  }

  it('fetches archived patients when she asks for them, without a reload', async () => {
    await renderDirectory();

    // The working list is active-only, so the archived patient is not there.
    expect(screen.queryByTestId(`patient-entry-${archived.id}`)).toBeNull();

    pickStatus('archived');

    // Not "the filter stopped filtering" — the patient arrives. Before the fix
    // this waited out the timeout on `clear-view` instead.
    await expectRow(archived.id, true);
    expect(screen.queryByTestId('clear-view')).toBeNull();
  });

  /**
   * The other direction, and the one that is easy to leave half-done: taking the
   * archived patients back **off** the wire. `Clear filters` resets Status as
   * well as the rest, so it has to report that too — otherwise the list keeps
   * fetching patients it is no longer showing.
   *
   * It is reached the way a person reaches it: filter down to nothing, and take
   * the offered way back. "Last activity: today" empties the list because
   * neither patient has a note, which is also the honest reason the button
   * appears at all — it only exists when the filters, not the practice, are
   * what is empty.
   */
  it('takes them back off the wire when she returns to Active, and when she clears', async () => {
    await renderDirectory();
    await expectRow(active.id, true);

    pickStatus('all');
    await expectRow(archived.id, true);
    await expectRow(active.id, true);

    // Empty it with a second dimension, so "Clear filters" is on screen.
    fireEvent.click(screen.getByTestId('sidebar-view-options'));
    fireEvent.click(screen.getByTestId('view-section-activity'));
    fireEvent.click(screen.getByTestId('view-activity-1d'));
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.getByTestId('clear-view')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('clear-view'));

    // Status is back to Active, so the archived patient is neither shown nor
    // fetched. `queryByTestId` cannot tell those apart on its own, so the row
    // being gone is the whole claim: with the filter still 'all' it would stay.
    await expectRow(archived.id, false);
    await expectRow(active.id, true);
  });
});

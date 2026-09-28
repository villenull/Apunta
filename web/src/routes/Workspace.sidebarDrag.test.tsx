import type { PatientGroup } from '@apunta/shared';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../App.js';
import { DEFAULT_SIDEBAR_VIEW, writeSidebarView } from '../lib/sidebarView.js';
import { installFakeApi, makeFormat, makePatient } from '../test/fakeApi.js';

/**
 * A change to one row must not redraw the list (owner, 2026-09-27 and 28).
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
const family: PatientGroup = {
  id: '0198c0f0-0000-7000-8000-0000000000c2',
  name: 'Family therapy',
  created_at: '2026-03-02T09:00:00.000Z',
  position: 1,
};
const john = makePatient('John Smith', { group_id: court.id });
const ana = makePatient('Ana Torres', { group_id: court.id });
const maria = makePatient('Maria Ruiz', { group_id: family.id });

function drag(type: string, element: Element): void {
  const event = new MouseEvent(type, { bubbles: true, clientX: 0, clientY: 0 });
  Object.defineProperty(event, 'dataTransfer', {
    value: { effectAllowed: 'all', dropEffect: 'move', setData: () => undefined, getData: () => '' },
  });
  fireEvent(element, event);
}

beforeEach(() => {
  writeSidebarView({ ...DEFAULT_SIDEBAR_VIEW, sort: 'name' });
});

afterEach(() => {
  cleanup();
  writeSidebarView(DEFAULT_SIDEBAR_VIEW);
});

/** Mount the real workspace and wait for every row to be drawn. */
async function mount(): Promise<ReturnType<typeof installFakeApi>> {
  const api = installFakeApi({
    formats: [progressNote],
    patients: [john, ana, maria],
    groups: [court, family],
    notes: [],
  });
  const router = createMemoryRouter([{ path: '*', element: <App /> }], { initialEntries: ['/'] });
  render(<RouterProvider router={router} />);
  await screen.findByTestId(`patient-entry-${maria.id}`);
  await screen.findByTestId(`patient-entry-${john.id}`);
  /*
   * From here the patient list answers 50 ms late, as a real server does. The
   * fake answers in the same tick, which lets React fold "Loading" and "ready"
   * into one render, so a list that blanked would look as though it had not.
   */
  const inner = globalThis.fetch;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if ((init?.method ?? 'GET') === 'GET' && url.includes('/api/patients')) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return inner(input, init);
  });
  return api;
}

/** Watch for the list blanking to "Loading patients…" at any moment. */
function watchForLoading(): { saw: () => boolean; stop: () => void } {
  let seen = false;
  const observer = new MutationObserver(() => {
    if (screen.queryByText('Loading patients…') !== null) seen = true;
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return { saw: () => seen, stop: () => observer.disconnect() };
}

function namesIn(testId: string): string[] {
  return [...screen.getByTestId(testId).querySelectorAll('.project-row .name')].map(
    (node) => node.textContent ?? '',
  );
}

describe('the sidebar does not redraw for a change to one row', () => {
  it('moves a name to another group without redrawing the others or showing "Loading"', async () => {
    const api = await mount();
    const kept = screen.getByTestId(`patient-entry-${john.id}`);
    const loading = watchForLoading();

    drag('dragstart', screen.getByTestId(`patient-entry-${ana.id}`));
    drag('dragover', screen.getByTestId(`patient-entry-${maria.id}`));
    drag('drop', screen.getByTestId(`patient-entry-${maria.id}`));

    // Straight away, before the server has answered.
    expect(namesIn(`section-group-${family.id}`)).toEqual(['Ana Torres', 'Maria Ruiz']);
    await waitFor(() => {
      expect(api.calls.filter((call) => call.startsWith('GET /api/patients')).length).toBeGreaterThan(1);
    });
    await waitFor(() => {
      expect(namesIn(`section-group-${family.id}`)).toEqual(['Ana Torres', 'Maria Ruiz']);
    });
    loading.stop();

    expect(loading.saw()).toBe(false);
    // The rows that did not move are the same elements, not new ones.
    expect(screen.getByTestId(`patient-entry-${john.id}`)).toBe(kept);
    expect(screen.getByTestId(`patient-entry-${maria.id}`)).toBeDefined();
  });

  it('archives one name without redrawing the others or showing "Loading"', async () => {
    const api = await mount();
    const keptJohn = screen.getByTestId(`patient-entry-${john.id}`);
    const keptMaria = screen.getByTestId(`patient-entry-${maria.id}`);
    const loading = watchForLoading();

    fireEvent.click(
      within(screen.getByTestId(`patient-entry-${ana.id}`)).getByTestId(`patient-menu-${ana.id}`),
    );
    fireEvent.click(await screen.findByTestId(`archive-${ana.id}`));

    expect(screen.queryByTestId(`patient-entry-${ana.id}`)).toBeNull();
    await waitFor(() => {
      expect(api.calls.some((call) => call.startsWith(`PATCH /api/patients/${ana.id}`))).toBe(true);
    });
    await waitFor(() => {
      expect(api.calls.filter((call) => call.startsWith('GET /api/patients')).length).toBeGreaterThan(1);
    });
    loading.stop();

    expect(loading.saw()).toBe(false);
    expect(screen.getByTestId(`patient-entry-${john.id}`)).toBe(keptJohn);
    expect(screen.getByTestId(`patient-entry-${maria.id}`)).toBe(keptMaria);
  });
});

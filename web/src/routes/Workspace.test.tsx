import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

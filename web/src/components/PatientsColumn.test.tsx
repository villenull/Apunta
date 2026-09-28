import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { PatientGroup, PatientListItem } from '@apunta/shared';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SIDEBAR_VIEW, readSidebarView } from '../lib/sidebarView.js';
import { makePatient } from '../test/fakeApi.js';
import { PatientsColumn } from './PatientsColumn.js';

/**
 * The sidebar's two groups, headed as claude.ai heads its own: "Pinned", which
 * is always there and says how to fill it while it is empty, then "Recents" with
 * its sort control over everyone else.
 */

// The sort choice is kept in `localStorage`, which this test environment does
// not always provide; a small in-memory one stands in for it.
const stored = new Map<string, string>();
beforeEach(() => {
  stored.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ana = makePatient('Ana Torres');
const john = makePatient('John Smith');
const maria = makePatient('Maria Ruiz');

function renderColumn(
  ordered: PatientListItem[],
  pinnedIds: string[],
  onRename: (patient: PatientListItem, name: string) => void = vi.fn(),
): void {
  render(
    <MemoryRouter>
      <PatientsColumn
        patients={{ status: 'ready', data: ordered }}
        ordered={ordered}
        activePatientId={null}
        recency={new Map()}
        pinnedIds={pinnedIds}
        onSelect={vi.fn()}
        onRetry={vi.fn()}
        onSetArchived={vi.fn()}
        onRename={onRename}
        onDelete={vi.fn()}
        onTogglePin={vi.fn()}
        onReorderPins={vi.fn()}
        onOpenAll={vi.fn()}
        onToggleCollapsed={vi.fn()}
        collapsed={false}
        onOpenSettings={vi.fn()}
        onUnavailable={vi.fn()}
      />
    </MemoryRouter>,
  );
}

/** The section labels, the pin hint and patient names, top to bottom. */
function sidebarOrder(): string[] {
  return [
    ...document.querySelectorAll(
      '.sidebar-section-label > span, .sidebar-pin-hint, .patient-entry .project-row .name',
    ),
  ].map((element) => element.textContent ?? '');
}

describe('the sidebar groups', () => {
  it('heads pinned patients "Pinned" and the rest "Recents"', () => {
    renderColumn([john, ana, maria], [john.id]);
    expect(sidebarOrder()).toEqual(['Pinned', 'John Smith', 'Recents', 'Ana Torres', 'Maria Ruiz']);
    expect(screen.queryByTestId('pin-hint')).toBeNull();
  });

  it('keeps an empty "Pinned" group that says how to fill it', () => {
    renderColumn([ana, john], []);
    expect(sidebarOrder()).toEqual([
      'Pinned',
      'Pin patients to keep them here',
      'Recents',
      'Ana Torres',
      'John Smith',
    ]);
  });

  it('orders "Recents" by name from the control beside it, and remembers it', () => {
    renderColumn([maria, ana, john], []);
    // The control is now one menu of four sections, of which "Sort by" is one
    // (owner, 2026-09-27), so the order is picked from inside it.
    fireEvent.click(screen.getByTestId('sidebar-view-options'));
    fireEvent.click(screen.getByTestId('view-section-sort'));
    expect(screen.getByTestId('view-sort-recent').getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByTestId('view-sort-name'));
    expect(sidebarOrder().slice(2)).toEqual(['Recents', 'Ana Torres', 'John Smith', 'Maria Ruiz']);

    cleanup();
    renderColumn([maria, ana, john], []);
    expect(sidebarOrder().slice(2)).toEqual(['Recents', 'Ana Torres', 'John Smith', 'Maria Ruiz']);
  });

  /**
   * A patient she has just added has no notes, and "Most recent activity" used
   * to sort those last — so the person she created a moment ago sat below
   * everyone who had ever been drafted about, and the daily list is cut at 13
   * rows, so they were not on it at all. Found by the e2e suite, which creates a
   * patient and then goes looking for them.
   *
   * `created_at` is the only honest recency for somebody with no work yet.
   */
  it('puts a patient she just created at the top of Recents, ahead of older notes', () => {
    const old = makePatient('Ana Torres', { created_at: '2026-01-01T09:00:00.000Z' });
    const justAdded = makePatient('Maria Ruiz', { created_at: '2026-03-09T09:00:00.000Z' });
    // Ana is ordered first by the server, which is what put Maria out of sight.
    renderColumn([old, justAdded], []);

    expect(sidebarOrder().slice(2)).toEqual(['Recents', 'Maria Ruiz', 'Ana Torres']);
  });

  it('still ranks a patient with an old note above one added even earlier', () => {
    const addedFirst = makePatient('Ana Torres', { created_at: '2026-01-01T09:00:00.000Z' });
    const addedLater = makePatient('Maria Ruiz', { created_at: '2026-01-05T09:00:00.000Z' });
    render(
      <MemoryRouter>
        <PatientsColumn
          patients={{ status: 'ready', data: [addedFirst, addedLater] }}
          ordered={[addedFirst, addedLater]}
          activePatientId={null}
          // Ana was written about last month, so she is the one she has been
          // working with, even though Maria was added after her.
          recency={new Map([[addedFirst.id, '2026-02-20T09:00:00.000Z']])}
          pinnedIds={[]}
          onSelect={vi.fn()}
          onRetry={vi.fn()}
          onSetArchived={vi.fn()}
          onRename={vi.fn()}
          onDelete={vi.fn()}
          onTogglePin={vi.fn()}
          onReorderPins={vi.fn()}
          onOpenAll={vi.fn()}
          onToggleCollapsed={vi.fn()}
          collapsed={false}
          onOpenSettings={vi.fn()}
          onUnavailable={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(sidebarOrder().slice(2)).toEqual(['Recents', 'Ana Torres', 'Maria Ruiz']);
  });

  /**
   * All three sort choices have to survive a remount, not just "Name" (F2).
   *
   * `Date created` was the one that did not: `writeSidebarView` stored
   * status/activity/groupBy and left `sort` out, so every read fell through to
   * the older two-state key, where "created" has nowhere to live. She picked it,
   * the list re-sorted, and the next reload put her back on "Last activity" —
   * with the menu's own "Sort by" row reading "Last activity" too, so the list
   * and the control agreed with each other and both disagreed with what she had
   * chosen thirty seconds earlier.
   *
   * The remount is the point: a test that re-reads the view in the same mounted
   * component would pass regardless, because the state is in memory either way.
   */
  it('remembers "Date created" across a remount, and reads it back on the row', () => {
    const later = makePatient('Maria Ruiz', { created_at: '2026-03-09T09:00:00.000Z' });
    const earlier = makePatient('Ana Torres', { created_at: '2026-01-01T09:00:00.000Z' });
    // The server's order is the opposite, so only the sort can explain the list.
    renderColumn([later, earlier], []);
    expect(sidebarOrder().slice(2)).toEqual(['Recents', 'Maria Ruiz', 'Ana Torres']);

    fireEvent.click(screen.getByTestId('sidebar-view-options'));
    fireEvent.click(screen.getByTestId('view-section-sort'));
    fireEvent.click(screen.getByTestId('view-sort-created'));
    // Newest created first — the same answer here, from the other direction.
    expect(sidebarOrder().slice(2)).toEqual(['Recents', 'Maria Ruiz', 'Ana Torres']);

    cleanup();
    renderColumn([later, earlier], []);

    // The order held…
    expect(sidebarOrder().slice(2)).toEqual(['Recents', 'Maria Ruiz', 'Ana Torres']);
    // …and the control says so, rather than quietly offering a different one.
    fireEvent.click(screen.getByTestId('sidebar-view-options'));
    fireEvent.click(screen.getByTestId('view-section-sort'));
    expect(screen.getByTestId('view-sort-created').getAttribute('aria-checked')).toBe('true');
  });

  it('keeps all three choices in one stored view, and an older one still reads', () => {
    renderColumn([maria, ana, john], []);
    fireEvent.click(screen.getByTestId('sidebar-view-options'));
    fireEvent.click(screen.getByTestId('view-section-sort'));
    fireEvent.click(screen.getByTestId('view-sort-created'));

    // One key, all four fields, so a second dimension does not cost the first.
    const raw = stored.get('apunta-sidebar-view-v1');
    expect(raw === undefined ? undefined : (JSON.parse(raw) as { sort?: string }).sort).toBe('created');

    // And the two-state key is still written, mapped down, for a build that
    // only knows "name" and "not name".
    expect(stored.get('apunta-sidebar-sort-v1') ?? null).toBeNull();

    // What an existing install looks like: the old key alone, no new key.
    stored.clear();
    stored.set('apunta-sidebar-sort-v1', 'name');
    expect(readSidebarView().sort).toBe('name');
    stored.clear();
    expect(readSidebarView().sort).toBe(DEFAULT_SIDEBAR_VIEW.sort);
  });

  it('renames in the row itself, the name selected, and saves on Enter', () => {
    const onRename = vi.fn();
    renderColumn([john], [], onRename);
    fireEvent.click(screen.getByLabelText('Tools for John Smith'));
    fireEvent.click(screen.getByTestId(`rename-${john.id}`));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByTestId(`patient-row-${john.id}`)).toBeNull();
    const entry = screen.getByTestId(`patient-entry-${john.id}`);
    const field = within(entry).getByLabelText('Name for John Smith') as HTMLInputElement;
    expect(document.activeElement).toBe(field);
    expect(field.selectionEnd! - field.selectionStart!).toBe('John Smith'.length);

    fireEvent.change(field, { target: { value: 'Jon Smith' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onRename).toHaveBeenCalledWith(john, 'Jon Smith');
    expect(screen.getByTestId(`patient-row-${john.id}`)).toBeDefined();
  });
});

/**
 * The order the sections sit in, and folding them away (owner, 2026-09-27).
 *
 * The order is the visible half and the reason is worth pinning: Pinned, then
 * her groups, then Recents, then "View all" under the list. Recents used to come
 * before the groups, which put the everyday list above the lists she had built on
 * purpose.
 *
 * The fold is the half a diff would hide. A heading that used to be a `div` with
 * a label in it is now a button across the full width, because a heading that is
 * only text cannot be operated at all; and the triangle appears on hover but
 * **stays** once the section is folded, since a control that vanishes under the
 * pointer is one she has to find again to undo the fold.
 */
describe('section order and folding', () => {
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

  function renderWithGroups(): void {
    render(
      <MemoryRouter>
        <PatientsColumn
          patients={{ status: 'ready', data: [john, ana, maria] }}
          ordered={[john, ana, maria]}
          activePatientId={null}
          recency={new Map()}
          pinnedIds={[ana.id]}
          groups={[family, court]}
          onMoveToGroup={vi.fn()}
          onCreateGroup={vi.fn()}
          onSelect={vi.fn()}
          onRetry={vi.fn()}
          onSetArchived={vi.fn()}
          onRename={vi.fn()}
          onDelete={vi.fn()}
          onTogglePin={vi.fn()}
          onReorderPins={vi.fn()}
          onOpenAll={vi.fn()}
          onToggleCollapsed={vi.fn()}
          collapsed={false}
          onOpenSettings={vi.fn()}
          onUnavailable={vi.fn()}
        />
      </MemoryRouter>,
    );
  }

  it('puts Pinned first, then her groups in the order she made them, then Recents', () => {
    render(
      <MemoryRouter>
        <PatientsColumn
          patients={{
            status: 'ready',
            data: [{ ...john, group_id: court.id }, { ...maria, group_id: family.id }, ana],
          }}
          ordered={[{ ...john, group_id: court.id }, { ...maria, group_id: family.id }, ana]}
          activePatientId={null}
          recency={new Map()}
          pinnedIds={[]}
          groups={[family, court]}
          onMoveToGroup={vi.fn()}
          onCreateGroup={vi.fn()}
          onSelect={vi.fn()}
          onRetry={vi.fn()}
          onSetArchived={vi.fn()}
          onRename={vi.fn()}
          onDelete={vi.fn()}
          onTogglePin={vi.fn()}
          onReorderPins={vi.fn()}
          onOpenAll={vi.fn()}
          onToggleCollapsed={vi.fn()}
          collapsed={false}
          onOpenSettings={vi.fn()}
          onUnavailable={vi.fn()}
        />
      </MemoryRouter>,
    );

    // Creation order, not alphabetical: Court-mandated was made second and sits
    // second, and Z would have sorted it last.
    // The empty-Pinned hint is part of the order: Pinned is always there.
    expect(sidebarOrder()).toEqual([
      'Pinned',
      'Pin patients to keep them here',
      'Family therapy',
      'Maria Ruiz',
      'Court-mandated',
      'John Smith',
      'Recents',
      'Ana Torres',
    ]);
  });

  it('keeps "View all" under the list, not above the sections', () => {
    renderWithGroups();
    // In document order, across the sections and the button together.
    const order = [...document.querySelectorAll('.sidebar-section, .view-all-row')].map(
      (element) => element.getAttribute('data-testid') ?? element.className,
    );
    expect(order[order.length - 1]).toBe('view-all-patients');
  });

  it('folds a section away and brings it back, saying which it is', () => {
    // `ana` is pinned in this fixture, so she is under Pinned; `john` is the one
    // in Recents, and folding Recents must not touch her.
    renderWithGroups();
    const recents = screen.getByTestId('section-recents');

    // A heading that is only text cannot be operated; this one is a button and
    // says which way it is pointing.
    expect(recents.tagName).toBe('BUTTON');
    expect(recents.getAttribute('aria-expanded')).toBe('true');
    expect(recents.getAttribute('data-collapsed')).toBe('false');
    expect(screen.getByTestId(`patient-entry-${john.id}`)).toBeDefined();

    fireEvent.click(recents);

    expect(recents.getAttribute('aria-expanded')).toBe('false');
    expect(recents.getAttribute('data-collapsed')).toBe('true');
    // The heading is still there to be unfolded; only the names went.
    expect(screen.getByTestId('section-recents')).toBeDefined();
    expect(screen.queryByTestId(`patient-entry-${john.id}`)).toBeNull();
    // And the section above it is untouched.
    expect(screen.getByTestId(`patient-entry-${ana.id}`)).toBeDefined();

    fireEvent.click(screen.getByTestId('section-recents'));
    expect(screen.getByTestId(`patient-entry-${john.id}`)).toBeDefined();
  });

  it('folds a group on its own, without taking Recents with it', () => {
    render(
      <MemoryRouter>
        <PatientsColumn
          patients={{ status: 'ready', data: [{ ...john, group_id: family.id }, ana] }}
          ordered={[{ ...john, group_id: family.id }, ana]}
          activePatientId={null}
          recency={new Map()}
          pinnedIds={[]}
          groups={[family]}
          onMoveToGroup={vi.fn()}
          onCreateGroup={vi.fn()}
          onSelect={vi.fn()}
          onRetry={vi.fn()}
          onSetArchived={vi.fn()}
          onRename={vi.fn()}
          onDelete={vi.fn()}
          onTogglePin={vi.fn()}
          onReorderPins={vi.fn()}
          onOpenAll={vi.fn()}
          onToggleCollapsed={vi.fn()}
          collapsed={false}
          onOpenSettings={vi.fn()}
          onUnavailable={vi.fn()}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId(`section-toggle-group:${family.id}`));

    expect(screen.queryByTestId(`patient-entry-${john.id}`)).toBeNull();
    expect(screen.getByTestId(`patient-entry-${ana.id}`)).toBeDefined();
  });

  it('remembers the fold, because a fold that came back on reload would not be worth making', () => {
    renderWithGroups();
    fireEvent.click(screen.getByTestId('section-recents'));
    expect(stored.size).toBeGreaterThan(0);

    cleanup();
    renderWithGroups();

    expect(screen.getByTestId('section-recents').getAttribute('data-collapsed')).toBe('true');
    expect(screen.queryByTestId(`patient-entry-${john.id}`)).toBeNull();
  });
});

/**
 * Where the triangle sits (owner, 2026-09-27).
 *
 * Immediately after the name it folds, as in Claude's own headings. It was at the
 * far end of the column, where it read as a control for the column rather than
 * for the words beside it — and it would have collided with Recents' sort
 * button, which is the one thing that genuinely belongs at the far end.
 *
 * jsdom has no layout, so this reads the stylesheet and the order of the
 * children rather than measuring anything.
 */
/**
 * A drag event, the way a browser sends one.
 *
 * jsdom's `DragEvent` carries no `dataTransfer`, and a handler that reads one
 * throws on `undefined` — which is how three of these tests first went green
 * for the wrong reason: the throw came *after* the state they were asserting had
 * already been set, so the assertion passed and the error was collected
 * separately. Every drag here therefore goes through this, which supplies the
 * `dataTransfer` a real browser always has.
 */
function drag(type: string, element: Element, init: { clientX?: number; clientY?: number } = {}): void {
  const event = new MouseEvent(type, {
    bubbles: true,
    clientX: init.clientX ?? 0,
    clientY: init.clientY ?? 0,
  });
  const store = new Map<string, string>();
  Object.defineProperty(event, 'dataTransfer', {
    value: {
      effectAllowed: 'all',
      dropEffect: 'move',
      setData: (format: string, value: string) => {
        store.set(format, value);
      },
      getData: (format: string) => store.get(format) ?? '',
    },
  });
  fireEvent(element, event);
}

/**
 * The stylesheet as source. jsdom applies no CSS, so the halves of this column's
 * behaviour that live in a rule — where the control sits, whether the lifted
 * cell can be pointed at — are read off the file.
 */
const APP_CSS = readFileSync(resolve(import.meta.dirname, '../styles/app.css'), 'utf8');

describe('the fold triangle sits next to its name', () => {
  it('is not pushed to the far end of the row', () => {
    const chevron = APP_CSS.match(/\.sidebar-section-chevron\s*\{([^}]*)\}/);
    expect(chevron?.[1]).not.toContain('margin-left: auto');
  });

  it('is a row of a heading and a control, with the control at the far end', () => {
    // **Not a button inside a button.** The heading is a button, so a heading can
    // be operated at all; Recents carries a control of its own. Nesting them is
    // invalid HTML and worse than invalid in practice: pressing the control also
    // pressed the heading around it, so choosing a filter folded Recents away and
    // took the list with it. The row is the flex container and the two are
    // siblings — the label button grows, so the control lands at the end.
    renderColumn([john, ana, maria], [john.id]);
    const head = screen.getByTestId('section-recents').parentElement;

    expect(head?.className).toContain('sidebar-section-head');
    expect(head?.querySelector('button .sidebar-section-label')).toBeNull();
    const row = [...(head?.children ?? [])].map((child) => child.getAttribute('class') ?? '');
    expect(row[0]).toContain('sidebar-section-label');
    expect(row[1]).toContain('sidebar-view-btn');

    expect(APP_CSS).toMatch(/\.sidebar-section-head\s*\{[^}]*display: flex/);
    expect(APP_CSS).toMatch(/\.sidebar-section-label\s*\{[^}]*flex: 1 1 auto/);
  });

  it('keeps the triangle inside the heading, immediately after the name', () => {
    renderColumn([john, ana, maria], [john.id]);
    const label = screen.getByTestId('section-recents');
    // `className` is an SVGAnimatedString on the icon, not a string.
    const children = [...label.children].map((child) => child.getAttribute('class') ?? '');

    expect(children[0]).not.toContain('sidebar-section-chevron');
    expect(children[children.length - 1]).toContain('sidebar-section-chevron');
    expect(APP_CSS).toMatch(/\.sidebar-section-chevron\s*\{[^}]*\}/);
    // Not pushed to the far end: it belongs to the name it folds.
    expect(APP_CSS.match(/\.sidebar-section-chevron\s*\{([^}]*)\}/)?.[1]).not.toContain('margin-left: auto');
  });

  it('gives the view control no box until she points at it', () => {
    // It lives in a heading, not standing alone, and a border there read as a
    // chip sitting in the label (owner, 2026-09-27).
    const rule = APP_CSS.match(/\.sidebar-section-head \.sidebar-view-btn\s*\{([^}]*)\}/);
    expect(rule?.[1]).toContain('border-color: transparent');
    expect(rule?.[1]).toContain('background: transparent');
    expect(APP_CSS).toMatch(/\.sidebar-view-btn:hover[^{]*\{[^}]*border-color/);
  });
});

/**
 * A list emptied by a filter is not an empty practice (owner, 2026-09-27).
 *
 * This one cost a confused owner: a "Last activity" window was on, every note
 * in the sandbox was older than the window, and the sidebar said **"No active
 * patients"** — a different and untrue thing, with no way back out of it. So the
 * filtered case gets its own message and a button, and the untrue one is left
 * for the case it is actually true of.
 */
describe('a list a filter has emptied', () => {
  function renderFiltered(): void {
    render(
      <MemoryRouter>
        <PatientsColumn
          patients={{ status: 'ready', data: [john, ana, maria] }}
          ordered={[john, ana, maria]}
          activePatientId={null}
          recency={new Map()}
          pinnedIds={[]}
          onSelect={vi.fn()}
          onRetry={vi.fn()}
          onSetArchived={vi.fn()}
          onRename={vi.fn()}
          onDelete={vi.fn()}
          onTogglePin={vi.fn()}
          onReorderPins={vi.fn()}
          onOpenAll={vi.fn()}
          onToggleCollapsed={vi.fn()}
          collapsed={false}
          onOpenSettings={vi.fn()}
          onUnavailable={vi.fn()}
        />
      </MemoryRouter>,
    );
  }

  it('says a filter hid them, and offers the one click that brings them back', () => {
    // No recency dates at all, which is exactly what a last-activity window
    // filters on, so the window hides everyone.
    renderFiltered();

    fireEvent.click(screen.getByTestId('sidebar-view-options'));
    fireEvent.click(screen.getByTestId('view-section-activity'));
    fireEvent.click(screen.getByTestId('view-activity-7d'));

    // Not "no active patients": the patients are right there, one option is
    // hiding them, and there is a way out.
    expect(screen.getByText('No patients match these filters.')).toBeDefined();
    expect(screen.queryByText('No active patients.')).toBeNull();

    fireEvent.click(screen.getByTestId('clear-view'));

    expect(screen.queryByText('No patients match these filters.')).toBeNull();
    expect(screen.getByTestId(`patient-entry-${john.id}`)).toBeDefined();
  });
});

/**
 * Import as a first-level row in "More" (owner, 2026-09-27), where
 * Settings used to keep it behind two levels.
 *
 * Both halves are asserted, because either on its own would let the move be only
 * half-done: the row has to be *there* beside Settings and Language, and the
 * Settings entry has to be *gone*, or there are two doors to the same screens
 * and only one of them gets maintained.
 */
describe('the "More" menu', () => {
  function renderMission(onOpenImport: () => void = vi.fn()): void {
    render(
      <MemoryRouter>
        <PatientsColumn
          patients={{ status: 'ready', data: [john] }}
          ordered={[john]}
          activePatientId={null}
          recency={new Map()}
          pinnedIds={[]}
          onSelect={vi.fn()}
          onRetry={vi.fn()}
          onSetArchived={vi.fn()}
          onRename={vi.fn()}
          onDelete={vi.fn()}
          onTogglePin={vi.fn()}
          onReorderPins={vi.fn()}
          onOpenAll={vi.fn()}
          onToggleCollapsed={vi.fn()}
          collapsed={false}
          onOpenSettings={vi.fn()}
          onUnavailable={vi.fn()}
          onOpenImport={onOpenImport}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId('mission-control'));
  }

  it('offers Import beside Settings and Language, in that order', () => {
    renderMission();

    const rows = screen.getByRole('menu').textContent ?? '';
    expect(rows).toContain('Import');
    expect(rows).toContain('Settings');
    expect(rows).toContain('Language');
    // Beside them, not after Get help at the bottom.
    const order = [...screen.getAllByRole('menuitem')].map((item) => item.getAttribute('data-testid'));
    expect(order.indexOf('mission-import')).toBeGreaterThan(order.indexOf('mission-settings') ?? -1);
    expect(order.indexOf('mission-import')).toBeLessThan(order.indexOf('mission-language') ?? -1);
  });

  it('opens the import screen, and closes the menu behind it', () => {
    const onOpenImport = vi.fn();
    renderMission(onOpenImport);

    fireEvent.click(screen.getByTestId('mission-import'));

    expect(onOpenImport).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('says so rather than doing nothing when there is nowhere to go', () => {
    // The same bargain as the Language row: a column rendered without the
    // handler toasts instead of offering a control that does nothing.
    const onUnavailable = vi.fn();
    render(
      <MemoryRouter>
        <PatientsColumn
          patients={{ status: 'ready', data: [john] }}
          ordered={[john]}
          activePatientId={null}
          recency={new Map()}
          pinnedIds={[]}
          onSelect={vi.fn()}
          onRetry={vi.fn()}
          onSetArchived={vi.fn()}
          onRename={vi.fn()}
          onDelete={vi.fn()}
          onTogglePin={vi.fn()}
          onReorderPins={vi.fn()}
          onOpenAll={vi.fn()}
          onToggleCollapsed={vi.fn()}
          collapsed={false}
          onOpenSettings={vi.fn()}
          onUnavailable={onUnavailable}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId('mission-control'));
    fireEvent.click(screen.getByTestId('mission-import'));

    expect(onUnavailable).toHaveBeenCalledWith('Import');
  });
});

/**
 * An empty group is shown, not hidden (owner, 2026-09-27).
 *
 * The headings used to be filtered to those with somebody in them, and the owner
 * created a group and saw nothing at all — and could not tell "no groups" from
 * "this group is empty" from "broken". Claude shows an empty Projects heading
 * with a line in it; so does this. The test below fails against the old filter.
 */
describe('an empty group', () => {
  const family = {
    id: '0198c0f0-0000-7000-8000-0000000000a1',
    name: 'Family therapy',
    created_at: '2026-03-01T09:00:00.000Z',
    position: null,
  };

  it('keeps its heading and says it is empty', () => {
    render(
      <MemoryRouter>
        <PatientsColumn
          patients={{ status: 'ready', data: [john, ana] }}
          ordered={[john, ana]}
          activePatientId={null}
          recency={new Map()}
          pinnedIds={[]}
          groups={[family]}
          onMoveToGroup={vi.fn()}
          onCreateGroup={vi.fn()}
          onSelect={vi.fn()}
          onRetry={vi.fn()}
          onSetArchived={vi.fn()}
          onRename={vi.fn()}
          onDelete={vi.fn()}
          onTogglePin={vi.fn()}
          onReorderPins={vi.fn()}
          onOpenAll={vi.fn()}
          onToggleCollapsed={vi.fn()}
          collapsed={false}
          onOpenSettings={vi.fn()}
          onUnavailable={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByTestId(`section-group-${family.id}`)).toBeDefined();
    expect(screen.getByTestId(`group-empty-${family.id}`).textContent).toBe('Drag or move patients here');
    // And the ungrouped patients are untouched by it being empty.
    expect(screen.getByTestId(`patient-entry-${john.id}`)).toBeDefined();
  });
});

/**
 * Dragging a name to a place (owner, 2026-09-27), after Claude's: the row lifts
 * into a card that follows the pointer, a group heading lights up when a row is
 * over it, and dropping files the patient there.
 *
 * The two decisions worth pinning are both ones that are easy to get wrong and
 * invisible until she tries: **Recents is not a place a row can be dropped**
 * (its order is her sort choice, not where things sit) and **the group order is
 * hers, not the sidebar's** — a group reads `group_position` first and only falls
 * back to the name for rows she has never ordered against each other.
 */
describe('dragging a name to a place', () => {
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

  const farid = makePatient('Farid Fuentes', { group_id: family.id, group_position: 0 });
  const gina = makePatient('Gina Gallardo', { group_id: family.id, group_position: 1 });
  const hugo = makePatient('Hugo Duarte', { group_id: court.id, group_position: 0 });
  const ines = makePatient('Ines Ibarra');

  function renderDraggable(
    onMoveIntoGroup: (p: PatientListItem, g: string, at: number | null) => void,
    more: {
      onMoveToGroup?: (p: PatientListItem, g: string | null) => void;
      onTogglePin?: (id: string) => void;
      onPinAt?: (id: string, index: number) => void;
      onReorderPins?: (from: number, to: number) => void;
      pinnedIds?: string[];
      people?: PatientListItem[];
    } = {},
  ) {
    const people = more.people ?? [farid, gina, hugo, ines];
    render(
      <MemoryRouter>
        <PatientsColumn
          patients={{ status: 'ready', data: people }}
          ordered={people}
          activePatientId={null}
          recency={new Map()}
          pinnedIds={more.pinnedIds ?? []}
          groups={[family, court]}
          onMoveToGroup={more.onMoveToGroup ?? vi.fn()}
          onCreateGroup={vi.fn()}
          onMoveIntoGroup={onMoveIntoGroup}
          onSelect={vi.fn()}
          onRetry={vi.fn()}
          onSetArchived={vi.fn()}
          onRename={vi.fn()}
          onDelete={vi.fn()}
          onTogglePin={more.onTogglePin ?? vi.fn()}
          onPinAt={more.onPinAt}
          onReorderPins={more.onReorderPins ?? vi.fn()}
          onOpenAll={vi.fn()}
          onToggleCollapsed={vi.fn()}
          collapsed={false}
          onOpenSettings={vi.fn()}
          onUnavailable={vi.fn()}
        />
      </MemoryRouter>,
    );
  }

  /** A drag as the browser runs one: start, move over, drop. */
  function dragOver(rowId: string, targetId: string): void {
    drag('dragstart', screen.getByTestId(`patient-entry-${rowId}`));
    drag('dragover', screen.getByTestId(`patient-entry-${targetId}`));
    drag('drop', screen.getByTestId(`patient-entry-${targetId}`));
  }

  it('orders every group by the one sort, whatever positions are stored', () => {
    stored.set('apunta-sidebar-view-v1', JSON.stringify({ sort: 'name' }));
    // Positions say Gina first; "Name" says Farid first, and "Name" is the sort.
    renderDraggable(vi.fn(), {
      people: [{ ...gina, group_position: 0 }, { ...farid, group_position: 1 }, hugo, ines],
    });
    expect(sidebarOrder().slice(2, 5)).toEqual(['Family therapy', 'Farid Fuentes', 'Gina Gallardo']);
  });

  it('does not reorder inside a group by dragging (owner, 2026-09-28)', () => {
    const onMoveIntoGroup = vi.fn();
    const onMoveToGroup = vi.fn();
    renderDraggable(onMoveIntoGroup, { onMoveToGroup });

    drag('dragstart', screen.getByTestId(`patient-entry-${gina.id}`));
    drag('dragover', screen.getByTestId(`patient-entry-${farid.id}`));
    // No preview, no target: the group follows the sort, not the pointer.
    expect(sidebarOrder().slice(2, 5)).toEqual(['Family therapy', 'Farid Fuentes', 'Gina Gallardo']);
    expect(document.querySelector('.sidebar-section.is-drop-target')).toBeNull();
    drag('drop', screen.getByTestId(`patient-entry-${farid.id}`));

    expect(onMoveIntoGroup).not.toHaveBeenCalled();
    expect(onMoveToGroup).not.toHaveBeenCalled();
    expect(APP_CSS).not.toMatch(/\.patient-entry\.is-drop-target/);
  });

  it('moves somebody into another group by dropping anywhere on it, at the end', () => {
    const onMoveIntoGroup = vi.fn();
    renderDraggable(onMoveIntoGroup);

    drag('dragstart', screen.getByTestId(`patient-entry-${ines.id}`));
    drag('dragover', screen.getByTestId(`patient-entry-${hugo.id}`), { clientX: 50, clientY: 60 });

    // Over another group the section is outlined and the row says what a drop
    // does, as Claude's "Move to" does (owner, 2026-09-27).
    expect(screen.getByTestId(`section-group-${court.id}`).className).toContain('is-drop-target');
    expect(screen.getByTestId('drag-cell').textContent).toBe('Move to Court-mandated');

    drag('drop', screen.getByTestId(`patient-entry-${hugo.id}`));
    expect(onMoveIntoGroup).toHaveBeenCalledWith(ines, court.id, null);
  });

  it('files somebody at the end of a group by dropping on its heading', () => {
    const onMoveIntoGroup = vi.fn();
    renderDraggable(onMoveIntoGroup);
    const heading = screen.getByTestId(`section-group-${court.id}`).querySelector('.sidebar-section-head');

    drag('dragstart', screen.getByTestId(`patient-entry-${ines.id}`));
    drag('dragover', heading as Element);
    drag('drop', heading as Element);

    expect(onMoveIntoGroup).toHaveBeenCalledWith(ines, court.id, null);
  });

  it('takes somebody out of their group when they are dropped on Recents', () => {
    const onMoveToGroup = vi.fn();
    const onMoveIntoGroup = vi.fn();
    renderDraggable(onMoveIntoGroup, { onMoveToGroup });
    const recentsRow = screen.getByTestId(`patient-entry-${ines.id}`);

    drag('dragstart', screen.getByTestId(`patient-entry-${farid.id}`));
    drag('dragover', recentsRow, { clientX: 50, clientY: 60 });
    expect(screen.getByTestId('section-recents-list').className).toContain('is-drop-target');
    expect(screen.getByTestId('drag-cell').textContent).toBe('Move to Recents');
    drag('drop', recentsRow);

    expect(onMoveToGroup).toHaveBeenCalledWith(farid, null);
    expect(onMoveIntoGroup).not.toHaveBeenCalled();
  });

  it('refuses a Recents row dropped back on Recents, whose order is the sort', () => {
    const onMoveToGroup = vi.fn();
    const onMoveIntoGroup = vi.fn();
    renderDraggable(onMoveIntoGroup, { onMoveToGroup });
    const recentsRow = screen.getByTestId(`patient-entry-${ines.id}`);

    drag('dragstart', recentsRow);
    drag('dragover', recentsRow);
    drag('drop', recentsRow);

    expect(onMoveToGroup).not.toHaveBeenCalled();
    expect(onMoveIntoGroup).not.toHaveBeenCalled();
    expect(screen.getByTestId('section-recents-list').className).not.toContain('is-drop-target');
  });

  it('opens a gap in Pinned where a name from elsewhere would land, and pins it there', () => {
    const onPinAt = vi.fn();
    const onMoveIntoGroup = vi.fn();
    renderDraggable(onMoveIntoGroup, { onPinAt, pinnedIds: [farid.id, gina.id] });

    drag('dragstart', screen.getByTestId(`patient-entry-${hugo.id}`));
    // The place comes from the pointer's height under the heading, in 32px
    // slots (jsdom lays nothing out, so the heading's bottom edge is 0): 60px
    // is the second slot, which is Gina's.
    drag('dragover', screen.getByTestId(`patient-entry-${gina.id}`), { clientX: 50, clientY: 60 });

    // An empty slot where Gina was, Gina pushed down under it (owner,
    // 2026-09-28, after Claude's) — no outline, and the lifted row keeps its name.
    const pinned = screen.getByTestId('section-pinned-list');
    expect(
      [...pinned.querySelectorAll('.patient-entry')].map((row) => row.getAttribute('data-testid')),
    ).toEqual([`patient-entry-${farid.id}`, 'pin-gap', `patient-entry-${gina.id}`]);
    expect(pinned.className).not.toContain('is-drop-target');
    expect(screen.getByTestId('drag-cell').textContent).toBe('Hugo Duarte');

    drag('drop', screen.getByTestId('pin-gap'));
    expect(onPinAt).toHaveBeenCalledWith(hugo.id, 1);
    // Pinning is not a move: the group is kept.
    expect(onMoveIntoGroup).not.toHaveBeenCalled();
  });

  it('opens the gap in an empty Pinned in place of its hint', () => {
    const onPinAt = vi.fn();
    renderDraggable(vi.fn(), { onPinAt });

    drag('dragstart', screen.getByTestId(`patient-entry-${hugo.id}`));
    drag('dragover', screen.getByTestId('pin-hint'));

    expect(screen.queryByTestId('pin-hint')).toBeNull();
    drag('drop', screen.getByTestId('pin-gap'));
    expect(onPinAt).toHaveBeenCalledWith(hugo.id, 0);
  });

  it('pins at the bottom when no place is wired, as before', () => {
    const onTogglePin = vi.fn();
    renderDraggable(vi.fn(), { onTogglePin });

    drag('dragstart', screen.getByTestId(`patient-entry-${hugo.id}`));
    drag('dragover', screen.getByTestId('pin-hint'));
    drag('drop', screen.getByTestId('pin-gap'));

    expect(onTogglePin).toHaveBeenCalledWith(hugo.id);
  });

  it('leaves the row she picked up as an empty slot, not a faded name', () => {
    renderDraggable(vi.fn());

    drag('dragstart', screen.getByTestId(`patient-entry-${gina.id}`));

    expect(screen.getByTestId(`patient-entry-${gina.id}`).className).toContain('is-dragging');
    expect(APP_CSS).toMatch(/\.patient-entry\.is-dragging > \*\s*\{[^}]*visibility: hidden/);
    expect(APP_CSS).not.toMatch(/\.patient-entry\.is-dragging\s*\{[^}]*opacity/);
    // And no grey box left behind: no hover or selected fill on the slot.
    expect(APP_CSS).toMatch(
      /\.patient-entry\.is-dragging,\s*\.patient-entry\.is-dragging:hover,\s*\.patient-entry\.is-dragging:has\(\.project-row\.is-active\)\s*\{[^}]*background: transparent/,
    );
  });

  it('draws a pinned patient in Pinned only, not in their group too', () => {
    renderDraggable(vi.fn(), { pinnedIds: [farid.id] });

    expect(sidebarOrder()).toEqual([
      'Pinned',
      'Farid Fuentes',
      'Family therapy',
      'Gina Gallardo',
      'Court-mandated',
      'Hugo Duarte',
      'Recents',
      'Ines Ibarra',
    ]);
  });

  it('unpins and files somebody dragged out of Pinned onto a group', () => {
    const onTogglePin = vi.fn();
    const onMoveIntoGroup = vi.fn();
    renderDraggable(onMoveIntoGroup, { onTogglePin, pinnedIds: [farid.id] });

    dragOver(farid.id, hugo.id);

    expect(onTogglePin).toHaveBeenCalledWith(farid.id);
    expect(onMoveIntoGroup).toHaveBeenCalledWith(farid, court.id, null);
  });

  it('unpins somebody dragged out of Pinned back onto their own group, and nothing else', () => {
    const onTogglePin = vi.fn();
    const onMoveIntoGroup = vi.fn();
    renderDraggable(onMoveIntoGroup, { onTogglePin, pinnedIds: [farid.id] });

    dragOver(farid.id, gina.id);

    expect(onTogglePin).toHaveBeenCalledWith(farid.id);
    expect(onMoveIntoGroup).not.toHaveBeenCalled();
  });

  it('unpins and ungroups somebody dragged out of Pinned onto Recents', () => {
    const onTogglePin = vi.fn();
    const onMoveToGroup = vi.fn();
    renderDraggable(vi.fn(), { onTogglePin, onMoveToGroup, pinnedIds: [farid.id] });

    dragOver(farid.id, ines.id);

    expect(onTogglePin).toHaveBeenCalledWith(farid.id);
    expect(onMoveToGroup).toHaveBeenCalledWith(farid, null);
  });

  it('still reorders the pins by dragging inside Pinned', () => {
    const onReorderPins = vi.fn();
    renderDraggable(vi.fn(), { onReorderPins, pinnedIds: [farid.id, hugo.id] });

    dragOver(hugo.id, farid.id);

    expect(onReorderPins).toHaveBeenCalledWith(1, 0);
  });

  it('draws the view control once, on the topmost group and not on Recents', () => {
    renderDraggable(vi.fn());

    expect(screen.getAllByTestId('sidebar-view-options')).toHaveLength(1);
    expect(
      screen.getByTestId(`section-group-${family.id}`).querySelector('[data-testid="sidebar-view-options"]'),
    ).not.toBeNull();
  });

  it('lifts the name into a cell that follows the pointer', () => {
    renderDraggable(vi.fn());
    const list = document.querySelector('.patient-sections') as HTMLElement;

    // jsdom's DragEvent carries no coordinates, and a plain `dragOver` init
    // lands as `undefined` — which React would happily write as `NaNpx` and the
    // style attribute would then throw away. So the event is built by hand with
    // the pointer position a real drag would have.
    drag('dragstart', screen.getByTestId(`patient-entry-${ines.id}`));
    drag('dragover', list, { clientX: 120, clientY: 340 });

    const cell = screen.getByTestId('drag-cell');
    expect(cell.textContent).toBe('Ines Ibarra');
    expect(cell.style.left).toBe('120px');
    expect(cell.style.top).toBe('340px');
    // It is on the body, not inside the scrolling list, and it can never be the
    // thing the pointer is over.
    expect(cell.parentElement).toBe(document.body);
    expect(APP_CSS).toMatch(/\.drag-cell\s*\{[^}]*pointer-events: none/);

    drag('dragend', screen.getByTestId(`patient-entry-${ines.id}`));
    expect(screen.queryByTestId('drag-cell')).toBeNull();
  });
});

/**
 * Dragging one group past another (owner, 2026-09-27).
 *
 * The order of her groups is hers, so it lives in the database (migration 011)
 * rather than in the window. A drop is a **move and never a merge** — two groups
 * dropped on each other have to stay two groups, because the alternative way to
 * say "put these people together" is a menu, not a slip of the pointer.
 */
describe('dragging one group past another', () => {
  const first = {
    id: '0198c0f0-0000-7000-8000-0000000000b1',
    name: 'Family therapy',
    created_at: '2026-03-01T09:00:00.000Z',
    position: 0,
  };
  const second = {
    id: '0198c0f0-0000-7000-8000-0000000000b2',
    name: 'Court-mandated',
    created_at: '2026-03-02T09:00:00.000Z',
    position: 1,
  };

  const ines = makePatient('Ines Ibarra', { group_id: first.id, group_position: 0 });
  // One patient with no group, so Recents is a section rather than absent —
  // the whole point of the last test in this block is that it is *there* and is
  // still not a place anything can be dropped.
  const loose = makePatient('Lorna Idris');

  function renderGroups(onReorderGroup: (groupId: string, index: number) => void) {
    render(
      <MemoryRouter>
        <PatientsColumn
          patients={{ status: 'ready', data: [ines, loose] }}
          ordered={[ines, loose]}
          activePatientId={null}
          recency={new Map()}
          pinnedIds={[]}
          groups={[first, second]}
          onMoveToGroup={vi.fn()}
          onCreateGroup={vi.fn()}
          onMoveIntoGroup={vi.fn()}
          onReorderGroup={onReorderGroup}
          onSelect={vi.fn()}
          onRetry={vi.fn()}
          onSetArchived={vi.fn()}
          onRename={vi.fn()}
          onDelete={vi.fn()}
          onTogglePin={vi.fn()}
          onReorderPins={vi.fn()}
          onOpenAll={vi.fn()}
          onToggleCollapsed={vi.fn()}
          collapsed={false}
          onOpenSettings={vi.fn()}
          onUnavailable={vi.fn()}
        />
      </MemoryRouter>,
    );
  }

  /**
   * The heading row, which is the draggable thing.
   *
   * The two sections are addressed differently and neither is wrong: a group is
   * marked on the `<section>`, whose heading row is a child, and Recents on the
   * label button, whose heading row is the parent. A drag has to start on the
   * row itself — an event on the `<section>` cannot reach a handler on its
   * child — so both are resolved to it, upwards or downwards.
   */
  function heading(testId: string): Element {
    const node = screen.getByTestId(testId);
    return (node.closest('.sidebar-section-head') ?? node.querySelector('.sidebar-section-head')) as Element;
  }

  it('puts the dragged group above the one it was dropped on', () => {
    const onReorderGroup = vi.fn();
    renderGroups(onReorderGroup);

    drag('dragstart', heading(`section-group-${second.id}`));
    drag('dragover', heading(`section-group-${first.id}`));
    drag('drop', heading(`section-group-${first.id}`));

    // The index is where it lands, not a flag: `first` is at 0, so dropping
    // onto it is the same as saying "the top of the list".
    expect(onReorderGroup).toHaveBeenCalledWith(second.id, 0);
  });

  it('does not move a group onto itself, which would be a no-op with a write', () => {
    const onReorderGroup = vi.fn();
    renderGroups(onReorderGroup);

    drag('dragstart', heading(`section-group-${first.id}`));
    drag('drop', heading(`section-group-${first.id}`));

    expect(onReorderGroup).not.toHaveBeenCalled();
  });

  it('leaves the groups as two groups — a move is not a merge', () => {
    const onReorderGroup = vi.fn();
    renderGroups(onReorderGroup);

    drag('dragstart', heading(`section-group-${second.id}`));
    drag('drop', heading(`section-group-${first.id}`));

    // There is one call, and it is a move. Nothing in the tree said "these are
    // now one group", because there is no way to say it by dropping.
    expect(onReorderGroup).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId(`section-group-${first.id}`)).toBeDefined();
    expect(screen.getByTestId(`section-group-${second.id}`)).toBeDefined();
  });

  it('offers nothing to drop onto in Recents, which is a sort and not a place', () => {
    const onReorderGroup = vi.fn();
    renderGroups(onReorderGroup);

    expect(screen.getByTestId('section-recents')).toBeDefined();
    drag('dragstart', heading(`section-group-${second.id}`));
    drag('dragover', heading('section-recents'));
    drag('drop', heading('section-recents'));

    expect(onReorderGroup).not.toHaveBeenCalled();
  });
});

/**
 * Where the control sits (owner, 2026-09-27): on the **first section the filters
 * reach**. It is not a control *of* Recents — what it sets applies to every
 * section from it down — so it rides the topmost group when she has one, and
 * falls back to Recents when she has none. It is a move because that fallback is
 * the whole point: a woman with no groups still has a way to filter.
 */
describe('the control rides the first section the filters reach', () => {
  const group = {
    id: '0198c0f0-0000-7000-8000-0000000000c1',
    name: 'Family therapy',
    created_at: '2026-03-01T09:00:00.000Z',
    position: 0,
  };
  const filed = makePatient('Farid Fuentes', { group_id: group.id, group_position: 0 });
  const ines = makePatient('Ines Ibarra');

  function renderWithGroups(groups: PatientGroup[]): void {
    render(
      <MemoryRouter>
        <PatientsColumn
          patients={{ status: 'ready', data: [filed, ines] }}
          ordered={[filed, ines]}
          activePatientId={null}
          recency={new Map()}
          pinnedIds={[]}
          groups={groups}
          onMoveToGroup={vi.fn()}
          onCreateGroup={vi.fn()}
          onMoveIntoGroup={vi.fn()}
          onSelect={vi.fn()}
          onRetry={vi.fn()}
          onSetArchived={vi.fn()}
          onRename={vi.fn()}
          onDelete={vi.fn()}
          onTogglePin={vi.fn()}
          onReorderPins={vi.fn()}
          onOpenAll={vi.fn()}
          onToggleCollapsed={vi.fn()}
          collapsed={false}
          onOpenSettings={vi.fn()}
          onUnavailable={vi.fn()}
        />
      </MemoryRouter>,
    );
  }

  it('sits on the topmost group, and only there', () => {
    renderWithGroups([group]);

    expect(
      within(screen.getByTestId(`section-group-${group.id}`)).getByTestId('sidebar-view-options'),
    ).toBeDefined();
    expect(within(screen.getByTestId('section-recents')).queryByTestId('sidebar-view-options')).toBeNull();
  });

  it('falls back to Recents when she has no groups at all', () => {
    renderWithGroups([]);

    const recentsHead = screen.getByTestId('section-recents').closest('.sidebar-section-head');
    expect(within(recentsHead as HTMLElement).getByTestId('sidebar-view-options')).toBeDefined();
  });
});

/**
 * Pinned is above the control, so the filters do not reach it (owner,
 * 2026-09-27). A pin is a decision she made on purpose; a status or date filter
 * quietly emptying it would read as the pin having stopped working.
 *
 * The search *does* reach Pinned, because searching is itself deliberate and it
 * shows everyone it matched. This test pins the difference: same search, two
 * sections, two different rules.
 */
describe('Pinned sits above the filters', () => {
  const active = makePatient('Pinned and active');
  const archived = makePatient('Pinned and archived', { archived_at: '2026-03-01T09:00:00.000Z' });
  const unfiled = makePatient('Unpinned and archived', { archived_at: '2026-03-01T09:00:00.000Z' });

  function renderPinned(): void {
    render(
      <MemoryRouter>
        <PatientsColumn
          patients={{ status: 'ready', data: [active, archived, unfiled] }}
          ordered={[active, archived, unfiled]}
          activePatientId={null}
          recency={new Map()}
          pinnedIds={[active.id, archived.id]}
          groups={[]}
          onMoveToGroup={vi.fn()}
          onCreateGroup={vi.fn()}
          onMoveIntoGroup={vi.fn()}
          onSelect={vi.fn()}
          onRetry={vi.fn()}
          onSetArchived={vi.fn()}
          onRename={vi.fn()}
          onDelete={vi.fn()}
          onTogglePin={vi.fn()}
          onReorderPins={vi.fn()}
          onOpenAll={vi.fn()}
          onToggleCollapsed={vi.fn()}
          collapsed={false}
          onOpenSettings={vi.fn()}
          onUnavailable={vi.fn()}
        />
      </MemoryRouter>,
    );
  }

  it('keeps a pinned patient the status filter would have removed', () => {
    renderPinned();

    // Both pins are still there, including the archived one the filter removed.
    expect(screen.getByTestId(`patient-entry-${active.id}`)).toBeDefined();
    expect(screen.getByTestId(`patient-entry-${archived.id}`)).toBeDefined();
    // The same filter, one section down, still does its job: the unpinned
    // archived patient is gone, and Pinned is the only reason she is still here.
    expect(screen.queryByTestId(`patient-entry-${unfiled.id}`)).toBeNull();
  });
});

/**
 * Rows never "respawn" (owner, 2026-09-28). The entrance cascade is a CSS
 * animation, and a CSS animation restarts whenever its element is moved in the
 * document — so left on, every row a drag or a re-sort moved faded in again as
 * if it were new. It now plays only while the list first arrives.
 */
describe("the rows' entrance", () => {
  const MOTION_CSS = readFileSync(resolve(import.meta.dirname, '../styles/motion.css'), 'utf8');

  it('animates patient rows only inside a list that is arriving', () => {
    expect(MOTION_CSS).toMatch(/\.patient-sections\.is-entering \.patient-entry\s*\{[^}]*animation: rise-in/);
    // No rule animates a bare `.patient-entry`, which is what made moved rows replay.
    expect(MOTION_CSS).not.toMatch(/(^|,)\s*\.patient-entry(:nth-child\([^)]*\))?\s*[,{]/m);
  });

  it('stops being "arriving" shortly after the list is shown', () => {
    vi.useFakeTimers();
    try {
      renderColumn([john, ana, maria], []);
      const list = document.querySelector('.patient-sections') as HTMLElement;
      expect(list.className).toContain('is-entering');
      act(() => {
        vi.advanceTimersByTime(800);
      });
      expect(list.className).not.toContain('is-entering');
    } finally {
      vi.useRealTimers();
    }
  });
});

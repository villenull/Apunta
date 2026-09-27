import type { PatientListItem } from '@apunta/shared';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makePatient } from '../test/fakeApi.js';
import { PatientsColumn } from './PatientsColumn.js';

/**
 * The sidebar's two groups, headed as claude.ai heads its own: "Pinned", which
 * is always there and says how to fill it while it is empty, then "Older" with
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
  it('heads pinned patients "Pinned" and the rest "Older"', () => {
    renderColumn([john, ana, maria], [john.id]);
    expect(sidebarOrder()).toEqual(['Pinned', 'John Smith', 'Older', 'Ana Torres', 'Maria Ruiz']);
    expect(screen.queryByTestId('pin-hint')).toBeNull();
  });

  it('keeps an empty "Pinned" group that says how to fill it', () => {
    renderColumn([ana, john], []);
    expect(sidebarOrder()).toEqual([
      'Pinned',
      'Pin patients to keep them here',
      'Older',
      'Ana Torres',
      'John Smith',
    ]);
  });

  it('orders "Older" by name from the control beside it, and remembers it', () => {
    renderColumn([maria, ana, john], []);
    fireEvent.click(screen.getByRole('button', { name: 'Sort patients' }));
    expect(screen.getByRole('menuitemradio', { name: 'Recent activity' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Name' }));
    expect(sidebarOrder().slice(2)).toEqual(['Older', 'Ana Torres', 'John Smith', 'Maria Ruiz']);

    cleanup();
    renderColumn([maria, ana, john], []);
    expect(sidebarOrder().slice(2)).toEqual(['Older', 'Ana Torres', 'John Smith', 'Maria Ruiz']);
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

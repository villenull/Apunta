import type { PatientListItem } from '@apunta/shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { makePatient } from '../test/fakeApi.js';
import { PatientsColumn } from './PatientsColumn.js';

/**
 * The sidebar's two groups, headed as claude.ai heads its own (AM-047):
 * "Starred" over the starred patients, "Recents" over everyone else, and no
 * "Starred" heading at all when nobody is starred.
 */

afterEach(cleanup);

const ana = makePatient('Ana Torres');
const john = makePatient('John Smith');
const maria = makePatient('Maria Ruiz');

function renderColumn(ordered: PatientListItem[], pinnedIds: string[]): void {
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

/** The section labels and patient names, top to bottom, as the sidebar reads. */
function sidebarOrder(): string[] {
  return [...document.querySelectorAll('.sidebar-section-label, .patient-entry .project-row .name')].map(
    (element) => element.textContent ?? '',
  );
}

describe('the sidebar groups', () => {
  it('heads starred patients "Starred" and the rest "Recents"', () => {
    renderColumn([john, ana, maria], [john.id]);
    expect(sidebarOrder()).toEqual(['Starred', 'John Smith', 'Recents', 'Ana Torres', 'Maria Ruiz']);
  });

  it('shows only "Recents" when nobody is starred', () => {
    renderColumn([ana, john], []);
    expect(sidebarOrder()).toEqual(['Recents', 'Ana Torres', 'John Smith']);
    expect(screen.queryByTestId('section-starred')).toBeNull();
  });

  it('opens Rename as a modal over the page, leaving the row in place', () => {
    renderColumn([john], []);
    fireEvent.click(screen.getByLabelText('Tools for John Smith'));
    fireEvent.click(screen.getByTestId(`rename-${john.id}`));
    expect(screen.getByRole('dialog', { name: 'Rename John Smith' })).toBeDefined();
    expect(screen.getByTestId(`patient-row-${john.id}`)).toBeDefined();
  });
});

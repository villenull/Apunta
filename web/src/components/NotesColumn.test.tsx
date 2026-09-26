import type { PatientListItem } from '@apunta/shared';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { makePatient } from '../test/fakeApi.js';
import { NotesColumn } from './NotesColumn.js';

/**
 * The three work-around-a-session buttons carry a glyph as well as a word
 * (AM-047). Two things have to hold, and they pull in opposite directions:
 *
 *  - the mark is present, so the column matches claude.ai's icon-plus-label
 *    rows rather than three bare words;
 *  - and it is *invisible to a screen reader*, because the word beside it was
 *    always the accessible name. Every icon in this file is `aria-hidden`, so
 *    that name must not change by one glyph — which is the easy thing to break
 *    and the reason it is asserted rather than assumed.
 */

afterEach(cleanup);

const patient: PatientListItem = makePatient('John Smith');

function renderColumn(): void {
  render(
    <MemoryRouter>
      <NotesColumn
        patient={patient}
        notes={{ status: 'ready', data: [] }}
        activeNoteId={null}
        view="notes"
        onSelect={vi.fn()}
        onOpenView={vi.fn()}
        onRetry={vi.fn()}
        onBackToPatients={vi.fn()}
      />
    </MemoryRouter>,
  );
}

/** The one glyph in a button, or null when it has none. */
function markIn(testId: string): Element | null {
  return screen.getByTestId(testId).querySelector('svg');
}

describe('NotesColumn session buttons', () => {
  it('gives each of the three a mark as well as its word', () => {
    renderColumn();
    for (const id of ['open-brainstorm', 'open-plan', 'open-prep']) {
      expect(markIn(id), `${id} carries no icon`).not.toBeNull();
    }
  });

  it('leaves the accessible name as the word alone', () => {
    renderColumn();
    // Queried by role and name, so this goes through the same name computation
    // a screen reader does rather than reading markup. Note what it can and
    // cannot catch: a bare <svg> with no text in it would not pollute the name
    // even unhidden, so this guards against a *labelled* glyph leaking, and
    // the next test is what actually pins `aria-hidden`.
    const byName = screen.getByRole('button', { name: 'Treatment plan' });
    expect(byName).toBe(screen.getByTestId('open-plan'));
    expect(screen.getByTestId('open-plan').textContent).toBe('Treatment plan');
  });

  it('keeps the marks out of the accessibility tree', () => {
    renderColumn();
    for (const id of ['open-brainstorm', 'open-plan', 'open-prep']) {
      expect(markIn(id)?.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('draws every mark at one stroke weight, at the small size', () => {
    renderColumn();
    for (const id of ['open-brainstorm', 'open-plan', 'open-prep']) {
      const mark = markIn(id);
      expect(mark?.getAttribute('class')).toContain('icon-sm');
    }
  });
});

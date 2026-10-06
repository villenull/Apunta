import type { Note, PatientListItem } from '@apunta/shared';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { makeNote, makePatient } from '../test/fakeApi.js';
import { NotesColumn, type NotesColumnProps } from './NotesColumn.js';

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
 *
 * The lower half of the file covers the column's shape (owner, 2026-10-05):
 * the patient's heading gone, the column ordered the way she works in — the
 * three tools at the top, then "Notes", then "New note", then the notes alone
 * scrolling — and blank space clearing the selection.
 */

afterEach(cleanup);

const patient: PatientListItem = makePatient('John Smith');
const firstNote: Note = makeNote(patient.id, { title: 'Progress note' });
const secondNote: Note = makeNote(patient.id, { title: 'Intake note' });

function renderColumn(overrides: Partial<NotesColumnProps> = {}): { onDeselect: () => void } {
  const onDeselect = vi.fn();
  const props: NotesColumnProps = {
    patient,
    notes: { status: 'ready', data: [] },
    activeNoteId: null,
    view: 'notes',
    onSelect: vi.fn(),
    onOpenView: vi.fn(),
    onRetry: vi.fn(),
    onBackToPatients: vi.fn(),
    onDeselect,
    ...overrides,
  };
  render(
    <MemoryRouter>
      <NotesColumn {...props} />
    </MemoryRouter>,
  );
  return { onDeselect };
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

describe('NotesColumn shape', () => {
  it('drops the patient heading and orders the column the way she works in', () => {
    renderColumn({ notes: { status: 'ready', data: [firstNote] } });
    const column = screen.getByTestId('notes-column');

    // The sidebar row already says who is open (owner, 2026-10-05), so the
    // column does not repeat the name one screen away.
    expect(screen.queryByTestId('notes-header')).toBeNull();
    expect(column.textContent).not.toContain('John');

    // Top to bottom: the tools she opens a session with, then the notes'
    // own heading, then the row that starts one, then the notes.
    const tools = screen.getByTestId('notes-tools');
    const head = screen.getByTestId('notes-head');
    const list = screen.getByTestId('note-list');
    expect(tools.compareDocumentPosition(head) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(head.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // The heading and "New note" share one band, with the heading above the row.
    expect(head.contains(screen.getByTestId('notes-new-note'))).toBe(true);
    expect(screen.getByText('Notes').className).toContain('notes-list-heading');
    expect(
      screen.getByText('Notes').compareDocumentPosition(screen.getByTestId('notes-new-note')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByTestId('notes-new-note').textContent).toContain('New note');
  });

  it('scrolls the notes alone, with the tools above them and off the scroll', () => {
    renderColumn({ notes: { status: 'ready', data: [firstNote, secondNote] } });
    const scroll = screen.getByTestId('note-list');
    const tools = screen.getByTestId('notes-tools');

    // The scroll band holds the notes and nothing else: not the tools, not the
    // heading and New note above them.
    expect(within(scroll).getAllByRole('button')).toHaveLength(2);
    expect(scroll.contains(tools)).toBe(false);
    expect(scroll.contains(screen.getByTestId('notes-head'))).toBe(false);
    // The tools are the top of the column, so they come before the band they
    // sit over.
    expect(tools.compareDocumentPosition(scroll) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tools.querySelectorAll('.col-action-btn')).toHaveLength(3);
  });

  it('puts the format name above the date in a note row, date carrying the row', () => {
    renderColumn({ notes: { status: 'ready', data: [firstNote] } });
    const row = screen.getByText('Progress note').closest('button') as HTMLElement;

    // Owner, 2026-10-05: the format is the quiet line, the date is the one she
    // scans a list for.
    const format = row.querySelector('.note-format') as HTMLElement;
    const date = row.querySelector('.note-date') as HTMLElement;
    expect(format.compareDocumentPosition(date) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(date.textContent).not.toBe('');
  });

  it('keeps the narrow-window way back to the patients', () => {
    renderColumn({ notes: { status: 'ready', data: [firstNote] } });
    // On a phone this column is the whole screen, so the way back has to be in
    // it; `.narrow-back` is what keeps it off the wide layout.
    const back = screen.getByRole('button', { name: 'Patients' });
    expect(back.className).toContain('narrow-back');
    expect(screen.getByTestId('notes-column').contains(back)).toBe(true);
  });

  it('lets only genuinely blank space clear the selection', () => {
    const { onDeselect } = renderColumn({ notes: { status: 'ready', data: [firstNote, secondNote] } });

    // Empty space in the band: the place her cursor already is after the last
    // note, and the thing the column is mostly made of.
    fireEvent.click(screen.getByTestId('note-list'));
    expect(onDeselect).toHaveBeenCalledTimes(1);

    // The "Notes" label over the list is that same space with a word in it —
    // not a control — so it clears the selection the same way.
    fireEvent.click(screen.getByText('Notes'));
    expect(onDeselect).toHaveBeenCalledTimes(2);
  });

  it('does not clear on a note row, a tool, New note, or the notes label', () => {
    const { onDeselect } = renderColumn({ notes: { status: 'ready', data: [firstNote, secondNote] } });

    // Every control in the column is pressable, and a press is not a click on
    // the space around it — including a click that lands on the inner wrapper
    // of a row rather than the row's own edge.
    const row = screen.getByText('Intake note').closest('button') as HTMLElement;
    fireEvent.click(row);
    fireEvent.click(row.querySelector('.note-format') as HTMLElement);
    fireEvent.click(screen.getByTestId('open-plan'));
    fireEvent.click(screen.getByTestId('notes-new-note'));
    expect(onDeselect).not.toHaveBeenCalled();
  });
});

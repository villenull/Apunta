import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { makePatient } from '../test/fakeApi.js';
import { PatientMenu, type PatientMenuProps } from './PatientMenu.js';
import { PatientRenameField } from './PatientRenameField.js';

/**
 * The row menu and rename, after claude.ai's: Pin with P, a bare "Rename"
 * row, and a rename that turns the row itself into the field (owner,
 * 2026-09-26).
 */

afterEach(cleanup);

const john = makePatient('John Smith');

/** The menu's props with no-op handlers, for a render that sets its own. */
function renderlessProps(): PatientMenuProps {
  return {
    patient: john,
    archived: false,
    pinned: false,
    onTogglePin: vi.fn(),
    onRename: vi.fn(),
    onSetArchived: vi.fn(),
    onDelete: vi.fn(),
  };
}

function renderMenu(overrides: Partial<PatientMenuProps> = {}): PatientMenuProps {
  const props: PatientMenuProps = {
    patient: john,
    archived: false,
    pinned: false,
    onTogglePin: vi.fn(),
    onRename: vi.fn(),
    onSetArchived: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  render(<PatientMenu {...props} />);
  fireEvent.click(screen.getByLabelText('Tools for John Smith'));
  return props;
}

describe('the patient row menu', () => {
  it('offers Pin, a bare Rename, and Archive, in that order', () => {
    renderMenu();
    const items = within(screen.getByRole('menu')).getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['PinP', 'RenameR', 'ArchiveD']);
    // The row reads "Rename"; its accessible name says whom.
    expect(screen.getByRole('menuitem', { name: 'Rename John Smith' })).toBeDefined();
  });

  it('says Unpin for a pinned patient, and P toggles it while open', () => {
    const props = renderMenu({ pinned: true });
    expect(screen.getByTestId(`pin-${john.id}`).textContent).toContain('Unpin');
    fireEvent.keyDown(document.body, { key: 'p' });
    expect(props.onTogglePin).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  /**
   * On "View all" the menu takes Claude's Recents shape (owner, 2026-09-26):
   * upright dots, and "Select" above the rest with a rule under it. The
   * sidebar's menu keeps its own shape.
   */
  it('puts Select first on the View all page, and only there', () => {
    const onSelectMode = vi.fn();
    render(<PatientMenu {...renderlessProps()} scope="directory" onSelectMode={onSelectMode} />);
    fireEvent.click(screen.getByLabelText('Tools for John Smith, all patients'));

    const items = within(screen.getByRole('menu')).getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['Select', 'PinP', 'RenameR', 'ArchiveD']);
    fireEvent.click(items[0] as HTMLElement);
    expect(onSelectMode).toHaveBeenCalledTimes(1);
    cleanup();

    renderMenu();
    expect(screen.queryByRole('menuitem', { name: 'Select' })).toBeNull();
  });

  it('offers Restore and Delete for an archived patient', () => {
    const props = renderMenu({ archived: true });
    expect(screen.getByRole('menuitem', { name: 'Restore' })).toBeDefined();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete John Smith' }));
    expect(props.onDelete).toHaveBeenCalledTimes(1);
  });
});

describe('renaming in place', () => {
  it('opens with the whole name selected, and Enter saves the trimmed new one', () => {
    const onRename = vi.fn();
    const onDone = vi.fn();
    render(<PatientRenameField patient={john} onRename={onRename} onDone={onDone} />);

    const field = screen.getByLabelText('Name for John Smith') as HTMLInputElement;
    expect(document.activeElement).toBe(field);
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, 'John Smith'.length]);

    fireEvent.change(field, { target: { value: '  Jon Smith ' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    // The field unmounting blurs it; that must not save a second time.
    fireEvent.blur(field);

    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onRename).toHaveBeenCalledWith(john, 'Jon Smith');
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('saves when she clicks away', () => {
    const onRename = vi.fn();
    render(<PatientRenameField patient={john} onRename={onRename} onDone={vi.fn()} />);
    const field = screen.getByLabelText('Name for John Smith');
    fireEvent.change(field, { target: { value: 'Jon Smith' } });
    fireEvent.blur(field);
    expect(onRename).toHaveBeenCalledWith(john, 'Jon Smith');
  });

  it('puts the old name back on Escape, and will not save an empty name', () => {
    const onRename = vi.fn();
    const onDone = vi.fn();
    render(<PatientRenameField patient={john} onRename={onRename} onDone={onDone} />);
    const field = screen.getByLabelText('Name for John Smith');

    fireEvent.change(field, { target: { value: 'Someone else' } });
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onRename).not.toHaveBeenCalled();
    cleanup();

    render(<PatientRenameField patient={john} onRename={onRename} onDone={onDone} />);
    const again = screen.getByLabelText('Name for John Smith');
    fireEvent.change(again, { target: { value: '   ' } });
    fireEvent.keyDown(again, { key: 'Enter' });
    expect(onRename).not.toHaveBeenCalled();
  });
});

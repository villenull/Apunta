import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { makePatient } from '../test/fakeApi.js';
import { PatientMenu, type PatientMenuProps } from './PatientMenu.js';
import { PatientRenameForm } from './PatientRenameForm.js';

/**
 * The row menu and the rename modal, after claude.ai's (AM-047): Star rather
 * than Pin, a bare "Rename" row, and a rename that opens a small modal with
 * Cancel and Save instead of editing the row in place.
 */

afterEach(cleanup);

const john = makePatient('John Smith');

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
  it('offers Star, a bare Rename, and Archive, in that order', () => {
    renderMenu();
    const items = within(screen.getByRole('menu')).getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['StarS', 'RenameR', 'ArchiveD']);
    // The row reads "Rename"; its accessible name says whom.
    expect(screen.getByRole('menuitem', { name: 'Rename John Smith' })).toBeDefined();
  });

  it('says Unstar for a starred patient, and S toggles it while open', () => {
    const props = renderMenu({ pinned: true });
    expect(screen.getByTestId(`pin-${john.id}`).textContent).toContain('Unstar');
    fireEvent.keyDown(document.body, { key: 's' });
    expect(props.onTogglePin).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('offers Restore and Delete for an archived patient', () => {
    const props = renderMenu({ archived: true });
    expect(screen.getByRole('menuitem', { name: 'Restore' })).toBeDefined();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete John Smith' }));
    expect(props.onDelete).toHaveBeenCalledTimes(1);
  });
});

describe('the rename modal', () => {
  it('opens as a dialog titled with the name, and saves the trimmed new one', () => {
    const onRename = vi.fn();
    const onDone = vi.fn();
    render(<PatientRenameForm patient={john} onRename={onRename} onDone={onDone} />);

    const dialog = screen.getByRole('dialog', { name: 'Rename John Smith' });
    fireEvent.change(within(dialog).getByLabelText('Name for John Smith'), {
      target: { value: '  Jon Smith ' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(onRename).toHaveBeenCalledWith(john, 'Jon Smith');
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('cancels without saving, and will not save an empty name', () => {
    const onRename = vi.fn();
    const onDone = vi.fn();
    render(<PatientRenameForm patient={john} onRename={onRename} onDone={onDone} />);

    fireEvent.change(screen.getByLabelText('Name for John Smith'), { target: { value: '   ' } });
    expect((screen.getByTestId(`save-name-${john.id}`) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onRename).not.toHaveBeenCalled();
  });
});

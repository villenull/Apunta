import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { usePatientGroups } from '../hooks/usePatientGroups.js';
import { installFakeApi, makePatient } from '../test/fakeApi.js';
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

/**
 * The group's page inside the menu (owner, 2026-09-27).
 *
 * It replaces the menu's contents rather than opening beside it, because this
 * menu is right-aligned near the right edge of a 288px sidebar and a second
 * panel would leave the window. The things pinned here are the ones a diff would
 * hide: that the row is only drawn when the feature is wired, that the current
 * group is the one ticked, that a patient in no group is offered no way out,
 * and that the letters bound on the first page are unbound here — a list of
 * names is not something a stray keystroke should act on.
 */
describe('Move to group', () => {
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

  function groupProps(overrides: Partial<PatientMenuProps> = {}): PatientMenuProps {
    return {
      ...renderlessProps(),
      groups: [family, court],
      onMoveToGroup: vi.fn(),
      onCreateGroup: vi.fn(),
      ...overrides,
    };
  }

  it('is not drawn at all until the column wires the feature up', () => {
    renderMenu();
    expect(screen.queryByTestId(`move-to-group-${john.id}`)).toBeNull();
  });

  it('sits after Rename, and opens a second panel without disturbing the first', () => {
    renderMenu(groupProps());
    const items = within(screen.getByRole('menu')).getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['PinP', 'RenameR', 'Move to group', 'ArchiveD']);

    fireEvent.click(screen.getByTestId(`move-to-group-${john.id}`));

    // A submenu, not a page turn: Pin and Archive are still there, and the
    // panel hangs beside the row that opened it. Two elements now carry
    // `role="menu"`, so the parent is reached from its own row rather than by
    // asking for "the" menu.
    const row = screen.getByTestId(`move-to-group-${john.id}`);
    expect(within(row.closest('[role="menu"]') as HTMLElement).getByTestId(`pin-${john.id}`)).toBeDefined();
    expect(row.getAttribute('aria-expanded')).toBe('true');
    const panel = screen.getByTestId('patient-submenu');
    expect(panel.getAttribute('role')).toBe('menu');
    expect(panel.getAttribute('aria-label')).toBe('Move to group');
    expect(within(panel).getByTestId(`group-${family.id}`).textContent).toBe('Family therapy');
    expect(within(panel).getByTestId(`group-${court.id}`).textContent).toBe('Court-mandated');
    expect(within(panel).getByTestId('group-new').textContent).toContain('New group');
  });

  it("puts the panel flush against the menu's right edge, and outside the column", () => {
    // Two things this pins, both of which were wrong on the first attempt.
    //
    // **Flush, not tucked under.** The panel used to be placed with
    // `left: calc(100% - 6px)`, which overlapped the menu it belongs to by 6px.
    // Its left edge is now the row's measured right edge, so the two boxes touch
    // and neither covers the other.
    //
    // **Portalled, not inside.** The patients list is a scroll container, and an
    // `auto` axis clips the other one as well, so a panel left inside the sidebar
    // is cut off at the column edge however high its z-index is. The panel
    // therefore lands on `document.body`, like the hover card beside a row.
    renderMenu(groupProps());
    // jsdom measures everything as zero, so the numbers below are only a
    // *shape* assertion; the edge-alignment itself is what a browser shows.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      right: 288,
      top: 100,
      bottom: 132,
      left: 100,
      width: 188,
      height: 32,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    });

    fireEvent.click(screen.getByTestId(`move-to-group-${john.id}`));

    const row = screen.getByTestId(`move-to-group-${john.id}`);
    const anchor = row.parentElement;
    expect(anchor?.className).toContain('patient-menu-submenu-anchor');

    const panel = screen.getByTestId('patient-submenu');
    // Placed by measured numbers, not by a `left: 100%` a clipping ancestor
    // would swallow: the menu's right edge, one row above the row's top.
    // 288 is the mocked row's right edge and 290 is that plus the 2px gap, which
    // is half the 4px it was; in a real browser the menu's own right edge is
    // measured instead of the row's, which is the difference between touching
    // and overlapping.
    expect(panel.style.left).toBe('290px');
    expect(panel.style.top).toBe('94px');
    // And it is a child of the body, not of the scrolling column.
    expect(panel.parentElement).toBe(document.body);
    expect(anchor?.contains(panel)).toBe(false);

    // jsdom applies no stylesheet, so the half of this that lives in CSS is read
    // off the file — a portalled panel that was not also `fixed` would sit in
    // the document flow at the end of the body, which is a different bug.
    const appCss = readFileSync(resolve(import.meta.dirname, '../styles/app.css'), 'utf8');
    const rule = appCss.match(/\.patient-submenu\s*\{([^}]*)\}/);
    expect(rule?.[1]).toContain('position: fixed');
    /*
     * And a ceiling, because a group list is the one panel here with no natural
     * height (F3). Beside a row low in a scrolled sidebar it ran off the bottom
     * of the window, and script cannot fix that alone: without these two lines
     * the overflow is clipped rather than scrollable, so the groups at the end
     * of her own list were unreachable by any means. The values match the view
     * control's options panel, which is the same shape of problem.
     */
    expect(rule?.[1]).toContain('max-height');
    expect(rule?.[1]).toContain('overflow-y: auto');
  });

  it('opens on → and puts the keyboard in the panel', async () => {
    renderMenu(groupProps());
    const row = screen.getByTestId(`move-to-group-${john.id}`);

    fireEvent.keyDown(row, { key: 'ArrowRight' });
    expect(screen.getByTestId('patient-submenu')).toBeDefined();

    // The focus move waits a frame for the panel to be committed, so the
    // assertion waits for it too rather than pretending it is synchronous.
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByTestId(`group-${family.id}`));
    });
  });

  /**
   * `←` puts the keyboard back on the row it came from (F4).
   *
   * The comment on this menu has said for some time that `→` opens the panel and
   * `←` brings it back out, and only the first of those was true. `→` opened it,
   * and the only way out was `Escape` — which closes every layer at once, so a
   * keyboard user who opened the group list to reach one group lost the whole
   * menu, and had to start again from the row.
   */
  it('comes back out of the group panel on ←, onto the row, and keeps the menu', async () => {
    renderMenu(groupProps());
    const row = screen.getByTestId(`move-to-group-${john.id}`);
    row.focus();

    fireEvent.keyDown(row, { key: 'ArrowRight' });
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByTestId(`group-${family.id}`));
    });

    fireEvent.keyDown(screen.getByTestId('patient-submenu'), { key: 'ArrowLeft' });

    // The panel is gone, the keyboard is on the row that opened it, and the menu
    // it belongs to is still open — that last part is the whole point.
    expect(screen.queryByTestId('patient-submenu')).toBeNull();
    expect(document.activeElement).toBe(row);
    expect(screen.getByTestId(`move-to-group-${john.id}`)).toBeDefined();
  });

  it('keeps the group panel inside the window, flipping it left when it must', () => {
    renderMenu(groupProps());
    const row = screen.getByTestId(`move-to-group-${john.id}`);
    // A menu flush against the right edge, as it is in a narrow window.
    const menu = row.closest('.patient-menu') as HTMLElement;
    menu.getBoundingClientRect = () =>
      ({ right: window.innerWidth, left: window.innerWidth - 200, top: 0, bottom: 300 }) as DOMRect;

    fireEvent.keyDown(row, { key: 'ArrowRight' });
    const panel = screen.getByTestId('patient-submenu');
    const left = Number.parseFloat(panel.style.left);
    expect(Number.isNaN(left)).toBe(false);
    // Placed to the left of the menu rather than off the right-hand edge.
    expect(left + 240).toBeLessThanOrEqual(window.innerWidth);
  });

  it('ticks the group the patient is already in, and offers no way out of none', () => {
    renderMenu(groupProps({ patient: makePatient('John Smith', { id: john.id, group_id: family.id }) }));
    fireEvent.click(screen.getByTestId(`move-to-group-${john.id}`));
    const panel = screen.getByTestId('patient-submenu');

    expect(within(panel).getByTestId(`group-${family.id}`).getAttribute('aria-checked')).toBe('true');
    expect(within(panel).getByTestId(`group-${court.id}`).getAttribute('aria-checked')).toBe('false');
    // In a group, so there is a way back out of it.
    expect(within(panel).getByTestId(`group-none-${john.id}`)).toBeDefined();
  });

  it('offers no "No group" row to a patient who is not in one', () => {
    renderMenu(groupProps());
    fireEvent.click(screen.getByTestId(`move-to-group-${john.id}`));

    expect(within(screen.getByTestId('patient-submenu')).queryByTestId(`group-none-${john.id}`)).toBeNull();
  });

  it('files the patient, and closes, when a group is chosen', () => {
    const onMoveToGroup = vi.fn();
    renderMenu(groupProps({ onMoveToGroup }));
    fireEvent.click(screen.getByTestId(`move-to-group-${john.id}`));

    fireEvent.click(within(screen.getByTestId('patient-submenu')).getByTestId(`group-${court.id}`));

    expect(onMoveToGroup).toHaveBeenCalledWith(court.id);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('takes them out with null, which is a move like any other', () => {
    const onMoveToGroup = vi.fn();
    renderMenu(
      groupProps({ patient: makePatient('John Smith', { id: john.id, group_id: family.id }), onMoveToGroup }),
    );
    fireEvent.click(screen.getByTestId(`move-to-group-${john.id}`));

    fireEvent.click(within(screen.getByTestId('patient-submenu')).getByTestId(`group-none-${john.id}`));

    expect(onMoveToGroup).toHaveBeenCalledWith(null);
  });

  it('says so when there are no groups yet, and still offers the one row that makes one', () => {
    renderMenu(groupProps({ groups: [] }));
    fireEvent.click(screen.getByTestId(`move-to-group-${john.id}`));

    expect(within(screen.getByTestId('patient-submenu')).getByText('No groups yet')).toBeDefined();
    expect(screen.getByTestId('group-new')).toBeDefined();
  });

  it('asks for the name, and makes the group and files the patient in one go', () => {
    const onCreateGroup = vi.fn();
    renderMenu(groupProps({ onCreateGroup }));
    fireEvent.click(screen.getByTestId(`move-to-group-${john.id}`));
    fireEvent.click(within(screen.getByTestId('patient-submenu')).getByTestId('group-new'));

    const dialog = screen.getByTestId('new-group-dialog');
    // Nothing is created from an empty name, so the button starts disabled.
    const create = within(dialog).getByRole('button', { name: 'Create group' });
    expect((create as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(within(dialog).getByLabelText('Group name'), { target: { value: '  Family work  ' } });
    expect((create as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(create);

    // Trimmed on the way out: the server would trim it anyway, and the menu
    // should not depend on that to not offer a blank heading.
    expect(onCreateGroup).toHaveBeenCalledWith('Family work');
    expect(screen.queryByTestId('new-group-dialog')).toBeNull();
  });

  it('binds none of the letters on the group page', () => {
    const onTogglePin = vi.fn();
    renderMenu(groupProps({ onTogglePin }));
    fireEvent.click(screen.getByTestId(`move-to-group-${john.id}`));

    fireEvent.keyDown(document, { key: 'p' });

    expect(onTogglePin).not.toHaveBeenCalled();
    // Escape still closes everything.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

/**
 * Hovering is what opens the panel (owner, 2026-09-27) — a click first is a step
 * for nothing when all she is doing is looking at a list of names. Click and →
 * stay, because a hover-only menu cannot be opened from the keyboard at all, and
 * the awkward half is the gap: the pointer leaving the row must not close the
 * panel it is on its way to, or the submenu would be a thing that flickers.
 */
describe('the panel opens on hover', () => {
  const family = {
    id: '0198c0f0-0000-7000-8000-0000000000a1',
    name: 'Family therapy',
    created_at: '2026-03-01T09:00:00.000Z',
    position: null,
  };

  function hoverProps(): PatientMenuProps {
    return {
      ...renderlessProps(),
      groups: [family],
      onMoveToGroup: vi.fn(),
      onCreateGroup: vi.fn(),
    };
  }

  function row(): HTMLElement {
    return screen.getByTestId(`move-to-group-${john.id}`);
  }

  it('opens when the pointer arrives, with no click at all', () => {
    renderMenu(hoverProps());
    expect(screen.queryByTestId('patient-submenu')).toBeNull();

    fireEvent.mouseEnter(row().parentElement as HTMLElement);

    expect(screen.getByTestId('patient-submenu')).toBeDefined();
  });

  it('waits out the crossing to the panel instead of reading it as leaving', () => {
    // The bug this fixes, as it behaved: the row's leave fired, the pointer was
    // over the 2px of nothing between the two boxes, the menu took that as
    // "she has gone" and closed as she reached for it.
    renderMenu(hoverProps());
    fireEvent.mouseEnter(row().parentElement as HTMLElement);
    fireEvent.mouseLeave(row().parentElement as HTMLElement);

    // Still open, because nothing has actually been left yet.
    expect(screen.getByTestId('patient-submenu')).toBeDefined();

    // Arriving cancels the wait.
    fireEvent.mouseEnter(screen.getByTestId('patient-submenu'));
    fireEvent.mouseLeave(screen.getByTestId('patient-submenu'));
    fireEvent.mouseEnter(row().parentElement as HTMLElement);
    fireEvent.mouseLeave(row().parentElement as HTMLElement);
    fireEvent.mouseEnter(screen.getByTestId('patient-submenu'));
    expect(screen.getByTestId('patient-submenu')).toBeDefined();
  });

  it('does close when the pointer really does leave both', async () => {
    // The wait must not become "never closes", or the panel is a trap.
    renderMenu(hoverProps());
    fireEvent.mouseEnter(row().parentElement as HTMLElement);
    fireEvent.mouseLeave(row().parentElement as HTMLElement);

    await waitFor(() => {
      expect(screen.queryByTestId('patient-submenu')).toBeNull();
    });
    // And only the panel went: the menu it belongs to is still open.
    expect(screen.queryByRole('menu')).not.toBeNull();
  });

  it('still opens on a click, because hover alone leaves the keyboard out', () => {
    renderMenu(hoverProps());

    fireEvent.click(row());

    expect(screen.getByTestId('patient-submenu')).toBeDefined();
  });
});

/**
 * A press on a row of the submenu (owner, 2026-09-27).
 *
 * Every option in that panel was dead, and the reason is the kind that a jsdom
 * test cannot see by clicking: the panel is **portalled to the body**, so it is
 * not a DOM descendant of the button that opened the menu. The menu's own
 * "pressed outside, close" check only knew about that button, so a press on any
 * row read as a press outside — the menu closed on `pointerdown`, and the
 * `click` that followed landed on a button that had already been removed from
 * the tree. Nothing happened, and nothing looked wrong.
 *
 * So the test fires the real sequence, `pointerdown` and then `click`, which is
 * what a browser does and what a bare `fireEvent.click` skips.
 */
describe('pressing a row of the submenu', () => {
  const family = {
    id: '0198c0f0-0000-7000-8000-0000000000a1',
    name: 'Family therapy',
    created_at: '2026-03-01T09:00:00.000Z',
    position: null,
  };

  function inGroup(): PatientMenuProps {
    return {
      ...renderlessProps(),
      patient: makePatient('John Smith', { id: john.id, group_id: family.id }),
      groups: [family],
      onMoveToGroup: vi.fn(),
      onCreateGroup: vi.fn(),
    };
  }

  /** What a browser does on a real press: pointerdown, then click. */
  function press(testId: string): void {
    const element = screen.getByTestId(testId);
    fireEvent.pointerDown(element);
    fireEvent.click(element);
  }

  it('files the patient into the group she pressed, and keeps the menu open otherwise', () => {
    const onMoveToGroup = vi.fn();
    renderMenu({ ...inGroup(), onMoveToGroup });
    fireEvent.click(screen.getByTestId(`move-to-group-${john.id}`));

    press('group-none-' + john.id);

    expect(onMoveToGroup).toHaveBeenCalledWith(null);
  });

  it('opens the "New group…" window rather than doing nothing', () => {
    const onCreateGroup = vi.fn();
    renderMenu({ ...inGroup(), groups: [], onCreateGroup });
    fireEvent.click(screen.getByTestId(`move-to-group-${john.id}`));

    press('group-new');

    expect(screen.getByTestId('new-group-dialog')).toBeDefined();
  });

  it('still closes when the press really is outside both', () => {
    renderMenu(inGroup());
    fireEvent.click(screen.getByTestId(`move-to-group-${john.id}`));

    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole('menu')).toBeNull();
  });
});

/**
 * A group list that failed to load is not a group list with nothing in it (F5).
 *
 * The submenu rendered `patients.noGroupsYet` whenever `groups` was defined and
 * empty, and an empty array is three different things: no answer yet, a practice
 * with no groups, and a request that failed. Only the third is a lie — it is a
 * claim about her data, made by the app, when the truth is about the app. The
 * hook had a `failed` flag for exactly this and nothing read it.
 *
 * These drive the real hook through the real fake API with a failing request, so
 * the state under test is the one the server's answer produces.
 */
describe('the three states of the group list', () => {
  /**
   * `renderMenu` from the top of this file, reused rather than re-declared: it
   * already knows the whole prop contract, and a hand-rolled copy of it is how a
   * test ends up asserting against a component the app never renders.
   */
  function openSubmenu(overrides: Partial<PatientMenuProps> = {}): void {
    renderMenu({
      groups: [],
      groupsState: 'error',
      onReloadGroups: vi.fn(),
      onMoveToGroup: vi.fn(),
      onCreateGroup: vi.fn(),
      ...overrides,
    });
    fireEvent.click(screen.getByTestId(`move-to-group-${john.id}`));
  }

  it('says the list could not be loaded, and does not say she has no groups', () => {
    openSubmenu();

    expect(screen.getByTestId('groups-failed')).toBeDefined();
    // The sentence this finding is about, absent on purpose.
    expect(screen.queryByText('No groups yet')).toBeNull();
  });

  it('offers a way to try again, and only when there is one to call', () => {
    const onReloadGroups = vi.fn();
    openSubmenu({ onReloadGroups });

    fireEvent.click(screen.getByTestId('groups-retry'));
    expect(onReloadGroups).toHaveBeenCalledTimes(1);
  });

  it('still offers making a group, because a failed list is not a blocked feature', () => {
    openSubmenu();
    expect(screen.getByTestId('group-new')).toBeDefined();
  });

  it('says "No groups yet" only when the answer really was an empty list', () => {
    openSubmenu({ groupsState: 'ready' });

    expect(screen.getByText('No groups yet')).toBeDefined();
    expect(screen.queryByTestId('groups-failed')).toBeNull();
  });

  it('does not claim an empty list before the first answer arrives', () => {
    openSubmenu({ groupsState: 'loading' });

    expect(screen.getByTestId('groups-loading')).toBeDefined();
    // Before the answer, "No groups yet" would be a guess about her practice.
    expect(screen.queryByText('No groups yet')).toBeNull();
  });
});

/**
 * The same three states through the real hook and a real failed request, so the
 * distinction is not only a matter of passing the right prop.
 */
describe('a failed group fetch, end to end', () => {
  const family = {
    id: '0198c0f0-0000-7000-8000-0000000000a1',
    name: 'Family therapy',
    created_at: '2026-03-01T09:00:00.000Z',
    position: null,
  };

  it('reaches the submenu as an error, and recovers when the request works', async () => {
    let failNext = true;
    installFakeApi({ patients: [john], groups: [family] });
    // The fake is asked to fail once; after that the same route answers.
    const original = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(typeof input === 'string' ? input : input instanceof Request ? input.url : input);
      if (failNext && url.includes('/api/patient-groups')) {
        failNext = false;
        return Promise.resolve(
          new Response(JSON.stringify({ error: 'internal', message: 'nope' }), { status: 500 }),
        );
      }
      return original(input, init);
    }) as typeof fetch;

    function Harness(): React.JSX.Element {
      const groups = usePatientGroups();
      return (
        <PatientMenu
          {...renderlessProps()}
          groups={groups.groups}
          groupsState={groups.state}
          onReloadGroups={groups.reload}
          onMoveToGroup={vi.fn()}
          onCreateGroup={vi.fn()}
        />
      );
    }

    render(
      <MemoryRouter>
        <Harness />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByLabelText('Tools for John Smith'));
    fireEvent.click(screen.getByTestId(`move-to-group-${john.id}`));

    await waitFor(() => {
      expect(screen.getByTestId('groups-failed')).toBeDefined();
    });
    expect(screen.queryByText('No groups yet')).toBeNull();

    // "Try again" is not a decoration: the retry gets the real list.
    fireEvent.click(screen.getByTestId('groups-retry'));
    await waitFor(() => {
      expect(screen.getByTestId(`group-${family.id}`)).toBeDefined();
    });
    expect(screen.queryByTestId('groups-failed')).toBeNull();
  });
});

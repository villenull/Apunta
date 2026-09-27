import type { PatientGroup, PatientListItem } from '@apunta/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { PatientGroupsState } from '../hooks/usePatientGroups.js';
import { useI18n } from '../lib/i18n.js';
import { Dialog } from './Dialog.js';
import {
  ArchiveIcon,
  CheckIcon,
  ChevronRightIcon,
  FolderIcon,
  MoreIcon,
  MoreVerticalIcon,
  PencilIcon,
  PinIcon,
  PlusIcon,
  TrashIcon,
} from './icons.js';

/** How long the row's leave waits for the pointer to reach the panel beside it. */
const CROSSING_GRACE_MS = 180;

export interface PatientMenuProps {
  patient: PatientListItem;
  /** Archived patients offer Restore and, as the red item, Delete. */
  archived: boolean;
  /** Pinned to the top of the sidebar, in its own "Pinned" group. */
  pinned: boolean;
  onTogglePin: () => void;
  onRename: () => void;
  /** Archived → restore into the working list. */
  onSetArchived: (archived: boolean) => void;
  onDelete: () => void;
  /**
   * The named lists this patient can be filed under, in creation order. Empty is
   * a real state rather than a loading one: the submenu says so, and offers the
   * one row that makes a group. Omitted entirely — as in the tests that only
   * care about pinning — and the row is not there at all.
   */
  groups?: readonly PatientGroup[] | undefined;
  /**
   * Which of the three states the group list is in (F5). Optional and defaulting
   * to `ready`, because a caller that passes a plain array has, by construction,
   * got an answer — the state exists for the caller that fetched it and knows
   * whether the fetch worked.
   */
  groupsState?: PatientGroupsState | undefined;
  /** Fetch the groups again, after a failure. */
  onReloadGroups?: (() => void) | undefined;
  /** File under `groupId`, or `null` to take them out of their group. */
  onMoveToGroup?: ((groupId: string | null) => void) | undefined;
  /** Make a group and file them under it in one go. */
  onCreateGroup?: ((name: string) => void) | undefined;
  /**
   * The same patient has two menus on screen at once once "View all" is open —
   * the sidebar's and the page's. `directory` names the second one differently,
   * so a screen reader never hears two identical buttons.
   */
  scope?: 'sidebar' | 'directory';
  /**
   * "Select", at the top of the menu with a rule under it, as on Claude's
   * Recents page. Only the "View all" page passes it.
   */
  onSelectMode?: () => void;
}

/**
 * The "⋯" on a patient row, after claude.ai's (AM-047): Pin, Rename, Move to
 * group, then a separator, then the one red destructive item — Archive for a
 * working patient, Delete for an archived one. "Add to project" is deliberately
 * absent; there is no such thing in Apunta, and the group list is what fills
 * the row Claude gives it.
 *
 * Each row carries its shortcut on the right, as Claude's do, and the shortcuts
 * work while the menu is open: P pins, R renames, D archives or deletes. They
 * are letters rather than a modifier chord because the menu is a short-lived
 * thing over a short-lived list — a chord would be quicker and less
 * discoverable, and she reads the row before she presses anything.
 *
 * **The group's list opens to the right, as a second panel** (owner,
 * 2026-09-27). It is anchored to the "Move to group" row rather than to the
 * menu, so it sits level with the row that opened it no matter what else is in
 * the menu — the "Select" row on the View all page, the Restore row on an
 * archived patient — instead of at a hard-coded offset that would drift the
 * moment a row was added. The parent menu stays put and stays readable behind
 * it, which is what makes it a submenu rather than a page turn.
 *
 * Escape closes everything; → opens the panel and puts the keyboard in it, and
 * ← brings it back out, as a menu that only opens on a click would not be one.
 *
 * Shared by the sidebar and the "View all" page so the two cannot drift. On the
 * page it takes Claude's Recents shape (owner, 2026-09-26): upright dots,
 * and "Select" above the rest.
 */
export function PatientMenu({
  patient,
  archived,
  pinned,
  onTogglePin,
  onRename,
  onSetArchived,
  onDelete,
  groups,
  groupsState = 'ready',
  onReloadGroups,
  onMoveToGroup,
  onCreateGroup,
  scope = 'sidebar',
  onSelectMode,
}: PatientMenuProps): React.JSX.Element {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  /** The menu's second page. Cleared whenever the menu closes. */
  const [choosingGroup, setChoosingGroup] = useState(false);
  /** The "New group…" dialog — the only way to make a group. */
  const [naming, setNaming] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  /**
   * Where the panel goes, in viewport pixels: flush against the menu's own right
   * edge, level with the row that opened it.
   */
  const [submenuAt, setSubmenuAt] = useState<{ left: number; top: number } | null>(null);
  const canGroup = onMoveToGroup !== undefined;
  /**
   * The pointer's crossing from the row to the panel, which is a strip of
   * nothing between two things she is treating as one control.
   *
   * It used to be a flag: the row's leave checked whether the pointer was
   * already over the panel, and if not, closed. Which is wrong the moment there
   * is any gap at all — the pointer is briefly over *neither*, so the menu read
   * that as "she has gone" and took itself off the screen as she reached for
   * it. So the leave now **waits**: a short grace period, cancelled the moment
   * the panel is entered. The panel is 2px away; nothing that reads as a human
   * hesitation is that short.
   */
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function cancelPendingClose(): void {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function closeSoon(): void {
    cancelPendingClose();
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      setChoosingGroup(false);
      setSubmenuAt(null);
    }, CROSSING_GRACE_MS);
  }

  useEffect(() => cancelPendingClose, []);

  /**
   * Measure the row and open the panel against it.
   *
   * The panel is **portalled to the body**, which is not decoration. The
   * patients list is a scroll container (`.col-body` is `overflow-y: auto`), and
   * an `auto` axis makes the other one clip as well — so a panel placed inside
   * it is cut off at the sidebar's right edge no matter how high its z-index
   * goes, because clipping beats stacking. The same reason the hover card beside
   * a row is portalled. The hover card and this panel are the only two things in
   * the app that have to leave the column.
   */
  const openSubmenu = useCallback((): void => {
    const row = anchorRef.current?.getBoundingClientRect();
    if (row === undefined) return;
    /*
     * `left` comes from the **menu's** right edge, not the row's. The row is a
     * block inside a padded flex column, so it ends a padding step short of the
     * menu's own edge — measuring it put the panel that far *inside* the menu it
     * belongs to, which read as the two overlapping. `top` still comes from the
     * row, because level-with-the-row is the row's own property.
     *
     * The 3px is the gap between them, and it is deliberate: two boxes flush
     * against each other read as one.
     */
    const menu = anchorRef.current?.closest('.patient-menu')?.getBoundingClientRect();
    const anchorRight = (menu ?? row).right;
    /*
     * Clamped and flipped, because a group list is the one panel in the app with
     * no ceiling on its height: a dozen groups beside a row low in a scrolled
     * sidebar ran off the bottom of the window, and the groups at the end of it
     * could not be reached or scrolled to. It opens to the right of the menu
     * where there is room and to its left where there is not, and its top is
     * never below the window's.
     *
     * The height is measured after the fact by the effect below, which is the
     * only place the rendered size exists; this placement is what it starts from.
     */
    const width = 240;
    const room = window.innerWidth - (anchorRight + 2);
    const left = room >= width ? anchorRight + 2 : Math.max(8, (menu ?? row).left - width - 2);
    setSubmenuAt({ left, top: Math.max(8, row.top - 6) });
    setChoosingGroup(true);
  }, []);

  /**
   * → puts the keyboard in the panel. Keyed on the panel being open rather than
   * done inside the key handler, because the panel is not in the tree until the
   * state has been committed — focusing it from the handler would be focusing
   * nothing.
   */
  useEffect(() => {
    if (!choosingGroup) return;
    submenuRef.current?.querySelector<HTMLElement>('button:not([disabled])')?.focus();
  }, [choosingGroup]);

  /**
   * A panel measured once and then left behind is worse than no panel: the list
   * can scroll, the window can resize, and the panel is in neither. Both close
   * the menu, which is also what the pointer would do.
   */
  useEffect(() => {
    if (!choosingGroup) return undefined;
    function onMoved(): void {
      close();
    }
    window.addEventListener('scroll', onMoved, true);
    window.addEventListener('resize', onMoved);
    return () => {
      window.removeEventListener('scroll', onMoved, true);
      window.removeEventListener('resize', onMoved);
    };
  }, [choosingGroup]);

  /**
   * Put the keyboard back on the row that opened the group's panel, then close
   * it — the `←` the comment on this menu has always claimed.
   *
   * It is the only way back for a keyboard: without it, the panel opened with
   * `→` could only be left with `Escape`, which closed the whole menu and threw
   * away the list she was reading to reach another section of it.
   */
  function closeSubmenuToRow(): void {
    setChoosingGroup(false);
    setSubmenuAt(null);
    cancelPendingClose();
    // The **button inside** the anchor, not the anchor: that is a `role="none"`
    // wrapper div, which is not focusable, so focusing it would leave the
    // keyboard on the body — the same place it was before `←` existed.
    const row = anchorRef.current?.querySelector<HTMLButtonElement>('button');
    (row ?? anchorRef.current)?.focus();
  }

  /** Close every layer at once: the menu, its second page and the dialog. */
  function close(): void {
    setOpen(false);
    setChoosingGroup(false);
    setSubmenuAt(null);
    setNaming(false);
    setNewGroupName('');
  }

  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(event: PointerEvent): void {
      const target = event.target as Node;
      /*
       * Both halves of the menu count as inside it, and the second half is the
       * one that matters: the group's panel is **portalled to the body** (it has
       * to be, or the sidebar's scroll container clips it), so it is a React
       * child of this component and **not a DOM descendant** of `ref`.
       *
       * With only `ref` checked, a press on any row of that panel read as a
       * press outside the menu: the menu closed on `pointerdown`, the `click`
       * that followed landed on a button that was no longer there, and the row
       * did nothing at all. Every option in the submenu was dead — "No group"
       * and "New group…" were just the two she tried. `pointerdown` runs before
       * `click`, which is why closing on it looked like the press being eaten
       * rather than like a race.
       */
      if (ref.current?.contains(target) === true) return;
      if (submenuRef.current?.contains(target) === true) return;
      close();
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        close();
        return;
      }
      // The hints are part of the menu, so the keys they name are real — but
      // only while it is open, and never while she is typing a name into the
      // rename field that is about to replace the menu. The group's own page
      // binds none of them: a list of names is not something a stray keystroke
      // should act on.
      if (choosingGroup) return;
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"]')) return;
      if (event.key === 'p' || event.key === 'P') {
        event.preventDefault();
        close();
        onTogglePin();
      } else if (event.key === 'r' || event.key === 'R') {
        event.preventDefault();
        close();
        onRename();
      } else if (event.key === 'd' || event.key === 'D') {
        event.preventDefault();
        close();
        if (archived) onDelete();
        else onSetArchived(true);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, archived, choosingGroup, onTogglePin, onRename, onSetArchived, onDelete]);

  function choose(action: () => void): () => void {
    return () => {
      close();
      action();
    };
  }

  /** The key a row's action is on, shown on the row's right. */
  function hint(key: string): React.JSX.Element {
    return (
      <span className="patient-menu-hint" aria-hidden="true">
        {key}
      </span>
    );
  }

  /** The second page: her groups, the way out of one, and the way to make one. */
  function renderGroupList(): React.JSX.Element {
    const current = patient.group_id ?? null;
    return (
      <>
        {/*
         * Three states, three sentences (F5). Before this, an empty array was
         * read as "No groups yet" — which is true before the first answer
         * arrives and true for a practice with no groups, and **false** when the
         * request failed, which is the one case where she is entitled to be
         * told. A failed load gets its own line and a way to try again; it is
         * still not a toast, because the rest of the app works without it.
         */}
        {groups !== undefined && groupsState === 'loading' && groups.length === 0 && (
          <div className="patient-menu-note" data-testid="groups-loading">
            {t('patients.groupsLoading')}
          </div>
        )}
        {groups !== undefined && groupsState === 'error' && (
          <div className="patient-menu-note" data-testid="groups-failed">
            {t('patients.groupsFailed')}
            {onReloadGroups !== undefined && (
              <button
                type="button"
                className="patient-menu-item patient-menu-retry"
                data-testid="groups-retry"
                onClick={() => {
                  onReloadGroups();
                }}
              >
                {t('common.tryAgain')}
              </button>
            )}
          </div>
        )}
        {groups !== undefined && groupsState === 'ready' && groups.length === 0 && (
          <div className="patient-menu-note">{t('patients.noGroupsYet')}</div>
        )}
        {(groups ?? []).map((group) => {
          const here = group.id === current;
          return (
            <button
              key={group.id}
              type="button"
              role="menuitemradio"
              aria-checked={here}
              className="patient-menu-item"
              data-testid={`group-${group.id}`}
              onClick={choose(() => {
                onMoveToGroup?.(group.id);
              })}
            >
              {here ? <CheckIcon className="icon icon-sm" /> : <FolderIcon className="icon icon-sm" />}
              {group.name}
            </button>
          );
        })}
        {current !== null && (
          <button
            type="button"
            role="menuitem"
            className="patient-menu-item"
            data-testid={`group-none-${patient.id}`}
            onClick={choose(() => {
              onMoveToGroup?.(null);
            })}
          >
            <FolderIcon className="icon icon-sm" />
            {t('patients.noGroup')}
          </button>
        )}
        {onCreateGroup !== undefined && (
          <>
            <div className="patient-menu-sep" role="separator" />
            <button
              type="button"
              role="menuitem"
              className="patient-menu-item"
              data-testid="group-new"
              onClick={() => {
                // The panel's job is finished; leaving it open would float it
                // over the window that is opening on top of it.
                setChoosingGroup(false);
                setSubmenuAt(null);
                setNaming(true);
              }}
            >
              <PlusIcon className="icon icon-sm" />
              {t('patients.newGroup')}
            </button>
          </>
        )}
      </>
    );
  }

  return (
    <div ref={ref} className={open ? 'patient-entry-actions is-open' : 'patient-entry-actions'}>
      <button
        type="button"
        className="icon-btn patient-menu-btn"
        aria-label={
          scope === 'directory' ? `Tools for ${patient.name}, all patients` : `Tools for ${patient.name}`
        }
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid={scope === 'directory' ? `patient-menu-all-${patient.id}` : `patient-menu-${patient.id}`}
        onClick={() => {
          setOpen((was) => !was);
          setChoosingGroup(false);
        }}
      >
        {scope === 'directory' ? (
          <MoreVerticalIcon className="icon icon-sm" />
        ) : (
          <MoreIcon className="icon icon-sm" />
        )}
      </button>
      {open && (
        <div className="patient-menu" role="menu">
          <>
            {onSelectMode !== undefined && (
              <>
                <button
                  type="button"
                  role="menuitem"
                  className="patient-menu-item"
                  data-testid={`select-${patient.id}`}
                  onClick={choose(onSelectMode)}
                >
                  <CheckIcon className="icon icon-sm" />
                  {t('directory.select')}
                </button>
                <div className="patient-menu-sep" role="separator" />
              </>
            )}
            <button
              type="button"
              role="menuitem"
              className="patient-menu-item"
              data-testid={`pin-${patient.id}`}
              onClick={choose(onTogglePin)}
            >
              <PinIcon className="icon icon-sm" />
              {pinned ? t('patients.unpin') : t('patients.pin')}
              {hint('P')}
            </button>
            <button
              type="button"
              role="menuitem"
              className="patient-menu-item"
              aria-label={t('patients.renameAction', { name: patient.name })}
              data-testid={`rename-${patient.id}`}
              onClick={choose(onRename)}
            >
              <PencilIcon className="icon icon-sm" />
              {t('patients.renameShort')}
              {hint('R')}
            </button>
            {canGroup && (
              /*
               * The row is wrapped rather than the panel being positioned
               * against the menu, so "level with the row that opened it" is a
               * fact about the DOM and not an offset that goes stale. `none`
               * keeps the wrapper out of the menu's own structure, so the rows
               * inside it are still the menu's children as far as a screen
               * reader is concerned.
               */
              <div
                className="patient-menu-submenu-anchor"
                ref={anchorRef}
                role="none"
                /*
                 * Hover opens it (owner, 2026-09-27): the panel is a list she is
                 * reaching for, and making her click once to start looking is a
                 * step for nothing. Click and → still work, because a hover-only
                 * menu cannot be opened from the keyboard at all.
                 */
                onMouseEnter={() => {
                  if (!choosingGroup) openSubmenu();
                }}
                onMouseLeave={() => {
                  // Not `close()`: see the note on `closeSoon`. The pointer is
                  // two pixels from the panel and this is not "she has gone".
                  closeSoon();
                }}
              >
                <button
                  type="button"
                  role="menuitem"
                  aria-haspopup="menu"
                  aria-expanded={choosingGroup}
                  className="patient-menu-item"
                  data-testid={`move-to-group-${patient.id}`}
                  onClick={() => {
                    openSubmenu();
                  }}
                  onKeyDown={(event) => {
                    // → opens the panel; the effect below walks the keyboard
                    // into it, so the submenu is not a click-only thing.
                    if (event.key !== 'ArrowRight') return;
                    event.preventDefault();
                    openSubmenu();
                  }}
                >
                  <FolderIcon className="icon icon-sm" />
                  {t('patients.moveToGroup')}
                  <ChevronRightIcon className="icon icon-sm patient-menu-chevron" />
                </button>
                {choosingGroup &&
                  submenuAt !== null &&
                  createPortal(
                    <div
                      ref={submenuRef}
                      className="patient-menu patient-submenu"
                      role="menu"
                      aria-label={t('patients.moveToGroupLabel')}
                      data-testid="patient-submenu"
                      onMouseEnter={cancelPendingClose}
                      onMouseLeave={closeSoon}
                      onKeyDown={(event) => {
                        if (event.key !== 'ArrowLeft') return;
                        event.preventDefault();
                        event.stopPropagation();
                        closeSubmenuToRow();
                      }}
                      style={{
                        left: `${String(Math.round(submenuAt.left))}px`,
                        top: `${String(Math.round(submenuAt.top))}px`,
                      }}
                    >
                      {renderGroupList()}
                    </div>,
                    document.body,
                  )}
              </div>
            )}
            {archived && (
              <button
                type="button"
                role="menuitem"
                className="patient-menu-item"
                data-testid={`archive-${patient.id}`}
                onClick={choose(() => {
                  onSetArchived(false);
                })}
              >
                <ArchiveIcon className="icon icon-sm" />
                {t('patients.restore')}
              </button>
            )}
            <div className="patient-menu-sep" role="separator" />
            {archived ? (
              <button
                type="button"
                role="menuitem"
                className="patient-menu-item is-danger"
                aria-label={`Delete ${patient.name}`}
                data-testid={`delete-${patient.id}`}
                onClick={choose(onDelete)}
              >
                <TrashIcon className="icon icon-sm" />
                {t('patients.delete')}
                {hint('D')}
              </button>
            ) : (
              <button
                type="button"
                role="menuitem"
                className="patient-menu-item is-danger"
                aria-label={`Archive ${patient.name}`}
                data-testid={`archive-${patient.id}`}
                onClick={choose(() => {
                  onSetArchived(true);
                })}
              >
                <ArchiveIcon className="icon icon-sm" />
                {t('common.archive')}
                {hint('D')}
              </button>
            )}
          </>
        </div>
      )}
      {naming && (
        <Dialog
          title={t('patients.newGroup')}
          onClose={close}
          showTitle={false}
          className="modal card add-patient-modal"
          testId="new-group-dialog"
          backdropTestId="new-group-backdrop"
        >
          <div className="add-patient-head">
            <h2 className="heading-tight">{t('patients.newGroup')}</h2>
          </div>
          <form
            data-testid="new-group-form"
            onSubmit={(event) => {
              event.preventDefault();
              const name = newGroupName.trim();
              if (name === '') return;
              close();
              onCreateGroup?.(name);
            }}
          >
            <div className="field field-last">
              <label className="label" htmlFor="group-name">
                {t('patients.groupName')}
              </label>
              {/* The only field in the window, and she opened it to type a
                  name — the same reason `AddPatient` autofocuses its own. */}
              <input
                id="group-name"
                type="text"
                placeholder={t('patients.groupNamePlaceholder')}
                value={newGroupName}
                onChange={(event) => {
                  setNewGroupName(event.target.value);
                }}
                autoFocus
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary btn-block form-actions"
              disabled={newGroupName.trim().length === 0}
            >
              {t('patients.createGroup')}
            </button>
          </form>
        </Dialog>
      )}
    </div>
  );
}

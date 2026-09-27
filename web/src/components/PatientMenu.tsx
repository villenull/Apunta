import type { PatientListItem } from '@apunta/shared';
import { useEffect, useRef, useState } from 'react';

import { useI18n } from '../lib/i18n.js';
import {
  ArchiveIcon,
  CheckIcon,
  MoreIcon,
  MoreVerticalIcon,
  PencilIcon,
  PinIcon,
  TrashIcon,
} from './icons.js';

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
 * The "⋯" on a patient row, after claude.ai's (AM-047): Pin, Rename, then a
 * separator, then the one red destructive item — Archive for a working
 * patient, Delete for an archived one. "Add to project" is deliberately
 * absent; there is no such thing in Apunta.
 *
 * Each row carries its shortcut on the right, as Claude's do, and the shortcuts
 * work while the menu is open: P pins, R renames, D archives or deletes. They
 * are letters rather than a modifier chord because the menu is a short-lived
 * thing over a short-lived list — a chord would be quicker and less
 * discoverable, and she reads the row before she presses anything.
 *
 * Shared by the sidebar and the "View all" page so the two cannot drift. On
 * the page it takes Claude's Recents shape (owner, 2026-09-26): upright dots,
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
  scope = 'sidebar',
  onSelectMode,
}: PatientMenuProps): React.JSX.Element {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(event: PointerEvent): void {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }
      // The hints are part of the menu, so the keys they name are real — but
      // only while it is open, and never while she is typing a name into the
      // rename field that is about to replace the menu.
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"]')) return;
      if (event.key === 'p' || event.key === 'P') {
        event.preventDefault();
        setOpen(false);
        onTogglePin();
      } else if (event.key === 'r' || event.key === 'R') {
        event.preventDefault();
        setOpen(false);
        onRename();
      } else if (event.key === 'd' || event.key === 'D') {
        event.preventDefault();
        setOpen(false);
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
  }, [open, archived, onTogglePin, onRename, onSetArchived, onDelete]);

  function choose(action: () => void): () => void {
    return () => {
      setOpen(false);
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
        </div>
      )}
    </div>
  );
}

import type { PatientListItem } from '@apunta/shared';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router';

import type { RecencyMap } from '../hooks/usePatientRecency.js';
import type { LoadState } from '../hooks/useLoader.js';
import { formatShortDate } from '../lib/format.js';
import { useI18n, type Translate } from '../lib/i18n.js';
import { pinnedIndex } from '../lib/patientOrder.js';
import { readSidebarSort, writeSidebarSort, type SidebarSort } from '../lib/patientPins.js';
import { BrandWordmark } from './BrandWordmark.js';
import {
  CheckIcon,
  GearIcon,
  GlobeIcon,
  HelpIcon,
  PanelLeftIcon,
  PinIcon,
  PlusIcon,
  SearchIcon,
  SortIcon,
} from './icons.js';
import { PatientMenu } from './PatientMenu.js';
import { PatientRenameField } from './PatientRenameField.js';

/**
 * How many unpinned patients the sidebar shows before the "View all" row — the
 * count Claude's own sidebar fits, and short enough that a practice with
 * hundreds of patients still opens on a scannable list.
 */
const VISIBLE_PATIENTS = 13;

export interface PatientsColumnProps {
  patients: LoadState<PatientListItem[]>;
  /** The same rows in sidebar order: pinned first, then by last note edit. */
  ordered: PatientListItem[];
  activePatientId: string | null;
  /** When each patient's last note was edited, for the tooltip and the order. */
  recency: RecencyMap;
  /** Pinned ids, top of the list first. */
  pinnedIds: readonly string[];
  onSelect: (patientId: string) => void;
  onRetry: () => void;
  onSetArchived: (patient: PatientListItem, archived: boolean) => void;
  /**
   * Save a new name. Imported names may be misspelt; saving also clears the
   * import's `name_guessed` flag, which the list no longer shows.
   */
  onRename: (patient: PatientListItem, name: string) => void;
  /** Ask to delete the patient; the workspace confirms before anything goes. */
  onDelete: (patient: PatientListItem) => void;
  onTogglePin: (patientId: string) => void;
  /** Move a pinned row within the pinned group. */
  onReorderPins: (from: number, to: number) => void;
  /** "View all": the full Active / Archived page. */
  onOpenAll: () => void;
  onToggleCollapsed: () => void;
  collapsed: boolean;
  /** Mission control → Settings, opened as a modal over the workspace. */
  onOpenSettings: () => void;
  /**
   * Mission control → the two rows this preview does not build yet.
   *
   * `what` is the control's own label, already in the active locale: the caller
   * passes `t(…)` rather than a string, so a Spanish toast names the control in
   * Spanish.
   */
  onUnavailable: (what: string) => void;
  /** The drag-to-resize edge, drawn on the column's right border. */
  edge?: React.ReactNode;
}

/**
 * The patients sidebar in the owner's Claude-flavoured preview (2026-09-26):
 * a panel toggle, the wordmark, one search field, and a compact list of names
 * with a "⋯" menu each — no avatars, no sub-line, no archived checkbox.
 */
export function PatientsColumn({
  patients,
  ordered,
  activePatientId,
  recency,
  pinnedIds,
  onSelect,
  onRetry,
  onSetArchived,
  onRename,
  onDelete,
  onTogglePin,
  onReorderPins,
  onOpenAll,
  onToggleCollapsed,
  collapsed,
  onOpenSettings,
  onUnavailable,
  edge,
}: PatientsColumnProps): React.JSX.Element {
  const { t } = useI18n();
  const [query, setQuery] = useState('');

  return (
    <div className="col col-patients">
      <div className="col-header col-header-brand">
        {/* The panel toggle sits to the LEFT of the wordmark, as in Claude: it
            is the first thing her eye lands on and the only way back once the
            column is gone. */}
        <button
          type="button"
          className="icon-btn panel-toggle"
          aria-label={collapsed ? t('patients.showColumn') : t('patients.hideColumn')}
          aria-expanded={!collapsed}
          data-testid="sidebar-toggle"
          onClick={onToggleCollapsed}
        >
          <PanelLeftIcon className="icon icon-sm" />
        </button>
        <Link to="/" className="brand brand-link" data-testid="home-link">
          {/* The Fraunces wordmark in the brand's teal, both themes (owner,
              2026-09-26). Its height is the `--logo-h` token, the same one the
              standalone screens use. */}
          <BrandWordmark />
        </Link>
      </div>

      <div className="col-search">
        <span className="col-search-icon" aria-hidden="true">
          <SearchIcon className="icon icon-sm" />
        </span>
        <input
          type="text"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          placeholder={t('common.search')}
          data-testid="patient-search"
          aria-label={t('common.searchPatients')}
        />
      </div>

      <div className="col-body" data-testid="patient-list">
        {/* "New patient", with the plus in a filled circle, as Claude's "New"
            (owner, 2026-09-26). */}
        <Link to="/patients/new" className="list-item project-row new-patient-item" data-testid="new-patient">
          <span className="new-patient-icon" aria-hidden="true">
            <PlusIcon className="icon" />
          </span>
          <div className="name">{t('patients.new')}</div>
        </Link>
        <PatientList
          patients={patients}
          ordered={ordered}
          query={query}
          activePatientId={activePatientId}
          recency={recency}
          pinnedIds={pinnedIds}
          onSelect={onSelect}
          onRetry={onRetry}
          onClearSearch={() => {
            setQuery('');
          }}
          onSetArchived={onSetArchived}
          onRename={onRename}
          onDelete={onDelete}
          onTogglePin={onTogglePin}
          onReorderPins={onReorderPins}
          onOpenAll={onOpenAll}
        />
      </div>

      <MissionControl t={t} onOpenSettings={onOpenSettings} onUnavailable={onUnavailable} />
      {edge}
    </div>
  );
}

/** Closes a small menu on a click outside it or on Escape. */
function useDismiss(open: boolean, setOpen: (open: boolean) => void): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(event: PointerEvent): void {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, setOpen]);
  return ref;
}

/**
 * "Mission control", where Settings, Language and Get help live. `compact` is
 * the collapsed rail's version: the gear alone, its name on the button rather
 * than beside it, and the menu opening to the rail's right.
 */
export function MissionControl({
  t,
  onOpenSettings,
  onUnavailable,
  compact = false,
}: {
  t: Translate;
  onOpenSettings: () => void;
  onUnavailable: (what: string) => void;
  compact?: boolean;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, setOpen);

  function choose(action: () => void): () => void {
    return () => {
      setOpen(false);
      action();
    };
  }

  return (
    <div className={compact ? 'mission-control is-compact' : 'col-footer mission-control'} ref={ref}>
      <button
        type="button"
        className={compact ? 'rail-btn' : 'mission-control-btn'}
        aria-haspopup="menu"
        aria-expanded={open}
        {...(compact
          ? { 'aria-label': t('patients.missionControl'), title: t('patients.missionControl') }
          : {})}
        data-testid={compact ? 'rail-mission-control' : 'mission-control'}
        onClick={() => {
          setOpen((was) => !was);
        }}
      >
        <GearIcon className="icon icon-sm" />
        {!compact && <span>{t('patients.missionControl')}</span>}
      </button>
      {open && (
        <div className="patient-menu mission-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            className="patient-menu-item"
            data-testid="mission-settings"
            onClick={choose(onOpenSettings)}
          >
            <GearIcon className="icon icon-sm" />
            {t('common.settings')}
          </button>
          <button
            type="button"
            role="menuitem"
            className="patient-menu-item"
            data-testid="mission-language"
            onClick={choose(() => {
              onUnavailable(t('nav.language'));
            })}
          >
            <GlobeIcon className="icon icon-sm" />
            {t('nav.language')}
          </button>
          <button
            type="button"
            role="menuitem"
            className="patient-menu-item"
            data-testid="mission-help"
            onClick={choose(() => {
              onUnavailable(t('nav.help'));
            })}
          >
            <HelpIcon className="icon icon-sm" />
            {t('nav.help')}
          </button>
        </div>
      )}
    </div>
  );
}

type PatientListProps = Pick<
  PatientsColumnProps,
  | 'patients'
  | 'ordered'
  | 'activePatientId'
  | 'recency'
  | 'pinnedIds'
  | 'onSelect'
  | 'onRetry'
  | 'onSetArchived'
  | 'onRename'
  | 'onDelete'
  | 'onTogglePin'
  | 'onReorderPins'
  | 'onOpenAll'
> & { query: string; onClearSearch: () => void };

function PatientList({
  patients,
  ordered,
  query,
  activePatientId,
  recency,
  pinnedIds,
  onSelect,
  onRetry,
  onClearSearch,
  onSetArchived,
  onRename,
  onDelete,
  onTogglePin,
  onReorderPins,
  onOpenAll,
}: PatientListProps): React.JSX.Element {
  const { t } = useI18n();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [sort, setSort] = useState<SidebarSort>(readSidebarSort);
  // The hover card is anchored to the row that is hovered, and lives outside
  // the sidebar: the list is a scroll box, so a card inside it would be clipped
  // at the column's edge instead of opening over the page beside it.
  const [tip, setTip] = useState<{ id: string; rect: DOMRect } | null>(null);

  if (patients.status === 'loading') return <p className="small state-note">{t('patients.loading')}</p>;

  if (patients.status === 'error') {
    return (
      <p className="small state-note error-state">
        {patients.message}{' '}
        <button type="button" className="btn small btn-quick" onClick={onRetry}>
          {t('common.tryAgain')}
        </button>
      </p>
    );
  }

  const needle = query.trim().toLowerCase();
  const searching = needle.length > 0;
  const visible = ordered.filter((patient) => patient.name.toLowerCase().includes(needle));

  if (visible.length === 0) {
    if (searching) {
      return (
        <div className="empty-column-state">
          <p className="small col-hint">{t('directory.noMatch', { query: query.trim() })}</p>
          <button type="button" className="btn btn-compact btn-quick" onClick={onClearSearch}>
            {t('directory.clearSearch')}
          </button>
        </div>
      );
    }
    if (patients.data.length === 0) {
      return (
        <div className="empty-column-state">
          <p className="small col-hint">{t('patients.emptyStart')}</p>
          <Link to="/patients/new" className="btn btn-primary btn-compact">
            <PlusIcon className="icon icon-sm" />
            {t('patients.addFirst')}
          </Link>
        </div>
      );
    }
    return <p className="small col-hint">{t('directory.emptyActive')}</p>;
  }

  // claude.ai's sidebar: a "Projects" group that is always there, reading
  // "Pin projects to keep them here" while it is empty, then everything else
  // under "Recents". The order arrives pinned-first; the pinned group keeps
  // the order she gave it, and "Recents" follows the control beside its label.
  const pinnedRows = visible.filter((patient) => pinnedIndex(patient.id, pinnedIds) >= 0);
  const recentsByActivity = visible.filter((patient) => pinnedIndex(patient.id, pinnedIds) < 0);
  const recents =
    sort === 'name'
      ? [...recentsByActivity].sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
        )
      : recentsByActivity;
  // Searching is a deliberate act, so it shows everyone it matched; the daily
  // list is the one that gets cut short.
  const recentsShown = searching ? recents : recents.slice(0, VISIBLE_PATIENTS);

  const tipPatient = tip === null ? null : (visible.find((patient) => patient.id === tip.id) ?? null);

  function renderRow(patient: PatientListItem): React.JSX.Element {
    const archived = patient.archived_at !== null;
    const pinned = pinnedIndex(patient.id, pinnedIds) >= 0;
    const editing = renaming === patient.id;
    return (
      <div
        key={patient.id}
        className={[
          'patient-entry',
          'project-row-wrap',
          archived ? 'is-archived' : '',
          pinned ? 'is-pinned' : '',
          editing ? 'is-renaming' : '',
          dragging === patient.id ? 'is-dragging' : '',
          dropTarget === patient.id ? 'is-drop-target' : '',
        ]
          .filter((part) => part !== '')
          .join(' ')}
        data-testid={`patient-entry-${patient.id}`}
        // Only pinned rows move: they are the ones with an order of their
        // own. Everything else is ordered by when it was last worked on.
        draggable={pinned && !editing}
        onDragStart={(event) => {
          setDragging(patient.id);
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', patient.id);
        }}
        onDragOver={(event) => {
          if (!pinned || dragging === null) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          setDropTarget(patient.id);
        }}
        onDragLeave={() => {
          setDropTarget((current) => (current === patient.id ? null : current));
        }}
        onDrop={(event) => {
          event.preventDefault();
          const from = pinnedIndex(dragging ?? '', pinnedIds);
          const to = pinnedIndex(patient.id, pinnedIds);
          setDragging(null);
          setDropTarget(null);
          if (from >= 0 && to >= 0 && from !== to) onReorderPins(from, to);
        }}
        onDragEnd={() => {
          setDragging(null);
          setDropTarget(null);
        }}
      >
        {editing ? (
          <PatientRenameField
            patient={patient}
            className="project-row-rename"
            onRename={onRename}
            onDone={() => {
              setRenaming(null);
            }}
          />
        ) : (
          <>
            <button
              type="button"
              className={
                patient.id === activePatientId ? 'list-item project-row is-active' : 'list-item project-row'
              }
              data-testid={`patient-row-${patient.id}`}
              onMouseEnter={(event) => {
                setTip({ id: patient.id, rect: event.currentTarget.getBoundingClientRect() });
              }}
              onMouseLeave={() => {
                setTip((current) => (current?.id === patient.id ? null : current));
              }}
              onFocus={(event) => {
                setTip({ id: patient.id, rect: event.currentTarget.getBoundingClientRect() });
              }}
              onBlur={() => {
                setTip((current) => (current?.id === patient.id ? null : current));
              }}
              onClick={() => {
                onSelect(patient.id);
              }}
              onKeyDown={(event) => {
                // The keyboard way to reorder a pinned patient, since dragging
                // is not reachable without a pointer: Alt with the arrows.
                if (!pinned || !event.altKey) return;
                const from = pinnedIndex(patient.id, pinnedIds);
                if (event.key === 'ArrowUp' && from > 0) {
                  event.preventDefault();
                  onReorderPins(from, from - 1);
                } else if (event.key === 'ArrowDown' && from >= 0 && from < pinnedIds.length - 1) {
                  event.preventDefault();
                  onReorderPins(from, from + 1);
                }
              }}
            >
              <span className="name">{patient.name}</span>
            </button>

            {/* One small "⋯" instead of a row of buttons: the column is narrow
                (owner, 2026-09-24), and three buttons on hover squeezed the
                name to nothing. Its slot stays in the row while hidden so the
                selection target never moves under the pointer. */}
            <PatientMenu
              patient={patient}
              archived={archived}
              pinned={pinned}
              onTogglePin={() => {
                onTogglePin(patient.id);
              }}
              onRename={() => {
                setTip(null);
                setRenaming(patient.id);
              }}
              onSetArchived={(next) => {
                onSetArchived(patient, next);
              }}
              onDelete={() => {
                onDelete(patient);
              }}
            />
          </>
        )}
      </div>
    );
  }

  return (
    <>
      {/* A search that matched no pinned patient has nothing to say about pins. */}
      {(!searching || pinnedRows.length > 0) && (
        <section className="sidebar-section" aria-labelledby="sidebar-pinned-label">
          <div className="sidebar-section-label" data-testid="section-pinned">
            <span id="sidebar-pinned-label">{t('patients.pinned')}</span>
          </div>
          {pinnedRows.length === 0 ? (
            <div className="sidebar-pin-hint" data-testid="pin-hint">
              <PinIcon className="icon icon-sm" />
              <span>{t('patients.pinHint')}</span>
            </div>
          ) : (
            pinnedRows.map(renderRow)
          )}
        </section>
      )}

      {recents.length > 0 && (
        <section className="sidebar-section" aria-labelledby="sidebar-recents-label">
          <div className="sidebar-section-label" data-testid="section-recents">
            <span id="sidebar-recents-label">{t('patients.recents')}</span>
            <SortControl
              sort={sort}
              onSort={(next) => {
                setSort(next);
                writeSidebarSort(next);
              }}
            />
          </div>
          {recentsShown.map(renderRow)}
        </section>
      )}

      {ordered.length > 0 && (
        <button type="button" className="view-all-row" data-testid="view-all-patients" onClick={onOpenAll}>
          {t('patients.viewAll')}
        </button>
      )}

      {/* The hover card, in the same place Claude puts it: off the right edge
          of the row, the name, then the count and the date of the last edit.
          Hidden from the pointer and from the accessibility tree — the row and
          the menu beside it already say all of this. */}
      {tip !== null &&
        tipPatient !== null &&
        createPortal(
          <div
            className="project-tip"
            role="tooltip"
            aria-hidden="true"
            data-testid="patient-tip"
            style={{
              left: `${String(Math.round(tip.rect.right + 20))}px`,
              top: `${String(Math.round(tip.rect.top))}px`,
            }}
          >
            <div className="project-tip-name">{tipPatient.name}</div>
            <div className="project-tip-meta">
              <span className="project-tip-count">{t('notes.count', { count: tipPatient.note_count })}</span>
              <span className="project-tip-date">{formatShortDate(recency.get(tipPatient.id) ?? null)}</span>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

/** The sliders beside "Recents", as claude.ai's: how that group is ordered. */
function SortControl({
  sort,
  onSort,
}: {
  sort: SidebarSort;
  onSort: (sort: SidebarSort) => void;
}): React.JSX.Element {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, setOpen);
  const options: { value: SidebarSort; label: string }[] = [
    { value: 'recent', label: t('patients.sortRecent') },
    { value: 'name', label: t('patients.sortName') },
  ];

  return (
    <div className="sidebar-sort" ref={ref}>
      <button
        type="button"
        className="icon-btn sidebar-section-btn"
        aria-label={t('patients.sortList')}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="sidebar-sort"
        onClick={() => {
          setOpen((was) => !was);
        }}
      >
        <SortIcon className="icon icon-sm" />
      </button>
      {open && (
        <div className="patient-menu sidebar-sort-menu" role="menu" aria-label={t('patients.sortList')}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={sort === option.value}
              className="patient-menu-item"
              data-testid={`sidebar-sort-${option.value}`}
              onClick={() => {
                setOpen(false);
                onSort(option.value);
              }}
            >
              {option.label}
              {sort === option.value && <CheckIcon className="icon icon-sm patient-menu-check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

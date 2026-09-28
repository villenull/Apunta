import type { PatientGroup, PatientListItem } from '@apunta/shared';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router';

import type { RecencyMap } from '../hooks/usePatientRecency.js';
import type { LoadState } from '../hooks/useLoader.js';
import { NO_MOTION_CLASS } from '../lib/appearance.js';
import { formatShortDate } from '../lib/format.js';
import { useI18n, type Translate } from '../lib/i18n.js';
import { pinnedIndex } from '../lib/patientOrder.js';
import {
  DEFAULT_SIDEBAR_VIEW,
  isDefaultSidebarView,
  readSidebarView,
  writeSidebarView,
  type SidebarActivity,
  type SidebarStatus,
  type SidebarView,
} from '../lib/sidebarView.js';
import type { PatientGroupsState } from '../hooks/usePatientGroups.js';
import { readCollapsedSections, writeCollapsedSections } from '../lib/sidebarSections.js';
import { SidebarViewMenu } from './SidebarViewMenu.js';
import { BrandWordmark } from './BrandWordmark.js';
import {
  ChevronDownIcon,
  DownloadIcon,
  GearIcon,
  GlobeIcon,
  HelpIcon,
  PanelLeftIcon,
  PeopleIcon,
  PinIcon,
  PlusIcon,
  SearchIcon,
} from './icons.js';
import { PatientMenu } from './PatientMenu.js';
import { PatientRenameField } from './PatientRenameField.js';

/**
 * How many unpinned patients the sidebar shows before the "View all" row — the
 * count Claude's own sidebar fits, and short enough that a practice with
 * hundreds of patients still opens on a scannable list.
 */
const VISIBLE_PATIENTS = 13;

/**
 * What a patient drag would do if she let go now (owner, 2026-09-27, after
 * Claude's sidebar).
 *
 * - `reorder`: a row over Pinned, the one list she orders by hand — a pinned
 *   row being moved, or a name from elsewhere being pinned. Pinned is drawn
 *   with an empty gap at `index`, the rows sliding apart to open it, as
 *   Claude's does (owner, 2026-09-28); no insertion line, no outline.
 * - `move`: the row is over another group or Recents. The whole section is
 *   outlined and the lifted row reads "Move to …"; `groupId` null is Recents,
 *   which takes the patient out of their group (owner, 2026-09-28).
 */
type DragOver =
  | { readonly kind: 'reorder'; readonly section: string; readonly index: number }
  | {
      readonly kind: 'move';
      readonly section: string;
      readonly groupId: string | null;
      readonly label: string;
    };

/**
 * An invisible image for `setDragImage`, so the browser's own translucent copy
 * of the row does not follow the pointer alongside the lifted one drawn here.
 * Created on first use: the tests' DOM has no drag image to speak of.
 */
let blankDragImage: HTMLImageElement | null = null;
function hideNativeDragImage(event: React.DragEvent): void {
  if (typeof event.dataTransfer.setDragImage !== 'function') return;
  if (blankDragImage === null) {
    blankDragImage = new Image();
    blankDragImage.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  }
  event.dataTransfer.setDragImage(blankDragImage, 0, 0);
}

/** `ids` with `id` taken out and put back at `index`. */
function placeAt(ids: readonly string[], id: string, index: number): string[] {
  const rest = ids.filter((candidate) => candidate !== id);
  rest.splice(Math.max(0, Math.min(index, rest.length)), 0, id);
  return rest;
}

/**
 * The view control that rides the first section heading.
 *
 * **Module level, and that is load-bearing.** Defined inside the column, this
 * function would be a new component *type* on every render of the column, and
 * React unmounts and remounts a subtree whose element type changed — so the open
 * menu, its second-level panel and its scroll position were all thrown away on
 * any re-render, and a click on the control could set `open` on an instance that
 * was already being replaced. It looked like the button did nothing.
 */
function ViewMenuSlot({
  view,
  onViewChange,
  onStatusChange,
}: {
  view: SidebarView;
  onViewChange: (view: SidebarView) => void;
  onStatusChange?: ((status: SidebarStatus) => void) | undefined;
}): React.JSX.Element {
  return (
    <SidebarViewMenu
      view={view}
      onChange={(next) => {
        onViewChange(next);
        // The one field the workspace has to know about, because it decides
        // whether archived patients are on the wire at all (F1).
        if (next.status !== view.status) onStatusChange?.(next.status);
      }}
    />
  );
}

export interface PatientsColumnProps {
  patients: LoadState<PatientListItem[]>;
  /** The same rows in sidebar order: pinned first, then by last note edit. */
  ordered: PatientListItem[];
  activePatientId: string | null;
  /** When each patient's last note was edited, for the tooltip and the order. */
  recency: RecencyMap;
  /** Pinned ids, top of the list first. */
  pinnedIds: readonly string[];
  /**
   * The named lists patients are filed under, in creation order. Omitted means
   * the feature is not wired here, and the menu row is not drawn at all.
   */
  groups?: readonly PatientGroup[] | undefined;
  /**
   * Every patient, archived included, for the sidebar's own Status filter
   * (owner, 2026-09-27). The `ordered` list stays the working one — active
   * patients only — so choosing "Archived" in the sidebar cannot put an archived
   * patient in front of the home screen or a note picker.
   */
  sidebarPatients?: readonly PatientListItem[] | undefined;
  /** File a patient under a group, or `null` to take them out of theirs. */
  onMoveToGroup?: ((patient: PatientListItem, groupId: string | null) => void) | undefined;
  /** Make a group and file this patient under it in one go. */
  onCreateGroup?: ((patient: PatientListItem, name: string) => void) | undefined;
  /**
   * Put a patient at a place in a group by dragging them there (owner,
   * 2026-09-27). `position` is the index within the group, or null for the end
   * of it — which is what a drop on the heading means.
   */
  onMoveIntoGroup?:
    ((patient: PatientListItem, groupId: string, position: number | null) => void) | undefined;
  /**
   * Put one group above another (owner, 2026-09-27). `index` is where it lands
   * among the groups. A move is never a merge.
   */
  onReorderGroup?: ((groupId: string, index: number) => void) | undefined;
  /**
   * Report the `Status` filter to whoever has to widen the patient fetch (F1).
   *
   * The filter is owned and written here, and the workspace is the only thing
   * that knows whether the working list has to contain archived patients at all.
   * Without this the choice was read once at mount, so "Archived" and "All"
   * showed an empty list until the tab was reloaded — the fetch, not the
   * filter, was the half that was missing.
   */
  onStatusChange?: ((status: SidebarStatus) => void) | undefined;
  /**
   * Which of loading / ready / error the group list is in, so the submenu can say
   * so rather than claiming she has no groups (F5).
   */
  groupsState?: PatientGroupsState | undefined;
  /** Fetch the groups again, offered when the list failed to load. */
  onReloadGroups?: (() => void) | undefined;
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
  /**
   * Pin at a place in Pinned, or move there if pinned already: where a name
   * dropped into the gap she opened lands (owner, 2026-09-28). Omitted, a drop
   * from outside Pinned pins at the bottom.
   */
  onPinAt?: ((patientId: string, index: number) => void) | undefined;
  /** Move a pinned row within the pinned group. */
  onReorderPins: (from: number, to: number) => void;
  /** "View all": the full Active / Archived page. */
  onOpenAll: () => void;
  onToggleCollapsed: () => void;
  collapsed: boolean;
  /** "More" → Settings, opened as a modal over the workspace. */
  onOpenSettings: () => void;
  /**
   * "More" → the rows this preview does not build yet.
   *
   * `what` is the control's own label, already in the active locale: the caller
   * passes `t(…)` rather than a string, so a Spanish toast names the control in
   * Spanish.
   */
  onUnavailable: (what: string) => void;
  /**
   * "More" → Language, as a window over the workspace (owner,
   * 2026-09-27). Optional so a column rendered without one still works and the
   * row falls back to the toast above.
   */
  onOpenLanguage?: (() => void) | undefined;
  /**
   * "More" → Import, a first-level row beside Settings and Language
   * (owner, 2026-09-27). Omitted by a column rendered without one, and the row
   * then toasts, which is what Language's did before it had a window.
   */
  onOpenImport?: (() => void) | undefined;
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
  sidebarPatients,
  groups,
  onMoveToGroup,
  onCreateGroup,
  onMoveIntoGroup,
  onReorderGroup,
  onStatusChange,
  groupsState,
  onReloadGroups,
  onSelect,
  onRetry,
  onSetArchived,
  onRename,
  onDelete,
  onTogglePin,
  onPinAt,
  onReorderPins,
  onOpenAll,
  onToggleCollapsed,
  collapsed,
  onOpenSettings,
  onUnavailable,
  onOpenLanguage,
  onOpenImport,
  edge,
}: PatientsColumnProps): React.JSX.Element {
  const { t } = useI18n();
  const [query, setQuery] = useState('');

  return (
    <div className="col col-patients">
      <div className="col-header col-header-brand">
        <Link to="/" className="brand brand-link" data-testid="home-link">
          {/* The Fraunces wordmark in the brand's teal, both themes (owner,
              2026-09-26). Its height is the `--logo-h` token, the same one the
              standalone screens use. */}
          <BrandWordmark />
        </Link>
        {/* The panel toggle sits at the column's RIGHT edge, in line with the
            view control on the topmost section below it (owner, 2026-09-27);
            the wordmark takes the left. */}
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
          sidebarPatients={sidebarPatients}
          groups={groups}
          onMoveToGroup={onMoveToGroup}
          onCreateGroup={onCreateGroup}
          onMoveIntoGroup={onMoveIntoGroup}
          onReorderGroup={onReorderGroup}
          onStatusChange={onStatusChange}
          groupsState={groupsState}
          onReloadGroups={onReloadGroups}
          onSelect={onSelect}
          onRetry={onRetry}
          onClearSearch={() => {
            setQuery('');
          }}
          onSetArchived={onSetArchived}
          onRename={onRename}
          onDelete={onDelete}
          onTogglePin={onTogglePin}
          onPinAt={onPinAt}
          onReorderPins={onReorderPins}
          onOpenAll={onOpenAll}
        />
      </div>

      <MissionControl
        t={t}
        onOpenSettings={onOpenSettings}
        onUnavailable={onUnavailable}
        onOpenLanguage={onOpenLanguage}
        onOpenImport={onOpenImport}
      />
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
 * "More", where Settings, Language, Import and Get help live. `compact` is
 * the collapsed rail's version: the gear alone, its name on the button rather
 * than beside it, and the menu opening to the rail's right.
 */
export function MissionControl({
  t,
  onOpenSettings,
  onUnavailable,
  onOpenLanguage,
  onOpenImport,
  compact = false,
}: {
  t: Translate;
  onOpenSettings: () => void;
  onUnavailable: (what: string) => void;
  /** Omitted by a caller with nowhere to put the chooser; the row then toasts. */
  onOpenLanguage?: (() => void) | undefined;
  /** Omitted by a caller with nowhere to send her; the row then toasts. */
  onOpenImport?: (() => void) | undefined;
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
          {/*
           * Import is a first-level row here, not a section of Settings (owner,
           * 2026-09-27): bringing a few hundred conversations in is something she
           * does once and then rarely, and burying it two levels deep in the
           * place she changes colours and font sizes was why it went unused.
           * Claude and Halaxy both open from here; the Settings entry is gone.
           */}
          <button
            type="button"
            role="menuitem"
            className="patient-menu-item"
            data-testid="mission-import"
            onClick={choose(() => {
              if (onOpenImport) onOpenImport();
              else onUnavailable(t('settings.import'));
            })}
          >
            <DownloadIcon className="icon icon-sm" />
            {t('settings.import')}
          </button>
          <button
            type="button"
            role="menuitem"
            className="patient-menu-item"
            data-testid="mission-language"
            onClick={choose(() => {
              // The real chooser when the workspace wired one; the old toast
              // otherwise, so a column rendered without it still says why.
              if (onOpenLanguage) onOpenLanguage();
              else onUnavailable(t('nav.language'));
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
  | 'sidebarPatients'
  | 'groups'
  | 'onMoveToGroup'
  | 'onCreateGroup'
  | 'onMoveIntoGroup'
  | 'onReorderGroup'
  | 'onStatusChange'
  | 'groupsState'
  | 'onReloadGroups'
  | 'onSelect'
  | 'onRetry'
  | 'onSetArchived'
  | 'onRename'
  | 'onDelete'
  | 'onTogglePin'
  | 'onPinAt'
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
  sidebarPatients,
  groups,
  onMoveToGroup,
  onCreateGroup,
  onMoveIntoGroup,
  onReorderGroup,
  onStatusChange,
  groupsState,
  onReloadGroups,
  onSelect,
  onRetry,
  onClearSearch,
  onSetArchived,
  onRename,
  onDelete,
  onTogglePin,
  onPinAt,
  onReorderPins,
  onOpenAll,
}: PatientListProps): React.JSX.Element {
  const { t } = useI18n();
  const [renaming, setRenaming] = useState<string | null>(null);
  /*
   * Which sections she has folded away (owner, 2026-09-27), kept in
   * `localStorage` like the sort and the width: a fold that came back on every
   * reload would be a fold she stopped using. Keyed by name, not by position,
   * because the sections come and go as she makes groups.
   */
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(readCollapsedSections);

  function toggleSection(key: string): void {
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      writeCollapsedSections(next);
      return next;
    });
  }

  /**
   * A section's heading: the name, and a triangle that folds the section away.
   *
   * The row is a button across the **full width** of the column, with the
   * triangle at the far end — which is what makes the name's own hover area wide
   * enough to be a comfortable target and leaves the triangle somewhere to sit
   * that is not on top of the words. The triangle appears on hover and on
   * keyboard focus, and **stays put once the section is folded**: a control
   * that only exists while the pointer is on it is a control she has to find
   * again to undo the fold.
   */
  function sectionHeading(options: {
    key: string;
    label: string;
    labelId: string;
    testId?: string;
    children?: React.ReactNode;
    /**
     * Set on a **group** heading only: it is what makes the heading draggable,
     * and a place another group's heading can be dropped. A dragged *patient*
     * is handled by the section around the heading, not by the heading.
     */
    groupId?: string;
  }): React.JSX.Element {
    const isCollapsed = collapsed.has(options.key);
    /*
     * A **row** with a button in it, not a button with a button in it.
     *
     * The heading was the button, and Recents' own view control sat inside it —
     * which is invalid HTML (`<button>` may not contain a `<button>`) and worse
     * than invalid in practice: pressing the control also pressed the heading
     * around it, so choosing a filter folded Recents away and took the list with
     * it. The row is the flex container, the name and its triangle are the
     * button, and the control is a sibling at the far end.
     */
    return (
      <div
        className={
          groupDropTarget === options.key ? 'sidebar-section-head is-drop-target' : 'sidebar-section-head'
        }
        role="none"
        draggable={options.groupId !== undefined}
        onDragStart={(event) => {
          if (options.groupId === undefined) return;
          setDraggingGroup(options.groupId);
          event.dataTransfer.effectAllowed = 'move';
          // The payload says *what* is being dragged, so one drop target can
          // mean two different things: a patient row files itself, a group
          // heading moves itself.
          event.dataTransfer.setData('application/x-apunta-group', options.groupId);
        }}
        onDragOver={(event) => {
          if (options.groupId === undefined) return;
          // Only a dragged group heading is handled here; a dragged patient
          // bubbles on to the section, which decides what the drop means.
          if (draggingGroup === null) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          setGroupDropTarget(options.key);
        }}
        onDragLeave={() => {
          setGroupDropTarget((current) => (current === options.key ? null : current));
        }}
        onDrop={(event) => {
          if (options.groupId === undefined || draggingGroup === null) return;
          event.preventDefault();
          event.stopPropagation();
          dropGroupOn(options.groupId);
        }}
        onDragEnd={() => {
          setDraggingGroup(null);
          setGroupDropTarget(null);
        }}
      >
        <button
          type="button"
          className="sidebar-section-label"
          aria-expanded={!isCollapsed}
          data-testid={options.testId ?? `section-toggle-${options.key}`}
          data-collapsed={isCollapsed ? 'true' : 'false'}
          onClick={() => {
            toggleSection(options.key);
          }}
        >
          <span id={options.labelId}>{options.label}</span>
          {/*
           * The triangle sits **immediately after the name**, as in Claude's own
           * headings (owner, 2026-09-27) — it belongs to the label it folds, and
           * parked at the far end of the column it read as a control for the
           * column. Anything else on the row, such as Recents' sort button, is
           * pushed to the far end instead, by its own `margin-left: auto`.
           */}
          <ChevronDownIcon className="icon icon-sm sidebar-section-chevron" />
        </button>
        {options.children}
      </div>
    );
  }
  const [dragging, setDragging] = useState<string | null>(null);
  /**
   * What letting go would do — see `DragOver`. Recents is a target only for a
   * patient who is in a group, and dropping there takes them out of it (owner,
   * 2026-09-27); it is never a place to reorder, because its order is the sort.
   */
  const [dragOver, setDragOver] = useState<DragOver | null>(null);
  /** The pointer, so the dragged name can follow it as a lifted cell. */
  const [dragAt, setDragAt] = useState<{ x: number; y: number } | null>(null);
  /**
   * Where on the row she picked it up, and how wide the row was, so the lifted
   * row sits exactly where the row was rather than jumping to the pointer.
   */
  const [grab, setGrab] = useState<{ dx: number; dy: number; width: number } | null>(null);
  /** The section the row was picked up from: `pinned`, `group:<id>` or `recents`. */
  const [dragFrom, setDragFrom] = useState<string | null>(null);
  /**
   * The group heading being dragged, and the heading it is over. Groups reorder
   * by dragging one heading onto another (owner, 2026-09-27): Pinned is always
   * the top section and Recents always the bottom, so neither is a group and
   * neither moves. Dropping a group on a group is a **move, never a merge** —
   * there is no way to say "put these people together" by accident, which is
   * what a merge-on-drop would do.
   */
  const [draggingGroup, setDraggingGroup] = useState<string | null>(null);
  const [groupDropTarget, setGroupDropTarget] = useState<string | null>(null);

  const [view, setView] = useState<SidebarView>(readSidebarView);
  // The hover card is anchored to the row that is hovered, and lives outside
  // the sidebar: the list is a scroll box, so a card inside it would be clipped
  // at the column's edge instead of opening over the page beside it.
  const [tip, setTip] = useState<{ id: string; rect: DOMRect } | null>(null);

  /*
   * The rows' entrance cascade plays **once**, when the list first arrives
   * (owner, 2026-09-28). A CSS animation restarts whenever its element is moved
   * in the document, so with it always on, every row a drag or a re-sort moved
   * faded in again as though it were new — "respawning".
   */
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    if (patients.status !== 'ready' || entered) return undefined;
    const timer = setTimeout(() => {
      setEntered(true);
    }, 700);
    return () => {
      clearTimeout(timer);
    };
  }, [patients.status, entered]);

  /*
   * While a drag is in flight, a row that changes place slides there rather
   * than jumping (owner, 2026-09-28): the names part to open the gap and close
   * behind it. Measured before and after each render — "first, last, invert,
   * play" — so only the rows that really moved animate, and never a row that is
   * new. Off with animations, and wherever the Web Animations API is missing.
   */
  const sectionsRef = useRef<HTMLDivElement>(null);
  const tops = useRef(new Map<Element, number>());
  useLayoutEffect(() => {
    const root = sectionsRef.current;
    if (root === null) return;
    const animate = dragging !== null && !document.documentElement.classList.contains(NO_MOTION_CLASS);
    const next = new Map<Element, number>();
    for (const row of root.querySelectorAll<HTMLElement>('.patient-entry')) {
      // The layout position, which a running slide's transform does not move —
      // measuring the painted one would read a row mid-slide as having moved
      // again, and start another slide from there.
      const top = row.offsetTop;
      next.set(row, top);
      const before = tops.current.get(row);
      if (!animate || before === undefined || Math.abs(before - top) < 0.5) continue;
      if (typeof row.animate !== 'function') continue;
      row.animate([{ transform: `translateY(${String(before - top)}px)` }, { transform: 'none' }], {
        duration: 160,
        easing: 'cubic-bezier(0.2, 0, 0, 1)',
      });
    }
    tops.current = next;
  });

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

  /*
   * The four sections of the control beside "Recents" (owner, 2026-09-27),
   * applied in that order, each one narrowing the last.
   *
   * `sidebarPatients` is the whole list, archived included, because "Status:
   * Archived" and "All" have to be able to show them; the workspace passes the
   * narrower working list in `ordered` for everything else in the app, so no
   * archived patient can leak into the home screen or a note picker.
   */
  const byStatus = (sidebarPatients ?? ordered).filter((patient) => {
    const archived = patient.archived_at !== null;
    if (view.status === 'active') return !archived;
    if (view.status === 'archived') return archived;
    return true;
  });

  /*
   * "Last activity" is a window on when she last worked on them, which is the
   * last note edit the app already tracks. A patient with no notes has no date
   * at all, so **any window but "any time" hides them** — there is no moment to
   * put them inside a past week. That is the honest reading of the question, and
   * it is why "Any time" is the default.
   */
  const DAYS: Record<Exclude<SidebarActivity, 'all'>, number> = { '1d': 1, '3d': 3, '7d': 7, '30d': 30 };
  const byActivity =
    view.activity === 'all'
      ? byStatus
      : byStatus.filter((patient) => {
          const last = recency.get(patient.id) ?? null;
          if (last === null) return false;
          const age = Date.now() - new Date(last).getTime();
          return age <= DAYS[view.activity as Exclude<SidebarActivity, 'all'>] * 86_400_000;
        });

  /**
   * Everything the filters and the search apply to — which is **everything below
   * Pinned** (owner, 2026-09-27). Pinned is above the control that sets them,
   * so it is not one of the things they are for: a pin is a decision she made
   * deliberately, and a status or date filter quietly emptying her pins would
   * look like the pin had stopped working.
   *
   * The search *does* reach Pinned — searching is a deliberate act and it shows
   * everyone it matched — so it is applied here as well as below.
   */
  const matchesNeedle = (patient: PatientListItem): boolean => patient.name.toLowerCase().includes(needle);
  const visible = byActivity.filter(matchesNeedle);
  // The **whole** list, not `byStatus` or `byActivity`: looking a pin up in the
  // filtered list would apply the filter to it a second time, from the other
  // side, and quietly drop the very pin the exemption is for.
  const everyone = sidebarPatients ?? ordered;
  const pinnedVisible = pinnedIds
    .map((id) => everyone.find((patient) => patient.id === id) ?? null)
    .filter((patient): patient is PatientListItem => patient !== null)
    .filter(matchesNeedle);
  /** The row being dragged, for the cell that follows the pointer. */
  const draggingPatient = dragging === null ? null : (everyone.find((p) => p.id === dragging) ?? null);
  const viewIsDefault = isDefaultSidebarView(view);

  /** Every dimension back to what it was before she touched the menu. */
  function onResetView(): void {
    setView(DEFAULT_SIDEBAR_VIEW);
    // "Clear filters" is a Status change too, and it is the one that has to
    // take archived patients back off the wire.
    if (view.status !== DEFAULT_SIDEBAR_VIEW.status) onStatusChange?.(DEFAULT_SIDEBAR_VIEW.status);
    writeSidebarView(DEFAULT_SIDEBAR_VIEW);
  }

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
    /*
     * Empty **because she filtered it**, not because the practice is empty —
     * and the difference matters. This said "No active patients", which is a
     * different and untrue thing: her patients were there, one filter was hiding
     * them, and there was no way back from it. So when a view dimension is off
     * its default, that is what this says, and it offers the one click that puts
     * every dimension back.
     */
    if (!viewIsDefault) {
      return (
        <div className="empty-column-state">
          <p className="small col-hint">{t('patients.filteredOut')}</p>
          <button
            type="button"
            className="btn btn-compact btn-quick"
            data-testid="clear-view"
            onClick={onResetView}
          >
            {t('patients.clearFilters')}
          </button>
        </div>
      );
    }
    return <p className="small col-hint">{t('directory.emptyActive')}</p>;
  }

  // claude.ai's sidebar: a "Projects" group that is always there, reading
  // "Pin projects to keep them here" while it is empty, then everything else
  // under "Recents". The order arrives pinned-first; the pinned group keeps
  // the order she gave it, and "Recents" follows the control beside its label.
  const pinnedRows = pinnedVisible;
  /*
   * Groups (owner, 2026-09-27). A patient she has filed under a group leaves
   * Recents and appears under that group's own heading, in the order she made
   * the groups. A patient in no group is not touched at all: same rows, same
   * order, same place — "no group" has to mean nothing happened, or every
   * patient would move the day the feature arrived.
   *
   * Pinning still wins over a group, because a pin is a decision about this
   * moment and a group is a decision about the patient. **Pinned is a
   * supergroup** (owner, 2026-09-28): a pinned patient is drawn in Pinned and
   * nowhere else — not in their group, not in Recents — but keeps the group, so
   * unpinning puts them back under it.
   */
  const ungrouped = visible.filter(
    (patient) =>
      pinnedIndex(patient.id, pinnedIds) < 0 &&
      (view.groupBy === 'none' || (patient.group_id ?? null) === null),
  );
  /*
   * Most recent activity — but a patient with **no notes at all** is placed by
   * when she added them, not exiled to the bottom.
   *
   * That was a real bug, found by the e2e suite: "no activity" was sorted
   * last, so the patient she had just created landed below every patient who
   * had ever been drafted about, and with the daily list cut at 13 rows it
   * was simply not there. She adds somebody and the list does not show them.
   * `created_at` is the honest recency for someone who has no work yet, and
   * `max` of the two says what she means by recent: the last time she touched
   * them, counting the day she created them.
   */
  const lastTouched = (patient: PatientListItem): string =>
    [recency.get(patient.id), patient.created_at]
      .filter((value): value is string => value !== null && value !== undefined)
      .sort()
      .at(-1) ?? patient.created_at;
  const byRecent = (a: PatientListItem, b: PatientListItem): number =>
    lastTouched(b).localeCompare(lastTouched(a));
  /**
   * The one sort, for every section below Pinned (owner, 2026-09-28): the
   * control on the topmost section sets it for all of them, as Claude's does.
   * There is no hand-made order inside a group; Pinned is the only list she
   * arranges herself, and the sort never touches it.
   */
  const compare = ((): ((a: PatientListItem, b: PatientListItem) => number) => {
    if (view.sort === 'name')
      return (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    // Newest first: "Date created" reads as the most recent arrivals, and the
    // alternative puts the patients she added years ago above today's.
    if (view.sort === 'created') return (a, b) => b.created_at.localeCompare(a.created_at);
    return byRecent;
  })();
  /*
   * Groups, **including the empty ones** (owner, 2026-09-27). They used to be
   * filtered to those with somebody in them, on the reasoning that a heading you
   * cannot see the contents of is noise — which is true, and useless: she made a
   * group, nothing appeared, and there was no way to tell "no groups" from "this
   * group is empty" from "the thing I am looking at is broken". Claude shows an
   * empty Projects heading with a line in it, and so does this.
   */
  const groupRows =
    view.groupBy === 'groups'
      ? (groups ?? []).map((group) => ({
          group,
          rows: visible
            .filter((patient) => patient.group_id === group.id && pinnedIndex(patient.id, pinnedIds) < 0)
            .sort(compare),
        }))
      : [];
  const recents = [...ungrouped].sort(compare);
  // Searching is a deliberate act, so it shows everyone it matched; the daily
  // list is the one that gets cut short.
  const recentsShown = searching ? recents : recents.slice(0, VISIBLE_PATIENTS);

  const tipPatient = tip === null ? null : (visible.find((patient) => patient.id === tip.id) ?? null);

  /**
   * Pinned as drawn now, with the gap opened where a drop would land. A pinned
   * row being moved is its own gap (drawn empty); a name from elsewhere gets a
   * `'gap'` placeholder, so the pinned rows part around the place it would go.
   */
  function previewPinned(rows: readonly PatientListItem[]): readonly (PatientListItem | 'gap')[] {
    if (dragging === null || dragOver?.kind !== 'reorder') return rows;
    if (rows.some((patient) => patient.id === dragging)) {
      return placeAt(
        rows.map((patient) => patient.id),
        dragging,
        dragOver.index,
      )
        .map((id) => rows.find((patient) => patient.id === id))
        .filter((patient): patient is PatientListItem => patient !== undefined);
    }
    const withGap: (PatientListItem | 'gap')[] = [...rows];
    withGap.splice(Math.max(0, Math.min(dragOver.index, rows.length)), 0, 'gap');
    return withGap;
  }

  /**
   * Which place in Pinned the pointer is at, from its height under the heading.
   *
   * Not from the row under it: the rows slide apart to open the gap, so the row
   * under a still pointer changes as the gap moves, and a gap placed by
   * "whichever row is hovered" chased itself up and down. Slots are one row
   * tall from the heading's bottom edge, which does not move.
   */
  function pinnedPlaceAt(section: Element, clientY: number): number {
    const heading = section.querySelector('.sidebar-section-head');
    const top =
      heading === null ? section.getBoundingClientRect().top : heading.getBoundingClientRect().bottom;
    const first = section.querySelector<HTMLElement>('.patient-entry');
    const rowHeight = first !== null && first.offsetHeight > 0 ? first.offsetHeight : 32;
    const inside = dragging !== null && pinnedRows.some((row) => row.id === dragging);
    const last = inside ? pinnedRows.length - 1 : pinnedRows.length;
    return Math.max(0, Math.min(last, Math.floor((clientY - top) / rowHeight)));
  }

  function endDrag(): void {
    setDragging(null);
    setDragFrom(null);
    setDragOver(null);
    setDragAt(null);
    setGrab(null);
  }

  /**
   * What the dragged row would do over `section` — see `DragOver`. Null means
   * the section is not a place it can go, and the drop is refused.
   *
   * Pinned behaves like any other group (owner, 2026-09-28): dropping a name on
   * it pins them, and dragging a pinned name onto a group or Recents is leaving
   * Pinned for there. The one list that reorders by hand is Pinned itself.
   */
  function dragIntent(section: string, groupId: string | null, label: string): DragOver | null {
    const patient = draggingPatient;
    if (patient === null || dragFrom === null) return null;
    const fromPinned = dragFrom === 'pinned';
    // Pinned is placed by the pointer's height; see `pinnedPlaceAt`.
    if (section === 'pinned') return null;
    if (section === dragFrom) return null;
    if (section === 'recents') {
      // Out of Pinned is always somewhere to go; out of a group only while the
      // groups are shown, since that is the only way it came from one.
      if (!fromPinned && (view.groupBy !== 'groups' || patient.group_id === null)) return null;
      return { kind: 'move', section, groupId: null, label };
    }
    if (!fromPinned && patient.group_id === groupId) return null;
    return { kind: 'move', section, groupId, label };
  }

  /** The drag handlers every section carries. */
  function sectionDragProps(
    section: string,
    groupId: string | null,
    label: string,
  ): Pick<React.HTMLAttributes<HTMLElement>, 'onDragOver' | 'onDragLeave' | 'onDrop'> {
    return {
      onDragOver: (event) => {
        if (dragging === null) return;
        if (section === 'pinned') {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          const index = pinnedPlaceAt(event.currentTarget, event.clientY);
          if (dragOver?.kind !== 'reorder' || dragOver.index !== index) {
            setDragOver({ kind: 'reorder', section, index });
          }
          return;
        }
        const intent = dragIntent(section, groupId, label);
        if (intent === null) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        if (
          dragOver?.kind !== intent.kind ||
          dragOver.section !== intent.section ||
          (intent.kind === 'reorder' && dragOver.kind === 'reorder' && dragOver.index !== intent.index)
        ) {
          setDragOver(intent);
        }
      },
      onDragLeave: (event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setDragOver((current) => (current?.section === section ? null : current));
      },
      onDrop: (event) => {
        if (dragging === null) return;
        event.preventDefault();
        drop();
      },
    };
  }

  /** Let go: do what `dragOver` says, then forget the drag. */
  function drop(): void {
    const patient = draggingPatient;
    const intent = dragOver;
    const fromPinned = dragFrom === 'pinned';
    endDrag();
    if (patient === null || intent === null) return;
    if (intent.kind === 'reorder') {
      const from = pinnedIndex(patient.id, pinnedIds);
      if (from >= 0) {
        if (from !== intent.index) onReorderPins(from, intent.index);
      } else if (onPinAt !== undefined) {
        // Pinned in the gap she opened, not at the bottom.
        onPinAt(patient.id, intent.index);
      } else {
        onTogglePin(patient.id);
      }
      return;
    }
    // Leaving Pinned for a group or Recents unpins them on the way.
    if (fromPinned && pinnedIndex(patient.id, pinnedIds) >= 0) onTogglePin(patient.id);
    if (intent.groupId === null) {
      if (patient.group_id !== null) onMoveToGroup?.(patient, null);
    } else if (patient.group_id !== intent.groupId) {
      onMoveIntoGroup?.(patient, intent.groupId, null);
    }
  }

  /**
   * Put a dragged group above the one it was dropped on, and let go.
   *
   * `position` is the target's own index, which is what "above it" means for a
   * sparse list: the moved group takes the number the target had, the others
   * shift, and nothing needs renumbering into a tidy 0,1,2 (see migration 011).
   */
  function dropGroupOn(targetId: string): void {
    const moving = draggingGroup;
    setDraggingGroup(null);
    setGroupDropTarget(null);
    setDragAt(null);
    if (moving === null || moving === targetId) return;
    const index = (groups ?? []).findIndex((group) => group.id === targetId);
    if (index < 0) return;
    onReorderGroup?.(moving, index);
  }

  /** One row, in `section`: `pinned`, `group:<id>` or `recents`. */
  function renderRow(patient: PatientListItem, section: string): React.JSX.Element {
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
          dragging === patient.id && dragFrom === section ? 'is-dragging' : '',
        ]
          .filter((part) => part !== '')
          .join(' ')}
        data-testid={`patient-entry-${patient.id}`}
        /*
         * Every row lifts. Pinned and grouped rows are drop targets and reorder;
         * a row in Recents can be dragged **out** of it, because filing
         * somebody by dragging is the gesture she is asking for, but it is not
         * itself a place a row can be dropped — Recents is ordered by her sort
         * choice, not by where things sit.
         */
        draggable={!editing}
        onDragStart={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setDragging(patient.id);
          setDragFrom(section);
          setGrab({ dx: event.clientX - rect.left, dy: event.clientY - rect.top, width: rect.width });
          setDragAt({ x: event.clientX, y: event.clientY });
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', patient.id);
          hideNativeDragImage(event);
        }}
        onDragEnd={endDrag}
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
              groups={groups}
              groupsState={groupsState}
              onReloadGroups={onReloadGroups}
              onMoveToGroup={(groupId) => {
                onMoveToGroup?.(patient, groupId);
              }}
              onCreateGroup={(name) => {
                onCreateGroup?.(patient, name);
              }}
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
    <div
      ref={sectionsRef}
      className={entered ? 'patient-sections' : 'patient-sections is-entering'}
      onDragOver={(event) => {
        // The lifted cell follows the pointer, which means the list has to hear
        // about the pointer moving over it. `dragover` fires continuously while
        // a drag is in flight, which is exactly the cadence wanted.
        if (dragging === null) return;
        setDragAt({ x: event.clientX, y: event.clientY });
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setDragAt(null);
      }}
    >
      {/* A search that matched no pinned patient has nothing to say about pins. */}
      {(!searching || pinnedRows.length > 0) && (
        <section
          className="sidebar-section"
          data-testid="section-pinned-list"
          aria-labelledby="sidebar-pinned-label"
          {...sectionDragProps('pinned', null, t('patients.pinned'))}
        >
          {sectionHeading({
            key: 'pinned',
            label: t('patients.pinned'),
            labelId: 'sidebar-pinned-label',
            testId: 'section-pinned',
          })}
          {collapsed.has('pinned') ? null : pinnedRows.length === 0 && dragOver?.kind !== 'reorder' ? (
            <div className="sidebar-pin-hint" data-testid="pin-hint">
              <PinIcon className="icon icon-sm" />
              <span>{t('patients.pinHint')}</span>
            </div>
          ) : (
            previewPinned(pinnedRows).map((entry) =>
              entry === 'gap' ? (
                <div
                  key="pin-gap"
                  className="patient-entry project-row-wrap is-gap"
                  data-testid="pin-gap"
                  aria-hidden="true"
                />
              ) : (
                renderRow(entry, 'pinned')
              ),
            )
          )}
        </section>
      )}

      {/*
       * Her groups, between Pinned and Recents (owner, 2026-09-27): search,
       * New patient, Pinned, her groups in the order she made them, Recents,
       * then "View all" under the list. A group with nobody in it is not drawn
       * — an empty heading she cannot see the contents of is noise.
       */}
      {groupRows.map(({ group, rows }) => (
        <section
          key={group.id}
          className={
            dragOver?.kind === 'move' && dragOver.section === `group:${group.id}`
              ? 'sidebar-section is-drop-target'
              : 'sidebar-section'
          }
          aria-labelledby={`sidebar-group-${group.id}`}
          data-testid={`section-group-${group.id}`}
          {...sectionDragProps(`group:${group.id}`, group.id, group.name)}
        >
          {sectionHeading({
            key: `group:${group.id}`,
            label: group.name,
            labelId: `sidebar-group-${group.id}`,
            // What makes the heading draggable, to reorder the groups.
            groupId: group.id,
            // The control sits on the first section it governs, so the topmost
            // group carries it and Recents does not.
            children:
              groupRows[0]?.group.id === group.id ? (
                <ViewMenuSlot view={view} onStatusChange={onStatusChange} onViewChange={setView} />
              ) : null,
          })}
          {collapsed.has(`group:${group.id}`) ? null : rows.length === 0 ? (
            <div className="sidebar-group-empty" data-testid={`group-empty-${group.id}`}>
              {t('patients.groupEmpty')}
            </div>
          ) : (
            rows.map((patient) => renderRow(patient, `group:${group.id}`))
          )}
        </section>
      ))}

      {recents.length > 0 && (
        <section
          className={
            dragOver?.kind === 'move' && dragOver.section === 'recents'
              ? 'sidebar-section is-drop-target'
              : 'sidebar-section'
          }
          aria-labelledby="sidebar-recents-label"
          data-testid="section-recents-list"
          {...sectionDragProps('recents', null, t('patients.recents'))}
        >
          {sectionHeading({
            key: 'recents',
            label: t('patients.recents'),
            labelId: 'sidebar-recents-label',
            testId: 'section-recents',
            /*
             * The control rides the **first section the filters reach** (owner,
             * 2026-09-27), which is the topmost group when she has any and
             * Recents when she has none — **once**, never on both. What it sets
             * applies to every section from there down, so it belongs at the top
             * of them. Pinned is above it and is not filtered.
             */
            children:
              groupRows.length === 0 ? (
                <ViewMenuSlot view={view} onStatusChange={onStatusChange} onViewChange={setView} />
              ) : null,
          })}
          {collapsed.has('recents') ? null : recentsShown.map((patient) => renderRow(patient, 'recents'))}
        </section>
      )}

      {ordered.length > 0 && (
        <button type="button" className="view-all-row" data-testid="view-all-patients" onClick={onOpenAll}>
          {t('patients.viewAll')}
        </button>
      )}

      {/*
       * The name being dragged, following the pointer as a lifted cell, the way
       * Claude's does (owner, 2026-09-27). Drawn here rather than left to the
       * browser's own drag image because the browser's is a translucent copy of
       * the row — a picture of a row, not a card — and because this one can carry
       * the shape the rendering has: raised, rounded, slightly transparent.
       *
       * `position: fixed` and on the body, for the reason the menus are portalled:
       * the list scrolls, and a cell clipped by its own scroll container stops
       * following the pointer at the edge.
       */}
      {draggingPatient !== null &&
        dragAt !== null &&
        createPortal(
          dragOver?.kind === 'move' ? (
            /*
             * Over somewhere it would be moved to, the row stops being the row
             * and says what letting go does: "Move to Family therapy", or
             * "Move to Recents" (owner, 2026-09-27, after Claude's "Move to").
             */
            <div
              className="drag-cell is-move"
              aria-hidden="true"
              data-testid="drag-cell"
              style={{ left: `${String(Math.round(dragAt.x))}px`, top: `${String(Math.round(dragAt.y))}px` }}
            >
              {t('patients.dragMoveTo', { name: dragOver.label })}
            </div>
          ) : (
            <div
              className="drag-cell"
              aria-hidden="true"
              data-testid="drag-cell"
              style={{
                left: `${String(Math.round(dragAt.x - (grab?.dx ?? 0)))}px`,
                top: `${String(Math.round(dragAt.y - (grab?.dy ?? 0)))}px`,
                ...(grab === null ? {} : { width: `${String(Math.round(grab.width))}px` }),
              }}
            >
              <PeopleIcon className="icon icon-sm" />
              <span className="drag-cell-name">{draggingPatient.name}</span>
            </div>
          ),
          document.body,
        )}

      {/* The hover card, in the same place Claude puts it: off the right edge
          of the row, the name, then the count and the date of the last edit.
          Hidden from the pointer and from the accessibility tree — the row and
          the menu beside it already say all of this. */}
      {/* Not while a row is being dragged: the lifted row is what she is
          looking at, and the card would sit beside it saying nothing new. */}
      {tip !== null &&
        tipPatient !== null &&
        dragging === null &&
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
    </div>
  );
}

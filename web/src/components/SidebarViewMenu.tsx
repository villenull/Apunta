import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useI18n } from '../lib/i18n.js';
import {
  DEFAULT_SIDEBAR_VIEW,
  isDefaultSidebarView,
  writeSidebarView,
  type SidebarView,
} from '../lib/sidebarView.js';
import { CheckIcon, ChevronRightIcon, SortIcon } from './icons.js';

/**
 * The control beside "Recents": one menu, four sections (owner, 2026-09-27,
 * from her own screenshots of Claude's).
 *
 * **The panel is portalled to the body**, for the same reason the group's submenu
 * is: the sidebar list is a scroll container, and an `auto` axis clips the other
 * one too, so a panel left inside the column is cut off at its edge however high
 * its z-index goes. It is placed from the button's own measured rectangle.
 *
 * **Only options that are real are offered.** "Group by" carries her groups or
 * nothing, because the unread tracking that menu also asks for has no stored
 * meaning yet; a row full of options that change nothing is worse than a shorter
 * menu, and shipping a dead row as though it worked is the one thing this must
 * not do. The rest — status, a last-activity window, and the order — all read
 * data the sidebar already has.
 */
/** How long a leave waits for the pointer to reach the panel beside it. */
const CROSSING_GRACE_MS = 180;

export interface SidebarViewMenuProps {
  readonly view: SidebarView;
  readonly onChange: (view: SidebarView) => void;
}

/**
 * One section: which field of the view it sets, and the options for it. The
 * field is named once here rather than repeated on every option, because it is
 * the same answer three times otherwise — and the value is checked against the
 * field's own type, so a new option cannot be added to the wrong section.
 */
interface Section<K extends keyof SidebarView> {
  readonly field: K;
  readonly heading: string;
  readonly options: readonly { readonly value: SidebarView[K]; readonly label: string }[];
  /**
   * The value in force, named for the row. Not part of the panel: the panel
   * shows the options, the row shows where it is.
   */
  readonly current?: () => string;
}

export function SidebarViewMenu({ view, onChange }: SidebarViewMenuProps): React.JSX.Element {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  /** Which section's options are open beside the menu, if any. */
  const [section, setSection] = useState<keyof SidebarView | null>(null);
  const [sectionAt, setSectionAt] = useState<{ left: number; top: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  /**
   * The four section rows, so arrow keys can move between them and `ArrowLeft`
   * can put the keyboard back on the row it came from.
   *
   * The panel is **portalled to the body**, which puts it after the app root in
   * DOM order: sequential focus from the control walks on into the rest of the
   * application and never into the panel at all. So focus is moved explicitly
   * rather than left to the tab order, and the rows are held here because the
   * panel is a sibling of nothing the trigger owns.
   */
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  /**
   * Set when the *keyboard* opened the second panel. Hovering a row must not
   * steal focus — the pointer is already there — so only a key press arms this.
   */
  const focusSection = useRef(false);
  /**
   * The same crossing wait as the row menu's submenu, for the same reason: the
   * two panels are a couple of pixels apart, and a leave that closed on contact
   * would close the very thing the pointer is travelling towards.
   */
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function cancelPendingClose(): void {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function closeSectionSoon(): void {
    cancelPendingClose();
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      setSection(null);
      setSectionAt(null);
    }, CROSSING_GRACE_MS);
  }

  useEffect(() => cancelPendingClose, []);

  /**
   * Open one section's options beside the row, level with that row.
   *
   * The panel is placed to the right of the menu and **clamped to the window**,
   * and flipped to the menu's left when there is no room on the right. Without
   * the clamp the options could start past the right edge, which is the same
   * "the bottom of this is unreachable" problem the row menu's submenu had, in
   * the direction the owner would hit it on a narrow window.
   */
  function openSection(field: keyof SidebarView, row: HTMLElement, viaKeyboard = false): void {
    const panel = panelRef.current?.getBoundingClientRect();
    const rect = row.getBoundingClientRect();
    if (panel === undefined) return;
    cancelPendingClose();
    const width = 240;
    const height = Math.min(panelRef.current?.scrollHeight ?? 0, Math.max(0, window.innerHeight - 16));
    const room = window.innerWidth - (panel.right + 2);
    const left = room >= width ? panel.right + 2 : Math.max(8, panel.left - width - 2);
    const top = Math.max(8, Math.min(rect.top - 4, window.innerHeight - height - 8));
    setSectionAt({ left, top });
    setSection(field);
    focusSection.current = viaKeyboard;
  }

  /** Put the keyboard on a section row, by index, wrapping at both ends. */
  function focusRow(index: number): void {
    const rows = rowRefs.current.filter((row): row is HTMLButtonElement => row !== null);
    if (rows.length === 0) return;
    const wrapped = (index + rows.length) % rows.length;
    rows[wrapped]?.focus();
  }

  /** Close the second panel and hand the keyboard back to the row that opened it. */
  function closeSectionToRow(): void {
    const field = section;
    setSection(null);
    setSectionAt(null);
    cancelPendingClose();
    if (field === null) return;
    const index = SECTIONS.findIndex((spec) => spec.field === field);
    if (index >= 0) focusRow(index);
  }

  function close(): void {
    cancelPendingClose();
    setOpen(false);
    setAt(null);
    setSection(null);
    setSectionAt(null);
  }

  function openAt(): void {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect === undefined) return;
    // Under the button, flush to its right edge, and never off the window. The
    // width is the stylesheet's `--view-menu-w`.
    const width = 280;
    const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
    setAt({ left, top: rect.bottom + 4 });
    setOpen(true);
  }

  // Escape closes it, and a click anywhere else does too — the panel is on the
  // body, so "outside" is not the same set of nodes as the button's own tree.
  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      /*
       * **One level at a time.** Escape closed both panels and dropped focus on
       * the floor, so a keyboard user inside "Status" lost the menu they had
       * opened as well as the options in front of them. It now closes whatever
       * is in front first, and only the last step gives focus back to the
       * control that opened it.
       */
      if (sectionRef.current?.contains(document.activeElement) === true || section !== null) {
        closeSectionToRow();
        return;
      }
      close();
      buttonRef.current?.focus();
    }
    function onPointerDown(event: PointerEvent): void {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) === true) return;
      if (buttonRef.current?.contains(target) === true) return;
      /*
       * The options panel is a **second** portal, beside the first, so it is
       * not inside `panelRef`. Without this a press on any option counted as
       * "outside", closed the menu on pointerdown and unmounted the option
       * before its click arrived — so no choice in the menu did anything
       * (owner, 2026-09-27). Tests that fired a bare `click` never saw it.
       */
      if (sectionRef.current?.contains(target) === true) return;
      close();
    }
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open, section]);

  /*
   * Focus follows the open state, in an effect rather than in the click handler:
   * the panel does not exist until the state has been committed, and an effect
   * is the only place that is true. The flag is what keeps a hover from pulling
   * the keyboard out from under the pointer.
   */
  useEffect(() => {
    if (!open) return;
    focusRow(0);
  }, [open, at]);

  useEffect(() => {
    if (section === null || !focusSection.current) return;
    focusSection.current = false;
    sectionRef.current?.querySelector<HTMLElement>('button:not([disabled])')?.focus();
  }, [section]);

  function pick(patch: Partial<SidebarView>): void {
    onChange({ ...view, ...patch });
    writeSidebarView({ ...view, ...patch });
  }

  function renderSection<K extends keyof SidebarView>(spec: Section<K>): React.JSX.Element {
    return (
      <>
        {/*
         * No heading over the options, as in Claude's (owner, 2026-09-28): the
         * row the panel opened from already names it, and the panel's own
         * `aria-label` says it to a screen reader.
         */}
        {spec.options.map((option) => {
          const here = view[spec.field] === option.value;
          return (
            <button
              key={String(option.value)}
              type="button"
              role="menuitemradio"
              aria-checked={here}
              className="patient-menu-item view-option"
              data-testid={`view-${String(spec.field)}-${String(option.value)}`}
              onClick={() => {
                pick({ [spec.field]: option.value } as Partial<SidebarView>);
              }}
            >
              <span className="view-option-label">{option.label}</span>
              {/* The tick at the end of the row and in the accent, as Claude's
                  (owner, 2026-09-28). The slot is kept when unticked so no row
                  changes width under the pointer. */}
              {here ? (
                <CheckIcon className="icon icon-sm view-option-check" />
              ) : (
                <span className="view-option-gap" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </>
    );
  }

  /*
   * The four rows. `current` is a function rather than a value because the
   * catalogue is only reachable while the component is rendering, and the panel
   * is built inside a portal that renders after this.
   */
  const SECTIONS: readonly Section<keyof SidebarView>[] = [
    {
      field: 'status',
      heading: t('patients.statusLabel'),
      options: [
        { value: 'active', label: t('patients.statusActive') },
        { value: 'archived', label: t('patients.statusArchived') },
        { value: 'all', label: t('patients.statusAll') },
      ] as const,
      current: () =>
        view.status === 'archived'
          ? t('patients.statusArchived')
          : view.status === 'all'
            ? t('patients.statusAll')
            : t('patients.statusActive'),
    },
    {
      field: 'activity',
      heading: t('patients.activityLabel'),
      // Claude's own short labels (owner, 2026-09-28).
      options: [
        { value: '1d', label: t('patients.activityDay') },
        { value: '3d', label: t('patients.activity3d') },
        { value: '7d', label: t('patients.activity7d') },
        { value: '30d', label: t('patients.activity30d') },
        { value: 'all', label: t('patients.activityAll') },
      ] as const,
      current: () =>
        view.activity === 'all'
          ? t('patients.activityAll')
          : view.activity === '1d'
            ? t('patients.activityDay')
            : view.activity === '3d'
              ? t('patients.activity3d')
              : view.activity === '7d'
                ? t('patients.activity7d')
                : t('patients.activity30d'),
    },
    {
      field: 'groupBy',
      heading: t('patients.groupByLabel'),
      options: [
        { value: 'groups', label: t('patients.groupByGroups') },
        { value: 'none', label: t('patients.groupByNone') },
      ] as const,
      current: () => (view.groupBy === 'none' ? t('patients.groupByNone') : t('patients.groupByGroups')),
    },
    {
      field: 'sort',
      heading: t('patients.sortLabel'),
      // Claude's three, in Claude's order (owner, 2026-09-28). There is no
      // hand-made order inside a group: every group follows this.
      options: [
        { value: 'name', label: t('patients.sortName') },
        { value: 'created', label: t('patients.sortCreated') },
        { value: 'recent', label: t('patients.sortRecent') },
      ] as const,
      current: () =>
        view.sort === 'name'
          ? t('patients.sortName')
          : view.sort === 'created'
            ? t('patients.sortCreated')
            : t('patients.sortRecent'),
    },
  ];

  /**
   * Which rows show their value in the accent: the two **filters**, and only
   * while they are off their default (owner, 2026-09-28, after Claude's). A
   * filter that is on is something hiding patients, and she should see that at a
   * glance; how the list is grouped or ordered hides nobody, so it stays grey.
   */
  function isFlagged(field: keyof SidebarView): boolean {
    if (field !== 'status' && field !== 'activity') return false;
    return view[field] !== DEFAULT_SIDEBAR_VIEW[field];
  }
  const atDefaults = isDefaultSidebarView(view);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="icon-btn sidebar-view-btn"
        aria-label={t('patients.viewOptions')}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="sidebar-view-options"
        onClick={() => {
          if (open) {
            close();
            return;
          }
          openAt();
        }}
      >
        <SortIcon className="icon icon-sm" />
      </button>
      {open &&
        at !== null &&
        createPortal(
          <div
            ref={panelRef}
            className="patient-menu sidebar-view-menu"
            role="menu"
            aria-label={t('patients.viewOptions')}
            data-testid="sidebar-view-menu"
            style={{ left: `${String(Math.round(at.left))}px`, top: `${String(Math.round(at.top))}px` }}
          >
            {/*
             * Four rows, one per section, each opening its own options beside
             * the menu (owner, 2026-09-27) — the shape her screenshots have. A
             * single panel holding twelve options was a wall; this is a menu of
             * four things with a second panel for whichever one she is looking
             * at, and the current value is written on the row so the panel is
             * only needed when she wants to change it.
             */}
            {SECTIONS.map((spec, index) => [
              // Claude's grouping: the two filters, then how it is arranged.
              index === 2 ? <div key="separator" className="patient-menu-sep" role="separator" /> : null,
              <button
                key={spec.field}
                ref={(node) => {
                  rowRefs.current[index] = node;
                }}
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={section === spec.field}
                className="patient-menu-item view-section-row"
                data-testid={`view-section-${String(spec.field)}`}
                onMouseEnter={(event) => {
                  openSection(spec.field, event.currentTarget);
                }}
                onMouseLeave={closeSectionSoon}
                onClick={(event) => {
                  // A click opens it too, so the whole thing is reachable from
                  // the keyboard, where there is no hover at all.
                  openSection(spec.field, event.currentTarget, true);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
                    event.preventDefault();
                    // Down walks the four rows; Right opens this row's options,
                    // because that is what the chevron on it says.
                    if (event.key === 'ArrowRight') {
                      openSection(spec.field, event.currentTarget, true);
                      return;
                    }
                    focusRow(index + 1);
                    return;
                  }
                  if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    focusRow(index - 1);
                  }
                }}
              >
                <span className="view-section-label">{spec.heading}</span>
                {/* Every row here has one; the field is optional only so the
                    panel can be rendered from a section that has no row. */}
                <span
                  className={isFlagged(spec.field) ? 'view-section-value is-flagged' : 'view-section-value'}
                >
                  {spec.current?.() ?? ''}
                </span>
                <ChevronRightIcon className="icon icon-sm view-section-chevron" />
              </button>,
            ])}
            {/*
             * "Reset to defaults", only when there is something to reset (owner,
             * 2026-09-28): with everything at its default the row would be a
             * button that does nothing.
             */}
            {!atDefaults && (
              <>
                <div className="patient-menu-sep" role="separator" />
                <button
                  ref={(node) => {
                    // The fifth row for the arrow keys, while it exists.
                    rowRefs.current[SECTIONS.length] = node;
                  }}
                  type="button"
                  role="menuitem"
                  className="patient-menu-item"
                  data-testid="view-reset"
                  onMouseEnter={closeSectionSoon}
                  onClick={() => {
                    pick(DEFAULT_SIDEBAR_VIEW);
                    close();
                    buttonRef.current?.focus();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowUp') {
                      event.preventDefault();
                      focusRow(SECTIONS.length - 1);
                    } else if (event.key === 'ArrowDown') {
                      event.preventDefault();
                      focusRow(SECTIONS.length + 1);
                    }
                  }}
                >
                  {t('patients.resetView')}
                </button>
              </>
            )}
          </div>,
          document.body,
        )}
      {section !== null &&
        sectionAt !== null &&
        createPortal(
          <div
            ref={sectionRef}
            className="patient-menu sidebar-view-section"
            role="menu"
            aria-label={SECTIONS.find((spec) => spec.field === section)?.heading ?? ''}
            data-testid="sidebar-view-section"
            onMouseEnter={cancelPendingClose}
            onMouseLeave={closeSectionSoon}
            onKeyDown={(event) => {
              if (event.key === 'ArrowLeft') {
                // Back to the row this panel belongs to, which is where a
                // keyboard user has to land to choose a different section.
                event.preventDefault();
                event.stopPropagation();
                closeSectionToRow();
                return;
              }
              if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
              const options = [
                ...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([disabled])'),
              ];
              const here = options.findIndex((option) => option === document.activeElement);
              if (here < 0) return;
              event.preventDefault();
              const next = event.key === 'ArrowDown' ? here + 1 : here - 1;
              options[(next + options.length) % options.length]?.focus();
            }}
            style={{
              left: `${String(Math.round(sectionAt.left))}px`,
              top: `${String(Math.round(sectionAt.top))}px`,
            }}
          >
            {renderSection(SECTIONS.find((spec) => spec.field === section) ?? SECTIONS[0]!)}
          </div>,
          document.body,
        )}
    </>
  );
}

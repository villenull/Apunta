import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useI18n } from '../lib/i18n.js';
import { clampSidebarWidth, SIDEBAR_MAX_W, SIDEBAR_MIN_W } from '../lib/patientPins.js';

/** Past this many pixels a press on the edge is a drag, not a click. */
const DRAG_THRESHOLD = 3;
/** One arrow press on the focused edge. */
const KEY_STEP = 16;

export interface SidebarResizerProps {
  /** The sidebar's width now, in px. */
  width: number;
  /** A new width while dragging (`done` false) and once it is let go (`done` true). */
  onResize: (width: number, done: boolean) => void;
  /** A click on the edge, Enter on it, or Ctrl+B: hide the sidebar. */
  onCollapse: () => void;
}

/** The platform's own spelling of the toggle's shortcut. */
function shortcutLabel(): string {
  return /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘B' : 'Ctrl+B';
}

/**
 * The sidebar's right edge, as Claude's (owner, 2026-09-26): under the pointer
 * it becomes a resize cursor with a small card beside it — what a click does,
 * its shortcut, and that dragging resizes. The card goes the moment a drag
 * starts, so it never sits over the thing being moved. A click without a drag
 * hides the sidebar. For the keyboard it is a vertical separator: the arrows
 * resize it and Enter hides it.
 */
export function SidebarResizer({ width, onResize, onCollapse }: SidebarResizerProps): React.JSX.Element {
  const { t } = useI18n();
  const [card, setCard] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ startX: number; startWidth: number; moved: boolean; last: number } | null>(null);

  // While a drag is on, the whole page shows the resize cursor and selects no
  // text, however far the pointer strays from the edge.
  useEffect(() => {
    if (!dragging) return undefined;
    document.body.classList.add('is-resizing-sidebar');
    return () => {
      document.body.classList.remove('is-resizing-sidebar');
    };
  }, [dragging]);

  return (
    <>
      <div
        className={dragging ? 'sidebar-resizer is-dragging' : 'sidebar-resizer'}
        role="separator"
        aria-orientation="vertical"
        aria-label={t('patients.hideColumn')}
        aria-valuemin={SIDEBAR_MIN_W}
        aria-valuemax={SIDEBAR_MAX_W}
        aria-valuenow={width}
        tabIndex={0}
        data-testid="sidebar-resizer"
        onPointerEnter={(event) => {
          const edge = event.currentTarget.getBoundingClientRect();
          setCard({ x: edge.right + 8, y: event.clientY });
        }}
        onPointerLeave={() => {
          if (drag.current === null) setCard(null);
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { startX: event.clientX, startWidth: width, moved: false, last: width };
        }}
        onPointerMove={(event) => {
          const state = drag.current;
          if (state === null) return;
          const dx = event.clientX - state.startX;
          if (!state.moved) {
            if (Math.abs(dx) < DRAG_THRESHOLD) return;
            state.moved = true;
            setDragging(true);
            setCard(null);
          }
          state.last = clampSidebarWidth(state.startWidth + dx);
          onResize(state.last, false);
        }}
        onPointerUp={(event) => {
          const state = drag.current;
          drag.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          setDragging(false);
          if (state === null) return;
          if (state.moved) onResize(state.last, true);
          else {
            setCard(null);
            onCollapse();
          }
        }}
        onPointerCancel={() => {
          drag.current = null;
          setDragging(false);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            onResize(clampSidebarWidth(width + (event.key === 'ArrowRight' ? KEY_STEP : -KEY_STEP)), true);
          } else if (event.key === 'Enter') {
            event.preventDefault();
            onCollapse();
          }
        }}
      />
      {card !== null &&
        createPortal(
          <div
            className="resize-card"
            role="tooltip"
            aria-hidden="true"
            data-testid="sidebar-resize-card"
            style={{ left: `${String(Math.round(card.x))}px`, top: `${String(Math.round(card.y))}px` }}
          >
            <div className="resize-card-row">
              <span>{t('patients.hideColumn')}</span>
              <kbd className="resize-card-key">{shortcutLabel()}</kbd>
            </div>
            <div className="resize-card-hint">{t('patients.dragToResize')}</div>
          </div>,
          document.body,
        )}
    </>
  );
}

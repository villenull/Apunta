import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';

import { SettingsProvider, useSettingsContext } from './components/SettingsProvider.js';
import { SpellingProvider } from './components/SpellingProvider.js';

import { applyAppearance } from './lib/appearance.js';
import { I18nProvider, useI18n } from './lib/i18n.js';

import { AddPatient } from './routes/AddPatient.js';
import { Capture } from './routes/Capture.js';
import { Workspace } from './routes/Workspace.js';

// Non-workspace screens are runtime-loaded so the landing view stays eager.
// (Dynamic `import()` here is React's route code-splitting, not a runtime module choice.)

const About = lazy(async () => ({ default: (await import('./routes/About.js')).About }));
const Licenses = lazy(async () => ({ default: (await import('./routes/Licenses.js')).Licenses }));
const OnboardingFormat = lazy(async () => ({
  default: (await import('./routes/OnboardingFormat.js')).OnboardingFormat,
}));
const OnboardingPreview = lazy(async () => ({
  default: (await import('./routes/OnboardingPreview.js')).OnboardingPreview,
}));
const Import = lazy(async () => ({ default: (await import('./routes/Import.js')).Import }));
const HalaxyImport = lazy(async () => ({
  default: (await import('./routes/HalaxyImport.js')).HalaxyImport,
}));
const Settings = lazy(async () => ({ default: (await import('./routes/Settings.js')).Settings }));
const Setup = lazy(async () => ({ default: (await import('./routes/Setup.js')).Setup }));

/**
 * Every screen in the app. There is no login route — the app opens straight
 * into the workspace (PLAN §1); the prototype's `index.html` sign-in screen is
 * deliberately not ported.
 *
 * `I18nProvider` sits inside `SettingsProvider` and above the router, which is
 * the only place it can be: it reads the `language` setting through the
 * settings provider's own state, and every screen under it reads its strings
 * through the `t()` it provides. S2.3 mounted it with no string of its own;
 * S2.4 then moved this file's own literals — the loading note and the whole
 * primary-window blocker — onto the catalogues, which is why `AppRoutes` and
 * `PrimaryBlocker` both sit under the provider and can call `useI18n()`.
 */
export function App(): React.JSX.Element {
  return (
    <SettingsProvider>
      <I18nProvider>
        <SpellingProvider>
          <AppRoutes />
        </SpellingProvider>
      </I18nProvider>
    </SettingsProvider>
  );
}

function AppRoutes(): React.JSX.Element {
  const { t } = useI18n();
  const location = useLocation();
  const { state } = useSettingsContext();
  const primary = usePrimaryWindow();
  const blocked = primary.phase !== 'primary';
  const contentRef = useRef<HTMLDivElement>(null);

  /*
   * The practice's appearance — accent, text size, animations — painted once
   * at startup. A failure here is deliberately silent: the app is entirely
   * usable in its default colours.
   */
  useEffect(() => {
    if (state.status === 'ready') applyAppearance(state.data);
  }, [state]);

  /*
   * While a non-primary window is covered by the takeover prompt, the app
   * behind it must leave the tab order and the accessibility tree. `inert`
   * is set imperatively so this never depends on the JSX types carrying it;
   * the fullscreen prompt itself stays reachable and traps focus.
   */
  useEffect(() => {
    const node = contentRef.current;
    if (node === null) return;
    try {
      (node as unknown as { inert: boolean }).inert = blocked;
    } catch {
      // Engines without `inert` still get the fullscreen cover.
    }
  }, [blocked]);

  return (
    <>
      {/*
       * Key only the route transition wrapper, not either long-lived provider.
       * Query-string changes (patient and note selection) remain unanimated.
       */}
      <div
        id="apunta-content"
        ref={contentRef}
        key={location.pathname}
        className="route-transition"
        tabIndex={-1}
      >
        <Suspense fallback={<p className="state-note">{t('common.loading')}</p>}>
          <Routes>
            <Route path="/" element={<Workspace />} />
            {/*
              "View all" (owner preview, 2026-09-26): the full Active /
              Archived list, shown in the workspace's main pane so the sidebar
              stays put — the same shape as Claude's Recents page.
            */}
            <Route path="/patients" element={<Workspace />} />
            <Route path="/patients/new" element={<AddPatient />} />
            <Route path="/capture/:patientId" element={<Capture />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/import" element={<Import />} />
            <Route path="/import/halaxy" element={<HalaxyImport />} />
            <Route path="/setup" element={<Setup />} />
            <Route path="/about" element={<About />} />
            <Route path="/licenses" element={<Licenses />} />
            <Route path="/onboarding/format" element={<OnboardingFormat />} />
            <Route path="/onboarding/preview" element={<OnboardingPreview />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </div>
      <PrimaryBlocker
        phase={primary.phase}
        pending={primary.pending}
        onBegin={primary.beginTakeover}
        onCancel={primary.cancelTakeover}
        onDecline={primary.declineTakeover}
      />
    </>
  );
}

/*
 * Single primary window.
 *
 * Exactly one tab at a time owns editing. The owner holds the exclusive Web
 * Lock `apunta-primary-v1` for the life of its window; a second tab's
 * `ifAvailable` probe fails, so it stays covered by the fullscreen prompt
 * below. The lock is released on handoff or unload, so closing, crashing or
 * reloading a tab frees ownership without leaving a ghost — a reload or a
 * new tab simply probes again.
 *
 * Only control messages cross the matching BroadcastChannel
 * (`apunta:takeover-request`, `apunta:primary-closed` — each carrying nothing
 * but the sender's window id). Note text and patient data never leave the tab.
 *
 * Takeover order is what keeps two editors from ever being live together:
 * the old primary flushes its debounced save, paints itself blocked, and
 * only then releases the lock; the new tab unblocks inside the lock grant,
 * which cannot run until that release lands. Cancelling — or an 8s wait
 * timing out — leaves ownership exactly where it was.
 *
 * Where Web Locks are missing there is no fallback: a localStorage
 * read/modify/write race could crown two primaries, so those browsers fail
 * closed — blocked, with an explanation, and no edit access.
 */

const PRIMARY_LOCK_NAME = 'apunta-primary-v1';
const PRIMARY_CHANNEL_NAME = 'apunta-primary-v1';
/** A handoff that takes longer than this leaves ownership unchanged. */
const TAKEOVER_TIMEOUT_MS = 8000;
/** Grace for a reloading primary to reclaim before others step in. */
const CLOSE_GRACE_MS = 1500;

type PrimaryPhase = 'acquiring' | 'primary' | 'secondary' | 'unsupported';

/** Minimal Web Locks surface, so this never depends on the DOM lib version. */
interface ApuntaLockInfo {
  readonly name: string;
}
interface ApuntaLockManager {
  request(
    name: string,
    options: { mode?: string; ifAvailable?: boolean; signal?: AbortSignal },
    callback: (lock: ApuntaLockInfo | null) => Promise<void>,
  ): Promise<void>;
}

interface PrimaryWindow {
  readonly phase: PrimaryPhase;
  readonly pending: boolean;
  /** Explicit confirmation: starts the ordered flush/block/release handoff. */
  readonly beginTakeover: () => void;
  readonly cancelTakeover: () => void;
  /** Explicit decline: ownership untouched, this window stays blocked. */
  readonly declineTakeover: () => void;
}

function usePrimaryWindow(): PrimaryWindow {
  const [phase, setPhase] = useState<PrimaryPhase>('acquiring');
  const [pending, setPending] = useState(false);
  const [windowId] = useState(() => {
    try {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
      }
    } catch {
      // Fall through to the random id below.
    }
    return `w-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000000000).toString(36)}`;
  });
  const actionsRef = useRef({
    beginTakeover: (): void => {},
    cancelTakeover: (): void => {},
    declineTakeover: (): void => {},
  });

  useEffect(() => {
    const id = windowId;
    const locks: ApuntaLockManager | null = (() => {
      try {
        return (navigator as unknown as { locks?: ApuntaLockManager }).locks ?? null;
      } catch {
        return null;
      }
    })();

    // No Web Locks, no exclusivity to offer: fail closed, permanently blocked.
    if (locks === null) {
      setPhase('unsupported');
      return;
    }

    let cancelled = false;
    let phase: PrimaryPhase = 'acquiring';
    let holdRelease: (() => void) | null = null;
    let takeoverAbort: AbortController | null = null;
    let pendingTakeover = false;
    let closeTimer: number | null = null;
    let channel: BroadcastChannel | null = null;
    try {
      channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(PRIMARY_CHANNEL_NAME);
    } catch {
      channel = null;
    }

    const applyPhase = (next: PrimaryPhase): void => {
      phase = next;
      if (!cancelled) setPhase(next);
    };

    /** The window can be edited from here on. Never called before the grant. */
    const becomePrimary = (release: () => void): void => {
      const wasBlocked = phase !== 'primary';
      // Only a handoff from blocked needs a refresh: the first window to win
      // on initial load already renders from a fresh loader mount.
      const needsRefresh = phase === 'secondary';
      holdRelease = release;
      pendingTakeover = false;
      if (closeTimer !== null) {
        window.clearTimeout(closeTimer);
        closeTimer = null;
      }
      if (!cancelled) {
        setPending(false);
      }
      applyPhase('primary');
      // Same-tab only, carrying no content or ids: tells this window's
      // Workspace to reload its note list (stale while it stayed visible
      // behind the blocker). Never broadcast, never a page reload.
      if (needsRefresh && !cancelled) {
        window.dispatchEvent(new Event('apunta:became-primary'));
      }
      // A takeover lands the keyboard back in the app it just unlocked.
      if (wasBlocked) {
        window.requestAnimationFrame(() => {
          if (cancelled) return;
          document.getElementById('apunta-content')?.focus({ preventScroll: true });
        });
      }
    };

    /** The window is covered and non-editable from here on. */
    const becomeSecondary = (): void => {
      holdRelease = null;
      pendingTakeover = false;
      if (!cancelled) {
        setPending(false);
      }
      applyPhase('secondary');
    };

    /**
     * The open editor, if any, persists its debounced draft before this
     * window steps down. Registered by NoteView; absent on screens without
     * an editor, where there is nothing to flush.
     */
    const flushBeforeRelease = async (): Promise<void> => {
      const hook = (window as unknown as { __apuntaFlushBeforeRelease?: () => Promise<unknown> })
        .__apuntaFlushBeforeRelease;
      if (typeof hook !== 'function') return;
      // A rejection or synchronous throw (failed save, unresolved conflict)
      // must reach the takeover handler below so the release below never runs.
      await hook();
    };

    const postControl = (type: string): void => {
      try {
        channel?.postMessage({ type, from: id });
      } catch {
        // A closed channel still leaves the lock itself authoritative.
      }
    };

    const claimIfFree = (): void => {
      if (cancelled || phase !== 'secondary' || pendingTakeover) return;
      locks
        .request(PRIMARY_LOCK_NAME, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
          if (cancelled || lock === null) return;
          await new Promise<void>((resolve) => {
            if (cancelled) {
              resolve();
              return;
            }
            becomePrimary(resolve);
          });
        })
        .catch(() => {
          // Still owned elsewhere; this window stays blocked.
        });
    };

    const onControlMessage = (event: MessageEvent): void => {
      const data = event.data as { type?: unknown; from?: unknown } | null;
      if (data === null || typeof data !== 'object' || typeof data.type !== 'string') return;
      if (data.from === id) return;
      if (data.type === 'apunta:takeover-request') {
        if (phase !== 'primary') return;
        // Cooperative handoff: save, then block this window, then release —
        // the new primary's grant cannot run until the release below. A
        // rejected flush (failed save, unresolved conflict) keeps this window
        // primary and editable; the secondary's timeout unwinds its request.
        void flushBeforeRelease().then(
          () => {
            if (cancelled || phase !== 'primary') return;
            const release = holdRelease;
            holdRelease = null;
            becomeSecondary();
            release?.();
          },
          () => {
            // Ownership and phase untouched: no release, no transfer broadcast.
          },
        );
      } else if (data.type === 'apunta:primary-closed') {
        // The owner is going away; give a reloading tab a moment to reclaim
        // before an open secondary steps in.
        if (closeTimer !== null) window.clearTimeout(closeTimer);
        closeTimer = window.setTimeout(() => {
          closeTimer = null;
          claimIfFree();
        }, CLOSE_GRACE_MS);
      }
    };
    channel?.addEventListener('message', onControlMessage);

    locks
      .request(PRIMARY_LOCK_NAME, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
        if (cancelled) return;
        if (lock !== null) {
          await new Promise<void>((resolve) => {
            if (cancelled) {
              resolve();
              return;
            }
            becomePrimary(resolve);
          });
          // Released later through a handoff; the phase is secondary now.
        } else {
          becomeSecondary();
        }
      })
      .catch(() => {
        if (!cancelled) becomeSecondary();
      });

    const beginTakeover = (): void => {
      if (cancelled || phase !== 'secondary' || pendingTakeover) return;
      pendingTakeover = true;
      setPending(true);
      postControl('apunta:takeover-request');
      const controller = new AbortController();
      takeoverAbort = controller;
      const timeout = window.setTimeout(() => controller.abort(), TAKEOVER_TIMEOUT_MS);
      locks
        .request(PRIMARY_LOCK_NAME, { mode: 'exclusive', signal: controller.signal }, async () => {
          window.clearTimeout(timeout);
          takeoverAbort = null;
          // This grant runs only after the old primary released, so the old
          // window is already blocked before this one unlocks.
          await new Promise<void>((resolve) => {
            if (cancelled) {
              resolve();
              return;
            }
            becomePrimary(resolve);
          });
        })
        .catch(() => {
          window.clearTimeout(timeout);
          takeoverAbort = null;
          if (cancelled) return;
          // Cancelled, timed out, or otherwise failed: ownership unchanged.
          pendingTakeover = false;
          setPending(false);
        });
    };

    const cancelTakeover = (): void => {
      if (!pendingTakeover) return;
      pendingTakeover = false;
      try {
        takeoverAbort?.abort();
      } catch {
        // Already settled; the failure path below stands the window down.
      }
      takeoverAbort = null;
      if (!cancelled) setPending(false);
      // Ownership is untouched: this window stays blocked.
    };

    const declineTakeover = (): void => {
      if (cancelled || phase !== 'secondary' || pendingTakeover) return;
      // An explicit no: no request is sent, ownership is untouched, and this
      // window stays blocked behind its prompt.
    };

    actionsRef.current = { beginTakeover, cancelTakeover, declineTakeover };
    const releaseForUnload = (): void => {
      if (phase !== 'primary') return;
      postControl('apunta:primary-closed');
      const release = holdRelease;
      holdRelease = null;
      release?.();
    };
    window.addEventListener('pagehide', releaseForUnload);

    return () => {
      cancelled = true;
      try {
        takeoverAbort?.abort();
      } catch {
        // Already settled.
      }
      if (closeTimer !== null) window.clearTimeout(closeTimer);
      window.removeEventListener('pagehide', releaseForUnload);
      channel?.removeEventListener('message', onControlMessage);
      try {
        channel?.close();
      } catch {
        // Already closed.
      }
      if (phase === 'primary') {
        const release = holdRelease;
        holdRelease = null;
        release?.();
      }
    };
  }, [windowId]);

  return {
    phase,
    pending,
    beginTakeover: () => actionsRef.current.beginTakeover(),
    cancelTakeover: () => actionsRef.current.cancelTakeover(),
    declineTakeover: () => actionsRef.current.declineTakeover(),
  };
}

interface PrimaryBlockerProps {
  readonly phase: PrimaryPhase;
  readonly pending: boolean;
  readonly onBegin: () => void;
  readonly onCancel: () => void;
  readonly onDecline: () => void;
}

/**
 * The fullscreen prompt covering every non-primary window. It names the
 * situation, asks the one decision — make THIS window primary or not — and
 * keeps keyboard focus inside until takeover or the owner's close. The
 * primary button IS the confirmation: it starts the ordered handoff
 * immediately. Escape never dismisses it: a blocked window stays blocked. A
 * browser without Web Locks fails closed with an explanation instead.
 */
function PrimaryBlocker({
  phase,
  pending,
  onBegin,
  onCancel,
  onDecline,
}: PrimaryBlockerProps): React.JSX.Element | null {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDivElement>(null);
  const primaryActionRef = useRef<HTMLButtonElement>(null);

  // Land the keyboard on the explicit action (or the dialog while acquiring)
  // every time the prompt appears or moves to its next step.
  useEffect(() => {
    if (phase === 'primary') return;
    const frame = window.requestAnimationFrame(() => {
      (primaryActionRef.current ?? dialogRef.current)?.focus({ preventScroll: false });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [phase, pending]);

  const trapTab = (event: React.KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      return;
    }
    if (event.key !== 'Tab') return;
    const root = dialogRef.current;
    if (root === null) return;
    const focusables = Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled])'));
    if (focusables.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusables[0] as HTMLElement;
    const last = focusables[focusables.length - 1] as HTMLElement;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  if (phase === 'primary') return null;

  return (
    <div className="primary-blocker-backdrop" data-testid="primary-blocker">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="primary-blocker-title"
        className="card modal primary-blocker"
        tabIndex={-1}
        onKeyDown={trapTab}
      >
        {phase === 'acquiring' ? (
          <>
            <h2 id="primary-blocker-title" className="heading-tight">
              {t('app.primary.opening')}
            </h2>
            <div className="small note-meta modal-body">
              <p>{t('app.primary.checking')}</p>
            </div>
          </>
        ) : phase === 'unsupported' ? (
          <>
            <h2 id="primary-blocker-title" className="heading-tight">
              {t('app.primary.unsupportedTitle')}
            </h2>
            <div className="small note-meta modal-body">
              <p>{t('app.primary.unsupportedBody')}</p>
            </div>
          </>
        ) : pending ? (
          <>
            <h2 id="primary-blocker-title" className="heading-tight">
              {t('app.primary.takingOver')}
            </h2>
            <div className="small note-meta modal-body">
              <p>{t('app.primary.takingOverBody')}</p>
            </div>
            <div className="modal-actions">
              <button type="button" ref={primaryActionRef} className="btn" onClick={onCancel}>
                {t('common.cancel')}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id="primary-blocker-title" className="heading-tight">
              {t('app.primary.blockedTitle')}
            </h2>
            <div className="small note-meta modal-body">
              <p>{t('app.primary.blockedBody')}</p>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn" data-testid="primary-decline" onClick={onDecline}>
                {t('app.primary.decline')}
              </button>
              <button
                type="button"
                ref={primaryActionRef}
                className="btn btn-primary"
                data-testid="primary-takeover"
                onClick={onBegin}
              >
                {t('app.primary.takeover')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

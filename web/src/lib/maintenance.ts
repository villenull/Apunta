/**
 * The browser half of C-UPD@1's quiescence (FD1, FD2, FD8).
 *
 * One long-poll, armed once per window from `main.tsx` at module scope, and
 * three facts this module owns:
 *
 * - **the per-tab identity.** Generated once and kept in `sessionStorage`, so it
 *   survives a same-tab reload and is distinct across tabs and windows. It rides
 *   the registration's query string and is how the server matches a report to the
 *   window that sent it — and how a re-registering tab supersedes its own
 *   retained record (FD13). A window that cannot read `sessionStorage` registers
 *   without one, under a fresh per-connection id, and therefore never supersedes
 *   anything.
 * - **the per-document nonce.** One per page load, never stored, beside the tab
 *   id on the registration, the report and the beacon: the tab id names a slot and
 *   this names the page in it, which is what lets a clean claim act on its own
 *   record and no other.
 * - **the recording flag.** Its own `setRecordingActive` pair, published by one
 *   line in `Capture.tsx`'s dirty effect. **Not** `useReportWork`: that counter
 *   is module-private with a single reader, the Language control, and borrowing it
 *   would make the two features share a switch neither of them owns.
 * - **the flush.** `window.__apuntaFlushBeforeRelease`, called **if it is a
 *   function** — the hook is deleted by its own owner's cleanup, so a torn-down
 *   editor must not throw here — and reported as `ok` when it is absent, because a
 *   window with no editor has nothing to save.
 *
 * `flush()`'s three outcomes map onto the report exactly (FD8): clean;
 * `note.unsavedConflict` → `conflict`; `note.unsavedError` → `save_error`. The
 * mapping reads the **catalogue**, not a locale: the reporter registers no React
 * state and no i18n context, so it recognises the two sentences in either
 * language rather than guessing which one this window is showing.
 *
 * - **the save exemption.** The flush is itself a write, and maintenance mode
 *   refuses every write, so this module is what carries the quiesce's identity on
 *   that one save for exactly as long as the flush runs. See
 *   `noteSaveExemption` below, which is the client half of `flushSaveExempt` in
 *   `server/src/maintenance.ts`.
 * - **the last word (AM-215).** On `pagehide` this module sends one final report
 *   carrying the tab identity, the per-document nonce and whether the window holds
 *   anything: `clean` when the editor holds no unpersisted text and no recording
 *   is running. Only that claim discharges the server's retained record; `dirty`,
 *   a claim from a *different* document than the one holding the record, and a
 *   send that never arrives because the page died first, leave the fail-closed
 *   obligation alone.
 *
 * **Nothing here logs, retries with a backoff, or touches the SSE reader.**
 * `web/src/api/client.ts` applies no global timeout, so only this module's own
 * `AbortController` ends a poll: on `pagehide`, after a report is sent, and when
 * the server resolves it. Every one of those re-arms immediately.
 */

import { t } from '@apunta/shared';

/** The blockers a report may carry (FD8). `ok: true` requires an empty list. */
export type MaintenanceBlocker = 'conflict' | 'save_error' | 'recording' | 'unsaved_text';

export interface MaintenanceWaitAnswer {
  /**
   * `flush` asks this window to flush now; `expired` means re-arm and says
   * nothing about the hold; `settled` is the server's authoritative word on
   * the quiesce this window took part in (C-UPD@1).
   */
  readonly request: 'flush' | 'expired' | 'settled';
  readonly quiesceId: string;
  /** `settled` only: whether maintenance is still held. Only `false` lifts the freeze. */
  readonly held?: boolean;
}

/** Where the per-tab identity lives, in this tab's own storage. */
const TAB_ID_KEY = 'apunta-quiesce-tab';

/** How long to wait before re-arming after a failed poll, in ms. */
const REARM_DELAY_MS = 500;

type FlushHook = () => Promise<void>;

/**
 * Where the poll in flight is recorded on `window`, so a **hot reload** cannot
 * leave two of them running.
 *
 * A module-level flag cannot do this: a reload re-evaluates the module, and the
 * previous instance's poll would keep running inside a closure nothing can reach
 * any more. Parking it on the window is what the previous instance left behind,
 * so arming aborts it — and the **`owner`** is what makes that enough. An aborted
 * poll of a *previous* instance used to be caught by its own `once()`, waited
 * out and re-armed, because its own `running` flag was still true and nothing
 * told it it had been replaced. The owner check after the request settles is
 * what stops that: only the instance the host still points at re-arms, so a
 * hot reload (or a stop→start inside one page) leaves exactly one poll.
 *
 * The same namespaced-window-property shape `NoteView.tsx` already uses for
 * `__apuntaFlushBeforeRelease`.
 */
const POLL_HOST_KEY = '__apuntaMaintenancePoll';

interface PollRegistration {
  readonly controller: AbortController;
  /** This module instance's own token, so only the current one re-arms. */
  readonly owner: object;
  readonly stop?: () => void;
}

interface PollHost {
  [POLL_HOST_KEY]?: PollRegistration;
}

function pollHost(): PollHost {
  return window as unknown as PollHost;
}

/** This module instance's identity. Fresh on every evaluation, like the module. */
const OWNER = {};

let tabId: string | null | undefined;
/**
 * This **document's** nonce, minted once per page load.
 *
 * Module scope and never `sessionStorage`, on purpose. The tab id above is a
 * *slot* — it survives a same-tab reload, and Chromium's *Duplicate Tab* copies
 * it — so it cannot say which page is speaking, and the server cannot use it to
 * tell a live document from the one that has just replaced it. This can: two
 * documents in one tab, or two windows from one duplicated slot, never share it,
 * and it dies with the page.
 *
 * **Why the server needs it.** A clean close is only allowed to discharge the
 * record of the document that said so. A predecessor's beacon can arrive after
 * its successor has already registered under the same tab id, and a beacon that
 * banks itself on the successor's record turns a fail-closed outcome into a
 * fail-open one the moment the successor dies holding an edit. So it rides the
 * registration, the report and the beacon alike, beside the tab id.
 */
const docId = mintTabId();
/** Whether a microphone is running, published by `Capture.tsx`. */
let recordingActive = false;
/**
 * Whether the editor holds text the server has not acknowledged, published by the
 * `beforeunload` guard in `NoteView.tsx`.
 *
 * The editor's refs are not reachable from here and no draft of the note text is
 * stored anywhere in `web/src`, so the window that *does* know answers: the guard
 * already computes the condition, and it publishes it as it fires. A window with
 * no editor — or with an editor that has never been dirty — holds nothing, which
 * is the same clean answer.
 *
 * **The flag is reset when `NoteView` unmounts**, which is what keeps it honest
 * about the moment the page goes away: without that, a guard that fired once and
 * was then dismissed would leave `true` published for the rest of the tab's life
 * and every later clean close of that window would be refused — over nothing.
 */
let editorUnpersisted = false;
/**
 * Whether this window holds typed Capture text or an unpersisted recording
 * result: C-UPD@1's `unsaved_text`, an obligation of its own that saving a
 * note cannot clear and a generic flush never discards.
 */
let unsavedText = false;
/** Discards this window's own live recording; registered by `Capture.tsx`. */
let ownRecordingDiscard: (() => void) | null = null;
/** Whether the workspace is frozen for a quiesce that has not been released. */
let frozen = false;
const frozenListeners = new Set<() => void>();
let poll: AbortController | null = null;
let running = false;
let needsRegistrationState = false;

/** The stored failure counter, for the tests that watch the poll's lifecycle. */
function sessionStore(): Storage | null {
  try {
    return window.sessionStorage ?? null;
  } catch {
    // A browser with `sessionStorage` disabled throws on access, and a window
    // that cannot identify its tab still has to be able to register.
    return null;
  }
}

/** This tab's identity: minted once, reused after a same-tab reload. */
export function maintenanceTabId(): string | null {
  if (tabId !== undefined) return tabId;
  const store = sessionStore();
  const existing = store?.getItem(TAB_ID_KEY) ?? null;
  if (existing !== null && existing !== '') {
    tabId = existing;
    return tabId;
  }
  const minted = mintTabId();
  tabId = minted;
  // Best effort: if the write throws the id still works for this page's life,
  // it simply cannot supersede a retained record after a reload.
  try {
    store?.setItem(TAB_ID_KEY, minted);
  } catch {
    // Read-only storage, or a quota of zero. Not worth a report.
  }
  return tabId;
}

function mintTabId(): string {
  const webcrypto = globalThis.crypto;
  if (typeof webcrypto?.randomUUID === 'function') return webcrypto.randomUUID();
  // A browser without `crypto.randomUUID`: the id only has to be distinct within
  // this origin, and the timestamp plus a counter is distinct enough.
  return `tab-${String(Date.now())}-${String(Math.floor(Math.random() * 1_000_000_000))}`;
}

/** Publish whether a microphone is running. One line, from `Capture.tsx`. */
export function setRecordingActive(active: boolean): void {
  recordingActive = active;
}

/** Read by the flush, for the `recording` blocker the server never registers. */
export function isRecordingActive(): boolean {
  return recordingActive;
}

/**
 * Publish whether the editor holds text the server has not acknowledged. One
 * line, from `NoteView.tsx`'s `beforeunload` guard, and one more from the effect
 * that same guard lives in, which publishes `false` when the editor unmounts.
 *
 * It is published **as the guard fires**, not on every keystroke: the only
 * question is what is true at the moment the page goes away, and the refs that
 * answer it are the editor's.
 */
export function setEditorUnpersisted(unpersisted: boolean): void {
  editorUnpersisted = unpersisted;
}

/** Whether this window would report itself clean if it went away right now. */
export function isCleanToClose(): boolean {
  return !editorUnpersisted && !recordingActive && !unsavedText;
}

/** Publish whether this window holds typed Capture text or an unpersisted result. */
export function setUnsavedText(unsaved: boolean): void {
  unsavedText = unsaved;
}

export function isUnsavedText(): boolean {
  return unsavedText;
}

/** Register (or, with `null`, retract) the callback that discards this window's own recording. */
export function setOwnRecordingDiscard(discard: (() => void) | null): void {
  ownRecordingDiscard = discard;
}

/**
 * Discard this window's own running recording, and nobody else's: the flag it
 * reads is the one only this window's `Capture.tsx` publishes. Returns whether
 * a recording was discarded. The flag is cleared here, synchronously, so the
 * fresh close check that follows never reads the recording it just ended.
 */
export function discardOwnRecording(): boolean {
  if (!recordingActive || ownRecordingDiscard === null) return false;
  ownRecordingDiscard();
  recordingActive = false;
  return true;
}

const FREEZE_EVENTS = [
  'pointerdown',
  'click',
  'keydown',
  'keypress',
  'beforeinput',
  'paste',
  'drop',
] as const;

function blockWorkspaceInput(event: Event): void {
  if (!frozen) return;
  if (event.target instanceof Element && event.target.closest('.close-confirm, .recovery-view') !== null)
    return;
  event.preventDefault();
  event.stopImmediatePropagation();
}

function setFrozen(next: boolean): void {
  if (frozen === next) return;
  frozen = next;
  for (const listener of [...frozenListeners]) listener();
}

/** Read the server's current hold before mounting a new workspace, or reconnecting. */
export async function refreshWorkspaceHold(signal?: AbortSignal): Promise<void> {
  const response = await fetch(
    waitPath().replace('/wait?', '/status?'),
    signal === undefined ? {} : { signal },
  );
  if (!response.ok) throw new Error('Maintenance status is unavailable');
  const status: unknown = await response.json();
  if (
    typeof status !== 'object' ||
    status === null ||
    !('maintenance' in status) ||
    typeof status.maintenance !== 'boolean'
  )
    throw new Error('Invalid maintenance status');
  setFrozen(status.maintenance);
}

/** Whether a quiesce has frozen this window's workspace and not yet released it. */
export function isWorkspaceFrozen(): boolean {
  return frozen;
}

/** Subscribe to freeze changes; returns the unsubscribe. For `useSyncExternalStore`. */
export function subscribeWorkspaceFrozen(listener: () => void): () => void {
  frozenListeners.add(listener);
  return () => {
    frozenListeners.delete(listener);
  };
}

/**
 * `conflict` or `save_error` for whatever the flush threw, matched against the
 * catalogue in both languages so this module needs no locale of its own.
 */
function blockerFor(thrown: unknown): MaintenanceBlocker {
  const message = thrown instanceof Error ? thrown.message : String(thrown);
  for (const locale of ['en', 'es-MX'] as const) {
    if (message === t('note.unsavedConflict', {}, locale)) return 'conflict';
  }
  // Every other failure — including anything this module did not expect — is a
  // save that did not land. Fail closed: the quiesce is refused rather than
  // settled over text nobody can prove is on disk.
  return 'save_error';
}

/**
 * Flush the editor and report what happened. The report's own failure is
 * swallowed: a quiesce that cannot hear about this window will end `no_response`,
 * which is the honest answer, and nothing here should throw into a page unload.
 */
async function flushAndReport(quiesceId: string): Promise<void> {
  const blockers: MaintenanceBlocker[] = [];
  const hook = (window as unknown as { __apuntaFlushBeforeRelease?: unknown }).__apuntaFlushBeforeRelease;
  if (typeof hook === 'function') {
    try {
      // Inside the exemption, so the save the flush issues carries the quiesce
      // it is answering — see `noteSaveExemption`.
      await noteSaveExemption(quiesceId, async () => {
        await (hook as FlushHook)();
      });
    } catch (thrown) {
      blockers.push(blockerFor(thrown));
    }
  }
  if (isRecordingActive()) blockers.push('recording');
  if (isUnsavedText()) blockers.push('unsaved_text');
  try {
    await fetch(`${reportPath()}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ quiesceId, ok: blockers.length === 0, blockers }),
      keepalive: true,
    });
  } catch {
    // Offline, or the socket went away mid-report. See above.
  }
}

/** `/api/notes/<id>` and nothing else — never `/api/notes/<id>/chat`. */
const NOTE_SAVE_PATH = /^\/api\/notes\/[^/]+$/;

/** What the exemption adds to a save the flush makes. */
let exempted: string | null = null;

/**
 * The save exemption, from the browser's side (AM-213, and `flushSaveExempt` in
 * `server/src/maintenance.ts`).
 *
 * The editor's flush **is** a write — `PATCH /api/notes/:id` — and maintenance
 * mode refuses every write, so without this a quiesce asked while the editor
 * holds savable text is answered 503, the flush fails, and the quiesce is
 * refused: fail-closed, and a clean quiesce unreachable in exactly the case it
 * exists for. The server therefore exempts that one save for the duration of
 * the flush step, when it carries the quiesce's id **and** the reporting tab's
 * identity in the query string — the same place `tab` already rides.
 *
 * **The reporter owns that identity, and the editor's own code does not change
 * to accommodate it.** `NoteView.tsx` is not this protocol's to edit, and
 * `web/src/api/*` builds every URL itself, so the reporter decorates `fetch` for
 * exactly as long as the flush runs. The window is narrow on purpose:
 *
 * - only while a flush is in progress, restored in a `finally` whether the flush
 *   resolved or threw;
 * - only a `PATCH` whose path is `/api/notes/<id>` — every other method, path
 *   and this module's own report are passed straight through, untouched;
 * - only relative, same-origin URLs, which is what `web/src/api/client.ts:80`
 *   fetches, so an absolute URL to anywhere is never rewritten.
 *
 * A save that was **already in flight** when the quiesce arrived was issued
 * outside the exemption and is refused like any other write. That is honest
 * rather than convenient, and it is the server's ordinary 503 either way.
 */
async function noteSaveExemption<T>(quiesceId: string, flush: () => Promise<T>): Promise<T> {
  const tabId = maintenanceTabId();
  // No tab identity means no way to be recognised as a registered window, so
  // there is nothing to ask for; the save is refused and the flush says so.
  if (tabId === null || exempted !== null) return flush();

  // The **exact** original, not a bound copy of it: `fetch` needs `window` as its
  // receiver (the spec throws on any other), so it is called with `window` rather
  // than bound, and what goes back onto `window` afterwards is the very function
  // that was there before — so a second flush does not find a different object
  // than the first one left.
  const original = window.fetch;
  exempted = quiesceId;
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const exemptable = exemptableSave(input, init);
    if (exemptable === null) return original.call(window, input as RequestInfo, init);
    const exemptedUrl = withExemption(exemptable, quiesceId, tabId as string);
    // A `Request` or a `URL` keeps its own identity: it is rebuilt from the
    // rewritten URL rather than silently passed through, so the three shapes
    // `fetch` accepts all behave the same instead of two of them quietly losing
    // the exemption. The `Request` is rebuilt from an **absolute** URL, which is
    // the only form its constructor accepts.
    if (input instanceof Request) {
      return original.call(window, new Request(new URL(exemptedUrl, window.location.origin), input));
    }
    if (input instanceof URL) return original.call(window, exemptedUrl, init);
    return original.call(window, exemptedUrl, init);
  }) as typeof window.fetch;
  try {
    return await flush();
  } finally {
    window.fetch = original;
    exempted = null;
  }
}

/**
 * The relative, same-origin URL of a `PATCH /api/notes/<id>`, or `null` for
 * anything else.
 *
 * The three shapes `fetch` accepts are all handled, because two of them used to
 * pass straight through and lose the exemption with no sign: a `URL` is
 * necessarily absolute, and a `Request` carries its own method and its own
 * relative-to-origin absolute URL. Anything that is not same-origin, not a
 * `PATCH`, or not a note save is left exactly as it was — the exemption is for
 * one request, and guessing wider than that is how a flush ends up putting a
 * quiesce's identity onto a call it has nothing to do with.
 */
function exemptableSave(input: RequestInfo | URL, init?: RequestInit): string | null {
  const raw =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input instanceof Request
          ? input.url
          : null;
  if (raw === null) return null;
  const method = (init?.method ?? (input instanceof Request ? input.method : '')).toUpperCase();
  if (method !== 'PATCH') return null;
  let path: string;
  if (raw.startsWith('/')) {
    path = raw;
  } else {
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      return null;
    }
    // Never another origin, however it is spelled.
    if (parsed.origin !== window.location.origin) return null;
    path = `${parsed.pathname}${parsed.search}`;
  }
  return NOTE_SAVE_PATH.test(pathOf(path)) ? path : null;
}

/** A URL with its query string off, which is the route it is matched on. */
function pathOf(url: string): string {
  const mark = url.indexOf('?');
  return mark === -1 ? url : url.slice(0, mark);
}

/** The save's own query string, with this quiesce's identity added to it. */
function withExemption(url: string, quiesceId: string, tabId: string): string {
  const mark = url.indexOf('?');
  const base = mark === -1 ? url : url.slice(0, mark);
  const query = new URLSearchParams(mark === -1 ? '' : url.slice(mark + 1));
  query.set('quiesce', quiesceId);
  query.set('tab', tabId);
  // The document as well, because the server matches the whole identity: the
  // flush belongs to the page that was asked, never to one that used to hold
  // this tab's slot.
  query.set('doc', docId);
  return `${base}?${query.toString()}`;
}

function waitPath(): string {
  const id = maintenanceTabId();
  return id === null
    ? `/api/app/quiesce/wait?doc=${encodeURIComponent(docId)}`
    : `/api/app/quiesce/wait?tab=${encodeURIComponent(id)}&doc=${encodeURIComponent(docId)}`;
}

function reportPath(): string {
  const id = maintenanceTabId();
  return id === null
    ? `/api/app/quiesce/report?doc=${encodeURIComponent(docId)}`
    : `/api/app/quiesce/report?tab=${encodeURIComponent(id)}&doc=${encodeURIComponent(docId)}`;
}

function closePath(): string {
  const id = maintenanceTabId();
  return id === null
    ? `/api/app/quiesce/close?doc=${encodeURIComponent(docId)}`
    : `/api/app/quiesce/close?tab=${encodeURIComponent(id)}&doc=${encodeURIComponent(docId)}`;
}

/**
 * AM-215's last word, sent as this window goes away.
 *
 * **`navigator.sendBeacon`, not `fetch`.** Both survive a page teardown — the
 * browser keeps a keepalive request alive past the unload — but a beacon is the
 * one the platform makes the unload guarantee for: it is queued by the browser
 * itself, it is not tied to the document's lifetime, and it does not need a
 * promise anyone would have to await while the document is going away. The body
 * goes as a `Blob` typed `application/json` rather than a bare string, because a
 * bare string would be sent as `text/plain` and the route reads a JSON body; the
 * request is same-origin, so the non-safelisted content type costs nothing.
 *
 * **If the beacon is refused** — a quota, a browser without it — the fallback is
 * the same body through `fetch` with `keepalive`, which is what the report in
 * `flushAndReport` already uses. Nothing is retried: a window that cannot get
 * its word out is a window that crashed, which is one of the two states FD13's
 * fail-closed retention is written for.
 */
function sendCloseReport(): void {
  const id = maintenanceTabId();
  // With no identity there is no record to discharge and nothing to be
  // recognised by, so there is nothing to say.
  if (id === null) return;
  const body = JSON.stringify({ clean: isCleanToClose() });
  const beacon = navigator.sendBeacon;
  if (typeof beacon === 'function') {
    try {
      if (beacon.call(navigator, closePath(), new Blob([body], { type: 'application/json' }))) return;
    } catch {
      // Fall through to the keepalive fetch below.
    }
  }
  try {
    void fetch(closePath(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // A window that cannot report at all is a window that said nothing.
  }
}

function answer(value: unknown): MaintenanceWaitAnswer | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as { request?: unknown; quiesceId?: unknown; held?: unknown };
  if (typeof candidate.quiesceId !== 'string') return null;
  if (candidate.request === 'flush' || candidate.request === 'expired') {
    return { request: candidate.request, quiesceId: candidate.quiesceId };
  }
  if (candidate.request === 'settled' && typeof candidate.held === 'boolean') {
    return { request: 'settled', quiesceId: candidate.quiesceId, held: candidate.held };
  }
  return null;
}

/**
 * One poll, and the re-arm. Exactly one request is open at a time: the controller
 * is aborted before a new one is armed, and only the module instance the host
 * still points at re-arms, so a StrictMode double-render, a hot reload or a slow
 * server can never leave two polls competing for one window.
 */
async function once(): Promise<void> {
  if (!running) return;
  const controller = new AbortController();
  poll = controller;
  pollHost()[POLL_HOST_KEY] = { controller, owner: OWNER, stop: stopMaintenanceReporter };
  let rearm = 0;
  try {
    if (frozen && needsRegistrationState) {
      await refreshWorkspaceHold(controller.signal);
      needsRegistrationState = false;
    }
    const response = await fetch(waitPath(), { signal: controller.signal });
    if (response.ok) {
      const parsed = answer(await response.json());
      if (parsed?.request === 'flush') {
        // Freeze before acknowledging: nothing typed after this point can
        // escape the flush. Only an authoritative `settled{held:false}` lifts it.
        setFrozen(true);
        await flushAndReport(parsed.quiesceId);
        // The report is sent; this poll's job is done.
        controller.abort();
      } else if (parsed?.request === 'settled') {
        setFrozen(parsed.held === true);
        // A held word remains owed until an explicit release.
        if (parsed.held === true) rearm = REARM_DELAY_MS;
      }
    } else {
      needsRegistrationState = frozen;
      rearm = REARM_DELAY_MS;
    }
  } catch {
    // Aborted, offline, or a body that was not the answer. Both are ordinary:
    // the window re-arms and the server has simply not asked it anything.
    if (running && !controller.signal.aborted) needsRegistrationState = frozen;
    rearm = REARM_DELAY_MS;
  } finally {
    if (poll === controller) {
      poll = null;
      if (pollHost()[POLL_HOST_KEY]?.controller === controller) delete pollHost()[POLL_HOST_KEY];
    }
  }
  if (!running) return;
  // Anything left on the host belongs to somebody else: another instance of this
  // module took the poll over while this request was open, and re-arming here is
  // how a hot reload used to leave two of them running. Our own registration was
  // removed by the `finally` above, so "something is there" is exactly "it is not
  // mine" — and the abort this instance performed is not enough on its own,
  // because its `running` flag was still true.
  if (pollHost()[POLL_HOST_KEY] !== undefined) return;
  if (rearm > 0) await new Promise((done) => setTimeout(done, rearm));
  void once();
}

/**
 * Arm the reporter for this window. Called once from `main.tsx` at module scope,
 * outside the React tree, so `<StrictMode>`'s double-render cannot double-arm it
 * and no unmount has to tear it down. Arming twice is a no-op rather than a
 * second poll.
 */
export function startMaintenanceReporter(): void {
  // Idempotent while it is running: arming twice is one poll, not two.
  if (running) return;
  // Whatever a previous instance of this module left behind goes first, so this
  // window never holds two open polls at once.
  const previous = pollHost()[POLL_HOST_KEY];
  if (previous?.stop !== undefined) previous.stop();
  else previous?.controller.abort();
  running = true;
  for (const type of FREEZE_EVENTS) window.addEventListener(type, blockWorkspaceInput, true);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);
  void once();
}

/**
 * The window is going away: say whether it is leaving anything behind (AM-215),
 * then stop polling.
 *
 * **A bfcache-able hide is not a close.** `event.persisted` is the platform
 * saying "this document is going into the back/forward cache, not away", and on a
 * restore it comes back with its editor state — and its text — exactly as it was.
 * Treating that as a close is AM-215's claim told as a lie: the server would
 * discharge the record of a window that is merely hidden, and nothing would put
 * that window back on the register, because the poll was stopped too. So a
 * persisted hide says nothing, discharges nothing and keeps polling; `onPageShow`
 * re-arms the registration on the way back. A `persisted: false` hide is the
 * ordinary close and is handled exactly as before.
 *
 * The poll is aborted **before** the word goes out, on purpose. A window that is
 * really leaving is about to lose its socket, and the claim is only actionable
 * once the server has marked its record retained — a connected record is never
 * discharged by a claim, because a claim from one page is not evidence about
 * another page carrying the same tab identity. Aborting first makes
 * "socket closed, then claim" the ordinary order instead of a race between them.
 * The close report is not conditional on the tab identity being readable either:
 * a `dirty` word and no word at all are the same answer to the server, but the
 * server cannot tell them apart from silence, so saying it is strictly better
 * than not.
 */
function onPageHide(event: PageTransitionEvent): void {
  if (event.persisted) return;
  poll?.abort();
  sendCloseReport();
  stopMaintenanceReporter();
}

/**
 * A restored document re-arms its registration.
 *
 * Nothing was torn down for a persisted hide, so the honest thing is to make sure
 * this window is really on the register again — the server may have expired its
 * wait, and a document coming back out of a cache cannot read that. `once()`
 * re-arms itself after the abort, which is the same path every other end-of-poll
 * takes; a window whose reporter was stopped outright is armed afresh.
 */
function onPageShow(event: PageTransitionEvent): void {
  if (!event.persisted) return;
  if (!running) {
    startMaintenanceReporter();
    return;
  }
  poll?.abort();
}

/**
 * Undo `startMaintenanceReporter`, aborting the poll in flight.
 *
 * `onPageHide` is the production caller — and it has already said the window's
 * last word by then; the rest is the teardown a hot reload gets for free,
 * because the module owns its own lifecycle and has no React unmount to hook.
 * Calling this directly stops the poll **without** reporting, which is what a
 * test that wants to exercise the reporter alone wants.
 */
export function stopMaintenanceReporter(): void {
  running = false;
  poll?.abort();
  poll = null;
  for (const type of FREEZE_EVENTS) window.removeEventListener(type, blockWorkspaceInput, true);
  window.removeEventListener('pagehide', onPageHide);
  window.removeEventListener('pageshow', onPageShow);
}

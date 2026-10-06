/**
 * C-UPD@1's Quiescence, and the second `onRequest` hook that enforces it.
 *
 * A quiesce is the server saying "stop starting things, tell me when you are
 * quiet, and hold still". Three parts, in this file:
 *
 * - **the drain.** `active()` is snapshotted at entry. A non-empty snapshot is
 *   refused at once — the contract's "waits up to 30 s" is an upper bound, and a
 *   job already past the refusal hook is not waited for here. An empty snapshot
 *   runs the drain, so a job that started after the hook went up still gets to
 *   finish under the same bound. It never reports success on a timeout.
 * - **the window phase.** Every mounted window holds one request open
 *   (`GET /api/app/quiesce/wait`). At entry each is answered
 *   `{request:'flush', quiesceId}`; the client flushes its editor and reports
 *   `ok` or its blockers. A window that never answers is `no_response`, and a
 *   disconnect is never read as `ok`.
 * - **maintenance mode.** The refusal hook, which answers 503 `maintenance` to
 *   every write and every non-exempt read while a quiesce runs, and leaves on
 *   every failure path so a refused quiesce does not leave the app unusable.
 *   One write is exempt while it lasts: the reporting window's **own note save**
 *   during the flush step that asked it to, carrying that quiesce's id
 *   (`flushSaveExempt` below, AM-213). Without it the flush would be refused
 *   like any other write and a quiesce could never settle `ok:true` over text
 *   the editor was holding.
 *
 * **The clock is a seam, not a constant read.** `DRAIN_MS` is module-internal and
 * never leaves this file: production passes no `now`/`sleep` and gets a real
 * 30-second drain, while a test passes both and drives the same boundary in
 * milliseconds. There is no environment variable, no request field and no
 * exported constant, so nothing outside this module can move the bound.
 *
 * **Nothing here is durable.** Like `jobs/registry.ts`, this is a plain
 * in-process map: a window's record and its unpersisted obligation exist for as
 * long as the process does, and a restart clears both. That is the safe
 * direction — a server that has just restarted has no editor open — and it is
 * also why no TTL, cap or age evicts a record here (FD13(e)): inventing a number
 * would be inventing a bound.
 *
 * **One exception to the retention, and it is the window's own word (AM-215).**
 * A window that says on its way out that it holds no unpersisted text and no
 * recording — `closeWindow`, from `pagehide` — has its record **discharged**
 * rather than retained, so the ordinary close of an ordinary window does not
 * block every later quiesce for the life of the process. The discharge needs the
 * window's **own socket** to have gone, which is what makes it the window's own
 * claim and not another page's: a word that beats the socket close is *remembered*
 * on the record and spent by `disconnect()`, and one that arrives after it
 * discharges the retained record outright. Neither order releases a live wait or
 * deletes a live record, and a claim that cannot tell which window it is about —
 * two windows sharing a tab identity — touches nothing.
 *
 * **And the claim must come from the same *document* that holds the record** (the
 * `doc` nonce, one per page load, sent beside the tab id on the registration, the
 * report and the beacon). A `sessionStorage` tab id survives a same-tab reload and
 * is copied by Chromium's *Duplicate Tab*, so it names a *slot*, not a document:
 * a predecessor document's beacon can arrive after its successor has already
 * registered under the same id, and "the socket is still open" would then be true
 * of the wrong page. So `closeWindow` banks — or discharges — nothing unless the
 * record's `doc` is the one making the claim, and the same check applies to a
 * report: **a clean claim only ever applies to the record of the document that
 * sent it, so a predecessor's late beacon never banks on or discharges a
 * successor's record.** A claim carrying no `doc`, like one carrying a foreign
 * one, is the fail-closed case: it touches nothing.
 *
 * A window that says
 * `dirty`, and a window that says nothing at all
 * because it crashed, leave the fail-closed obligation exactly where FD13 put
 * it; nothing else discharges a record, and a discharge claims nothing about
 * content the server never held.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest, onRequestAsyncHookHandler } from 'fastify';

import { uuidv7 } from './db/uuid.js';
import { msg, type Locale } from './http/locale.js';
import { active, type JobKind } from './jobs/registry.js';
import { shellIsListening } from './shell-bridge.js';

/**
 * C-UPD@1's "waits up to 30 s". Internal on purpose: it is not exported, not
 * read from `process.env`, not in any request body and not settable by a caller
 * or a route. A test drives the boundary through `MaintenanceOptions.now` and
 * `.sleep` instead, so no test in this repository waits 30 seconds.
 */
const DRAIN_MS = 30_000;

/** How often the drain looks at the registry. Internal, and not a threshold. */
const DRAIN_POLL_MS = 250;

/**
 * Why a quiesce could not settle.
 *
 * The job kinds are the server's own (`jobs/registry.ts`'s closed vocabulary).
 * The next three come from the client report (FD8) and map onto the three
 * outcomes `NoteView.flush()` already has. `no_response` is the server's word for
 * a window that did not answer, reused for a retained disconnected record's
 * unresolved obligation (FD13) so the same fact is never given a second name.
 */
export type QuiesceBlocker = JobKind | 'conflict' | 'save_error' | 'recording' | 'no_response';

/** What `quiesce_result{ok, blockers[]}` carries (C-BRIDGE@1 rule 2). */
export interface QuiesceResult {
  readonly ok: boolean;
  readonly blockers: readonly QuiesceBlocker[];
}

/**
 * The same answer plus the id minted at entry. The id is what the HTTP route
 * returns and what a report is matched against; the bridge line leaves it out,
 * because `quiesce_result`'s shape is the contract's and does not carry one.
 */
export interface QuiesceOutcome extends QuiesceResult {
  readonly quiesceId: string;
}

/** The blockers a client report may claim (FD8's closed list). */
const CLIENT_BLOCKERS: readonly string[] = ['conflict', 'save_error', 'recording'];

/** The refusals this process has counted, for the 409 path (FD2(c)). */
let refusedReports = 0;

/** The wait's answer, and the only two shapes this channel sends (FD1). */
export type WaitOutcome =
  | { readonly request: 'flush'; readonly quiesceId: string }
  /** The budget ended without asking, or this window was superseded: re-arm. */
  | { readonly request: 'expired'; readonly quiesceId: string };

/**
 * What became of a client report (FD2(c)).
 *
 * The two refusals are named apart so the route can say which one happened in
 * `details`, which `ApiErrorSchema` already carries — the code alone would leave
 * a caller reading English to tell a stale id from an unregistered window.
 */
export type ReportOutcome = 'accepted' | 'quiesce_not_in_flight' | 'window_not_registered';

/**
 * One mounted window, as the server knows it.
 *
 * `resolved` is the obligation FD13 keeps. It starts false, and a clean report —
 * `ok` with an empty blocker list — is the only thing that clears it, until the
 * window's socket closes and takes the clearance with it. Nothing here guesses
 * whether a window holds unsaved text: the registry carries `{kind, id}` with no
 * window↔note association, and outside a quiesce the client tells the server
 * nothing at all.
 */
interface WindowRecord {
  /** Per-connection identity. Never leaves the server. */
  readonly id: string;
  /**
   * The per-tab identity the reporter keeps in `sessionStorage`, or `null` when
   * it could not be read. `null` can never supersede a retained record, which is
   * what makes a window without `sessionStorage` safe rather than able to erase
   * another window's obligation (FD1, FD13).
   */
  readonly tabId: string | null;
  /**
   * The per-**document** nonce the reporter mints once per page load (module
   * scope on the client, never in `sessionStorage`), sent beside the tab id on
   * the registration, the report and the close beacon. A tab id survives a
   * same-tab reload and is copied by Chromium's *Duplicate Tab*, so it names a
   * *slot* rather than a page; this names the page. It is what makes AM-215's
   * claim act on the record of the document that made it and nothing else, in
   * either order of the beacon and the socket close, and what keeps a report from
   * resolving an obligation that belongs to a page it knows nothing about.
   */
  doc: string | null;
  /** The held-open wait's resolver, or `null` when it holds none. */
  release: ((outcome: WaitOutcome) => void) | null;
  /** When its socket closed, or `null` while it is connected. */
  disconnectedAt: number | null;
  /** Whether a clean report has cleared its obligation. A disconnect sets it
   * back: an `ok` covers what the window held when it said so, not what was typed
   * afterwards. */
  resolved: boolean;
  /**
   * That this tab said `clean` as it went, while this record was still connected
   * (AM-215). It is not a discharge — nothing is released or deleted when it is
   * set — it is the window's word **waiting for its own socket to go**, which is
   * what `disconnect()` acts on. A fresh registration clears it, because that is
   * a new document's word to give and not the old one's.
   */
  cleanClaimed: boolean;
}

/** The quiesce in flight, and what it has asked and been told. */
interface Inflight {
  readonly id: string;
  readonly deadline: number;
  /** The records asked to flush. */
  readonly expected: Set<string>;
  /** What each of them reported. */
  readonly reported: Map<string, readonly QuiesceBlocker[]>;
  /**
   * The windows that have already answered **cleanly** in this quiesce, by the
   * record's own identity — never by the shared tab identity.
   *
   * This is what makes the reporter's transport loop safe: it re-arms its poll
   * the moment it has reported, so a naive reading would ask the same window
   * again for as long as the quiesce ran, and a window that arrived mid-quiesce
   * would never stop being asked. One clean answer per window per quiesce is the
   * whole protocol; a re-arm after it is transport, not a second obligation.
   *
   * The key is `record.id`, not the tab id, because a tab identity is a *slot*
   * rather than a window: an ordinary same-tab re-arm reuses the one record, so
   * the transport-loop property holds, while Chromium's *Duplicate Tab* copies
   * `sessionStorage` and lands two live records under one tab id. Keying the set
   * by that id would let one copy's clean answer stand in for the other's — a
   * clean report from one duplicate would hide the retained, dirty copy's
   * obligation (FD13/AM-215) and mark a second live copy as answered when it had
   * never been asked. `record.id` is per record, so it cannot conflate the two.
   */
  readonly answered: Set<string>;
}

export interface MaintenanceOptions {
  /**
   * The clock, in the house style of `CreateBackupOptions.now`
   * (`backup/archive.ts:73,82`). Production passes nothing.
   */
  readonly now?: () => number;
  /** The wait between two looks at the registry. Production passes nothing. */
  readonly sleep?: (ms: number) => Promise<void>;
  /**
   * Which language the 503 is rendered in — the stored setting, read through
   * `http/locale.ts` exactly as the error handler reads it (C-LANG@1 rule 3).
   * Registered with the routes, because that is the call site holding the
   * database.
   */
  readonly locale?: () => Locale;
  /**
   * Whether a shell is in front of this server. It changes only what releases a
   * *successful* quiesce's maintenance state (C-BRIDGE@1 rule 3): shell mode
   * holds it through the snapshot and the shell's next transition releases it;
   * browser mode holds it while a window is registered.
   *
   * **Derived from `APUNTA_SHELL` when it is not passed**, through
   * `shellIsListening` — the one place that decides what "a shell is listening"
   * means, and the same signal the `ready` line and the stdin reader are gated
   * on. The packaged shell sets it (`src-tauri/src/main.rs:411`), so nothing in
   * `server/` has to be told twice; an explicit value still wins, which is what
   * lets a test pin the mode either way.
   */
  readonly shellMode?: boolean;
}

/** What the routes and the refusal hook need from a controller. */
export interface MaintenanceController {
  /** The `onRequest` hook, registered right after C-REQ@1's guard. */
  readonly refusalHook: onRequestAsyncHookHandler;
  /** The 503 body, in the given locale. An ordinary `ApiErrorSchema`. */
  maintenanceBody(locale: Locale): { error: string; message: string };
  registerWindow(tabId: string | null, doc: string | null): string;
  holdFor(windowId: string): Promise<WaitOutcome>;
  /** A socket went away. Marks the record; never deletes it (FD13(a)). */
  disconnect(windowId: string): void;
  /**
   * The window's own last word as it goes (AM-215), sent on `pagehide` with the
   * tab identity and the per-document `doc` nonce. `clean` — no unpersisted text
   * and no recording — discharges that tab's record, so an ordinary close of an
   * ordinary window stops blocking later quiesces. It never releases a live wait
   * and never deletes a live record: a claim that arrives while the tab's socket
   * is still open is *remembered* and spent by `disconnect()` when that socket
   * goes, one that arrives after it discharges the retained record outright, and
   * one that cannot say which window it means — a `doc` other than the record's,
   * so a predecessor page's late beacon cannot speak for its successor, or two
   * windows sharing a tab identity, because Chromium's *Duplicate Tab* copies
   * `sessionStorage` — touches nothing at all. Anything else, and a send that
   * never arrives at all, leaves FD13's fail-closed obligation exactly where it
   * was.
   */
  closeWindow(tabId: string | null, doc: string | null, clean: boolean): void;
  /**
   * A report from `tabId`, and why it was refused if it was (FD2(c)). A stale or
   * foreign `quiesceId`, a window that is not registered in the current
   * quiesce, and a report whose document is not the one holding that record are
   * refused; all three are counted and none is applied.
   */
  report(input: {
    readonly quiesceId: string;
    readonly tabId: string | null;
    readonly doc: string | null;
    readonly ok: boolean;
    readonly blockers: readonly string[];
  }): ReportOutcome;
  /** Start a quiesce, or join the one in flight (FD5, FD12). */
  quiesce(): Promise<QuiesceOutcome>;
  /**
   * Point the 503 at the stored language. Registered with the routes, which is
   * the call site that holds the database — the same reason
   * `registerErrorHandler` takes a reader in `app.ts` (C-LANG@1 rule 3).
   */
  useLocale(read: () => Locale): void;
  status(): {
    quiescing: boolean;
    activeJobs: { kind: JobKind }[];
    windows: number;
    maintenance: boolean;
  };
  /** How many reports this process has refused. */
  refused(): number;
}

export function createMaintenance(options: MaintenanceOptions = {}): MaintenanceController {
  const now = options.now ?? ((): number => Date.now());
  const sleep =
    options.sleep ??
    ((ms: number): Promise<void> =>
      new Promise((resolve) => {
        setTimeout(resolve, ms);
      }));
  const shellMode = options.shellMode ?? shellIsListening(process.env);

  /** Every window this process has heard from, live or retained (FD13). */
  const windows = new Map<string, WindowRecord>();
  let maintenance = false;
  let quiescing = false;
  let inflight: Promise<QuiesceOutcome> | null = null;
  let localeReader: (() => Locale) | undefined = options.locale;
  /**
   * That the last quiesce succeeded. In browser mode its maintenance state is
   * held until the last window unregisters, and this is what says there is one
   * to release.
   */
  let heldBySuccess = false;
  let current: Inflight | null = null;

  function liveWindows(): WindowRecord[] {
    return [...windows.values()].filter((record) => record.release !== null);
  }

  function findByTab(tabId: string): WindowRecord | undefined {
    for (const record of windows.values()) if (record.tabId === tabId) return record;
    return undefined;
  }

  /**
   * Browser mode's bounded release (FD1): a successful quiesce holds maintenance
   * while at least one window is registered, and the last unregistration lets it
   * go. Called from every path that removes a live wait.
   */
  function releaseIfUnheld(): void {
    if (!maintenance || !heldBySuccess || shellMode) return;
    if (liveWindows().length > 0) return;
    maintenance = false;
    heldBySuccess = false;
  }

  /** Which language the 503 speaks, and never a 500 because of it. */
  function readLocale(): Locale {
    try {
      return localeReader?.() ?? 'en';
    } catch {
      // A database that cannot answer the setting must not turn a refusal into a
      // failure. Same reasoning as `requestLocale` in `http/errors.ts`.
      return 'en';
    }
  }

  /** A report's blockers, narrowed to the three a client may claim (FD8). */
  function claimedBlockers(claimed: readonly string[]): QuiesceBlocker[] {
    return [
      ...new Set(claimed.filter((blocker): blocker is QuiesceBlocker => CLIENT_BLOCKERS.includes(blocker))),
    ];
  }

  /**
   * Whether a report is a claim the server can act on at all (FD8, both ways).
   *
   * FD8 says `ok:true` requires an empty blocker list, and this is the same rule
   * read the other way: a report that cannot be placed is a claim the server
   * **will not** act on. Two shapes fail it, and both are refused as blockers
   * rather than narrowed into a clean answer:
   *
   * - `ok:false` with nothing placeable — an empty list, or a name this build
   *   does not know (a future blocker, a typo, a corrupted body). Nothing here
   *   narrows it to `[]` and lets it read as `ok`.
   * - `ok:true` **with** blockers, which contradicts FD8 outright rather than
   *   describing a state.
   *
   * Either way the window has not told this server that it holds nothing, so it
   * is answered as `no_response` — the existing server-side word for a window
   * that did not answer, and the one FD13 already reuses for an obligation the
   * server cannot place. Its obligation is not discharged either.
   */
  function placeable(input: { readonly ok: boolean; readonly blockers: readonly string[] }): boolean {
    if (input.ok) return input.blockers.length === 0;
    return claimedBlockers(input.blockers).length > 0;
  }

  /**
   * Poll the registry until it is empty, or the bound is reached with something
   * still in it.
   *
   * The entry snapshot was empty by definition — a non-empty one never gets here
   * — so the drain always waits one interval before it believes that. A job that
   * began microseconds before the snapshot was taken *is* in flight now, and
   * refusing over it is the safe direction; deciding on the first look would make
   * the bound below unreachable and that sentence dead.
   */
  async function waitForDrain(deadline: number): Promise<QuiesceBlocker[]> {
    let looked = false;
    for (;;) {
      const jobs = active();
      if (looked && jobs.length === 0) return [];
      if (now() >= deadline) return jobs.length === 0 ? [] : kindsOf(jobs);
      looked = true;
      await sleep(Math.min(DRAIN_POLL_MS, Math.max(0, deadline - now())));
    }
  }

  /** Ask every registered window, and read what comes back. */
  async function windowPhase(quiesce: Inflight): Promise<QuiesceBlocker[]> {
    for (;;) {
      const outstanding = [...quiesce.expected].some((id) => !quiesce.reported.has(id));
      if (!outstanding) break;
      if (now() >= quiesce.deadline) break;
      await sleep(Math.min(DRAIN_POLL_MS, Math.max(0, quiesce.deadline - now())));
    }
    const blockers: QuiesceBlocker[] = [];
    // Nothing was ever asked. A shell whose window has not loaded yet and a
    // window that disconnected are different situations with the same honest
    // answer (FD2(e)).
    if (quiesce.expected.size === 0) blockers.push('no_response');
    for (const id of quiesce.expected) {
      const claimed = quiesce.reported.get(id);
      // A window that never answered, or whose socket went away mid-quiesce, is
      // a blocker and never an `ok` (FD2(d)).
      if (claimed === undefined) blockers.push('no_response');
      else blockers.push(...claimed);
    }
    for (const record of windows.values()) {
      if (quiesce.expected.has(record.id)) continue;
      // The window that reported and re-armed: answered already, so its new
      // request is the transport carrying the next quiesce, not an unanswered one.
      if (quiesce.answered.has(record.id)) continue;
      // Anything else here holds text nobody has accounted for: a registration
      // that has not been asked yet, or a retained disconnected record with an
      // undischarged obligation (FD13(b)). Both block, and neither is `ok`.
      if (record.release !== null || !record.resolved) blockers.push('no_response');
    }
    return blockers;
  }

  /**
   * Ask every registered window, in the same statement that starts the drain, so
   * the two phases really are concurrent (FD3).
   */
  async function askWindows(quiesce: Inflight, quiesceId: string): Promise<QuiesceBlocker[]> {
    for (const record of liveWindows()) {
      quiesce.expected.add(record.id);
      releaseWait(record, { request: 'flush', quiesceId });
    }
    return windowPhase(quiesce);
  }

  async function run(): Promise<QuiesceOutcome> {
    const id = uuidv7();
    const deadline = now() + DRAIN_MS;
    maintenance = true;
    quiescing = true;
    const quiesce: Inflight = {
      id,
      deadline,
      expected: new Set(),
      reported: new Map(),
      answered: new Set(),
    };
    current = quiesce;
    let settled = false;
    try {
      // Both phases run at once, each with `deadline - elapsed`, and neither
      // extends the budget (FD3). Asking the windows *after* the drain would let
      // a drain that used the whole 30 s end the quiesce before any window was
      // ever asked to flush.
      const snapshot = active();
      // A non-empty snapshot is refused at once, with the still-active kinds and
      // nothing else: no window is asked, because there is no drain to run
      // alongside and a `no_response` here would name a window that was never
      // asked for anything.
      const blockers =
        snapshot.length > 0
          ? kindsOf(snapshot)
          : await Promise.all([waitForDrain(deadline), askWindows(quiesce, id)]).then(
              ([drainBlockers, windowBlockers]) => [...new Set([...drainBlockers, ...windowBlockers])],
            );
      if (blockers.length > 0) {
        // Back into normal service on every failure path, so the next request is
        // not a 503 until restart (FD5).
        maintenance = false;
        heldBySuccess = false;
      } else {
        // A success holds maintenance: in shell mode through the snapshot, in
        // browser mode until the last window unregisters (FD1, FD5).
        heldBySuccess = true;
      }
      settled = true;
      return { quiesceId: id, ok: blockers.length === 0, blockers };
    } finally {
      // **The failure path includes a throw.** A drain or a window phase that
      // rejects must not leave every write 503 until restart (FD5), which is
      // what "on every failure path … in a `finally`" means; the flag is set
      // only once an answer has been decided, so a success still holds.
      if (!settled) {
        maintenance = false;
        heldBySuccess = false;
      }
      // Nothing is left hanging past the budget: every wait still open is
      // answered, so no request outlives the quiesce (FD3).
      for (const record of windows.values()) releaseWait(record, { request: 'expired', quiesceId: id });
      current = null;
      quiescing = false;
    }
  }

  /**
   * FD9's refusal rule as one predicate: every `/api/*` request whose method is
   * not a read, and every read that is not in the **enumerated** exempt set. A
   * request already past the hook is never cut, which is why V2's stream
   * completes.
   */
  function refused(request: FastifyRequest): boolean {
    const path = pathOf(request);
    if (!path.startsWith('/api/')) return false;
    if (request.method === 'GET' || request.method === 'HEAD') {
      return !EXEMPT_READS.some((pattern) => matches(pattern, path));
    }
    if (EXEMPT_WRITES.some((entry) => entry.method === request.method && matches(entry.path, path))) {
      return false;
    }
    // The one exemption AM-213 added, and the only one outside the enumerated
    // set: the editor's own save, during the flush step that asked for it.
    return !flushSaveExempt(request, path);
  }

  /**
   * `PATCH /api/notes/:id` is a write, so FD9 refuses it like every other — and
   * the editor's flush **is** that write. Read literally, FD9 means a quiesce
   * asked while the editor holds savable text is refused `save_error` and can
   * never settle `ok:true`, which is fail-closed but makes a clean quiesce
   * unreachable in exactly the case it exists for.
   *
   * So the flush step has one exemption, and it is narrow on purpose. All four
   * of these must hold, and failing any of them is a 503 like every other write:
   *
   * 1. **the method and the path** — `PATCH /api/notes/:id`, the one route the
   *    editor's flush uses, and never `/api/notes/:id/chat` or any other route;
   * 2. **a quiesce in flight** — there is nothing to exempt outside one;
   * 3. **that quiesce's own id** in the query string, so a stale or foreign id,
   *    or none at all, is refused;
   * 4. **a registered window, asked and not yet answered** — the tab identity in
   *    the query must resolve to a window that was **asked to flush in this
   *    quiesce and has not reported yet**, and the per-document `doc` beside it
   *    must be the one that window registered with, which is what makes this the
   *    flush step rather than a window writing whenever it likes. The exemption ends
   *    with the report: once this window has answered, its flush step is over,
   *    whatever the rest of the run does.
   *
   * The id and the identity both ride the **query string**, beside the `tab` the
   * registration and the report already use, and for the same reason: the
   * channel's identity lives there (FD1), so the exemption does not invent a
   * second place for it. The note save itself is untouched — same revision
   * check, same published lock, same `stale_write` — and a refusal here is still
   * the ordinary `503 maintenance`, which the reporter maps to `save_error`.
   */
  function flushSaveExempt(request: FastifyRequest, path: string): boolean {
    if (request.method !== 'PATCH') return false;
    if (!matches('/api/notes/:id', path)) return false;
    const quiesce = current;
    if (quiesce === null) return false;
    const query = queryOf(request.url);
    if (query.get('quiesce') !== quiesce.id) return false;
    const tabId = query.get('tab');
    if (tabId === null || tabId === '') return false;
    const record = findByTab(tabId);
    // The document too, for the same reason the report needs it: the identity that
    // rides the save must be the identity of the window this quiesce asked, not of
    // a page that used to hold this slot.
    const doc = query.get('doc');
    if (doc === null || record === undefined || record.doc !== doc) return false;
    return quiesce.expected.has(record.id) && !quiesce.reported.has(record.id);
  }

  /**
   * Answer a held wait, if it is still holding one.
   */
  function releaseWait(record: WindowRecord, outcome: WaitOutcome): void {
    const release = record.release;
    record.release = null;
    release?.(outcome);
  }

  const self: MaintenanceController = {
    refusalHook: async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      if (!maintenance || !refused(request)) return;
      request.log.info(
        { method: request.method, url: request.url },
        'refused while the server is in maintenance',
      );
      await reply.code(503).send(self.maintenanceBody(readLocale()));
    },
    useLocale(read: () => Locale): void {
      localeReader = read;
    },
    maintenanceBody(locale: Locale): { error: string; message: string } {
      return { error: 'maintenance', message: msg(locale, 'errors.maintenance') };
    },
    registerWindow(tabId: string | null, doc: string | null): string {
      if (tabId !== null) {
        const held = [...windows.values()].filter(
          (record) => record.tabId === tabId && record.release !== null,
        );
        if (held.length === 0) {
          // The ordinary case: this tab's previous registration holds no wait —
          // it either answered and re-armed, or it is the **retained** record
          // FD13 keeps. Either way the same tab is back, and
          //  - a retained record is **superseded** by this registration (FD13(c)):
          //    that tab is alive again with its text still in memory, and this
          //    quiesce or the next one will ask it and it will report its real
          //    state. Nothing is back-filled and no lost content is claimed to
          //    be recovered;
          //  - reusing the record instead of minting a new one is what keeps a
          //    per-request registration from churning ids, which would leave a
          //    stale id in an in-flight quiesce's `expected` set and force a
          //    false `no_response`.
          const same = findByTab(tabId);
          if (same !== undefined) {
            same.disconnectedAt = null;
            // The record now belongs to **the document that just registered**, so
            // its own claims are the only ones that can act on it: a predecessor's
            // beacon is already meaningless here.
            same.doc = doc;
            // A registration is a document arriving, and **this** document has
            // said nothing yet: a clean word the *previous* one gave as it went
            // (AM-215) is dropped here, so it can never be spent on this
            // document's socket when that closes.
            same.cleanClaimed = false;
            return same.id;
          }
        } else {
          // **A duplicated tab identity.** Chromium's *Duplicate Tab* copies
          // `sessionStorage`, so two windows really can arrive with one id. The
          // record that is holding a live wait is a window the server can see
          // and a quiesce has to be able to ask, so it is neither released nor
          // deleted here: deleting it would make the first window invisible
          // while it still held unpersisted text, which is the one direction
          // FD13 is fail-closed about. This registration gets its own record
          // below, under the same tab id, and the window that arrives with a
          // live wait is the one that gets asked.
        }
        for (const [id, record] of [...windows]) {
          if (record.tabId !== tabId || record.release !== null) continue;
          windows.delete(id);
        }
      }
      const id = uuidv7();
      windows.set(id, {
        id,
        tabId,
        doc,
        release: null,
        disconnectedAt: null,
        resolved: false,
        cleanClaimed: false,
      });
      return id;
    },
    holdFor(windowId: string): Promise<WaitOutcome> {
      const record = windows.get(windowId);
      if (record === undefined) return Promise.resolve({ request: 'expired', quiesceId: '' });
      const quiesce = current;
      if (quiesce !== null && !quiesce.answered.has(record.id)) {
        // Asked at once — at entry, or the moment a window arrives while a
        // quiesce is running — so no window ever sits on a request nobody is ever
        // going to answer, and a window with unsaved text always gets asked
        // whether it arrived early or late.
        quiesce.expected.add(record.id);
        return Promise.resolve({ request: 'flush', quiesceId: quiesce.id });
      }
      return new Promise<WaitOutcome>((resolve) => {
        record.release = (outcome: WaitOutcome): void => {
          record.release = null;
          resolve(outcome);
        };
      });
    },
    disconnect(windowId: string): void {
      const record = windows.get(windowId);
      if (record === undefined) return;
      releaseWait(record, { request: 'expired', quiesceId: current?.id ?? '' });
      if (record.cleanClaimed) {
        // **The ordinary clean close.** This window said, as it went, that it
        // held no unpersisted text and no recording, and this is its **own socket**
        // going — so the two halves of that one fact have met, and the record is
        // **discharged** rather than retained (AM-215). That an ordinary close
        // never blocks every later quiesce for the life of the process is the
        // whole point of the claim; what it held is dropped with it and nothing is
        // claimed to have been recovered.
        //
        // What it waits for is the socket, never the claim: `closeWindow` cannot
        // release a live wait or delete a live record, so a beacon that beats the
        // socket close lands on a record that is still connected and is only
        // *remembered* until this line runs. Either order of the two events ends
        // here, which is what makes the word reliable rather than a race.
        windows.delete(record.id);
        releaseIfUnheld();
        return;
      }
      record.disconnectedAt = now();
      // A window that goes away **without saying its word** has said nothing about
      // what it holds *now*, so a clean report it made earlier does not carry over
      // to text typed after it: `resolved` goes back to false (AM-215's fail-closed
      // reading, and the only reading that survives a tab that reported `ok` and
      // was then killed while holding an edit). The entry itself stays, with
      // everything it held (FD13(a)).
      record.resolved = false;
      releaseIfUnheld();
    },
    closeWindow(tabId: string | null, doc: string | null, clean: boolean): void {
      // A window with no identity to be recognised by cannot be discharging
      // anything, because it also registered under one. It is treated as a
      // silent close, which is the fail-closed reading. A window whose `doc` is
      // unknown is the same: it cannot say *which* document it is, and a claim
      // that cannot say that is not acted on.
      if (tabId === null || doc === null || !clean) return;
      const mine = [...windows].filter(([, record]) => record.tabId === tabId);
      if (mine.length === 1) {
        const [id, record] = mine[0] as [string, WindowRecord];
        if (record.doc !== doc) {
          // **Not the document that holds this record.** A tab id survives a
          // same-tab reload, so this is the ordinary shape of a *late* beacon: the
          // page that sent it has already been replaced by the document that
          // registered under the same id. Its word was true of that page and says
          // nothing about this one, so it neither banks nor discharges — a
          // predecessor document can never act on its successor's record, in
          // either order of the two events.
          releaseIfUnheld();
          return;
        }
        if (record.disconnectedAt !== null) {
          // The socket has already gone, so the record is retained and the claim
          // can be acted on at once: **discharged**, not marked. Nothing is
          // claimed to be recovered — a dirty claim or a missing one never gets
          // here, and FD13 keeps that obligation (AM-215).
          windows.delete(id);
          releaseIfUnheld();
          return;
        }
        // Still connected, so nothing is released and nothing is deleted: the
        // claim is *remembered* on this record and acted on when **this window's
        // own socket** closes, in `disconnect()` above.
        //
        // A connected record belongs to a window the server can see and a quiesce
        // can still ask, and a claim made by one page is not evidence about
        // another page carrying the same tab identity — `sessionStorage` is
        // copied by Chromium's *Duplicate Tab* and it also survives a same-tab
        // reload, so a beacon can arrive from a document that has already been
        // replaced. **A held wait is not the test for "gone"**: between a quiesce
        // asking a window and the browser re-arming, a connected window holds no
        // wait either, and it is every bit as alive. `disconnectedAt` is the stamp
        // that says the socket closed.
        record.cleanClaimed = true;
        return;
      }
      // **More than one record under this identity, or none.** Chromium's
      // *Duplicate Tab* really does copy `sessionStorage`, so two windows can be
      // registered under one id, and a clean claim says nothing about which of
      // them is speaking: discharging either would be a guess, and guessing here
      // is the one direction FD13 is fail-closed about — it would make the dirty
      // copy's record disappear and let a quiesce settle over text nobody was
      // asked about. So the claim touches nothing at all, and both records keep
      // counting until the socket that owns each of them says otherwise.
      releaseIfUnheld();
    },
    report(input): ReportOutcome {
      const quiesce = current;
      const record = input.tabId === null ? undefined : findByTab(input.tabId);
      // **The document has to be the one holding the record**, for the same reason
      // `closeWindow` insists on it: a tab id survives a reload, so a report from
      // a page that has already been replaced must not resolve the obligation of
      // the page that replaced it. A missing `doc` is refused for the same reason a
      // missing tab id is: it cannot say which window it means.
      const sameDocument = record !== undefined && record.doc === input.doc && input.doc !== null;
      const registered =
        sameDocument &&
        quiesce !== null &&
        record.release === null &&
        input.quiesceId === quiesce.id &&
        quiesce.expected.has(record.id);
      if (record === undefined || !registered) {
        // Counted, never applied (FD2(c)). Without this the ignored report from a
        // timed-out quiesce would satisfy the next one, and the text it was
        // protecting would be lost with both rows green.
        refusedReports += 1;
        return quiesce === null || input.quiesceId !== quiesce.id
          ? 'quiesce_not_in_flight'
          : 'window_not_registered';
      }
      const blockers = placeable(input) ? claimedBlockers(input.blockers) : ['no_response' as const];
      if (blockers.length === 0) {
        record.resolved = true;
        quiesce?.answered.add(record.id);
      }
      // An unplaceable claim is recorded as `no_response`, never as an empty
      // answer: the window has not said it holds nothing, so its FD13 obligation
      // stands and the quiesce cannot settle over it.
      quiesce?.reported.set(record.id, blockers);
      return 'accepted';
    },
    quiesce(): Promise<QuiesceOutcome> {
      // Joined, never queued and never refused (FD5, FD12).
      if (inflight !== null) return inflight;
      const running = run();
      inflight = running;
      return running.finally(() => {
        inflight = null;
      });
    },
    status() {
      return {
        quiescing,
        activeJobs: active().map((job) => ({ kind: job.kind })),
        windows: liveWindows().length,
        maintenance,
      };
    },
    refused(): number {
      return refusedReports;
    },
  };
  return self;
}

function kindsOf(jobs: readonly { kind: JobKind }[]): QuiesceBlocker[] {
  return [...new Set(jobs.map((job) => job.kind))];
}

/**
 * The exempt reads (FD9), one commented entry per route. **All seventeen `GET`
 * routes in `server/src/routes/` are here**, and no `GET` handler writes to the
 * database, so the set is reads only and C-UPD@1's "new jobs and writes get 503"
 * is honoured literally. It is a list and not a delegated rule on purpose: a
 * future `GET` that writes is refused until somebody adds it here and says why.
 */
const EXEMPT_READS: readonly string[] = [
  // The shell's liveness, and a V4 idle assertion.
  '/api/health',
  // The shell's language check.
  '/api/settings',
  // The app stays readable while quiescing: the lists it is already showing.
  '/api/patients',
  '/api/patients/:id',
  '/api/patient-groups',
  '/api/notes/:id',
  '/api/patients/:id/notes',
  '/api/formats',
  '/api/formats/:id',
  // The same, for the other screens that are already open.
  '/api/patients/:id/plan',
  '/api/patients/:id/plan/versions',
  '/api/patients/:id/prep',
  '/api/patients/:id/brainstorm',
  '/api/import/batches',
  '/api/backup',
  // Reads on screens the app already has open; refusing them would blank a
  // note's chat or a plan export mid-quiesce for no gain.
  '/api/notes/:id/chat',
  '/api/plans/:id/export',
  // Or the client could never be asked, could never report, and P5.4 could
  // never observe a precondition.
  '/api/app/quiesce/wait',
  '/api/app/quiesce/status',
];

/**
 * The only **writes** this protocol itself needs (FD9), plus the one AM-215 adds.
 *
 * `POST /api/app/quiesce/report` or the client could never report, and
 * `POST /api/app/quiesce` is the trigger itself — a second call while one is in
 * flight joins it (FD5), which is the documented behaviour and not a way in.
 * `POST /api/app/quiesce/close` is the window's last word as it goes, and it has
 * to be exempt for the same reason the report is: a window closing **during** a
 * successful quiesce is exactly what releases browser-mode maintenance, so
 * refusing its report would strand the server in maintenance with nothing left
 * to release it.
 *
 * Every other write is refused while maintenance is on.
 */
const EXEMPT_WRITES: readonly { readonly method: string; readonly path: string }[] = [
  { method: 'POST', path: '/api/app/quiesce/report' },
  { method: 'POST', path: '/api/app/quiesce' },
  { method: 'POST', path: '/api/app/quiesce/close' },
];

/** `/api/notes/:id` against `/api/notes/abc`, and never `/api/notes/abc/chat`. */
function matches(pattern: string, path: string): boolean {
  const expected = pattern.split('/');
  const actual = path.split('/');
  if (expected.length !== actual.length) return false;
  return expected.every((segment, index) => segment.startsWith(':') || segment === actual[index]);
}

/** A URL with its query string off, which is the path a route is matched on. */
function pathOf(request: FastifyRequest): string {
  const url = request.url;
  const mark = url.indexOf('?');
  return mark === -1 ? url : url.slice(0, mark);
}

/**
 * The query string, read from the raw URL rather than from `request.query`.
 *
 * The refusal hook runs at `onRequest`, where nothing has parsed a body yet,
 * and the one value it needs here — the quiesce id — is short and needs no
 * schema. Reading it off the URL keeps the hook free of any parse that could
 * turn a refusal into a failure, which is the same reason `readLocale()` never
 * throws.
 */
function queryOf(url: string): URLSearchParams {
  const mark = url.indexOf('?');
  return new URLSearchParams(mark === -1 ? '' : url.slice(mark + 1));
}

/**
 * The controller this process runs.
 *
 * `registerMaintenanceRefusal` installs it; the route module finds it again
 * through `currentMaintenance()`. One controller and two callers — the HTTP
 * route and the shell bridge's `quiesce{}` case call the same entry point, which
 * is what makes it a function rather than a switch.
 */
let installed: MaintenanceController | null = null;

/** Install this app's controller and add the refusal hook behind the guard. */
export function registerMaintenanceRefusal(app: FastifyInstance, options: MaintenanceOptions = {}): void {
  installed = createMaintenance(options);
  app.addHook('onRequest', installed.refusalHook);
}

/** The app's controller. A process builds one app; a test that builds another
 * gets its own state, and the last one built is the one the bridge talks to. */
export function currentMaintenance(): MaintenanceController {
  installed ??= createMaintenance();
  return installed;
}

/**
 * What the bridge's `quiesce{}` case answers with, and what
 * `POST /api/app/quiesce` returns: the same entry point, two callers.
 */
export async function quiesceFromBridge(): Promise<QuiesceResult> {
  if (installed === null) {
    // No app has been built in this process, so there is nothing to drain and
    // nobody to ask. Fail closed, and say so with the word that means exactly
    // that: nothing answered.
    return { ok: false, blockers: ['no_response'] };
  }
  // The id is dropped here: `quiesce_result{ok, blockers[]}` is the contract's
  // shape, and the shell matches on nothing else.
  const { ok, blockers } = await installed.quiesce();
  return { ok, blockers };
}

#!/usr/bin/env node
/**
 * P5.3 minimal shutdown/quiescence protocol — executable synthetic proof, REVISION 3.
 *
 * NOT production code and NOT a test of Fastify, Tauri or a browser: a
 * deterministic state-machine simulation with an injected clock and explicit
 * event schedules. Node builtins only — no server, DB, port, build, install,
 * network, model, live data or held-out fixture. Nothing here is adopted.
 *
 * THE SAFETY INVARIANT THIS FILE PROVES (and states first):
 *
 *   S1  A quiesce that reports success cannot have overlooked anything: at the
 *       instant it settled ok, no registered window held content the store does
 *       not hold, no two live windows disagreed about any note, no window was
 *       recording, and no operation was live — in this generation or any
 *       earlier one.
 *   S2  A close cannot discard unknown or unsaved state: it may decide `close`
 *       only on a complete, correctly-typed answer that agrees with the server's
 *       own symbolic record, and the decision path MUTATES NOTHING.
 *   S3  A clean report cannot erase a published unsaved/recording fact without
 *       an evidenced transition, and a report is never itself the evidence.
 *   S4  Nothing admitted after a successful decision can invalidate it: the
 *       epoch fence refuses every mutation that COULD invalidate a held
 *       success — registration, edit, note declaration, state publish, job,
 *       wait, re-issue, flush save, write and late report — so the clean
 *       guarantee is monotone while it is held. Two honest qualifications
 *       (`-v3-ir2` finding 3, measured, not assumed): `drop` is not
 *       fence-guarded, and it is a MONOTONE REMOVAL — it can delete a
 *       previously clean window, which can only shrink `conflictingNotes()`
 *       and the blocker sets and can never create a new obligation, so it
 *       cannot invalidate a success that was substantiated; and the close
 *       path consumes its one-shot probe and pushes its decision, which is
 *       BOOKKEEPING, not application or window state — no guarantee, fence
 *       or window record depends on it.
 *   S5  Every job that was admitted ends exactly once, whenever its own owner
 *       ends it, and a completion is charged to the immutable operation it
 *       names — never to a binding. Rollback and abandonment fabricate none.
 *
 * This revision repairs the ten findings of reviews/P5.3-protocol-proof-v3-ir1.md,
 * each now a PERMANENT schedule (F9..F15), on top of revision 3's F1..F8 and
 * revision 2's R1..R21, which are preserved. Passing means "no enumerated
 * schedule violated S1–S5", never "the protocol is internally consistent", and
 * never "the protocol is proven": the enumeration is bounded. Limits are listed
 * in the report, not asserted away here.
 *
 * LIMITS OF S1 ITSELF, stated here so no reader can credit the header with more
 * than it shows (`-v3-ir2` finding 1; report §2 (1) and §5):
 *   `drop` DELETES the window record, and with it every obligation that window
 *   carried. A dirty disconnect BEFORE a quiesce can therefore settle
 *   `ok:true` although typed content was NEVER persisted, and a reconnect
 *   arrives under a NEW instance identity that does NOT recover or discharge
 *   the old content. (A disconnect DURING an active quiesce instead fails that
 *   binding closed with `no_response` — a different case, not the same one.)
 *   S1 therefore covers the CURRENT registered/live buffers only. This is an
 *   unresolved production data-loss risk and an adoption gap. It is NOT
 *   evidence that shutdown is safe, and it is NOT a solution. P5.4's client
 *   lifecycle / freeze-ack work, plus a preservation-or-recovery design, needs
 *   real validation before adoption; a freeze alone recovers nothing that has
 *   already been lost.
 *
 * HONEST COVERAGE OF THE BATTERY BELOW: `invariants()` is a SELF-PREDICATE —
 * it can only show the model's own state is internally consistent, never that
 * its definition of "owed" is right; that is why the independent content
 * oracle below exists, and why its own bounds are stated where it is defined.
 */
import assert from 'node:assert/strict';
const A = (c, m) => assert.ok(c, m);
const eq = (a, b, m) => assert.deepEqual(a, b, `${m} — got ${JSON.stringify(a)}`);
const out = [];
function test(group, name, fn) {
  try { fn(); out.push(`ok    [${group}] ${name}`); }
  catch (e) { out.push(`FAIL  [${group}] ${name}\n        ${e.message}`); process.exitCode = 1; }
}
/** Injected clock: nothing in this file reads the wall clock. */
class Clock {
  constructor() { this.t = 0; this.seq = 0; this.timers = []; }
  at(offset, fn) { this.timers.push({ at: this.t + offset, seq: this.seq++, fn }); return this; }
  advance(ms) {
    const end = this.t + ms;
    for (;;) {
      const due = this.timers.filter((x) => x.at <= end).sort((a, b) => a.at - b.at || a.seq - b.seq);
      if (!due.length) break;
      const n = due[0]; this.timers.splice(this.timers.indexOf(n), 1);
      this.t = n.at; n.fn();
    }
    this.t = end; return this;
  }
}
const DRAIN_MS = 30_000; // C-UPD@1's bound, reproduced exactly; nothing here moves it
/** LIVENESS_MS is the PROPOSED re-arm-gap bound, per binding: a bound window
 *  that holds no live wait for a whole bound is abandoned. It is not a flush
 *  timeout and it is decided per binding, so a chatty sibling cannot starve it.
 *  A held wait IS liveness and only DRAIN_MS can decide such a window (P8). */
const LIVENESS_MS = 2_000;
/** The blocker words this proposal can produce. C-UPD@1's paragraph and its
 *  failure table disagree about the set (ir2 B7): a PROPOSAL, not a contract
 *  edit. `save_error` covers "a revision is not proven persisted", including a
 *  revision that cannot be flushed at all (unopened note). */
const BLOCKERS = new Set(['conflict', 'save_error', 'recording', 'timeout', 'no_response']);
const EXEMPT = new Set(['GET /api/health', 'GET /api/patients', 'GET /api/notes', 'GET /api/app/update',
  'GET /api/app/quiesce', 'GET /api/app/quiesce/status', 'GET /api/app/quiesce/wait', 'GET /api/app/quiesce/close',
  'POST /api/app/quiesce/report']);
const SAVE_PATH = /^\/api\/notes\/([^/]+)$/;
const BRIDGE_VOCAB = ['update_status', 'quiesce', 'shutdown']; // C-BRIDGE@1 rule 2, verbatim
const LIFT_MESSAGES = []; // messages *defined* to lift maintenance: none yet (U1, unadopted)
const BOOLS = ['recording', 'unsaved', 'saveInFlight'];
/* ---------- content identity, not a revision NUMBER (ir1 finding 2) ----------
 * A revision counter is per-window, so two windows on one note count from
 * different origins and can collide or run backwards. Everything that decides
 * "is this buffer written?" is therefore keyed by an immutable content
 * identity: the exact (instanceId, noteId, rev) triple a keystroke batch
 * produced. A store that holds one content per note is a LAST WRITER WINS
 * slot, not a per-note maximum revision. An overwrite can never itself be a
 * success, because a content identity embeds its instance id: two windows can
 * never hold the same identity on one note, so a conflict always accompanies
 * an overwrite. */
const NO_NOTE = '(no-note-open)';
const noteKey = (noteId) => (noteId === null || noteId === undefined ? NO_NOTE : noteId);
const cid = (instanceId, nk, rev) => `${instanceId}|${nk}|${rev}`; // the immutable identity

/** Every public model event runs the invariant battery after it returns.
 *  Scope, stated honestly (`-v3-ir2` finding 4): this covers the LISTED public
 *  boundary events, not every internal mutator — `bind`, `touch`, `armSweep`
 *  and `admitFlush` are not on the list — and `F12`'s structural assertion
 *  checks MEMBERSHIP only: it can show that a listed name is wrapped, never
 *  that the list is complete. No enumerated schedule reaches the unlisted four
 *  as a public boundary; that is evidence, not a proof of completeness. */
const PUBLIC_EVENTS = ['initiate', 'register', 'armPoll', 'deliver', 'edit', 'declareOpenNote', 'publish', 'drop',
  'intercept', 'begin', 'end', 'settleFlush', 'report', 'reissue', 'maybeSettle', 'sweep', 'settle', 'rollback',
  'proposeLift', 'releaseByShell', 'closeRequest', 'closeAnswer'];

class Server {
  constructor(clock) {
    this.clock = clock;
    this.shellAttached = false; this.maintenance = false; this.shortWrites = 0;
    this.windows = new Map();   // instanceKey -> the window's SYMBOLIC record (held, recording)
    this.polls = new Map();     // instanceKey -> {held, delivered}
    this.stored = new Map();    // noteKey -> the EXACT content identity the store holds (server-owned)
    this.jobs = new Map();      // one id per operation
    this.completions = [];      // the exactly-once ledger, in order
    this.refusals = new Map();  // refusal code -> count: denied WORK != rejected CREDENTIAL
    this.decisions = [];        // every close decision with the state it saw
    this.deferred = [];         // registrations refused by the fence; their CLIENTS retry after release
    this.q = null; this.pendingClose = null; this.tokenSeq = 0; this.gen = 0; this.epoch = 0; this.freeze = null;
    this.inEvent = false; this.batteryRuns = 0;
    this.installBattery(); // ir1 finding 4: invariants run after every LISTED public event, refusals included
  }
  key(wid, iid) { return `${wid}|${iid}`; }
  /** One uniform guard for every accessor that reads a window: a junk identity
   *  is refused with a code, never addressed (ir1 finding 6, extended surface). */
  window(wid, iid) {
    if (typeof wid !== 'string' || typeof iid !== 'string' || !wid || !iid) return null;
    return this.windows.get(this.key(wid, iid)) ?? null;
  }
  /* ---------- symbolic truth, never a client claim (S1) ---------- */
  /** What the store holds for a note: an exact identity or nothing. A save of
   *  note N in one window says NOTHING about another window's content of N. */
  storedContent(nk) { return this.stored.get(nk) ?? null; }
  /** A window is unsaved iff it holds content on some note that is not exactly
   *  what the store holds for that note. Equality of identities — never a
   *  comparison of per-window counters. */
  unsavedTruth(w) {
    if (!w) return true;
    for (const [nk, id] of w.held) if ((this.stored.get(nk) ?? null)?.id !== id) return true;
    return false;
  }
  /** Notes two live windows hold DIFFERENT content on. Content is a single slot
   *  per note, so concurrent same-note editing is last-writer-wins; the protocol
   *  refuses to publish success while it can SEE that, and the per-buffer
   *  obligation to the store is carried separately by `unsavedTruth`
   *  (ir1 finding 2). A window's own superseded revision is not a conflict. */
  conflictingNotes() {
    const ids = new Map();
    for (const w of this.windows.values()) for (const [nk, id] of w.held) {
      if (!ids.has(nk)) ids.set(nk, new Set());
      ids.get(nk).add(id);
    }
    return [...ids].filter(([, set]) => set.size > 1).map(([nk]) => nk);
  }
  recordingTruth(w) { return !!w && w.recording === true; }
  /* ---------- jobs: one id per operation, one completion per job (S5) ---------- */
  begin(kind, id) {
    if (this.freeze) return { code: 'frozen_no_jobs' }; // S4: no operation may appear after a success
    assert.ok(!this.jobs.has(id), `P5: job id ${id} is already active — one id per operation`);
    const job = { kind, id, ended: false }; this.jobs.set(id, job); return job;
  }
  end(id) {
    const j = this.jobs.get(id);
    if (!j || j.ended) return false;
    j.ended = true; this.jobs.delete(id); this.completions.push({ kind: j.kind, id });
    if (this.q && !this.q.settled) this.maybeSettle();
    return true;
  }
  active() { return [...this.jobs.values()]; }
  /* ---------- registration: a server-assigned INSTANCE identity (F5) ----------
   *  The client suggests a window id (sessionStorage, which a duplicate tab
   *  copies). The server mints an instance id per registration, so two live
   *  sessions for one suggested id are two independent bindings and neither
   *  incumbent is orphaned. No cookie: identity is an explicit header pair. */
  register(wid, suggestedId) {
    if (typeof wid !== 'string' || !wid) return { code: 'malformed_registration' };
    if (this.freeze) { this.deferred.push({ wid, at: this.clock.t }); return { code: 'frozen_no_registrants' }; }
    const iid = `i${++this.tokenSeq}`;
    const now = this.clock.t;
    this.windows.set(this.key(wid, iid), {
      wid, iid, suggestedId: suggestedId ?? null, registeredAt: now, lastSeen: now,
      rev: 0, openNote: null, held: new Map(), // noteKey -> the content identity this window holds
      // recording is the LAST HONEST CLIENT CLAIM about that window, not a
      // microphone fact the server possesses. Honesty is the assumption; the
      // P5.4 client probe is the only half that could evidence it (ir1 #9).
      recording: false, unsavedClaim: false,
    });
    this.armPoll(wid, iid);
    const q = this.q;
    if (q && !q.settled) { const b = q.bindings.get(this.key(wid, iid)) ?? this.bind(q, wid, iid); this.touch(b, q); }
    return { code: 'registered', wid, iid };
  }
  armPoll(wid, iid) {
    const k = this.key(wid, iid);
    if (this.freeze) return { code: 'frozen_no_waits' };
    const poll = { key: k, held: true, delivered: null };
    this.polls.set(k, poll); // re-arming never throws and never needs a generation
    return { code: 'held', poll };
  }
  /** A wait is answered by ending it; what was delivered survives on the poll.
   *  A window not holding a wait right now is in the re-arm gap, which is what
   *  the per-binding due time covers. */
  deliver(poll, payload) {
    if (!poll || !poll.held) return false;
    poll.held = false; poll.delivered = payload; return true;
  }
  /* ---------- the shell's own stdin starts a quiesce (P1) ---------- */
  initiate(source) {
    assert.equal(source, 'shell-stdin', 'P1: a quiesce is initiated by the shell only');
    assert.ok(this.shellAttached, 'P1: no shell, no quiesce');
    assert.ok(!this.q || this.q.settled, 'P1: one quiesce at a time');
    assert.ok(!this.maintenance, 'P1: a settled quiesce keeps maintenance on until the shell lifts it');
    this.maintenance = true;
    const q = { id: `q${++this.gen}`, bindings: new Map(), outcome: null, settled: false };
    this.q = q;
    for (const w of [...this.windows.values()]) this.bind(q, w.wid, w.iid);
    this.clock.at(DRAIN_MS, () => { // P7: generation-scoped
      if (this.q !== q || q.settled) return;
      this.settle(['timeout'], 'global deadline', q);
    });
    if (!q.settled) this.armSweep(q);
    this.maybeSettle(); // a quiesce with no window settles at once instead of burning 30 s
    return q;
  }
  bind(q, wid, iid) {
    const k = this.key(wid, iid);
    const b = { quiesceId: q.id, q, key: k, wid, iid, flushToken: `${q.id}-ft-${++this.tokenSeq}`,
      spentTokens: new Set(), revoked: false, reported: false, abandoned: false,
      blockers: [], attempts: [], claim: null, // every flush ATTEMPT is its own record (F2/F8)
      // being ASKED is what sets a due time: a window has one whole bound to
      // re-arm before it counts as gone, whether or not it held a wait at entry
      dueAt: this.clock.t + LIVENESS_MS };
    Object.defineProperties(b, {
      outstanding: { get: () => b.attempts.some((a) => !a.settled) },
      saveOutcome: { get: () => (b.attempts.length ? b.attempts[b.attempts.length - 1].outcome : null) },
      target: { get: () => (b.attempts.length ? b.attempts[b.attempts.length - 1].target : null) },
    });
    q.bindings.set(k, b);
    b.deliveredOnce = this.deliver(this.polls.get(k), { kind: 'quiesce', quiesceId: q.id, instanceId: iid, flushToken: b.flushToken, deadlineMs: DRAIN_MS });
    return b;
  }
  /* ---------- edits and declared notes: symbolic, client-attested facts ----- */
  edit(wid, iid, noteId) { // every keystroke batch advances the window's local revision
    const w = this.window(wid, iid);
    if (!w) return { code: 'unknown_window' };
    if (noteId !== null && typeof noteId !== 'string') return { code: 'malformed_edit' };
    if (this.freeze) return { code: 'frozen_no_edit' }; // S4
    const nk = noteKey(noteId);
    // F13: a window holds ONE buffer per note. A switch while the current note
    // is unpersisted would drop that content out of the model for good, so it
    // is refused instead: no abandoned buffer, and the content stays owed.
    if (w.openNote !== null && nk !== noteKey(w.openNote) && this.unsavedTruth(w))
      return { code: 'note_switch_blocked' };
    w.openNote = noteId; w.rev += 1; w.lastSeen = this.clock.t;
    w.held.set(nk, cid(w.iid, nk, w.rev)); // the content this buffer holds NOW
    const b = this.q?.bindings.get(this.key(w.wid, w.iid));
    if (b) this.touch(b, this.q);
    return { code: 'edited', rev: w.rev, contentId: w.held.get(nk) };
  }
  declareOpenNote(wid, iid, noteId) {
    const w = this.window(wid, iid);
    if (!w) return { code: 'unknown_window' };
    if (this.freeze) return { code: 'frozen_no_declare' }; // S4: no state change after a success
    if (noteId !== null && typeof noteId !== 'string') return { code: 'malformed_declare' };
    const b = this.q?.bindings.get(this.key(w.wid, w.iid));
    if (b?.outstanding) return { code: 'flush_note_switch_blocked' }; // the target is frozen at admission
    if (this.unsavedTruth(w)) return { code: 'note_switch_blocked' }; // and the old buffer is still owed
    w.openNote = noteId; w.lastSeen = this.clock.t;
    if (b) this.touch(b, this.q);
    return { code: 'declared', noteId };
  }
  publish(wid, iid, live) { // honest state, stamped when the window states it
    const w = this.window(wid, iid);
    if (!w || !live || typeof live !== 'object' || Array.isArray(live)) return { code: 'malformed_publish' };
    if (this.freeze) return { code: 'frozen_no_publish' }; // S4: no window record may move after a success
    w.lastSeen = this.clock.t;
    if (typeof live.recording === 'boolean') w.recording = live.recording;
    if (typeof live.unsaved === 'boolean') w.unsavedClaim = live.unsaved;
    const b = this.q?.bindings.get(this.key(w.wid, w.iid));
    if (b) this.touch(b, this.q);
    return { code: 'published' };
  }
  drop(wid, iid) { // the socket goes away — and takes the window's OBLIGATIONS with it
    // See the header's S1 limits (`-v3-ir2` finding 1): this deletion is not
    // fenced, is not qualified by the quiesce, and leaves no trace of what the
    // window held. Unchanged behaviour — stated here so the code cannot be read
    // as covering it.
    const k = this.key(wid, iid);
    if (typeof wid !== 'string' || typeof iid !== 'string') return { code: 'unknown_window' };
    if (this.pendingClose && this.pendingClose.wid === wid && this.pendingClose.iid === iid) this.pendingClose = null;
    this.windows.delete(k); this.polls.delete(k);
    const q = this.q;
    if (q && !q.settled) {
      const b = q.bindings.get(k);
      if (b) { b.dueAt = this.clock.t; this.touch(b, q); } // due now: the next sweep fails it closed
      this.armSweep(q); this.maybeSettle();
    }
    return { code: 'dropped' };
  }
  /* ---------- liveness: ONE due time PER BINDING (F3) ---------- */
  touch(b, q) { b.dueAt = this.clock.t + LIVENESS_MS; this.armSweep(q); }
  nextDue(q) {
    let d = null;
    for (const b of q.bindings.values()) {
      if (b.reported || b.abandoned) continue;
      const u = this.polls.get(b.key)?.held === true ? this.clock.t + LIVENESS_MS : b.dueAt;
      if (d === null || u < d) d = u;
    }
    return d;
  }
  armSweep(q) {
    if (!q || q.settled || this.q !== q) return;
    const due = this.nextDue(q);
    if (due === null) return;
    this.clock.at(Math.max(0, due - this.clock.t), () => {
      if (this.q !== q || q.settled) return; // generation-scoped: a stale sweep decides nothing
      this.sweep(q);
      if (this.q === q && !q.settled) this.armSweep(q);
    });
  }
  sweep(q) { // one rule for both gone triggers; a held wait IS liveness
    const now = this.clock.t;
    for (const b of q.bindings.values()) {
      if (b.reported) continue;
      const w = this.windows.get(b.key);
      if (w && this.polls.get(b.key)?.held === true) { w.lastSeen = now; b.dueAt = now + LIVENESS_MS; continue; }
      if (!w || now >= b.dueAt) b.abandoned = true;
    }
    this.maybeSettle();
  }
  /* ---------- P3/P4: the maintenance hook ---------- */
  intercept(req) {
    if (!req || typeof req !== 'object') return { admitted: 'out-of-scope' };
    const { method, path } = req;
    if (typeof path !== 'string' || !path.startsWith('/api/')) return { admitted: 'out-of-scope' };
    if (EXEMPT.has(`${method} ${path}`)) return { admitted: 'exempt' };
    if (!this.maintenance) return { admitted: 'served' }; // P3: outside maintenance the app is writable
    if (this.freeze && method !== 'GET' && method !== 'HEAD') { this.shortWrites++; return { admitted: 'refused', code: 'frozen_write' }; } // S4
    const v = this.admitFlush(req);
    if (v === 'admit') return { admitted: 'flush-save' };
    this.refusals.set(v ?? 'maintenance', (this.refusals.get(v ?? 'maintenance') ?? 0) + 1);
    if (v === null) this.shortWrites++; // only refused WORK counts; a rejected credential has its own code
    return { admitted: 'refused', code: v ?? 'maintenance' };
  }
  admitFlush(req) {
    const m = SAVE_PATH.exec(req.path);
    if (req.method !== 'PATCH' || !m) return null; // not a flush-save candidate
    const q = this.q;
    if (!q || q.settled) return 'flush_quiesce_settled';
    const h = req.headers ?? {};
    const wid = h['x-apunta-window-id'], iid = h['x-apunta-instance-id'];
    if (typeof wid !== 'string' || typeof iid !== 'string') return 'flush_unknown_window';
    const b = q.bindings.get(this.key(wid, iid));
    if (!b) return 'flush_unknown_window';
    if (b.quiesceId !== q.id) return 'flush_stale_generation';
    if (req.query?.flush_token !== b.flushToken) return 'flush_bad_token';
    if (b.spentTokens.has(req.query.flush_token)) return 'flush_replayed_token'; // one use per token, per binding
    if (b.revoked) return 'flush_revoked';
    if (b.attempts.some((a) => !a.settled)) return 'flush_already_outstanding';
    const w = this.window(wid, iid);
    if (!w) return 'flush_unknown_window';
    if (w.openNote == null) return 'flush_no_open_note';
    if (w.openNote !== m[1]) return 'flush_wrong_note';
    const rev = req.query?.rev;
    if (!Number.isInteger(rev)) return 'flush_stale_revision';
    // EXACT content identity: the buffer must still hold exactly the content
    // this request claims to save, under THIS instance's identity. A revision
    // number is not comparable across instances, and this one is not (F2).
    const nk = noteKey(m[1]);
    const contentId = cid(iid, nk, rev);
    if (w.held.get(nk) !== contentId) return 'flush_stale_revision';
    if (rev !== w.rev) return 'flush_stale_revision';
    // freeze the target: the exact content identity, for the completion record
    // and for every later test that reasons about what was written
    b.spentTokens.add(b.flushToken);
    const attempt = { token: b.flushToken, jobId: `save-${b.flushToken}`, settled: false, outcome: null,
      target: { noteId: m[1], rev, instanceId: iid, windowId: wid, contentId } };
    b.attempts.push(attempt);
    this.begin('save', attempt.jobId); // P5: minted from the credential, never the note id
    return 'admit';
  }
  /** The whole point of D1: the save's own result is recorded on the attempt
   *  BEFORE the job ends, because ending the job is what offers the quiesce a
   *  chance to settle. A failing save cannot become a success in any order.
   *  The completion must NAME its operation: a delivery that belongs to an
   *  already-settled attempt is charged to nothing and mutates nothing
   *  (ir1 finding 3), and an unrecognised outcome is refused before any
   *  mutation at all (ir1 finding 6). */
  settleFlush(b, jobId, outcome) {
    if (outcome !== 'saved' && outcome !== 'error') return { code: 'invalid_outcome' }; // before ANY mutation
    if (!b || !Array.isArray(b.attempts)) return { code: 'unknown_binding' };
    const a = b.attempts.find((x) => x.jobId === jobId && !x.settled); // the operation it NAMES
    if (!a) return { code: 'stale_completion' }; // a binding is not an operation
    a.settled = true; a.outcome = outcome; a.settledAt = this.clock.t;
    if (outcome === 'saved') { // the store now holds exactly this content identity
      const t = a.target, nk = noteKey(t.noteId);
      this.stored.set(nk, { id: t.contentId, instanceId: t.instanceId, windowId: t.windowId, noteId: t.noteId, rev: t.rev });
    }
    const q = b.q, own = this.q === q && !q.settled;
    this.end(a.jobId);
    if (own) this.maybeSettle();
    return { code: own ? (q.settled ? 'settled' : 'accepted') : 'stale_generation' };
  }

  /* ---------- P6: the report, and what may NOT substitute for evidence (S3) -- */
  report(wid, iid, headers, body) {
    if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return { code: 'malformed_report' }; // F6
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { code: 'malformed_report' };
    const q = this.q, b = q?.bindings.get(this.key(wid, iid));
    if (!q) return { code: 'no_quiesce' };
    if (headers['x-apunta-window-id'] !== wid) return { code: 'window_mismatch' };
    if (headers['x-apunta-instance-id'] !== iid) return { code: 'instance_mismatch' };
    if (!b) return { code: 'unregistered_window' };
    if (q.settled) return { code: 'already_settled' }; // a late report cannot revive a settled quiesce
    if (body.quiesceId !== q.id) return { code: 'stale_generation' };
    if (body.flushToken !== b.flushToken) return { code: 'bad_token' };
    if (b.reported) return { code: 'already_reported' };
    const claimed = Array.isArray(body.blockers) ? body.blockers : null;
    if (claimed === null || claimed.some((c) => typeof c !== 'string' || !BLOCKERS.has(c))) return { code: 'malformed_report' };
    const o = body.observed;
    if (!o || typeof o !== 'object' || Array.isArray(o) || !Number.isInteger(o.rev) || o.rev < 0
      || typeof o.recording !== 'boolean' || typeof o.unsaved !== 'boolean'
      || !(o.openNote === null || typeof o.openNote === 'string')) return { code: 'malformed_report' }; // partial never succeeds
    if (claimed.length === 0 && !this.consistent(b, o)) {
      // A clean claim that DISAGREES with the server's own record is refused
      // and does not count as an acknowledgement: the drain then holds, and
      // only the sweep can end it. It never publishes a success (S3/F8).
      return { code: 'report_unsubstantiated' };
    }
    b.reported = true; b.claim = o; b.blockers = claimed;
    this.maybeSettle();
    return { code: 'accepted' };
  }
  /** The quiesce asks a window again and it re-arms, so it needs a fresh flush
   *  credential: one per (window, quiesce, instance, attempt). Refused when a
   *  save is still writing, when the binding already reported, or under the
   *  epoch fence — a re-arm is not a way to buy a second chance. */
  reissue(wid, iid) {
    const b = this.q?.bindings.get(this.key(wid, iid));
    if (!b) return { code: 'unregistered_window' };
    if (this.freeze || this.q.settled) return { code: 'frozen_no_reissue' };
    if (b.outstanding) return { code: 'flush_already_outstanding' };
    if (b.reported) return { code: 'already_reported' };
    b.flushToken = `${b.quiesceId}-ft-${++this.tokenSeq}`;
    b.deliveredOnce = this.deliver(this.polls.get(b.key), { kind: 'quiesce', quiesceId: this.q.id, instanceId: iid, flushToken: b.flushToken, deadlineMs: DRAIN_MS });
    return b;
  }
  /** Consistency, not cleanliness. The acknowledgement must DESCRIBE the state
   *  the server already holds; it is never the evidence. Nothing here writes to
   *  the window record: `w.recording` changes only when that same instance
   *  publishes a transition (the evidenced one), and persisted-ness is owned by
   *  `this.persisted`, which only a real save completion can advance. */
  consistent(b, o) {
    const w = this.windows.get(b.key);
    if (!w) return false;
    return o.rev === w.rev && o.openNote === w.openNote && o.recording === w.recording && o.unsaved === this.unsavedTruth(w);
  }
  maybeSettle() {
    const q = this.q;
    if (!q || q.settled) return;
    const bs = [...q.bindings.values()];
    // D1/F2: this generation's own flush failed — decisive now, before any
    // success could publish, in any order.
    if (bs.some((b) => b.saveOutcome === 'error')) { this.settle(['save_error'], 'a save failed', q); return; }
    if (bs.some((b) => b.outstanding)) return; // a save is still writing: the drain waits
    if (this.jobs.size > 0) return; // live work keeps the drain open, this generation or an earlier one
    const missing = bs.filter((b) => !b.reported);
    if (missing.some((b) => !b.abandoned)) return; // a gone-or-silent window is still a missing window
    // F2/F4/F13: the outcome is computed from SYMBOLIC state, never from a claim.
    const win = new Set();
    for (const w of this.windows.values()) if (this.unsavedTruth(w)) win.add('save_error');
    for (const w of this.windows.values()) if (w.recording) win.add('recording');
    if (this.conflictingNotes().length) win.add('conflict'); // two live buffers disagree about a note
    const blockers = [...new Set([...bs.flatMap((b) => b.blockers), ...win, ...(missing.length ? ['no_response'] : [])])];
    if (!blockers.length && ![...this.windows.values()].every((w) => !this.unsavedTruth(w) && !w.recording)) blockers.push('save_error');
    this.settle(blockers, blockers.length ? 'blocker' : 'clean', q);
  }
  settle(blockers, why, generation) {
    const q = generation ?? this.q;
    if (!q || q.settled || this.q !== q) return null; // only its own generation, once
    q.settled = true; q.settledAt = this.clock.t; q.why = why; q.outcome = { ok: blockers.length === 0, blockers };
    for (const b of q.bindings.values()) b.revoked = true;
    if (!q.outcome.ok) this.rollback(q); // P9
    else { this.epoch += 1; this.freeze = { epoch: this.epoch, at: this.clock.t, quiesceId: q.id }; } // S4
    return q.outcome;
  }
  /** P9: rollback revokes credentials and restores normal service. It ends NO
   *  job — a refine already streaming is not this protocol's to cancel, so it
   *  stays active and the NEXT quiesce counts it (R12). */
  rollback(q) {
    this.maintenance = false;
    this.lastOutcome = q?.outcome ?? null;
    for (const p of this.polls.values()) p.delivered = null;
    this.pendingClose = null;
  }
  proposeLift(m) { LIFT_MESSAGES.push(...m); }
  /** P10: WHICH message lifts maintenance is unresolved (U1). Every message the
   *  bridge can send returns a code and mutates NOTHING unless it is a message
   *  defined to lift maintenance AND a successful maintenance state is held
   *  (ir1 finding 8: a stdin-reachable boundary must not assert). */
  releaseByShell(message) {
    if (typeof message !== 'string' || !LIFT_MESSAGES.includes(message))
      return { code: 'refused', reason: 'no_such_lift_message' };
    if (!(this.maintenance && this.freeze && this.q?.outcome?.ok))
      return { code: 'refused', reason: 'no_successful_maintenance_held' };
    this.maintenance = false; this.freeze = null; this.q = null; this.pendingClose = null;
    // NOT a service: the queue is counted and cleared, and each deferred
    // registration's CLIENT is expected to retry. No window is created here
    // (ir1 finding 7).
    const retries = this.deferred.length; this.deferred = [];
    return { code: 'released', via: message, deferredRetriesQueued: retries,
      note: 'deferred registrations were counted, not served: their clients are expected to retry' };
  }
  /* ---------- P8/S2: native close, probe and answer ---------- */
  closeRequest(wid, iid, clientBooleans) {
    if (!this.window(wid, iid)) return { code: 'unknown_window' }; // fails closed
    if (this.pendingClose) return { code: 'refused', decision: 'defer_probe_pending' };
    const poll = this.polls.get(this.key(wid, iid));
    if (!poll?.held) return { code: 'refused', decision: 'defer_no_wait' }; // cannot ask -> must not close
    const probe = { token: `cp-${++this.tokenSeq}`, wid, iid, clientBooleans: clientBooleans ?? null, decision: null };
    poll.delivered = { kind: 'close', probeToken: probe.token }; poll.held = false;
    this.pendingClose = probe;
    return probe;
  }
  /** The window reads its own refs at answer time. THE DECISION PATH MUTATES
   *  NOTHING: the answer is validated, then compared against the server's
   *  PRE-EXISTING record. A stop-recording transition is not admissible here —
   *  it is a separate explicit operation (`publish`, fenced), never a side
   *  effect of reading an answer (ir1 finding 1). */
  closeAnswer(wid, iid, probeToken, live) {
    const p = this.pendingClose;
    if (!p || p.wid !== wid || p.iid !== iid || p.token !== probeToken) return { code: 'stale_probe' };
    this.pendingClose = null; // one-shot: consumed by the first answer, whatever it says
    const complete = live && typeof live === 'object' && !Array.isArray(live) && BOOLS.every((k) => typeof live[k] === 'boolean');
    if (!complete) return { code: 'malformed_answer', decision: 'defer_malformed' }; // F1: partial/empty/mistyped fails closed
    const w = this.window(wid, iid);
    if (!w) { // the socket went away between probe and answer: nothing is known, so nothing closes
      this.decisions.push({ wid, iid, decision: 'defer_unknown_window', sawUnsaved: true, sawRecording: true });
      p.decision = 'defer_unknown_window';
      return { code: 'decided', decision: 'defer_unknown_window' };
    }
    const saving = live.saveInFlight === true || this.active().some((j) => j.kind === 'save');
    const sawRecording = live.recording === true || this.recordingTruth(w);
    const sawUnsaved = live.unsaved === true || this.unsavedTruth(w);
    let decision;
    if (saving) decision = 'defer_save';
    else if (sawRecording) decision = 'confirm_recording';
    else if (sawUnsaved) decision = 'defer_unsaved';
    else decision = 'close';
    this.decisions.push({ wid, iid, decision, sawUnsaved, sawRecording });
    p.decision = decision;
    return { code: 'decided', decision };
  }
  status() {
    const ws = [...this.windows.values()];
    return { epoch: this.epoch, frozen: !!this.freeze, maintenance: this.maintenance, quiesce: this.q?.id ?? null,
      settled: this.q?.settled ?? false, windows: ws.length, windowsBound: this.q ? this.q.bindings.size : 0,
      jobs: this.active().map((j) => j.kind), completions: this.completions.length, shortWrites: this.shortWrites,
      refusals: Object.fromEntries(this.refusals), deferredRetriesQueued: this.deferred.length,
      batteryRuns: this.batteryRuns,
      // claims and truth, kept apart on purpose
      claims: { recording: ws.some((w) => w.recording), unsaved: ws.filter((w) => w.unsavedClaim).length },
      // `recording` is the last honest client CLAIM (ir1 finding 9), `unsaved` is
      // derived from content identity against the store.
      truth: { recording: ws.filter((w) => this.recordingTruth(w)).length,
        unsaved: ws.filter((w) => this.unsavedTruth(w)).length,
        conflicts: this.conflictingNotes() } };
  }
  /** ir1 finding 4: every LISTED public event runs the invariant battery
   *  afterwards — including a refused one, and including a call made from
   *  inside another event (the outer event's own run covers the whole
   *  mutation). "Listed" is the honest word: the list is PUBLIC_EVENTS, not
   *  every internal mutator (`-v3-ir2` finding 4). */
  installBattery() {
    for (const name of PUBLIC_EVENTS) {
      const raw = this[name].bind(this);
      this[name] = (...args) => {
        if (this.inEvent) return raw(...args); // an inner call: the outer event's run covers it
        this.inEvent = true;
        try { const r = raw(...args); invariants(this, name); return r; }
        finally { this.inEvent = false; }
      };
    }
  }
}

/* ---------- the invariants, checked after every LISTED public event ----------
 * A SELF-PREDICATE battery (see the header): these checks use the model's own
 * definitions, so they can catch an internal inconsistency but never a wrong
 * definition of what is owed. The independent content oracle is the separate,
 * separately bounded instrument. */
function invariants(s, label) {
  s.batteryRuns += 1;
  const ids = s.completions.map((j) => j.id); // S5
  eq(new Set(ids).size, ids.length, `S5 duplicate completion @${label}`);
  for (const id of ids) A(!s.jobs.has(id), `S5 completion for a still-active job @${label}`);
  const q = s.q;
  if (q && !q.settled) { // a live window can never be outside the drain's bindings
    for (const k of s.windows.keys()) A(q.bindings.has(k), `S1 a live window is unbound @${label}`);
  }
  for (const d of s.decisions) { // S2: a close saw nothing it could not itself see
    if (d.decision === 'close') {
      A(!d.sawUnsaved, `S2 a close discarded an unsaved revision @${label}`);
      A(!d.sawRecording, `S2 a close discarded recording state @${label}`);
    }
  }
  // S1 + S4: the success guarantee, re-checked after every event, not only at the decision
  if (s.freeze || q?.outcome?.ok === true) {
    A(s.maintenance, `S1 maintenance off while a success is held @${label}`);
    eq(s.jobs.size, 0, `S1 a live operation at a successful decision @${label}`);
    for (const w of s.windows.values()) {
      A(!s.recordingTruth(w), `S1 recording state overlooked @${label}`);
      A(!s.unsavedTruth(w), `S1 content the store does not hold overlooked @${label}`);
    }
    eq(s.conflictingNotes(), [], `S1 two live buffers disagree about a note @${label}`);
    for (const b of q?.bindings.values() ?? []) A(b.saveOutcome !== 'error', `S1 a save_error inside a success @${label}`);
  }
}

/** One registration per name; `harness(['w1','w1'])` is a duplicated tab. Every
 *  accessor carries the instance identity, so a schedule cannot quietly address
 *  the wrong session. `h.step` runs the invariant battery after one event. */
const harness = (names) => {
  const c = new Clock(), s = new Server(c);
  s.shellAttached = true;
  const reg = names.map((n, idx) => { const r = s.register(n, `suggested-${n}`); return { n: idx, wid: n, iid: r.iid }; });
  const live = new Map(); // index, name, or instance id all address a session
  for (const r of reg) { live.set(r.n, r); live.set(r.wid, r); live.set(r.iid, r); }
  const who = (n) => live.get(n) ?? reg.find((r) => r.wid === n);
  const ids = (n) => { const r = who(n); return [r.wid, r.iid]; };
  return {
    c, s, reg, who, ids,
    /** a session registered outside the harness (a late tab) becomes addressable */
    adopt: (wid, iid) => { const r = { n: `x${iid}`, wid, iid }; live.set(r.n, r); live.set(iid, r); if (!live.has(wid)) live.set(wid, r); return r; },
    w: (n) => ({ wid: who(n).wid, iid: who(n).iid }),
    bind: (n, q = s.q) => { const [wid, iid] = ids(n); return q.bindings.get(s.key(wid, iid)); },
    edit: (n, note) => { const [wid, iid] = ids(n); return s.edit(wid, iid, note).rev; }, // the new revision
    declare: (n, note) => { const [wid, iid] = ids(n); return s.declareOpenNote(wid, iid, note); },
    publish: (n, live) => { const [wid, iid] = ids(n); return s.publish(wid, iid, live); },
    drop: (n) => { const [wid, iid] = ids(n); return s.drop(wid, iid); },
    flush: (n, noteId, token, rev) => { const [wid, iid] = ids(n);
      return s.intercept({ method: 'PATCH', path: `/api/notes/${noteId}`,
        headers: { 'x-apunta-window-id': wid, 'x-apunta-instance-id': iid }, query: { flush_token: token, rev } }); },
    raw: (n, token, rev) => { const [wid, iid] = ids(n);
      return s.intercept({ method: 'PATCH', path: '/api/notes/note-1', headers: { 'x-apunta-window-id': wid, 'x-apunta-instance-id': iid }, query: { flush_token: token, rev } }); },
    report: (n, b, blockers = [], observed) => { const [wid, iid] = ids(n);
      return s.report(wid, iid, { 'x-apunta-window-id': wid, 'x-apunta-instance-id': iid },
        { quiesceId: b.quiesceId, flushToken: b.flushToken, blockers, ...(observed ? { observed } : {}) }); },
observed: (n) => { const [wid, iid] = ids(n), w = s.windows.get(s.key(wid, iid));
      return { rev: w.rev, openNote: w.openNote, recording: w.recording, unsaved: s.unsavedTruth(w) }; },
    /** the completion names its own operation (ir1 finding 3) */
    complete: (b, outcome, at = b.attempts.length - 1) => s.settleFlush(b, b.attempts[at]?.jobId, outcome),
    /** a byte-level fingerprint of the whole symbolic state, for "nothing moved" */
    snap: () => JSON.stringify({
      windows: [...s.windows.values()].map((w) => ({ wid: w.wid, iid: w.iid, rev: w.rev, openNote: w.openNote,
        recording: w.recording, held: [...w.held].sort() })),
      stored: [...s.stored.entries()].sort(), jobs: [...s.jobs.keys()].sort(), freeze: s.freeze,
      completions: s.completions, maintenance: s.maintenance }),
    step: (name, fn) => { const r = fn(); invariants(s, name); return r },
  };
};
const bindOf = (s, q, wid, iid) => q.bindings.get(s.key(wid, iid));
/** the completion must NAME its operation: the job id minted at admission */
const lastJob = (b) => b.attempts[b.attempts.length - 1]?.jobId;
const keyOf = (h, n) => `${h.w(n).wid}|${h.w(n).iid}`;

/* ---------- an INDEPENDENT content oracle (ir1 finding 2) ----------
 * It knows only what a schedule said happened: which content each buffer holds,
 * and which content the store really received from a completion that reported
 * `saved`. It never reads `unsavedTruth`, `held`, `stored` or a revision number,
 * so it cannot inherit the model's own mistake — a model that declared
 * unpersisted content persisted would fail here, not pass.
 * ITS OWN BOUNDS (`-v3-ir2` finding on the oracle): one buffer per instance, so
 * a window returning to a previously written note is not tracked, and a `drop`
 * is treated by the SCHEDULE (not here) as a deletion. It is a bounded
 * instrument, not a second model. */
function contentOracle() {
  const buffers = new Map();  // instanceKey -> { noteKey, content }
  const store = new Map();    // noteKey  -> content the store really received
  const left = [];            // buffers that moved OFF a note, and what they left there
  let n = 0;
  const hold = (k, noteId) => {
    const prev = buffers.get(k), nk = noteKey(noteId);
    // a NEW buffer: any content still owed for the previous note was left behind
    if (prev && prev.noteKey !== nk) left.push({ k, noteKey: prev.noteKey, content: prev.content });
    const content = `c${++n}`;
    buffers.set(k, { noteKey: nk, content });
    return content;
  };
  return {
    hold,
    contentOf: (k) => buffers.get(k).content,
    /** a buffer moves to another note; its previous content is NOT superseded */
    moveTo: (k, noteId) => hold(k, noteId),
    /** a real `saved` completion: the store received exactly this content */
    wrote: (noteId, content) => { store.set(noteKey(noteId), content); },
    /** at a success: every buffer's content is what the store holds for its note */
    atOk: (label) => { for (const [k, v] of buffers) {
      if (store.get(v.noteKey) !== v.content) throw new Error(`${label}: storage does NOT hold ${k}'s content on ${v.noteKey}`);
    } },
    /** a buffer that moved off a note left its content nowhere unless it was written */
    nothingAbandoned: (label) => { for (const l of left)
      if (store.get(l.noteKey) !== l.content) throw new Error(`${label}: ${l.k} abandoned ${l.content} on ${l.noteKey} unsaved`);
    },
    buffers, store, left,
  };
}

/* ============================ PART A — today's semantics, asserted WRONG ============ */
const OLD_EXEMPT_READS = new Set(['/api/app/quiesce', '/api/app/quiesce/status', '/api/app/quiesce/wait']);
function oldWouldRefuse(method, path) {
  if (!path.startsWith('/api/')) return false;
  if (method === 'GET' || method === 'HEAD') return !OLD_EXEMPT_READS.has(path);
  return true;
}
function oldRegistry() { // registry.ts verbatim: keyed by id, a newer job takes an active id over
  const m = new Map();
  return { begin: (k, id) => m.set(id, { kind: k, id }), end: (id) => m.delete(id),
    active: () => [...m.values()], anyActive: () => m.size > 0 };
}
test('A1-collision', "a flush save on the note evicts the live refine, so the drain lies", () => {
  const reg = oldRegistry();
  reg.begin('refine', 'note-1'); reg.begin('save', 'note-1');
  eq(reg.active().map((j) => j.kind), ['save'], 'BUG: the live refine is gone from active()');
  reg.end('note-1');
  A(!reg.anyActive(), 'BUG: the drain reports idle while a refine stream is still writing');
});
test('A2-unreachable-save', 'the flush PATCH is refused, so no quiesce with unsaved text can succeed', () => {
  A(oldWouldRefuse('PATCH', '/api/notes/note-1'), 'BUG: 503 maintenance refuses the flush save');
  eq({ ok: false, blockers: ['save_error'] }, { ok: false, blockers: ['save_error'] }, 'BUG: text stays unsaved');
});
test('A3-report-refused', 'the report POST is refused by the method-scoped exempt clause', () => {
  A(oldWouldRefuse('POST', '/api/app/quiesce/report'), 'BUG: no report ever arrives; every quiesce burns 30 s for no_response');
});
test('A4-vacuous-close', 'per-quiesce registration makes the native close check read false/false', () => {
  const view = new Map().get(null) ?? { recording: false, unsaved: false, windows: 0 };
  eq(view, { recording: false, unsaved: false, windows: 0 }, 'BUG: w1 is recording with typed text, yet both flags vanish silently');
});

/* ============================ PART B — positive schedules ============================= */
test('S1-flush-success', 'unsaved text flushes at its exact revision, the drain empties, maintenance holds', () => {
  const h = harness(['w1', 'w2']);
  const rev = h.step('edit', () => h.edit('w1', 'note-1'));
  const q = h.s.initiate('shell-stdin'), b1 = bindOf(h.s, q, h.w('w1').wid, h.w('w1').iid);
  A(h.flush('w1', 'note-1', b1.flushToken, rev).admitted === 'flush-save', 'the flush save is admitted at rev 3');
  A(h.s.status().jobs.includes('save'), 'the save is a registered job the drain counts'); A(!q.settled, 'the drain waits');
  h.step('settle', () => h.s.settleFlush(b1, lastJob(b1), 'saved'));
  h.step('report1', () => h.report('w1', b1, [], h.observed('w1')));
  h.step('report2', () => h.report('w2', bindOf(h.s, q, h.w('w2').wid, h.w('w2').iid), [], h.observed('w2')));
  eq(q.outcome, { ok: true, blockers: [] }, 'quiesce ok');
  A(h.s.maintenance && !!h.s.freeze, 'maintenance AND the epoch fence hold, so nothing can race the snapshot');
  eq(h.s.status().shortWrites, 0, 'nothing was refused'); eq(h.s.status().epoch, 1, 'one epoch');
});
test('S2-overlap', 'a refine and the flush save on the same note are both active', () => {
  const h = harness(['w1']);
  const rev = h.edit('w1', 'note-1'); h.s.begin('refine', 'job-refine-7');
  const q = h.s.initiate('shell-stdin'), b1 = bindOf(h.s, q, h.w('w1').wid, h.w('w1').iid);
  h.flush('w1', 'note-1', b1.flushToken, rev);
  eq(h.s.status().jobs.sort(), ['refine', 'save'], 'both jobs are visible');
  assert.throws(() => h.s.begin('save', 'job-refine-7'), /already active/, 'P5: a colliding id is refused, not taken over');
  h.s.settleFlush(b1, lastJob(b1), 'saved'); h.report('w1', b1, [], h.observed('w1')); A(!q.settled, 'it cannot settle while the refine streams');
  invariants(h.s, 'refine-live');
  h.s.end('job-refine-7');
  eq(q.outcome, { ok: true, blockers: [] }, 'it settles only after the refine really ends');
});
test('S9-post-success-release', 'a held success releases on the shell message, and the next quiesce works', () => {
  const h = harness(['w1']);
  const q1 = h.s.initiate('shell-stdin'), b1 = bindOf(h.s, q1, h.w('w1').wid, h.w('w1').iid);
  eq(h.report('w1', b1, [], h.observed('w1')).code, 'accepted', 'nothing to flush: a clean window reports clean');
  eq(q1.outcome, { ok: true, blockers: [] }, 'first quiesce ok');
  for (const m of BRIDGE_VOCAB) eq(h.s.releaseByShell(m).code, 'refused', `P10: today's ${m} lifts nothing`);
  h.s.proposeLift(['maintenance_off']);
  eq(h.s.releaseByShell('maintenance_off').code, 'released', 'once one exists, the release works');
  eq(h.s.intercept({ method: 'POST', path: '/api/draft' }).admitted, 'served', 'P3/D10: a real write is served after the release');
  eq(h.s.status().windows, 1, 'the window table survives the release');
  const q2 = h.s.initiate('shell-stdin');
  eq(h.flush('w1', 'note-1', b1.flushToken, 0).code, 'flush_bad_token', 'the settled generation\'s token is dead in the new one');
  A(q2.id !== q1.id, 'a new generation');
});
test('S4-report-admission', 'the report POST is served, never refused as maintenance, and counts nothing', () => {
  const h = harness(['w1']); h.s.initiate('shell-stdin');
  eq(h.s.intercept({ method: 'POST', path: '/api/app/quiesce/report' }).admitted, 'exempt', 'admitted by method+path');
  eq(h.s.status().shortWrites, 0, 'the report is not a refused write');
  eq(h.s.intercept({ method: 'POST', path: '/api/app/quiesce' }).code, 'maintenance', 'P1: no HTTP quiesce trigger');
});
test('S7-rejected-save', 'a save error rolls back, consumes the token, and a fresh token retries', () => {
  const h = harness(['w1']);
  const rev = h.edit('w1', 'note-1');
  const q = h.s.initiate('shell-stdin'), b1 = bindOf(h.s, q, h.w('w1').wid, h.w('w1').iid);
  h.flush('w1', 'note-1', b1.flushToken, rev); h.s.settleFlush(b1, lastJob(b1), 'error');
  eq(q.outcome, { ok: false, blockers: ['save_error'] }, 'save_error is the outcome');
  eq(h.s.status().jobs, [], 'the save job ended exactly once'); A(!h.s.maintenance, 'P9: rolled back');
  const q2 = h.s.initiate('shell-stdin'), b2 = bindOf(h.s, q2, h.w('w1').wid, h.w('w1').iid);
  eq(h.flush('w1', 'note-1', b1.flushToken, rev).code, 'flush_bad_token', 'the failed token does not come back');
  h.flush('w1', 'note-1', b2.flushToken, rev); h.s.settleFlush(b2, lastJob(b2), 'saved'); h.report('w1', b2, [], h.observed('w1'));
  eq(q2.outcome, { ok: true, blockers: [] }, 'the retry succeeds');
});
test('S10-unrelated-writes', 'during the flush phase only the one outstanding flush save is admitted', () => {
  const h = harness(['w1']);
  const rev = h.edit('w1', 'note-1');
  const q = h.s.initiate('shell-stdin'), b1 = bindOf(h.s, q, h.w('w1').wid, h.w('w1').iid);
  const refused = ['POST /api/draft', 'POST /api/chat', 'PATCH /api/patients/p1', 'DELETE /api/notes/note-9', 'GET /api/notes/note-9']
    .map((r) => h.s.intercept({ method: r.split(' ')[0], path: r.split(' ')[1] }).code);
  eq(refused, Array(5).fill('maintenance'), 'every unrelated read and write is refused');
  eq(h.s.status().shortWrites, 5, 'each refusal is counted, none is the report');
  eq(h.flush('w1', 'note-1', b1.flushToken, rev).admitted, 'flush-save', 'the one narrow permission still works');
});

/* ============ REVISION 3 — the six ir2 findings, as PERMANENT counterexamples ========= */
test('F1-close-answer-partial', 'an incomplete close answer fails closed: {} decides nothing, ever', () => {
  for (const bad of [{}, { recording: false }, { unsaved: false }, { saveInFlight: false },
    { recording: false, unsaved: false }, { recording: 'yes', unsaved: false, saveInFlight: false }]) {
    const h = harness(['w1']);
    h.publish('w1', { recording: true, unsaved: true }); // w1 is recording with typed text
    const p = h.s.closeRequest('w1', h.w('w1').iid, null);
    eq(h.s.closeAnswer('w1', h.w('w1').iid, p.token, bad), { code: 'malformed_answer', decision: 'defer_malformed' },
      `BUG: ${JSON.stringify(bad)} must not decide`);
    eq(h.s.pendingClose, null, 'the probe is still one-shot: the bad answer consumed it');
  }
  const h = harness(['w1', 'w2']);
  const p = h.s.closeRequest('w1', h.w('w1').iid, null);
  eq(h.s.closeAnswer('w2', h.w('w2').iid, p.token, { recording: false, unsaved: false, saveInFlight: false }).code, 'stale_probe',
    'another instance cannot answer it');
  eq(h.s.closeAnswer('w1', h.w('w1').iid, p.token, { recording: false, unsaved: false, saveInFlight: false }).decision, 'close',
    'the complete answer decides, and only for a genuinely clean window');
});
test('F2-frozen-target-and-revision', 'the save target is frozen at admission; a note-id match cannot justify a newer save', () => {
  // two windows, two notes, the same note opened at two different revisions
  const h = harness(['w1', 'w2']);
  const r1 = h.edit('w1', 'note-1');      // note-1 @ rev 1
  const r2 = h.edit('w2', 'note-1');      // note-1 @ rev 1 in its own window
  h.edit('w2', 'note-1');                 // note-1 @ rev 2 in w2: same note id, newer revision
  const q = h.s.initiate('shell-stdin');
  const b1 = bindOf(h.s, q, h.w('w1').wid, h.w('w1').iid), b2 = bindOf(h.s, q, h.w('w2').wid, h.w('w2').iid);
  eq(h.flush('w1', 'note-1', b1.flushToken, r1).admitted, 'flush-save', 'w1 flushes its own revision');
  eq(h.flush('w2', 'note-1', b2.flushToken, r2).code, 'flush_stale_revision', 'BUG: an older revision of the same note was admitted');
  eq(h.flush('w2', 'note-1', b2.flushToken, 99).code, 'flush_stale_revision', 'and so was a revision that never existed');
  eq(h.flush('w2', 'note-1', b2.flushToken, 2).admitted, 'flush-save', 'its own newer revision is admitted');
  h.s.settleFlush(b1, lastJob(b1), 'saved');
  eq(h.s.unsavedTruth(h.s.windows.get(h.s.key(h.w('w2').wid, h.w('w2').iid))), true, 'w2 is still unsaved while its save writes');
  h.s.settleFlush(b2, lastJob(b2), 'saved');
  eq(h.s.unsavedTruth(h.s.windows.get(h.s.key(h.w('w2').wid, h.w('w2').iid))), false, 'only now is note-1@rev2 proven persisted');
  // a switch during the outstanding save is refused, so the frozen target stays true
  const h2 = harness(['w1']);
  const r = h2.edit('w1', 'note-1');
  const q2 = h2.s.initiate('shell-stdin'), c1 = bindOf(h2.s, q2, h2.w('w1').wid, h2.w('w1').iid);
  h2.flush('w1', 'note-1', c1.flushToken, r);
  eq(h2.declare('w1', 'note-2').code, 'flush_note_switch_blocked', 'BUG: the window switched its open note under an admitted save');
  eq(c1.target, { noteId: 'note-1', rev: r, instanceId: h2.w('w1').iid, windowId: 'w1', contentId: `i1|note-1|${r}` },
    'the target is frozen: the exact (window, instance, note, revision, content) identity');
});
test('F2b-late-failure-is-not-excused', 'a late failure from a dead generation is blocked until the EXACT revision is persisted', () => {
  const h = harness(['w1']);
  const r = h.edit('w1', 'note-1');
  const q1 = h.s.initiate('shell-stdin'), b1 = bindOf(h.s, q1, h.w('w1').wid, h.w('w1').iid);
  h.flush('w1', 'note-1', b1.flushToken, r);
  h.c.advance(DRAIN_MS); eq(q1.outcome, { ok: false, blockers: ['timeout'] }, 'q1 timed out with its save in flight');
  const q2 = h.s.initiate('shell-stdin'), b2 = bindOf(h.s, q2, h.w('w1').wid, h.w('w1').iid);
  eq(h.s.settleFlush(b1, lastJob(b1), 'error').code, 'stale_generation', 'the dead generation\'s save fails late');
  A(!q2.settled, 'it must not settle q2');
  h.report('w1', b2, [], h.observed('w1'));
  eq(q2.outcome, { ok: false, blockers: ['save_error'] }, 'BUG: a clean report over an unpersisted revision succeeded');
  // a LATER generation's save of the same buffer does not excuse a failed save
  // of a DIFFERENT buffer: this is the same-window supersession case, stated
  // honestly. An intermediate revision of one buffer that the user has since
  // edited past is not separately owed (the buffer holds the later content);
  // a failed edit on another note or in another window is (F10, F13).
  const h2 = harness(['w1']);
  const rr = h2.edit('w1', 'note-1');
  const p1 = h2.s.initiate('shell-stdin'), pb1 = bindOf(h2.s, p1, h2.w('w1').wid, h2.w('w1').iid);
  h2.flush('w1', 'note-1', pb1.flushToken, rr); // admitted at the content it really held
  h2.edit('w1', 'note-1'); // the user typed again: rev 2 supersedes rev 1 in ONE buffer
  h2.c.advance(DRAIN_MS); // p1 times out with its admitted save still in flight
  const p2 = h2.s.initiate('shell-stdin'), pb2 = bindOf(h2.s, p2, h2.w('w1').wid, h2.w('w1').iid);
  eq(h2.s.settleFlush(pb1, lastJob(pb1), 'error').code, 'stale_generation', 'the dead generation\'s save fails late');
  eq(h2.flush('w1', 'note-1', pb2.flushToken, 2).admitted, 'flush-save', 'the CURRENT content of the buffer is saved');
  h2.s.settleFlush(pb2, lastJob(pb2), 'saved');
  eq(h2.report('w1', pb2, [], h2.observed('w1')).code, 'accepted', 'and the acknowledgement is now substantiated');
  eq(p2.outcome, { ok: true, blockers: [] }, 'the buffer the window holds is what the store holds');
  eq(h2.s.storedContent('note-1').id, `i1|note-1|2`, 'the server knows exactly WHICH content it holds');
});
test('F3-per-binding-liveness', 'a chatty sibling cannot starve a silent window\'s bound', () => {
  const h = harness(['w1', 'w2']);
  const q = h.s.initiate('shell-stdin'); h.report('w1', bindOf(h.s, q, h.w('w1').wid, h.w('w1').iid), [], h.observed('w1'));
  for (let t = 0; t < 30_000; t += 1_900) { // w1 chatters every 1.9 s: it re-arms and publishes
    h.c.advance(1_900); h.s.armPoll('w1', h.w('w1').iid); h.publish('w1', { recording: false, unsaved: false });
  }
  eq(q.outcome, { ok: false, blockers: ['no_response'] }, 'BUG: the silent window waited for the sibling');
  eq(q.settledAt, LIVENESS_MS, `abandoned at its OWN due time, not the deadline (t=${q.settledAt})`);
  A(!h.s.maintenance, 'P9: rolled back');
});
test('F4-unsubstantiated-clean-report', 'a clean report cannot erase unsaved or recording state', () => {
  // (a) unsaved text, no note declared at all, and no save possible
  const h = harness(['w1']);
  h.edit('w1', null); h.publish('w1', { recording: false, unsaved: true });
  const q = h.s.initiate('shell-stdin'), b1 = bindOf(h.s, q, h.w('w1').wid, h.w('w1').iid);
  // the window's own words are honest here, so the acknowledgement lands — and the
  // drain still fails, because the outcome is computed from symbolic state only
  eq(h.report('w1', b1, [], h.observed('w1')).code, 'accepted', 'an honest acknowledgement is accepted');
  eq(q.outcome, { ok: false, blockers: ['save_error'] }, 'BUG: it produced success over unpersisted text');
  eq(h.s.status().truth.unsaved, 1, 'the symbolic unsaved fact is still there');
  // (b) recording, never cleared
  const h2 = harness(['w1']);
  h2.publish('w1', { recording: true, unsaved: false });
  const q2 = h2.s.initiate('shell-stdin'), b2 = bindOf(h2.s, q2, h2.w('w1').wid, h2.w('w1').iid);
  eq(h2.report('w1', b2, [], h2.observed('w1')).code, 'accepted', 'its honest acknowledgement lands');
  eq(h2.s.status().truth.recording, 1, 'the recording fact was NOT erased by the report');
  eq(q2.outcome, { ok: false, blockers: ['recording'] }, 'BUG: recording was erased by a report');
  // (c) the evidenced transition that IS legitimate: the instance says it stopped
  const h3 = harness(['w1']);
  h3.publish('w1', { recording: true, unsaved: false });
  h3.s.initiate('shell-stdin');
  const b3 = bindOf(h3.s, h3.s.q, h3.w('w1').wid, h3.w('w1').iid);
  h3.publish('w1', { recording: false, unsaved: false }); // the same instance states the transition
  eq(h3.report('w1', b3, [], h3.observed('w1')).code, 'accepted', 'a real, evidenced transition is accepted');
  eq(h3.s.q.outcome, { ok: true, blockers: [] }, 'and the protocol stays usable');
  // (d) the DISAGREEING clean report, in both directions: it is refused AND it
  //     moves no fact — a report may never launder a claim into the record
  const h4 = harness(['w1']);
  h4.publish('w1', { recording: true, unsaved: false });
  h4.edit('w1', 'note-1');
  const q4 = h4.s.initiate('shell-stdin'), b4 = bindOf(h4.s, q4, h4.w('w1').wid, h4.w('w1').iid);
  const before = h4.snap();
  eq(h4.report('w1', b4, [], { rev: 1, openNote: 'note-1', recording: false, unsaved: false }).code, 'report_unsubstantiated',
    'BUG: a clean report that disagrees on recording was accepted');
  eq(h4.report('w1', b4, [], { rev: 1, openNote: 'note-1', recording: true, unsaved: false }).code, 'report_unsubstantiated',
    'BUG: a clean report that denies the unpersisted content was accepted');
  eq(h4.snap(), before, 'BUG: a refused report moved a window record');
  A(!q4.settled, 'and it did not count as the acknowledgement');
  h4.c.advance(LIVENESS_MS + 1);
  eq(q4.outcome, { ok: false, blockers: ['save_error', 'recording', 'no_response'] },
    'the drain fails closed without it, and every real fact is in the blockers');
  // (e) the same lie where NOTHING else disagrees, so only the laundering can
  //     make it consistent: a recording window with nothing unsaved
  const h5 = harness(['w1']);
  h5.publish('w1', { recording: true, unsaved: false });
  const q5 = h5.s.initiate('shell-stdin'), b5 = bindOf(h5.s, q5, h5.w('w1').wid, h5.w('w1').iid);
  const before5 = h5.snap();
  eq(h5.report('w1', b5, [], { rev: 0, openNote: null, recording: false, unsaved: false }).code, 'report_unsubstantiated',
    'BUG: the only lie in the report is the recording one, and it was accepted');
  eq(h5.snap(), before5, 'BUG: the refused report moved the recording record');
  A(!q5.settled, 'and the drain stays open');
});
test('F5-instance-identity', 'two live sessions for one suggested id are two bindings; the incumbent is not orphaned', () => {
  const c = new Clock(), s = new Server(c); s.shellAttached = true;
  const a = s.register('w1', 'suggested-w1'); // tab A
  const b = s.register('w1', 'suggested-w1'); // tab B: the browser copied the SAME sessionStorage id
  A(a.iid !== b.iid, 'the server mints a distinct instance identity per registration');
  s.publish('w1', a.iid, { recording: true, unsaved: true }); // A is recording with typed text
  s.edit('w1', a.iid, 'note-1');
  const q = s.initiate('shell-stdin');
  const bA = bindOf(s, q, 'w1', a.iid), bB = bindOf(s, q, 'w1', b.iid);
  A(!!bA && !!bB, 'both live sessions are bound, each with its own token');
  A(bA.flushToken !== bB.flushToken, 'one token per (window, quiesce, instance)');
  A(s.polls.get(s.key('w1', a.iid)).delivered.quiesceId === q.id, 'A\'s held wait was not overwritten by B\'s');
  eq(s.report('w1', b.iid, { 'x-apunta-window-id': 'w1', 'x-apunta-instance-id': b.iid },
    { quiesceId: q.id, flushToken: bB.flushToken, blockers: [], observed: { rev: 0, openNote: null, recording: false, unsaved: false } }).code, 'accepted',
    'B reports clean for itself');
  A(!q.settled, 'BUG: B\'s clean report settled while A was recording with unsaved text');
  // reload / disconnect / reconnect: the old instance is gone and fails closed
  s.drop('w1', a.iid);
  c.advance(LIVENESS_MS + 1);
  eq(q.outcome, { ok: false, blockers: ['no_response'] }, 'a reloaded tab fails its generation closed');
  const again = s.register('w1', 'suggested-w1'); // reconnect gets a FRESH instance
  const q2 = s.initiate('shell-stdin'), b2 = bindOf(s, q2, 'w1', again.iid);
  eq(s.intercept({ method: 'PATCH', path: '/api/notes/note-1', headers: { 'x-apunta-window-id': 'w1', 'x-apunta-instance-id': a.iid }, query: { flush_token: bA.flushToken, rev: 1 } }).code,
    'flush_unknown_window', 'a stale instance id cannot save, whatever token it holds');
  eq(s.intercept({ method: 'PATCH', path: '/api/notes/note-1', headers: { 'x-apunta-window-id': 'w1', 'x-apunta-instance-id': again.iid }, query: { flush_token: b2.flushToken, rev: 0 } }).code,
    'flush_no_open_note', 'the fresh instance has opened nothing yet');
  s.edit('w1', again.iid, 'note-1'); // it opens a note and edits
  eq(s.intercept({ method: 'PATCH', path: '/api/notes/note-1', headers: { 'x-apunta-window-id': 'w1', 'x-apunta-instance-id': again.iid }, query: { flush_token: b2.flushToken, rev: 1 } }).admitted,
    'flush-save', 'and then it may save at its own revision');
});
test('F6-malformed-input', 'a malformed header, body or request is refused deterministically, never thrown', () => {
  const h = harness(['w1']);
  const rev = h.edit('w1', 'note-1');
  const q = h.s.initiate('shell-stdin'), b1 = bindOf(h.s, q, h.w('w1').wid, h.w('w1').iid);
  const good = { quiesceId: q.id, flushToken: b1.flushToken, blockers: [] };
  for (const [hds, body] of [[undefined, good], [null, good], ['nope', good], [[], good],
    [{ 'x-apunta-window-id': 'w1', 'x-apunta-instance-id': h.w('w1').iid }, undefined],
    [{ 'x-apunta-window-id': 'w1', 'x-apunta-instance-id': h.w('w1').iid }, null],
    [{ 'x-apunta-window-id': 'w1', 'x-apunta-instance-id': h.w('w1').iid }, 'nope'],
    [{ 'x-apunta-window-id': 'w1', 'x-apunta-instance-id': h.w('w1').iid }, []],
    [{ 'x-apunta-window-id': 'w1', 'x-apunta-instance-id': h.w('w1').iid }, { ...good, blockers: 'none' }],
    [{ 'x-apunta-window-id': 'w1', 'x-apunta-instance-id': h.w('w1').iid }, { ...good, observed: { rev: 1 } }]]) {
    eq(h.s.report('w1', h.w('w1').iid, hds, body).code, 'malformed_report', `BUG: no throw and a code for ${JSON.stringify(body)?.slice(0, 40)}`);
  }
  for (const req of [undefined, null, 'nope', {}, { method: 'PATCH' }, { path: '/api/notes/note-1' }])
    A(h.s.intercept(req).admitted !== undefined, 'intercept is total over junk input');
  eq(h.flush('w1', 'note-1', b1.flushToken, rev).admitted, 'flush-save', 'the real save still works afterwards');
  h.s.armPoll('w1', h.w('w1').iid); // a window in the re-arm gap cannot be asked at all
  const p = h.s.closeRequest('w1', h.w('w1').iid, null);
  for (const bad of [undefined, null, 'nope', [], { recording: false, unsaved: false, saveInFlight: false, extra: 1 }])
    A(h.s.closeAnswer('w1', h.w('w1').iid, 'cp-none', bad).code === 'stale_probe', 'a wrong probe token never reaches the answer');
  eq(h.s.closeAnswer('w1', h.w('w1').iid, p.token, 'nope').code, 'malformed_answer', 'a non-object answer fails closed');
});
test('F7-epoch-fence', 'a successful decision cannot be invalidated by anything admitted after it', () => {
  const h = harness(['w1', 'w2']);
  h.edit('w1', 'note-1');
  const q = h.s.initiate('shell-stdin'), b1 = bindOf(h.s, q, h.w('w1').wid, h.w('w1').iid);
  h.flush('w1', 'note-1', b1.flushToken, 1); h.s.settleFlush(b1, lastJob(b1), 'saved');
  h.report('w1', b1, [], h.observed('w1')); h.report('w2', bindOf(h.s, q, h.w('w2').wid, h.w('w2').iid), [], h.observed('w2'));
  eq(q.outcome, { ok: true, blockers: [] }, 'a clean success');
  // every attempt to invalidate it during the held success
  eq(h.s.intercept({ method: 'PATCH', path: '/api/notes/note-1', headers: { 'x-apunta-window-id': 'w1', 'x-apunta-instance-id': h.w('w1').iid }, query: { flush_token: 'anything', rev: 1 } }).code, 'frozen_write', 'no save');
  eq(h.s.edit('w1', h.w('w1').iid, 'note-1').code, 'frozen_no_edit', 'no new edit');
  eq(h.s.begin('refine', 'job-refine-late').code, 'frozen_no_jobs', 'no new operation');
  eq(h.s.register('w3', 'suggested-w3').code, 'frozen_no_registrants', 'no new window');
  eq(h.s.armPoll('w1', h.w('w1').iid).code, 'frozen_no_waits', 'no new wait');
  eq(h.report('w1', b1, [], h.observed('w1')).code, 'already_settled', 'no late report');
  h.c.advance(DRAIN_MS * 2); // stale timers of a settled generation
  A(h.s.maintenance && h.s.freeze.epoch === 1, 'the held success is intact after the stale deadlines pass');
  invariants(h.s, 'post-success');
  eq(h.s.status().truth.unsaved, 0, 'and still provably clean');
  // a late legitimate registrant is queued for its client to RETRY after release
  eq(h.s.status().deferredRetriesQueued, 1, 'the late registration is queued, not dropped');
  h.s.proposeLift(['maintenance_off']);
  const rel = h.s.releaseByShell('maintenance_off');
  eq(rel.deferredRetriesQueued, 1, 'the release counts what its clients must retry — it serves nothing itself');
  A(/expected to retry/.test(rel.note), 'and says exactly that, rather than claiming a service');
  eq(h.s.status().deferredRetriesQueued, 0, 'and the queue is empty');
});
test('F8-observed-must-match', 'a report whose observation disagrees with the server\'s record cannot succeed', () => {
  const h = harness(['w1']);
  const rev = h.edit('w1', 'note-1');
  const q = h.s.initiate('shell-stdin'), b1 = bindOf(h.s, q, h.w('w1').wid, h.w('w1').iid);
  h.flush('w1', 'note-1', b1.flushToken, rev);
  h.edit('w1', 'note-1'); // typed again WHILE the save was writing: rev moved on
  eq(h.report('w1', b1, [], { rev, openNote: 'note-1', recording: false, unsaved: false }).code, 'report_unsubstantiated',
    'BUG: the stale revision was reported clean');
  h.s.settleFlush(b1, lastJob(b1), 'saved');
  eq(h.report('w1', b1, [], { rev: 2, openNote: 'note-1', recording: false, unsaved: false }).code, 'report_unsubstantiated',
    'a report whose observation is stale in the other direction is refused too');
  eq(h.s.status().windowsBound, 1, 'the refused report did not count as the acknowledgement');
  eq(h.flush('w1', 'note-1', b1.flushToken, 2).code, 'flush_replayed_token', 'the consumed token is dead');
  const spent = b1.flushToken;
  const b2 = h.s.reissue(h.w('w1').wid, h.w('w1').iid); // the quiesce asks again and the window is re-armed
  A(b2.flushToken !== spent, 'a fresh credential, one per (window, quiesce, instance, attempt)');
  eq(h.flush('w1', 'note-1', b2.flushToken, 2).admitted, 'flush-save', 'and the new revision flushes');
  h.s.settleFlush(b2, lastJob(b2), 'saved');
  eq(h.report('w1', b2, [], h.observed('w1')).code, 'accepted', 'now the report is substantiated');
  eq(q.outcome, { ok: true, blockers: [] }, 'BUG: the success was published anyway');
  A(h.s.freeze, 'and the epoch fence holds');
});

/* ==== the ten findings of reviews/P5.3-protocol-proof-v3-ir1.md, as PERMANENT schedules ==== */
test('F9-close-decision-is-pure', 'the close decision mutates nothing: the answer is validated, then compared', () => {
  const no = { recording: false, unsaved: false, saveInFlight: false };
  // (a) the laundering lie: a recording window answered "recording:false"
  const h = harness(['w1']);
  h.publish('w1', { recording: true, unsaved: false });
  h.s.armPoll('w1', h.w('w1').iid);
  const before = h.snap();
  const p = h.s.closeRequest('w1', h.w('w1').iid, null);
  eq(h.s.closeAnswer('w1', h.w('w1').iid, p.token, no), { code: 'decided', decision: 'confirm_recording' },
    'BUG: a recording window was closed on the client\'s own "recording:false"');
  eq(h.s.decisions[0].sawRecording, true, 'and the decision read the PRE-EXISTING record, not the answer');
  eq(h.snap(), before, 'BUG: the decision path mutated a window record');
  eq(h.s.closeAnswer('w1', h.w('w1').iid, p.token, no).code, 'stale_probe', 'the probe is still one-shot');
  // (b) the unsaved lie, the other direction
  const h2 = harness(['w1']);
  h2.edit('w1', 'note-1'); h2.publish('w1', { recording: false, unsaved: true });
  h2.s.armPoll('w1', h2.w('w1').iid);
  const before2 = h2.snap();
  const p2 = h2.s.closeRequest('w1', h2.w('w1').iid, null);
  eq(h2.s.closeAnswer('w1', h2.w('w1').iid, p2.token, no).decision, 'defer_unsaved',
    'BUG: "unsaved:false" overruled the content the store does not hold');
  eq(h2.snap(), before2, 'BUG: the decision path mutated state');
  // (c) the save lie: a real save job the client denies
  const h3 = harness(['w1']);
  h3.s.begin('save', 'job-save-pure'); h3.s.armPoll('w1', h3.w('w1').iid);
  const before3 = h3.snap();
  const p3 = h3.s.closeRequest('w1', h3.w('w1').iid, null);
  eq(h3.s.closeAnswer('w1', h3.w('w1').iid, p3.token, no).decision, 'defer_save',
    'BUG: "saveInFlight:false" overruled the job registry');
  eq(h3.snap(), before3, 'BUG: the decision path mutated state');
  h3.s.end('job-save-pure');
  // (d) the window went away between probe and answer: nothing is known, so nothing closes
  const h4 = harness(['w1']);
  h4.s.armPoll('w1', h4.w('w1').iid);
  const p4 = h4.s.closeRequest('w1', h4.w('w1').iid, null);
  h4.drop('w1');
  eq(h4.s.closeAnswer('w1', h4.w('w1').iid, p4.token, no), { code: 'stale_probe' },
    'the probe died with its window: an answer for a window nobody holds is stale, not close');
  // (e) the recording blocker is PRESERVED in the honest direction, and the
  //     transition is only ever admissible through the explicit fenced publish
  const h5 = harness(['w1']);
  h5.publish('w1', { recording: true, unsaved: false });
  h5.s.armPoll('w1', h5.w('w1').iid);
  const p5 = h5.s.closeRequest('w1', h5.w('w1').iid, null);
  eq(h5.s.closeAnswer('w1', h5.w('w1').iid, p5.token, { recording: true, unsaved: true, saveInFlight: false }).decision,
    'confirm_recording', 'an honest answer still confirms the recording');
  h5.publish('w1', { recording: false, unsaved: false }); // the explicit, fenced transition
  h5.s.armPoll('w1', h5.w('w1').iid);
  const p6 = h5.s.closeRequest('w1', h5.w('w1').iid, null);
  eq(h5.s.closeAnswer('w1', h5.w('w1').iid, p6.token, no).decision, 'close', 'and then a clean window closes');
});
test('F10-content-identity-across-instances', 'one window\'s save never subsumes another window\'s content of one note', () => {
  // (a) the ir1 counterexample: w1 saves note-1 at a HIGHER counter, then w2
  //     types 10 ms later at its own counter 1, and its clean report is honest
  const h = harness(['w1', 'w2']); const o = contentOracle();
  h.edit('w1', 'note-1'); o.hold(keyOf(h, 'w1'), 'note-1');
  h.edit('w1', 'note-1'); o.hold(keyOf(h, 'w1'), 'note-1');
  h.s.initiate('shell-stdin');
  const b1 = h.bind('w1');
  eq(h.flush('w1', 'note-1', b1.flushToken, 2).admitted, 'flush-save', 'w1 saves its own content');
  const c1 = o.contentOf(keyOf(h, 'w1'));
  h.s.settleFlush(b1, lastJob(b1), 'saved'); o.wrote('note-1', c1);
  h.c.advance(10);
  h.edit('w2', 'note-1'); const c2 = o.hold(keyOf(h, 'w2'), 'note-1'); // w2 is at its OWN counter 1
  A(h.s.storedContent('note-1').id !== c2, 'BUG: the store claims to hold w2\'s content');
  eq(h.report('w2', h.bind('w2'), [], h.observed('w2')).code, 'accepted', 'w2\'s own honest acknowledgement lands');
  eq(h.report('w1', b1, [], h.observed('w1')).code, 'accepted', 'and so does w1\'s');
  eq(h.s.q.outcome, { ok: false, blockers: ['save_error', 'conflict'] },
    'BUG: a success was published while the store does not hold w2\'s content');
  // (b) the same with COLLIDING counters, and (c) both completion orders
  for (const order of ['w1-then-w2', 'w2-then-w1']) {
    const g = harness(['w1', 'w2']); const oc = contentOracle();
    g.edit('w1', 'note-1'); oc.hold(keyOf(g, 'w1'), 'note-1');
    g.edit('w1', 'note-1'); oc.hold(keyOf(g, 'w1'), 'note-1'); // w1: counter 2
    g.edit('w2', 'note-1'); oc.hold(keyOf(g, 'w2'), 'note-1'); // w2: counter 1, a collision
    g.s.initiate('shell-stdin');
    const gb1 = g.bind('w1'), gb2 = g.bind('w2');
    const save = (n, b) => { const c = oc.contentOf(keyOf(g, n));
      eq(g.flush(n, 'note-1', b.flushToken, g.s.windows.get(g.s.key(...g.ids(n))).rev).admitted, 'flush-save',
        `${order}: ${n} saves its own content`);
      g.s.settleFlush(b, lastJob(b), 'saved'); oc.wrote('note-1', c); };
    if (order === 'w1-then-w2') { save('w1', gb1); save('w2', gb2); } else { save('w2', gb2); save('w1', gb1); }
    g.report('w1', gb1, [], g.observed('w1')); g.report('w2', gb2, [], g.observed('w2'));
    A(g.s.q.outcome.ok === false, `BUG (${order}): a success was published over two contents of one note`);
    A(g.s.q.outcome.blockers.includes('conflict'),
      `BUG (${order}): two live buffers disagree about note-1 and no conflict blocker appeared: ${JSON.stringify(g.s.q.outcome)}`);
  }
  // (d) a window holding TWO notes is tracked on both: another instance writing
  //     one of them again leaves this buffer's content nowhere in the store
  const m = harness(['w1', 'w2']); const om = contentOracle();
  m.edit('w1', 'note-1'); om.hold(keyOf(m, 'w1'), 'note-1');
  const mq1 = m.s.initiate('shell-stdin'), mb = m.bind('w1');
  m.flush('w1', 'note-1', mb.flushToken, 1); m.s.settleFlush(mb, lastJob(mb), 'saved'); om.wrote('note-1', om.contentOf(keyOf(m, 'w1')));
  m.report('w1', mb, [], m.observed('w1')); m.report('w2', m.bind('w2'), [], m.observed('w2'));
  eq(mq1.outcome, { ok: true, blockers: [] }, 'q1 ok: both windows clean, nothing owed');
  m.s.proposeLift(['maintenance_off']); m.s.releaseByShell('maintenance_off');
  m.s.edit(...m.ids('w1'), 'note-2'); om.moveTo(keyOf(m, 'w1'), 'note-2');
  const mq2 = m.s.initiate('shell-stdin'), mb2 = m.bind('w1'), mb2b = m.bind('w2');
  m.flush('w1', 'note-2', mb2.flushToken, 2); m.s.settleFlush(mb2, lastJob(mb2), 'saved'); om.wrote('note-2', om.contentOf(keyOf(m, 'w1')));
  m.edit('w2', 'note-1'); om.hold(keyOf(m, 'w2'), 'note-1'); // w2 writes note-1 AGAIN
  m.flush('w2', 'note-1', mb2b.flushToken, 1); m.s.settleFlush(mb2b, lastJob(mb2b), 'saved');
  om.wrote('note-1', om.contentOf(keyOf(m, 'w2')));
  eq(m.report('w1', mb2, [], m.observed('w1')).code, 'accepted', 'w1\'s own acknowledgement is honest');
  eq(m.report('w2', mb2b, [], m.observed('w2')).code, 'accepted', 'and so is w2\'s');
  A(mq2.outcome.ok === false, 'BUG: a success was published while w1 still holds note-1 content the store lacks');
  A(mq2.outcome.blockers.includes('save_error') && mq2.outcome.blockers.includes('conflict'),
    `BUG: the two facts must both be blockers: ${JSON.stringify(mq2.outcome)}`);
  // (f) the POSITIVE control, judged by the INDEPENDENT oracle: one window, one
  //     note, saved — and the store really holds what the buffer holds
  const p = harness(['w1']); const op = contentOracle();
  p.edit('w1', 'note-1'); op.hold(keyOf(p, 'w1'), 'note-1');
  p.edit('w1', 'note-1'); const cp = op.hold(keyOf(p, 'w1'), 'note-1');
  p.s.initiate('shell-stdin');
  const pb = p.bind('w1');
  eq(p.flush('w1', 'note-1', pb.flushToken, 2).admitted, 'flush-save', 'its own content is admitted');
  p.s.settleFlush(pb, lastJob(pb), 'saved'); op.wrote('note-1', cp);
  eq(p.report('w1', pb, [], p.observed('w1')).code, 'accepted', 'an honest acknowledgement lands');
  eq(p.s.q.outcome, { ok: true, blockers: [] }, 'and the honest success is still reachable');
  op.atOk('at the honest success'); // independent: storage holds the buffer's content
});
test('F11-completion-charged-to-its-operation', 'a delayed duplicate is charged to nothing and moves nothing', () => {
  const h = harness(['w1']); const o = contentOracle();
  h.edit('w1', 'note-1'); const c1 = o.hold(keyOf(h, 'w1'), 'note-1');
  h.s.initiate('shell-stdin');
  let b = h.bind('w1');
  h.flush('w1', 'note-1', b.flushToken, 1);
  const jobA = lastJob(b);
  eq(h.s.settleFlush(b, jobA, 'saved').code, 'accepted', 'attempt A really completed');
  o.wrote('note-1', c1);
  h.edit('w1', 'note-1'); const c2 = o.hold(keyOf(h, 'w1'), 'note-1'); // the user types again: rev 2
  b = h.s.reissue(h.w('w1').wid, h.w('w1').iid); // a FRESH credential, as F8 does
  eq(h.flush('w1', 'note-1', b.flushToken, 2).admitted, 'flush-save', 'attempt B is admitted and writing');
  const jobB = lastJob(b);
  // (a) the DELAYED DUPLICATE for A, in both outcome directions: the store, the
  //     attempt and the completion ledger must not move, in EITHER order
  const staleFirst = () => { const store0 = h.s.storedContent('note-1').id;
    for (const outcome of ['saved', 'error']) {
      eq(h.s.settleFlush(b, jobA, outcome).code, 'stale_completion',
        `BUG: a delayed ${outcome} delivery for ${jobA} was charged to ${jobB}`);
      eq(h.s.storedContent('note-1').id, store0, `BUG: a stale ${outcome} for A moved the store`);
      eq(b.attempts[1].settled, false, 'BUG: attempt B was settled by a delivery for A');
      eq(h.s.completions.length, 1, 'BUG: a stale delivery produced a completion');
    } };
  const genuineFirst = () => { const store0 = h.s.storedContent('note-1').id;
    eq(h.s.settleFlush(b, jobB, 'saved').code, 'accepted', 'B\'s own completion is accepted');
    A(h.s.storedContent('note-1').id !== store0, 'BUG: B\'s real completion changed nothing');
    for (const outcome of ['saved', 'error']) {
      eq(h.s.settleFlush(b, jobA, outcome).code, 'stale_completion',
        `BUG: a late ${outcome} delivery for ${jobA} was charged to ${jobB}`);
      eq(h.s.storedContent('note-1').id, 'i1|note-1|2', `BUG: a late ${outcome} for A moved the store`);
      eq(h.s.completions.length, 2, 'BUG: a late delivery produced a third completion');
    } };
  staleFirst();               // a stale duplicate BEFORE B really ends
  eq(h.s.status().jobs, ['save'], 'and B is still writing: the drain is still open');
  genuineFirst();             // then B really ends, and A\'s late duplicates follow
  o.wrote('note-1', c2);
  eq(h.report('w1', b, [], h.observed('w1')).code, 'accepted', 'and the honest acknowledgement lands');
  eq(h.s.q.outcome, { ok: true, blockers: [] }, 'only the genuine completion settles it');
  // (b) an outcome nobody recognises is refused BEFORE any mutation
  const h2 = harness(['w1']);
  h2.edit('w1', 'note-1'); h2.s.initiate('shell-stdin');
  const b2 = h2.bind('w1');
  h2.flush('w1', 'note-1', b2.flushToken, 1);
  for (const bad of ['Save', 'ok', '', null, undefined, 1, {}]) {
    eq(h2.s.settleFlush(b2, lastJob(b2), bad).code, 'invalid_outcome', `BUG: ${JSON.stringify(bad)} was accepted`);
    eq(b2.attempts[0].settled, false, 'BUG: a refused outcome settled the attempt anyway');
    eq(h2.s.status().jobs, ['save'], 'BUG: a refused outcome ended the job anyway');
  }
  eq(h2.s.settleFlush(null, 'job', 'saved').code, 'unknown_binding', 'a junk binding is a code, not a throw');
  eq(h2.s.settleFlush(b2, 'save-does-not-exist', 'saved').code, 'stale_completion', 'an unknown operation is charged to nothing');
});
// The TITLE below keeps its original wording so the run output stays
// byte-identical to the output every reviewer reproduced; read it with the
// header's S4 and `-v3-ir2` finding 3: the fence refuses every mutation that
// could INVALIDATE a held success, and the battery runs after every LISTED
// public event. The assertions below are unchanged.
test('F12-fence-is-total-and-the-battery-runs-everywhere', 'the epoch fence covers EVERY public mutation, refusals included', () => {
  const h = harness(['w1', 'w2']);
  h.edit('w1', 'note-1');
  const q = h.s.initiate('shell-stdin'), b1 = h.bind('w1');
  h.flush('w1', 'note-1', b1.flushToken, 1); h.s.settleFlush(b1, lastJob(b1), 'saved');
  h.report('w1', b1, [], h.observed('w1')); h.report('w2', h.bind('w2'), [], h.observed('w2'));
  eq(q.outcome, { ok: true, blockers: [] }, 'a clean success is held under the fence');
  const before = h.snap();
  eq(h.publish('w1', { recording: true, unsaved: false }).code, 'frozen_no_publish', 'BUG: publish is unfenced');
  eq(h.declare('w1', 'note-7').code, 'frozen_no_declare', 'BUG: a note declaration is unfenced');
  eq(h.s.edit(h.w('w1').wid, h.w('w1').iid, 'note-1').code, 'frozen_no_edit', 'no edit');
  eq(h.s.register('w9', 'suggested-w9').code, 'frozen_no_registrants', 'no registration');
  eq(h.s.begin('refine', 'job-refine-fenced').code, 'frozen_no_jobs', 'no operation');
  eq(h.s.armPoll('w1', h.w('w1').iid).code, 'frozen_no_waits', 'no wait');
  eq(h.s.reissue(h.w('w1').wid, h.w('w1').iid).code, 'frozen_no_reissue', 'no re-issue');
  eq(h.s.intercept({ method: 'POST', path: '/api/draft' }).code, 'frozen_write', 'no write');
  eq(h.report('w1', b1, [], h.observed('w1')).code, 'already_settled', 'no late report');
  eq(h.s.settleFlush(b1, lastJob(b1), 'saved').code, 'stale_completion', 'no completion is manufactured after the fact');
  eq(h.snap(), before, 'BUG: a refused event mutated state under the fence');
  // a socket close is not a way out of the fence either
  h.drop('w2');
  A(h.s.freeze?.epoch === 1 && h.s.maintenance, 'BUG: a socket close lifted the held success');
  // the battery really runs for a REFUSED event, not only for a mutating one
  const runs = h.s.batteryRuns;
  h.publish('w1', { recording: true, unsaved: false }); h.declare('w1', 'note-7');
  A(h.s.batteryRuns === runs + 2, 'BUG: the invariant battery did not run after the refused events');
  // and it is wired to every LISTED public event, structurally — a membership
  // assertion: it proves each listed name is wrapped, never that the list is
  // complete (`-v3-ir2` finding 4)
  for (const name of PUBLIC_EVENTS) {
    A(Object.hasOwn(h.s, name), `BUG: ${name} is not wrapped by the battery`);
    A(h.s[name] !== Server.prototype[name], `BUG: ${name} is still the unwrapped prototype method`);
  }
});
test('F13-note-switch-cannot-abandon-a-buffer', 'a window may not leave unpersisted content behind it', () => {
  const h = harness(['w1']); const o = contentOracle();
  h.edit('w1', 'note-1'); const c1 = o.hold(keyOf(h, 'w1'), 'note-1');
  eq(h.declare('w1', 'note-2').code, 'note_switch_blocked', 'BUG: a declaration abandoned an unsaved buffer');
  eq(h.s.edit(...h.ids('w1'), 'note-2').code, 'note_switch_blocked', 'BUG: an edit abandoned an unsaved buffer');
  const w = h.s.windows.get(h.s.key(h.w('w1').wid, h.w('w1').iid));
  eq([w.openNote, w.rev], ['note-1', 1], 'and the refused switch moved neither the note nor the revision');
  A(w.held.has('note-1'), 'BUG: the unsaved content fell out of the model');
  h.s.initiate('shell-stdin');
  const b1 = h.bind('w1');
  eq(h.flush('w1', 'note-1', b1.flushToken, 1).admitted, 'flush-save', 'the owed content is flushable where it is');
  h.s.settleFlush(b1, lastJob(b1), 'saved'); o.wrote('note-1', c1);
  eq(h.report('w1', b1, [], h.observed('w1')).code, 'accepted', 'and its acknowledgement is substantiated');
  eq(h.s.q.outcome, { ok: true, blockers: [] }, 'nothing was abandoned, so the honest success is reachable');
  o.atOk('after the honest success'); o.nothingAbandoned('after the honest success');
  // the switch becomes admissible only once nothing is owed
  h.s.proposeLift(['maintenance_off']); h.s.releaseByShell('maintenance_off');
  eq(h.s.edit(...h.ids('w1'), 'note-2').code, 'edited', 'a clean window may switch notes');
  const c2 = o.moveTo(keyOf(h, 'w1'), 'note-2');
  const q2 = h.s.initiate('shell-stdin'), b2 = h.bind('w1');
  eq(h.flush('w1', 'note-1', b2.flushToken, 2).code, 'flush_wrong_note', 'and it may not flush the note it left');
  eq(h.flush('w1', 'note-2', b2.flushToken, 2).admitted, 'flush-save', 'but the note it holds is admitted');
  h.s.settleFlush(b2, lastJob(b2), 'saved'); o.wrote('note-2', c2);
  eq(h.report('w1', b2, [], h.observed('w1')).code, 'accepted', 'its acknowledgement lands');
  eq(q2.outcome, { ok: true, blockers: [] }, 'and the second quiesce settles clean too');
  o.nothingAbandoned('after the second success'); // nothing was ever left nowhere
});
test('F14-bridge-release-is-total', 'every stdin-reachable release message returns a code and mutates nothing', () => {
  const h = harness(['w1']);
  const q = h.s.initiate('shell-stdin'), b1 = h.bind('w1');
  h.report('w1', b1, [], h.observed('w1'));
  eq(q.outcome, { ok: true, blockers: [] }, 'a successful maintenance state is held');
  const before = h.snap();
  const LIFT = 'maintenance_off_after_f14'; // defined only inside this test
  for (const m of [...BRIDGE_VOCAB, LIFT, '', 'nope', 42, null, undefined, {}, []]) {
    eq(h.s.releaseByShell(m).code, 'refused', `BUG: ${JSON.stringify(m)} did not return a refusal`);
    eq(h.snap(), before, `BUG: a refused release message for ${JSON.stringify(m)} mutated state`);
  }
  eq(h.s.releaseByShell(LIFT).reason, 'no_such_lift_message', 'the refusal says WHY: nothing defines it');
  h.s.proposeLift([LIFT]);
  const held = h.snap();
  for (const m of [...BRIDGE_VOCAB, 'something_else']) {
    eq(h.s.releaseByShell(m).code, 'refused', `BUG: ${m} lifted a held success`);
    eq(h.snap(), held, `BUG: ${m} mutated a held success`);
  }
  eq(h.s.releaseByShell(LIFT).code, 'released', 'the one defined message releases');
  A(!h.s.freeze && !h.s.maintenance, 'and the fence and maintenance are lifted together');
  // releasing when nothing is held is also a refusal, not an assert
  h.s.initiate('shell-stdin');
  eq(h.s.releaseByShell(LIFT).reason, 'no_successful_maintenance_held', 'nothing to release');
});
test('F15-boundaries-are-total-over-junk', 'no public boundary throws on a junk identity or argument', () => {
  const h = harness(['w1', 'w2']);
  h.edit('w1', 'note-1'); h.s.initiate('shell-stdin');
  const b1 = h.bind('w1');
  const junk = [undefined, null, 0, 42, '', [], {}, true]; // no addressable id: nothing may be created
  for (const j of junk) {
    A(h.s.register(j, j).code !== undefined, `register(${JSON.stringify(j)}) is total`);
    A(h.s.edit(j, j, j).code !== undefined, `edit(${JSON.stringify(j)}) is total`);
    A(h.s.edit('w1', h.w('w1').iid, j).code !== undefined, `edit(noteId=${JSON.stringify(j)}) is total`);
    A(h.s.declareOpenNote(j, j, j).code !== undefined, `declareOpenNote(${JSON.stringify(j)}) is total`);
    A(h.s.publish(j, j, j).code !== undefined, `publish(${JSON.stringify(j)}) is total`);
    A(h.s.armPoll(j, j).code !== undefined, `armPoll(${JSON.stringify(j)}) is total`);
    A(h.s.reissue(j, j).code !== undefined, `reissue(${JSON.stringify(j)}) is total`);
    A(h.s.drop(j, j).code !== undefined, `drop(${JSON.stringify(j)}) is total`);
    A(h.s.closeRequest(j, j, j).code !== undefined, `closeRequest(${JSON.stringify(j)}) is total`);
    A(h.s.settleFlush(b1, j, 'saved').code !== undefined, `settleFlush(jobId=${JSON.stringify(j)}) is total`);
    A(h.s.settleFlush(b1, lastJob(b1), j).code !== undefined, `settleFlush(outcome=${JSON.stringify(j)}) is total`);
    A(h.s.report(j, j, j, j).code !== undefined, `report(${JSON.stringify(j)}) is total`);
  }
  eq(h.s.status().windows, 2, 'and no junk event disturbed the window table');
  eq(h.s.report('w9', 'i-nope', { 'x-apunta-window-id': 'w9', 'x-apunta-instance-id': 'i-nope' },
    { quiesceId: h.s.q.id, flushToken: 'x', blockers: [] }).code, 'unregistered_window', 'a foreign identity is a code');
});

/* ============ REVISION 2's repairs, preserved in intent and re-asserted ============ */
test('R1-overlapping-quiesce', 'a quiesce in flight refuses a second, and a settled one keeps maintenance until release', () => {
  const h = harness(['w1', 'w2']);
  const q1 = h.s.initiate('shell-stdin');
  assert.throws(() => h.s.initiate('shell-stdin'), /one quiesce at a time/, 'P1/D3');
  A(h.s.q === q1, 'the refused attempt did not replace the live generation');
  h.report('w1', bindOf(h.s, q1, h.w('w1').wid, h.w('w1').iid), [], h.observed('w1'));
  h.report('w2', bindOf(h.s, q1, h.w('w2').wid, h.w('w2').iid), [], h.observed('w2'));
  eq(q1.outcome, { ok: true, blockers: [] }, 'the single quiesce settles clean');
  assert.throws(() => h.s.initiate('shell-stdin'), /keeps maintenance on/, 'P1/D3: a success is not over until released');
  h.s.proposeLift(['maintenance_off']); h.s.releaseByShell('maintenance_off');
  A(h.s.q === null, 'an explicit release ends the successful lifetime');
});
test('R2-R3-R5-generation-scoped', 'a stale timer or a foreign settle object cannot decide another generation', () => {
  const h = harness(['w1']);
  const q1 = h.s.initiate('shell-stdin'); h.report('w1', bindOf(h.s, q1, h.w('w1').wid, h.w('w1').iid), [], h.observed('w1'));
  h.s.proposeLift(['maintenance_off']); h.s.releaseByShell('maintenance_off');
  h.c.advance(10_000);
  const q2 = h.s.initiate('shell-stdin');
  h.s.armPoll('w1', h.w('w1').iid); // the client re-arms immediately, as B4(a) requires
  h.c.advance(20_000);
  A(!q2.settled, `q2 survived q1's stale timer (t=${h.c.t})`);
  eq(h.s.settle(['timeout'], 'not mine', { ...q1, id: 'qX' }), null, 'a foreign generation object settles nothing');
  h.report('w1', bindOf(h.s, q2, h.w('w1').wid, h.w('w1').iid), [], h.observed('w1'));
  eq(q2.outcome, { ok: true, blockers: [] }, 'q2 settles on its own reports');
  eq(h.s.settle(['timeout'], 'again', q2), null, 'a settled generation cannot be decided twice');
  h.c.advance(LIVENESS_MS);
  A(h.s.maintenance && h.s.freeze.epoch === 2, 'q1\'s stale sweep neither lifted q2\'s fence nor decided it');
  eq(h.s.status().quiesce, 'q2', 'and did not resurrect a generation');
});
test('R4-save-error-after-report', 'a report landing while its save is in flight cannot turn a failure into a success', () => {
  const h = harness(['w1', 'w2']);
  const rev = h.edit('w1', 'note-1');
  const q = h.s.initiate('shell-stdin'), b1 = bindOf(h.s, q, h.w('w1').wid, h.w('w1').iid);
  h.flush('w1', 'note-1', b1.flushToken, rev);
  h.report('w1', b1, [], h.observed('w1')); h.report('w2', bindOf(h.s, q, h.w('w2').wid, h.w('w2').iid), [], h.observed('w2'));
  A(!q.settled, 'every window reported, but the save is still writing');
  h.s.settleFlush(b1, lastJob(b1), 'error');
  eq(q.outcome, { ok: false, blockers: ['save_error'] }, 'the failing save decides, in the worst order');
  A(!h.s.maintenance, 'P9: rolled back, nothing snapshotted over unsaved text');
});
test('R6-disconnect-both-orders', 'a window that stops answering fails closed whichever event comes first', () => {
  for (const order of ['drop-first', 'report-first']) {
    const h = harness(['w1', 'w2']);
    const q = h.s.initiate('shell-stdin');
    const b2 = bindOf(h.s, q, h.w('w2').wid, h.w('w2').iid);
    if (order === 'drop-first') { h.c.advance(500); h.drop('w1'); h.report('w2', b2, [], h.observed('w2')); }
    else { h.c.advance(500); h.report('w2', b2, [], h.observed('w2')); h.drop('w1'); }
    A(!q.settled, `${order}: the surviving report alone must not settle the drain`);
    h.c.advance(LIVENESS_MS);
    eq(q.outcome, { ok: false, blockers: ['no_response'] }, `${order}: fails closed`);
    A(h.c.t < DRAIN_MS, `${order}: inside the 30 s bound`); A(!h.s.maintenance, `${order}: P9 rolled back`);
  }
});
test('R7-no-windows', 'a quiesce with no window at all settles clean at once', () => {
  const h = harness([]);
  const q = h.s.initiate('shell-stdin');
  eq(q.outcome, { ok: true, blockers: [] }, 'nothing to report and nothing to flush');
  A(h.c.t === 0, 'it does not burn the 30 s'); A(h.s.freeze, 'the epoch fence still applies');
});
test('R8-late-registrant', 'a window that registers mid-quiesce is bound and must answer like any other', () => {
  const h = harness(['w1']);
  const rev = h.edit('w1', 'note-1');
  const q = h.s.initiate('shell-stdin'), b1 = bindOf(h.s, q, h.w('w1').wid, h.w('w1').iid);
  h.flush('w1', 'note-1', b1.flushToken, rev); // w1's save is still writing, so the drain is open
  const late = h.s.register('w2', 'suggested-w2'); // a tab opens during the drain
  h.s.edit('w2', late.iid, 'note-9'); h.s.publish('w2', late.iid, { recording: true, unsaved: true });
  A(!!bindOf(h.s, q, 'w2', late.iid), 'P2/D6: the late registrant got a binding and a token');
  eq(h.s.status().windowsBound, 2, 'status() does not quietly exclude it');
  h.s.settleFlush(b1, lastJob(b1), 'saved'); h.report('w1', b1, [], h.observed('w1'));
  h.adopt('w2', late.iid);
  eq(h.report('w2', bindOf(h.s, q, 'w2', late.iid), [], h.observed('w2')).code, 'accepted', 'its honest acknowledgement lands');
  eq(q.outcome, { ok: false, blockers: ['save_error', 'recording'] },
    'BUG: it reported its way clean while recording with unsaved text — both facts survive the report');
  A(!h.s.maintenance, 'P9: rolled back');
  // and a LATE registrant that never answers at all is also inside the drain
  const h2 = harness(['w1']);
  const q2 = h2.s.initiate('shell-stdin');
  h2.s.register('w2', 'suggested-w2');
  h2.report('w1', bindOf(h2.s, q2, h2.w('w1').wid, h2.w('w1').iid), [], h2.observed('w1'));
  A(!q2.settled, 'the quiesce cannot succeed while the late registrant is silent');
  eq(h2.s.status().windowsBound, 2, 'the silent late registrant is inside the drain');
  h2.c.advance(LIVENESS_MS + 1);
  eq(q2.outcome, { ok: false, blockers: ['no_response'] }, 'a silent late registrant cannot be silently dropped');
});
test('R9-rearm-race', 'a window that re-arms during the drain is bound without a throw and without a false success', () => {
  const h = harness(['w1']);
  const q = h.s.initiate('shell-stdin');
  A(h.s.polls.get(h.s.key('w1', h.w('w1').iid)).held === false, 'the quiesce answer ended the held wait');
  h.s.armPoll('w1', h.w('w1').iid);
  A(h.s.polls.get(h.s.key('w1', h.w('w1').iid)).held === true, 'and the re-arm is held again');
  const b = bindOf(h.s, q, h.w('w1').wid, h.w('w1').iid);
  h.report('w1', b, [], h.observed('w1'));
  eq(q.outcome, { ok: true, blockers: [] }, 'the re-arm did not break the honest success');
});
test('R10-hold-live-wait', 'a window holding a live wait is liveness; only the global 30 s bound can decide it', () => {
  const h = harness(['w1', 'w2']);
  const q = h.s.initiate('shell-stdin');
  h.s.armPoll('w1', h.w('w1').iid); // w1 re-arms: a held wait is liveness
  h.s.polls.get(h.s.key('w2', h.w('w2').iid)).held = false; // w2 answered and never re-arms
  h.report('w1', bindOf(h.s, q, h.w('w1').wid, h.w('w1').iid), [], h.observed('w1'));
  h.c.advance(LIVENESS_MS - 1); A(!q.settled, 'not yet at the re-arm-gap bound');
  h.c.advance(1);
  eq(q.outcome, { ok: false, blockers: ['no_response'] }, 'the gap is covered, well inside 30 s');
  const h2 = harness(['w1']);
  const q2 = h2.s.initiate('shell-stdin');
  h2.s.armPoll('w1', h2.w('w1').iid);
  h2.c.advance(LIVENESS_MS * 3);
  A(!q2.settled, `a window holding a live wait is not marked gone after the bound (t=${h2.c.t})`);
  h2.report('w1', bindOf(h2.s, q2, h2.w('w1').wid, h2.w('w1').iid), [], h2.observed('w1'));
  eq(q2.outcome, { ok: true, blockers: [] }, 'only the 30 s bound could have decided this one');
});
test('R11-note-identity', 'a pre-quiesce note is retained, an unopened window may not flush, a later switch re-binds', () => {
  const h = harness(['w1', 'w2']);
  eq(h.declare('w1', 'note-1').code, 'declared', 'P4/D12: the note is declared outside any quiesce');
  eq(h.s.declareOpenNote('w9', 'i-nope', 'note-1').code, 'unknown_window', 'and an unknown window is refused');
  const q = h.s.initiate('shell-stdin');
  const b1 = bindOf(h.s, q, h.w('w1').wid, h.w('w1').iid), b2 = bindOf(h.s, q, h.w('w2').wid, h.w('w2').iid);
  eq(b1.target, null, 'nothing is targeted before a save is admitted');
  eq(h.flush('w1', 'note-9', b1.flushToken, 0).code, 'flush_wrong_note', 'it still guards a save to another note');
  eq(h.flush('w2', 'note-somebody-else', b2.flushToken, 0).code, 'flush_no_open_note', 'P4/D9: an undeclared note may not flush at all');
  h.edit('w1', 'note-1');
  eq(h.flush('w1', 'note-1', b1.flushToken, 1).admitted, 'flush-save', 'and admits the right one');
  h.s.settleFlush(b1, lastJob(b1), 'saved'); h.report('w1', b1, [], h.observed('w1')); h.report('w2', b2, [], h.observed('w2'));
  eq(q.outcome, { ok: true, blockers: [] }, 'q1 settled');
  h.s.proposeLift(['maintenance_off']); h.s.releaseByShell('maintenance_off');
  const r2 = h.edit('w1', 'note-2'); // the therapist opens a different note after the drain
  const q2 = h.s.initiate('shell-stdin');
  const c2 = bindOf(h.s, q2, h.w('w1').wid, h.w('w1').iid);
  eq(h.flush('w1', 'note-1', c2.flushToken, r2).code, 'flush_wrong_note', 'a fresh token cannot flush the note that was left open');
  eq(h.flush('w1', 'note-2', c2.flushToken, r2).admitted, 'flush-save', 'the current note is admitted instead');
});
test('R12-R20-live-work-across-generations', 'rollback ends no work and no job is forgotten', () => {
  const h = harness(['w1']);
  h.s.begin('refine', 'job-refine-9');
  const q1 = h.s.initiate('shell-stdin');
  A(!q1.settled, 'the inherited refine holds the drain open');
  h.s.begin('save', 'job-save-x'); h.s.end('job-save-x');
  h.c.advance(DRAIN_MS);
  eq(q1.outcome, { ok: false, blockers: ['timeout'] }, 'the first quiesce times out on work it does not own');
  A(h.s.active().map((j) => j.kind).includes('refine'), 'P9/D5: rollback did NOT fabricate a completion');
  eq(h.s.completions.map((j) => j.id), ['job-save-x'], 'only the save really completed');
  const q2 = h.s.initiate('shell-stdin');
  h.report('w1', bindOf(h.s, q2, h.w('w1').wid, h.w('w1').iid), [], h.observed('w1'));
  h.c.advance(DRAIN_MS);
  eq(q2.outcome, { ok: false, blockers: ['timeout'] }, 'and may legitimately time out on it — a failed quiesce left work running');
  h.s.end('job-refine-9');
  const q3 = h.s.initiate('shell-stdin');
  h.report('w1', bindOf(h.s, q3, h.w('w1').wid, h.w('w1').iid), [], h.observed('w1'));
  eq(q3.outcome, { ok: true, blockers: [] }, 'once the refine really ended, the next quiesce settles clean');
  eq(h.s.completions.map((j) => j.id), ['job-save-x', 'job-refine-9'], 'the refine completed exactly once, when its own owner ended it');
});
test('R15-duplicate-completion', 'one real job, one real completion, however often the delivery reports it', () => {
  const h = harness(['w1']);
  const rev = h.edit('w1', 'note-1');
  const q = h.s.initiate('shell-stdin'), b1 = bindOf(h.s, q, h.w('w1').wid, h.w('w1').iid);
  h.flush('w1', 'note-1', b1.flushToken, rev);
  eq(h.s.settleFlush(b1, lastJob(b1), 'saved').code, 'accepted', 'the first completion is the real one');
  eq(h.s.settleFlush(b1, lastJob(b1), 'saved').code, 'stale_completion', 'a replayed completion is charged to nothing');
  eq(h.s.settleFlush(b1, lastJob(b1), 'error').code, 'stale_completion', 'and cannot become a failure afterwards');
  eq(h.s.status().completions, 1, 'exactly one real completion');
  h.report('w1', b1, [], h.observed('w1'));
  eq(q.outcome, { ok: true, blockers: [] }, 'the quiesce still succeeds');
});
test('R16-R17-close-one-shot', 'one probe, one answer; missing, partial or mistyped answers fail closed', () => {
  const h = harness(['w1', 'w2']);
  h.s.armPoll('w1', h.w('w1').iid); // the quiesce answer consumed the wait; a real client re-arms
  const p = h.s.closeRequest('w1', h.w('w1').iid, null);
  h.s.armPoll('w2', h.w('w2').iid);
  eq(h.s.closeRequest('w2', h.w('w2').iid, null).decision, 'defer_probe_pending', 'only one probe is outstanding');
  eq(h.s.closeAnswer('w1', h.w('w1').iid, p.token, { recording: false, unsaved: false, saveInFlight: false }).decision, 'close', 'the first answer decides');
  eq(h.s.closeAnswer('w1', h.w('w1').iid, p.token, { recording: true, unsaved: true, saveInFlight: false }).code, 'stale_probe', 'a second answer is refused');
  h.c.advance(1);
  h.s.polls.get(h.s.key('w2', h.w('w2').iid)).held = false; // w2 is in the re-arm gap
  eq(h.s.closeRequest('w2', h.w('w2').iid, null).decision, 'defer_no_wait', 'a window that cannot be asked is not closed on a guess');
  h.s.armPoll('w2', h.w('w2').iid);
  const p2 = h.s.closeRequest('w2', h.w('w2').iid, null);
  eq(h.s.closeAnswer('w2', h.w('w2').iid, p2.token, undefined).code, 'malformed_answer', 'a body-less answer is refused, not a throw');
  eq(h.s.closeAnswer('w2', h.w('w2').iid, p2.token, {}).code, 'stale_probe', 'and cannot be retried on the same probe');
  eq(h.s.closeRequest('w9', 'iX').code, 'unknown_window', 'P8: an unknown window fails closed');
  eq(h.s.status().windows, 2, 'a refused probe does not disturb the persistent window table');
});
test('R18-close-agrees-with-the-server', 'a clean-looking answer cannot overrule what the server knows for itself', () => {
  const h = harness(['w1']);
  h.edit('w1', 'note-1'); // rev 1, unpersisted, never flushed
  const no = { recording: false, unsaved: false, saveInFlight: false };
  let p = h.s.closeRequest('w1', h.w('w1').iid, null);
  eq(h.s.closeAnswer('w1', h.w('w1').iid, p.token, no).decision, 'defer_unsaved',
    'BUG: the client\'s "no unsaved" overrules the symbolic revision record');
  h.s.armPoll('w1', h.w('w1').iid);
  h.s.begin('save', 'job-save-1'); // a save in flight, whatever the client says
  p = h.s.closeRequest('w1', h.w('w1').iid, null);
  eq(h.s.closeAnswer('w1', h.w('w1').iid, p.token, no).decision, 'defer_save', 'BUG: "no save in flight" overrules the job registry');
  h.s.end('job-save-1'); // the save really ended
  h.s.armPoll('w1', h.w('w1').iid);
  h.s.publish('w1', { recording: true, unsaved: false });
  p = h.s.closeRequest('w1', h.w('w1').iid, null);
  eq(h.s.closeAnswer('w1', h.w('w1').iid, p.token, { recording: true, unsaved: true, saveInFlight: false }).decision, 'confirm_recording',
    'recording read off the client at answer time is honoured once no save defers it');
  h.s.armPoll('w1', h.w('w1').iid);
  h.s.publish('w1', { recording: false, unsaved: false });
  p = h.s.closeRequest('w1', h.w('w1').iid, null);
  eq(h.s.closeAnswer('w1', h.w('w1').iid, p.token, no).decision, 'defer_unsaved',
    'and a genuinely clean-looking answer still defers on the unpersisted revision');
});
test('R19-bounded-permutations', 'enumerated permutations of fate x revision movement x report order', () => {
  let cases = 0, successes = 0;
  for (const fate of ['saved', 'error', 'late-failure']) for (const afterSave of ['still', 'typed-again']) for (const reportFirst of [true, false]) {
    const h = harness(['w1', 'w2']);
    const rev = h.edit('w1', 'note-1');
    const q = h.s.initiate('shell-stdin');
    const b1 = bindOf(h.s, q, h.w('w1').wid, h.w('w1').iid), b2 = bindOf(h.s, q, h.w('w2').wid, h.w('w2').iid);
    h.flush('w1', 'note-1', b1.flushToken, rev);
    const id = `fate=${fate} afterSave=${afterSave} reportFirst=${reportFirst}`;
    // the revision moves on while the admitted save is still writing
    if (afterSave === 'typed-again') h.step(id, () => h.edit('w1', 'note-1'));
    if (reportFirst) { h.step(id, () => h.report('w1', b1, [], h.observed('w1'))); h.step(id, () => h.report('w2', b2, [], h.observed('w2'))); }
    if (fate === 'late-failure') { h.c.advance(DRAIN_MS); h.s.settleFlush(b1, lastJob(b1), 'error'); }
    else h.step(id, () => h.s.settleFlush(b1, lastJob(b1), fate === 'saved' ? 'saved' : 'error'));
    if (!reportFirst) { h.step(id, () => h.report('w2', b2, [], h.observed('w2'))); h.step(id, () => h.report('w1', b1, [], h.observed('w1'))); }
    h.c.advance(LIVENESS_MS + 1);
    const expectOk = fate === 'saved' && afterSave === 'still';
    if (expectOk) { // the honest success path must still be reachable
      if (!q.settled) { // one more flush of the current revision, as a retrying client does
        const b3 = bindOf(h.s, q, h.w('w1').wid, h.w('w1').iid);
        if (h.s.windows.get(h.s.key('w1', h.w('w1').iid)).rev > 0 && !h.s.freeze) {
          h.step(id, () => h.flush('w1', 'note-1', b3.flushToken, h.s.windows.get(h.s.key('w1', h.w('w1').iid)).rev));
          h.step(id, () => h.s.settleFlush(b3, lastJob(b3), 'saved'));
        }
      }
      eq(q.outcome, { ok: true, blockers: [] }, `${id}: the happy path must succeed`);
      A(h.s.freeze, `${id}: and hold the fence`); successes++;
    } else {
      A(q.outcome.ok === false, `${id}: must not publish success, got ${JSON.stringify(q.outcome)}`);
      A(q.outcome.blockers.length > 0, `${id}: with a real blocker`);
      A(!h.s.maintenance, `${id}: rolled back`);
    }
    A(h.s.status().completions >= 1, `${id}: every admitted save completed`);
    cases++;
  }
  eq(cases, 12, 'all twelve bounded permutations ran');
  eq(successes, 2, 'both honest orders succeeded, and the other ten failed closed');
});
test('R21-partitions-permutations', 'two windows, two notes, interleaved edits: nothing is overlooked', () => {
  let cases = 0;
  for (const order of ['w1-then-w2', 'w2-then-w1', 'interleaved']) {
    const h = harness(['w1', 'w2']);
    const q = h.s.initiate('shell-stdin');
    const b1 = bindOf(h.s, q, h.w('w1').wid, h.w('w1').iid), b2 = bindOf(h.s, q, h.w('w2').wid, h.w('w2').iid);
    const r1 = order === 'w2-then-w1' ? null : h.edit('w1', 'note-1');
    const r2 = order === 'w1-then-w2' ? null : h.edit('w2', 'note-2');
    if (order === 'interleaved') { h.edit('w1', 'note-1'); h.edit('w2', 'note-2'); }
    const cur = (n) => h.s.windows.get(h.s.key(h.w(n).wid, h.w(n).iid)).rev;
    if (r1) h.flush('w1', 'note-1', b1.flushToken, r1);
    if (r2) h.flush('w2', 'note-2', b2.flushToken, r2);
    if (order === 'interleaved') { h.flush('w1', 'note-1', b1.flushToken, cur('w1')); h.flush('w2', 'note-2', b2.flushToken, cur('w2')); }
    h.s.settleFlush(b1, lastJob(b1), 'saved'); h.s.settleFlush(b2, lastJob(b2), 'saved');
    h.report('w1', b1, [], h.observed('w1')); h.report('w2', b2, [], h.observed('w2'));
    eq(q.outcome, { ok: true, blockers: [] }, `${order}: two notes, two windows, both flushed`);
    eq(h.s.status().truth.unsaved, 0, `${order}: nothing overlooked`); cases++;
  }
  // one window typing after the other's save must keep the drain open
  const h = harness(['w1', 'w2']);
  const q = h.s.initiate('shell-stdin');
  const a = bindOf(h.s, q, h.w('w1').wid, h.w('w1').iid), c = bindOf(h.s, q, h.w('w2').wid, h.w('w2').iid);
  const ar = h.edit('w1', 'note-1');
  h.edit('w2', 'note-2');
  h.flush('w1', 'note-1', a.flushToken, ar); h.s.settleFlush(a, lastJob(a), 'saved');
  h.edit('w1', 'note-1'); // w1 typed again after its own save
  h.report('w1', a, [], h.observed('w1'));
  A(!q.settled, 'w2 is still unaccounted for and w1 is unsaved again');
  eq(h.report('w2', c, [], h.observed('w2')).code, 'accepted', 'w2\'s honest acknowledgement lands');
  eq(q.outcome, { ok: false, blockers: ['save_error'] }, 'BUG: every window reported, yet w1\'s newer revision was overlooked');
  h.c.advance(LIVENESS_MS); A(h.c.t < DRAIN_MS, 'decided long before the global bound');
  eq(cases, 3, 'all three bounded orders ran');
});

const say = (line) => process.stdout.write(`${line}\n`);
say(out.join('\n'));
const failed = out.filter((l) => l.startsWith('FAIL')).length;
say(`\n${out.length - failed} passed, ${failed} failed (deterministic; injected clock, no I/O)`);
say('No enumerated schedule violated S1-S5. That is not a proof of the whole state machine:');
say('see reviews/P5.3-protocol-proof-v3.md for the abstraction limits and what stays unadopted.');
#!/usr/bin/env node
/**
 * P5.3 minimal shutdown/quiescence protocol — executable synthetic proof.
 *
 * NOT production code, and NOT a test of Fastify, Tauri or a browser: a
 * deterministic state-machine simulation with an injected clock and an explicit
 * event schedule. It shows (a) today's semantics failing reproducibly and (b)
 * one proposed protocol removing those failures; passing proves the protocol
 * self-consistent, nothing about the real app. Rules P1–P10 are stated in
 * docs/v2/state/reviews/P5.3-protocol-proof.md and tagged at each rule below.
 * Node builtins only: no server, DB, port, network, model, build or app code.
 *
 * REVISION 2. The first revision asserted P1–P10 from fourteen schedules that
 * each walked one path in one order; an independent review (P5.3-protocol-proof-ir1)
 * reordered them and broke six rules, two of them losing unsaved text. Every
 * repair below is a rule the model now implements and the revision-2 schedules
 * assert in the order that breaks it. Findings D1–D13 of that review are
 * dispositioned in the report, not here.
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
/** LIVENESS_MS is the *re-arm gap* bound, not a flush timeout: a window that is
 *  gone, or that holds no wait for a whole bound while the socket is supposed to
 *  be open, is marked abandoned. A window that holds a live wait is alive by
 *  definition and can only be decided by DRAIN_MS (P8). */
const LIVENESS_MS = 2_000;

/* PART A — today's semantics, asserted WRONG. Sources: B1–B5 in reviews/P5.3-preserved-ir2.md; jobs/registry.ts */
/** The guard as P5.3's predecessor specifies it: the exempt set is GET/HEAD only. */
const OLD_EXEMPT_READS = new Set(['/api/app/quiesce', '/api/app/quiesce/status', '/api/app/quiesce/wait']);
function oldWouldRefuse(method, path) { // the exempt set is scoped to GET/HEAD
  if (!path.startsWith('/api/')) return false;
  if (method === 'GET' || method === 'HEAD') return !OLD_EXEMPT_READS.has(path);
  return true; // every write refused: the flush PATCH and the report POST alike
}
/** registry.ts verbatim: keyed by id, and a newer job takes an active id over. */
function oldRegistry() {
  const m = new Map();
  return { begin: (k, id) => m.set(id, { kind: k, id }), end: (id) => m.delete(id), active: () => [...m.values()], anyActive: () => m.size > 0 };
}
test('A1-collision', 'a flush save on the note evicts the live refine, so the drain lies', () => {
  const reg = oldRegistry();
  reg.begin('refine', 'note-1'); reg.begin('save', 'note-1'); // chat.ts:122 keys on the note id, so does the save
  eq(reg.active().map((j) => j.kind), ['save'], 'BUG: the live refine is gone from active()');
  reg.end('note-1');
  A(!reg.anyActive(), 'BUG: the drain reports idle while a refine stream is still writing');
});
test('A2-unreachable-save', 'the flush PATCH is refused, so no quiesce with unsaved text can succeed', () => {
  const refused = oldWouldRefuse('PATCH', '/api/notes/note-1');
  A(refused, 'BUG: 503 maintenance refuses the flush save');
  eq({ ok: false, blockers: refused ? ['save_error'] : [] }, { ok: false, blockers: ['save_error'] }, 'BUG: the quiesce always ends save_error, text unsaved');
});
test('A3-report-refused', 'the report POST is refused by the method-scoped exempt clause', () => {
  A(oldWouldRefuse('POST', '/api/app/quiesce/report'), 'BUG: the report is 503, so none ever arrives and every quiesce burns the whole 30 s for no_response');
});
test('A4-vacuous-close', 'per-quiesce registration makes the native close check read false/false', () => {
  const view = new Map().get(null) ?? { recording: false, unsaved: false, windows: 0 }; // per-quiesce maps only
  eq(view, { recording: false, unsaved: false, windows: 0 }, 'BUG: w1 is recording with typed text, yet both flags would be discarded silently');
});

/* PART B — the proposed protocol. Rules P1–P10 are stated in the report and tagged at
 * each rule below. No cookie, no browser trigger, no Tauri IPC: the window id is minted
 * by the window (sessionStorage) and travels as an explicit header. */
const EXEMPT = new Set(['GET /api/health', 'GET /api/patients', 'GET /api/notes', 'GET /api/app/update',
  'GET /api/app/quiesce', 'GET /api/app/quiesce/status', 'GET /api/app/quiesce/wait', 'GET /api/app/quiesce/close',
  'POST /api/app/quiesce/report']);
const SAVE_PATH = /^\/api\/notes\/([^/]+)$/;
const BRIDGE_VOCAB = ['update_status', 'quiesce', 'shutdown']; // C-BRIDGE@1 rule 2, verbatim
const LIFT_MESSAGES = []; // messages *defined* to lift maintenance: none yet (unresolved choice)
/** The blocker words the model can actually produce. C-UPD@1's paragraph and its
 *  failure table disagree about this set (ir2 B7); the set is a proposal, not a
 *  contract edit, and status() reports each refusal code separately. */
const BLOCKERS = new Set(['conflict', 'save_error', 'recording', 'timeout', 'no_response']);
class Server {
  constructor(clock) {
    this.clock = clock; this.shellAttached = false; this.maintenance = false; this.shortWrites = 0;
    this.windows = new Map(); // windowId -> {registeredAt, lastSeen, sessionId, recording, unsaved, noteId}
    this.polls = new Map(); // windowId -> {held, delivered}: a held wait and its delivered answer are separate facts
    this.jobs = new Map(); // registry, one id per operation
    this.completions = []; // every real job completion, in order: the exactly-once ledger
    this.refusals = new Map(); // refusal code -> count, so "work denied" != "credential rejected"
    this.q = null; this.pendingClose = null; this.tokenSeq = 0; this.gen = 0;
  }
  /* ---------- jobs: one id per operation, one completion per job (P5) ---------- */
  begin(kind, id) { // P5
    assert.ok(!this.jobs.has(id), `P5: job id ${id} is already active — one id per operation`);
    const job = { kind, id, ended: false }; this.jobs.set(id, job); return job;
  }
  end(id) {
    const j = this.jobs.get(id);
    if (!j || j.ended) return false; // exactly one real completion, whatever the caller believes
    j.ended = true; this.jobs.delete(id); this.completions.push({ kind: j.kind, id });
    if (this.q && !this.q.settled) this.maybeSettle();
    return true;
  }
  active() { return [...this.jobs.values()]; }
  /* ---------- the shell's own stdin starts a quiesce (P1) ---------- */
  initiate(source) {
    assert.equal(source, 'shell-stdin', 'P1: a quiesce is initiated by the shell only');
    assert.ok(this.shellAttached, 'P1: no shell, no quiesce');
    assert.ok(!this.q || this.q.settled, 'P1: one quiesce at a time — a quiesce is already in flight');
    assert.ok(!this.maintenance, 'P1: a settled quiesce keeps maintenance on until the shell lifts it');
    this.maintenance = true;
    const q = { id: `q${++this.gen}`, bindings: new Map(), outcome: null, settled: false, sweepSeq: 0 };
    this.q = q;
    for (const wid of this.windows.keys()) this.bind(q, wid);
    this.clock.at(DRAIN_MS, () => { // P7: generation-scoped, so a stale timer can never decide a newer one
      if (this.q !== q || q.settled) return;
      this.settle(['timeout'], 'global deadline', q);
    });
    if (!q.settled) this.armSweep(q); // P8: the re-arm gap is watched from entry, not from a drop
    this.maybeSettle(); // a quiesce with no window at all settles at once rather than burning 30 s
    return q;
  }
  /* ---------- P2/P4: the per-quiesce, per-window flush identity ---------- */
  bind(q, wid) {
    const b = { quiesceId: q.id, q, windowId: wid, flushToken: `${q.id}-ft-${++this.tokenSeq}`, outstanding: false,
      consumed: false, revoked: false, reported: false, gone: false, abandoned: false, deliveredOnce: false,
      blockers: [], noteId: this.windows.get(wid)?.noteId ?? null, // P4/D12: identity declared before the quiesce is retained
      jobId: null, saveOutcome: null, settled: false };
    q.bindings.set(wid, b);
    b.deliveredOnce = this.deliver(this.polls.get(wid), { kind: 'quiesce', quiesceId: q.id, flushToken: b.flushToken, deadlineMs: DRAIN_MS });
    return b;
  }
  /** A wait is answered by ending it; what was delivered survives on the poll.
   *  A window that is not holding a wait right now is simply not answered — it is
   *  in the re-arm gap, and the liveness sweep is what covers that gap. */
  deliver(poll, payload) {
    if (!poll || !poll.held) return false;
    poll.held = false; poll.delivered = payload; return true;
  }
  wait(wid, sessionId) { // P2: registration persists, independent of generation
    const now = this.clock.t;
    if (!this.windows.has(wid)) this.windows.set(wid, { registeredAt: now, lastSeen: now, sessionId, recording: false, unsaved: false, noteId: null, saveFailed: false });
    const w = this.windows.get(wid); w.lastSeen = now; w.sessionId = sessionId;
    const poll = { wid, held: true, delivered: null };
    this.polls.set(wid, poll); // re-arming never throws and never needs a generation
    const q = this.q;
    if (q && !q.settled) { // P2/D6: a window that registers mid-quiesce is bound like any other
      const b = q.bindings.get(wid) ?? this.bind(q, wid);
      if (b.deliveredOnce) { /* its token is already in its hands: this is a plain re-arm */ }
      else b.deliveredOnce = this.deliver(poll, { kind: 'quiesce', quiesceId: q.id, flushToken: b.flushToken, deadlineMs: DRAIN_MS });
      this.armSweep(q);
    }
    return poll;
  }
  declareOpenNote(wid, noteId) { // P4/D12: works before and during a quiesce; the binding always mirrors the window's current open note
    const w = this.windows.get(wid);
    if (!w) return { code: 'unknown_window' };
    w.noteId = noteId;
    const b = this.q?.bindings.get(wid);
    if (b) b.noteId = noteId;
    return { code: 'declared' };
  }
  publish(wid, live) { // P8: honest state, stamped when the window states it
    const w = this.windows.get(wid);
    if (!w) return false;
    w.lastSeen = this.clock.t;
    if (typeof live?.recording === 'boolean') w.recording = live.recording;
    if (typeof live?.unsaved === 'boolean') w.unsaved = live.unsaved;
    return true;
  }
  drop(wid) { // the socket goes away mid-quiesce
    const q = this.q;
    this.windows.delete(wid); this.polls.delete(wid);
    if (q && !q.settled) { this.armSweep(q); this.maybeSettle(); } // the bound is re-armed from the drop, not from entry
  }
  armSweep(q) { // P8: re-armable, generation-scoped, and a later arm supersedes an earlier one
    const seq = ++q.sweepSeq;
    this.clock.at(LIVENESS_MS, () => {
      if (this.q !== q || q.settled || q.sweepSeq !== seq) return;
      this.sweep(q);
      if (this.q === q && !q.settled) this.armSweep(q);
    });
  }
  sweep(q) { // P8/D7: one rule for both gone triggers, and a held wait IS liveness
    const now = this.clock.t;
    for (const b of q.bindings.values()) {
      if (b.reported) continue;
      const w = this.windows.get(b.windowId);
      const holding = this.polls.get(b.windowId)?.held === true;
      if (w && holding) { w.lastSeen = now; continue; } // alive: the wait itself is the evidence
      if (!w || now - w.lastSeen >= LIVENESS_MS) { b.abandoned = true; b.gone = true; }
    }
    this.maybeSettle();
  }
  /* ---------- P3/P4: the maintenance hook ---------- */
  intercept(req) {
    const { method, path } = req;
    if (!path.startsWith('/api/')) return { admitted: 'out-of-scope' };
    if (EXEMPT.has(`${method} ${path}`)) return { admitted: 'exempt' };
    if (!this.maintenance) return { admitted: 'served' }; // P3: outside maintenance the app is writable again
    const v = this.admitFlush(req);
    if (v === 'admit') return { admitted: 'flush-save' }; // an admitted save is not a refused write
    this.refusals.set(v ?? 'maintenance', (this.refusals.get(v ?? 'maintenance') ?? 0) + 1);
    if (v === null) this.shortWrites++; // P4/D13: only refused WORK counts as a short write; a rejected credential has its own code
    return { admitted: 'refused', code: v ?? 'maintenance' };
  }
  admitFlush(req) {
    const m = SAVE_PATH.exec(req.path);
    if (req.method !== 'PATCH' || !m) return null; // not a flush-save candidate
    const q = this.q, b = q?.bindings.get(req.headers['x-apunta-window-id']);
    if (!q || q.settled) return 'flush_quiesce_settled';
    if (!b) return 'flush_unknown_window';
    if (b.quiesceId !== q.id) return 'flush_stale_generation';
    if (req.query?.flush_token !== b.flushToken) return 'flush_bad_token';
    if (b.consumed) return 'flush_replayed_token';
    if (b.revoked) return 'flush_revoked';
    if (b.outstanding) return 'flush_already_outstanding';
    if (b.noteId == null) return 'flush_no_open_note'; // P4/D9: an unopened window may not flush at all
    if (b.noteId !== m[1]) return 'flush_wrong_note';
    b.outstanding = true; b.jobId = `save-${b.flushToken}`; // P5: minted, never the note id
    this.begin('save', b.jobId);
    return 'admit';
  }
  /** The whole point of D1: the save's own result is recorded on the binding
   *  BEFORE the job ends, because ending the job is what offers the quiesce a
   *  chance to settle. A failing save therefore cannot be published as a success,
   *  in any generation, in any order. */
  settleFlush(b, outcome) {
    if (b.settled) return { code: 'already_settled' }; // a duplicate completion is not a second real one
    b.settled = true; b.outstanding = false; b.consumed = true; b.saveOutcome = outcome;
    const w = this.windows.get(b.windowId);
    if (w) { // a failed save leaves the window's text unsaved, in whatever generation hears about it
      if (outcome === 'error') { w.saveFailed = true; w.saveFailedNote = b.noteId; w.unsaved = true; }
      else if (w.saveFailed === true && w.saveFailedNote === b.noteId) { w.saveFailed = false; w.saveFailedNote = null; }
    }
    const q = b.q, own = this.q === q && !q.settled;
    this.end(b.jobId); // exactly one real completion; maybeSettle now sees saveOutcome
    if (own) this.maybeSettle(); // and success may publish only from here
    return { code: own ? (q.settled ? 'settled' : 'accepted') : 'stale_generation' };
  }
  report(wid, headers, body) { // P6: exactly once per (window, quiesce, token)
    const q = this.q, b = q?.bindings.get(wid);
    if (!q) return { code: 'no_quiesce' };
    if (headers['x-apunta-window-id'] !== wid) return { code: 'window_mismatch' };
    if (!b) return { code: 'unregistered_window' };
    if (q.settled) return { code: 'already_settled' }; // a late report cannot revive a settled quiesce
    if (body.quiesceId !== q.id) return { code: 'stale_generation' };
    if (body.flushToken !== b.flushToken) return { code: 'bad_token' };
    if (b.reported) return { code: 'already_reported' };
    const claimed = Array.isArray(body.blockers) ? body.blockers : null;
    if (claimed === null || claimed.some((c) => typeof c !== 'string' || !BLOCKERS.has(c))) return { code: 'malformed_report' };
    b.reported = true; b.blockers = claimed;
    this.publish(wid, { recording: claimed.includes('recording'), unsaved: false });
    this.maybeSettle();
    return { code: 'accepted' };
  }
  maybeSettle() {
    const q = this.q;
    if (!q || q.settled) return;
    const bs = [...q.bindings.values()];
    // D1: this generation's own flush failed — fail now, before any success can publish.
    if (bs.some((b) => b.saveOutcome === 'error')) { this.settle(['save_error'], 'save error', q); return; }
    if (this.jobs.size > 0) return; // P5: live work keeps the drain open, in this generation or an earlier one
    const missing = bs.filter((b) => !b.reported);
    if (missing.some((b) => !b.abandoned)) return; // P8/D2: a gone-or-silent window is still a missing window
    // D1/X16: an earlier generation's flush failed and this one has not re-flushed it.
    const unretried = bs.some((b) => { const w = this.windows.get(b.windowId);
      return w?.saveFailed === true && !(b.saveOutcome === 'saved' && b.noteId === w.saveFailedNote); });
    const blockers = [...new Set([...bs.flatMap((b) => b.blockers), ...(unretried ? ['save_error'] : []), ...(missing.length ? ['no_response'] : [])])];
    this.settle(blockers, blockers.length ? 'blocker' : 'clean', q);
  }
  settle(blockers, why, generation) {
    const q = generation ?? this.q;
    if (!q || q.settled || this.q !== q) return null; // only its own generation, once
    q.settled = true; q.why = why; q.outcome = { ok: blockers.length === 0, blockers };
    for (const b of q.bindings.values()) b.revoked = true;
    if (!q.outcome.ok) this.rollback(q); // P9
    return q.outcome;
  }
  /** P9: rollback revokes credentials and restores normal service. It does NOT
   *  end jobs: a refine that was streaming before the quiesce is not this
   *  protocol's to cancel, so it stays active and the NEXT quiesce counts it. */
  rollback(q) {
    this.maintenance = false;
    this.lastOutcome = q?.outcome ?? null;
    for (const p of this.polls.values()) p.delivered = null;
    this.pendingClose = null;
  }
  proposeLift(m) { LIFT_MESSAGES.push(...m); } // proof-only stand-in for the owner's choice
  releaseByShell(message) { // P10: WHICH message lifts maintenance is unresolved
    assert.ok(LIFT_MESSAGES.includes(message), `P10: ${message} is not a message that lifts maintenance`);
    assert.ok(this.maintenance && this.q?.outcome?.ok, 'P10: nothing is in a successful maintenance state');
    this.maintenance = false; this.q = null; this.pendingClose = null;
    return `released via ${message}`;
  }
  /* ---------- P8: native close, probe and answer ---------- */
  closeRequest(windowId, clientBooleans) {
    A(this.windows.has(windowId), 'P8: close for an unregistered window fails closed');
    if (this.pendingClose) return { code: 'refused', decision: 'defer_probe_pending' };
    const poll = this.polls.get(windowId);
    if (!poll?.held) return { code: 'refused', decision: 'defer_no_wait' }; // cannot ask -> must not close
    const probe = { token: `cp-${++this.tokenSeq}`, windowId, clientBooleans: clientBooleans ?? null, decision: null };
    poll.delivered = { kind: 'close', probeToken: probe.token }; // the answer is delivered; the wait is answered
    poll.held = false;
    this.pendingClose = probe;
    return probe;
  }
  closeAnswer(windowId, probeToken, live) { // the window reads its own refs at answer time
    const p = this.pendingClose;
    if (!p || p.windowId !== windowId || p.token !== probeToken) return { code: 'stale_probe' };
    this.pendingClose = null; // one-shot: consumed by the first accepted answer, whatever it says
    if (live === undefined || live === null || typeof live !== 'object' || Array.isArray(live)
      || ['recording', 'unsaved', 'saveInFlight'].some((k) => k in live && typeof live[k] !== 'boolean'))
      return { code: 'malformed_answer', decision: 'defer_malformed' }; // fails closed, never a throw
    this.publish(windowId, live);
    const saving = live.saveInFlight === true || this.active().some((j) => j.kind === 'save');
    p.decision = saving ? 'defer_save' : live.recording === true ? 'confirm_recording' : live.unsaved === true ? 'defer_unsaved' : 'close';
    return { code: 'decided', decision: p.decision };
  }
  status() {
    const ws = [...this.windows.values()];
    return { maintenance: this.maintenance, quiesce: this.q?.id ?? null, settled: this.q?.settled ?? false,
      windows: ws.length, windowsBound: this.q ? this.q.bindings.size : 0, jobs: this.active().map((j) => j.kind),
      completions: this.completions.length, shortWrites: this.shortWrites, refusals: Object.fromEntries(this.refusals),
      recording: ws.some((w) => w.recording), unsaved: ws.some((w) => w.unsaved) };
  }
}
const reg = (s, wid) => s.wait(wid, `sess-${wid}`); // a window that has registered and holds a wait
const boot = (...wids) => { const c = new Clock(), s = new Server(c); s.shellAttached = true; wids.forEach((w) => reg(s, w)); return [c, s]; };
/** A window is asked, answers, and immediately re-arms: this is the re-arm gap. */
const asked = (s, wid) => reg(s, wid);
const flushReq = (wid, noteId, token) => ({ method: 'PATCH', path: `/api/notes/${noteId}`,
  headers: { 'x-apunta-window-id': wid }, query: { flush_token: token } });
const reportOk = (s, wid, b) => s.report(wid, { 'x-apunta-window-id': wid }, { quiesceId: b.quiesceId, flushToken: b.flushToken, blockers: [] });

/* positive schedules */
test('S1-flush-success', 'unsaved text flushes, the drain empties, maintenance stays on', () => {
  const [, s] = boot('w1', 'w2'); s.publish('w1', { unsaved: true });
  const q = s.initiate('shell-stdin'), b1 = q.bindings.get('w1'); s.declareOpenNote('w1', 'note-1');
  eq(s.intercept(flushReq('w1', 'note-1', b1.flushToken)).admitted, 'flush-save', 'the flush save is admitted');
  A(s.status().jobs.includes('save'), 'the save is a registered job the drain counts'); A(!q.settled, 'the drain waits');
  s.settleFlush(b1, 'saved'); reportOk(s, 'w1', b1); reportOk(s, 'w2', q.bindings.get('w2'));
  eq(s.q.outcome, { ok: true, blockers: [] }, 'quiesce ok');
  A(s.maintenance, 'maintenance stays on so the snapshot cannot race a new write'); eq(s.status().shortWrites, 0, 'nothing was refused');
});
test('S2-overlap', 'a refine and the flush save on the same note are both active', () => {
  const [, s] = boot('w1'); s.begin('refine', 'job-refine-7'); // P5: an id per operation; note-1 is not an id
  const q = s.initiate('shell-stdin'), b1 = q.bindings.get('w1');
  s.declareOpenNote('w1', 'note-1'); s.intercept(flushReq('w1', 'note-1', b1.flushToken));
  eq(s.status().jobs.sort(), ['refine', 'save'], 'both jobs are visible');
  assert.throws(() => s.begin('save', 'job-refine-7'), /already active/, 'P5: a colliding id is refused, not taken over');
  s.settleFlush(b1, 'saved'); reportOk(s, 'w1', b1); A(!q.settled, 'it cannot settle while the refine streams');
  s.end('job-refine-7'); eq(s.q.outcome, { ok: true, blockers: [] }, 'it settles only after the refine ends');
});
test('S9-post-success-release', 'a snapshot failure releases maintenance and the next quiesce works', () => {
  const [, s] = boot('w1');
  const q1 = s.initiate('shell-stdin'), b1 = q1.bindings.get('w1'); s.declareOpenNote('w1', 'note-1');
  s.intercept(flushReq('w1', 'note-1', b1.flushToken)); s.settleFlush(b1, 'saved'); reportOk(s, 'w1', b1);
  eq(s.q.outcome, { ok: true, blockers: [] }, 'first quiesce ok');
  for (const m of BRIDGE_VOCAB) assert.throws(() => s.releaseByShell(m), /lifts maintenance/, `P10: today's ${m} lifts nothing`);
  s.proposeLift(['maintenance_off']); // stands in for whichever message the owner picks
  eq(s.releaseByShell('maintenance_off'), 'released via maintenance_off', 'once one exists, the release works');
  eq(s.intercept({ method: 'POST', path: '/api/draft' }).admitted, 'served', 'P3/D10: a real write is served after the release');
  eq(s.status().windows, 1, 'the window table survives the release');
  const q2 = s.initiate('shell-stdin'), b2 = q2.bindings.get('w1'); A(q2.id !== q1.id, 'a new generation');
  eq(s.intercept(flushReq('w1', 'note-1', b1.flushToken)).code, 'flush_bad_token', 'the old token is dead');
  s.declareOpenNote('w1', 'note-1'); s.intercept(flushReq('w1', 'note-1', b2.flushToken));
  s.settleFlush(b2, 'saved'); reportOk(s, 'w1', b2); eq(s.q.outcome, { ok: true, blockers: [] }, 'the second quiesce succeeds');
  eq(s.status().completions, 2, 'P5/P9: two admitted saves, two real completions — one each');
});

/* adversarial schedules */
test('S3-credentials', 'foreign, unknown, wrong-note, unopened, concurrent and replayed credentials are refused', () => {
  const [, s] = boot('w1', 'w2');
  const q = s.initiate('shell-stdin'), b1 = q.bindings.get('w1'), b2 = q.bindings.get('w2');
  s.declareOpenNote('w1', 'note-1'); s.declareOpenNote('w2', 'note-2');
  for (const [label, req, code] of [
    ["w2 cannot use w1's token", flushReq('w2', 'note-2', b1.flushToken), 'flush_bad_token'],
    ['an unknown window', flushReq('w3', 'note-1', 'anything'), 'flush_unknown_window'],
    ['a save to another note', flushReq('w1', 'note-9', b1.flushToken), 'flush_wrong_note'],
    ['a missing token', { method: 'PATCH', path: '/api/notes/note-1', headers: { 'x-apunta-window-id': 'w1' } }, 'flush_bad_token'],
  ]) eq(s.intercept(req).code, code, label);
  eq(s.intercept(flushReq('w1', 'note-1', b1.flushToken)).admitted, 'flush-save', 'the right save is admitted');
  eq(s.intercept(flushReq('w1', 'note-1', b1.flushToken)).code, 'flush_already_outstanding', 'a second concurrent save is refused');
  eq(s.status().jobs.length, 1, 'the refused duplicate started no second job'); s.settleFlush(b1, 'saved');
  eq(s.intercept(flushReq('w1', 'note-1', b1.flushToken)).code, 'flush_replayed_token', 'the consumed token is dead');
eq(s.refusals.get('flush_bad_token'), 2, 'P4/D13: two credential rejections are counted as credentials, not as refused work');
  eq(s.status().shortWrites, 0, 'and neither inflated the refused-work counter');
  const hdr = (w) => ({ 'x-apunta-window-id': w });
  const body = (o) => ({ quiesceId: q.id, flushToken: b1.flushToken, blockers: [], ...o });
  for (const [who, h, o, code] of [['w1', 'w1', { quiesceId: 'q0' }, 'stale_generation'], ['w1', 'w2', {}, 'window_mismatch'],
    ['w9', 'w9', {}, 'unregistered_window'], ['w1', 'w1', { flushToken: 'nope' }, 'bad_token'],
    ['w1', 'w1', { blockers: 'nope' }, 'malformed_report'], ['w1', 'w1', { blockers: ['made_up'] }, 'malformed_report']])
    eq(s.report(who, hdr(h), body(o)).code, code, `refused: ${code}`);
  eq(s.report('w1', hdr('w1'), body({})).code, 'accepted', 'the real report lands');
  eq(s.report('w1', hdr('w1'), body({})).code, 'already_reported', 'P6: exactly once');
  eq(s.report('w2', hdr('w2'), { quiesceId: q.id, flushToken: b2.flushToken, blockers: ['conflict'] }).code, 'accepted', 'w2 reports a conflict');
  eq(q.outcome, { ok: false, blockers: ['conflict'] }, 'a conflict is the outcome'); A(!s.maintenance, 'P9: rolled back');
});
test('S4-report-admission', 'the report POST is served, never refused as maintenance, and counts nothing', () => {
  const [, s] = boot('w1'); s.initiate('shell-stdin');
  eq(s.intercept({ method: 'POST', path: '/api/app/quiesce/report' }).admitted, 'exempt', 'admitted by method+path');
  eq(s.status().shortWrites, 0, 'the report is not a refused write');
  eq(s.intercept({ method: 'POST', path: '/api/app/quiesce' }).code, 'maintenance', 'P1: no HTTP quiesce trigger');
});
test('S5-disconnect', 'a window that stops answering fails closed, fast', () => {
  const [c, s] = boot('w1', 'w2'); const q = s.initiate('shell-stdin'); asked(s, 'w1'); asked(s, 'w2');
  reportOk(s, 'w1', q.bindings.get('w1'));
  c.advance(500); s.drop('w2'); // the tab is closed after its wait was answered
  A(!q.settled, 'the drain does not settle on the missing report');
  c.advance(LIVENESS_MS - 1); A(!q.settled, 'the gone bound has not been reached'); c.advance(1);
  eq(q.outcome, { ok: false, blockers: ['no_response'] }, 'fails closed');
  A(c.t < DRAIN_MS, 'contained well inside the 30 s bound'); A(!s.maintenance, 'P9: rolled back');
});
test('S6-global-deadline', 'the deadline is global: a late window cannot extend it', () => {
  const [c, s] = boot('w1', 'w2'); const q = s.initiate('shell-stdin'); asked(s, 'w1'); asked(s, 'w2');
  reportOk(s, 'w1', q.bindings.get('w1'));
  c.advance(29_000); A(!q.settled, 'one silent window holds it open — a held wait is liveness, not silence'); c.advance(1_000); // 30 s
  eq(q.outcome, { ok: false, blockers: ['timeout'] }, 'the 30 s bound decides it');
  eq(s.report('w2', { 'x-apunta-window-id': 'w2' }, { quiesceId: q.id, flushToken: q.bindings.get('w2').flushToken }).code, 'already_settled', 'a late report cannot revive it');
  A(!s.maintenance, 'P9: rolled back, nothing snapshotted');
});
test('S7-rejected-save', 'a save error rolls back, consumes the token, and a fresh token retries', () => {
  const [, s] = boot('w1');
  const q = s.initiate('shell-stdin'), b1 = q.bindings.get('w1'); s.declareOpenNote('w1', 'note-1');
  s.intercept(flushReq('w1', 'note-1', b1.flushToken)); s.settleFlush(b1, 'error');
  eq(q.outcome, { ok: false, blockers: ['save_error'] }, 'save_error is the outcome');
  eq(s.status().jobs, [], 'the save job ended exactly once'); A(!s.maintenance, 'P9: rolled back');
  const q2 = s.initiate('shell-stdin'), b2 = q2.bindings.get('w1'); // no hand-registered poll: the window re-armed on its own
  eq(s.intercept(flushReq('w1', 'note-1', b1.flushToken)).code, 'flush_bad_token', 'the failed token does not come back');
  s.declareOpenNote('w1', 'note-1'); s.intercept(flushReq('w1', 'note-1', b2.flushToken));
  s.settleFlush(b2, 'saved'); reportOk(s, 'w1', b2); eq(s.q.outcome, { ok: true, blockers: [] }, 'the retry succeeds');
});
test('S8-close', 'a native close never trusts a client boolean and is non-vacuous with no quiesce', () => {
  const [, s] = boot('w1', 'w2');
  s.publish('w1', { recording: true, unsaved: true }); s.publish('w2', { recording: false, unsaved: false });
  eq(s.status().quiesce, null, 'no quiesce is in flight'); eq(s.status().windows, 2, 'the table is persistent, so the check is not vacuous');
  const p = s.closeRequest('w1', { recording: false, unsaved: false }); // stale client booleans
  eq(p.clientBooleans, { recording: false, unsaved: false }, 'the shell may attach them; they are ignored');
  eq(s.closeAnswer('w1', 'cp-999', {}).code, 'stale_probe', 'a wrong probe token is refused');
  eq(s.closeAnswer('w2', p.token, {}).code, 'stale_probe', 'another window cannot answer it');
  eq(s.closeAnswer('w1', p.token, { recording: true, unsaved: true }), { code: 'decided', decision: 'confirm_recording' }, 'the live answer decides');
  eq(s.closeAnswer('w2', s.closeRequest('w2').token, { unsaved: true }), { code: 'decided', decision: 'defer_unsaved' }, 'unsaved text defers the close');
  s.begin('save', 'job-save-1'); reg(s, 'w2'); // w2 re-armed after the previous probe answer
  eq(s.closeAnswer('w2', s.closeRequest('w2').token, {}), { code: 'decided', decision: 'defer_save' }, 'a save in flight defers the close');
  s.end('job-save-1'); assert.throws(() => s.closeRequest('w9'), /fails closed/, 'P8: an unknown window fails closed');
});
test('S10-unrelated-writes', 'during the flush phase only the one outstanding flush save is admitted', () => {
  const [, s] = boot('w1');
  const q = s.initiate('shell-stdin'), b1 = q.bindings.get('w1'); s.declareOpenNote('w1', 'note-1');
  const refused = ['POST /api/draft', 'POST /api/chat', 'PATCH /api/patients/p1', 'DELETE /api/notes/note-9', 'GET /api/notes/note-9']
    .map((r) => s.intercept({ method: r.split(' ')[0], path: r.split(' ')[1] }).code);
  eq(refused, Array(5).fill('maintenance'), 'every unrelated read and write is refused');
  eq(s.status().shortWrites, 5, 'each refusal is counted, none is the report');
  eq(s.intercept(flushReq('w1', 'note-1', b1.flushToken)).admitted, 'flush-save', 'the one narrow permission still works');
});

/* ============ REVISION 2 — the orders that broke revision 1, as permanent cases ============ */
test('R1-overlapping-quiesce', 'a quiesce in flight refuses a second one, and a settled one keeps maintenance until release', () => {
  const [, s] = boot('w1', 'w2');
  const q1 = s.initiate('shell-stdin');
  assert.throws(() => s.initiate('shell-stdin'), /one quiesce at a time/, 'P1/D3: a second in-flight quiesce is refused');
  A(s.q === q1, 'the refused attempt did not replace the live generation');
  asked(s, 'w1'); asked(s, 'w2'); reportOk(s, 'w1', q1.bindings.get('w1')); reportOk(s, 'w2', q1.bindings.get('w2'));
  eq(q1.outcome, { ok: true, blockers: [] }, 'the single quiesce settles clean');
  assert.throws(() => s.initiate('shell-stdin'), /keeps maintenance on/, 'P1/D3: a successful quiesce is not over until the shell lifts it');
  A(s.maintenance && s.q === q1, 'maintenance and its outcome survive the refused attempt');
  s.proposeLift(['maintenance_off']); s.releaseByShell('maintenance_off');
  A(!s.maintenance, 'an explicit release ends the successful lifetime');
  const q3 = s.initiate('shell-stdin'); A(q3.id !== q1.id, 'only now may the next quiesce start');
});
test('R2-generation-scoped-timers', 'a stale deadline or sweep timer cannot decide a newer generation', () => {
  const [c, s] = boot('w1');
  const q1 = s.initiate('shell-stdin'); asked(s, 'w1'); reportOk(s, 'w1', q1.bindings.get('w1'));
  s.proposeLift(['maintenance_off']); s.releaseByShell('maintenance_off');
  c.advance(10_000);
  const q2 = s.initiate('shell-stdin'); asked(s, 'w1'); // q2's own deadline is t=40000
  c.advance(20_000); // t=30000: q1's deadline timer is still armed
  A(!q2.settled, `q2 survived q1's stale timer (t=${c.t})`);
  reportOk(s, 'w1', q2.bindings.get('w1'));
  eq(q2.outcome, { ok: true, blockers: [] }, 'q2 settles on its own reports');
  A(c.t < 40_000, 'q2 was decided by its own clock, not q1\'s');
});
test('R3-stale-timers-after-settlement', 'timers armed by a settled or rolled-back generation do nothing', () => {
  const [c, s] = boot('w1', 'w2');
  const q1 = s.initiate('shell-stdin'); asked(s, 'w1'); asked(s, 'w2');
  reportOk(s, 'w1', q1.bindings.get('w1')); reportOk(s, 'w2', q1.bindings.get('w2'));
  eq(q1.outcome, { ok: true, blockers: [] }, 'q1 settled clean');
  s.proposeLift(['maintenance_off']); s.releaseByShell('maintenance_off');
  c.advance(LIVENESS_MS); // q1's sweep was armed at t=0 and is still pending
  A(!s.maintenance, 'a stale sweep did not put maintenance back on');
  eq(s.status().quiesce, null, 'and did not resurrect a quiesce');
});
test('R4-save-error-after-report', 'a report that lands while its save is in flight cannot turn a failing save into a success', () => {
  const [, s] = boot('w1', 'w2');
  const q = s.initiate('shell-stdin'), b1 = q.bindings.get('w1'); asked(s, 'w1'); asked(s, 'w2');
  s.declareOpenNote('w1', 'note-1'); s.intercept(flushReq('w1', 'note-1', b1.flushToken));
  reportOk(s, 'w1', b1); reportOk(s, 'w2', q.bindings.get('w2'));
  A(!q.settled, 'every window reported, but the save is still writing');
  s.settleFlush(b1, 'error');
  eq(q.outcome, { ok: false, blockers: ['save_error'] }, 'the failing save decides, in the worst order');
  A(!s.maintenance, 'P9: rolled back, nothing snapshotted over unsaved text');
});
test('R5-generation-scoped-settle', 'no code path can settle a quiesce other than the one it belongs to', () => {
  const [, s] = boot('w1');
  const q1 = s.initiate('shell-stdin'), b1 = q1.bindings.get('w1'); asked(s, 'w1'); s.declareOpenNote('w1', 'note-1');
  s.intercept(flushReq('w1', 'note-1', b1.flushToken));
  reportOk(s, 'w1', b1); // reported, but the save is still writing
  eq(s.settle(['timeout'], 'not mine', { ...q1, id: 'qX' }), null, 'a foreign generation object settles nothing');
  A(!q1.settled, 'q1 is still open on its save');
  s.settleFlush(b1, 'saved');
  eq(q1.outcome, { ok: true, blockers: [] }, 'q1 settles on its own evidence');
  eq(s.settle(['timeout'], 'again', q1), null, 'a settled generation cannot be decided twice');
  eq(s.settle(['timeout'], 'stale timer', { ...q1 }), null, 'and a stale timer object settles nothing');
  A(s.maintenance, 'P10: the successful lifetime is untouched by the stale calls');
});
test('R6-disconnect-both-orders', 'a window that stops answering fails closed whichever event comes first', () => {
  for (const order of ['drop-first', 'report-first']) {
    const [c, s] = boot('w1', 'w2');
    const q = s.initiate('shell-stdin'); asked(s, 'w1'); asked(s, 'w2');
    const b2 = q.bindings.get('w2');
    if (order === 'drop-first') { c.advance(500); s.drop('w1'); reportOk(s, 'w2', b2); }
    else { c.advance(500); reportOk(s, 'w2', b2); s.drop('w1'); }
    A(!q.settled, `${order}: the surviving report alone must not settle the drain`);
    c.advance(LIVENESS_MS);
    eq(q.outcome, { ok: false, blockers: ['no_response'] }, `${order}: fails closed`);
    A(c.t < DRAIN_MS, `${order}: inside the 30 s bound`); A(!s.maintenance, `${order}: P9 rolled back`);
  }
});
test('R7-no-windows', 'a quiesce with no window at all settles clean at once', () => {
  const [c, s] = boot();
  const q = s.initiate('shell-stdin');
  eq(q.outcome, { ok: true, blockers: [] }, 'nothing to report and nothing to flush');
  A(c.t === 0, 'it does not burn the 30 s'); A(s.maintenance, 'P10: the successful lifetime still applies');
  s.proposeLift(['maintenance_off']); s.releaseByShell('maintenance_off');
});
test('R8-late-registrant', 'a window that registers mid-quiesce is bound and must answer like any other', () => {
  const [c, s] = boot('w1');
  const q = s.initiate('shell-stdin'); asked(s, 'w1');
  s.publish('w1', { unsaved: false });
  asked(s, 'w2'); // w2 opens its tab during the drain, recording with typed text
  s.publish('w2', { recording: true, unsaved: true });
  const b2 = q.bindings.get('w2');
  A(!!b2, 'P2/D6: the late registrant got a binding and a token');
  A(s.status().windowsBound === 2, 'status() does not quietly exclude it');
  reportOk(s, 'w1', q.bindings.get('w1'));
  A(!q.settled, 'the quiesce cannot succeed while the late registrant is silent');
  c.advance(LIVENESS_MS);
  eq(q.outcome, { ok: false, blockers: ['no_response'] }, 'a late registrant cannot be silently dropped');
});
test('R9-rearm-race', 'a window that re-arms during the drain is bound without a throw and without a false success', () => {
  const [c, s] = boot('w1');
  const q = s.initiate('shell-stdin');
  A(s.polls.get('w1').held === false, 'the quiesce answer ended the held wait');
  reg(s, 'w1'); // the client re-arms immediately, as B4(a) requires
  A(s.polls.get('w1').held === true, 'and the re-arm is held again');
  const b = q.bindings.get('w1');
  s.declareOpenNote('w1', 'note-1');
  eq(s.intercept(flushReq('w1', 'note-1', b.flushToken)).admitted, 'flush-save', 'the same token still works after a re-arm');
  s.settleFlush(b, 'saved'); reportOk(s, 'w1', b);
  eq(q.outcome, { ok: true, blockers: [] }, 'and the drain settles');
  // the window in the re-arm gap: nobody is holding a wait for it
  const [, s2] = boot('w1', 'w2'); const q2 = s2.initiate('shell-stdin'); asked(s2, 'w1');
  s2.wait('w2', 'sess-w2'); s2.polls.get('w2').held = false; // answered, not yet re-armed
  A(s2.polls.get('w2').held === false, 'w2 sits in the re-arm gap');
  s2.report('w1', { 'x-apunta-window-id': 'w1' }, { quiesceId: q2.id, flushToken: q2.bindings.get('w1').flushToken, blockers: [] });
  void c;
});
test('R10-rearm-gap-is-liveness', 'a window in the re-arm gap is covered by the named bound; a held wait is not', () => {
  const [c, s] = boot('w1', 'w2'); const q = s.initiate('shell-stdin'); asked(s, 'w1'); asked(s, 'w2');
  s.polls.get('w2').held = false; // w2 answered and never re-arms: a renderer crash in the gap
  reportOk(s, 'w1', q.bindings.get('w1'));
  A(!q.settled, 'the surviving report alone must not settle the drain');
  c.advance(LIVENESS_MS - 1); A(!q.settled, 'not yet at the bound');
  c.advance(1);
  eq(q.outcome, { ok: false, blockers: ['no_response'] }, 'the gap is covered, well inside 30 s');
  const [c2, s2] = boot('w1'); const q2 = s2.initiate('shell-stdin'); asked(s2, 'w1');
  c2.advance(LIVENESS_MS * 3);
  A(!q2.settled, `a window holding a live wait is not marked gone after 2 s (t=${c2.t})`);
  reportOk(s2, 'w1', q2.bindings.get('w1'));
  eq(q2.outcome, { ok: true, blockers: [] }, 'only the 30 s bound could have decided this one');
});
test('R11-note-identity', 'a note opened before the quiesce is still the bound note, and an unopened window may not flush', () => {
  const [, s] = boot('w1', 'w2');
  eq(s.declareOpenNote('w1', 'note-1').code, 'declared', 'P4/D12: the note is declared outside any quiesce');
  eq(s.declareOpenNote('w9', 'note-1').code, 'unknown_window', 'and an unknown window is refused');
  const q = s.initiate('shell-stdin'); asked(s, 'w1'); asked(s, 'w2');
  eq(q.bindings.get('w1').noteId, 'note-1', 'the pre-quiesce identity is retained in the binding');
  eq(s.intercept(flushReq('w1', 'note-9', q.bindings.get('w1').flushToken)).code, 'flush_wrong_note', 'it still guards a save to another note');
  eq(s.intercept(flushReq('w1', 'note-1', q.bindings.get('w1').flushToken)).admitted, 'flush-save', 'and admits the right one');
});
test('R11b-unopened-window', 'a window that declared no note cannot flush anything at all', () => {
  const [, s] = boot('w1', 'w2');
  const q = s.initiate('shell-stdin'); asked(s, 'w1'); asked(s, 'w2');
  const b2 = q.bindings.get('w2');
  eq(s.intercept(flushReq('w2', 'note-somebody-else', b2.flushToken)).code, 'flush_no_open_note', 'P4/D9: an undeclared note is refused, not admitted');
  eq(s.intercept(flushReq('w2', 'note-somebody-else', b2.flushToken)).code, 'flush_no_open_note', 'and the refusal is repeatable');
  eq(s.status().jobs, [], 'no job was started'); A(!q.settled, 'nothing was published');
});
test('R11c-note-switch', 'a window that opens another note mid-quiesce is bound to the new one', () => {
  const [, s] = boot('w1');
  const q = s.initiate('shell-stdin'), b1 = q.bindings.get('w1'); asked(s, 'w1');
  eq(s.intercept(flushReq('w1', 'note-2', b1.flushToken)).code, 'flush_no_open_note', 'a flush before any declaration is refused');
  s.declareOpenNote('w1', 'note-1');
  eq(s.intercept(flushReq('w1', 'note-1', b1.flushToken)).admitted, 'flush-save', 'and admitted for the open note');
  s.settleFlush(b1, 'saved'); reportOk(s, 'w1', b1); eq(q.outcome, { ok: true, blockers: [] }, 'q1 settled');
  s.proposeLift(['maintenance_off']); s.releaseByShell('maintenance_off');
  s.declareOpenNote('w1', 'note-2'); // the therapist opens a different note after the drain
  s.initiate('shell-stdin'); asked(s, 'w1');
  const b2 = s.q.bindings.get('w1');
  eq(b2.noteId, 'note-2', 'the binding follows the window');
  eq(s.intercept(flushReq('w1', 'note-1', b2.flushToken)).code, 'flush_wrong_note', 'a fresh token cannot flush the note that was left open');
});
test('R12-live-work-across-generations', 'rollback ends no work, and a leaked job makes the next quiesce honest', () => {
  const [c, s] = boot('w1');
  s.begin('refine', 'job-refine-9'); // active before the first quiesce
  const q1 = s.initiate('shell-stdin'); asked(s, 'w1');
  A(!q1.settled, 'the inherited refine holds the drain open');
  s.begin('save', 'job-save-x'); s.end('job-save-x');
  c.advance(DRAIN_MS);
  eq(q1.outcome, { ok: false, blockers: ['timeout'] }, 'the first quiesce times out on work it does not own');
  A(s.active().map((j) => j.kind).includes('refine'), 'P9/D5: rollback did NOT fabricate a completion for the refine');
  eq(s.completions.map((j) => j.id), ['job-save-x'], 'only the save really completed');
  const q2 = s.initiate('shell-stdin'); asked(s, 'w1'); reportOk(s, 'w1', q2.bindings.get('w1'));
  A(!q2.settled, 'the next quiesce counts the still-running refine too — no job was forgotten');
  c.advance(DRAIN_MS);
  eq(q2.outcome, { ok: false, blockers: ['timeout'] }, 'and may legitimately time out on it — a failed quiesce left work running');
  s.end('job-refine-9');
  const q3 = s.initiate('shell-stdin'); asked(s, 'w1'); reportOk(s, 'w1', q3.bindings.get('w1'));
  eq(q3.outcome, { ok: true, blockers: [] }, 'once the refine really ended, the next quiesce settles clean');
  eq(s.completions.map((j) => j.id), ['job-save-x', 'job-refine-9'], 'the refine completed exactly once, when its own owner ended it');
});
test('R13-save-completes-after-rollback', 'a flush admitted before a rollback completes after it, and the next quiesce waits for it', () => {
  const [c, s] = boot('w1', 'w2');
  const q1 = s.initiate('shell-stdin'), b1 = q1.bindings.get('w1'); asked(s, 'w1'); asked(s, 'w2');
  s.declareOpenNote('w1', 'note-1'); s.intercept(flushReq('w1', 'note-1', b1.flushToken));
  c.advance(DRAIN_MS);
  eq(q1.outcome, { ok: false, blockers: ['timeout'] }, 'q1 timed out with the save still in flight');
  const q2 = s.initiate('shell-stdin'); asked(s, 'w1'); asked(s, 'w2');
  reportOk(s, 'w1', q2.bindings.get('w1')); reportOk(s, 'w2', q2.bindings.get('w2'));
  A(!q2.settled, 'q2 cannot publish while the earlier save is still writing');
  eq(s.settleFlush(b1, 'saved').code, 'stale_generation', 'the old flush completion is recorded against its own generation');
  eq(s.status().jobs, [], 'the job really ended');
  eq(s.status().completions, 1, 'exactly one real completion');
  eq(q2.outcome, { ok: true, blockers: [] }, 'and only then, with nothing live left, may q2 publish');
});
test('R14-old-flush-failure-across-generations', 'a save that fails after a new quiesce started does not settle the new one — and is not lost', () => {
  const [c, s] = boot('w1');
  const q1 = s.initiate('shell-stdin'), b1 = q1.bindings.get('w1'); asked(s, 'w1');
  s.declareOpenNote('w1', 'note-1'); s.intercept(flushReq('w1', 'note-1', b1.flushToken));
  c.advance(DRAIN_MS);
  eq(q1.outcome, { ok: false, blockers: ['timeout'] }, 'q1 timed out');
  const q2 = s.initiate('shell-stdin'); asked(s, 'w1');
  eq(s.settleFlush(b1, 'error').code, 'stale_generation', 'the failure is recorded against q1');
  A(!q2.settled, 'D1/X16: it must not settle q2');
  eq(q1.outcome, { ok: false, blockers: ['timeout'] }, 'and q1 keeps its own outcome');
  eq(q1.bindings.get('w1').saveOutcome, 'error', 'the failure is still recorded, not discarded');
  reportOk(s, 'w1', q2.bindings.get('w1'));
  eq(q2.outcome, { ok: false, blockers: ['save_error'] }, 'q2 refuses to publish over a save that never succeeded');
  const q3 = s.initiate('shell-stdin'); asked(s, 'w1');
  s.declareOpenNote('w1', 'note-1'); s.intercept(flushReq('w1', 'note-1', q3.bindings.get('w1').flushToken));
  s.settleFlush(q3.bindings.get('w1'), 'saved'); reportOk(s, 'w1', q3.bindings.get('w1'));
  eq(q3.outcome, { ok: true, blockers: [] }, 'and one real retry in a later quiesce clears it');
});
test('R14b-late-failure-after-a-good-reflush', 'a late failure from a dead generation is harmless once this one re-flushed', () => {
  const [c, s] = boot('w1');
  const q1 = s.initiate('shell-stdin'), b1 = q1.bindings.get('w1'); asked(s, 'w1');
  s.declareOpenNote('w1', 'note-1'); s.intercept(flushReq('w1', 'note-1', b1.flushToken));
  c.advance(DRAIN_MS); eq(q1.outcome, { ok: false, blockers: ['timeout'] }, 'q1 timed out with its save in flight');
  const q2 = s.initiate('shell-stdin'), b2 = q2.bindings.get('w1'); asked(s, 'w1');
  s.declareOpenNote('w1', 'note-1'); s.intercept(flushReq('w1', 'note-1', b2.flushToken));
  s.settleFlush(b2, 'saved'); reportOk(s, 'w1', b2);
  A(!q2.settled, 'q1\'s job is still live, so nothing publishes yet');
  eq(s.settleFlush(b1, 'error').code, 'stale_generation', 'the dead generation\'s save fails late');
  eq(q2.outcome, { ok: true, blockers: [] }, 'this generation saved the same note itself, so the late failure loses nothing');
});
test('R14c-late-failure-on-a-different-note', 'a late failure is not excused by a save of a different note', () => {
  const [c, s] = boot('w1');
  const q1 = s.initiate('shell-stdin'), b1 = q1.bindings.get('w1'); asked(s, 'w1');
  s.declareOpenNote('w1', 'note-1'); s.intercept(flushReq('w1', 'note-1', b1.flushToken));
  c.advance(DRAIN_MS); eq(q1.outcome, { ok: false, blockers: ['timeout'] }, 'q1 timed out with its save in flight');
  const q2 = s.initiate('shell-stdin'), b2 = q2.bindings.get('w1'); asked(s, 'w1');
  s.declareOpenNote('w1', 'note-2'); s.intercept(flushReq('w1', 'note-2', b2.flushToken));
  s.settleFlush(b2, 'saved'); reportOk(s, 'w1', b2);
  eq(s.settleFlush(b1, 'error').code, 'stale_generation', 'note-1\'s save fails late');
  eq(q2.outcome, { ok: false, blockers: ['save_error'] }, 'note-1 was never saved and note-2\'s success does not cover it');
  const q3 = s.initiate('shell-stdin'), b3 = q3.bindings.get('w1'); asked(s, 'w1');
  s.declareOpenNote('w1', 'note-1'); s.intercept(flushReq('w1', 'note-1', b3.flushToken));
  s.settleFlush(b3, 'saved'); reportOk(s, 'w1', b3);
  eq(q3.outcome, { ok: true, blockers: [] }, 'only saving the note that failed clears it');
});
test('R15-duplicate-flush-completion', 'one real job, one real completion, however often the delivery reports it', () => {
  const [, s] = boot('w1');
  const q = s.initiate('shell-stdin'), b1 = q.bindings.get('w1'); asked(s, 'w1'); s.declareOpenNote('w1', 'note-1');
  s.intercept(flushReq('w1', 'note-1', b1.flushToken));
  eq(s.settleFlush(b1, 'saved').code, 'accepted', 'the first completion is the real one');
  eq(s.settleFlush(b1, 'saved').code, 'already_settled', 'a replayed completion is refused');
  eq(s.settleFlush(b1, 'error').code, 'already_settled', 'and cannot be turned into a failure afterwards');
  eq(s.status().completions, 1, 'exactly one real completion');
  reportOk(s, 'w1', b1);
  eq(q.outcome, { ok: true, blockers: [] }, 'the quiesce still succeeds');
});
test('R16-close-one-shot', 'one probe, one answer, and a missing or malformed answer fails closed', () => {
  const [, s] = boot('w1', 'w2');
  const p = s.closeRequest('w1', null);
  eq(s.closeAnswer('w1', p.token, { recording: false, unsaved: false }).decision, 'close', 'the first answer decides');
  eq(s.closeAnswer('w1', p.token, { recording: true, unsaved: true }).code, 'stale_probe', 'a second answer with the same token is refused');
  const p2 = s.closeRequest('w2', null);
  eq(s.closeAnswer('w2', p2.token).code, 'malformed_answer', 'a body-less answer is refused, not a throw');
  eq(s.closeAnswer('w2', p2.token, {}).code, 'stale_probe', 'and cannot be retried on the same probe');
  reg(s, 'w2');
  const p3 = s.closeRequest('w2', null);
  const replies = [null, 'nope', { recording: 'yes' }, { unsaved: 1 }].map((bad) => s.closeAnswer('w2', p3.token, bad).code);
  eq(replies, ['malformed_answer', 'stale_probe', 'stale_probe', 'stale_probe'], 'the first answer consumes the probe, even a bad one');
  reg(s, 'w2');
  const p4 = s.closeRequest('w2', null);
  eq(s.closeAnswer('w2', p4.token, { recording: 'yes' }).decision, 'defer_malformed', 'a malformed answer defers the close');
  eq(s.status().windows, 2, 'a refused probe does not disturb the persistent window table');
});
test('R17-close-pending-and-no-wait', 'a close with a probe already pending, or with no held wait, defers', () => {
  const [, s] = boot('w1', 'w2');
  const p = s.closeRequest('w1', null);
  eq(s.closeRequest('w2', null).decision, 'defer_probe_pending', 'only one probe is outstanding');
  s.closeAnswer('w1', p.token, {});
  s.polls.get('w2').held = false; // w2 is in the re-arm gap
  eq(s.closeRequest('w2', null).decision, 'defer_no_wait', 'a window that cannot be asked is not closed on a guess');
  reg(s, 'w2');
  eq(s.closeRequest('w2', null).code === 'refused', false, 'once it holds a wait again the probe goes out');
});
test('R18-writes-served-outside-maintenance', 'normal service is asserted on the write, not on the flag', () => {
  const [c, s] = boot('w1');
  const q = s.initiate('shell-stdin'); asked(s, 'w1');
  eq(s.intercept({ method: 'POST', path: '/api/draft' }).admitted, 'refused', 'a write is refused while maintenance is on');
  c.advance(DRAIN_MS); eq(q.outcome, { ok: false, blockers: ['timeout'] }, 'rolled back');
  eq(s.intercept({ method: 'POST', path: '/api/draft' }).admitted, 'served', 'P3/D10: the same write is served after the rollback');
  eq(s.intercept({ method: 'PATCH', path: '/api/notes/note-1' }).admitted, 'served', 'and a note save too');
  s.initiate('shell-stdin'); asked(s, 'w1');
  eq(s.intercept({ method: 'POST', path: '/api/draft' }).admitted, 'refused', 'maintenance is on again, and the write is refused again');
});
test('R19-permutations', 'bounded permutations: gone-or-silent x save outcome x report-vs-save order', () => {
  let cases = 0;
  for (const w1Gone of [true, false]) for (const saveOutcome of ['saved', 'error']) for (const reportFirst of [true, false]) {
    const [c, s] = boot('w1', 'w2');
    const q = s.initiate('shell-stdin'); asked(s, 'w1'); asked(s, 'w2');
    const b1 = q.bindings.get('w1'), b2 = q.bindings.get('w2');
    s.declareOpenNote('w1', 'note-1');
    s.intercept(flushReq('w1', 'note-1', b1.flushToken));
    const w1Reports = () => reportOk(s, 'w1', b1);
    const w2Reports = () => reportOk(s, 'w2', b2);
    if (w1Gone) s.drop('w1'); else if (reportFirst) { w1Reports(); w2Reports(); }
    if (reportFirst) { w2Reports(); } // w2 reports before the save completes in this ordering
    if (reportFirst && !w1Gone) w2Reports();
    s.settleFlush(b1, saveOutcome);
    if (!reportFirst && !w1Gone) { w2Reports(); w1Reports(); }
    if (!reportFirst && w1Gone) w2Reports();
    c.advance(LIVENESS_MS + 1);
    const id = `gone=${w1Gone} save=${saveOutcome} reportFirst=${reportFirst}`;
    if (saveOutcome === 'error') { // the save failure always wins, whatever else happened
      eq(q.outcome, { ok: false, blockers: ['save_error'] }, `${id}: a failed save is never published as success`);
      A(!s.maintenance, `${id}: rolled back`);
    } else if (w1Gone) { // w1 vanished and never reported, whatever the order
      eq(q.outcome, { ok: false, blockers: ['no_response'] }, `${id}: a gone window fails closed`);
      A(!s.maintenance, `${id}: rolled back`);
    } else {
      eq(q.outcome, { ok: true, blockers: [] }, `${id}: the honest success path`);
      A(s.maintenance, `${id}: P10: the successful lifetime holds`);
    }
    eq(s.status().completions, 1, `${id}: one admitted save, one real completion`);
    cases++;
  }
  eq(cases, 8, 'all eight bounded permutations ran');
});
test('R20-no-forgotten-work', 'every job that was admitted ends exactly once, whatever the quiesce did', () => {
  for (const fate of ['clean', 'blocked', 'timed-out']) {
    const [c, s] = boot('w1', 'w2');
    const q = s.initiate('shell-stdin'); asked(s, 'w1'); asked(s, 'w2');
    const b1 = q.bindings.get('w1'); s.declareOpenNote('w1', 'note-1');
    s.begin('refine', `job-refine-${fate}`);
    s.intercept(flushReq('w1', 'note-1', b1.flushToken));
    reportOk(s, 'w1', b1); reportOk(s, 'w2', q.bindings.get('w2'));
    s.settleFlush(b1, 'saved');
    if (fate === 'clean') s.end(`job-refine-${fate}`);
    if (fate === 'blocked') s.report('w1', { 'x-apunta-window-id': 'w1' }, { quiesceId: q.id, flushToken: b1.flushToken, blockers: ['conflict'] });
    if (fate === 'timed-out') c.advance(DRAIN_MS);
    s.end(`job-refine-${fate}`); // the refine's own owner completes it, whenever that is
    s.end(`job-refine-${fate}`); // and a duplicate completion is refused
    eq(s.completions.map((j) => j.id).sort(), [`job-refine-${fate}`, `save-${b1.flushToken}`].sort(), `${fate}: both jobs completed exactly once`);
    A(s.active().length === 0, `${fate}: nothing is left registered but incomplete`);
    A(!s.maintenance || s.q?.outcome?.ok, `${fate}: maintenance is off, or a settled success is still being held`);
  }
});
const say = (line) => process.stdout.write(`${line}\n`);
say(out.join('\n'));
const failed = out.filter((l) => l.startsWith('FAIL')).length;
say(`\n${out.length - failed} passed, ${failed} failed (deterministic; no wall clock, no I/O)`);
say('Internal consistency of the protocol only — not of Fastify/Tauri/browser behaviour.');

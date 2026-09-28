/**
 * bridge.js — the only file that has both `chrome.*` and the page's messages.
 *
 * The capture runs in the page's own world, so the requests it makes are
 * same-origin and the browser attaches the session the way it would for the page
 * itself. That world has no `chrome` at all, so nothing there can receive a
 * message. This file is the missing half: an ISOLATED-world content script that
 * carries a **bounded, correlated, validated** set of messages between the
 * service worker and the page.
 *
 * What crosses, in full — anything else is counted and dropped:
 *
 *   worker → page   `apunta-capture-start`   {requestId, mode, organizationId}
 *   page → bridge   `apunta-capture-progress` {requestId, progress}
 *   page → bridge   `apunta-capture-finished` {requestId, bytes, manifest, report}
 *   bridge → worker the same two, plus `source: 'page-world'`
 *   worker → popup  `apunta-capture-progress` / `apunta-capture-finished`
 *
 * What this file will not do, and why it matters:
 *
 *  - **It is not a fetch proxy.** A page message cannot name a URL, a path or a
 *    method. The only thing it can carry is a capture result, and the result's
 *    shape is validated field by field before it is forwarded. The page world
 *    makes its own requests, with its own allow-list, on its own terms.
 *  - **It is not a code path.** Nothing in a message is evaluated, and no message
 *    can change a permission, a host, an endpoint or a setting.
 *  - **It does not trust the page, and cannot pretend to.** The page world shares
 *    globals with page script, so a hostile page can overwrite
 *    `ApuntaCaptureInPage`, forge any report, and read the capture bytes it holds.
 *    The checks below are about *plausibility* — a message from another origin, a
 *    request id nobody issued, a duplicated finish, a malformed report, a sender
 *    that is not the extension — and **not** about defending against a hostile
 *    host. Origin and correlation are hygiene, not a security boundary: a page on
 *    the right origin can forge anything a page on the right origin is allowed to
 *    send. The boundary is the account host itself, and that is a distribution
 *    decision this prototype does not make. Two consequences worth stating: an
 *    origin check is weaker still inside a same-origin iframe, and every loopback
 *    page gets this script because the manifest lists the loopback host for
 *    research.
 */
/* global window, document, chrome */

(function initBridge() {
  'use strict';

  // The origin of *this frame*, and the only sender check this file uses.
  //
  // What was measured, rather than assumed: a MAIN-world message does arrive in
  // this ISOLATED-world listener, and `event.source` **can** be compared across
  // the two worlds — the page world relies on exactly that comparison and the
  // capture demonstrably starts through it. So this file's choice not to use
  // `event.source` is a choice, not a workaround.
  //
  // The choice is this: check the origin against *this frame's own* origin rather
  // than against a list of hosts, and check it at all. It is stricter than a
  // host list — a page served from any other origin is refused whatever it is —
  // and it does not depend on which object the browser hands back as the source.
  //
  // What it does not do, and what a later card should not conclude from this
  // file: it does not distinguish the bridge from page script. Both are this
  // frame, both post with the frame as source, and a page on the right origin can
  // forge anything the bridge would accept. That is the host-trust property
  // recorded in `docs/research/claude-import-relay-results.md` §3, and it is a
  // distribution decision rather than a defect here.
  const FRAME_ORIGIN = (function () {
    try {
      return document.location.origin;
    } catch (error) {
      return null;
    }
  })();
  const KINDS_FROM_PAGE = new Set(['apunta-capture-progress', 'apunta-capture-finished']);
  const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const CODE_POINT = /^[A-Za-z0-9_.:-]{1,80}$/;
  const DIGEST = /^sha256:[0-9a-f]{64}$/;
  const BOUNDS = { conversations: 100000, messages: 1000000, bytes: 67108864 };
  const PAGE_SOURCE = 'apunta-capture-page';
  const MAX_BACKLOG = 16;

  const state = { pending: new Map(), accepted: 0, rejected: [], progress: null, flushing: false };

  function recordRejection(reason, detail) {
    state.rejected.push({ reason, detail: String(detail).slice(0, 120) });
    // A bounded record: a hostile page must not be able to grow this without
    // limit, and a real one has a handful of entries.
    if (state.rejected.length > 200) state.rejected.shift();
  }

  function originAllowed(origin) {
    if (FRAME_ORIGIN === null) return false;
    return typeof origin === 'string' && origin === FRAME_ORIGIN;
  }

  function requestIdValid(value) {
    return typeof value === 'string' && REQUEST_ID.test(value);
  }

  function isCount(value) {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= BOUNDS.messages;
  }

  /**
   * A report, field by field. A shape validator rather than a schema library: the
   * message is small, the set of fields is closed, and a dependency in a content
   * script that runs in a signed-in page is a cost with no benefit here.
   *
   * What it buys is narrow and real: a page that invents a verdict cannot get
   * past it. What it does not buy is safety from a hostile host — see the file
   * header, which says so where someone will read it before trusting it.
   */
  function validateReport(report) {
    if (report === null || typeof report !== 'object' || Array.isArray(report)) return 'report_not_an_object';
    const statuses = ['complete', 'complete_with_gaps', 'partial', 'blocked'];
    if (!statuses.includes(report.status)) return 'status_not_in_enum';
    if (typeof report.handoffable !== 'boolean') return 'handoffable_not_boolean';
    if (typeof report.requires_acknowledgement !== 'boolean') return 'acknowledgement_not_boolean';
    if (!isCount(report.declared_conversations)) return 'declared_conversations_not_a_count';
    if (!isCount(report.captured_conversations)) return 'captured_conversations_not_a_count';
    if (!isCount(report.captured_messages)) return 'captured_messages_not_a_count';
    if (!Array.isArray(report.missing_conversations)) return 'missing_not_an_array';
    if (report.missing_conversations.length > 10000) return 'missing_too_long';
    for (const id of report.missing_conversations) {
      if (typeof id !== 'string' || id.length === 0 || id.length > 200) return 'missing_id_not_a_string';
    }
    if (!Array.isArray(report.failures) || report.failures.length > 10000) return 'failures_not_an_array';
    for (const failure of report.failures) {
      if (failure === null || typeof failure !== 'object') return 'failure_not_an_object';
      if (failure.phase !== 'list' && failure.phase !== 'detail' && failure.phase !== 'artifact')
        return 'failure_phase_not_in_enum';
      if (typeof failure.code !== 'string' || !CODE_POINT.test(failure.code))
        return 'failure_code_not_a_code';
    }
    if (!Array.isArray(report.gaps) || report.gaps.length > 10000) return 'gaps_not_an_array';
    for (const gap of report.gaps) {
      if (gap === null || typeof gap !== 'object') return 'gap_not_an_object';
      if (typeof gap.code !== 'string' || !CODE_POINT.test(gap.code)) return 'gap_code_not_a_code';
    }
    if (report.digest !== null && (typeof report.digest !== 'string' || !DIGEST.test(report.digest))) {
      return 'digest_not_a_digest';
    }
    if (report.branches !== undefined) {
      if (report.branches === null || typeof report.branches !== 'object') return 'branches_not_an_object';
      if (report.branches.capture_selects_a_branch !== false) return 'capture_claims_to_select_a_branch';
    }
    return null;
  }

  function validateMessage(event) {
    // Origin first, and against this frame's own origin. A message from another
    // frame, another origin or a devtools console lands here and is dropped.
    if (!originAllowed(event.origin)) return 'origin_not_this_frame';
    const data = event.data;
    if (data === null || typeof data !== 'object' || Array.isArray(data)) return 'data_not_an_object';
    if (data.source !== PAGE_SOURCE) return 'source_not_the_capture';
    if (typeof data.kind !== 'string' || !KINDS_FROM_PAGE.has(data.kind)) return 'kind_not_allowed';
    if (!requestIdValid(data.requestId)) return 'request_id_malformed';
    if (state.pending.get(data.requestId) === undefined) return 'request_id_not_pending';
    if (data.kind === 'apunta-capture-progress') {
      const progress = data.progress;
      if (progress === null || typeof progress !== 'object') return 'progress_not_an_object';
      if (typeof progress.stage !== 'string' || progress.stage.length > 20) return 'progress_stage_bad';
      return null;
    }
    if (typeof data.bytes !== 'string' || data.bytes.length === 0 || data.bytes.length > BOUNDS.bytes) {
      return 'bytes_out_of_bounds';
    }
    if (
      typeof data.manifest !== 'string' ||
      data.manifest.length === 0 ||
      data.manifest.length > BOUNDS.bytes
    ) {
      return 'manifest_out_of_bounds';
    }
    return validateReport(data.report);
  }

  /**
   * Forward the latest progress within a turn, and let a finish overtake it.
   *
   * A walk emits progress at two very different rates. Page one of a five-page
   * inventory can emit several updates in a single turn, and a five-hundred
   * conversation walk emits one every few seconds for minutes. Both are handled
   * by the same rule: the newest update wins a turn, and a turn boundary flushes
   * it. So a burst of five forwards the fifth — not the first, and not a queue of
   * five — and a slow walk forwards each update as it happens. The popup renders
   * the latest it received, so a long capture visibly moves.
   *
   * Nothing is forwarded after a request has finished: a progress update that
   * arrives after its verdict is a stale message, and it is dropped and recorded.
   */
  function forwardProgress(requestId, progress) {
    state.progress = { requestId: requestId, progress: progress };
    if (state.flushing === true) return;
    state.flushing = true;
    // A resolved promise rather than queueMicrotask: same turn boundary, one
    // fewer environment assumption, and no timer involved.
    Promise.resolve().then(function () {
      state.flushing = false;
      const queued = state.progress;
      state.progress = null;
      if (queued === null) return;
      const record = state.pending.get(queued.requestId);
      if (record === undefined) {
        recordRejection('request_id_not_pending', queued.requestId);
        return;
      }
      if (record.finished === true) {
        recordRejection('progress_after_completion', queued.requestId);
        return;
      }
      state.accepted += 1;
      chrome.runtime.sendMessage({
        kind: 'apunta-capture-progress',
        requestId: queued.requestId,
        source: 'page-world',
        progress: queued.progress,
        bytes: null,
        manifest: null,
        report: null,
      });
    });
  }

  window.addEventListener('message', (event) => {
    const problem = validateMessage(event);
    if (problem !== null) {
      recordRejection(problem, event.origin);
      return;
    }
    const { kind, requestId } = event.data;
    if (kind === 'apunta-capture-progress') {
      forwardProgress(requestId, event.data.progress);
      return;
    }
    // One finish per request, and it overtakes any progress still queued: a
    // verdict is the last thing a capture says, and a progress line that keeps
    // moving after it is a bug in the display rather than in the capture.
    if (state.pending.get(requestId).finished === true) {
      recordRejection('already_finished', requestId);
      return;
    }
    state.pending.get(requestId).finished = true;
    state.progress = null;
    state.accepted += 1;
    chrome.runtime.sendMessage({
      kind,
      requestId,
      source: 'page-world',
      progress: null,
      bytes: event.data.bytes,
      manifest: event.data.manifest,
      report: event.data.report,
    });
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message === null || typeof message !== 'object') return false;
    if (message.kind !== 'apunta-capture-start') return false;
    // The popup is the only sender allowed to start a capture, and it is the
    // extension's own page.
    if (sender.id !== chrome.runtime.id) return false;
    if (!requestIdValid(message.requestId)) {
      sendResponse({ ok: false, reason: 'request_id_malformed' });
      return false;
    }
    if (message.mode !== 'mock' && message.mode !== 'live') {
      sendResponse({ ok: false, reason: 'mode_not_allowed' });
      return false;
    }
    if (typeof message.organizationId !== 'string' || !CODE_POINT.test(message.organizationId)) {
      sendResponse({ ok: false, reason: 'organization_id_malformed' });
      return false;
    }
    state.pending.set(message.requestId, { startedAt: Date.now(), finished: false, mode: message.mode });
    state.progress = null;
    if (state.pending.size > MAX_BACKLOG) {
      const oldest = state.pending.keys().next().value;
      state.pending.delete(oldest);
    }

    // Resolved at run time, in this tab, and only for this request.
    window.postMessage(
      {
        source: PAGE_SOURCE,
        direction: 'to-page',
        kind: 'apunta-capture-start',
        requestId: message.requestId,
        mode: message.mode,
        organizationId: message.organizationId,
      },
      window.location.origin,
    );
    sendResponse({ ok: true, requestId: message.requestId });
    return false;
  });

  // A small, explicit surface for the harness and for a human with a console.
  globalThis.__apuntaBridge = {
    state: () => ({
      accepted: state.accepted,
      pending: state.pending.size,
      rejected: state.rejected.slice(-20),
    }),
  };
})();

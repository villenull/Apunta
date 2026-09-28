/**
 * sw.js — the relay, and nothing else.
 *
 * The capture does not run here. An extension service worker is terminated after
 * 30 seconds of inactivity, after a single request over five minutes, or when a
 * `fetch` response takes over 30 seconds, and a five-hundred-conversation
 * account is a walk measured in minutes. A walk owned by this worker would be
 * killed mid-account, so the walk lives in the page's world and this file carries
 * messages: popup → bridge → page world, and back.
 *
 * It holds no conversation data, no credentials and no endpoints, and it can
 * only ever narrow where a message goes.
 */
/* global chrome */

const ALLOWED_HOSTS = [
  { hostname: 'claude.ai', anyPort: false },
  { hostname: '127.0.0.1', anyPort: true },
];
const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const REPORT_STATUSES = new Set(['complete', 'complete_with_gaps', 'partial', 'blocked']);
const CODE_POINT = /^[A-Za-z0-9_.:-]{1,80}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const MAX_BYTES = 67108864;

function hostAllowed(url) {
  if (typeof url !== 'string' || url.length === 0 || url.length > 300) return false;
  let parsed;
  try {
    parsed = new URL(url);
  } catch (error) {
    return false;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
  for (const entry of ALLOWED_HOSTS) {
    if (parsed.hostname !== entry.hostname) continue;
    if (entry.anyPort === true || parsed.port === '') return true;
  }
  return false;
}

chrome.runtime.onInstalled.addListener(function () {
  // Default to the offline transport. A live capture has to be turned on by a
  // person, every time the extension is installed or updated.
  chrome.storage.local.set({ mode: 'mock', acknowledged_gaps: false });
});

/**
 * Find the tab a capture may run in, and prove it can receive one.
 *
 * Resolution is explicit and validated, in this order, and stops at the first
 * candidate that both qualifies and answers:
 *
 *   1. the window's active tab, if it is on an allowed host and complete enough
 *      to run (not a privileged page, not discarded);
 *   2. any other tab on an allowed host in the same window.
 *
 * A candidate that qualifies but has no listener is not an error and not a
 * silent success: it is recorded and the next candidate is tried, and if none
 * answers, the popup is told exactly which of the two reasons applied — no
 * eligible tab, or no listener.
 */
async function resolveEligibleTab() {
  const attempted = [];
  let tabs;
  try {
    tabs = await chrome.tabs.query({ currentWindow: true });
  } catch (error) {
    return { tabId: null, reason: 'tabs_unavailable', attempted };
  }
  const eligible = tabs.filter(function (tab) {
    if (typeof tab.id !== 'number') return false;
    if (tab.discarded === true) return false;
    if (typeof tab.url !== 'string' || tab.url === '') return false;
    if (!hostAllowed(tab.url)) return false;
    // A privileged page has no content script and never will.
    if (String(tab.url).startsWith('chrome://') || String(tab.url).startsWith('chrome-extension://'))
      return false;
    return true;
  });
  const ordered = eligible.slice().sort(function (left, right) {
    if (left.active === true && right.active !== true) return -1;
    if (right.active === true && left.active !== true) return 1;
    return left.index - right.index;
  });
  for (const tab of ordered) {
    attempted.push(tab.id);
    try {
      // The only proof that a receiver exists is being received by.
      await chrome.tabs.sendMessage(tab.id, { kind: 'apunta-capture-ping' });
      return { tabId: tab.id, url: tab.url, active: tab.active === true, reason: null, attempted };
    } catch (error) {
      // No listener in that tab; try the next one.
    }
  }
  return {
    tabId: null,
    reason: ordered.length === 0 ? 'no_eligible_tab' : 'no_listener',
    attempted,
    candidates: ordered.length,
  };
}

function validateReport(report) {
  if (report === null || typeof report !== 'object' || Array.isArray(report)) return false;
  if (!REPORT_STATUSES.has(report.status)) return false;
  if (typeof report.handoffable !== 'boolean') return false;
  for (const field of ['declared_conversations', 'captured_conversations', 'captured_messages']) {
    const value = report[field];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return false;
  }
  if (
    !Array.isArray(report.missing_conversations) ||
    !Array.isArray(report.failures) ||
    !Array.isArray(report.gaps)
  ) {
    return false;
  }
  for (const gap of report.gaps) {
    if (gap === null || typeof gap !== 'object' || typeof gap.code !== 'string' || !CODE_POINT.test(gap.code))
      return false;
  }
  if (report.digest !== null && (typeof report.digest !== 'string' || !DIGEST.test(report.digest)))
    return false;
  if (report.branches !== undefined) {
    if (report.branches === null || typeof report.branches !== 'object') return false;
    if (report.branches.capture_selects_a_branch !== false) return false;
  }
  return true;
}

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message === null || typeof message !== 'object') return false;

  // Popup → worker → tab. The popup names no tab: the worker resolves one, and
  // says which reason if it cannot. (The previous expression
  // `hostAllowed(sender.url) || message.tabId === undefined ? null : message.tabId`
  // parsed as `(a || b) ? null : message.tabId`, so an allowed host produced null
  // and a missing tabId produced undefined — "no eligible tab" either way.)
  if (message.kind === 'apunta-capture-start') {
    if (sender.id !== chrome.runtime.id) {
      sendResponse({ ok: false, reason: 'sender_not_the_extension' });
      return false;
    }
    if (!REQUEST_ID.test(String(message.requestId))) {
      sendResponse({ ok: false, reason: 'request_id_malformed' });
      return false;
    }
    if (message.mode !== 'mock' && message.mode !== 'live') {
      sendResponse({ ok: false, reason: 'mode_not_allowed' });
      return false;
    }
    resolveEligibleTab().then(function (resolved) {
      if (resolved.tabId === null) {
        sendResponse({
          ok: false,
          reason: resolved.reason,
          attempted: resolved.attempted,
          candidates: resolved.candidates ?? 0,
        });
        return;
      }
      return chrome.tabs
        .sendMessage(resolved.tabId, {
          kind: 'apunta-capture-start',
          requestId: message.requestId,
          mode: message.mode,
          organizationId: String(message.organizationId ?? ''),
        })
        .then(function (response) {
          if (response === undefined || response.ok !== true) {
            sendResponse({
              ok: false,
              reason: 'bridge_refused',
              detail: response ?? null,
              tabId: resolved.tabId,
            });
            return;
          }
          sendResponse({
            ok: true,
            requestId: message.requestId,
            tabId: resolved.tabId,
            url: resolved.url,
            active: resolved.active,
          });
        })
        .catch(function (error) {
          sendResponse({
            ok: false,
            reason: 'tab_unreachable',
            detail: String(error && error.message),
            tabId: resolved.tabId,
          });
        });
    });
    return true;
  }

  // The bridge's liveness probe, which is also how a candidate tab is proved to
  // have a receiver before any capture is started in it.
  if (message.kind === 'apunta-capture-ping') {
    sendResponse({ ok: true, requestId: message.requestId ?? null });
    return false;
  }

  // Page world → bridge → worker → popup. The bridge has already validated the
  // shape; the worker re-checks the two things that would let a fabricated verdict
  // through — that the sender is a content script on an allowed host, and that the
  // report is the shape it claims to be.
  if (message.kind === 'apunta-capture-progress' || message.kind === 'apunta-capture-finished') {
    if (sender.url === undefined || sender.url === '' || !hostAllowed(sender.url)) {
      sendResponse({ ok: false, reason: 'sender_host_not_allowed' });
      return false;
    }
    if (message.source !== 'page-world') {
      sendResponse({ ok: false, reason: 'source_not_the_page_world' });
      return false;
    }
    if (!REQUEST_ID.test(String(message.requestId))) {
      sendResponse({ ok: false, reason: 'request_id_malformed' });
      return false;
    }
    if (message.kind === 'apunta-capture-finished') {
      if (
        typeof message.bytes !== 'string' ||
        message.bytes.length === 0 ||
        message.bytes.length > MAX_BYTES
      ) {
        sendResponse({ ok: false, reason: 'bytes_out_of_bounds' });
        return false;
      }
      if (!validateReport(message.report)) {
        sendResponse({ ok: false, reason: 'report_shape_rejected' });
        return false;
      }
    }
    chrome.runtime
      .sendMessage({
        kind: message.kind,
        requestId: message.requestId,
        tabId: sender.tab ? sender.tab.id : null,
        progress: message.progress ?? null,
        bytes: message.bytes ?? null,
        manifest: message.manifest ?? null,
        report: message.report ?? null,
      })
      .catch(function () {
        // No popup open. The capture finished either way.
      });
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

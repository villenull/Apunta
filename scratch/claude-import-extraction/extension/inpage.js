/**
 * inpage.js — runs in the page's own world, and is the only file that can make a
 * request there.
 *
 * Why this file exists in this world at all: Chrome's documentation says content
 * scripts are subject to the same-origin policy, and that cross-origin requests
 * are always cross-origin "even if the extension has host permissions". A request
 * to `/api/organizations/...` issued from the extension's service worker is
 * therefore a cross-site request, and whether the session rides it depends on a
 * cookie attribute nobody here has observed. The same request issued from the
 * page itself is same-origin, which is the ordinary case. So the walk runs here.
 *
 * It is also where the file is saved, and where the file is *not* sent: a Blob
 * and a download link, which is what the export route already is — a file the
 * owner chooses in Apunta's own Settings screen.
 *
 * Three rules this file obeys, and a test checks the source for each:
 *   1. **No credentials are read.** No `document.cookie`, no cookie API. The
 *      browser attaches whatever it attaches to a same-origin request the page
 *      could have made itself.
 *   2. **No arbitrary URL proxy.** `ALLOW` is a fixed list of path shapes; a
 *      path that does not match one is refused before `fetch` is called, and no
 *      message from anywhere can add to it.
 *   3. **No remote code and no writes.** No `eval`, no `Function`, no dynamic
 *      `import`, no script URL. The only output is a file in the downloads
 *      folder, offered to the person who pressed the button.
 */
(function initInPage(scope) {
  'use strict';

  const core = scope.ApuntaCaptureCore;
  const PAGE_SOURCE = 'apunta-capture-page';
  const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const CODE_POINT = /^[A-Za-z0-9_.:-]{1,80}$/;

  /**
   * The only paths this prototype will ever request, as shapes.
   *
   * Written out rather than derived, because a derived allow-list is a regex
   * with an accident in it. Anything not here is refused before a request
   * exists — including a path that arrived in a message from the popup, the page
   * or anywhere else.
   */
  const ALLOW = [
    /^\/api\/organizations$/,
    /^\/api\/organizations\/[A-Za-z0-9_-]{1,64}$/,
    /^\/api\/organizations\/[A-Za-z0-9_-]{1,64}\/chat_conversations$/,
    /^\/api\/organizations\/[A-Za-z0-9_-]{1,64}\/chat_conversations\/[A-Za-z0-9_-]{1,64}$/,
  ];

  function pathAllowed(path) {
    if (typeof path !== 'string' || path.length === 0 || path.length > 200) return false;
    for (const shape of ALLOW) {
      if (shape.test(path)) return true;
    }
    return false;
  }

  function buildQuery(query) {
    const parts = [];
    const keys = Object.keys(query || {});
    for (const key of keys) {
      const value = query[key];
      if (value === null || value === undefined) continue;
      if (!/^[a-z_]{1,32}$/.test(key)) throw new Error('refusing query key: ' + key);
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
    }
    return parts.length === 0 ? '' : '?' + parts.join('&');
  }

  /**
   * A transport over the page's own `fetch`.
   *
   * `fetch` is called with a path that has already been checked against ALLOW,
   * and with `credentials: 'same-origin'`, which is the setting that attaches the
   * page's own session and nothing else. A capture cannot be pointed at another
   * host, because there is no way to name one here.
   */
  function makeTransport(fetchImpl) {
    return async function transport(method, path, query) {
      if (!pathAllowed(path)) {
        return { status: 0, json: null, headers: {}, refused: 'path_not_allowlisted: ' + String(path) };
      }
      let response;
      try {
        response = await fetchImpl(path + buildQuery(query), {
          method: method,
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        });
      } catch (error) {
        return {
          status: 0,
          json: null,
          headers: {},
          refused: 'fetch_failed: ' + String(error && error.message),
        };
      }
      const contentType = response.headers.get('content-type');
      const raw = await response.text();
      let json = null;
      if (
        typeof raw === 'string' &&
        raw.trim().startsWith('{') === false &&
        raw.trim().startsWith('[') === false
      ) {
        // Left as text on purpose: `classifyBody` has to be able to see that this
        // was not JSON. Parsing optimistically is how a sign-in page becomes a
        // conversation.
        json = raw;
      } else if (raw !== '') {
        try {
          json = JSON.parse(raw);
        } catch (error) {
          json = raw;
        }
      }
      return { status: response.status, json: json, headers: { 'content-type': contentType } };
    };
  }

  /**
   * The offline transport: the same shapes, served from a small built-in
   * synthetic account.
   *
   * This is what a developer-mode load shows with no account, no network and no
   * session — which is the point of a mock-first prototype: the pipeline can be
   * watched end to end before anything is pointed at a real account.
   */
  function makeMockTransport(fetcher) {
    return async function transport(method, path, query) {
      if (!pathAllowed(path)) {
        return { status: 0, json: null, headers: {}, refused: 'path_not_allowlisted: ' + String(path) };
      }
      return fetcher(method, path, query);
    };
  }

  /**
   * Progress and results go back the way they came, tagged with the request that
   * asked for them, and addressed to this page's own origin rather than to `'*'`
   * so a capture on one origin cannot be read by a frame on another.
   */
  function post(message) {
    try {
      scope.postMessage({ source: PAGE_SOURCE, ...message }, scope.location.origin);
    } catch (error) {
      // A page that has taken `postMessage` away is not a reason to abandon the
      // capture; the result is still returned to whoever called `run`.
    }
  }

  /**
   * The receiver for a start request — the reason this file exists. The page
   * world has no `chrome`, so this listener is the only place a request from the
   * popup can arrive.
   *
   * It is narrow by construction: one message kind, a request id it must have,
   * and a transport that is *this file's own*. A message cannot choose a URL, a
   * host, a path or a mode of its own; the allow-list below is applied to
   * whatever the walk asks for, and the walk is the only thing that can ask.
   */
  function listenForStart() {
    scope.addEventListener('message', async function (event) {
      if (event.source !== scope) return;
      const data = event.data;
      if (data === null || typeof data !== 'object') return;
      if (data.source !== PAGE_SOURCE || data.direction !== 'to-page') return;
      if (data.kind !== 'apunta-capture-start') return;
      if (typeof data.requestId !== 'string' || !REQUEST_ID.test(data.requestId)) return;
      if (typeof data.organizationId !== 'string' || !CODE_POINT.test(data.organizationId)) return;
      if (data.mode !== 'mock' && data.mode !== 'live') return;
      const result = await run({
        mode: data.mode,
        organizationId: data.organizationId,
        requestId: data.requestId,
        transport: makeTransport(scope.fetch.bind(scope)),
        pageSize: 50,
      });
      post({
        kind: 'apunta-capture-finished',
        requestId: data.requestId,
        bytes: result.bytes,
        manifest: result.manifest,
        report: result.report,
      });
    });
  }

  /**
   * Run a capture and return it. `onProgress` is called with a plain object; no
   * DOM is touched here, so this is callable from a test as well as from the page.
   */
  async function run(options) {
    const settings = options || {};
    const coreApi = settings.core || core;
    if (coreApi === undefined) throw new Error('capture-core.js did not load');
    const requestId = settings.requestId === undefined ? null : settings.requestId;
    const tag = { requestId };
    const result = await coreApi.capture({
      transport: settings.transport,
      organizationId: settings.organizationId || 'unknown-organization',
      pageSize: settings.pageSize || 50,
      onProgress: function (progress) {
        post({ kind: 'apunta-capture-progress', progress, ...tag });
      },
    });
    return result;
  }

  /**
   * Offer the file. A Blob and a link: the file lands in the downloads folder and
   * goes nowhere else. `report.handoffable` is checked here, in the last place
   * that can refuse, so a caller that ignores the verdict still cannot hand over
   * a capture that lost something.
   */
  function save(documentRef, anchorRef, name, bytes, report, allowGaps) {
    const allowed =
      report.handoffable === true || (report.requires_acknowledgement === true && allowGaps === true);
    if (allowed !== true) {
      return { saved: false, reason: 'capture is not handoffable: status=' + String(report.status) };
    }
    const blob = new Blob([bytes], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = anchorRef || documentRef.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    documentRef.body.appendChild(anchor);
    anchor.click();
    documentRef.body.removeChild(anchor);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 30000);
    return { saved: true, bytes: blob.size };
  }

  scope.ApuntaCaptureInPage = {
    listenForStart: listenForStart,
    ALLOW: ALLOW,
    pathAllowed: pathAllowed,
    buildQuery: buildQuery,
    makeTransport: makeTransport,
    makeMockTransport: makeMockTransport,
    run: run,
    save: save,
    post: post,
  };
  // Listening on load is what makes the popup's button work: the page world has
  // no `chrome`, so this is the only place a start request can be received.
  listenForStart();
})(typeof globalThis === 'undefined' ? this : globalThis);

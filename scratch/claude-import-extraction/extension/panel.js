/* global document, chrome */
/**
 * panel.js — the popup.
 *
 * Two ways to run, and the difference matters:
 *
 *   "Run here instead" runs the capture **in the popup**, against the offline
 *   mock. It needs no account, no tab, no network, and it is what a developer-mode
 *   load shows. Its requests are refused by the allow-list unless the page's
 *   origin is the loopback test host, which is why the mock is the default.
 *
 *   "Start capture" asks the service worker to relay a start message to a tab
 *   whose content script is running in the page's own world, and that is the only
 *   path that can make a same-origin request to a real account.
 *
 * Nothing here builds HTML from anything a response said. Every value goes in
 * with `textContent`: a capture contains conversation text, and conversation text
 * is untrusted.
 */
(function initPanel(scope) {
  'use strict';

  const core = scope.ApuntaCaptureCore;
  const mock = scope.ApuntaMockAccount;
  const elements = {
    mode: document.getElementById('mode'),
    modeNote: document.getElementById('mode-note'),
    organization: document.getElementById('organization'),
    start: document.getElementById('start'),
    runHere: document.getElementById('run-here'),
    status: document.getElementById('status'),
    progress: document.getElementById('progress'),
    verdict: document.getElementById('verdict'),
    counts: document.getElementById('counts'),
    digest: document.getElementById('digest'),
    gaps: document.getElementById('gaps'),
    acknowledgeRow: document.getElementById('acknowledge-row'),
    acknowledge: document.getElementById('acknowledge'),
    save: document.getElementById('save'),
    saveManifest: document.getElementById('save-manifest'),
  };

  const state = { result: null, gapsAcknowledged: false, requestId: null, pending: false };

  /** A correlation id per press. The popup ignores anything without a match. */
  function newRequestId() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function')
      return globalThis.crypto.randomUUID();
    return '00000000-0000-4000-8000-000000000000';
  }

  const MODE_NOTES = {
    mock: 'No network, no account, no session. A synthetic account is served from this extension.',
    live: 'Sends nothing anywhere. Makes same-origin requests from a signed-in claude.ai tab, and writes one file.',
  };

  function setModeNote() {
    elements.modeNote.textContent = MODE_NOTES[elements.mode.value] || '';
  }

  function renderVerdict(report) {
    elements.verdict.textContent =
      report.status + (report.handoffable ? ' (handoffable)' : ' (not handoffable)');
    elements.counts.textContent =
      report.captured_conversations + ' conversations, ' + report.captured_messages + ' messages';
    elements.digest.textContent =
      report.digest === null ? 'none (' + report.digest_algorithm + ')' : report.digest;
    elements.gaps.textContent = '';
    const heading = document.createElement('p');
    heading.textContent =
      'Gaps: ' +
      (report.gaps.length === 0
        ? 'none'
        : report.gaps.length +
          ' (failures: ' +
          report.failures.length +
          ', missing: ' +
          report.missing_conversations.length +
          ')');
    elements.gaps.appendChild(heading);
    const list = document.createElement('ul');
    for (const gap of report.gaps.slice(0, 50)) {
      const item = document.createElement('li');
      item.textContent =
        gap.code +
        (gap.id ? ' — ' + gap.id : '') +
        (gap.detail === undefined ? '' : ' — ' + JSON.stringify(gap.detail));
      list.appendChild(item);
    }
    if (report.gaps.length > 50) {
      const more = document.createElement('li');
      more.textContent = '… and ' + (report.gaps.length - 50) + ' more, in the manifest';
      list.appendChild(more);
    }
    elements.gaps.appendChild(list);
    // Failures are listed too, not only counted. A refused conversation that is
    // only a number is a conversation somebody will press Save over.
    if (report.failures.length > 0) {
      const failureHeading = document.createElement('p');
      failureHeading.textContent = 'Refused:';
      elements.gaps.appendChild(failureHeading);
      const failureList = document.createElement('ul');
      for (const failure of report.failures.slice(0, 50)) {
        const item = document.createElement('li');
        item.textContent =
          failure.code +
          (failure.id ? ' — ' + failure.id : '') +
          (failure.count === undefined ? '' : ' (' + failure.count + ')');
        failureList.appendChild(item);
      }
      elements.gaps.appendChild(failureList);
    }
    const needsAcknowledgement = report.requires_acknowledgement === true;
    elements.acknowledgeRow.hidden = !needsAcknowledgement;
    elements.save.disabled = !(
      report.handoffable === true ||
      (needsAcknowledgement === true && state.gapsAcknowledged === true)
    );
    // The manifest is the evidence file, and there is one for every capture that
    // produced a verdict — including a refused one, which is exactly when someone
    // needs to read why. It was never enabled, so it could never be saved; the
    // browser roundtrip found that.
    elements.saveManifest.disabled = false;
  }

  function onProgress(progress) {
    if (progress.stage === 'list') {
      elements.status.textContent =
        'Listing the account: page ' + progress.page + ', ' + progress.seen + ' conversations seen';
      elements.progress.hidden = false;
      elements.progress.removeAttribute('value');
    } else if (progress.stage === 'detail') {
      elements.status.textContent = 'Conversation ' + progress.at + ' of ' + progress.of;
      elements.progress.hidden = false;
      elements.progress.value = progress.at / progress.of;
    }
  }

  async function runHere() {
    elements.status.textContent = 'Running the offline capture in this popup…';
    elements.start.disabled = true;
    elements.runHere.disabled = true;
    try {
      const transport = core === undefined || mock === undefined ? null : mock.transport;
      if (transport === null) throw new Error('capture-core.js or mock-account.js did not load');
      const result = await core.capture({
        transport: transport,
        organizationId: mock.ORGANIZATION_ID,
        pageSize: 4,
        onProgress: onProgress,
      });
      state.result = result;
      renderVerdict(result.report);
      elements.status.textContent = 'Finished: ' + result.report.status;
    } catch (error) {
      elements.status.textContent = 'Failed: ' + String(error && error.message);
    } finally {
      elements.start.disabled = false;
      elements.runHere.disabled = false;
    }
  }

  async function startInTab() {
    const mode = elements.mode.value;
    state.requestId = newRequestId();
    state.pending = true;
    elements.start.disabled = true;
    elements.status.textContent = 'Looking for a tab that can capture…';
    try {
      // No tabId: the worker resolves an eligible tab and validates it. The popup
      // asks; it does not choose.
      const response = await chrome.runtime.sendMessage({
        kind: 'apunta-capture-start',
        requestId: state.requestId,
        mode: mode,
        organizationId: elements.organization.value.trim() || 'auto',
      });
      if (response === undefined || response.ok !== true) {
        state.pending = false;
        elements.start.disabled = false;
        const reason = response === undefined ? 'no_response' : String(response.reason);
        if (reason === 'no_eligible_tab') {
          elements.status.textContent =
            'No eligible tab. Open a signed-in claude.ai tab (or the loopback test host) in this window and try again.';
        } else if (reason === 'no_listener') {
          elements.status.textContent =
            'A tab was found but nothing is listening in it. Reload the tab, then try again.';
        } else {
          elements.status.textContent = 'Could not start: ' + reason;
        }
        return;
      }
      elements.status.textContent = 'The tab is capturing; the verdict appears here when it finishes.';
    } catch (error) {
      state.pending = false;
      elements.start.disabled = false;
      elements.status.textContent = 'Could not reach the extension: ' + String(error && error.message);
    }
  }

  chrome.runtime.onMessage.addListener(function (message) {
    if (message === null || typeof message !== 'object') return;
    if (message.kind !== 'apunta-capture-progress' && message.kind !== 'apunta-capture-finished') return;
    // Correlation, not decoration: a message for another press, or for a press
    // that never happened, is dropped rather than rendered.
    if (state.requestId === null || message.requestId !== state.requestId) return;
    if (message.kind === 'apunta-capture-progress') {
      if (message.progress !== null && typeof message.progress === 'object') onProgress(message.progress);
      return;
    }
    state.pending = false;
    elements.start.disabled = false;
    if (typeof message.bytes === 'string') {
      state.result = { bytes: message.bytes, manifest: message.manifest ?? '', report: message.report };
    }
    renderVerdict(message.report);
    elements.status.textContent = 'The tab finished: ' + message.report.status;
  });

  elements.mode.addEventListener('change', function () {
    chrome.storage.local.set({ mode: elements.mode.value });
    setModeNote();
  });
  elements.acknowledge.addEventListener('change', function () {
    state.gapsAcknowledged = elements.acknowledge.checked;
    if (state.result !== null) renderVerdict(state.result.report);
  });
  elements.runHere.addEventListener('click', runHere);
  elements.start.addEventListener('click', startInTab);
  elements.save.addEventListener('click', function () {
    if (state.result === null) return;
    saveAs('conversations.json', state.result.bytes, state.result.report);
  });
  elements.saveManifest.addEventListener('click', function () {
    if (state.result === null || typeof state.result.manifest !== 'string') return;
    saveAs('extraction-manifest.json', state.result.manifest, { handoffable: true });
  });

  function saveAs(name, bytes, report) {
    const allowed =
      report.handoffable === true ||
      (report.requires_acknowledgement === true && state.gapsAcknowledged === true);
    if (allowed !== true) {
      elements.status.textContent = 'Not saving: this capture is ' + String(report.status) + '.';
      return;
    }
    const blob = new Blob([bytes], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 30000);
    elements.status.textContent = 'Saved ' + name + ' (' + blob.size + ' bytes).';
  }

  chrome.storage.local.get(['mode'], function (stored) {
    elements.mode.value = stored.mode === 'live' ? 'live' : 'mock';
    setModeNote();
  });
})(typeof globalThis === 'undefined' ? this : globalThis);

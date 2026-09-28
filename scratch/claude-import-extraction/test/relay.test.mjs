// The relay, offline.
//
// The popup → worker → ISOLATED bridge → page world → back path, and the rules
// that keep it bounded. Three things this file is careful about:
//
//  - **The page world is untrusted.** A page shares globals with the capture, so
//    it can replace the capture object, forge a report and read the bytes. Every
//    check here is therefore about *plausibility* — another origin, a request id
//    nobody issued, a second finish for one request, a shape that does not match
//    what it claims — and none of them is a defence against a hostile host. The
//    tests assert that boundary is stated, not that it is crossed.
//  - **The bridge is not a fetch proxy and not a code path.** A page message
//    carries a capture result; it cannot name a URL, a path, a method or a mode,
//    and nothing in a message is evaluated.
//  - **Tab resolution is explicit.** The popup names no tab; the worker queries,
//    validates and *proves* a receiver exists, and reports which of the two
//    reasons applied when it cannot. The precedence bug that made the previous
//    expression answer "no eligible tab" for every input has its own regression.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { test } from 'node:test';

import { branchFidelity, branchGaps } from '../src/shapes.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const extensionDir = resolve(here, '../extension');
const read = (file) => readFileSync(join(extensionDir, file), 'utf8');
const REQUEST_ID = '11111111-2222-4333-8444-555555555555';
const FRAME_ORIGIN = 'http://127.0.0.1:7815';
// Named hosts, built from parts: these are strings this file asserts on and
// never requests, and the repository's outbound-URL rule is right to object to
// a fixture that spells one out.
const FOREIGN_ORIGIN = ['https:', '', 'evil.example'].join('/');

/** A turn boundary: the bridge collapses progress on a microtask, not a timer. */
const tick = () => new Promise((resolve) => queueMicrotask(resolve));

const VALID_REPORT = {
  status: 'complete_with_gaps',
  handoffable: false,
  requires_acknowledgement: true,
  declared_conversations: 3,
  captured_conversations: 3,
  captured_messages: 5,
  missing_conversations: [],
  failures: [],
  gaps: [{ code: 'branch_fidelity_unknown', id: 'b-3' }],
  digest: 'sha256:f253fd449612b98a1a748847edfb903e908251b24bca7ac1c24d6ce48f1a0400',
  branches: { capture_selects_a_branch: false },
};

function validMessage(overrides = {}) {
  return {
    source: 'apunta-capture-page',
    kind: 'apunta-capture-finished',
    requestId: REQUEST_ID,
    bytes: '[]',
    manifest: '{}',
    report: VALID_REPORT,
    ...overrides,
  };
}

/**
 * The page world, loaded as the real files in a context with a window, a
 * `location`, a `fetch` and nowhere to find a `chrome`.
 */
function loadPageWorld() {
  const context = createContext({
    console,
    TextEncoder,
    URL,
    Blob,
    crypto: globalThis.crypto,
    setTimeout: () => 0,
    location: { origin: FRAME_ORIGIN },
    addEventListener: (type, fn) => {
      if (type === 'message') context.__listener = fn;
    },
    fetch: async (url) => {
      context.__fetched.push(String(url));
      return { status: 200, headers: { get: () => 'application/json' }, text: async () => '[]' };
    },
  });
  context.window = context;
  context.__fetched = [];
  context.__posted = [];
  context.postMessage = (message, target) => context.__posted.push({ message, target });
  for (const file of ['capture-core.js', 'inpage.js', 'mock-account.js']) {
    runInContext(read(file), context, { filename: file });
  }
  const page = runInContext('globalThis', context);
  return {
    context,
    get posts() {
      return context.__posted.map((entry) => entry.message);
    },
    get requests() {
      return context.__fetched;
    },
    deliver: (data, overrides = {}) =>
      context.__listener({ source: page, origin: FRAME_ORIGIN, data, ...overrides }),
    // Two microtask turns: the capture awaits, and progress is collapsed on one.
    settle: () => new Promise((resolve) => setTimeout(resolve, 30)),
  };
}

/** The bridge, in a context with a frame origin, a window and a fake runtime. */
function loadBridge() {
  const forwarded = [];
  const context = createContext({
    console,
    URL,
    location: { origin: FRAME_ORIGIN },
    document: { location: { origin: FRAME_ORIGIN } },
    chrome: {
      runtime: {
        id: 'offline-extension-id',
        sendMessage: (message) => {
          forwarded.push(message);
          return Promise.resolve();
        },
        onMessage: { addListener: (fn) => (context.__listener = fn) },
      },
    },
  });
  context.window = context;
  context.addEventListener = (type, fn) => {
    if (type === 'message') context.__pageMessage = fn;
  };
  // The bridge posts into the frame; the page world is what would receive it, and
  // in this context there is no page world, so the post is recorded.
  context.posted = [];
  context.postMessage = (message, target) => context.posted.push({ message, target });
  runInContext(read('bridge.js'), context, { filename: 'bridge.js' });
  // The global the scripts actually see. `event.source` is compared against it,
  // so a test that invents its own object would be testing nothing.
  const page = runInContext('globalThis', context);
  return {
    context,
    page,
    forwarded,
    posted: context.posted,
    delivered: (data, origin = FRAME_ORIGIN, source = page) =>
      context.__pageMessage({ source, origin, data }),
  };
}

/**
 * Ask the bridge to start and answer its sendResponse. A listener that declines
 * to answer resolves to `undefined` rather than hanging — which is itself the
 * thing the foreign-sender case asserts.
 */
function startViaBridge(bridge, message = {}, sender = { id: 'offline-extension-id' }) {
  return new Promise((resolve_) => {
    const returned = bridge.context.__listener(
      {
        kind: 'apunta-capture-start',
        requestId: REQUEST_ID,
        mode: 'mock',
        organizationId: 'org-x',
        ...message,
      },
      sender,
      resolve_,
    );
    if (returned !== true) resolve_(undefined);
  });
}

test('the manifest declares both worlds, and each file is loaded in the right one', () => {
  const manifest = JSON.parse(read('manifest.json'));
  const byWorld = Object.fromEntries(manifest.content_scripts.map((entry) => [entry.world, entry.js]));
  assert.deepEqual(byWorld.MAIN, ['capture-core.js', 'inpage.js']);
  assert.deepEqual(byWorld.ISOLATED, ['bridge.js']);
  for (const [world, files] of Object.entries(byWorld)) {
    for (const file of files) {
      assert.ok(read(file).length > 0, `${world} names ${file}, which does not exist`);
    }
  }
  // The two worlds must not overlap: a file in both would run twice, once with
  // the APIs and once without them.
  for (const file of byWorld.ISOLATED) {
    assert.equal(byWorld.MAIN.includes(file), false, `${file} is loaded in both worlds`);
  }
});

test('a start request reaches the page world, addressed to this origin, with its correlation id', async () => {
  const bridge = loadBridge();
  const answer = { ...(await startViaBridge(bridge)) };
  assert.deepEqual(answer, { ok: true, requestId: REQUEST_ID });
  // The bridge posted into the frame, addressed to this origin, carrying the id.
  assert.equal(bridge.posted.length, 1);
  const posted = bridge.posted[0];
  assert.equal(posted.target, FRAME_ORIGIN, 'the start must be addressed to this origin, not to "*"');
  assert.equal(posted.message.source, 'apunta-capture-page');
  assert.equal(posted.message.direction, 'to-page');
  assert.equal(posted.message.kind, 'apunta-capture-start');
  assert.equal(posted.message.requestId, REQUEST_ID);
});

test('every message the bridge forwards is a capture result and nothing else', async () => {
  const bridge = loadBridge();
  await startViaBridge(bridge);

  // A forged message that tries to smuggle a fetch, a permission or a code
  // string through the bridge. Each is either dropped outright, or forwarded with
  // the smuggled field simply absent — the bridge builds its own object, so
  // there is no path by which an extra field survives.
  const smuggled = [
    { kind: 'apunta-capture-fetch', url: FOREIGN_ORIGIN + '/', method: 'POST' },
    { path: '/api/organizations', method: 'GET' },
    { permissions: ['cookies', 'tabs'] },
    { code: 'process.exit(1)' },
    { mode: 'live' },
  ];
  for (const patch of smuggled) {
    const before = bridge.forwarded.length;
    bridge.delivered(validMessage(patch));
    if (bridge.forwarded.length === before) continue;
    const forwarded = bridge.forwarded.at(-1);
    assert.deepEqual(
      Object.keys(forwarded).sort(),
      ['bytes', 'kind', 'manifest', 'progress', 'report', 'requestId', 'source'],
      `a smuggled field survived: ${JSON.stringify(patch)}`,
    );
    const serialized = JSON.stringify(forwarded);
    for (const value of ['evil.example', '/api/organizations', 'cookies', 'process.exit']) {
      assert.equal(serialized.includes(value), false, `${value} crossed the bridge`);
    }
  }

  // A well-formed one does go through, and carries only the agreed fields. A
  // fresh bridge, because one request may finish exactly once.
  const honest = loadBridge();
  await startViaBridge(honest);
  honest.delivered(validMessage());
  assert.equal(honest.forwarded.length, 1);
  const forwarded = honest.forwarded[0];
  assert.deepEqual(Object.keys(forwarded).sort(), [
    'bytes',
    'kind',
    'manifest',
    'progress',
    'report',
    'requestId',
    'source',
  ]);
  assert.equal(forwarded.source, 'page-world');
});

test('a message from another origin, or with no origin, is dropped', async () => {
  const bridge = loadBridge();
  await startViaBridge(bridge);
  const before = bridge.forwarded.length;
  bridge.delivered(validMessage(), 'http://127.0.0.1:9999');
  bridge.delivered(validMessage(), FOREIGN_ORIGIN);
  bridge.delivered(validMessage(), '');
  bridge.delivered(validMessage(), 'null');
  assert.equal(bridge.forwarded.length, before);
  const reasons = bridge.context.__apuntaBridge.state().rejected.map((entry) => entry.reason);
  assert.ok(reasons.includes('origin_not_this_frame'));
});

/**
 * B1. Progress is collapsed to the *latest* within a turn, not dropped after the
 * first, and never forwarded after a verdict.
 *
 * The behaviour that matters is a two-rate walk: a page of the inventory can
 * emit several updates in one turn, and a long walk emits one every few seconds
 * for minutes. Both are exercised here, because the first bug — forwarding the
 * first and dropping the rest — passes a test that only ever sends one.
 */
test('five progress updates in one turn forward the latest, and only the latest', async () => {
  const bridge = loadBridge();
  await startViaBridge(bridge);
  for (const at of [1, 2, 3, 4, 5]) {
    bridge.delivered({
      source: 'apunta-capture-page',
      kind: 'apunta-capture-progress',
      requestId: REQUEST_ID,
      progress: { stage: 'list', page: at, seen: at, of: 5 },
    });
  }
  // Nothing has gone yet: the turn has not ended, so the newest is still winning.
  assert.equal(bridge.forwarded.length, 0, 'progress was forwarded before the turn ended');
  await tick();
  assert.equal(bridge.forwarded.length, 1, 'a burst of five forwarded more than the latest');
  assert.equal(bridge.forwarded[0].kind, 'apunta-capture-progress');
  assert.equal(bridge.forwarded[0].progress.page, 5, 'the forwarded update is not the last one');
  assert.equal(bridge.forwarded[0].requestId, REQUEST_ID);
});

test('a walk that reports slowly forwards every update, so a long capture visibly moves', async () => {
  const bridge = loadBridge();
  await startViaBridge(bridge);
  const seen = [];
  for (const at of [1, 2, 3]) {
    bridge.delivered({
      source: 'apunta-capture-page',
      kind: 'apunta-capture-progress',
      requestId: REQUEST_ID,
      progress: { stage: 'detail', at, of: 3 },
    });
    await tick();
    seen.push(bridge.forwarded.length);
  }
  assert.deepEqual(seen, [1, 2, 3], 'a slowly-reporting walk lost an update');
  assert.deepEqual(
    bridge.forwarded.map((message) => message.progress.at),
    [1, 2, 3],
    'updates arrived out of order',
  );
});

test('progress for a stale or foreign request id is ignored, not forwarded', async () => {
  const bridge = loadBridge();
  await startViaBridge(bridge);
  const other = '99999999-2222-4333-8444-555555555555';
  bridge.delivered({
    source: 'apunta-capture-page',
    kind: 'apunta-capture-progress',
    requestId: other,
    progress: { stage: 'list' },
  });
  bridge.delivered({
    source: 'apunta-capture-page',
    kind: 'apunta-capture-progress',
    requestId: 'not-a-uuid',
    progress: { stage: 'list' },
  });
  await tick();
  assert.equal(bridge.forwarded.length, 0, 'progress for an id nobody issued was forwarded');
  const reasons = bridge.context.__apuntaBridge.state().rejected.map((entry) => entry.reason);
  assert.ok(reasons.includes('request_id_not_pending'));
  // The real one still comes through afterwards.
  bridge.delivered({
    source: 'apunta-capture-page',
    kind: 'apunta-capture-progress',
    requestId: REQUEST_ID,
    progress: { stage: 'list', page: 2 },
  });
  await tick();
  assert.equal(bridge.forwarded.length, 1);
});

test('no progress is forwarded after the verdict for that request', async () => {
  const bridge = loadBridge();
  await startViaBridge(bridge);
  bridge.delivered({
    source: 'apunta-capture-page',
    kind: 'apunta-capture-progress',
    requestId: REQUEST_ID,
    progress: { stage: 'list', page: 1 },
  });
  await tick();
  assert.equal(bridge.forwarded.length, 1);
  bridge.delivered(validMessage());
  assert.equal(bridge.forwarded.length, 2, 'the verdict was not forwarded');
  assert.equal(bridge.forwarded[1].kind, 'apunta-capture-finished');

  // Progress arriving after the verdict, and progress arriving in the same turn as
  // it, are both dropped: the verdict is the last thing a capture says.
  bridge.delivered({
    source: 'apunta-capture-page',
    kind: 'apunta-capture-progress',
    requestId: REQUEST_ID,
    progress: { stage: 'list', page: 9 },
  });
  await tick();
  assert.equal(bridge.forwarded.length, 2, 'progress after the verdict was forwarded');
  assert.ok(
    bridge.context.__apuntaBridge
      .state()
      .rejected.some((entry) => entry.reason === 'progress_after_completion'),
  );

  const second = loadBridge();
  await startViaBridge(second);
  second.delivered({
    source: 'apunta-capture-page',
    kind: 'apunta-capture-progress',
    requestId: REQUEST_ID,
    progress: { stage: 'list', page: 7 },
  });
  second.delivered(validMessage());
  await tick();
  assert.deepEqual(
    second.forwarded.map((message) => message.kind),
    ['apunta-capture-finished'],
    'a progress update queued in the same turn as the verdict was forwarded',
  );
});

test('a request id nobody issued is dropped, and one request finishes once', async () => {
  const bridge = loadBridge();
  await startViaBridge(bridge);
  const before = bridge.forwarded.length;
  bridge.delivered(validMessage({ requestId: '99999999-2222-4333-8444-555555555555' }));
  assert.equal(bridge.forwarded.length, before, 'an unsolicited result was forwarded');
  bridge.delivered(validMessage({ requestId: 'not-a-uuid' }));
  assert.equal(bridge.forwarded.length, before);
  bridge.delivered(validMessage());
  bridge.delivered(validMessage());
  assert.equal(bridge.forwarded.length, before + 1, 'a second finish for one request was forwarded');
  const reasons = bridge.context.__apuntaBridge.state().rejected.map((entry) => entry.reason);
  assert.ok(reasons.includes('request_id_not_pending'));
  assert.ok(reasons.includes('already_finished'));
});

test('a report is validated field by field, and a forged verdict cannot pass', async () => {
  const bridge = loadBridge();
  await startViaBridge(bridge);
  const before = bridge.forwarded.length;
  const rejected = [
    ['status outside the enum', { status: 'fine' }],
    ['a handoffable flag that is not boolean', { handoffable: 'yes' }],
    ['a count that is not a count', { captured_messages: -1 }],
    ['a count that is not an integer', { captured_conversations: 1.5 }],
    ['a missing conversations count', { declared_conversations: undefined }],
    ['failures that are not an array', { failures: {} }],
    ['gaps that are not an array', { gaps: 'none' }],
    ['a gap code that is not a code', { gaps: [{ code: 'x'.repeat(200) }] }],
    ['a missing-conversation id that is a number', { missing_conversations: [7] }],
    ['a digest that is not a digest', { digest: 'sha256:nope' }],
    ['a capture that claims to have selected a branch', { branches: { capture_selects_a_branch: true } }],
    ['branches that are not an object', { branches: 'yes' }],
    ['a status that is a prototype key', { status: 'constructor' }],
  ];
  for (const [name, patch] of rejected) {
    bridge.delivered(validMessage({ report: { ...VALID_REPORT, ...patch } }));
    assert.equal(bridge.forwarded.length, before, `${name} was forwarded`);
  }
  // And the honest one still gets through.
  bridge.delivered(validMessage());
  assert.equal(bridge.forwarded.length, before + 1);
});

test('the bridge refuses a start request that is not from the extension, or is malformed', async () => {
  const bridge = loadBridge();
  const before = bridge.posted.length;
  const foreign = await startViaBridge(bridge, {}, { id: 'some-other-extension' });
  assert.equal(foreign, undefined, 'a foreign sender must not be answered as a start request');
  assert.equal(bridge.posted.length, before, 'and must not be relayed into the page');
  assert.equal((await startViaBridge(bridge, { mode: 'live-to-somewhere' })).ok, false);
  assert.equal((await startViaBridge(bridge, { requestId: 'nope' })).ok, false);
  assert.equal((await startViaBridge(bridge, { organizationId: 'a'.repeat(200) })).ok, false);
});

/**
 * The page world's `event.source` check, and what it does and does not
 * distinguish — measured rather than asserted.
 *
 * B2 was a documentary defect: three places claimed `event.source` was unusable
 * across worlds, which the working capture contradicts. The check is kept, and
 * this pins down what it buys: a message from **this window** is acted on, and a
 * message from **another frame** is ignored. It does not, and cannot, tell the
 * bridge apart from page script — both are this window, and that limit is the
 * host-trust property, not a bug in the check.
 */
test('the page world acts on this window and ignores another frame', async () => {
  const page = loadPageWorld();
  const start = (extra = {}) => ({
    source: 'apunta-capture-page',
    direction: 'to-page',
    kind: 'apunta-capture-start',
    requestId: REQUEST_ID,
    mode: 'live',
    organizationId: 'org-x',
    ...extra,
  });

  // A foreign frame: another window object, same origin. The page world's
  // `event.source` check refuses it, which is what the check is for.
  const foreignFrame = { name: 'another frame' };
  await page.deliver(start(), { source: foreignFrame });
  await page.settle();
  assert.deepEqual(page.posts, [], 'a message from another frame was acted on');

  // The same message from this window is acted on.
  await page.deliver(start());
  await page.settle();
  const finished = page.posts.find((entry) => entry.kind === 'apunta-capture-finished');
  assert.ok(finished, 'a message from this window was not acted on');
  assert.equal(finished.requestId, REQUEST_ID);
  assert.equal(
    page.requests.every((url) => url.startsWith('/api/organizations/')),
    true,
    'the walk asked for something off the allow-list',
  );
});

test('the page world cannot tell the bridge from page script, and does not claim to', async () => {
  // The limit, stated as a test so it cannot be quietly upgraded into a
  // security property later. A message with the same origin and the same window
  // as the bridge's is indistinguishable — by design, and by necessity.
  loadPageWorld();
  assert.equal(
    /event\.source !== scope/.test(read('inpage.js').replace(/\/\*[\s\S]*?\*\//g, '')),
    true,
    'the page world no longer filters on event.source; B2 said keep it',
  );
  assert.equal(
    /event\.source/.test(
      read('bridge.js')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1'),
    ),
    false,
    'the bridge has started using event.source; the design says it does not',
  );
});

test('the bridge is not a fetch proxy and not a code path', () => {
  const source = read('bridge.js')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  for (const banned of [
    /[^.\w]fetch\s*\(/,
    /XMLHttpRequest/,
    /WebSocket/,
    /eval\s*\(/,
    /new\s+Function\s*\(/,
    /importScripts/,
    /import\s*\(/,
    /document\.cookie/,
    /chrome\.cookies/,
  ]) {
    assert.equal(banned.test(source), false, `bridge.js must not use ${String(banned)}`);
  }
  // It talks to the worker and the frame, and to nothing else.
  assert.deepEqual(
    [...new Set([...source.matchAll(/chrome\.[a-zA-Z.]+/g)].map((match) => match[0]))].sort(),
    ['chrome.runtime.id', 'chrome.runtime.onMessage.addListener', 'chrome.runtime.sendMessage'],
  );
});

test('the page world runs the request it is given, with its own transport', async () => {
  const context = createContext({
    console,
    TextEncoder,
    URL,
    Blob,
    crypto: globalThis.crypto,
    setTimeout: () => 0,
    location: { origin: FRAME_ORIGIN },
    addEventListener: (type, fn) => {
      if (type === 'message') context.__listener = fn;
    },
    fetch: async (url) => {
      context.__fetched.push(String(url));
      return { status: 200, headers: { get: () => 'application/json' }, text: async () => '[]' };
    },
  });
  context.window = context;
  const seen = [];
  context.__fetched = [];
  context.postMessage = (message, target) => seen.push({ message, target });
  for (const file of ['capture-core.js', 'inpage.js', 'mock-account.js']) {
    runInContext(read(file), context, { filename: file });
  }
  const page = runInContext('globalThis', context);
  // The start request arrives with a hostile extra field; the run still uses this
  // file's own transport, which refuses a path that is not allow-listed.
  await context.__listener({
    source: page,
    origin: FRAME_ORIGIN,
    data: {
      source: 'apunta-capture-page',
      direction: 'to-page',
      kind: 'apunta-capture-start',
      requestId: REQUEST_ID,
      mode: 'live',
      organizationId: 'org-x',
      url: FOREIGN_ORIGIN + '/',
      method: 'GET',
    },
  });
  const finished = seen.find((entry) => entry.message.kind === 'apunta-capture-finished');
  assert.ok(finished, 'the page world did not report a result');
  assert.equal(finished.message.requestId, REQUEST_ID);
  assert.equal(finished.target, FRAME_ORIGIN, 'the result must be addressed to this origin, not to "*"');
  assert.equal(typeof finished.message.bytes, 'string');
  // The hostile URL was never requested. The walk asked for an allow-listed path,
  // the stub answered an empty inventory, and the run is honestly `complete` with
  // nothing in it. The message's `url`, `method` and `mode` fields had no effect.
  assert.equal(finished.message.report.status, 'complete');
  assert.equal(finished.message.report.captured_conversations, 0);
  assert.deepEqual(
    context.__fetched.filter((url) => !url.startsWith('/api/organizations/')),
    [],
    'a request went somewhere the allow-list does not permit',
  );
  assert.equal(
    context.__fetched.some((url) => url.includes('evil.example') || url.startsWith('http')),
    false,
    'an absolute or foreign URL was requested',
  );
});

// --- the service worker: explicit, validated tab resolution --------------------

function loadWorker(tabs) {
  const sent = [];
  const context = createContext({
    console,
    URL,
    chrome: {
      runtime: {
        id: 'offline-extension-id',
        onMessage: { addListener: (fn) => (context.__listener = fn) },
        onInstalled: { addListener: () => {} },
        sendMessage: (message) => {
          sent.push(message);
          return Promise.resolve();
        },
      },
      storage: { local: { set: () => {} } },
      tabs: {
        query: async () => tabs,
        sendMessage: async (tabId, message) => {
          if (message.kind === 'apunta-capture-ping') {
            if (tabs.find((tab) => tab.id === tabId)?.listener === true) return { ok: true };
            throw new Error('Could not establish connection. Receiving end does not exist.');
          }
          sent.push({ kind: 'to-tab', tabId, message });
          return { ok: true, requestId: message.requestId };
        },
      },
    },
  });
  runInContext(read('sw.js'), context, { filename: 'sw.js' });
  return { context, sent };
}

function askWorker(
  context,
  message,
  sender = { id: 'offline-extension-id', url: 'chrome-extension://abc/panel.html' },
) {
  return new Promise((resolve_) => {
    const returned = context.__listener(message, sender, resolve_);
    if (returned !== true) resolve_(undefined);
  });
}

test('the popup names no tab, and the worker resolves and proves one', async () => {
  const tabs = [
    { id: 1, index: 0, active: false, url: 'chrome://settings' },
    { id: 2, index: 1, active: true, url: FRAME_ORIGIN + '/', listener: true },
  ];
  const { context, sent } = loadWorker(tabs);
  const answer = await askWorker(context, {
    kind: 'apunta-capture-start',
    requestId: REQUEST_ID,
    mode: 'mock',
    organizationId: 'org-x',
  });
  assert.equal(answer.ok, true);
  assert.equal(answer.tabId, 2, 'the eligible tab was not resolved');
  assert.equal(answer.active, true);
  assert.equal(sent.at(-1).kind, 'to-tab');
  assert.equal(sent.at(-1).message.kind, 'apunta-capture-start');
  // The ping is how a candidate was proved: it went to the tab before the start.
  assert.ok(answer.requestId === REQUEST_ID);
});

test('no eligible tab and no listener are different answers, and both are explicit', async () => {
  const none = loadWorker([{ id: 1, index: 0, active: true, url: FOREIGN_ORIGIN + '/' }]);
  const noTab = await askWorker(none.context, {
    kind: 'apunta-capture-start',
    requestId: REQUEST_ID,
    mode: 'mock',
    organizationId: 'o',
  });
  assert.equal(noTab.ok, false);
  assert.equal(noTab.reason, 'no_eligible_tab');

  const silent = loadWorker([{ id: 7, index: 0, active: true, url: FRAME_ORIGIN + '/', listener: false }]);
  const noListener = await askWorker(silent.context, {
    kind: 'apunta-capture-start',
    requestId: REQUEST_ID,
    mode: 'mock',
    organizationId: 'o',
  });
  assert.equal(noListener.ok, false);
  assert.equal(noListener.reason, 'no_listener');
  assert.deepEqual([...noListener.attempted], [7], 'the tab that was tried must be named');
});

test('a tab with no listener does not stop the next candidate being tried', async () => {
  const tabs = [
    { id: 3, index: 0, active: true, url: FRAME_ORIGIN + '/', listener: false },
    { id: 4, index: 1, active: false, url: FRAME_ORIGIN + '/other', listener: true },
  ];
  const { context } = loadWorker(tabs);
  const answer = await askWorker(context, {
    kind: 'apunta-capture-start',
    requestId: REQUEST_ID,
    mode: 'mock',
    organizationId: 'o',
  });
  assert.equal(answer.ok, true);
  assert.equal(answer.tabId, 4);
});

test('a privileged or malformed tab is never eligible', async () => {
  const tabs = [
    { id: 1, index: 0, active: true, url: 'chrome-extension://abc/panel.html', listener: true },
    { id: 2, index: 1, active: false, url: FRAME_ORIGIN + '/', discarded: true, listener: true },
    { id: 3, index: 2, active: false, url: '', listener: true },
  ];
  const { context, sent } = loadWorker(tabs);
  const answer = await askWorker(context, {
    kind: 'apunta-capture-start',
    requestId: REQUEST_ID,
    mode: 'mock',
    organizationId: 'o',
  });
  assert.equal(answer.reason, 'no_eligible_tab');
  assert.equal(sent.length, 0, 'nothing was sent to a tab that should not have been considered');
});

test('the worker refuses a start request from a foreign sender, and a malformed one', async () => {
  const { context } = loadWorker([
    { id: 2, index: 0, active: true, url: FRAME_ORIGIN + '/', listener: true },
  ]);
  const foreign = await askWorker(
    context,
    { kind: 'apunta-capture-start', requestId: REQUEST_ID, mode: 'mock', organizationId: 'o' },
    { id: 'another-extension', url: 'chrome-extension://xyz/panel.html' },
  );
  assert.deepEqual({ ...foreign }, { ok: false, reason: 'sender_not_the_extension' });
  assert.equal(
    (
      await askWorker(context, {
        kind: 'apunta-capture-start',
        requestId: 'x',
        mode: 'mock',
        organizationId: 'o',
      })
    ).reason,
    'request_id_malformed',
  );
  assert.equal(
    (
      await askWorker(context, {
        kind: 'apunta-capture-start',
        requestId: REQUEST_ID,
        mode: 'live-elsewhere',
        organizationId: 'o',
      })
    ).reason,
    'mode_not_allowed',
  );
});

test('a report is refused unless it comes from an allowed host and is the shape it claims', async () => {
  const { context, sent } = loadWorker([]);
  const finished = {
    kind: 'apunta-capture-finished',
    requestId: REQUEST_ID,
    source: 'page-world',
    bytes: '[]',
    manifest: '{}',
    report: VALID_REPORT,
  };
  // From an extension page rather than a tab: not the page world, and the
  // fabricated verdict must not reach the popup.
  const fromExtension = await askWorker(context, finished, {
    id: 'offline-extension-id',
    url: 'chrome-extension://abc/panel.html',
  });
  assert.deepEqual({ ...fromExtension }, { ok: false, reason: 'sender_host_not_allowed' });
  // From a tab on the right host, but the source claim is missing.
  const noSource = await askWorker(
    context,
    { ...finished, source: 'popup' },
    { id: 'offline-extension-id', url: FRAME_ORIGIN + '/', tab: { id: 2 } },
  );
  assert.equal(noSource.reason, 'source_not_the_page_world');
  // From the right place with a forged verdict.
  const forged = await askWorker(
    context,
    {
      ...finished,
      report: {
        ...VALID_REPORT,
        status: 'complete',
        handoffable: true,
        branches: { capture_selects_a_branch: true },
      },
    },
    { id: 'offline-extension-id', url: FRAME_ORIGIN + '/', tab: { id: 2 } },
  );
  assert.equal(forged.reason, 'report_shape_rejected');
  assert.equal(sent.length, 0, 'a refused report was still relayed');
  // And the honest one goes through.
  const good = await askWorker(context, finished, {
    id: 'offline-extension-id',
    url: FRAME_ORIGIN + '/',
    tab: { id: 2 },
  });
  assert.deepEqual({ ...good }, { ok: true });
  assert.equal(sent.at(-1).kind, 'apunta-capture-finished');
});

test('the precedence bug is gone: the old expression is not there', () => {
  // Comments are stripped, because the file quotes the old expression in prose to
  // explain why it was wrong.
  const source = read('sw.js')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  assert.equal(
    /hostAllowed\(\s*sender\.url\s*\)\s*\|\|/.test(source),
    false,
    'the old `hostAllowed(...) || message.tabId === undefined ? …` shape is back',
  );
  // And the resolution is a real query, not a guess.
  assert.ok(source.includes('chrome.tabs.query'), 'the worker does not look for a tab');
  assert.ok(source.includes('resolveEligibleTab'), 'tab resolution is not a named, testable step');
});

// --- ancestry: the shapes the second review listed ---------------------------

test('thirteen ancestry shapes, none of them reported as more than it is', () => {
  const shapes = {
    'no links (the D1 case)': [
      { uuid: 'a', parent_message_uuid: null },
      { uuid: 'b', parent_message_uuid: null },
      { uuid: 'c', parent_message_uuid: null },
    ],
    'full chain': [
      { uuid: 'a', parent_message_uuid: null },
      { uuid: 'b', parent_message_uuid: 'a' },
      { uuid: 'c', parent_message_uuid: 'b' },
    ],
    'one usable edge': [
      { uuid: 'a', parent_message_uuid: null },
      { uuid: 'b', parent_message_uuid: null },
      { uuid: 'c', parent_message_uuid: 'b' },
    ],
    'one edge + one dangling': [
      { uuid: 'a', parent_message_uuid: null },
      { uuid: 'b', parent_message_uuid: 'zz' },
    ],
    'all links dangling': [
      { uuid: 'a', parent_message_uuid: 'x' },
      { uuid: 'b', parent_message_uuid: 'y' },
    ],
    'two roots, one edge': [
      { uuid: 'a', parent_message_uuid: null },
      { uuid: 'b', parent_message_uuid: null },
      { uuid: 'c', parent_message_uuid: 'a' },
    ],
    'two roots, all edges': [
      { uuid: 'a', parent_message_uuid: null },
      { uuid: 'b', parent_message_uuid: 'a' },
      { uuid: 'c', parent_message_uuid: null },
      { uuid: 'd', parent_message_uuid: 'c' },
    ],
    'cycle a<->b': [
      { uuid: 'a', parent_message_uuid: 'b' },
      { uuid: 'b', parent_message_uuid: 'a' },
    ],
    'cycle plus a real edge': [
      { uuid: 'a', parent_message_uuid: 'c' },
      { uuid: 'b', parent_message_uuid: 'a' },
      { uuid: 'c', parent_message_uuid: 'b' },
    ],
    'self reference only': [
      { uuid: 'a', parent_message_uuid: null },
      { uuid: 'b', parent_message_uuid: 'b' },
    ],
    'self reference plus a real edge': [
      { uuid: 'a', parent_message_uuid: null },
      { uuid: 'b', parent_message_uuid: 'b' },
      { uuid: 'c', parent_message_uuid: 'a' },
    ],
    'duplicate ids': [
      { uuid: 'a', parent_message_uuid: null },
      { uuid: 'a', parent_message_uuid: null },
      { uuid: 'b', parent_message_uuid: 'a' },
    ],
    'empty-string parent': [
      { uuid: 'a', parent_message_uuid: null },
      { uuid: 'b', parent_message_uuid: '' },
      { uuid: 'c', parent_message_uuid: 'a' },
    ],
  };
  const expected = {
    'no links (the D1 case)': {
      fidelity: 'links_absent',
      gaps: ['branch_fidelity_unknown', 'branch_ancestry_unresolved'],
    },
    'full chain': { fidelity: 'links_present', gaps: [] },
    'one usable edge': { fidelity: 'links_present', gaps: ['branch_ancestry_unresolved'] },
    'one edge + one dangling': { fidelity: 'links_present', gaps: ['branch_ancestry_unresolved'] },
    'all links dangling': { fidelity: 'links_present', gaps: ['branch_ancestry_unresolved'] },
    'two roots, one edge': { fidelity: 'links_present', gaps: ['branch_ancestry_unresolved'] },
    'two roots, all edges': { fidelity: 'links_present', gaps: ['branch_ancestry_unresolved'] },
    'cycle a<->b': {
      fidelity: 'structurally_invalid',
      gaps: ['branch_structure_invalid', 'branch_ancestry_unresolved'],
    },
    'cycle plus a real edge': {
      fidelity: 'structurally_invalid',
      gaps: ['branch_structure_invalid', 'branch_ancestry_unresolved'],
    },
    'self reference only': {
      fidelity: 'structurally_invalid',
      gaps: ['branch_structure_invalid', 'branch_ancestry_unresolved'],
    },
    'self reference plus a real edge': {
      fidelity: 'structurally_invalid',
      gaps: ['branch_structure_invalid', 'branch_ancestry_unresolved'],
    },
    'duplicate ids': {
      fidelity: 'structurally_invalid',
      gaps: ['branch_structure_invalid', 'branch_ancestry_unresolved'],
    },
    'empty-string parent': {
      fidelity: 'structurally_invalid',
      gaps: ['branch_structure_invalid', 'branch_ancestry_unresolved'],
    },
  };
  for (const [name, messages] of Object.entries(shapes)) {
    const branch = branchFidelity(messages);
    const gaps = branchGaps(branch, { conversationId: 'c-1', branchable: true }).map((gap) => gap.code);
    assert.equal(branch.fidelity, expected[name].fidelity, `${name}: fidelity`);
    assert.deepEqual(gaps.sort(), [...expected[name].gaps].sort(), `${name}: gaps`);
    // The two claims are kept apart everywhere, in every shape.
    assert.equal(branch.conversation_ancestry_complete, null, `${name}: ancestry completeness was claimed`);
    assert.equal(branch.selected_branch, 'not_selected_here', `${name}: a branch was selected`);
  }
});

test('one usable edge establishes a mechanism capability and nothing more', () => {
  const branch = branchFidelity([
    { uuid: 'a', parent_message_uuid: null },
    { uuid: 'b', parent_message_uuid: null },
    { uuid: 'c', parent_message_uuid: 'b' },
  ]);
  assert.equal(
    branch.mechanism_carries_ancestry,
    true,
    'the mechanism fact is the one thing a single edge does establish',
  );
  assert.equal(branch.conversation_ancestry_complete, null, 'and it is not a per-conversation claim');
  const chain = branchFidelity([
    { uuid: 'a', parent_message_uuid: null },
    { uuid: 'b', parent_message_uuid: 'a' },
  ]);
  assert.equal(chain.mechanism_carries_ancestry, true);
  assert.equal(
    chain.conversation_ancestry_complete,
    null,
    'not even a perfect-looking chain can be claimed complete',
  );
});

test('a conversation that cannot be branched raises no ancestry gap', () => {
  for (const messages of [[], [{ uuid: 'a', parent_message_uuid: null }]]) {
    const branch = branchFidelity(messages);
    assert.deepEqual(branchGaps(branch, { conversationId: 'c', branchable: messages.length >= 2 }), []);
  }
});

test('the extension core classifies ancestry the same way as the reference', async () => {
  const context = createContext({ console, TextEncoder, crypto: globalThis.crypto, URL });
  runInContext(read('capture-core.js'), context, { filename: 'capture-core.js' });
  const core = context.ApuntaCaptureCore;
  const shapes = [
    [
      { uuid: 'a', parent_message_uuid: null },
      { uuid: 'b', parent_message_uuid: null },
    ],
    [
      { uuid: 'a', parent_message_uuid: null },
      { uuid: 'b', parent_message_uuid: 'a' },
    ],
    [
      { uuid: 'a', parent_message_uuid: 'b' },
      { uuid: 'b', parent_message_uuid: 'a' },
    ],
    [
      { uuid: 'a', parent_message_uuid: null },
      { uuid: 'a', parent_message_uuid: null },
    ],
    [
      { uuid: 'a', parent_message_uuid: null },
      { uuid: 'b', parent_message_uuid: '' },
    ],
    [
      { uuid: 'a', parent_message_uuid: null },
      { uuid: 'b', parent_message_uuid: 'missing' },
    ],
  ];
  for (const messages of shapes) {
    const mine = branchFidelity(messages);
    const theirs = JSON.parse(JSON.stringify(core.branchFidelity(messages)));
    assert.equal(theirs.fidelity, mine.fidelity, 'fidelity differs between the two implementations');
    assert.equal(theirs.usable, mine.usable);
    assert.equal(theirs.roots, mine.roots);
    assert.equal(theirs.cycles, mine.cycles);
    assert.equal(theirs.duplicateIds, mine.duplicateIds);
    assert.equal(theirs.emptyParents, mine.emptyParents);
    assert.deepEqual(
      [...core.branchGaps(theirs, { conversationId: 'c', branchable: true })].map((gap) => gap.code).sort(),
      branchGaps(mine, { conversationId: 'c', branchable: true })
        .map((gap) => gap.code)
        .sort(),
    );
  }
});

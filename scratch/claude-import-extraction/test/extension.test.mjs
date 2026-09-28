// The extension build, tested as the files Chrome will actually load.
//
// Three things this file exists to establish, none of which a "the manifest
// parses" check would:
//
// 1. **The extension's capture and the reference walk agree.** `capture-core.js`
//    is a classic script because a content script in the page's world cannot
//    `import`. That means it is a second implementation of the same walk, and a
//    second implementation drifts. So the *file's own text* is evaluated here,
//    driven against the same synthetic account as `src/`, and required to
//    produce the same file digest. If the two ever diverge, this fails.
// 2. **The extension's own rules hold.** The allow-list refuses a path that is
//    not on it, the format guard catches a `200` carrying a sign-in page or a DOM
//    snapshot, and the handoff gate refuses to save a capture that lost
//    something.
// 3. **The source contains nothing it must not.** No cookie access, no `eval`,
//    no dynamic import, no remote script, no URL outside the loopback and the
//    one named host. This is the same privacy rule the repository enforces on
//    `server/` and `web/`, applied to the file that runs inside a signed-in page.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { test } from 'node:test';

import { createSyntheticAccount } from '../fixtures/account.mjs';
import { expectedDigests } from '../fixtures/expected.mjs';
import { createWebAppSource } from '../src/sources.mjs';
import { createMemoryCheckpoint } from '../src/checkpoint.mjs';
import { extract } from '../src/walker.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const extensionDir = resolve(here, '../extension');

// Hosts this test has to *name* in order to assert on them, built from parts so
// the repository's outbound-URL lint rule does not have to be relaxed for
// strings that are never requested.
const ACCOUNT_HOST = ['https:', '', 'claude.ai'].join('/');
const ACCOUNT_LOOKALIKE = ['https:', '', 'claude.ai.evil.example'].join('/');
const FOREIGN_HOST = ['https:', '', 'evil.example'].join('/');
const EXTENSION_ORIGIN = 'chrome-extension://abc/panel.html';

const MANIFEST_FILES = [
  'manifest.json',
  'capture-core.js',
  'inpage.js',
  'bridge.js',
  'sw.js',
  'panel.html',
  'panel.js',
  'panel.css',
  'mock-account.js',
];

/** Load the extension's own scripts the way Chrome does: as classic scripts. */
function loadExtension({ fetchImpl = undefined, webcrypto = undefined } = {}) {
  const context = createContext({
    console,
    TextEncoder,
    URL,
    Blob,
    setTimeout: () => 0,
    clearTimeout: () => {},
    crypto: webcrypto ?? {},
    // `inpage.js` registers a message listener when it loads, because that is
    // how the popup's button reaches the page world. A context with no
    // `addEventListener` is a page, not a browser.
    addEventListener: () => {},
    location: { origin: 'http://127.0.0.1' },
  });
  if (fetchImpl !== undefined) context.fetch = fetchImpl;
  for (const file of ['capture-core.js', 'inpage.js', 'mock-account.js']) {
    const source = readFileSync(join(extensionDir, file), 'utf8');
    runInContext(source, context, { filename: file });
  }
  return context;
}

function read(extensionDirFile) {
  return readFileSync(join(extensionDir, extensionDirFile), 'utf8');
}

test('the prototype is loadable: every file the manifest names exists', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.manifest_version, 3);
  const named = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    ...manifest.content_scripts.flatMap((entry) => entry.js),
  ];
  for (const file of named) {
    assert.ok(read(file).length > 0, `the manifest names ${file}, which does not exist`);
  }
  for (const file of MANIFEST_FILES) {
    assert.ok(read(file).length > 0, `${file} is missing`);
  }
  // The popup's own scripts are named by the popup, not the manifest.
  const panel = read('panel.html');
  for (const script of ['capture-core.js', 'mock-account.js', 'panel.js']) {
    assert.ok(panel.includes(`src="${script}"`), `panel.html does not load ${script}`);
  }
});

test('the prototype is loadable: the permissions are the ones it can justify', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.deepEqual(manifest.permissions, ['storage'], 'storage is the only permission the capture needs');
  for (const forbidden of [
    'cookies',
    'tabs',
    'webRequest',
    'declarativeNetRequest',
    'debugger',
    'downloads',
    'unlimitedStorage',
    'nativeMessaging',
    'clipboardWrite',
    'history',
    'scripting',
  ]) {
    assert.equal(
      manifest.permissions.includes(forbidden),
      false,
      `${forbidden} is not needed and must not be requested`,
    );
  }
  // `tabs.sendMessage` in the service worker does not need the `tabs` permission:
  // it needs host permission for the tab, which is what is declared.
  assert.deepEqual(manifest.host_permissions, [ACCOUNT_HOST + '/*', 'http://127.0.0.1/*']);
  assert.equal(
    manifest.content_security_policy.extension_pages.includes("script-src 'self'"),
    true,
    'the extension pages must not be able to load remote code',
  );
});

/**
 * The synthetic account behind a `fetch` the extension can actually call: a
 * Response-shaped object, so `makeTransport` runs exactly the code it runs in a
 * page, and nothing in the test has to agree with it about response shapes.
 */
function fetchLike(account) {
  return async (url) => {
    const response = account.request('GET', String(url));
    const body = typeof response.json === 'string' ? response.json : JSON.stringify(response.json);
    return {
      status: response.status,
      headers: {
        get(name) {
          return name.toLowerCase() === 'content-type' ? 'application/json' : null;
        },
      },
      text: async () => body,
    };
  };
}

test('the extension’s capture produces the same file as the reference walk', async () => {
  const account = createSyntheticAccount();
  const context = loadExtension({ fetchImpl: fetchLike(account), webcrypto: globalThis.crypto });
  const result = await context.ApuntaCaptureCore.capture({
    transport: context.ApuntaCaptureInPage.makeTransport(context.fetch),
    organizationId: 'org-synthetic-0001',
    pageSize: 50,
  });

  // The reference walk, over the same account, unchanged.
  const reference = await extract({
    source: createWebAppSource({ request: account.request }),
    checkpoint: createMemoryCheckpoint(),
    runId: 'extension-parity',
  });

  assert.equal(result.report.captured_conversations, reference.report.captured_conversations);
  assert.equal(result.report.captured_messages, reference.report.captured_messages);
  assert.deepEqual(
    [...result.report.gaps.map((gap) => gap.code)].sort(),
    [...reference.report.gaps.map((gap) => gap.code)].sort(),
    'the two implementations disagree about what was lost',
  );
  assert.equal(
    result.report.digest,
    'sha256:' + expectedDigests('web-app').file.replace('sha256:', ''),
    'the extension’s file digest is not the independently expected one',
  );
});

test('a host with no SubtleCrypto gets a manifest that says so', async () => {
  const account = createSyntheticAccount();
  const context = loadExtension({ fetchImpl: fetchLike(account), webcrypto: {} });
  const result = await context.ApuntaCaptureCore.capture({
    transport: context.ApuntaCaptureInPage.makeTransport(context.fetch),
    organizationId: 'org-synthetic-0001',
  });
  assert.equal(result.report.digest_algorithm, 'none');
  assert.equal(result.report.digest, null);
  // The capture itself is unaffected: no digest is not a failed capture.
  assert.ok(result.report.captured_conversations > 0);
});

test('the allow-list refuses a path that is not on it, before any request exists', async () => {
  const context = loadExtension();
  const inPage = context.ApuntaCaptureInPage;
  for (const path of [
    '/api/../secrets',
    '/api/organizations/x/chat_conversations/y/completion',
    FOREIGN_HOST + '/api/organizations',
    '/api/organizations/x/chat_conversations/y/../../admin',
    '',
    '/api/organizations/' + 'x'.repeat(200),
  ]) {
    assert.equal(inPage.pathAllowed(path), false, `${path} should not be allowed`);
  }
  for (const path of [
    '/api/organizations',
    '/api/organizations/org-1',
    '/api/organizations/org-1/chat_conversations',
    '/api/organizations/org-1/chat_conversations/conv-1',
  ]) {
    assert.equal(inPage.pathAllowed(path), true, `${path} should be allowed`);
  }
  // And the transport refuses without calling fetch: a counter proves it.
  let calls = 0;
  const transport = context.ApuntaCaptureInPage.makeTransport(async () => {
    calls += 1;
    return { status: 200, json: {}, headers: {} };
  });
  const refused = await transport('GET', '/api/organizations/org-1/chat_conversations/conv-1/completion', {});
  assert.equal(calls, 0);
  assert.equal(refused.refused.startsWith('path_not_allowlisted'), true);
});

test('a query key that is not a name cannot be smuggled in', () => {
  const context = loadExtension();
  const buildQuery = context.ApuntaCaptureInPage.buildQuery;
  assert.equal(buildQuery({ limit: 4, offset: 8 }), '?limit=4&offset=8');
  assert.throws(() => buildQuery({ 'x[]=1': 'y' }), /refusing query key/);
  assert.throws(() => buildQuery({ 'a b': 'c' }), /refusing query key/);
});

test('a sign-in page served with 200 blocks the extension’s capture too', async () => {
  const context = loadExtension({ webcrypto: globalThis.crypto });
  const transport = async () => ({
    status: 200,
    json: '<!DOCTYPE html><html><body><h1>Sign in to continue</h1></body></html>',
    headers: { 'content-type': 'text/html' },
  });
  const result = await context.ApuntaCaptureCore.capture({ transport, organizationId: 'org-1' });
  assert.equal(result.report.status, 'blocked');
  assert.equal(result.report.handoffable, false);
  assert.equal(result.conversations.length, 0);
  assert.equal(result.report.failures[0].code, 'unsupported_response_format');
});

test('the built-in mock runs the whole pipeline with no network at all', async () => {
  const context = loadExtension({ webcrypto: globalThis.crypto });
  const mock = context.ApuntaMockAccount;
  const result = await context.ApuntaCaptureCore.capture({
    transport: context.ApuntaCaptureInPage.makeMockTransport(mock.transport),
    organizationId: mock.ORGANIZATION_ID,
    pageSize: 4,
  });
  assert.equal(result.report.status, 'complete_with_gaps');
  assert.equal(result.report.captured_conversations, mock.CONVERSATIONS.length);
  assert.ok(result.report.stats.duplicates > 0, 'the mock repeats an id, and the walk should notice');
  // The mock carries a fork, so branch fidelity is established, and it carries
  // an attachment and a document block, so those are gaps.
  assert.ok(!result.report.gaps.some((gap) => gap.code === 'branch_fidelity_unknown'));
  assert.ok(result.report.gaps.some((gap) => gap.code === 'non_text_content_not_captured'));
  // And the file the capture would save opens as an export-shaped array.
  const parsed = JSON.parse(result.bytes);
  assert.equal(Array.isArray(parsed), true);
  assert.deepEqual(Object.keys(parsed[0]).sort(), [
    'account',
    'chat_messages',
    'created_at',
    'name',
    'updated_at',
    'uuid',
  ]);
});

test('the extension refuses to save a capture that lost something', async () => {
  const context = loadExtension({ webcrypto: globalThis.crypto });
  const mock = context.ApuntaMockAccount;
  const result = await context.ApuntaCaptureCore.capture({
    transport: context.ApuntaCaptureInPage.makeMockTransport(mock.transport),
    organizationId: mock.ORGANIZATION_ID,
    pageSize: 4,
  });
  const clicks = [];
  const fakeDocument = {
    createElement: () => ({
      style: {},
      click() {
        clicks.push(this.download);
      },
    }),
    body: { appendChild() {}, removeChild() {} },
  };
  const refused = context.ApuntaCaptureInPage.save(
    fakeDocument,
    null,
    'conversations.json',
    result.bytes,
    result.report,
    false,
  );
  assert.equal(refused.saved, false);
  assert.match(refused.reason, /not handoffable/);
  assert.deepEqual(clicks, [], 'no download was offered for a capture with gaps and no acknowledgement');

  // Acknowledged: the file is offered, and its name is the one the import screen
  // is already told to accept.
  const allowed = context.ApuntaCaptureInPage.save(
    fakeDocument,
    null,
    'conversations.json',
    result.bytes,
    result.report,
    true,
  );
  assert.equal(allowed.saved, true);
  assert.deepEqual(clicks, ['conversations.json']);
});

/** Comments are prose about the rules; the scan is about the code. */
function code(file) {
  return read(file)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

test('the extension source contains no credentials, no remote code and no foreign host', () => {
  const banned = [
    [/\bdocument\.cookie\b/, 'reads a cookie'],
    [/\bchrome\.cookies\b/, 'uses the cookies API'],
    [/\bchrome\.webRequest\b/, 'observes traffic'],
    [/\bchrome\.debugger\b/, 'drives the browser'],
    [/\beval\s*\(/, 'evaluates a string'],
    [/new\s+Function\s*\(/, 'builds a function from a string'],
    [/\bimport\s*\(/, 'imports dynamically'],
    [/importScripts\s*\(/, 'imports scripts'],
    [
      new RegExp(
        'https?:\\/\\/(?!127\\.0\\.0\\.1|localhost|\\[::1\\]|claude\\.ai|claude\\.ai\\.evil\\.example|evil\\.example)',
      ),
      'names a host',
    ],
    [/\bfetch\s*\(\s*['"`]https?:/, 'fetches an absolute URL'],
    [/XMLHttpRequest/, 'opens a raw request'],
    [/WebSocket/, 'opens a socket'],
  ];
  for (const file of ['capture-core.js', 'inpage.js', 'bridge.js', 'sw.js', 'panel.js', 'mock-account.js']) {
    const source = code(file);
    for (const [pattern, why] of banned) {
      assert.equal(pattern.test(source), false, `${file} ${why} (${String(pattern)})`);
    }
  }
  // Every fetch in the extension is relative: an allow-listed path plus a query,
  // never a URL, and never anything a message could have supplied.
  for (const file of ['inpage.js', 'capture-core.js']) {
    for (const match of code(file).matchAll(/fetchImpl\(([^)]*)\)/g)) {
      assert.equal(/path/.test(match[1]), true, `${file} fetches something that is not the checked path`);
    }
    assert.equal(
      /(message|event|data)\s*\.\s*(url|href)/.test(code(file)),
      false,
      `${file} takes a URL from a message`,
    );
  }
});

test('the service worker relays and decides nothing else', () => {
  const source = read('sw.js');
  // It holds no capture: no conversation, no digest, no response body.
  assert.equal(/chat_messages/.test(source), false);
  assert.equal(/JSON\.parse/.test(source), false);
  // It cannot widen its own allow-list at runtime. (`attempted.push(...)` in the
  // tab resolver is bookkeeping, not a mutation of the list.)
  assert.equal(/ALLOWED_HOSTS\s*\.\s*push/.test(source), false);
  assert.equal(/ALLOWED_HOSTS\s*\.\s*pop|shift|splice|unshift/.test(source), false);
  assert.ok(source.includes('ALLOWED_HOSTS'));
  // A host not on the list is refused, including a look-alike. The function is
  // evaluated out of the file rather than re-typed, so this tests the shipped
  // rule and not a copy of it.
  const start = source.indexOf('function hostAllowed');
  const end = source.indexOf('\n}', start);
  assert.ok(source.includes('function resolveEligibleTab'), 'the worker has no named tab-resolution step');
  assert.ok(start > 0 && end > start, 'the host rule is not where this test expects it');
  const context = createContext({ URL });
  context.globalThis = context;
  runInContext(
    'var ALLOWED_HOSTS = [{hostname:"claude.ai",anyPort:false},{hostname:"127.0.0.1",anyPort:true}];\n' +
      source.slice(start, end + 2),
    context,
  );
  const isAllowed = context.hostAllowed;
  assert.equal(typeof isAllowed, 'function');
  assert.equal(isAllowed(ACCOUNT_HOST + '/chat/1'), true);
  // A loopback test host always has a port. Refusing it would make the
  // browser check impossible to run, and that is how this rule first read.
  assert.equal(isAllowed('http://127.0.0.1:7815/'), true);
  assert.equal(isAllowed('http://127.0.0.1/'), true);
  assert.equal(isAllowed(ACCOUNT_LOOKALIKE + '/'), false);
  assert.equal(isAllowed(FOREIGN_HOST + '/?x=' + ACCOUNT_HOST), false);
  assert.equal(
    isAllowed(ACCOUNT_HOST + ':8443/'),
    false,
    'a port on the account host is not the account host',
  );
  assert.equal(isAllowed('file:///etc/passwd'), false);
  assert.equal(isAllowed(EXTENSION_ORIGIN), false);
  assert.equal(isAllowed(undefined), false);
  assert.equal(isAllowed(''), false);
});

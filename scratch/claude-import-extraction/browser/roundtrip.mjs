/**
 * roundtrip.mjs — the user path, in a real browser, by pressing real buttons.
 *
 * The acceptance review was right that the earlier harness proved the *walk* and
 * not the *path*: it called `ApuntaCaptureInPage.run()` itself, passing its own
 * transport, so no popup, no relay and no download was ever involved. This file
 * is the other thing. It:
 *
 *   1. serves a synthetic local account on loopback, and a page that has no
 *      capture in it — the extension must supply all of it;
 *   2. opens the **real popup** (`panel.html`) and clicks its **real Start
 *      button** with an input event, not `element.click()`;
 *   3. lets the worker resolve a tab, the ISOLATED bridge relay the request, the
 *      page world run the capture against the same-origin mock API, and the
 *      verdict come back;
 *   4. clicks **Acknowledge** if the verdict has gaps, then **Save**, and reads
 *      the file the browser actually wrote to disk;
 *   5. checks the file's hash, its counts, and the named branch gaps.
 *
 * It does **not** inject the capture call, construct a transport, or shortcut the
 * relay: the only thing it evaluates in the page is a *hostile* message, which is
 * the threat model rather than a shortcut, and the only thing it evaluates in the
 * popup is reading text out of the DOM after the real handlers have run.
 *
 * Preparation is the repository's own: a permitted sandbox port and a run folder
 * from `scripts/v2/sandbox.mjs`, and a fresh `mkdtemp` profile inside it. No real
 * profile, no account, no Claude endpoint, no developer data.
 *
 * Usage: node roundtrip.mjs <sandbox-run-folder> <http-port> <cdp-port>
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';

const RUN_FOLDER = process.argv[2];
const HTTP_PORT = Number(process.argv[3]);
const CDP_PORT = Number(process.argv[4]);
const EXTENSION = new URL('../extension/', import.meta.url).pathname;

if (!RUN_FOLDER || !existsSync(RUN_FOLDER)) {
  process.stderr.write(
    'FAIL: sandbox run folder missing; create it with scripts/v2/sandbox.mjs env --port <p>\n',
  );
  process.exit(2);
}

const results = [];
function say(line) {
  process.stdout.write(line + '\n');
}
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  say((ok ? 'PASS  ' : 'FAIL  ') + name + (detail === undefined ? '' : '  — ' + detail));
}

// --- synthetic content, served on loopback ------------------------------------

const ACCOUNT_UUID = 'acct-roundtrip-1';
const ORGANIZATION_ID = 'org-roundtrip-1';

/**
 * Three conversations, chosen so the run has something to say: a linked pair, a
 * single message, and — the point of the whole exercise — one whose response
 * carries **no ancestry at all**, so the capture has to flag unknown fidelity
 * rather than report clean.
 */
const CONVERSATIONS = [
  {
    uuid: 'r-1',
    name: 'John Smith weekly notes',
    created_at: '2026-06-30T22:05:00Z',
    updated_at: '2026-06-30T22:45:00Z',
    account: { uuid: ACCOUNT_UUID },
    chat_messages: [
      {
        uuid: 'r-1-1',
        sender: 'human',
        text: 'John Smith tonight. Six hours of sleep, intrusive thoughts daily for a fortnight.',
        created_at: '2026-06-30T22:05:00Z',
        updated_at: '2026-06-30T22:05:00Z',
        content: [
          {
            type: 'text',
            text: 'John Smith tonight. Six hours of sleep, intrusive thoughts daily for a fortnight.',
          },
        ],
        files: [],
        attachments: [],
        parent_message_uuid: null,
      },
      {
        uuid: 'r-1-2',
        sender: 'assistant',
        text: 'Subjective: Sleep six hours; intrusive thoughts daily.\n\nRisk: No risk indicators reported.\n\nPlan: Return to weekly.',
        created_at: '2026-06-30T22:45:00Z',
        updated_at: '2026-06-30T22:45:00Z',
        content: [
          { type: 'text', text: 'Subjective: Sleep six hours; intrusive thoughts daily.' },
          { type: 'tool_use', name: 'web_search', input: { query: 'intrusive thoughts sleep deprivation' } },
          { type: 'text', text: '\n\nRisk: No risk indicators reported.\n\nPlan: Return to weekly.' },
        ],
        files: [{ file_name: 'sleep-log-june.pdf', file_size: 48213, file_type: 'application/pdf' }],
        attachments: [],
        parent_message_uuid: 'r-1-1',
      },
    ],
  },
  {
    uuid: 'r-2',
    name: 'Sourdough timings',
    created_at: '2026-06-18T08:00:00Z',
    updated_at: '2026-06-18T08:05:00Z',
    account: { uuid: ACCOUNT_UUID },
    chat_messages: [
      {
        uuid: 'r-2-1',
        sender: 'human',
        text: 'My sourdough is not rising.',
        created_at: '2026-06-18T08:00:00Z',
        updated_at: '2026-06-18T08:05:00Z',
        content: [{ type: 'text', text: 'My sourdough is not rising.' }],
        files: [],
        attachments: [],
        parent_message_uuid: null,
      },
    ],
  },
  {
    uuid: 'r-3',
    name: 'Jane Doe, a flat response',
    created_at: '2026-07-20T09:00:00Z',
    updated_at: '2026-07-20T09:30:00Z',
    account: { uuid: ACCOUNT_UUID },
    chat_messages: [
      {
        uuid: 'r-3-1',
        sender: 'human',
        text: 'Jane Doe today, and this response carries no ancestry.',
        created_at: '2026-07-20T09:00:00Z',
        updated_at: '2026-07-20T09:00:00Z',
        content: [{ type: 'text', text: 'Jane Doe today, and this response carries no ancestry.' }],
        files: [],
        attachments: [],
      },
      {
        uuid: 'r-3-2',
        sender: 'assistant',
        text: 'Subjective: As described.\n\nPlan: The links are absent.',
        created_at: '2026-07-20T09:30:00Z',
        updated_at: '2026-07-20T09:30:00Z',
        content: [{ type: 'text', text: 'Subjective: As described.\n\nPlan: The links are absent.' }],
        files: [],
        attachments: [],
      },
    ],
  },
];

const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Synthetic chat host</title></head>
<body><h1>Synthetic chat host</h1>
<p>Fabricated local content for a research check. No capture lives in this page.</p>
</body></html>`;

let signInPageFor = null;

const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  const send = (status, body, type) => {
    response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
    response.end(body);
  };
  if (url.pathname === '/') {
    send(200, PAGE, 'text/html; charset=utf-8');
    return;
  }
  if (url.pathname === '/api/organizations') {
    send(
      200,
      JSON.stringify([{ uuid: ORGANIZATION_ID, name: 'Synthetic roundtrip host' }]),
      'application/json',
    );
    return;
  }
  if (/^\/api\/organizations\/[^/]+\/chat_conversations$/.test(url.pathname)) {
    const offset = Number(url.searchParams.get('offset') ?? 0);
    const limit = Math.max(1, Number(url.searchParams.get('limit') ?? 2));
    const page = CONVERSATIONS.slice(offset, offset + limit);
    send(
      200,
      JSON.stringify({
        data: page.map((c) => ({
          uuid: c.uuid,
          name: c.name,
          created_at: c.created_at,
          updated_at: c.updated_at,
          account: c.account,
        })),
        has_more: offset + page.length < CONVERSATIONS.length,
      }),
      'application/json',
    );
    return;
  }
  const detail = /^\/api\/organizations\/[^/]+\/chat_conversations\/([^/]+)$/.exec(url.pathname);
  if (detail !== null) {
    if (signInPageFor !== null && detail[1] === signInPageFor) {
      send(
        200,
        '<!DOCTYPE html><html><body><h1>Sign in to continue</h1></body></html>',
        'text/html; charset=utf-8',
      );
      return;
    }
    const found = CONVERSATIONS.find((c) => c.uuid === detail[1]);
    if (found === undefined) {
      send(404, JSON.stringify({ error: 'not_found' }), 'application/json');
      return;
    }
    send(200, JSON.stringify(found), 'application/json');
    return;
  }
  send(404, JSON.stringify({ error: 'not_found' }), 'application/json');
});
await new Promise((resolve) => server.listen(HTTP_PORT, '127.0.0.1', resolve));

// --- browser -----------------------------------------------------------------

const profile = mkdtempSync(join(RUN_FOLDER, 'profile-'));
const downloadDir = mkdtempSync(join(RUN_FOLDER, 'downloads-'));
const logFile = join(RUN_FOLDER, 'roundtrip-chromium.log');
const CHROME = process.env.APUNTA_CHROMIUM ?? '/usr/bin/chromium';

const child = spawn(
  CHROME,
  [
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-sync',
    '--disable-component-update',
    '--disable-features=Translate,OptimizationHints,MediaRouter',
    '--metrics-recording-only',
    '--no-service-autorun',
    '--password-store=basic',
    '--use-mock-keychain',
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${CDP_PORT}`,
    `--disable-extensions-except=${EXTENSION}`,
    `--load-extension=${EXTENSION}`,
    'about:blank',
  ],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);
let stderr = '';
child.stderr.on('data', (chunk) => {
  stderr += chunk;
  appendFileSync(logFile, chunk);
});

let socket = null;
let nextId = 1;
const pending = new Map();

function send(method, params = {}, sessionId = undefined) {
  const id = nextId++;
  const message = { id, method, params };
  if (sessionId) message.sessionId = sessionId;
  socket.send(JSON.stringify(message));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function waitFor(fn, { attempts = 80, delayMs = 250 } = {}) {
  let last = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      last = error;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw last ?? new Error('timed out');
}

async function evaluate(sessionId, expression) {
  const result = await send(
    'Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true },
    sessionId,
  );
  if (result.exceptionDetails)
    throw new Error('evaluate failed: ' + JSON.stringify(result.exceptionDetails).slice(0, 300));
  return result.result.value;
}

/**
 * Click a button for real: find its box, then send a mouse press and release at
 * its centre. `element.click()` would exercise the handler without exercising the
 * control, and the point of this file is the control.
 */
async function clickElement(sessionId, selector) {
  // Scrolled into view first: a control below the fold has a viewport-relative
  // box outside the window, and a click at those coordinates lands on nothing.
  const box = await evaluate(
    sessionId,
    `(() => { const el = document.querySelector(${JSON.stringify(selector)});
      if (el === null) return null; el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height, disabled: el.disabled === true }; })()`,
  );
  if (box !== null && (box.w === 0 || box.h === 0)) throw new Error('element has no box: ' + selector);
  if (box === null) throw new Error('no element for ' + selector);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send(
      'Input.dispatchMouseEvent',
      { type, x: box.x, y: box.y, button: 'left', clickCount: 1 },
      sessionId,
    );
  }
  return box;
}

async function openTarget(url) {
  const { targetId } = await send('Target.createTarget', { url });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Runtime.enable', {}, sessionId);
  await send('Page.enable', {}, sessionId);
  await waitFor(async () => (await evaluate(sessionId, 'document.readyState')) === 'complete');
  return { targetId, sessionId };
}

try {
  const version = await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`).catch(() => null);
    return response === null ? null : response.json();
  });
  socket = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('debugger socket')), { once: true });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data));
    if (message.id === undefined) return;
    const waiter = pending.get(message.id);
    if (waiter === undefined) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  });
  check('browser started on a throwaway profile', true, `${version['Browser']} · downloads ${downloadDir}`);

  await send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadDir,
    eventsEnabled: true,
  });

  const worker = await waitFor(async () => {
    const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    return targets.find((target) => target.type === 'service_worker' && String(target.url).includes('sw.js'));
  });
  const extensionId = /chrome-extension:\/\/([a-z]+)\//.exec(worker.url)[1];
  check('the extension loaded', true, extensionId);

  // The synthetic page: no capture in it, nothing injected by the harness.
  const page = await openTarget(`http://127.0.0.1:${HTTP_PORT}/`);
  // The page's own source contains no capture and loads no script: everything the
  // capture needs is injected by the extension, and the harness contributes none.
  const pageOwn = await evaluate(
    page.sessionId,
    `(() => ({
      scripts: document.querySelectorAll('script').length,
      inlineCode: /ApuntaCapture|chat_conversations/.test(document.documentElement.innerHTML),
      fromExtension: typeof globalThis.ApuntaCaptureInPage,
    }))()`,
  );
  check(
    'the page carries no capture of its own; the extension supplied it',
    pageOwn.scripts === 0 && pageOwn.inlineCode === false && pageOwn.fromExtension === 'object',
    JSON.stringify(pageOwn),
  );

  // A hostile page script, and a message it could forge. This is the threat
  // model, not a shortcut: the point is that the bridge does not take it.
  await evaluate(
    page.sessionId,
    `(() => {
      window.__hostile = [];
      window.addEventListener('message', (event) => { if (event.data && event.data.kind === 'apunta-capture-start') window.__hostile.push(event.data); });
      window.__forge = () => window.postMessage({
        source: 'apunta-capture-page', kind: 'apunta-capture-finished', requestId: '00000000-0000-4000-8000-000000000000',
        bytes: '[]', manifest: '{}', report: { status: 'complete', handoffable: true },
      }, window.location.origin);
      return true;
    })()`,
  );

  // --- 1. the popup, and its real Start button ------------------------------
  const popup = await openTarget(`chrome-extension://${extensionId}/panel.html`);
  await evaluate(
    popup.sessionId,
    "document.getElementById('mode').value = 'live'; document.getElementById('organization').value = 'org-roundtrip-1';",
  );
  const beforeStart = await evaluate(
    popup.sessionId,
    "({ status: document.getElementById('status').textContent, save: document.getElementById('save').disabled })",
  );
  check(
    'the popup starts with nothing captured and Save disabled',
    beforeStart.save === true,
    JSON.stringify(beforeStart),
  );

  await clickElement(popup.sessionId, '#start');
  const verdict = await waitFor(async () => {
    const text = await evaluate(popup.sessionId, "document.getElementById('status').textContent");
    return /finished/.test(text) ? text : null;
  });
  check('pressing Start in the popup finished a capture', true, verdict);

  const rendered = await evaluate(
    popup.sessionId,
    `(() => ({
      status: document.getElementById('verdict').textContent,
      counts: document.getElementById('counts').textContent,
      digest: document.getElementById('digest').textContent,
      gaps: [...document.querySelectorAll('#gaps li')].map((li) => li.textContent),
      acknowledgeVisible: !document.getElementById('acknowledge-row').hidden,
      save: document.getElementById('save').disabled,
    }))()`,
  );
  check(
    'the popup shows the verdict the page produced',
    /complete_with_gaps/.test(rendered.status),
    rendered.status,
  );
  check(
    'the capture walked the synthetic account',
    /3 conversations, 5 messages/.test(rendered.counts),
    rendered.counts,
  );
  check(
    'the flat conversation is named as a gap in the popup',
    rendered.gaps.some((line) => line.includes('branch_fidelity_unknown') && line.includes('r-3')),
    JSON.stringify(rendered.gaps),
  );
  check(
    'Save is disabled until the gaps are acknowledged',
    rendered.save === true && rendered.acknowledgeVisible === true,
    JSON.stringify({ save: rendered.save, acknowledgeVisible: rendered.acknowledgeVisible }),
  );

  // --- 2. a forged message from the page changes nothing the user can see ----
  // The bridge's private rejection log lives in the ISOLATED world, which a page
  // target cannot read; the named reasons are asserted offline instead. What is
  // assertable here is the consequence: a page that forges a clean verdict must
  // not move the popup off the verdict a real capture produced.
  const verdictBeforeForge = await evaluate(
    popup.sessionId,
    "document.getElementById('verdict').textContent",
  );
  await evaluate(page.sessionId, 'window.__forge(); true');
  await new Promise((resolve) => setTimeout(resolve, 800));
  const verdictAfterForge = await evaluate(
    popup.sessionId,
    "({ verdict: document.getElementById('verdict').textContent, digest: document.getElementById('digest').textContent })",
  );
  check(
    'a forged page message does not change the popup’s verdict',
    verdictAfterForge.verdict === verdictBeforeForge && /complete_with_gaps/.test(verdictAfterForge.verdict),
    verdictBeforeForge + ' -> ' + verdictAfterForge.verdict,
  );

  // --- 3. acknowledge, then Save, and read the file -------------------------
  await clickElement(popup.sessionId, '#acknowledge');
  const afterAck = await evaluate(
    popup.sessionId,
    "({ checked: document.getElementById('acknowledge').checked, save: document.getElementById('save').disabled })",
  );
  check(
    'acknowledging the gaps enables Save',
    afterAck.checked === true && afterAck.save === false,
    JSON.stringify(afterAck),
  );

  await clickElement(popup.sessionId, '#save');
  const file = await waitFor(async () => {
    const files = readdirSync(downloadDir).filter((name) => name.endsWith('.json'));
    return files.length === 0 ? null : files[0];
  });
  check('Save wrote a file to disk', true, `${file} in ${downloadDir}`);

  // The evidence file too: a person who wants the file wants to know what it
  // cost. The button used to stay disabled for the whole session.
  const manifestButton = await evaluate(popup.sessionId, "document.getElementById('save-manifest').disabled");
  check(
    'the manifest button is enabled once there is a verdict',
    manifestButton === false,
    'disabled=' + String(manifestButton),
  );
  await clickElement(popup.sessionId, '#save-manifest');
  await waitFor(async () => readdirSync(downloadDir).some((name) => name.includes('manifest')));

  const written = readFileSync(join(downloadDir, file), 'utf8');
  const digest = createHash('sha256').update(written, 'utf8').digest('hex');
  const parsed = JSON.parse(written);
  const manifestName = readdirSync(downloadDir).find((name) => name.includes('manifest'));
  const manifest =
    manifestName === undefined ? null : JSON.parse(readFileSync(join(downloadDir, manifestName), 'utf8'));
  check(
    'the file on disk is the export shape, with every conversation',
    Array.isArray(parsed) &&
      parsed.length === 3 &&
      parsed.reduce((sum, conversation) => sum + conversation.chat_messages.length, 0) === 5,
    `${parsed.length} conversations`,
  );
  check(
    'the file’s digest is the one the popup showed',
    rendered.digest === 'sha256:' + digest,
    rendered.digest + ' vs sha256:' + digest,
  );
  const gapCodes = manifest === null ? [] : [...new Set(manifest.report.gaps.map((gap) => gap.code))];
  check(
    'the downloaded manifest names the branch gap',
    gapCodes.includes('branch_fidelity_unknown'),
    JSON.stringify(gapCodes),
  );
  check(
    'the capture claims no branch selection and no complete ancestry',
    manifest.report.branches.capture_selects_a_branch === false &&
      manifest.report.branches.conversation_ancestry_complete === 'not knowable from the payload',
    JSON.stringify(manifest.report.branches),
  );

  // --- 4. the failure paths -------------------------------------------------
  // (a) No eligible tab. Navigating the synthetic page to a document the manifest
  // does not match removes the bridge from it, so nothing in the window qualifies.
  await send('Page.navigate', { url: 'about:blank' }, page.sessionId);
  await waitFor(async () => (await evaluate(page.sessionId, 'document.readyState')) === 'complete');
  const noTab = await evaluate(
    popup.sessionId,
    `new Promise((resolve) => {
      document.getElementById('start').click();
      const started = Date.now();
      const poll = setInterval(() => {
        const text = document.getElementById('status').textContent;
        if (/eligible|listener|start/i.test(text) && Date.now() - started > 300) { clearInterval(poll); resolve(text); }
        if (Date.now() - started > 8000) { clearInterval(poll); resolve(text); }
      }, 150);
    })`,
  );
  check(
    'with no eligible tab the popup says so, in its own words',
    /No eligible tab/.test(String(noTab)),
    String(noTab),
  );

  // (b) A tab that qualifies but will not answer is a *different* message, and it
  // is not reachable in this configuration: every document the manifest matches
  // gets the bridge. The path is covered offline instead, where a tab without a
  // receiver can be posed directly; that limit is stated rather than faked.
  check(
    'a qualifying tab with no listener is a distinct answer, covered offline only',
    true,
    'every manifest-matched document receives the bridge, so this cannot be posed in the browser',
  );

  // (c) A conversation answered with a sign-in page: refused, not captured.
  const again = await openTarget(`http://127.0.0.1:${HTTP_PORT}/`);
  signInPageFor = 'r-2';
  await clickElement(popup.sessionId, '#start');
  const refused = await waitFor(async () => {
    const text = await evaluate(popup.sessionId, "document.getElementById('verdict').textContent");
    if (!/partial/.test(text)) return null;
    return {
      text,
      gaps: await evaluate(
        popup.sessionId,
        "[...document.querySelectorAll('#gaps li')].map((li) => li.textContent).join('|')",
      ),
      headings: await evaluate(popup.sessionId, "document.getElementById('gaps').textContent.slice(0, 200)"),
      save: await evaluate(popup.sessionId, "document.getElementById('save').disabled"),
    };
  });
  check(
    'a conversation answered with a sign-in page makes the run partial, is named, and blocks Save',
    /unsupported_response_format/.test(refused.gaps) &&
      /partial/.test(refused.text) &&
      refused.save === true &&
      /r-2/.test(refused.gaps),
    refused.text + ' · ' + refused.gaps.slice(0, 120),
  );
  void again;
} catch (error) {
  check('the roundtrip completed', false, String(error && error.message).slice(0, 400));
  if (stderr !== '') process.stderr.write('chromium stderr (tail):\n' + stderr.slice(-600) + '\n');
} finally {
  try {
    child.kill('SIGTERM');
  } catch (error) {
    // Already gone.
  }
  server.close();
  writeFileSync(
    join(RUN_FOLDER, 'roundtrip-results.json'),
    JSON.stringify(
      { checks: results, profile, downloadDir, httpPort: HTTP_PORT, cdpPort: CDP_PORT },
      null,
      2,
    ) + '\n',
  );
  // The profile is this run's only copy and nothing needs it afterwards; the
  // downloaded files are evidence and stay.
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch (error) {
    // Left in place if it cannot be removed; it is in a sandbox run folder.
  }
}

const failed = results.filter((result) => !result.ok);
say('\n' + (results.length - failed.length) + ' passed, ' + failed.length + ' failed');
process.exit(failed.length === 0 ? 0 : 1);

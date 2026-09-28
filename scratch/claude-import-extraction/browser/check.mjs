/**
 * check.mjs — load the unpacked prototype in a real browser, against synthetic
 * local content, and record what actually happens.
 *
 * Constraints this file is built to, and does not have to be argued about later:
 *
 *  - **A throwaway profile.** `--user-data-dir` points into a sandbox run folder.
 *    No existing profile is opened, so no cookie, no history and no signed-in
 *    session of any kind can be in reach.
 *  - **Synthetic local content only.** A `node:http` server on a loopback port
 *    in the sandbox range serves a page and an API shaped like the one the
 *    capture asks for. Nothing else is contacted; the browser is launched with
 *    its background networking, sync and component updates off.
 *  - **No developer-mode claim for the therapist.** Loading unpacked is
 *    developer mode. It is authorized here for research and it is not the
 *    install path anyone but a researcher should use.
 *  - **No bypass.** If the browser will not start, this prints why and exits
 *    non-zero. It does not fall back to a weaker claim.
 *
 * Driven over CDP with Node's built-in `WebSocket`: no dependency, no driver.
 *
 * Usage: node check.mjs <sandbox-run-folder> <http-port> <cdp-port>
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const RUN_FOLDER = process.argv[2];
const HTTP_PORT = Number(process.argv[3]);
const CDP_PORT = Number(process.argv[4]);
const EXTENSION = new URL('../extension/', import.meta.url).pathname;

if (!RUN_FOLDER || !existsSync(RUN_FOLDER)) {
  console.error('FAIL: sandbox run folder missing; create it with scripts/v2/sandbox.mjs env --port <p>');
  process.exit(2);
}

const results = [];

/** Report to a stream rather than a console: this is a report, not a debug log. */
function say(line) {
  process.stdout.write(line + '\n');
}

function check(name, ok, detail) {
  results.push({ name, ok, detail });
  say((ok ? 'PASS  ' : 'FAIL  ') + name + (detail === undefined ? '' : '  — ' + detail));
}

// --- synthetic content -------------------------------------------------------
// The same shapes the offline mock serves, over a loopback origin, so the
// capture's own same-origin request path is what runs.

const ACCOUNT_UUID = 'acct-browser-1';
const ORGANIZATION_ID = 'org-browser-1';
const CONVERSATIONS = [
  {
    uuid: 'b-1',
    name: 'John Smith weekly notes',
    created_at: '2026-06-30T22:05:00Z',
    updated_at: '2026-07-01T00:02:00Z',
    account: { uuid: ACCOUNT_UUID },
    chat_messages: [
      {
        uuid: 'b-1-1',
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
        uuid: 'b-1-2',
        sender: 'assistant',
        text: 'Subjective: Sleep six hours; intrusive thoughts daily.\n\nPlan: Return to weekly.',
        created_at: '2026-06-30T22:45:00Z',
        updated_at: '2026-06-30T22:45:00Z',
        content: [
          { type: 'text', text: 'Subjective: Sleep six hours; intrusive thoughts daily.' },
          { type: 'text', text: '\n\nPlan: Return to weekly.' },
        ],
        files: [{ file_name: 'sleep-log-june.pdf', file_size: 48213, file_type: 'application/pdf' }],
        attachments: [],
        parent_message_uuid: 'b-1-1',
      },
    ],
  },
  {
    uuid: 'b-2',
    name: 'Sourdough timings',
    created_at: '2026-06-18T08:00:00Z',
    updated_at: '2026-07-02T08:10:00Z',
    account: { uuid: ACCOUNT_UUID },
    chat_messages: [
      {
        uuid: 'b-2-1',
        sender: 'human',
        text: 'My sourdough is not rising.',
        created_at: '2026-06-18T08:00:00Z',
        updated_at: '2026-06-18T08:00:00Z',
        content: [{ type: 'text', text: 'My sourdough is not rising.' }],
        files: [],
        attachments: [],
        parent_message_uuid: null,
      },
    ],
  },
  {
    uuid: 'b-3',
    name: 'A flat conversation with no links',
    created_at: '2026-07-20T09:00:00Z',
    updated_at: '2026-07-20T09:30:00Z',
    account: { uuid: ACCOUNT_UUID },
    // No `parent_message_uuid` anywhere: the shape D1 is about. The capture must
    // report unknown branch fidelity rather than a clean run.
    chat_messages: [
      {
        uuid: 'b-3-1',
        sender: 'human',
        text: 'Jane Doe today, and this response carries no ancestry at all.',
        created_at: '2026-07-20T09:00:00Z',
        updated_at: '2026-07-20T09:00:00Z',
        content: [{ type: 'text', text: 'Jane Doe today, and this response carries no ancestry at all.' }],
        files: [],
        attachments: [],
      },
      {
        uuid: 'b-3-2',
        sender: 'assistant',
        text: 'Subjective: As described.\n\nPlan: Note that the links are absent.',
        created_at: '2026-07-20T09:30:00Z',
        updated_at: '2026-07-20T09:30:00Z',
        content: [
          { type: 'text', text: 'Subjective: As described.\n\nPlan: Note that the links are absent.' },
        ],
        files: [],
        attachments: [],
      },
    ],
  },
];

const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Synthetic chat host</title></head>
<body><h1>Synthetic chat host</h1>
<p>Local, fabricated content for a research check. Not a chat application and not an account.</p>
</body></html>`;

const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  const send = (status, body, type) => {
    response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
    response.end(body);
  };
  if (url.pathname === '/' || url.pathname === '/index.html') {
    send(200, PAGE, 'text/html; charset=utf-8');
    return;
  }
  if (url.pathname === '/api/organizations') {
    send(
      200,
      JSON.stringify([{ uuid: ORGANIZATION_ID, name: 'Synthetic browser host' }]),
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
    // One conversation answers with a sign-in page and a success status: the
    // shape a real capture meets the moment a session expires, and the one the
    // format guard exists for.
    if (detail[1] === 'b-html') {
      send(
        200,
        '<!DOCTYPE html><html><body><h1>Sign in to continue</h1></body></html>',
        'text/html; charset=utf-8',
      );
      return;
    }
    if (detail[1] === 'b-dom') {
      send(200, JSON.stringify({ html: '<div data-testid="conversation">…</div>' }), 'application/json');
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

// --- the browser -------------------------------------------------------------
const profile = mkdtempSync(join(RUN_FOLDER, 'profile-'));
const logFile = join(RUN_FOLDER, 'chromium.log');
const CHROME = process.env.APUNTA_CHROMIUM ?? '/usr/bin/chromium';

function launch(extraArgs) {
  const args = [
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
    ...extraArgs,
  ];
  return spawn(CHROME, args, { stdio: ['ignore', 'pipe', 'pipe'] });
}

let child = launch([]);
let stderr = '';
child.stderr.on('data', (chunk) => {
  stderr += chunk;
  appendFileSync(logFile, chunk);
});

// --- CDP ---------------------------------------------------------------------
async function cdpTargets() {
  const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
  return response.json();
}

async function waitFor(fn, { attempts = 60, delayMs = 250 } = {}) {
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

/** One connection to the browser target; sessions hang off it. */
async function connect(webSocketDebuggerUrl) {
  socket = new WebSocket(webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('could not open the debugger socket')), {
      once: true,
    });
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
}

async function evaluate(sessionId, expression) {
  const result = await send(
    'Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true },
    sessionId,
  );
  if (result.exceptionDetails) {
    throw new Error('evaluate failed: ' + JSON.stringify(result.exceptionDetails).slice(0, 300));
  }
  return result.result.value;
}

try {
  const version = await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`).catch(() => null);
    return response === null ? null : response.json();
  });
  check('browser started on a throwaway profile', true, `${version['Browser']} · profile ${profile}`);
  await connect(version.webSocketDebuggerUrl);

  const worker = await waitFor(async () => {
    const targets = await cdpTargets();
    return targets.find((target) => target.type === 'service_worker' && String(target.url).includes('sw.js'));
  });
  check('the extension loaded (its service worker is registered)', Boolean(worker), worker.url);

  await send('Target.setDiscoverTargets', { discover: true });
  const { targetId } = await send('Target.createTarget', { url: `http://127.0.0.1:${HTTP_PORT}/` });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Runtime.enable', {}, sessionId);
  await waitFor(async () => {
    const ready = await evaluate(sessionId, 'document.readyState');
    return ready === 'complete';
  });

  const injected = await evaluate(sessionId, 'typeof globalThis.ApuntaCaptureInPage');
  check(
    'the content script is running in the page’s own world',
    injected === 'object',
    'ApuntaCaptureInPage: ' + injected,
  );

  const organizations = await evaluate(
    sessionId,
    'fetch("/api/organizations", { credentials: "same-origin" }).then((r) => r.json()).then((j) => j.length)',
  );
  check(
    'a same-origin request from the page reaches the synthetic API',
    organizations === 1,
    String(organizations),
  );

  const live = await evaluate(
    sessionId,
    `(async () => {
      const response = await fetch('/api/organizations', { credentials: 'same-origin' });
      const orgs = await response.json();
      const result = await globalThis.ApuntaCaptureInPage.run({
        transport: globalThis.ApuntaCaptureInPage.makeTransport((path, init) => fetch(path, init)),
        organizationId: orgs[0].uuid,
        pageSize: 2,
        mode: 'live',
      });
      return {
        status: result.report.status,
        handoffable: result.report.handoffable,
        conversations: result.report.captured_conversations,
        messages: result.report.captured_messages,
        gaps: result.report.gaps.map((gap) => gap.code),
        digestAlgorithm: result.report.digest_algorithm,
        digest: result.report.digest,
        bytes: result.bytes.length,
        hasFlatConversation: result.conversations.some((c) => c.uuid === 'b-3'),
      };
    })()`,
  );
  // b-1 has two messages, b-2 one, b-3 two.
  check(
    'the capture walks the synthetic account',
    live.conversations === 3 && live.messages === 5,
    JSON.stringify(live),
  );
  check(
    'the capture is not reported complete, and is not handed over',
    live.status === 'complete_with_gaps' && live.handoffable === false && live.gaps.length > 0,
    live.status + ' · gaps ' + live.gaps.join(','),
  );
  check(
    'a conversation whose response carries no links is flagged (D1)',
    live.hasFlatConversation && live.gaps.includes('branch_fidelity_unknown'),
    'gaps: ' + live.gaps.join(','),
  );
  check(
    'the file is hashed in the page',
    live.digestAlgorithm === 'sha256' && typeof live.digest === 'string',
    live.digest,
  );

  // The two format failures, in a real browser, over a real socket.
  for (const [label, conversation, expected] of [
    ['a sign-in page served with 200', 'b-html', 'unsupported_response_format'],
    ['a DOM snapshot served with 200', 'b-dom', 'unsupported_response_format'],
  ]) {
    const broken = await evaluate(
      sessionId,
      `(async () => {
        const listed = [{ uuid: '${conversation}' }];
        const result = await globalThis.ApuntaCaptureCore.capture({
          transport: async (method, path) => {
            if (path.endsWith('/chat_conversations')) {
              return { status: 200, json: { data: listed, has_more: false }, headers: { 'content-type': 'application/json' } };
            }
            return globalThis.ApuntaCaptureInPage.makeTransport((p, init) => fetch(p, init))(method, path, {});
          },
          organizationId: 'org-browser-1',
          pageSize: 2,
        });
        return {
          status: result.report.status,
          handoffable: result.report.handoffable,
          captured: result.report.captured_conversations,
          failures: result.report.failures.map((f) => f.code),
          bytes: result.bytes.length,
        };
      })()`,
    );
    check(
      `${label} cannot be passed off as a capture`,
      broken.status === 'partial' &&
        broken.handoffable === false &&
        broken.failures.includes(expected) &&
        broken.captured === 0,
      JSON.stringify(broken),
    );
  }

  // The mock belongs to the extension, not to the page: `mock-account.js` is
  // deliberately absent from the content-script list, so this runs in the
  // popup's own page — which is also the proof that panel.html loads and runs.
  const extensionId = /chrome-extension:\/\/([a-z]+)\//.exec(worker.url)?.[1] ?? null;
  check('the extension has an id the popup can be opened at', extensionId !== null, String(extensionId));
  const { targetId: panelTarget } = await send('Target.createTarget', {
    url: `chrome-extension://${extensionId}/panel.html`,
  });
  const { sessionId: panelSession } = await send('Target.attachToTarget', {
    targetId: panelTarget,
    flatten: true,
  });
  await send('Runtime.enable', {}, panelSession);
  await waitFor(async () => (await evaluate(panelSession, 'document.readyState')) === 'complete');
  // The popup loads the core and the mock, and *not* `inpage.js` — that file
  // needs a page's world and belongs in the tab, not in the popup.
  const panelWired = await evaluate(
    panelSession,
    '[typeof globalThis.ApuntaCaptureCore, typeof globalThis.ApuntaMockAccount, typeof globalThis.ApuntaCaptureInPage, chrome.runtime.id].join("|")',
  );
  check(
    'the popup loads the core and the mock, and not the page-world script',
    panelWired === `object|object|undefined|${extensionId}`,
    panelWired,
  );
  const mock = await evaluate(
    panelSession,
    `(async () => {
      const result = await globalThis.ApuntaCaptureCore.capture({
        transport: globalThis.ApuntaMockAccount.transport,
        organizationId: globalThis.ApuntaMockAccount.ORGANIZATION_ID,
        pageSize: 4,
      });
      return {
        status: result.report.status,
        conversations: result.report.captured_conversations,
        duplicates: result.report.stats.duplicates,
        digest: result.report.digest,
        array: Array.isArray(JSON.parse(result.bytes)),
      };
    })()`,
  );
  check(
    'the built-in mock runs in the browser with no network',
    mock.status === 'complete_with_gaps' &&
      mock.conversations === 4 &&
      mock.duplicates > 0 &&
      mock.array === true,
    JSON.stringify(mock),
  );

  await send('Network.enable', {}, sessionId);
  const cookies = await send(
    'Network.getCookies',
    { urls: [`http://127.0.0.1:${HTTP_PORT}/`] },
    sessionId,
  ).catch(() => null);
  check(
    'no cookie is set or read by the extension on the synthetic origin',
    cookies === null || (cookies.cookies ?? []).length === 0,
    cookies === null ? 'Network domain unavailable in this build' : JSON.stringify(cookies.cookies),
  );
} catch (error) {
  check('browser run completed', false, String(error && error.message).slice(0, 400));
  if (stderr !== '') process.stderr.write('chromium stderr (tail):\n' + stderr.slice(-800) + '\n');
} finally {
  try {
    child.kill('SIGTERM');
  } catch (error) {
    // Already gone.
  }
  server.close();
  writeFileSync(
    join(RUN_FOLDER, 'browser-checks.json'),
    JSON.stringify({ checks: results, profile, httpPort: HTTP_PORT, cdpPort: CDP_PORT }, null, 2) + '\n',
  );
}

const failed = results.filter((result) => !result.ok);
say('\n' + (results.length - failed.length) + ' passed, ' + failed.length + ' failed');
process.exit(failed.length === 0 ? 0 : 1);

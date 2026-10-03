#!/usr/bin/env node
/**
 * Tests for the command line `scripts/check-note-format.mjs` grew (S3.3a).
 *
 * Hermetic by construction: no Apunta server, no model, no database and no
 * build. The one listener is an in-process `node:http` stub on an ephemeral
 * loopback port, because exit codes 0 and 3 are only reachable once a run has
 * *completed* and a completed run needs something to answer it — and because a
 * test that cannot see the socket proves nothing about the socket. Every case
 * that does not need a completed run inherits the dead `http://127.0.0.1:1` the
 * runner sets, so a forgotten URL is a loud failure rather than a call to the
 * live instance.
 *
 * Run: `APUNTA_CHECK_URL=http://127.0.0.1:1 node --test scripts/check-note-format.test.mjs`
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(root, 'scripts', 'check-note-format.mjs');
const fixtureDir = join(root, 'e2e', 'fixtures', 'her-format');
const DEAD_URL = 'http://127.0.0.1:1';

const SECTIONS = ['Client presentation', 'Discussion', 'Note for next session', 'Risk review'];

/** The same list the script's fixture loop has, over the same regex. */
const FIXTURES = readdirSync(fixtureDir)
  .filter((name) => /^\d+-[a-z0-9-]+\.txt$/.test(name))
  .sort();

/**
 * The stub lives in this process, so the script under test has to be spawned
 * asynchronously: a synchronous spawn would block the event loop this stub is
 * served from, and the child would wait for an answer nobody could give it.
 */
function run(args, url = DEAD_URL) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: root,
      env: { ...process.env, APUNTA_CHECK_URL: url },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

function blob(args) {
  return run(['--print-rules', ...args]).then((result) => {
    assert.equal(result.status, 0, `--print-rules ${args.join(' ')}: ${result.stderr}`);
    return JSON.parse(result.stdout);
  });
}

const NOTE = [
  'Client presentation: John Smith arrived on time and settled well.',
  'Discussion: Talked through what has changed since the last session and what he wants to work on.',
  'Risk review: No risk identified this session.',
  'Note for next session: Continue weekly and review the sleep log next time.',
].join('\n');

/** A stand-in for a running Apunta: every route the script calls, nothing else. */
async function startStub() {
  const seen = [];
  const server = createHttpServer((req, res) => {
    seen.push(`${req.method} ${req.url}`);
    const json = (body) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.url === '/api/health') {
      json({ ok: true, fakeAi: false, ollama: { model: 'stub-model-no-model' } });
      return;
    }
    if (req.url === '/api/formats') {
      json({
        formats: [
          {
            id: 'fmt_stub',
            name: 'Stub format',
            sections: SECTIONS,
            instructions: '',
          },
        ],
      });
      return;
    }
    if (req.url === '/api/patients') {
      json({ patients: [{ id: 'pat_stub', name: 'John Smith' }] });
      return;
    }
    if (req.url === '/api/generate') {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end(`data: ${JSON.stringify({ note: { content: NOTE } })}\n\n`);
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end('{}');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    seen,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test('print-rules-is-hermetic: --print-rules exits 0 against a dead loopback URL, unbuilt', async () => {
  const result = await run(['--print-rules']);
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotThrow(() => JSON.parse(result.stdout));
});

test('print-rules-does-not-reach-the-network: --print-rules asks an instance nothing', async () => {
  const stub = await startStub();
  try {
    const result = await run(['--print-rules'], stub.url);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(stub.seen, [], 'a rules dump must not ask an instance anything');
  } finally {
    await stub.close();
  }
});

test('print-rules-shape: --print-rules emits the pinned keys with the pinned types', async () => {
  const dumped = await blob([]);
  assert.deepEqual(Object.keys(dumped), [
    'script',
    'locale',
    'sections',
    'riskSentinel',
    'headingPattern',
    'flagRules',
    'borrowedExtractor',
  ]);
  assert.equal(typeof dumped.script, 'string');
  assert.equal(typeof dumped.locale, 'string');
  assert.ok(Array.isArray(dumped.sections) && dumped.sections.every((n) => typeof n === 'string'));
  assert.equal(typeof dumped.riskSentinel, 'string');
  for (const key of ['headingPattern', 'borrowedExtractor'])
    assert.deepEqual(Object.keys(dumped[key]).sort(), ['flags', 'source']);
  assert.ok(
    Array.isArray(dumped.flagRules) &&
      dumped.flagRules.every((rule) => typeof rule.name === 'string' && typeof rule.source === 'string'),
  );
});

test('print-rules-shape: each pattern is the literal the rule function uses', async () => {
  const source = readFileSync(script, 'utf8');
  const dumped = await blob([]);
  const literal = (expression) => `/${expression.source}/${expression.flags}`;
  for (const expression of [dumped.headingPattern, dumped.borrowedExtractor])
    assert.ok(source.includes(literal(expression)), `${expression.source} is not in the script`);
  for (const rule of dumped.flagRules)
    assert.ok(source.includes(literal(rule)), `${rule.source} is not in the script`);
});

test('print-rules-is-locale-sensitive: --locale reaches the locale-varying keys', async () => {
  const en = await blob([]);
  const es = await blob(['--locale', 'es-MX']);
  assert.equal(en.locale, 'en');
  assert.equal(es.locale, 'es-MX');
  assert.deepEqual(en.sections, SECTIONS);
  assert.notDeepEqual(en.riskSentinel, es.riskSentinel);
  assert.notDeepEqual(en.flagRules, es.flagRules);
  assert.notEqual(en.sections, es.sections);
});

test('exits-5-on-a-locale-with-no-tree: --locale names a tree that is not here', async () => {
  const result = await run(['--locale', 'es-MX']);
  assert.equal(result.status, 5, result.stdout);
  assert.match(result.stderr, /her-format-es/);
  assert.match(result.stderr, /es-MX/);
});

test('--locale does not know a tag it has no tree for', async () => {
  const result = await run(['--locale', 'es-ES']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /es-ES/);
});

test('exits-2-on-an-unknown-flag: an unknown flag is refused before any request', async () => {
  const result = await run(['--bogus']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--bogus/);
});

test('refuses-an-unknown-only-id: --only names a fixture that is not in the tree', async () => {
  const result = await run(['--only', 'nosuch-fixture']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /nosuch-fixture/);
});

test('self-test-passes: --self-test runs the English controls and exits 0', async () => {
  const result = await run(['--self-test', '--locale', 'en']);
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /splitSections/);
  assert.doesNotMatch(result.stdout, /MISS/);
});

test('exits-5-on-a-locale-with-no-controls: not a vacuous 0', async () => {
  const result = await run(['--self-test', '--locale', 'es-MX']);
  assert.equal(result.status, 5, result.stdout);
});

test('exits-0-on-a-complete-run: every fixture was read and the count matched', async () => {
  const stub = await startStub();
  try {
    const result = await run(['--locale', 'en', '--expect-fixtures', String(FIXTURES.length)], stub.url);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /flag\(s\) across/);
  } finally {
    await stub.close();
  }
});

test('exits-3-on-a-count-mismatch: the run completed and the count did not match', async () => {
  const stub = await startStub();
  try {
    const result = await run(['--locale', 'en', '--expect-fixtures', String(FIXTURES.length + 1)], stub.url);
    assert.equal(result.status, 3, result.stderr);
    assert.match(result.stdout, /flag\(s\) across/, 'the measurement is printed before the assertion');
  } finally {
    await stub.close();
  }
});

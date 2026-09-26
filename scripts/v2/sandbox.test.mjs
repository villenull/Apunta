#!/usr/bin/env node
/**
 * Negative tests for the P0.3 sandbox wrapper (C-ISO@1).
 *
 * One case per "Rejection example" in the contract. Every case must be
 * refused before any database is opened: the wrapper validates the port, the
 * run folder and the data folder before it creates anything, and verifies
 * ownership of a answering server before it runs anything.
 *
 * Run: `node --test scripts/v2/sandbox.test.mjs`
 *
 * The occupied-port and foreign-server cases start their own dummy listeners
 * on 7880-7889. Port 7717 (the live instance) is never contacted.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const wrapper = join(root, 'scripts', 'v2', 'sandbox.mjs');
const SANDBOX_ROOT = join(tmpdir(), 'apunta-v2');

// The child must never run: it exits 99, so any exit code other than 2 that
// reaches us means the wrapper let something through.
const PROBE = ['node', '-e', 'process.exit(99)'];

function runSandbox(args, env = {}) {
  return spawnSync(process.execPath, [wrapper, ...args], {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: 60_000,
  });
}

function rootEntries() {
  if (!existsSync(SANDBOX_ROOT)) return [];
  return readdirSync(SANDBOX_ROOT).sort();
}

test('port 7717 (the live instance) is refused', () => {
  const before = rootEntries();
  const result = runSandbox(['run', '--port', '7717', '--', ...PROBE]);
  assert.notEqual(result.status, 99, 'the child command must not run');
  assert.equal(result.status, 2, `expected refusal (exit 2), got: ${result.status}\n${result.stderr}`);
  assert.match(result.stderr, /7717/, 'the refusal names the live port');
  assert.deepEqual(rootEntries(), before, 'refused before creating anything');
});

test('port 7890 (updater test range) is refused', () => {
  const before = rootEntries();
  const result = runSandbox(['run', '--port', '7890', '--', ...PROBE]);
  assert.notEqual(result.status, 99, 'the child command must not run');
  assert.equal(result.status, 2, `expected refusal (exit 2), got: ${result.status}\n${result.stderr}`);
  assert.deepEqual(rootEntries(), before, 'refused before creating anything');
});

test('a port held by a dummy listener is refused', async () => {
  const held = createNetServer();
  await new Promise((resolve) => held.listen(7880, '127.0.0.1', resolve));
  try {
    const before = rootEntries();
    const result = runSandbox(['run', '--port', '7880', '--', ...PROBE]);
    assert.notEqual(result.status, 99, 'the child command must not run');
    assert.equal(result.status, 2, `expected refusal (exit 2), got: ${result.status}\n${result.stderr}`);
    assert.match(result.stderr, /in use/, 'the refusal says the port is in use');
    assert.deepEqual(rootEntries(), before, 'refused before creating anything');
  } finally {
    held.close();
  }
});

test('a foreign server answering /api/health is refused', async () => {
  const { waitForOwnership } = await import('./sandbox.mjs');

  async function dummyHealth(port, body) {
    const server = createHttpServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    });
    await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
    return server;
  }

  const noId = await dummyHealth(7881, { ok: true });
  try {
    await assert.rejects(
      waitForOwnership(7881, 'run-id-that-is-not-answering', { timeoutMs: 3000, intervalMs: 100 }),
      /testRunId/,
      'a 200 with no testRunId must be refused',
    );
  } finally {
    noId.close();
  }

  const wrongId = await dummyHealth(7882, { ok: true, testRunId: 'somebody-elses-run' });
  try {
    await assert.rejects(
      waitForOwnership(7882, 'run-id-that-is-not-answering', { timeoutMs: 3000, intervalMs: 100 }),
      /testRunId/,
      'a 200 with the wrong testRunId must be refused',
    );
  } finally {
    wrongId.close();
  }

  assert.deepEqual(
    rootEntries().filter((name) => name.includes('run-id-that-is-not-answering')),
    [],
    'the ownership check opens no database and creates no run folder',
  );
});

test('a run folder symlinked outside /tmp/apunta-v2/ is refused', async () => {
  const { ensureRunDir } = await import('./sandbox.mjs');

  mkdirSync(SANDBOX_ROOT, { recursive: true, mode: 0o700 });
  const outside = join(tmpdir(), 'apunta-v2-escape-target');
  mkdirSync(outside, { recursive: true });
  const link = join(SANDBOX_ROOT, 'selftest-escape-link');
  if (existsSync(link)) rmSync(link, { recursive: true, force: true });
  symlinkSync(outside, link);
  assert.equal(lstatSync(link).isSymbolicLink(), true, 'the fixture really is a symlink');
  try {
    assert.throws(() => ensureRunDir('selftest-escape-link'), /outside|escape|symlink/i);
  } finally {
    rmSync(link, { force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('APUNTA_DATA_DIR equal to the platform default is refused', async () => {
  const { platformDataDir } = await import('./sandbox.mjs');
  const def = platformDataDir(process.platform, process.env, tmpdir());

  const before = rootEntries();
  const result = runSandbox(['run', '--port', '7805', '--', ...PROBE], { APUNTA_DATA_DIR: def });
  assert.notEqual(result.status, 99, 'the child command must not run');
  assert.equal(result.status, 2, `expected refusal (exit 2), got: ${result.status}\n${result.stderr}`);
  assert.match(result.stderr, /platform default/, 'the refusal names the platform default');
  assert.deepEqual(rootEntries(), before, 'refused before any database was opened');
});

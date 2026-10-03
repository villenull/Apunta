#!/usr/bin/env node
/**
 * Tests for the command line `scripts/check-refine.mjs` grew (S3.3a).
 *
 * Hermetic by construction: no Apunta server, no model, no database and no
 * build. Two techniques, both deliberate. The exit-4 case mutates a transient
 * sibling copy of the script so a control cannot fire — a copy in the same
 * directory, because `root` is derived from `import.meta.url`, so it resolves
 * `server/dist/` and the fixture trees exactly as the original does; the copy is
 * deleted in a `finally`, and V5's two `test ! -e` guards are what make a
 * survivor visible. The exit-6 case runs a copy from a throwaway tree whose
 * fixture JSON cannot be parsed, which is how a set that cannot be enumerated is
 * reached without touching `e2e/fixtures/**`.
 *
 * Run: `APUNTA_CHECK_URL=http://127.0.0.1:1 node --test scripts/check-refine.test.mjs`
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(root, 'scripts', 'check-refine.mjs');
const mutated = join(root, 'scripts', 'check-refine.mutated.mjs');
const DEAD_URL = 'http://127.0.0.1:1';

/**
 * Asynchronous, because the network cases below run an in-process stub: a
 * synchronous spawn would block the event loop that stub is served from.
 */
function run(path, args, url = DEAD_URL) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path, ...args], {
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

async function blob(args) {
  const result = await run(script, ['--print-rules', ...args]);
  assert.equal(result.status, 0, `--print-rules ${args.join(' ')}: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

test('print-rules-is-hermetic: --print-rules exits 0 against a dead loopback URL, unbuilt', async () => {
  const result = await run(script, ['--print-rules']);
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotThrow(() => JSON.parse(result.stdout));
});

test('print-rules-does-not-reach-the-network: --print-rules asks an instance nothing', async () => {
  const seen = [];
  const server = createHttpServer((req, res) => {
    seen.push(`${req.method} ${req.url}`);
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end('{}');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const result = await run(script, ['--print-rules'], `http://127.0.0.1:${port}`);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(seen, [], 'a rules dump must not ask an instance anything');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('print-rules-shape: --print-rules emits the pinned keys with the pinned types', async () => {
  const dumped = await blob([]);
  assert.deepEqual(Object.keys(dumped), [
    'script',
    'locale',
    'sectionsByFixture',
    'headingPattern',
    'fixtureFilter',
    'wordCountSplit',
    'claimVerbs',
    'serverOpenings',
  ]);
  assert.equal(typeof dumped.script, 'string');
  assert.equal(typeof dumped.locale, 'string');
  assert.ok(
    dumped.sectionsByFixture !== null &&
      typeof dumped.sectionsByFixture === 'object' &&
      !Array.isArray(dumped.sectionsByFixture) &&
      Object.values(dumped.sectionsByFixture).every(
        (value) => Array.isArray(value) && value.every((name) => typeof name === 'string'),
      ),
  );
  for (const key of ['fixtureFilter', 'serverOpenings'])
    assert.ok(Array.isArray(dumped[key]) && dumped[key].every((n) => typeof n === 'string'));
  for (const key of ['headingPattern', 'wordCountSplit'])
    assert.deepEqual(Object.keys(dumped[key]).sort(), ['flags', 'source']);
  assert.ok(
    Array.isArray(dumped.claimVerbs) &&
      dumped.claimVerbs.every(
        (verb) => typeof verb.kind === 'string' && typeof verb.source === 'string' && 'flags' in verb,
      ),
  );
});

test('print-rules-shape: each pattern is the literal the rule function uses', async () => {
  const source = readFileSync(script, 'utf8');
  const dumped = await blob([]);
  const literal = (expression) => `/${expression.source}/${expression.flags}`;
  for (const expression of [dumped.headingPattern, dumped.wordCountSplit])
    assert.ok(source.includes(literal(expression)), `${expression.source} is not in the script`);
  for (const verb of dumped.claimVerbs)
    assert.ok(source.includes(literal(verb)), `${verb.source} is not in the script`);
  for (const opening of dumped.serverOpenings)
    assert.ok(source.includes(`'${opening}'`), `${opening} is not in the script`);
});

test('print-rules-is-locale-sensitive: --locale reaches the locale-varying keys', async () => {
  const en = await blob([]);
  const es = await blob(['--locale', 'es-MX']);
  assert.equal(en.locale, 'en');
  assert.equal(es.locale, 'es-MX');
  assert.deepEqual(Object.keys(es.sectionsByFixture), [], 'a tree with nothing in it is legal');
  assert.notDeepEqual(en.sectionsByFixture, es.sectionsByFixture);
  assert.deepEqual(en.fixtureFilter, es.fixtureFilter, 'the filter is a shared constant');
});

test('exits-5-on-a-locale-with-no-tree: --locale names a tree that is not here', async () => {
  const result = await run(script, ['--locale', 'es-MX']);
  assert.equal(result.status, 5, result.stdout);
  assert.match(result.stderr, /refine-es/);
  assert.match(result.stderr, /es-MX/);
});

test('exits-5-on-a-locale-with-no-controls: --self-test es-MX is not a vacuous 0', async () => {
  const result = await run(script, ['--self-test', '--locale', 'es-MX']);
  assert.equal(result.status, 5, result.stdout);
});

test('self-test-passes: --self-test runs the English controls and exits 0', async () => {
  const result = await run(script, ['--self-test', '--locale', 'en']);
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /sectionsOf/);
  assert.doesNotMatch(result.stdout, /MISS/);
});

test('exits-2-on-an-unknown-flag: an unknown flag is refused before any request', async () => {
  const result = await run(script, ['--bogus']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--bogus/);
});

test('refuses-an-unknown-only-id: --only names a scenario that is not in the tree', async () => {
  const withLocale = await run(script, ['--locale', 'en', '--only', 'nosuch-scenario-id']);
  assert.equal(withLocale.status, 2);
  assert.match(withLocale.stderr, /nosuch-scenario-id/);
  const withoutLocale = await run(script, ['--only', 'nosuch-scenario-id']);
  assert.equal(withoutLocale.status, 2, 'the refusal does not wait for a --locale');
  assert.match(withoutLocale.stderr, /nosuch-scenario-id/);
});

test('exits-4-on-a-missed-control: a control whose input cannot fire is 4', async () => {
  const original = readFileSync(script, 'utf8');
  const heading = 'Plan: Sleep hygiene review and a shorter wind-down.';
  assert.equal(original.split(heading).length - 1, 1, 'the pinned input is unique in the script');

  // The control itself first, so a 4 below is the mutation and not the script.
  const clean = await run(script, ['--self-test']);
  assert.equal(clean.status, 0, clean.stdout);

  try {
    writeFileSync(mutated, original.replace(heading, 'Planz: Sleep hygiene review and a shorter wind-down.'));
    const broken = await run(mutated, ['--self-test']);
    assert.equal(
      broken.status,
      4,
      `expected a missed control (exit 4), got ${broken.status}\n${broken.stdout}`,
    );
    assert.match(broken.stdout, /MISS sectionsOf/);
  } finally {
    rmSync(mutated, { force: true });
  }
});

test('exits-6-on-an-unenumerable-fixture: a tree that cannot be enumerated is 6, not 0', async () => {
  const tree = mkdtempSync(join(tmpdir(), 'apunta-v2-s33a-'));
  try {
    const scripts = join(tree, 'scripts');
    const fixtures = join(tree, 'e2e', 'fixtures', 'refine');
    mkdirSync(scripts, { recursive: true });
    mkdirSync(fixtures, { recursive: true });
    copyFileSync(script, join(scripts, 'check-refine.mjs'));
    writeFileSync(join(fixtures, 'scenarios.json'), '{ "sections": [ "Plan" ], "scenarios": [');
    writeFileSync(
      join(fixtures, 'owner-progress.json'),
      JSON.stringify({ sections: ['Plan'], scenarios: [{ id: 'anything' }] }),
    );

    const result = await run(join(scripts, 'check-refine.mjs'), ['--expect-scenarios', '1']);
    assert.equal(
      result.status,
      6,
      `expected an unenumerable set (exit 6), got ${result.status}\n${result.stderr}`,
    );
    assert.match(result.stderr, /scenarios\.json/, 'the refusal names the file it could not read');
  } finally {
    rmSync(tree, { force: true, recursive: true, maxRetries: 3 });
  }
});

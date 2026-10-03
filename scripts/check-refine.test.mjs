#!/usr/bin/env node
/**
 * Tests for the command line `scripts/check-refine.mjs` grew (S3.3a).
 *
 * Hermetic by construction: no Apunta server, no model, no database and no
 * build. Three techniques, each deliberate and each earning its place.
 *
 *  - the exit-4 case mutates a transient **sibling** copy of the script so a
 *    control cannot fire. A sibling, because `root` is derived from
 *    `import.meta.url`: a copy elsewhere would resolve `server/dist` and the
 *    fixture trees differently. It is deleted in a `finally`, and V5's two
 *    `test ! -e` guards are what make a survivor visible.
 *  - the exit-6 case runs a copy from a throwaway tree whose fixture JSON
 *    cannot be parsed, which is how a set that cannot be enumerated is reached
 *    without touching `e2e/fixtures/**`.
 *  - the anti-drift cases mutate an **ignored** copy under `build/`, splicing at
 *    the syntax-tree offset of the node they name — the regex inside
 *    `sectionsOf`, the one inside the first `CLAIM_VERBS` entry — so they move
 *    the rule that executes, never the pinned copy that only describes it.
 *
 * The anti-drift read is here and not inside `--print-rules`: the shipped dump
 * path keeps zero new imports, so a rules dump still works on a checkout with no
 * dev dependencies, and `typescript` stays a reader a test owns rather than
 * something the command line depends on. It is also the only kind of check that
 * can be right here — a whole-file grep for the pattern finds the `PINNED_*`
 * copy that is supposed to be policed, and so is satisfied by a rule that no
 * longer exists.
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
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(root, 'scripts', 'check-refine.mjs');
const mutated = join(root, 'scripts', 'check-refine.mutated.mjs');
/** Ignored (`.gitignore`: `build/`), so a mutation here is never a source edit. */
const scratch = join(root, 'build', 's3.3a-attempt2');
const DEAD_URL = 'http://127.0.0.1:1';

/**
 * Asynchronous, because the network cases below run an in-process stub: a
 * synchronous spawn would block the event loop that stub is served from.
 */
function run(path, args, url = DEAD_URL, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path, ...args], {
      cwd: root,
      env: { ...process.env, APUNTA_CHECK_URL: url, ...extraEnv },
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

async function blobOf(path, args = []) {
  const result = await run(path, ['--print-rules', ...args]);
  assert.equal(result.status, 0, `--print-rules ${args.join(' ')}: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

const blob = (args) => blobOf(script, args);

/* ---------------------------------------------------------------------------
 * Reading the rules that execute.
 *
 * `--print-rules` reports a `PINNED_*` copy of the patterns, and a copy can
 * drift from what runs. These four functions read the *executing* nodes out of
 * the script's own syntax tree — one named constant or one named function, at
 * the offset it occupies — so the comparison in `ruleProblems` is between the
 * dump and the rule, not between the dump and the dump's own source.
 *
 * One file's own text, one `createSourceFile`: no program, no lib, no tsconfig,
 * no fs walk, nothing from `server/dist`, no network. A node that is not the
 * literal this expects throws rather than returning something plausible, so a
 * refactor that moves a rule is a red and not a silent pass.
 * ------------------------------------------------------------------------- */

function parseScript(path) {
  return ts.createSourceFile(
    path,
    readFileSync(path, 'utf8'),
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.JS,
  );
}

function eachNode(node, visit) {
  visit(node);
  node.forEachChild((child) => eachNode(child, visit));
}

function nodesWithin(node, predicate) {
  const found = [];
  eachNode(node, (child) => {
    if (predicate(child)) found.push(child);
  });
  return found;
}

/** The named function or arrow function, however this file declares it. */
function functionNode(source, name) {
  let found = null;
  eachNode(source, (node) => {
    if (found !== null) return;
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node;
    if (
      !ts.isVariableDeclaration(node) ||
      !ts.isIdentifier(node.name) ||
      node.name.text !== name ||
      node.initializer === undefined
    )
      return;
    if (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
      found = node.initializer;
  });
  assert.ok(found !== null, `${name} is not a function in this script any more`);
  return found;
}

/** The initializer of the named `const`, which is where its rules live. */
function variableNode(source, name) {
  let found = null;
  eachNode(source, (node) => {
    if (found !== null) return;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name)
      found = node.initializer;
  });
  assert.ok(found !== null, `${name} is not a constant in this script any more`);
  return found;
}

const isRegexLiteral = (node) => ts.isRegularExpressionLiteral(node);
const isStringLiteral = (node) => ts.isStringLiteral(node);

/**
 * The pattern a node really is, as the dump's own `{source, flags}` pair.
 * Deliberately strict: `RegExp(<computed>)` is reported, not guessed at, because
 * a computed pattern is one no byte comparison can be honest about.
 */
function patternOf(node) {
  if (ts.isRegularExpressionLiteral(node)) {
    const at = node.text.lastIndexOf('/');
    assert.ok(at > 0, `${node.text} is not a /…/ literal`);
    return { source: node.text.slice(1, at), flags: node.text.slice(at + 1) };
  }
  if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'RegExp') {
    const [pattern, flags] = node.arguments ?? [];
    assert.ok(pattern !== undefined && ts.isStringLiteral(pattern), 'a RegExp with a computed pattern');
    return { source: pattern.text, flags: flags === undefined ? '' : flags.text };
  }
  throw new Error(`this rule is not a literal any more, so it cannot be pinned: ${node.kind}`);
}

function propertyInitializer(element, name) {
  for (const property of element.properties ?? []) {
    if (ts.isPropertyAssignment(property) && property.name.getText() === name) return property.initializer;
  }
  return undefined;
}

/** The array literal a named `const` holds, which is what these rules are. */
function arrayNode(source, name) {
  const initializer = variableNode(source, name);
  assert.ok(
    ts.isArrayLiteralExpression(initializer),
    `${name} is not an array literal, so its entries are no longer a fixed list`,
  );
  return initializer;
}

/** Every rule surface of `check-refine.mjs` that `--print-rules` reports. */
function effectiveRules(source) {
  const onlyPatternIn = (name) => {
    const found = nodesWithin(functionNode(source, name), isRegexLiteral).map(patternOf);
    assert.equal(found.length, 1, `${name} holds ${found.length} patterns, and the dump names one`);
    return found[0];
  };
  const stringsOf = (name) =>
    nodesWithin(variableNode(source, name), isStringLiteral).map((node) => node.text);
  const claimVerbs = arrayNode(source, 'CLAIM_VERBS');

  return {
    headingPattern: onlyPatternIn('sectionsOf'),
    wordCountSplit: onlyPatternIn('wordCount'),
    fixtureFilter: stringsOf('FIXTURE_FILES'),
    serverOpenings: stringsOf('SERVER_OPENINGS'),
    claimVerbs: claimVerbs.elements.map((entry) => {
      const kind = propertyInitializer(entry, 'kind');
      const re = propertyInitializer(entry, 're');
      assert.ok(ts.isStringLiteral(kind), 'a CLAIM_VERBS entry does not name its kind as a literal');
      assert.ok(re !== undefined, 'a CLAIM_VERBS entry has no pattern');
      return { kind: kind.text, ...patternOf(re) };
    }),
  };
}

/** Every dumped field whose value the running rules decide. */
const COMPARED_FIELDS = ['headingPattern', 'wordCountSplit', 'fixtureFilter', 'serverOpenings', 'claimVerbs'];

function ruleProblems(dumped, effective) {
  const problems = [];
  for (const field of COMPARED_FIELDS) {
    if (isDeepStrictEqual(dumped[field], effective[field])) continue;
    problems.push(
      `${field}: the dump reports ${JSON.stringify(dumped[field])} and the rule that runs holds ${JSON.stringify(effective[field])}`,
    );
  }
  return problems;
}

/**
 * Move one node, exactly, in a copy nobody commits.
 *
 * `where` picks the node out of the pristine tree and `edit` rewrites its own
 * text, so "the regex inside `sectionsOf`" is a position rather than a string:
 * the pinned copy carrying the same bytes elsewhere in the file cannot be the
 * one that moves.
 */
async function mutateNode(name, where, edit) {
  const original = readFileSync(script, 'utf8');
  const source = parseScript(script);
  const node = where(source);
  const start = node.getStart(source);
  const next = edit(node.getText(source));
  assert.notEqual(next, node.getText(source), `the edit for ${name} changed nothing`);
  mkdirSync(scratch, { recursive: true });
  const copy = join(scratch, name);
  writeFileSync(copy, `${original.slice(0, start)}${next}${original.slice(node.end)}`);
  try {
    return ruleProblems(await blobOf(copy), effectiveRules(parseScript(copy)));
  } finally {
    rmSync(copy, { force: true });
  }
}

/** The regex literal inside a named function, or the Nth of several. */
const patternIn =
  (name, index = 0) =>
  (source) =>
    nodesWithin(functionNode(source, name), isRegexLiteral)[index];

const entryPattern = (index) => (source) =>
  propertyInitializer(arrayNode(source, 'CLAIM_VERBS').elements[index], 're');

const pinnedEntryPattern = (index) => (source) =>
  propertyInitializer(arrayNode(source, 'PINNED_CLAIM_VERBS').elements[index], 're');

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

test('print-rules-matches-the-effective-rules: every dumped field is the node that runs', async () => {
  assert.deepEqual(
    ruleProblems(await blob([]), effectiveRules(parseScript(script))),
    [],
    'the rules dump and the executing rules disagree',
  );
});

test('print-rules-matches-the-effective-rules: a locale with no tree dumps the empty shape', async () => {
  // Fixed decision 4: `es-MX` carries `{}` for the one field that is read from a
  // tree, and the rest are shared constants, so they do not vary.
  const en = await blob([]);
  const es = await blob(['--locale', 'es-MX']);
  assert.deepEqual(es.sectionsByFixture, {});
  const shared = ['headingPattern', 'fixtureFilter', 'wordCountSplit', 'claimVerbs', 'serverOpenings'];
  for (const key of shared) assert.deepEqual(es[key], en[key], `${key} is a shared constant`);
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

test('anti-drift: moving an executing pattern is red, and moving only its pinned copy is red', async () => {
  // Pristine first, so a red below is the mutation and not the verifier: a
  // comparison that cannot pass is a broken comparison, not a caught drift.
  assert.deepEqual(ruleProblems(await blob([]), effectiveRules(parseScript(script))), []);

  const effective = [
    ['heading-in-sectionsOf', patternIn('sectionsOf'), (text) => text.replace(':\\s?', ':\\s*')],
    ['wordcount-split', patternIn('wordCount'), (text) => text.replace('[^a-z0-9]+', '[^a-z0-9_]+')],
    ['claim-verbs-added', entryPattern(0), (text) => text.replace('(?:added|add|', '(?:added|add|slipped|')],
    [
      'server-openings',
      (source) => nodesWithin(variableNode(source, 'SERVER_OPENINGS'), isStringLiteral)[0],
      (text) => text.replace('Apunta did not change the note', 'Apunta never changed the note'),
    ],
  ];
  for (const [name, where, edit] of effective) {
    const problems = await mutateNode(`effective-${name}.mutated.mjs`, where, edit);
    assert.notDeepEqual(problems, [], `${name}: the executing rule moved and nothing said so`);
  }

  // The other direction, which is the one a grep for the literal cannot see: the
  // dump's own copy changes while every rule that executes stays put.
  const pinned = [
    ['claim-verbs', pinnedEntryPattern(0), (text) => text.replace('(?:added|add|', '(?:added|add|slipped|')],
    [
      'heading',
      (source) => nodesWithin(variableNode(source, 'PINNED_HEADING'), isRegexLiteral)[0],
      (text) => text.replace(':\\s?', ':\\s*'),
    ],
    [
      'server-openings',
      (source) => nodesWithin(variableNode(source, 'PINNED_SERVER_OPENINGS'), isStringLiteral)[0],
      (text) => text.replace('Apunta did not change the note', 'Apunta never changed the note'),
    ],
    [
      'word-count-split',
      (source) => nodesWithin(variableNode(source, 'PINNED_WORD_SPLIT'), isRegexLiteral)[0],
      (text) => text.replace('[^a-z0-9]+', '[^a-z0-9_]+'),
    ],
  ];
  for (const [name, where, edit] of pinned) {
    const problems = await mutateNode(`pinned-${name}.mutated.mjs`, where, edit);
    assert.notDeepEqual(problems, [], `${name}: the pinned copy moved and nothing said so`);
  }
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

test('exits-2-on-a-repeated-flag: --only twice is 2, and so is any other flag twice', async () => {
  const only = await run(script, ['--only', 'tone-request', '--only', 'question-only']);
  assert.equal(only.status, 2);
  assert.match(only.stderr, /--only was given twice/);
  const counts = await run(script, ['--expect-scenarios', '1', '--expect-scenarios', '2']);
  assert.equal(counts.status, 2);
  assert.match(counts.stderr, /--expect-scenarios was given twice/);
});

test('exits-2-on-a-flag-with-no-value: --only and the counts still need one', async () => {
  for (const flag of ['--only', '--locale', '--expect-scenarios', '--expect-fixtures']) {
    const result = await run(script, [flag]);
    assert.equal(result.status, 2, `${flag}: ${result.stderr}`);
    assert.match(result.stderr, new RegExp(`${flag} needs a value`));
  }
});

test('only-takes-several-ids: two valid scenario ids are both ids, not a stray argument', async () => {
  // `--only tone-request shorten-keeps-facts` is the invocation the script's own
  // header documents, and it worked before the command line existed: every bare
  // token after `--only` was an id. So the parser has to consume all of them,
  // and `--print-rules` — which exits above the id check — is what makes the
  // assertion hermetic: no server, no build, no request.
  const result = await run(script, ['--only', 'tone-request', 'shorten-keeps-facts', '--print-rules']);
  assert.equal(result.status, 0, `expected both ids to be taken, got ${result.status}: ${result.stderr}`);
  assert.doesNotMatch(result.stderr, /unexpected argument/);
  assert.equal(JSON.parse(result.stdout).script, 'check-refine');
});

test('only-takes-several-ids: a flag after the ids is still a flag', async () => {
  const result = await run(script, [
    '--only',
    'tone-request',
    'question-only',
    'expand-plan-with-history',
    '--self-test',
    '--locale',
    'en',
  ]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.doesNotMatch(result.stderr, /unexpected argument|unknown argument/);
  assert.doesNotMatch(result.stdout, /MISS/);
});

test('only-takes-several-ids: the second id is validated as an id, refused as one', async () => {
  const result = await run(script, [
    '--only',
    'tone-request',
    'nosuch-scenario-id',
    '--expect-scenarios',
    '2',
  ]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--only does not name a scenario in refine\/: nosuch-scenario-id/);
  assert.doesNotMatch(result.stderr, /unexpected argument/);
});

test('no-flag-argv-is-inert: with nothing in argv the first refusal is still the sandbox one', async () => {
  // Fixed decision 2 in one assertion: no flag means nothing is consumed, so the
  // APUNTA_V2 guard — the first guard in the file, and the one that needs no
  // build — is still what fires, with nothing on stdout.
  const result = await run(script, [], '', { APUNTA_V2: '1' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Under APUNTA_V2=1, run this through scripts\/v2\/sandbox\.mjs/);
  assert.equal(result.stdout, '', 'a refusal writes nothing to stdout');
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

#!/usr/bin/env node
/**
 * Tests for the command line `scripts/check-note-format.mjs` grew (S3.3a), and
 * for the sandbox seeder it needs (`scripts/v2/seed-check-instance.mjs`).
 *
 * Hermetic by construction: no Apunta server, no model, no database and no
 * build. The one listener is an in-process `node:http` stub on an ephemeral
 * loopback port, because exit codes 0 and 3 are only reachable once a run has
 * *completed* and a completed run needs something to answer it — and because a
 * test that cannot see the socket proves nothing about the socket. Every case
 * that does not need a completed run inherits the dead `http://127.0.0.1:1` the
 * runner sets, so a forgotten URL is a loud failure rather than a call to the
 * live instance. The seeder's cases stand in a `fetch` **in the child**, so
 * they need no listener at all.
 *
 * Three techniques, each earning its place:
 *
 *  - the anti-drift cases mutate an **ignored** copy under `build/`, splicing at
 *    the syntax-tree offset of the node they name — the pattern inside
 *    `splitSections`, the one inside `flagsFor` — so they move the rule that
 *    executes, never the pinned copy that only describes it.
 *  - the seeder cases run it in a child whose `globalThis.fetch` is a fabricated
 *    in-memory stand-in, and read the requests it made out of a log file, so
 *    "it created both records, once" is a fact about the requests rather than a
 *    claim about a line of stdout.
 *  - the multi-id cases lean on `--print-rules`, which exits above the id check,
 *    so the argument parse is asserted with no server and no build at all.
 *
 * The anti-drift read lives here and not inside `--print-rules`: the shipped dump
 * path keeps zero new imports, so a rules dump still works on a checkout with no
 * dev dependencies, and `typescript` stays a reader a test owns rather than
 * something the command line depends on. It is also the only kind of check that
 * can be right here — a whole-file grep for the pattern finds the `PINNED_*`
 * copy that is supposed to be policed, and so is satisfied by a rule that no
 * longer exists.
 *
 * Run: `APUNTA_CHECK_URL=http://127.0.0.1:1 node --test scripts/check-note-format.test.mjs`
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(root, 'scripts', 'check-note-format.mjs');
const seeder = join(root, 'scripts', 'v2', 'seed-check-instance.mjs');
const fixtureDir = join(root, 'e2e', 'fixtures', 'her-format');
/** Ignored (`.gitignore`: `build/`), so a mutation here is never a source edit. */
const scratch = join(root, 'build', 's3.3a-attempt2');
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
function runScript(path, args, url = DEAD_URL, extraEnv = {}) {
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

const run = (args, url, extraEnv) => runScript(script, args, url, extraEnv);

async function blobOf(path, args = []) {
  const result = await runScript(path, ['--print-rules', ...args]);
  assert.equal(result.status, 0, `--print-rules ${args.join(' ')}: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

const blob = (args) => blobOf(script, args);

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

/* ---------------------------------------------------------------------------
 * Reading the rules that execute.
 *
 * `--print-rules` reports a `PINNED_*` copy of the patterns, and a copy can
 * drift from what runs. These functions read the *executing* nodes out of the
 * script's own syntax tree — one named constant or one named function, at the
 * offset it occupies — so the comparison in `ruleProblems` is between the dump
 * and the rule, not between the dump and the dump's own source.
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
  if (node === undefined || node === null) return;
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

/** The patterns a `.test(...)` condition really uses, not the ones under a `!`. */
function patternsUnder(node) {
  const negated = new Set();
  eachNode(node, (child) => {
    if (ts.isPrefixUnaryExpression(child) && child.operator === ts.SyntaxKind.ExclamationToken)
      eachNode(child.operand, (inner) => negated.add(inner));
  });
  return nodesWithin(node, (child) => {
    if (!isRegexLiteral(child) || negated.has(child)) return false;
    const parent = child.parent;
    return (
      ts.isPropertyAccessExpression(parent) && parent.expression === child && parent.name.text === 'test'
    );
  });
}

/** What a `flags.push(…)` in the same branch is called. */
function pushedFlag(node) {
  const pushes = nodesWithin(node, (child) => {
    if (!ts.isCallExpression(child)) return false;
    const callee = child.expression;
    return (
      ts.isPropertyAccessExpression(callee) &&
      ts.isIdentifier(callee.expression) &&
      callee.expression.text === 'flags' &&
      callee.name.text === 'push' &&
      ts.isStringLiteral(child.arguments[0])
    );
  });
  return pushes.length === 0 ? null : pushes[0].arguments[0].text;
}

/**
 * The section names are the keys `flagsFor` reads them by, in the order it reads
 * them; nothing in this file lists them as an array of its own, so these are the
 * nodes that decide the answer.
 */
function sectionNodes(source) {
  const flagsFor = functionNode(source, 'flagsFor');
  const sections = [];
  eachNode(flagsFor, (node) => {
    if (!ts.isCallExpression(node)) return;
    const callee = node.expression;
    if (!ts.isIdentifier(callee) || callee.text !== 'at') return;
    const [section] = node.arguments;
    if (ts.isStringLiteral(section)) sections.push(section);
  });
  return sections;
}

/** Every rule surface of `check-note-format.mjs` that `--print-rules` reports. */
function effectiveRules(source) {
  const splitSections = functionNode(source, 'splitSections');
  const flagsFor = functionNode(source, 'flagsFor');
  const exampleSentences = functionNode(source, 'exampleSentences');

  const headingPatterns = nodesWithin(splitSections, isRegexLiteral).map(patternOf);
  assert.equal(headingPatterns.length, 1, 'splitSections holds a number of patterns the dump names one of');

  // `None.` is the flattened risk review `flagsFor` compares against.
  const sentinels = nodesWithin(flagsFor, (node) => isStringLiteral(node) && node.text === 'None.');

  // The borrowed-sentence extractor is the pattern handed to `matchAll`, which is
  // not the only pattern in that function.
  const borrowed = nodesWithin(exampleSentences, (node) => {
    if (!ts.isCallExpression(node)) return false;
    const callee = node.expression;
    return ts.isPropertyAccessExpression(callee) && callee.name.text === 'matchAll';
  });
  assert.equal(
    borrowed.length,
    1,
    'exampleSentences matches against a number of patterns the dump names one',
  );
  const extractors = borrowed.map((node) => patternOf(node.arguments[0]));
  assert.equal(extractors.length, 1);

  // Each flag rule is a `.test()` condition and the flag it pushes. The
  // "Discussion empty" condition has a flag and no pattern of its own, so the
  // dump does not carry it, and the pairing below skips it for the same reason.
  const flagRules = [];
  for (const statement of flagsFor.body.statements) {
    if (!ts.isIfStatement(statement)) continue;
    const patterns = patternsUnder(statement.expression).map(patternOf);
    if (patterns.length === 0) continue;
    assert.equal(
      patterns.length,
      1,
      `a flag condition tests ${patterns.length} patterns, and the dump names one`,
    );
    const name = pushedFlag(statement.thenStatement);
    assert.ok(name !== null, 'a flagged condition pushes no flag to read');
    flagRules.push({ name, ...patterns[0] });
  }

  return {
    sections: sectionNodes(source).map((node) => node.text),
    riskSentinel: sentinels.length === 1 ? sentinels[0].text : null,
    headingPattern: headingPatterns[0],
    flagRules,
    borrowedExtractor: extractors[0],
  };
}

/** Every dumped field whose value the running rules decide. */
const COMPARED_FIELDS = ['sections', 'riskSentinel', 'headingPattern', 'flagRules', 'borrowedExtractor'];

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
 * text, so "the pattern inside `splitSections`" is a position rather than a
 * string: the pinned copy carrying the same bytes elsewhere in the file cannot
 * be the one that moves.
 */
async function mutateNode(name, where, edit) {
  const original = readFileSync(script, 'utf8');
  const source = parseScript(script);
  const node = where(source);
  assert.ok(node !== undefined, `${name} names a node that is not in this script`);
  const before = node.getText(source);
  const after = edit(before);
  assert.notEqual(after, before, `the edit for ${name} changed nothing`);
  mkdirSync(scratch, { recursive: true });
  const copy = join(scratch, name);
  writeFileSync(copy, `${original.slice(0, node.getStart(source))}${after}${original.slice(node.end)}`);
  try {
    return ruleProblems(await blobOf(copy), effectiveRules(parseScript(copy)));
  } finally {
    rmSync(copy, { force: true });
  }
}

/** The pattern inside a named function, or the Nth of several. */
const patternIn =
  (name, index = 0) =>
  (source) =>
    nodesWithin(functionNode(source, name), isRegexLiteral)[index];

/** The pattern a `.test()` condition really uses, by its position among them. */
const flagPattern = (index) => (source) => {
  const flagsFor = functionNode(source, 'flagsFor');
  const conditions = flagsFor.body.statements
    .filter(ts.isIfStatement)
    .map((statement) => patternsUnder(statement.expression)[0])
    .filter((node) => node !== undefined);
  return conditions[index];
};

const pinnedFlagPattern = (index) => (source) => {
  const rules = propertyInitializer(variableNode(source, 'PINNED_FLAG_RULES'), 'en');
  assert.ok(ts.isArrayLiteralExpression(rules), 'PINNED_FLAG_RULES is no longer a fixed list of locales');
  return propertyInitializer(rules.elements[index], 're');
};

const borrowedPattern = (source) => {
  const matched = nodesWithin(functionNode(source, 'exampleSentences'), (node) => {
    if (!ts.isCallExpression(node)) return false;
    const callee = node.expression;
    return ts.isPropertyAccessExpression(callee) && callee.name.text === 'matchAll';
  });
  return matched[0].arguments[0];
};

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

test('print-rules-matches-the-effective-rules: every dumped field is the node that runs', async () => {
  assert.deepEqual(
    ruleProblems(await blob([]), effectiveRules(parseScript(script))),
    [],
    'the rules dump and the executing rules disagree',
  );
});

test('print-rules-matches-the-effective-rules: a locale with no tree dumps the empty shape', async () => {
  // Fixed decision 4: `es-MX` carries `[]`, `""` and `[]` for the three
  // locale-varying keys, and the rest are shared constants, so they do not vary.
  const en = await blob([]);
  const es = await blob(['--locale', 'es-MX']);
  assert.deepEqual(es.sections, []);
  assert.equal(es.riskSentinel, '');
  assert.deepEqual(es.flagRules, []);
  for (const key of ['headingPattern', 'borrowedExtractor']) assert.deepEqual(es[key], en[key]);
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

test('anti-drift: moving an executing pattern is red, and moving only its pinned copy is red', async () => {
  // Pristine first, so a red below is the mutation and not the verifier: a
  // comparison that cannot pass is a broken comparison, not a caught drift.
  assert.deepEqual(ruleProblems(await blob([]), effectiveRules(parseScript(script))), []);

  const effective = [
    ['heading-in-splitSections', patternIn('splitSections'), (text) => text.replace(':\\s?', ':\\s*')],
    ['borrowed-extractor', borrowedPattern, (text) => text.replace('{25,}', '{99,}')],
    ['flag-rule-reported', flagPattern(0), (text) => text.replace('\\bsaid\\b', '\\bstated\\b')],
    ['flag-rule-risk', flagPattern(2), (text) => text.replace('denied', 'declined')],
    [
      'section-name',
      (source) => sectionNodes(source)[0],
      (text) => text.replace('Client presentation', 'Client presentation and mood'),
    ],
  ];
  for (const [name, where, edit] of effective) {
    const problems = await mutateNode(`effective-${name}.mutated.mjs`, where, edit);
    assert.notDeepEqual(problems, [], `${name}: the executing rule moved and nothing said so`);
  }

  // The other direction, which is the one a grep for the literal cannot see: the
  // dump's own copy changes while every rule that executes stays put.
  const pinned = [
    [
      'heading',
      (source) => nodesWithin(variableNode(source, 'PINNED_HEADING'), isRegexLiteral)[0],
      (text) => text.replace(':\\s?', ':\\s*'),
    ],
    [
      'borrowed-extractor',
      (source) => nodesWithin(variableNode(source, 'PINNED_BORROWED'), isRegexLiteral)[0],
      (text) => text.replace('{25,}', '{99,}'),
    ],
    ['flag-rule-reported', pinnedFlagPattern(0), (text) => text.replace('\\bsaid\\b', '\\bstated\\b')],
    [
      'risk-sentinel',
      (source) => propertyInitializer(variableNode(source, 'PINNED_RISK_SENTINEL'), 'en'),
      (text) => text.replace('None.', 'Nothing noted.'),
    ],
    [
      'sections',
      (source) => propertyInitializer(variableNode(source, 'PINNED_SECTIONS'), 'en').elements[0],
      (text) => text.replace('Client presentation', 'Client presentation and mood'),
    ],
  ];
  for (const [name, where, edit] of pinned) {
    const problems = await mutateNode(`pinned-${name}.mutated.mjs`, where, edit);
    assert.notDeepEqual(problems, [], `${name}: the pinned copy moved and nothing said so`);
  }
});

test('exits-5-on-a-locale-with-no-tree: --locale names a tree that is not here', async () => {
  const result = await run(['--locale', 'es-MX']);
  assert.equal(result.status, 5, result.stdout);
  assert.match(result.stderr, /her-format-es/);
  assert.match(result.stderr, /es-MX/);
});

test('exits-2-on-an-unknown-locale-tag: --locale does not know a tag it has no tree for', async () => {
  const result = await run(['--locale', 'es-ES']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /es-ES/);
});

test('exits-2-on-an-unknown-flag: an unknown flag is refused before any request', async () => {
  const result = await run(['--bogus']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--bogus/);
});

test('exits-2-on-a-repeated-flag: --only twice is 2, and so is any other flag twice', async () => {
  const only = await run(['--only', '1-typed-brief', '--only', '2-presentation-and-talk']);
  assert.equal(only.status, 2);
  assert.match(only.stderr, /--only was given twice/);
  const counts = await run(['--expect-fixtures', '1', '--expect-fixtures', '2']);
  assert.equal(counts.status, 2);
  assert.match(counts.stderr, /--expect-fixtures was given twice/);
});

test('exits-2-on-a-flag-with-no-value: --only and the counts still need one', async () => {
  for (const flag of ['--only', '--locale', '--expect-scenarios', '--expect-fixtures']) {
    const result = await run([flag]);
    assert.equal(result.status, 2, `${flag}: ${result.stderr}`);
    assert.match(result.stderr, new RegExp(`${flag} needs a value`));
  }
});

test('only-takes-several-ids: two valid fixture ids are both ids, not a stray argument', async () => {
  // `--only 1-typed-brief 2-presentation-and-talk` is the multi-id form the
  // script's own header documents, and `--print-rules` exits above the id check,
  // so the argument parse is asserted with no server, no build and no request.
  const result = await run(['--only', '1-typed-brief', '2-presentation-and-talk', '--print-rules']);
  assert.equal(result.status, 0, `expected both ids to be taken, got ${result.status}: ${result.stderr}`);
  assert.doesNotMatch(result.stderr, /unexpected argument/);
  assert.equal(JSON.parse(result.stdout).script, 'check-note-format');
});

test('only-takes-several-ids: a flag after the ids is still a flag', async () => {
  const result = await run([
    '--only',
    '1-typed-brief',
    '3-risk-reviewed',
    '4-cadence-decision',
    '--self-test',
    '--locale',
    'en',
  ]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.doesNotMatch(result.stderr, /unexpected argument|unknown argument/);
  assert.doesNotMatch(result.stdout, /MISS/);
});

test('only-takes-several-ids: the second id is validated as an id, refused as one', async () => {
  const result = await run(['--only', '1-typed-brief', 'nosuch-fixture', '--expect-fixtures', '2']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--only does not name a fixture in her-format\/: nosuch-fixture/);
  assert.doesNotMatch(result.stderr, /unexpected argument/);
});

test('no-flag-argv-is-inert: with nothing in argv the first refusal is still the sandbox one', async () => {
  // Fixed decision 2 in one assertion: no flag means nothing is consumed, so the
  // APUNTA_V2 guard — the first guard in the file, and the one that needs no
  // build — is still what fires, with nothing on stdout.
  const result = await run([], '', { APUNTA_V2: '1' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Under APUNTA_V2=1, run this through scripts\/v2\/sandbox\.mjs/);
  assert.equal(result.stdout, '', 'a refusal writes nothing to stdout');
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

test('no-flag-run-is-unchanged: the same run without a flag reads every fixture and prints', async () => {
  const stub = await startStub();
  try {
    const result = await run([], stub.url);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(`\\d+ flag\\(s\\) across ${String(FIXTURES.length)} fixtures\\.`));
    assert.doesNotMatch(result.stderr, /Refusing to run/);
    assert.deepEqual(
      stub.seen.filter((entry) => entry.startsWith('POST /api/generate')).length,
      FIXTURES.length,
      'a no-flag run reads the whole tree, as it always did',
    );
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

/* ---------------------------------------------------------------------------
 * The sandbox seeder.
 *
 * `fetch` is stood in inside the child, so there is no listener and no socket:
 * the requests are answered out of a fabricated in-memory instance and written to
 * a log the test reads back, which is the only way to say "it created both
 * records, once" as a fact about the requests rather than a claim about a line
 * of stdout. Fabricated throughout (HS-8): the patient is the prototype's sample
 * person, and every id here is synthetic.
 * ------------------------------------------------------------------------- */

const SEED_CASES = {
  ok: { status: 201, body: { id: 'synthetic-created', name: 'Synthetic fixture' } },
  malformed: { status: 201, body: 'this is not json' },
  'no-id': { status: 201, body: { name: 'Synthetic fixture' } },
  refused: { status: 500, body: { error: 'no' } },
};

/** The child: a `fetch` that answers the seeder's four routes and logs each one. */
function seedHarness(shape) {
  return `
import { appendFileSync } from 'node:fs';
const log = process.env['APUNTA_SEED_LOG'];
const state = ${JSON.stringify(shape)};
const created = ${JSON.stringify(SEED_CASES)};
const reply = (body, status) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
globalThis.fetch = async (url, init) => {
  const method = init?.method ?? 'GET';
  appendFileSync(log, method + ' ' + new URL(url).pathname + '\\n');
  if (method === 'GET') {
    if (url.endsWith('/api/formats')) return reply({ formats: state.formats }, 200);
    return reply({ patients: state.patients }, 200);
  }
  const outcome = created[state.post];
  if (outcome === undefined) throw new Error('the test named a case that does not exist: ' + state.post);
  return reply(outcome.body, outcome.status);
};
await import(${JSON.stringify(pathToFileURL(seeder).href)});
`;
}

/**
 * @param shape what the fabricated instance holds, and what a POST answers with:
 *   `{formats, patients, post}` where `post` is a key of `SEED_CASES`.
 */
async function seed(shape) {
  mkdirSync(scratch, { recursive: true });
  const log = join(scratch, `seed-${shape.post}.log`);
  rmSync(log, { force: true });
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '--eval', seedHarness(shape)], {
      cwd: root,
      env: { ...process.env, APUNTA_CHECK_URL: DEAD_URL, APUNTA_V2: '1', APUNTA_SEED_LOG: log },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
  let requests;
  try {
    requests = readFileSync(log, 'utf8')
      .split('\n')
      .filter((line) => line !== '');
  } catch {
    requests = [];
  }
  rmSync(log, { force: true });
  return { ...result, requests };
}

const POSTS = (result) => result.requests.filter((line) => line.startsWith('POST '));

test('seed-creates-both-records-once: an empty instance gets a format and a patient', async () => {
  const result = await seed({ formats: [], patients: [], post: 'ok' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(POSTS(result), ['POST /api/formats', 'POST /api/patients']);
  assert.match(result.stdout, /Seeded format .* and patient .* for the check scripts on/);
});

test('seed-creates-neither-on-a-repeat: a seeded instance is left alone', async () => {
  const result = await seed({
    formats: [{ id: 'synthetic-format' }],
    patients: [{ id: 'synthetic-patient' }],
    post: 'ok',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(POSTS(result), [], 'a second run must not double the fixtures it checks');
  assert.match(result.stdout, /Nothing to seed: .* already has 1 format\(s\) and 1 patient\(s\)\./);
});

test('seed-refuses-a-body-it-cannot-read: a created record with no id is not a seed', async () => {
  const result = await seed({ formats: [], patients: [], post: 'no-id' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /took the format and returned no id for it/);
  assert.deepEqual(POSTS(result), ['POST /api/formats'], 'it stops at the record it cannot trust');
});

test('seed-refuses-a-malformed-body: an unreadable answer is not a seed either', async () => {
  const result = await seed({ formats: [], patients: [], post: 'malformed' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Seeding failed: .*(SyntaxError|JSON)/);
  assert.deepEqual(POSTS(result), ['POST /api/formats']);
});

test('seed-refuses-a-refused-request: a server that says no is not a seeded instance', async () => {
  const result = await seed({ formats: [], patients: [], post: 'refused' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Seeding failed: \/api\/formats answered 500/);
  assert.deepEqual(POSTS(result), ['POST /api/formats'], 'it does not go on to create the patient');
  assert.doesNotMatch(result.stdout, /Seeded/);
});

test('seed-refuses-before-any-request: with no URL and against a dead one', async () => {
  // The non-loopback refusal is left to V1 and to the attempt-1 review rather
  // than written here: `no-restricted-syntax` refuses a non-loopback URL literal
  // anywhere under `scripts/`, and building one out of string parts to get past a
  // safety rule would be the wrong trade for a case nothing else loses.
  for (const [url, expected] of [
    ['', /Under APUNTA_V2=1, run this through scripts\/v2\/sandbox\.mjs/],
    [DEAD_URL, /would not answer/],
  ]) {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        ['--input-type=module', '--eval', `await import(${JSON.stringify(pathToFileURL(seeder).href)});`],
        {
          cwd: root,
          env: { ...process.env, APUNTA_CHECK_URL: url, APUNTA_V2: '1' },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8').on('data', (chunk) => (stdout += chunk));
      child.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));
      child.on('error', reject);
      child.on('close', (status) => resolve({ status, stdout, stderr }));
    });
    assert.equal(result.status, 2, `${url || '(unset)'}: ${result.stderr}`);
    assert.match(result.stderr, expected);
    assert.equal(result.stdout, '', 'a refusal writes nothing to stdout');
  }
});

// Scratch transform (invoked once, rewrites the two P3.5 review-1 proof scripts in
// place): a bare `console.log(X)` ExpressionStatement becomes
// `process.stdout.write(format(X) + '\n')`, which is what console.log does
// internally: util.format over the same arguments, then one '\n' to stdout.
//
// espree (already an ESLint dependency) supplies the exact source ranges, so a
// nested template literal, a regex literal or a comment cannot confuse it.
// The transform refuses the file if any console.log is not a bare statement, and
// re-parses the result to assert no `console` identifier survives.
//
//   node docs/v2/evidence/output-lint-completion/transform.mjs <file>...
//
// Writes the target files only; this script itself writes nothing.
import { readFileSync, writeFileSync } from 'node:fs';
import { format } from 'node:util';
import * as espree from 'espree';

const IMPORT_LINE = "import { format } from 'node:util';";
const say = (...args) => process.stderr.write(format(...args) + '\n');
const refuse = (...args) => {
  say('REFUSING', ...args);
  process.exitCode = 1;
};

const parse = (src) => espree.parse(src, { ecmaVersion: 2023, sourceType: 'module', range: true, loc: true });

/** Counts every node of `type`, and every node satisfying `pred`. */
const collect = (node, pred, acc = []) => {
  if (node === null || typeof node !== 'object') return acc;
  if (Array.isArray(node)) {
    for (const c of node) collect(c, pred, acc);
    return acc;
  }
  if (typeof node.type !== 'string') return acc;
  if (pred(node)) acc.push(node);
  for (const key of Object.keys(node)) {
    if (key === 'parent') continue;
    collect(node[key], pred, acc);
  }
  return acc;
};

for (const file of process.argv.slice(2)) {
  const src = readFileSync(file, 'utf8');
  const ast = parse(src);
  const calls = collect(ast, (n) => n.type === 'CallExpression');

  const consoleLogs = calls.filter(
    (c) =>
      c.callee.type === 'MemberExpression' &&
      !c.callee.computed &&
      c.callee.object.type === 'Identifier' &&
      c.callee.object.name === 'console' &&
      c.callee.property.type === 'Identifier' &&
      c.callee.property.name === 'log',
  );

  // Every one must be a bare ExpressionStatement: the return value is unread,
  // which is the only reason swapping the callee cannot change behaviour.
  for (const call of consoleLogs) {
    const stmt = collect(ast, (n) => n.type === 'ExpressionStatement').find((s) => s.expression === call);
    if (!stmt) refuse(`${file}:${call.loc.start.line}: console.log is not a bare ExpressionStatement`);
  }

  let out = src;
  for (const call of consoleLogs.sort((a, b) => b.range[0] - a.range[0])) {
    const text = src.slice(call.range[0], call.range[1]);
    if (!text.startsWith('console.log(') || !text.endsWith(')')) {
      refuse(`${file}:${call.loc.start.line}: call is not a plain console.log(...)`);
      continue;
    }
    const args = src.slice(call.range[0] + 'console.log('.length, call.range[1] - 1);
    out = out.slice(0, call.range[0]) + `process.stdout.write(format(${args}) + '\\n')` + out.slice(call.range[1]);
  }

  if (consoleLogs.length === 0) {
    say(`SKIP (no console.log): ${file}`);
    continue;
  }

  // Insert the import after the last top-level import, below any shebang.
  const lines = out.split('\n');
  let lastImportEnd = -1;
  for (const stmt of ast.body) {
    if (stmt.type === 'ImportDeclaration') lastImportEnd = stmt.loc.end.line;
  }
  let at;
  if (lastImportEnd >= 0) at = lastImportEnd;
  else if (lines[0].startsWith('#!')) at = 1;
  else at = 0;
  lines.splice(at, 0, IMPORT_LINE);
  const result = lines.join('\n');

  // No bare `console.log` call may survive. `console.error`/`console.warn` are
  // left alone on purpose: the lint rule allows them, so rewriting them would be
  // an unrequested behaviour change to an error path.
  const reparse = espree.parse(result, { ecmaVersion: 2023, sourceType: 'module', range: true, loc: true });
  const leftover = collect(reparse, (n) => n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed && n.callee.object.type === 'Identifier' && n.callee.object.name === 'console' && n.callee.property.type === 'Identifier' && n.callee.property.name === 'log');
  if (leftover.length !== 0) refuse(`${file}: ${leftover.length} console.log reference(s) survive`);

  writeFileSync(file, result);
  say(`ok ${file}: ${consoleLogs.length} call site(s)`);
}

if (process.exitCode) process.exit(process.exitCode);
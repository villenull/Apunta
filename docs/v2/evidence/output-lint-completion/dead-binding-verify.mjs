// Pre-deletion AST proof for the two dead bindings that `npx eslint .` reports as
// `'X' is assigned a value but never used` (@typescript-eslint/no-unused-vars):
//
//   docs/v2/evidence/P3.5/review-1/source-outputs-mapping.mjs:56  SINK_NAME
//   docs/v2/evidence/P3.4/proposal-v5-repair/ir5-counterexamples.mjs:29  SCALED_NATIVE
//
// Deleting a binding is only output-neutral if (a) nothing reads it, and (b)
// evaluating its initialiser cannot have an effect. This script asserts both from
// the AST, not by reading, and refuses to bless a binding whose initialiser
// contains anything but literals, object/array literals and calls to a named
// allow-list of pure built-ins.
//
// It runs BEFORE the edit (it must fail loudly if the binding is live) and again
// AFTER, where the binding is expected to be absent entirely. Nothing is written.
//
//   node docs/v2/evidence/output-lint-completion/dead-binding-verify.mjs check
//   node docs/v2/evidence/output-lint-completion/dead-binding-verify.mjs absent
import { readFileSync } from 'node:fs';
import { format } from 'node:util';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as espree from 'espree';

// APUNTA_VERIFIER_ROOT lets negative-control.mjs point the same code at a
// synthetic tree; unset, it is the repository this script lives in.
const REPO = process.env.APUNTA_VERIFIER_ROOT ?? resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const say = (...args) => process.stdout.write(format(...args) + '\n');

/** The only identifiers whose evaluation may be assumed free of side effects. */
const PURE = new Set(['Math', 'Object', 'Number', 'String', 'JSON', 'Number.isFinite', 'Array.isArray']);
const PURE_CALLS = new Set(['Math.round', 'Math.floor', 'Math.ceil', 'Math.abs', 'Math.max', 'Math.min']);
const LITERAL_TYPES = new Set([
  'Literal',
  'Identifier',
  'UnaryExpression',
  'BinaryExpression',
  'LogicalExpression',
  'ConditionalExpression',
  'MemberExpression',
  'ObjectExpression',
  'Property',
  'ArrayExpression',
  'TemplateLiteral',
  'TemplateElement',
]);

const TARGETS = [
  {
    file: 'docs/v2/evidence/P3.5/review-1/source-outputs-mapping.mjs',
    name: 'SINK_NAME',
  },
  {
    file: 'docs/v2/evidence/P3.4/proposal-v5-repair/ir5-counterexamples.mjs',
    name: 'SCALED_NATIVE',
  },
];

const walk = (node, fn, parent = null) => {
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const c of node) walk(c, fn, parent);
    return;
  }
  if (typeof node.type !== 'string') return;
  fn(node, parent);
  for (const key of Object.keys(node)) walk(node[key], fn, node);
};

const mode = process.argv[2] ?? 'check';
if (mode !== 'check' && mode !== 'absent') {
  say(`usage: dead-binding-verify.mjs [check|absent] (got ${JSON.stringify(mode)})`);
  process.exit(2);
}

let failures = 0;
for (const { file, name } of TARGETS) {
  const src = readFileSync(join(REPO, file), 'utf8');
  const ast = espree.parse(src, { ecmaVersion: 2023, sourceType: 'module', loc: true, range: true });

  const decls = [];
  walk(ast, (n) => {
    if (n.type !== 'VariableDeclarator' || n.id.type !== 'Identifier') return;
    if (n.id.name === name) decls.push(n);
  });
  const otherUses = [];
  walk(ast, (n, parent) => {
    if (n.type !== 'Identifier' || n.name !== name) return;
    if (parent?.type === 'VariableDeclarator' && parent.id === n) return;
    otherUses.push(n);
  });

  say('');
  say(`== ${file} :: ${name}`);

  if (decls.length === 0) {
    if (mode === 'absent') {
      say(`   ok      0 declarations, ${otherUses.length} other reference(s) — binding absent`);
    } else {
      failures += 1;
      say(`   FAIL    0 declarations found; nothing to verify`);
    }
    continue;
  }

  if (decls.length !== 1) {
    failures += 1;
    say(`   FAIL    ${decls.length} declarations, expected exactly 1`);
    continue;
  }
  const decl = decls[0];
  // A module-local `const` bound to a literal is as safe to read as the literal.
  // (e.g. SCALED_NATIVE reads CLIENT_TARGET, itself `{ x: 700, y: 500 }`.)
  const localLiteralConsts = new Set();
  for (const stmt of ast.body) {
    if (stmt.type !== 'VariableDeclaration' || stmt.kind !== 'const') continue;
    for (const d of stmt.declarations) {
      if (d.id.type !== 'Identifier') continue;
      let ok = d.init !== null;
      walk(d.init, (n, parent) => {
        if (n.type === 'Identifier' && parent?.type === 'Property' && parent.key === n && !parent.computed) return;
        if (!LITERAL_TYPES.has(n.type)) ok = false;
      });
      if (ok) localLiteralConsts.add(d.id.name);
    }
  }
  say(`   decl    line ${decl.loc.start.line}  init = ${src.slice(decl.init.range[0], decl.init.range[1])}`);

  if (otherUses.length !== 0) {
    failures += 1;
    say(`   FAIL    ${otherUses.length} reference(s) outside the declarator:`);
    for (const use of otherUses) say(`             line ${use.loc.start.line}`);
  } else {
    say(`   reads   0 references outside its own declarator — deleting it changes no read`);
  }

  // (b) side-effect audit of the initialiser.
  const impure = [];
  const calleeName = (n) =>
    n.callee.type === 'MemberExpression' && n.callee.object.type === 'Identifier' && !n.callee.computed
      ? `${n.callee.object.name}.${n.callee.property.name}`
      : n.callee.type === 'Identifier'
        ? n.callee.name
        : String(n.callee.type);
  walk(decl.init, (n, parent) => {
    if (n.type === 'CallExpression') {
      if (!PURE_CALLS.has(calleeName(n))) impure.push(`call to ${calleeName(n)} (line ${n.loc.start.line})`);
      return;
    }
    if (n.type === 'AssignmentExpression') impure.push(`assignment (line ${n.loc.start.line})`);
    if (n.type === 'UpdateExpression') impure.push(`update (line ${n.loc.start.line})`);
    if (n.type === 'NewExpression') impure.push(`new (line ${n.loc.start.line})`);
    if (n.type === 'AwaitExpression' || n.type === 'YieldExpression') impure.push(`await/yield (line ${n.loc.start.line})`);
    // A non-computed `.name` or `{ name: … }` is a property lookup, not a
    // variable read.
    if (n.type === 'Identifier' && parent?.type === 'MemberExpression' && parent.property === n && !parent.computed) {
      return;
    }
    if (n.type === 'Identifier' && parent?.type === 'Property' && parent.key === n && !parent.computed) {
      return;
    }
    if (n.type === 'Identifier' && !PURE.has(n.name) && !localLiteralConsts.has(n.name)) {
      impure.push(`read of ${n.name} (line ${n.loc.start.line})`);
    }
    if (!LITERAL_TYPES.has(n.type)) impure.push(`${n.type} (line ${n.loc.start.line})`);
  });
  if (impure.length === 0) {
    say(`   effect  initialiser is literals + ${PURE_CALLS.size ? 'allow-listed pure calls only' : ''} — no I/O, no mutation`);
  } else {
    failures += 1;
    say(`   FAIL    initialiser is not provably pure:`);
    for (const i of impure) say(`             ${i}`);
  }
}

say('');
if (failures === 0) {
  say(`dead-binding-verify (${mode}): both bindings safe to delete / confirmed absent.`);
} else {
  say(`dead-binding-verify (${mode}): ${failures} problem(s).`);
}
process.exit(failures === 0 ? 0 : 1);
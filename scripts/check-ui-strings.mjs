#!/usr/bin/env node
/**
 * The literal guardrail for the message catalogue (S2.2).
 *
 * `t()` and the two catalogues are only worth having if the screens stop
 * carrying their own English, and the way to see that is to list the literals
 * that are still in the tree. This is that list: JSX text nodes plus the
 * `placeholder`, `aria-label`, `title` and `alt` string attributes, parsed with
 * the TypeScript compiler API the way S1.4's enumerator parsed them
 * (`docs/v2/evidence/S1.4/evidence.md`, Appendix A) — not a regex, so
 * `It's a note` inside JSX text is read as text and `'Escape'` in a key
 * comparison is not read at all.
 *
 * **Its CLI, which S2.3 and S2.4 already invoke:**
 *
 *   node scripts/check-ui-strings.mjs [--report] [path…]
 *
 * - The bare invocation is report-only and exits 0 in this card. S2.4 flips
 *   the bare default to failing and leaves `--report` report-only; the switch
 *   is one constant below, and making it failing here to quiet a red lint
 *   would be loosening a guard rather than using it.
 * - `--report` forces report-only, whatever the bare default is.
 * - An optional path restricts the scan, so a card that owns two files can
 *   check exactly those. With no path the scan is `web/src`.
 * - `*.test.ts`, `*.test.tsx` and `test/` directories are excluded, the way
 *   S1.4's enumeration excluded `*.test.tsx` (§3.1).
 * - The report is one line per literal — `file:line` and the literal — then a
 *   final `TOTAL <n>`. Nothing else goes to stdout, so `TOTAL`'s number is
 *   exactly the number of `file:line` lines above it.
 *
 * **What is deliberately not reported**, because S1.4 §3.6 gave these two
 * classes no glossary entry of their own:
 *
 * - symbols and separators, which render as they are in any language;
 * - the pieces JSX leaves when it splits a sentence around an interpolation or
 *   an inline element. `No backup for over {n} days.` is two text nodes, and
 *   the sentence is what a language has to translate, not either half of it.
 *
 * An interpolated `{expr}` inside JSX text is not itself a literal, and a
 * template literal is not scanned — S1.4 saw the same, which is why the
 * `aria-label={`Diagnosis ${n} code`}` attributes in `PlanDetails.tsx` are not
 * on the list.
 *
 * A literal that is a product name or an identifier (`Apunta`, `ICD-10-CM`, a
 * file name) is allowlisted by exact match in
 * `scripts/check-ui-strings.allow.json`, whose seed is S1.4 §3.4's ten
 * keep-as-is tokens. The list is kept sorted so a change to it is readable.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/**
 * The one switch S2.4 turns.
 *
 * Report-only in this card, because the tree is still full of literals and
 * S2.3 and S2.4 are the cards that remove them. S2.4 sets this to `false` and
 * the bare invocation then exits 1 with the report, while `--report` keeps
 * printing and exiting 0.
 */
const REPORT_ONLY = false;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWLIST_PATH = join(repoRoot, 'scripts', 'check-ui-strings.allow.json');

/** The scan's default root: the whole web tree. */
const DEFAULT_ROOTS = ['web/src'];

/** Only these are read, and `*.test.*` and `test/` are not. */
const SCANNED_EXTENSIONS = new Set(['.ts', '.tsx']);

/** The attribute names a string literal is visible text when it is the value of. */
const VISIBLE_ATTRIBUTES = new Set(['placeholder', 'aria-label', 'title', 'alt']);

/** The same four, in the prop spelling a `PropertyAssignment` uses. */
const VISIBLE_PROPERTIES = new Set(['placeholder', 'ariaLabel', 'aria-label', 'title', 'alt']);

const SKIP_DIRECTORIES = new Set(['node_modules', '.git']);

/** A test file, or anything inside a `test/` directory. */
const TEST_FILE = /\.test\.tsx?$/;
const TEST_DIRECTORY = 'test';

/**
 * S1.4's `NON_TEXT`: a string of nothing but symbols and punctuation, which
 * renders as it is in every language. A translator changes nothing, so
 * reporting one is noise.
 */
const NON_TEXT = /^[\s×↑↓›·—–“”"'.,:;!?()[\]{}<>/|\\+=*&^%$#@~`‘’…-]+$/;

/** Whitespace, for comparing: a reader sees one space where the source has a newline. */
function normalise(text) {
  return text.replaceAll(/\s+/g, ' ').trim();
}

/**
 * The characters a reader actually sees.
 *
 * JSX text carries HTML entity references, and a `&amp;` in the source is an
 * `&` on the page, so the report has to name what the page shows.
 */
function decode(text) {
  return text
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&rsquo;', '’')
    .replaceAll('&lsquo;', '‘')
    .replaceAll('&ldquo;', '“')
    .replaceAll('&rdquo;', '”')
    .replaceAll('&nbsp;', ' ')
    .replaceAll(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)));
}

/*
 * There is deliberately no exemption here any more (2026-09-26, AM-047).
 *
 * This file used to skip any JSX text node with an interpolation or an inline
 * element beside it, on the reasoning that such a node is one fragment of a
 * sentence the card had already catalogued rather than a string in its own
 * right. That exemption was a hole, and a wide one: it is satisfied by any
 * sibling element, so *every* row-menu word qualified. Five user-visible
 * English strings shipped through it untranslated for the whole of S2.1-S2.5 —
 * `Pin`, `Rename`, `Restore`, `Delete` and `Archive` in `PatientMenu.tsx`, plus
 * the trailing `has it.` in `Setup.tsx`, whose only neighbour was a `<Link>`.
 * All five now read from the catalogues and the exemption is gone rather than
 * narrowed, because a narrowed exemption is the same hole with a length limit.
 *
 * The escape a fragment actually needs is two keys. `Setup.tsx:122` is
 * `t('setup.backingUpLead')`, a `<Link>`, then `t('setup.backingUpTail')` —
 * a slot cannot carry the link, because `MessageParams` admits only
 * `string | number` and `t()` returns `string`.
 */

/** The string of a literal node, decoded, or `null` when it is not visible text. */
function visibleString(node, sourceFile) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    const parent = node.parent;
    if (parent === undefined) return null;
    const name = ts.isJsxAttribute(parent)
      ? parent.name.getText(sourceFile)
      : ts.isPropertyAssignment(parent)
        ? parent.name.getText(sourceFile)
        : null;
    const visible =
      name !== null &&
      (ts.isJsxAttribute(parent) ? VISIBLE_ATTRIBUTES.has(name) : VISIBLE_PROPERTIES.has(name));
    return visible ? normalise(decode(node.text)) : null;
  }
  if (ts.isJsxText(node)) {
    const text = normalise(decode(node.getText(sourceFile)));
    if (text === '' || NON_TEXT.test(text)) return null;
    return text;
  }
  return null;
}

/** Every visible literal in one file, in the order the file reads. */
function literalsIn(file) {
  const scriptKind = extname(file) === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
  const found = [];
  /** A position in the file, as the report prints it. */
  const lineOf = (node) => sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  function walk(node) {
    if (ts.isJsxText(node)) {
      const text = visibleString(node, sourceFile);
      if (text !== null) found.push({ line: lineOf(node), text });
    } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const text = visibleString(node, sourceFile);
      if (text !== null) found.push({ line: lineOf(node), text });
    }
    // A template literal with substitutions is not scanned: its parts are code,
    // and the sentence around it is what would need a catalogue key.
    ts.forEachChild(node, walk);
  }
  walk(sourceFile);
  return found;
}

function* walk(root) {
  let stats;
  try {
    stats = statSync(root);
  } catch {
    return; // Not built yet, or a path that is not there. Nothing to report.
  }
  if (stats.isFile()) {
    yield root;
    return;
  }
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (SKIP_DIRECTORIES.has(entry.name)) continue;
    if (entry.isDirectory() && entry.name === TEST_DIRECTORY) continue;
    yield* walk(join(root, entry.name));
  }
}

function isScannable(file) {
  if (!SCANNED_EXTENSIONS.has(extname(file))) return false;
  if (TEST_FILE.test(file)) return false;
  return true;
}

/** `web/src/…` for a file in the checkout, and the path as given for one outside it. */
function display(file) {
  const fromRoot = relative(repoRoot, file);
  return fromRoot.startsWith('..') ? file : fromRoot;
}

function parseArguments(argv) {
  const roots = [];
  let report = REPORT_ONLY;
  for (const argument of argv) {
    if (argument === '--report') {
      report = true;
    } else if (argument.startsWith('-')) {
      process.stderr.write(`check-ui-strings: unknown option ${argument}\n`);
      process.stderr.write('usage: node scripts/check-ui-strings.mjs [--report] [path…]\n');
      process.exit(2);
    } else {
      roots.push(resolve(argument));
    }
  }
  return { roots: roots.length > 0 ? roots : DEFAULT_ROOTS.map((root) => join(repoRoot, root)), report };
}

const allowlist = new Set(JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8')));
const { roots, report } = parseArguments(process.argv.slice(2));

const findings = [];
for (const root of roots) {
  for (const file of walk(root)) {
    if (!isScannable(file)) continue;
    for (const { line, text } of literalsIn(file)) {
      if (allowlist.has(text)) continue;
      findings.push({ file: display(file), line, text });
    }
  }
}

findings.sort((left, right) =>
  left.file === right.file ? left.line - right.line : left.file.localeCompare(right.file),
);
for (const finding of findings) {
  console.log(`${finding.file}:${finding.line}: ${finding.text}`);
}
console.log(`TOTAL ${findings.length}`);

if (!report && findings.length > 0) process.exit(1);

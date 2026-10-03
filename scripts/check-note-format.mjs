#!/usr/bin/env node
/**
 * Draft the `e2e/fixtures/her-format/` fixtures through a running Apunta and
 * flag the routing failures a real model makes in the practice owner's own
 * seven-section format.
 *
 *   npm run check:format
 *   APUNTA_CHECK_URL=http://127.0.0.1:7720 npm run check:format
 *   node scripts/check-note-format.mjs --only 3-risk-reviewed
 *   node scripts/check-note-format.mjs --print-rules   # the rule surface, no server
 *   node scripts/check-note-format.mjs --self-test     # the controls, no server
 *   node scripts/check-note-format.mjs --expect-fixtures 6
 *
 * This is not an eval — there is no rubric and no score. `npm run eval`
 * measures faithfulness against SOAP; this measures nothing at all, it only
 * catches four specific ways her format came back wrong on real output, and
 * prints every note so the flags are never the whole story. See the README
 * beside the fixtures for why it exists.
 *
 * It talks only to a loopback Apunta, which does the model call itself, so
 * this script needs no AI configuration of its own.
 */

import { existsSync, readFileSync, readdirSync, writeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env['APUNTA_CHECK_URL'] ?? 'http://127.0.0.1:7717';

function checkPort(url) {
  try {
    const parsed = new URL(url);
    return parsed.port === '' ? null : Number(parsed.port);
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------------------
 * The command line.
 *
 *   --locale <en|es-MX>   --print-rules   --self-test   --only <id>
 *   --expect-scenarios N  --expect-fixtures N
 *
 * The grammar is the same one as in scripts/check-refine.mjs; only what each
 * flag counts differs — this script has no scenarios, so --expect-scenarios
 * counts fixtures here rather than being refused. Exit codes: 0 a complete run
 * (or a rules dump, or a self-test whose controls all fired), 2 a usage or
 * pre-flight refusal, 3 a count assertion the run did not meet, 4 a control
 * that did not fire, 5 a flag that was understood but names something that is
 * not here, 6 a set that could not be enumerated.
 *
 * This block sits above every request, so --print-rules and --self-test need no
 * server, no model and no database. With no flag at all it consumes nothing,
 * computes no locale and refuses nothing, and the pre-flight guards below run
 * exactly as they always have.
 * ------------------------------------------------------------------------- */

const LOCALES = ['en', 'es-MX'];
const BOOLEAN_FLAGS = ['--print-rules', '--self-test'];
const VALUE_FLAGS = ['--locale', '--only', '--expect-scenarios', '--expect-fixtures'];
const DEFAULT_LOCALE = 'en';
const TREE_BY_LOCALE = { en: 'her-format', 'es-MX': 'her-format-es' };

/**
 * The rule surface, as `--print-rules` reports it.
 *
 * Every pattern is a `source` and a `flags` string, never a re-serialised
 * `/…/flags` literal: the strings a pin file records have to be byte-present in
 * this file, and a slash-delimited rewrite is byte-present only by luck.
 *
 * These literals are a second copy of rules that execute further down
 * (`splitSections`, `exampleSentences`, `flagsFor`), and Must-not-edit forbids
 * single-sourcing them. A copy can drift, so the guard is
 * `scripts/check-note-format.test.mjs`: it takes the executing node out of this
 * file's syntax tree and compares it against what the dump reports, field by
 * field, so an edit to either side is red. A grep for the literal anywhere in
 * this file would not do that — it is satisfied by this block, which is the
 * copy it is supposed to police.
 */
const PINNED_SECTIONS = {
  en: [
    'Client presentation', // flagsFor, in the order it reads them
    'Discussion',
    'Note for next session',
    'Risk review',
  ],
  'es-MX': [],
};
const PINNED_RISK_SENTINEL = { en: 'None.', 'es-MX': '' }; // flagsFor
const PINNED_HEADING = /^([A-Z][A-Za-z ]+):\s?(.*)$/; // splitSections
const PINNED_BORROWED = /"[A-Z][A-Za-z ]+":\s*"([^"]{25,})"/g; // exampleSentences
const PINNED_FLAG_RULES = {
  en: [
    {
      name: 'reported content in Client presentation',
      re: /\breports?\b|\bsaid\b|\btalked about\b|\bdescribed\b/i, // flagsFor
    },
    {
      name: 'a stated cadence decision is missing from Note for next session',
      re: /every two weeks|staying weekly|every other week/,
    },
    {
      name: 'a risk review she carried out was flattened to "None."',
      re: /denied|safety|self harm/,
    },
  ],
  'es-MX': [],
};

const patternOf = (expression) => ({ source: expression.source, flags: expression.flags });

/**
 * Canned input for `--self-test`: pinned in-script and fabricated (HS-8), so the
 * self-test needs no instance, no model, no database and no fixture tree. Each
 * control names the rule it exercises, so a control that stops firing says which
 * rule stopped.
 */
const CONTROL_DRAFT = [
  'Client presentation: Settled quickly and was ready to start when she arrived.',
  'Discussion: Worked through what has changed since the last session.',
  'Risk review: Nothing new; no risk identified today.',
  'Note for next session: Continue as agreed and review the sleep log.',
].join('\n');

const CONTROL_INSTRUCTIONS = [
  '{"Client presentation": "The client arrived on time and settled into the session without any difficulty at all."}',
].join('\n');

const CONTROLS_BY_LOCALE = {
  en: [
    {
      flag: 'splitSections: a note under the English headings parses into those sections',
      ok: () =>
        Object.values(splitSections(CONTROL_DRAFT, PINNED_SECTIONS.en)).every((value) => value.trim() !== ''),
    },
    {
      flag: 'exampleSentences: the English worked example yields borrowed sentences',
      ok: () => exampleSentences(CONTROL_INSTRUCTIONS).length > 0,
    },
    {
      flag: 'flagsFor: a risk review flattened to "None." is flagged',
      ok: () =>
        flagsFor(
          'Client denied any risk to herself this week.',
          splitSections('Risk review: None.', PINNED_SECTIONS.en),
          [],
        ).some((flag) => flag.includes('risk review')),
    },
  ],
  'es-MX': [],
};

function refuseUsage(problem, token) {
  console.error(`Refusing to run: ${problem}.`);
  if (token !== undefined) console.error(`  the argument: ${token}`);
  process.exit(2);
}

function readCount(flag, value) {
  if (!/^\d+$/.test(value))
    refuseUsage(`${flag} needs a whole number of things, and '${value}' is not one`, value);
  return Number(value);
}

const argv = process.argv.slice(2);
const seen = new Set();
/** Fixture base names without the `.txt`, as the loop below has them. */
const only = new Set();
let locale = null;
let printRules = false;
let selfTest = false;
let expectScenarios = null;
let expectFixtures = null;

for (let index = 0; index < argv.length; index += 1) {
  const arg = argv[index];
  if (BOOLEAN_FLAGS.includes(arg)) {
    if (seen.has(arg)) refuseUsage(`${arg} was given twice`, arg);
    seen.add(arg);
    if (arg === '--print-rules') printRules = true;
    else selfTest = true;
    continue;
  }
  if (VALUE_FLAGS.includes(arg)) {
    if (seen.has(arg)) refuseUsage(`${arg} was given twice`, arg);
    seen.add(arg);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('-')) refuseUsage(`${arg} needs a value`, arg);
    if (arg === '--locale') {
      locale = value;
      index += 1;
      continue;
    }
    if (arg === '--expect-scenarios') {
      expectScenarios = readCount(arg, value);
      index += 1;
      continue;
    }
    if (arg === '--expect-fixtures') {
      expectFixtures = readCount(arg, value);
      index += 1;
      continue;
    }
    let last = index;
    for (let next = index + 1; next < argv.length && !argv[next].startsWith('-'); next += 1) {
      only.add(argv[next]);
      last = next;
    }
    if (only.size === 0) refuseUsage(`${arg} needs a value`, arg);
    index = last;
    continue;
  }
  if (arg.startsWith('-')) refuseUsage(`unknown argument ${arg}`, arg);
  refuseUsage(`unexpected argument ${arg}`, arg);
}

// 1. grammar, above.
// 2. locale, consumed here and never reaching `only`.
if (locale !== null && !LOCALES.includes(locale))
  refuseUsage(`--locale does not know '${locale}'; it knows ${LOCALES.join(', ')}`, locale);

// 3. the rules dump: constants only, no request, and 0 whatever the locale.
if (printRules) {
  const dumpLocale = locale ?? DEFAULT_LOCALE;
  writeSync(
    1,
    `${JSON.stringify(
      {
        script: 'check-note-format',
        locale: dumpLocale,
        sections: [...PINNED_SECTIONS[dumpLocale]],
        riskSentinel: PINNED_RISK_SENTINEL[dumpLocale],
        headingPattern: patternOf(PINNED_HEADING),
        flagRules: PINNED_FLAG_RULES[dumpLocale].map(({ name, re }) => ({
          name,
          ...patternOf(re),
        })),
        borrowedExtractor: patternOf(PINNED_BORROWED),
      },
      null,
      2,
    )}\n`,
  );
  process.exit(0);
}

// 4. the controls, above tree resolution: a locale with no controls is 5 even
// when it has no tree either.
if (selfTest) {
  const controls = CONTROLS_BY_LOCALE[locale ?? DEFAULT_LOCALE];
  if (controls.length === 0) {
    console.error(
      `--self-test --locale ${locale} has no controls in this tree, and a self-test that asserts nothing is not a passing self-test.`,
    );
    process.exit(5);
  }
  let missed = 0;
  for (const control of controls) {
    let fired;
    try {
      fired = control.ok() === true;
    } catch {
      fired = false;
    }
    writeSync(1, `${fired ? 'ok  ' : 'MISS'} ${control.flag}\n`);
    if (!fired) missed += 1;
  }
  if (missed > 0) {
    writeSync(1, `${String(missed)} of ${String(controls.length)} control(s) did not fire.\n`);
    process.exit(4);
  }
  writeSync(1, `all ${String(controls.length)} control(s) fired.\n`);
  process.exit(0);
}

// 5. the tree the locale names has to exist — but only when a locale was asked
// for, so that no flag at all leaves the tree question unasked.
const activeLocale = locale ?? DEFAULT_LOCALE;
const tree = TREE_BY_LOCALE[activeLocale];
const treeDir = join(root, 'e2e', 'fixtures', tree);
if (locale !== null && !existsSync(treeDir)) {
  console.error(
    `--locale ${locale} names e2e/fixtures/${tree}/, which is not in this tree, so there is nothing here to measure.`,
  );
  process.exit(5);
}

// The fixture files this run would read, and the ids `--only` names. A tree
// that cannot be enumerated is 6, never 0.
let enumerated = null;
function enumerateFixtures() {
  if (enumerated !== null) return enumerated;
  let files = [];
  try {
    files = readdirSync(treeDir)
      .filter((name) => /^\d+-[a-z0-9-]+\.txt$/.test(name))
      .sort();
  } catch (error) {
    console.error(
      `The fixtures --expect-fixtures counts cannot be enumerated: ${treeDir} could not be read (${
        error instanceof Error ? error.message.split('\n')[0] : String(error)
      }).`,
    );
    process.exit(6);
  }
  enumerated = {
    files,
    ids: new Set(files.map((name) => name.replace(/\.txt$/, ''))),
  };
  return enumerated;
}
if (expectScenarios !== null || expectFixtures !== null) enumerateFixtures();

// 6. an unknown --only id is refused whenever --only was passed, with or
// without --locale, against the ids that tree actually contains.
if (only.size > 0) {
  const known = enumerateFixtures().ids;
  for (const id of only) {
    if (known.has(id)) continue;
    console.error(`--only does not name a fixture in ${tree}/: ${id}`);
    process.exit(2);
  }
}

// Under the sandbox wrapper (APUNTA_V2=1) this must run through
// scripts/v2/sandbox.mjs against a sandbox server: an unset APUNTA_CHECK_URL
// would fall back to the live port, and 7717 is never a check target.
if (process.env['APUNTA_V2'] === '1') {
  const raw = process.env['APUNTA_CHECK_URL'];
  if (raw === undefined || raw === '' || checkPort(raw) === 7717) {
    console.error(
      'Under APUNTA_V2=1, run this through scripts/v2/sandbox.mjs so APUNTA_CHECK_URL points at the sandbox server (never port 7717).',
    );
    process.exit(2);
  }
}

if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE)) {
  console.error(`Refusing to talk to ${BASE}: this only ever speaks to a local Apunta.`);
  process.exit(2);
}

async function api(path, init) {
  const response = await fetch(`${BASE}${path}`, init);
  if (!response.ok) throw new Error(`${path} answered ${String(response.status)}`);
  return response;
}

/** The note is the last `data:` frame carrying one; the rest is progress. */
function noteFromStream(body) {
  let content = null;
  for (const frame of body.split('\n\n')) {
    const at = frame.indexOf('data:');
    if (at === -1 || !frame.includes('"note"')) continue;
    try {
      const parsed = JSON.parse(frame.slice(at + 5).trim());
      if (parsed?.note?.content) content = parsed.note.content;
    } catch {
      // A partial frame is not a note; keep looking.
    }
  }
  return content;
}

function splitSections(content, sections) {
  const found = {};
  let current = null;
  for (const line of (content ?? '').split('\n')) {
    const match = /^([A-Z][A-Za-z ]+):\s?(.*)$/.exec(line);
    if (match && sections.includes(match[1])) {
      current = match[1];
      found[current] = match[2];
    } else if (current !== null && line.trim() !== '') {
      found[current] += ` ${line.trim()}`;
    }
  }
  return found;
}

/**
 * Sentences the instructions demonstrate, pulled out of their own worked
 * example so this never goes stale when the example is rewritten.
 *
 * A few-shot example is the strongest single lever on a small model and also
 * its most tempting source of words: the example's own forward-looking line
 * turned up, name-substituted, in a note whose source said nothing like it
 * (2026-08-31). That is invented content, and the SOAP corpus cannot see it —
 * it only bans phrases from *its* few-shot pair.
 */
function exampleSentences(instructions) {
  const sentences = [];
  for (const match of instructions.matchAll(/"[A-Z][A-Za-z ]+":\s*"([^"]{25,})"/g)) {
    const value = match[1];
    for (const part of value.split(/(?<=[.;])\s+/)) {
      const words = part.trim().split(/\s+/);
      // Long enough to be a borrowed sentence rather than a shared idiom.
      if (words.length >= 6) sentences.push(words.slice(1).join(' ').toLowerCase());
    }
  }
  return sentences;
}

/**
 * Each rule is a failure that actually happened, not a style preference.
 * They are intentionally blunt: a flag says "read this note", never "this
 * note is wrong".
 */
function flagsFor(source, sections, borrowed = []) {
  const flags = [];
  const at = (name) => (sections[name] ?? '').trim();
  const presentation = at('Client presentation');
  const discussion = at('Discussion');
  const forward = at('Note for next session');
  const risk = at('Risk review');
  const said = source.toLowerCase();

  if (/\breports?\b|\bsaid\b|\btalked about\b|\bdescribed\b/i.test(presentation)) {
    flags.push('reported content in Client presentation');
  }
  if (discussion === '' && source.split(/\s+/).length > 15) {
    flags.push('Discussion empty though the source has material');
  }
  if (/every two weeks|staying weekly|every other week/.test(said) && !/week/i.test(forward)) {
    flags.push('a stated cadence decision is missing from Note for next session');
  }
  if (/denied|safety|self harm/.test(said) && risk === 'None.') {
    flags.push('a risk review she carried out was flattened to "None."');
  }
  // The note wearing the instructions' own example, which she never said.
  const written = Object.values(sections).join(' ').toLowerCase();
  for (const sentence of borrowed) {
    if (written.includes(sentence) && !source.toLowerCase().includes(sentence)) {
      flags.push('wording copied from the worked example in the instructions');
      break;
    }
  }
  return flags;
}

const health = await (await api('/api/health')).json();
if (health.fakeAi) {
  console.error(
    'This is running in fake-AI mode, which says nothing about the model. Start Apunta without APUNTA_FAKE_AI.',
  );
  process.exit(2);
}

const { formats } = await (await api('/api/formats')).json();
const format = formats[0];
if (!format) {
  console.error('That Apunta has no note format yet.');
  process.exit(2);
}
const { patients } = await (await api('/api/patients')).json();
const patient = patients[0];
if (!patient) {
  console.error(
    'That Apunta has no patient to hang a draft on. Add one (any fabricated name) and run again.',
  );
  process.exit(2);
}

const borrowed = exampleSentences(format.instructions ?? '');

console.error(`Format: ${format.name} — ${format.sections.join(', ')}`);
console.error(`Model:  ${health.ollama.model}\n`);

// The same list the loop below iterates, so --expect-* counts fixtures that
// were READ and never fixtures that happen to be on disk.
const names = enumerateFixtures().files.filter(
  (name) => only.size === 0 || only.has(name.replace(/\.txt$/, '')),
);

let total = 0;
const summary = [];
for (const name of names) {
  const source = readFileSync(join(treeDir, name), 'utf8').trim();
  const response = await api('/api/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      patient_id: patient.id,
      format_id: format.id,
      typed_notes: source,
      title: `format check — ${name.replace(/\.txt$/, '')}`,
    }),
  });
  const content = noteFromStream(await response.text());
  const flags = flagsFor(source, splitSections(content, format.sections), borrowed);
  total += flags.length;
  summary.push({ name, flags });

  console.log(`\n=== ${name} ===`);
  console.log(content ?? '(no note came back)');
  for (const flag of flags) console.log(`  ⚑ ${flag}`);
}

console.log('\n--- summary ---');
for (const { name, flags } of summary) {
  console.log(`${flags.length === 0 ? 'ok  ' : `${String(flags.length)} ⚑ `} ${name}`);
}
console.log(`\n${String(total)} flag(s) across ${String(names.length)} fixtures.`);
console.log('Flags are a prompt to read the note above, not a verdict.');
console.log('The drafts stay in the database; delete that patient to clear them.');

// The counts are the assertion, and they come after the measurement is on
// record: this script has no scenarios, so --expect-scenarios counts the
// fixtures read, exactly as --expect-fixtures does.
let countMissed = false;
for (const [flag, expected] of [
  ['--expect-fixtures', expectFixtures],
  ['--expect-scenarios', expectScenarios],
]) {
  if (expected === null) continue;
  if (expected === names.length) continue;
  console.error(`${flag} ${String(expected)}, but ${String(names.length)} fixture(s) were read.`);
  countMissed = true;
}
if (countMissed) process.exit(3);
